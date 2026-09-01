'use strict';

// [Aster | 2026-09-01 | ASTER-MG | FIX REESTRUCTURACION LOGISTICA PRODUCCION V001]

const repo=require('./logistica-produccion.repository');
const storage=require('../../services/storage/azure-storage.service');

const MODES=Object.freeze(['SEMI_AUTOMATICO','MANUAL']);

function error(message,status=400,code='VALIDATION_ERROR'){const e=new Error(message);e.status=status;e.statusCode=status;e.code=code;return e;}
function positive(value,name){const n=Number(value);if(!Number.isInteger(n)||n<1)throw error(`${name} inválido.`);return n;}
function optionalPositive(value,name){if(value===undefined||value===null||value==='')return null;return positive(value,name);}
function hasDate(value){const s=String(value||'').trim();return /^\d{4}-\d{2}-\d{2}/.test(s)&&!Number.isNaN(Date.parse(s.slice(0,10)+'T00:00:00Z'));}
function optionalDate(value,name){if(value===undefined||value===null||value==='')return null;if(!hasDate(value))throw error(`${name} debe ser una fecha válida.`);return String(value).slice(0,10);}
function optionalText(value,name,max){const s=String(value==null?'':value).trim();if(!s)return null;if(s.length>max)throw error(`${name} excede ${max} caracteres.`);return s;}
function normalizeMode(value){const mode=String(value||'SEMI_AUTOMATICO').trim().toUpperCase().replace(/[ -]+/g,'_');if(!MODES.includes(mode))throw error('modo_registro debe ser SEMI_AUTOMATICO o MANUAL.');return mode;}
function validPpns(value){const s=String(value||'').trim().toUpperCase();return Boolean(s&&!['SIN PP NS','SIN PPNS','N/A'].includes(s));}
function isoWeekAtMexico(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).reduce((a,p)=>(a[p.type]=p.value,a),{});
  const d=new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)));const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);
  const year=d.getUTCFullYear();const start=new Date(Date.UTC(year,0,1));return {anio:year,semana:Math.ceil((((d-start)/86400000)+1)/7)};
}
function weekLabel(value){if(!hasDate(value))return null;const d=new Date(String(value).slice(0,10)+'T00:00:00Z');const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);const y=d.getUTCFullYear();const start=new Date(Date.UTC(y,0,1));return {anio:y,semana:Math.ceil((((d-start)/86400000)+1)/7)};}
function split(value){return String(value||'').split(',').map(v=>v.trim()).filter(Boolean);}
function singleSourceDate(value){
  const dates=[...new Set(split(value).map(v=>String(v).slice(0,10)).filter(hasDate))];
  return dates.length===1?dates[0]:null;
}
function pickDate(inputValue,sourceValue,name){
  if(inputValue!==undefined&&inputValue!==null&&inputValue!=='')return optionalDate(inputValue,name);
  return singleSourceDate(sourceValue);
}
function pickText(inputValue,sourceValue,name,max){
  const manual=optionalText(inputValue,name,max);
  return manual!==null?manual:optionalText(sourceValue,name,max);
}

function decorate(row){
  const saleDates=split(row.fechas_venta);
  const ppns=row.ppns||'';
  const indicators=[];
  if(Number(row.cpvo_count)===0)indicators.push({codigo:'FALTA_ARCHIVO_PVO',emoji:'📍',nombre:'Falta Archivo PVO'});
  if(!validPpns(ppns))indicators.push({codigo:'FALTA_PPNS',emoji:'🥨',nombre:'Falta PPNS'});
  if(Number(row.archivos_count)===0)indicators.push({codigo:'FALTAN_DOCS_PROD',emoji:'💾',nombre:'Faltan Docs de Prod',regla:'PROVISIONAL_AL_MENOS_UN_ARCHIVO'});
  return {
    ...row,
    modo_registro:row.modo_registro||'SEMI_AUTOMATICO',
    ppns,
    proyecto:row.proyecto||'',
    indicadores:indicators,
    instalaciones:{
      supervisores:split(row.supervisores),
      asesores:split(row.asesores),
      fechas_pvo_fl:split(row.fechas_pvo_fl),
      fechas_cubos:split(row.fechas_cubos),
      origen:'LOGISTICA_PRODUCCION',
      conflictos:{supervisor:false,asesor:false,pvo_fl:false,cubos:false}
    },
    venta:{
      estado:saleDates.length>1?'AMBIGUO':saleDates.length===1?'UNICA':'SIN_VENTA',
      fechas_candidatas:saleDates,
      semana:saleDates.length===1?weekLabel(saleDates[0]):null
    },
    pvo:{cpvo:Number(row.cpvo_count)>0,pvo_log:hasDate(row.fecha_pvo),pvo_fl:hasDate(row.fecha_pvo_fl)}
  };
}

async function list(query){return {ok:true,data:(await repo.list(query)).map(decorate),reglas:{documentos:'PROVISIONAL_AL_MENOS_UN_ARCHIVO'}};}
async function detail(id){
  const row=await repo.byId(positive(id,'id'));
  if(!row)throw error('Registro de Producción no encontrado.',404);
  const decorated=decorate(row);
  return {ok:true,data:{
    produccion:decorated,
    logistica:{id_log_ops:row.id_log_ops,relacionada:Boolean(row.id_log_ops),modo_registro:decorated.modo_registro,ppns:decorated.ppns,proyecto:decorated.proyecto},
    instalaciones:decorated.instalaciones,
    venta:decorated.venta,
    archivos:await listFiles(id),
    indicadores:decorated.indicadores
  }};
}
async function options(query){const catalogo=repo.statusCatalogDefinition();return {ok:true,data:await repo.ppnsOptions(query.q),catalogo_estatus:await repo.statuses(),catalogo_estatus_produccion:catalogo};}
async function manualCatalogs(){const statuses=await repo.statuses(),catalogo=repo.statusCatalogDefinition();return {ok:true,data:{catalogo_estatus_produccion:catalogo,modos:[{codigo:'SEMI_AUTOMATICO',nombre:'Semi automático'},{codigo:'MANUAL',nombre:'Manual'}],estatus_produccion:statuses,estatus_logistica:statuses.map(x=>({valor:x.articulo,orden:x.orden}))}};}
async function manualProjects(query){return {ok:true,data:await repo.soldProjectOptions(query.q)};}
async function manualAdvisors(query){return {ok:true,data:await repo.manualUserOptions('ASESOR',query.q)};}
async function manualSupervisors(query){return {ok:true,data:await repo.manualUserOptions('SUPERVISOR',query.q)};}
async function manualPpns(query){return {ok:true,data:await repo.ppnsOptions(query.q)};}

async function create(input,user){
  const modo=normalizeMode(input.modo_registro);
  const userId=positive(user.id_SB||user.id,'usuario');
  const period=isoWeekAtMexico();
  const comentario=optionalText(input.comentario,'comentario',5000);
  const idStatus=optionalPositive(input.id_estatus_produccion,'id_estatus_produccion');
  if(!(await repo.validStatus(idStatus)))throw error('El Estatus Producción no pertenece al catálogo activo Logistica / Estatus Produccion.');

  let payload={
    modo_registro:modo,id_log_ops:null,ppns:null,proyecto:null,id_cotizacion_venta:null,id_asesor:null,id_supervisor:null,
    fecha_pvo:null,fecha_pvo_fl:null,fecha_cubos:null,estatus_logistica:null,id_estatus_produccion:idStatus,comentario,
    fecha_envio_docs_fabrica:null,fecha_envio_pago_fabrica:null,semana:period.semana,anio:period.anio
  };

  if(modo==='SEMI_AUTOMATICO'){
    const idLog=positive(input.id_log_ops,'id_log_ops');
    const source=await repo.logSnapshotById(idLog);
    if(!source)throw error('La fila logística seleccionada ya no existe.',404);
    payload={...payload,
      id_log_ops:idLog,
      ppns:optionalText(source.id_ppns,'ppns',50),
      proyecto:optionalText(source.proyecto,'proyecto',255),
      id_asesor:source.id_asesor||null,
      id_supervisor:source.id_supervisor||null,
      fecha_pvo:singleSourceDate(source.pvo),
      fecha_pvo_fl:singleSourceDate(source.fechas_pvo_fl),
      fecha_cubos:singleSourceDate(source.fechas_cubos),
      estatus_logistica:optionalText(source.estatus,'estatus_logistica',100)
    };
  }else{
    const saleId=positive(input.id_cotizacion_venta,'id_cotizacion_venta');
    const sale=await repo.soldProjectById(saleId);
    if(!sale)throw error('El proyecto seleccionado no corresponde a una venta activa con estatus Vendido.');
    const advisor=positive(input.id_asesor,'id_asesor');
    const supervisor=positive(input.id_supervisor,'id_supervisor');
    if(!(await repo.manualUserValid(advisor,'ASESOR')))throw error('El asesor seleccionado no pertenece a los roles autorizados de Ventas.');
    if(!(await repo.manualUserValid(supervisor,'SUPERVISOR')))throw error('El supervisor seleccionado no pertenece a Supervisores/Superintendentes de Instalaciones.');
    const idLog=optionalPositive(input.id_log_ops,'id_log_ops');
    const source=idLog?await repo.logSnapshotById(idLog):null;
    if(idLog&&!source)throw error('La fila logística relacionada ya no existe.',404);
    const logStatus=pickText(input.estatus_logistica,source&&source.estatus,'estatus_logistica',100);
    if(!(await repo.validLogisticsStatus(logStatus)))throw error('El Estatus Logística no pertenece al catálogo activo Logistica / Estatus Produccion.');
    payload={...payload,
      id_log_ops:idLog,
      ppns:source?optionalText(source.id_ppns,'ppns',50):optionalText(input.ppns,'ppns',50),
      proyecto:optionalText(sale.nombre_proyecto,'proyecto',255),
      id_cotizacion_venta:saleId,
      id_asesor:advisor,
      id_supervisor:supervisor,
      fecha_pvo:pickDate(input.fecha_pvo,source&&source.pvo,'fecha_pvo'),
      fecha_pvo_fl:pickDate(input.fecha_pvo_fl,source&&source.fechas_pvo_fl,'fecha_pvo_fl'),
      fecha_cubos:pickDate(input.fecha_cubos,source&&source.fechas_cubos,'fecha_cubos'),
      estatus_logistica:logStatus
    };
  }

  const id=await repo.create(payload,userId);
  return detail(id);
}

async function update(id,input,user){
  id=positive(id,'id');
  const userId=positive(user.id_SB||user.id,'usuario');
  const current=await repo.byId(id);
  if(!current)throw error('Registro de Producción no encontrado.',404);
  const mode=normalizeMode(current.modo_registro||'SEMI_AUTOMATICO');

  const commonAllowed=['id_estatus_produccion','comentario','fecha_envio_docs_fabrica','fecha_envio_pago_fabrica'];
  const manualAllowed=[...commonAllowed,'id_cotizacion_venta','id_log_ops','ppns','id_asesor','id_supervisor','fecha_pvo','fecha_pvo_fl','fecha_cubos','estatus_logistica'];
  const allowed=mode==='MANUAL'?manualAllowed:commonAllowed;
  const unknown=Object.keys(input).filter(k=>!allowed.includes(k));
  if(unknown.length)throw error(`Campos no editables: ${unknown.join(', ')}.`);

  const next={
    id_log_ops:current.id_log_ops,
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
    next.id_estatus_produccion=optionalPositive(input.id_estatus_produccion,'id_estatus_produccion');
    if(!(await repo.validStatus(next.id_estatus_produccion)))throw error('El Estatus Producción no pertenece al catálogo activo Logistica / Estatus Produccion.');
  }
  if(Object.hasOwn(input,'comentario'))next.comentario=optionalText(input.comentario,'comentario',5000);
  if(Object.hasOwn(input,'fecha_envio_docs_fabrica'))next.fecha_envio_docs_fabrica=optionalDate(input.fecha_envio_docs_fabrica,'fecha_envio_docs_fabrica');
  if(Object.hasOwn(input,'fecha_envio_pago_fabrica'))next.fecha_envio_pago_fabrica=optionalDate(input.fecha_envio_pago_fabrica,'fecha_envio_pago_fabrica');

  if(mode==='MANUAL'){
    if(Object.hasOwn(input,'id_cotizacion_venta')){
      const saleId=positive(input.id_cotizacion_venta,'id_cotizacion_venta');
      const sale=await repo.soldProjectById(saleId);
      if(!sale)throw error('El proyecto seleccionado no corresponde a una venta activa con estatus Vendido.');
      next.id_cotizacion_venta=saleId;
      next.proyecto=optionalText(sale.nombre_proyecto,'proyecto',255);
    }
    if(Object.hasOwn(input,'id_asesor')){
      const advisor=positive(input.id_asesor,'id_asesor');
      if(!(await repo.manualUserValid(advisor,'ASESOR')))throw error('El asesor seleccionado no pertenece a los roles autorizados de Ventas.');
      next.id_asesor=advisor;
    }
    if(Object.hasOwn(input,'id_supervisor')){
      const supervisor=positive(input.id_supervisor,'id_supervisor');
      if(!(await repo.manualUserValid(supervisor,'SUPERVISOR')))throw error('El supervisor seleccionado no pertenece a Supervisores/Superintendentes de Instalaciones.');
      next.id_supervisor=supervisor;
    }
    if(Object.hasOwn(input,'id_log_ops')){
      const idLog=optionalPositive(input.id_log_ops,'id_log_ops');
      const source=idLog?await repo.logSnapshotById(idLog):null;
      if(idLog&&!source)throw error('La fila logística relacionada ya no existe.',404);
      next.id_log_ops=idLog;
      if(source){
        next.ppns=optionalText(source.id_ppns,'ppns',50);
        if(!Object.hasOwn(input,'fecha_pvo'))next.fecha_pvo=singleSourceDate(source.pvo);
        if(!Object.hasOwn(input,'fecha_pvo_fl'))next.fecha_pvo_fl=singleSourceDate(source.fechas_pvo_fl);
        if(!Object.hasOwn(input,'fecha_cubos'))next.fecha_cubos=singleSourceDate(source.fechas_cubos);
        if(!Object.hasOwn(input,'estatus_logistica'))next.estatus_logistica=optionalText(source.estatus,'estatus_logistica',100);
      }
    }
    if(Object.hasOwn(input,'ppns')&&!next.id_log_ops)next.ppns=optionalText(input.ppns,'ppns',50);
    if(Object.hasOwn(input,'fecha_pvo'))next.fecha_pvo=optionalDate(input.fecha_pvo,'fecha_pvo');
    if(Object.hasOwn(input,'fecha_pvo_fl'))next.fecha_pvo_fl=optionalDate(input.fecha_pvo_fl,'fecha_pvo_fl');
    if(Object.hasOwn(input,'fecha_cubos'))next.fecha_cubos=optionalDate(input.fecha_cubos,'fecha_cubos');
    if(Object.hasOwn(input,'estatus_logistica'))next.estatus_logistica=optionalText(input.estatus_logistica,'estatus_logistica',100);
    if(!(await repo.validLogisticsStatus(next.estatus_logistica)))throw error('El Estatus Logística no pertenece al catálogo activo Logistica / Estatus Produccion.');
  }

  if(!(await repo.update(id,next,userId)))throw error('Registro de Producción no encontrado.',404);
  return detail(id);
}

async function listFiles(id){
  const rows=await repo.files(positive(id,'id'));
  return Promise.all(rows.map(async row=>{
    if(row.storage_provider==='LEGACY_URL'||row.storage_provider==='LEGACY_REF')return {...row,url_acceso:row.storage_url||null};
    if(!row.storage_blob_name)return {...row,url_acceso:null};
    try{
      const sas=await storage.createReadSas_gnral(row.storage_blob_name,{containerName:row.storage_container,fileName:row.nombre_original});
      return {...row,url_acceso:sas.url,url_expira:sas.expires_at};
    }catch(_e){return {...row,url_acceso:null,storage_no_disponible:true};}
  }));
}
function fileSlot(type,slot){const t=String(type||'').trim().toUpperCase();const n=positive(slot,'numero_archivo');if(!['CPVO','GM'].includes(t)||(t==='CPVO'&&n>2)||(t==='GM'&&n>10))throw error('Slot de archivo inválido. CPVO admite 1..2 y GM 1..10.');return {type:t,slot:n};}
function validateUploadPolicy(file){const maxMb=25;if(Number(file.size)>maxMb*1024*1024)throw error(`El archivo excede el límite de ${maxMb} MB.`,413,'FILE_TOO_LARGE');}
async function upload(id,input,file,user){if(!file)throw error('Selecciona un archivo.');validateUploadPolicy(file);id=positive(id,'id');await detail(id);const {type,slot}=fileSlot(input.tipo_archivo,input.numero_archivo);const existing=(await repo.files(id)).find(x=>x.tipo_archivo===type&&Number(x.numero_archivo)===slot);const uploaded=await storage.uploadPrivate_gnral({file,empresa:'CORELLIAN',modulo:'logistica-produccion',entidadTipo:'produccion',entidadId:id,subruta:type.toLowerCase(),metadata:{uploaded_by:user.id_SB||user.id,tipo:type,slot}});try{await repo.upsertFile(id,type,slot,uploaded,positive(user.id_SB||user.id,'usuario'));}catch(e){await storage.deleteBlob_gnral(uploaded.storage_blob_name,{containerName:uploaded.storage_container,queueOnFailure:true}).catch(()=>null);throw e;}if(existing&&existing.storage_provider==='AZURE_BLOB'&&existing.storage_blob_name!==uploaded.storage_blob_name)await storage.deleteBlob_gnral(existing.storage_blob_name,{containerName:existing.storage_container,queueOnFailure:true,queueContext:{modulo:'logistica-produccion',entidadTipo:'archivo',entidadId:existing.id_archivo,solicitadoPor:user.id_SB||user.id}}).catch(()=>null);return {ok:true,data:await listFiles(id)};}
async function replaceFile(id,fileId,file,user){id=positive(id,'id');const current=await repo.fileById(id,positive(fileId,'idArchivo'));if(!current||!current.activo)throw error('Archivo no encontrado.',404);return upload(id,{tipo_archivo:current.tipo_archivo,numero_archivo:current.numero_archivo},file,user);}
async function removeFile(id,fileId,user){id=positive(id,'id');fileId=positive(fileId,'idArchivo');const row=await repo.fileById(id,fileId);if(!row||!row.activo)throw error('Archivo no encontrado.',404);if(!(await repo.deactivateFile(id,fileId,positive(user.id_SB||user.id,'usuario'))))throw error('Archivo no encontrado.',404);if(row.storage_provider==='AZURE_BLOB'&&row.storage_blob_name)await storage.deleteBlob_gnral(row.storage_blob_name,{containerName:row.storage_container,queueOnFailure:true,queueContext:{modulo:'logistica-produccion',entidadTipo:'archivo',entidadId:fileId,solicitadoPor:user.id_SB||user.id}}).catch(()=>null);return {ok:true,data:await listFiles(id)};}
async function documents(query,missing=false){const rows=(await repo.list(query)).map(decorate);if(missing)return {ok:true,data:rows.filter(r=>Number(r.archivos_count)===0),regla:'PROVISIONAL_AL_MENOS_UN_ARCHIVO'};const out=[];for(const row of rows)for(const file of await listFiles(row.id_produccion))out.push({...file,id_produccion:row.id_produccion,proyecto:row.proyecto,ppns:row.ppns});return {ok:true,data:out};}
async function pvo(query,missing=false){const rows=(await repo.list(query)).map(decorate);return {ok:true,data:rows.filter(r=>missing?!(r.pvo.cpvo&&r.pvo.pvo_log&&r.pvo.pvo_fl):(r.pvo.cpvo&&r.pvo.pvo_log&&r.pvo.pvo_fl))};}

module.exports={
  list,detail,options,manualCatalogs,manualProjects,manualAdvisors,manualSupervisors,manualPpns,
  create,update,listFiles,upload,replaceFile,removeFile,documents,pvo,decorate,isoWeekAtMexico,fileSlot,
  validateUploadPolicy,normalizeMode,singleSourceDate
};
