(function(){
'use strict';

const API=(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
let routePayload=null;
let assignmentMode='SELF';

const $=(selector,root=document)=>root.querySelector(selector);
const headers=(json=false)=>Object.assign(
  {'Accept':'application/json'},
  json?{'Content-Type':'application/json'}:{},
  window.ManttoAuth?.authHeaders?window.ManttoAuth.authHeaders():{}
);

async function request(path,options={}){
  const response=await fetch(API+path,{
    ...options,
    cache:'no-store',
    headers:{...headers(Boolean(options.body)),...(options.headers||{})}
  });
  const text=await response.text();
  let json={};
  try{json=text?JSON.parse(text):{};}catch(error){throw new Error('La API respondió contenido no JSON.');}
  if(!response.ok||json.ok===false)throw new Error(json.message||json.error||('Error HTTP '+response.status));
  return json;
}

function toast(message,error=false){
  const el=$('#vcln-toast');
  if(!el)return;
  el.textContent=message;
  el.className='vcln-toast show'+(error?' error':'');
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>el.className='vcln-toast',3200);
}

function status(message,error=false){
  const el=$('#vcln-status');
  if(!el)return;
  el.className='vcln-status'+(error?' error':'');
  el.innerHTML='<i></i><span>'+String(message||'')+'</span>';
}

function escapeHtml(value){
  return String(value??'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

function fill(selector,values,{uppercase=false,objectValue='articulo',objectLabel='articulo'}={}){
  const el=$(selector);
  if(!el)return;
  const seen=new Set();
  const rows=[];
  for(const item of values||[]){
    const rawValue=typeof item==='object'?(item[objectValue]??item.articulo??item.iniciales??item.nombre??''):item;
    const rawLabel=typeof item==='object'?(item[objectLabel]??item.nombre??item.iniciales??rawValue):rawValue;
    if(rawValue===undefined||rawValue===null||String(rawValue).trim()==='')continue;
    const value=uppercase?String(rawValue).trim().toUpperCase():String(rawValue).trim();
    const label=uppercase?String(rawLabel).trim().toUpperCase():String(rawLabel).trim();
    const key=value.toUpperCase();
    if(seen.has(key))continue;
    seen.add(key);
    rows.push({value,label});
  }
  el.innerHTML='<option value="">Selecciona...</option>'+rows.map(row=>
    '<option value="'+escapeHtml(row.value)+'">'+escapeHtml(row.label)+'</option>'
  ).join('');
}

function updateCommercialCopy(mode){
  const copy=$('#vcln-commercial-section .vcln-section-title p');
  if(!copy)return;
  const messages={
    ALL:'Puedes asignar el cliente a cualquier usuario comercial disponible en Corellian.',
    LIMITED:'Solo se muestran usuarios comerciales incluidos en tu Alcance de Información.',
    SELF:'Solo se muestran usuarios comerciales incluidos en tu Alcance de Información.'
  };
  copy.textContent=messages[mode]||messages.LIMITED;
}

async function loadAssignableAdvisors(){
  const response=await request('/api/ventas/clientes/asesores-asignables');
  const rows=Array.isArray(response.data)?response.data:[];
  assignmentMode=String(response.mode||'SELF').toUpperCase();
  updateCommercialCopy(assignmentMode);

  const select=$('#vcln-iniciales');
  fill('#vcln-iniciales',rows,{objectValue:'iniciales',objectLabel:'etiqueta'});

  if(select&&rows.length===1){
    select.value=String(rows[0].iniciales||'').trim().toUpperCase();
  }

  if(!rows.length){
    throw new Error('No hay usuarios comerciales disponibles dentro de tu Alcance de Información.');
  }
}

async function loadCatalogs(){
  status('Cargando catálogos...');
  const [general,clientes]=await Promise.all([
    request('/api/catalogo-general'),
    request('/api/ventas/clientes/catalogos')
  ]);
  const rows=Array.isArray(general.articulos)?general.articulos:Array.isArray(general.data)?general.data:[];
  const by=(area,elemento)=>rows.filter(row=>(
    !area||String(row.area||'').toLowerCase()===area.toLowerCase()
  )&&String(row.elemento||'').toLowerCase()===elemento.toLowerCase());

  fill('#vcln-estado',by('General','Estado'));
  const tipoCatalog=by('Ventas','Tipo de Cliente');
  const estatusCatalog=by('Ventas','Estatus con Cliente');
  fill('#vcln-tipo',tipoCatalog.length?tipoCatalog:(clientes.catalogos?.tipo_cliente||[]));
  fill('#vcln-estatus',estatusCatalog.length?estatusCatalog:(clientes.catalogos?.estatus_cliente||[]),{uppercase:true});
  await loadAssignableAdvisors();
  status('Formulario listo');
}


function parseCoordinates(value){
  const match=String(value||'').trim().match(/^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if(!match)return null;
  const lat=Number(match[1]),lng=Number(match[2]);
  return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;
}
function updateMapLink(){
  const input=$('#vcln-ubicacion'),link=$('#vcln-map');
  if(!input||!link)return;
  const coords=parseCoordinates(input.value);
  link.hidden=!coords;
  if(coords)link.href='https://www.google.com/maps?q='+encodeURIComponent(coords.lat+','+coords.lng);
}
function captureLocation(){
  const button=$('#vcln-gps'),input=$('#vcln-ubicacion'),help=$('#vcln-gps-help');
  if(!navigator.geolocation){toast('Este dispositivo o navegador no permite obtener la ubicación.',true);return;}
  button.disabled=true;button.textContent='Obteniendo ubicación…';
  if(help){help.classList.remove('error');help.textContent='Solicitando permiso de ubicación al dispositivo…';}
  navigator.geolocation.getCurrentPosition(position=>{
    const latitude=Number(position.coords.latitude).toFixed(6);
    const longitude=Number(position.coords.longitude).toFixed(6);
    input.value=latitude+', '+longitude;
    updateMapLink();
    if(help)help.textContent='Ubicación capturada con una precisión aproximada de '+Math.round(position.coords.accuracy||0)+' m.';
    toast('Ubicación del dispositivo capturada.');
    button.disabled=false;button.textContent='📍 Actualizar ubicación';
  },error=>{
    const messages={1:'No se autorizó el acceso a la ubicación.',2:'El dispositivo no pudo determinar la ubicación.',3:'La solicitud de ubicación agotó el tiempo de espera.'};
    const message=messages[error.code]||'No fue posible obtener la ubicación.';
    if(help){help.classList.add('error');help.textContent=message+' Puedes continuar sin este dato.';}
    toast(message,true);button.disabled=false;button.textContent='📍 Usar ubicación actual';
  },{enableHighAccuracy:true,timeout:15000,maximumAge:60000});
}

function payloadFromForm(){
  const fd=new FormData($('#vcln-form'));
  const text=name=>String(fd.get(name)||'').trim()||null;
  const statusValue=text('estatus_cliente');
  return{
    nombre_empresa:text('nombre_empresa'),
    razon_social:text('razon_social'),
    ciudad:text('ciudad'),
    estado:text('estado'),
    ubicacion:text('ubicacion'),
    nombre_contacto:text('nombre_contacto'),
    puesto_contacto:text('puesto_contacto'),
    email:text('email'),
    telefono:text('telefono'),
    tipo_cliente:text('tipo_cliente'),
    estatus_cliente:statusValue?statusValue.toUpperCase():null,
    iniciales:text('iniciales')?.toUpperCase()||null,
    comentarios:text('comentarios'),
    activo:1
  };
}

async function save(event){
  event.preventDefault();
  const form=$('#vcln-form');
  if(!form.reportValidity())return;
  const payload=payloadFromForm();
  if(!payload.iniciales){
    status('Selecciona una asignación comercial',true);
    toast('Debes seleccionar las iniciales del asesor.',true);
    return;
  }

  const button=$('#vcln-save');
  button.disabled=true;
  button.textContent='Guardando...';
  status('Guardando cliente...');
  try{
    const created=await request('/api/ventas/clientes',{method:'POST',body:JSON.stringify(payload)});
    const idCliente=Number(created.id_cliente||created.cliente?.id_cliente);
    if(!idCliente)throw new Error('El backend no devolvió id_cliente.');

    let contactWarning=null;
    try{
      await request('/api/ventas/clientes/'+idCliente+'/contactos',{
        method:'POST',
        body:JSON.stringify({
          nombre_contacto:payload.nombre_contacto,
          puesto_contacto:payload.puesto_contacto,
          email:payload.email,
          telefono:payload.telefono,
          contacto_principal:1
        })
      });
    }catch(error){contactWarning=error.message;}

    status(contactWarning?'Cliente creado; contacto pendiente':'Cliente y contacto creados');
    toast(
      contactWarning
        ?'Cliente creado. No se pudo crear el contacto principal: '+contactWarning
        :'Cliente creado correctamente.',
      Boolean(contactWarning)
    );

    const destination=routePayload?.returnTo;
    setTimeout(()=>{
      if(destination==='ventas-cotizaciones-nueva'){
        window.ManttoRouter?.go?.('ventas-cotizaciones-nueva',{
          selectedClientId:idCliente,
          createdClient:true
        },{replace:true});
      }else{
        window.ManttoRouter?.go?.('ventas-clientes',{createdClientId:idCliente},{replace:true});
      }
    },contactWarning?1600:700);
  }catch(error){
    status('No se pudo guardar',true);
    toast(error.message,true);
  }finally{
    button.disabled=false;
    button.textContent='Guardar cliente';
  }
}

function bind(){
  $('#vcln-cancel').onclick=()=>window.ManttoRouter?.back?.();
  $('#vcln-form').onsubmit=save;
  $('#vcln-gps').onclick=captureLocation;
  $('#vcln-ubicacion').oninput=updateMapLink;
}

async function prepareForm(){
  $('#vcln-form')?.reset();
  assignmentMode='SELF';
  updateMapLink();
  await loadCatalogs();
}

async function mount(payload){
  routePayload=payload||routePayload||null;
  const view=$('#view-ventas-clientes-nuevo');
  if(!view)return false;

  if(view.dataset.ready!=='1'){
    const response=await fetch('./modules/ventas-clientes-nuevo/ventas-clientes-nuevo.html?v=20260729-v009',{cache:'no-store'});
    if(!response.ok)throw new Error('No se pudo cargar Nuevo cliente.');
    view.innerHTML=await response.text();
    view.dataset.ready='1';
    bind();
  }

  try{
    await prepareForm();
  }catch(error){
    status('Error al preparar el formulario',true);
    toast(error.message,true);
  }
  return true;
}

window.ManttoVentasClientesNuevo={init:mount};
})();
