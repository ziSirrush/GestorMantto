(function(){
'use strict';
// [Aster | 2026-08-19 | ASTER-MG | FASE 3 VENTAS: Fotos Mapa por puerta VENTAS]
// [Aster | 2026-09-07 | ASTER-MG | FASE 2 FOTOS CORELLIAN UNITED 7X7 V001]
// [Aster | 2026-09-08 | ASTER-MG | FIX CATALOGO GENERAL CORELLIAN + UNITED V003]
// [Aster | 2026-09-08 | ASTER-MG | FIX CATALOGO GENERAL DOS TABLAS + EQUIVALENCIAS V004]
// [Aster | 2026-09-08 | ASTER-MG | FIX CATALOGO GENERAL GUARDS SOLO NAVEGACION V001]
// [INT-10 | 2026-10-16 | FASE 2 OPERACIONAL | FUENTES REALES Y SINCRONIZACION SELECTIVA V001]
// [INT-10 | 2026-10-16 | FASE 3 OPERACIONAL | GUARDAS, VISOR Y CACHE GLOBAL V001]
// Preserva la Fase 1 (mapa) y el contrato de origen (CORELLIAN/UNITED).
let proyectos=[];
let int10CatalogoCore = [];
let int10CatalogoUnited = [];
let int10Accesos = { coreIds:new Set(), coreNames:new Set(), unitedNames:new Set() };
let int10RevisionCatalogo = 0;
let int10RevisionIdentidad = 0;
const int10RevisionesFotos = new Map();
const INT10_TAMANO_PAGINA = 500;
const INT10_MAX_PAGINAS = 100;

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
    // La galeria GENERAL es legible, pero no habilita la edicion de registros fuera del alcance COR.
    const item=info(row&&row[slot],dbMap[slot],'CORELLIAN',p.canOpenCorellian===true);
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
    if(/^https?:\/\//i.test(direct))return info(direct,null,'CORELLIAN',p.canOpenCorellian===true);
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
function puedeNavegarCorellian(id,nombre,access){
  // Cuando existe un ID canonico, un nombre homonimo NO autoriza otro ID.
  // Solo se usa el nombre cuando el origen carece de identificador.
  const key=norm(id);
  if(key)return access.coreIds.has(key);
  return Boolean(nombre&&access.coreNames.has(norm(nombre)));
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
        ciudad:String(row&&((row.Ciudad!=null?row.Ciudad:row.ciudad)||'')).trim(),
        cliente:String(row&&((row.Cliente!=null?row.Cliente:row.cliente)||'')).trim(),
        equipos:0,
        coreRows:[],
        unitedRows:[],
        coreManaged:true,
        canOpenCorellian:puedeNavegarCorellian(id,name,access),
        canOpenUnited:false
      });
    }
    const project=map.get(key);
    project.coreRows.push(row);
    if(!project.proyecto)project.proyecto=name||id;
    if(!project.estado)project.estado=String(row&&((row.Estado!=null?row.Estado:row.estado)||'')).trim();
    if(!project.ciudad)project.ciudad=String(row&&((row.Ciudad!=null?row.Ciudad:row.ciudad)||'')).trim();
    if(!project.cliente)project.cliente=String(row&&((row.Cliente!=null?row.Cliente:row.cliente)||'')).trim();
    if(puedeNavegarCorellian(id,name,access))project.canOpenCorellian=true;
  });
  return [...map.values()];
}
function mergeUnited(rows,access){
  const byId=new Map();
  const byName=new Map();
  const nombresAmbiguos=new Set();
  proyectos.forEach(project=>{
    const idKey=norm(project.id);
    const nameKey=norm(project.proyecto);
    if(idKey)byId.set(idKey,project);
    if(nameKey){
      if(byName.has(nameKey))nombresAmbiguos.add(nameKey);
      else byName.set(nameKey,project);
    }
  });

  const byUnited=new Map();
  const mergedProjects=new Set();

  (Array.isArray(rows)?rows:[]).forEach((row,index)=>{
    const united=String(row&&row.proyecto_united||'').trim();
    if(!united)return;

    // La unión entre dominios SOLO existe cuando proyecto_equivalencias
    // entregó proyecto_corellian. Coincidencias de nombre no generan cruce.
    const related=norm(row&&row.proyecto_corellian);
    // Una equivalencia por nombre ambiguo NO vincula proyectos distintos.
    let project=related?(byId.get(related)||(!nombresAmbiguos.has(related)&&byName.get(related))||null):null;

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
        ciudad:String(row&&row.ciudad||'').trim(),
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
    if(!project.ciudad)project.ciudad=String(row&&row.ciudad||'').trim();
    if(!project.cliente)project.cliente=String(row&&row.cliente||'').trim();
  });

  return{merged:mergedProjects.size};
}
// Refresco inmediato SOLO del proyecto CORELLIAN modificado; no repetir la
// consulta completa ni usar el estado optimista del carrusel como verdad final.
function reconstruirCatalogoInt10(){
  proyectos=buildCoreCatalog(int10CatalogoCore,int10Accesos);
  const resumen=mergeUnited(int10CatalogoUnited,int10Accesos);
  populate();
  render();
  return resumen;
}
function idCoreFilaInt10(row){
  return norm(row&&((row['ID Proyecto']!=null?row['ID Proyecto']:row.id_ppns)||''));
}
async function refrescarProyectoFotografiasInt10(idProyecto){
  const id=String(idProyecto||'').trim();
  if(!id)return;
  const key=norm(id);
  const revisionGlobal=int10RevisionCatalogo;
  const revisionLocal=(int10RevisionesFotos.get(key)||0)+1;
  int10RevisionesFotos.set(key,revisionLocal);
  try{
    const respuesta=await getJson('/api/ventas/fotos-mapa/catalogo-general/fotografias?limit=5000&core_project='+encodeURIComponent(id));
    if(revisionGlobal!==int10RevisionCatalogo||revisionLocal!==int10RevisionesFotos.get(key))return;
    const nuevos=respuesta&&respuesta.data&&respuesta.data.corellian;
    if(!Array.isArray(nuevos)||norm(respuesta&&respuesta.filters&&respuesta.filters.core_project)!==key){
      throw new Error('La API no confirmo el filtro selectivo de proyecto.');
    }
    if(nuevos.some(fila=>idCoreFilaInt10(fila)!==key)){
      throw new Error('La API devolvio fotografias de un proyecto diferente.');
    }
    int10CatalogoCore=[...int10CatalogoCore.filter(fila=>idCoreFilaInt10(fila)!==key),...nuevos];
    const resumen=reconstruirCatalogoInt10();
    const visibles=proyectos.filter(p=>fotos(p).length).length;
    setStatus('Catálogo General actualizado · '+visibles+' proyectos · '+resumen.merged+' carrete(s) unido(s)');
  }catch(error){
    if(revisionGlobal!==int10RevisionCatalogo||revisionLocal!==int10RevisionesFotos.get(key))return;
    // Sin datos inventados ni reemplazo erroneo de las imagenes guardadas.
    console.warn('[INT-10 FASE 2] No se pudo recargar el proyecto modificado:',error);
    setStatus('Fotografía guardada · Actualiza el catálogo para confirmar el cambio');
  }
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
        // ManttoDetails notifica SOLO despues de confirmar la mutacion con
        // el backend (agregar, principal, eliminar). Refresco selectivo inmediato.
        if(change&&['added','deleted','principal'].includes(change.type)){
          void refrescarProyectoFotografiasInt10(p.coreProjectId);
        }
      },
      // El boton de administrar no aparece por el solo acceso a GENERAL.
      // core/details.js y el backend vuelven a validar el rol y alcance efectivo.
      allowAdd:p.coreManaged!==false&&p.canOpenCorellian===true,
      allowSetPrincipal:p.coreManaged!==false&&p.canOpenCorellian===true,
      managedPhotoLimit:7,
      photoDomain:'CORELLIAN'
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
function renderListadoOriginal(){
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
// [INT-10 | 16/10/2026 | FASE 1 OPERACIONAL | FOTOGRAFIAS: MAPA POR ESTADOS]
// Se conserva el catalogo, las consultas y el carrusel del Gestor principal.
// Solo se cambia la representacion visual del mismo conjunto de proyectos.
let mexicoMapa = { viewBox: '0 0 793 498', estados: [], creditos: '' };
let mexicoEstadoSeleccionado = null; // null: mapa; '__otros': estado no reconocido
let mexicoAliases = new Map();
let mexicoAssetsPromise = null;
const MEXICO_ASSET_VERSION = '20261016-int10-fase1-v001';
const normalizarMexico = valor => String(valor == null ? '' : valor)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function prepararAliasesMexico() {
  const mapa = new Map();
  mexicoMapa.estados.forEach(estado => mapa.set(normalizarMexico(estado.name), estado.id));
  [
    ['cdmx', 'cmx'], ['distrito federal', 'cmx'], ['df', 'cmx'],
    ['ciudad de mexico', 'cmx'], ['mexico city', 'cmx'],
    ['edo de mexico', 'mex'], ['edomex', 'mex'], ['estado de mexico', 'mex'], ['mexico', 'mex'],
    ['coahuila de zaragoza', 'coa'], ['michoacan de ocampo', 'mic'],
    ['veracruz de ignacio de la llave', 'ver'], ['q roo', 'roo'],
    ['bc', 'bcn'], ['bcs', 'bcs'], ['nl', 'nle'], ['qro', 'que'], ['slp', 'slp']
  ].forEach(([nombre, id]) => mapa.set(nombre, id));
  // La fotografia CORELLIAN usa codigos en ins_fl.estado, mientras que UNITED
  // usa nombres en portafolio.estado. Se mantienen ambos sin alterar Aiven.
  [
    ['AGU','agu'],['AGS','agu'],['BCN','bcn'],['BCS','bcs'],['CAM','cam'],
    ['CHP','chp'],['CHH','chh'],['COA','coa'],['COL','col'],['DUR','dur'],
    ['GUA','gua'],['GTO','gua'],['GRO','gro'],['HID','hid'],['JAL','jal'],
    ['EDO','mex'],['EDO MEX','mex'],['MIC','mic'],['MICH','mic'],['MOR','mor'],
    ['NAY','nay'],['NLE','nle'],['OAX','oax'],['PUE','pue'],['QUE','que'],
    ['ROO','roo'],['QROO','roo'],['SLP','slp'],['SIN','sin'],['SON','son'],
    ['TAB','tab'],['TAM','tam'],['TLA','tla'],['VER','ver'],['YUC','yuc'],
    ['ZAC','zac'],['CMX','cmx']
  ].forEach(([codigo,id])=>mapa.set(normalizarMexico(codigo),id));
  mexicoAliases = mapa;
}

async function asegurarMapaMexico() {
  if (mexicoMapa.estados.length === 32) return true;
  if (mexicoAssetsPromise) return mexicoAssetsPromise;
  mexicoAssetsPromise = (async () => {
    // Los recursos pertenecen a Fotografias; no requieren editar el loader global.
    // El mapa se carga al abrir el modulo y el CSS se aísla en un archivo nuevo.
    if (!document.getElementById('vfm-mexico-fase1-css')) {
      await new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.id = 'vfm-mexico-fase1-css';
        link.rel = 'stylesheet';
        link.href = './modules/ventas-fotos-mapa/ventas-fotos-mapa-mexico.css?v=' + MEXICO_ASSET_VERSION;
        link.onload = resolve;
        link.onerror = () => { link.remove(); reject(new Error('No se pudo cargar el CSS del mapa.')); };
        document.head.appendChild(link);
      });
    }
    if (!window.ManttoMexicoEstados) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = './modules/ventas-fotos-mapa/mexico-estados.js?v=' + MEXICO_ASSET_VERSION;
        script.onload = resolve;
        script.onerror = () => { script.remove(); reject(new Error('No se pudo cargar la geometria del mapa.')); };
        document.head.appendChild(script);
      });
    }
    const candidato = window.ManttoMexicoEstados;
    if (!candidato || !Array.isArray(candidato.estados)
        || candidato.estados.length !== 32
        || new Set(candidato.estados.map(e => e.id)).size !== 32) {
      throw new Error('Geometria del mapa incompleta (se requieren 32 estados distintos).');
    }
    mexicoMapa = candidato;
    prepararAliasesMexico();
    return true;
  })().catch(error => {
    console.warn('[INT-10 FASE 1] Se conserva el listado anterior:', error);
    mexicoAssetsPromise = null;
    return false;
  });
  return mexicoAssetsPromise;
}

function idEstadoMexico(proyecto) {
  const estado=normalizarMexico(proyecto&&proyecto.estado);
  // NO asumir que MEX significa Estado de Mexico: el respaldo ins_fl
  // 07/10/2026 mezcla CDMX y municipios mexiquenses bajo ese codigo.
  // El campo Ciudad permite resolver casos comprobados; sin evidencia,
  // el proyecto se conserva en 'Sin estado reconocido'.
  if(estado==='mex'){
    const ciudad=normalizarMexico(proyecto&&proyecto.ciudad);
    if(['cdmx','ciudad de mexico','distrito federal'].includes(ciudad))return 'cmx';
    if([
      'huixquilucan','atizapan de zaragoza','naucalpan','tlalnepantla',
      'toluca','cuautitlan izcalli','metepec','jilotzingo',
      'nezahualcoyotl','valle de bravo','san salvador atenco','coacalco'
    ].includes(ciudad))return 'mex';
    return null;
  }
  return mexicoAliases.get(estado)||null;
}
function nombreEstadoMexico(id) {
  const estado = mexicoMapa.estados.find(e => e.id === id);
  return estado ? estado.name : (id === '__otros' ? 'Sin estado reconocido' : String(id || ''));
}
function baldosasMexico(proyectosEstado) {
  return proyectosEstado.map(proyecto => {
    const imagen = principal(proyecto);
    if (!imagen) return '';
    return '<div class="py-foto-tile" role="button" tabindex="0" data-gallery-key="'
      + esc(proyecto.galleryKey) + '"><img src="' + esc(imagen.url)
      + '" loading="lazy" alt="' + esc(proyecto.proyecto)
      + '"><div class="nombre">' + esc(proyecto.proyecto)
      + '</div><div class="n-fotos">' + fotos(proyecto).length + ' foto(s)</div></div>';
  }).join('');
}
function enlazarBaldosasMexico(contenedor, proyectosEstado) {
  contenedor.querySelectorAll('[data-gallery-key]').forEach(elemento => {
    const proyecto = proyectosEstado.find(p => String(p.galleryKey) === String(elemento.dataset.galleryKey));
    if (!proyecto) return;
    elemento.addEventListener('click', () => openPhotoCarousel(proyecto));
    elemento.addEventListener('keydown', evento => {
      if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault();
        openPhotoCarousel(proyecto);
      }
    });
  });
}
function seleccionarEstadoMexico(id) {
  mexicoEstadoSeleccionado = id || null;
  const buscador = document.getElementById('vfm-buscar');
  if (buscador && !mexicoEstadoSeleccionado) buscador.value = '';
  render();
  const galeria = document.getElementById('vfm-galeria');
  if (galeria && galeria.scrollIntoView) galeria.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
function dibujarMapaMexico(contenedor, gruposEstado, otros, total) {
  const maximo = Math.max(1, ...mexicoMapa.estados.map(e => (gruposEstado.get(e.id) || []).length));
  const nivel = n => n ? Math.min(4, Math.max(1, Math.ceil(4 * n / maximo))) : 0;
  const geometria = mexicoMapa.estados.map(estado => {
    const cantidad = (gruposEstado.get(estado.id) || []).length;
    return '<path class="vfm-estado" data-estado="' + esc(estado.id)
      + '" data-level="' + nivel(cantidad)
      + '" tabindex="0" role="button" aria-label="'
      + esc(estado.name + ': ' + cantidad + ' proyecto(s) con fotografías')
      + '" d="' + esc(estado.path) + '"></path>';
  }).join('');
  const ranking = mexicoMapa.estados
    .map(e => ({ estado: e, cantidad: (gruposEstado.get(e.id) || []).length }))
    .filter(x => x.cantidad)
    .sort((a, b) => b.cantidad - a.cantidad || a.estado.name.localeCompare(b.estado.name, 'es'));
  contenedor.innerHTML =
    '<div class="vfm-mapa-layout">' +
      '<div class="vfm-mapa-card"><div class="vfm-mapa-titulo">Selecciona un estado <span>· '
      + total + ' proyecto(s) con fotografías</span></div>' +
        '<div class="vfm-mapa-wrap"><svg class="vfm-mapa" viewBox="' + esc(mexicoMapa.viewBox)
        + '" role="group" aria-label="Mapa de la República Mexicana por estados">'
        + geometria + '</svg><div class="vfm-tip" id="vfm-tip" hidden></div></div>' +
        '<div class="vfm-leyenda"><span>Menos</span><i data-level="1"></i><i data-level="2"></i><i data-level="3"></i><i data-level="4"></i><span>Más proyectos</span><em>Sin color = sin fotografías</em></div>' +
        (mexicoMapa.creditos ? '<div class="vfm-creditos">' + esc(mexicoMapa.creditos) + '</div>' : '') +
      '</div>' +
      '<aside class="vfm-ranking"><div class="vfm-mapa-titulo">Estados con fotografías</div>' +
        (ranking.length ? '<ul>' + ranking.map(x =>
          '<li><button type="button" data-estado-btn="' + esc(x.estado.id) + '"><span>'
          + esc(x.estado.name) + '</span><b>' + x.cantidad + '</b></button></li>'
        ).join('') + '</ul>' : '<div class="py-empty">Aún no hay proyectos con fotografías.</div>') +
        (otros.length ? '<button type="button" class="vfm-otros" data-estado-btn="__otros">Sin estado reconocido <b>'
          + otros.length + '</b></button>' : '') +
      '</aside></div>';
  const globo = contenedor.querySelector('#vfm-tip');
  const envoltura = contenedor.querySelector('.vfm-mapa-wrap');
  contenedor.querySelectorAll('.vfm-estado').forEach(elemento => {
    const id = elemento.dataset.estado;
    const mostrar = evento => {
      const cantidad = (gruposEstado.get(id) || []).length;
      globo.textContent = nombreEstadoMexico(id) + ' · ' + cantidad + ' proyecto(s)';
      globo.hidden = false;
      const area = envoltura.getBoundingClientRect();
      globo.style.left = Math.max(0, Math.min(area.width - 150, (evento.clientX || area.left + area.width / 2) - area.left + 12)) + 'px';
      globo.style.top = Math.max(0, (evento.clientY || area.top) - area.top - 34) + 'px';
    };
    elemento.addEventListener('mousemove', mostrar);
    elemento.addEventListener('focus', () => {
      const rect = elemento.getBoundingClientRect();
      mostrar({ clientX: rect.left + rect.width / 2, clientY: rect.top });
    });
    elemento.addEventListener('mouseleave', () => { globo.hidden = true; });
    elemento.addEventListener('blur', () => { globo.hidden = true; });
    elemento.addEventListener('click', () => seleccionarEstadoMexico(id));
    elemento.addEventListener('keydown', evento => {
      if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault(); seleccionarEstadoMexico(id);
      }
    });
  });
  contenedor.querySelectorAll('[data-estado-btn]').forEach(boton => {
    boton.addEventListener('click', () => seleccionarEstadoMexico(boton.dataset.estadoBtn));
  });
}
function render() {
  // Si la geometria no cargo (por ejemplo, un navegador sin conexion),
  // la funcionalidad previa de la galeria no desaparece.
  if (mexicoMapa.estados.length !== 32) {
    renderListadoOriginal();
    return;
  }
  const filas = proyectos.filter(p => fotos(p).length);
  const unidos = filas.filter(p => coreRows(p).length && Array.isArray(p.unitedRows) && p.unitedRows.length).length;
  const porEstado = new Map();
  const otros = [];
  filas.forEach(proyecto => {
    const id = idEstadoMexico(proyecto);
    if (!id) { otros.push(proyecto); return; }
    if (!porEstado.has(id)) porEstado.set(id, []);
    porEstado.get(id).push(proyecto);
  });
  const indicadores = document.getElementById('vfm-kpis');
  if (indicadores) indicadores.innerHTML =
    '<div class="py-card"><div class="label">Proyectos con fotografía</div><div class="value" style="color:var(--accent)">'
    + filas.length + '</div></div>' +
    '<div class="py-card"><div class="label">Estados con fotografías</div><div class="value">'
    + porEstado.size + '</div></div>' +
    '<div class="py-card"><div class="label">Carretes unidos por equivalencia</div><div class="value">'
    + unidos + '</div></div>';
  const buscador = document.getElementById('vfm-buscar');
  const termino = String(buscador && buscador.value || '').trim().toUpperCase();
  const contenedor = document.getElementById('vfm-galeria');
  if (!contenedor) return;
  const coincide = p => [p.proyecto, p.id, p.coreProjectId, p.unitedProject, p.cliente]
    .some(valor => String(valor || '').toUpperCase().includes(termino));
  if (!mexicoEstadoSeleccionado && !termino) {
    dibujarMapaMexico(contenedor, porEstado, otros, filas.length);
    return;
  }
  if (mexicoEstadoSeleccionado) {
    let subconjunto = mexicoEstadoSeleccionado === '__otros' ? otros : (porEstado.get(mexicoEstadoSeleccionado) || []);
    if (termino) subconjunto = subconjunto.filter(coincide);
    subconjunto = [...subconjunto].sort((a, b) =>
      String(a.proyecto).localeCompare(String(b.proyecto), 'es', { sensitivity: 'base' }));
    const nombre = nombreEstadoMexico(mexicoEstadoSeleccionado);
    contenedor.innerHTML =
      '<div class="vfm-estado-head"><button type="button" class="py-refresh-btn" data-vfm-back="1">← Mapa de México</button><h2>'
      + esc(nombre) + '</h2><span class="count">' + subconjunto.length
      + ' proyecto(s) con fotografías' + (termino ? ' · filtrado por búsqueda' : '') + '</span></div>' +
      (subconjunto.length ? '<div class="py-foto-mosaico">' + baldosasMexico(subconjunto) + '</div>'
        : '<div class="py-empty">No hay proyectos con fotografías ' + (termino ? 'para esa búsqueda en ' : 'en ')
          + esc(nombre) + '.</div>');
    const volver = contenedor.querySelector('[data-vfm-back]');
    if (volver) volver.addEventListener('click', () => seleccionarEstadoMexico(null));
    enlazarBaldosasMexico(contenedor, subconjunto);
    return;
  }
  const resultados = filas.filter(coincide).sort((a, b) =>
    String(a.estado || '').localeCompare(String(b.estado || ''), 'es', { sensitivity: 'base' })
    || String(a.proyecto).localeCompare(String(b.proyecto), 'es', { sensitivity: 'base' }));
  if (!resultados.length) {
    contenedor.innerHTML = '<div class="py-empty">No hay proyectos con fotografías para la búsqueda.</div>';
    return;
  }
  const agrupados = new Map();
  resultados.forEach(p => {
    const id = idEstadoMexico(p);
    const nombre = id ? nombreEstadoMexico(id) : 'Sin estado reconocido';
    if (!agrupados.has(nombre)) agrupados.set(nombre, []);
    agrupados.get(nombre).push(p);
  });
  contenedor.innerHTML =
    '<div class="vfm-estado-head"><h2>Resultados de la búsqueda</h2><span class="count">'
    + resultados.length + ' proyecto(s) · borra el texto para volver al mapa</span></div>' +
    [...agrupados.entries()].map(([nombre, items]) =>
      '<div class="py-foto-grupo"><div class="py-foto-grupo-title">' + esc(nombre)
      + ' <span class="count">(' + items.length + ')</span></div><div class="py-foto-mosaico">'
      + baldosasMexico(items) + '</div></div>').join('');
  enlazarBaldosasMexico(contenedor, resultados);
}
function setStatus(text){const s=document.getElementById('vfm-aiven-status');if(s)s.textContent=String(text||'');}
// El limite HTTP por llamada se mantiene acotado; no se pierde el resto del
// catalogo. Ante una respuesta sin offset confiable, falla cerrado.
async function leerCatalogoFotograficoInt10(){
  const corellian=[];
  const united=[];
  for(let pagina=0;pagina<INT10_MAX_PAGINAS;pagina++){
    const offset=pagina*INT10_TAMANO_PAGINA;
    const respuesta=await getJson('/api/ventas/fotos-mapa/catalogo-general/fotografias?limit='+INT10_TAMANO_PAGINA+'&offset='+offset);
    if(!respuesta||Number(respuesta.limit)!==INT10_TAMANO_PAGINA||Number(respuesta.offset)!==offset
        ||!respuesta.data||!Array.isArray(respuesta.data.corellian)||!Array.isArray(respuesta.data.united)){
      throw new Error('El backend no devolvio el contrato paginado de Fotografias Fase 2.');
    }
    const filaCore=respuesta.data.corellian;
    const filaUnited=respuesta.data.united;
    corellian.push(...filaCore);
    united.push(...filaUnited);
    if(filaCore.length<INT10_TAMANO_PAGINA&&filaUnited.length<INT10_TAMANO_PAGINA){
      return {corellian,united};
    }
  }
  // Nunca presentar un listado incompleto como si fuera el catalogo entero.
  throw new Error('El catalogo supera el limite de seguridad del paginado; requiere revision del backend.');
}
async function leerNavegacionInt10(ruta){
  try{
    const datos=[];
    for(let pagina=0;pagina<INT10_MAX_PAGINAS;pagina++){
      const offset=pagina*INT10_TAMANO_PAGINA;
      const respuesta=await getJson(ruta+(ruta.includes('?')?'&':'?')+'limit='+INT10_TAMANO_PAGINA+'&offset='+offset);
      if(!respuesta||!Array.isArray(respuesta.data)||Number(respuesta.offset)!==offset){
        throw new Error('El backend no devolvio el contrato de navegacion paginada.');
      }
      datos.push(...respuesta.data);
      if(respuesta.data.length<INT10_TAMANO_PAGINA)return datos;
    }
    throw new Error('El alcance de navegacion excede el limite de consulta.');
  }catch(error){
    // Un fallo/403 de cualquiera de las puertas independientes no permite
    // mostrar botones hacia los proyectos de ese dominio.
    return [];
  }
}
async function load(){
  const revision=++int10RevisionCatalogo;
  setStatus('Actualizando Catálogo General...');
  try{
    const [datos,coreNavegacion,unitedNavegacion]=await Promise.all([
      leerCatalogoFotograficoInt10(),
      leerNavegacionInt10('/api/ventas/fotos-mapa/catalogo-general/navegacion-corellian?solo_con_fotos=1'),
      leerNavegacionInt10('/api/ventas/fotos-mapa/catalogo-general/navegacion-united')
    ]);
    if(revision!==int10RevisionCatalogo)return;
    int10CatalogoCore=datos.corellian;
    int10CatalogoUnited=datos.united;
    int10Accesos=createAccessSets(coreNavegacion,unitedNavegacion);
    const resumen=reconstruirCatalogoInt10();
    const visibles=proyectos.filter(p=>fotos(p).length).length;
    setStatus('Catálogo General actualizado · '+visibles+' proyectos · '+resumen.merged+' carrete(s) unido(s)');
  }catch(error){
    if(revision!==int10RevisionCatalogo)return;
    int10CatalogoCore=[];
    int10CatalogoUnited=[];
    int10Accesos=createAccessSets([],[]);
    proyectos=[];
    populate();
    render();
    console.warn('[INT-10 FASE 2] No se pudo leer el catalogo completo:',error);
    setStatus(Number(error&&error.status)===403?'Sin acceso a Catálogo General':'No fue posible cargar el Catálogo General completo');
  }
}
// El modulo puede seguir cargado mientras el usuario cambia su identidad
// efectiva mediante el Visor. Invalidar de inmediato el DOM y los resultados
// evita que un segundo usuario vea la galeria de la sesion anterior.
function invalidarContextoFotografiasInt10(){
  ++int10RevisionIdentidad;
  ++int10RevisionCatalogo;
  int10RevisionesFotos.clear();
  int10CatalogoCore=[];
  int10CatalogoUnited=[];
  int10Accesos=createAccessSets([],[]);
  proyectos=[];
  mexicoEstadoSeleccionado=null;
  // El lightbox del Gestor es compartido: cerrarlo al cambiar la identidad
  // evita conservar fotografias de una sesion anterior en pantalla.
  const lightbox=document.getElementById('mg-photo-lightbox');
  if(lightbox&&!lightbox.hidden){
    const close=lightbox.querySelector('.mg-photo-close');
    if(close&&typeof close.click==='function')close.click();
    else lightbox.hidden=true;
  }
  const vista=document.getElementById('view-ventas-fotos-mapa');
  if(vista){
    vista.dataset.ready='0';
    vista.innerHTML='';
  }
}

document.addEventListener('mantto:view-user-changed',invalidarContextoFotografiasInt10);
document.addEventListener('mantto:session-expired',invalidarContextoFotografiasInt10);
document.addEventListener('mantto:auth-ready',invalidarContextoFotografiasInt10);
document.addEventListener('mantto:permissions-updated',()=>{
  const permissions=window.ManttoPermissions;
  if(!permissions||typeof permissions.state!=='function')return;
  const permiso=permissions.state('FOTOGRAFIAS_CATALOGO_GENERAL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL');
  if(permiso&&permiso.exists===true&&permiso.efectivo===true)return;
  invalidarContextoFotografiasInt10();
  const router=window.ManttoRouter;
  if(router&&router.getCurrent&&router.getCurrent().route==='ventas-fotos-mapa'&&router.reset){
    router.reset();
  }
});

async function mount(force) {
  const view = document.getElementById('view-ventas-fotos-mapa');
  if (!view) return false;
  const revisionIdentidad=int10RevisionIdentidad;
  const titulo=document.getElementById('app-context-title');
  if(titulo)titulo.textContent='Catálogo General';
  // El router y esta vista exhiben etiquetas funcionales, no el origen tecnico.
  const subtitulo=document.getElementById('app-context-subtitle');
  if(subtitulo)subtitulo.textContent='Fotografías de proyectos por estado · CORELLIAN + UNITED';
  if(force)view.dataset.ready='0';
  if(view.dataset.ready!=='1'){
    const respuesta=await fetch('./modules/ventas-fotos-mapa/ventas-fotos-mapa.html?v=20261016-int10-fase1-v001',{cache:'default'});
    if(revisionIdentidad!==int10RevisionIdentidad)return false;
    if(!respuesta.ok)throw new Error('No se pudo cargar Catálogo General.');
    const html=await respuesta.text();
    if(revisionIdentidad!==int10RevisionIdentidad)return false;
    view.innerHTML=html;
    view.dataset.ready='1';
    const buscar=document.getElementById('vfm-buscar');
    if(buscar)buscar.addEventListener('input',render);
    const mapaDisponible=await asegurarMapaMexico();
    if(revisionIdentidad!==int10RevisionIdentidad)return false;
    await load();
    if(revisionIdentidad!==int10RevisionIdentidad)return false;
    if(!mapaDisponible)setStatus('Mapa no disponible · Se muestra el catálogo original');
  }
  return true;
}
const api={
  init:()=>mount(false),
  reload:async()=>{
    const vista=document.getElementById('view-ventas-fotos-mapa');
    if(!vista||vista.dataset.ready!=='1')return mount(false);
    await asegurarMapaMexico();
    return load();
  }
};
window.ManttoVentasFotosMapa=api;
window.ManttoFotografiasCatalogoGeneral=api;
})();
