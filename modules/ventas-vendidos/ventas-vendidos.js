(function(){
'use strict';
const API=(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
const state={page:1,pageSize:25,rows:[],totalPages:0,catalogs:{asesores:[],administrativos:[],zonas:[],anios_cierre:[]},visibility:{acceso_total:false},initialized:false};
const $=(s,r=document)=>r.querySelector(s);const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const fmtDate=v=>{if(!v)return '—';const d=new Date(String(v).slice(0,10)+'T12:00:00');return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'});};
const headers=()=>Object.assign({'Accept':'application/json'},window.ManttoAuth?.authHeaders?window.ManttoAuth.authHeaders():{});
async function request(path){const r=await fetch(API+path,{cache:'no-store',headers:headers()});const t=await r.text();let j={};try{j=t?JSON.parse(t):{};}catch(_){throw new Error('El backend respondió contenido no JSON.');}if(!r.ok||j.ok===false)throw new Error(j.message||j.error||('Error HTTP '+r.status));return j;}
function setStatus(text,error=false){const el=$('#vv-status');if(!el)return;el.className='vv-status'+(error?' error':'');el.innerHTML='<i></i><span>'+esc(text)+'</span>';}
function toast(text,error=false){const el=$('#vv-toast');if(!el)return;el.textContent=text;el.className='vv-toast show'+(error?' error':'');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.className='vv-toast',2600);}
function personOption(p){const id=p.id_SB??p.id_usuario??p.id;const label=(p.iniciales?p.iniciales+' · ':'')+(p.nombre||('Usuario '+id));return '<option value="'+esc(id)+'">'+esc(label)+'</option>';}
function fillCatalogs(){const now=new Date().getFullYear();const years=[...new Set((state.catalogs.anios_cierre||[]).map(Number).filter(Boolean))].sort((a,b)=>b-a);if(!years.includes(now))years.unshift(now);$('#vv-filter-year').innerHTML='<option value="todos">Todos</option>'+years.map(y=>'<option value="'+y+'">'+y+'</option>').join('');$('#vv-filter-year').value=String(now);$('#vv-filter-advisor').innerHTML='<option value="">Todos</option>'+(state.catalogs.asesores||[]).map(personOption).join('');$('#vv-filter-admin').innerHTML='<option value="">Todos</option>'+(state.catalogs.administrativos||[]).map(personOption).join('');$('#vv-filter-zone').innerHTML='<option value="">Todas</option>'+(state.catalogs.zonas||[]).map(z=>'<option value="'+esc(z.zona??z)+'">'+esc(z.zona??z)+'</option>').join('');const full=Boolean(state.visibility.acceso_total);$('#vv-filter-advisor-wrap').hidden=!full;$('#vv-filter-admin-wrap').hidden=!full;}
function query(){const q=new URLSearchParams({page:String(state.page),page_size:String(state.pageSize)});const search=$('#vv-search').value.trim();const year=$('#vv-filter-year').value;const advisor=state.visibility.acceso_total?$('#vv-filter-advisor').value:'';const admin=state.visibility.acceso_total?$('#vv-filter-admin').value:'';const zone=$('#vv-filter-zone').value;if(search)q.set('search',search);if(year)q.set('anio',year);if(advisor)q.set('id_asesor',advisor);if(admin)q.set('id_admin',admin);if(zone)q.set('zona',zone);return q.toString();}
function renderKpis(summary={}){const data=[['Ventas cerradas',summary.total_cotizaciones||0,'Registros con estatus Vendido','green'],['Equipos vendidos',summary.total_equipos||0,'Equipos incluidos en ventas','blue'],['Con fecha de cierre',summary.con_fecha_cierre||0,'Vendidos con fecha en el periodo','purple'],['Sin fecha de cierre',summary.sin_fecha_cierre||0,'Vendidos sin fecha · control global','amber']];$('#vv-kpis').innerHTML=data.map(([l,v,m,c])=>'<article class="vv-kpi '+c+'"><div class="label">'+esc(l)+'</div><div class="value">'+Number(v).toLocaleString('es-MX')+'</div><div class="meta">'+esc(m)+'</div></article>').join('');}
function resolveQuoteId(row){const candidates=[row?.id_cotizacion,row?.idCotizacion,row?.cotizacion_id,row?.id_cotizacion_cor,row?.id];for(const value of candidates){const id=Number(value);if(Number.isInteger(id)&&id>0)return id;}return null;}

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
  const body=$('#vv-body');
  if(!state.rows.length){body.innerHTML='<tr><td colspan="8" class="vv-empty">No hay ventas para los filtros seleccionados.</td></tr>';return;}
  body.innerHTML=state.rows.map((r,index)=>{
    const quoteId=resolveQuoteId(r);
    const viewAttr=quoteId?' data-view="'+esc(quoteId)+'"':'';
    const indicators=recordIndicators(r);
    return '<tr data-row-index="'+index+'"'+viewAttr+'>'
      +'<td><button class="vv-project vv-project-link"'+viewAttr+' data-row-index="'+index+'" type="button">'+(indicators?indicators+' ':'')+esc(r.nombre_proyecto||'Sin proyecto')+'</button></td>'
      +'<td>'+esc(r.cliente||'—')+'</td>'
      +'<td>'+esc(r.asesor||'—')+'</td>'
      +'<td>'+fmtDate(r.fecha_cierre)+'</td>'
      +'<td>'+Number(r.numero_equipos||0).toLocaleString('es-MX')+'</td>'
      +'<td>'+fmtDate(r.fecha_cotizacion||r.fecha_solicitud)+'</td>'
      +'<td>'+esc(r.ciudad||'—')+'</td>'
      +'<td>'+esc(r.estado||'—')+'</td>'
      +'</tr>';
  }).join('');
}
function renderPagination(p={}){state.totalPages=Number(p.total_paginas||0);const el=$('#vv-pagination');const total=Number(p.total_registros||0);if(!total){el.innerHTML='';return;}const pages=[];for(let i=Math.max(1,state.page-2);i<=Math.min(state.totalPages,state.page+2);i++)pages.push('<button class="'+(i===state.page?'active':'')+'" data-page="'+i+'">'+i+'</button>');el.innerHTML='<span>'+total.toLocaleString('es-MX')+' ventas</span><div class="pages"><button data-page="'+Math.max(1,state.page-1)+'">‹</button>'+pages.join('')+'<button data-page="'+Math.min(state.totalPages,state.page+1)+'">›</button></div>';}
async function loadCatalogs(){const j=await request('/api/ventas/cotizaciones/catalogos');state.catalogs=Object.assign({},j.catalogos||{}, {anios_cierre:j.catalogos?.anios_cierre||[]});state.visibility=Object.assign({acceso_total:false},j.visibilidad||{});fillCatalogs();}
async function load(){setStatus('Consultando Aiven');$('#vv-body').innerHTML='<tr><td colspan="8" class="vv-loader">Cargando ventas...</td></tr>';try{const j=await request('/api/ventas/cotizaciones/vendidos?'+query());state.rows=j.cotizaciones||[];renderKpis(j.resumen||{});renderRows();renderPagination(j.paginacion||{});setStatus('Aiven conectado · '+Number(j.paginacion?.total_registros||0).toLocaleString('es-MX')+' ventas');}catch(e){state.rows=[];renderRows();renderKpis({});setStatus('Error de conexión: '+e.message,true);toast(e.message,true);}}
function openDetail(id,rowIndex){let quoteId=Number(id);if(!Number.isInteger(quoteId)||quoteId<=0){const row=state.rows[Number(rowIndex)];quoteId=resolveQuoteId(row);}if(!Number.isInteger(quoteId)||quoteId<=0){console.error('[Ventas Vendidos] Registro sin id_cotizacion válido:',state.rows[Number(rowIndex)]||null);toast('La venta no incluye el ID interno de la cotización.',true);return;}if(!window.ManttoRouter?.go){toast('No se pudo abrir el detalle de cotización.',true);return;}window.ManttoRouter.go('ventas-cotizaciones-detalle',{id:quoteId,id_cotizacion:quoteId,origen:'ventas-vendidos'});}
function bind(){let timer;$('#vv-search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{state.page=1;load();},350);});['vv-filter-year','vv-filter-advisor','vv-filter-admin','vv-filter-zone'].forEach(id=>$('#'+id)?.addEventListener('change',()=>{state.page=1;load();}));$('#vv-clear').addEventListener('click',()=>{$('#vv-search').value='';$('#vv-filter-year').value=String(new Date().getFullYear());$('#vv-filter-advisor').value='';$('#vv-filter-admin').value='';$('#vv-filter-zone').value='';state.page=1;load();});$('#vv-refresh').addEventListener('click',load);$('#vv-body').addEventListener('click',e=>{const target=e.target.closest('[data-view], tr[data-row-index]');if(!target)return;const rowIndex=target.dataset.rowIndex??target.closest('tr')?.dataset.rowIndex;openDetail(target.dataset.view,rowIndex);});$('#vv-pagination').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(!b)return;state.page=Number(b.dataset.page)||1;load();});}
async function init(){const view=$('#view-ventas-vendidos');if(!view)return;if(!view.dataset.loaded){const r=await fetch('./modules/ventas-vendidos/ventas-vendidos.html',{cache:'no-store'});if(!r.ok)throw new Error('No se pudo cargar la vista Vendidos.');view.innerHTML=await r.text();view.dataset.loaded='1';bind();await loadCatalogs();}await load();state.initialized=true;}
window.ManttoVentasVendidos={init,refresh:load};
})();
