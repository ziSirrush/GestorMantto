'use strict';

// Fase 1: validaciones/seguridad/SQL atomico con BD y permisos simulados.
// Ejecutar en el repo: node --test backend/tests/instalaciones-administracion-altas-fase1.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modDir = path.resolve(__dirname, '../src/modules/instalaciones-administracion');
const source = fs.readFileSync(path.join(modDir, 'instalaciones-administracion-altas.service.js'), 'utf8');
const actualPersist = require(path.join(modDir, 'instalaciones-administracion-altas-persist.js'));

const groupDefs = {
  proyecto:['proyecto','id_proyecto','referencia_sitio','estatus','activo','estatus_completo'],
  seguimiento:['fecha_visita','comentarios_fl','dias_sin_visita','dias_sin_ccnr'],
  cliente_contrato:['vendedor','cliente'],
  equipo:['tipo_equipo','numero_equipo_fabrica'],
  produccion_logistica:['fecha_ccnr','fecha_descarga'],
  montaje:['fecha_fin_montaje_planeado','fecha_fin_montaje_real','dias_restantes'],
  ajuste_calidad:['fecha_fin_ajuste_real'],
  entrega_garantia_mantenimiento:['meses_garantia_restantes','anio_termino','meses_garantia_actas','meses_mantenimiento_gratuito'],
  costos:['costo_mensual_mantenimiento_cem','presupuesto_mantenimiento_cem'],
  responsables:['supervisor_fl','id_sup','id_asesor','id_admin']
};
const groups = Object.fromEntries(Object.entries(groupDefs).map(([key, fields]) => [key, {fields}]));
const validFields = [...new Set(Object.values(groupDefs).flatMap(x=>x))];
const computed = ['estatus_completo','dias_sin_visita','dias_sin_ccnr','dias_restantes'];
const statuses = ['01-SUS','02-OC','03-PM','04-M','05-PA','06-A','07-PE','08-T'];
const knownError = (statusCode, code, message, details) => Object.assign(new Error(message), {statusCode,code,details});
const mockRules = {
  DIRECT_READONLY_FIELDS_COR:[...computed,'id_ins_fl','id_proyecto','id_sup','id_asesor','id_admin','activo','created_at','updated_at'],
  STATUS_CODES_COR: statuses,
  zonedToday_cor:()=>'2026-10-20',
  derivedForRow_cor:row=>({
    ...(row.estatus ? {estatus_completo:row.estatus==='08-T'?'Equipos Entregados':'Otro estatus'} : {}),
    dias_sin_visita:null,dias_sin_ccnr:null,dias_restantes:null
  })
};
function normalizedGroup(group, payload) {
  const accepted=groupDefs[group];
  if (!accepted) throw knownError(400,'GRUPO_INVALIDO','Grupo desconocido');
  const out={};
  for (const [field,value] of Object.entries(payload.changes)) {
    if (!accepted.includes(field)) throw knownError(400,'CAMPO_FUERA_GRUPO','Campo desconocido');
    if (value != null && typeof value==='object') throw knownError(400,'VALOR_INVALIDO','No admite objetos');
    const normalized=value == null || String(value).trim()===''?null:String(value).trim();
    const limit = field === 'id_proyecto'?100:field==='proyecto'||field==='referencia_sitio'?255:20000;
    if (normalized && normalized.length > limit) throw knownError(400,'VALOR_LARGO','Longitud no valida');
    out[field]=normalized;
  }
  return out;
}
function normalizedEdited(changes) {
  const copy={...changes};
  if (copy.fecha_visita && !/^\d{4}-\d{2}-\d{2}$/.test(copy.fecha_visita))
    throw knownError(400,'FECHA_INVALIDA','Fecha invalida');
  return copy;
}
function loadWithMocks(mocks) {
  const module = {exports:{}};
  new Function('require','module','exports',source)((name)=>{
    if (!Object.prototype.hasOwnProperty.call(mocks,name)) throw new Error('Mock no declarado: '+name);
    return mocks[name];
  },module,module.exports);
  return module.exports;
}

function fixture(options={}) {
  let nextId=100;
  let active=new Map((options.existing||[]).map(row=>[row.id_ins_fl,{...row}]));
  let saved;
  const events=[];
  const db={getConnection:async()=>conn};
  const conn={
    async beginTransaction(){events.push('BEGIN');saved=new Map([...active].map(([k,row])=>[k,{...row}]));},
    async commit(){events.push('COMMIT');saved=null;},
    async rollback(){events.push('ROLLBACK');active=saved; saved=null;},
    release(){events.push('RELEASE');},
    async query(sql,params=[]) {
      if (sql.startsWith('SELECT id_ins_fl, proyecto, referencia_sitio FROM ins_fl')) {
        events.push('LOCK:'+params[0]);
        return [[...active.values()].filter(row=>row.id_proyecto===params[0])];
      }
      if (sql.startsWith('INSERT INTO ins_fl')) {
        if (options.sqlError) throw Object.assign(new Error('Fallo sql'),{code:options.sqlError});
        const keys=[...sql.matchAll(/`([^`]+)`/g)].map(x=>x[1]);
        const row=Object.fromEntries(keys.map((key,i)=>[key,params[i]]));
        if ([...active.values()].some(other=>
          other.id_proyecto?.toUpperCase()===row.id_proyecto?.toUpperCase() &&
          other.referencia_sitio?.toUpperCase()===row.referencia_sitio?.toUpperCase()))
          throw Object.assign(new Error('Clave duplicada'),{code:'ER_DUP_ENTRY'});
        const id=++nextId;
        active.set(id,{id_ins_fl:id,...row});
        events.push('INSERT:'+id);
        return [{insertId:id,affectedRows:1}];
      }
      if (sql.startsWith('SELECT id_ins_fl, id_proyecto, referencia_sitio, proyecto FROM ins_fl')) {
        const row=active.get(params[0]);
        return [row?[{...row}]:[]];
      }
      throw Error('SQL no simulado: '+sql);
    }
  };
  const service=loadWithMocks({
    './instalaciones-administracion-altas-persist': actualPersist,
    './instalaciones-administracion-altas-origin': {
      acquireCor: async()=>{events.push('LOCK_GAS');return !options.lockBusy;},
      releaseCor: async()=>{events.push('UNLOCK_GAS');} 
    },
    '../../config/db':db,
    '../ventas/ventas-visibility.service':{resolveVisibilityScope:async()=>options.scope||{mode:'ALL'}},
    './instalaciones-administracion.service':{
      ensureFullEditPermission_cor:async req=>{
        if (options.noEdit||req.viewerContext?.active)throw knownError(403,'DENEGADO','Sin permisos');
      },
      resolveGroupPermissions_cor:async()=>({proyecto:{can_view:!options.noView,can_edit:!options.noEdit}})
    },
    './instalaciones-administracion.auto-service':{
      exactUserByInitials_cor:async(conn,field,initials)=>{
        if (initials == null) return null;
        if (field==='vendedor' && initials==='VEN')return {id:5,initials:'VEN'};
        if (field==='supervisor_fl' && initials==='SUP')return {id:7,initials:'SUP'};
        throw knownError(400,'RESPONSABLE_INVALIDO','Iniciales no unicas');
      },
      adminForSales_cor:async(conn,id)=>({idAdmin:id?12:null})
    },
    './instalaciones-administracion.audit-service':{
      assertSerializableAudit_cor:detail=>{
        if (JSON.stringify(detail).length>65535)throw knownError(413,'AUDIT_BIG','Auditoria excesiva');
      }
    },
    '../../services/interactions/interactions.service':{
      recordFromRequest_gnral:async(req,data,{executor})=>{
        assert.strictEqual(executor,conn);
        assert.equal(data.metodo_http,'POST');
        assert.equal(data.tipo_interaccion,'CREAR');
        events.push('AUDIT:'+data.payload_json.id_ins_fl);
        if (options.auditFail)throw new Error('Auditoria fallo');
        return {id_interaccion:99};
      }
    },
    './instalaciones-administracion.constants':{GROUPS_COR:groups,ALL_OPERATIONAL_FIELDS_COR:validFields},
    './instalaciones-administracion.validation':{knownError_cor:knownError,normalizeGroupUpdate_cor:normalizedGroup},
    './instalaciones-administracion.field-policy':{normalizeEditedFields_cor:normalizedEdited},
    './instalaciones-administracion.auto-rules':mockRules
  });
  const req={contextUser:{id_SB:13},viewerContext:{active:false}, originalUrl:'/api/instalaciones/administracion/altas'};
  return {service, req, events, rows:()=>[...active.values()]};
}

const a={proyecto:'Proyecto Alfa',id_proyecto:'P90001',referencia_sitio:'Elevador 1'};
const b={proyecto:'Proyecto Alfa',id_proyecto:'P90001',referencia_sitio:'Elevador 2'};
const c={proyecto:'Proyecto Beta',id_proyecto:'P90002',referencia_sitio:'Escalera 1'};

test('crea un equipo, genera PK y auditoria antes de COMMIT',async()=>{
  const f=fixture();const answer=await f.service.createRowsCor(f.req,{rows:[a]});
  assert.equal(answer.created,1);assert.equal(answer.records.length,1);
  assert.deepEqual(f.events,['LOCK_GAS','BEGIN','LOCK:P90001','INSERT:101','AUDIT:101','COMMIT','UNLOCK_GAS','RELEASE']);
  assert.equal(f.rows()[0].activo,1);
});

test('captura varios equipos de un proyecto, una sola transaccion',async()=>{
  const f=fixture();const answer=await f.service.createRowsCor(f.req,{rows:[a,b]});
  assert.equal(answer.created,2);assert.equal(f.rows().length,2);
  assert.equal(f.events.filter(x=>x==='COMMIT').length,1);
  assert.equal(f.events.filter(x=>x.startsWith('AUDIT')).length,2);
});

test('puede capturar varios proyectos distintos en un lote',async()=>{
  const f=fixture();await f.service.createRowsCor(f.req,{rows:[a,c]});
  assert.equal(f.rows().length,2);
});

test('los campos opcionales pueden ser null y no se inventan valores',async()=>{
  const f=fixture();await f.service.createRowsCor(f.req,{rows:[{...a,cliente:null, tipo_equipo:'',estatus:null,numero_equipo_fabrica:null}]});
  const row=f.rows()[0];assert.equal(row.cliente,null);assert.equal(row.tipo_equipo,null);
  assert.equal(row.numero_equipo_fabrica,null);assert.equal(row.estatus,null);
  assert.equal(row.activo,1);
});

test('persiste formulas Fase 3 aprobadas sin convertir fechas previstas a reales',async()=>{
  const f=fixture();await f.service.createRowsCor(f.req,{rows:[{...a,estatus:'08-T'}]});
  assert.equal(f.rows()[0].estatus_completo,'Equipos Entregados');
  assert.equal(f.rows()[0].dias_sin_visita,null);
  assert.equal(f.rows()[0].meses_garantia_restantes,null);
  assert.equal(f.rows()[0].fecha_fin_montaje_real,undefined);
  assert.equal(f.rows()[0].fecha_fin_ajuste_real,undefined);
});

test('si GAS tiene candado, se rechaza sin crear ningun equipo',async()=>{
  const f=fixture({lockBusy:true});
  await assert.rejects(()=>f.service.createRowsCor(f.req,{rows:[a]}),{statusCode:409});
  assert.equal(f.rows().length,0);assert.deepEqual(f.events,['LOCK_GAS','RELEASE']);
});

test('formularios Excel calculados por backend sobre nuevo equipo',async()=>{
  const f=fixture();await f.service.createRowsCor(f.req,{rows:[{...a,
    estatus:'04-M',fecha_visita:'2026-09-14',fecha_descarga:'2026-09-07',
    fecha_fin_montaje_planeado:'2026-10-09',meses_garantia_actas:'24',
    presupuesto_mantenimiento_cem:'63576',meses_mantenimiento_gratuito:'24'
  }]});
  const row=f.rows()[0];
  assert.equal(row.meses_garantia_restantes,'24.000000');
  assert.equal(row.dias_sin_visita,'36');
  assert.equal(row.costo_mensual_mantenimiento_cem,'2649.00');
  assert.equal(row.fecha_fin_montaje_real,undefined);
});

test('sin PPNS, sin proyecto o sin referencia no registra',async()=>{
  for (const field of ['proyecto','id_proyecto','referencia_sitio']){
    const f=fixture();const row={...a};delete row[field];
    await assert.rejects(()=>f.service.createRowsCor(f.req,{rows:[row]}),{statusCode:400});
    assert.deepEqual(f.events,[]);
  }
});

test('marcadores SIN PP NS y vacio no son identidades validas',async()=>{
  const f=fixture();await assert.rejects(()=>f.service.createRowsCor(f.req,{rows:[{...a,id_proyecto:'SIN PP NS'}]}),{statusCode:400});
});

test('no admite ID tecnico, activo ni responsables FK proporcionados',async()=>{
  for (const field of ['id_ins_fl','activo','id_sup','id_asesor','id_admin']) {
    const f=fixture();const row={...a,[field]:1};
    await assert.rejects(()=>f.service.createRowsCor(f.req,{rows:[row]}),{statusCode:400});
  }
});

test('protege formulas futuras y calculados en alta',async()=>{
  for (const field of ['dias_sin_visita','fecha_fin_montaje_real','fecha_fin_ajuste_real','anio_termino','costo_mensual_mantenimiento_cem','meses_garantia_restantes']) {
    const f=fixture();const row={...a,[field]:'1'};
    await assert.rejects(()=>f.service.createRowsCor(f.req,{rows:[row]}),{statusCode:400});
  }
});

test('estatus opcional; si se captura debe pertenecer al catalogo',async()=>{
  const f=fixture();await assert.rejects(()=>f.service.createRowsCor(f.req,{rows:[{...a,estatus:'09-XX'}]}),{statusCode:400});
});

test('impide duplicados dentro del lote, incluso distinta capitalizacion',async()=>{
  const f=fixture();await assert.rejects(()=>f.service.createRowsCor(f.req,{rows:[a,{...a,referencia_sitio:'ELEVADOR 1'}]}),{statusCode:409});
  assert.deepEqual(f.events,[]);
});

test('un PPNS con proyectos distintos en el mismo lote se rechaza',async()=>{
  const f=fixture();await assert.rejects(()=>f.service.createRowsCor(f.req,{rows:[a,{...b,proyecto:'Otro proyecto'}]}),{statusCode:409});
});

test('rechaza lote mayor a 20 o objeto con claves extra',async()=>{
  const f=fixture();await assert.rejects(()=>f.service.createRowsCor(f.req,{rows:Array.from({length:21},(_,i)=>({...a,referencia_sitio:'E'+i}))}),{statusCode:400});
  await assert.rejects(()=>f.service.createRowsCor(f.req,{rows:[a],autorizar:true}),{statusCode:400});
});

test('impide crear referencia que existe en MySQL y no cambia lo previo',async()=>{
  const f=fixture({existing:[{id_ins_fl:7,...a}]});
  await assert.rejects(()=>f.service.createRowsCor(f.req,{rows:[a]}),{statusCode:409});
  assert.equal(f.rows().length,1);assert.ok(f.events.includes('ROLLBACK'));
});

test('deniega PPNS historico vinculado a otro nombre de proyecto',async()=>{
  const f=fixture({existing:[{id_ins_fl:7,...a,proyecto:'Otro proyecto'}]});
  await assert.rejects(()=>f.service.createRowsCor(f.req,{rows:[b]}),{statusCode:409});
  assert.equal(f.rows().length,1);
});

test('una falla de auditoria revierte todas las inserciones',async()=>{
  const f=fixture({auditFail:true});
  await assert.rejects(()=>f.service.createRowsCor(f.req,{rows:[a,b]}));
  assert.equal(f.rows().length,0);assert.ok(f.events.includes('ROLLBACK'));
  assert.equal(f.events.includes('COMMIT'),false);
});

test('la llave unica MySQL prevalece ante carrera concurrente',async()=>{
  const f=fixture({sqlError:'ER_DUP_ENTRY'});
  await assert.rejects(()=>f.service.createRowsCor(f.req,{rows:[a]}),{statusCode:409});
  assert.equal(f.rows().length,0);assert.ok(f.events.includes('ROLLBACK'));
});

test('no concede altas por acceso visual ni en Visor',async()=>{
  const f=fixture({noEdit:true});
  await assert.rejects(()=>f.service.createRowsCor(f.req,{rows:[a]}),{statusCode:403});
  assert.deepEqual(f.events,[]);
  const g=fixture();g.req.viewerContext.active=true;
  await assert.rejects(()=>g.service.createRowsCor(g.req,{rows:[a]}),{statusCode:403});
  assert.deepEqual(g.events,[]);
});

test('el alcance limitado exige responsable autorizado para cada fila',async()=>{
  const f=fixture({scope:{mode:'LIMITED',advisorIds:[5]}});
  await assert.rejects(()=>f.service.createRowsCor(f.req,{rows:[a]}),{statusCode:403});
  assert.equal(f.rows().length,0);
  const good=fixture({scope:{mode:'LIMITED',advisorIds:[5]}});
  const answer=await good.service.createRowsCor(good.req,{rows:[{...a,vendedor:'VEN'}]});
  assert.equal(answer.created,1);assert.equal(good.rows()[0].id_asesor,5);
  assert.equal(good.rows()[0].id_admin,12);
});

test('el alcance restringido no permite mezcla: todo o nada',async()=>{
  const f=fixture({scope:{mode:'LIMITED',advisorIds:[5]}});
  await assert.rejects(()=>f.service.createRowsCor(f.req,{rows:[{...a,vendedor:'VEN'},c]}),{statusCode:403});
  assert.equal(f.rows().length,0);assert.ok(f.events.includes('ROLLBACK'));
});

test('rechaza iniciales no reconocidas y no fabrica responsable',async()=>{
  const f=fixture();await assert.rejects(()=>f.service.createRowsCor(f.req,{rows:[{...a,vendedor:'INEXISTENTE'}]}),{statusCode:400});
  assert.equal(f.rows().length,0);
});

test('rechaza alcance no resoluble',async()=>{
  const f=fixture({scope:{mode:'INDEFINIDO'}});
  await assert.rejects(()=>f.service.createRowsCor(f.req,{rows:[a]}),{statusCode:403});
  assert.deepEqual(f.events,[]);
});

test('la ruta POST se agrega al mismo router con Guard CORELLIAN',()=>{
  const routes=fs.readFileSync(path.join(modDir,'instalaciones-administracion.routes.js'),'utf8');
  assert.match(routes,/router\.post\('\/administracion\/altas', \.\.\.accessGuard_cor,/);
  assert.match(routes,/await altaService_cor\.createRowsCor\(req, req\.body\)/);
  assert.match(routes,/humanInformationGuard_gnral/);
});
