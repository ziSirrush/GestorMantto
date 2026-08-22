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

function canonicalProjectSql_uni(alias) {
  const a = safeAlias_uni(alias);
  return `COALESCE(
    (
      SELECT cp_scope.proyecto
      FROM cobranza_proyectos cp_scope
      WHERE cp_scope.id_proyecto_cobranza = ${a}.id_proyecto_cobranza
      LIMIT 1
    ),
    NULLIF(TRIM(${a}.proyecto), '')
  )`;
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
 * territorial. Por seguridad, la autoridad territorial se deriva del proyecto
 * contra Portafolio:
 *
 *   usuario_zop -> zona_id -> portafolio.zona_id -> proyecto de Cobranza
 *
 * Un registro financiero solo es visible cuando:
 * 1) existe al menos un equipo activo del proyecto dentro de los cuartos del usuario;
 * 2) NO existe ningun equipo activo del mismo proyecto fuera de esos cuartos;
 * 3) no hay equipos activos del proyecto con zona_id NULL.
 *
 * Esto evita exponer el importe completo de un proyecto multi-zona a un usuario
 * que solo tenga una parte de sus cuartos. Los campos legacy z_oper y
 * zona_operativa nunca conceden acceso.
 */
function buildCobranzaProjectScopeSql_uni(req, alias) {
  const a = safeAlias_uni(alias);
  if (hasUnrestrictedUnitedScope_gnral(req)) return '1 = 1';
  const ids = zoneIdList_uni(req);
  if (!ids.length) return '1 = 0';

  const idList = ids.join(', ');
  const project = canonicalProjectSql_uni(a);

  return `(
    ${project} IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM portafolio p_cob_scope_allowed
      WHERE ${activePortafolioSql_uni('p_cob_scope_allowed')}
        AND p_cob_scope_allowed.zona_id IN (${idList})
        AND LOWER(TRIM(COALESCE(p_cob_scope_allowed.proyecto, ''))) = LOWER(TRIM(${project}))
    )
    AND NOT EXISTS (
      SELECT 1
      FROM portafolio p_cob_scope_outside
      WHERE ${activePortafolioSql_uni('p_cob_scope_outside')}
        AND LOWER(TRIM(COALESCE(p_cob_scope_outside.proyecto, ''))) = LOWER(TRIM(${project}))
        AND (
          p_cob_scope_outside.zona_id IS NULL
          OR p_cob_scope_outside.zona_id NOT IN (${idList})
        )
    )
  )`;
}

function canonicalZoneCodeSql_uni(alias) {
  const a = safeAlias_uni(alias);
  const project = canonicalProjectSql_uni(a);
  return `(
    SELECT GROUP_CONCAT(DISTINCT z_cob.zona ORDER BY z_cob.zona SEPARATOR ' / ')
    FROM portafolio p_cob_zone
    INNER JOIN z_op z_cob
      ON z_cob.id_zona = p_cob_zone.zona_id
     AND z_cob.estado = 1
    WHERE ${activePortafolioSql_uni('p_cob_zone')}
      AND LOWER(TRIM(COALESCE(p_cob_zone.proyecto, ''))) = LOWER(TRIM(${project}))
  )`;
}

function canonicalZoneIdsSql_uni(alias) {
  const a = safeAlias_uni(alias);
  const project = canonicalProjectSql_uni(a);
  return `(
    SELECT GROUP_CONCAT(DISTINCT p_cob_zone_id.zona_id ORDER BY p_cob_zone_id.zona_id SEPARATOR ',')
    FROM portafolio p_cob_zone_id
    INNER JOIN z_op z_cob_id
      ON z_cob_id.id_zona = p_cob_zone_id.zona_id
     AND z_cob_id.estado = 1
    WHERE ${activePortafolioSql_uni('p_cob_zone_id')}
      AND LOWER(TRIM(COALESCE(p_cob_zone_id.proyecto, ''))) = LOWER(TRIM(${project}))
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
  const canonical = row.zona_oficial || null;
  return {
    ...row,
    [`${legacyField}_legacy`]: legacyValue,
    [legacyField]: canonical,
    zona_oficial: canonical,
    zona_ids_oficial: String(row.zona_ids_oficial || '')
      .split(',')
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
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
