'use strict';

// [BLT NOW | 2026-10-26 | EXPERIMENTAL_NS_F2_SCOPE_V001]
// Reutiliza el alcance UNITED oficial. NUNCA consulta Portafolio/Tickets productivos.
const {
  buildPortafolioScopeSql_gnral,
  buildTicketScopeSql_gnral
} = require('../../services/information-record-scope-gnral.service');

const PERMISSION_CODES = Object.freeze([
  'EXPERIMENTAL_NS_RESUMEN_DIA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  'EXPERIMENTAL_NS_EQUIPOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  'EXPERIMENTAL_NS_PROYECTOS_MANTENIMIENTO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
]);

function forbidden(message, code = 'EXPERIMENTAL_NS_ACCESS_DENIED') {
  const error = new Error(message);
  error.statusCode = 403;
  error.code = code;
  return error;
}

function unavailable(message, code = 'EXPERIMENTAL_NS_SCOPE_INCOMPATIBLE') {
  const error = new Error(message);
  error.statusCode = 503;
  error.code = code;
  return error;
}

function assertScope(req) {
  const ctx = req && req.informationAccess;
  const grouping = ctx && ctx.agrupacion;
  if (!ctx || ctx.dominio !== 'UNITED' || ctx.motor !== 'alcance_uni' ||
      !grouping || grouping.codigo !== 'EXPERIMENTAL_NS' ||
      ctx.acceso_puerta !== true || !PERMISSION_CODES.includes(ctx.permission_code)) {
    throw forbidden('Experimental NS requiere permiso, puerta y alcance UNITED validos.');
  }
  return ctx;
}

function assertNoProductionTables(sql) {
  // Permite exclusivamente los nombres con prefijo ns_ en clausulas de tabla.
  if (/\b(?:FROM|JOIN|UPDATE|INTO)\s+`?(?:portafolio|tickets)`?(?=\s|$|\))/i.test(String(sql))) {
    throw unavailable('La consulta intenta usar tablas de produccion.', 'EXPERIMENTAL_NS_ISOLATION_ERROR');
  }
}

function portafolioScope(req) {
  assertScope(req);
  const scope = buildPortafolioScopeSql_gnral(req, 'p');
  if (!scope || typeof scope.sql !== 'string' || !Array.isArray(scope.params)) {
    throw unavailable('No fue posible resolver alcance Portafolio.');
  }
  assertNoProductionTables(scope.sql);
  return scope;
}

function ticketsScope(req) {
  assertScope(req);
  const scope = buildTicketScopeSql_gnral(req, 't');
  if (!scope || typeof scope.sql !== 'string' || !Array.isArray(scope.params)) {
    throw unavailable('No fue posible resolver alcance Tickets.');
  }
  const sql = scope.sql.trim();
  if (/^1\s*=\s*[01]$/.test(sql)) return { sql, params: scope.params };

  // El resolver central de Tickets consulta 3 referencias de la tabla Portafolio.
  // Aqui se sustituyen SOLAMENTE esas referencias por el CLON experimental,
  // manteniendo INTACTA la regla central: equipo > proyecto/proyecto_padre.
  // Ante cualquier cambio del SQL central se falla cerrado (sin fallback productivo).
  const aliases = [
    'p_scope_uni_ticket_equipo',
    'p_scope_uni_ticket_project_check',
    'p_scope_uni_ticket_project'
  ];
  let rebound = sql;
  for (const alias of aliases) {
    const pattern = new RegExp('\\bFROM\\s+portafolio\\s+' + alias + '\\b', 'g');
    const matches = [...rebound.matchAll(pattern)];
    if (matches.length !== 1) {
      throw unavailable('Cambio incompatible en la regla territorial central de Tickets.');
    }
    rebound = rebound.replace(pattern, 'FROM ns_portafolio_pruebas ' + alias);
  }
  assertNoProductionTables(rebound);
  return { sql: rebound, params: scope.params };
}

module.exports = {
  PERMISSION_CODES,
  assertScope,
  assertNoProductionTables,
  portafolioScope,
  ticketsScope
};
