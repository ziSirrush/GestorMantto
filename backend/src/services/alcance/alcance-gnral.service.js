'use strict';

const GENERAL_COMPANY = 'GENERAL';
const GENERAL_ENGINE = 'alcance_gnral';
const GENERAL_MODE = 'RELACION_DIRECTA';

function configurationError_gnral(message) {
  const error = new Error(message);
  error.status = 500;
  error.code = 'ALCANCE_GNRAL_CONFIGURATION_ERROR';
  return error;
}

function normalizePositiveInteger_gnral(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeEmail_gnral(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeInitials_gnral(value) {
  return String(value || '').trim().toUpperCase();
}

function effectiveUserFromSource_gnral(source) {
  if (!source) return null;
  if (source.contextUser || source.user) return source.contextUser || source.user;
  return source;
}

function normalizeEffectiveUser_gnral(source) {
  const user = effectiveUserFromSource_gnral(source) || {};
  return {
    id: normalizePositiveInteger_gnral(user.id_SB || user.id || user.user_id),
    correo: normalizeEmail_gnral(user.correo || user.email),
    iniciales: normalizeInitials_gnral(user.iniciales || user.initials)
  };
}

function normalizeOptions_gnral(options = {}) {
  return {
    // Esta bandera NO detecta roles ni permisos por si sola.
    // Solo puede activarla una capa superior despues de validar una llave maestra real.
    masterAccess: options.masterAccess === true
  };
}

function resolveAlcanceGnral_gnral(source, options = {}) {
  const user = normalizeEffectiveUser_gnral(source);
  const normalizedOptions = normalizeOptions_gnral(options);

  if (!user.id) {
    const error = new Error('Usuario efectivo no disponible para alcance GENERAL.');
    error.status = 401;
    error.code = 'ALCANCE_GNRAL_USER_REQUIRED';
    throw error;
  }

  return {
    motor: GENERAL_ENGINE,
    empresa: GENERAL_COMPANY,
    modo: normalizedOptions.masterAccess ? 'LLAVE_MAESTRA' : GENERAL_MODE,
    llave_maestra: normalizedOptions.masterAccess,
    effective_user_id: user.id,
    identidad: {
      correo: user.correo || null,
      iniciales: user.iniciales || null
    },
    reglas: {
      creado_por: true,
      asignado_a: true,
      relacionado: true,
      reporta_a: false,
      rel_admin: false,
      zonas_operativas: false
    }
  };
}

function safeAlias_gnral(alias, fallback) {
  const normalized = String(alias || fallback || '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    throw configurationError_gnral(`Alias SQL invalido para alcance GENERAL: ${normalized || '(vacio)'}.`);
  }
  return normalized;
}

function safeColumnReference_gnral(columnSql) {
  const normalized = String(columnSql || '').trim();
  if (!/^(?:[A-Za-z_][A-Za-z0-9_]*\.)?[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    throw configurationError_gnral(`Columna SQL invalida para alcance GENERAL: ${normalized || '(vacia)'}.`);
  }
  return normalized;
}

function unrestrictedScopeSql_gnral(context) {
  return { sql: '1 = 1', params: [], alcance: context };
}

function failClosedScopeSql_gnral(context) {
  return { sql: '1 = 0', params: [], alcance: context };
}

function buildUserIdScopeSql_gnral(source, columnSql, options = {}) {
  const context = resolveAlcanceGnral_gnral(source, options);
  if (context.llave_maestra) return unrestrictedScopeSql_gnral(context);

  const column = safeColumnReference_gnral(columnSql);
  if (!context.effective_user_id) return failClosedScopeSql_gnral(context);

  return {
    sql: `${column} = ?`,
    params: [context.effective_user_id],
    alcance: context
  };
}

function buildSupportTicketScopeSql_gnral(source, alias = 't', options = {}) {
  const context = resolveAlcanceGnral_gnral(source, options);
  if (context.llave_maestra) return unrestrictedScopeSql_gnral(context);

  const a = safeAlias_gnral(alias, 't');
  if (!context.effective_user_id) return failClosedScopeSql_gnral(context);

  return {
    // GENERAL: la solicitud es visible si fue creada por el usuario
    // o si esta asignada directamente al usuario.
    sql: `(${a}.id_usuario = ? OR ${a}.id_soporte = ?)`,
    params: [context.effective_user_id, context.effective_user_id],
    alcance: context
  };
}

function buildPendientesScopeSql_gnral(source, alias = 'p', options = {}) {
  const context = resolveAlcanceGnral_gnral(source, options);
  if (context.llave_maestra) return unrestrictedScopeSql_gnral(context);

  const a = safeAlias_gnral(alias, 'p');
  const correo = context.identidad.correo;
  const iniciales = context.identidad.iniciales;

  // La estructura actual de pendientes identifica al creador por correo
  // y a responsables/seguimiento por iniciales. Si falta cualquiera de las
  // identidades necesarias, se falla cerrado para no ampliar visibilidad.
  if (!correo || !iniciales) return failClosedScopeSql_gnral(context);

  return {
    sql: `(
      (${a}.tipo_pendiente = 'PERSONAL' AND LOWER(TRIM(${a}.creado_por_email)) = ?)
      OR
      (
        ${a}.tipo_pendiente = 'COLABORATIVA'
        AND (
          LOWER(TRIM(${a}.creado_por_email)) = ?
          OR EXISTS (
            SELECT 1
            FROM pendientes_usuarios pu_scope_gnral
            WHERE pu_scope_gnral.id_pendiente = ${a}.id_pendiente
              AND UPPER(TRIM(pu_scope_gnral.iniciales_usuario)) = ?
          )
        )
      )
    )`,
    params: [correo, correo, iniciales],
    alcance: context
  };
}

module.exports = {
  GENERAL_COMPANY,
  GENERAL_ENGINE,
  GENERAL_MODE,
  normalizeEffectiveUser_gnral,
  resolveAlcanceGnral_gnral,
  buildUserIdScopeSql_gnral,
  buildSupportTicketScopeSql_gnral,
  buildPendientesScopeSql_gnral
};
