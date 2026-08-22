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

assert(source.includes("buildTicketScopeSql_gnral(req, 't')"), 'La bandeja debe usar el motor territorial de Tickets.');
assert(source.includes('p_ticket_code.zona_id'), 'La zona por equipo debe salir de portafolio.zona_id.');
assert(source.includes('COUNT(DISTINCT p_ticket_project.zona_id) = 1'), 'El fallback por proyecto debe conservar la regla de zona unica.');
assert(source.includes('z_ticket_official.zona AS zona_oficial'), 'La etiqueta de zona debe resolverse desde z_op.');
assert(!/\bt\.zona\b/.test(source), 'tickets.zona no debe gobernar la zona oficial de la bandeja.');
assert(source.includes('zona: officialZone || null'), 'La salida debe reemplazar la zona historica por la zona oficial.');
assert(source.includes('zona_ids: zoneIds_gnral(req)'), 'La respuesta debe exponer los cuartos efectivos.');
assert(source.includes('zonas: zoneCodes_gnral(req)'), 'La respuesta debe exponer los codigos de cuartos efectivos.');
assert(source.includes("async function getTicketDetalle_uni"), 'El detalle existente debe conservarse para la Fase 4/11.');

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

  await subject.getTickets_uni({ informationAccess: { alcance: { motor: 'UNITED' } } }, res);

  assert(statusCode === 200, 'La bandeja simulada debe responder 200.');
  assert(payload && payload.ok === true, 'La bandeja simulada debe responder ok=true.');
  assert(Array.isArray(payload.data) && payload.data.length === 1, 'La bandeja debe devolver el registro simulado.');
  assert(payload.data[0].zona === 'CNA-01', 'La zona historica debe ser reemplazada por la zona oficial.');
  assert(payload.data[0].zona !== 'CNB-03', 'No debe sobrevivir la etiqueta historica incorrecta.');
  assert(payload.data[0].zona_id_oficial === 4, 'Debe conservarse zona_id_oficial estructural.');
  assert(JSON.stringify(payload.alcance.zona_ids) === JSON.stringify([4, 5, 6]), 'Debe exponer zona_ids autorizados.');
  assert(JSON.stringify(payload.alcance.zonas) === JSON.stringify(['CNA-01', 'CNA-02', 'CNA-03']), 'Debe exponer zonas autorizadas.');
  assert(/LEFT JOIN portafolio p_ticket_code/.test(capturedSql), 'SQL debe enlazar codigo_equipo con Portafolio.');
  assert(/LEFT JOIN z_op z_ticket_official/.test(capturedSql), 'SQL debe resolver la etiqueta en z_op.');
  assert(/WHERE t\.id = \?/.test(capturedSql), 'SQL debe conservar el predicado de alcance.');
  assert(JSON.stringify(capturedParams) === JSON.stringify([100]), 'Debe propagar parametros del alcance.');

  console.log('FASE_3_11_OPERACION_BANDEJA_TICKETS_CUARTOS_V001: OK');
})().catch((error) => {
  Module._load = originalLoad;
  console.error(error.stack || error.message || error);
  process.exit(1);
});
