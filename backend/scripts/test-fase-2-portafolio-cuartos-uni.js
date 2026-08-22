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

    if (text.includes('FROM z_op') && text.includes('SELECT id_zona')) {
      return [[{ id_zona: 1 }, { id_zona: 2 }, { id_zona: 3 }]];
    }
    if (text.includes('INFORMATION_SCHEMA.COLUMNS')) {
      return [[
        { COLUMN_NAME: 'estatus_ul_mes' },
        { COLUMN_NAME: 'estatus_ul_mes_fecha' }
      ]];
    }
    if (text.includes('FROM proyecto_equivalencias')) return [[]];
    if (text.includes("TRIM(COALESCE(p.numero_equipo, '')) = TRIM(?)") && text.includes('ORDER BY p.id_portafolio DESC')) {
      return [[{
        id_portafolio: 1,
        proyecto: 'P-TEST',
        proyecto_codigo: 'P-TEST',
        proyecto_nombre: 'P-TEST',
        numero_equipo: 'EQ-1',
        zona: 'CNA-01',
        supervisor: 'SUP-1',
        estado_operativo: 'Funcionando',
        estatus_servicio: 'En servicio'
      }]];
    }
    if (text.includes('FROM tickets') && !text.includes('FROM tickets t') && text.includes("TRIM(COALESCE(codigo_equipo, '')) = TRIM(?)")) {
      return [[{
        id: 1,
        ticket: 'T-1',
        codigo_equipo: 'EQ-1',
        fecha_reporte: new Date().toISOString(),
        responsabilidad: 'BLT',
        estado_ticket: 'Cerrado',
        tiempo_llegada: 2,
        tiempo_solucion: 5
      }]];
    }
    if (text.includes('MAX(p.id_proyecto_cobranza) AS id_proyecto_cobranza')) {
      return [[{
        proyecto: 'P-TEST',
        id_proyecto_cobranza: 7,
        proyecto_cc_x_port: 'P-TEST',
        ciudad: 'Ciudad',
        estado: 'Estado',
        direccion: 'Direccion'
      }]];
    }
    if (text.includes('ORDER BY p.numero_equipo ASC') && text.includes('p.id_portafolio')) {
      return [[{
        id_portafolio: 1,
        proyecto: 'P-TEST',
        proyecto_codigo: 'P-TEST',
        proyecto_nombre: 'P-TEST',
        numero_equipo: 'EQ-1',
        zona_id: 1,
        zona: 'CNA-01',
        zona_operativa: 'CNA-01',
        supervisor: 'SUP-1',
        supervisor_zona: 'SUP-1',
        superintendente: 'SINT-1',
        ciudad: 'Ciudad',
        estado: 'Estado',
        estado_registro: 1,
        estado_operativo: 'Funcionando',
        estatus_servicio: 'En servicio'
      }]];
    }
    if (text.includes('FROM tickets t') && text.includes("TRIM(COALESCE(t.codigo_equipo, '')) IN (?)")) {
      return [[{
        id: 1,
        ticket: 'T-1',
        codigo_equipo: 'EQ-1',
        fecha_reporte: new Date().toISOString(),
        responsabilidad: 'BLT',
        estado_ticket: 'Cerrado'
      }]];
    }
    if (text.includes('gestion_credito_id') && text.includes('adeudo_mp')) {
      return [[{ gestion_credito_id: 3, adeudo_mp: 10, adeudo_va: 5 }]];
    }
    if (text.includes('COUNT(DISTINCT proyecto)')) return [[{ total_proyectos: 0 }]];
    if (text.includes('COUNT(*) AS total_activos')) return [[{ total_activos: 0 }]];
    if (text.includes(' AS label, COUNT(*) AS total')) return [[]];
    if (text.includes('SELECT COUNT(*) AS total') && text.includes('FROM portafolio p')) return [[{ total: 0 }]];
    if (text.includes('SELECT DISTINCT p.zona_operativa AS value')) return [[{ value: 'CNA-01' }, { value: 'CNA-02' }]];
    if (text.includes('SELECT DISTINCT p.supervisor_zona AS value')) return [[{ value: 'SUP-1' }]];
    if (text.includes("SELECT DISTINCT COALESCE(lt.tipo_equipo")) return [[{ value: 'Elevador' }]];
    return [[]];
  },
  async getConnection() {
    return { query: fakeDb.query, release() {} };
  }
};

// Permite ejecutar la prueba contra el repo real o contra un sandbox de validacion.
require.cache[require.resolve(dbPath)] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: fakeDb
};

const recordScope = require(path.join(backendRoot, 'src', 'services', 'information-record-scope-gnral.service.js'));
const commercial = require(path.join(backendRoot, 'src', 'modules', 'portafolio', 'portafolio-comercial_uni.js'));
const consultas = require(path.join(backendRoot, 'src', 'modules', 'portafolio', 'portafolio-consultas_uni.js'));

function reqWithRooms(ids, { master = false } = {}) {
  const codes = ids.map(id => `CNA-0${id}`);
  const scopedIds = master ? null : ids;
  const scopedCodes = master ? null : codes;
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
      zona_codigos: scopedCodes,
      alcance: {
        motor: 'alcance_uni',
        empresa: 'UNITED',
        llave_maestra: master,
        requiere_filtro_zona: !master,
        zona_ids: scopedIds,
        zona_codigos: scopedCodes
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

async function testBuildersRemoveRoomsWithMaster() {
  const req = reqWithRooms([1, 2], { master: true });
  const built = recordScope.buildPortafolioScopeSql_gnral(req, 'p');
  assert.strictEqual(built.sql, '1 = 1');
  assert.deepStrictEqual(built.params, []);
  assert.strictEqual(recordScope.buildPortafolioScopeSqlInline_gnral(req, 'p').sql, '1 = 1');
}

async function testFiltersAreScoped() {
  calls.length = 0;
  const req = reqWithRooms([1, 2]);
  const res = responseRecorder();
  await consultas.getPortafolioFiltros_uni(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body.filters.zonas, ['CNA-01', 'CNA-02']);
  const portfolioCalls = calls.filter(call => call.sql.includes('FROM portafolio p'));
  assert.ok(portfolioCalls.length >= 3);
  for (const call of portfolioCalls) {
    assert.ok(call.sql.includes('p.zona_id IN (?, ?)'), 'Cada catalogo debe quedar limitado por cuartos.');
    assert.deepStrictEqual(call.params.slice(0, 2), [1, 2]);
  }
}

async function testDashboardIsScoped() {
  calls.length = 0;
  const req = reqWithRooms([1, 2]);
  const res = responseRecorder();
  await commercial.getPortafolioDashboard_uni(req, res);
  assert.strictEqual(res.statusCode, 200);
  const portfolioCalls = calls.filter(call => call.sql.includes('FROM portafolio p'));
  assert.ok(portfolioCalls.length >= 3);
  for (const call of portfolioCalls) {
    assert.ok(call.sql.includes('p.zona_id IN (?, ?)'));
    assert.deepStrictEqual(call.params.slice(0, 2), [1, 2]);
  }
}

async function testEquipmentDetailIsScoped() {
  calls.length = 0;
  const req = reqWithRooms([1, 2]);
  req.params.codigo = 'EQ-1';
  const res = responseRecorder();
  await consultas.getPortafolioEquipoDetalle_uni(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.mantenimiento.numero_equipo, 'EQ-1');
  assert.ok(calls.some(call =>
    call.sql.includes("TRIM(COALESCE(p.numero_equipo, '')) = TRIM(?)")
      && call.sql.includes('p.zona_id IN (?, ?)')
      && JSON.stringify(call.params.slice(0, 3)) === JSON.stringify(['EQ-1', 1, 2])
  ));
}

async function testProjectDetailIsScoped() {
  calls.length = 0;
  const req = reqWithRooms([1, 2]);
  req.params.proyecto = 'P-TEST';
  const res = responseRecorder();
  await consultas.getPortafolioProyectoDetalle_uni(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.equipos.length, 1);
  assert.strictEqual(res.body.equipos[0].zona, 'CNA-01');
  const projectQueries = calls.filter(call => call.sql.includes('FROM portafolio p') && call.sql.includes('P.proyecto') === false);
  assert.ok(calls.some(call => call.sql.includes('p.zona_id IN (?, ?)') && call.sql.includes('MAX(p.id_proyecto_cobranza)')));
  assert.ok(calls.some(call => call.sql.includes('p.zona_id IN (?, ?)') && call.sql.includes('ORDER BY p.numero_equipo ASC')));
}

async function testAllRoomsGuard() {
  const masterReq = reqWithRooms([], { master: true });
  const masterRes = responseRecorder();
  let masterNext = false;
  await recordScope.requireAllUnitedZones_gnral(masterReq, masterRes, () => { masterNext = true; });
  assert.strictEqual(masterNext, true);
  assert.strictEqual(masterRes.statusCode, 200);

  const allowedReq = reqWithRooms([1, 2, 3]);
  const allowedRes = responseRecorder();
  let allowedNext = false;
  await recordScope.requireAllUnitedZones_gnral(allowedReq, allowedRes, () => { allowedNext = true; });
  assert.strictEqual(allowedNext, true);
}

function testRouteAndRepositoryWiring() {
  const routeText = fs.readFileSync(path.join(backendRoot, 'src', 'modules', 'portafolio', 'portafolio.routes.js'), 'utf8');
  const repositoryText = fs.readFileSync(path.join(backendRoot, 'src', 'modules', 'portafolio', 'portafolio.repository.js'), 'utf8');
  assert.ok(routeText.includes('groupingPermissionPairsAny'));
  assert.ok(!routeText.includes('groupingCodesAny: UNITED_GROUPINGS'));
  assert.ok(!routeText.includes("requireCompleteInformationDomain_gnral('UNITED')"));
  assert.ok(repositoryText.includes('getPortafolioFiltros: portafolioConsultasUni.getPortafolioFiltros_uni'));
  assert.ok(repositoryText.includes('getPortafolioEquipos: portafolioComercialUni.getPortafolioEquipos_uni'));
  assert.ok(repositoryText.includes('getPortafolioEquipoDetalle: portafolioConsultasUni.getPortafolioEquipoDetalle_uni'));
  assert.ok(repositoryText.includes('getPortafolioProyectoDetalle: portafolioConsultasUni.getPortafolioProyectoDetalle_uni'));
  assert.ok(repositoryText.includes('syncPortafolio: legacyController.syncPortafolio'));
}

(async () => {
  await testBuildersRemoveRoomsWithMaster();
  await testFiltersAreScoped();
  await testDashboardIsScoped();
  await testEquipmentDetailIsScoped();
  await testProjectDetailIsScoped();
  await testAllRoomsGuard();
  testRouteAndRepositoryWiring();
  console.log('FASE_2_UNI_PORTAFOLIO_CUARTOS_V001: OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
