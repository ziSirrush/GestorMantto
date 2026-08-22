(function(){
'use strict';

let proyectos = [];
let equiposPorProyecto = {};
let page = 1;
let filterSignature = '';

const PAGE_SIZE = 30;
const API = (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
const esc = value => String(value == null ? '' : value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const headers = () => Object.assign(
  { Accept:'application/json' },
  window.ManttoAuth && window.ManttoAuth.authHeaders
    ? window.ManttoAuth.authHeaders()
    : {}
);

async function getJson(path){
  const response = await fetch(API + path, { headers:headers(), cache:'no-store' });
  const text = await response.text();
  let json;
  try{ json = text ? JSON.parse(text) : {}; }
  catch(_error){ throw new Error('El backend respondió contenido no JSON.'); }
  if(!response.ok || json.ok === false){
    throw new Error(json.message || json.error || ('Error HTTP ' + response.status));
  }
  return json;
}

function rowYear(row){
  const direct = String(row && row.anio_termino || '').match(/(?:19|20)\d{2}/);
  if(direct) return direct[0];
  const delivered = String(row && row.fecha_entrega_cliente || '').match(/(?:19|20)\d{2}/);
  return delivered ? delivered[0] : '';
}

function build(rows){
  const map = new Map();
  equiposPorProyecto = {};
  rows.forEach(row => {
    const id = String(row.id_proyecto || '').trim();
    if(!id) return;
    (equiposPorProyecto[id] || (equiposPorProyecto[id] = [])).push(row);
    if(!map.has(id)){
      map.set(id, {
        id,
        proyecto:row.proyecto || '',
        anio:'',
        ciudad:row.ciudad || '',
        estado:row.estado || '',
        asesor:row.vendedor || '',
        supervisor:row.supervisor_fl || '',
        cliente:row.cliente || '',
        equipos:0
      });
    }
    const project = map.get(id);
    const year = rowYear(row);
    if(year && (!project.anio || Number(year) > Number(project.anio))) project.anio = year;
    project.equipos += 1;
  });
  return [...map.values()];
}

function esCerrado(project){
  const equipment = equiposPorProyecto[project.id] || [];
  return equipment.length > 0 && equipment.every(row => String(row.estatus || '').trim() === '08-T');
}

function options(id, label, values){
  const element = document.getElementById(id);
  if(element){
    element.innerHTML = '<option value="">' + label + '</option>' +
      values.map(value => '<option value="' + esc(value) + '">' + esc(value) + '</option>').join('');
  }
}

function populate(){
  const closed = proyectos.filter(esCerrado);
  options('ic-estado', 'Todos los estados', [...new Set(closed.map(row => row.estado).filter(Boolean))].sort());
  options('ic-asesor', 'Todo asesor', [...new Set(closed.map(row => row.asesor).filter(Boolean))].sort());
  options('ic-supervisor', 'Todo supervisor', [...new Set(closed.map(row => row.supervisor).filter(Boolean))].sort());
  options(
    'ic-anio',
    'Todos los años',
    [...new Set(closed.map(row => row.anio).filter(Boolean))].sort((a, b) => Number(b) - Number(a))
  );
}

function openProject(project){
  if(window.ManttoDetails && typeof window.ManttoDetails.openProyecto === 'function'){
    window.ManttoDetails.openProyecto(project.id || project.proyecto, {
      template:'cliente-unificado',
      source:'instalaciones-cerrados',
      projectName:project.proyecto,
      cliente:project.cliente || ''
    });
  }
}

function render(){
  const all = proyectos.length;
  let rows = proyectos.filter(esCerrado);
  const query = (document.getElementById('ic-buscar')?.value || '').trim().toUpperCase();
  const estado = document.getElementById('ic-estado')?.value || '';
  const asesor = document.getElementById('ic-asesor')?.value || '';
  const supervisor = document.getElementById('ic-supervisor')?.value || '';
  const anio = document.getElementById('ic-anio')?.value || '';
  const nextSignature = JSON.stringify([query, estado, asesor, supervisor, anio]);
  if(nextSignature !== filterSignature){
    filterSignature = nextSignature;
    page = 1;
  }

  if(query){
    rows = rows.filter(row =>
      [row.proyecto, row.id, row.cliente]
        .some(value => String(value || '').toUpperCase().includes(query))
    );
  }
  if(estado) rows = rows.filter(row => row.estado === estado);
  if(asesor) rows = rows.filter(row => row.asesor === asesor);
  if(supervisor) rows = rows.filter(row => row.supervisor === supervisor);
  if(anio) rows = rows.filter(row => row.anio === anio);
  rows.sort((a, b) => String(a.proyecto).localeCompare(String(b.proyecto), 'es', { sensitivity:'base' }));

  const closed = proyectos.filter(esCerrado).length;
  document.getElementById('ic-kpis').innerHTML =
    '<div class="py-card"><div class="label">Proyectos cerrados</div><div class="value" style="color:var(--ok)">' + closed + '</div></div>' +
    '<div class="py-card"><div class="label">% del total</div><div class="value">' + (all ? Math.round(closed / all * 100) : 0) + '%</div></div>';

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  page = Math.min(Math.max(page, 1), totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);
  const body = document.getElementById('ic-tbody');
  if(!pageRows.length){
    body.innerHTML = '<tr><td colspan="9" class="py-empty">Sin resultados.</td></tr>';
  }else{
    body.innerHTML = pageRows.map((row, index) =>
      '<tr class="clickable" data-i="' + index + '">' +
      '<td>' + esc(row.proyecto) + '</td><td>' + esc(row.id) + '</td><td>' + esc(row.anio || '-') + '</td>' +
      '<td>' + esc(row.ciudad || '-') + '</td><td>' + esc(row.estado || '-') + '</td><td>' + row.equipos + '</td>' +
      '<td>' + esc(row.asesor || '-') + '</td><td>' + esc(row.supervisor || '-') + '</td><td>' + esc(row.cliente || '-') + '</td></tr>'
    ).join('');
    body.querySelectorAll('tr[data-i]').forEach(row => {
      row.addEventListener('click', () => openProject(pageRows[Number(row.dataset.i)]));
    });
  }

  const range = document.getElementById('ic-range');
  const pageLabel = document.getElementById('ic-page-number');
  const previous = document.getElementById('ic-prev');
  const next = document.getElementById('ic-next');
  if(range){
    range.textContent = rows.length
      ? ('Mostrando ' + (start + 1) + '-' + (start + pageRows.length) + ' de ' + rows.length)
      : '0 proyectos';
  }
  if(pageLabel) pageLabel.textContent = page + ' / ' + totalPages;
  if(previous) previous.disabled = page <= 1;
  if(next) next.disabled = page >= totalPages;
}

function changePage(delta){
  page += Number(delta) || 0;
  render();
}

function clearFilters(){
  ['ic-buscar', 'ic-estado', 'ic-asesor', 'ic-supervisor', 'ic-anio'].forEach(id => {
    const field = document.getElementById(id);
    if(field) field.value = '';
  });
  render();
}

async function load(){
  const response = await getJson('/api/ins-fl?limit=5000');
  proyectos = build(Array.isArray(response.data) ? response.data : []);
  page = 1;
  populate();
  render();
  const status = document.getElementById('ic-aiven-status');
  if(status){
    status.innerHTML = '<span class="py-connection-dot"></span><span>Aiven conectado · ' +
      proyectos.filter(esCerrado).length + ' cerrados</span>';
  }
}

async function mount(force){
  const view = document.getElementById('view-instalaciones-cerrados');
  if(!view) return false;
  if(force) view.dataset.ready = '0';
  if(view.dataset.ready !== '1'){
    const response = await fetch(
      './modules/instalaciones-cerrados/instalaciones-cerrados.html?v=20260821-paginacion-v002',
      { cache:'no-store' }
    );
    if(!response.ok) throw new Error('No se pudo cargar Proyectos Cerrados.');
    view.innerHTML = await response.text();
    view.dataset.ready = '1';
    ['ic-buscar', 'ic-estado', 'ic-asesor', 'ic-supervisor', 'ic-anio'].forEach(id => {
      document.getElementById(id)?.addEventListener(id === 'ic-buscar' ? 'input' : 'change', render);
    });
    document.getElementById('ic-limpiar')?.addEventListener('click', clearFilters);
    document.getElementById('ic-prev')?.addEventListener('click', () => changePage(-1));
    document.getElementById('ic-next')?.addEventListener('click', () => changePage(1));
    await load();
  }
  return true;
}

window.ManttoInstalacionesCerrados = {
  init:() => mount(false),
  reload:() => load()
};
})();
