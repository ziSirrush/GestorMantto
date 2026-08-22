'use strict';

const {
  GENERAL_COMPANY,
  resolveAlcanceGnral_gnral
} = require('./alcance-gnral.service');
const {
  CORELLIAN_COMPANY,
  resolveAlcanceCor_cor
} = require('./alcance-cor.service');
const {
  UNITED_COMPANY,
  resolveAlcanceUni_uni
} = require('./alcance-uni.service');

const SUPPORTED_SCOPE_COMPANIES = new Set([
  GENERAL_COMPANY,
  CORELLIAN_COMPANY,
  UNITED_COMPANY
]);

function resolverError_gnral(message, status = 500, code = 'ALCANCE_RESOLVER_ERROR') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizePositiveInteger_gnral(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function effectiveUserFromSource_gnral(source) {
  if (!source) return null;
  if (source.contextUser || source.user) return source.contextUser || source.user;
  return source;
}

function effectiveUserId_gnral(source) {
  const user = effectiveUserFromSource_gnral(source) || {};
  return normalizePositiveInteger_gnral(user.id_SB || user.id || user.user_id);
}

function assertExecutor_gnral(executor) {
  if (!executor || typeof executor.query !== 'function') {
    throw resolverError_gnral(
      'Executor SQL no disponible para resolver alcance por agrupacion.',
      500,
      'ALCANCE_RESOLVER_EXECUTOR_REQUIRED'
    );
  }
  return executor;
}

/**
 * Normaliza perm_agrupaciones.empresa al motor oficial.
 *
 * Se aceptan los valores canonicos nuevos y los valores legacy verificados
 * en la estructura/datos existentes para no exigir una migracion SQL en esta fase:
 * - GENERAL / BLT -> GENERAL
 * - texto que identifica United -> UNITED
 * - texto que identifica Corellian -> CORELLIAN
 */
function normalizeGroupingCompany_gnral(value) {
  const raw = String(value || '').trim();
  const upper = raw.toUpperCase();
  const canonical = upper.replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();

  if (canonical === 'GENERAL' || canonical === 'BLT') return GENERAL_COMPANY;
  if (canonical === 'UNITED' || canonical === 'UNITED ELEVADORES') return UNITED_COMPANY;
  if (canonical === 'CORELLIAN' || canonical === 'CORELLIAN SA DE CV') return CORELLIAN_COMPANY;
  return null;
}

function normalizeGroupingRow_gnral(row) {
  if (!row || typeof row !== 'object') return null;

  const id = normalizePositiveInteger_gnral(row.id_agrupacion);
  const code = String(row.codigo || '').trim();
  const company = normalizeGroupingCompany_gnral(row.empresa);
  const active = row.activo == null ? true : Number(row.activo) === 1;

  if (!active) {
    throw resolverError_gnral(
      `La agrupacion ${code || id || '(sin identificador)'} esta inactiva.`,
      404,
      'ALCANCE_RESOLVER_GROUPING_INACTIVE'
    );
  }

  if (!company || !SUPPORTED_SCOPE_COMPANIES.has(company)) {
    throw resolverError_gnral(
      `La empresa de la agrupacion ${code || id || '(sin identificador)'} no corresponde a GENERAL, CORELLIAN o UNITED.`,
      500,
      'ALCANCE_RESOLVER_UNSUPPORTED_COMPANY'
    );
  }

  return {
    id_agrupacion: id,
    codigo: code || null,
    nombre: String(row.nombre || '').trim() || null,
    empresa_origen: String(row.empresa || '').trim() || null,
    empresa: company,
    activo: true
  };
}

async function readGroupingByReference_gnral(executor, groupingRef) {
  const db = assertExecutor_gnral(executor);

  // Si la capa superior ya leyo la fila real de perm_agrupaciones puede
  // entregarla directamente y se evita una segunda consulta.
  if (groupingRef && typeof groupingRef === 'object' && !Array.isArray(groupingRef)) {
    if (!Object.prototype.hasOwnProperty.call(groupingRef, 'empresa')) {
      throw resolverError_gnral(
        'La agrupacion entregada al resolver no contiene perm_agrupaciones.empresa.',
        500,
        'ALCANCE_RESOLVER_GROUPING_COMPANY_REQUIRED'
      );
    }
    return normalizeGroupingRow_gnral(groupingRef);
  }

  const id = normalizePositiveInteger_gnral(groupingRef);
  const code = id ? null : String(groupingRef || '').trim();
  if (!id && !code) {
    throw resolverError_gnral(
      'Se requiere id_agrupacion, codigo o la fila de perm_agrupaciones.',
      500,
      'ALCANCE_RESOLVER_GROUPING_REQUIRED'
    );
  }

  const [rows] = id
    ? await db.query(
      `SELECT id_agrupacion, codigo, nombre, empresa, activo
         FROM perm_agrupaciones
        WHERE id_agrupacion = ?
        LIMIT 1`,
      [id]
    )
    : await db.query(
      `SELECT id_agrupacion, codigo, nombre, empresa, activo
         FROM perm_agrupaciones
        WHERE codigo = ?
        LIMIT 1`,
      [code]
    );

  if (!Array.isArray(rows) || !rows.length) {
    throw resolverError_gnral(
      `Agrupacion no encontrada: ${id || code}.`,
      404,
      'ALCANCE_RESOLVER_GROUPING_NOT_FOUND'
    );
  }

  return normalizeGroupingRow_gnral(rows[0]);
}

async function hasStoredCompleteDomain_gnral(executor, source, company) {
  const db = assertExecutor_gnral(executor);
  const userId = effectiveUserId_gnral(source);
  if (!userId) {
    throw resolverError_gnral(
      'Usuario efectivo no disponible para validar llave maestra.',
      401,
      'ALCANCE_RESOLVER_USER_REQUIRED'
    );
  }

  // Las llaves de dominio son independientes y se validan siempre contra el
  // dominio exacto que resolvio la agrupacion.
  if (!SUPPORTED_SCOPE_COMPANIES.has(company)) return false;

  const [rows] = await db.query(
    `SELECT id_alcance
       FROM usuarios_alcance_informacion
      WHERE id_usuario = ?
        AND activo = 1
        AND tipo_alcance = 'DOMINIO_COMPLETO'
        AND UPPER(TRIM(dominio)) = ?
      LIMIT 1`,
    [userId, company]
  );

  return Array.isArray(rows) && rows.length > 0;
}

async function hasStoredGroupingDoor_gnral(executor, source, grouping) {
  const db = assertExecutor_gnral(executor);
  const userId = effectiveUserId_gnral(source);
  if (!userId) {
    throw resolverError_gnral(
      'Usuario efectivo no disponible para validar puerta de informacion.',
      401,
      'ALCANCE_RESOLVER_USER_REQUIRED'
    );
  }

  const normalizedGrouping = grouping && grouping.empresa
    ? normalizeGroupingRow_gnral(grouping)
    : await readGroupingByReference_gnral(db, grouping);

  if (normalizedGrouping.empresa === GENERAL_COMPANY) return true;
  if (!normalizedGrouping.id_agrupacion) return false;

  const [rows] = await db.query(
    `SELECT id_alcance
       FROM usuarios_alcance_informacion
      WHERE id_usuario = ?
        AND activo = 1
        AND tipo_alcance = 'AGRUPACION'
        AND id_agrupacion = ?
      LIMIT 1`,
    [userId, normalizedGrouping.id_agrupacion]
  );
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Valida la segunda pregunta del modelo oficial: "Tengo acceso a la puerta?".
 * GENERAL es la puerta por defecto. CORELLIAN y UNITED requieren una puerta
 * AGRUPACION explicita o la llave maestra DOMINIO_COMPLETO del dominio.
 */
async function resolveInformationDoor_gnral(executor, source, groupingRef, options = {}) {
  const db = assertExecutor_gnral(executor);
  const grouping = await readGroupingByReference_gnral(db, groupingRef);

  if (grouping.empresa === GENERAL_COMPANY) {
    const master = await resolveMasterAccess_gnral(db, source, GENERAL_COMPANY, options);
    return {
      allowed: true,
      grouping,
      masterAccess: master.enabled,
      via: master.enabled ? (master.source || 'DOMINIO_COMPLETO') : 'GENERAL_DEFAULT'
    };
  }

  const master = await resolveMasterAccess_gnral(db, source, grouping.empresa, options);
  if (master.enabled) {
    return {
      allowed: true,
      grouping,
      masterAccess: true,
      via: master.source || 'DOMINIO_COMPLETO'
    };
  }

  const groupingAllowed = await hasStoredGroupingDoor_gnral(db, source, grouping);
  return {
    allowed: groupingAllowed,
    grouping,
    masterAccess: false,
    via: groupingAllowed ? 'AGRUPACION' : null
  };
}

async function resolveMasterAccess_gnral(executor, source, company, options = {}) {
  if (options.masterAccess === true) {
    return { enabled: true, source: 'VALIDADO_POR_CAPA_SUPERIOR' };
  }
  if (options.masterAccess === false) {
    return { enabled: false, source: null };
  }

  const stored = await hasStoredCompleteDomain_gnral(executor, source, company);
  return {
    enabled: stored,
    source: stored ? 'DOMINIO_COMPLETO' : null
  };
}

async function resolveAlcanceByGrouping_gnral(executor, source, groupingRef, options = {}) {
  const db = assertExecutor_gnral(executor);
  const userId = effectiveUserId_gnral(source);
  if (!userId) {
    throw resolverError_gnral(
      'Usuario efectivo no disponible para resolver alcance.',
      401,
      'ALCANCE_RESOLVER_USER_REQUIRED'
    );
  }

  const grouping = await readGroupingByReference_gnral(db, groupingRef);
  const master = await resolveMasterAccess_gnral(db, source, grouping.empresa, options);
  const engineOptions = { masterAccess: master.enabled };

  let scope;
  if (grouping.empresa === GENERAL_COMPANY) {
    scope = resolveAlcanceGnral_gnral(source, engineOptions);
  } else if (grouping.empresa === CORELLIAN_COMPANY) {
    scope = await resolveAlcanceCor_cor(db, source, engineOptions);
  } else if (grouping.empresa === UNITED_COMPANY) {
    scope = await resolveAlcanceUni_uni(db, source, engineOptions);
  } else {
    // Defensa adicional: normalizeGroupingRow_gnral ya debe impedir llegar aqui.
    throw resolverError_gnral(
      `No existe motor de alcance para ${grouping.empresa || '(sin empresa)'}.`,
      500,
      'ALCANCE_RESOLVER_ENGINE_NOT_FOUND'
    );
  }

  return {
    ...scope,
    agrupacion: grouping,
    resolver: {
      empresa_origen: grouping.empresa_origen,
      empresa_normalizada: grouping.empresa,
      motor: scope.motor,
      llave_maestra: master.enabled,
      llave_maestra_fuente: master.source
    }
  };
}

module.exports = {
  SUPPORTED_SCOPE_COMPANIES,
  normalizeGroupingCompany_gnral,
  normalizeGroupingRow_gnral,
  readGroupingByReference_gnral,
  hasStoredCompleteDomain_gnral,
  hasStoredGroupingDoor_gnral,
  resolveInformationDoor_gnral,
  resolveMasterAccess_gnral,
  resolveAlcanceByGrouping_gnral
};
