'use strict';

// Pruebas aisladas de Node; SIN conexiones a Aiven/Azure y SIN escrituras.
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const sqlCalls = [];
let hasMotivo = true;
let rowsReturn = [];
const db = {
  async query(sql, params = []) {
    sqlCalls.push({ sql, params });
    if (/\b(?:UPDATE|INSERT|DELETE|DROP|ALTER|CREATE)\b/i.test(sql)) {
      throw new Error('Se intento una operacion distinta a SELECT');
    }
    if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
      const results = [];
      for (const [table, names] of Object.entries(repo.REQUIRED_COLUMNS)) {
        for (const col of names) {
          if (col === 'custeventblt_mot_det' && !hasMotivo) continue;
          results.push({ TABLE_NAME: table, COLUMN_NAME: col });
        }
      }
      return [results];
    }
    if (/SELECT\s+COUNT\(\*\)/i.test(sql)) return [[{ total: 2 }]];
    return [rowsReturn];
  }
};

const builder = {
  buildPortafolioScopeSql_gnral(req, alias) {
    assert.equal(alias, 'p');
    return req.mockPortScope || { sql: 'p.zona_id IN (?)', params: [8] };
  },
  buildTicketScopeSql_gnral(req, alias) {
    assert.equal(alias, 't');
    return req.mockTicketScope || {
      sql: `(
        EXISTS (SELECT 1 FROM portafolio p_scope_uni_ticket_equipo WHERE p_scope_uni_ticket_equipo.zona_id IN (?))
        OR EXISTS (SELECT 1 FROM portafolio p_scope_uni_ticket_project_check WHERE p_scope_uni_ticket_project_check.zona_id IS NOT NULL)
        OR EXISTS (SELECT 1 FROM portafolio p_scope_uni_ticket_project WHERE p_scope_uni_ticket_project.zona_id IN (?))
      )`,
      params: [8, 8]
    };
  }
};

const record = { routers: [] };
const express = {
  Router() {
    const router = {
      use(...middleware) { this.middleware = middleware; },
      get(url, fn) { this.routes[url] = fn; },
      routes: {}
    };
    record.routers.push(router);
    return router;
  }
};
const userAuth = (req, _res, next) => next();
const scopeGuard = (req, _res, next) => next();
const guard = { humanInformationGuard_gnral(settings) {
  record.settings = settings;
  return [userAuth, scopeGuard];
} };

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  const filename = (parent && parent.filename || '').replace(/\\/g, '/');
  if (filename.includes('src/modules/experimental-ns/')) {
    if (request === '../../config/db') return db;
    if (request === '../../services/information-record-scope-gnral.service') return builder;
    if (request === '../../middleware/information-access-gnral.middleware') return guard;
    if (request === 'express') return express;
  }
  return originalLoad.apply(this, arguments);
};
let scopes, repo, service, controller, router;
try {
  scopes = require('../src/modules/experimental-ns/experimental-ns.scope');
  repo = require('../src/modules/experimental-ns/experimental-ns.repository');
  service = require('../src/modules/experimental-ns/experimental-ns.service');
  controller = require('../src/modules/experimental-ns/experimental-ns.controller');
  router = require('../src/modules/experimental-ns/experimental-ns.routes');
} finally {
  Module._load = originalLoad;
}

function req(overrides = {}) {
  return {
    actorUser: { is_programador: true },
    informationAccess: {
      dominio: 'UNITED',
      motor: 'alcance_uni',
      agrupacion: { codigo: 'EXPERIMENTAL_NS' },
      acceso_puerta: true,
      permission_code: scopes.PERMISSION_CODES[0]
    },
    query: {},
    ...overrides
  };
}

function res() {
  return {
    statusCode: 200, payload: null,
    status(n) { this.statusCode = n; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

test('F2: incluye exactamente tres rutas GET protegidas y ningun POST', () => {
  assert.equal(record.routers.length, 1);
  assert.deepEqual(Object.keys(router.routes).sort(), ['/estado', '/portafolio', '/tickets']);
  assert.deepEqual(router.middleware.slice(0, 1), [userAuth]);
  assert.equal(router.middleware.at(-1), scopeGuard);
  assert.equal(record.settings.groupingCode, 'EXPERIMENTAL_NS');
  assert.equal(record.settings.domain, 'UNITED');
  assert.deepEqual(record.settings.permissionCodesAny, scopes.PERMISSION_CODES);
});

test('F2: Programador se verifica en backend, independiente de puerta y permiso', () => {
  const middleware = router.middleware[1];
  let called = false;
  const denied = res();
  middleware(req({actorUser:{is_programador:false}}),denied,()=>{called=true});
  assert.equal(called,false);
  assert.equal(denied.statusCode,403);
  assert.equal(denied.payload.code,'EXPERIMENTAL_NS_PROGRAMMER_REQUIRED');
  middleware(req(),res(),()=>{called=true});
  assert.equal(called,true);
});

test('F2: guard estricto de agrupacion, motor, permiso y puerta', () => {
  const samples = [
    {dominio:'GENERAL'}, {motor:'alcance_cor'}, {agrupacion:{codigo:'EXPERIMENTAL'}},
    {acceso_puerta:false}, {permission_code:'PORTAFOLIO_ANY.VER'}
  ];
  for (const entry of samples) {
    const request=req();
    request.informationAccess={...request.informationAccess,...entry};
    assert.throws(()=>scopes.assertScope(request), error => error.statusCode===403);
  }
  assert.equal(scopes.assertScope(req()).motor,'alcance_uni');
});

test('F2: no permite SQL directo contra portafolio ni tickets productivos', () => {
  for (const sql of ['SELECT * FROM portafolio p','SELECT * FROM tickets t','SELECT 1 JOIN tickets t ON 1=1']) {
    assert.throws(()=>scopes.assertNoProductionTables(sql),e=>e.code==='EXPERIMENTAL_NS_ISOLATION_ERROR');
  }
  assert.doesNotThrow(()=>scopes.assertNoProductionTables('SELECT * FROM ns_portafolio_pruebas p'));
});

test('F2: replica el alcance de Tickets usando SOLO ns_portafolio_pruebas', () => {
  const result=scopes.ticketsScope(req());
  assert.equal(result.params.length,2);
  assert.equal((result.sql.match(/FROM ns_portafolio_pruebas/g)||[]).length,3);
  assert.doesNotMatch(result.sql,/\bFROM\s+portafolio\b/i);
});

test('F2: falla cerrado si cambia el SQL territorial central', () => {
  const request=req({mockTicketScope:{sql:'SELECT * FROM portafolio p',params:[]}});
  assert.throws(()=>scopes.ticketsScope(request),e=>e.statusCode===503);
});

test('F2: admite alcance maestro o fail-closed, siempre resuelto por motor central', () => {
  assert.equal(scopes.ticketsScope(req({mockTicketScope:{sql:'1 = 1',params:[]}})).sql,'1 = 1');
  assert.equal(scopes.ticketsScope(req({mockTicketScope:{sql:'1 = 0',params:[]}})).sql,'1 = 0');
});

test('F2: filtros pagina/limite tienen topes, busquedas parametrizadas', () => {
  assert.deepEqual(service.filters({pagina:'2',limite:'15',equipo:' E123 '}),{
    pagina:2,limite:15,desde:15,buscar:'',equipo:'E123',proyecto:''
  });
  for(const query of [{limite:'101'},{pagina:'0'},{pagina:'1.5'},{buscar:'a\nb'},{equipo:'x'.repeat(121)}]){
    assert.throws(()=>service.filters(query),e=>e.statusCode===422);
  }
});

test('F2: preflight compara columnas existentes, incluido custeventblt_mot_det', async () => {
  hasMotivo=true;
  let state=await repo.getSchemaStatus();
  assert.equal(state.listas,true);
  hasMotivo=false;
  state=await repo.getSchemaStatus();
  assert.equal(state.listas,false);
  assert.ok(state.tablas.ns_tickets_pruebas.faltantes.includes('custeventblt_mot_det'));
  await assert.rejects(()=>repo.requireSchema(),e=>e.code==='EXPERIMENTAL_NS_SCHEMA_INCOMPLETE');
  hasMotivo=true;
});

test('F2: puerto Portafolio solo consulta ns_portafolio_pruebas y filtra zona', async () => {
  sqlCalls.length=0;
  rowsReturn=[{id_portafolio:1,numero_equipo:'E123',zona_id:8}];
  const result=await service.list(req({query:{pagina:'1',limite:'30',equipo:'E123'}}),'portafolio');
  assert.equal(result.fuente,'ns_portafolio_pruebas');
  assert.equal(result.paginacion.total,2);
  assert.equal(result.data.length,1);
  assert.equal(sqlCalls.length,3);
  assert.match(sqlCalls[1].sql,/FROM ns_portafolio_pruebas p/i);
  assert.match(sqlCalls[1].sql,/p\.zona_id IN \(\?\)/i);
  assert.deepEqual(sqlCalls[1].params,[8,'E123']);
  assert.deepEqual(sqlCalls[2].params,[8,'E123',30,0]);
  assert.doesNotMatch(sqlCalls[2].sql,/\bFROM\s+portafolio\b/i);
});

test('F2: puerto Tickets solo consulta ns_tickets_pruebas y Portafolio de laboratorio', async () => {
  sqlCalls.length=0;
  rowsReturn=[{id:1,ticket:'T-001',codigo_equipo:'E123'}];
  const result=await service.list(req({query:{buscar:'T-001'}}),'tickets');
  assert.equal(result.fuente,'ns_tickets_pruebas');
  assert.equal(result.data[0].ticket,'T-001');
  assert.equal(sqlCalls.length,3);
  assert.match(sqlCalls[1].sql,/FROM ns_tickets_pruebas t/i);
  assert.equal((sqlCalls[1].sql.match(/FROM ns_portafolio_pruebas/g)||[]).length,3);
  assert.equal(sqlCalls[1].params.length,5);
  for(const entry of sqlCalls){
    if(entry.sql.includes('INFORMATION_SCHEMA')) continue;
    assert.doesNotMatch(entry.sql,/\b(?:FROM|JOIN)\s+(?:portafolio|tickets)\b/i);
  }
});

test('F2: controlador responde 503 de estado si falta estructura, sin datos falsos', async () => {
  hasMotivo=false;
  const response=res();
  await controller.estado(req(),response,e=>{throw e});
  assert.equal(response.statusCode,503);
  assert.equal(response.payload.ok,false);
  assert.equal(response.payload.escritura,false);
  hasMotivo=true;
});

test('F2: errores de schema se entregan a middleware sin acceso a datos', async () => {
  hasMotivo=false;
  let caught;
  await controller.tickets(req(),res(),e=>{caught=e});
  assert.equal(caught.code,'EXPERIMENTAL_NS_SCHEMA_INCOMPLETE');
  hasMotivo=true;
});

test('F2: aislamiento absoluto de consultas SQL realizadas por el modulo', async () => {
  sqlCalls.length=0;
  await service.status(req());
  await service.list(req(),'portafolio');
  await service.list(req(),'tickets');
  for(const call of sqlCalls){
    assert.match(call.sql,/^\s*SELECT\b/i);
    assert.doesNotMatch(call.sql,/\b(?:FROM|JOIN)\s+`?(?:portafolio|tickets)`?\b/i);
  }
});
