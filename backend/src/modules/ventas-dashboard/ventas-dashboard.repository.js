'use strict';

const COMMERCIAL_ROLE_IDS = [5, 39, 48, 50, 54];
const COMMERCIAL_ROLE_CODES = [
  'DIRECTOR_VENTAS',
  'ASESOR_COMERCIAL',
  'GERENTE_CUENTAS_CORPORATIVAS',
  'GERENTE_COMERCIAL_BC_SURESTE',
  'GERENTE_COMERCIAL_NORTE'
];

function commercialRoleCondition(userAlias = 'u') {
  const roleIds = COMMERCIAL_ROLE_IDS.map(() => '?').join(', ');
  const roleCodes = COMMERCIAL_ROLE_CODES.map(() => '?').join(', ');

  return {
    sql: `(
      ${userAlias}.rol_id IN (${roleIds})
      OR EXISTS (
        SELECT 1
          FROM usuario_roles ur
          INNER JOIN roles r
            ON r.id_rol = ur.id_rol
           AND r.estado = 1
         WHERE ur.id_usuario = ${userAlias}.id_SB
           AND ur.activo = 1
           AND (
             r.id_rol IN (${roleIds})
             OR UPPER(TRIM(COALESCE(r.codigo, ''))) IN (${roleCodes})
           )
      )
    )`,
    params: [
      ...COMMERCIAL_ROLE_IDS,
      ...COMMERCIAL_ROLE_IDS,
      ...COMMERCIAL_ROLE_CODES
    ]
  };
}

async function listCommercialUsers(connection) {
  const condition = commercialRoleCondition('u');
  const [rows] = await connection.query(
    `SELECT DISTINCT
       u.id_SB AS id_usuario,
       u.nombre,
       u.iniciales,
       u.puesto,
       CASE
         WHEN u.rol_id = 5
           OR EXISTS (
             SELECT 1
               FROM usuario_roles ur_d
              WHERE ur_d.id_usuario = u.id_SB
                AND ur_d.id_rol = 5
                AND ur_d.activo = 1
           ) THEN 'Director de Ventas'
         WHEN u.rol_id IN (48, 50, 54)
           OR EXISTS (
             SELECT 1
               FROM usuario_roles ur_g
              WHERE ur_g.id_usuario = u.id_SB
                AND ur_g.id_rol IN (48, 50, 54)
                AND ur_g.activo = 1
           ) THEN 'Gerente'
         ELSE 'Asesor'
       END AS tipo_perfil
     FROM usuarios u
     WHERE u.estado = 1
       AND ${condition.sql}
     ORDER BY
       FIELD(tipo_perfil, 'Director de Ventas', 'Gerente', 'Asesor'),
       u.nombre ASC`,
    condition.params
  );

  return rows;
}

async function isCommercialUser(connection, userId) {
  const condition = commercialRoleCondition('u');
  const [rows] = await connection.query(
    `SELECT u.id_SB
       FROM usuarios u
      WHERE u.id_SB = ?
        AND u.estado = 1
        AND ${condition.sql}
      LIMIT 1`,
    [userId, ...condition.params]
  );

  return rows.length > 0;
}

async function getCommercialKpis(connection, userId) {
  const [rows] = await connection.query(
    `SELECT
       COUNT(*) AS cotizados_cotizaciones,
       COALESCE(SUM(COALESCE(c.numero_equipos, 0)), 0) AS cotizados_equipos,
       SUM(CASE
             WHEN UPPER(TRIM(COALESCE(c.estatus_proyecto, ''))) = 'VENDIDO'
             THEN 1 ELSE 0
           END) AS vendidos_cotizaciones,
       COALESCE(SUM(CASE
             WHEN UPPER(TRIM(COALESCE(c.estatus_proyecto, ''))) = 'VENDIDO'
             THEN COALESCE(c.numero_equipos, 0) ELSE 0
           END), 0) AS vendidos_equipos,
       SUM(CASE
             WHEN UPPER(TRIM(COALESCE(c.estatus_proyecto, ''))) = 'PERDIDO'
             THEN 1 ELSE 0
           END) AS perdidos_cotizaciones,
       COALESCE(SUM(CASE
             WHEN UPPER(TRIM(COALESCE(c.estatus_proyecto, ''))) = 'PERDIDO'
             THEN COALESCE(c.numero_equipos, 0) ELSE 0
           END), 0) AS perdidos_equipos
     FROM ventas_cotizaciones_cor c
     WHERE c.id_asesor = ?
       AND COALESCE(c.activo, 1) = 1`,
    [userId]
  );

  return rows[0] || {};
}

module.exports = {
  listCommercialUsers,
  isCommercialUser,
  getCommercialKpis
};
