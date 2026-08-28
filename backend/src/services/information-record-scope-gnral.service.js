'use strict';

const db = require('../config/db');
const {
  CORELLIAN_ENGINE,
  buildResolvedUserColumnsScopeSql_cor
} = require('./alcance/alcance-cor.service');
const {
  UNITED_ENGINE,
  buildResolvedPortafolioScopeSql_uni,
  buildResolvedTicketScopeSql_uni
} = require('./alcance/alcance-uni.service');

function informationAccessContext_gnral(source) {
  return source?.informationAccess || source || null;
}

function resolvedScope_gnral(source) {
  const context = informationAccessContext_gnral(source);
  return context?.alcance || context || null;
}

function hasUnrestrictedUnitedScope_gnral(source) {
  const scope = resolvedScope_gnral(source);
  return Boolean(scope && scope.motor === UNITED_ENGINE && scope.llave_maestra === true);
}

function visibleUserIds_gnral(source) {
  const context = informationAccessContext_gnral(source);
  if (!context) return [];
  const scope = resolvedScope_gnral(context);
  if (scope?.motor !== CORELLIAN_ENGINE) return [];
  if (scope.llave_maestra === true || scope.requiere_filtro_usuario === false) return null;
  return [...new Set((Array.isArray(scope.usuarios_visibles) ? scope.usuarios_visibles : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))]
    .sort((a, b) => a - b);
}

function zoneIds_gnral(source) {
  const scope = resolvedScope_gnral(source);
  if (!scope || scope.motor !== UNITED_ENGINE) return [];
  if (scope.llave_maestra === true) return null;

  // Para usuarios normales, usuario_zop sigue siendo la autoridad territorial.
  // null se reserva para llave maestra; [] significa fail-closed sin zonas.
  return [...new Set((Array.isArray(scope.zona_ids) ? scope.zona_ids : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))]
    .sort((a, b) => a - b);
}

function zoneCodes_gnral(source) {
  const scope = resolvedScope_gnral(source);
  if (!scope || scope.motor !== UNITED_ENGINE) return [];
  if (scope.llave_maestra === true) return null;
  return [...new Set((Array.isArray(scope.zona_codigos) ? scope.zona_codigos : [])
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean))]
    .sort();
}

function failClosedScopeSql_gnral() {
  return { sql: '1 = 0', params: [] };
}

function safeAlias_gnral(alias, fallback) {
  const normalized = String(alias || fallback || '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    const error = new Error(`Alias SQL invalido para alcance de registro: ${normalized || '(vacio)'}.`);
    error.status = 500;
    error.code = 'INFORMATION_RECORD_SCOPE_CONFIGURATION_ERROR';
    throw error;
  }
  return normalized;
}

function safeColumnReference_gnral(columnSql) {
  const normalized = String(columnSql || '').trim();
  if (!/^(?:[A-Za-z_][A-Za-z0-9_]*\.)?[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    const error = new Error(`Columna SQL invalida para alcance de registro: ${normalized || '(vacia)'}.`);
    error.status = 500;
    error.code = 'INFORMATION_RECORD_SCOPE_CONFIGURATION_ERROR';
    throw error;
  }
  return normalized;
}

function buildZoneIdScopeSql_gnral(source, columnSql) {
  const scope = resolvedScope_gnral(source);
  if (!scope || scope.motor !== UNITED_ENGINE) return failClosedScopeSql_gnral();
  if (scope.llave_maestra === true) return { sql: '1 = 1', params: [] };
  const ids = zoneIds_gnral(scope);
  if (!ids.length) return failClosedScopeSql_gnral();
  const column = safeColumnReference_gnral(columnSql);
  return {
    sql: `${column} IN (${ids.map(() => '?').join(', ')})`,
    params: ids
  };
}

function buildZoneCodeScopeSql_gnral(source, columnSql) {
  const scope = resolvedScope_gnral(source);
  if (!scope || scope.motor !== UNITED_ENGINE) return failClosedScopeSql_gnral();
  if (scope.llave_maestra === true) return { sql: '1 = 1', params: [] };
  const codes = zoneCodes_gnral(scope);
  if (!codes.length) return failClosedScopeSql_gnral();
  const column = safeColumnReference_gnral(columnSql);
  return {
    sql: `UPPER(TRIM(COALESCE(${column}, ''))) IN (${codes.map(() => '?').join(', ')})`,
    params: codes
  };
}

function buildZoneCodeScopeSqlInline_gnral(source, columnSql) {
  const scope = resolvedScope_gnral(source);
  if (!scope || scope.motor !== UNITED_ENGINE) return failClosedScopeSql_gnral();
  if (scope.llave_maestra === true) return { sql: '1 = 1', params: [] };
  const codes = zoneCodes_gnral(scope);
  if (!codes.length) return failClosedScopeSql_gnral();
  const column = safeColumnReference_gnral(columnSql);
  const literals = codes.map((code) => `'${code.replace(/'/g, "''")}'`).join(', ');
  return {
    sql: `UPPER(TRIM(COALESCE(${column}, ''))) IN (${literals})`,
    params: []
  };
}

function buildPortafolioScopeSql_gnral(source, alias = 'p') {
  const scope = resolvedScope_gnral(source);
  if (!scope || scope.motor !== UNITED_ENGINE) return failClosedScopeSql_gnral();
  const built = buildResolvedPortafolioScopeSql_uni(scope, alias);
  return { sql: built.sql, params: built.params || [] };
}

function buildPortafolioScopeSqlInline_gnral(source, alias = 'p') {
  const scope = resolvedScope_gnral(source);
  if (!scope || scope.motor !== UNITED_ENGINE) return failClosedScopeSql_gnral();
  if (scope.llave_maestra === true) return { sql: '1 = 1', params: [] };
  const ids = zoneIds_gnral(scope);
  if (!ids.length) return failClosedScopeSql_gnral();
  const a = safeAlias_gnral(alias, 'p');
  return { sql: `${a}.zona_id IN (${ids.join(', ')})`, params: [] };
}

function buildTicketScopeSql_gnral(source, alias = 't') {
  const scope = resolvedScope_gnral(source);
  if (!scope || scope.motor !== UNITED_ENGINE) return failClosedScopeSql_gnral();
  const built = buildResolvedTicketScopeSql_uni(scope, alias);
  return { sql: built.sql, params: built.params || [] };
}

function buildTicketScopeSqlInline_gnral(source, alias = 't') {
  const scope = resolvedScope_gnral(source);
  if (!scope || scope.motor !== UNITED_ENGINE) return failClosedScopeSql_gnral();
  if (scope.llave_maestra === true) return { sql: '1 = 1', params: [] };
  const ids = zoneIds_gnral(scope);
  if (!ids.length) return failClosedScopeSql_gnral();
  const a = safeAlias_gnral(alias, 't');
  const idList = ids.join(', ');

  // Mantener exactamente la misma precedencia territorial del builder
  // parametrizado de alcance_uni. El builder inline se usa en consultas donde
  // no es practico propagar parametros, por lo que los ids se normalizan como
  // enteros positivos antes de interpolarlos.
  return {
    sql: `(
      (
        NULLIF(TRIM(COALESCE(${a}.codigo_equipo, '')), '') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM portafolio p_scope_uni_ticket_inline_equipo
          WHERE p_scope_uni_ticket_inline_equipo.estado_registro = 1
            AND p_scope_uni_ticket_inline_equipo.zona_id IN (${idList})
            AND TRIM(COALESCE(p_scope_uni_ticket_inline_equipo.numero_equipo, '')) = TRIM(COALESCE(${a}.codigo_equipo, ''))
        )
      )
      OR
      (
        NULLIF(TRIM(COALESCE(${a}.codigo_equipo, '')), '') IS NULL
        AND (
          NULLIF(TRIM(COALESCE(${a}.proyecto, '')), '') IS NOT NULL
          OR NULLIF(TRIM(COALESCE(${a}.proyecto_padre, '')), '') IS NOT NULL
        )
        AND (
          SELECT CASE
            WHEN COUNT(*) > 0
              AND SUM(CASE WHEN p_scope_uni_ticket_inline_project_check.zona_id IS NULL THEN 1 ELSE 0 END) = 0
              AND COUNT(DISTINCT p_scope_uni_ticket_inline_project_check.zona_id) = 1
            THEN 1 ELSE 0
          END
          FROM portafolio p_scope_uni_ticket_inline_project_check
          WHERE p_scope_uni_ticket_inline_project_check.estado_registro = 1
            AND (
              (NULLIF(TRIM(COALESCE(${a}.proyecto, '')), '') IS NOT NULL
                AND LOWER(TRIM(COALESCE(p_scope_uni_ticket_inline_project_check.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto, ''))))
              OR (NULLIF(TRIM(COALESCE(${a}.proyecto_padre, '')), '') IS NOT NULL
                AND LOWER(TRIM(COALESCE(p_scope_uni_ticket_inline_project_check.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto_padre, ''))))
            )
        ) = 1
        AND EXISTS (
          SELECT 1
          FROM portafolio p_scope_uni_ticket_inline_project
          WHERE p_scope_uni_ticket_inline_project.estado_registro = 1
            AND p_scope_uni_ticket_inline_project.zona_id IN (${idList})
            AND (
              (NULLIF(TRIM(COALESCE(${a}.proyecto, '')), '') IS NOT NULL
                AND LOWER(TRIM(COALESCE(p_scope_uni_ticket_inline_project.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto, ''))))
              OR (NULLIF(TRIM(COALESCE(${a}.proyecto_padre, '')), '') IS NOT NULL
                AND LOWER(TRIM(COALESCE(p_scope_uni_ticket_inline_project.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto_padre, ''))))
            )
        )
      )
    )`,
    params: []
  };
}

function buildInsFlScopeSql_gnral(source, alias = 'f') {
  const scope = resolvedScope_gnral(source);
  if (!scope || scope.motor !== CORELLIAN_ENGINE) return failClosedScopeSql_gnral();
  const a = safeAlias_gnral(alias, 'f');
  const built = buildResolvedUserColumnsScopeSql_cor(
    scope,
    [`${a}.id_asesor`, `${a}.id_sup`, `${a}.id_admin`]
  );
  return { sql: built.sql, params: built.params || [] };
}

async function requireTicketRecordScope_gnral(req, res, next) {
  const scope = buildTicketScopeSql_gnral(req, 't');
  const ref = String(req.params?.ticket || '').trim();
  if (!ref) return res.status(400).json({ ok: false, message: 'Ticket requerido.' });

  try {
    const [rows] = await db.query(
      `SELECT t.id
       FROM tickets t
       WHERE (
         TRIM(COALESCE(t.ticket, '')) = ?
         OR CAST(t.id AS CHAR) = ?
         OR TRIM(COALESCE(t.folio, '')) = ?
         OR TRIM(COALESCE(t.id_interno, '')) = ?
       )
         AND ${scope.sql}
       ORDER BY t.id DESC
       LIMIT 1`,
      [ref, ref, ref, ref, ...scope.params]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, message: 'Ticket no encontrado.' });
    }
    req.ticketRecordScopeId = Number(rows[0].id) || null;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function requirePortafolioEquipmentScope_gnral(req, res, next) {
  const scope = buildPortafolioScopeSql_gnral(req, 'p');
  const code = String(req.params?.codigo || '').trim();
  if (!code) return res.status(400).json({ ok: false, message: 'Equipo requerido.' });

  try {
    const [rows] = await db.query(
      `SELECT p.id_portafolio
       FROM portafolio p
       WHERE (
         TRIM(COALESCE(p.numero_equipo, '')) = TRIM(?)
         OR TRIM(COALESCE(p.identificacion_sitio, '')) = TRIM(?)
       )
         AND ${scope.sql}
       LIMIT 1`,
      [code, code, ...scope.params]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, message: 'Equipo no encontrado.' });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

async function requirePortafolioProjectScope_gnral(req, res, next) {
  const scope = buildPortafolioScopeSql_gnral(req, 'p');
  const project = String(req.params?.proyecto || req.query?.proyecto || '').trim();
  if (!project) return res.status(400).json({ ok: false, message: 'Proyecto requerido.' });

  try {
    const [rows] = await db.query(
      `SELECT p.id_portafolio
       FROM portafolio p
       WHERE LOWER(TRIM(COALESCE(p.proyecto, ''))) = LOWER(TRIM(?))
         AND ${scope.sql}
       LIMIT 1`,
      [project, ...scope.params]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, message: 'Proyecto no encontrado.' });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

async function filterPortafolioEquipmentBodyScope_gnral(req, res, next) {
  const requested = Array.from(new Set(
    (Array.isArray(req.body?.equipos) ? req.body.equipos : [])
      .map((value) => String(value == null ? '' : value).trim())
      .filter(Boolean)
  ));
  if (!requested.length) return next();

  const scope = buildPortafolioScopeSql_gnral(req, 'p');

  try {
    const [rows] = await db.query(
      `SELECT DISTINCT p.numero_equipo
       FROM portafolio p
       WHERE p.numero_equipo IN (?)
         AND ${scope.sql}`,
      [requested, ...scope.params]
    );
    const allowed = new Set(rows.map((row) => String(row.numero_equipo || '').trim()).filter(Boolean));
    req.body = {
      ...(req.body || {}),
      equipos: requested.filter((code) => allowed.has(code))
    };
    return next();
  } catch (error) {
    return next(error);
  }
}

async function requireAllUnitedZones_gnral(req, res, next) {
  const scope = resolvedScope_gnral(req);
  if (!scope || scope.motor !== UNITED_ENGINE) {
    return res.status(403).json({
      ok: false,
      code: 'INFORMATION_UNITED_SCOPE_REQUIRED',
      message: 'Esta consulta requiere alcance de informacion UNITED.'
    });
  }

  if (scope.llave_maestra === true) return next();

  const assignedIds = zoneIds_gnral(scope);
  if (!assignedIds.length) {
    return res.status(403).json({
      ok: false,
      code: 'INFORMATION_ALL_ROOMS_REQUIRED',
      message: 'Esta consulta requiere acceso a todos los cuartos UNITED.'
    });
  }

  try {
    const [rows] = await db.query(
      `SELECT id_zona
         FROM z_op
        WHERE estado = 1
        ORDER BY id_zona ASC`
    );
    const activeIds = [...new Set((Array.isArray(rows) ? rows : [])
      .map((row) => Number(row.id_zona))
      .filter((id) => Number.isInteger(id) && id > 0))]
      .sort((a, b) => a - b);

    if (!activeIds.length) {
      return res.status(503).json({
        ok: false,
        code: 'INFORMATION_ROOM_CATALOG_UNAVAILABLE',
        message: 'No fue posible validar el catalogo activo de cuartos UNITED.'
      });
    }

    const assigned = new Set(assignedIds);
    if (activeIds.every((id) => assigned.has(id))) return next();

    return res.status(403).json({
      ok: false,
      code: 'INFORMATION_ALL_ROOMS_REQUIRED',
      message: 'Esta consulta requiere acceso a todos los cuartos UNITED.'
    });
  } catch (error) {
    return next(error);
  }
}

async function requireContextualEquipmentScope_gnral(req, res, next) {
  const raw = String(req.params?.codigo || '').trim();
  if (!raw.includes('|||')) return requirePortafolioEquipmentScope_gnral(req, res, next);

  const parts = raw.split('|||');
  const project = String(parts[0] || '').trim();
  const reference = String(parts.slice(1).join('|||') || '').trim();
  if (!project || !reference) {
    return res.status(400).json({ ok: false, message: 'La referencia de Instalaciones no es valida.' });
  }

  const scope = buildInsFlScopeSql_gnral(req, 'f');
  if (scope.sql === '1 = 1') return next();

  try {
    const [rows] = await db.query(
      `SELECT f.id_ins_fl
       FROM ins_fl f
       WHERE LOWER(TRIM(COALESCE(f.proyecto, ''))) = LOWER(TRIM(?))
         AND LOWER(TRIM(COALESCE(f.referencia_sitio, ''))) = LOWER(TRIM(?))
         AND ${scope.sql}
       LIMIT 1`,
      [project, reference, ...scope.params]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, message: 'Equipo no encontrado.' });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  hasUnrestrictedUnitedScope_gnral,
  visibleUserIds_gnral,
  zoneIds_gnral,
  zoneCodes_gnral,
  buildZoneIdScopeSql_gnral,
  buildZoneCodeScopeSql_gnral,
  buildZoneCodeScopeSqlInline_gnral,
  buildPortafolioScopeSql_gnral,
  buildPortafolioScopeSqlInline_gnral,
  buildTicketScopeSql_gnral,
  buildTicketScopeSqlInline_gnral,
  buildInsFlScopeSql_gnral,
  requireTicketRecordScope_gnral,
  requirePortafolioEquipmentScope_gnral,
  requirePortafolioProjectScope_gnral,
  filterPortafolioEquipmentBodyScope_gnral,
  requireAllUnitedZones_gnral,
  requireContextualEquipmentScope_gnral
};
