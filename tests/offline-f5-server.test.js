'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../backend/src/modules/offline-pilot/offline-pilot.sync.js'),'utf8');
const signature='a'.repeat(64);
const operationId='79b533fc-5c32-4ad4-93db-cc291c6d3d77';
function makeOp(action='TICKET_COMMENT'){
  const core=action.startsWith('PROJECT');
  const equipment=action==='EQUIPMENT_MOVEMENT';
  return {action,actor_user_id:11,effective_user_id:11,
    domain:core?'CORELLIAN':'UNITED',dataset:core?'instalaciones-proyectos':'operacion-resumen-dia',
    kind:core?'proyectos':equipment?'portafolio':'tickets',
    idempotency_key:operationId,record_id:core?32:equipment?44:19,
    reference:core?'P-32':equipment?'EQ-44':'TK-19',scope_signature:signature,
    source_run_id:'download-run-safe-11',created_at:'2026-10-20T18:00:00.000Z',
    payload:{text:'Texto operativo capturado sin conexión.'}};
}
function environment({canComment=true,record=true,writeFails=false,signatureCurrent=signature}={}){
  const state={audit:[],comments:[],rollbacks:0,commits:0,locks:0,releases:0,notifications:0,queries:[]};
  const db={
    async query(sql){if(sql.includes('FROM usuarios WHERE'))return [[{id_SB:11},{id_SB:12}]];throw Error('DB outside connection '+sql);},
    async getConnection(){
      let txAudit=[],txComments=[];
      return {async beginTransaction(){},
        async commit(){state.audit.push(...txAudit);state.comments.push(...txComments);state.commits++;txAudit=[];txComments=[];},
        async rollback(){state.rollbacks++;txAudit=[];txComments=[];},
        release(){},
        async query(sql,params){
          state.queries.push({sql,params});
          if(sql.startsWith('SELECT GET_LOCK')){state.locks++;return [[{acquired:1}]];}
          if(sql.startsWith('SELECT RELEASE_LOCK')){state.releases++;return [[{released:1}]];}
          if(sql.includes('FROM usuario_interacciones')){
            const entry=state.audit.find(x=>x.entidad===params[1]&&x.id_referencia===params[2]);
            return [[...(entry?[entry]:[])]];
          }
          if(sql.includes('FROM tickets t'))return [[...(record?[{id:19,ticket:'TK-19',proyecto:'SITIO'}]:[])]];
          if(sql.includes('FROM portafolio p'))return [[...(record?[{id_portafolio:44,numero_equipo:'EQ-44'}]:[])]];
          if(sql.includes('FROM ins_fl f'))return [[...(record?[{id_ins_fl:32,id_proyecto:'P-32'}]:[])]];
          if(sql.includes('INSERT INTO ticket_comentarios')){
            if(writeFails)throw new Error('write failure');
            txComments.push({id_comentario:300+state.comments.length,id_ticket:params[0],text:params[2]});
            return [{insertId:300+state.comments.length}];
          }
          if(sql.includes('INSERT INTO usuario_interacciones')){
            if(writeFails)throw new Error('write failure');
            const entity={id_interaccion:700+state.audit.length,id_usuario:params[0],
              entidad:params[3],id_referencia:params[4],payload_json:params[9],detalle_json:params[10]};
            txAudit.push(entity);return [{insertId:entity.id_interaccion}];
          }
          throw Error('Unhandled query '+sql);
        }
      };
    }
  };
  const module={exports:{}};
  const requireStub=id=>{
    if(id==='node:crypto')return crypto;
    if(id==='../../config/db')return db;
    if(id==='./offline-pilot.export')return {effectiveScope:req=>({domain:req.offlineExportDataset==='instalaciones-proyectos'?'CORELLIAN':'UNITED',scope_signature:signatureCurrent})};
    if(id==='../../services/information-record-scope-gnral.service')return {
      buildTicketScopeSql_gnral:()=>({sql:'t.id>0',params:[]}),
      buildPortafolioScopeSql_gnral:()=>({sql:'p.id_portafolio>0',params:[]}),
      buildInsFlScopeSql_gnral:()=>({sql:'f.id_ins_fl>0',params:[]})};
    if(id==='../../services/permissions/effective-permission.service')return {hasEffectivePermission:async()=>canComment};
    if(id==='../../services/notifications/notification-business-emitter.service')return {emitBusinessEventSafe_gnral:async()=>{state.notifications++;return {ok:true};}};
    if(id==='../tickets/tickets-notification-writes.service')return {resolveTicketZoneId_gnral:async()=>2};
    throw Error('unexpected dependency '+id);
  };
  vm.runInNewContext(source,{module,require:requireStub,console},{filename:'offline-pilot.sync.js'});
  const service=module.exports;
  const req=(domain='UNITED')=>({offlineSyncDomain:domain,user:{id_SB:11},contextUser:{id_SB:11},
    viewerContext:{active:false},informationAccess:{},headers:{},originalUrl:'/api/offline/actions/sync',ip:'127.0.0.1'});
  return {service,req,state,db};
}
test('F5 backend: confirma comentario de ticket y auditoría en una transacción',async()=>{
  const {service,req,state,db}=environment();
  const ack=await service.syncAction(req(),makeOp(),{db});
  assert.equal(ack.ok,true);assert.equal(ack.duplicate,false);
  assert.equal(ack.ack.id_comentario,300);
  assert.equal(state.comments.length,1);assert.equal(state.audit.length,1);
  assert.equal(state.notifications,1);
  assert.equal(state.locks,1);assert.equal(state.releases,1);
  assert.equal(state.commits,1);
});
test('F5 backend: reenvío idempotente nunca duplica comentario ni movimiento',async()=>{
  const {service,req,state,db}=environment();
  await service.syncAction(req(),makeOp(),{db});
  const again=await service.syncAction(req(),makeOp(),{db});
  assert.equal(again.duplicate,true);assert.equal(again.ack.id_comentario,300);
  assert.equal(state.comments.length,1);assert.equal(state.audit.length,1);
  assert.equal(state.notifications,1);
});
test('F5 backend: misma clave con otro texto causa conflicto, no duplicación',async()=>{
  const {service,req,state,db}=environment();
  await service.syncAction(req(),makeOp(),{db});
  const other={...makeOp(),payload:{text:'Texto distinto'}};
  await assert.rejects(service.syncAction(req(),other,{db}),error=>error.code==='OFFLINE_SYNC_IDEMPOTENCY_CONFLICT');
  assert.equal(state.comments.length,1);
});
test('F5 backend: fallo de escritura revierte tanto comentario como auditoría',async()=>{
  const {service,req,state,db}=environment({writeFails:true});
  await assert.rejects(service.syncAction(req(),makeOp(),{db}),/write failure/);
  assert.equal(state.comments.length,0);assert.equal(state.audit.length,0);
  assert.equal(state.rollbacks,1);assert.equal(state.releases,1);
});
test('F5 backend: permisos de detalle negados impiden comentario',async()=>{
  const {service,req,state,db}=environment({canComment:false});
  await assert.rejects(service.syncAction(req(),makeOp(),{db}),error=>error.code==='OFFLINE_SYNC_COMMENT_PERMISSION');
  assert.equal(state.comments.length,0);assert.equal(state.audit.length,0);
});
test('F5 backend: cambio de zona/alcance rechaza operación antes de transacción',async()=>{
  const {service,req,state,db}=environment({signatureCurrent:'b'.repeat(64)});
  await assert.rejects(service.syncAction(req(),makeOp(),{db}),error=>error.code==='OFFLINE_SYNC_SCOPE_CHANGED');
  assert.equal(state.locks,0);
});
test('F5 backend: fila eliminada o fuera de alcance rechaza con rollback',async()=>{
  const {service,req,state,db}=environment({record:false});
  await assert.rejects(service.syncAction(req(),makeOp(),{db}),error=>error.code==='OFFLINE_SYNC_RECORD_SCOPE_CHANGED');
  assert.equal(state.rollbacks,1);assert.equal(state.comments.length,0);
});
test('F5 backend: Corellian no escribe tickets, solo interacción de proyecto',async()=>{
  const {service,req,state,db}=environment();
  const ack=await service.syncAction(req('CORELLIAN'),makeOp('PROJECT_COMMENT'),{db});
  assert.equal(ack.ok,true);assert.equal(state.comments.length,0);
  assert.equal(state.audit.length,1);assert.equal(state.notifications,0);
});
test('F5 backend: identidad ajena, visor, action no autorizado y dominio cruzado se rechazan',async()=>{
  const {service,req,state,db}=environment();
  await assert.rejects(service.syncAction(req(),{...makeOp(),actor_user_id:23},{db}),error=>error.code==='OFFLINE_SYNC_IDENTITY_CHANGED');
  await assert.rejects(service.syncAction({...req(),viewerContext:{active:true}},makeOp(),{db}),error=>error.code==='OFFLINE_SYNC_VIEWER_READ_ONLY');
  await assert.rejects(service.syncAction(req(),{...makeOp(),action:'UPDATE_VOBO'},{db}),error=>error.code==='OFFLINE_SYNC_ACTION_NOT_SUPPORTED');
  await assert.rejects(service.syncAction(req('CORELLIAN'),makeOp(),{db}),error=>error.code==='OFFLINE_SYNC_ACTION_NOT_SUPPORTED');
  assert.equal(state.audit.length,0);
});
test('F5 backend: cambios de estatus/Vo.Bo./stock no tienen adaptador',()=>{
  const e=environment();
  for(const action of ['UPDATE_VOBO','UPDATE_STATUS','ASSIGN_SUPERVISOR','CHANGE_INVENTORY','PAYMENT'])
    assert.throws(()=>e.service.normalizeOperation({...makeOp(),action},'UNITED'));
  assert.ok(e.service.lockKey(operationId).length<64);
});

test('F5 backend: misma UUID con acción distinta no puede mutar otro registro',async()=>{
  const {service,req,state,db}=environment();
  await service.syncAction(req(),makeOp(),{db});
  await assert.rejects(service.syncAction(req(),makeOp('TICKET_MOVEMENT'),{db}),
    error=>error.code==='OFFLINE_SYNC_IDEMPOTENCY_CONFLICT');
  assert.equal(state.comments.length,1);assert.equal(state.audit.length,1);
});
