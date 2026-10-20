'use strict';

// BLT NOW | Modo Offline | Nueva implementacion Fase 5.
// Solo textos y movimientos descriptivos. Ningun cambio de estatus, Vo.Bo.,
// asignacion, inventario, cobro ni adjunto puede entrar por este adaptador.
// Idempotencia persistida en usuario_interacciones, con GET_LOCK por clave.
const crypto = require('node:crypto');
const db = require('../../config/db');
const {effectiveScope} = require('./offline-pilot.export');
const {
  buildTicketScopeSql_gnral,buildPortafolioScopeSql_gnral,buildInsFlScopeSql_gnral
} = require('../../services/information-record-scope-gnral.service');
const {hasEffectivePermission} = require('../../services/permissions/effective-permission.service');

const MODULE = 'modo-offline-sync';
const IDEMPOTENCY_ENTITY = 'OFFLINE_ACTION';
const ACTIONS = Object.freeze({
  TICKET_COMMENT: {domain:'UNITED',dataset:'operacion-resumen-dia',kind:'tickets',write:'ticket_comment'},
  TICKET_MOVEMENT: {domain:'UNITED',dataset:'operacion-resumen-dia',kind:'tickets',write:'interaction'},
  EQUIPMENT_MOVEMENT: {domain:'UNITED',dataset:'operacion-resumen-dia',kind:'portafolio',write:'interaction'},
  PROJECT_COMMENT: {domain:'CORELLIAN',dataset:'instalaciones-proyectos',kind:'proyectos',write:'interaction'},
  PROJECT_MOVEMENT: {domain:'CORELLIAN',dataset:'instalaciones-proyectos',kind:'proyectos',write:'interaction'}
});
const TICKET_COMMENT_PERMISSIONS=Object.freeze([
  'OPERACION_RESUMEN_DEL_DIA_TICKET_PERIODO_TICKETS_DEL_PERIODO.ABRIR_DETALLE',
  'OPERACION_RESUMEN_DEL_DIA_TICKET_PERIODO_TICKETS_DEL_PERIODO.VER_TICKET',
  'OPERACION_DASHBOARD_CALL_CENTER_TABLA_TICKETS_TICKETS_DEL_PERIODO.ABRIR_DETALLE',
  'OPERACION_DASHBOARD_CALL_CENTER_TABLA_TICKETS_TICKETS_DEL_PERIODO.VER_TICKET',
  'OPERACION_DASHBOARD_OPERATIVO_KPI_TOTAL_DE_TICKETS.ABRIR_DETALLE',
  'OPERACION_DASHBOARD_OPERATIVO_KPI_PEND_VALIDAR.ABRIR_DETALLE',
  'OPERACION_DASHBOARD_OPERATIVO_KPI_VALIDADOS.ABRIR_DETALLE',
  'OPERACION_EQUIPOS_CRITICOS_EQUIPOS_CRITICOS_EQUIPOS_CRITICOS.VER_TICKETS',
  'OPERACION_EQUIPOS_CRITICOS_PROYECTOS_CRITICOS_PROYECTOS_CRITICOS.VER_TICKETS',
  'PORTAFOLIO_DASHBOARD_PORTAFOLIO_TABLA_PROYECTOS_PORTAFOLIO_TABLA_PORTAFOLIO.VER_TICKETS'
]);
function denied(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e;}
function positive(value,name){const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw denied(400,'OFFLINE_SYNC_INPUT_INVALID',`Identificador invalido: ${name}.`);return n;}
function object(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function validateText(value){
  if(typeof value!=='string')throw denied(400,'OFFLINE_SYNC_TEXT_INVALID','Se requiere texto.');
  const text=value.trim();
  if(!text||text.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
    throw denied(400,'OFFLINE_SYNC_TEXT_INVALID','Texto fuera de formato.');
  return text;
}
function normalizeOperation(body,expectedDomain){
  if(!object(body)||!Object.keys(body).length||Object.keys(body).length>16)
    throw denied(400,'OFFLINE_SYNC_INPUT_INVALID','Operacion offline invalida.');
  const action=String(body.action||'');const config=ACTIONS[action];
  if(!config||config.domain!==expectedDomain||body.domain!==config.domain||body.dataset!==config.dataset||body.kind!==config.kind)
    throw denied(400,'OFFLINE_SYNC_ACTION_NOT_SUPPORTED','Operacion fuera de los adaptadores certificados.');
  const key=String(body.idempotency_key||'').trim();
  if(!/^(?:[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}|outbox-[\da-f]{32})$/i.test(key))
    throw denied(400,'OFFLINE_SYNC_INPUT_INVALID','Falta el identificador seguro de operacion.');
  const signature=String(body.scope_signature||'');
  if(!/^[a-f\d]{64}$/i.test(signature))throw denied(400,'OFFLINE_SYNC_INPUT_INVALID','Firma de alcance invalida.');
  const sourceRun=String(body.source_run_id||'');
  if(!/^[a-zA-Z0-9:_-]{10,240}$/.test(sourceRun))throw denied(400,'OFFLINE_SYNC_INPUT_INVALID','Generacion de copia invalida.');
  const reference=String(body.reference||'').trim();
  if(!reference||reference.length>255)throw denied(400,'OFFLINE_SYNC_INPUT_INVALID','Referencia de registro invalida.');
  const created=String(body.created_at||'');
  if(created.length>40||!Number.isFinite(Date.parse(created)))throw denied(400,'OFFLINE_SYNC_INPUT_INVALID','Fecha local invalida.');
  const text=validateText(body.payload?.text);
  return {
    idempotency_key:key.toLowerCase(),action,config,record_id:positive(body.record_id,'record_id'),
    domain:config.domain,dataset:config.dataset,kind:config.kind,reference,
    scope_signature:signature.toLowerCase(),source_run_id:sourceRun,created_at:created,text,
    actor_user_id:positive(body.actor_user_id,'actor_user_id'),
    effective_user_id:positive(body.effective_user_id,'effective_user_id')
  };
}
function payloadHash(op){
  return crypto.createHash('sha256').update(JSON.stringify({action:op.action,
    actor:op.actor_user_id,effective:op.effective_user_id,domain:op.domain,dataset:op.dataset,
    kind:op.kind,record:op.record_id,reference:op.reference,scope:op.scope_signature,
    source:op.source_run_id,created:op.created_at,text:op.text})).digest('hex');
}
function actorAndEffective(req){
  if(req?.viewerContext?.active===true)throw denied(403,'OFFLINE_SYNC_VIEWER_READ_ONLY','Visor no puede escribir.');
  const actor=req?.user||{},effective=req?.contextUser||req?.user||{};
  return {actor_user_id:positive(actor.id_SB||actor.id,'actor'),
    effective_user_id:positive(effective.id_SB||effective.id,'effective')};
}
function requireScope(req,op){
  const authoritative=effectiveScope({...req,offlineExportDataset:op.dataset});
  if(authoritative.domain!==op.domain||authoritative.scope_signature!==op.scope_signature)
    throw denied(409,'OFFLINE_SYNC_SCOPE_CHANGED','El alcance cambio desde la descarga. Vuelve a respaldar antes de reintentar.');
}
async function requireActionPermission(req,op,conn){
  if(op.action!=='TICKET_COMMENT')return;
  const userId=op.effective_user_id;
  for(const code of TICKET_COMMENT_PERMISSIONS){
    if(await hasEffectivePermission(userId,code,conn))return;
  }
  throw denied(403,'OFFLINE_SYNC_COMMENT_PERMISSION','No tienes permiso de detalle para comentar el ticket.');
}
async function targetRow(req,op,conn){
  let sql,params;
  if(op.kind==='tickets'){
    const scope=buildTicketScopeSql_gnral(req,'t');
    sql=`SELECT t.id, t.ticket, t.proyecto, t.codigo_equipo FROM tickets t
         WHERE t.id = ? AND (${scope.sql}) LIMIT 1 FOR UPDATE`;
    params=[op.record_id,...(scope.params||[])];
  }else if(op.kind==='portafolio'){
    const scope=buildPortafolioScopeSql_gnral(req,'p');
    sql=`SELECT p.id_portafolio, p.numero_equipo FROM portafolio p
         INNER JOIN z_op z ON z.id_zona=p.zona_id AND z.estado=1
         WHERE p.id_portafolio = ? AND (${scope.sql}) LIMIT 1 FOR UPDATE`;
    params=[op.record_id,...(scope.params||[])];
  }else{
    const scope=buildInsFlScopeSql_gnral(req,'f');
    sql=`SELECT f.id_ins_fl, f.id_proyecto FROM ins_fl f
         WHERE f.id_ins_fl = ? AND (${scope.sql}) LIMIT 1 FOR UPDATE`;
    params=[op.record_id,...(scope.params||[])];
  }
  const [rows]=await conn.query(sql,params);
  const row=Array.isArray(rows)?rows[0]:null;
  if(!row)throw denied(409,'OFFLINE_SYNC_RECORD_SCOPE_CHANGED','El registro ya no esta disponible dentro de tu alcance.');
  const reference=op.kind==='tickets'?String(row.ticket||row.id):
    op.kind==='portafolio'?String(row.numero_equipo||row.id_portafolio):String(row.id_proyecto||row.id_ins_fl);
  if(reference!==op.reference)
    throw denied(409,'OFFLINE_SYNC_RECORD_CHANGED','La identidad del registro cambio desde la copia offline.');
  return row;
}
function jsonObject(value){
  if(object(value))return value;
  if(typeof value==='string'){try{const v=JSON.parse(value);return object(v)?v:null;}catch(_error){}}
  return null;
}
function lockKey(id){return 'bltnow:offline:'+crypto.createHash('sha256').update(id).digest('hex').slice(0,40);}
async function notifyTicketComment(req,ticketRow,commentId,op){
  if(!commentId)return {sent:false,reason:'NOT_A_TICKET_COMMENT'};
  try{
    const notifications=require('../../services/notifications/notification-business-emitter.service');
    const ticketService=require('../tickets/tickets-notification-writes.service');
    const zoneId=await ticketService.resolveTicketZoneId_gnral(db,ticketRow);
    if(!zoneId)return {sent:false,reason:'ZONE_AMBIGUOUS'};
    const [users]=await db.query('SELECT id_SB FROM usuarios WHERE estado=1');
    const result=await notifications.emitBusinessEventSafe_gnral({
      codigoEvento:'tickets.comentario.creado',
      destinatarios:users.map(u=>Number(u.id_SB)).filter(n=>Number.isSafeInteger(n)&&n>0),
      actorUserId:op.effective_user_id,zonaOperativaId:zoneId,requireRoleMatrix:true,
      titulo:'Comentario en Ticket',mensaje:`Comentario sincronizado en ticket ${ticketRow.ticket||op.reference}.`,
      icono:'💬',accion:'ABRIR_TICKET',idReferencia:Number(ticketRow.id),
      ruta:`detalle:ticket:${ticketRow.ticket||op.reference}`,
      eventInstanceKey:`ticket-comentario:${ticketRow.id}:${commentId}`,
      contextoSeguimiento:{dominio:'UNITED',tipo:'TICKET',id_ticket:Number(ticketRow.id),
        ticket:ticketRow.ticket||op.reference,zona_id:zoneId,
        identificador_operacion:op.idempotency_key}
    },{label:'offline-ticket-comment'});
    return {sent:result.ok===true,reason:result.reason||null};
  }catch(error){console.warn('[offline-sync] Comentario confirmado, notificacion no emitida:',error.message);
    return {sent:false,reason:'NOTIFICATION_UNAVAILABLE'};}
}
async function syncAction(req,body,injected={}){
  const expected=String(req.offlineSyncDomain||'');
  if(!['UNITED','CORELLIAN'].includes(expected))throw denied(500,'OFFLINE_SYNC_ROUTE_CONFIG','Ruta offline sin dominio.');
  const op=normalizeOperation(body,expected);
  const identity=actorAndEffective(req);
  if(identity.actor_user_id!==op.actor_user_id||identity.effective_user_id!==op.effective_user_id)
    throw denied(403,'OFFLINE_SYNC_IDENTITY_CHANGED','La identidad de la operacion no coincide con la sesion actual.');
  requireScope(req,op);
  const executor=injected.db||db;
  const conn=await executor.getConnection();
  let locked=false,transaction=false,duplicate=false,ack=null,target=null;
  const lock=lockKey(op.idempotency_key);
  try{
    const [locks]=await conn.query('SELECT GET_LOCK(?, 8) AS acquired',[lock]);
    if(Number(locks?.[0]?.acquired)!==1)
      throw denied(409,'OFFLINE_SYNC_BUSY','Otra sincronizacion procesa esta operacion.');
    locked=true;
    await conn.beginTransaction();transaction=true;
    const [before]=await conn.query(
      `SELECT id_interaccion, id_usuario, payload_json, detalle_json FROM usuario_interacciones
       WHERE modulo = ? AND entidad = ? AND id_referencia = ? LIMIT 1 FOR UPDATE`,
      [MODULE,IDEMPOTENCY_ENTITY,op.idempotency_key]);
    if(before?.length){
      const entry=before[0];const detail=jsonObject(entry.detalle_json),payload=jsonObject(entry.payload_json);
      if(Number(entry.id_usuario)!==op.effective_user_id||detail?.digest!==payloadHash(op)||
         Number(detail?.actor_user_id)!==op.actor_user_id)
        throw denied(409,'OFFLINE_SYNC_IDEMPOTENCY_CONFLICT','Esta clave ya se utilizo con otra operacion.');
      ack={idempotency_key:op.idempotency_key,id_interaccion:Number(entry.id_interaccion),
        id_comentario:payload?.comment_id||null,record_id:op.record_id,action:op.action};
      duplicate=true;
    }else{
      await requireActionPermission(req,op,conn);
      target=await targetRow(req,op,conn);
      let commentId=null;
      if(op.config.write==='ticket_comment'){
        const [comment]=await conn.query(
          'INSERT INTO ticket_comentarios (id_ticket,id_usuario,comentario,fecha_creacion,fecha_actualizacion) VALUES (?,?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))',
          [op.record_id,op.effective_user_id,op.text]);
        commentId=positive(comment?.insertId,'comentario insertado');
      }
      const detail={digest:payloadHash(op),actor_user_id:op.actor_user_id,
        effective_user_id:op.effective_user_id,scope_signature:op.scope_signature,
        source_run_id:op.source_run_id,client_created_at:op.created_at,record_id:op.record_id,
        reference:op.reference,text:op.text};
      const payload={offline_operation_id:op.idempotency_key,action:op.action,dataset:op.dataset,
        kind:op.kind,record_id:op.record_id,record_reference:op.reference,
        comment_id:commentId};
      const route=op.kind==='tickets'?`detalle:ticket:${op.reference}`:
        op.kind==='portafolio'?`detalle:equipo:${op.reference}`:'instalaciones-proyectos';
      const [written]=await conn.query(`INSERT INTO usuario_interacciones
        (id_usuario,tipo_interaccion,modulo,entidad,id_referencia,titulo,descripcion,
         empresa_contexto,ruta_destino,payload_json,detalle_json,metodo_http,endpoint,ip_address,user_agent)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
        op.effective_user_id,op.action.includes('COMMENT')?'COMENTAR':'MOVIMIENTO',
        MODULE,IDEMPOTENCY_ENTITY,op.idempotency_key,
        op.action.includes('COMMENT')?'Comentario offline sincronizado':'Movimiento descriptivo offline sincronizado',
        op.text.slice(0,500),op.domain,route,JSON.stringify(payload),JSON.stringify(detail),
        'POST',String(req.originalUrl||'/api/offline/actions/sync').slice(0,500),
        String(req.ip||'').slice(0,45)||null,String(req.headers?.['user-agent']||'').slice(0,500)||null
      ]);
      ack={idempotency_key:op.idempotency_key,id_interaccion:positive(written?.insertId,'interaccion'),
        id_comentario:commentId,record_id:op.record_id,action:op.action};
    }
    await conn.commit();transaction=false;
  }catch(error){
    if(transaction)try{await conn.rollback();}catch(_ignored){}
    throw error;
  }finally{
    try{if(locked)await conn.query('SELECT RELEASE_LOCK(?) AS released',[lock]);}
    finally{conn.release();}
  }
  const notification=(!duplicate&&target&&op.action==='TICKET_COMMENT')
    ?await notifyTicketComment(req,target,ack.id_comentario,op):null;
  return {ok:true,source:'aiven',ack,duplicate,notification};
}
module.exports={ACTIONS,normalizeOperation,payloadHash,lockKey,syncAction};
