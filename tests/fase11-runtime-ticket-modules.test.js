'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const root = path.resolve(__dirname, '..');
const infoScopeStub = {
  buildTicketScopeSql_gnral: () => ({ sql:'1 = 1', params:[] }),
  buildTicketScopeSqlInline_gnral: () => ({ sql:'1 = 1', params:[] }),
  zoneCodes_gnral: () => ['CNA-01','CNA-02','CNA-03'],
  zoneIds_gnral: () => [4,5,6]
};

function load(relativePath, repo) {
  const target = path.join(root, relativePath);
  delete require.cache[require.resolve(target)];
  const original = Module._load;
  Module._load = function(request) {
    if (request.includes('.repository')) return repo;
    if (request.includes('information-record-scope-gnral.service')) return infoScopeStub;
    return original.apply(this, arguments);
  };
  try { return require(target); } finally { Module._load = original; }
}

(async () => {
  const atencionRepo = {
    async query(sql) {
      if (sql.includes('ORDER BY t.id DESC')) return [[{
        id:1,ticket:'T1',folio:'',estado_ticket:'Abierto',estado:'CDMX',proyecto:'P1',codigo_equipo:'E1',
        zona_legacy:'CNB-03',zona:'CNA-01',zona_id_oficial:4,descripcion:'persona atrapada',causa:'',accion_en_cierre:'',
        fecha_reporte_fecha:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),
        h_reporte:'00:00:00',fecha_llegada_fecha:null,h_llegada:null
      }], []];
      if (sql.includes("SELECT 'ESTADO' AS tipo")) return [[{tipo:'ESTADO',valor:'CDMX'}], []];
      if (sql.includes('SELECT critical.codigo_equipo')) return [[{codigo_equipo:'E1',fallas_blt_periodo:3,llamadas_7d:2,llamadas_30d:3}], []];
      throw new Error('SQL atencion no esperado');
    }
  };
  const atencion = load('backend/src/modules/experimental-atencion-prioritaria/experimental-atencion-prioritaria.service.js', atencionRepo);
  const ar = await atencion.getAtencionPrioritaria_exp({ query:{periodo:'dia'}, user:{} });
  assert.strictEqual(ar.data.atrapados[0].zona, 'CNA-01');
  assert.strictEqual(ar.data.atrapados[0].zona_legacy, 'CNB-03');
  assert.deepStrictEqual(ar.filters.zonas, ['CNA-01','CNA-02','CNA-03']);

  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const resumenRepo = {
    async query(sql) {
      if (sql.includes('ORDER BY t.fecha_reporte DESC')) return [[{
        id:2,ticket:'T2',folio:'',estado_ticket:'Abierto',estado:'CDMX',zona_legacy:'CNA-03',zona:'CNA-01',zona_id_oficial:4,
        codigo_equipo:'E2',estatus_equipo_final:'No Funcionando',responsabilidad:'BLT',tiempo_llegada:1,fecha_reporte_fecha:today
      }], []];
      if (sql.includes('SELECT TRIM(t.estado) AS valor')) return [[{valor:'CDMX'}], []];
      throw new Error('SQL resumen no esperado');
    }
  };
  const resumen = load('backend/src/modules/experimental-resumen-dia/experimental-resumen-dia.service.js', resumenRepo);
  const rr = await resumen.getResumenDia_exp({ query:{} });
  assert.strictEqual(rr.tickets[0].zona, 'CNA-01');
  assert.strictEqual(rr.tickets[0].zona_legacy, 'CNA-03');
  assert.deepStrictEqual(rr.alcance.zona_ids, [4,5,6]);

  console.log('FASE_11_TICKET_MODULES_RUNTIME_MOCK_OK');
})().catch(error => { console.error(error); process.exit(1); });
