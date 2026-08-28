(function(){
'use strict';
const API=(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
const state={page:1,pageSize:25,rows:[],totalPages:0,catalogs:{asesores:[],anios_perdidos:[],razones_perdido:[]},initialized:false};
const $=(s,r=document)=>r.querySelector(s);
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const fmtDate=v=>{if(!v)return '—';const raw=String(v).trim();const iso=raw.slice(0,10);const d=new Date(iso+'T12:00:00');return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'});};
const headers=()=>Object.assign({'Accept':'application/json'},window.ManttoAuth?.authHeaders?window.ManttoAuth.authHeaders():{});
async function request(path){const r=await fetch(API+path,{cache:'no-store',headers:headers()});const t=await r.text();let j={};try{j=t?JSON.parse(t):{};}catch(_){throw new Error('El backend respondió contenido no JSON.');}if(!r.ok||j.ok===false)throw new Error(j.message||j.error||('Error HTTP '+r.status));return j;}
const CATALOG_CACHE_MS=5*60*1000;
function catalogRequest(path){return window.ManttoHttp&&typeof window.ManttoHttp.get==='function'?window.ManttoHttp.get(path,{cacheTtlMs:CATALOG_CACHE_MS,cacheKey:'catalog:'+path}):request(path);}
function setStatus(text,error=false){const el=$('#vp-status');if(!el)return;el.className='vp-status'+(error?' error':'');el.innerHTML='<i></i><span>'+esc(text)+'</span>';}
function toast(text,error=false){const el=$('#vp-toast');if(!el)return;el.textContent=text;el.className='vp-toast show'+(error?' error':'');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.className='vp-toast',2600);}
function personOption(p){const id=p.id_SB??p.id_usuario??p.id;const label=(p.iniciales?p.iniciales+' · ':'')+(p.nombre||('Usuario '+id));return '<option value="'+esc(id)+'">'+esc(label)+'</option>';}
function fillCatalogs(){const now=new Date().getFullYear();const years=[...new Set((state.catalogs.anios_perdidos||[]).map(Number).filter(Boolean))].sort((a,b)=>b-a);if(!years.includes(now))years.unshift(now);$('#vp-filter-year').innerHTML='<option value="todos">Todos</option>'+years.map(y=>'<option value="'+y+'">'+y+'</option>').join('');$('#vp-filter-year').value=String(now);$('#vp-filter-advisor').innerHTML='<option value="">Todos</option>'+(state.catalogs.asesores||[]).map(personOption).join('');$('#vp-filter-reason').innerHTML='<option value="">Todas</option>'+(state.catalogs.razones_perdido||[]).map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');$('#vp-filter-advisor-wrap').hidden=(state.catalogs.asesores||[]).length<=1;}
function query(){const q=new URLSearchParams({page:String(state.page),page_size:String(state.pageSize)});const search=$('#vp-search').value.trim();const year=$('#vp-filter-year').value;const advisor=$('#vp-filter-advisor').value;const reason=$('#vp-filter-reason').value;if(search)q.set('search',search);if(year)q.set('anio',year);if(advisor)q.set('id_asesor',advisor);if(reason)q.set('razon_perdido',reason);return q.toString();}
function renderKpis(summary={}){const total=Number(summary.total_cotizaciones||0), equipos=Number(summary.total_equipos||0), con=Number(summary.con_razon||0), sin=Number(summary.sin_razon||0);const data=[['Cotizaciones perdidas',total,'Registros con estatus Perdido','red'],['Equipos perdidos',equipos,'Equipos incluidos en pérdidas','amber'],['Con razón registrada',con,'Pérdidas documentadas','purple'],['Sin razón registrada',sin,'Pendientes de documentar','blue']];$('#vp-kpis').innerHTML=data.map(([l,v,m,c])=>'<article class="vp-kpi '+c+'"><div class="label">'+esc(l)+'</div><div class="value">'+v.toLocaleString('es-MX')+'</div><div class="meta">'+esc(m)+'</div></article>').join('');}

function recordIndicators(row){
  const source=row||{};
  const codes=[];
  const visual=Array.isArray(source.estados_visuales)?source.estados_visuales:[];
  const visualCodes=visual.map(item=>String(typeof item==='string'?item:(item&&item.codigo)||'').toUpperCase());
  const isNew=source.es_nuevo===true||Number(source.es_nuevo||source.nuevo||source.no_visto||0)>0||visualCodes.includes('NUEVO');
  const hasNewComment=source.comentario_nuevo===true||Number(source.comentarios_nuevos||source.comentario_nuevo||source.tiene_comentario_nuevo||0)>0||visualCodes.includes('COMENTARIO_NUEVO');
  if(isNew)codes.push('NUEVO');
  if(hasNewComment)codes.push('COMENTARIO_NUEVO');
  if(window.EstadosVisuales_gnral&&typeof window.EstadosVisuales_gnral.renderMany==='function')return window.EstadosVisuales_gnral.renderMany(codes,{empty:''});
  return (isNew?'🆕 ':'')+(hasNewComment?'💬':'');
}
function renderRows(){
  const body=$('#vp-body');
  if(!state.rows.length){body.innerHTML='<tr><td colspan="9" class="vp-empty">No hay cotizaciones perdidas para los filtros seleccionados.</td></tr>';return;}
  body.innerHTML=state.rows.map(r=>{
    const indicators=recordIndicators(r);
    return '<tr data-view="'+esc(r.id_cotizacion)+'">'
      +'<td><span class="vp-project">'+(indicators?indicators+' ':'')+esc(r.nombre_proyecto||'Sin proyecto')+'</span></td>'
      +'<td>'+esc(r.cliente||'—')+'</td>'
      +'<td>'+esc(r.asesor||'—')+'</td>'
      +'<td><span class="vp-reason">'+esc(r.razon_perdido||'Sin razón registrada')+'</span></td>'
      +'<td>'+esc(r.empresa_vs_perdido||'—')+'</td>'
      +'<td>'+Number(r.numero_equipos||0).toLocaleString('es-MX')+'</td>'
      +'<td>'+fmtDate(r.fecha_cambio_estatus)+'</td>'
      +'<td>'+esc(r.ciudad||'—')+'</td>'
      +'<td>'+esc(r.estado||'—')+'</td>'
      +'</tr>';
  }).join('');
}
function renderPagination(p={}){state.totalPages=Number(p.total_paginas||0);const el=$('#vp-pagination');const total=Number(p.total_registros||0);if(!total){el.innerHTML='';return;}const pages=[];for(let i=Math.max(1,state.page-2);i<=Math.min(state.totalPages,state.page+2);i++)pages.push('<button class="'+(i===state.page?'active':'')+'" data-page="'+i+'">'+i+'</button>');el.innerHTML='<span>'+total.toLocaleString('es-MX')+' pérdidas</span><div class="pages"><button data-page="'+Math.max(1,state.page-1)+'">‹</button>'+pages.join('')+'<button data-page="'+Math.min(state.totalPages,state.page+1)+'">›</button></div>';}
async function loadCatalogs(){const j=await catalogRequest('/api/ventas/cotizaciones/catalogos');state.catalogs=Object.assign({},j.catalogos||{});fillCatalogs();}
async function load(){setStatus('Consultando Aiven');$('#vp-body').innerHTML='<tr><td colspan="9" class="vp-loader">Cargando pérdidas...</td></tr>';try{const j=await request('/api/ventas/cotizaciones/perdidos?'+query());state.rows=j.cotizaciones||[];renderKpis(j.resumen||{});renderRows();renderPagination(j.paginacion||{});setStatus('Aiven conectado · '+Number(j.paginacion?.total_registros||0).toLocaleString('es-MX')+' pérdidas');}catch(e){state.rows=[];renderRows();renderKpis({});setStatus('Error de conexión: '+e.message,true);toast(e.message,true);}}
function goToDetail(id){const quoteId=Number(id);if(!quoteId)return toast('La cotización no tiene un identificador válido.',true);window.ManttoRouter?.go?.('ventas-cotizaciones-detalle',{id:quoteId});}
function bind(){let timer;$('#vp-search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{state.page=1;load();},350);});['vp-filter-year','vp-filter-advisor','vp-filter-reason'].forEach(id=>$('#'+id)?.addEventListener('change',()=>{state.page=1;load();}));$('#vp-clear').addEventListener('click',()=>{$('#vp-search').value='';$('#vp-filter-year').value=String(new Date().getFullYear());$('#vp-filter-advisor').value='';$('#vp-filter-reason').value='';state.page=1;load();});$('#vp-refresh').addEventListener('click',load);$('#vp-body').addEventListener('click',e=>{const target=e.target.closest('[data-view]');if(target)goToDetail(target.dataset.view);});$('#vp-pagination').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(!b)return;state.page=Number(b.dataset.page)||1;load();});}
async function init(){const view=$('#view-ventas-perdidos');if(!view)return;if(!view.dataset.loaded){const r=await fetch('./modules/ventas-perdidos/ventas-perdidos.html',{cache:'default'});if(!r.ok)throw new Error('No se pudo cargar la vista Perdidos.');view.innerHTML=await r.text();view.dataset.loaded='1';bind();await loadCatalogs();}await load();state.initialized=true;}
window.ManttoVentasPerdidos={init,refresh:load};
})();
