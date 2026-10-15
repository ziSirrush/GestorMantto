'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const servicePath = path.join(ROOT, 'backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.service.js');
const repoPath = path.join(ROOT, 'backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.repository.js');

const calls=[];
const connection={
  async beginTransaction(){calls.push(['begin']);},
  async commit(){calls.push(['commit']);},
  async rollback(){calls.push(['rollback']);},
  release(){calls.push(['release']);}
};

const repositoryStub={
  TABLE_PAGOS_COR:'cobranza_pagos_cor',
  TABLE_FUENTE_COR:'cobranza_fuente_cor',
  async getConnection_cor(){return connection;},
  async countPagosModulo_cor(){return 0;},
  async resumenPagosModulo_cor(){return {registros:0,con_proyecto:0,sin_proyecto:0};},
  async listPagosModulo_cor(){return [];},
  async listProyectosPagos_cor(){return [];},
  async getProyectoPagoByNombre_cor(){return null;},
  async existeProyectoFuenteEnPpns_cor(){return false;},
  async lockPagoProyecto_cor(){return null;},
  async lockPagosProyecto_cor(){return [];},
  async listRelacionesPagoProyecto_cor(){return [];},
  async updatePagoProyecto_cor(){return 1;},
  async updatePagosProyecto_cor(){return 1;},
  async getPagoModulo_cor(){return null;}
};

require.cache[repoPath]={id:repoPath,filename:repoPath,loaded:true,exports:repositoryStub};
delete require.cache[servicePath];
const service=require(servicePath);
const fullScope={dominio:'CORELLIAN',acceso_dominio_completo:true};

function reset(overrides={}){
  calls.length=0;
  Object.assign(repositoryStub,{
    async getConnection_cor(){return connection;},
    async countPagosModulo_cor(){return 0;},
    async resumenPagosModulo_cor(){return {registros:0,con_proyecto:0,sin_proyecto:0};},
    async listPagosModulo_cor(){return [];},
    async listProyectosPagos_cor(){return [];},
    async getProyectoPagoByNombre_cor(){return null;},
    async existeProyectoFuenteEnPpns_cor(){return false;},
    async lockPagoProyecto_cor(){return null;},
    async lockPagosProyecto_cor(){return [];},
    async listRelacionesPagoProyecto_cor(){return [];},
    async updatePagoProyecto_cor(){return 1;},
    async updatePagosProyecto_cor(){return 1;},
    async getPagoModulo_cor(){return null;},
    ...overrides
  });
}

test('catalogo de proyectos usa Fuente agrupada por nombre de proyecto',()=>{
  const source=read('backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.repository.js');
  assert.match(source,/const TABLE_FUENTE_COR = 'cobranza_fuente_cor'/);
  assert.match(source,/FROM \$\{TABLE_FUENTE_COR\} f/);
  assert.match(source,/GROUP BY UPPER\(TRIM\(f\.proyecto\)\)/);
  assert.doesNotMatch(source,/FROM ins_fl fl/);
});

test('detalle de Pago desaparece de rutas y frontend',()=>{
  const routes=read('backend/src/modules/cobranza-cor/cobranza-cor.routes.js');
  const frontend=read('modules/cobranza-cor/cobranza-cor-pagos.js');
  assert.doesNotMatch(routes,/router\.get\('\/pagos\/:idPagoCor'/);
  assert.doesNotMatch(frontend,/Detalle del Pago/);
  assert.doesNotMatch(frontend,/openDetail/);
  assert.doesNotMatch(frontend,/ManttoRouter\.go/);
});

test('asignacion individual vive en tabla main con list de proyectos',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-pagos.js');
  assert.match(frontend,/data-ccor-pg-row-project/);
  assert.match(frontend,/data-ccor-pg-row-save/);
  assert.match(frontend,/apiGet_cor\(API_PATH\+'\/proyectos'\)/);
});

test('asignacion masiva expone seleccion y endpoint protegido',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-pagos.js');
  const routes=read('backend/src/modules/cobranza-cor/cobranza-cor.routes.js');
  assert.match(frontend,/data-ccor-pg-select-row/);
  assert.match(frontend,/data-ccor-pg-bulk-save/);
  assert.match(frontend,/\/proyecto\/masivo/);
  assert.match(routes,/router\.put\('\/pagos\/proyecto\/masivo',[^\n]*rejectViewerMutation_cor/);
});

test('asignacion masiva es transaccional y actualiza todos al mismo nombre de proyecto de Fuente',async()=>{
  reset({
    async getProyectoPagoByNombre_cor(){return {ppns:'P100',proyecto:'Proyecto Uno',cliente:'Cliente Uno'};},
    async lockPagosProyecto_cor(){return [
      {id_pago_cor:10,proyecto_relacionado:null},
      {id_pago_cor:11,proyecto_relacionado:'Proyecto Dos'}
    ];},
    async listRelacionesPagoProyecto_cor(){return [];},
    async updatePagosProyecto_cor(_cn,ids,proyecto){calls.push(['bulk-update',ids,proyecto]);return ids.length;}
  });
  const out=await service.asignarProyectoMasivo_cor({ids_pago_cor:[10,11],proyecto:'Proyecto Uno'},fullScope);
  assert.equal(out.ok,true);
  assert.equal(out.actualizados,2);
  assert.deepEqual(calls.find(x=>x[0]==='bulk-update'),['bulk-update',[10,11],'Proyecto Uno']);
  assert.ok(calls.some(x=>x[0]==='commit'));
  assert.ok(!calls.some(x=>x[0]==='rollback'));
});

test('asignacion masiva hace rollback si una Factura pertenece a otro proyecto',async()=>{
  reset({
    async getProyectoPagoByNombre_cor(){return {ppns:'P100',proyecto:'Proyecto Uno',cliente:'Cliente Uno'};},
    async lockPagosProyecto_cor(){return [
      {id_pago_cor:10,proyecto_relacionado:null},
      {id_pago_cor:11,proyecto_relacionado:null}
    ];},
    async listRelacionesPagoProyecto_cor(_cn,id){return id===11?[{id_factura_cor:5,ppns:'P999'}]:[];},
    async existeProyectoFuenteEnPpns_cor(){return false;}
  });
  await assert.rejects(
    ()=>service.asignarProyectoMasivo_cor({ids_pago_cor:[10,11],proyecto:'Proyecto Uno'},fullScope),
    error=>error.statusCode===409&&error.code==='COBRANZA_PAGOS_PROYECTO_CONFLICTO_FACTURAS'
  );
  assert.ok(calls.some(x=>x[0]==='rollback'));
  assert.ok(!calls.some(x=>x[0]==='bulk-update'));
});

test('asignacion masiva limita la operacion a 100 Pagos',async()=>{
  const ids=Array.from({length:101},(_,i)=>i+1);
  await assert.rejects(
    ()=>service.asignarProyectoMasivo_cor({ids_pago_cor:ids,proyecto:'Proyecto Uno'},fullScope),
    error=>error.statusCode===400&&error.code==='COBRANZA_PAGOS_MASIVO_LIMITE'
  );
});
