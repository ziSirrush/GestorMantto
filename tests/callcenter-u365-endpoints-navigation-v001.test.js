'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const front=fs.readFileSync(path.join(root,'modules/callcenter/callcenter.js'),'utf8');
const html=fs.readFileSync(path.join(root,'modules/callcenter/callcenter.html'),'utf8');
const routes=fs.readFileSync(path.join(root,'backend/src/modules/dashboard-callcenter/dashboard-callcenter.routes.js'),'utf8');
const controller=fs.readFileSync(path.join(root,'backend/src/modules/dashboard-callcenter/dashboard-callcenter.controller.js'),'utf8');
const service=fs.readFileSync(path.join(root,'backend/src/modules/dashboard-callcenter/dashboard-callcenter.service.js'),'utf8');
const repository=fs.readFileSync(path.join(root,'backend/src/modules/dashboard-callcenter/dashboard-callcenter.repository.js'),'utf8');
const router=fs.readFileSync(path.join(root,'core/router.js'),'utf8');

test('U365 usa endpoints del modulo Dashboard Call Center',()=>{
  assert.match(front,/\/api\/operacion\/dashboard-call-center\/u365\/proyectos/);
  assert.match(front,/\/api\/operacion\/dashboard-call-center\/u365\/equipos/);
  assert.doesNotMatch(front,/\/api\/callcenter\/u365\/proyectos/);
  assert.doesNotMatch(front,/\/api\/callcenter\/u365\/equipos/);
});

test('U365 pagina bajo demanda sin depender del helper eliminado de MTBC',()=>{
  assert.match(front,/async function fetchU365Pages\(path\)/);
  assert.match(front,/page_size=100/);
  assert.doesNotMatch(front,/fetchMtbcPages\(/);
});

test('backend expone ambos endpoints U365 con permisos especificos',()=>{
  assert.match(routes,/\/operacion\/dashboard-call-center\/u365\/equipos/);
  assert.match(routes,/\/operacion\/dashboard-call-center\/u365\/proyectos/);
  assert.match(routes,/OPERACION_DASHBOARD_CALL_CENTER_U365D_LLAMADAS_U365D_EQUIPO\.VER/);
  assert.match(routes,/OPERACION_DASHBOARD_CALL_CENTER_U365D_LLAMADAS_U365D_PROYECTO\.VER/);
  assert.match(controller,/getU365Equipos/);
  assert.match(controller,/getU365Proyectos/);
  assert.match(service,/getCallCenterU365Equipos/);
  assert.match(service,/getCallCenterU365Proyectos/);
  assert.match(repository,/getCallCenterU365Equipos/);
  assert.match(repository,/getCallCenterU365Proyectos/);
});

test('U365 conserva alcance United en la consulta',()=>{
  assert.match(repository,/buildPortafolioScopeSql_gnral\(req, 'p'\)/);
  assert.match(service,/hasUnrestrictedUnitedScope_gnral\(req\)/);
  assert.match(service,/zoneIds_gnral\(req\)/);
});

test('subvistas U365 regresan por el historial real y usan Dashboard solo como fallback directo',()=>{
  assert.match(html,/id="cc-u365-proy-back"/);
  assert.match(html,/id="cc-u365-eq-back"/);
  assert.match(front,/returnToCallCenterOrigin/);
  assert.match(front,/ManttoRouter\.back/);
  assert.match(front,/fallbackRoute:'callcenter'/);
  assert.match(front,/fallbackPayload:\{view:'dashboard'\}/);
  assert.doesNotMatch(front,/ManttoRouter\.go\('callcenter',\{view:'dashboard'\}\)/);
});

test('router serializa y restaura la subvista U365',()=>{
  assert.match(router,/route === 'callcenter' && parts\[1\]/);
  assert.match(router,/payload:\{ view:parts\[1\] \}/);
  assert.match(router,/route === 'callcenter' && payload && payload\.view/);
  assert.match(router,/data\.view === 'u365-proyectos' \|\| data\.view === 'u365-equipos'/);
});
