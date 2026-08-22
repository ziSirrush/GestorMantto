'use strict';

const CORELLIAN_COMPANY = 'CORELLIAN';
const CORELLIAN_ENGINE = 'alcance_cor';
const CORELLIAN_MODE = 'PERSONAS_VISIBLES';

function configurationError_cor(message) {
  const error = new Error(message);
  error.status = 500;
  error.code = 'ALCANCE_COR_CONFIGURATION_ERROR';
  return error;
}

function normalizePositiveInteger_cor(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizePositiveIds_cor(values) {
  const source = Array.isArray(values) ? values : [];
  return [...new Set(source
    .map(normalizePositiveInteger_cor)
    .filter(Boolean))]
    .sort((a, b) => a - b);
}

function effectiveUserFromSource_cor(source) {
  if (!source) return null;
  if (source.contextUser || source.user) return source.contextUser || source.user;
  return source;
}

function normalizeEffectiveUser_cor(source) {
  const user = effectiveUserFromSource_cor(source) || {};
  return {
    id: normalizePositiveInteger_cor(user.id_SB || user.id || user.user_id)
  };
}

function normalizeOptions_cor(options = {}) {
  return {
    // La llave maestra NO se detecta dentro de este motor.
    // Debe venir validada por una capa superior.
    masterAccess: options.masterAccess === true
  };
}

function assertExecutor_cor(executor) {
  if (!executor || typeof executor.query !== 'function') {
    throw configurationError_cor('Executor SQL no disponible para alcance CORELLIAN.');
  }
  return executor;
}

function safeAlias_cor(alias, fallback) {
  const normalized = String(alias || fallback || '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    throw configurationError_cor(`Alias SQL invalido para alcance CORELLIAN: ${normalized || '(vacio)'}.`);
  }
  return normalized;
}

function safeColumnReference_cor(columnSql) {
  const normalized = String(columnSql || '').trim();
  if (!/^(?:[A-Za-z_][A-Za-z0-9_]*\.)?[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    throw configurationError_cor(`Columna SQL invalida para alcance CORELLIAN: ${normalized || '(vacia)'}.`);
  }
  return normalized;
}

async function readCorellianScopeConfig_cor(executor, userId) {
  const db = assertExecutor_cor(executor);
  const id = normalizePositiveInteger_cor(userId);
  if (!id) {
    const error = new Error('Usuario efectivo no disponible para alcance CORELLIAN.');
    error.status = 401;
    error.code = 'ALCANCE_COR_USER_REQUIRED';
    throw error;
  }

  const [rows] = await db.query(
    `SELECT tipo_alcance, id_usuario_visible
       FROM usuarios_alcance_informacion
      WHERE id_usuario = ?
        AND activo = 1
        AND tipo_alcance IN ('REPORTA_A', 'REL_ADMIN', 'USUARIO')
      ORDER BY id_alcance ASC`,
    [id]
  );

  let verReportaA = false;
  let verRelAdmin = false;
  const additionalIds = new Set();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const type = String(row.tipo_alcance || '').trim().toUpperCase();
    if (type === 'REPORTA_A') {
      verReportaA = true;
      return;
    }
    if (type === 'REL_ADMIN') {
      verRelAdmin = true;
      return;
    }
    if (type === 'USUARIO') {
      const visibleId = normalizePositiveInteger_cor(row.id_usuario_visible);
      if (visibleId && visibleId !== id) additionalIds.add(visibleId);
    }
  });

  return {
    ver_propio: true,
    ver_reporta_a: verReportaA,
    ver_rel_admin: verRelAdmin,
    usuarios_adicionales: [...additionalIds].sort((a, b) => a - b)
  };
}

async function resolveReportaAUsers_cor(executor, userId) {
  const db = assertExecutor_cor(executor);
  const [rows] = await db.query(
    `SELECT id_SB
       FROM usuarios
      WHERE reporta_a = ?
        AND estado = 1
      ORDER BY id_SB ASC`,
    [userId]
  );

  return normalizePositiveIds_cor((Array.isArray(rows) ? rows : []).map((row) => row.id_SB));
}

async function resolveRelAdminUsers_cor(executor, userId) {
  const db = assertExecutor_cor(executor);
  const [rows] = await db.query(
    `SELECT DISTINCT ura.id_asesor AS id_SB
       FROM usuarios_rel_admin ura
       INNER JOIN usuarios u
         ON u.id_SB = ura.id_asesor
        AND u.estado = 1
      WHERE ura.id_admin = ?
      ORDER BY ura.id_asesor ASC`,
    [userId]
  );

  return normalizePositiveIds_cor((Array.isArray(rows) ? rows : []).map((row) => row.id_SB));
}

async function resolveAlcanceCor_cor(executor, source, options = {}) {
  const user = normalizeEffectiveUser_cor(source);
  const normalizedOptions = normalizeOptions_cor(options);

  if (!user.id) {
    const error = new Error('Usuario efectivo no disponible para alcance CORELLIAN.');
    error.status = 401;
    error.code = 'ALCANCE_COR_USER_REQUIRED';
    throw error;
  }

  if (normalizedOptions.masterAccess) {
    return {
      motor: CORELLIAN_ENGINE,
      empresa: CORELLIAN_COMPANY,
      modo: 'LLAVE_MAESTRA',
      llave_maestra: true,
      effective_user_id: user.id,
      reglas: {
        ver_propio: true,
        ver_reporta_a: false,
        ver_rel_admin: false,
        usuarios_adicionales: false,
        zonas_operativas: false
      },
      usuarios_automaticos: null,
      usuarios_adicionales: null,
      usuarios_visibles: null,
      requiere_filtro_usuario: false
    };
  }

  const config = await readCorellianScopeConfig_cor(executor, user.id);
  const automaticIds = new Set([user.id]);

  if (config.ver_reporta_a) {
    const reportaAIds = await resolveReportaAUsers_cor(executor, user.id);
    reportaAIds.forEach((id) => automaticIds.add(id));
  }

  if (config.ver_rel_admin) {
    const relAdminIds = await resolveRelAdminUsers_cor(executor, user.id);
    relAdminIds.forEach((id) => automaticIds.add(id));
  }

  const automaticUsers = [...automaticIds].sort((a, b) => a - b);
  const additionalUsers = normalizePositiveIds_cor(config.usuarios_adicionales)
    .filter((id) => id !== user.id);
  const visibleUsers = normalizePositiveIds_cor([
    ...automaticUsers,
    ...additionalUsers
  ]);

  return {
    motor: CORELLIAN_ENGINE,
    empresa: CORELLIAN_COMPANY,
    modo: CORELLIAN_MODE,
    llave_maestra: false,
    effective_user_id: user.id,
    reglas: {
      ver_propio: true,
      ver_reporta_a: Boolean(config.ver_reporta_a),
      ver_rel_admin: Boolean(config.ver_rel_admin),
      usuarios_adicionales: true,
      zonas_operativas: false
    },
    usuarios_automaticos: automaticUsers,
    usuarios_adicionales: additionalUsers,
    usuarios_visibles: visibleUsers,
    requiere_filtro_usuario: true
  };
}

function unrestrictedScopeSql_cor(context) {
  return { sql: '1 = 1', params: [], alcance: context };
}

function failClosedScopeSql_cor(context) {
  return { sql: '1 = 0', params: [], alcance: context };
}

function placeholders_cor(count) {
  return Array.from({ length: count }, () => '?').join(', ');
}

function buildResolvedUserColumnsScopeSql_cor(context, columns) {
  if (!context || context.motor !== CORELLIAN_ENGINE) {
    throw configurationError_cor('Contexto de alcance CORELLIAN invalido.');
  }
  if (context.llave_maestra === true || context.requiere_filtro_usuario === false) {
    return unrestrictedScopeSql_cor(context);
  }

  const safeColumns = [...new Set((Array.isArray(columns) ? columns : [columns])
    .map(safeColumnReference_cor))];
  if (!safeColumns.length) {
    throw configurationError_cor('Se requiere al menos una columna de usuario para filtrar CORELLIAN.');
  }

  const visibleIds = normalizePositiveIds_cor(context.usuarios_visibles);
  if (!visibleIds.length) return failClosedScopeSql_cor(context);

  const inSql = placeholders_cor(visibleIds.length);
  const clauses = [];
  const params = [];

  safeColumns.forEach((column) => {
    clauses.push(`${column} IN (${inSql})`);
    params.push(...visibleIds);
  });

  return {
    sql: `(${clauses.join(' OR ')})`,
    params,
    alcance: context
  };
}

async function buildUserColumnsScopeSql_cor(executor, source, columns, options = {}) {
  const context = await resolveAlcanceCor_cor(executor, source, options);
  return buildResolvedUserColumnsScopeSql_cor(context, columns);
}

async function buildInsFlScopeSql_cor(executor, source, alias = 'f', options = {}) {
  const a = safeAlias_cor(alias, 'f');
  return buildUserColumnsScopeSql_cor(
    executor,
    source,
    [`${a}.id_asesor`, `${a}.id_sup`, `${a}.id_admin`],
    options
  );
}

function alcanceCorAllowsUser_cor(context, userId) {
  const id = normalizePositiveInteger_cor(userId);
  if (!context || context.motor !== CORELLIAN_ENGINE || !id) return false;
  if (context.llave_maestra === true || context.requiere_filtro_usuario === false) return true;
  return normalizePositiveIds_cor(context.usuarios_visibles).includes(id);
}

module.exports = {
  CORELLIAN_COMPANY,
  CORELLIAN_ENGINE,
  CORELLIAN_MODE,
  normalizeEffectiveUser_cor,
  readCorellianScopeConfig_cor,
  resolveReportaAUsers_cor,
  resolveRelAdminUsers_cor,
  resolveAlcanceCor_cor,
  buildResolvedUserColumnsScopeSql_cor,
  buildUserColumnsScopeSql_cor,
  buildInsFlScopeSql_cor,
  alcanceCorAllowsUser_cor
};
