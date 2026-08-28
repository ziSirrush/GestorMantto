(function(){
'use strict';
const API=(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
const state={id:null,cliente:null,contactos:[],cotizaciones:[],page:1,total:0,totalPages:1,year:'todos',years:[],quoteKpis:{},mode:null,editingContact:null,catalogos:{estados:[],tipos:[],estatus:[],asesores:[]},assignmentMode:'SELF'};
const $=(s,r=document)=>r.querySelector(s);
const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const fmt=v=>new Intl.NumberFormat('es-MX').format(Number(v||0));
const headers=(json=false)=>Object.assign({'Accept':'application/json'},json?{'Content-Type':'application/json'}:{},window.ManttoAuth?.authHeaders?.()||{});
async function req(path,opts={}){const r=await fetch(API+path,Object.assign({cache:'no-store',headers:headers(Boolean(opts.body))},opts));const t=await r.text();let j={};try{j=t?JSON.parse(t):{};}catch(e){throw new Error('El backend respondió contenido no JSON.');}if(!r.ok||j.ok===false)throw new Error(j.message||j.error||('Error HTTP '+r.status));return j;}
const CATALOG_CACHE_MS=5*60*1000;
function catalogReq(path){return window.ManttoHttp&&typeof window.ManttoHttp.get==='function'?window.ManttoHttp.get(path,{cacheTtlMs:CATALOG_CACHE_MS,cacheKey:'catalog:'+path}):req(path);}
function toast(m,e=false){const el=$('#vcd-toast');if(!el)return;el.textContent=m;el.className='vcd-toast show'+(e?' error':'');clearTimeout(toast.t);toast.t=setTimeout(()=>el.className='vcd-toast',2800);}
function val(v){return v||'—';}
function date(v){if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v).slice(0,10):d.toLocaleDateString('es-MX');}
function info(title,items){return '<div class="vcd-info"><h3>'+esc(title)+'</h3><dl>'+items.map(x=>'<dt>'+esc(x[0])+'</dt><dd>'+esc(val(x[1]))+'</dd>').join('')+'</dl></div>';}
function normalizeUpper(v){const s=String(v||'').trim();return s?s.toUpperCase():'';}
function uniqueOptions(values,{uppercase=false,valueKey='articulo',labelKey='articulo'}={}){const seen=new Set();const out=[];for(const item of values||[]){const rawValue=typeof item==='object'?(item[valueKey]??item.articulo??item.iniciales??item.nombre??''):item;const rawLabel=typeof item==='object'?(item[labelKey]??item.etiqueta??item.nombre??item.iniciales??rawValue):rawValue;if(rawValue==null||String(rawValue).trim()==='')continue;const value=uppercase?normalizeUpper(rawValue):String(rawValue).trim();const label=uppercase?normalizeUpper(rawLabel):String(rawLabel).trim();const key=value.toUpperCase();if(seen.has(key))continue;seen.add(key);out.push({value,label});}return out;}
function selectHtml(name,values,current,{required=false,uppercase=false,valueKey='articulo',labelKey='articulo'}={}){const rows=uniqueOptions(values,{uppercase,valueKey,labelKey});const selected=uppercase?normalizeUpper(current):String(current||'').trim();return '<select name="'+esc(name)+'" '+(required?'required':'')+'><option value="">Selecciona...</option>'+rows.map(row=>'<option value="'+esc(row.value)+'" '+(row.value===selected?'selected':'')+'>'+esc(row.label)+'</option>').join('')+'</select>';}
function parseCoordinates(value){const m=String(value||'').trim().match(/^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/);if(!m)return null;const lat=Number(m[1]),lng=Number(m[2]);return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;}
function updateEditMapLink(){const input=$('#vcd-location-input'),link=$('#vcd-location-map');if(!input||!link)return;const c=parseCoordinates(input.value);link.hidden=!c;if(c)link.href='https://www.google.com/maps?q='+encodeURIComponent(c.lat+','+c.lng);}
function captureEditLocation(){const button=$('#vcd-location-gps'),input=$('#vcd-location-input'),help=$('#vcd-location-help');if(!navigator.geolocation){toast('Este dispositivo o navegador no permite obtener la ubicación.',true);return;}button.disabled=true;button.textContent='Obteniendo…';if(help){help.classList.remove('error');help.textContent='Solicitando permiso de ubicación…';}navigator.geolocation.getCurrentPosition(pos=>{input.value=Number(pos.coords.latitude).toFixed(6)+', '+Number(pos.coords.longitude).toFixed(6);updateEditMapLink();if(help)help.textContent='Ubicación capturada con precisión aproximada de '+Math.round(pos.coords.accuracy||0)+' m.';toast('Ubicación del dispositivo capturada.');button.disabled=false;button.textContent='📍 Actualizar ubicación';},err=>{const messages={1:'No se autorizó el acceso a la ubicación.',2:'El dispositivo no pudo determinar la ubicación.',3:'La solicitud agotó el tiempo de espera.'};const msg=messages[err.code]||'No fue posible obtener la ubicación.';if(help){help.classList.add('error');help.textContent=msg+' Puedes conservar el valor actual.';}toast(msg,true);button.disabled=false;button.textContent='📍 Usar ubicación actual';},{enableHighAccuracy:true,timeout:15000,maximumAge:60000});}
function openQuoteDetail(id){const quoteId=Number(id);if(!quoteId)return toast('La cotización no tiene un identificador válido.',true);window.ManttoRouter?.go?.('ventas-cotizaciones-detalle',{id:quoteId});}
function renderClient(){const c=state.cliente||{};$('#vcd-title').textContent=c.nombre_empresa||'Cliente';$('#vcd-subtitle').textContent=[c.ciudad,c.estado,c.iniciales].filter(Boolean).join(' · ')||'Información comercial';$('#vcd-summary').innerHTML=info('Información comercial',[['Razón social',c.razon_social],['Tipo',c.tipo_cliente],['Estatus',normalizeUpper(c.estatus_cliente)||null],['Asesor',c.iniciales]])+info('Ubicación',[['Ciudad',c.ciudad],['Estado',c.estado],['Ubicación',c.ubicacion]])+info('Notas y control',[['Comentarios',c.comentarios],['Actualizado',date(c.updated_at)]]);}
function renderContacts(){const box=$('#vcd-contacts');if(!state.contactos.length){box.innerHTML='<div class="vcd-empty">Este cliente no tiene contactos activos.</div>';return;}box.innerHTML=state.contactos.map(c=>'<article class="vcd-contact '+(Number(c.contacto_principal)===1?'primary':'')+'">'+(Number(c.contacto_principal)===1?'<span class="badge">★ Principal</span>':'')+'<h3>'+esc(c.nombre_contacto)+'</h3><p><strong>Puesto:</strong> '+esc(val(c.puesto_contacto))+'</p><p>'+esc(val(c.email))+'</p><p>'+esc(val(c.telefono))+'</p><div class="vcd-contact-actions"><button data-edit-contact="'+c.id_contacto+'">Editar</button>'+(Number(c.contacto_principal)!==1?'<button data-main-contact="'+c.id_contacto+'">Marcar principal</button>':'')+'<button class="danger" data-delete-contact="'+c.id_contacto+'">Desactivar</button></div></article>').join('');box.querySelectorAll('[data-edit-contact]').forEach(b=>b.onclick=()=>openContact(Number(b.dataset.editContact)));box.querySelectorAll('[data-main-contact]').forEach(b=>b.onclick=()=>setPrincipal(Number(b.dataset.mainContact)));box.querySelectorAll('[data-delete-contact]').forEach(b=>b.onclick=()=>removeContact(Number(b.dataset.deleteContact)));}
function renderQuotes(){
  const rows=state.cotizaciones;
  $('#vcd-quotes').innerHTML=rows.length?rows.map(q=>'<tr class="vcd-quote-row" data-quote-id="'+esc(q.id_cotizacion)+'" tabindex="0" role="link"><td><strong class="vcd-quote-link">'+esc(q.nombre_proyecto||'Sin nombre')+'</strong><br><small>'+esc(q.mx||('MX'+String(q.id_cotizacion||'').padStart(6,'0')))+'</small></td><td><span class="vcd-pill">'+esc(q.estatus_proyecto||'Sin estatus')+'</span></td><td>'+fmt(q.numero_equipos)+'</td><td>'+esc(date(q.fecha_solicitud||q.fecha_cotizacion))+'</td><td>'+esc(date(q.fecha_cierre))+'</td><td>'+esc(q.asesor||'—')+'</td></tr>').join(''):'<tr><td colspan="6" class="vcd-empty">No hay cotizaciones relacionadas para el año seleccionado.</td></tr>';
  const k=state.quoteKpis||{};
  $('#vcd-kpis').innerHTML=[
    ['Cotizaciones',k.total_cotizaciones||0],
    ['En proceso',k.embudo_activo||k.total_embudo||0],
    ['Vendidas',k.vendidas||k.total_vendidas||0],
    ['Perdidas',k.perdidas||k.total_perdidas||0],
    ['Equipos cotizados',k.total_equipos||0],
    ['Equipos vendidos',k.equipos_vendidos||k.total_equipos_vendidos||0]
  ].map(x=>'<article class="vcd-kpi"><span>'+x[0]+'</span><strong>'+fmt(x[1])+'</strong></article>').join('');
  $('#vcd-pagination').innerHTML='<button id="vcd-prev" '+(state.page<=1?'disabled':'')+'>←</button><span>Página '+state.page+' de '+Math.max(1,state.totalPages)+'</span><button id="vcd-next" '+(state.page>=state.totalPages?'disabled':'')+'>→</button>';
  $('#vcd-prev').onclick=()=>{state.page--;loadQuotes();};
  $('#vcd-next').onclick=()=>{state.page++;loadQuotes();};
  $('#vcd-quotes').querySelectorAll('[data-quote-id]').forEach(row=>{row.onclick=()=>openQuoteDetail(row.dataset.quoteId);row.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openQuoteDetail(row.dataset.quoteId);}};});
}
function quoteFilters(){
  const c=state.cliente||{};
  const cliente=String(c.nombre_empresa||'').trim();
  const asesor=String(c.iniciales||'').trim();
  if(!cliente||!asesor)throw new Error('El cliente necesita nombre de empresa e iniciales para relacionar sus cotizaciones.');
  return {cliente,asesor};
}
function renderYearOptions(){
  const select=$('#vcd-year');
  if(!select)return;
  const current=String(state.year||'todos');
  select.innerHTML='<option value="todos">Todos</option>'+state.years.map(y=>'<option value="'+esc(y)+'">'+esc(y)+'</option>').join('');
  select.value=state.years.map(String).includes(current)?current:'todos';
  state.year=select.value;
}
async function loadClient(){const j=await req('/api/ventas/clientes/'+state.id);state.cliente=j.cliente;renderClient();}
async function loadContacts(){const j=await req('/api/ventas/clientes/'+state.id+'/contactos');state.contactos=Array.isArray(j.contactos)?j.contactos:(j.data||[]);renderContacts();}
async function loadQuotes(){
  const filters=quoteFilters();
  const params={cliente:filters.cliente,asesor:filters.asesor,anio:String(state.year||'todos')};
  const listParams=new URLSearchParams({...params,page:String(state.page),page_size:'20'});
  const kpiParams=new URLSearchParams(params);
  const [list,kpis]=await Promise.all([
    req('/api/ventas/cotizaciones?'+listParams),
    req('/api/ventas/cotizaciones/kpis?'+kpiParams)
  ]);
  state.cotizaciones=Array.isArray(list.cotizaciones)?list.cotizaciones:[];
  state.total=Number(list.paginacion?.total_registros||state.cotizaciones.length);
  state.totalPages=Number(list.paginacion?.total_paginas||0);
  state.quoteKpis=kpis.kpis||{};
  renderQuotes();
}
async function loadCatalogs(){
  const [general,clientes,asesores,cotizaciones]=await Promise.all([
    catalogReq('/api/catalogo-general'),
    catalogReq('/api/ventas/clientes/catalogos'),
    req('/api/ventas/clientes/asesores-asignables'),
    catalogReq('/api/ventas/cotizaciones/catalogos')
  ]);
  const rows=Array.isArray(general.articulos)?general.articulos:Array.isArray(general.data)?general.data:[];
  const by=(area,elemento)=>rows.filter(row=>(!area||String(row.area||'').toLowerCase()===area.toLowerCase())&&String(row.elemento||'').toLowerCase()===elemento.toLowerCase());
  state.catalogos.estados=by('General','Estado');
  const tipos=by('Ventas','Tipo de Cliente');
  const estatus=by('Ventas','Estatus con Cliente');
  state.catalogos.tipos=tipos.length?tipos:(clientes.catalogos?.tipo_cliente||[]);
  state.catalogos.estatus=estatus.length?estatus:(clientes.catalogos?.estatus_cliente||[]);
  state.catalogos.asesores=Array.isArray(asesores.data)?asesores.data:[];
  state.assignmentMode=String(asesores.mode||'SELF').toUpperCase();
  const cat=cotizaciones.catalogos||{};
  const years=[...(cat.anios||[]),...(cat.anios_cierre||[])].map(Number).filter(Number.isInteger);
  state.years=[...new Set(years)].sort((a,b)=>b-a);
  renderYearOptions();
}
async function loadAll(){try{await Promise.all([loadClient(),loadCatalogs()]);await Promise.all([loadContacts(),loadQuotes()]);}catch(e){toast(e.message,true);}}
function modal(title,body,submit){state.mode=submit;$('#vcd-modal-title').textContent=title;$('#vcd-form-body').innerHTML=body;$('#vcd-modal').hidden=false;}
function close(){ $('#vcd-modal').hidden=true;state.mode=null;state.editingContact=null; }
async function clientForm(){try{await loadCatalogs();const c=state.cliente||{};const advisorSelect=selectHtml('iniciales',state.catalogos.asesores,c.iniciales,{required:true,valueKey:'iniciales',labelKey:'etiqueta'});if(!state.catalogos.asesores.length)throw new Error('No hay usuarios comerciales disponibles dentro de tu Alcance de Información.');modal('Editar cliente','<div class="vcd-form-grid"><label>Nombre empresa *<input name="nombre_empresa" required value="'+esc(c.nombre_empresa||'')+'"></label><label>Razón social<input name="razon_social" value="'+esc(c.razon_social||'')+'"></label><label>Ciudad<input name="ciudad" value="'+esc(c.ciudad||'')+'"></label><label>Estado'+selectHtml('estado',state.catalogos.estados,c.estado)+'</label><label>Ubicación<div class="vcd-location-row"><input id="vcd-location-input" name="ubicacion" value="'+esc(c.ubicacion||'')+'"><button id="vcd-location-gps" type="button">📍 Usar ubicación actual</button><a id="vcd-location-map" href="#" target="_blank" rel="noopener" hidden>Abrir en mapa</a></div><small id="vcd-location-help">Opcional. Usa el GPS cuando estés en las oficinas del cliente.</small></label><label>Tipo de cliente'+selectHtml('tipo_cliente',state.catalogos.tipos,c.tipo_cliente)+'</label><label>Estatus con cliente'+selectHtml('estatus_cliente',state.catalogos.estatus,c.estatus_cliente,{uppercase:true})+'</label><label>Asesor / iniciales *'+advisorSelect+'</label><label class="full">Comentarios<textarea name="comentarios" rows="4">'+esc(c.comentarios||'')+'</textarea></label></div>','client');$('#vcd-location-gps').onclick=captureEditLocation;$('#vcd-location-input').oninput=updateEditMapLink;updateEditMapLink();}catch(e){toast(e.message,true);}}
function openContact(id=null){state.editingContact=id?state.contactos.find(x=>Number(x.id_contacto)===Number(id)):null;window.ManttoVentasContactoForm?.open({container:'#vcd-contact-editor',clientId:state.id,contact:state.editingContact,onSaved:async()=>{toast(state.editingContact?'Contacto actualizado.':'Contacto creado.');state.editingContact=null;await loadContacts();}});}
async function submit(ev){ev.preventDefault();const data=Object.fromEntries(new FormData(ev.currentTarget).entries());try{if(state.mode!=='client')return;data.estatus_cliente=normalizeUpper(data.estatus_cliente)||null;data.iniciales=normalizeUpper(data.iniciales)||null;delete data.proyecto_vendido;delete data.visualiza;await req('/api/ventas/clientes/'+state.id,{method:'PATCH',body:JSON.stringify(data)});toast('Cliente actualizado.');await loadClient();close();}catch(e){toast(e.message,true);}}
async function setPrincipal(id){try{await req('/api/ventas/clientes/'+state.id+'/contactos/'+id+'/principal',{method:'PATCH'});toast('Contacto principal actualizado.');await loadContacts();}catch(e){toast(e.message,true);}}
async function removeContact(id){if(!window.confirm('¿Desactivar este contacto?'))return;try{await req('/api/ventas/clientes/'+state.id+'/contactos/'+id,{method:'DELETE'});toast('Contacto desactivado.');await loadContacts();}catch(e){toast(e.message,true);}}
async function mount(payload){state.id=Number(payload?.id||payload?.id_cliente);if(!state.id){toast('No se recibió un cliente válido.',true);return;}const view=$('#view-ventas-clientes-detalle');if(view.dataset.ready!=='1'){const r=await fetch('./modules/ventas-clientes-detalle/ventas-clientes-detalle.html?v=20260729-v009',{cache:'default'});view.innerHTML=await r.text();view.dataset.ready='1';$('#vcd-refresh').onclick=loadAll;$('#vcd-edit-client').onclick=clientForm;$('#vcd-new-contact').onclick=()=>openContact();$('#vcd-modal-close').onclick=close;$('#vcd-cancel').onclick=close;$('#vcd-form').onsubmit=submit;$('#vcd-year').onchange=()=>{state.year=$('#vcd-year').value||'todos';state.page=1;loadQuotes().catch(e=>toast(e.message,true));};}state.page=1;state.year='todos';await loadAll();}
window.ManttoVentasClientesDetalle={init:mount,reload:loadAll};
})();
