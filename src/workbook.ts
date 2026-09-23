import ExcelJS from 'exceljs';
import { mapped, type Dataset, type Mapping } from './model.js';

export async function makeWorkbook(dataset: Dataset, mapping: Mapping): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Conversor de cobertura';
  workbook.created = new Date(dataset.importedAt);
  function sheet(name: string, headings: string[], widths: number[]) {
    const result = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    result.columns = headings.map((header, index) => ({ header, key: String(index), width: widths[index] ?? 22 }));
    result.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headings.length } };
    result.getRow(1).height = 30;
    result.getRow(1).eachCell(cell => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF234B40' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    return result;
  }
  const records = sheet('Registros', ['ID', 'CEP', 'UF', 'Cidade', 'Bairro', 'Operadora', 'Número', 'Nº início', 'Nº fim', 'Tipo', 'Data inclusão (origem)', 'Latitude', 'Longitude', 'Geometria', 'Nome', 'Pasta', 'KML de origem', 'Distância CNEFE (m)', 'Método da coordenada', 'Logradouro CNEFE', 'Avisos', 'Maps', 'Street View'], [10,14,8,24,24,22,16,14,14,18,24,18,18,24,32,34,36,22,24,34,65,40,40]);
  const coordinates = sheet('Coordenadas', ['Registro ID', 'Geometria ID', 'Tipo geometria', 'Anel', 'Ordem', 'Latitude', 'Longitude', 'Altitude (origem)'], [15,16,22,20,12,19,19,22]);
  const attributes = sheet('Atributos', ['Registro ID', 'Campo original', 'Parte do texto', 'Valor original'], [15,32,18,80]);
  // Excel cells are limited to 32,767 characters. Full raw attributes are split, never silently discarded.
  const cellText = (value: string) => value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  const clipped = (value: unknown): ExcelJS.CellValue => typeof value === 'string' ? cellText(value).slice(0, 32000) : value as ExcelJS.CellValue;
  for (const feature of dataset.features) {
    const value = mapped(feature, mapping);
    const hasPoint = value.latitude !== null && value.longitude !== null;
    const maps = hasPoint ? `https://www.google.com/maps/search/?api=1&query=${value.latitude},${value.longitude}` : '';
    const street = hasPoint ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${value.latitude},${value.longitude}` : '';
    const row = [feature.id, value.cep, value.uf, value.cidade, value.bairro, dataset.operator, value.numero, value.numero_inicio, value.numero_fim, value.tipo, value.data_inclusao, value.latitude, value.longitude, feature.kinds.join(', '), feature.name, feature.folder, feature.source, value.geocodeDistance, value.geocodeMethod, value.logradouro, value.warnings.join('; '), maps, street];
    if (row.some(item => typeof item === 'string' && item.length > 32000)) row[20] = `${row[20]}; Texto longo abreviado em Registros; original disponível em Atributos`;
    records.addRow(row.map(clipped));
    for (const vertex of feature.vertices) coordinates.addRow([feature.id, vertex.geometry, vertex.kind, vertex.ring, vertex.sequence, vertex.latitude, vertex.longitude, vertex.altitude]);
    for (const [key, raw] of Object.entries(feature.attributes)) {
      const text = cellText(raw);
      for (let offset = 0; offset < Math.max(1, text.length); offset += 32000) attributes.addRow([feature.id, key, Math.floor(offset / 32000) + 1, text.slice(offset, offset + 32000)]);
    }
  }
  for (const column of [2,7,8,9]) records.getColumn(column).numFmt = '@';
  for (const column of [12,13]) records.getColumn(column).numFmt = '0.0000000';
  for (const column of [6,7]) coordinates.getColumn(column).numFmt = '0.0000000';
  const notes = sheet('Leia-me', ['Item', 'Informação'], [32,110]);
  const entries = [
    ['Arquivo', dataset.filename], ['Operadora informada', dataset.operator], ['Processado em (UTC)', dataset.importedAt],
    ['Registros', dataset.features.length], ['Coordenadas', dataset.features.reduce((n,f) => n + f.vertices.length, 0)],
    ['CEPs e números', 'Campos originais têm prioridade. Lacunas são preenchidas com o endereço CNEFE mais próximo pelo geocodebr; distância e método da coordenada permitem avaliar a aproximação.'],
    ['Latitude e longitude', 'Em Registros, preenchidas apenas quando o elemento tem um único Point válido. Linhas, polígonos e múltiplos pontos ficam em Coordenadas.'],
    ['Ordem das coordenadas', 'KML usa longitude,latitude,altitude. A aba Coordenadas identifica as colunas explicitamente.'],
    ['Polígonos', 'Anéis exteriores e interiores são separados. Geometria ID e Ordem permitem reconstruir cada sequência. Não há validação topológica.'],
    ['Datas da origem', 'Preservadas como texto, sem presumir formato ou fuso. A data de processamento é separada.'],
    ['Valores numéricos de fachada', 'Preservados como texto para manter números com letras, S/N e zeros.'],
    ['Atributos originais', 'Textos extensos divididos em partes de até 32.000 caracteres. Fórmulas de origem são exportadas como texto.'],
    ['Links do Street View', 'Gerados para pontos. A existência de imagens no local não é garantida.'],
    ['Referência KML', 'https://developers.google.com/kml/documentation/kmlreference'],
    ...dataset.warnings.map(warning => ['Aviso do arquivo', warning]),
    ...Object.entries(mapping).map(([key, source]) => [`Mapeamento: ${key}`, source]),
  ];
  for (const entry of entries) notes.addRow(entry);
  notes.eachRow((row, index) => { if (index > 1) { row.height = 42; row.alignment = { wrapText: true, vertical: 'middle' }; } });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
