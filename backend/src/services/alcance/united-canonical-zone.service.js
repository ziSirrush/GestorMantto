'use strict';

/**
 * Zona territorial canónica UNITED.
 *
 * Regla oficial:
 * - Portafolio: portafolio.zona_id -> z_op.id_zona -> z_op.zona.
 * - Ticket con código: tickets.codigo_equipo -> portafolio.numero_equipo -> zona_id.
 * - Ticket sin código: proyecto/proyecto_padre únicamente cuando todos los
 *   registros activos relacionados de Portafolio resuelven a una sola zona.
 *
 * Los campos tickets.zona y portafolio.zona_operativa son legacy y nunca
 * deben utilizarse como autoridad territorial.
 */

function safeAlias_uni(alias, fallback = 't') {
  const value = String(alias || fallback || '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    const error = new Error(`Alias SQL inválido para zona canónica UNITED: ${value || '(vacío)'}.`);
    error.status = 500;
    error.code = 'UNITED_CANONICAL_ZONE_CONFIGURATION_ERROR';
    throw error;
  }
  return value;
}

function ticketZoneIdSql_uni(alias = 't') {
  const a = safeAlias_uni(alias, 't');

  const equipmentZone = `(
    SELECT CASE
      WHEN COUNT(*) > 0
        AND SUM(CASE WHEN p_cz_eq.zona_id IS NULL THEN 1 ELSE 0 END) = 0
        AND COUNT(DISTINCT p_cz_eq.zona_id) = 1
      THEN MAX(p_cz_eq.zona_id)
      ELSE NULL
    END
    FROM portafolio p_cz_eq
    WHERE p_cz_eq.estado_registro = 1
      AND TRIM(COALESCE(p_cz_eq.numero_equipo, '')) = TRIM(COALESCE(${a}.codigo_equipo, ''))
  )`;

  const projectZone = `(
    SELECT CASE
      WHEN COUNT(*) > 0
        AND SUM(CASE WHEN p_cz_pr.zona_id IS NULL THEN 1 ELSE 0 END) = 0
        AND COUNT(DISTINCT p_cz_pr.zona_id) = 1
      THEN MAX(p_cz_pr.zona_id)
      ELSE NULL
    END
    FROM portafolio p_cz_pr
    WHERE p_cz_pr.estado_registro = 1
      AND (
        (
          NULLIF(TRIM(COALESCE(${a}.proyecto, '')), '') IS NOT NULL
          AND LOWER(TRIM(COALESCE(p_cz_pr.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto, '')))
        )
        OR
        (
          NULLIF(TRIM(COALESCE(${a}.proyecto_padre, '')), '') IS NOT NULL
          AND LOWER(TRIM(COALESCE(p_cz_pr.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto_padre, '')))
        )
      )
  )`;

  return `(
    CASE
      WHEN NULLIF(TRIM(COALESCE(${a}.codigo_equipo, '')), '') IS NOT NULL
        THEN ${equipmentZone}
      ELSE ${projectZone}
    END
  )`;
}

function ticketZoneCodeSql_uni(alias = 't') {
  const zoneId = ticketZoneIdSql_uni(alias);
  return `(
    SELECT z_cz.zona
    FROM z_op z_cz
    WHERE z_cz.estado = 1
      AND z_cz.id_zona = ${zoneId}
    LIMIT 1
  )`;
}

function ticketZoneJoinSql_uni(ticketAlias = 't', zoneAlias = 'z_ticket_uni') {
  const zone = safeAlias_uni(zoneAlias, 'z_ticket_uni');
  return `INNER JOIN z_op ${zone}
    ON ${zone}.estado = 1
   AND ${zone}.id_zona = ${ticketZoneIdSql_uni(ticketAlias)}`;
}

function zoneColumnFilterSql_uni(zoneAlias = 'z_ticket_uni') {
  const zone = safeAlias_uni(zoneAlias, 'z_ticket_uni');
  return `UPPER(TRIM(COALESCE(${zone}.zona, ''))) = UPPER(TRIM(?))`;
}

function ticketZoneFilterSql_uni(alias = 't') {
  return `UPPER(TRIM(COALESCE(${ticketZoneCodeSql_uni(alias)}, ''))) = UPPER(TRIM(?))`;
}

module.exports = Object.freeze({
  ticketZoneIdSql_uni,
  ticketZoneCodeSql_uni,
  ticketZoneJoinSql_uni,
  zoneColumnFilterSql_uni,
  ticketZoneFilterSql_uni
});
