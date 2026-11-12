'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');

function read(file){return fs.readFileSync(path.join(ROOT,file),'utf8');}

test('F5: Proyectos reconecta sin F5 y serializa una sola sincronizacion',()=>{
  const src=read('modules/instalaciones-proyectos/instalaciones-proyectos.js');
  assert.match(src,/let PY_SYNC_IN_FLIGHT=null/);
  assert.match(src,/async function pySynchronizeLive\(/);
  assert.match(src,/if\(PY_SYNC_IN_FLIGHT\)return PY_SYNC_IN_FLIGHT/);
  assert.match(src,/window\.addEventListener\('online',pyScheduleReconnectSync\)/);
  assert.match(src,/pyReconnectDelayMs\(\)/);
  assert.doesNotMatch(src,/location\.(?:reload|replace)\(/);
});

test('F5: reconexion de Proyectos conserva filtros y pagina antes de renderizar',()=>{
  const src=read('modules/instalaciones-proyectos/instalaciones-proyectos.js');
  const start=src.indexOf("async function pySynchronizeLive");
  const end=src.indexOf("function pyScheduleReconnectSync",start);
  assert.ok(start>=0&&end>start);
  const block=src.slice(start,end);
  assert.match(block,/filterState=/);
  assert.match(block,/PY_PROYECTOS_PAGE=Math\.max\(1,filterState\.page\|\|1\)/);
  assert.match(block,/restore\('py-f-supervisor',filterState\.supervisor\)/);
  assert.match(block,/pyRenderProyectos\(\)/);
});

test('F5: Altas confirma borrador antes de revalidar autorizacion al reconectar',()=>{
  const src=read('modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js');
  const start=src.indexOf('function reconnectAuthorization()');
  const end=src.indexOf('function watch()',start);
  assert.ok(start>=0&&end>start);
  const block=src.slice(start,end);
  assert.ok(block.indexOf('await persistDraftImmediately()')<block.indexOf('await refreshAuthorization()'));
  assert.doesNotMatch(block,/saveBatch\(/);
  assert.match(src,/window\.addEventListener\('online',\(\)=>\{void reconnectAuthorization\(\);\}\)/);
});

test('F6 QA: continuidad previa sigue protegida despues de integrar main',()=>{
  const update=read('core/app-update.js');
  const projects=read('modules/instalaciones-proyectos/instalaciones-proyectos.js');
  assert.match(update,/await flushBeforeReload\(\)/);
  assert.match(projects,/navigator\.locks\?\.request/);
  assert.match(projects,/bltnow-instalaciones-proyectos-delta/);
  assert.match(projects,/scope_signature/);
});


test('F6 QA: sync combinado conserva Montadores y endpoints incrementales',()=>{
  const routes=read('backend/src/routes/ins-fl.routes.js');
  assert.match(routes,/ejecutarSyncConMontadores/);
  assert.match(routes,/ejecutarSyncConAjustadores/);
  assert.match(routes,/router\.get\('\/cache-state'/);
  assert.match(routes,/router\.get\('\/changes'/);
  assert.match(routes,/protectManualAltasCor/);
});
