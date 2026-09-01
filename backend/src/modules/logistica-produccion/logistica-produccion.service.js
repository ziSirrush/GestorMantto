'use strict';

const repo = require('./logistica-produccion.repository');
const storage = require('../../services/storage/azure-storage.service');

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
function decorate(row){
  const ppns=row.id_ppns||row.ppns_referencia||'';const saleDates=split(row.fechas_venta);
  const indicators=[];if(Number(row.cpvo_count)===0)indicators.push({codigo:'FALTA_ARCHIVO_PVO',emoji:'📍',nombre:'Falta Archivo PVO'});
  if(!validPpns(ppns))indicators.push({codigo:'FALTA_PPNS',emoji:'🥨',nombre:'Falta PPNS'});
  if(Number(row.archivos_count)===0)indicators.push({codigo:'FALTAN_DOCS_PROD',emoji:'💾',nombre:'Faltan Docs de Prod',regla:'PROVISIONAL_AL_MENOS_UN_ARCHIVO'});
  return {...row,modo_registro:row.modo_registro||'SEMI_AUTOMATICO',ppns,proyecto:row.proyecto||row.proyecto_referencia||'',indicadores:indicators,
    instalaciones:{supervisores:split(row.supervisores),asesores:split(row.asesores),fechas_pvo_fl:split(row.fechas_pvo_fl),fechas_cubos:split(row.fechas_cubos),
      conflictos:{supervisor:Number(row.supervisores_count)>1,asesor:Number(row.asesores_count)>1,pvo_fl:Number(row.pvo_fl_count)>1,cubos:Number(row.cubos_count)>1}},
    venta:{estado:saleDates.length>1?'AMBIGUO':saleDates.length===1?'UNICA':'SIN_VENTA',fechas_candidatas:saleDates,semana:saleDates.length===1?weekLabel(saleDates[0]):null},
    pvo:{cpvo:Number(row.cpvo_count)>0,pvo_log:hasDate(row.fecha_pvo),pvo_fl:split(row.fechas_pvo_fl).some(hasDate)}};
}
async function list(query){return {ok:true,data:(await repo.list(query)).map(decorate),reglas:{documentos:'PROVISIONAL_AL_MENOS_UN_ARCHIVO'}};}
async function detail(id){const row=await repo.byId(positive(id,'id'));if(!row)throw error('Registro de Producción no encontrado.',404);const decorated=decorate(row);return {ok:true,data:{produccion:decorated,logistica:{id_log_ops:row.id_log_ops,relacionada:Boolean(row.id_log_ops),modo_registro:decorated.modo_registro,ppns:decorated.ppns,proyecto:decorated.proyecto,fecha_pvo:row.fecha_pvo,estatus:row.estatus_logistica},instalaciones:decorated.instalaciones,venta:decorated.venta,archivos:await listFiles(id),comentarios:await repo.comments(id),indicadores:decorated.indicadores}};}
async function options(query){const catalogo=repo.statusCatalogDefinition();return {ok:true,data:await repo.ppnsOptions(query.q),catalogo_estatus:await repo.statuses(),catalogo_estatus_produccion:catalogo};}
async function manualCatalogs(){const statuses=await repo.statuses(),catalogo=repo.statusCatalogDefinition();return {ok:true,data:{catalogo_estatus_produccion:catalogo,modos:[{codigo:'SEMI_AUTOMATICO',nombre:'Semi automático'},{codigo:'MANUAL',nombre:'Manual'}],estatus_produccion:statuses,estatus_logistica:statuses.map(x=>({valor:x.articulo,orden:x.orden}))}};}
async function manualProjects(query){return {ok:true,data:await repo.soldProjectOptions(query.q)};}
async function manualAdvisors(query){return {ok:true,data:await repo.manualUserOptions('ASESOR',query.q)};}
async function manualSupervisors(query){return {ok:true,data:await repo.manualUserOptions('SUPERVISOR',query.q)};}
async function manualPpns(query){return {ok:true,data:await repo.ppnsOptions(query.q)};}
async function create(input,user){
  const modo=normalizeMode(input.modo_registro);
  const comentario=String(input.comentario||'').trim();if(comentario.length>5000)throw error('El comentario excede 5000 caracteres.');
  const period=isoWeekAtMexico();const userId=positive(user.id_SB||user.id,'usuario');
  let payload={modo_registro:modo,id_estatus_produccion:input.id_estatus_produccion,comentario,semana:period.semana,anio:period.anio};
  if(modo==='SEMI_AUTOMATICO'){
    payload.id_log_ops=positive(input.id_log_ops,'id_log_ops');
  }else{
    payload={...payload,
      id_log_ops:optionalPositive(input.id_log_ops,'id_log_ops'),
      id_cotizacion_venta:positive(input.id_cotizacion_venta,'id_cotizacion_venta'),
      ppns_referencia:optionalText(input.ppns_referencia,'ppns_referencia',50),
      id_asesor_manual:positive(input.id_asesor_manual,'id_asesor_manual'),
      id_supervisor_manual:positive(input.id_supervisor_manual,'id_supervisor_manual'),
      fecha_pvo_manual:optionalDate(input.fecha_pvo_manual,'fecha_pvo_manual'),
      pvo_fl_manual:optionalDate(input.pvo_fl_manual,'pvo_fl_manual'),
      fecha_cubos_manual:optionalDate(input.fecha_cubos_manual,'fecha_cubos_manual'),
      estatus_logistica_manual:optionalText(input.estatus_logistica_manual,'estatus_logistica_manual',100)
    };
  }
  const id=await repo.create(payload,userId);return detail(id);
}
async function update(id,input,user){
  id=positive(id,'id');
  const userId=positive(user.id_SB||user.id,'usuario');
  const current=await repo.byId(id);
  if(!current)throw error('Registro de Producción no encontrado.',404);
  const mode=normalizeMode(current.modo_registro||'SEMI_AUTOMATICO');
  const commonAllowed=['id_estatus_produccion','fecha_envio_docs_fabrica','fecha_envio_pago_fabrica'];
  const manualAllowed=[...commonAllowed,'id_cotizacion_venta','id_log_ops','ppns_referencia','id_asesor_manual','id_supervisor_manual','fecha_pvo_manual','pvo_fl_manual','fecha_cubos_manual','estatus_logistica_manual'];
  const allowed=mode==='MANUAL'?manualAllowed:commonAllowed;
  const unknown=Object.keys(input).filter(k=>!allowed.includes(k));
  if(unknown.length)throw error(`Campos no editables: ${unknown.join(', ')}.`);

  if(Object.hasOwn(input,'id_estatus_produccion')&&!(await repo.validStatus(input.id_estatus_produccion)))throw error('El Estatus Producción no pertenece al catálogo activo Logistica / Estatus Produccion.');
  const common={
    id_estatus_produccion:Object.hasOwn(input,'id_estatus_produccion')?input.id_estatus_produccion:current.id_estatus_produccion,
    fecha_envio_docs_fabrica:Object.hasOwn(input,'fecha_envio_docs_fabrica')?optionalDate(input.fecha_envio_docs_fabrica,'fecha_envio_docs_fabrica'):current.fecha_envio_docs_fabrica,
    fecha_envio_pago_fabrica:Object.hasOwn(input,'fecha_envio_pago_fabrica')?optionalDate(input.fecha_envio_pago_fabrica,'fecha_envio_pago_fabrica'):current.fecha_envio_pago_fabrica
  };

  if(mode!=='MANUAL'){
    if(!(await repo.update(id,common,userId)))throw error('Registro de Producción no encontrado.',404);
    return detail(id);
  }

  const manual={
    id_cotizacion_venta:current.id_cotizacion_venta,
    id_log_ops:current.id_log_ops,
    ppns_referencia:current.ppns_referencia,
    proyecto_referencia:current.proyecto_referencia,
    id_asesor_manual:current.id_asesor_manual,
    id_supervisor_manual:current.id_supervisor_manual,
    fecha_pvo_manual:current.fecha_pvo_manual,
    pvo_fl_manual:current.pvo_fl_manual,
    fecha_cubos_manual:current.fecha_cubos_manual,
    estatus_logistica_manual:current.estatus_logistica_manual
  };

  if(Object.hasOwn(input,'id_cotizacion_venta')){
    const next=positive(input.id_cotizacion_venta,'id_cotizacion_venta');
    if(String(next)!==String(current.id_cotizacion_venta||'')){
      const sale=await repo.soldProjectById(next);
      if(!sale)throw error('El proyecto seleccionado no corresponde a una venta activa con estatus Vendido.');
      manual.id_cotizacion_venta=next;
      manual.proyecto_referencia=sale.nombre_proyecto;
    }
  }
  if(Object.hasOwn(input,'id_asesor_manual')){
    const next=positive(input.id_asesor_manual,'id_asesor_manual');
    if(String(next)!==String(current.id_asesor_manual||'')){
      if(!(await repo.manualUserValid(next,'ASESOR')))throw error('El asesor seleccionado no pertenece a los roles autorizados de Ventas.');
      manual.id_asesor_manual=next;
    }
  }
  if(Object.hasOwn(input,'id_supervisor_manual')){
    const next=positive(input.id_supervisor_manual,'id_supervisor_manual');
    if(String(next)!==String(current.id_supervisor_manual||'')){
      if(!(await repo.manualUserValid(next,'SUPERVISOR')))throw error('El supervisor seleccionado no pertenece a Supervisores/Superintendentes de Instalaciones.');
      manual.id_supervisor_manual=next;
    }
  }
  if(Object.hasOwn(input,'id_log_ops')){
    const next=optionalPositive(input.id_log_ops,'id_log_ops');
    if(String(next||'')!==String(current.id_log_ops||'')){
      if(next){
        const log=await repo.logRowById(next);
        if(!log)throw error('La fila logística relacionada ya no existe.',404);
        manual.ppns_referencia=String(log.id_ppns||'').trim()||manual.ppns_referencia;
      }
      manual.id_log_ops=next;
    }
  }
  if(Object.hasOwn(input,'ppns_referencia'))manual.ppns_referencia=optionalText(input.ppns_referencia,'ppns_referencia',50);
  if(Object.hasOwn(input,'fecha_pvo_manual'))manual.fecha_pvo_manual=optionalDate(input.fecha_pvo_manual,'fecha_pvo_manual');
  if(Object.hasOwn(input,'pvo_fl_manual'))manual.pvo_fl_manual=optionalDate(input.pvo_fl_manual,'pvo_fl_manual');
  if(Object.hasOwn(input,'fecha_cubos_manual'))manual.fecha_cubos_manual=optionalDate(input.fecha_cubos_manual,'fecha_cubos_manual');
  if(Object.hasOwn(input,'estatus_logistica_manual')){
    const next=optionalText(input.estatus_logistica_manual,'estatus_logistica_manual',100);
    if(String(next||'')!==String(current.estatus_logistica_manual||'')&&!(await repo.validManualLogStatus(next)))throw error('El Estatus Logística manual no pertenece al pipeline autorizado.');
    manual.estatus_logistica_manual=next;
  }

  if(!(await repo.updateManual(id,{...manual,...common},userId)))throw error('Registro de Producción no encontrado.',404);
  return detail(id);
}
async function listFiles(id){const rows=await repo.files(positive(id,'id'));return Promise.all(rows.map(async row=>{if(row.storage_provider==='LEGACY_URL')return {...row,url_acceso:row.storage_url};if(!row.storage_blob_name)return {...row,url_acceso:null};try{const sas=await storage.createReadSas_gnral(row.storage_blob_name,{containerName:row.storage_container,fileName:row.nombre_original});return {...row,url_acceso:sas.url,url_expira:sas.expires_at};}catch(_e){return {...row,url_acceso:null,storage_no_disponible:true};}}));}
function fileSlot(type,slot){const t=String(type||'').trim().toUpperCase();const n=positive(slot,'numero_archivo');if(!['CPVO','GM'].includes(t)||(t==='CPVO'&&n>2)||(t==='GM'&&n>10))throw error('Slot de archivo inválido. CPVO admite 1..2 y GM 1..10.');return {type:t,slot:n};}
function validateUploadPolicy(file){const maxMb=25;if(Number(file.size)>maxMb*1024*1024)throw error(`El archivo excede el límite de ${maxMb} MB.`,413,'FILE_TOO_LARGE');}
async function upload(id,input,file,user){if(!file)throw error('Selecciona un archivo.');validateUploadPolicy(file);id=positive(id,'id');await detail(id);const {type,slot}=fileSlot(input.tipo_archivo,input.numero_archivo);const existing=(await repo.files(id)).find(x=>x.tipo_archivo===type&&Number(x.numero_archivo)===slot);const uploaded=await storage.uploadPrivate_gnral({file,empresa:'CORELLIAN',modulo:'logistica-produccion',entidadTipo:'produccion',entidadId:id,subruta:type.toLowerCase(),metadata:{uploaded_by:user.id_SB||user.id,tipo:type,slot}});try{await repo.upsertFile(id,type,slot,uploaded,positive(user.id_SB||user.id,'usuario'));}catch(e){await storage.deleteBlob_gnral(uploaded.storage_blob_name,{containerName:uploaded.storage_container,queueOnFailure:true}).catch(()=>null);throw e;}if(existing&&existing.storage_provider==='AZURE_BLOB'&&existing.storage_blob_name!==uploaded.storage_blob_name)await storage.deleteBlob_gnral(existing.storage_blob_name,{containerName:existing.storage_container,queueOnFailure:true,queueContext:{modulo:'logistica-produccion',entidadTipo:'archivo',entidadId:existing.id_archivo,solicitadoPor:user.id_SB||user.id}}).catch(()=>null);return {ok:true,data:await listFiles(id)};}
async function replaceFile(id,fileId,file,user){id=positive(id,'id');const current=await repo.fileById(id,positive(fileId,'idArchivo'));if(!current||!current.activo)throw error('Archivo no encontrado.',404);return upload(id,{tipo_archivo:current.tipo_archivo,numero_archivo:current.numero_archivo},file,user);}
async function removeFile(id,fileId,user){id=positive(id,'id');fileId=positive(fileId,'idArchivo');const row=await repo.fileById(id,fileId);if(!row||!row.activo)throw error('Archivo no encontrado.',404);if(!(await repo.deactivateFile(id,fileId,positive(user.id_SB||user.id,'usuario'))))throw error('Archivo no encontrado.',404);if(row.storage_provider==='AZURE_BLOB'&&row.storage_blob_name)await storage.deleteBlob_gnral(row.storage_blob_name,{containerName:row.storage_container,queueOnFailure:true,queueContext:{modulo:'logistica-produccion',entidadTipo:'archivo',entidadId:fileId,solicitadoPor:user.id_SB||user.id}}).catch(()=>null);return {ok:true,data:await listFiles(id)};}
async function addComment(id,input,user){id=positive(id,'id');await detail(id);const text=String(input.comentario||'').trim();if(!text||text.length>5000)throw error('El comentario debe contener entre 1 y 5000 caracteres.');await repo.addComment(id,text,input.id_comentario_padre?positive(input.id_comentario_padre,'id_comentario_padre'):null,positive(user.id_SB||user.id,'usuario'));return {ok:true,data:await repo.comments(id)};}
async function editComment(id,cid,input,user){const text=String(input.comentario||'').trim();if(!text||text.length>5000)throw error('El comentario debe contener entre 1 y 5000 caracteres.');if(!(await repo.updateComment(positive(id,'id'),positive(cid,'idComentario'),text,positive(user.id_SB||user.id,'usuario'))))throw error('Comentario no encontrado o no pertenece al usuario.',404);return {ok:true,data:await repo.comments(id)};}
async function removeComment(id,cid,user){if(!(await repo.deleteComment(positive(id,'id'),positive(cid,'idComentario'),positive(user.id_SB||user.id,'usuario'))))throw error('Comentario no encontrado o no pertenece al usuario.',404);return {ok:true,data:await repo.comments(id)};}
async function documents(query,missing=false){const rows=(await repo.list(query)).map(decorate);if(missing)return {ok:true,data:rows.filter(r=>Number(r.archivos_count)===0),regla:'PROVISIONAL_AL_MENOS_UN_ARCHIVO'};const out=[];for(const row of rows)for(const file of await listFiles(row.id_produccion))out.push({...file,id_produccion:row.id_produccion,proyecto:row.proyecto,ppns:row.ppns});return {ok:true,data:out};}
async function pvo(query,missing=false){const rows=(await repo.list(query)).map(decorate);return {ok:true,data:rows.filter(r=>missing?!(r.pvo.cpvo&&r.pvo.pvo_log&&r.pvo.pvo_fl):(r.pvo.cpvo&&r.pvo.pvo_log&&r.pvo.pvo_fl))};}
module.exports={list,detail,options,manualCatalogs,manualProjects,manualAdvisors,manualSupervisors,manualPpns,create,update,listFiles,upload,replaceFile,removeFile,addComment,editComment,removeComment,documents,pvo,decorate,isoWeekAtMexico,fileSlot,validateUploadPolicy,normalizeMode};
