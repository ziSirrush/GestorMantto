// [Aster | 2026-09-24 | ASTER-MG | FIX PVO-PRODUCCION DOCUMENTOS MODAL RESPONSIVE V002]
'use strict';
// [Aster | 2026-10-05 | ASTER-MG | FASE 1 PVO-PRODUCCION CAPTURA MANUAL FECHAS V001]
// [Aster | 2026-10-05 | ASTER-MG | FASE 2 PVO-PRODUCCION SEPARACION FECHAS FUENTES V001]
// [Aster | 2026-10-05 | ASTER-MG | FASE 3 PVO-PRODUCCION COMPARACION FECHAS DETALLE V001]

// [Aster | 2026-09-03 | ASTER-MG | FIX PVO-PRODUCCION GUARDAR EDICION V002]
// [Aster | 2026-09-24 | ASTER-MG | FIX PVO-PRODUCCION DOCUMENTOS DESCARGA SAS V001]
// [Aster | 2026-09-23 | ASTER-MG | FIX PVO-PRODUCCION NUEVO BUSQUEDA PROYECTO CALENDARIO V001]
// [Aster | 2026-09-25 | ASTER-MG | FASE 1 INSTALACIONES DETALLE PVO-PRODUCCION BACKEND V001]
// [Aster | 2026-09-25 | ASTER-MG | FIX INSTALACIONES PVO-PRODUCCION PPNS DIRECTO V002]

// [Aster | 2026-09-01 | ASTER-MG | FIX REESTRUCTURACION LOGISTICA PRODUCCION V001]
// [Aster | 2026-09-03 | ASTER-MG | FASE 2 PVO-PRODUCCION FUENTES LOG_OPS INS_FL V001]
// [Aster | 2026-09-03 | ASTER-MG | FASE 3 PVO-PRODUCCION GUARDAR CAMBIOS V001]
// [Aster | 2026-09-04 | ASTER-MG | FASE 5 PVO-PRODUCCION DETALLE SIN DEPENDENCIA VENTAS V001]

const repo=require('./logistica-produccion.repository');
const storage=require('../../services/storage/azure-storage.service');

const MODES=Object.freeze(['SEMI_AUTOMATICO','MANUAL']);
const CREATION_MODE='MANUAL';

function error(message,status=400,code='VALIDATION_ERROR'){const e=new Error(message);e.status=status;e.statusCode=status;e.code=code;return e;}
function positive(value,name){const n=Number(value);if(!Number.isInteger(n)||n<1)throw error(`${name} inválido.`);return n;}
function optionalPositive(value,name){if(value===undefined||value===null||value==='')return null;return positive(value,name);}
function hasDate(value){const s=String(value||'').trim();return /^\d{4}-\d{2}-\d{2}/.test(s)&&!Number.isNaN(Date.parse(s.slice(0,10)+'T00:00:00Z'));}
function optionalDate(value,name){if(value===undefined||value===null||value==='')return null;if(!hasDate(value))throw error(`${name} debe ser una fecha válida.`);return String(value).slice(0,10);}
function optionalText(value,name,max){const s=String(value==null?'':value).trim();if(!s)return null;if(s.length>max)throw error(`${name} excede ${max} caracteres.`);return s;}
function requiredText(value,name,max){const s=String(value==null?'':value).trim();if(!s)throw error(`${name} es obligatorio.`);if(s.length>max)throw error(`${name} excede ${max} caracteres.`);return s;}
function normalizeMode(value){const mode=String(value||CREATION_MODE).trim().toUpperCase().replace(/[ -]+/g,'_');if(!MODES.includes(mode))throw error('modo_registro debe ser SEMI_AUTOMATICO o MANUAL.');return mode;}
function validPpns(value){const s=String(value||'').trim().toUpperCase();return Boolean(s&&!['SIN PP NS','SIN PPNS','N/A'].includes(s));}
function isoWeekAtMexico(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).reduce((a,p)=>(a[p.type]=p.value,a),{});
  const d=new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)));const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);
  const year=d.getUTCFullYear();const start=new Date(Date.UTC(year,0,1));return {anio:year,semana:Math.ceil((((d-start)/86400000)+1)/7)};
}
function split(value){return String(value||'').split(',').map(v=>v.trim()).filter(Boolean);}
function singleSourceDate(value){
  const dates=[...new Set(split(value).map(v=>String(v).slice(0,10)).filter(hasDate))];
  return dates.length===1?dates[0]:null;
}
function comparisonDate(value){
  const text=String(value||'').trim();
  return hasDate(text)?text.slice(0,10):null;
}
function buildDateComparison({captured,source,sourceRaw,sourceName,linked=true}){
  const capturada=comparisonDate(captured);
  const rawSource=String(sourceRaw||source||'').trim();
  const fuentes=[...new Set(split(rawSource).map(comparisonDate).filter(Boolean))];
  const fuente=fuentes.length===1?fuentes[0]:null;
  let estado='SIN_DATOS';
  let coincide=null;
  if(!linked)estado='SIN_VINCULO';
  else if(!capturada&&!fuentes.length)estado='SIN_DATOS';
  else if(!capturada)estado='SIN_CAPTURA';
  else if(!fuentes.length)estado='SIN_FUENTE';
  else if(fuentes.length>1)estado='FUENTE_MULTIPLE';
  else if(capturada===fuente){estado='COINCIDE';coincide=true;}
  else{estado='DIFERENTE';coincide=false;}
  return {capturada,fuente,fuentes,fuente_origen:sourceName||null,estado,coincide};
}

function decorate(row){
  const sourceBound=row.id_log_ops!==null&&row.id_log_ops!==undefined&&row.id_log_ops!=='';
  const ppns=sourceBound?String(row.ppns_logistica||'').trim():String(row.ppns||'').trim();
  const proyecto=sourceBound?String(row.proyecto_logistica||'').trim():String(row.proyecto||'').trim();
  // Las fechas propias de PVO-Produccion son la autoridad del modulo.
  // log_ops / ins_fl se conservan separadas como fuentes comparativas para Detalle.
  const fechaPvo=row.fecha_pvo||null;
  const fechaVisita=row.fecha_pvo_fl||null;
  const fechaCubos=row.fecha_cubos||null;
  const fechaPvoFuente=sourceBound?(row.fecha_pvo_logistica||null):null;
  const fechaVisitaFuenteRaw=sourceBound?(row.fechas_pvo_fl_fuente||row.fechas_visita||''):'';
  const fechaCubosFuenteRaw=sourceBound?(row.fechas_cubos_fuente||''):'';
  const fechaVisitaFuente=singleSourceDate(fechaVisitaFuenteRaw);
  const fechaCubosFuente=singleSourceDate(fechaCubosFuenteRaw);
  const estatusLogistica=sourceBound?(row.estatus_logistica_fuente||null):(row.estatus_logistica||null);
  const indicators=[];
  if(Number(row.cpvo_count)===0)indicators.push({codigo:'FALTA_ARCHIVO_PVO',emoji:'📍',nombre:'Falta Archivo PVO'});
  if(!validPpns(ppns))indicators.push({codigo:'FALTA_PPNS',emoji:'🥨',nombre:'Falta PPNS'});
  if(Number(row.archivos_count)===0)indicators.push({codigo:'FALTAN_DOCS_PROD',emoji:'💾',nombre:'Faltan Docs de Prod',regla:'PROVISIONAL_AL_MENOS_UN_ARCHIVO'});
  return {
    ...row,
    modo_registro:row.modo_registro||'SEMI_AUTOMATICO',
    ppns,
    proyecto,
    fecha_pvo:fechaPvo,
    fecha_visita:fechaVisita,
    fechas_visita:String(fechaVisita||''),
    fecha_pvo_fl:fechaVisita,
    fechas_pvo_fl:String(fechaVisita||''),
    fecha_cubos:fechaCubos,
    fechas_cubos:String(fechaCubos||''),
    fecha_pvo_fuente:fechaPvoFuente,
    fecha_visita_fuente:fechaVisitaFuente,
    fechas_visita_fuente:String(fechaVisitaFuenteRaw||''),
    fecha_cubos_fuente:fechaCubosFuente,
    fechas_cubos_fuente:String(fechaCubosFuenteRaw||''),
    estatus_logistica:estatusLogistica,
    fuente_operativa:sourceBound?'LOG_OPS_INS_FL':'SNAPSHOT_HISTORICO',
    indicadores:indicators,
    instalaciones:{
      supervisores:split(row.supervisores),
      asesores:split(row.asesores),
      fechas_visita:split(fechaVisitaFuenteRaw),
      fechas_pvo_fl:split(fechaVisitaFuenteRaw),
      fechas_cubos:split(fechaCubosFuenteRaw),
      origen:sourceBound?'LOG_OPS_INS_FL':'LOGISTICA_PRODUCCION_HISTORICO',
      conflictos:{
        supervisor:false,
        asesor:false,
        visita:sourceBound&&Number(row.visita_count)>1,
        pvo_fl:sourceBound&&Number(row.visita_count)>1,
        cubos:sourceBound&&Number(row.cubos_count)>1
      }
    },
    pvo:{
      cpvo:Number(row.cpvo_count)>0,
      pvo_log:hasDate(fechaPvo),
      visita:hasDate(fechaVisita),
      pvo_fl:hasDate(fechaVisita)
    }
  };
}

async function list(query){return {ok:true,data:(await repo.list(query)).map(decorate),reglas:{documentos:'PROVISIONAL_AL_MENOS_UN_ARCHIVO'}};}
async function detail(id){
  const row=await repo.byId(positive(id,'id'));
  if(!row)throw error('Registro de PVO-Producción no encontrado.',404);
  const decorated=decorate(row);
  const sourceBound=row.id_log_ops!==null&&row.id_log_ops!==undefined&&row.id_log_ops!=='';
  const comparacionFechas={
    fecha_pvo:buildDateComparison({
      captured:decorated.fecha_pvo,
      source:decorated.fecha_pvo_fuente,
      sourceRaw:decorated.fecha_pvo_fuente,
      sourceName:'log_ops.pvo',
      linked:sourceBound
    }),
    fecha_visita:buildDateComparison({
      captured:decorated.fecha_pvo_fl,
      source:decorated.fecha_visita_fuente,
      sourceRaw:decorated.fechas_visita_fuente,
      sourceName:'ins_fl.fecha_visita',
      linked:sourceBound
    }),
    fecha_cubos:buildDateComparison({
      captured:decorated.fecha_cubos,
      source:decorated.fecha_cubos_fuente,
      sourceRaw:decorated.fechas_cubos_fuente,
      sourceName:'ins_fl.fecha_posible_recepcion_cubo',
      linked:sourceBound
    })
  };
  return {ok:true,data:{
    produccion:decorated,
    comparacion_fechas:comparacionFechas,
    logistica:{
      id_log_ops:row.id_log_ops,
      relacionada:Boolean(row.id_log_ops),
      modo_registro:decorated.modo_registro,
      ppns:decorated.ppns,
      proyecto:decorated.proyecto,
      fecha_pvo:decorated.fecha_pvo_fuente,
      fecha_visita:decorated.fecha_visita_fuente,
      fecha_entrega_cubos:decorated.fecha_cubos_fuente,
      fechas_visita:decorated.fechas_visita_fuente,
      fechas_cubos:decorated.fechas_cubos_fuente,
      estatus:decorated.estatus_logistica
    },
    instalaciones:decorated.instalaciones,
    archivos:await listFiles(id),
    indicadores:decorated.indicadores
  }};
}

async function listReadOnlyFiles(id){
  const rows=await repo.files(positive(id,'id'));
  return Promise.all(rows.map(async row=>{
    const base={
      id_archivo:row.id_archivo,
      id_produccion:row.id_produccion,
      tipo_archivo:row.tipo_archivo,
      numero_archivo:row.numero_archivo,
      nombre_archivo:row.nombre_archivo,
      nombre_original:row.nombre_original,
      extension:row.extension,
      mime_type:row.mime_type
    };
    if(row.storage_provider==='LEGACY_URL'||row.storage_provider==='LEGACY_REF')return {...base,url_acceso:row.storage_url||null,url_expira:null};
    if(!row.storage_blob_name)return {...base,url_acceso:null,url_expira:null};
    try{
      const sas=await storage.createReadSas_gnral(row.storage_blob_name,{containerName:row.storage_container,fileName:row.nombre_original});
      return {...base,url_acceso:sas.url,url_expira:sas.expires_at};
    }catch(_e){return {...base,url_acceso:null,url_expira:null,storage_no_disponible:true};}
  }));
}

async function projectSummary(idProyecto){
  const ppns=requiredText(idProyecto,'idProyecto',255);
  const rows=await repo.byPpnsExact(ppns);
  const registros=await Promise.all(rows.map(async row=>{
    const decorated=decorate(row);
    return {
      id_log_ops:Number(row.id_log_ops),
      id_produccion:Number(row.id_produccion),
      proyecto:decorated.proyecto,
      fecha_pvo:decorated.fecha_pvo,
      fechas_visita:decorated.fecha_visita?[decorated.fecha_visita]:[],
      fechas_cubos:decorated.fecha_cubos?[decorated.fecha_cubos]:[],
      fecha_envio_docs_fabrica:row.fecha_envio_docs_fabrica||null,
      fecha_envio_pago_fabrica:row.fecha_envio_pago_fabrica||null,
      archivos:await listReadOnlyFiles(row.id_produccion)
    };
  }));
  return {ok:true,data:{id_proyecto:ppns,registros}};
}

async function options(query){const catalogo=repo.statusCatalogDefinition();return {ok:true,data:await repo.ppnsOptions(query.q),catalogo_estatus:await repo.statuses(),catalogo_estatus_produccion:catalogo};}
async function manualCatalogs(){const statuses=await repo.statuses(),catalogo=repo.statusCatalogDefinition();return {ok:true,data:{catalogo_estatus_produccion:catalogo,modos:[{codigo:'MANUAL',nombre:'Manual'}],estatus_produccion:statuses}};}
async function manualProjects(query){return {ok:true,data:await repo.projectOptions(query.q)};}
async function manualAdvisors(query){return {ok:true,data:await repo.manualUserOptions('ASESOR',query.q)};}
async function manualSupervisors(query){return {ok:true,data:await repo.manualUserOptions('SUPERVISOR',query.q)};}
async function manualPpns(query){return {ok:true,data:await repo.ppnsOptions(query.q)};}

async function create(input,user){
  const modo=normalizeMode(input.modo_registro||CREATION_MODE);
  if(modo!==CREATION_MODE)throw error('La captura nueva de PVO-Producción solo está habilitada en modo Manual.');
  const userId=positive(user.id_SB||user.id,'usuario');
  const period=isoWeekAtMexico();
  const comentario=optionalText(input.comentario,'comentario',5000);
  const fechaPvo=optionalDate(input.fecha_pvo,'fecha_pvo');
  const fechaVisita=optionalDate(input.fecha_pvo_fl,'fecha_pvo_fl');
  const fechaCubos=optionalDate(input.fecha_cubos,'fecha_cubos');
  const fechaDocs=optionalDate(input.fecha_envio_docs_fabrica,'fecha_envio_docs_fabrica');
  const fechaPago=optionalDate(input.fecha_envio_pago_fabrica,'fecha_envio_pago_fabrica');
  const idStatus=optionalPositive(input.id_estatus_produccion,'id_estatus_produccion');
  if(!(await repo.validStatus(idStatus)))throw error('El Estatus Producción no pertenece al catálogo activo Logistica / Estatus Produccion.');

  const idLog=positive(input.id_log_ops,'id_log_ops');
  const source=await repo.logSnapshotById(idLog);
  if(!source)throw error('El proyecto seleccionado ya no existe en Logística.',404);
  const sourcePpns=requiredText(source.id_ppns,'PPNS del registro logístico',255);
  const advisor=positive(input.id_asesor,'id_asesor');
  const supervisor=positive(input.id_supervisor,'id_supervisor');
  if(!(await repo.manualUserValid(advisor,'ASESOR')))throw error('El asesor seleccionado no pertenece a los roles autorizados de Ventas.');
  if(!(await repo.manualUserValid(supervisor,'SUPERVISOR')))throw error('El supervisor seleccionado no pertenece a Supervisores/Superintendentes de Instalaciones.');

  const payload={
    modo_registro:CREATION_MODE,
    id_log_ops:idLog,
    // El PPNS se persiste porque es la relación directa con ins_fl.id_proyecto.
    ppns:sourcePpns,
    proyecto:null,
    id_cotizacion_venta:null,
    id_asesor:advisor,
    id_supervisor:supervisor,
    fecha_pvo:fechaPvo,
    fecha_pvo_fl:fechaVisita,
    fecha_cubos:fechaCubos,
    estatus_logistica:null,
    id_estatus_produccion:idStatus,
    comentario,
    fecha_envio_docs_fabrica:fechaDocs,
    fecha_envio_pago_fabrica:fechaPago,
    semana:period.semana,
    anio:period.anio
  };

  const id=await repo.create(payload,userId);
  return detail(id);
}

async function update(id,input,user){
  id=positive(id,'id');
  const userId=positive(user.id_SB||user.id,'usuario');
  const current=await repo.byId(id);
  if(!current)throw error('Registro de PVO-Producción no encontrado.',404);
  const mode=normalizeMode(current.modo_registro||'SEMI_AUTOMATICO');

  const commonAllowed=['id_estatus_produccion','comentario','fecha_envio_docs_fabrica','fecha_envio_pago_fabrica'];
  const manualAllowed=[...commonAllowed,'id_log_ops','id_asesor','id_supervisor','fecha_pvo','fecha_pvo_fl','fecha_cubos'];
  const allowed=mode==='MANUAL'?manualAllowed:commonAllowed;
  const unknown=Object.keys(input).filter(k=>!allowed.includes(k));
  if(unknown.length)throw error(`Campos no editables: ${unknown.join(', ')}.`);

  const next={
    id_log_ops:current.id_log_ops,
    // Mantener snapshots históricos existentes sin permitir que la UI los sobrescriba.
    ppns:current.ppns,
    proyecto:current.proyecto,
    id_cotizacion_venta:current.id_cotizacion_venta,
    id_asesor:current.id_asesor,
    id_supervisor:current.id_supervisor,
    fecha_pvo:current.fecha_pvo,
    fecha_pvo_fl:current.fecha_pvo_fl,
    fecha_cubos:current.fecha_cubos,
    estatus_logistica:current.estatus_logistica,
    id_estatus_produccion:current.id_estatus_produccion,
    comentario:current.comentario,
    fecha_envio_docs_fabrica:current.fecha_envio_docs_fabrica,
    fecha_envio_pago_fabrica:current.fecha_envio_pago_fabrica
  };

  if(Object.hasOwn(input,'id_estatus_produccion')){
    const candidate=optionalPositive(input.id_estatus_produccion,'id_estatus_produccion');
    const changed=String(candidate??'')!==String(current.id_estatus_produccion??'');
    if(changed&&!(await repo.validStatus(candidate)))throw error('El Estatus Producción no pertenece al catálogo activo Logistica / Estatus Produccion.');
    next.id_estatus_produccion=candidate;
  }
  if(Object.hasOwn(input,'comentario'))next.comentario=optionalText(input.comentario,'comentario',5000);
  if(Object.hasOwn(input,'fecha_envio_docs_fabrica'))next.fecha_envio_docs_fabrica=optionalDate(input.fecha_envio_docs_fabrica,'fecha_envio_docs_fabrica');
  if(Object.hasOwn(input,'fecha_envio_pago_fabrica'))next.fecha_envio_pago_fabrica=optionalDate(input.fecha_envio_pago_fabrica,'fecha_envio_pago_fabrica');

  if(mode==='MANUAL'){
    if(Object.hasOwn(input,'fecha_pvo'))next.fecha_pvo=optionalDate(input.fecha_pvo,'fecha_pvo');
    if(Object.hasOwn(input,'fecha_pvo_fl'))next.fecha_pvo_fl=optionalDate(input.fecha_pvo_fl,'fecha_pvo_fl');
    if(Object.hasOwn(input,'fecha_cubos'))next.fecha_cubos=optionalDate(input.fecha_cubos,'fecha_cubos');
    if(Object.hasOwn(input,'id_log_ops')){
      const idLog=positive(input.id_log_ops,'id_log_ops');
      const changed=String(idLog)!==String(current.id_log_ops??'');
      if(changed){
        const source=await repo.logSnapshotById(idLog);
        if(!source)throw error('El proyecto seleccionado ya no existe en Logística.',404);
        next.ppns=requiredText(source.id_ppns,'PPNS del registro logístico',255);
      }
      next.id_log_ops=idLog;
    }
    if(Object.hasOwn(input,'id_asesor')){
      const advisor=positive(input.id_asesor,'id_asesor');
      const changed=String(advisor)!==String(current.id_asesor??'');
      if(changed&&!(await repo.manualUserValid(advisor,'ASESOR')))throw error('El asesor seleccionado no pertenece a los roles autorizados de Ventas.');
      next.id_asesor=advisor;
    }
    if(Object.hasOwn(input,'id_supervisor')){
      const supervisor=positive(input.id_supervisor,'id_supervisor');
      const changed=String(supervisor)!==String(current.id_supervisor??'');
      if(changed&&!(await repo.manualUserValid(supervisor,'SUPERVISOR')))throw error('El supervisor seleccionado no pertenece a Supervisores/Superintendentes de Instalaciones.');
      next.id_supervisor=supervisor;
    }
  }

  // repository.update ya valida y bloquea el registro activo con FOR UPDATE.
  // No se interpreta affectedRows=0 como 404: guardar sin diferencias sigue siendo válido.
  await repo.update(id,next,userId);
  return detail(id);
}

async function listFiles(id){
  const rows=await repo.files(positive(id,'id'));
  return Promise.all(rows.map(async row=>{
    if(row.storage_provider==='LEGACY_URL'||row.storage_provider==='LEGACY_REF')return {...row,url_acceso:row.storage_url||null,url_descarga:null};
    if(!row.storage_blob_name)return {...row,url_acceso:null,url_descarga:null};
    try{
      const [sas,downloadSas]=await Promise.all([
        storage.createReadSas_gnral(row.storage_blob_name,{containerName:row.storage_container,fileName:row.nombre_original}),
        storage.createReadSas_gnral(row.storage_blob_name,{containerName:row.storage_container,fileName:row.nombre_original,download:true})
      ]);
      return {...row,url_acceso:sas.url,url_descarga:downloadSas.url,url_expira:sas.expires_at};
    }catch(_e){return {...row,url_acceso:null,url_descarga:null,storage_no_disponible:true};}
  }));
}
function fileSlot(type,slot){const t=String(type||'').trim().toUpperCase();const n=positive(slot,'numero_archivo');if(!['CPVO','GM'].includes(t)||(t==='CPVO'&&n>2)||(t==='GM'&&n>10))throw error('Slot de archivo inválido. CPVO admite 1..2 y GM 1..10.');return {type:t,slot:n};}
function validateUploadPolicy(file){const maxMb=25;if(Number(file.size)>maxMb*1024*1024)throw error(`El archivo excede el límite de ${maxMb} MB.`,413,'FILE_TOO_LARGE');}
async function upload(id,input,file,user){if(!file)throw error('Selecciona un archivo.');validateUploadPolicy(file);id=positive(id,'id');await detail(id);const {type,slot}=fileSlot(input.tipo_archivo,input.numero_archivo);const existing=(await repo.files(id)).find(x=>x.tipo_archivo===type&&Number(x.numero_archivo)===slot);const uploaded=await storage.uploadPrivate_gnral({file,empresa:'CORELLIAN',modulo:'logistica-produccion',entidadTipo:'produccion',entidadId:id,subruta:type.toLowerCase(),metadata:{uploaded_by:user.id_SB||user.id,tipo:type,slot}});try{await repo.upsertFile(id,type,slot,uploaded,positive(user.id_SB||user.id,'usuario'));}catch(e){await storage.deleteBlob_gnral(uploaded.storage_blob_name,{containerName:uploaded.storage_container,queueOnFailure:true}).catch(()=>null);throw e;}if(existing&&existing.storage_provider==='AZURE_BLOB'&&existing.storage_blob_name!==uploaded.storage_blob_name)await storage.deleteBlob_gnral(existing.storage_blob_name,{containerName:existing.storage_container,queueOnFailure:true,queueContext:{modulo:'logistica-produccion',entidadTipo:'archivo',entidadId:existing.id_archivo,solicitadoPor:user.id_SB||user.id}}).catch(()=>null);return {ok:true,data:await listFiles(id)};}
async function replaceFile(id,fileId,file,user){id=positive(id,'id');const current=await repo.fileById(id,positive(fileId,'idArchivo'));if(!current||!current.activo)throw error('Archivo no encontrado.',404);return upload(id,{tipo_archivo:current.tipo_archivo,numero_archivo:current.numero_archivo},file,user);}
async function removeFile(id,fileId,user){id=positive(id,'id');fileId=positive(fileId,'idArchivo');const row=await repo.fileById(id,fileId);if(!row||!row.activo)throw error('Archivo no encontrado.',404);if(!(await repo.deactivateFile(id,fileId,positive(user.id_SB||user.id,'usuario'))))throw error('Archivo no encontrado.',404);if(row.storage_provider==='AZURE_BLOB'&&row.storage_blob_name)await storage.deleteBlob_gnral(row.storage_blob_name,{containerName:row.storage_container,queueOnFailure:true,queueContext:{modulo:'logistica-produccion',entidadTipo:'archivo',entidadId:fileId,solicitadoPor:user.id_SB||user.id}}).catch(()=>null);return {ok:true,data:await listFiles(id)};}
async function documents(query,missing=false){const rows=(await repo.list(query)).map(decorate);if(missing)return {ok:true,data:rows.filter(r=>Number(r.archivos_count)===0),regla:'PROVISIONAL_AL_MENOS_UN_ARCHIVO'};const out=[];for(const row of rows)for(const file of await listFiles(row.id_produccion))out.push({...file,id_produccion:row.id_produccion,proyecto:row.proyecto,ppns:row.ppns});return {ok:true,data:out};}
async function pvo(query,missing=false){const rows=(await repo.list(query)).map(decorate);return {ok:true,data:rows.filter(r=>missing?!(r.pvo.cpvo&&r.pvo.pvo_log&&r.pvo.visita):(r.pvo.cpvo&&r.pvo.pvo_log&&r.pvo.visita))};}

module.exports={
  list,detail,projectSummary,options,manualCatalogs,manualProjects,manualAdvisors,manualSupervisors,manualPpns,
  create,update,listFiles,listReadOnlyFiles,upload,replaceFile,removeFile,documents,pvo,decorate,isoWeekAtMexico,fileSlot,
  validateUploadPolicy,normalizeMode,singleSourceDate,buildDateComparison,requiredText
};
