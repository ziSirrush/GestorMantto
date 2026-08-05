(function(){
'use strict';
const API=(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
const state={page:1,pageSize:25,total:0,totalPages:1,rows:[],kpis:null,catalogs:{tipo_cliente:[],estatus_cliente:[],estado:[],iniciales:[]}};
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const esc=value=>String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const slug=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const fmt=value=>new Intl.NumberFormat('es-MX').format(Number(value||0));
const headers=()=>Object.assign({'Accept':'application/json'},window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{});
async function request(path){const response=await fetch(API+path,{cache:'no-store',headers:headers()});const text=await response.text();let json={};try{json=text?JSON.parse(text):{};}catch(error){throw new Error('El backend respondió contenido no JSON.');}if(!response.ok||json.ok===false)throw new Error(json.message||json.error||('Error HTTP '+response.status));return json;}
function toast(message,error=false){const el=$('#vcl-toast');if(!el)return;el.textContent=message;el.className='vcl-toast show'+(error?' error':'');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.className='vcl-toast',2800);}
function setStatus(text,type='ok'){const el=$('#vcl-status');if(!el)return;el.className='vcl-status'+(type==='error'?' error':'');el.innerHTML='<i></i><span>'+esc(text)+'</span>';}
function query(){const params=new URLSearchParams({page:String(state.page),page_size:String(state.pageSize)});const search=$('#vcl-search')?.value.trim();const type=$('#vcl-filter-type')?.value;const status=$('#vcl-filter-status')?.value;const region=$('#vcl-filter-state')?.value;const advisor=$('#vcl-filter-advisor')?.value;if(search)params.set('search',search);if(type)params.set('tipo_cliente',type);if(status)params.set('estatus_cliente',status);if(region)params.set('estado',region);if(advisor)params.set('iniciales',advisor);return params.toString();}
function fillSelect(selector,values,label){const el=$(selector);if(!el)return;const current=el.value;el.innerHTML='<option value="">'+esc(label)+'</option>'+[...new Set((values||[]).filter(Boolean))].map(value=>'<option value="'+esc(value)+'">'+esc(value)+'</option>').join('');if([...el.options].some(option=>option.value===current))el.value=current;}
async function loadCatalogs(){try{const json=await request('/api/ventas/clientes/catalogos');state.catalogs=json.catalogos||{};fillSelect('#vcl-filter-type',state.catalogs.tipo_cliente,'Todos');fillSelect('#vcl-filter-status',state.catalogs.estatus_cliente,'Todos');fillSelect('#vcl-filter-state',state.catalogs.estado,'Todos');fillSelect('#vcl-filter-advisor',state.catalogs.iniciales,'Todos');const wrap=$('#vcl-filter-advisor-wrap');if(wrap)wrap.hidden=!Array.isArray(state.catalogs.iniciales)||state.catalogs.iniciales.length<=1;}catch(error){setStatus('Error de conexión con la API: '+error.message,'error');toast('No se pudieron cargar los filtros reales.',true);}}
async function loadKpis(){try{const json=await request('/api/ventas/clientes/kpis?'+query());state.kpis=json.kpis||{};}catch(error){state.kpis=null;setStatus('Error de conexión con la API: '+error.message,'error');}renderKpis();}
function renderKpis(){const k=state.kpis||{};const cards=[['Total clientes',k.total_clientes,'Registros visibles','blue'],['Con estatus',k.con_estatus,'Seguimiento comercial definido','green'],['Proyecto vendido',k.con_proyecto_vendido,'Clientes con proyecto registrado','amber'],['Tipos de cliente',k.tipos_cliente,'Clasificaciones visibles','purple'],['Estados',k.estados,'Cobertura geográfica','teal']];const box=$('#vcl-kpis');if(box)box.innerHTML=cards.map(card=>'<article class="vcl-kpi '+card[3]+'"><div class="label">'+esc(card[0])+'</div><div class="value">'+fmt(card[1])+'</div><div class="meta">'+esc(card[2])+'</div></article>').join('');}

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
function rowHtml(row){
  const place=[row.ciudad,row.estado].filter(Boolean).join(' · ')||'—';
  const indicators=recordIndicators(row);
  return '<tr data-client="'+esc(row.id_cliente)+'">'
    +'<td><span class="vcl-client">'+(indicators?indicators+' ':'')+esc(row.nombre_empresa||'Sin nombre')+'</span><span class="vcl-sub">'+esc(row.razon_social||'')+'</span></td>'
    +'<td><strong>'+esc(row.iniciales||'—')+'</strong></td>'
    +'<td>'+esc(place)+'</td>'
    +'<td><span class="vcl-pill '+slug(row.tipo_cliente)+'">'+esc(row.tipo_cliente||'Sin tipo')+'</span></td>'
    +'<td class="vcl-num">'+fmt(row.cotizaciones||0)+'</td>'
    +'<td class="vcl-num">'+fmt(row.en_proceso||0)+'</td>'
    +'<td class="vcl-num">'+fmt(row.vendidas||0)+'</td>'
    +'<td class="vcl-num">'+fmt(row.perdidas||0)+'</td>'
    +'</tr>';
}
async function loadList(){const body=$('#vcl-list-body');if(!body)return;body.innerHTML='<tr><td colspan="8" class="vcl-loader">Cargando clientes desde Aiven...</td></tr>';try{const json=await request('/api/ventas/clientes?'+query());state.rows=Array.isArray(json.data)?json.data:[];state.page=Number(json.pagination?.page||1);state.total=Number(json.pagination?.total||state.rows.length);state.totalPages=Number(json.pagination?.total_pages||1);setStatus('Aiven conectado · '+fmt(state.total)+' registros');body.innerHTML=state.rows.length?state.rows.map(rowHtml).join(''):'<tr><td colspan="8" class="vcl-empty">No hay clientes para los criterios seleccionados.</td></tr>';}catch(error){state.rows=[];state.total=0;state.totalPages=1;setStatus('Error de conexión con la API: '+error.message,'error');body.innerHTML='<tr><td colspan="8" class="vcl-empty">No fue posible consultar Clientes. '+esc(error.message)+'</td></tr>';}bindRows();renderPagination();}
function bindRows(){$$('[data-client]').forEach(row=>{row.onclick=()=>window.ManttoRouter?.go?.('ventas-clientes-detalle',{id:Number(row.dataset.client)});row.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();row.click();}};row.tabIndex=0;});}
function renderPagination(){const el=$('#vcl-pagination');if(!el)return;const start=state.total?((state.page-1)*state.pageSize)+1:0;const end=Math.min(state.page*state.pageSize,state.total);el.innerHTML='<span>'+fmt(start)+'–'+fmt(end)+' de '+fmt(state.total)+'</span><div class="pages"><button id="vcl-prev" '+(state.page<=1?'disabled':'')+'>←</button><button class="active">Página '+state.page+' de '+Math.max(1,state.totalPages)+'</button><button id="vcl-next" '+(state.page>=state.totalPages?'disabled':'')+'>→</button></div>';$('#vcl-prev').onclick=()=>{if(state.page>1){state.page--;loadAll();}};$('#vcl-next').onclick=()=>{if(state.page<state.totalPages){state.page++;loadAll();}};}
async function loadAll(){await Promise.all([loadKpis(),loadList()]);}
function bind(){let timer;$('#vcl-refresh').onclick=()=>loadAll();$('#vcl-new').onclick=()=>window.ManttoRouter?.go?.('ventas-clientes-nuevo');$('#vcl-search').oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{state.page=1;loadAll();},350);};['#vcl-filter-type','#vcl-filter-status','#vcl-filter-state','#vcl-filter-advisor'].forEach(selector=>$(selector).onchange=()=>{state.page=1;loadAll();});$('#vcl-clear').onclick=()=>{$('#vcl-search').value='';['#vcl-filter-type','#vcl-filter-status','#vcl-filter-state','#vcl-filter-advisor'].forEach(selector=>$(selector).value='');state.page=1;loadAll();};}
async function mount(force=false){const view=$('#view-ventas-clientes');if(!view)return false;if(force)view.dataset.ready='0';if(view.dataset.ready!=='1'){const response=await fetch('./modules/ventas-clientes/ventas-clientes.html?v=20260729-fase3-v003',{cache:'no-store'});if(!response.ok)throw new Error('No se pudo cargar el módulo Clientes.');view.innerHTML=await response.text();view.dataset.ready='1';bind();await loadCatalogs();await loadAll();}return true;}
window.ManttoVentasClientes={init:(payload)=>mount(Boolean(payload?.createdClientId)),reload:()=>loadAll()};
})();
