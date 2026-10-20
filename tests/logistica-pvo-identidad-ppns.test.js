'use strict';
// [Aster | 2026-10-20 | ASTER-MG | QA PVO PPNS V001]
// Prueba unitaria sin acceso ni escritura a Aiven/Azure.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const loc = (p) => path.join(root, p);
const helperPath = loc('backend/src/modules/logistica-produccion/logistica-produccion-integridad.js');
const repoPath = loc('backend/src/modules/logistica-produccion/logistica-produccion.repository.js');
const servicePath = loc('backend/src/modules/logistica-produccion/logistica-produccion.service.js');
const syncPath = loc('backend/src/modules/logistica-produccion/logistica-produccion-sync.service.js');
const controllerPath = loc('backend/src/controllers/logistica.controller.js');
const dbPath = loc('backend/src/config/db.js');
const storagePath = loc('backend/src/services/storage/azure-storage.service.js');
const integrity = require(helperPath);

function loadWithMocks(modulePath, mocks) {
  const saved = new Map();
  for (const [p, value] of Object.entries(mocks)) {
    saved.set(p, require.cache[p]);
    require.cache[p] = { id:p, filename:p, loaded:true, exports:value };
  }
  const old = require.cache[modulePath];
  delete require.cache[modulePath];
  try { return require(modulePath); }
  finally {
    delete require.cache[modulePath];
    if (old) require.cache[modulePath] = old;
    for (const [p, value] of saved) {
      if (value) require.cache[p] = value;
      else delete require.cache[p];
    }
  }
}

const correct = {
  id_produccion:4, id_log_ops:14, ppns:'P15439', ppns_logistica:'P15439',
  proyecto_logistica:'Plaza Punto Norte', proyecto:null,
  modo_registro:'MANUAL', anio_registro:2026, semana_registro:42,
  cpvo_count:1, gm_count:1, archivos_count:2,
  fecha_pvo:null,fecha_pvo_fl:null,fecha_cubos:null,
  asesores:'JD', supervisores:'AA'
};
const mixed = {
  ...correct,
  id_produccion:5, ppns_logistica:'P15288', proyecto_logistica:'Walmart SC Buenavista'
};

test('normalizacion estricta PPNS y ausencia de FL no bloquea proyectos sanos', () => {
  assert.equal(integrity.samePpns(' p15439 ', 'P15439'), true);
  assert.equal(integrity.samePpns('', ''), false);
  assert.equal(integrity.isProductionLinkValid({id_log_ops:null, ppns:'P15439'}), true);
  assert.equal(integrity.isProductionLinkValid(correct), true);
  assert.equal(integrity.isProductionLinkValid(mixed), false);
  assert.throws(() => integrity.assertProductionLink(mixed), (e) => e.status === 409 && e.code === 'PVO_PPNS_INCONSISTENTE');
});

test('el servicio no mezcla datos ni revela documentos cuando hay PPNS distintos', async () => {
  let reads = 0;
  const mockedRepo = {
    list:async()=>[correct,mixed],
    byId:async(id)=>Number(id)===5?mixed:correct,
    files:async()=>{reads++;return [{id_archivo:1}];}
  };
  const service=loadWithMocks(servicePath, {[repoPath]:mockedRepo,[storagePath]:{}});
  const listing = await service.list({});
  assert.equal(listing.data.length,2);
  assert.equal(listing.data[0].proyecto,'Plaza Punto Norte');
  assert.equal(listing.data[1].integridad_bloqueada,true);
  assert.doesNotMatch(JSON.stringify(listing.data[1]), /Walmart|Buenavista|P15288/);
  await assert.rejects(service.detail(5), (e)=>e.status === 409);
  await assert.rejects(service.listFiles(5), (e)=>e.status === 409);
  const documents = await service.documents({});
  assert.equal(documents.data.length,1);
  const pvo = await service.pvo({});
  assert.equal(pvo.data.length,0);
  assert.equal(reads,1); // solo se consultan archivos del registro sano
});

test('repository por PPNS excluye relaciones cruzadas de Instalaciones', async () => {
  const statements=[];
  const repo=loadWithMocks(repoPath,{[dbPath]:{query:async (sql)=>{statements.push(sql);return [[]];}}});
  await repo.byPpnsExact('P15439');
  const sql=statements[0];
  assert.match(sql,/TRIM\(ip\.id_proyecto\)=TRIM\(\?\)/);
  assert.match(sql,/TRIM\(p\.ppns\)=TRIM\(l\.id_ppns\)/);
  assert.match(sql,/p\.id_log_ops IS NULL OR/);
});

test('creacion PVO bloquea PPNS contradictorio incluso dentro de la transaccion', async () => {
  let writes=0,rollbacks=0;
  const conn={
    beginTransaction:async()=>{},rollback:async()=>{rollbacks++;},commit:async()=>{},release:()=>{},
    query:async(sql)=>{
      if (/INSERT INTO logistica_produccion/.test(sql)) {writes++;return [{insertId:10}];}
      if (/FROM log_ops l/.test(sql)) return [[{id_log_ops:14,id_ppns:'P15288'}]];
      return [[]];
    }
  };
  const repo=loadWithMocks(repoPath,{[dbPath]:{getConnection:async()=>conn}});
  await assert.rejects(repo.create({id_log_ops:14,ppns:'P15439',modo_registro:'MANUAL'},1),e=>e.status===409);
  assert.equal(writes,0);
  assert.equal(rollbacks,1);
});

test('sincronizacion log_ops rechaza reuso del mismo id con PPNS ajeno a PVO',async()=>{
  let updated=false;
  const conn={
    beginTransaction:async()=>{},rollback:async()=>{},commit:async()=>{},release:()=>{},
    query:async(sql)=>{
      if (/SELECT id_log_ops,/.test(sql)) return [[{id_log_ops:14,id_ppns:'P15439',estatus:'ENTREGADO',proyecto:'Original'}]];
      if (/SELECT id_produccion,ppns FROM logistica_produccion/.test(sql)) return [[{id_produccion:5,ppns:'P15439'}]];
      if (/UPDATE log_ops/.test(sql)) updated=true;
      return [[]];
    }
  };
  const controller=loadWithMocks(controllerPath,{[dbPath]:{getConnection:async()=>conn}});
  let result;
  const res={json:(x)=>{result=x;return x;},status:()=>res};
  await controller.syncLogOps({body:{rows:[{id_log_ops:14,id_ppns:'P15288',estatus:'ENTREGADO',proyecto:'Otro'}]}},res);
  assert.equal(result.rejected,1);
  assert.equal(result.updated,0);
  assert.equal(updated,false);
  assert.match(result.errors[0].message,/PPNS/);
});

test('importacion PVO rechaza un PPNS distinto de log_ops sin crear filas', async () => {
  let inserts=0;
  const conn={
    beginTransaction:async()=>{},rollback:async()=>{},commit:async()=>{},release:()=>{},
    query:async(sql)=>{
      if (/SELECT id_ppns FROM log_ops/.test(sql))return [[{id_ppns:'P15288'}]];
      if (/INSERT INTO logistica_produccion/.test(sql)) inserts++;
      return [[]];
    }
  };
  const synchronizer=loadWithMocks(syncPath,{[dbPath]:{getConnection:async()=>conn}});
  const result=await synchronizer.sync({produccion:[{id_produccion:23,id_log_ops:14,ppns:'P15439',legacy_source_key:'hoja-23',modo_registro:'MANUAL',semana_registro:42,anio_registro:2026}],archivos:[]});
  assert.equal(result.produccion.rechazados,1);
  assert.equal(inserts,0);
});

test('edicion manual no permite mover documentos/fechas a otro proyecto', async () => {
  const service=loadWithMocks(servicePath, {[repoPath]:{byId:async()=>correct},[storagePath]:{}});
  await assert.rejects(
    service.update(4,{id_log_ops:99},{id_SB:1}),
    (e)=>e.status===409 && e.code==='PVO_PROYECTO_INMUTABLE'
  );
});

test('repository bloquea cambio de id_log_ops aun si el nuevo PPNS fuera valido',async()=>{
  let writes=0;
  const conn={
    beginTransaction:async()=>{},rollback:async()=>{},commit:async()=>{},release:()=>{},
    query:async(sql)=>{
      if(/SELECT id_produccion,id_log_ops,id_estatus_produccion/.test(sql))
        return [[{id_produccion:4,id_log_ops:14,id_estatus_produccion:null}]];
      if(/UPDATE logistica_produccion/.test(sql)) writes++;
      return [[]];
    }
  };
  const repo=loadWithMocks(repoPath,{[dbPath]:{getConnection:async()=>conn}});
  await assert.rejects(repo.update(4,{id_log_ops:22,ppns:'P200'},1), e=>e.status===409);
  assert.equal(writes,0);
});

test('importacion idempotente protege el PPNS de un registro ya existente',async()=>{
  let updates=0;
  const conn={
    beginTransaction:async()=>{},rollback:async()=>{},commit:async()=>{},release:()=>{},
    query:async(sql)=>{
      if(/SELECT id_ppns FROM log_ops/.test(sql))return [[{id_ppns:'P15439'}]];
      if(/SELECT id_produccion,legacy_source_key,id_log_ops,ppns/.test(sql))
        return [[{id_produccion:23,legacy_source_key:'hoja-23',id_log_ops:14,ppns:'P15288'}]];
      if(/UPDATE logistica_produccion/.test(sql))updates++;
      return [[]];
    }
  };
  const synchronizer=loadWithMocks(syncPath,{[dbPath]:{getConnection:async()=>conn}});
  const result=await synchronizer.sync({produccion:[{id_produccion:23,id_log_ops:14,ppns:'P15439',legacy_source_key:'hoja-23',semana_registro:42,anio_registro:2026}],archivos:[]});
  assert.equal(result.produccion.rechazados,1);
  assert.equal(updates,0);
});

test('consulta de archivos valida el mismo PPNS contra log_ops',async()=>{
  const queries=[];
  const repo=loadWithMocks(repoPath,{[dbPath]:{query:async(sql)=>{queries.push(sql);return [[]];}}});
  await repo.files(4);
  await repo.fileById(4,22);
  for(const sql of queries){
    assert.match(sql,/logistica_produccion p/);
    assert.match(sql,/TRIM\(p\.ppns\)=TRIM\(l\.id_ppns\)/);
  }
});

test('sincronizacion permite cambios de otros campos cuando PPNS permanece igual',async()=>{
  let updated=false;
  const conn={
    beginTransaction:async()=>{},rollback:async()=>{},commit:async()=>{},release:()=>{},
    query:async(sql)=>{
      if(/SELECT id_log_ops,/.test(sql))return [[{id_log_ops:14,id_ppns:'P15439',estatus:'PENDIENTE',proyecto:'Plaza Punto Norte'}]];
      if(/SELECT id_produccion,ppns FROM logistica_produccion/.test(sql))return [[{id_produccion:5,ppns:'P15439'}]];
      if(/UPDATE log_ops/.test(sql)){updated=true;return [{affectedRows:1}];}
      return [[]];
    }
  };
  const controller=loadWithMocks(controllerPath,{[dbPath]:{getConnection:async()=>conn}});
  let result;
  const res={json:(x)=>{result=x;return x;},status:()=>res};
  await controller.syncLogOps({body:{rows:[{id_log_ops:14,id_ppns:'P15439',estatus:'ENTREGADO',proyecto:'Plaza Punto Norte'}]}},res);
  assert.equal(result.rejected,0);
  assert.equal(result.updated,1);
  assert.equal(updated,true);
});
