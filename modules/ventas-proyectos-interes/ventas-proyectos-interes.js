(function(){
'use strict';

if(window.ManttoVentasProyectosInteres) return;

const API=(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
const PAGE_SIZE=30;
const state={page:1,total:0,totalPages:0,rows:[],search:'',initialized:false,requestToken:0};
const $=(selector,root=document)=>root.querySelector(selector);
const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const fmtDate=value=>{if(!value)return '—';const raw=String(value).slice(0,10);const d=new Date(raw+'T12:00:00');return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'});};
const fmtDateTime=value=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});};
const authHeaders=()=>Object.assign({'Accept':'application/json'},window.ManttoAuth?.authHeaders?window.ManttoAuth.authHeaders():{});

function template(){return `<div class="vpi-page" id="vpi-page">
  <section class="vpi-head vpi-card"><div><p class="vpi-eyebrow">Ventas · Lista personal</p><h1>Proyectos de interés</h1><p>Las cotizaciones que marcaste como Proyecto de interés desde su detalle. Esta lista es personal y respeta tu alcance comercial.</p></div><button class="vpi-btn" id="vpi-refresh" type="button">↻ Actualizar</button></section>
  <section class="vpi-summary"><article class="vpi-kpi vpi-card"><span>Proyectos marcados</span><strong id="vpi-total">0</strong><small>Solo tus marcados activos y todavía visibles para tu usuario.</small></article><article class="vpi-help vpi-card"><strong>¿Cómo agregar o quitar proyectos?</strong><span>Abre el detalle de una cotización y usa el check “Proyecto de interés”.</span></article></section>
  <section class="vpi-workspace vpi-card"><div class="vpi-toolbar"><label class="vpi-search"><span>Buscar</span><input id="vpi-search" type="search" autocomplete="off" placeholder="Proyecto, cliente, estatus, asesor, ciudad o ID..."></label><div class="vpi-status" id="vpi-status" aria-live="polite">Listo para consultar.</div></div><div class="vpi-table-wrap"><table class="vpi-table"><thead><tr><th>Proyecto</th><th>Cliente</th><th>Estatus</th><th>Equipos</th><th>Fecha cotización</th><th>Marcado</th><th>Ciudad / Estado</th><th>Acción</th></tr></thead><tbody id="vpi-body"></tbody></table></div><div class="vpi-pagination" id="vpi-pagination"></div></section>
</div>`;}

function ensureMarkup(){
  const view=$('#view-ventas-proyectos-interes');
  if(!view)return false;
  if(!$('#vpi-page',view))view.innerHTML=template();
  return true;
}

function setStatus(text,error=false){const el=$('#vpi-status');if(!el)return;el.textContent=text;el.classList.toggle('error',Boolean(error));}

async function request(path){
  const response=await fetch(API+path,{headers:authHeaders(),cache:'no-store'});
  const text=await response.text();
  let json={};
  try{json=text?JSON.parse(text):{};}catch(_error){throw new Error('El backend respondió contenido no JSON.');}
  if(!response.ok||json.ok===false)throw new Error(json.message||json.error||('Error HTTP '+response.status));
  return json;
}

function resolveId(row){const value=Number(row?.id_cotizacion);return Number.isInteger(value)&&value>0?value:null;}
function openDetail(id){
  const quoteId=Number(id);
  if(!Number.isInteger(quoteId)||quoteId<=0)return;
  if(!window.ManttoRouter?.go){setStatus('No se pudo abrir el detalle de cotización.',true);return;}
  window.ManttoRouter.go('ventas-cotizaciones-detalle',{id:quoteId,id_cotizacion:quoteId,origen:'ventas-proyectos-interes'});
}

function rowHtml(row){
  const id=resolveId(row);
  const place=[row.ciudad,row.estado].filter(Boolean).join(' / ')||'—';
  return `<tr data-id="${id||''}" ${id?'tabindex="0" role="link"':''}>
    <td><span class="vpi-project">${esc(row.nombre_proyecto||'Sin proyecto')}</span><span class="vpi-id">Cotización ${esc(id||'—')}</span></td>
    <td>${esc(row.cliente||'—')}</td>
    <td><span class="vpi-status-pill">${esc(row.estatus_proyecto||'Sin estatus')}</span></td>
    <td>${Number(row.numero_equipos||0).toLocaleString('es-MX')}</td>
    <td>${fmtDate(row.fecha_cotizacion)}</td>
    <td>${fmtDateTime(row.fecha_interes)}</td>
    <td>${esc(place)}</td>
    <td>${id?`<button class="vpi-open" type="button" data-open="${id}">Abrir detalle</button>`:'—'}</td>
  </tr>`;
}

function render(){
  const body=$('#vpi-body');
  const total=$('#vpi-total');
  if(total)total.textContent=state.total.toLocaleString('es-MX');
  if(body){
    body.innerHTML=state.rows.length
      ? state.rows.map(rowHtml).join('')
      : '<tr class="vpi-empty"><td colspan="8"><strong>No hay proyectos de interés en esta consulta.</strong><br>Marca una cotización desde su detalle para agregarla a tu lista personal.</td></tr>';
  }
  renderPagination();
}

function renderPagination(){
  const box=$('#vpi-pagination');
  if(!box)return;
  if(state.totalPages<=1){box.innerHTML=state.total?`<span>${state.total.toLocaleString('es-MX')} registro${state.total===1?'':'s'}</span>`:'';return;}
  const start=Math.max(1,state.page-2);const end=Math.min(state.totalPages,state.page+2);const parts=[];
  parts.push(`<button type="button" data-page="${Math.max(1,state.page-1)}" ${state.page<=1?'disabled':''}>‹</button>`);
  for(let page=start;page<=end;page++)parts.push(`<button type="button" data-page="${page}" class="${page===state.page?'active':''}">${page}</button>`);
  parts.push(`<button type="button" data-page="${Math.min(state.totalPages,state.page+1)}" ${state.page>=state.totalPages?'disabled':''}>›</button>`);
  parts.push(`<span>Página ${state.page} de ${state.totalPages} · ${state.total.toLocaleString('es-MX')} registros</span>`);
  box.innerHTML=parts.join('');
}

async function load(options={}){
  if(!ensureMarkup())return;
  if(options.resetPage)state.page=1;
  state.search=$('#vpi-search')?.value.trim()||'';
  const token=++state.requestToken;
  setStatus('Consultando proyectos de interés...');
  const body=$('#vpi-body');if(body)body.innerHTML='<tr class="vpi-empty"><td colspan="8">Cargando...</td></tr>';
  const params=new URLSearchParams({pagina:String(state.page),tamano_pagina:String(PAGE_SIZE)});
  if(state.search)params.set('buscar',state.search);
  try{
    const json=await request('/api/ventas/cotizaciones/proyectos-interes?'+params.toString());
    if(token!==state.requestToken)return;
    state.rows=Array.isArray(json.data)?json.data:[];
    state.total=Number(json.total??json.paginacion?.total??state.rows.length)||0;
    state.page=Number(json.paginacion?.pagina||state.page)||1;
    state.totalPages=Number(json.paginacion?.total_paginas||0)||0;
    render();
    setStatus(`${state.total.toLocaleString('es-MX')} proyecto${state.total===1?'':'s'} de interés.`);
  }catch(error){
    if(token!==state.requestToken)return;
    state.rows=[];state.total=0;state.totalPages=0;render();setStatus(error.message||'No se pudo cargar la lista.',true);
  }
}

function bind(){
  const refresh=$('#vpi-refresh');
  if(refresh&&!refresh.dataset.bound){refresh.dataset.bound='1';refresh.addEventListener('click',()=>load());}
  const search=$('#vpi-search');
  if(search&&!search.dataset.bound){search.dataset.bound='1';search.addEventListener('input',()=>{clearTimeout(bind.searchTimer);bind.searchTimer=setTimeout(()=>load({resetPage:true}),280);});}
  const pageBox=$('#vpi-pagination');
  if(pageBox&&!pageBox.dataset.bound){pageBox.dataset.bound='1';pageBox.addEventListener('click',event=>{const button=event.target.closest('[data-page]');if(!button||button.disabled)return;const page=Number(button.dataset.page);if(Number.isInteger(page)&&page>0&&page!==state.page){state.page=page;load();}});}
  const body=$('#vpi-body');
  if(body&&!body.dataset.bound){
    body.dataset.bound='1';
    body.addEventListener('click',event=>{const button=event.target.closest('[data-open]');if(button){event.stopPropagation();openDetail(button.dataset.open);return;}const row=event.target.closest('tr[data-id]');if(row?.dataset.id)openDetail(row.dataset.id);});
    body.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;const row=event.target.closest('tr[data-id]');if(!row?.dataset.id)return;event.preventDefault();openDetail(row.dataset.id);});
  }
}

async function init(){
  if(!ensureMarkup())return;
  bind();
  await load();
  state.initialized=true;
}

window.addEventListener('mantto:ventas-cotizacion-actualizada',event=>{
  if(!state.initialized)return;
  const detail=event?.detail||{};
  if(detail.tipo!=='proyecto_interes'&&!Object.prototype.hasOwnProperty.call(detail,'proyecto_interes'))return;
  const current=window.ManttoRouter?.getCurrent?.();
  if(current?.route==='ventas-proyectos-interes')load();
});

window.ManttoVentasProyectosInteres=Object.freeze({init,refresh:()=>load()});
})();
