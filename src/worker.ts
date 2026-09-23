import { parentPort, workerData } from 'node:worker_threads';
import { parseUpload } from './parser.js';
import { makeWorkbook } from './workbook.js';
import { enrichWithAddresses } from './geocoder.js';
import { InputError, limits, type Dataset } from './model.js';

function combine(files: { filename: string; bytes: Uint8Array }[], operator: string): Dataset {
  const datasets = files.map(file => parseUpload(file.filename, file.bytes, operator));
  const result = datasets[0];
  if (!result) throw new InputError('Selecione ao menos um arquivo KML ou KMZ.');
  for (const current of datasets.slice(1)) {
    for (const feature of current.features) { feature.id = result.features.length + 1; result.features.push(feature); }
    result.fields = [...new Set([...result.fields, ...current.fields])].sort();
    result.warnings = [...new Set([...result.warnings, ...current.warnings])];
  }
  const coordinates = result.features.reduce((sum, feature) => sum + feature.vertices.length, 0);
  if (result.features.length > limits.records || coordinates > limits.vertices) throw new InputError('O lote excede 100 mil registros ou 500 mil coordenadas. Divida-o em partes menores.');
  result.filename = files.length === 1 ? files[0].filename : `${files.length} arquivos: ${files.map(file => file.filename).join(', ')}`;
  return result;
}
try {
  const result = workerData.action === 'parse-batch'
    ? await enrichWithAddresses(combine(workerData.files, workerData.operator))
    : await makeWorkbook(workerData.dataset, workerData.mapping);
  parentPort?.postMessage({ result });
} catch (error) {
  parentPort?.postMessage({ error: error instanceof Error ? error.message : 'Falha ao converter o arquivo.' });
}
