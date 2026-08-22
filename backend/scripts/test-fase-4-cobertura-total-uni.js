'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.DB_HOST ||= 'localhost';
process.env.DB_PORT ||= '3306';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_NAME ||= 'test';
process.env.DB_SSL ||= 'false';

const backendRoot = path.join(__dirname, '..');
const recordScope = require(path.join(
  backendRoot,
  'src',
  'services',
  'information-record-scope-gnral.service.js'
));

function text(relativePath) {
  return fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
}

function reqWithRooms(codes, ids = null, master = false) {
  const zoneIds = ids || codes.map((_, index) => index + 1);
  const scopedZoneIds = master ? null : zoneIds;
  const scopedCodes = master ? null : codes;
  return {
    informationAccess: {
      motor: 'alcance_uni',
      llave_maestra: master,
      requiere_filtro_zona: !master,
      zona_ids: scopedZoneIds,
      zona_codigos: scopedCodes,
      alcance: {
        motor: 'alcance_uni',
        empresa: 'UNITED',
        llave_maestra: master,
        requiere_filtro_zona: !master,
        zona_ids: scopedZoneIds,
        zona_codigos: scopedCodes
      }
    }
  };
}

function testSharedRoomBuilders() {
  const req = reqWithRooms(['CNA-01', 'CNA-02'], [11, 12], true);

  const byId = recordScope.buildZoneIdScopeSql_gnral(req, 'z.id_zona');
  assert.strictEqual(byId.sql, '1 = 1');
  assert.deepStrictEqual(byId.params, []);

  const byCode = recordScope.buildZoneCodeScopeSql_gnral(req, 'gc.z_oper');
  assert.strictEqual(
    byCode.sql,
    '1 = 1'
  );
  assert.deepStrictEqual(byCode.params, []);

  const inline = recordScope.buildZoneCodeScopeSqlInline_gnral(req, 'pc.zona_operativa');
  assert.strictEqual(inline.sql, '1 = 1');
  assert.deepStrictEqual(inline.params, []);

  const noRooms = reqWithRooms([], [], false);
  assert.strictEqual(
    recordScope.buildZoneCodeScopeSql_gnral(noRooms, 'gc.z_oper').sql,
    '1 = 0'
  );
  assert.strictEqual(
    recordScope.buildZoneIdScopeSql_gnral(noRooms, 'z.id_zona').sql,
    '1 = 0'
  );
}

function testResumenDiaFeeds() {
  const ticketsRepo = text('src/modules/tickets/tickets.repository.js');
  const portafolioRepo = text('src/modules/portafolio/portafolio.repository.js');
  const criticos = text('src/modules/criticos/criticos.service.js');

  assert.ok(ticketsRepo.includes('getTickets: ticketsConsultasUni.getTickets_uni'));
  assert.ok(portafolioRepo.includes('getPortafolio: portafolioConsultasUni.getPortafolio_uni'));
  assert.ok(criticos.includes("buildPortafolioScopeSqlInline_gnral(source, alias)"));
  assert.ok(criticos.includes("buildTicketScopeSqlInline_gnral(source,'t')") || criticos.includes("buildTicketScopeSqlInline_gnral(source, 't')"));
}

function testOperacionAndProjects() {
  const dashboardRepo = text('src/modules/dashboard-operativo/dashboard-operativo.repository.js');
  assert.ok(dashboardRepo.includes("buildZoneIdScopeSql_gnral("));
  assert.ok(dashboardRepo.includes("'z.id_zona'"));
  assert.ok(!dashboardRepo.includes('visibleUserIds_gnral(informationAccess)'));

  const projectAdapter = text('src/modules/proyectos/proyectos-cuartos_uni.service.js');
  const projectController = text('src/modules/proyectos/proyectos.controller.js');
  assert.ok(projectAdapter.includes('buildPortafolioScopeSql_gnral(req, alias)'));
  assert.ok(projectAdapter.includes('buildPortafolioScopeSql_gnral(req, \'p\')'));
  assert.ok(projectController.includes('proyectosCuartosUni.getProyectos_uni'));
  assert.ok(projectController.includes('proyectosCuartosUni.getProyectosFiltros_uni'));
}

function testExperimentalCoverage() {
  const attention = text('src/modules/experimental-atencion-prioritaria/experimental-atencion-prioritaria.service.js');
  const deliveries = text('src/modules/experimental-entregas-recientes/experimental-entregas-recientes.service.js');

  assert.ok(attention.includes('buildTicketScopeSql_gnral(req'));
  assert.ok(attention.includes('buildTicketScopeSqlInline_gnral'));
  assert.ok(deliveries.includes("buildPortafolioScopeSql_gnral(req,'p')") || deliveries.includes("buildPortafolioScopeSql_gnral(req, 'p')"));
  assert.ok(deliveries.includes('roomScope.sql'));
}

function testCobranzaCoverage() {
  const cobranzaController = text('src/controllers/cobranza-uni-cuartos.controller.js');
  const mpController = text('src/controllers/detalle-mp-2026-cuartos.controller.js');
  const cobranzaRoutes = text('src/routes/cobranza-uni.routes.js');
  const mpRoutes = text('src/routes/detalle-mp-2026.routes.js');

  assert.ok(cobranzaController.includes("zoneScope(req, 'gc.z_oper')"));
  assert.ok(cobranzaController.includes("zoneScope(req, 'pc.zona_operativa')"));
  assert.ok(cobranzaController.includes("zoneScope(req, 'mp.z_oper')"));

  assert.ok(mpController.includes("zoneScopeInline(req, 'mp.z_oper')"));
  assert.ok(mpController.includes("zoneScopeInline(req, 'gc.z_oper')"));
  assert.ok(mpController.includes("zoneScopeInline(req, 'pc.zona_operativa')"));
  assert.ok(mpController.includes("zoneScopeInline(req, 'va.zona_operativa')"));

  assert.ok(cobranzaRoutes.includes("groupingCode: 'COBRANZA'"));
  assert.ok(cobranzaRoutes.includes("domain: 'UNITED'"));
  assert.ok(cobranzaRoutes.includes('COBRANZA_UNI_ESTADOS_CUENTA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'));
  assert.ok(cobranzaRoutes.includes('COBRANZA_UNI_ADITIVAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'));
  assert.ok(cobranzaRoutes.includes("router.post('/sync', requireCobranzaUniIntegration"));

  assert.ok(mpRoutes.includes("groupingCode: 'COBRANZA'"));
  assert.ok(mpRoutes.includes('COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'));
  assert.ok(mpRoutes.includes("router.post('/sync', requireCobranzaUniIntegration"));
}

function run() {
  testSharedRoomBuilders();
  testResumenDiaFeeds();
  testOperacionAndProjects();
  testExperimentalCoverage();
  testCobranzaCoverage();
  console.log('FASE_4_UNI_COBERTURA_TOTAL_CUARTOS_V001: OK');
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
