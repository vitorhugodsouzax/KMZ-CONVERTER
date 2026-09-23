import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Dataset, GeocodedAddress } from './model.js';

type PointInput = { id: number; lat: number; lon: number; method: GeocodedAddress['pointMethod'] };
type PointOutput = { id: number; estado?: string; municipio?: string; logradouro?: string; numero?: string; cep?: string; localidade?: string; distancia_metros?: number };

function representativePoint(dataset: Dataset) {
  const points: PointInput[] = [];
  for (const feature of dataset.features) {
    if (!feature.vertices.length) continue;
    const exact = feature.kinds.length === 1 && feature.kinds[0] === 'Point' && feature.vertices.length === 1;
    const vertices = feature.vertices;
    points.push({ id: feature.id, lat: vertices.reduce((n, v) => n + v.latitude, 0) / vertices.length, lon: vertices.reduce((n, v) => n + v.longitude, 0) / vertices.length, method: exact ? 'ponto exato' : 'centro aproximado' });
  }
  return points;
}

function run(executable: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(executable, args, { env, windowsHide: true });
    let output = '';
    child.stdout.on('data', data => { output += String(data); });
    child.stderr.on('data', data => { output += String(data); });
    const timer = setTimeout(() => { child.kill(); reject(new Error('A busca de endereços excedeu 30 minutos.')); }, 30 * 60 * 1000);
    child.once('error', reject);
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolvePromise() : reject(new Error(output.trim().slice(-2000) || `R encerrou com código ${code}`)); });
  });
}

export async function enrichWithAddresses(dataset: Dataset) {
  if (process.env.GEOCODING_DISABLED === '1') { dataset.warnings.push('Geocodificação desativada neste ambiente.'); return dataset; }
  const points = representativePoint(dataset);
  if (!points.length) { dataset.warnings.push('Geocodificação não executada: nenhum registro possui coordenadas válidas.'); return dataset; }
  const folder = await mkdtemp(join(tmpdir(), 'geocodebr-'));
  const input = join(folder, 'points.json'), output = join(folder, 'addresses.json');
  const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const script = join(projectRoot, 'scripts', 'geocode-reverse.R');
  const library = process.env.R_LIBS_USER || resolve(projectRoot, '.r-library');
  const executable = process.env.RSCRIPT_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\R\\R-4.6.1\\bin\\Rscript.exe' : 'Rscript');
  try {
    await writeFile(input, JSON.stringify(points));
    await run(executable, [script, input, output], { ...process.env, R_LIBS_USER: library });
    const rows = JSON.parse(await readFile(output, 'utf8')) as PointOutput[];
    const methods = new Map(points.map(point => [point.id, point.method]));
    const byId = new Map(dataset.features.map(feature => [feature.id, feature]));
    for (const row of rows) {
      const feature = byId.get(Number(row.id));
      const distance = Number(row.distancia_metros);
      if (!feature || !Number.isFinite(distance)) continue;
      feature.geocoded = { cep: String(row.cep ?? '').replace(/\D/g, ''), numero: String(row.numero ?? ''), uf: String(row.estado ?? ''), cidade: String(row.municipio ?? ''), bairro: String(row.localidade ?? ''), logradouro: String(row.logradouro ?? ''), distanceMeters: distance, pointMethod: methods.get(feature.id) ?? 'centro aproximado' };
    }
    const misses = points.length - rows.length;
    dataset.warnings.push(`${rows.length.toLocaleString('pt-BR')} de ${points.length.toLocaleString('pt-BR')} registros com coordenadas receberam o endereço CNEFE mais próximo${misses ? `; ${misses.toLocaleString('pt-BR')} sem resultado` : ''}.`);
  } catch (error) {
    dataset.warnings.push(`Geocodificação não concluída: ${error instanceof Error ? error.message : 'falha desconhecida'}`);
  } finally { await rm(folder, { recursive: true, force: true }); }
  return dataset;
}
