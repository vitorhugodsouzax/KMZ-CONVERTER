import { unzipSync } from 'fflate';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import he from 'he';
import { InputError, limits, type Dataset, type Feature, type Vertex } from './model.js';

type XmlNode = Record<string, any>;
const tag = (node: XmlNode) => Object.keys(node).find(key => key !== ':@' && key !== '#text' && key !== '#cdata') ?? '';
const children = (node: XmlNode): XmlNode[] => Array.isArray(node[tag(node)]) ? node[tag(node)] : [];
const direct = (nodes: XmlNode[], name: string) => nodes.find(node => tag(node) === name);
const textOf = (node?: XmlNode): string => !node ? '' : '#text' in node ? String(node['#text']) : '#cdata' in node ? (Array.isArray(node['#cdata']) ? node['#cdata'].map(textOf).join('') : String(node['#cdata'])) : children(node).map(textOf).join('');
const plain = (value: string) => he.decode(value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')).trim();
function field(attrs: Record<string, string>, key: string, value: string) {
  if (!key || key.length > 200) return;
  let name = key, suffix = 2;
  while (Object.hasOwn(attrs, name)) name = `${key} (${suffix++})`;
  attrs[name] = value;
}
function extractAttributes(nodes: XmlNode[], attrs: Record<string, string>) {
  for (const node of nodes) {
    const name = tag(node);
    if (name === 'Data' || name === 'SimpleData') {
      const key = String(node[':@']?.['@_name'] ?? '');
      field(attrs, key, name === 'Data' ? textOf(direct(children(node), 'value')) : textOf(node));
    } else extractAttributes(children(node), attrs);
  }
}
function parseCoordinates(raw: string, context: Omit<Vertex, 'sequence' | 'latitude' | 'longitude' | 'altitude'>, feature: Feature, budget: { vertices: number }) {
  let sequence = 0;
  for (const tuple of raw.trim().split(/\s+/).filter(Boolean)) {
    if (++budget.vertices > limits.vertices) throw new InputError('O arquivo excede 500 mil coordenadas. Divida-o em arquivos menores.');
    sequence++;
    const parts = tuple.split(',');
    const longitude = parts[0]?.trim() ? Number(parts[0]) : NaN;
    const latitude = parts[1]?.trim() ? Number(parts[1]) : NaN;
    const altitude = parts[2]?.trim() ? Number(parts[2]) : null;
    if (parts.length < 2 || parts.length > 3 || !Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90 || (altitude !== null && !Number.isFinite(altitude))) {
      feature.warnings.push(`Coordenada inválida ignorada: geometria ${context.geometry}, ${context.ring}, posição ${sequence}`);
      continue;
    }
    feature.vertices.push({ ...context, sequence, latitude, longitude, altitude });
  }
}
function geometry(nodes: XmlNode[], feature: Feature, budget: { vertices: number }, counter = { n: 0 }) {
  for (const node of nodes) {
    const kind = tag(node);
    if (['Point', 'LineString', 'Polygon', 'LinearRing'].includes(kind)) {
      const number = ++counter.n;
      feature.kinds.push(kind);
      if (kind === 'Polygon') {
        let inner = 0;
        for (const boundary of children(node)) {
          if (!['outerBoundaryIs', 'innerBoundaryIs'].includes(tag(boundary))) continue;
          const ring = tag(boundary) === 'outerBoundaryIs' ? 'exterior' : `interior ${++inner}`;
          const linear = direct(children(boundary), 'LinearRing');
          parseCoordinates(textOf(direct(linear ? children(linear) : [], 'coordinates')), { geometry: number, kind, ring }, feature, budget);
        }
      } else parseCoordinates(textOf(direct(children(node), 'coordinates')), { geometry: number, kind, ring: '' }, feature, budget);
    } else if (kind === 'MultiGeometry') geometry(children(node), feature, budget, counter);
    else if (['Track', 'MultiTrack', 'Model'].includes(kind)) feature.warnings.push(`Geometria ${kind} não suportada nesta versão`);
  }
}
function decodeXml(data: Uint8Array) {
  let value: string;
  try {
    const encoding = data[0] === 0xff && data[1] === 0xfe ? 'utf-16le' : data[0] === 0xfe && data[1] === 0xff ? 'utf-16be' : 'utf-8';
    value = new TextDecoder(encoding, { fatal: true }).decode(data);
  } catch { throw new InputError('Codificação não suportada. Salve o KML em UTF-8.'); }
  if (/<!\s*(DOCTYPE|ENTITY)/i.test(value)) throw new InputError('XML com DTD ou entidades externas não é aceito.');
  const validation = XMLValidator.validate(value);
  if (validation !== true) throw new InputError(`KML inválido: ${validation.err.msg}`);
  return value;
}
export function parseUpload(filename: string, data: Uint8Array, operator: string): Dataset {
  if (data.length > limits.upload) throw new InputError('O arquivo deve ter no máximo 50 MB.');
  let documents: [string, Uint8Array][];
  if (/\.kmz$/i.test(filename)) {
    let expanded = 0, entries = 0;
    try {
      const files = unzipSync(data, { filter(entry) {
        if (++entries > limits.entries) throw new InputError('KMZ com mais de 500 arquivos.');
        if (!/\.kml$/i.test(entry.name)) return false;
        expanded += entry.originalSize;
        if (expanded > limits.expanded) throw new InputError('Os KMLs descompactados excedem 250 MB.');
        return true;
      } });
      documents = Object.entries(files).map(([source, bytes]) => [`${filename} / ${source}`, bytes]);
    } catch (error) { if (error instanceof InputError) throw error; throw new InputError('Não foi possível abrir o KMZ. Verifique se o arquivo está íntegro.'); }
    if (!documents.length) throw new InputError('Nenhum KML encontrado dentro do KMZ.');
  } else if (/\.kml$/i.test(filename)) documents = [[filename, data]];
  else throw new InputError('Escolha um arquivo .kml ou .kmz.');
  const dataset: Dataset = { filename, operator, importedAt: new Date().toISOString(), features: [], fields: [], warnings: [] };
  const budget = { vertices: 0, attributes: 0 };
  for (const [source, bytes] of documents) {
    const xml = decodeXml(bytes);
    const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false, trimValues: false, processEntities: true });
    const roots: XmlNode[] = parser.parse(xml);
    if (!roots.some(node => tag(node) === 'kml')) throw new InputError('O XML não possui a raiz <kml>.');
    function walk(nodes: XmlNode[], folders: string[]) {
      for (const node of nodes) {
        const kind = tag(node), nested = children(node);
        if (kind === 'NetworkLink') { dataset.warnings.push('NetworkLink encontrado: links não são acessados. Os KMLs presentes no KMZ são lidos individualmente.'); continue; }
        if (['GroundOverlay', 'PhotoOverlay', 'ScreenOverlay'].includes(kind)) { dataset.warnings.push(`${kind} não convertido: esta versão exporta Placemarks.`); continue; }
        if (kind === 'Placemark') {
          if (dataset.features.length >= limits.records) throw new InputError('O arquivo excede 100 mil registros. Divida-o em arquivos menores.');
          const name = textOf(direct(nested, 'name')).trim();
          const description = textOf(direct(nested, 'description')).trim();
          const attrs: Record<string, string> = Object.create(null);
          field(attrs, 'Nome do elemento', name);
          field(attrs, 'Descrição original', description);
          const address = textOf(direct(nested, 'address')).trim();
          if (address) field(attrs, 'Endereço original', address);
          extractAttributes(nested, attrs);
          // Common provider exports put labeled fields in HTML tables or key:value lines.
          for (const match of description.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
            const cells = [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => plain(cell[1]));
            if (cells.length === 2) field(attrs, cells[0].replace(/:$/, ''), cells[1]);
          }
          for (const line of plain(description.replace(/<\/(?:p|div|tr)>/gi, '\n')).split(/\r?\n/)) {
            const match = line.match(/^\s*([^:]{1,80}):\s*(.+)$/);
            if (match) field(attrs, match[1].trim(), match[2].trim());
          }
          budget.attributes += Object.keys(attrs).length;
          if (budget.attributes > limits.attributes) throw new InputError('O arquivo excede 1 milhão de atributos. Divida-o em arquivos menores.');
          const feature: Feature = { id: dataset.features.length + 1, source, folder: folders.join(' / '), name, description, attributes: attrs, kinds: [], vertices: [], warnings: [] };
          geometry(nested, feature, budget);
          if (!feature.vertices.length) feature.warnings.push('Sem coordenadas válidas');
          if (feature.kinds.some(kind => kind !== 'Point') || feature.vertices.length > 1) feature.warnings.push('Geometria não é um ponto único; consulte a aba Coordenadas');
          dataset.features.push(feature);
        } else {
          const folderName = ['Folder', 'Document'].includes(kind) ? textOf(direct(nested, 'name')).trim() : '';
          walk(nested, folderName ? [...folders, folderName] : folders);
        }
      }
    }
    walk(roots, []);
  }
  if (!dataset.features.length) throw new InputError('Nenhum Placemark encontrado. O arquivo pode conter apenas imagens ou links externos.');
  dataset.fields = [...new Set(dataset.features.flatMap(feature => Object.keys(feature.attributes)))].sort();
  if (dataset.fields.length > 1000) throw new InputError('Mais de mil campos diferentes. Divida ou padronize o arquivo.');
  dataset.warnings = [...new Set(dataset.warnings)];
  return dataset;
}
