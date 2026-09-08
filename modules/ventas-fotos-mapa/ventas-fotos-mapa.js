(function(){
'use strict';
// [Aster | 2026-08-19 | ASTER-MG | FASE 3 VENTAS: Fotos Mapa por puerta VENTAS]
// [Aster | 2026-09-07 | ASTER-MG | FASE 2 FOTOS CORELLIAN UNITED 7X7 V001]
// [Aster | 2026-09-08 | ASTER-MG | FIX CATALOGO GENERAL CORELLIAN + UNITED V003]
let proyectos=[];
const API=(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
const MAX_FOTOS_ORIGEN=7;
const MAX_FOTOS_CARRUSEL=MAX_FOTOS_ORIGEN*2;
const slots=['FOTO BLT','FOTO BLT 2','FOTO BLT 3','FOTO BLT 4','FOTO BLT 5','FOTO BLT 6','FOTO BLT 7'];
const dbMap={'FOTO BLT':'foto_blt_1','FOTO BLT 2':'foto_blt_2','FOTO BLT 3':'foto_blt_3','FOTO BLT 4':'foto_blt_4','FOTO BLT 5':'foto_blt_5','FOTO BLT 6':'foto_blt_6','FOTO BLT 7':'foto_blt_7'};
const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const norm=v=>String(v==null?'':v).trim().toUpperCase();
const headers=()=>Object.assign({'Accept':'application/json'},window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{});
async function getJson(path){const r=await fetch(API+path,{headers:headers(),cache:'no-store'});const t=await r.text();let j;try{j=t?JSON.parse(t):{};}catch(e){throw new Error('El backend respondió contenido no JSON.');}if(!r.ok||j.ok===false){const error=new Error(j.message||j.error||('Error HTTP '+r.status));error.status=r.status;throw error;}return j;}
async function safeSource(path){try{const payload=await getJson(path);return{ok:true,data:Array.isArray(payload.data)?payload.data:[],status:200};}catch(error){return{ok:false,data:[],status:Number(error&&error.status)||0};}}
function info(url,campo,origen,manageable){if(!url||/\.heic(\?|$)/i.test(String(url)))return null;return{url:String(url).trim(),campo,origen,manageable:manageable!==false};}
function uniquePhotos(items){const seen=new Set();return (Array.isArray(items)?items:[]).filter(item=>{const url=String(item?.url||'').trim();if(!url||seen.has(url))return false;seen.add(url);return true;});}
function corePhotos(p){return uniquePhotos(slots.map((slot,index)=>{const item=info(p[slot],dbMap[slot],'CORELLIAN',true);if(item)item.label='CORELLIAN · Foto '+(index+1);return item;}).filter(Boolean)).slice(0,MAX_FOTOS_ORIGEN);}
function allUnitedPhotos(p){return uniquePhotos((Array.isArray(p.unitedRows)?p.unitedRows:[]).flatMap(row=>[1,2,3,4,5,6,7].map(index=>{const item=info(row['foto_'+index],'foto_'+index,'UNITED',false);if(item)item.label='UNITED · Foto '+index;return item;}).filter(Boolean)));}
function unitedPhotos(p){return allUnitedPhotos(p).slice(0,MAX_FOTOS_ORIGEN);}
function carouselFotos(p){const core=corePhotos(p);const coreUrls=new Set(core.map(item=>item.url));const united=allUnitedPhotos(p).filter(item=>!coreUrls.has(item.url)).slice(0,MAX_FOTOS_ORIGEN);return [...core,...united].slice(0,MAX_FOTOS_CARRUSEL);}
function fotos(p){return carouselFotos(p);}
function principal(p){const core=corePhotos(p);const direct=String(p.foto_portada||'').trim();if(/^https?:\/\//i.test(direct))return info(direct,null,'CORELLIAN',true);const sel=String(p.foto_principal||p['Foto Principal']||'').trim();const coreMatch=core.find(item=>item.campo===sel);if(coreMatch)return coreMatch;if(core.length)return core[0];const united=unitedPhotos(p);const unitedSelected=String((p.unitedRows?.[0]||{}).foto_principal||'').trim();return united.find(item=>item.campo===unitedSelected||item.url===unitedSelected)||united[0]||null;}
function build(rows){const map=new Map();(Array.isArray(rows)?rows:[]).forEach(r=>{const id=String(r.id_proyecto||'').trim();if(!id)return;if(!map.has(id))map.set(id,{id,galleryKey:'core:'+id,proyecto:r.proyecto||'',estado:r.estado||'',cliente:r.cliente||'',equipos:0,unitedRows:[],coreManaged:true});map.get(id).equipos++;});return[...map.values()];}
function mergeUnited(rows){
  const byId=new Map(proyectos.map(project=>[norm(project.id),project]));
  const byName=new Map(proyectos.map(project=>[norm(project.proyecto),project]));
  const byUnited=new Map();
  (Array.isArray(rows)?rows:[]).forEach((row,index)=>{
    const related=norm(row.proyecto_corellian);
    const united=String(row.proyecto_united||'').trim();
    if(!united)return;
    const unitedKey=norm(united);
    let project=related?(byId.get(related)||byName.get(related)):null;
    if(!project)project=byUnited.get(unitedKey)||null;
    if(!project){
      project={id:'united:'+united,galleryKey:'united:'+united,proyecto:row.nombre_publico||united,estado:row.estado||'',cliente:row.cliente||'',equipos:0,unitedRows:[],coreManaged:false};
      proyectos.push(project);
    }
    if(!byUnited.has(unitedKey))byUnited.set(unitedKey,project);
    project.unitedRows.push(row);
  });
}
function openPhotoCarousel(p){
  const photos=carouselFotos(p);
  if(!photos.length)return;
  if(!window.ManttoDetails||typeof window.ManttoDetails.openProjectPhotos!=='function'){
    window.alert('No fue posible abrir el carrusel de fotografías.');
    return;
  }
  const main=principal(p);
  window.ManttoDetails.openProjectPhotos(
    p.id||p.proyecto,
    p.proyecto,
    photos,
    (main&&main.url)||photos[0].url,
    {
      showProjectLink:p.coreManaged!==false,
      projectOptions:{template:'cliente-unificado',source:'ventas-fotos-mapa',projectName:p.proyecto,cliente:p.cliente||''},
      onPhotoChange:change=>{
        const item=change&&change.item;
        if(item&&item.manageable!==false&&item.campo&&item.url){
          const ui=Object.keys(dbMap).find(key=>dbMap[key]===item.campo);
          if(ui)p[ui]=item.url;
          if(change.type==='principal'||change.principalUrl===item.url)p.foto_principal=item.campo;
        }
        if(change&&change.principalUrl)p.foto_portada=change.principalUrl;
        render();
      },
      allowAdd:p.coreManaged!==false,
      allowSetPrincipal:p.coreManaged!==false,
      managedPhotoLimit:7
    }
  );
}
function populate(){const vals=[...new Set(proyectos.filter(p=>fotos(p).length).map(p=>p.estado).filter(Boolean))].sort();const el=document.getElementById('vfm-estado');if(!el)return;const previous=el.value;el.innerHTML='<option value="">Todos los estados</option>'+vals.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');if(vals.includes(previous))el.value=previous;}
function render(){
  const total=proyectos.length;
  const withPhoto=proyectos.filter(p=>fotos(p).length).length;
  const kpis=document.getElementById('vfm-kpis');
  if(kpis)kpis.innerHTML='<div class="py-card"><div class="label">Proyectos con fotografía</div><div class="value" style="color:var(--accent)">'+withPhoto+'</div></div><div class="py-card"><div class="label">% del total</div><div class="value">'+(total?Math.round(withPhoto/total*100):0)+'%</div></div>';
  const q=(document.getElementById('vfm-buscar')?.value||'').trim().toUpperCase();
  const state=document.getElementById('vfm-estado')?.value||'';
  const box=document.getElementById('vfm-galeria');
  if(!box)return;
  let rows=proyectos.filter(p=>fotos(p).length && (!state || p.estado===state));
  if(q)rows=rows.filter(p=>[p.proyecto,p.id,p.cliente].some(v=>String(v||'').toUpperCase().includes(q)));
  rows.sort((a,b)=>String(a.estado||'').localeCompare(String(b.estado||''),'es',{sensitivity:'base'}) || String(a.proyecto).localeCompare(String(b.proyecto),'es',{sensitivity:'base'}));
  if(!rows.length){box.innerHTML='<div class="py-empty">No hay proyectos con fotografías para los criterios seleccionados.</div>';return;}
  const grupos=new Map();
  rows.forEach(p=>{const key=String(p.estado||'Sin estado').trim()||'Sin estado';if(!grupos.has(key))grupos.set(key,[]);grupos.get(key).push(p);});
  box.innerHTML=[...grupos.entries()].map(([estado,items])=>'<div class="py-foto-grupo"><div class="py-foto-grupo-title">'+esc(estado)+' <span class="count">('+items.length+')</span></div><div class="py-foto-mosaico">'+items.map(p=>{const img=principal(p);return img?'<div class="py-foto-tile" role="button" tabindex="0" data-gallery-key="'+esc(p.galleryKey)+'"><img src="'+esc(img.url)+'" loading="lazy" alt="'+esc(p.proyecto)+'"><div class="nombre">'+esc(p.proyecto)+'</div><div class="n-fotos">'+fotos(p).length+' foto(s)</div></div>':'';}).join('')+'</div></div>').join('');
  box.querySelectorAll('[data-gallery-key]').forEach(el=>{
    const p=rows.find(x=>String(x.galleryKey)===String(el.dataset.galleryKey));
    if(!p)return;
    el.addEventListener('click',()=>openPhotoCarousel(p));
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPhotoCarousel(p);}});
  });
}
function setStatus(text){const s=document.getElementById('vfm-aiven-status');if(s)s.innerHTML='<span class="py-connection-dot"></span><span>'+esc(text)+'</span>';}
async function load(){
  setStatus('Actualizando Catálogo General...');
  const [coreBase,coreGallery,unitedGallery]=await Promise.all([
    safeSource('/api/ventas/fotos-mapa/proyectos?limit=5000'),
    safeSource('/api/ventas/fotos-mapa/proyectos/fotografias?limit=5000'),
    safeSource('/api/ventas/fotos-mapa/proyectos-united/fotografias?limit=5000')
  ]);

  proyectos=build(coreBase.data);
  if(coreGallery.ok){
    const photoMap=new Map(coreGallery.data.map(x=>[String(x['ID Proyecto']||'').trim(),x]));
    proyectos.forEach(p=>Object.assign(p,photoMap.get(p.id)||{}));
  }
  if(unitedGallery.ok)mergeUnited(unitedGallery.data);

  populate();
  render();

  const withPhoto=proyectos.filter(p=>fotos(p).length).length;
  const coreReady=coreBase.ok&&coreGallery.ok;
  const unitedReady=unitedGallery.ok;
  if(coreReady&&unitedReady)setStatus('Aiven conectado · CORELLIAN + UNITED · '+withPhoto+' con foto');
  else if(coreReady)setStatus('Catálogo parcial · CORELLIAN autorizado · '+withPhoto+' con foto');
  else if(unitedReady)setStatus('Catálogo parcial · UNITED autorizado · '+withPhoto+' con foto');
  else setStatus('Sin información fotográfica autorizada disponible');
}
async function mount(force){const view=document.getElementById('view-ventas-fotos-mapa');if(!view)return false;if(force)view.dataset.ready='0';if(view.dataset.ready!=='1'){const r=await fetch('./modules/ventas-fotos-mapa/ventas-fotos-mapa.html?v=20260908-catalogo-general-v003',{cache:'default'});if(!r.ok)throw new Error('No se pudo cargar Catálogo General.');view.innerHTML=await r.text();view.dataset.ready='1';document.getElementById('vfm-buscar')?.addEventListener('input',render);document.getElementById('vfm-estado')?.addEventListener('change',render);await load();}return true;}
const api={init:()=>mount(false),reload:()=>load()};
window.ManttoVentasFotosMapa=api;
window.ManttoFotografiasCatalogoGeneral=api;
})();
