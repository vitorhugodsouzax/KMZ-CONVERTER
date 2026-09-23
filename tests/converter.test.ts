import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
import ExcelJS from 'exceljs';
import { parseUpload } from '../src/parser.js';
import { mapped, suggestMapping } from '../src/model.js';
import { makeWorkbook } from '../src/workbook.js';
import { buildApp } from '../src/app.js';

const sample = await readFile(new URL('../public/exemplo.kml', import.meta.url));
const kml = (body: string) => strToU8(`<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${body}</Document></kml>`);
test('KML: attributes, HTML table, CEP, coordinates and explicit range', () => {
  const data = parseUpload('example.kml', sample, 'Teste');
  assert.equal(data.features.length, 3);
  const mapping = suggestMapping(data.fields);
  const point = mapped(data.features[0], mapping);
  assert.equal(point.cep, '01234567'); assert.equal(point.numero, '80');
  assert.equal(point.latitude, -23.550520); assert.equal(point.longitude, -46.633308);
  const line = mapped(data.features[1], mapping);
  assert.equal(line.numero_inicio, '10'); assert.equal(line.numero_fim, '100');
  assert.equal(line.latitude, null); assert.equal(data.features[1].vertices.length, 3);
  assert.equal(mapped(data.features[2], mapping).cep, '');
});
test('KMZ: all embedded KMLs, namespaced SimpleData, no following external links', () => {
  const archive = zipSync({ 'doc.kml': kml('<NetworkLink><Link><href>https://example.com/a.kml</href></Link></NetworkLink>'), 'a/data.kml': sample, 'b.kml': kml('<Placemark><ExtendedData><SchemaData><SimpleData name="cep">00123456</SimpleData></SchemaData></ExtendedData><Point><coordinates>0,0</coordinates></Point></Placemark>'), 'image.jpg': strToU8('not a real image') });
  const data = parseUpload('example.KMZ', archive, 'Teste');
  assert.equal(data.features.length, 4); assert.equal(data.features[3].attributes.cep, '00123456');
  assert.equal(data.warnings.length, 1); assert.equal(data.features[3].vertices[0].latitude, 0);
});
test('polygon holes, multiple geometries and geometry ordering survive', () => {
  const data = parseUpload('p.kml', kml('<Placemark><MultiGeometry><Polygon><outerBoundaryIs><LinearRing><coordinates>0,0 3,0 3,3 0,0</coordinates></LinearRing></outerBoundaryIs><innerBoundaryIs><LinearRing><coordinates>1,1 2,1 2,2 1,1</coordinates></LinearRing></innerBoundaryIs></Polygon><Point><coordinates>4,4</coordinates></Point></MultiGeometry></Placemark>'), 'X');
  assert.equal(data.features[0].vertices.length, 9);
  assert.equal(data.features[0].vertices[4].ring, 'interior 1');
  assert.equal(data.features[0].vertices[4].sequence, 1);
  assert.equal(data.features[0].vertices[8].geometry, 2);
  assert.equal(mapped(data.features[0], {}).latitude, null);
});
test('malformed XML, DTD, empty KMZ, invalid coordinate and invalid range', () => {
  assert.throws(() => parseUpload('a.kml', strToU8('<kml>'), 'X'), /inválido/);
  assert.throws(() => parseUpload('a.kml', strToU8('<!DOCTYPE x [<!ENTITY y "x">]><kml/>'), 'X'), /DTD/);
  assert.throws(() => parseUpload('a.kmz', zipSync({ 'a.txt': strToU8('x') }), 'X'), /Nenhum KML/);
  assert.throws(() => parseUpload('a.txt', sample, 'X'), /Escolha/);
  const data = parseUpload('a.kml', kml('<Placemark><Point><coordinates>181,95</coordinates></Point><ExtendedData><Data name="CEP"><value>00000000</value></Data><Data name="N_inicio"><value>100</value></Data><Data name="N_fim"><value>10</value></Data></ExtendedData></Placemark>'), 'X');
  const value = mapped(data.features[0], suggestMapping(data.fields));
  assert.equal(value.latitude, null); assert.ok(value.warnings.some(x => x.includes('CEP inválido'))); assert.ok(value.warnings.some(x => x.includes('maior')));
});
test('XLSX opens with correct sheets, CEP text, typed coordinates and inert formulas', async () => {
  const data = parseUpload('a.kml', sample, 'X');
  data.features[0].attributes['Formula'] = '=HYPERLINK("https://bad.invalid")';
  data.features[0].attributes['Longo'] = 'x'.repeat(40000);
  const buffer = await makeWorkbook(data, suggestMapping(data.fields));
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(buffer) as any);
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Registros','Coordenadas','Atributos','Leia-me']);
  const sheet = workbook.getWorksheet('Registros')!;
  assert.equal(sheet.getCell('B2').value, '01234567'); assert.equal(sheet.getCell('L2').value, -23.55052);
  assert.equal(sheet.getCell('L3').value, null); assert.equal(sheet.getCell('H3').value, '10');
  const attrs = workbook.getWorksheet('Atributos')!;
  let formulaFound = false, textLength = 0;
  attrs.eachRow(row => { if (row.getCell(2).value === 'Formula') { formulaFound = true; assert.equal(typeof row.getCell(4).value, 'string'); } if (row.getCell(2).value === 'Longo') textLength += String(row.getCell(4).value).length; });
  assert.ok(formulaFound); assert.equal(textLength, 40000);
});
test('API upload, remapping, export, origin check and invalid session', async () => {
  const app = buildApp(async job => job.action === 'parse-batch' ? (job.files as any[]).map(file => parseUpload(file.filename, file.bytes, job.operator as string)).reduce((all, item, index) => { if (!index) return item; for (const feature of item.features) { feature.id = all.features.length + 1; all.features.push(feature); } all.fields = [...new Set([...all.fields, ...item.fields])].sort(); return all; }) : makeWorkbook(job.dataset as any, job.mapping as any));
  try {
    const boundary = 'test-kml-boundary';
    const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="operator"\r\n\r\nTeste\r\n--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="example-a.kml"\r\nContent-Type: application/xml\r\n\r\n`), sample, Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="example-b.kml"\r\nContent-Type: application/xml\r\n\r\n`), sample, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const response = await app.inject({ method: 'POST', url: '/api/import', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
    assert.equal(response.statusCode, 200, response.body); const data = response.json();
    const preview = await app.inject({ method: 'POST', url: `/api/import/${data.id}/preview`, payload: { mapping: {} } });
    assert.equal(preview.json().count, 6); assert.equal(preview.json().missing.cep, 6);
    const invalid = await app.inject({ method: 'POST', url: `/api/import/${data.id}/preview`, payload: { mapping: { cep: 'does not exist' } } });
    assert.equal(invalid.statusCode, 400);
    const output = await app.inject({ method: 'POST', url: `/api/import/${data.id}/export`, payload: { mapping: data.mapping } });
    assert.equal(output.statusCode, 200); assert.ok(output.headers['content-type']?.includes('spreadsheetml'));
    const expired = await app.inject({ method: 'POST', url: '/api/import/missing/export', payload: { mapping: {} } }); assert.equal(expired.statusCode, 404);
    const foreign = await app.inject({ method: 'POST', url: '/api/import', headers: { origin: 'https://unrelated.invalid' } }); assert.equal(foreign.statusCode, 403);
  } finally { await app.close(); }
});
test('compiled application: real worker parses and exports a workbook', async () => {
  process.env.GEOCODING_DISABLED = '1';
  const { buildApp: compiledApp } = await import('../dist/app.js');
  const app = compiledApp();
  try {
    const boundary = 'worker-integration-test';
    const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="operator"\r\n\r\nTeste\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="example.kml"\r\nContent-Type: application/xml\r\n\r\n`), sample, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const imported = await app.inject({ method: 'POST', url: '/api/import', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
    assert.equal(imported.statusCode, 200, imported.body);
    const data = imported.json();
    const response = await app.inject({ method: 'POST', url: `/api/import/${data.id}/export`, payload: { mapping: data.mapping } });
    assert.equal(response.statusCode, 200, response.body.slice(0, 100));
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(response.rawPayload as any);
    assert.equal(workbook.getWorksheet('Registros')!.getCell('B2').value, '01234567');
    assert.equal(workbook.getWorksheet('Coordenadas')!.rowCount, 9);
  } finally { await app.close(); delete process.env.GEOCODING_DISABLED; }
});
