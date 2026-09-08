(function(){
'use strict';
// [Aster | 2026-08-19 | ASTER-MG | FASE 3 VENTAS: Fotos Mapa por puerta VENTAS]
// [Aster | 2026-09-07 | ASTER-MG | FASE 2 FOTOS CORELLIAN UNITED 7X7 V001]
// [Aster | 2026-09-08 | ASTER-MG | FIX CATALOGO GENERAL CORELLIAN + UNITED V003]
// [Aster | 2026-09-08 | ASTER-MG | FIX CATALOGO GENERAL DOS TABLAS + EQUIVALENCIAS V004]
// [Aster | 2026-09-08 | ASTER-MG | FIX CATALOGO GENERAL GUARDS SOLO NAVEGACION V001]
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
async function safePayload(path){try{return{ok:true,payload:await getJson(path),status:200};}catch(error){return{ok:false,payload:null,status:Number(error&&error.status)||0,error};}}
async function safeSource(path){const result=await safePayload(path);return{ok:result.ok,data:result.ok&&Array.isArray(result.payload&&result.payload.data)?result.payload.data:[],status:result.status};}
function info(url,campo,origen,manageable){if(!url||/\.heic(\?|$)/i.test(String(url)))return null;return{url:String(url).trim(),campo,origen,manageable:manageable!==false};}
function uniquePhotos(items){const seen=new Set();return (Array.isArray(items)?items:[]).filter(item=>{const url=String(item&&item.url||'').trim();if(!url||seen.has(url))return false;seen.add(url);return true;});}
function coreRows(p){return Array.isArray(p&&p.coreRows)?p.coreRows:[];}
function corePhotos(p){
  const items=coreRows(p).flatMap(row=>slots.map((slot,index)=>{
    const item=info(row&&row[slot],dbMap[slot],'CORELLIAN',true);
    if(item)item.label='CORELLIAN · Foto '+(index+1);
    return item;
  }).filter(Boolean));
  return uniquePhotos(items).slice(0,MAX_FOTOS_ORIGEN);
}
function allUnitedPhotos(p){return uniquePhotos((Array.isArray(p&&p.unitedRows)?p.unitedRows:[]).flatMap(row=>[1,2,3,4,5,6,7].map(index=>{const item=info(row&&row['foto_'+index],'foto_'+index,'UNITED',false);if(item)item.label='UNITED · Foto '+index;return item;}).filter(Boolean)));}
function unitedPhotos(p){return allUnitedPhotos(p).slice(0,MAX_FOTOS_ORIGEN);}
function carouselFotos(p){const core=corePhotos(p);const coreUrls=new Set(core.map(item=>item.url));const united=allUnitedPhotos(p).filter(item=>!coreUrls.has(item.url)).slice(0,MAX_FOTOS_ORIGEN);return [...core,...united].slice(0,MAX_FOTOS_CARRUSEL);}
function fotos(p){return carouselFotos(p);}
function principal(p){
  const core=corePhotos(p);
  for(const row of coreRows(p)){
    const direct=String(row&&row.foto_portada||'').trim();
    if(/^https?:\/\//i.test(direct))return info(direct,null,'CORELLIAN',true);
    const sel=String(row&&(row.foto_principal||row['Foto Principal'])||'').trim();
    const coreMatch=core.find(item=>item.campo===sel);
    if(coreMatch)return coreMatch;
  }
  if(core.length)return core[0];
  const united=unitedPhotos(p);
  for(const row of (Array.isArray(p&&p.unitedRows)?p.unitedRows:[])){
    const selected=String(row&&row.foto_principal||'').trim();
    const match=united.find(item=>item.campo===selected||item.url===selected);
    if(match)return match;
  }
  return united[0]||null;
}
function createAccessSets(coreRowsAllowed,unitedRowsAllowed){
  const coreIds=new Set();
  const coreNames=new Set();
  const unitedNames=new Set();
  (Array.isArray(coreRowsAllowed)?coreRowsAllowed:[]).forEach(row=>{
    const id=norm(row&&((row['ID Proyecto']!=null?row['ID Proyecto']:row.id_ppns)||''));
    const name=norm(row&&((row.Proyecto!=null?row.Proyecto:row.proyecto)||''));
    if(id)coreIds.add(id);
    if(name)coreNames.add(name);
  });
  (Array.isArray(unitedRowsAllowed)?unitedRowsAllowed:[]).forEach(row=>{
    const name=norm(row&&row.proyecto_united);
    if(name)unitedNames.add(name);
  });
  return{coreIds,coreNames,unitedNames};
}
function buildCoreCatalog(rows,access){
  const map=new Map();
  (Array.isArray(rows)?rows:[]).forEach((row,index)=>{
    const id=String(row&&((row['ID Proyecto']!=null?row['ID Proyecto']:row.id_ppns)||'')).trim();
    const name=String(row&&((row.Proyecto!=null?row.Proyecto:row.proyecto)||'')).trim();
    const key=id?'ID:'+norm(id):(name?'NAME:'+norm(name):'');
    if(!key)return;
    if(!map.has(key)){
      const stable=id||name||String(index);
      map.set(key,{
        id:id||name,
        coreProjectId:id||name,
        unitedProject:'',
        galleryKey:'core:'+stable,
        proyecto:name||id,
        estado:String(row&&((row.Estado!=null?row.Estado:row.estado)||'')).trim(),
        cliente:String(row&&((row.Cliente!=null?row.Cliente:row.cliente)||'')).trim(),
        equipos:0,
        coreRows:[],
        unitedRows:[],
        coreManaged:true,
        canOpenCorellian:Boolean((id&&access.coreIds.has(norm(id)))||(name&&access.coreNames.has(norm(name)))),
        canOpenUnited:false
      });
    }
    const project=map.get(key);
    project.coreRows.push(row);
    if(!project.proyecto)project.proyecto=name||id;
    if(!project.estado)project.estado=String(row&&((row.Estado!=null?row.Estado:row.estado)||'')).trim();
    if(!project.cliente)project.cliente=String(row&&((row.Cliente!=null?row.Cliente:row.cliente)||'')).trim();
    if((id&&access.coreIds.has(norm(id)))||(name&&access.coreNames.has(norm(name))))project.canOpenCorellian=true;
  });
  return [...map.values()];
}
function mergeUnited(rows,access){
  const byId=new Map();
  const byName=new Map();
  proyectos.forEach(project=>{
    const idKey=norm(project.id);
    const nameKey=norm(project.proyecto);
    if(idKey)byId.set(idKey,project);
    if(nameKey)byName.set(nameKey,project);
  });

  const byUnited=new Map();
  const mergedProjects=new Set();

  (Array.isArray(rows)?rows:[]).forEach((row,index)=>{
    const united=String(row&&row.proyecto_united||'').trim();
    if(!united)return;

    // La unión entre dominios SOLO existe cuando proyecto_equivalencias
    // entregó proyecto_corellian. Coincidencias de nombre no generan cruce.
    const related=norm(row&&row.proyecto_corellian);
    let project=related?(byId.get(related)||byName.get(related)||null):null;

    const unitedKey=norm(united);
    if(!project)project=byUnited.get(unitedKey)||null;

    if(!project){
      project={
        id:'united:'+united,
        coreProjectId:'',
        unitedProject:united,
        galleryKey:'united:'+unitedKey+':'+index,
        proyecto:String(row&&row.nombre_publico||'').trim()||united,
        estado:String(row&&row.estado||'').trim(),
        cliente:String(row&&row.cliente||'').trim(),
        equipos:0,
        coreRows:[],
        unitedRows:[],
        coreManaged:false,
        canOpenCorellian:false,
        canOpenUnited:access.unitedNames.has(unitedKey)
      };
      proyectos.push(project);
    }else if(related&&coreRows(project).length){
      mergedProjects.add(String(project.galleryKey));
    }

    if(!byUnited.has(unitedKey))byUnited.set(unitedKey,project);
    project.unitedProject=project.unitedProject||united;
    project.unitedRows.push(row);
    if(access.unitedNames.has(unitedKey))project.canOpenUnited=true;
    if(!project.estado)project.estado=String(row&&row.estado||'').trim();
    if(!project.cliente)project.cliente=String(row&&row.cliente||'').trim();
  });

  return{merged:mergedProjects.size};
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
      // El Catálogo General no usa el botón genérico del lightbox. Los botones
      // de navegación se muestran en la ficha únicamente cuando el guard del
      // origen autorizó ese proyecto.
      showProjectLink:false,
      projectOptions:{template:'cliente-unificado',source:'ventas-fotos-mapa',projectName:p.proyecto,cliente:p.cliente||''},
      onPhotoChange:change=>{
        const item=change&&change.item;
        const row=coreRows(p)[0]||null;
        if(row&&item&&item.manageable!==false&&item.campo&&item.url){
          const ui=Object.keys(dbMap).find(key=>dbMap[key]===item.campo);
          if(ui)row[ui]=item.url;
          if(change.type==='principal'||change.principalUrl===item.url)row.foto_principal=item.campo;
        }
        if(row&&change&&change.principalUrl)row.foto_portada=change.principalUrl;
        render();
      },
      allowAdd:p.coreManaged!==false,
      allowSetPrincipal:p.coreManaged!==false,
      managedPhotoLimit:7
    }
  );
  syncCarouselProjectLinks(p);
}
function openCoreProject(p){
  if(!p||!p.canOpenCorellian)return;
  if(!window.ManttoDetails||typeof window.ManttoDetails.openProyecto!=='function')return;
  window.ManttoDetails.openProyecto(p.coreProjectId||p.id||p.proyecto,{template:'cliente-unificado',source:'ventas-fotos-mapa',projectName:p.proyecto,cliente:p.cliente||''});
}
function openUnitedProject(p){
  if(!p||!p.canOpenUnited||!p.unitedProject)return;
  if(!window.ManttoDetails||typeof window.ManttoDetails.openProyecto!=='function')return;
  // Portafolio abre el detalle UNITED con el nombre de proyecto.
  window.ManttoDetails.openProyecto(p.unitedProject);
}
function syncCarouselProjectLinks(p){
  const base=document.getElementById('mg-photo-project');
  if(!base||!base.parentElement)return;
  const parent=base.parentElement;
  parent.querySelectorAll('[data-vfm-project-link]').forEach(node=>node.remove());
  base.hidden=true;

  const addButton=(label,handler)=>{
    const button=base.cloneNode(true);
    button.id='';
    button.hidden=false;
    button.textContent=label;
    button.setAttribute('data-vfm-project-link','1');
    button.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      handler(p);
    });
    parent.appendChild(button);
  };

  if(p.canOpenCorellian)addButton('Ir a proyecto CORELLIAN',openCoreProject);
  if(p.canOpenUnited)addButton('Ir a proyecto UNITED',openUnitedProject);
}
function populate(){const vals=[...new Set(proyectos.filter(p=>fotos(p).length).map(p=>p.estado).filter(Boolean))].sort();const el=document.getElementById('vfm-estado');if(!el)return;const previous=el.value;el.innerHTML='<option value="">Todos los estados</option>'+vals.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');if(vals.includes(previous))el.value=previous;}
function render(){
  const rowsWithPhoto=proyectos.filter(p=>fotos(p).length);
  const withPhoto=rowsWithPhoto.length;
  const merged=rowsWithPhoto.filter(p=>coreRows(p).length&&Array.isArray(p.unitedRows)&&p.unitedRows.length).length;
  const kpis=document.getElementById('vfm-kpis');
  if(kpis)kpis.innerHTML='<div class="py-card"><div class="label">Proyectos con fotografía</div><div class="value" style="color:var(--accent)">'+withPhoto+'</div></div><div class="py-card"><div class="label">Carretes unidos por equivalencia</div><div class="value">'+merged+'</div></div>';
  const q=(document.getElementById('vfm-buscar')&&document.getElementById('vfm-buscar').value||'').trim().toUpperCase();
  const state=document.getElementById('vfm-estado')&&document.getElementById('vfm-estado').value||'';
  const box=document.getElementById('vfm-galeria');
  if(!box)return;
  let rows=rowsWithPhoto.filter(p=>(!state||p.estado===state));
  if(q)rows=rows.filter(p=>[p.proyecto,p.id,p.coreProjectId,p.unitedProject,p.cliente].some(v=>String(v||'').toUpperCase().includes(q)));
  rows.sort((a,b)=>String(a.estado||'').localeCompare(String(b.estado||''),'es',{sensitivity:'base'}) || String(a.proyecto).localeCompare(String(b.proyecto),'es',{sensitivity:'base'}));
  if(!rows.length){box.innerHTML='<div class="py-empty">No hay proyectos con fotografías para los criterios seleccionados.</div>';return;}
  const grupos=new Map();
  rows.forEach(p=>{const key=String(p.estado||'Sin estado').trim()||'Sin estado';if(!grupos.has(key))grupos.set(key,[]);grupos.get(key).push(p);});
  box.innerHTML=[...grupos.entries()].map(([estado,items])=>'<div class="py-foto-grupo"><div class="py-foto-grupo-title">'+esc(estado)+' <span class="count">('+items.length+')</span></div><div class="py-foto-mosaico">'+items.map(p=>{const img=principal(p);return img?'<div class="py-foto-tile" role="button" tabindex="0" data-gallery-key="'+esc(p.galleryKey)+'"><img src="'+esc(img.url)+'" loading="lazy" alt="'+esc(p.proyecto)+'"><div class="nombre">'+esc(p.proyecto)+'</div><div class="n-fotos">'+fotos(p).length+' foto(s)</div>'+'</div>':'';}).join('')+'</div></div>').join('');
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

  // 1) La puerta GENERAL carga ambas tablas fotográficas sin aplicar los
  //    alcances CORELLIAN/UNITED a la visibilidad de fotos.
  // 2) Los endpoints históricos por origen se consultan únicamente para saber
  //    si el usuario puede navegar al proyecto de ese origen.
  const [generalResult,coreNavigation,unitedNavigation]=await Promise.all([
    safePayload('/api/ventas/fotos-mapa/catalogo-general/fotografias?limit=5000'),
    safeSource('/api/ventas/fotos-mapa/catalogo-general/navegacion-corellian?limit=5000&solo_con_fotos=1'),
    safeSource('/api/ventas/fotos-mapa/catalogo-general/navegacion-united?limit=5000')
  ]);

  if(!generalResult.ok){
    proyectos=[];
    populate();
    render();
    setStatus(generalResult.status===403?'Sin acceso a Catálogo General':'No fue posible cargar Catálogo General');
    return;
  }

  const data=generalResult.payload&&generalResult.payload.data||{};
  const generalCore=Array.isArray(data.corellian)?data.corellian:[];
  const generalUnited=Array.isArray(data.united)?data.united:[];
  const access=createAccessSets(coreNavigation.data,unitedNavigation.data);

  proyectos=buildCoreCatalog(generalCore,access);
  const mergeSummary=mergeUnited(generalUnited,access);

  populate();
  render();

  const withPhoto=proyectos.filter(p=>fotos(p).length).length;
  setStatus('Aiven conectado · Catálogo General · '+withPhoto+' proyectos · '+mergeSummary.merged+' carrete(s) unido(s)');
}
async function mount(force){const view=document.getElementById('view-ventas-fotos-mapa');if(!view)return false;const contextTitle=document.getElementById('app-context-title');if(contextTitle)contextTitle.textContent='Catálogo General';if(force)view.dataset.ready='0';if(view.dataset.ready!=='1'){const r=await fetch('./modules/ventas-fotos-mapa/ventas-fotos-mapa.html?v=20260908-catalogo-general-v003',{cache:'default'});if(!r.ok)throw new Error('No se pudo cargar Catálogo General.');view.innerHTML=await r.text();view.dataset.ready='1';const search=document.getElementById('vfm-buscar');if(search)search.addEventListener('input',render);const state=document.getElementById('vfm-estado');if(state)state.addEventListener('change',render);await load();}return true;}
const api={init:()=>mount(false),reload:()=>load()};
window.ManttoVentasFotosMapa=api;
window.ManttoFotografiasCatalogoGeneral=api;
})();
