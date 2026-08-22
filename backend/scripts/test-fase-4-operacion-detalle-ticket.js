'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const repoRoot = path.resolve(__dirname, '..');
const target = path.join(repoRoot, 'src', 'modules', 'tickets', 'tickets-consultas_uni.js');
const source = fs.readFileSync(target, 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes("buildTicketScopeSql_gnral(req, 't')"), 'El detalle debe usar el motor territorial de Tickets.');
assert(source.includes("const projectZoneIdSql = buildProjectZoneIdSql_uni('t');"), 'El detalle debe resolver zona estructural tambien para tickets sin codigo.');
assert(source.includes('p_ticket_code.zona_id'), 'La zona del detalle por equipo debe salir de portafolio.zona_id.');
assert(source.includes('COUNT(DISTINCT p_ticket_project.zona_id) = 1'), 'El fallback por proyecto debe conservar zona unica.');
assert(source.includes('z_ticket_official.zona AS zona_oficial'), 'La zona visual del detalle debe salir de z_op.');
assert(source.includes('const data = normalizeOfficialTicketRow_uni(rows[0]);'), 'El detalle debe canonizar la zona antes de responder.');
assert(source.includes('zona_ids: zoneIds_gnral(req)'), 'El detalle debe exponer zona_ids efectivos.');
assert(source.includes('zonas: zoneCodes_gnral(req)'), 'El detalle debe exponer codigos de cuartos efectivos.');

const originalLoad = Module._load;
let capturedSql = '';
let capturedParams = null;

Module._load = function patchedLoad(request, parent, isMain) {
  if (parent && parent.filename === target && request === '../../config/db') {
    return {
      query: async (sql, params) => {
        capturedSql = sql;
        capturedParams = params;
        return [[{
          id: 100,
          ticket: 'T-100',
          folio: 'F-100',
          codigo_equipo: 'EQ-001',
          zona: 'CNB-03',
          zona_id_oficial: 4,
          zona_oficial: 'CNA-01'
        }]];
      }
    };
  }
  if (parent && parent.filename === target && request === '../../services/information-record-scope-gnral.service') {
    return {
      buildTicketScopeSql_gnral: () => ({ sql: 't.id = ?', params: [100] }),
      zoneIds_gnral: () => [4, 5, 6],
      zoneCodes_gnral: () => ['CNA-01', 'CNA-02', 'CNA-03']
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  delete require.cache[target];
  const subject = require(target);
  Module._load = originalLoad;

  let payload = null;
  let statusCode = 200;
  const res = {
    status(code) { statusCode = code; return this; },
    json(body) { payload = body; return body; }
  };

  await subject.getTicketDetalle_uni(
    {
      params: { ticket: 'T-100' },
      informationAccess: { alcance: { motor: 'UNITED' } }
    },
    res
  );

  assert(statusCode === 200, 'El detalle simulado debe responder 200.');
  assert(payload && payload.ok === true, 'El detalle simulado debe responder ok=true.');
  assert(payload.data && payload.data.ticket === 'T-100', 'Debe devolver el ticket solicitado.');
  assert(payload.data.zona === 'CNA-01', 'La zona historica debe ser reemplazada por la zona oficial.');
  assert(payload.data.zona !== 'CNB-03', 'No debe sobrevivir la etiqueta historica incorrecta.');
  assert(payload.data.zona_oficial === 'CNA-01', 'Debe exponer zona_oficial.');
  assert(payload.data.zona_id_oficial === 4, 'Debe exponer zona_id_oficial estructural.');
  assert(JSON.stringify(payload.alcance.zona_ids) === JSON.stringify([4, 5, 6]), 'Debe exponer zona_ids autorizados.');
  assert(JSON.stringify(payload.alcance.zonas) === JSON.stringify(['CNA-01', 'CNA-02', 'CNA-03']), 'Debe exponer zonas autorizadas.');
  assert(/LEFT JOIN portafolio p_ticket_code/.test(capturedSql), 'SQL debe enlazar codigo_equipo con Portafolio.');
  assert(/LEFT JOIN z_op z_ticket_official/.test(capturedSql), 'SQL debe resolver la etiqueta oficial en z_op.');
  assert(/TRIM\(COALESCE\(t\.ticket, ''\)\) = \?/.test(capturedSql), 'SQL debe aceptar ticket.');
  assert(/CAST\(t\.id AS CHAR\) = \?/.test(capturedSql), 'SQL debe aceptar id.');
  assert(/TRIM\(COALESCE\(t\.folio, ''\)\) = \?/.test(capturedSql), 'SQL debe aceptar folio.');
  assert(/TRIM\(COALESCE\(t\.id_interno, ''\)\) = \?/.test(capturedSql), 'SQL debe aceptar id_interno.');
  assert(/AND t\.id = \?/.test(capturedSql), 'SQL debe conservar el predicado de alcance territorial.');
  assert(JSON.stringify(capturedParams) === JSON.stringify(['T-100', 'T-100', 'T-100', 'T-100', 100]), 'Debe propagar los cuatro identificadores y parametros de alcance en orden.');

  console.log('FASE_4_11_OPERACION_DETALLE_TICKET_CUARTOS_V001: OK');
})().catch((error) => {
  Module._load = originalLoad;
  console.error(error.stack || error.message || error);
  process.exit(1);
});
