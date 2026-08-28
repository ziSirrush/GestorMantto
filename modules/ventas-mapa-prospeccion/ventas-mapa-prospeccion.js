(function(){
'use strict';

const LEAFLET_VERSION='1.9.4';
const LEAFLET_CSS_URL=`https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSION}/leaflet.css`;
const LEAFLET_JS_URL=`https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSION}/leaflet.js`;
const state={map:null,layer:null,catalogs:null,leafletPromise:null,targetId:null};
const $=(s,r=document)=>r.querySelector(s);
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const fmtDate=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'});};

function request(path){
  if(window.ManttoAuth?.api)return window.ManttoAuth.api(path,{method:'GET'});
  return fetch((window.MANTTO_API_BASE||'')+path,{headers:window.ManttoAuth?.authHeaders?.()||{}}).then(async r=>{
    let j=null;
    try{j=await r.json();}catch(_error){throw new Error(`Respuesta no JSON (HTTP ${r.status})`);}
    if(!r.ok||j.ok===false)throw new Error(j.message||(`HTTP ${r.status}`));
    return j;
  });
}

function setStatus(text,type){
  const el=$('#vmp-status');
  if(!el)return;
  el.className='vmp-status'+(type?' '+type:'');
  const label=el.querySelector('span');
  if(label)label.textContent=text;
}

function val(id){return $(id)?.value||'';}
function query(){
  const q=new URLSearchParams();
  if(val('#vmp-filter-year'))q.set('anio',val('#vmp-filter-year'));
  if(val('#vmp-filter-status'))q.set('estatus',val('#vmp-filter-status'));
  if(val('#vmp-filter-user'))q.set('id_usuario',val('#vmp-filter-user'));
  if(val('#vmp-filter-state'))q.set('estado',val('#vmp-filter-state'));
  return q.toString();
}

function fillSelect(id,rows,label,valueKey='value',textKey='value'){
  const el=$(id);
  if(!el)return;
  const current=el.value;
  el.innerHTML='<option value="">'+label+'</option>'+rows.map(r=>{
    const v=typeof r==='object'?r[valueKey]:r;
    const t=typeof r==='object'?r[textKey]:r;
    return '<option value="'+esc(v)+'">'+esc(t)+'</option>';
  }).join('');
  if([...el.options].some(o=>o.value===current))el.value=current;
}

const CATALOG_CACHE_MS=5*60*1000;
function catalogRequest(path){return window.ManttoHttp&&typeof window.ManttoHttp.get==='function'?window.ManttoHttp.get(path,{cacheTtlMs:CATALOG_CACHE_MS,cacheKey:'catalog:'+path}):request(path);}
async function loadCatalogs(){
  const j=await catalogRequest('/api/ventas/prospeccion/catalogos');
  state.catalogs=j.catalogos||{};
  fillSelect('#vmp-filter-year',state.catalogs.anios||[],'Todos');
  fillSelect('#vmp-filter-status',state.catalogs.estatus||[],'Todos');
  fillSelect('#vmp-filter-state',state.catalogs.estados||[],'Todos');
  fillSelect(
    '#vmp-filter-user',
    (state.catalogs.usuarios||[]).map(u=>({...u,etiqueta:u.iniciales?u.iniciales+' · '+u.nombre:u.nombre})),
    'Todos',
    'id_usuario',
    'etiqueta'
  );
}

function appendLeafletCss(){
  if(document.querySelector('link[data-vmp-leaflet="css"]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=LEAFLET_CSS_URL;
  link.crossOrigin='anonymous';
  link.referrerPolicy='no-referrer';
  link.dataset.vmpLeaflet='css';
  document.head.appendChild(link);
}

function ensureLeaflet(){
  if(window.L)return Promise.resolve(window.L);
  if(state.leafletPromise)return state.leafletPromise;

  state.leafletPromise=new Promise((resolve,reject)=>{
    appendLeafletCss();

    const existing=document.querySelector('script[data-vmp-leaflet="js"]');
    const script=existing||document.createElement('script');
    let settled=false;
    const finish=(callback,value)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timeout);
      callback(value);
    };
    const timeout=setTimeout(()=>{
      state.leafletPromise=null;
      finish(reject,new Error('Tiempo de espera agotado al cargar el componente geográfico.'));
    },12000);

    script.addEventListener('load',()=>{
      if(window.L)finish(resolve,window.L);
      else{
        state.leafletPromise=null;
        finish(reject,new Error('El componente geográfico terminó de cargar, pero no pudo inicializarse.'));
      }
    },{once:true});
    script.addEventListener('error',()=>{
      state.leafletPromise=null;
      finish(reject,new Error('No se pudo descargar el componente geográfico. Verifica el acceso a Internet.'));
    },{once:true});

    if(!existing){
      script.src=LEAFLET_JS_URL;
      script.crossOrigin='anonymous';
      script.referrerPolicy='no-referrer';
      script.dataset.vmpLeaflet='js';
      document.head.appendChild(script);
    }
  });

  return state.leafletPromise;
}

async function ensureMap(){
  await ensureLeaflet();
  if(state.map)return;
  const mapNode=$('#vmp-map');
  if(!mapNode)throw new Error('No se encontró el contenedor del mapa.');
  state.map=window.L.map(mapNode,{zoomControl:true}).setView([23.6345,-102.5528],5);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,
    attribution:'&copy; OpenStreetMap'
  }).addTo(state.map);
  state.layer=window.L.layerGroup().addTo(state.map);
}

function advisor(r){
  return r.usuario_iniciales
    ? `${r.usuario_iniciales} · ${r.usuario_nombre||r.usuario_correo||''}`
    : (r.usuario_nombre||r.usuario_correo||('Usuario '+r.id_usuario));
}

function renderPoints(rows){
  state.layer.clearLayers();
  const bounds=[];
  rows.forEach(r=>{
    const lat=Number(r.latitud),lng=Number(r.longitud);
    if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
    const marker=window.L.marker([lat,lng]).bindPopup(
      '<div class="vmp-popup">'+
      '<strong>'+esc(r.empresa||r.proyecto||'Prospección')+'</strong>'+
      '<span>'+esc(r.proyecto||'—')+'</span>'+
      '<span>'+esc([r.ciudad,r.estado].filter(Boolean).join(', ')||'—')+'</span>'+
      '<span>'+esc(advisor(r))+'</span>'+
      '<span>'+fmtDate(r.fecha_visita)+'</span>'+
      '<span>'+esc(r.estatus||'Sin estatus')+'</span>'+
      '<button type="button" class="vmp-popup-detail" data-vmp-detail="'+Number(r.id_pros)+'">Ver detalle</button>'+
      '</div>'
    );
    state.layer.addLayer(marker);
    if(Number(r.id_pros)===Number(state.targetId)){marker.openPopup();state.map.setView([lat,lng],16);}
    bounds.push([lat,lng]);
  });
  if(bounds.length&&!state.targetId)state.map.fitBounds(bounds,{padding:[30,30],maxZoom:14});
  else state.map.setView([23.6345,-102.5528],5);
  setTimeout(()=>state.map?.invalidateSize(),50);
}

async function load(){
  const counter=$('#vmp-counter');
  setStatus('Consultando Aiven','');
  if(counter)counter.textContent='Consultando ubicaciones…';

  let rows=[];
  try{
    const j=await request('/api/ventas/prospeccion/mapa?'+query());
    rows=Array.isArray(j.puntos)?j.puntos:[];
    setStatus('Aiven conectado · '+rows.length+' puntos','ok');
    if(counter)counter.textContent=rows.length+' visitas con coordenadas';
  }catch(error){
    setStatus('No fue posible consultar Aiven','error');
    if(counter)counter.textContent='No fue posible consultar las ubicaciones: '+error.message;
    return;
  }

  try{
    await ensureMap();
    renderPoints(rows);
  }catch(error){
    setStatus('Aiven conectado · mapa no disponible','map-warning');
    if(counter){
      counter.textContent=rows.length+' puntos consultados. No fue posible iniciar el mapa: '+error.message;
    }
  }
}

function bind(){
  const mapNode=$('#vmp-map');
  if(mapNode)mapNode.addEventListener('click',event=>{
    const button=event.target.closest('[data-vmp-detail]');
    if(!button)return;
    window.ManttoRouter?.go('ventas-prospeccion-detalle',{id_pros:Number(button.dataset.vmpDetail),origen:'ventas-mapa-prospeccion'});
  });
  const refresh=$('#vmp-refresh');
  if(refresh)refresh.onclick=load;
  ['#vmp-filter-year','#vmp-filter-status','#vmp-filter-user','#vmp-filter-state'].forEach(id=>{
    const el=$(id);if(el)el.onchange=load;
  });
  const clear=$('#vmp-clear');
  if(clear)clear.onclick=()=>{
    ['#vmp-filter-year','#vmp-filter-status','#vmp-filter-user','#vmp-filter-state'].forEach(id=>{const el=$(id);if(el)el.value='';});
    load();
  };
}

async function init(payload){
  state.targetId=Number(payload?.id_pros)||null;
  const view=$('#view-ventas-mapa-prospeccion');
  if(!view)return;
  if(!view.dataset.loaded){
    const r=await fetch('./modules/ventas-mapa-prospeccion/ventas-mapa-prospeccion.html?v=20260731-map-fix-v008',{cache:'default'});
    if(!r.ok)throw new Error('No se pudo cargar Mapa Prospección.');
    view.innerHTML=await r.text();
    view.dataset.loaded='1';
    bind();
    try{
      await loadCatalogs();
    }catch(error){
      setStatus('Aiven conectado parcialmente','map-warning');
      const counter=$('#vmp-counter');
      if(counter)counter.textContent='No fue posible cargar los filtros: '+error.message;
    }
  }
  await load();
}

window.ManttoVentasMapaProspeccion={init,refresh:load};
})();
