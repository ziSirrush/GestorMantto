'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const root = path.resolve(__dirname, '..');
const infoScopeStub = {
  buildTicketScopeSql_gnral: () => ({ sql: '1 = 1', params: [] }),
  buildTicketScopeSqlInline_gnral: () => ({ sql: '1 = 1', params: [] }),
  buildPortafolioScopeSql_gnral: () => ({ sql: 'p.zona_id IN (?, ?, ?)', params: [4,5,6] }),
  zoneCodes_gnral: () => ['CNA-01','CNA-02','CNA-03'],
  zoneIds_gnral: () => [4,5,6]
};

function loadService(relativePath, repositoryStub) {
  const target = path.join(root, relativePath);
  delete require.cache[require.resolve(target)];
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request.endsWith('.repository') || request.includes('.repository')) return repositoryStub;
    if (request.includes('information-record-scope-gnral.service')) return infoScopeStub;
    return originalLoad.apply(this, arguments);
  };
  try {
    return require(target);
  } finally {
    Module._load = originalLoad;
  }
}

(async () => {
  const dashboardRepo = {
    async query(sql) {
      assert(sql.includes('AS zona_legacy'));
      assert(sql.includes('AS zona_id_oficial'));
      return [[{
        id:1, ticket:'T1', estado_ticket:'Abierto', estado:'CDMX', ciudad:'CDMX', proyecto:'P1',
        codigo_equipo:'E1', zona_legacy:'CNB-03', zona:'CNA-01', zona_id_oficial:4,
        responsabilidad:'BLT', fecha_reporte:'2026-08-21', vobo_estado:'Pendiente'
      }], []];
    }
  };
  const dashboard = loadService(
    'backend/src/modules/experimental-dashboard-call-center/experimental-dashboard-call-center.service.js',
    dashboardRepo
  );
  const dashboardResult = await dashboard.getDashboard_uni({ query:{}, informationAccess:{ alcance:{ motor:'alcance_uni' } } });
  assert.deepStrictEqual(dashboardResult.filters.zonas, ['CNA-01','CNA-02','CNA-03']);
  assert.strictEqual(dashboardResult.tickets[0].zona, 'CNA-01');
  assert.strictEqual(dashboardResult.tickets[0].zona_legacy, 'CNB-03');
  assert.strictEqual(dashboardResult.summary.distribuciones.zona[0].label, 'CNA-01');

  let entregaCall = 0;
  const entregasRepo = {
    async query(sql) {
      entregaCall += 1;
      if (sql.includes('FROM portafolio p') && sql.includes('fecha_recepcion_mantenimiento_normalizada') && sql.includes('zona_oficial')) {
        return [[{ codigo_equipo:'E1', zona_id_oficial:4, zona_oficial:'CNA-01', fecha_recepcion_mantenimiento_normalizada:'2026-08-01' }], []];
      }
      if (sql.includes('SELECT TRIM(p.estado) AS valor')) return [[{ valor:'CDMX' }], []];
      if (sql.includes("AS fecha FROM tickets")) return [[{ fecha:'2026-08-21' }], []];
      if (sql.includes('FROM tickets t WHERE t.codigo_equipo IN') && sql.includes('DATE(t.fecha_reporte)=?')) {
        return [[{
          id:2,ticket:'T2',folio:'F2',estado_ticket:'Cerrado',estado:'CDMX',ciudad:'CDMX',proyecto:'P1',proyecto_padre:'',
          codigo_equipo:'E1',referencia_en_zona_operativa:'R1',zona:'CNB-03',zona_administrativa:'',zona_de_falla:'',descripcion:'',
          fecha_reporte_fecha:'2026-08-21',h_reporte:'10:00:00',estatus_equipo_ir:'',fecha_llegada_fecha:'2026-08-21',h_llegada:'11:00:00',
          persona_que_atiende:'',fecha_cierre_fecha:'2026-08-21',h_solucion:'12:00:00',tecnico:'',estatus_equipo_final:'Funcionando',
          causa:'',accion_en_cierre:'',responsabilidad:'BLT',causa_falla:'',tiempo_llegada:1,tiempo_solucion:1,tipo_equipo:'ELE',prioridad:'',
          ejecutivo_call:'',blt_empleado:'',tiempo_llegada_ii:null,tiempo_solucion_ii:null,ticket_excede:null
        }], []];
      }
      if (sql.includes('COUNT(*) AS fallas_blt')) return [[], []];
      throw new Error('SQL no esperado en mock: ' + sql.slice(0,120));
    }
  };
  const entregas = loadService(
    'backend/src/modules/experimental-entregas-recientes/experimental-entregas-recientes.service.js',
    entregasRepo
  );
  const entregaResult = await entregas.getEntregasRecientes_exp({ query:{ fecha:'2026-08-21' }, user:{} });
  assert(entregaCall >= 5);
  assert.strictEqual(entregaResult.tickets[0].zona, 'CNA-01');
  assert.strictEqual(entregaResult.tickets[0].zona_legacy, 'CNB-03');
  assert.strictEqual(entregaResult.tickets[0].zona_id_oficial, 4);
  assert.deepStrictEqual(entregaResult.alcance.zona_ids, [4,5,6]);
  assert.strictEqual(entregaResult.charts.zonas[0].label, 'CNA-01');

  console.log('FASE_11_RUNTIME_MOCK_OK');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
