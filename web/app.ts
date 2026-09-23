type Mapping = Record<string, string>;
type Preview = { count: number; coordinates: number; missing: { cep: number; numero: number; warnings: number; geocoded: number }; rows: Record<string, any>[]; warnings: string[] };
type ImportResult = Preview & { id: string; filename: string; operator: string; fields: string[]; mapping: Mapping };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const labels: Record<string, string> = { cep: 'CEP', uf: 'UF', cidade: 'Cidade', bairro: 'Bairro', numero: 'Número', numero_inicio: 'Número inicial', numero_fim: 'Número final', tipo: 'Tipo do imóvel', data_inclusao: 'Data de inclusão' };
const input = $<HTMLInputElement>('file'), operator = $<HTMLInputElement>('operator');
let selected: File[] = [], current: ImportResult | null = null, busy = false;
function message(value: string) { $('status').textContent = value; }
function showError(error: unknown) { $('error').textContent = error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.'; $('error').hidden = false; }
function lock(value: boolean) {
  busy = value;
  for (const id of ['process','demo','download','refresh','file','operator']) ($<HTMLButtonElement | HTMLInputElement>(id)).disabled = value;
  document.querySelectorAll<HTMLSelectElement>('#mapping select').forEach(select => select.disabled = value);
  $('upload-form').setAttribute('aria-busy', String(value));
}
function select(files: File[]) {
  if (busy) return;
  $('error').hidden = true;
  current = null; $('results').hidden = true; message('');
  selected = [];
  if (!files.length || files.length > 20) { input.value = ''; showError(new Error('Escolha de 1 a 20 arquivos KML ou KMZ.')); return; }
  if (files.some(file => !/\.(kml|kmz)$/i.test(file.name))) { input.value = ''; $('file-label').textContent = 'Escolha somente KML ou KMZ'; $('file-detail').textContent = 'Há um formato não suportado no lote'; showError(new Error('Todos os arquivos devem ter extensão .kml ou .kmz.')); return; }
  if (files.some(file => file.size > 50 * 1024 * 1024)) { input.value = ''; $('file-label').textContent = 'Há um arquivo grande demais'; $('file-detail').textContent = 'Limite de 50 MB por arquivo'; showError(new Error('Cada arquivo deve ter no máximo 50 MB.')); return; }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > 250 * 1024 * 1024) { input.value = ''; showError(new Error('O lote deve ter no máximo 250 MB.')); return; }
  selected = files;
  $('file-label').textContent = files.length === 1 ? files[0].name : `${files.length} arquivos selecionados`;
  const names = files.slice(0, 3).map(file => file.name).join(' · '), more = files.length > 3 ? ` · +${files.length - 3}` : '';
  $('file-detail').textContent = `${names}${more} · ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(total / 1024 / 1024)} MB`;
}
input.addEventListener('change', () => select(input.files ? [...input.files] : []));
operator.addEventListener('input', () => {
  if (!current) return;
  current = null;
  $('results').hidden = true;
  $('error').hidden = true;
  message('Operadora alterada. Clique em Ler arquivos novamente para atualizar a planilha.');
});
for (const event of ['dragenter','dragover']) $('dropzone').addEventListener(event, e => { e.preventDefault(); if (!busy) $('dropzone').classList.add('dragover'); });
for (const event of ['dragleave','drop']) $('dropzone').addEventListener(event, e => { e.preventDefault(); $('dropzone').classList.remove('dragover'); });
$('dropzone').addEventListener('drop', event => {
  if (busy) return;
  const transfer = (event as DragEvent).dataTransfer;
  if (transfer?.files.length) { input.files = transfer.files; select([...transfer.files]); }
});
async function checked(response: Response) {
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Falha no servidor. Tente novamente.'); }
  return response;
}
function mapping(): Mapping {
  return Object.fromEntries([...document.querySelectorAll<HTMLSelectElement>('#mapping select')].map(select => [select.name, select.value]));
}
function renderPreview(preview: Preview) {
  const quality = $('quality'); quality.replaceChildren();
  const paragraphs = [
    `${preview.count.toLocaleString('pt-BR')} registros e ${preview.coordinates.toLocaleString('pt-BR')} coordenadas encontrados.`,
    preview.missing.geocoded ? `${preview.missing.geocoded.toLocaleString('pt-BR')} registros receberam um endereço aproximado do CNEFE.` : 'Nenhum endereço automático foi associado.',
    preview.missing.cep || preview.missing.numero ? `${preview.missing.cep.toLocaleString('pt-BR')} sem CEP · ${preview.missing.numero.toLocaleString('pt-BR')} sem número ou faixa. Confira a correspondência abaixo; dados ausentes ficam em branco.` : 'CEP e número ou faixa presentes em todos os registros.',
    ...preview.warnings,
  ];
  for (const text of paragraphs) { const p = document.createElement('p'); p.textContent = text; quality.append(p); }
  $('preview-count').textContent = `Exibindo ${preview.rows.length} de ${preview.count.toLocaleString('pt-BR')}`;
  const tbody = $('rows'); tbody.replaceChildren();
  for (const row of preview.rows) {
    const tr = document.createElement('tr');
    const number = row.numero || (row.numero_inicio || row.numero_fim ? `${row.numero_inicio || '?'} a ${row.numero_fim || '?'}` : '—');
    const distance = row.geocodeDistance === null ? '—' : `${Math.round(row.geocodeDistance).toLocaleString('pt-BR')} m`;
    for (const value of [row.source || '—', row.name || 'Sem nome', row.geometry || 'Não identificada', row.cep || '—', number, row.cidade || '—', distance, row.latitude === null ? '—' : row.latitude.toFixed(7), row.longitude === null ? '—' : row.longitude.toFixed(7), row.warnings.join('; ') || 'Sem avisos']) {
      const td = document.createElement('td'); td.textContent = String(value); tr.append(td);
    }
    tbody.append(tr);
  }
}
function render(result: ImportResult) {
  $('file-summary').textContent = `${result.filename} · ${result.operator}`;
  const container = $('mapping'); container.replaceChildren();
  for (const [key, label] of Object.entries(labels)) {
    const div = document.createElement('div'), title = document.createElement('label'), select = document.createElement('select');
    title.htmlFor = `map-${key}`; title.textContent = label; select.id = title.htmlFor; select.name = key;
    select.add(new Option('Não informado no arquivo', ''));
    for (const field of result.fields) select.add(new Option(field, field));
    select.value = result.mapping[key] ?? '';
    select.addEventListener('change', () => { $('mapping-status').textContent = 'Correspondência alterada. Atualize a prévia para conferir.'; });
    div.append(title, select); container.append(div);
  }
  $('mapping-status').textContent = 'Sugestões automáticas: confira antes de exportar.';
  renderPreview(result); $('results').hidden = false;
  $('results-heading').focus({ preventScroll: true });
  $('results').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
}
$('upload-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  if (!selected.length) { showError(new Error('Escolha ao menos um arquivo para continuar.')); return; }
  if (!operator.value.trim()) { showError(new Error('Informe a operadora.')); operator.focus(); return; }
  const form = new FormData(); form.append('operator', operator.value.trim()); for (const file of selected) form.append('files', file);
  $('error').hidden = true; $('results').hidden = true; current = null; lock(true); message('Lendo os arquivos e buscando CEP e número no CNEFE… Na primeira execução, o download da base pode demorar.'); $('process').textContent = 'Processando lote…';
  try { current = await (await checked(await fetch('/api/import', { method: 'POST', body: form }))).json(); render(current!); message('Arquivo lido. Confira os campos e baixe a planilha.'); }
  catch (error) { message(''); showError(error); }
  finally { lock(false); $('process').textContent = 'Ler arquivos →'; }
});
$('refresh').addEventListener('click', async () => {
  if (!current || busy) return;
  lock(true); $('error').hidden = true; $('mapping-status').textContent = 'Atualizando…';
  try { const response = await checked(await fetch(`/api/import/${current.id}/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mapping: mapping() }) })); renderPreview(await response.json()); $('mapping-status').textContent = 'Prévia atualizada com os campos escolhidos.'; }
  catch (error) { $('mapping-status').textContent = 'Não foi possível atualizar.'; showError(error); }
  finally { lock(false); }
});
$('download').addEventListener('click', async () => {
  if (!current || busy) return;
  lock(true); $('error').hidden = true; message('Gerando a planilha com todos os registros…');
  try {
    const response = await checked(await fetch(`/api/import/${current.id}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mapping: mapping() }) }));
    const url = URL.createObjectURL(await response.blob()), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${current.filename.replace(/\.(kml|kmz)$/i, '')}.xlsx`; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    message('Planilha gerada. O download foi solicitado ao navegador.');
  } catch (error) { message(''); showError(error); }
  finally { lock(false); }
});
$('demo').addEventListener('click', async () => {
  if (busy) return;
  lock(true); $('error').hidden = true;
  try {
    const response = await checked(await fetch('/exemplo.kml'));
    const file = new File([await response.blob()], 'exemplo-ficticio.kml', { type: 'application/vnd.google-earth.kml+xml' });
    const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files;
    lock(false); select([file]); operator.value = 'Operadora de exemplo';
    message('Exemplo fictício selecionado. Clique em Ler arquivos para experimentar.');
  } catch (error) { showError(error); } finally { lock(false); }
});
