'use strict';

const {
  hasUnrestrictedUnitedScope_gnral,
  zoneIds_gnral,
  zoneCodes_gnral
} = require('./information-record-scope-gnral.service');

function safeAlias_uni(alias) {
  const value = String(alias || '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    const error = new Error(`Alias SQL invalido para Cobranza UNITED: ${value || '(vacio)'}.`);
    error.status = 500;
    error.code = 'COBRANZA_UNI_SCOPE_CONFIGURATION_ERROR';
    throw error;
  }
  return value;
}

function activePortafolioSql_uni(alias) {
  const a = safeAlias_uni(alias);
  return `${a}.estado_registro = 1
    AND (${a}.inactivo IS NULL OR UPPER(${a}.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))`;
}

function portafolioProjectSql_uni(alias) {
  const a = safeAlias_uni(alias);
  // portafolio.proyecto sigue en utf8mb3 en Aiven; el resto de Cobranza usa
  // utf8mb4. La conversion evita ER_COLLATION_CHARSET_MISMATCH sin alterar datos.
  return `TRIM(CONVERT(${a}.proyecto USING utf8mb4))`;
}

// [Mantto Gestor | 2026-10-13 | COBRANZA_UNI_ALCANCE_SEGURIDAD_FASE_3_V001]
// El nombre canonico para una decision territorial NUNCA puede provenir solo
// del FK legacy. Debe cumplir simultaneamente:
//  - nombre original del registro = nombre inequívoco de proyectos_mantto;
//  - FK del registro = FK del proyecto, o NULL (respaldo validado);
//  - catalogo Cobranza con nombre exacto/ID coincidente;
//  - FK unico y ausencia de equipos Portafolio con otro FK para ese nombre.
// Una referencia conflictiva devuelve NULL (fallo cerrado).
// Es una subconsulta escalar para poder reutilizar los filtros por zona ya
// autorizados; no altera los permisos ni crea un motor de alcance paralelo.
function identidadVerificadaSql_uni(alias) {
  const a = safeAlias_uni(alias);
  return `EXISTS (
    SELECT 1
    FROM proyectos_mantto pm_scope
    INNER JOIN cobranza_proyectos cp_scope
      ON cp_scope.id_proyecto_cobranza = pm_scope.cobranza
     AND cp_scope.proyecto COLLATE utf8mb4_0900_bin
       = pm_scope.proyecto COLLATE utf8mb4_0900_bin
    WHERE TRIM(${a}.proyecto) COLLATE utf8mb4_0900_as_ci
        = TRIM(pm_scope.proyecto) COLLATE utf8mb4_0900_as_ci
      AND (${a}.id_proyecto_cobranza = pm_scope.cobranza
           OR ${a}.id_proyecto_cobranza IS NULL)
      AND (SELECT COUNT(*) FROM proyectos_mantto pm_same_name
           WHERE TRIM(pm_same_name.proyecto) COLLATE utf8mb4_0900_as_ci
             = TRIM(pm_scope.proyecto) COLLATE utf8mb4_0900_as_ci) = 1
      AND (SELECT COUNT(*) FROM proyectos_mantto pm_same_id
           WHERE pm_same_id.cobranza = pm_scope.cobranza) = 1
      AND NOT EXISTS (
        SELECT 1 FROM portafolio p_scope_discordante
        WHERE p_scope_discordante.id_proyecto_cobranza IS NOT NULL
          AND p_scope_discordante.id_proyecto_cobranza <> pm_scope.cobranza
          AND ${portafolioProjectSql_uni('p_scope_discordante')} COLLATE utf8mb4_0900_as_ci
            = TRIM(pm_scope.proyecto) COLLATE utf8mb4_0900_as_ci
      )
    LIMIT 1
  )`;
}

function canonicalProjectSql_uni(alias) {
  const a = safeAlias_uni(alias);
  return `(CASE WHEN ${identidadVerificadaSql_uni(a)}
    THEN NULLIF(TRIM(${a}.proyecto), '') ELSE NULL END)`;
}

function zoneIdList_uni(req) {
  const ids = zoneIds_gnral(req);
  return [...new Set((Array.isArray(ids) ? ids : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))]
    .sort((a, b) => a - b);
}

/**
 * Cobranza maneja importes a nivel proyecto y sus tablas legacy no tienen FK
 * territorial. El alcance UNITED autorizado se resuelve por los cuartos del
 * usuario sobre equipos activos de Portafolio. Los campos legacy de zona
 * NUNCA conceden acceso por sí mismos.
 *
 * Requiere: 1) equipos visibles activos en cuartos permitidos; 2) ningun
 * equipo activo fuera de los cuartos; 3) ningun equipo activo con zona NULL;
 * 4) identidad nombre/FK coherente con proyectos_mantto y Cobranza.
 */
function buildCobranzaProjectScopeSql_uni(req, alias) {
  const a = safeAlias_uni(alias);
  if (hasUnrestrictedUnitedScope_gnral(req)) return '1 = 1';
  const ids = zoneIdList_uni(req);
  if (!ids.length) return '1 = 0';

  const idList = ids.join(', ');
  const project = `TRIM(${a}.proyecto)`;
  const identidadValida = identidadVerificadaSql_uni(a);
  const eqProject = (portAlias) => `${portafolioProjectSql_uni(portAlias)} COLLATE utf8mb4_0900_as_ci
      = ${project} COLLATE utf8mb4_0900_as_ci`;

  return `(
    ${identidadValida}
    AND EXISTS (
      SELECT 1
      FROM portafolio p_cob_scope_allowed
      WHERE ${activePortafolioSql_uni('p_cob_scope_allowed')}
        AND p_cob_scope_allowed.zona_id IN (${idList})
        AND ${eqProject('p_cob_scope_allowed')}
    )
    AND NOT EXISTS (
      SELECT 1
      FROM portafolio p_cob_scope_outside
      WHERE ${activePortafolioSql_uni('p_cob_scope_outside')}
        AND ${eqProject('p_cob_scope_outside')}
        AND (
          p_cob_scope_outside.zona_id IS NULL
          OR p_cob_scope_outside.zona_id NOT IN (${idList})
        )
    )
  )`;
}

function canonicalZoneCodeSql_uni(alias) {
  const a = safeAlias_uni(alias);
  const identidadValida = identidadVerificadaSql_uni(a);
  return `(
    SELECT GROUP_CONCAT(DISTINCT z_cob.zona ORDER BY z_cob.zona SEPARATOR ' / ')
    FROM portafolio p_cob_zone
    INNER JOIN z_op z_cob
      ON z_cob.id_zona = p_cob_zone.zona_id
     AND z_cob.estado = 1
    WHERE ${activePortafolioSql_uni('p_cob_zone')}
      AND ${identidadValida}
      AND ${portafolioProjectSql_uni('p_cob_zone')} COLLATE utf8mb4_0900_as_ci
        = TRIM(${a}.proyecto) COLLATE utf8mb4_0900_as_ci
  )`;
}

function canonicalZoneIdsSql_uni(alias) {
  const a = safeAlias_uni(alias);
  const identidadValida = identidadVerificadaSql_uni(a);
  return `(
    SELECT GROUP_CONCAT(DISTINCT p_cob_zone_id.zona_id ORDER BY p_cob_zone_id.zona_id SEPARATOR ',')
    FROM portafolio p_cob_zone_id
    INNER JOIN z_op z_cob_id
      ON z_cob_id.id_zona = p_cob_zone_id.zona_id
     AND z_cob_id.estado = 1
    WHERE ${activePortafolioSql_uni('p_cob_zone_id')}
      AND ${identidadValida}
      AND ${portafolioProjectSql_uni('p_cob_zone_id')} COLLATE utf8mb4_0900_as_ci
        = TRIM(${a}.proyecto) COLLATE utf8mb4_0900_as_ci
  )`;
}

function alcancePayload_uni(req) {
  return {
    zona_ids: zoneIdList_uni(req),
    zonas: zoneCodes_gnral(req)
  };
}

function canonicalizeRow_uni(row, legacyField) {
  if (!row) return row;
  const legacyValue = row[legacyField];
  const raw = String(row.proyecto == null ? '' : row.proyecto).trim();
  const canonicalName = String(row.proyecto_oficial == null ? '' : row.proyecto_oficial).trim();
  // Las listas legacy pueden haber unido cobranza_proyectos por un FK errado.
  // En ese caso no mostramos nombre/zona del proyecto ajeno.
  const contradiccion = Boolean(canonicalName) && (!raw ||
    canonicalName.localeCompare(raw, 'es', { sensitivity: 'accent' }) !== 0);
  const canonical = contradiccion ? null : (row.zona_oficial || null);
  return {
    ...row,
    proyecto_oficial: contradiccion ? (raw || null) : (row.proyecto_oficial || raw || null),
    [`${legacyField}_legacy`]: legacyValue,
    [legacyField]: canonical,
    zona_oficial: canonical,
    zona_ids_oficial: contradiccion ? [] : String(row.zona_ids_oficial || '')
      .split(',')
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0),
    identidad_nombre_fk_conflictiva: contradiccion
  };
}

module.exports = {
  buildCobranzaProjectScopeSql_uni,
  canonicalProjectSql_uni,
  canonicalZoneCodeSql_uni,
  canonicalZoneIdsSql_uni,
  alcancePayload_uni,
  canonicalizeRow_uni
};
