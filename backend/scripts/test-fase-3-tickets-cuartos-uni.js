'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const backendRoot = path.join(__dirname, '..');
const dbPath = path.join(backendRoot, 'src', 'config', 'db.js');
const calls = [];

const fakeDb = {
  async query(sql, params = []) {
    const text = String(sql);
    calls.push({ sql: text, params });

    if (text.includes('SELECT t.id') && text.includes('FROM tickets t')) {
      return [[{ id: 1 }]];
    }

    if (text.includes('FROM tickets t') && text.includes("TRIM(COALESCE(t.id_interno, '')) = ?") && text.includes('LIMIT 1')) {
      return [[{
        id: 1,
        ticket: 'T-1',
        folio: 'F-1',
        codigo_equipo: 'EQ-1',
        proyecto: 'P-1'
      }]];
    }

    if (text.includes('t.*,') && text.includes('FROM tickets t') && text.includes('LIMIT 50000')) {
      return [[{
        id: 1,
        ticket: 'T-1',
        codigo_equipo: 'EQ-1',
        proyecto: 'P-1'
      }]];
    }

    return [[]];
  }
};

require.cache[require.resolve(dbPath)] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: fakeDb
};

const alcanceUni = require(path.join(backendRoot, 'src', 'services', 'alcance', 'alcance-uni.service.js'));
const recordScope = require(path.join(backendRoot, 'src', 'services', 'information-record-scope-gnral.service.js'));
const consultas = require(path.join(backendRoot, 'src', 'modules', 'tickets', 'tickets-consultas_uni.js'));

function reqWithRooms(ids, { master = false } = {}) {
  const scopedIds = master ? null : ids;
  return {
    query: {},
    params: {},
    user: { id_SB: 10 },
    informationAccess: {
      motor: 'alcance_uni',
      dominio: 'UNITED',
      llave_maestra: master,
      requiere_filtro_zona: !master,
      zona_ids: scopedIds,
      alcance: {
        motor: 'alcance_uni',
        empresa: 'UNITED',
        llave_maestra: master,
        requiere_filtro_zona: !master,
        zona_ids: scopedIds
      }
    }
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return payload; }
  };
}

function testParameterizedBuilderPrecedence() {
  const context = {
    motor: alcanceUni.UNITED_ENGINE,
    llave_maestra: false,
    requiere_filtro_zona: true,
    zona_ids: [1, 2]
  };
  const built = alcanceUni.buildResolvedTicketScopeSql_uni(context, 't');

  assert.ok(built.sql.includes("NULLIF(TRIM(COALESCE(t.codigo_equipo, '')), '') IS NOT NULL"));
  assert.ok(built.sql.includes("NULLIF(TRIM(COALESCE(t.codigo_equipo, '')), '') IS NULL"));
  assert.ok(built.sql.includes('COUNT(DISTINCT p_scope_uni_ticket_project_check.zona_id) = 1'));
  assert.ok(built.sql.includes('p_scope_uni_ticket_project.proyecto'));
  assert.ok(!built.sql.includes('COALESCE(t.zona'));
  assert.ok(!built.sql.includes('TRIM(t.zona'));
  assert.deepStrictEqual(built.params, [1, 2, 1, 2]);
}


function testNoRoomsAndMasterContracts() {
  const masterContext = {
    motor: alcanceUni.UNITED_ENGINE,
    llave_maestra: true,
    requiere_filtro_zona: false,
    zona_ids: null
  };
  const master = alcanceUni.buildResolvedTicketScopeSql_uni(masterContext, 't');
  assert.strictEqual(master.sql, '1 = 1');
  assert.deepStrictEqual(master.params, []);

  const normalWithoutRooms = alcanceUni.buildResolvedTicketScopeSql_uni({
    motor: alcanceUni.UNITED_ENGINE,
    llave_maestra: false,
    requiere_filtro_zona: true,
    zona_ids: []
  }, 't');
  assert.strictEqual(normalWithoutRooms.sql, '1 = 0');
  assert.deepStrictEqual(normalWithoutRooms.params, []);
}

function testInlineBuilderKeepsSameRules() {
  const req = reqWithRooms([1, 2]);
  const built = recordScope.buildTicketScopeSqlInline_gnral(req, 't');

  assert.ok(built.sql.includes('zona_id IN (1, 2)'));
  assert.ok(built.sql.includes("NULLIF(TRIM(COALESCE(t.codigo_equipo, '')), '') IS NULL"));
  assert.ok(built.sql.includes('COUNT(DISTINCT p_scope_uni_ticket_inline_project_check.zona_id) = 1'));
  assert.ok(!built.sql.includes('COALESCE(t.zona'));
  assert.ok(!built.sql.includes('TRIM(t.zona'));
  assert.deepStrictEqual(built.params, []);
}

async function testTicketListIsScoped() {
  calls.length = 0;
  const req = reqWithRooms([1, 2]);
  const res = responseRecorder();

  await consultas.getTickets_uni(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.data.length, 1);
  const call = calls.find(item => item.sql.includes('t.*,') && item.sql.includes('LIMIT 50000'));
  assert.ok(call);
  assert.ok(call.sql.includes('p_scope_uni_ticket_equipo.zona_id IN (?, ?)'));
  assert.deepStrictEqual(call.params, [1, 2, 1, 2]);
}

async function testTicketDetailIsScoped() {
  calls.length = 0;
  const req = reqWithRooms([1, 2]);
  req.params.ticket = 'T-1';
  const res = responseRecorder();

  await consultas.getTicketDetalle_uni(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.data.ticket, 'T-1');
  const call = calls.find(item => item.sql.includes("TRIM(COALESCE(t.id_interno, '')) = ?") && item.sql.includes('LIMIT 1'));
  assert.ok(call);
  assert.ok(call.sql.includes("TRIM(COALESCE(t.ticket, '')) = ?"));
  assert.ok(call.sql.includes('CAST(t.id AS CHAR) = ?'));
  assert.ok(call.sql.includes("TRIM(COALESCE(t.folio, '')) = ?"));
  assert.ok(call.sql.includes('p_scope_uni_ticket_equipo.zona_id IN (?, ?)'));
  assert.deepStrictEqual(call.params, ['T-1', 'T-1', 'T-1', 'T-1', 1, 2, 1, 2]);
}

async function testRecordGuardUsesSameScope() {
  calls.length = 0;
  const req = reqWithRooms([1, 2]);
  req.params.ticket = 'T-1';
  const res = responseRecorder();
  let nextCalled = false;

  await recordScope.requireTicketRecordScope_gnral(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, true);
  const call = calls.find(item => item.sql.includes('SELECT t.id') && item.sql.includes('FROM tickets t'));
  assert.ok(call);
  assert.ok(call.sql.includes('p_scope_uni_ticket_equipo.zona_id IN (?, ?)'));
  assert.deepStrictEqual(call.params.slice(-4), [1, 2, 1, 2]);
}

function testRepositoryWiringAndM2M() {
  const repositoryText = fs.readFileSync(
    path.join(backendRoot, 'src', 'modules', 'tickets', 'tickets.repository.js'),
    'utf8'
  );
  const routePath = path.join(backendRoot, 'src', 'modules', 'tickets', 'tickets.routes.js');
  const routeText = fs.existsSync(routePath) ? fs.readFileSync(routePath, 'utf8') : null;

  assert.ok(repositoryText.includes('getTickets: ticketsConsultasUni.getTickets_uni'));
  assert.ok(repositoryText.includes('getTicketDetalle: ticketsConsultasUni.getTicketDetalle_uni'));
  assert.ok(repositoryText.includes('getTicketInteracciones: legacyController.getTicketInteracciones'));
  assert.ok(repositoryText.includes('createTicketComentario: legacyController.createTicketComentario'));
  assert.ok(repositoryText.includes('saveTicketValidacion: legacyController.saveTicketValidacion'));
  assert.ok(repositoryText.includes('saveTicketVobo: legacyController.saveTicketVobo'));
  assert.ok(repositoryText.includes('syncTickets: legacyController.syncTickets'));
  assert.ok(repositoryText.includes('syncTicketDatesCdmx: legacyController.syncTicketDatesCdmx'));

  if (routeText) {
    assert.ok(routeText.includes('requireTicketRecordScope_gnral'));
    assert.ok(routeText.includes("router.post('/tickets/sync', requireTicketsIntegration"));
    assert.ok(routeText.includes("router.post('/tickets/sync-fechas-cdmx', requireTicketsIntegration"));
  }
}

(async () => {
  testParameterizedBuilderPrecedence();
  testNoRoomsAndMasterContracts();
  testInlineBuilderKeepsSameRules();
  await testTicketListIsScoped();
  await testTicketDetailIsScoped();
  await testRecordGuardUsesSameScope();
  testRepositoryWiringAndM2M();
  console.log('FASE_3_UNI_TICKETS_CUARTOS_V001: OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
