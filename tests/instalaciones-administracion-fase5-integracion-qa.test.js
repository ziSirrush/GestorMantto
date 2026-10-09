'use strict';

// [Aster | 2026-10-08 | ASTER-MG | FASE_5_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001]
// Unitarias/locales con dobles: no crean conexiones con Aiven ni Azure.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ROOT = path.resolve(__dirname, '..');
const MOD = path.join(ROOT,'backend/src/modules/instalaciones-administracion');
const SCRIPT = require(path.join(ROOT,'validation/instalaciones-administracion-fase5-readonly-smoke.js'));
const read = rel => fs.readFileSync(path.join(ROOT,rel),'utf8');

let interactionCalls = [];
let mockAuditResult = {id_interaccion:55};
const mockInteractions = {
  recordFromRequest_gnral: async (req,data,opts) => {
    interactionCalls.push({req,data,opts});
    return mockAuditResult;
  }
};
const mockDb = {query:async()=>[[]],getConnection:async()=>{throw new Error('Mock no configurado');}};
const fakeConstants = {
  ALL_OPERATIONAL_FIELDS_COR:['proyecto','referencia_sitio','cliente','estatus','id_asesor'],
  GROUPS_COR:{proyecto:{label:'Proyecto e identificacion'},seguimiento:{label:'Seguimiento operativo'}}
};
function importWithMocks(rel) {
  const name = path.basename(rel);
  const full = path.join(MOD,rel);
  const original = Module._load;
  try {
    Module._load = function(request,parent,isMain) {
      if (parent?.filename?.endsWith(name)) {
        if (request === '../../config/db') return mockDb;
        if (request === './instalaciones-administracion.constants') return fakeConstants;
        if (request === '../../services/interactions/interactions.service') return mockInteractions;
      }
      return original.call(this,request,parent,isMain);
    };
    return require(full);
  } finally {Module._load=original;}
}
const repository = importWithMocks('instalaciones-administracion.repository.js');
const audit = importWithMocks('instalaciones-administracion.audit-service.js');

function createTransactionalDb(initial) {
  const row={id_ins_fl:123,...initial};
  let tail=Promise.resolve(), commits=0, rollbacks=0, updates=0;
  const connFactory=async()=>{
    let unlock,started=false,snapshot=null;
    return {
      beginTransaction:async()=>{started=true;},
      query:async(sql,params)=>{
        if (/SELECT f\.\*/.test(sql)) {
          if (/FOR UPDATE/.test(sql)) {
            const before=tail;
            tail=new Promise(resolve=>{unlock=resolve;});
            await before;
            snapshot={...row};
          }
          return [[{...row}]];
        }
        if (/UPDATE ins_fl/.test(sql)) {
          updates++;
          const fields=[...sql.matchAll(/`(\w+)` = \?/g)].map(m=>m[1]);
          fields.forEach((f,i)=>{row[f]=params[i];});
          return [{affectedRows:1}];
        }
        throw new Error('SQL no previsto por mock de transaccion');
      },
      commit:async()=>{assert.ok(started);commits++;if(unlock)unlock();unlock=null;},
      rollback:async()=>{
        assert.ok(started);rollbacks++;
        if(snapshot){for(const k of Object.keys(row))delete row[k];Object.assign(row,snapshot);}
        if(unlock)unlock();unlock=null;
      },
      release:()=>{}
    };
  };
  mockDb.getConnection=connFactory;
  return {row,stats:()=>({commits,rollbacks,updates})};
}

const req={originalUrl:'/api/instalaciones/administracion/registros/123/grupos/seguimiento?private=1'};

test('auditoria valida before/after por campo y utiliza la MISMA conexion',async()=>{
  interactionCalls=[];mockAuditResult={id_interaccion:55};
  const executor={identity:'conexion-bloqueada'};
  const result=await audit.recordGroupUpdate_cor(req,{
    id_ins_fl:123,group:'seguimiento',executor,
    before:{id_ins_fl:123,id_proyecto:'P-1',comentarios_fl:'Antes',avance_oc:'10%',secreto:'no'},
    after:{id_ins_fl:123,id_proyecto:'P-1',comentarios_fl:'Despues',avance_oc:'20%',secreto:'no'},
    changes:{comentarios_fl:'Despues',avance_oc:'20%'}
  });
  assert.equal(result.id_interaccion,55);
  assert.equal(interactionCalls.length,1);
  const saved=interactionCalls[0];
  assert.strictEqual(saved.opts.executor,executor);
  assert.equal(saved.data.tipo_interaccion,'AUDITAR_CAMBIO');
  assert.equal(saved.data.endpoint,'/api/instalaciones/administracion/registros/123/grupos/seguimiento');
  assert.deepEqual(saved.data.detalle_json.audit.before,{comentarios_fl:'Antes',avance_oc:'10%'});
  assert.deepEqual(saved.data.detalle_json.audit.after,{comentarios_fl:'Despues',avance_oc:'20%'});
  assert.equal('secreto' in saved.data.detalle_json.audit.before,false);
});

test('auditoria demasiado grande RECHAZA y nunca se guarda sin before/after',async()=>{
  interactionCalls=[];mockAuditResult={id_interaccion:99};
  const huge='á'.repeat(34000);
  await assert.rejects(()=>audit.recordGroupUpdate_cor(req,{
    group:'seguimiento',id_ins_fl:123,executor:{},
    before:{id_ins_fl:123,comentarios_fl:huge},
    after:{id_ins_fl:123,comentarios_fl:huge+'+'},
    changes:{comentarios_fl:huge+'+'}
  }),{statusCode:413,code:'INSTALACIONES_ADMINISTRACION_AUDITORIA_EXCEDE_LIMITE'});
  assert.equal(interactionCalls.length,0);
});

test('auditoria rechaza INSERT sin PK confirmada',async()=>{
  interactionCalls=[];mockAuditResult={id_interaccion:0};
  await assert.rejects(()=>audit.recordGroupUpdate_cor(req,{
    group:'seguimiento',id_ins_fl:123,executor:{},
    before:{id_ins_fl:123,comentarios_fl:'A'},
    after:{id_ins_fl:123,comentarios_fl:'B'},
    changes:{comentarios_fl:'B'}
  }),{statusCode:500,code:'INSTALACIONES_ADMINISTRACION_AUDITORIA_NO_CONFIRMADA'});
  assert.equal(interactionCalls.length,1);
  mockAuditResult={id_interaccion:55};
});

test('auditoria fallida revierte UPDATE en la transaccion',async()=>{
  // Ambos snapshots caben individualmente en VARCHAR/TEXT (19k caracteres),
  // pero el JSON UTF-8 conjunto supera 65535 bytes.
  const beforeText='á'.repeat(19000);
  const db=createTransactionalDb({comentarios_fl:beforeText});
  await assert.rejects(()=>repository.updateRecordById_cor({
    id:123,scope:{mode:'ALL'},changes:{comentarios_fl:beforeText+'+'},expected:{comentarios_fl:beforeText},
    beforeCommit:async ({connection,before,after,changes})=>{
      await audit.recordGroupUpdate_cor(req,{group:'seguimiento',executor:connection,before,after,changes});
    }
  }),{statusCode:413});
  assert.equal(db.stats().commits,0);
  assert.equal(db.stats().rollbacks,1);
  assert.equal(db.row.comentarios_fl,beforeText,'ROLLBACK conserva el valor anterior');
});

test('dos escritores del MISMO campo: el segundo recibe 409',async()=>{
  const db=createTransactionalDb({estatus:'Original'});
  let audits=0;
  const run=(value)=>repository.updateRecordById_cor({
    id:123,scope:{mode:'ALL'},changes:{estatus:value},expected:{estatus:'Original'},
    beforeCommit:async()=>{audits++;await new Promise(resolve=>setTimeout(resolve,8));}
  });
  const results=await Promise.allSettled([run('Cambio A'),run('Cambio B')]);
  assert.deepEqual(results.map(x=>x.status),['fulfilled','rejected']);
  assert.equal(results[1].reason.statusCode,409);
  assert.equal(db.row.estatus,'Cambio A');
  assert.equal(audits,1);
  assert.deepEqual(db.stats(),{commits:1,rollbacks:1,updates:1});
});

test('dos escritores en campos DISTINTOS no sobrescriben cambios ajenos',async()=>{
  const db=createTransactionalDb({estatus:'A',cliente:'X'});
  let audits=0;
  const call=(changes,expected)=>repository.updateRecordById_cor({
    id:123,scope:{mode:'ALL'},changes,expected,beforeCommit:async()=>{audits++;}
  });
  const done=await Promise.all([call({estatus:'B'},{estatus:'A'}),call({cliente:'Y'},{cliente:'X'})]);
  assert.equal(done.length,2);
  assert.deepEqual([db.row.estatus,db.row.cliente],['B','Y']);
  assert.equal(audits,2);
  assert.deepEqual(db.stats(),{commits:2,rollbacks:0,updates:2});
});

test('listado no proyecta/ordena por campos sin permiso',async()=>{
  const statements=[];
  mockDb.query=async(sql,args)=>{statements.push({sql,args});return [[{id_ins_fl:123,cliente:'visible'}]];};
  await repository.searchRecords_cor({scope:{mode:'ALL'},search:'acme',limit:5,visibleFields:['cliente','proyecto']});
  assert.equal(statements.length,1);
  const sql=statements[0].sql;
  assert.match(sql,/f\.`cliente` LIKE \?/);
  assert.match(sql,/COALESCE\(f\.proyecto/);
  assert.doesNotMatch(sql,/COALESCE\(f\.referencia_sitio/);
  assert.doesNotMatch(sql,/f\.`referencia_sitio`/);
  statements.length=0;
  await repository.searchRecords_cor({scope:{mode:'LIMITED',advisorIds:[]},search:'123',limit:5,visibleFields:[]});
  assert.match(statements[0].sql,/AND 1 = 0/);
  assert.match(statements[0].sql,/f\.id_ins_fl = \?/);
  assert.doesNotMatch(statements[0].sql,/f\.`cliente`/);
});

test('contrato readonly obligatorio y validacion de URL',()=>{
  assert.throws(()=>SCRIPT.parseArgs_cor(['--base-url','https://test.azurewebsites.net']),/--readonly/);
  assert.throws(()=>SCRIPT.parseArgs_cor(['--readonly','--base-url','http://externo.net']),/HTTPS/);
  assert.throws(()=>SCRIPT.parseArgs_cor(['--readonly','--base-url','https://token:pass@ejemplo.com']),/raiz de API/);
  assert.throws(()=>SCRIPT.parseArgs_cor(['--readonly','--base-url','https://backend.example/','--record-id','abc']),/entero positivo/);
  const result=SCRIPT.parseArgs_cor(['--readonly','--base-url','https://backend.example','--record-id','123']);
  assert.equal(result.recordId,123);
});

function scriptedResponse(status,body){return {status,json:async()=>body};}
function sampleContract(){
  const groups=Array.from({length:11},(_,i)=>({key:'g'+i,fields:i===0?['proyecto']:i===1?['cliente']:[],
    permissions:{can_view:i===0,can_edit:false}}));
  return {ok:true,groups,system_readonly_fields:['id_ins_fl','created_at','updated_at']};
}

test('smoke ejecuta exclusivamente GET, valida auth/permiso/scope y no imprime datos',async()=>{
  const methods=[],contract=sampleContract();
  const fetch=async(url,opts)=>{
    methods.push(opts.method);
    const pathname=new URL(url).pathname;
    if (pathname.endsWith('/contrato')&&!opts.headers.Authorization)return scriptedResponse(401,{ok:false});
    if (pathname.endsWith('/contrato'))return scriptedResponse(200,contract);
    if (pathname.endsWith('/id-invalido'))return scriptedResponse(400,{ok:false});
    if (url.includes('limit=101'))return scriptedResponse(400,{ok:false});
    if (pathname.endsWith('/registros'))return scriptedResponse(200,{ok:true,data:[{id_ins_fl:123,proyecto:'No imprimir',updated_at:'fecha'}]});
    if (pathname.endsWith('/registros/123'))return scriptedResponse(200,{ok:true,data:{id_ins_fl:123,proyecto:'No imprimir',created_at:'fecha'}});
    throw new Error('Endpoint no previsto');
  };
  const result=await SCRIPT.smoke_cor({baseUrl:'https://backend.example',recordId:123,query:''},{fetch,token:'secret'});
  assert.ok(result.checks.length>=9);
  assert.ok(result.checks.every(x=>x.ok));
  assert.ok(methods.every(method=>method==='GET'));
});

test('smoke detecta un campo restringido filtrado incorrectamente',async()=>{
  const contract=sampleContract();
  const fetch=async(url,opts)=>{
    const pathname=new URL(url).pathname;
    if (pathname.endsWith('/contrato'))return scriptedResponse(opts.headers.Authorization?200:401,opts.headers.Authorization?contract:{});
    if (pathname.endsWith('/id-invalido'))return scriptedResponse(400,{});
    if (url.includes('limit=101'))return scriptedResponse(400,{});
    if (pathname.endsWith('/registros'))return scriptedResponse(200,{ok:true,data:[{id_ins_fl:123,proyecto:'OK',cliente:'PROHIBIDO'}]});
    throw new Error('Unexpected');
  };
  await assert.rejects(()=>SCRIPT.smoke_cor({baseUrl:'https://backend.example',query:''},{fetch,token:'secret'}),/sin fuga de campos en listado/);
});

test('frontend distingue guardado confirmado de error de recarga',()=>{
  const front=read('modules/instalaciones-administracion/instalaciones-administracion_cor.js');
  assert.match(front,/const listReloaded=await search\(/);
  assert.match(front,/if\(!detailReloaded\|\|!listReloaded\)/);
  assert.match(front,/Guardado confirmado; recarga pendiente/);
  assert.match(front,/st\.detailSeq\+\+/);
  assert.doesNotMatch(front,/Consultando Aiven/);
  assert.match(front,/VERSION_COR='20261009-fix3-v001'/);
});
