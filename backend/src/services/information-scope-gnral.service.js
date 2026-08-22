'use strict';

const VALID_DOMAINS = new Set(['GENERAL', 'UNITED', 'CORELLIAN']);

function scopedError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeBoolean(value) {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0' || value == null) return false;
  return Boolean(value);
}

function normalizePositiveIds(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

function domainFromGroupingCompany_gnral(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/[.,]/g, '').replace(/\s+/g, ' ');
  if (normalized === 'GENERAL' || normalized === 'BLT') return 'GENERAL';
  if (normalized === 'UNITED' || normalized === 'UNITED ELEVADORES') return 'UNITED';
  if (normalized === 'CORELLIAN' || normalized === 'CORELLIAN SA DE CV') return 'CORELLIAN';
  return null;
}

function normalizeInformationScopePayload_gnral(body, userId) {
  const source = body || {};
  const rawDomains = source.dominios_completos == null ? [] : source.dominios_completos;
  if (!Array.isArray(rawDomains)) {
    throw scopedError('dominios_completos debe ser un arreglo.');
  }

  const domains = [...new Set(rawDomains.map((value) => String(value || '').trim().toUpperCase()))];
  const invalidDomains = domains.filter((domain) => !VALID_DOMAINS.has(domain));
  if (invalidDomains.length) {
    throw scopedError(`Dominio de alcance invalido: ${invalidDomains.join(', ')}.`);
  }

  const rawGroupings = source.agrupaciones == null
    ? (source.agrupaciones_acceso == null ? [] : source.agrupaciones_acceso)
    : source.agrupaciones;
  if (!Array.isArray(rawGroupings)) {
    throw scopedError('agrupaciones debe ser un arreglo.');
  }

  const additionalIds = normalizePositiveIds(source.usuarios_adicionales);
  if (additionalIds.includes(Number(userId))) {
    throw scopedError('El usuario configurado no puede agregarse tambien como usuario adicional.');
  }

  return {
    dominios_completos: domains.sort(),
    agrupaciones: normalizePositiveIds(rawGroupings).sort((a, b) => a - b),
    // Regla global: cada usuario siempre ve su propia informacion.
    // Se devuelve en el contrato, pero no depende de una fila persistida.
    ver_propio: true,
    ver_reporta_a: normalizeBoolean(source.ver_reporta_a),
    ver_rel_admin: normalizeBoolean(source.ver_rel_admin),
    usuarios_adicionales: additionalIds.sort((a, b) => a - b)
  };
}

async function readInformationScope_gnral(connection, userId) {
  const [rows] = await connection.query(
    `SELECT id_alcance, tipo_alcance, dominio, id_agrupacion, id_usuario_visible
       FROM usuarios_alcance_informacion
      WHERE id_usuario = ?
        AND activo = 1
      ORDER BY id_alcance ASC`,
    [userId]
  );

  const domains = new Set();
  const groupings = new Set();
  const additionalIds = new Set();
  const own = true;
  let reports = false;
  let relAdmin = false;

  rows.forEach((row) => {
    const type = String(row.tipo_alcance || '').trim().toUpperCase();
    if (type === 'DOMINIO_COMPLETO') {
      const domain = String(row.dominio || '').trim().toUpperCase();
      if (VALID_DOMAINS.has(domain)) domains.add(domain);
      return;
    }
    if (type === 'AGRUPACION') {
      const groupingId = Number(row.id_agrupacion);
      if (Number.isInteger(groupingId) && groupingId > 0) groupings.add(groupingId);
      return;
    }
    if (type === 'REPORTA_A') {
      reports = true;
      return;
    }
    if (type === 'REL_ADMIN') {
      relAdmin = true;
      return;
    }
    if (type === 'USUARIO') {
      const visibleId = Number(row.id_usuario_visible);
      if (!Number.isInteger(visibleId) || visibleId <= 0) return;
      if (visibleId !== Number(userId)) additionalIds.add(visibleId);
    }
  });

  return {
    dominios_completos: [...domains].sort(),
    agrupaciones: [...groupings].sort((a, b) => a - b),
    ver_propio: own,
    ver_reporta_a: reports,
    ver_rel_admin: relAdmin,
    usuarios_adicionales: [...additionalIds].sort((a, b) => a - b)
  };
}

async function assertUsersExist_gnral(connection, userIds) {
  const ids = normalizePositiveIds(userIds);
  if (!ids.length) return;

  const [rows] = await connection.query(
    'SELECT id_SB FROM usuarios WHERE id_SB IN (?)',
    [ids]
  );
  const existing = new Set(rows.map((row) => Number(row.id_SB)));
  const missing = ids.filter((id) => !existing.has(id));
  if (missing.length) {
    throw scopedError(`Uno o mas usuarios adicionales no existen: ${missing.join(', ')}.`);
  }
}

async function readInformationScopeGroupingCatalog_gnral(connection, groupingIds = null) {
  const ids = groupingIds == null ? null : normalizePositiveIds(groupingIds);
  if (Array.isArray(ids) && !ids.length) return [];

  const params = [];
  let whereIds = '';
  if (ids) {
    whereIds = ' AND id_agrupacion IN (?)';
    params.push(ids);
  }

  const [rows] = await connection.query(
    `SELECT id_agrupacion, codigo, nombre, empresa, orden, activo
       FROM perm_agrupaciones
      WHERE activo = 1${whereIds}
      ORDER BY orden ASC, id_agrupacion ASC`,
    params
  );

  return rows.map((row) => ({
    ...row,
    id_agrupacion: Number(row.id_agrupacion),
    dominio: domainFromGroupingCompany_gnral(row.empresa)
  }));
}

async function assertInformationScopeGroupings_gnral(connection, groupingIds) {
  const ids = normalizePositiveIds(groupingIds);
  if (!ids.length) return [];

  const rows = await readInformationScopeGroupingCatalog_gnral(connection, ids);
  const byId = new Map(rows.map((row) => [Number(row.id_agrupacion), row]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) {
    throw scopedError(`Una o mas agrupaciones no existen o estan inactivas: ${missing.join(', ')}.`);
  }

  const unsupported = rows.filter((row) => !VALID_DOMAINS.has(row.dominio));
  if (unsupported.length) {
    throw scopedError(
      `Las agrupaciones ${unsupported.map((row) => row.codigo || row.id_agrupacion).join(', ')} no pertenecen a GENERAL, UNITED o CORELLIAN.`
    );
  }

  return rows;
}

async function replaceInformationScope_gnral(connection, userId, payload, actorId, options = {}) {
  const normalized = normalizeInformationScopePayload_gnral(payload, userId);
  const preserveAdditionalUsers = options.preserveAdditionalUsers === true;

  await assertUsersExist_gnral(connection, normalized.usuarios_adicionales);
  const groupingRows = await assertInformationScopeGroupings_gnral(connection, normalized.agrupaciones);

  const fullDomains = new Set(normalized.dominios_completos);
  const effectiveGroupingIds = groupingRows
    .filter((row) => !fullDomains.has(row.dominio))
    .map((row) => Number(row.id_agrupacion))
    .sort((a, b) => a - b);

  if (preserveAdditionalUsers) {
    await connection.query(
      `UPDATE usuarios_alcance_informacion
          SET activo = 0,
              updated_by = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id_usuario = ?
          AND activo = 1
          AND tipo_alcance <> 'USUARIO'`,
      [actorId, userId]
    );
  } else {
    await connection.query(
      `UPDATE usuarios_alcance_informacion
          SET activo = 0,
              updated_by = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id_usuario = ?
          AND activo = 1`,
      [actorId, userId]
    );
  }

  const rows = [];
  normalized.dominios_completos.forEach((domain) => {
    rows.push([userId, 'DOMINIO_COMPLETO', domain, null, null, actorId, actorId]);
  });
  effectiveGroupingIds.forEach((groupingId) => {
    rows.push([userId, 'AGRUPACION', null, groupingId, null, actorId, actorId]);
  });
  if (normalized.ver_reporta_a) {
    rows.push([userId, 'REPORTA_A', null, null, null, actorId, actorId]);
  }
  if (normalized.ver_rel_admin) {
    rows.push([userId, 'REL_ADMIN', null, null, null, actorId, actorId]);
  }
  if (!preserveAdditionalUsers) {
    normalized.usuarios_adicionales.forEach((visibleId) => {
      rows.push([userId, 'USUARIO', null, null, visibleId, actorId, actorId]);
    });
  }

  for (const [configuredUserId, type, domain, groupingId, visibleId, createdBy, updatedBy] of rows) {
    await connection.query(
      `INSERT INTO usuarios_alcance_informacion
        (id_usuario, tipo_alcance, dominio, id_agrupacion, id_usuario_visible, activo, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [configuredUserId, type, domain, groupingId, visibleId, createdBy, updatedBy]
    );
  }

  return readInformationScope_gnral(connection, userId);
}

async function activateInformationScopeBulk_gnral(connection, userIds, activation, actorId) {
  const ids = normalizePositiveIds(userIds);
  if (!ids.length) throw scopedError('Selecciona al menos un usuario para la activacion masiva.');
  if (ids.length > 200) throw scopedError('La activacion masiva admite como maximo 200 usuarios por operacion.');

  const source = activation || {};
  const rawDomains = Array.isArray(source.dominios_completos) ? source.dominios_completos : [];
  const domains = [...new Set(rawDomains.map((value) => String(value || '').trim().toUpperCase()))];
  const invalidDomains = domains.filter((domain) => !VALID_DOMAINS.has(domain));
  if (invalidDomains.length) throw scopedError(`Dominio de alcance invalido: ${invalidDomains.join(', ')}.`);

  const groupingIds = normalizePositiveIds(source.agrupaciones);
  await assertInformationScopeGroupings_gnral(connection, groupingIds);

  const flags = {
    // Propio es implicito y no requiere activacion masiva.
    ver_propio: true,
    ver_reporta_a: normalizeBoolean(source.ver_reporta_a),
    ver_rel_admin: normalizeBoolean(source.ver_rel_admin)
  };
  if (!domains.length && !groupingIds.length && !flags.ver_reporta_a && !flags.ver_rel_admin) {
    throw scopedError('Selecciona al menos una opcion para activar masivamente.');
  }

  await assertUsersExist_gnral(connection, ids);
  for (const userId of ids) {
    const current = await readInformationScope_gnral(connection, userId);
    const merged = {
      dominios_completos: [...new Set([...(current.dominios_completos || []), ...domains])],
      agrupaciones: [...new Set([...(current.agrupaciones || []), ...groupingIds])],
      ver_propio: true,
      ver_reporta_a: Boolean(current.ver_reporta_a || flags.ver_reporta_a),
      ver_rel_admin: Boolean(current.ver_rel_admin || flags.ver_rel_admin),
      usuarios_adicionales: [...(current.usuarios_adicionales || [])]
    };
    await replaceInformationScope_gnral(
      connection,
      userId,
      merged,
      actorId,
      { preserveAdditionalUsers: true }
    );
  }

  return {
    usuarios_actualizados: ids.length,
    usuario_ids: ids,
    activado: {
      dominios_completos: domains.sort(),
      agrupaciones: groupingIds.sort((a, b) => a - b),
      ...flags
    }
  };
}

async function resolveInformationScope_gnral(connection, userId) {
  const config = await readInformationScope_gnral(connection, userId);
  const groupingDetails = await readInformationScopeGroupingCatalog_gnral(
    connection,
    config.agrupaciones || []
  );
  const automaticUserIds = new Set([Number(userId)]);

  if (config.ver_reporta_a) {
    const [rows] = await connection.query(
      `SELECT id_SB
         FROM usuarios
        WHERE reporta_a = ?
          AND estado = 1
        ORDER BY id_SB ASC`,
      [userId]
    );
    rows.forEach((row) => automaticUserIds.add(Number(row.id_SB)));
  }

  if (config.ver_rel_admin) {
    const [rows] = await connection.query(
      `SELECT DISTINCT ura.id_asesor AS id_SB
         FROM usuarios_rel_admin ura
         INNER JOIN usuarios u
           ON u.id_SB = ura.id_asesor
          AND u.estado = 1
        WHERE ura.id_admin = ?
        ORDER BY ura.id_asesor ASC`,
      [userId]
    );
    rows.forEach((row) => automaticUserIds.add(Number(row.id_SB)));
  }

  const automaticIds = [...automaticUserIds]
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((a, b) => a - b);
  const visibleUserIds = new Set([...automaticIds, ...(config.usuarios_adicionales || [])]);

  return {
    ...config,
    agrupaciones_detalle: groupingDetails,
    acceso_general: {
      dominios_completos: [...config.dominios_completos],
      agrupaciones: [...config.agrupaciones],
      agrupaciones_detalle: groupingDetails
    },
    alcance_automatico: {
      ver_propio: true,
      ver_reporta_a: Boolean(config.ver_reporta_a),
      ver_rel_admin: Boolean(config.ver_rel_admin),
      usuarios: automaticIds
    },
    usuarios_automaticos: automaticIds,
    usuarios_visibles: [...visibleUserIds]
      .filter((id) => Number.isInteger(id) && id > 0)
      .sort((a, b) => a - b)
  };
}

function effectiveUserIdFromContext_gnral(actionContext) {
  const effectiveUser = actionContext?.contextUser || actionContext?.user || actionContext || null;
  const userId = Number(effectiveUser?.id_SB || effectiveUser?.id || effectiveUser?.user_id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw scopedError('Usuario efectivo no disponible.', 401);
  }
  return userId;
}

async function resolveInformationScopeForContext_gnral(connection, actionContext) {
  const userId = effectiveUserIdFromContext_gnral(actionContext);
  return resolveInformationScope_gnral(connection, userId);
}

function hasCompleteDomain_gnral(scope, domain) {
  const normalizedDomain = String(domain || '').trim().toUpperCase();
  return Array.isArray(scope?.dominios_completos)
    && scope.dominios_completos.includes(normalizedDomain);
}

function hasInformationScopeGrouping_gnral(scope, groupingId) {
  const id = Number(groupingId);
  if (!Number.isInteger(id) || id <= 0) return false;
  return normalizePositiveIds(scope?.agrupaciones).includes(id);
}

function accessGeneralAllows_gnral(scope, { domain = null, groupingId = null } = {}) {
  const normalizedDomain = String(domain || '').trim().toUpperCase();
  if (normalizedDomain && hasCompleteDomain_gnral(scope, normalizedDomain)) return true;

  const id = Number(groupingId);
  if (!Number.isInteger(id) || id <= 0 || !hasInformationScopeGrouping_gnral(scope, id)) return false;
  if (!normalizedDomain) return true;

  const details = Array.isArray(scope?.agrupaciones_detalle)
    ? scope.agrupaciones_detalle
    : (Array.isArray(scope?.acceso_general?.agrupaciones_detalle)
      ? scope.acceso_general.agrupaciones_detalle
      : []);

  // Si el Guard solicita dominio + agrupacion, se valida que ambos correspondan.
  // Sin detalle de catalogo se cierra el acceso para no aceptar cruces de empresa.
  return details.some((row) =>
    Number(row?.id_agrupacion) === id
    && String(row?.dominio || '').trim().toUpperCase() === normalizedDomain
  );
}

function automaticScopeAllowsUser_gnral(scope, userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return false;
  return normalizePositiveIds(scope?.usuarios_automaticos || scope?.alcance_automatico?.usuarios).includes(id);
}

function additionalScopeAllowsUser_gnral(scope, userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return false;
  return normalizePositiveIds(scope?.usuarios_adicionales).includes(id);
}

function informationScopeRuntimeMode_gnral() {
  const value = String(process.env.INFORMATION_SCOPE_MODE || 'ENFORCED')
    .trim()
    .toUpperCase();
  return value === 'LEGACY' ? 'LEGACY' : 'ENFORCED';
}

function informationScopeAutoFallback_gnral() {
  return ['1', 'true', 'yes', 'on'].includes(
    String(process.env.INFORMATION_SCOPE_FALLBACK_ON_ERROR || '')
      .trim()
      .toLowerCase()
  );
}

function technicalScopeError_gnral(error) {
  const status = Number(error?.statusCode || error?.status || 0);
  if (status >= 400 && status < 500) return false;
  return true;
}

async function runInformationScopeWithFallback_gnral({ modern, legacy, label = 'information-scope' }) {
  if (typeof modern !== 'function') {
    throw scopedError('Resolver moderno de alcance no disponible.', 500);
  }
  if (informationScopeRuntimeMode_gnral() === 'LEGACY') {
    if (typeof legacy !== 'function') {
      throw scopedError('El modo LEGACY fue solicitado, pero no existe un resolver de respaldo.', 500);
    }
    return legacy();
  }

  try {
    return await modern();
  } catch (error) {
    if (!informationScopeAutoFallback_gnral() || !technicalScopeError_gnral(error) || typeof legacy !== 'function') {
      throw error;
    }
    console.warn(`[INFORMATION_SCOPE_FALLBACK] ${label}: ${error.message || error}`);
    return legacy();
  }
}

async function listVisibleUserProfiles_gnral(connection, scope) {
  const ids = normalizePositiveIds(scope?.usuarios_visibles);
  if (!ids.length) return [];
  const [rows] = await connection.query(
    `SELECT id_SB, nombre, iniciales, puesto, area, empresa, estado
       FROM usuarios
      WHERE id_SB IN (?)
        AND estado = 1
      ORDER BY nombre ASC, id_SB ASC`,
    [ids]
  );
  return rows;
}

// Compatibilidad temporal con consumidores existentes. La nueva capa Guard General
// de Fase 3 usara accessGeneralAllows_gnral + automatic/additionalScopeAllowsUser_gnral.
function scopeAllowsUser_gnral(scope, userId, domain = null) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return false;
  if (domain && hasCompleteDomain_gnral(scope, domain)) return true;
  return normalizePositiveIds(scope?.usuarios_visibles).includes(id);
}

module.exports = {
  VALID_DOMAINS,
  normalizeInformationScopePayload_gnral,
  readInformationScope_gnral,
  assertUsersExist_gnral,
  readInformationScopeGroupingCatalog_gnral,
  assertInformationScopeGroupings_gnral,
  replaceInformationScope_gnral,
  activateInformationScopeBulk_gnral,
  resolveInformationScope_gnral,
  effectiveUserIdFromContext_gnral,
  resolveInformationScopeForContext_gnral,
  hasCompleteDomain_gnral,
  hasInformationScopeGrouping_gnral,
  accessGeneralAllows_gnral,
  automaticScopeAllowsUser_gnral,
  additionalScopeAllowsUser_gnral,
  informationScopeRuntimeMode_gnral,
  informationScopeAutoFallback_gnral,
  runInformationScopeWithFallback_gnral,
  listVisibleUserProfiles_gnral,
  scopeAllowsUser_gnral,
  domainFromGroupingCompany_gnral
};
