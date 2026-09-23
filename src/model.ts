export const limits = { upload: 50 * 1024 * 1024, batchUpload: 250 * 1024 * 1024, files: 20, expanded: 250 * 1024 * 1024, records: 100000, vertices: 500000, attributes: 1000000, entries: 500 };
export class InputError extends Error {}
export const targets = ['cep', 'uf', 'cidade', 'bairro', 'numero', 'numero_inicio', 'numero_fim', 'tipo', 'data_inclusao'] as const;
export type Target = typeof targets[number];
export type Mapping = Partial<Record<Target, string>>;
export type Vertex = { geometry: number; kind: string; ring: string; sequence: number; latitude: number; longitude: number; altitude: number | null };
export type GeocodedAddress = { cep: string; numero: string; uf: string; cidade: string; bairro: string; logradouro: string; distanceMeters: number; pointMethod: 'ponto exato' | 'centro aproximado' };
export type Feature = { id: number; source: string; folder: string; name: string; description: string; attributes: Record<string, string>; vertices: Vertex[]; kinds: string[]; warnings: string[]; geocoded?: GeocodedAddress };
export type Dataset = { filename: string; operator: string; importedAt: string; features: Feature[]; fields: string[]; warnings: string[] };
export function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
const aliases: Record<Target, string[]> = {
  cep: ['cep', 'codigopostal', 'postalcode', 'zipcode'], uf: ['uf', 'siglaestado'],
  cidade: ['cidade', 'municipio', 'city'], bairro: ['bairro', 'district'],
  numero: ['numero', 'n', 'num', 'numerofachada', 'cepnumerofachada'],
  numero_inicio: ['numeroinicio', 'numeroinicial', 'ninicio', 'ninicial', 'de'],
  numero_fim: ['numerofim', 'numerofinal', 'nfim', 'nfinal', 'ate'],
  tipo: ['tipo', 'tipoconstrucao'], data_inclusao: ['datainclusao', 'dataincludecep', 'dataincluden', 'datainclusaocep', 'datainclusaonumero']
};
export function suggestMapping(fields: string[]): Mapping {
  const result: Mapping = {};
  for (const target of targets) {
    const found = fields.find(field => aliases[target].includes(normalize(field)));
    if (found) result[target] = found;
  }
  return result;
}
export function mapped(feature: Feature, mapping: Mapping) {
  const values = Object.fromEntries(targets.map(key => [key, feature.attributes[mapping[key] ?? ''] ?? ''])) as Record<Target, string>;
  const warnings = [...feature.warnings];
  const automatic = feature.geocoded;
  const filled: string[] = [];
  for (const key of ['cep', 'uf', 'cidade', 'bairro', 'numero'] as const) {
    if (!values[key] && automatic?.[key]) { values[key] = automatic[key]; filled.push(key); }
  }
  if (filled.length) warnings.push(`Preenchido pelo geocodebr (${automatic!.pointMethod}, endereço a ${Math.round(automatic!.distanceMeters)} m): ${filled.join(', ')}`);
  if (values.cep) {
    const cleaned = values.cep.replace(/[\s.-]/g, '');
    if (/^\d{8}$/.test(cleaned) && cleaned !== '00000000') values.cep = cleaned;
    else warnings.push('CEP inválido; valor original preservado');
  } else warnings.push('CEP não informado');
  if (!values.numero && !(values.numero_inicio && values.numero_fim)) warnings.push('Número ou faixa não informados');
  if (Boolean(values.numero_inicio) !== Boolean(values.numero_fim)) warnings.push('Faixa incompleta');
  if (values.numero_inicio && values.numero_fim) {
    if (!/^\d+$/.test(values.numero_inicio) || !/^\d+$/.test(values.numero_fim)) warnings.push('Faixa com valores não inteiros');
    else if (Number(values.numero_inicio) > Number(values.numero_fim)) warnings.push('Início da faixa maior que o fim');
  }
  const point = feature.kinds.length === 1 && feature.kinds[0] === 'Point' && feature.vertices.length === 1 ? feature.vertices[0] : undefined;
  return { ...values, latitude: point?.latitude ?? null, longitude: point?.longitude ?? null, geocodeDistance: automatic?.distanceMeters ?? null, geocodeMethod: automatic?.pointMethod ?? '', logradouro: automatic?.logradouro ?? '', warnings };
}
