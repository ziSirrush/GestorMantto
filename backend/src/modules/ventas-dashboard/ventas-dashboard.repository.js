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

async function getCommercialTables(connection, userId) {
  const [openQuotes] = await connection.query(
    `SELECT id_cotizacion, nombre_proyecto, cliente, ciudad, estado, tipo_proyecto,
            numero_equipos, estatus_proyecto, fecha_cotizacion, fecha_solicitud
       FROM ventas_cotizaciones_cor
      WHERE id_asesor = ?
        AND COALESCE(activo, 1) = 1
        AND UPPER(TRIM(COALESCE(estatus_proyecto, ''))) NOT IN ('VENDIDO', 'PERDIDO')
      ORDER BY COALESCE(NULLIF(fecha_cotizacion, ''), NULLIF(fecha_solicitud, '')) DESC, id_cotizacion DESC
      LIMIT 100`,
    [userId]
  );

  const [soldQuotes] = await connection.query(
    `SELECT id_cotizacion, nombre_proyecto, cliente, ciudad, estado, tipo_proyecto,
            numero_equipos, estatus_proyecto, fecha_cierre
       FROM ventas_cotizaciones_cor
      WHERE id_asesor = ?
        AND COALESCE(activo, 1) = 1
        AND UPPER(TRIM(COALESCE(estatus_proyecto, ''))) = 'VENDIDO'
      ORDER BY NULLIF(fecha_cierre, '') DESC, id_cotizacion DESC
      LIMIT 100`,
    [userId]
  );

  const [lostQuotes] = await connection.query(
    `SELECT id_cotizacion, nombre_proyecto, cliente, ciudad, estado, tipo_proyecto,
            numero_equipos, estatus_proyecto, razon_perdido, fecha_cambio_estatus
       FROM ventas_cotizaciones_cor
      WHERE id_asesor = ?
        AND COALESCE(activo, 1) = 1
        AND UPPER(TRIM(COALESCE(estatus_proyecto, ''))) = 'PERDIDO'
      ORDER BY NULLIF(fecha_cambio_estatus, '') DESC, id_cotizacion DESC
      LIMIT 100`,
    [userId]
  );

  const [clients] = await connection.query(
    `SELECT vc.id_cliente, vc.nombre_empresa, vc.razon_social, vc.nombre_contacto,
            vc.telefono, vc.email, vc.ciudad, vc.estado, vc.tipo_cliente,
            vc.estatus_cliente, vc.proyecto_vendido
       FROM ventas_clientes vc
      WHERE vc.activo = 1
        AND (
          vc.created_by = ?
          OR EXISTS (
            SELECT 1 FROM usuarios u
             WHERE u.id_SB = ?
               AND u.estado = 1
               AND UPPER(TRIM(COALESCE(u.iniciales, ''))) = UPPER(TRIM(COALESCE(vc.iniciales, '')))
          )
        )
      ORDER BY vc.nombre_empresa ASC, vc.id_cliente DESC
      LIMIT 100`,
    [userId, userId]
  );

  const [networks] = await connection.query(
    `SELECT vr.id_redes, vr.nombre_contacto, vr.nombre_empresa, vr.nombre_proyecto,
            vr.ciudad, estado.articulo AS estado, solicitud.articulo AS solicitud,
            contacto.articulo AS contacto_via, estatus.articulo AS estatus,
            u.nombre AS asignado_a, vr.created_at
       FROM ventas_redes vr
       LEFT JOIN catalogo_general estado ON estado.id_catalogo = vr.id_estado
       LEFT JOIN catalogo_general solicitud ON solicitud.id_catalogo = vr.id_solicitud
       LEFT JOIN catalogo_general contacto ON contacto.id_catalogo = vr.id_contacto_via
       LEFT JOIN catalogo_general estatus ON estatus.id_catalogo = vr.id_estatus
       LEFT JOIN usuarios u ON u.id_SB = vr.id_usuario_asignado
      WHERE vr.activo = 1
        AND (vr.id_usuario_asignado = ? OR vr.created_by = ?)
      ORDER BY vr.created_at DESC, vr.id_redes DESC
      LIMIT 100`,
    [userId, userId]
  );

  const [prospecting] = await connection.query(
    `SELECT p.id_pros, p.empresa, p.proyecto, p.contacto, p.telefono, p.correo,
            p.ciudad, p.estado, p.tipo_proyecto, p.fecha_visita,
            COALESCE(NULLIF(TRIM(p.estatus), ''), pe.nombre) AS estatus
       FROM ventas_prospecciones p
       LEFT JOIN ventas_prospeccion_estatus pe ON pe.id_estatus = p.id_estatus
      WHERE p.activo = 1
        AND p.id_usuario = ?
      ORDER BY p.fecha_visita DESC, p.id_pros DESC
      LIMIT 100`,
    [userId]
  );

  return {
    cotizaciones: openQuotes,
    ventas: soldQuotes,
    perdido: lostQuotes,
    clientes: clients,
    redes: networks,
    prospeccion: prospecting
  };
}

module.exports.getCommercialTables = getCommercialTables;

async function getOperationalTables(connection, userId) {
  const [userRows] = await connection.query(
    `SELECT id_SB, nombre, iniciales, correo
       FROM usuarios
      WHERE id_SB = ?
        AND estado = 1
      LIMIT 1`,
    [userId]
  );

  const selectedUser = userRows[0];
  if (!selectedUser) {
    return {
      instalaciones: [],
      logistica: [],
      tareas_asignadas: [],
      tareas_creadas: []
    };
  }

  const [installations] = await connection.query(
    `SELECT
       f.id_proyecto,
       MAX(f.proyecto) AS proyecto,
       MAX(f.cliente) AS cliente,
       MAX(f.ciudad) AS ciudad,
       MAX(f.estado) AS estado,
       MAX(f.vendedor) AS vendedor,
       COUNT(*) AS total_equipos,
       SUM(CASE WHEN f.estatus = '08-T' THEN 1 ELSE 0 END) AS equipos_terminados,
       MAX(f.estatus) AS estatus,
       MAX(f.updated_at) AS ultima_actualizacion
     FROM ins_fl f
     WHERE f.activo = 1
       AND f.id_asesor = ?
     GROUP BY f.id_proyecto
     ORDER BY proyecto ASC
     LIMIT 100`,
    [userId]
  );

  const [logistics] = await connection.query(
    `SELECT
       l.id_log_ops,
       l.id_ppns,
       l.proyecto,
       l.estatus,
       l.cantidad,
       l.asesor,
       l.supervisor,
       l.proveedor,
       l.puerto_destino,
       l.lugar_entrega,
       l.fecha_llegada_estimada,
       l.fecha_entrega_programada,
       l.fecha_entrega_real_obra,
       l.comentarios
     FROM log_ops l
     WHERE UPPER(TRIM(COALESCE(l.estatus, ''))) NOT IN ('ENTREGADO', 'ENTREGADA')
       AND (
         EXISTS (
           SELECT 1
             FROM ins_fl f_scope
            WHERE f_scope.id_asesor = ?
              AND TRIM(COALESCE(f_scope.id_proyecto, '')) = TRIM(COALESCE(l.id_ppns, ''))
         )
         OR UPPER(TRIM(COALESCE(l.asesor, ''))) IN (
           UPPER(TRIM(COALESCE(?, ''))),
           UPPER(TRIM(COALESCE(?, '')))
         )
       )
     ORDER BY
       CASE WHEN l.fecha_entrega_programada IS NULL THEN 1 ELSE 0 END,
       l.fecha_entrega_programada ASC,
       l.id_log_ops DESC
     LIMIT 100`,
    [userId, selectedUser.iniciales, selectedUser.nombre]
  );

  const taskSelect = `SELECT
       p.id_pendiente,
       p.pendiente,
       p.descripcion,
       p.prioridad,
       p.estatus,
       p.tipo_pendiente,
       p.area,
       p.proyecto,
       p.equipo,
       p.due_date,
       p.creado_por_email,
       p.updated_at,
       COALESCE(rel.responsables, '') AS responsables
     FROM pendientes p
     LEFT JOIN (
       SELECT id_pendiente,
              GROUP_CONCAT(
                CASE WHEN tipo_relacion = 'RESPONSABLE' THEN iniciales_usuario END
                ORDER BY iniciales_usuario SEPARATOR ', '
              ) AS responsables
         FROM pendientes_usuarios
        GROUP BY id_pendiente
     ) rel ON rel.id_pendiente = p.id_pendiente`;

  const taskOrder = `ORDER BY
       CASE p.prioridad
         WHEN 'CRITICA' THEN 1
         WHEN 'ALTA' THEN 2
         WHEN 'MEDIA' THEN 3
         WHEN 'BAJA' THEN 4
         ELSE 5
       END,
       CASE WHEN p.due_date IS NULL THEN 1 ELSE 0 END,
       p.due_date ASC,
       p.updated_at DESC
     LIMIT 100`;

  const [assignedTasks] = await connection.query(
    `${taskSelect}
     WHERE UPPER(TRIM(COALESCE(p.estatus, ''))) <> 'CERRADO'
       AND EXISTS (
         SELECT 1
           FROM pendientes_usuarios pu
          WHERE pu.id_pendiente = p.id_pendiente
            AND UPPER(TRIM(COALESCE(pu.tipo_relacion, ''))) = 'RESPONSABLE'
            AND UPPER(TRIM(COALESCE(pu.iniciales_usuario, ''))) = UPPER(TRIM(COALESCE(?, '')))
       )
     ${taskOrder}`,
    [selectedUser.iniciales]
  );

  const [createdTasks] = await connection.query(
    `${taskSelect}
     WHERE UPPER(TRIM(COALESCE(p.estatus, ''))) <> 'CERRADO'
       AND LOWER(TRIM(COALESCE(p.creado_por_email, ''))) = LOWER(TRIM(COALESCE(?, '')))
     ${taskOrder}`,
    [selectedUser.correo]
  );

  return {
    instalaciones: installations,
    logistica: logistics,
    tareas_asignadas: assignedTasks,
    tareas_creadas: createdTasks
  };
}

module.exports.getOperationalTables = getOperationalTables;
