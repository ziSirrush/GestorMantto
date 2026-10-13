'use strict';

// QA sin acceso a Aiven. Evalua los archivos REALES del ZIP con dependencias
// falsas controladas, incluida la transaccion y la auditoria atomica.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const modPath = path.join(__dirname,'..','src','modules','instalaciones-administracion');
const jobPath = path.join(__dirname,'..','src','jobs','instalacionesAdministracionCalculados.job.js');
const rules=require(path.join(modPath,'instalaciones-administracion.auto-rules.js'));
const fieldPolicy=require(path.join(modPath,'instalaciones-administracion.field-policy.js'));
const ALL={
  proyecto:['proyecto','id_proyecto','referencia_sitio','nomenclatura','categoria','estatus','estatus_completo','activo'],
  seguimiento:['fecha_visita','comentarios_fl','avance_oc','avance_mo','avance_aj','dias_sin_visita','dias_sin_ccnr'],
  cliente_contrato:['cliente','cliente_ns','vendedor','numero_contrato','carpeta_fisica','recepcion_carpeta','ov_ns','ph_ns'],
  ubicacion_contacto:['estado','estado_localizacion','ciudad','direccion_proyecto','contacto_cliente_sitio'],
  equipo:['tipo_equipo','numero_equipo_fabrica','marca'],
  produccion_logistica:['fecha_ccnr','fecha_ccr','fecha_descarga'],
  montaje:['fecha_fin_montaje_modificado','fecha_fin_montaje_planeado','dias_restantes'],
  responsables:['supervisor_fl','id_sup','id_asesor','id_admin']
};
const groupFields=Object.fromEntries(Object.entries(ALL).map(([key,fields])=>[key,{fields}]));
// This fixture intentionally duplicates fecha_ccnr, remove duplication to match canonical grouping.
groupFields.seguimiento.fields=groupFields.seguimiento.fields.filter(f=>f!=='fecha_ccnr');

function fakeRequireLoad(filename, mocks) {
  const module={exports:{}};
  const code=fs.readFileSync(filename,'utf8');
  const localRequire=p=> {
    if (p in mocks) return mocks[p];
    throw new Error(`Dependencia no declarada en test: ${p}`);
  };
  new Function('require','module','exports',code)(localRequire,module,module.exports);
  return module.exports;
}

function fixture(opts={}) {
  const baseRows=opts.rows||[
    {id_ins_fl:11,id_proyecto:'P10152',estatus:'02-OC',estatus_completo:null,
      fecha_visita:'2026-10-10',dias_sin_visita:'0',fecha_ccnr:'-',dias_sin_ccnr:'-',
      fecha_fin_montaje_planeado:'2026-10-20',fecha_fin_montaje_modificado:'-',dias_restantes:'-',
      vendedor:'OLD',id_asesor:5,id_admin:7,supervisor_fl:'OLD',id_sup:9,comentarios_fl:'previo'},
    {id_ins_fl:12,id_proyecto:'P10152',estatus:'03-PM',estatus_completo:null,
      fecha_visita:'2026-10-09',dias_sin_visita:'0',fecha_ccnr:'-',dias_sin_ccnr:'-',
      fecha_fin_montaje_planeado:'2026-10-21',fecha_fin_montaje_modificado:'-',dias_restantes:'-',
      vendedor:'OLD',id_asesor:5,id_admin:7,supervisor_fl:'OLD',id_sup:9,comentarios_fl:'previo'},
    {id_ins_fl:13,id_proyecto:'P99999',estatus:'02-OC',estatus_completo:null,
      fecha_visita:'2026-10-09',dias_sin_visita:'0',fecha_ccnr:'-',dias_sin_ccnr:'-',
      fecha_fin_montaje_planeado:'2026-10-21',fecha_fin_montaje_modificado:'-',dias_restantes:'-',
      vendedor:'OLD',id_asesor:5,id_admin:7,supervisor_fl:'OLD',id_sup:9,comentarios_fl:'previo'}
  ];
  const rows=new Map(baseRows.map(x=>[x.id_ins_fl,{...x}]));
  const events=[];
  const actor={contextUser:{id_SB:25},viewerContext:{active:false}};
  const users=[{id_SB:30,iniciales:'VEN',area:'Ventas',estado:1},
    {id_SB:44,iniciales:'SUP',area:'Instalaciones',estado:1},
    {id_SB:47,iniciales:'XX',area:'Ventas',estado:0}];
  const relations={30:[{id_SB:70,iniciales:'AAA'},{id_SB:71,iniciales:'BBB'}]};
  const connection={
    async beginTransaction(){events.push('BEGIN');this.snapshot=new Map([...rows].map(([k,v])=>[k,{...v}]));this.pending=[];},
    async commit(){events.push('COMMIT');this.snapshot=null;},
    async rollback(){events.push('ROLLBACK');rows.clear();for(const [k,v] of this.snapshot)rows.set(k,v);this.pending=[];},
    release(){events.push('RELEASE');},
    async query(sql,params){
      if (/SELECT id_SB, iniciales FROM usuarios/.test(sql)) {
        const [area,ini]=params;
        return [users.filter(x=>x.area===area&&x.iniciales===ini&&x.estado===1)];
      }
      if (/SELECT DISTINCT u.id_SB, u.iniciales/.test(sql)) return [relations[params[0]]||[]];
      if (/^UPDATE ins_fl SET /.test(sql)) {
        const names=[...sql.matchAll(/`([^`]+)`\s*=\s*\?/g)].map(m=>m[1]);
        const id=params[names.length],row=rows.get(id);
        assert(row,'La prueba no encuentra el equipo en UPDATE');
        names.forEach((f,i)=>{row[f]=params[i];});
        events.push(`UPDATE:${id}:${names.join(',')}`);
        return [{affectedRows:1}];
      }
      throw new Error('SQL no esperado: '+sql);
    }
  };
  const repository={
    comparable_cor(v){return v==null||v===''?null:String(v).trim();},
    parseProjectKey_cor(key){
      if(/^P:\w+$/.test(key))return {key,params:[key.slice(2)]};
      if(/^R:\d+$/.test(key))return {key,params:[Number(key.slice(2))]};
      throw Object.assign(new Error('Proyecto invalido'),{statusCode:400});
    },
    async getRecordById_cor({id,scope,projectKey}){
      const row=rows.get(Number(id));
      if(!row)return null;
      if(scope?.mode!=='ALL'&&opts.deniedId===Number(id))return null;
      if(projectKey && projectKey.startsWith('P:') && row.id_proyecto!==projectKey.slice(2))return null;
      return {...row};
    }
  };
  const actualService={
    async ensureFullEditPermission_cor(req){if(opts.denyEdit||req.viewerContext?.active)
      throw Object.assign(new Error('Edicion denegada'),{statusCode:403});},
    async resolveGroupPermissions_cor(){return {proyecto:{can_view:!opts.denyProject}};}
  };
  const audit={async recordGroupUpdate_cor(req,{group,changes}){
    if(opts.auditFails)throw new Error('Auditoria rechazada');
    events.push(`AUDIT:${group}:${Object.keys(changes).join(',')}`);
  }};
  const normalize=(group,{changes})=>{
    for(const name of Object.keys(changes)) if(!groupFields[group]?.fields.includes(name))throw new Error('Grupo invalido '+name);
    return changes;
  };
  const service=fakeRequireLoad(path.join(modPath,'instalaciones-administracion.auto-service.js'),{
    '../../config/db':{getConnection:async()=>connection,query:async sql=>{
      if(sql.includes('WHERE estado=1 AND area IN')) return [users.filter(u=>u.estado===1)];
      throw new Error('SQL de catalogo inesperado');
    }},
    '../ventas/ventas-visibility.service':{resolveVisibilityScope:async()=>({mode:'SCOPED'})},
    './instalaciones-administracion.service':actualService,
    './instalaciones-administracion.repository':repository,
    './instalaciones-administracion.audit-service':audit,
    './instalaciones-administracion.constants':{
      GROUPS_COR:groupFields,ALL_OPERATIONAL_FIELDS_COR:[...new Set(Object.values(groupFields).flatMap(g=>g.fields))]
    },
    './instalaciones-administracion.validation':{
      positiveId_cor(v){const id=Number(v);if(!Number.isInteger(id)||id<1)throw new Error('ID invalido');return id;},
      normalizeGroupUpdate_cor:normalize
    },
    './instalaciones-administracion.field-policy':fieldPolicy,
    './instalaciones-administracion.auto-rules':rules
  });
  return {service,rows,events,actor,users,relations};
}

const TODAY='2026-10-13';
const sampleDate=new Date('2026-10-13T16:00:00Z');

test('01: lista ocho estatus oficiales sin codigo de estado adicional',()=>{
  assert.deepEqual(rules.STATUS_CODES_COR,['01-SUS','02-OC','03-PM','04-M','05-PA','06-A','07-PE','08-T']);
});
test('02: zona horaria CDMX y calendario civil estable',()=>{
  assert.equal(rules.zonedToday_cor(new Date('2026-10-13T05:45:00Z')),'2026-10-12');
  assert.equal(rules.zonedToday_cor(sampleDate),'2026-10-13');
  assert.equal(rules.daysBetween_cor('2026-10-01','2026-10-13'),12);
});
test('03: fechas historicas ISO/DD/MM y marcadores se distinguen',()=>{
  assert.deepEqual(rules.parseCivilDate_cor('13/10/2026'),{kind:'valid',date:'2026-10-13'});
  assert.deepEqual(rules.parseCivilDate_cor('-'),{kind:'empty',date:null});
  assert.equal(rules.parseCivilDate_cor('31/02/2026').kind,'invalid');
  assert.equal(rules.parseCivilDate_cor('no se sabe').kind,'invalid');
});
test('04: calculos fecha visita, CCNR, fin modificado y estatus derivado',()=>{
  const a=rules.derivedForRow_cor({estatus:'04-M',fecha_visita:'2026-10-10',fecha_ccnr:'2026-10-01',
    fecha_fin_montaje_planeado:'2026-10-25',fecha_fin_montaje_modificado:'2026-10-16'},TODAY);
  assert.deepEqual(a,{estatus_completo:'Equipos en Montaje',dias_sin_visita:'3',dias_sin_ccnr:'12',dias_restantes:'3'});
});
test('05: fin planeado si modificado es guion, nulo sin fechas',()=>{
  const a=rules.derivedForRow_cor({estatus:'08-T',fecha_visita:null,fecha_ccnr:'-',
    fecha_fin_montaje_planeado:'2026-10-15',fecha_fin_montaje_modificado:'-'},TODAY);
  assert.equal(a.dias_restantes,'2');assert.equal(a.dias_sin_visita,null);assert.equal(a.dias_sin_ccnr,null);
});
test('06: fecha corrupta conserva derivado previo en vez de sobreescribir',()=>{
  const a=rules.derivedForRow_cor({fecha_visita:'nada',fecha_ccnr:'N/A',
    fecha_fin_montaje_modificado:'dato invalido',fecha_fin_montaje_planeado:'2026-10-15'},TODAY);
  assert.equal(Object.hasOwn(a,'dias_sin_visita'),false);
  assert.equal(Object.hasOwn(a,'dias_restantes'),false);
  assert.equal(a.dias_sin_ccnr,null);
});
test('07: campos id, calculados y control bloqueados a edicion manual',()=>{
  for(const field of rules.DIRECT_READONLY_FIELDS_COR){
    assert.throws(()=>rules.assertManualFields_cor({[field]:'1'},[field]),{statusCode:400});
  }
});
test('08: mas de una columna por solicitud es invalida',()=>{
  assert.throws(()=>rules.assertManualFields_cor({estatus:'08-T',vendedor:'VEN'},['estatus','vendedor']),{statusCode:400});
});
test('09: recepcion_carpeta calendar; fecha_liberacion_ajuste texto SI o fecha',()=>{
  assert.equal(fieldPolicy.fieldMeta_cor('recepcion_carpeta').kind,'date');
  assert.equal(fieldPolicy.fieldMeta_cor('fecha_liberacion_ajuste').kind,'text');
  assert.equal(fieldPolicy.normalizeEditedFields_cor({fecha_liberacion_ajuste:'SI'}).fecha_liberacion_ajuste,'SI');
  assert.throws(()=>fieldPolicy.normalizeEditedFields_cor({recepcion_carpeta:'2026-02-31'}),{statusCode:400});
});
test('10: permiso EDITAR deniega antes de abrir transaccion',async()=>{
  const f=fixture({denyEdit:true});
  await assert.rejects(f.service.updateDirect_cor(f.actor,'P:P10152',11,
    {changes:{comentarios_fl:'nuevo'},expected:{comentarios_fl:'previo'}}),{statusCode:403});
  assert.equal(f.events.includes('BEGIN'),false);
});
test('11: modo Visor deniega escritura',async()=>{
  const f=fixture();f.actor.viewerContext.active=true;
  await assert.rejects(f.service.updateDirect_cor(f.actor,'P:P10152',11,
    {changes:{comentarios_fl:'nuevo'},expected:{comentarios_fl:'previo'}}),{statusCode:403});
});
test('12: equipo de otro proyecto no se modifica',async()=>{
  const f=fixture();
  await assert.rejects(f.service.updateDirect_cor(f.actor,'P:P10152',13,
    {changes:{comentarios_fl:'nuevo'},expected:{comentarios_fl:'previo'}}),{statusCode:404});
  assert.equal(f.rows.get(13).comentarios_fl,'previo');
  assert(f.events.includes('ROLLBACK'));
});
test('13: conflicto esperado 409 no escribe',async()=>{
  const f=fixture();
  await assert.rejects(f.service.updateDirect_cor(f.actor,'P:P10152',11,
    {changes:{comentarios_fl:'nuevo'},expected:{comentarios_fl:'antiguo'}}),{statusCode:409});
  assert.equal(f.rows.get(11).comentarios_fl,'previo');
});
test('14: editar estatus activa estatus_completo y auditoria atomica',async()=>{
  const f=fixture();
  const x=await f.service.updateDirect_cor(f.actor,'P:P10152',11,
    {changes:{estatus:'08-T'},expected:{estatus:'02-OC'}});
  assert.equal(x.updated,true);
  assert.equal(f.rows.get(11).estatus_completo,'Equipos Entregados');
  assert(f.events.includes('COMMIT'));
  assert(f.events.some(e=>e==='AUDIT:proyecto:estatus,estatus_completo'));
});
test('15: vendedor rel_admin dos, mantiene FK valida previa solo si relacionada',async()=>{
  const f=fixture();
  const x=await f.service.updateDirect_cor(f.actor,'P:P10152',11,
    {changes:{vendedor:'VEN'},expected:{vendedor:'OLD'}});
  assert.equal(x.updated,true);
  assert.equal(f.rows.get(11).id_asesor,30);
  assert.equal(f.rows.get(11).id_admin,null); // antiguo 7 no relacionado, no inventar varios BIGINT
  assert.equal(f.rows.get(11).vendedor,'VEN');
  assert(f.events.some(e=>e.includes('AUDIT:responsables:')));
  assert.equal((await f.service.adminForSales_cor({query:async()=>[[{id_SB:70,iniciales:'AAA'},{id_SB:71,iniciales:'BBB'}]]},30,70)).idAdmin,70);
});
test('16: supervisor llena id_sup tras verificar area Instalaciones',async()=>{
  const f=fixture();
  await f.service.updateDirect_cor(f.actor,'P:P10152',11,
    {changes:{supervisor_fl:'SUP'},expected:{supervisor_fl:'OLD'}});
  assert.equal(f.rows.get(11).id_sup,44);
});
test('17: no acepta iniciales de otra area, aunque el usuario exista',async()=>{
  const f=fixture();
  await assert.rejects(f.service.updateDirect_cor(f.actor,'P:P10152',11,
    {changes:{supervisor_fl:'VEN'},expected:{supervisor_fl:'OLD'}}),{statusCode:400});
  assert.equal(f.rows.get(11).id_sup,9);
});
test('18: catalogos de captura sin relaciones globales; estatus y areas EDITAR',async()=>{
  const f=fixture();
  const r=await f.service.getEditCatalogs_cor(f.actor);
  assert.equal(r.vendedores[0].iniciales,'VEN');
  assert.equal(r.supervisores[0].iniciales,'SUP');
  assert.equal(Object.prototype.hasOwnProperty.call(r,'rel_admin_por_asesor'),false);
  assert.equal(r.estatus.length,8);
});
test('19: edicion multiple modifica 2 equipos en una unica transaccion',async()=>{
  const f=fixture();
  const r=await f.service.updateDirectMulti_cor(f.actor,'P:P10152',{
    ids:[11,12],changes:{comentarios_fl:'misma nota'},
    expected:{11:{comentarios_fl:'previo'},12:{comentarios_fl:'previo'}}
  });
  assert.equal(r.selected,2);assert.equal(r.updated,2);
  assert.equal(f.rows.get(11).comentarios_fl,'misma nota');
  assert.equal(f.rows.get(12).comentarios_fl,'misma nota');
  assert.equal(f.events.filter(e=>e==='BEGIN').length,1);
  assert.equal(f.events.filter(e=>e==='COMMIT').length,1);
});
test('20: conflicto de uno invalida los dos antes del primer UPDATE',async()=>{
  const f=fixture();
  await assert.rejects(f.service.updateDirectMulti_cor(f.actor,'P:P10152',{
    ids:[11,12],changes:{comentarios_fl:'misma nota'},
    expected:{11:{comentarios_fl:'previo'},12:{comentarios_fl:'antiguo'}}
  }),{statusCode:409});
  assert.equal(f.events.some(e=>e.startsWith('UPDATE:')),false);
  assert.equal(f.rows.get(11).comentarios_fl,'previo');
});
test('21: falla de auditoria revierte cambios del lote completo',async()=>{
  const f=fixture({auditFails:true});
  await assert.rejects(f.service.updateDirectMulti_cor(f.actor,'P:P10152',{
    ids:[11,12],changes:{comentarios_fl:'misma nota'},
    expected:{11:{comentarios_fl:'previo'},12:{comentarios_fl:'previo'}}
  }));
  assert.equal(f.rows.get(11).comentarios_fl,'previo');
  assert.equal(f.rows.get(12).comentarios_fl,'previo');
  assert(f.events.includes('ROLLBACK'));
});
test('22: lote con otra clave de proyecto se deniega',async()=>{
  const f=fixture();
  await assert.rejects(f.service.updateDirectMulti_cor(f.actor,'R:11',{
    ids:[11,12],changes:{comentarios_fl:'nueva'},
    expected:{11:{comentarios_fl:'previo'},12:{comentarios_fl:'previo'}}
  }),{statusCode:400});
});
test('23: no admite lote >20 ni IDs duplicados',async()=>{
  const f=fixture();
  await assert.rejects(f.service.updateDirectMulti_cor(f.actor,'P:P10152',{
    ids:Array.from({length:21},(_,i)=>i+1),changes:{comentarios_fl:'x'},expected:{}
  }),{statusCode:400});
  await assert.rejects(f.service.updateDirectMulti_cor(f.actor,'P:P10152',{
    ids:[11,11],changes:{comentarios_fl:'x'},expected:{}
  }),{statusCode:400});
});
test('24: job diario solo compara derivados, no borra datos operativos',()=>{
  const before={id_ins_fl:11,estatus:'02-OC',estatus_completo:null,fecha_visita:'2026-10-12',
    fecha_ccnr:'-',fecha_fin_montaje_planeado:'2026-10-20',fecha_fin_montaje_modificado:'-',
    dias_sin_visita:'0',dias_sin_ccnr:'-',dias_restantes:'-'};
  const job=fakeRequireLoad(jobPath,{
    '../config/db':{},'../shared/logger':{info(){},error(){}},
    '../modules/instalaciones-administracion/instalaciones-administracion.auto-rules':rules
  });
  const derived=job.changesForRow_cor(before,TODAY);
  assert.deepEqual(derived,{estatus_completo:'Equipos en Obra Civil',
    dias_sin_visita:'1',dias_sin_ccnr:null,dias_restantes:'7'});
});
test('25: job no toca BD antes de las 00:10 CDMX',async()=>{
  const job=fakeRequireLoad(jobPath,{
    '../config/db':{},'../shared/logger':{info(){},error(){}},
    '../modules/instalaciones-administracion/instalaciones-administracion.auto-rules':rules
  });
  const skipped=await job.checkDailyCor_cor(new Date('2026-10-13T06:05:00Z'));
  assert.equal(skipped.skipped,true);
});
test('26: job SQL usa candado y comparacion optimista antes de escribir',async()=>{
  let locked=false,updated=false,released=false;
  const row={id_ins_fl:11,estatus:'03-PM',estatus_completo:null,
    fecha_visita:'2026-10-12',fecha_ccnr:null,fecha_fin_montaje_planeado:null,
    fecha_fin_montaje_modificado:null,dias_sin_visita:'0',dias_sin_ccnr:null,dias_restantes:null};
  const c={
    async query(sql,params){
      if(sql.includes('GET_LOCK')){locked=true;return [[{granted:1}]];}
      if(sql.includes('RELEASE_LOCK')){released=true;return [[{released:1}]];}
      if(sql.startsWith('SELECT id_ins_fl'))return [[row]];
      if(sql.startsWith('UPDATE ins_fl')){
        assert(locked);assert(sql.includes(' <=> ?'));updated=true;
        return [{affectedRows:1}];
      }
      throw new Error('SQL desconocido: '+sql);
    },release(){}
  };
  const job=fakeRequireLoad(jobPath,{
    '../config/db':{},'../shared/logger':{info(){},error(){}},
    '../modules/instalaciones-administracion/instalaciones-administracion.auto-rules':rules
  });
  const result=await job.runDailyCor_cor(TODAY,{db:{getConnection:async()=>c},yieldAfterPage:false});
  assert.equal(result.updated,1);assert(locked&&updated&&released);
});
test('27: bootstrap enlaza iniciar y detener job, otros jobs conservados',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','src','bootstrap.js'),'utf8');
  assert(src.includes('startInstalacionesAdministracionCalculadosJob();'));
  assert(src.includes('stopInstalacionesAdministracionCalculadosJob();'));
  assert(src.includes('startPushNotificationsJob();'));
});
test('28: rutas directas protegidas por puerta CORELLIAN y sin tocar Main',()=>{
  const src=fs.readFileSync(path.join(modPath,'instalaciones-administracion.routes.js'),'utf8');
  assert(src.includes("permissionCode: ACCESS_PERMISSION_COR"));
  assert(src.includes("domain: 'CORELLIAN'"));
  assert(src.includes("router.patch('/administracion/proyectos/:projectKey/equipos/edicion-multiple-directa'"));
  assert(src.includes("router.patch('/administracion/proyectos/:projectKey/equipos/:id/edicion-directa'"));
});
test('29: un administrativo relacionado fija automaticamente un id_admin numerico',async()=>{
  const f=fixture();f.relations[30]=[{id_SB:70,iniciales:'AAA'}];
  await f.service.updateDirect_cor(f.actor,'P:P10152',11,
    {changes:{vendedor:'VEN'},expected:{vendedor:'OLD'}});
  assert.equal(f.rows.get(11).id_asesor,30);
  assert.equal(f.rows.get(11).id_admin,70);
});
test('30: con dos relacionados, conserva id_admin solo si pertenece a la relacion',async()=>{
  const f=fixture({rows:[{id_ins_fl:11,id_proyecto:'P10152',vendedor:'OLD',id_asesor:5,
    id_admin:71,estatus:'02-OC',fecha_visita:'2026-10-12',fecha_ccnr:null,
    fecha_fin_montaje_modificado:null,fecha_fin_montaje_planeado:null}]});
  await f.service.updateDirect_cor(f.actor,'P:P10152',11,
    {changes:{vendedor:'VEN'},expected:{vendedor:'OLD'}});
  assert.equal(f.rows.get(11).id_admin,71);
});
test('31: no se permite escribir FK id_admin ni derivados por endpoint directo',async()=>{
  const f=fixture();
  for(const field of ['id_admin','id_asesor','id_sup','dias_sin_visita','estatus_completo']) {
    await assert.rejects(f.service.updateDirect_cor(f.actor,'P:P10152',11,
      {changes:{[field]:'66'},expected:{[field]:null}}),{statusCode:400});
  }
  assert.equal(f.events.length,0);
});
test('32: selecciones de vendedor y supervisor rechazadas si no hay permiso EDITAR',async()=>{
  const f=fixture({denyEdit:true});
  await assert.rejects(f.service.getEditCatalogs_cor(f.actor),{statusCode:403});
});
test('33: dias_restantes negativo despues de la fecha, sin conversion de zona horaria host',()=>{
  const data=rules.derivedForRow_cor({
    fecha_visita:'2026-10-20',fecha_ccnr:'2026-10-01',
    fecha_fin_montaje_modificado:'2026-10-08',fecha_fin_montaje_planeado:'2026-10-15'
  },TODAY);
  assert.equal(data.dias_restantes,'-5');
  assert.equal(data.dias_sin_visita,'-7');
});
test('34: ruta V1 tabla rechaza IDS/derivados sin invocar controller',async()=>{
  const routes=[];let invoked=0;
  const router={get(p,...handlers){routes.push({method:'GET',p,handlers});},
    patch(p,...handlers){routes.push({method:'PATCH',p,handlers});}};
  const guard=(req,res,next)=>next();
  fakeRequireLoad(path.join(modPath,'instalaciones-administracion.routes.js'),{
    express:{Router(){return router;}},
    './instalaciones-administracion.controller':{
      updateTableEquipment_cor(){invoked++;},updateMulti_cor(){invoked++;}
    },
    './instalaciones-administracion.tabla-service':{},
    './instalaciones-administracion.auto-service':{},
    './instalaciones-administracion.auto-rules':rules,
    '../../middleware/information-access-gnral.middleware':{
      humanInformationGuard_gnral(){return [guard];}
    },
    '../../services/permissions/effective-permission.service':{
      hasEffectivePermission:async()=>true
    },
    './instalaciones-administracion.constants':{
      ACCESS_PERMISSION_COR:'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
      GROUP_PERMISSIONS_COR:{}
    }
  });
  for(const suffix of [':id/tabla','edicion-multiple']){
    const route=routes.find(r=>r.method==='PATCH'&&r.p.endsWith(suffix));
    assert(route,`Falta ruta ${suffix}`);
    const deny=route.handlers.at(-2);
    const req={body:{groups:{responsables:{changes:{id_admin:12}}}}};
    let statusCode=0,body=null,called=false;
    const res={status(n){statusCode=n;return this;},json(v){body=v;return this;}};
    deny(req,res,()=>{called=true;invoked++;});
    assert.equal(statusCode,400);assert.equal(called,false);
    assert.equal(body.code,'INSTALACIONES_ADMINISTRACION_TABLA_SOLO_LECTURA');
    assert.equal(body.details.field,'id_admin');
  }
  assert.equal(invoked,0);
});
test('35: ruta V1 permite otros campos a su controller sin expandir permisos',()=>{
  const routes=[];const router={get(){},patch(p,...handlers){routes.push({p,handlers});}};
  fakeRequireLoad(path.join(modPath,'instalaciones-administracion.routes.js'),{
    express:{Router(){return router;}},
    './instalaciones-administracion.controller':{updateTableEquipment_cor(){},updateMulti_cor(){}},
    './instalaciones-administracion.tabla-service':{},
    './instalaciones-administracion.auto-service':{},
    './instalaciones-administracion.auto-rules':rules,
    '../../middleware/information-access-gnral.middleware':{humanInformationGuard_gnral(){return [()=>{}];}},
    '../../services/permissions/effective-permission.service':{hasEffectivePermission:async()=>true},
    './instalaciones-administracion.constants':{
      ACCESS_PERMISSION_COR:'X',GROUP_PERMISSIONS_COR:{}
    }
  });
  const r=routes.find(x=>x.p.endsWith(':id/tabla'));
  const deny=r.handlers.at(-2);
  let nexted=false;
  deny({body:{groups:{proyecto:{changes:{estatus:'08-T'}}}}},{status(){throw new Error('Bloqueado');}},()=>nexted=true);
  assert.equal(nexted,true);
});
test('36: tabla de proyecto muestra rel_admin con iniciales separadas por coma sin exponer nuevos IDs',async()=>{
  const db={async query(sql){
    if(sql.includes('FROM ins_fl f')) return [[{id_ins_fl:11,id_proyecto:'P10152',vendedor:'VEN',id_asesor:30,id_admin:70}]];
    if(sql.includes('FROM usuarios_rel_admin'))return [[{id_asesor:30,rel_admin:'AAA, BBB'}]];
    throw Error('SQL inesperado '+sql);
  }};
  const table=fakeRequireLoad(path.join(modPath,'instalaciones-administracion.tabla-service.js'),{
    '../../config/db':db,
    '../ventas/ventas-visibility.service':{resolveVisibilityScope:async()=>({mode:'ALL'})},
    './instalaciones-administracion.service':{
      getContract_cor:async()=>({groups:[
        {key:'cliente_contrato',fields:['vendedor'],permissions:{can_view:true}},
        {key:'responsables',fields:['id_asesor','id_admin'],permissions:{can_view:true}}
      ],system_readonly_fields:['id_ins_fl'] }),
      listProjectEquipments_cor:async()=>({data:[{id_ins_fl:11}],total:1,limit:30,offset:0})
    },
    './instalaciones-administracion.repository':{
      parseProjectKey_cor:()=>({sql:'f.id_proyecto=?',params:['P10152']}),
      scopeClause_cor:()=>({sql:'',params:[]})
    },
    './instalaciones-administracion.constants':{
      ALL_OPERATIONAL_FIELDS_COR:['vendedor','id_asesor','id_admin'],
      SYSTEM_READONLY_FIELDS_COR:['id_ins_fl','created_at','updated_at']
    }
  });
  const result=await table.projectEquipmentTable_cor({},'P:P10152');
  assert(result.columns.includes('rel_admin'));
  assert.equal(result.data[0].rel_admin,'AAA, BBB');
  assert.equal(result.data[0].vendedor,'VEN');
});
test('37: tabla no expone rel_admin cuando no se autoriza lectura de responsables',async()=>{
  let count=0;
  const db={async query(sql){count++;if(sql.includes('FROM ins_fl f'))return [[{id_ins_fl:11,vendedor:'VEN'}]];
    throw new Error('No debe consultar relaciones sin permisos de lectura');}};
  const table=fakeRequireLoad(path.join(modPath,'instalaciones-administracion.tabla-service.js'),{
    '../../config/db':db,
    '../ventas/ventas-visibility.service':{resolveVisibilityScope:async()=>({mode:'ALL'})},
    './instalaciones-administracion.service':{
      getContract_cor:async()=>({groups:[
        {key:'cliente_contrato',fields:['vendedor'],permissions:{can_view:true}},
        {key:'responsables',fields:['id_asesor'],permissions:{can_view:false}}
      ],system_readonly_fields:['id_ins_fl']}),
      listProjectEquipments_cor:async()=>({data:[{id_ins_fl:11}],total:1,limit:30,offset:0})
    },
    './instalaciones-administracion.repository':{
      parseProjectKey_cor:()=>({sql:'f.id_proyecto=?',params:['P10152']}),
      scopeClause_cor:()=>({sql:'',params:[]})
    },
    './instalaciones-administracion.constants':{
      ALL_OPERATIONAL_FIELDS_COR:['vendedor','id_asesor'],
      SYSTEM_READONLY_FIELDS_COR:['id_ins_fl','created_at','updated_at']
    }
  });
  const out=await table.projectEquipmentTable_cor({},'P:P10152');
  assert.equal(out.columns.includes('rel_admin'),false);
  assert.equal(count,1);
});
