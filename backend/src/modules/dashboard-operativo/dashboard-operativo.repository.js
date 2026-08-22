'use strict';

const db = require('../../config/db');
const informationRecordScope = require('../../services/information-record-scope-gnral.service');

function officialProjectZoneSql(ticketAlias) {
  const a = String(ticketAlias || 't');
  return `(
    SELECT MAX(z_scope_op.zona)
    FROM portafolio p_scope_op
    INNER JOIN z_op z_scope_op
      ON z_scope_op.id_zona = p_scope_op.zona_id
     AND z_scope_op.estado = 1
    WHERE p_scope_op.estado_registro = 1
      AND (
        (NULLIF(TRIM(COALESCE(${a}.proyecto, '')), '') IS NOT NULL
          AND LOWER(TRIM(COALESCE(p_scope_op.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto, ''))))
        OR
        (NULLIF(TRIM(COALESCE(${a}.proyecto_padre, '')), '') IS NOT NULL
          AND LOWER(TRIM(COALESCE(p_scope_op.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto_padre, ''))))
      )
  )`;
}

function officialProjectZoneIdSql(ticketAlias) {
  const a = String(ticketAlias || 't');
  return `(
    SELECT MAX(p_scope_op_id.zona_id)
    FROM portafolio p_scope_op_id
    WHERE p_scope_op_id.estado_registro = 1
      AND (
        (NULLIF(TRIM(COALESCE(${a}.proyecto, '')), '') IS NOT NULL
          AND LOWER(TRIM(COALESCE(p_scope_op_id.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto, ''))))
        OR
        (NULLIF(TRIM(COALESCE(${a}.proyecto_padre, '')), '') IS NOT NULL
          AND LOWER(TRIM(COALESCE(p_scope_op_id.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto_padre, ''))))
      )
  )`;
}

async function getPortafolioInicial(informationAccess) {
  const scope = informationRecordScope.buildPortafolioScopeSql_gnral(informationAccess, 'p');
  const [rows] = await db.query(`
    SELECT
      p.*,
      z_op_ini.zona AS zona_oficial,
      z_op_ini.nombre AS zona_nombre_oficial
    FROM portafolio p
    INNER JOIN z_op z_op_ini
      ON z_op_ini.id_zona = p.zona_id
     AND z_op_ini.estado = 1
    WHERE ${scope.sql}
    LIMIT 50000
  `, scope.params || []);

  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    zona: row.zona_oficial || null,
    zona_operativa: row.zona_oficial || null
  }));
}

async function getTicketsInicial(informationAccess) {
  const scope = informationRecordScope.buildTicketScopeSql_gnral(informationAccess, 't');
  const [rows] = await db.query(`
    SELECT
      t.*,
      CASE
        WHEN NULLIF(TRIM(COALESCE(t.codigo_equipo, '')), '') IS NOT NULL
          THEN z_equipo_op.zona
        ELSE ${officialProjectZoneSql('t')}
      END AS zona_oficial,
      CASE
        WHEN NULLIF(TRIM(COALESCE(t.codigo_equipo, '')), '') IS NOT NULL
          THEN p_equipo_op.zona_id
        ELSE ${officialProjectZoneIdSql('t')}
      END AS zona_id_oficial
    FROM tickets t
    LEFT JOIN portafolio p_equipo_op
      ON p_equipo_op.estado_registro = 1
     AND TRIM(COALESCE(p_equipo_op.numero_equipo, '')) = TRIM(COALESCE(t.codigo_equipo, ''))
    LEFT JOIN z_op z_equipo_op
      ON z_equipo_op.id_zona = p_equipo_op.zona_id
     AND z_equipo_op.estado = 1
    WHERE ${scope.sql}
    ORDER BY t.id DESC
    LIMIT 50000
  `, scope.params || []);

  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    zona: row.zona_oficial || null
  }));
}

async function getSupervisoresActivosPorZona(informationAccess = null) {
  const zoneScope = informationRecordScope.buildZoneIdScopeSql_gnral(informationAccess, 'z.id_zona');

  const [rows] = await db.query(`
    SELECT DISTINCT
      u.id_SB AS supervisor_id,
      UPPER(TRIM(u.nombre)) AS supervisor,
      u.iniciales,
      z.id_zona,
      z.zona,
      z.nombre AS zona_nombre
    FROM usuarios u
    INNER JOIN usuario_roles ur
      ON ur.id_usuario = u.id_SB
     AND ur.activo = 1
    INNER JOIN roles r
      ON r.id_rol = ur.id_rol
     AND r.estado = 1
    INNER JOIN usuario_zop uz
      ON uz.usuario_id = u.id_SB
     AND uz.estado = 1
    INNER JOIN z_op z
      ON z.id_zona = uz.zona_id
     AND z.estado = 1
    WHERE u.estado = 1
      AND ${zoneScope.sql}
      AND UPPER(TRIM(r.rol)) LIKE 'SUPERVISOR MANTENIMIENTO ZONA%'
    ORDER BY supervisor ASC, z.zona ASC
  `, zoneScope.params || []);

  return Array.isArray(rows) ? rows : [];
}

async function getPreventivosPorZona(mes, informationAccess = null) {
  const scope = informationRecordScope.buildPortafolioScopeSql_gnral(informationAccess, 'p');
  const [rows] = await db.query(`
    SELECT
      z_prev.id_zona,
      z_prev.zona,
      UPPER(REPLACE(REPLACE(TRIM(z_prev.zona), '-', ''), ' ', '')) AS zona_clave,
      COUNT(*) AS programados,
      SUM(CASE WHEN sp.servicio_realizado = 1 THEN 1 ELSE 0 END) AS realizados
    FROM servicios_preventivos sp
    INNER JOIN portafolio p
      ON p.numero_equipo = sp.numero_equipo
    INNER JOIN z_op z_prev
      ON z_prev.id_zona = p.zona_id
     AND z_prev.estado = 1
    WHERE DATE_FORMAT(sp.mes_servicio, '%Y-%m') = ?
      AND sp.tipo_servicio = 'PREVENTIVO'
      AND p.estado_registro = 1
      AND (p.inactivo IS NULL OR UPPER(TRIM(p.inactivo)) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))
      AND ${scope.sql}
    GROUP BY z_prev.id_zona, z_prev.zona
  `, [mes, ...(scope.params || [])]);

  return Array.isArray(rows) ? rows : [];
}

module.exports = {
  getPortafolioInicial,
  getTicketsInicial,
  getSupervisoresActivosPorZona,
  getPreventivosPorZona,
  officialProjectZoneSql,
  officialProjectZoneIdSql
};
