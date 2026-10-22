
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const constants = require('../backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.constants');
const { buildLoadTestReport } = require('../backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.report');

test('Fase 4: el perfil protegido conserva 2 conexiones por defecto', () => {
  const profile = constants.getDatabasePoolProfile({
    DB_CONNECTION_LIMIT: '50',
    DB_QUEUE_LIMIT: '0'
  });
  assert.equal(profile.requested_connection_limit, 50);
  assert.equal(profile.connection_limit_cap, 2);
  assert.equal(profile.effective_connection_limit, 2);
  assert.equal(profile.max_idle_connections, 1);
  assert.equal(profile.max_pending_requests, 30);
  assert.equal(profile.explicit_cap_override, false);
});

test('Fase 4: cap 4 solo existe mediante override explicito', () => {
  const profile = constants.getDatabasePoolProfile({
    DB_CONNECTION_LIMIT: '10',
    DB_CONNECTION_LIMIT_CAP: '4',
    DB_MAX_IDLE_CONNECTIONS: '2',
    DB_QUEUE_LIMIT: '40'
  });
  assert.equal(profile.connection_limit_cap, 4);
  assert.equal(profile.effective_connection_limit, 4);
  assert.equal(profile.max_idle_connections, 2);
  assert.equal(profile.max_pending_requests, 40);
  assert.equal(profile.explicit_cap_override, true);
});

test('Fase 4: no se eleva el default productivo de db.js', () => {
  const source = fs.readFileSync(path.join(ROOT, 'backend/src/config/db.js'), 'utf8');
  assert.match(source, /DB_CONNECTION_LIMIT_CAP,\s*2/);
  assert.doesNotMatch(source, /DB_CONNECTION_LIMIT_CAP,\s*4/);
});

test('Fase 4: reporte final registra el perfil del pool usado', () => {
  const session = {
    vus: 20,
    scenario: 'SALUD',
    durationSeconds: 30,
    state: 'COMPLETA',
    completionIntegrity: 'COMPLETO',
    createdAt: Date.now(),
    startedAt: 1000,
    stoppedAt: 31000,
    databasePoolProfile: {
      requested_connection_limit: 10,
      connection_limit_cap: 4,
      effective_connection_limit: 4,
      max_idle_connections: 2,
      max_pending_requests: 30
    },
    telemetrySnapshot: {
      http: { completed: 1, status: {200: 1}, latency: {} },
      sql: { completed: 0, errors: 0, slow_queries: 0, pool: {wait_latency:{}}, fingerprints: [] },
      system: { maxima: {} }
    },
    telemetry: { system_samples: [] },
    runnerSummary: null
  };
  const report = buildLoadTestReport(session);
  assert.match(report, /Pool solicitado: 10/);
  assert.match(report, /Pool cap: 4/);
  assert.match(report, /Pool efectivo: 4/);
  assert.match(report, /Pool max idle: 2/);
  assert.match(report, /Pool max pendientes: 30/);
});

test('Fase 4: la sesion congela el perfil para comparaciones reproducibles', () => {
  const source = fs.readFileSync(path.join(ROOT, 'backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.registry.js'), 'utf8');
  assert.match(source, /databasePoolProfile:\s*getDatabasePoolProfile\(\)/);
  assert.match(source, /database_pool:\s*session\.databasePoolProfile/);
});

test('Fase 4: capacidades exponen el perfil actual sin cambiar infraestructura', () => {
  const source = fs.readFileSync(path.join(ROOT, 'backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.service.js'), 'utf8');
  assert.match(source, /database_pool:\s*getDatabasePoolProfile\(\)/);
});
