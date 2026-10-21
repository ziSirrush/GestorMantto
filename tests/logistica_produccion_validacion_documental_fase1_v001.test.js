'use strict';
// BLT NOW | 2026-10-21 | Fase 1 | CPVO (carta primera visita) + GM activa.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const repoFile=path.join(root,'backend/src/modules/logistica-produccion/logistica-produccion.repository.js');
const serviceFile=path.join(root,'backend/src/modules/logistica-produccion/logistica-produccion.service.js');
const fileText=p=>fs.readFileSync(p,'utf8');

function mockProductionLink(row){
  if(row.id_log_ops===undefined||row.id_log_ops===null||row.id_log_ops==='')return true;
  const normalize=v=>String(v??'').trim().toUpperCase();
  return Boolean(normalize(row.ppns)&&normalize(row.ppns)===normalize(row.ppns_logistica));
}
function makeRow(id,cpvo,gm,extra={}){
  return {
    id_produccion:id,id_log_ops:null,modo_registro:'MANUAL',ppns:`P${10000+id}`,proyecto:`Proyecto ${id}`,
    cpvo_count:cpvo,gm_count:gm,archivos_count:cpvo+gm,
    fecha_pvo:'2026-10-15',fecha_pvo_fl:'2026-10-16',
    ...extra
  };
}
function loadService(rows){
  const dbRows=rows||[];
  const repository={list:async()=>dbRows};
  const context={
    module:{exports:{}},exports:{},console,
    require(id){
      if(id==='./logistica-produccion.repository')return repository;
      if(id==='./logistica-produccion-integridad')return {
        assertProductionLink(row){if(!mockProductionLink(row))throw Error('PVO_PPNS_INCONSISTENTE');},
        isProductionLinkValid:mockProductionLink
      };
      if(id==='../../services/storage/azure-storage.service')return {};
      throw new Error('Dependencia no autorizada: '+id);
    }
  };
  vm.runInNewContext(fileText(serviceFile),context,{filename:serviceFile});
  return context.module.exports;
}

for(const [name,cpvo,gm,expected] of [
  ['Sin archivos',0,0,false],
  ['Solo una GM',0,1,false],
  ['Diez GM sin CPVO',0,10,false],
  ['Solo una CPVO',1,0,false],
  ['Dos CPVO sin GM',2,0,false],
  ['CPVO y GM',1,1,true],
  ['Dos CPVO y diez GM',2,10,true]
]){
  test(`La documentacion es ${expected?'completa':'incompleta'}: ${name}`,()=>{
    const service=loadService();
    const entry=service.decorate(makeRow(1,cpvo,gm));
    assert.equal(service.documentationComplete(entry),expected);
    assert.equal(entry.documentacion_completa,expected);
    const codes=entry.indicadores.map(x=>x.codigo);
    assert.equal(codes.includes('FALTAN_DOCS_PROD'),!expected);
    assert.equal(codes.includes('FALTA_ARCHIVO_PVO'),cpvo===0);
  });
}

test('Documentos en cuarentena por PPNS inconsistente nunca se consideran completos',()=>{
  const row=makeRow(8,1,1,{id_log_ops:2,ppns_logistica:'POTRO'});
  const decorated=loadService().decorate(row);
  assert.equal(decorated.integridad_bloqueada,true);
  assert.equal(decorated.documentacion_completa,false);
  assert.equal(decorated.cpvo_count,0);
  assert.equal(decorated.gm_count,0);
});

test('Conteos de activos controlan el resultado, no archivos_count total',()=>{
  const service=loadService();
  const row=makeRow(1,1,0,{archivos_count:7});
  assert.equal(service.decorate(row).documentacion_completa,false);
  assert.equal(service.decorate(makeRow(2,1,1,{archivos_count:2})).documentacion_completa,true);
});

test('Los endpoints /documentos/faltantes y / listan el mismo criterio',async()=>{
  const rows=[makeRow(1,0,0),makeRow(2,0,1),makeRow(3,1,0),makeRow(4,1,1),makeRow(5,2,0),makeRow(6,1,1,{id_log_ops:8,ppns_logistica:'POTRO'})];
  const service=loadService(rows);
  const missing=await service.documents({},true);
  assert.deepEqual(Array.from(missing.data,r=>r.id_produccion),[1,2,3,5]);
  assert.equal(missing.regla,'CPVO_MAS_GM_ACTIVOS');
  const listed=await service.list({});
  assert.equal(listed.reglas.documentos,'CPVO_MAS_GM_ACTIVOS');
  assert.equal(listed.data.find(r=>r.id_produccion===4).documentacion_completa,true);
});

test('PVO exige Fecha PVO y CPVO + GM; fecha de visita historica es opcional',async()=>{
  const rows=[
    makeRow(1,1,1),
    makeRow(2,1,0),
    makeRow(3,0,1),
    makeRow(4,1,1,{fecha_pvo:null}),
    makeRow(5,1,1,{fecha_pvo_fl:null}),
    makeRow(6,2,1,{id_log_ops:8,ppns_logistica:'POTRO'})
  ];
  const service=loadService(rows);
  const complete=await service.pvo({},false);
  const missing=await service.pvo({},true);
  assert.deepEqual(Array.from(complete.data,r=>r.id_produccion),[1,5]);
  assert.deepEqual(Array.from(missing.data,r=>r.id_produccion),[2,3,4]);
});

test('Filtro SQL sin_documentos exige ambos tipos, conserva solo archivos activos',async()=>{
  const queries=[];
  const context={
    module:{exports:{}},exports:{},console,
    require(id){
      if(id==='../../config/db')return {query:async(sql,params)=>{queries.push({sql,params});return [[]];}};
      if(id==='./logistica-produccion-integridad')return {assertSamePpns(){}};
      throw new Error('Dependencia no autorizada: '+id);
    }
  };
  vm.runInNewContext(fileText(repoFile),context,{filename:repoFile});
  const repo=context.module.exports;
  await repo.list({vista:'sin_documentos'});
  await repo.list({sin_documentos:'1'});
  assert.equal(queries.length,2);
  for(const {sql} of queries){
    assert.match(sql,/COALESCE\(a\.cpvo_count,0\)=0 OR COALESCE\(a\.gm_count,0\)=0/);
    assert.match(sql,/WHERE activo=1/);
    assert.doesNotMatch(sql,/where\.push\('COALESCE\(a\.archivos_count,0\)=0'\)/);
  }
});

test('Se conservan limites de los slots y tipos CPVO y GM',()=>{
  const service=loadService();
  assert.equal(service.fileSlot('cpvo',2).type,'CPVO');
  assert.equal(service.fileSlot('gm',10).slot,10);
  assert.throws(()=>service.fileSlot('CPVO',3),/Slot de archivo inválido/);
  assert.throws(()=>service.fileSlot('GM',11),/Slot de archivo inválido/);
});

test('Se conservan los indicadores historicos y fechas sin fuente',()=>{
  const service=loadService();
  const row=makeRow(3,0,0,{ppns:'',fechas_pvo_fl_fuente:'2026-01-02, 2026-02-03'});
  const entry=service.decorate(row);
  assert.deepEqual(Array.from(entry.indicadores,x=>x.codigo),['FALTA_ARCHIVO_PVO','FALTA_PPNS','FALTAN_DOCS_PROD']);
  assert.equal(entry.fuente_operativa,'SNAPSHOT_HISTORICO');
  assert.equal(entry.fecha_visita_fuente,null);
});
