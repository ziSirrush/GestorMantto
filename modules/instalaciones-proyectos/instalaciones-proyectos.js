(function(){
'use strict';

/* =========================================================
   DATOS REALES de Portafolio_Mtto_BLT_TASK_CORELLIAN.xlsx
   ========================================================= */
let PY_PROYECTOS = [];
let PY_EQUIPOS = [];
const PY_GRUPOS_EQUIPO = [["Identificacion", ["REFERENCIA EN SITIO", "ID PROYECTO", "PROYECTO", "ESTATUS", "EDO", "Sup FL", "Ciudad"]], ["Visita y especificaciones", ["FECHA VISITA", "COMENTARIOS FL", "OC", "MO", "AJ", "NO. PISOS", "NO. DESEMBARQUES", "NO. PUERTAS", "VELOCIDAD [m-s]", "CAPACIDAD [kg]", "ENTREPISO [mm]", "LONGITUD [mm]", "ANCHO DE PELDAÑO [mm]", "DIAS SIN VISITA"]], ["Produccion", ["CARTA DE PRIMER VISITA (CPVP)", "ESTATUS DE PRODUCCION", "FECHA DE DESCARGA", "COLOCACION DE ESC-RAMP", "CARTA CUBO NO RECIBIDO (CCNR)", "CARTA CUBO RECIBIDO (CCR)", "DIAS SIN HACER CCNR", "Posible Recepcion de Cubo"]], ["Montaje", ["SUBCONTRATISTA", "INICIO DE MONTAJE", "FIN DE MONTAJE PLANEADO", "FIN DE MONTAJE MODIFICADO", "FIN DE MONTAJE REAL", "DIAS RESTANTES", "CONDICIONES DE OBRA", "EVALUACION DE SUBCONTRATO"]], ["Ajuste", ["CARTA TERMINO INSTALACION (CTI)", "REVISION DE INSTALACION POR SUPERVISOR", "MINUTA REVISION POR AJUSTE", "LIBERADO POR AJUSTE (MONTAJE)", "AJUSTADOR", "INICIO DE AJUSTE", "FIN DE AJUSTE PLANEADO", "FIN DE AJUSTE MODIFICADO", "FIN DE AJUSTE REAL", "REPORTE DE AJUSTE", "Posible inicio de Ajuste", "MINUTA INTERFON", "CERTIFICADO REGULADOR"]], ["Calidad y entrega", ["PROTOCOLO DE ACEPTACION (CALIDAD)", "ESTATUS DE INSPECCION (CALIDAD)", "PENDIENTES (CALIDAD)", "ENTREGA A CLIENTE (CAF-PG)", "FORMATO (CAF-PG)", "EQUIPO SE QUEDA (ENTREGA)", "AÑO DE TERMINO"]], ["Seguimiento adicional", ["OC - ESTATUS", "05 - ESTATUS", "06 - F INICIO", "06 - F FIN", "COMENTARIOS", "06 - AJUSTADOR", "JUN - POSIBLE RECEPCION DE CUBO", "JUN - POSIBLE INICIO DE AJUSTE", "Conectado correctamente"]]];
let PY_CLIENTES = [];
let PY_COBRANZA_POR_ID = {};
const PY_FOTO_ESTADOS_POR_PAGINA = 4;
let PY_FOTO_PAGINA = 1;
let PY_FOTO_FILTRO_SIGNATURE = '';


// indice proyecto -> lista de equipos (por ID Proyecto / ID PROYECTO)
const PY_EQUIPOS_POR_PROYECTO = {};
PY_EQUIPOS.forEach(e=>{
  const id = e['ID PROYECTO'];
  if(!id) return;
  if(!PY_EQUIPOS_POR_PROYECTO[id]) PY_EQUIPOS_POR_PROYECTO[id] = [];
  PY_EQUIPOS_POR_PROYECTO[id].push(e);
});


const PY_API_BASE=(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
function pyAuthHeaders(){return Object.assign({'Accept':'application/json'},window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{});}
async function pyFetchJson(path){
  const response=await fetch(PY_API_BASE+path,{headers:pyAuthHeaders(),cache:'no-store'});
  const raw=await response.text();
  let json;
  try{json=raw?JSON.parse(raw):{};}catch(e){throw new Error('El backend respondió contenido no JSON.');}
  if(!response.ok||json.ok===false)throw new Error(json.message||json.error||('Error HTTP '+response.status));
  return json;
}
async function pyPatchJson(path,body){
  const response=await fetch(PY_API_BASE+path,{method:'PATCH',headers:Object.assign({'Content-Type':'application/json'},pyAuthHeaders()),body:JSON.stringify(body||{}),cache:'no-store'});
  const raw=await response.text();let json;try{json=raw?JSON.parse(raw):{};}catch(e){throw new Error('El backend respondió contenido no JSON.');}
  if(!response.ok||json.ok===false)throw new Error(json.message||json.error||('Error HTTP '+response.status));
  return json;
}
function pyEsProgramador(){
  const u=window.ManttoAuth&&window.ManttoAuth.getUser?window.ManttoAuth.getUser():{};
  const roles=[u&&u.rol].concat((u&&u.roles)||[]).concat(((u&&u.roles_detalle)||[]).map(r=>r&&r.rol)).filter(Boolean).map(v=>String(v).toLowerCase());
  return !!(u&&u.is_programador)||roles.includes('programador');
}
function pyAbrirProyectoMantto(proyecto){
  if(window.ManttoDetails&&typeof window.ManttoDetails.openProyecto==='function'){
    window.ManttoDetails.openProyecto(String(proyecto||'').trim());
  }
}
function pyAbrirEquipoMantto(codigo){
  if(window.ManttoDetails&&typeof window.ManttoDetails.openEquipo==='function'){
    window.ManttoDetails.openEquipo(String(codigo||'').trim());
  }
}
function pyNum(v){const n=Number(String(v??'').replace('%','').trim());return Number.isFinite(n)?n:0;}
function pyMapEquipo(r){return {
  _source:r,
  'REFERENCIA EN SITIO':r.referencia_sitio,'ID PROYECTO':r.id_proyecto,'PROYECTO':r.proyecto,'ESTATUS':r.estatus,'EDO':r.estado,'Sup FL':r.supervisor_fl,'Ciudad':r.ciudad,
  'FECHA VISITA':r.fecha_visita,'COMENTARIOS FL':r.comentarios_fl,'OC':r.avance_oc,'MO':r.avance_mo,'AJ':r.avance_aj,'NO. PISOS':r.numero_pisos,'NO. DESEMBARQUES':r.numero_desembarques,'NO. PUERTAS':r.numero_puertas,'VELOCIDAD [m-s]':r.velocidad_ms,'CAPACIDAD [kg]':r.capacidad_kg,'ENTREPISO [mm]':r.entrepiso_mm,'LONGITUD [mm]':r.longitud_mm,'ANCHO DE PELDAÑO [mm]':r.ancho_peldano_mm,'DIAS SIN VISITA':r.dias_sin_visita,
  'CARTA DE PRIMER VISITA (CPVP)':r.fecha_cpvp,'ESTATUS DE PRODUCCION':r.estatus_produccion,'FECHA DE DESCARGA':r.fecha_descarga,'COLOCACION DE ESC-RAMP':r.fecha_colocacion_esc_ramp,'CARTA CUBO NO RECIBIDO (CCNR)':r.fecha_ccnr,'CARTA CUBO RECIBIDO (CCR)':r.fecha_ccr,'DIAS SIN HACER CCNR':r.dias_sin_ccnr,'Posible Recepcion de Cubo':r.fecha_posible_recepcion_cubo,
  'SUBCONTRATISTA':r.subcontratista,'INICIO DE MONTAJE':r.fecha_inicio_montaje,'FIN DE MONTAJE PLANEADO':r.fecha_fin_montaje_planeado,'FIN DE MONTAJE MODIFICADO':r.fecha_fin_montaje_modificado,'FIN DE MONTAJE REAL':r.fecha_fin_montaje_real,'DIAS RESTANTES':r.dias_restantes,'CONDICIONES DE OBRA':r.condiciones_obra,'EVALUACION DE SUBCONTRATO':r.evaluacion_subcontrato,
  'CARTA TERMINO INSTALACION (CTI)':r.fecha_cti,'REVISION DE INSTALACION POR SUPERVISOR':r.fecha_revision_supervisor,'MINUTA REVISION POR AJUSTE':r.fecha_minuta_revision_ajuste,'LIBERADO POR AJUSTE (MONTAJE)':r.fecha_liberacion_ajuste,'AJUSTADOR':r.ajustador,'INICIO DE AJUSTE':r.fecha_inicio_ajuste,'FIN DE AJUSTE PLANEADO':r.fecha_fin_ajuste_planeado,'FIN DE AJUSTE MODIFICADO':r.fecha_fin_ajuste_modificado,'FIN DE AJUSTE REAL':r.fecha_fin_ajuste_real,'REPORTE DE AJUSTE':r.fecha_reporte_ajuste,'Posible inicio de Ajuste':r.fecha_posible_inicio_ajuste,'MINUTA INTERFON':r.minuta_interfon,'CERTIFICADO REGULADOR':r.certificado_regulador,
  'PROTOCOLO DE ACEPTACION (CALIDAD)':r.fecha_protocolo_aceptacion,'ESTATUS DE INSPECCION (CALIDAD)':r.estatus_inspeccion_calidad,'PENDIENTES (CALIDAD)':r.pendientes_calidad,'ENTREGA A CLIENTE (CAF-PG)':r.fecha_entrega_cliente,'FORMATO (CAF-PG)':r.formato_caf_pg,'EQUIPO SE QUEDA (ENTREGA)':r.estatus_equipo_entrega,'AÑO DE TERMINO':r.anio_termino,
  'Activo':r.activo,'Asesor':r.vendedor,'Cliente':r.cliente
};}
function pyBuildProjects(rows){const m=new Map();for(const r of rows){const id=r.id_proyecto||'(SIN ID)';if(!m.has(id))m.set(id,{Proyecto:r.proyecto,'ID Proyecto':r.id_proyecto,Ciudad:r.ciudad,Estado:r.estado,'Numero de Equipos':0,Asesor:r.vendedor,Supervisor:r.supervisor_fl,'Aux Administrativo':r.id_admin||null,Cliente:r.cliente,'Cliente N Comercial':r.cliente,'Activo / Inactivo':Number(r.activo)===0?'Inactivos':'Activo',Carpeta:null,'FOTO BLT':null,'FOTO BLT 2':null,'FOTO BLT 3':null,'FOTO BLT 4':null,'FOTO BLT 5':null,'FOTO BLT 6':null,'FOTO BLT 7':null,'Foto Principal':null,id_photo:null});m.get(id)['Numero de Equipos']++;}return [...m.values()];}
async function pyCargarDesdeAiven(){
  const [equiposJson,fotosJson]=await Promise.all([
    pyFetchJson('/api/ins-fl?limit=5000'),
    pyFetchJson('/api/ins-fl/proyectos/fotografias?limit=5000').catch(()=>({data:[]}))
  ]);
  const rows=Array.isArray(equiposJson.data)?equiposJson.data:[];
  PY_EQUIPOS=rows.map(pyMapEquipo);PY_PROYECTOS=pyBuildProjects(rows);
  const fotosPorProyecto=new Map((Array.isArray(fotosJson.data)?fotosJson.data:[]).map(f=>[String(f['ID Proyecto']||'').trim(),f]));
  PY_PROYECTOS.forEach(p=>{const f=fotosPorProyecto.get(String(p['ID Proyecto']||'').trim());if(f)Object.assign(p,f);});
  PY_CLIENTES=[...new Set(PY_PROYECTOS.map(p=>p.Cliente).filter(Boolean))].map(n=>({'Nombre de la Empresa':n,'Razon Social':n}));PY_COBRANZA_POR_ID={};
  PY_PROYECTOS.forEach((r,i)=>r._id=i);PY_EQUIPOS.forEach((r,i)=>r._id=i);Object.keys(PY_EQUIPOS_POR_PROYECTO).forEach(k=>delete PY_EQUIPOS_POR_PROYECTO[k]);PY_EQUIPOS.forEach(e=>{const id=e['ID PROYECTO'];if(!id)return;(PY_EQUIPOS_POR_PROYECTO[id]||(PY_EQUIPOS_POR_PROYECTO[id]=[])).push(e);});
}

/* =========================================================
   UTILIDADES
   ========================================================= */
function pyShowTab(name){
  document.querySelectorAll('.py-tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
  document.querySelectorAll('.py-section').forEach(s=>s.classList.toggle('active', s.id==='py-tab-'+name));
}
function pyEsc(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function pyFormatValor(v){
  if(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) return v.slice(0,10);
  return v;
}
function pyFormatPorcentaje(v){
  if(v == null || v === '' || v === '-') return '-';
  if(typeof v === 'string'){
    if(v.includes('%')) return pyEsc(v);
    v = parseFloat(v.replace(',', '.'));
    if(isNaN(v)) return '-';
  }
  const pct = v <= 1 ? v * 100 : v;
  return Math.round(pct) + '%';
}
const PY_SLOTS_FOTO = ['FOTO BLT', 'FOTO BLT 2', 'FOTO BLT 3', 'FOTO BLT 4', 'FOTO BLT 5', 'FOTO BLT 6', 'FOTO BLT 7'];
const PY_CAMPO_DB_FOTO = {'FOTO BLT':'foto_blt_1','FOTO BLT 2':'foto_blt_2','FOTO BLT 3':'foto_blt_3','FOTO BLT 4':'foto_blt_4','FOTO BLT 5':'foto_blt_5','FOTO BLT 6':'foto_blt_6','FOTO BLT 7':'foto_blt_7'};

/* =========================================================
   FOTOS DEL PROYECTO
   Se decidio dejar solo las columnas 1-5 (FOTO BLT a FOTO BLT 5), que
   son URLs directas (storage.googleapis.com) y siempre cargan bien.
   Se quito "Imagen P G" (y FOTO BLT 6/7, que no tienen datos) porque
   son ligas de Google Drive que en la practica apuntan a archivos ya
   borrados/movidos en Drive -- no es un problema de formato de liga,
   el archivo ya no existe, así que no hay nada que reparar del lado
   tecnico. Si en el futuro se vuelve a necesitar Drive, hay que
   validar primero que los archivos existan y esten compartidos como
   "cualquiera con el enlace".
   - Archivos .HEIC tampoco se muestran (ningun navegador los soporta
     en <img>): se tratan como si el campo estuviera vacio.
   ========================================================= */
function pyInfoFoto(url, campo){
  if(!url) return null;
  const u = String(url);
  if(/\.heic(\?|$)/i.test(u)) return null;
  return { tipo: 'img', url: u, campo: campo || null };
}
function pyFotosValidas(r, campos){
  return campos.map(c => pyInfoFoto(r[c],c)).filter(Boolean);
}
function pyAbrirLightboxUna(tipo, valor){
  PY_LIGHTBOX_FOTOS = [{tipo:'img', url:valor}];
  PY_LIGHTBOX_IDX = 0;
  PY_LIGHTBOX_PROYECTO = null;
  pyRenderLightbox();
}
function pyFotoTileHtml(info, ancho){
  const w = ancho || 120;
  const valorEsc = pyEsc(info.url).replace(/'/g,"&#39;");
  return `<div class="py-foto-tile" style="width:${w}px;" onclick="pyAbrirLightboxUna('img','${valorEsc}')">
    <img src="${pyEsc(info.url)}" loading="lazy" alt="Foto del proyecto">
  </div>`;
}

function pyFotoPrincipalInfo(r){
  const direct=String(r&&r.foto_portada||'').trim();
  if(/^https?:\/\//i.test(direct)){
    const selectedDb=String((r&&r.foto_principal)||(r&&r['Foto Principal'])||'').trim();
    const selectedUi=Object.keys(PY_CAMPO_DB_FOTO).find(k=>PY_CAMPO_DB_FOTO[k]===selectedDb)||null;
    return pyInfoFoto(direct,selectedUi);
  }
  const selectedDb=String((r&&r.foto_principal)||(r&&r['Foto Principal'])||'').trim();
  const selectedUi=Object.keys(PY_CAMPO_DB_FOTO).find(k=>PY_CAMPO_DB_FOTO[k]===selectedDb);
  const selected=selectedUi?pyInfoFoto(r[selectedUi],selectedUi):null;
  return selected||pyFotosValidas(r,PY_SLOTS_FOTO)[0]||null;
}
async function pySeleccionarFotoPrincipal(){
  if(!PY_LIGHTBOX_PROYECTO||!pyEsProgramador())return;
  const actual=PY_LIGHTBOX_FOTOS[PY_LIGHTBOX_IDX];
  if(!actual||!actual.campo)return;
  const dbField=PY_CAMPO_DB_FOTO[actual.campo];
  if(!dbField)return;
  const idProyecto=String(PY_LIGHTBOX_PROYECTO['ID Proyecto']||'').trim();
  try{
    await pyPatchJson('/api/ins-fl/proyectos/fotografias/'+encodeURIComponent(idProyecto)+'/principal',{campo:dbField});
    PY_LIGHTBOX_PROYECTO['Foto Principal']=dbField;
    const hero=document.getElementById('py-project-main-photo');if(hero)hero.src=actual.url;
    pyRenderLightbox();
  }catch(e){alert(e.message||'No fue posible actualizar la foto principal.');}
}

let PY_LIGHTBOX_FOTOS = [];
let PY_LIGHTBOX_IDX = 0;
let PY_LIGHTBOX_PROYECTO = null;

function pyAbrirLightbox(url){
  PY_LIGHTBOX_FOTOS = [pyInfoFoto(url)].filter(Boolean);
  PY_LIGHTBOX_IDX = 0;
  PY_LIGHTBOX_PROYECTO = null;
  pyRenderLightbox();
}

function pyAbrirLightboxProyecto(idProyecto){
  const r = PY_PROYECTOS.find(x=>x._id===idProyecto);
  PY_LIGHTBOX_FOTOS = pyFotosValidas(r, PY_SLOTS_FOTO);
  PY_LIGHTBOX_IDX = 0;
  PY_LIGHTBOX_PROYECTO = r;
  pyRenderLightbox();
}

function pyLightboxNav(delta){
  const n = PY_LIGHTBOX_FOTOS.length;
  PY_LIGHTBOX_IDX = (PY_LIGHTBOX_IDX + delta + n) % n;
  pyRenderLightbox();
}

function pyRenderLightbox(){
  const n = PY_LIGHTBOX_FOTOS.length;
  const actual = PY_LIGHTBOX_FOTOS[PY_LIGHTBOX_IDX];
  const imgEl = document.getElementById('py-lightbox-img');
  imgEl.src = (actual && actual.url) || '';
  document.getElementById('py-lightbox').classList.add('open');

  const prevBtn = document.getElementById('py-lightbox-prev');
  const nextBtn = document.getElementById('py-lightbox-next');
  const contador = document.getElementById('py-lightbox-contador');
  const mostrarNav = n > 1;
  prevBtn.style.display = mostrarNav ? 'block' : 'none';
  nextBtn.style.display = mostrarNav ? 'block' : 'none';
  contador.style.display = mostrarNav ? 'block' : 'none';
  if(mostrarNav) contador.textContent = (PY_LIGHTBOX_IDX+1) + ' / ' + n;

  const proyectoLink = document.getElementById('py-lightbox-proyecto');
  let principalBtn=document.getElementById('py-lightbox-principal');
  if(!principalBtn){principalBtn=document.createElement('button');principalBtn.id='py-lightbox-principal';principalBtn.type='button';principalBtn.className='py-lightbox-principal';principalBtn.addEventListener('click',pySeleccionarFotoPrincipal);document.getElementById('py-lightbox').appendChild(principalBtn);}
  const actualCampo=actual&&actual.campo?PY_CAMPO_DB_FOTO[actual.campo]:null;
  const puedeElegir=!!(PY_LIGHTBOX_PROYECTO&&pyEsProgramador()&&actualCampo);
  principalBtn.style.display=puedeElegir?'block':'none';
  principalBtn.textContent=(puedeElegir&&String(PY_LIGHTBOX_PROYECTO['Foto Principal']||'')===actualCampo)?'Foto principal actual':'Usar como foto principal';
  principalBtn.disabled=!!(puedeElegir&&String(PY_LIGHTBOX_PROYECTO['Foto Principal']||'')===actualCampo);

  if(PY_LIGHTBOX_PROYECTO){
    proyectoLink.style.display = 'block';
    proyectoLink.textContent = PY_LIGHTBOX_PROYECTO.Proyecto;
    proyectoLink.onclick = (e) => { e.preventDefault(); pyCerrarLightbox(); pyAbrirProyecto(PY_LIGHTBOX_PROYECTO._id); };
  } else {
    proyectoLink.style.display = 'none';
  }
}

function pyCerrarLightbox(){
  document.getElementById('py-lightbox').classList.remove('open');
  document.getElementById('py-lightbox-img').src = '';
}

/* =========================================================
   FOTOS DEL PROYECTO: 5 slots (FOTO BLT a FOTO BLT 5)
   NOTA: subida solo en memoria del navegador (no persiste al recargar).
   Cuando el modulo se conecte a la base de datos definitiva, aqui debe
   reemplazarse pyGuardarFotoEnSlot() por la llamada real de guardado.
   ========================================================= */
let PY_PERMISO_CARGA = false;

function pyTogglePermiso(){
  PY_PERMISO_CARGA = document.getElementById('py-permiso-carga').checked;
  // si hay un proyecto abierto en este momento, refrescar sus slots
  if(PY_PROYECTO_ABIERTO_ID != null) pyRenderSlotsFoto(PY_PROYECTO_ABIERTO_ID);
}

let PY_PROYECTO_ABIERTO_ID = null;

function pyRenderSlotsFoto(idProyecto){
  PY_PROYECTO_ABIERTO_ID = idProyecto;
  const r = PY_PROYECTOS.find(x=>x._id===idProyecto);
  const cont = document.getElementById('py-slots-foto');
  if(!cont) return;

  const infos = PY_SLOTS_FOTO.map(s => pyInfoFoto(r[s])).filter(Boolean);
  const tilesExistentes = infos.map(info => pyFotoTileHtml(info, 120)).join('');

  const hayEspacio = infos.length < PY_SLOTS_FOTO.length;
  const botonSubir = (PY_PERMISO_CARGA && hayEspacio) ? `
    <div class="py-upload-tile" onclick="document.getElementById('py-input-foto').click()">
      <div class="plus">+</div>
      <div>Subir foto</div>
    </div>` : '';

  cont.innerHTML = `
    <div class="py-galeria">${tilesExistentes}${botonSubir}</div>
    <div class="py-foto-slots-nota">${infos.length} de ${PY_SLOTS_FOTO.length} espacios usados.
      ${PY_PERMISO_CARGA ? '' : ' Activa "Simular: usuario con permiso de carga" arriba para poder subir.'}
      Vista previa local (no se guarda todavia) -- se conectara a la base de datos definitiva mas adelante.</div>
    <input type="file" id="py-input-foto" accept="image/jpeg,image/png,image/webp,image/gif" style="display:none" onchange="pyManejarSeleccionFoto(${idProyecto}, this)">
  `;
}

function pyManejarSeleccionFoto(idProyecto, inputEl){
  const archivo = inputEl.files && inputEl.files[0];
  if(!archivo) return;

  const esHeic = /\.heic$/i.test(archivo.name) || archivo.type === 'image/heic' || archivo.type === 'image/heif';
  if(esHeic){
    alert('No se pueden subir fotos en formato HEIC (comunes en iPhone) porque ningun navegador las puede mostrar. Convierte la foto a JPG o PNG antes de subirla.');
    inputEl.value = '';
    return;
  }

  const r = PY_PROYECTOS.find(x=>x._id===idProyecto);
  const slotLibre = PY_SLOTS_FOTO.find(s => !pyInfoFoto(r[s]));
  if(!slotLibre){ inputEl.value = ''; return; }

  const lector = new FileReader();
  lector.onload = (e) => {
    pyGuardarFotoEnSlot(r, slotLibre, e.target.result);
    inputEl.value = '';
    pyRenderSlotsFoto(idProyecto);
  };
  lector.readAsDataURL(archivo);
}

function pyGuardarFotoEnSlot(r, slot, dataUrl){
  // TODO integracion: al conectar a la base de datos definitiva, reemplazar esta
  // asignacion en memoria por el guardado real (Supabase Storage, etc.) y solo
  // actualizar r[slot] cuando el guardado sea exitoso.
  r[slot] = dataUrl;
}

function pyIdCarpetaDrive(url){
  const m = String(url||'').match(/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/* =========================================================
   NAVEGADOR DE CARPETAS DE GOOGLE DRIVE (API real)
   ========================================================= */
// PEGAR AQUI la API key de Google Cloud (Google Drive API, solo lectura) cuando este lista.
// Sin la key, se muestra un aviso en vez de la lista de carpetas/archivos.
const PY_DRIVE_API_KEY = '';

let pyDriveBreadcrumb = [];

async function pyCargarCarpetaDrive(idCarpeta, idRaiz, nombreRaiz){
  if(idCarpeta === idRaiz) pyDriveBreadcrumb = [{id: idRaiz, nombre: nombreRaiz || 'Carpeta'}];

  const cont = document.getElementById('py-drive-browser');
  if(!cont) return;

  if(!PY_DRIVE_API_KEY){
    cont.innerHTML = `<div class="py-drive-error">
      Falta la API key de Google Drive (ver comentario "PY_DRIVE_API_KEY" en el codigo). Sin ella no
      se puede listar el contenido de la carpeta aqui. Mientras tanto:
      <a href="https://drive.google.com/drive/folders/${pyEsc(idCarpeta)}" target="_blank" rel="noopener">abrir carpeta en Drive</a>.
    </div>`;
    return;
  }

  cont.innerHTML = pyDriveBreadcrumbHtml() + '<div class="py-drive-loading">Cargando...</div>';

  try{
    const url = `https://www.googleapis.com/drive/v3/files?q='${idCarpeta}'+in+parents+and+trashed=false&key=${PY_DRIVE_API_KEY}&fields=files(id,name,mimeType,webViewLink)&pageSize=200`;
    const resp = await fetch(url);
    const data = await resp.json();
    if(data.error){
      cont.innerHTML = pyDriveBreadcrumbHtml() + `<div class="py-drive-error">Error de la API de Drive: ${pyEsc(data.error.message || 'desconocido')}</div>`;
      return;
    }
    const archivos = (data.files || []).slice().sort((a,b)=>{
      const aCarpeta = a.mimeType === 'application/vnd.google-apps.folder';
      const bCarpeta = b.mimeType === 'application/vnd.google-apps.folder';
      if(aCarpeta !== bCarpeta) return aCarpeta ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    if(!archivos.length){
      cont.innerHTML = pyDriveBreadcrumbHtml() + '<div class="py-drive-loading">Carpeta vacia.</div>';
      return;
    }

    const itemsHtml = archivos.map(f=>{
      const esCarpeta = f.mimeType === 'application/vnd.google-apps.folder';
      if(esCarpeta){
        return `<div class="py-drive-item folder" onclick="pyEntrarCarpetaDrive('${f.id}','${pyEsc(f.name).replace(/'/g,"&#39;")}')">&#128193; ${pyEsc(f.name)}</div>`;
      }
      return `<div class="py-drive-item file">&#128196; <a href="${pyEsc(f.webViewLink||('https://drive.google.com/file/d/'+f.id))}" target="_blank" rel="noopener">${pyEsc(f.name)}</a></div>`;
    }).join('');

    cont.innerHTML = pyDriveBreadcrumbHtml() + `<div class="py-drive-lista">${itemsHtml}</div>`;
  } catch(err){
    cont.innerHTML = pyDriveBreadcrumbHtml() + `<div class="py-drive-error">No se pudo conectar con Google Drive (${pyEsc(err.message||err)}).</div>`;
  }
}

function pyEntrarCarpetaDrive(id, nombre){
  pyDriveBreadcrumb.push({id, nombre});
  const raiz = pyDriveBreadcrumb[0];
  pyCargarCarpetaDrive(id, raiz.id, raiz.nombre);
}

function pyIrANivelDrive(index){
  const nivel = pyDriveBreadcrumb[index];
  pyDriveBreadcrumb = pyDriveBreadcrumb.slice(0, index+1);
  const raiz = pyDriveBreadcrumb[0];
  pyCargarCarpetaDrive(nivel.id, raiz.id, raiz.nombre);
}

function pyDriveBreadcrumbHtml(){
  return '<div class="py-drive-breadcrumb">' + pyDriveBreadcrumb.map((n,i)=>{
    const esUltimo = i === pyDriveBreadcrumb.length - 1;
    return esUltimo
      ? `<span>${pyEsc(n.nombre)}</span>`
      : `<span class="link" onclick="pyIrANivelDrive(${i})">${pyEsc(n.nombre)}</span><span>/</span>`;
  }).join('') + '</div>';
}
function pyAbrirPagina(html){
  document.getElementById('py-detail-body').innerHTML = html;
  document.getElementById('py-detail-page').classList.add('open');
  document.getElementById('py-detail-page').scrollTop = 0;
}
function pyCerrarPaginaProyecto(){
  document.getElementById('py-detail-page').classList.remove('open');
}
function pyAbrirPaginaEquipo(html, idProyecto){
  document.getElementById('py-detail-body-2').innerHTML = html;
  document.getElementById('py-equipo-back').onclick = () => {
    document.getElementById('py-detail-page-2').classList.remove('open');
  };
  document.getElementById('py-detail-page-2').classList.add('open');
  document.getElementById('py-detail-page-2').scrollTop = 0;
}
function pyCerrarPaginaEquipo(){
  document.getElementById('py-detail-page-2').classList.remove('open');
}
function pyStatusClass(v){
  return 'st-' + String(v||'').toUpperCase().replace(/[^A-Z]/g,'');
}

/* =========================================================
   PROYECTOS
   ========================================================= */
// Orden alfabetico A-Z por proyecto: estandar en todas las tablas del modulo.
// campo = nombre del campo que trae el nombre del proyecto en ese arreglo
// ('Proyecto' en PY_PROYECTOS, 'PROYECTO' en PY_EQUIPOS).
function pyOrdenarPorProyecto(arr, campo){
  return arr.slice().sort((a,b) => String(a[campo]||'').localeCompare(String(b[campo]||''), 'es', {sensitivity:'base'}));
}

function pyEsCerrado(r){
  const idp = r['ID Proyecto'];
  if(!idp) return false;
  const eqs = PY_EQUIPOS_POR_PROYECTO[idp];
  if(!eqs || !eqs.length) return false;
  return eqs.every(e => e['ESTATUS'] === '08-T');
}
function pyTieneFoto(r){
  return pyFotosValidas(r, PY_SLOTS_FOTO).length > 0;
}
function pyContarFotos(r){
  return pyFotosValidas(r, PY_SLOTS_FOTO).length;
}

function pyRenderKPIs(){
  const total = PY_PROYECTOS.length;
  const cerrados = PY_PROYECTOS.filter(pyEsCerrado).length;
  const activos = total - cerrados;
  const totalEquipos = PY_EQUIPOS.length;
  const conFoto = PY_PROYECTOS.filter(pyTieneFoto).length;

  document.getElementById('py-kpis-activos').innerHTML = `
    <div class="py-card"><div class="label">Proyectos activos</div><div class="value" style="color:var(--accent)">${activos}</div></div>
    <div class="py-card"><div class="label">Proyectos cerrados</div><div class="value" style="color:var(--ok)">${cerrados}</div></div>
    <div class="py-card"><div class="label">Equipos totales</div><div class="value">${totalEquipos}</div></div>
  `;
  document.getElementById('py-kpis-cerrados').innerHTML = `
    <div class="py-card"><div class="label">Proyectos cerrados</div><div class="value" style="color:var(--ok)">${cerrados}</div></div>
    <div class="py-card"><div class="label">% del total</div><div class="value">${total ? (cerrados/total*100).toFixed(0) : 0}%</div></div>
  `;
  document.getElementById('py-kpis-fotografias').innerHTML = `
    <div class="py-card"><div class="label">Proyectos con fotografia</div><div class="value" style="color:var(--accent)">${conFoto}</div></div>
    <div class="py-card"><div class="label">% del total</div><div class="value">${total ? (conFoto/total*100).toFixed(0) : 0}%</div></div>
  `;
}

function pyPopulateFiltros(){
  const estados = [...new Set(PY_PROYECTOS.map(r=>r.Estado).filter(Boolean))].sort();
  document.getElementById('py-f-estado').innerHTML = '<option value="">Todos los estados</option>' + estados.map(e=>`<option value="${pyEsc(e)}">${pyEsc(e)}</option>`).join('');

  const asesores = [...new Set(PY_PROYECTOS.map(r=>r.Asesor).filter(Boolean))].sort();
  document.getElementById('py-f-asesor').innerHTML = '<option value="">Todo asesor</option>' + asesores.map(a=>`<option value="${pyEsc(a)}">${pyEsc(a)}</option>`).join('');

  const supervisores = [...new Set(PY_PROYECTOS.map(r=>r.Supervisor).filter(Boolean))].sort();
  document.getElementById('py-f-supervisor').innerHTML = '<option value="">Todo supervisor</option>' + supervisores.map(s=>`<option value="${pyEsc(s)}">${pyEsc(s)}</option>`).join('');

  const activos = [...new Set(PY_PROYECTOS.map(r=>r['Activo / Inactivo']).filter(Boolean))].sort();
  document.getElementById('py-f-activo').innerHTML = '<option value="">Activo/Inactivo</option>' + activos.map(a=>`<option value="${pyEsc(a)}">${pyEsc(a)}</option>`).join('');

  document.getElementById('py-f-estado-cerrados').innerHTML = '<option value="">Todos los estados</option>' + estados.map(e=>`<option value="${pyEsc(e)}">${pyEsc(e)}</option>`).join('');
  document.getElementById('py-f-asesor-cerrados').innerHTML = '<option value="">Todo asesor</option>' + asesores.map(a=>`<option value="${pyEsc(a)}">${pyEsc(a)}</option>`).join('');
  document.getElementById('py-f-supervisor-cerrados').innerHTML = '<option value="">Todo supervisor</option>' + supervisores.map(s=>`<option value="${pyEsc(s)}">${pyEsc(s)}</option>`).join('');

  const estadosFoto = [...new Set(PY_PROYECTOS.filter(pyTieneFoto).map(r=>r.Estado).filter(Boolean))].sort();
  document.getElementById('py-f-estado-fotos').innerHTML = '<option value="">Selecciona un estado...</option>' + estadosFoto.map(e=>`<option value="${pyEsc(e)}">${pyEsc(e)}</option>`).join('');

  pyPopulateFiltroClientes();
}

function pyPopulateFiltrosBasicos(){
  const estados = [...new Set(PY_PROYECTOS.map(r=>r.Estado).filter(Boolean))].sort();
  const asesores = [...new Set(PY_PROYECTOS.map(r=>r.Asesor).filter(Boolean))].sort();
  const supervisores = [...new Set(PY_PROYECTOS.map(r=>r.Supervisor).filter(Boolean))].sort();
  const activos = [...new Set(PY_PROYECTOS.map(r=>r['Activo / Inactivo']).filter(Boolean))].sort();
  const setOptions=(id,placeholder,values)=>{const el=document.getElementById(id);if(el)el.innerHTML=`<option value="">${placeholder}</option>`+values.map(v=>`<option value="${pyEsc(v)}">${pyEsc(v)}</option>`).join('');};
  setOptions('py-f-estado','Todos los estados',estados);
  setOptions('py-f-asesor','Todo asesor',asesores);
  setOptions('py-f-supervisor','Todo supervisor',supervisores);
  setOptions('py-f-activo','Activo/Inactivo',activos);
  setOptions('py-f-estado-cerrados','Todos los estados',estados);
  setOptions('py-f-asesor-cerrados','Todo asesor',asesores);
  setOptions('py-f-supervisor-cerrados','Todo supervisor',supervisores);
  const estadosFoto=[...new Set(PY_PROYECTOS.filter(pyTieneFoto).map(r=>r.Estado).filter(Boolean))].sort();
  setOptions('py-f-estado-fotos','Selecciona un estado...',estadosFoto);
}
function pyBindTabs(){
  document.querySelectorAll('#py-page .py-tab').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const name=btn.dataset.tab;
      pyShowTab(name);
      if(name==='activos')pyRenderProyectos();
      else if(name==='cerrados')pyRenderCerrados();
      else if(name==='fotografias')pyRenderFotografias();
    });
  });
}

function pyNorm(s){
  return (s||'').toString().trim().toUpperCase();
}

// Solo aparecen en el filtro los clientes de la hoja "Clientes" que ademas
// tienen 1 o mas proyectos en "Proyectos Instalaciones" con el mismo nombre
// en la columna "Cliente N Comercial" (interseccion, no union) -- si no,
// no habria nada que mostrar al seleccionarlos.
function pyPopulateFiltroClientes(){
  const conteoPorCliente = {};
  PY_PROYECTOS.forEach(r=>{
    const nombre = r['Cliente N Comercial'];
    if(!nombre) return;
    const n = pyNorm(nombre);
    conteoPorCliente[n] = (conteoPorCliente[n]||0) + 1;
  });

  const vistos = new Set();
  const clientesFiltrables = PY_CLIENTES
    .filter(c => {
      if(!c['Nombre de la Empresa']) return false;
      const n = pyNorm(c['Nombre de la Empresa']);
      if(!conteoPorCliente[n]) return false;
      if(vistos.has(n)) return false; // evitar duplicados (ej. "Fibra Inn" vs "Fibra inn" en la hoja Clientes)
      vistos.add(n);
      return true;
    })
    .map(c => ({ nombre: c['Nombre de la Empresa'], count: conteoPorCliente[pyNorm(c['Nombre de la Empresa'])] }))
    .sort((a,b) => a.nombre.localeCompare(b.nombre));

  document.getElementById('py-f-cliente').innerHTML = '<option value="">Selecciona un cliente...</option>' +
    clientesFiltrables.map(c => `<option value="${pyEsc(c.nombre)}">${pyEsc(c.nombre)} (${c.count})</option>`).join('');
}

function pyRenderProyectos(){
  const buscar = document.getElementById('py-f-buscar').value.trim().toUpperCase();
  const estado = document.getElementById('py-f-estado').value;
  const asesor = document.getElementById('py-f-asesor').value;
  const supervisor = document.getElementById('py-f-supervisor').value;
  const activo = document.getElementById('py-f-activo').value;

  let rows = PY_PROYECTOS.filter(r => !pyEsCerrado(r));
  if(buscar) rows = rows.filter(r => [r.Proyecto, r['ID Proyecto'], r.Cliente].some(v => (v||'').toString().toUpperCase().includes(buscar)));
  if(estado) rows = rows.filter(r => r.Estado === estado);
  if(asesor) rows = rows.filter(r => r.Asesor === asesor);
  if(supervisor) rows = rows.filter(r => r.Supervisor === supervisor);
  if(activo) rows = rows.filter(r => r['Activo / Inactivo'] === activo);
  rows = pyOrdenarPorProyecto(rows, 'Proyecto');

  const tbody = document.getElementById('py-proyectos-tbody');
  if(!rows.length){
    tbody.innerHTML = '<tr><td colspan="9" class="py-empty">Sin resultados.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r=>`
    <tr class="clickable" onclick="pyAbrirProyecto(${r._id})">
      <td>${pyEsc(r.Proyecto)}</td>
      <td>${pyEsc(r['ID Proyecto'])||'-'}</td>
      <td>${pyEsc(r.Ciudad)||'-'}</td>
      <td>${pyEsc(r.Estado)||'-'}</td>
      <td>${r['Numero de Equipos'] ?? '-'}</td>
      <td>${pyEsc(r.Asesor)||'-'}</td>
      <td>${pyEsc(r.Supervisor)||'-'}</td>
      <td>${pyEsc(r.Cliente)||'-'}</td>
      <td>${r['Activo / Inactivo'] ? `<span class="py-status-chip ${pyStatusClass(r['Activo / Inactivo'])}">${pyEsc(r['Activo / Inactivo'])}</span>` : '-'}</td>
    </tr>`).join('');
}

function pyRenderCerrados(){
  const buscar = document.getElementById('py-f-buscar-cerrados').value.trim().toUpperCase();
  const estado = document.getElementById('py-f-estado-cerrados').value;
  const asesor = document.getElementById('py-f-asesor-cerrados').value;
  const supervisor = document.getElementById('py-f-supervisor-cerrados').value;

  let rows = PY_PROYECTOS.filter(pyEsCerrado);
  if(buscar) rows = rows.filter(r => [r.Proyecto, r['ID Proyecto'], r.Cliente].some(v => (v||'').toString().toUpperCase().includes(buscar)));
  if(estado) rows = rows.filter(r => r.Estado === estado);
  if(asesor) rows = rows.filter(r => r.Asesor === asesor);
  if(supervisor) rows = rows.filter(r => r.Supervisor === supervisor);
  rows = pyOrdenarPorProyecto(rows, 'Proyecto');

  const tbody = document.getElementById('py-cerrados-tbody');
  if(!rows.length){
    tbody.innerHTML = '<tr><td colspan="8" class="py-empty">Sin resultados.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r=>`
    <tr class="clickable" onclick="pyAbrirProyecto(${r._id})">
      <td>${pyEsc(r.Proyecto)}</td>
      <td>${pyEsc(r['ID Proyecto'])||'-'}</td>
      <td>${pyEsc(r.Ciudad)||'-'}</td>
      <td>${pyEsc(r.Estado)||'-'}</td>
      <td>${r['Numero de Equipos'] ?? '-'}</td>
      <td>${pyEsc(r.Asesor)||'-'}</td>
      <td>${pyEsc(r.Supervisor)||'-'}</td>
      <td>${pyEsc(r.Cliente)||'-'}</td>
    </tr>`).join('');
}

function pyPrimeraFoto(r){
  return pyFotoPrincipalInfo(r);
}

function pyRenderFotografias(){
  const buscarEl = document.getElementById('py-f-buscar-fotos');
  const estadoEl = document.getElementById('py-f-estado-fotos');
  const buscar = buscarEl ? buscarEl.value.trim().toUpperCase() : '';
  const estadoFiltro = estadoEl ? estadoEl.value : '';
  const cont = document.getElementById('py-fotografias-galeria');
  if(!cont) return;

  if(!estadoFiltro){
    cont.innerHTML = '<div class="py-empty">Selecciona un estado para visualizar los proyectos con evidencia fotográfica.</div>';
    return;
  }

  let rows = PY_PROYECTOS.filter(r => pyTieneFoto(r) && r.Estado === estadoFiltro);
  if(buscar){
    rows = rows.filter(r => [r.Proyecto, r['ID Proyecto'], r.Cliente]
      .some(v => (v||'').toString().toUpperCase().includes(buscar)));
  }

  if(!rows.length){
    cont.innerHTML = '<div class="py-empty">No hay proyectos con fotografías para los criterios seleccionados.</div>';
    return;
  }

  const proyectos = pyOrdenarPorProyecto(rows, 'Proyecto');
  const tiles = proyectos.map(r=>{
    const info = pyPrimeraFoto(r);
    if(!info || !info.url) return '';
    return `
      <div class="py-foto-tile" role="button" tabindex="0" aria-label="Abrir detalle del proyecto ${pyEsc(r.Proyecto)}" onclick="pyAbrirProyecto(${r._id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();pyAbrirProyecto(${r._id});}">
        <img src="${pyEsc(info.url)}" loading="lazy" alt="${pyEsc(r.Proyecto)}">
        <div class="nombre">${pyEsc(r.Proyecto)}</div>
        <div class="n-fotos">${pyContarFotos(r)} foto(s)</div>
      </div>`;
  }).join('');

  cont.innerHTML = `
    <div class="py-foto-grupo">
      <div class="py-foto-grupo-title">${pyEsc(estadoFiltro)} <span class="count">(${proyectos.length})</span></div>
      <div class="py-foto-mosaico">${tiles}</div>
    </div>`;
}

function pyFilaProyectoResumen(r){
  return `
    <tr class="clickable" onclick="pyAbrirProyecto(${r._id})">
      <td>${pyEsc(r.Proyecto)}</td>
      <td>${pyEsc(r['ID Proyecto'])||'-'}</td>
      <td>${pyEsc(r.Ciudad)||'-'}</td>
      <td>${pyEsc(r.Estado)||'-'}</td>
      <td>${r['Numero de Equipos'] ?? '-'}</td>
      <td>${pyEsc(r.Asesor)||'-'}</td>
      <td>${pyEsc(r.Supervisor)||'-'}</td>
    </tr>`;
}

function pyRenderConcentradoCliente(){
  const nombreSel = document.getElementById('py-f-cliente').value;
  const cont = document.getElementById('py-concentrado-cliente');

  if(!nombreSel){
    cont.innerHTML = '<div class="py-empty">Selecciona un cliente para ver su concentrado.</div>';
    return;
  }

  const cliente = PY_CLIENTES.find(c => pyNorm(c['Nombre de la Empresa']) === pyNorm(nombreSel));
  const proyectosCliente = PY_PROYECTOS.filter(r => pyNorm(r['Cliente N Comercial']) === pyNorm(nombreSel));
  const activos = pyOrdenarPorProyecto(proyectosCliente.filter(r => !pyEsCerrado(r)), 'Proyecto');
  const cerrados = pyOrdenarPorProyecto(proyectosCliente.filter(pyEsCerrado), 'Proyecto');
  const conFoto = pyOrdenarPorProyecto(proyectosCliente.filter(pyTieneFoto), 'Proyecto');

  const infoItems = [
    ['Ciudad', cliente && cliente.Ciudad], ['Estado', cliente && cliente.Estado],
    ['Nombre del Contacto', cliente && cliente['Nombre del Contacto']], ['Email', cliente && cliente.Email],
    ['Telefono', cliente && cliente.Telefono], ['Tipo de Cliente', cliente && cliente['Tipo de Cliente']],
    ['Estatus con Cliente', cliente && cliente['Estatus con Cliente']],
  ].filter(([l,v]) => v != null && v !== '');
  const infoHtml = infoItems.map(([l,v])=>`<tr><td class="l">${pyEsc(l)}</td><td class="v">${pyEsc(v)}</td></tr>`).join('');

  const filasActivos = activos.map(pyFilaProyectoResumen).join('');
  const filasCerrados = cerrados.map(pyFilaProyectoResumen).join('');

  const tilesFoto = conFoto.map(r=>{
    const info = pyPrimeraFoto(r);
    return `
      <div class="py-foto-tile" onclick="pyAbrirLightboxProyecto(${r._id})">
        <img src="${pyEsc(info.url)}" loading="lazy" alt="${pyEsc(r.Proyecto)}">
        <div class="nombre">${pyEsc(r.Proyecto)}</div>
        <div class="n-fotos">${pyContarFotos(r)} foto(s)</div>
      </div>`;
  }).join('');

  cont.innerHTML = `
    <div class="py-grid" style="margin-top:14px;">
      <div class="py-card"><div class="label">Proyectos activos</div><div class="value" style="color:var(--accent)">${activos.length}</div></div>
      <div class="py-card"><div class="label">Proyectos cerrados</div><div class="value" style="color:var(--ok)">${cerrados.length}</div></div>
      <div class="py-card"><div class="label">Con fotografia</div><div class="value">${conFoto.length}</div></div>
    </div>

    <table class="py-resumen-table"><tbody>${infoHtml}</tbody></table>

    <div class="py-modal-block-title">Proyectos activos (${activos.length})</div>
    <div class="py-table-wrap">
      <table class="py-table">
        <thead><tr><th>Proyecto</th><th>ID Proyecto</th><th>Ciudad</th><th>Estado</th><th># Equipos</th><th>Asesor</th><th>Supervisor</th></tr></thead>
        <tbody>${filasActivos || '<tr><td colspan="7" class="py-empty">Sin proyectos activos.</td></tr>'}</tbody>
      </table>
    </div>

    <div class="py-modal-block-title">Proyectos cerrados (${cerrados.length})</div>
    <div class="py-table-wrap">
      <table class="py-table">
        <thead><tr><th>Proyecto</th><th>ID Proyecto</th><th>Ciudad</th><th>Estado</th><th># Equipos</th><th>Asesor</th><th>Supervisor</th></tr></thead>
        <tbody>${filasCerrados || '<tr><td colspan="7" class="py-empty">Sin proyectos cerrados.</td></tr>'}</tbody>
      </table>
    </div>

    <div class="py-modal-block-title">Fotografias (${conFoto.length})</div>
    <div class="py-foto-mosaico">${tilesFoto || '<div class="py-empty">Sin fotografias.</div>'}</div>
  `;
}

/* =========================================================
   NOTIFICACIONES (iconos de alerta) por seccion. Reglas confirmadas
   por el usuario. Cada seccion muestra TODOS los iconos que apliquen
   (no solo el mas severo) en la columna NOTIF, junto a Supervisor.
   - 02-OC: >200 dias sin visita (posible suspension), + las 3 comunes
   - 03-PM: 100% OC (deberia estar en montaje) / 95%+ OC (programar
     montador), + las 3 comunes
   - Comunes a ambas: Requiere visita (45+ dias sin visita), Actualizar
     CCNR (45+ dias sin CCNR, solo con material en sitio), Falta 1era
     CCNR (material en sitio y sin ninguna CCNR)
   Secciones restantes (04 a 08) pendientes de reglas.
   ========================================================= */
function pyDiasNum(v){
  if(v === null || v === undefined || v === '' || v === '-') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}
function pyOCPorcentajeNum(v){
  if(v === null || v === undefined || v === '' || v === '-') return null;
  let n;
  if(typeof v === 'string'){
    n = v.includes('%') ? parseFloat(v) : parseFloat(v.replace(',', '.'));
  } else n = v;
  if(isNaN(n)) return null;
  return n <= 1 ? n * 100 : n;
}
function pyBanderasVisitaCCNR(e){
  const diasVisita = pyDiasNum(e['DIAS SIN VISITA']);
  const enSitio = e['ESTATUS DE PRODUCCION'] === 'En Sitio';
  const tieneCCNR = !!e['CARTA CUBO NO RECIBIDO (CCNR)'];
  const diasCCNR = pyDiasNum(e['DIAS SIN HACER CCNR']);
  const banderas = [];
  if(enSitio && !tieneCCNR) banderas.push({ emoji: '‼️', texto: 'Falta 1era CCNR' });
  if(enSitio && tieneCCNR && diasCCNR != null && diasCCNR >= 45) banderas.push({ emoji: '⚠️', texto: 'Actualizar CCNR' });
  if(diasVisita != null && diasVisita >= 45) banderas.push({ emoji: '📅', texto: 'Requiere visita' });
  return { banderas, diasVisita };
}
function pyNotificacionesOC(e){
  const { banderas, diasVisita } = pyBanderasVisitaCCNR(e);
  const resultado = [];
  if(diasVisita != null && diasVisita > 200) resultado.push({ emoji: '✂️', texto: 'Mayor a 200 dias sin visita (posible suspension)' });
  resultado.push(...banderas);
  return resultado;
}
function pyNotificacionesPM(e){
  const { banderas } = pyBanderasVisitaCCNR(e);
  const resultado = [];
  const pctOC = pyOCPorcentajeNum(e['OC']);
  if(pctOC === 100) resultado.push({ emoji: '📌', texto: 'Deberia estar en montaje' });
  else if(pctOC != null && pctOC >= 95) resultado.push({ emoji: '☢️', texto: 'Programar montador' });
  resultado.push(...banderas);
  return resultado;
}
const PY_LEYENDA_NOTIFICACIONES_OC = '✂️ Mayor a 200 dias sin visita (posible suspension) &middot; 📅 Requiere visita &middot; ⚠️ Actualizar CCNR &middot; ‼️ Falta 1era CCNR';
const PY_LEYENDA_NOTIFICACIONES_PM = '📌 Deberia estar en montaje (100% OC) &middot; ☢️ Programar montador (95%+ OC) &middot; 📅 Requiere visita &middot; ⚠️ Actualizar CCNR &middot; ‼️ Falta 1era CCNR';
function pyNotificacionesM(e){
  const resultado = [];
  const diasRestantes = pyDiasNum(e['DIAS RESTANTES']);
  if(diasRestantes != null){
    if(diasRestantes < 0) resultado.push({ emoji: '⏰', texto: 'Montaje con atraso' });
    else if(diasRestantes <= 3) resultado.push({ emoji: '🔴', texto: 'Quedan 3 dias o menos para terminar el montaje' });
    else if(diasRestantes <= 7) resultado.push({ emoji: '🟠', texto: 'Quedan 7 dias o menos para terminar el montaje' });
    else if(diasRestantes <= 14) resultado.push({ emoji: '🟡', texto: 'Quedan 14 dias o menos para terminar el montaje' });
  }
  if(!e['CARTA CUBO RECIBIDO (CCR)']) resultado.push({ emoji: '🚫', texto: 'Falta CCR' });
  const diasVisita = pyDiasNum(e['DIAS SIN VISITA']);
  if(diasVisita != null && diasVisita >= 45) resultado.push({ emoji: '📅', texto: 'Requiere visita' });
  return resultado;
}
const PY_LEYENDA_NOTIFICACIONES_M = '🟡 Dias restantes &le;14 &middot; 🟠 &le;7 &middot; 🔴 &le;3 &middot; 🚫 Falta CCR &middot; ⏰ Montaje con atraso &middot; 📅 Requiere visita';
function pyEsVacioOMarcador(v){
  return v === null || v === undefined || v === '' || v === '-' || v === '.';
}
function pyNotificacionesPA(e){
  const resultado = [];
  if(pyEsVacioOMarcador(e['REVISION DE INSTALACION POR SUPERVISOR'])) resultado.push({ emoji: '👁️', texto: 'Falta revision de supervisor' });
  if(e['LIBERADO POR AJUSTE (MONTAJE)'] !== 'SI') resultado.push({ emoji: '👎', texto: 'No liberado por ajuste' });
  if(pyEsVacioOMarcador(e['CARTA TERMINO INSTALACION (CTI)'])) resultado.push({ emoji: '🚫', texto: 'Falta CTI' });
  const diasVisita = pyDiasNum(e['DIAS SIN VISITA']);
  if(diasVisita != null && diasVisita >= 45) resultado.push({ emoji: '📅', texto: 'Requiere visita' });
  return resultado;
}
const PY_LEYENDA_NOTIFICACIONES_PA = '👁️ Falta rev supervisor &middot; 👎 No liberado por ajuste &middot; 🚫 Falta CTI &middot; 📅 Requiere visita';
function pyNotificacionesA(e){
  const resultado = [];
  const planeado = e['FIN DE AJUSTE PLANEADO'];
  if(planeado){
    const fechaPlaneada = new Date(planeado);
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    if(!isNaN(fechaPlaneada.getTime()) && fechaPlaneada < hoy) resultado.push({ emoji: '⏰', texto: 'Ajuste con retraso' });
  }
  if(!pyEsVacioOMarcador(e['FIN DE AJUSTE MODIFICADO'])) resultado.push({ emoji: '❌', texto: 'Fin ajuste modificado' });
  if(pyEsVacioOMarcador(e['REVISION DE INSTALACION POR SUPERVISOR'])) resultado.push({ emoji: '👁️', texto: 'Falta revision de supervisor' });
  if(e['LIBERADO POR AJUSTE (MONTAJE)'] !== 'SI') resultado.push({ emoji: '👎', texto: 'No liberado por ajuste' });
  if(pyEsVacioOMarcador(e['CARTA TERMINO INSTALACION (CTI)'])) resultado.push({ emoji: '🚫', texto: 'Falta CTI' });
  const diasVisita = pyDiasNum(e['DIAS SIN VISITA']);
  if(diasVisita != null && diasVisita >= 45) resultado.push({ emoji: '📅', texto: 'Requiere visita' });
  return resultado;
}
const PY_LEYENDA_NOTIFICACIONES_A = '⏰ Ajuste con retraso &middot; ❌ Fin ajuste modificado &middot; 📅 Requiere visita &middot; 👁️ Falta rev supervisor &middot; 👎 No liberado por ajuste &middot; 🚫 Falta CTI';
function pyNotificacionesPE(e){
  const resultado = [];
  if(e['PENDIENTES (CALIDAD)'] === 'Con Pendientes') resultado.push({ emoji: '❌', texto: 'Pendientes calidad' });
  return resultado;
}
const PY_LEYENDA_NOTIFICACIONES_PE = '❌ Pendientes calidad';
function pyNotificacionesT(e){
  const resultado = [];
  if(e['PENDIENTES (CALIDAD)'] === 'Con Pendientes') resultado.push({ emoji: '❌', texto: 'Pendientes calidad' });
  if(e['FORMATO (CAF-PG)'] !== 'Original') resultado.push({ emoji: '🚫', texto: 'Formato original falta' });
  if(e['EQUIPO SE QUEDA (ENTREGA)'] === 'Detenido') resultado.push({ emoji: '🛑', texto: 'Se queda detenido' });
  return resultado;
}
const PY_LEYENDA_NOTIFICACIONES_T = '❌ Pendientes calidad &middot; 🚫 Formato original falta &middot; 🛑 Se queda detenido';

/* =========================================================
   REPORTE DE INSTALACIONES: una tabla por cada estatus 01-08
   Columnas y nombres de seccion tomados del reporte oficial en PDF
   "Reporte_instalaciones_Semana_28" (BLT Brilliant). Nota del usuario:
   en este reporte "OC" significa Obra Civil, NO Orden de Compra.
   ========================================================= */
const PY_SECCIONES_REPORTE = [
  { codigo: '01-SUS', nombre: 'Equipos Suspendidos',
    columnas: [
      ['CPVP', 'CARTA DE PRIMER VISITA (CPVP)', 'fecha'], ['FABRICACIÓN', 'ESTATUS DE PRODUCCION', 'texto'],
      ['FECHA DE DESCARGA', 'FECHA DE DESCARGA', 'fecha'], ['ULTIMA VISITA', 'FECHA VISITA', 'fecha'],
      ['COMENTARIO', 'COMENTARIOS FL', 'comentario'], ['% OC', 'OC', 'pct'], ['ULTIMA CCNR', 'CARTA CUBO NO RECIBIDO (CCNR)', 'fecha'],
    ] },
  { codigo: '02-OC', nombre: 'Equipos en Obra Civil', notificacion: pyNotificacionesOC, leyenda: PY_LEYENDA_NOTIFICACIONES_OC,
    columnas: [
      ['CPVP', 'CARTA DE PRIMER VISITA (CPVP)', 'fecha'], ['FABRICACIÓN', 'ESTATUS DE PRODUCCION', 'texto'],
      ['FECHA DE DESCARGA', 'FECHA DE DESCARGA', 'fecha'], ['ULTIMA VISITA', 'FECHA VISITA', 'fecha'],
      ['COMENTARIO', 'COMENTARIOS FL', 'comentario'], ['% OC', 'OC', 'pct'], ['ULTIMA CCNR', 'CARTA CUBO NO RECIBIDO (CCNR)', 'fecha'],
    ] },
  { codigo: '03-PM', nombre: 'Equipos Proximos a Montar', notificacion: pyNotificacionesPM, leyenda: PY_LEYENDA_NOTIFICACIONES_PM,
    columnas: [
      ['CPVP', 'CARTA DE PRIMER VISITA (CPVP)', 'fecha'], ['FABRICACIÓN', 'ESTATUS DE PRODUCCION', 'texto'],
      ['FECHA DE DESCARGA', 'FECHA DE DESCARGA', 'fecha'], ['ULTIMA VISITA', 'FECHA VISITA', 'fecha'],
      ['COMENTARIO', 'COMENTARIOS FL', 'comentario'], ['% OC', 'OC', 'pct'], ['ULTIMA CCNR', 'CARTA CUBO NO RECIBIDO (CCNR)', 'fecha'], ['POSIBLE RECEPCIÓN DE CUBO', 'Posible Recepcion de Cubo', 'fecha'],
    ] },
  { codigo: '04-M', nombre: 'Equipos en Montaje', notificacion: pyNotificacionesM, leyenda: PY_LEYENDA_NOTIFICACIONES_M,
    columnas: [
      ['CCR', 'CARTA CUBO RECIBIDO (CCR)', 'fecha'], ['SUB', 'SUBCONTRATISTA', 'texto'],
      ['INICIO DE MONTAJE', 'INICIO DE MONTAJE', 'fecha'], ['FIN DE MONTAJE', ['FIN DE MONTAJE MODIFICADO', 'FIN DE MONTAJE PLANEADO'], 'fecha'],
      ['DIAS RESTANTES', 'DIAS RESTANTES', 'texto'], ['ULTIMA VISITA', 'FECHA VISITA', 'fecha'],
      ['% M', 'MO', 'pct'], ['COMENTARIO', 'COMENTARIOS FL', 'comentario'],
    ] },
  { codigo: '05-PA', nombre: 'Equipos Proximos a Ajustar', notificacion: pyNotificacionesPA, leyenda: PY_LEYENDA_NOTIFICACIONES_PA,
    columnas: [
      ['REVISIÓN POR SUPERVISOR', 'REVISION DE INSTALACION POR SUPERVISOR', 'fecha'], ['REVISIÓN POR AJUSTE', 'MINUTA REVISION POR AJUSTE', 'fecha'],
      ['¿LIBERADO?', 'LIBERADO POR AJUSTE (MONTAJE)', 'texto'], ['CTI', 'CARTA TERMINO INSTALACION (CTI)', 'fecha'],
      ['ULTIMA VISITA', 'FECHA VISITA', 'fecha'], ['COMENTARIO', 'COMENTARIOS FL', 'comentario'], ['POSIBLE INICIO DE AJUSTE', 'Posible inicio de Ajuste', 'fecha'],
    ] },
  { codigo: '06-A', nombre: 'Equipos en Ajuste', notificacion: pyNotificacionesA, leyenda: PY_LEYENDA_NOTIFICACIONES_A,
    columnas: [
      ['AJUSTADOR', 'AJUSTADOR', 'texto'], ['INICIO DE AJUSTE', 'INICIO DE AJUSTE', 'fecha'],
      ['FIN DE AJUSTE', 'FIN DE AJUSTE PLANEADO', 'fecha'], ['FIN DE AJUSTE MODIFICADO', 'FIN DE AJUSTE MODIFICADO', 'fecha'],
      ['COMENTARIO', 'COMENTARIOS FL', 'comentario'],
    ] },
  { codigo: '07-PE', nombre: 'Equipos Proximos a Entregar', notificacion: pyNotificacionesPE, leyenda: PY_LEYENDA_NOTIFICACIONES_PE,
    columnas: [
      ['INSPECCIÓN DE CALIDAD', 'PROTOCOLO DE ACEPTACION (CALIDAD)', 'fecha'], ['ESTATUS DE INSPECCIÓN', 'ESTATUS DE INSPECCION (CALIDAD)', 'texto'],
      ['¿PENDIENTES?', 'PENDIENTES (CALIDAD)', 'texto'], ['ENTREGA AL CLIENTE (CAF-PG)', 'ENTREGA A CLIENTE (CAF-PG)', 'fecha'],
      ['FORMATO', 'FORMATO (CAF-PG)', 'texto'], ['EL EQUIPO SE QUEDA', 'EQUIPO SE QUEDA (ENTREGA)', 'texto'],
    ] },
  { codigo: '08-T', nombre: 'Equipos Entregados', notificacion: pyNotificacionesT, leyenda: PY_LEYENDA_NOTIFICACIONES_T,
    columnas: [
      ['INSPECCIÓN DE CALIDAD', 'PROTOCOLO DE ACEPTACION (CALIDAD)', 'fecha'], ['ESTATUS DE INSPECCIÓN', 'ESTATUS DE INSPECCION (CALIDAD)', 'texto'],
      ['¿PENDIENTES?', 'PENDIENTES (CALIDAD)', 'texto'], ['ENTREGA AL CLIENTE (CAF-PG)', 'ENTREGA A CLIENTE (CAF-PG)', 'fecha'],
      ['FORMATO', 'FORMATO (CAF-PG)', 'texto'], ['EL EQUIPO SE QUEDA', 'EQUIPO SE QUEDA (ENTREGA)', 'texto'],
    ] },
];
const PY_ANIO_ACTUAL = new Date().getFullYear();


function pyPopulateFiltrosReporte(){
  const supervisores = [...new Set(PY_EQUIPOS.map(e=>e['Sup FL']).filter(Boolean))].sort();
  document.getElementById('py-f-reporte-supervisor').innerHTML = '<option value="">Todo supervisor</option>' + supervisores.map(s=>`<option value="${pyEsc(s)}">${pyEsc(s)}</option>`).join('');

  const asesores = [...new Set(PY_PROYECTOS.map(r=>r.Asesor).filter(Boolean))].sort();
  document.getElementById('py-f-reporte-asesor').innerHTML = '<option value="">Todo asesor</option>' + asesores.map(a=>`<option value="${pyEsc(a)}">${pyEsc(a)}</option>`).join('');

  document.getElementById('py-f-reporte-estatus').innerHTML = '<option value="">Todos los estatus</option>' + PY_SECCIONES_REPORTE.map(s=>`<option value="${s.codigo}">${s.codigo} - ${pyEsc(s.nombre)}</option>`).join('');
}

function pyGenerarPDF(){
  pyShowTab('reporte');
  const fechaEl = document.getElementById('py-print-fecha');
  if(fechaEl) fechaEl.textContent = new Date().toLocaleDateString('es-MX');
  setTimeout(() => window.print(), 50);
}

function pyRenderGraficaReporte(baseEquipos, secciones){
  const cont = document.getElementById('py-reporte-graficas');
  const conteos = secciones.map(sec=>{
    let eq = baseEquipos.filter(e => e.ESTATUS === sec.codigo);
    if(sec.codigo === '08-T'){
      eq = eq.filter(e => String(e['AÑO DE TERMINO']) === String(PY_ANIO_ACTUAL));
    }
    return { codigo: sec.codigo, nombre: sec.nombre, total: eq.length };
  });
  const max = Math.max(1, ...conteos.map(c=>c.total));

  cont.innerHTML = `
    <div class="py-grafica-wrap">
      <div class="py-grafica-titulo">Resumen de equipos por seccion</div>
      ${conteos.map(c=>{
        const pctAncho = Math.max(4, Math.round(c.total / max * 100));
        const valorDentro = pctAncho > 20;
        return `
        <div class="py-grafica-fila">
          <div class="py-grafica-label">${c.codigo} ${pyEsc(c.nombre)}</div>
          <div class="py-grafica-barra-fondo">
            <div class="py-grafica-barra" style="width:${pctAncho}%;">${valorDentro ? `<span class="py-grafica-valor">${c.total}</span>` : ''}</div>
          </div>
          ${!valorDentro ? `<span class="py-grafica-valor fuera">${c.total}</span>` : ''}
        </div>`;
      }).join('')}
    </div>
  `;
}

function pyTablaUnaSeccion(sec, equiposSeccionSinOrdenar, proyectosPorId){
  let equiposSeccion = pyOrdenarPorProyecto(equiposSeccionSinOrdenar, 'PROYECTO');

  const columnasConBase = [
    ['SUP', null, 'texto'],
    ...(sec.notificacion ? [['NOTIF', null, 'icono']] : []),
    ['EDO', null, 'texto'], ['PROYECTO', null, 'proyecto'], ['REFERENCIA', null, 'referencia'],
    ...sec.columnas,
  ];
  const encabezados = columnasConBase.map(c => `<th class="col-${c[2]}">${pyEsc(c[0])}</th>`).join('');

  const filas = equiposSeccion.map(e => {
    const proy = proyectosPorId[e['ID PROYECTO']];
    const banderas = sec.notificacion ? sec.notificacion(e) : [];
    const celdasBase = [
      `<td class="col-texto">${pyEsc(e['Sup FL'])||'-'}</td>`,
      ...(sec.notificacion ? [`<td class="col-icono ${banderas.length ? 'con-alerta' : ''}" title="${pyEsc(banderas.map(b=>b.texto).join(' | '))}">${banderas.map(b=>b.emoji).join(' ') || '-'}</td>`] : []),
      `<td class="col-texto">${pyEsc(e['EDO'])||'-'}</td>`,
      `<td class="col-proyecto"><a href="#" onclick="event.preventDefault(); pyAbrirProyecto(${proy ? proy._id : -1})">${pyEsc(e['PROYECTO'])||'-'}</a></td>`,
      `<td class="col-referencia">${pyEsc(e['REFERENCIA EN SITIO'])||'-'}</td>`,
    ];
    const celdasSeccion = sec.columnas.map(c => {
      const campos = Array.isArray(c[1]) ? c[1] : [c[1]];
      const valor = campos.map(f => e[f]).find(v => v != null && v !== '' && v !== '-');
      const texto = c[2] === 'pct' ? pyFormatPorcentaje(valor) : (pyEsc(pyFormatValor(valor)) || '-');
      return `<td class="col-${c[2]}">${texto}</td>`;
    });
    return '<tr>' + celdasBase.join('') + celdasSeccion.join('') + '</tr>';
  }).join('');

  const colgroup = pyColgroupReporte(columnasConBase, equiposSeccion, proyectosPorId);

  return `
    <div class="py-foto-grupo">
      <div class="py-foto-grupo-title">${sec.codigo} &middot; ${pyEsc(sec.nombre)} <span class="count">(${equiposSeccion.length})</span></div>
      ${sec.notificacion ? `<div class="py-leyenda-notif">${sec.leyenda}</div>` : ''}
      <div class="py-table-wrap">
        <table class="py-table-reporte">
          ${colgroup}
          <thead><tr>${encabezados}</tr></thead>
          <tbody>${filas || `<tr><td colspan="${encabezados.length}" class="py-empty">Sin equipos en esta seccion.</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
}

function pyRenderReporteInstalaciones(){
  const supervisor = document.getElementById('py-f-reporte-supervisor').value;
  const asesor = document.getElementById('py-f-reporte-asesor').value;
  const estatusFiltro = document.getElementById('py-f-reporte-estatus').value;

  const proyectosPorId = {};
  PY_PROYECTOS.forEach(p => { if(p['ID Proyecto']) proyectosPorId[p['ID Proyecto']] = p; });

  let base = PY_EQUIPOS.filter(e=>{
    const p = proyectosPorId[e['ID PROYECTO']];
    if(!p || p['Activo / Inactivo'] !== 'Activo') return false;
    if(supervisor && e['Sup FL'] !== supervisor) return false;
    if(asesor && p.Asesor !== asesor) return false;
    return true;
  });

  const secciones = estatusFiltro ? PY_SECCIONES_REPORTE.filter(s=>s.codigo===estatusFiltro) : PY_SECCIONES_REPORTE;

  pyRenderGraficaReporte(base, secciones);

  const cont = document.getElementById('py-reporte-instalaciones');
  cont.innerHTML = secciones.map(sec=>{
    let equiposSeccion = base.filter(e => e.ESTATUS === sec.codigo);
    if(sec.codigo === '08-T'){
      equiposSeccion = equiposSeccion.filter(e => String(e['AÑO DE TERMINO']) === String(PY_ANIO_ACTUAL));
    }
    return pyTablaUnaSeccion(sec, equiposSeccion, proyectosPorId);
  }).join('');
}

// Ancho de columna en px segun tipo. FECHA es la referencia: COMENTARIO = 2.5x FECHA.
// PROYECTO/REFERENCIA se calculan segun el valor mas largo de esa seccion (para que
// se adapten, pero con un tope para no desbordar la tabla). Las de texto llevan un
// limite fijo y el contenido se ajusta hacia abajo (ver CSS word-break).
const PY_ANCHO_FECHA = 88;
const PY_ANCHO_COMENTARIO = Math.round(PY_ANCHO_FECHA * 2.5);
function pyAnchoPorContenido(valores, min, max){
  const masLargo = valores.reduce((a,v) => Math.max(a, String(v||'').length), 0);
  return Math.max(min, Math.min(max, masLargo * 6.5 + 20));
}
function pyColgroupReporte(columnasConBase, equiposSeccion, proyectosPorId){
  const anchoProyecto = pyAnchoPorContenido(equiposSeccion.map(e=>e['PROYECTO']), 90, 220);
  const anchoReferencia = pyAnchoPorContenido(equiposSeccion.map(e=>e['REFERENCIA EN SITIO']), 70, 160);
  const cols = columnasConBase.map(c => {
    let px;
    if(c[2] === 'icono') px = 82;
    else if(c[2] === 'fecha') px = PY_ANCHO_FECHA;
    else if(c[2] === 'pct') px = 56;
    else if(c[2] === 'comentario') px = PY_ANCHO_COMENTARIO;
    else if(c[2] === 'proyecto') px = anchoProyecto;
    else if(c[2] === 'referencia') px = anchoReferencia;
    else px = 95; // texto
    return `<col style="width:${px}px;">`;
  }).join('');
  return `<colgroup>${cols}</colgroup>`;
}

function pyPromedioProyecto(equipos,campo){
  if(!equipos.length)return 0;
  return Math.round(equipos.reduce((sum,e)=>sum+Math.max(0,Math.min(100,pyNum(e[campo])<=1?pyNum(e[campo])*100:pyNum(e[campo]))),0)/equipos.length);
}
function pyProjectProgressBars(equipos){
  const oc=pyPromedioProyecto(equipos,'OC'),mo=pyPromedioProyecto(equipos,'MO'),aj=pyPromedioProyecto(equipos,'AJ');
  const general=Math.round((oc*.4)+(mo*.4)+(aj*.2));
  const row=(label,pct,cls)=>`<div class="py-project-progress-row"><div class="py-project-progress-label"><span>${label}</span><strong>${pct}%</strong></div><div class="py-project-progress-track"><div class="py-project-progress-fill ${cls}" style="width:${pct}%"></div></div></div>`;
  return `<section class="py-project-progress-card"><div class="py-project-section-title">Avance del proyecto</div>${row('Avance General',general,'general')}${row('Obra Civil (40%)',oc,'oc')}${row('Instalación (40%)',mo,'mo')}${row('Ajuste (20%)',aj,'aj')}</section>`;
}
function pyManttoProjectHtml(p){
  const fields=[['Proyecto',p.proyecto_nombre||p.proyecto],['Ciudad',p.ciudad],['Estado',p.estado],['Zona',p.zona],['Supervisor',p.supervisor],['Equipos',p.equipos],['Equipos parados',p.parados],['Tickets 35 días',p.tickets_35d],['MTBC 365',p.mtbc_365]];
  const visible=fields.filter(([,v])=>v!==null&&v!==undefined&&String(v).trim()!=='');
  if(!visible.length)return '';
  return `<section class="py-project-mantto"><div class="py-project-section-title">United · Operación y Mantenimiento</div><div class="py-project-info-grid">${visible.map(([k,v])=>`<div class="py-project-info-item"><span>${pyEsc(k)}</span><strong>${pyEsc(v)}</strong></div>`).join('')}</div><div class="py-project-mantto-actions"><button type="button" class="py-crosslink-btn" id="py-open-mantto-project">Abrir detalle en Mantenimiento</button></div></section>`;
}

/* =========================================================
   DETALLE DE PROYECTO -> lista de equipos
   ========================================================= */
async function pyAbrirProyecto(id){
  const proyecto = PY_PROYECTOS.find(item => item._id === id);
  if(!proyecto) return;

  const idProyecto = String(proyecto['ID Proyecto'] || '').trim();
  const nombreProyecto = String(proyecto.Proyecto || '').trim();

  if(
    window.ManttoDetails &&
    typeof window.ManttoDetails.openProyecto === 'function'
  ){
    return window.ManttoDetails.openProyecto(
      idProyecto || nombreProyecto,
      {
        template: 'cliente-unificado',
        source: 'instalaciones-proyectos',
        projectName: nombreProyecto,
        cliente: proyecto.Cliente || ''
      }
    );
  }

  console.error(
    'ManttoDetails.openProyecto no está disponible para abrir el detalle unificado.'
  );
}

function pyAbrirEquipoDesdeProyecto(idEquipo){
  const equipo = PY_EQUIPOS.find(x => x._id === idEquipo);
  if(!equipo) return;

  const proyecto = String(equipo['PROYECTO'] || '').trim();
  const referencia = String(equipo['REFERENCIA EN SITIO'] || '').trim();

  // El detalle permanece en Corellian. La relación con Mantenimiento se
  // presenta como acceso contextual dentro del encabezado del equipo.
  pyAbrirEquipo(idEquipo);
}

/* =========================================================
   DETALLE DE EQUIPO (agrupado por seccion)
   ========================================================= */
/* =========================================================
   COMENTARIOS DE JUNTA (pendientes personales por equipo)
   NOTA: guardado solo en memoria del navegador (se pierde al recargar).
   PY_USUARIO_ACTUAL es un marcador de prueba -- en el sistema real cada
   pendiente se debe guardar ligado a la cuenta autenticada del usuario,
   y este modulo debe filtrar por esa cuenta en vez de esta constante.
   PY_LISTA_RESPONSABLES esta vacia porque la hoja de Usuarios (con la
   columna de iniciales) todavia no existe -- por eso "Responsable" es
   texto libre por ahora, en vez de un listado. Cuando exista, cambiar
   el <input> por un <select> poblado desde esa hoja.
   ========================================================= */
const PY_USUARIO_ACTUAL = 'usuario_prueba';
let PY_PENDIENTES_JUNTA = [];

function pySemanaISO(fecha){
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const diaSemana = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana);
  const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const numSemana = Math.ceil((((d - inicioAnio) / 86400000) + 1) / 7);
  // d.getUTCFullYear() ya es el "ano ISO" correcto (una semana de fin de diciembre
  // puede pertenecer a la semana 1 del ano siguiente, y viceversa) -- si el ano
  // tiene 53 semanas ISO, numSemana llega a 53 sin problema (no se fuerza a 52).
  return { texto: 'S' + String(numSemana).padStart(2, '0'), anio: d.getUTCFullYear(), orden: d.getUTCFullYear()*100 + numSemana };
}

function pyEnviarComentarioJunta(idEquipo){
  const texto = document.getElementById('py-cj-texto').value.trim();
  if(!texto) return;
  const responsables = document.getElementById('py-cj-responsable').value
    .split(',').map(s=>s.trim()).filter(Boolean);
  const ahora = new Date();
  const sem = pySemanaISO(ahora);

  PY_PENDIENTES_JUNTA.push({
    idEquipo, usuario: PY_USUARIO_ACTUAL, texto, responsables,
    semana: sem.texto, semanaOrden: sem.orden, fecha: ahora.toISOString(),
  });

  document.getElementById('py-cj-texto').value = '';
  document.getElementById('py-cj-responsable').value = '';
  pyRenderPendientesJunta(idEquipo);
  pyRenderComentariosJunta();
}

function pyRenderPendientesJunta(idEquipo){
  const cont = document.getElementById('py-cj-lista');
  if(!cont) return;
  const propios = PY_PENDIENTES_JUNTA
    .filter(p => p.idEquipo === idEquipo && p.usuario === PY_USUARIO_ACTUAL)
    .sort((a,b) => new Date(b.fecha) - new Date(a.fecha));

  if(!propios.length){ cont.innerHTML = ''; return; }

  cont.innerHTML = propios.map(p => `
    <div class="py-cj-item">
      <div class="py-cj-item-top">
        <span><span class="py-cj-item-semana">${p.semana}</span> ${p.fecha.slice(0,10)}</span>
        <span>${p.responsables && p.responsables.length ? 'Responsable(s): ' + p.responsables.map(pyEsc).join(', ') : ''}</span>
      </div>
      <div class="py-cj-item-texto">${pyEsc(p.texto)}</div>
    </div>`).join('');
}

/* =========================================================
   ANALISIS AJUSTE: historico completo de equipos entregados (08-T,
   todos los anos), agrupado por AÑO DE TERMINO, con conteo de dias
   entre cada paso del proceso de ajuste.
   ========================================================= */
const PY_MESES_ABREV = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
function pyParsearFecha(v){
  if(v === null || v === undefined || v === '' || v === '-' || v === '.') return null;
  if(typeof v !== 'string') return null;
  if(/^\d{4}-\d{2}-\d{2}/.test(v)){
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  const m = v.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if(m){
    const mes = PY_MESES_ABREV[m[2]];
    if(mes === undefined) return null;
    const d = new Date(2000 + parseInt(m[3],10), mes, parseInt(m[1],10));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
function pyDiasEntre(v1, v2){
  const d1 = pyParsearFecha(v1), d2 = pyParsearFecha(v2);
  if(!d1 || !d2) return null;
  return Math.round((d2 - d1) / 86400000);
}

function pyMetricasAjuste(e){
  const inicio = e['INICIO DE AJUSTE'];
  const teorico = e['FIN DE AJUSTE PLANEADO'];
  const real = e['FIN DE AJUSTE REAL'];
  const calidad = e['PROTOCOLO DE ACEPTACION (CALIDAD)'];
  const cliente = e['ENTREGA A CLIENTE (CAF-PG)'];
  return {
    inicio, teorico, real, calidad, cliente,
    inicioTeorico: pyDiasEntre(inicio, teorico),
    teoricoReal: pyDiasEntre(teorico, real),
    realCalidad: pyDiasEntre(real, calidad),
    calidadCliente: pyDiasEntre(calidad, cliente),
    inicioReal: pyDiasEntre(inicio, real),
    inicioCalidad: pyDiasEntre(inicio, calidad),
    inicioCliente: pyDiasEntre(inicio, cliente),
  };
}
function pyTieneAlgunaMetrica(m){
  return [m.inicioTeorico, m.teoricoReal, m.realCalidad, m.calidadCliente, m.inicioReal, m.inicioCalidad, m.inicioCliente]
    .some(v => v != null);
}

// Equipos calificados para el analisis por tipo: 08-T, con al menos 1
// metrica de dias calculable, y con Niveles Y Capacidad ambos definidos
// (si falta alguno, no se puede clasificar por "tipo").
function pyPopulateFiltroTipo(){
  const calificados = PY_EQUIPOS
    .filter(e => e.ESTATUS === '08-T')
    .filter(e => pyTieneAlgunaMetrica(pyMetricasAjuste(e)))
    .filter(e => e['NO. PISOS'] != null && e['NO. PISOS'] !== '' && e['CAPACIDAD [kg]'] != null && e['CAPACIDAD [kg]'] !== '');

  const conteo = {};
  calificados.forEach(e=>{
    const clave = e['NO. PISOS'] + '|' + e['CAPACIDAD [kg]'];
    conteo[clave] = (conteo[clave]||0) + 1;
  });
  const tipos = Object.entries(conteo)
    .filter(([,n]) => n >= 5)
    .sort((a,b) => b[1]-a[1]);

  document.getElementById('py-f-tipo-equipo').innerHTML = '<option value="">Selecciona un tipo...</option>' +
    tipos.map(([clave,n])=>{
      const [niveles, capacidad] = clave.split('|');
      return `<option value="${pyEsc(clave)}">${pyEsc(niveles)} niveles, ${pyEsc(capacidad)} kg (${n} equipos)</option>`;
    }).join('');
}

function pyRenderComportamientoTipo(){
  const clave = document.getElementById('py-f-tipo-equipo').value;
  const cont = document.getElementById('py-comportamiento-tipo');
  if(!clave){ cont.innerHTML = ''; return; }
  const [niveles, capacidad] = clave.split('|');

  const equiposTipo = PY_EQUIPOS.filter(e =>
    e.ESTATUS === '08-T' &&
    String(e['NO. PISOS']) === niveles && String(e['CAPACIDAD [kg]']) === capacidad &&
    pyTieneAlgunaMetrica(pyMetricasAjuste(e))
  );

  const porAnio = {};
  equiposTipo.forEach(e=>{
    const anio = e['AÑO DE TERMINO'] || '(sin ano)';
    if(!porAnio[anio]) porAnio[anio] = [];
    porAnio[anio].push(pyMetricasAjuste(e));
  });
  const anios = Object.keys(porAnio).sort((a,b)=>{
    if(a === '(sin ano)') return 1;
    if(b === '(sin ano)') return -1;
    return b - a;
  });

  const promedio = (arr, campo) => {
    const vals = arr.map(m=>m[campo]).filter(v=>v!=null);
    if(!vals.length) return null;
    return Math.round(vals.reduce((a,b)=>a+b,0) / vals.length);
  };
  const cCol = v => v==null ? '-' : v;

  const filas = anios.map(anio=>{
    const grupo = porAnio[anio];
    return `<tr>
      <td class="col-texto">${pyEsc(anio)}</td>
      <td class="col-texto">${grupo.length}</td>
      <td class="col-pct">${cCol(promedio(grupo,'inicioReal'))}</td>
      <td class="col-pct">${cCol(promedio(grupo,'inicioCalidad'))}</td>
      <td class="col-pct">${cCol(promedio(grupo,'inicioCliente'))}</td>
    </tr>`;
  }).join('');

  cont.innerHTML = `
    <div class="py-table-wrap">
      <table class="py-table">
        <thead><tr><th>Año</th><th># Equipos</th><th>Prom. dias Inicio&rarr;Real</th><th>Prom. dias Inicio&rarr;Calidad</th><th>Prom. dias Inicio&rarr;Cliente</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
    <div class="py-cj-nota" style="margin-top:8px;">Promedios en dias, redondeados. Solo se promedian los equipos de ese año que tienen el dato correspondiente.</div>
  `;
}

function pyRenderAnalisisAjuste(){
  const cont = document.getElementById('py-analisis-ajuste-lista');
  if(!cont) return;

  const historico = PY_EQUIPOS
    .filter(e => e.ESTATUS === '08-T')
    .filter(e => pyTieneAlgunaMetrica(pyMetricasAjuste(e)));
  const grupos = {};
  historico.forEach(e=>{
    const anio = e['AÑO DE TERMINO'] || '(sin ano)';
    if(!grupos[anio]) grupos[anio] = [];
    grupos[anio].push(e);
  });
  const anios = Object.keys(grupos).sort((a,b)=>{
    if(a === '(sin ano)') return 1;
    if(b === '(sin ano)') return -1;
    return b - a;
  });

  const cCol = v => v==null ? '-' : v;
  const claseDias = v => (v != null && v < 0) ? ' dias-negativo' : '';
  const claseFecha = (actual, anterior) => {
    const dA = pyParsearFecha(actual), dP = pyParsearFecha(anterior);
    return (dA && dP && dA < dP) ? ' fecha-invertida' : '';
  };

  cont.innerHTML = anios.map(anio=>{
    grupos[anio] = pyOrdenarPorProyecto(grupos[anio], 'PROYECTO');
    const filas = grupos[anio].map(e=>{
      const m = pyMetricasAjuste(e);
      return `<tr class="clickable" onclick="pyAbrirEquipo(${e._id})">
        <td class="col-proyecto">${pyEsc(e['PROYECTO'])||'-'}</td>
        <td class="col-referencia">${pyEsc(e['REFERENCIA EN SITIO'])||'-'}</td>
        <td class="col-texto">${pyEsc(e['NO. PISOS'])||'-'}</td>
        <td class="col-texto">${pyEsc(e['CAPACIDAD [kg]'])||'-'}</td>
        <td class="col-fecha">${pyEsc(pyFormatValor(m.inicio))||'-'}</td>
        <td class="col-fecha${claseFecha(m.teorico, m.inicio)}">${pyEsc(pyFormatValor(m.teorico))||'-'}</td>
        <td class="col-pct${claseDias(m.inicioTeorico)}">${cCol(m.inicioTeorico)}</td>
        <td class="col-fecha${claseFecha(m.real, m.inicio)}">${pyEsc(pyFormatValor(m.real))||'-'}</td>
        <td class="col-pct${claseDias(m.inicioReal)}">${cCol(m.inicioReal)}</td>
        <td class="col-fecha${claseFecha(m.calidad, m.real)}">${pyEsc(pyFormatValor(m.calidad))||'-'}</td>
        <td class="col-pct${claseDias(m.inicioCalidad)}">${cCol(m.inicioCalidad)}</td>
        <td class="col-fecha${claseFecha(m.cliente, m.calidad)}">${pyEsc(pyFormatValor(m.cliente))||'-'}</td>
        <td class="col-pct${claseDias(m.inicioCliente)}">${cCol(m.inicioCliente)}</td>
      </tr>`;
    }).join('');

    const encabezados = [
      ['PROYECTO','proyecto'], ['EQUIPO','referencia'], ['NIVELES','texto'], ['CAPACIDAD','texto'],
      ['INICIO AJUSTE','fecha'],
      ['FIN TEORICO','fecha'], ['DIAS A TEORICO','pct'],
      ['FIN REAL','fecha'], ['DIAS A REAL','pct'],
      ['ENTREGA CALIDAD','fecha'], ['DIAS A CALIDAD','pct'],
      ['ENTREGA CLIENTE','fecha'], ['DIAS A CLIENTE','pct'],
    ];
    const colgroup = '<colgroup>' + encabezados.map(([,tipo])=>{
      let px = 95;
      if(tipo==='fecha') px = PY_ANCHO_FECHA;
      else if(tipo==='pct') px = 88;
      else if(tipo==='proyecto') px = pyAnchoPorContenido(grupos[anio].map(e=>e['PROYECTO']), 90, 200);
      else if(tipo==='referencia') px = pyAnchoPorContenido(grupos[anio].map(e=>e['REFERENCIA EN SITIO']), 70, 140);
      return `<col style="width:${px}px;">`;
    }).join('') + '</colgroup>';

    return `
      <div class="py-foto-grupo">
        <div class="py-foto-grupo-title">${pyEsc(anio)} <span class="count">(${grupos[anio].length})</span></div>
        <div class="py-table-wrap">
          <table class="py-table-reporte">
            ${colgroup}
            <thead><tr>${encabezados.map(([l,tipo])=>`<th class="col-${tipo}">${l}</th>`).join('')}</tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');
}

/* =========================================================
   DASHBOARD SUPERVISORES
   Cruce con Cobranza via "ID Proyecto" = "PP" de Cobranza (misma llave
   PH NS/PP NS confirmada por el usuario). Cobertura real: solo una
   parte de los proyectos de Ventas tiene contraparte en Cobranza -- se
   muestra tal cual, sin inventar datos para los que no la tienen.
   ========================================================= */
let PY_DASH_SUP_SELECCIONADOS = [];

function pyPopulateDashSupervisores(){
  const cont = document.getElementById('py-dash-sup-checks');
  const supervisores = [...new Set(PY_EQUIPOS.map(e=>e['Sup FL']).filter(Boolean))].sort();
  cont.innerHTML = supervisores.map(s=>`<div class="py-dash-sup-chip" data-sup="${pyEsc(s)}" onclick="pyToggleDashSupervisor('${pyEsc(s)}')">${pyEsc(s)}</div>`).join('');
}

function pyToggleDashSupervisor(inicial){
  const idx = PY_DASH_SUP_SELECCIONADOS.indexOf(inicial);
  if(idx === -1) PY_DASH_SUP_SELECCIONADOS.push(inicial);
  else PY_DASH_SUP_SELECCIONADOS.splice(idx, 1);
  document.querySelectorAll('.py-dash-sup-chip').forEach(el=>{
    el.classList.toggle('activo', PY_DASH_SUP_SELECCIONADOS.includes(el.dataset.sup));
  });
  pyRenderDashSupervisores();
}

function pyEsPartidaAditivaDash(nombre){
  return (nombre||'').toUpperCase().includes('ADITIVA');
}
function pyEsPartidaContractualDash(nombre){
  const n = (nombre||'').toUpperCase();
  if(n.includes('ADITIVA')) return false;
  return n.includes('SUMINISTRO') || n.includes('INSTALACION') || n.includes('INSTALACIÓN');
}

function pyRenderDashSeccionReporte(){
  const cod = document.getElementById('py-dash-seccion').value;
  const cont = document.getElementById('py-dash-seccion-resultado');
  if(!cod){ cont.innerHTML = ''; return; }
  const sec = PY_SECCIONES_REPORTE.find(s=>s.codigo===cod);

  const proyectosPorId = {};
  PY_PROYECTOS.forEach(p => { if(p['ID Proyecto']) proyectosPorId[p['ID Proyecto']] = p; });

  let equiposSeccion = PY_EQUIPOS.filter(e=>{
    const p = proyectosPorId[e['ID PROYECTO']];
    if(!p || p['Activo / Inactivo'] !== 'Activo') return false;
    if(!PY_DASH_SUP_SELECCIONADOS.includes(e['Sup FL'])) return false;
    return e.ESTATUS === cod;
  });
  if(cod === '08-T'){
    equiposSeccion = equiposSeccion.filter(e => String(e['AÑO DE TERMINO']) === String(PY_ANIO_ACTUAL));
  }
  cont.innerHTML = pyTablaUnaSeccion(sec, equiposSeccion, proyectosPorId);
}

function pyRenderDashSupervisores(){
  const cont = document.getElementById('py-dash-sup-resultado');
  if(!PY_DASH_SUP_SELECCIONADOS.length){
    cont.innerHTML = '<div class="py-empty">Selecciona uno o mas supervisores arriba.</div>';
    return;
  }
  const sups = PY_DASH_SUP_SELECCIONADOS;
  const proyectosSup = pyOrdenarPorProyecto(PY_PROYECTOS.filter(p => sups.includes(p.Supervisor)), 'Proyecto');
  const proyectosActivos = proyectosSup.filter(p => !pyEsCerrado(p));
  const equiposSup = PY_EQUIPOS.filter(e => sups.includes(e['Sup FL']));
  const idsEquiposSup = new Set(equiposSup.map(e=>e._id));

  let html = '';

  // 1. Comentarios de junta propios en equipos de estos supervisores
  const comentarios = PY_PENDIENTES_JUNTA.filter(p => p.usuario === PY_USUARIO_ACTUAL && idsEquiposSup.has(p.idEquipo));
  html += `<div class="py-dash-sub-titulo">1. Tus comentarios de junta en equipos de estos supervisores (${comentarios.length})</div>`;
  if(!comentarios.length){
    html += '<div class="py-empty">Sin comentarios registrados.</div>';
  } else {
    const filas = comentarios
      .map(p => ({ ...p, _proyecto: (PY_EQUIPOS.find(x=>x._id===p.idEquipo)||{})['PROYECTO'] || '' }))
      .sort((a,b) => a._proyecto.localeCompare(b._proyecto,'es',{sensitivity:'base'}))
      .map(p => `<tr><td>${p.semana}</td><td>${pyEsc(p._proyecto)||'-'}</td><td>${pyEsc(p.texto)}</td><td>${p.responsables&&p.responsables.length?p.responsables.map(pyEsc).join(', '):'-'}</td></tr>`)
      .join('');
    html += `<div class="py-table-wrap"><table class="py-table"><thead><tr><th>Semana</th><th>Proyecto</th><th>Pendiente</th><th>Responsable(s)</th></tr></thead><tbody>${filas}</tbody></table></div>`;
  }

  // 2. Selector de seccion del reporte de instalaciones
  html += `<div class="py-dash-sub-titulo">2. Reporte de instalaciones por seccion</div>`;
  html += `<div class="py-filters"><select id="py-dash-seccion" onchange="pyRenderDashSeccionReporte()"><option value="">Selecciona una seccion...</option>${PY_SECCIONES_REPORTE.map(s=>`<option value="${s.codigo}">${s.codigo} - ${pyEsc(s.nombre)}</option>`).join('')}</select></div>`;
  html += `<div id="py-dash-seccion-resultado"></div>`;

  // 3. Proyectos activos
  html += `<div class="py-dash-sub-titulo">3. Proyectos activos (${proyectosActivos.length})</div>`;
  if(!proyectosActivos.length){
    html += '<div class="py-empty">Sin proyectos activos.</div>';
  } else {
    const filas = proyectosActivos.map(p=>`
      <tr class="clickable" onclick="pyAbrirProyecto(${p._id})">
        <td>${pyEsc(p.Proyecto)}</td><td>${pyEsc(p['ID Proyecto'])||'-'}</td><td>${pyEsc(p.Ciudad)||'-'}</td>
        <td>${pyEsc(p.Estado)||'-'}</td><td>${p['Numero de Equipos']??'-'}</td><td>${pyEsc(p.Asesor)||'-'}</td>
      </tr>`).join('');
    html += `<div class="py-table-wrap"><table class="py-table"><thead><tr><th>Proyecto</th><th>ID Proyecto</th><th>Ciudad</th><th>Estado</th><th># Equipos</th><th>Asesor</th></tr></thead><tbody>${filas}</tbody></table></div>`;
  }

  // 4. Resumen de aditivas + detalle de pendientes de cobro (via Cobranza)
  const MONEDAS = ['USD','MXN','EUR'];
  const resumenAditivas = {};
  MONEDAS.forEach(m => resumenAditivas[m] = {total:0, pendiente:0});
  const detallePendientes = [];

  proyectosActivos.forEach(p=>{
    const cb = p['ID Proyecto'] && PY_COBRANZA_POR_ID[p['ID Proyecto']];
    if(!cb) return;
    (cb.partidas||[]).forEach(part=>{
      if(!pyEsPartidaAditivaDash(part.partida)) return;
      part.pagos.forEach(pg=>{
        const mon = (pg.moneda||'').toUpperCase();
        if(!MONEDAS.includes(mon)) return;
        if(typeof pg.total === 'number') resumenAditivas[mon].total += pg.total;
        if(typeof pg.pendiente === 'number' && pg.pendiente !== 0){
          resumenAditivas[mon].pendiente += pg.pendiente;
          detallePendientes.push({ proyecto: p.Proyecto, concepto: part.partida + ' — ' + (pg.concepto||'(sin concepto)'), moneda: mon, pendiente: pg.pendiente });
        }
      });
    });
  });

  html += `<div class="py-dash-sub-titulo">4. Resumen de aditivas (via Cobranza)</div>`;
  const tarjetasAditivas = MONEDAS.filter(m => resumenAditivas[m].total || resumenAditivas[m].pendiente).map(m=>`
    <div class="py-card"><div class="label">Aditivas ${m}</div><div class="value">${cbFormatMonedaDash(resumenAditivas[m].total)}</div>
    <div style="font-size:11px;color:var(--warn);margin-top:4px;">Pendiente: ${cbFormatMonedaDash(resumenAditivas[m].pendiente)}</div></div>`).join('');
  html += tarjetasAditivas ? `<div class="py-grid">${tarjetasAditivas}</div>` : '<div class="py-empty">Sin aditivas encontradas (o sin contraparte en Cobranza para estos proyectos).</div>';

  if(detallePendientes.length){
    const filasPend = pyOrdenarPorProyecto(detallePendientes, 'proyecto').map(d=>`
      <tr><td>${pyEsc(d.proyecto)}</td><td>${pyEsc(d.concepto)}</td><td>${pyEsc(d.moneda)}</td><td>${cbFormatMonedaDash(d.pendiente)}</td></tr>`).join('');
    html += `<div class="py-table-wrap" style="margin-top:10px;"><table class="py-table"><thead><tr><th>Proyecto</th><th>Concepto</th><th>Moneda</th><th>Pendiente</th></tr></thead><tbody>${filasPend}</tbody></table></div>`;
  }

  // 5. Proyectos con adeudos contractuales (Suministro+Instalacion, sin aditivas)
  html += `<div class="py-dash-sub-titulo">5. Proyectos con adeudos contractuales</div>`;
  const conAdeudo = [];
  proyectosActivos.forEach(p=>{
    const cb = p['ID Proyecto'] && PY_COBRANZA_POR_ID[p['ID Proyecto']];
    if(!cb || !cb.resumen) return;
    const res = cb.resumen;
    ['usd','mxn'].forEach(mon=>{
      if(res[mon] && typeof res[mon].monto_pendiente === 'number' && res[mon].monto_pendiente > 0){
        conAdeudo.push({ proyecto: p.Proyecto, id: p._id, moneda: mon.toUpperCase(), pendiente: res[mon].monto_pendiente });
      }
    });
  });
  if(!conAdeudo.length){
    html += '<div class="py-empty">Sin adeudos contractuales encontrados (o sin contraparte en Cobranza).</div>';
  } else {
    const filasAdeudo = pyOrdenarPorProyecto(conAdeudo, 'proyecto').map(d=>`
      <tr class="clickable" onclick="pyAbrirProyecto(${d.id})"><td>${pyEsc(d.proyecto)}</td><td>${pyEsc(d.moneda)}</td><td>${cbFormatMonedaDash(d.pendiente)}</td></tr>`).join('');
    html += `<div class="py-table-wrap"><table class="py-table"><thead><tr><th>Proyecto</th><th>Moneda</th><th>Pendiente contractual</th></tr></thead><tbody>${filasAdeudo}</tbody></table></div>`;
  }

  cont.innerHTML = html;
}
function cbFormatMonedaDash(v){
  if(v == null || v === '') return '-';
  const n = typeof v === 'number' ? v : parseFloat(v);
  if(isNaN(n)) return '-';
  const neg = n < 0;
  return (neg?'-':'') + '$' + Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2});
}

function pyRenderComentariosJunta(){
  const cont = document.getElementById('py-comentarios-junta-lista');
  if(!cont) return;

  const propios = PY_PENDIENTES_JUNTA.filter(p => p.usuario === PY_USUARIO_ACTUAL);
  if(!propios.length){
    cont.innerHTML = '<div class="py-empty">Aun no tienes pendientes de junta. Se agregan desde el detalle de cada equipo.</div>';
    return;
  }

  const grupos = {};
  propios.forEach(p => {
    if(!grupos[p.semanaOrden]) grupos[p.semanaOrden] = { semana: p.semana, items: [] };
    grupos[p.semanaOrden].items.push(p);
  });
  const ordenesDesc = Object.keys(grupos).sort((a,b) => b - a);

  cont.innerHTML = ordenesDesc.map(orden => {
    const grupo = grupos[orden];
    const filas = grupo.items
      .map(p => ({ ...p, _proyecto: (PY_EQUIPOS.find(x => x._id === p.idEquipo)||{})['PROYECTO'] || '' }))
      .sort((a,b) => a._proyecto.localeCompare(b._proyecto, 'es', {sensitivity:'base'}))
      .map(p => {
        return `
        <tr>
          <td>${p._proyecto ? pyEsc(p._proyecto) : '-'}</td>
          <td>${pyEsc(p.texto)}</td>
          <td>${p.responsables && p.responsables.length ? p.responsables.map(pyEsc).join(', ') : '-'}</td>
        </tr>`;
      }).join('');
    return `
      <div class="py-foto-grupo">
        <div class="py-foto-grupo-title">${grupo.semana} <span class="count">(${grupo.items.length})</span></div>
        <div class="py-table-wrap">
          <table class="py-table">
            <thead><tr><th>Proyecto</th><th>Pendiente</th><th>Responsable(s)</th></tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');
}

async function pyAbrirEquipo(idEquipo){
  const e = PY_EQUIPOS.find(x=>x._id===idEquipo);

  const gruposHtml = PY_GRUPOS_EQUIPO.map(([nombreGrupo, campos])=>{
    const filas = campos
      .filter(c => e[c] !== null && e[c] !== undefined && e[c] !== '')
      .map(c => `<tr><td class="py-field-label">${pyEsc(c)}</td><td>${pyEsc(pyFormatValor(e[c]))}</td></tr>`)
      .join('');
    if(!filas) return '';
    return `<div class="py-modal-group-title">${pyEsc(nombreGrupo)}</div><table class="py-field-table">${filas}</table>`;
  }).join('');

  const html = `
    <div class="py-detail-title-row">
      <div>
        <div class="py-modal-title">${pyEsc(e['REFERENCIA EN SITIO']) || '(sin referencia)'}</div>
        <div class="py-modal-sub">${pyEsc(e['PROYECTO'])||''} &middot; ID: ${pyEsc(e['ID PROYECTO'])||'-'}</div>
      </div>
      <div id="py-link-mantto-equipo" class="py-detail-crosslink" aria-live="polite"></div>
    </div>

    <div class="py-modal-block-title">Comentario junta</div>
    <div class="py-cj-caja">
      <textarea id="py-cj-texto" class="py-cj-textarea" placeholder="Escribe tu pendiente..." rows="3"></textarea>
      <div class="py-cj-fila-resp">
        <input type="text" id="py-cj-responsable" class="py-cj-input" placeholder="Responsable(s), separados por coma">
        <button class="py-cj-btn" onclick="pyEnviarComentarioJunta(${idEquipo})">Enviar</button>
      </div>
      <div class="py-cj-nota">Solo tu ves tus propios pendientes. Guardado de prueba en este navegador (se pierde al recargar) -- listo para conectar a la base de datos definitiva, donde cada pendiente se ligara a la cuenta real del usuario.</div>
    </div>
    <div id="py-cj-lista"></div>

    ${gruposHtml}
  `;
  pyAbrirPaginaEquipo(html);
  pyRenderPendientesJunta(idEquipo);

  const proyecto=String(e['PROYECTO']||'').trim();
  const referencia=String(e['REFERENCIA EN SITIO']||'').trim();
  const crosslink=document.getElementById('py-link-mantto-equipo');
  if(proyecto&&referencia){
    try{
      const relacionado=await pyFetchJson('/api/equipos/detalle/'+encodeURIComponent(proyecto+'|||'+referencia));
      const mantto=relacionado.mantenimiento||null;
      if(crosslink&&mantto&&mantto.numero_equipo){
        const codigo=String(mantto.numero_equipo).trim();
        crosslink.innerHTML='<button type="button" class="py-crosslink-btn" data-equipo-mantto="'+pyEsc(codigo)+'">Ver equipo en Mantenimiento</button>';
        crosslink.querySelector('button').addEventListener('click',()=>pyAbrirEquipoMantto(codigo));
      }
    }catch(error){
      if(crosslink)crosslink.innerHTML='';
    }
  }
}

/* =========================================================
   INIT
   ========================================================= */
async function pyInit(){
  try{ await pyCargarDesdeAiven(); const status=document.getElementById('py-aiven-status'); if(status)status.innerHTML='<span class="py-connection-dot"></span><span>Aiven conectado · '+PY_EQUIPOS.length+' equipos</span>'; }catch(error){ console.error(error); const page=document.getElementById('py-page'); if(page) page.insertAdjacentHTML('afterbegin',`<div class="py-note">No se pudieron cargar los datos desde Aiven: ${pyEsc(error.message||error)}</div>`); }
  pyRenderKPIs();
  pyPopulateFiltrosBasicos();
  pyRenderProyectos();
  pyRenderCerrados();
  pyRenderFotografias();
  pyBindTabs();
  document.addEventListener('keydown', (e)=>{
    if(!document.getElementById('py-lightbox').classList.contains('open')) return;
    if(e.key === 'ArrowLeft') pyLightboxNav(-1);
    else if(e.key === 'ArrowRight') pyLightboxNav(1);
    else if(e.key === 'Escape') pyCerrarLightbox();
  });
}
async function pyMount(forceReload){
 const view=document.getElementById('view-instalaciones-proyectos');
 if(!view)return false;
 if(forceReload) view.dataset.pyReady='0';
 if(view.dataset.pyReady!=='1'){
   const r=await fetch('./modules/instalaciones-proyectos/instalaciones-proyectos.html?v=20260713-visual-fix',{cache:'no-store'});
   if(!r.ok)throw new Error('No se pudo cargar Proyectos de Instalación.');
   view.innerHTML=await r.text();
   view.dataset.pyReady='1';
   await pyInit();
 }
 return true;
}
Object.assign(window,{
  pyShowTab,pyRenderProyectos,pyRenderCerrados,pyRenderFotografias,
  pyAbrirProyecto,pyAbrirEquipo,pyAbrirProyectoMantto,pyAbrirEquipoMantto,pyAbrirLightboxUna,pyAbrirLightboxProyecto,
  pyLightboxNav,pyCerrarLightbox,pyRenderSlotsFoto
});
window.ManttoInstalacionesProyectos={
 init:function(){return pyMount(false);},
 reload:async function(){
   try{
     const status=document.getElementById('py-aiven-status');
     if(status)status.innerHTML='<span class="py-connection-dot"></span><span>Actualizando Aiven...</span>';
     await pyCargarDesdeAiven();
     pyRenderKPIs();pyPopulateFiltrosBasicos();pyRenderProyectos();pyRenderCerrados();pyRenderFotografias();
     if(status)status.innerHTML='<span class="py-connection-dot"></span><span>Aiven conectado · '+PY_EQUIPOS.length+' equipos</span>';
   }catch(error){
     const status=document.getElementById('py-aiven-status');
     if(status){status.classList.add('error');status.innerHTML='<span class="py-connection-dot"></span><span>'+pyEsc(error.message||error)+'</span>';}
   }
 }
};
window.showInstalacionesProyectos=function(){return pyMount(false);};
})();
