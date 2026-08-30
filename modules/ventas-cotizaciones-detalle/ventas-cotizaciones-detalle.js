(function(){
'use strict';

// [Aster | 2026-08-30 | ASTER-MG | FASE 3 DASHBOARD VENTAS: Proyecto de interés personal]
const API=(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
const FALLBACK_STATUSES=['Contacto','En Cotizacion','Sin Respuesta','Seguimiento con Probabilidad','En Espera de Definicion','Pre Asignado','Asignado','En Contrato','Vendido','Perdido','Siguiente Año','Borrar'];
const state={
  id:null,
  quote:null,
  statuses:FALLBACK_STATUSES.slice(),
  busy:false,
  interest:false,
  interestAvailable:false,
  interestBusy:false
};
const $=(s,r=document)=>r.querySelector(s);
const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const headers=(json=true)=>Object.assign(json?{'Accept':'application/json','Content-Type':'application/json'}:{'Accept':'application/json'},window.ManttoAuth?.authHeaders?.()||{});

async function req(path,options={}){
  const opts=Object.assign({cache:'no-store'},options);
  const isFormData=typeof FormData!=='undefined'&&opts.body instanceof FormData;
  opts.headers=Object.assign({},headers(opts.body!==undefined&&!isFormData),options.headers||{});
  const r=await fetch(API+path,opts);
  const t=await r.text();
  let j={};
  try{j=t?JSON.parse(t):{};}catch(_error){throw new Error('El backend respondió contenido no JSON.');}
  if(!r.ok||j.ok===false)throw new Error(j.message||j.error||('Error HTTP '+r.status));
  return j;
}

const CATALOG_CACHE_MS=5*60*1000;
function catalogReq(path){
  return window.ManttoHttp&&typeof window.ManttoHttp.get==='function'
    ?window.ManttoHttp.get(path,{cacheTtlMs:CATALOG_CACHE_MS,cacheKey:'catalog:'+path})
    :req(path);
}

function notifyQuoteUpdated(type,extra={}){
  const detail=Object.assign({id_cotizacion:state.id,tipo:type,origen:'ventas-cotizaciones-detalle'},extra);
  window.dispatchEvent(new CustomEvent('mantto:ventas-cotizacion-actualizada',{detail}));
  document.dispatchEvent(new CustomEvent('mantto:data-mutated',{detail:{route:'ventas-cotizaciones',path:'/api/ventas/cotizaciones/'+state.id,type,id:state.id}}));
}

function date(v){
  if(!v)return'—';
  const raw=String(v);
  const d=new Date(raw.length===10?raw+'T12:00:00':raw);
  return Number.isNaN(d.getTime())?raw.slice(0,10):d.toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function dateTime(v){
  if(!v)return'—';
  const d=new Date(v);
  return Number.isNaN(d.getTime())?String(v):d.toLocaleString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function isoToday(){
  const d=new Date();
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
function toast(m,e=false){
  const el=$('#vqd-toast');
  if(!el)return;
  el.textContent=m;
  el.className='vqd-toast show'+(e?' error':'');
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>el.className='vqd-toast',3200);
}
function status(m,e=false){
  const el=$('#vqd-status');
  if(!el)return;
  el.className='vqd-status'+(e?' error':'');
  el.innerHTML='<i></i><span>'+esc(m)+'</span>';
}
function field(label,value){return '<div class="vqd-field"><span>'+esc(label)+'</span><strong>'+esc(value||'—')+'</strong></div>';}
function section(title,fields){return '<section class="vqd-section"><h2>'+esc(title)+'</h2><div class="vqd-grid">'+fields.join('')+'</div></section>';}
function initials(row){
  const raw=row?.usuario_iniciales||row?.iniciales||row?.usuario_nombre||'U';
  return String(raw).trim().split(/\s+/).map(x=>x[0]||'').join('').slice(0,2).toUpperCase()||'U';
}
function isSold(value){return String(value||'').trim().toLowerCase()==='vendido';}
function isLost(value){return String(value||'').trim().toLowerCase()==='perdido';}
function statusOptions(current){
  const values=[...new Set([...state.statuses,current].filter(Boolean))];
  return values.map(v=>'<option value="'+esc(v)+'"'+(v===current?' selected':'')+'>'+esc(v)+'</option>').join('');
}
function equipmentDisplay(q){
  const rows=Array.isArray(q?.equipos)?q.equipos.filter(row=>Number(row?.cantidad)>0&&String(row?.tipo_equipo||'').trim()):[];
  if(rows.length){
    return {
      total:rows.reduce((sum,row)=>sum+(Number(row.cantidad)||0),0),
      types:rows.map(row=>String(row.tipo_equipo).trim()).filter(Boolean).join(', ')
    };
  }
  return {total:Number(q?.numero_equipos||0),types:String(q?.tipo_equipos||'').trim()||'—'};
}

function interestCard(){
  const checked=state.interest?' checked':'';
  const disabled=!state.interestAvailable||state.interestBusy?' disabled':'';
  const text=state.interestAvailable
    ?(state.interest?'Marcado para mí':'Marcar para mí')
    :'No disponible';
  return '<article class="vqd-kpi">'
    +'<span>Proyecto de interés</span>'
    +'<label style="display:flex;align-items:center;gap:9px;margin-top:9px;color:#173a72;font-weight:800;cursor:pointer">'
    +'<input id="vqd-interest-toggle" type="checkbox"'+checked+disabled+' style="width:18px;height:18px;accent-color:#0f4ccf">'
    +'<strong id="vqd-interest-label" style="margin:0">'+esc(text)+'</strong>'
    +'</label>'
    +'<small style="display:block;margin-top:7px;color:#697892">Selección personal: solo afecta a tu usuario.</small>'
    +'</article>';
}

function renderSummary(){
  const q=state.quote||{};
  const equipment=equipmentDisplay(q);
  $('#vqd-summary').innerHTML=''
    +'<article class="vqd-kpi vqd-kpi-status"><span>Estatus</span><div class="vqd-status-row"><select class="vqd-select" id="vqd-status-select" aria-label="Estatus de la cotización">'+statusOptions(q.estatus_proyecto)+'</select><button class="vqd-btn vqd-btn-primary" id="vqd-status-save" type="button">Guardar</button></div><div class="vqd-status-extra" id="vqd-status-extra" hidden></div></article>'
    +'<article class="vqd-kpi"><span>Asesor</span><strong>'+esc(q.asesor||'—')+'</strong></article>'
    +'<article class="vqd-kpi"><span>Equipos</span><strong>'+esc(Number(equipment.total||0).toLocaleString('es-MX'))+'</strong></article>'
    +interestCard();
  bindStatusEditor();
  bindInterest();
}

function renderStatusExtra(){
  const box=$('#vqd-status-extra');
  const select=$('#vqd-status-select');
  if(!box||!select)return;
  const value=select.value;
  box.hidden=!(isSold(value)||isLost(value));
  if(isSold(value)){
    box.innerHTML='<label>Fecha de cierre<input class="vqd-input" id="vqd-close-date" type="date" value="'+esc((state.quote?.fecha_cierre||'').toString().slice(0,10)||isoToday())+'"></label>';
    return;
  }
  if(isLost(value)){
    box.innerHTML='<label>Razón de pérdida<input class="vqd-input" id="vqd-lost-reason" maxlength="255" value="'+esc(state.quote?.razon_perdido||'')+'"></label><label>Empresa competidora<input class="vqd-input" id="vqd-competitor" maxlength="255" value="'+esc(state.quote?.empresa_vs_perdido||'')+'"></label>';
    return;
  }
  box.innerHTML='';
}
function bindStatusEditor(){
  const select=$('#vqd-status-select');
  const button=$('#vqd-status-save');
  if(select)select.onchange=renderStatusExtra;
  if(button)button.onclick=saveStatus;
  renderStatusExtra();
}

async function saveStatus(){
  if(state.busy)return;
  const select=$('#vqd-status-select');
  if(!select)return;
  const next=select.value;
  if(next===state.quote?.estatus_proyecto){toast('Selecciona un estatus diferente.',true);return;}
  const payload={estatus_proyecto:next};
  if(isSold(next)){
    const close=$('#vqd-close-date')?.value;
    if(!close){toast('Indica la fecha de cierre.',true);return;}
    payload.fecha_cierre=close;
    payload.razon_perdido=null;
    payload.empresa_vs_perdido=null;
  }else if(isLost(next)){
    const reason=$('#vqd-lost-reason')?.value.trim();
    if(!reason){toast('Indica la razón de pérdida.',true);return;}
    payload.razon_perdido=reason;
    payload.empresa_vs_perdido=$('#vqd-competitor')?.value.trim()||null;
    payload.fecha_cierre=null;
  }else{
    payload.fecha_cierre=null;
    payload.razon_perdido=null;
    payload.empresa_vs_perdido=null;
  }
  state.busy=true;
  $('#vqd-status-save').disabled=true;
  status('Actualizando estatus');
  try{
    const j=await req('/api/ventas/cotizaciones/'+state.id+'/estatus',{method:'PATCH',body:JSON.stringify(payload)});
    state.quote=j.cotizacion||state.quote;
    renderAll();
    status('Aiven conectado');
    toast('Estatus actualizado correctamente.');
    notifyQuoteUpdated('estatus',{estatus_proyecto:state.quote?.estatus_proyecto||next});
  }catch(e){
    status('Error al actualizar',true);
    toast(e.message,true);
  }finally{
    state.busy=false;
    const b=$('#vqd-status-save');
    if(b)b.disabled=false;
  }
}

function bindInterest(){
  const input=$('#vqd-interest-toggle');
  if(!input||!state.interestAvailable)return;
  input.onchange=saveInterest;
}

async function saveInterest(event){
  if(state.interestBusy)return;
  const input=event?.currentTarget||$('#vqd-interest-toggle');
  if(!input)return;
  const requested=Boolean(input.checked);
  const previous=state.interest;
  state.interestBusy=true;
  input.disabled=true;
  const label=$('#vqd-interest-label');
  if(label)label.textContent='Guardando...';
  try{
    const response=await req('/api/ventas/cotizaciones/'+state.id+'/interes',{
      method:'PUT',
      body:JSON.stringify({activo:requested})
    });
    state.interest=response?.proyecto_interes===true;
    state.interestAvailable=true;
    renderSummary();
    toast(response?.message||'Proyecto de interés actualizado.');
    notifyQuoteUpdated('proyecto_interes',{proyecto_interes:state.interest});
  }catch(error){
    state.interest=previous;
    input.checked=previous;
    toast(error.message,true);
  }finally{
    state.interestBusy=false;
    const current=$('#vqd-interest-toggle');
    if(current)current.disabled=!state.interestAvailable;
    const currentLabel=$('#vqd-interest-label');
    if(currentLabel)currentLabel.textContent=state.interest?'Marcado para mí':'Marcar para mí';
  }
}

function renderInformation(){
  const q=state.quote||{};
  const equipment=equipmentDisplay(q);
  const closure=[field('Fecha solicitud',date(q.fecha_solicitud)),field('Fecha cotización',date(q.fecha_cotizacion))];
  if(isSold(q.estatus_proyecto))closure.push(field('Fecha cierre',date(q.fecha_cierre)));
  if(isLost(q.estatus_proyecto)){
    closure.push(field('Razón perdido',q.razon_perdido));
    closure.push(field('Empresa competidora',q.empresa_vs_perdido));
  }
  $('#vqd-general').innerHTML=
    section('Cliente y contacto',[field('Cliente',q.cliente),field('Contacto',q.contacto),field('Puesto',q.puesto_contacto),field('Teléfono',q.telefono),field('Correo',q.correo),field('Ciudad',q.ciudad),field('Estado',q.estado)])
    +section('Proyecto',[field('Tipo de proyecto',q.tipo_proyecto),field('Número de equipos',equipment.total),field('Tipo de equipos',equipment.types),field('Zona',q.zona),field('Información enviada',q.informacion_envia)])
    +section('Fechas y cierre',closure)
    +section('Notas',[field('Comentario',q.comentario)])
    +'<section class="vqd-section vqd-interactions"><div class="vqd-interactions-head"><h2>Interacciones</h2><p>Los archivos aparecen dentro del comentario al que pertenecen.</p></div><section class="vqd-chat-panel"><div class="vqd-chat-history" id="vqd-comments"><div class="vqd-loader">Cargando comentarios…</div></div><form class="vqd-chat-form" id="vqd-comment-form"><label>Nuevo comentario<textarea class="vqd-textarea" id="vqd-comment-text" maxlength="4000" placeholder="Escribe un comentario..."></textarea></label><div class="vqd-comment-tools"><label class="vqd-file-picker">Adjuntar archivo<input class="vqd-input" id="vqd-file-input" type="file"></label><small>Máximo 25 MB. Los archivos se almacenan en Azure Blob.</small></div><div class="vqd-form-actions"><button class="vqd-btn vqd-btn-primary" type="submit">Enviar comentario</button></div></form></section></section>';
  bindInteractions();
}

function renderAll(){
  const q=state.quote||{};
  $('#vqd-title').textContent=q.nombre_proyecto||'Detalle de cotización';
  $('#vqd-subtitle').textContent='MX'+String(q.id_cotizacion||'').padStart(6,'0')+' · '+(q.cliente||'Sin cliente');
  renderSummary();
  renderInformation();
  loadComments();
}

function archivoNombre(f){return f?.nombre_original||f?.nombre_archivo||'Archivo adjunto';}
function archivoTipo(f){return f?.tipo_archivo||f?.mime_type||'Archivo';}
function renderArchivoComentario(f){
  const nombre=archivoNombre(f),tipo=archivoTipo(f),endpoint=f?.access_endpoint||'',legacy=f?.legacy_url||'';
  const contenido='<span class="vqd-message-file-icon">📎</span><span class="vqd-message-file-info"><strong>'+esc(nombre)+'</strong><small>'+esc(tipo)+(Number(f?.version_numero||1)>1?' · Versión '+esc(f.version_numero):'')+'</small></span>';
  if(endpoint||legacy){
    return '<button class="vqd-message-file" type="button" data-vqd-file-open data-access-endpoint="'+esc(endpoint)+'" data-legacy-url="'+esc(legacy)+'">'+contenido+'<span class="vqd-message-file-open">Abrir</span></button>';
  }
  return '<div class="vqd-message-file is-disabled">'+contenido+'<span class="vqd-message-file-open">Sin vínculo</span></div>';
}

async function openFileAccess(button){
  if(!button||button.disabled)return;
  const endpoint=button.dataset.accessEndpoint||'';
  const legacy=button.dataset.legacyUrl||'';
  if(legacy){window.open(legacy,'_blank','noopener,noreferrer');return;}
  if(!endpoint){toast('El archivo no tiene una referencia disponible.',true);return;}
  button.disabled=true;
  button.classList.add('is-loading');
  const previous=button.querySelector('.vqd-message-file-open')?.textContent||'Abrir';
  const label=button.querySelector('.vqd-message-file-open');
  if(label)label.textContent='Abriendo…';
  let popup=null;
  try{
    popup=window.open('about:blank','_blank');
    if(popup)popup.opener=null;
    const response=await req(endpoint);
    const url=response?.data?.access_url||response?.data?.url||response?.access_url||response?.url;
    if(!url)throw new Error('El backend no devolvió un acceso temporal.');
    if(popup)popup.location.replace(url);else window.open(url,'_blank','noopener,noreferrer');
  }catch(e){
    if(popup)popup.close();
    toast(e.message,true);
  }finally{
    button.disabled=false;
    button.classList.remove('is-loading');
    if(label)label.textContent=previous;
  }
}
function bindFileAccess(root){root?.querySelectorAll?.('[data-vqd-file-open]').forEach(button=>{button.onclick=()=>openFileAccess(button);});}

async function loadComments(){
  const box=$('#vqd-comments');
  if(!box)return;
  box.innerHTML='<div class="vqd-loader">Cargando comentarios…</div>';
  try{
    const j=await req('/api/ventas/cotizaciones/'+state.id+'/comentarios?page_size=200');
    const rows=Array.isArray(j.comentarios)?j.comentarios:[];
    box.innerHTML=rows.length?rows.map(c=>{
      const archivos=Array.isArray(c.archivos)?c.archivos:[];
      const adjuntos=archivos.length?'<div class="vqd-message-attachments">'+archivos.map(renderArchivoComentario).join('')+'</div>':'';
      const texto=String(c.comentario||'').trim();
      const parrafo=texto?'<p>'+esc(texto)+'</p>':'';
      return '<article class="vqd-message"><div class="vqd-avatar">'+esc(initials(c))+'</div><div class="vqd-message-body">'+adjuntos+'<div class="vqd-message-head"><strong>'+esc(c.usuario_nombre||c.usuario_iniciales||'Usuario')+'</strong><time>'+esc(dateTime(c.created_at))+'</time></div>'+parrafo+'</div></article>';
    }).join(''):'<div class="vqd-empty">Aún no hay comentarios.</div>';
    bindFileAccess(box);
    box.scrollTop=box.scrollHeight;
  }catch(e){
    box.innerHTML='<div class="vqd-empty">No se pudieron cargar los comentarios: '+esc(e.message)+'</div>';
  }
}

async function sendComment(event){
  event.preventDefault();
  if(state.busy)return;
  const text=$('#vqd-comment-text')?.value.trim()||'';
  const input=$('#vqd-file-input');
  const file=input?.files?.[0]||null;
  if(!text&&!file){toast('Escribe un comentario o adjunta un archivo.',true);return;}
  if(file&&file.size>25*1024*1024){toast('El archivo excede el límite de 25 MB.',true);return;}
  state.busy=true;
  const button=event.currentTarget.querySelector('button[type="submit"]');
  if(button)button.disabled=true;
  try{
    const form=new FormData();
    if(text)form.append('comentario',text);
    if(file)form.append('archivo',file,file.name);
    await req('/api/ventas/cotizaciones/'+state.id+'/comentarios',{method:'POST',body:form});
    $('#vqd-comment-text').value='';
    if(input)input.value='';
    await loadComments();
    toast('Interacción registrada.');
    notifyQuoteUpdated('comentario');
  }catch(e){
    toast(e.message,true);
  }finally{
    state.busy=false;
    if(button)button.disabled=false;
  }
}
function bindInteractions(){const form=$('#vqd-comment-form');if(form)form.onsubmit=sendComment;}

async function loadCatalogs(){
  try{
    const j=await catalogReq('/api/ventas/cotizaciones/catalogos');
    const rows=Array.isArray(j?.catalogos?.estatus_proyecto)?j.catalogos.estatus_proyecto:[];
    state.statuses=[...new Set([...FALLBACK_STATUSES,...rows])];
  }catch(_error){
    state.statuses=FALLBACK_STATUSES.slice();
  }
}

async function loadInterest(){
  try{
    const response=await req('/api/ventas/cotizaciones/'+state.id+'/interes');
    state.interest=response?.proyecto_interes===true;
    state.interestAvailable=true;
  }catch(_error){
    state.interest=false;
    state.interestAvailable=false;
  }
}

async function load(){
  status('Consultando Aiven');
  try{
    await loadCatalogs();
    const [j]=await Promise.all([
      req('/api/ventas/cotizaciones/'+state.id),
      loadInterest()
    ]);
    state.quote=j.cotizacion||j.data||null;
    if(!state.quote)throw new Error('La cotización no fue encontrada.');
    renderAll();
    status('Aiven conectado');
  }catch(e){
    status('Error al cargar',true);
    toast(e.message,true);
    const box=$('#vqd-general');
    if(box)box.innerHTML='<div class="vqd-empty">'+esc(e.message)+'</div>';
  }
}

function bind(){
  const refresh=$('#vqd-refresh');
  if(refresh)refresh.onclick=load;
  const edit=$('#vqd-edit');
  if(edit)edit.onclick=()=>window.ManttoRouter?.go?.('ventas-cotizaciones-nueva',{mode:'edit',id:state.id,record:state.quote});
}

async function mount(payload){
  state.id=Number(payload?.id||payload?.id_cotizacion);
  if(!state.id)return false;
  const view=$('#view-ventas-cotizaciones-detalle');
  if(!view)return false;
  if(view.dataset.ready!=='1'){
    const r=await fetch('./modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.html?v=20260812-edit-v001',{cache:'default'});
    if(!r.ok)throw new Error('No se pudo cargar Detalle de cotización.');
    view.innerHTML=await r.text();
    view.dataset.ready='1';
    bind();
  }
  await load();
  return true;
}

window.ManttoVentasCotizacionesDetalle={init:mount,reload:load};
})();
