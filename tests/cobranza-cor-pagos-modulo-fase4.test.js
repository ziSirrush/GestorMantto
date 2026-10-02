'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const repoPath = path.join(ROOT, 'backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.repository.js');
const servicePath = path.join(ROOT, 'backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.service.js');

const calls = [];
const connection = {
  async beginTransaction(){ calls.push(['begin']); },
  async commit(){ calls.push(['commit']); },
  async rollback(){ calls.push(['rollback']); },
  release(){ calls.push(['release']); }
};

const repositoryStub = {
  TABLE_PAGOS_COR: 'cobranza_pagos_cor',
  async getConnection_cor(){ calls.push(['connection']); return connection; },
  async countPagosModulo_cor(){ return 0; },
  async resumenPagosModulo_cor(){ return {registros:0,con_proyecto:0,sin_proyecto:0}; },
  async listPagosModulo_cor(){ return []; },
  async getPagoModulo_cor(){ return null; },
  async listProyectosPagos_cor(){ return []; },
  async getProyectoPagoByPpns_cor(){ return null; },
  async lockPagoProyecto_cor(){ return null; },
  async listRelacionesPagoProyecto_cor(){ return []; },
  async updatePagoProyecto_cor(){ return 1; }
};

require.cache[repoPath] = { id: repoPath, filename: repoPath, loaded: true, exports: repositoryStub };
delete require.cache[servicePath];
const service = require(servicePath);
const fullScope = { dominio:'CORELLIAN', acceso_dominio_completo:true };

function reset(overrides={}){
  calls.length = 0;
  Object.assign(repositoryStub, {
    async getConnection_cor(){ calls.push(['connection']); return connection; },
    async countPagosModulo_cor(){ return 0; },
    async resumenPagosModulo_cor(){ return {registros:0,con_proyecto:0,sin_proyecto:0}; },
    async listPagosModulo_cor(){ return []; },
    async getPagoModulo_cor(){ return null; },
    async listProyectosPagos_cor(){ return []; },
    async getProyectoPagoByPpns_cor(){ return null; },
    async lockPagoProyecto_cor(){ return null; },
    async listRelacionesPagoProyecto_cor(){ return []; },
    async updatePagoProyecto_cor(){ calls.push(['update', ...arguments]); return 1; },
    ...overrides
  });
}

test('serializa relacion PPNS sin cambiar datos de origen', () => {
  const out = service.serializePagoModulo_cor({
    id_pago_cor: 55,
    no_factura:'CFV-1',
    id_pp:'IGNORADO',
    ppns_relacionado:'P100',
    proyecto_relacionado:'Proyecto Uno',
    cliente_relacionado:'Cliente Uno',
    proyecto:'Proyecto origen'
  });
  assert.equal(out.id_pago_cor,55);
  assert.equal(out.ppns_relacionado,'P100');
  assert.equal(out.proyecto_relacionado,'Proyecto Uno');
  assert.equal(out.proyecto,'Proyecto origen');
  assert.equal(out.relacionado_proyecto,true);
});

test('asigna proyecto valido y conserva coherencia con Facturas relacionadas', async () => {
  reset({
    async lockPagoProyecto_cor(){ return {id_pago_cor:55,ppns_relacionado:null}; },
    async getProyectoPagoByPpns_cor(){ return {ppns:'P100',proyecto:'Proyecto Uno',cliente:'Cliente'}; },
    async listRelacionesPagoProyecto_cor(){ return [{id_factura_cor:1,ppns:'P100'}]; },
    async updatePagoProyecto_cor(_cn,id,ppns){ calls.push(['update',id,ppns]); return 1; },
    async getPagoModulo_cor(){ return {id_pago_cor:55,ppns_relacionado:'P100',proyecto_relacionado:'Proyecto Uno'}; }
  });
  const out = await service.asignarProyecto_cor(55,{ppns:'p100'},fullScope);
  assert.equal(out.ok,true);
  assert.equal(out.action,'ASIGNADO');
  assert.equal(out.pago.ppns_relacionado,'P100');
  assert.deepEqual(calls.filter(x=>x[0]==='update'),[['update',55,'P100']]);
  assert.ok(calls.some(x=>x[0]==='commit'));
  assert.ok(!calls.some(x=>x[0]==='rollback'));
});

test('rechaza cambiar a proyecto distinto de Facturas ya relacionadas', async () => {
  reset({
    async lockPagoProyecto_cor(){ return {id_pago_cor:55,ppns_relacionado:'P100'}; },
    async getProyectoPagoByPpns_cor(){ return {ppns:'P200',proyecto:'Proyecto Dos',cliente:'Cliente'}; },
    async listRelacionesPagoProyecto_cor(){ return [{id_factura_cor:1,ppns:'P100'}]; }
  });
  await assert.rejects(
    () => service.asignarProyecto_cor(55,{ppns:'P200'},fullScope),
    error => error.statusCode===409 && error.code==='COBRANZA_PAGOS_PROYECTO_CONFLICTO_FACTURAS'
  );
  assert.ok(calls.some(x=>x[0]==='rollback'));
});

test('rechaza proyecto inexistente o inactivo', async () => {
  reset({
    async lockPagoProyecto_cor(){ return {id_pago_cor:55,ppns_relacionado:null}; },
    async getProyectoPagoByPpns_cor(){ return null; }
  });
  await assert.rejects(
    () => service.asignarProyecto_cor(55,{ppns:'P999'},fullScope),
    error => error.statusCode===404 && error.code==='COBRANZA_PAGOS_PROYECTO_NO_ENCONTRADO'
  );
});

test('no permite quitar proyecto si existen relaciones con Facturas', async () => {
  reset({
    async lockPagoProyecto_cor(){ return {id_pago_cor:55,ppns_relacionado:'P100'}; },
    async listRelacionesPagoProyecto_cor(){ return [{id_factura_cor:1,ppns:'P100'}]; }
  });
  await assert.rejects(
    () => service.quitarProyecto_cor(55,fullScope),
    error => error.statusCode===409 && error.code==='COBRANZA_PAGOS_PROYECTO_CON_FACTURAS'
  );
  assert.ok(calls.some(x=>x[0]==='rollback'));
});

test('quita proyecto cuando Pago no tiene Facturas relacionadas', async () => {
  reset({
    async lockPagoProyecto_cor(){ return {id_pago_cor:55,ppns_relacionado:'P100'}; },
    async listRelacionesPagoProyecto_cor(){ return []; },
    async updatePagoProyecto_cor(_cn,id,ppns){ calls.push(['update',id,ppns]); return 1; },
    async getPagoModulo_cor(){ return {id_pago_cor:55,ppns_relacionado:null}; }
  });
  const out=await service.quitarProyecto_cor(55,fullScope);
  assert.equal(out.action,'DESASIGNADO');
  assert.deepEqual(calls.filter(x=>x[0]==='update'),[['update',55,null]]);
  assert.ok(calls.some(x=>x[0]==='commit'));
});

test('catalogo de proyectos permanece bajo alcance completo', async () => {
  reset({async listProyectosPagos_cor(){return [{ppns:'P100',proyecto:'Proyecto Uno',cliente:'Cliente'}];}});
  const out=await service.listarProyectos_cor({q:'P100'},fullScope);
  assert.equal(out.data.length,1);
  await assert.rejects(
    () => service.listarProyectos_cor({}, {dominio:'CORELLIAN',acceso_dominio_completo:false}),
    error => error.statusCode===403
  );
});

test('rutas de mutacion usan viewer guard y catalogo va antes del parametro dinamico', () => {
  const routes=fs.readFileSync(path.join(ROOT,'backend/src/modules/cobranza-cor/cobranza-cor.routes.js'),'utf8');
  const projectsIndex=routes.indexOf("router.get('/pagos/proyectos'");
  const detailIndex=routes.indexOf("router.get('/pagos/:idPagoCor'");
  assert.ok(projectsIndex>=0 && detailIndex>projectsIndex);
  assert.match(routes,/router\.put\('\/pagos\/:idPagoCor\/proyecto',[^\n]*rejectViewerMutation_cor/);
  assert.match(routes,/router\.delete\('\/pagos\/:idPagoCor\/proyecto',[^\n]*rejectViewerMutation_cor/);
});

test('frontend edita relacion dentro de pantalla y no usa modal/ventana flotante', () => {
  const source=fs.readFileSync(path.join(ROOT,'modules/cobranza-cor/cobranza-cor-pagos.js'),'utf8');
  assert.match(source,/data-ccor-pg-project-edit/);
  assert.match(source,/data-ccor-pg-project-save/);
  assert.match(source,/data-ccor-pg-unlink-confirm/);
  assert.doesNotMatch(source,/window\.open\s*\(/);
  assert.doesNotMatch(source,/window\.confirm\s*\(/);
  assert.doesNotMatch(source,/<dialog/i);
});

test('repositorio usa id_pp existente y no altera esquema', () => {
  const source=fs.readFileSync(repoPath,'utf8');
  assert.match(source,/SET id_pp = \?/);
  assert.match(source,/NULLIF\(TRIM\(p\.id_pp\)/);
  assert.doesNotMatch(source,/ALTER\s+TABLE/i);
  assert.doesNotMatch(source,/CREATE\s+TABLE/i);
});
