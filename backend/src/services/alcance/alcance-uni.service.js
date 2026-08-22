'use strict';

const UNITED_COMPANY = 'UNITED';
const UNITED_ENGINE = 'alcance_uni';
const UNITED_MODE = 'ZONAS_OPERATIVAS';

function configurationError_uni(message) {
  const error = new Error(message);
  error.status = 500;
  error.code = 'ALCANCE_UNI_CONFIGURATION_ERROR';
  return error;
}

function userRequiredError_uni() {
  const error = new Error('Usuario efectivo no disponible para alcance UNITED.');
  error.status = 401;
  error.code = 'ALCANCE_UNI_USER_REQUIRED';
  return error;
}

function normalizePositiveInteger_uni(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizePositiveIds_uni(values) {
  const source = Array.isArray(values) ? values : [];
  return [...new Set(source
    .map(normalizePositiveInteger_uni)
    .filter(Boolean))]
    .sort((a, b) => a - b);
}

function normalizeZoneCode_uni(value) {
  return String(value || '').trim().toUpperCase();
}

function effectiveUserFromSource_uni(source) {
  if (!source) return null;
  if (source.contextUser || source.user) return source.contextUser || source.user;
  return source;
}

function normalizeEffectiveUser_uni(source) {
  const user = effectiveUserFromSource_uni(source) || {};
  return {
    id: normalizePositiveInteger_uni(user.id_SB || user.id || user.user_id)
  };
}

function normalizeOptions_uni(options = {}) {
  return {
    // La llave maestra se valida en la capa superior.
    // DOMINIO_COMPLETO UNITED abre las puertas y elimina el filtro territorial
    // exclusivamente dentro del dominio UNITED.
    masterAccess: options.masterAccess === true
  };
}

function assertExecutor_uni(executor) {
  if (!executor || typeof executor.query !== 'function') {
    throw configurationError_uni('Executor SQL no disponible para alcance UNITED.');
  }
  return executor;
}

function safeAlias_uni(alias, fallback) {
  const normalized = String(alias || fallback || '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    throw configurationError_uni(`Alias SQL invalido para alcance UNITED: ${normalized || '(vacio)'}.`);
  }
  return normalized;
}

function safeColumnReference_uni(columnSql) {
  const normalized = String(columnSql || '').trim();
  if (!/^(?:[A-Za-z_][A-Za-z0-9_]*\.)?[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    throw configurationError_uni(`Columna SQL invalida para alcance UNITED: ${normalized || '(vacia)'}.`);
  }
  return normalized;
}

async function resolveUnitedZones_uni(executor, userId) {
  const db = assertExecutor_uni(executor);
  const id = normalizePositiveInteger_uni(userId);
  if (!id) throw userRequiredError_uni();

  // Fuente oficial de CUARTOS UNITED para usuarios sin llave maestra:
  // usuario_zop = asignacion efectiva usuario <-> Zona Operativa.
  // z_op = catalogo referencial de zonas.
  // La puerta se resuelve en Alcance; los cuartos se resuelven aqui.
  const [rows] = await db.query(
    `SELECT DISTINCT
       uz.zona_id AS id_zona,
       z.zona,
       z.nombre
     FROM usuario_zop uz
     INNER JOIN z_op z
       ON z.id_zona = uz.zona_id
      AND z.estado = 1
     WHERE uz.usuario_id = ?
       AND uz.estado = 1
     ORDER BY z.zona ASC, uz.zona_id ASC`,
    [id]
  );

  const byId = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const zoneId = normalizePositiveInteger_uni(row.id_zona || row.zona_id);
    if (!zoneId) continue;
    const code = normalizeZoneCode_uni(row.zona);
    byId.set(zoneId, {
      id_zona: zoneId,
      zona: code || null,
      nombre: String(row.nombre || '').trim() || null
    });
  }

  return [...byId.values()]
    .sort((left, right) => {
      const byCode = String(left.zona || '').localeCompare(String(right.zona || ''));
      return byCode || left.id_zona - right.id_zona;
    });
}

async function resolveAlcanceUni_uni(executor, source, options = {}) {
  const user = normalizeEffectiveUser_uni(source);
  const normalizedOptions = normalizeOptions_uni(options);

  if (!user.id) throw userRequiredError_uni();

  // DOMINIO_COMPLETO UNITED significa dominio completo dentro de UNITED.
  // La llave ya fue validada por la capa superior, por lo que usuario_zop no
  // debe limitar registros ni ser requisito para este usuario.
  if (normalizedOptions.masterAccess) {
    return {
      motor: UNITED_ENGINE,
      empresa: UNITED_COMPANY,
      modo: 'LLAVE_MAESTRA',
      llave_maestra: true,
      effective_user_id: user.id,
      reglas: {
        permiso_funcional_requerido: true,
        zonas_operativas: false,
        personas_visibles: false,
        relacion_directa: false,
        llave_maestra_abre_puertas: true,
        llave_maestra_ignora_zonas: true
      },
      zonas_operativas: null,
      zona_ids: null,
      zona_codigos: null,
      requiere_filtro_zona: false
    };
  }

  const zones = await resolveUnitedZones_uni(executor, user.id);
  const zoneIds = normalizePositiveIds_uni(zones.map((zone) => zone.id_zona));
  const zoneCodes = [...new Set(zones
    .map((zone) => normalizeZoneCode_uni(zone.zona))
    .filter(Boolean))]
    .sort();

  return {
    motor: UNITED_ENGINE,
    empresa: UNITED_COMPANY,
    modo: UNITED_MODE,
    llave_maestra: false,
    effective_user_id: user.id,
    reglas: {
      permiso_funcional_requerido: true,
      zonas_operativas: true,
      personas_visibles: false,
      relacion_directa: false,
      llave_maestra_abre_puertas: true,
      llave_maestra_ignora_zonas: false
    },
    zonas_operativas: zones,
    zona_ids: zoneIds,
    zona_codigos: zoneCodes,
    requiere_filtro_zona: true
  };
}

function unrestrictedScopeSql_uni(context) {
  return { sql: '1 = 1', params: [], alcance: context };
}

function failClosedScopeSql_uni(context) {
  return { sql: '1 = 0', params: [], alcance: context };
}

function placeholders_uni(count) {
  return Array.from({ length: count }, () => '?').join(', ');
}

function buildResolvedZoneIdScopeSql_uni(context, columnSql) {
  if (!context || context.motor !== UNITED_ENGINE) {
    throw configurationError_uni('Contexto de alcance UNITED invalido.');
  }

  const column = safeColumnReference_uni(columnSql);
  if (context.llave_maestra === true) return unrestrictedScopeSql_uni(context);

  const zoneIds = normalizePositiveIds_uni(context.zona_ids);
  if (!zoneIds.length) return failClosedScopeSql_uni(context);

  return {
    sql: `${column} IN (${placeholders_uni(zoneIds.length)})`,
    params: zoneIds,
    alcance: context
  };
}

async function buildZoneIdScopeSql_uni(executor, source, columnSql, options = {}) {
  const context = await resolveAlcanceUni_uni(executor, source, options);
  return buildResolvedZoneIdScopeSql_uni(context, columnSql);
}

function buildResolvedPortafolioScopeSql_uni(context, alias = 'p') {
  const a = safeAlias_uni(alias, 'p');
  return buildResolvedZoneIdScopeSql_uni(context, `${a}.zona_id`);
}

async function buildPortafolioScopeSql_uni(executor, source, alias = 'p', options = {}) {
  const context = await resolveAlcanceUni_uni(executor, source, options);
  return buildResolvedPortafolioScopeSql_uni(context, alias);
}

function buildResolvedTicketScopeSql_uni(context, alias = 't') {
  if (!context || context.motor !== UNITED_ENGINE) {
    throw configurationError_uni('Contexto de alcance UNITED invalido.');
  }

  const a = safeAlias_uni(alias, 't');
  if (context.llave_maestra === true) return unrestrictedScopeSql_uni(context);

  const zoneIds = normalizePositiveIds_uni(context.zona_ids);
  if (!zoneIds.length) return failClosedScopeSql_uni(context);

  const zonePlaceholders = placeholders_uni(zoneIds.length);

  // FASE 3 formaliza la frontera territorial de Tickets sin confiar en
  // tickets.zona, porque la estructura actual no tiene FK directa a z_op.
  //
  // Precedencia fail-closed para usuarios SIN llave maestra:
  // 1) Si el Ticket tiene codigo_equipo, SOLO ese equipo puede resolver zona.
  //    No existe fallback por proyecto para un codigo presente.
  // 2) Si no tiene codigo_equipo, proyecto/proyecto_padre se consideran como
  //    referencias alternativas del mismo Ticket. El conjunto completo de
  //    filas Portafolio que coincida con cualquiera de ambas referencias debe
  //    resolver a UNA sola zona estructurada y no contener zona_id nula.
  // 3) tickets.zona permanece informativo y nunca otorga acceso por si solo.
  //
  // Esto evita que un Ticket de un equipo fuera de alcance se vuelva visible
  // solo porque comparte proyecto, y tambien falla cerrado si proyecto y
  // proyecto_padre apuntan a zonas diferentes.
  return {
    sql: `(
      (
        NULLIF(TRIM(COALESCE(${a}.codigo_equipo, '')), '') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM portafolio p_scope_uni_ticket_equipo
          WHERE p_scope_uni_ticket_equipo.estado_registro = 1
            AND p_scope_uni_ticket_equipo.zona_id IN (${zonePlaceholders})
            AND TRIM(COALESCE(p_scope_uni_ticket_equipo.numero_equipo, '')) = TRIM(COALESCE(${a}.codigo_equipo, ''))
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
              AND SUM(CASE WHEN p_scope_uni_ticket_project_check.zona_id IS NULL THEN 1 ELSE 0 END) = 0
              AND COUNT(DISTINCT p_scope_uni_ticket_project_check.zona_id) = 1
            THEN 1 ELSE 0
          END
          FROM portafolio p_scope_uni_ticket_project_check
          WHERE p_scope_uni_ticket_project_check.estado_registro = 1
            AND (
              (NULLIF(TRIM(COALESCE(${a}.proyecto, '')), '') IS NOT NULL
                AND LOWER(TRIM(COALESCE(p_scope_uni_ticket_project_check.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto, ''))))
              OR (NULLIF(TRIM(COALESCE(${a}.proyecto_padre, '')), '') IS NOT NULL
                AND LOWER(TRIM(COALESCE(p_scope_uni_ticket_project_check.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto_padre, ''))))
            )
        ) = 1
        AND EXISTS (
          SELECT 1
          FROM portafolio p_scope_uni_ticket_project
          WHERE p_scope_uni_ticket_project.estado_registro = 1
            AND p_scope_uni_ticket_project.zona_id IN (${zonePlaceholders})
            AND (
              (NULLIF(TRIM(COALESCE(${a}.proyecto, '')), '') IS NOT NULL
                AND LOWER(TRIM(COALESCE(p_scope_uni_ticket_project.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto, ''))))
              OR (NULLIF(TRIM(COALESCE(${a}.proyecto_padre, '')), '') IS NOT NULL
                AND LOWER(TRIM(COALESCE(p_scope_uni_ticket_project.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto_padre, ''))))
            )
        )
      )
    )`,
    params: [...zoneIds, ...zoneIds],
    alcance: context
  };
}

async function buildTicketScopeSql_uni(executor, source, alias = 't', options = {}) {
  const context = await resolveAlcanceUni_uni(executor, source, options);
  return buildResolvedTicketScopeSql_uni(context, alias);
}

function alcanceUniAllowsZone_uni(context, zoneId) {
  const id = normalizePositiveInteger_uni(zoneId);
  if (!context || context.motor !== UNITED_ENGINE || !id) return false;
  if (context.llave_maestra === true) return true;
  return normalizePositiveIds_uni(context.zona_ids).includes(id);
}

module.exports = {
  UNITED_COMPANY,
  UNITED_ENGINE,
  UNITED_MODE,
  normalizeEffectiveUser_uni,
  resolveUnitedZones_uni,
  resolveAlcanceUni_uni,
  buildResolvedZoneIdScopeSql_uni,
  buildZoneIdScopeSql_uni,
  buildResolvedPortafolioScopeSql_uni,
  buildPortafolioScopeSql_uni,
  buildResolvedTicketScopeSql_uni,
  buildTicketScopeSql_uni,
  alcanceUniAllowsZone_uni
};
