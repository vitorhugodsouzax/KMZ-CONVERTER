import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { readFile } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { ConversionQueue } from './queue.js';
import { InputError, limits, mapped, suggestMapping, targets, type Dataset, type Mapping } from './model.js';

type Runner = (job: Record<string, unknown>) => Promise<any>;
export async function runWorker(job: Record<string, unknown>) {
  return new Promise<any>((resolve, reject) => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { workerData: job, resourceLimits: { maxOldGenerationSizeMb: 1536 } });
    const timeout = job.action === 'parse-batch' ? 35 * 60 * 1000 : 90000;
    const timer = setTimeout(() => { void worker.terminate(); reject(new InputError(job.action === 'parse-batch' ? 'A leitura e a busca de endereços excederam 35 minutos.' : 'A conversão excedeu 90 segundos. Divida o arquivo em partes menores.')); }, timeout);
    worker.once('message', message => { clearTimeout(timer); if (message.error) reject(new InputError(message.error)); else resolve(message.result); void worker.terminate(); });
    worker.once('error', error => { clearTimeout(timer); reject(error); });
    worker.once('exit', code => { clearTimeout(timer); if (code !== 0) reject(new InputError('O processamento foi interrompido. Tente um arquivo menor.')); });
  });
}

export function buildApp(runner: Runner = runWorker, proxyAuth = process.env.PROXY_AUTH === '1') {
  const app = Fastify({ logger: true, bodyLimit: limits.batchUpload + 1024 * 1024, requestTimeout: 110 * 60 * 1000 });
  const imports = new Map<string, { dataset: Dataset; expires: number; bytes: number; owner: string }>();
  const queue = new ConversionQueue();
  const owner = (request: { headers: Record<string, unknown> }) => proxyAuth ? String(request.headers['x-authenticated-user'] ?? '') : 'local';
  const ttl = 30 * 60 * 1000;
  const purge = () => { for (const [id, item] of imports) if (item.expires < Date.now()) imports.delete(id); };
  const cleanup = setInterval(purge, 60000).unref();
  app.addHook('onClose', async () => { clearInterval(cleanup); imports.clear(); });
  app.register(multipart, { limits: { fileSize: limits.upload, files: limits.files, fields: 2, parts: limits.files + 2, fieldSize: 200 } });
  // Explicit public routes: no file path is ever supplied by the client.
  const assets = [['/', 'index.html', 'text/html; charset=utf-8'], ['/style.css', 'style.css', 'text/css; charset=utf-8'], ['/app.js', 'app.js', 'text/javascript; charset=utf-8'], ['/exemplo.kml', 'exemplo.kml', 'application/vnd.google-earth.kml+xml'], ['/fonts/InstrumentSans.woff2', 'fonts/InstrumentSans.woff2', 'font/woff2']];
  for (const [route, file, type] of assets) app.get(route, async (_request, reply) => reply.type(type).send(await readFile(new URL(`../public/${file}`, import.meta.url))));
  app.addHook('onRequest', async (request, reply) => {
    if (proxyAuth && request.url !== '/api/health' && !owner(request)) return reply.code(401).send({ error: 'Autenticação necessária.' });
    reply.header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer');
    reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (request.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store');
      const origin = request.headers.origin;
      if (request.headers['sec-fetch-site'] === 'cross-site' || (origin && ![`http://${request.headers.host}`, `https://${request.headers.host}`].includes(origin))) return reply.code(403).send({ error: 'Origem da solicitação não permitida.' });
    }
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof InputError) return reply.code(400).send({ error: error.message });
    const known = error as { statusCode?: number; message?: string };
    if (known.statusCode === 429) return reply.code(429).send({ error: 'A fila está cheia. Aguarde uma conversão terminar e tente novamente.' });
    if (known.statusCode === 413) return reply.code(413).send({ error: 'Cada arquivo deve ter no máximo 50 MB e o lote até 250 MB.' });
    if (known.statusCode && known.statusCode < 500) return reply.code(known.statusCode).send({ error: 'Solicitação inválida. Confira o arquivo e os campos enviados.' });
    request.log.error(error);
    return reply.code(500).send({ error: 'Não foi possível processar o arquivo. Tente novamente com um arquivo menor.' });
  });
  function mappingFor(body: unknown, dataset: Dataset): Mapping {
    if (!body || typeof body !== 'object' || !('mapping' in body) || !(body as any).mapping || typeof (body as any).mapping !== 'object' || Array.isArray((body as any).mapping)) throw new InputError('Mapeamento inválido.');
    const mapping: Mapping = {};
    for (const [key, value] of Object.entries((body as any).mapping)) {
      if (!targets.includes(key as any) || typeof value !== 'string' || (value && !dataset.fields.includes(value))) throw new InputError('O mapeamento contém um campo desconhecido.');
      if (value) mapping[key as keyof Mapping] = value;
    }
    return mapping;
  }
  function getDataset(id: string, user: string) {
    purge();
    const item = imports.get(id);
    if (!item || item.owner !== user) return null;
    return item.dataset;
  }
  function preview(dataset: Dataset, mapping: Mapping) {
    const missing = { cep: 0, numero: 0, warnings: 0, geocoded: 0 };
    const rows = dataset.features.map(feature => {
      const value = mapped(feature, mapping);
      if (!value.cep) missing.cep++;
      if (!value.numero && !(value.numero_inicio && value.numero_fim)) missing.numero++;
      if (value.warnings.length) missing.warnings++;
      if (feature.geocoded) missing.geocoded++;
      return { id: feature.id, source: feature.source, name: feature.name.slice(0, 200), geometry: feature.kinds.join(', '), ...value };
    });
    return { count: rows.length, coordinates: dataset.features.reduce((n, f) => n + f.vertices.length, 0), missing, rows: rows.slice(0, 100), warnings: dataset.warnings };
  }
  app.get('/api/health', async () => ({ ok: true }));
  app.post('/api/import', async (request, reply) => {
    const release = await queue.acquire();
    try {
      if (request.raw.destroyed) return;
      const files: { filename: string; bytes: Buffer }[] = [];
      let operator = '', totalBytes = 0;
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          const bytes = await part.toBuffer();
          totalBytes += bytes.length;
          if (totalBytes > limits.batchUpload) throw new InputError('O lote deve ter no máximo 250 MB.');
          files.push({ filename: part.filename.replace(/.*[\\/]/, ''), bytes });
        }
        else if (part.fieldname === 'operator') operator = String(part.value).trim();
      }
      if (!files.length || files.some(file => !file.bytes.length)) throw new InputError('Selecione ao menos um arquivo KML ou KMZ.');
      if (!operator || operator.length > 100) throw new InputError('Informe a operadora com até 100 caracteres.');
      const dataset: Dataset = await runner({ action: 'parse-batch', files, operator });
      const id = randomUUID(), mapping = suggestMapping(dataset.fields);
      purge();
      const size = Buffer.byteLength(JSON.stringify(dataset));
      if (size > 350 * 1024 * 1024) throw new InputError('Os dados extraídos excedem o limite desta versão. Divida o arquivo.');
      while (imports.size >= 3 || [...imports.values()].reduce((n, item) => n + item.bytes, 0) + size > 350 * 1024 * 1024) imports.delete(imports.keys().next().value!);
      imports.set(id, { dataset, expires: Date.now() + ttl, bytes: size, owner: owner(request) });
      return { id, filename: dataset.filename, operator, fields: dataset.fields, mapping, ...preview(dataset, mapping) };
    } finally { release(); }
  });
  app.post<{ Params: { id: string } }>('/api/import/:id/preview', async (request, reply) => {
    const dataset = getDataset(request.params.id, owner(request));
    if (!dataset) return reply.code(404).send({ error: 'Arquivo expirou. Envie-o novamente.' });
    return preview(dataset, mappingFor(request.body, dataset));
  });
  app.post<{ Params: { id: string } }>('/api/import/:id/export', async (request, reply) => {
    const dataset = getDataset(request.params.id, owner(request));
    if (!dataset) return reply.code(404).send({ error: 'Arquivo expirou. Envie-o novamente.' });
    const mapping = mappingFor(request.body, dataset);
    const release = await queue.acquire();
    try {
      const result: Uint8Array = await runner({ action: 'export', dataset, mapping });
      return reply.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('Content-Disposition', 'attachment; filename="cobertura.xlsx"').send(Buffer.from(result));
    } finally { release(); }
  });
  return app;
}
