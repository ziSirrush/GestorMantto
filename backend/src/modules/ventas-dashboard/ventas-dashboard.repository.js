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
  const quoteAdvisor = `COALESCE(NULLIF(TRIM(q.asesor), ''), NULLIF(TRIM(uq.iniciales), ''), uq.nombre)`;
  const [openQuotes] = await connection.query(
    `SELECT q.id_cotizacion, q.nombre_proyecto, q.cliente,
            ${quoteAdvisor} AS asesor,
            q.estatus_proyecto, q.numero_equipos, q.fecha_cotizacion,
            q.fecha_solicitud, q.ciudad, q.estado
       FROM ventas_cotizaciones_cor q
       LEFT JOIN usuarios uq ON uq.id_SB = q.id_asesor
      WHERE q.id_asesor = ?
        AND COALESCE(q.activo, 1) = 1
        AND UPPER(TRIM(COALESCE(q.estatus_proyecto, ''))) NOT IN ('VENDIDO', 'PERDIDO')
      ORDER BY COALESCE(NULLIF(q.fecha_cotizacion, ''), NULLIF(q.fecha_solicitud, '')) DESC,
               q.id_cotizacion DESC
      LIMIT 100`,
    [userId]
  );

  const [soldQuotes] = await connection.query(
    `SELECT q.id_cotizacion, q.nombre_proyecto, q.cliente,
            ${quoteAdvisor} AS asesor,
            q.fecha_cierre, q.numero_equipos, q.fecha_cotizacion,
            q.fecha_solicitud, q.ciudad, q.estado, q.estatus_proyecto
       FROM ventas_cotizaciones_cor q
       LEFT JOIN usuarios uq ON uq.id_SB = q.id_asesor
      WHERE q.id_asesor = ?
        AND COALESCE(q.activo, 1) = 1
        AND UPPER(TRIM(COALESCE(q.estatus_proyecto, ''))) = 'VENDIDO'
      ORDER BY NULLIF(q.fecha_cierre, '') DESC, q.id_cotizacion DESC
      LIMIT 100`,
    [userId]
  );

  const [lostQuotes] = await connection.query(
    `SELECT q.id_cotizacion, q.nombre_proyecto, q.cliente,
            ${quoteAdvisor} AS asesor,
            q.razon_perdido, q.empresa_vs_perdido, q.numero_equipos,
            q.fecha_cotizacion, q.fecha_solicitud, q.ciudad, q.estado,
            q.estatus_proyecto
       FROM ventas_cotizaciones_cor q
       LEFT JOIN usuarios uq ON uq.id_SB = q.id_asesor
      WHERE q.id_asesor = ?
        AND COALESCE(q.activo, 1) = 1
        AND UPPER(TRIM(COALESCE(q.estatus_proyecto, ''))) = 'PERDIDO'
      ORDER BY COALESCE(NULLIF(q.fecha_cambio_estatus, ''), NULLIF(q.fecha_cotizacion, ''), NULLIF(q.fecha_solicitud, '')) DESC,
               q.id_cotizacion DESC
      LIMIT 100`,
    [userId]
  );

  const quoteRelationSql = `
    q.activo = 1
    AND (
      (q.id_cliente IS NOT NULL AND q.id_cliente = vc.id_cliente)
      OR UPPER(TRIM(COALESCE(q.cliente, ''))) = UPPER(TRIM(COALESCE(vc.nombre_empresa, '')))
    )
    AND (
      (
        q.id_asesor IS NOT NULL
        AND q.id_asesor = (
          SELECT MIN(uqa.id_SB)
            FROM usuarios uqa
           WHERE uqa.estado = 1
             AND UPPER(TRIM(COALESCE(uqa.iniciales, ''))) = UPPER(TRIM(COALESCE(vc.iniciales, '')))
        )
      )
      OR UPPER(TRIM(COALESCE(q.asesor, ''))) = UPPER(TRIM(COALESCE(vc.iniciales, '')))
    )`;

  const [clients] = await connection.query(
    `SELECT vc.id_cliente, vc.nombre_empresa, vc.razon_social, vc.iniciales,
            vc.ciudad, vc.estado, vc.tipo_cliente,
            (SELECT COUNT(*) FROM ventas_cotizaciones_cor q WHERE ${quoteRelationSql}) AS cotizaciones,
            (SELECT COUNT(*) FROM ventas_cotizaciones_cor q WHERE ${quoteRelationSql}
              AND UPPER(TRIM(COALESCE(q.estatus_proyecto, ''))) NOT IN ('VENDIDO', 'PERDIDO')) AS en_proceso,
            (SELECT COUNT(*) FROM ventas_cotizaciones_cor q WHERE ${quoteRelationSql}
              AND UPPER(TRIM(COALESCE(q.estatus_proyecto, ''))) = 'VENDIDO') AS vendidas,
            (SELECT COUNT(*) FROM ventas_cotizaciones_cor q WHERE ${quoteRelationSql}
              AND UPPER(TRIM(COALESCE(q.estatus_proyecto, ''))) = 'PERDIDO') AS perdidas
       FROM ventas_clientes vc
      WHERE vc.activo = 1
        AND (
          vc.created_by = ?
          OR EXISTS (
            SELECT 1 FROM usuarios uc
             WHERE uc.id_SB = ?
               AND uc.estado = 1
               AND UPPER(TRIM(COALESCE(uc.iniciales, ''))) = UPPER(TRIM(COALESCE(vc.iniciales, '')))
          )
        )
      ORDER BY vc.nombre_empresa ASC, vc.id_cliente DESC
      LIMIT 100`,
    [userId, userId]
  );

  const [networks] = await connection.query(
    `SELECT vr.id_redes, vr.nombre_contacto, vr.nombre_empresa, vr.nombre_proyecto,
            contacto.articulo AS contacto_via, solicitud.articulo AS solicitud,
            estatus.articulo AS estatus, u.nombre AS asignado_a,
            vr.id_cotizacion,
            COALESCE(NULLIF(TRIM(q.nombre_proyecto), ''), CONCAT('MX', LPAD(q.id_cotizacion, 6, '0'))) AS cotizacion
       FROM ventas_redes vr
       LEFT JOIN catalogo_general solicitud ON solicitud.id_catalogo = vr.id_solicitud
       LEFT JOIN catalogo_general contacto ON contacto.id_catalogo = vr.id_contacto_via
       LEFT JOIN catalogo_general estatus ON estatus.id_catalogo = vr.id_estatus
       LEFT JOIN usuarios u ON u.id_SB = vr.id_usuario_asignado
       LEFT JOIN ventas_cotizaciones_cor q ON q.id_cotizacion = vr.id_cotizacion AND COALESCE(q.activo, 1) = 1
      WHERE vr.activo = 1
        AND (vr.id_usuario_asignado = ? OR vr.created_by = ?)
      ORDER BY vr.created_at DESC, vr.id_redes DESC
      LIMIT 100`,
    [userId, userId]
  );

  const [prospecting] = await connection.query(
    `SELECT p.id_pros, p.empresa, p.proyecto,
            COALESCE(NULLIF(TRIM(p.estatus), ''), pe.nombre) AS estatus,
            COALESCE(NULLIF(TRIM(up.iniciales), ''), up.nombre) AS asesor,
            p.ciudad, p.estado, p.fecha_visita
       FROM ventas_prospecciones p
       LEFT JOIN ventas_prospeccion_estatus pe ON pe.id_estatus = p.id_estatus
       LEFT JOIN usuarios up ON up.id_SB = p.id_usuario
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
       MAX(f.vendedor) AS asesor,
       MAX(f.supervisor_fl) AS supervisor,
       COUNT(*) AS total_equipos,
       MAX(f.activo) AS activo,
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
       l.marca,
       l.no_control,
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

async function getPdfCreatorProfile(connection, userId) {
  const [rows] = await connection.query(
    `SELECT id_SB AS id_usuario, nombre, iniciales, correo
       FROM usuarios
      WHERE id_SB = ?
        AND estado = 1
      LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function getPdfSharedTasks(connection, creatorId, advisorId) {
  const creator = await getPdfCreatorProfile(connection, creatorId);
  const advisor = await getPdfCreatorProfile(connection, advisorId);
  if (!creator || !advisor || Number(creator.id_usuario) === Number(advisor.id_usuario)) return [];

  const [rows] = await connection.query(
    `SELECT DISTINCT
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
       p.updated_at,
       COALESCE(rel.responsables, '') AS responsables
     FROM pendientes p
     LEFT JOIN (
       SELECT id_pendiente,
              GROUP_CONCAT(
                CASE WHEN UPPER(TRIM(COALESCE(tipo_relacion, ''))) = 'RESPONSABLE'
                     THEN iniciales_usuario END
                ORDER BY iniciales_usuario SEPARATOR ', '
              ) AS responsables
         FROM pendientes_usuarios
        GROUP BY id_pendiente
     ) rel ON rel.id_pendiente = p.id_pendiente
     WHERE UPPER(TRIM(COALESCE(p.tipo_pendiente, ''))) = 'COLABORATIVA'
       AND UPPER(TRIM(COALESCE(p.estatus, ''))) <> 'CERRADO'
       AND (
         (
           LOWER(TRIM(COALESCE(p.creado_por_email, ''))) = LOWER(TRIM(COALESCE(?, '')))
           AND EXISTS (
             SELECT 1
               FROM pendientes_usuarios pu_advisor
              WHERE pu_advisor.id_pendiente = p.id_pendiente
                AND UPPER(TRIM(COALESCE(pu_advisor.tipo_relacion, ''))) IN ('RESPONSABLE', 'SEGUIMIENTO')
                AND UPPER(TRIM(COALESCE(pu_advisor.iniciales_usuario, ''))) = UPPER(TRIM(COALESCE(?, '')))
           )
         )
         OR
         (
           LOWER(TRIM(COALESCE(p.creado_por_email, ''))) = LOWER(TRIM(COALESCE(?, '')))
           AND EXISTS (
             SELECT 1
               FROM pendientes_usuarios pu_creator
              WHERE pu_creator.id_pendiente = p.id_pendiente
                AND UPPER(TRIM(COALESCE(pu_creator.tipo_relacion, ''))) IN ('RESPONSABLE', 'SEGUIMIENTO')
                AND UPPER(TRIM(COALESCE(pu_creator.iniciales_usuario, ''))) = UPPER(TRIM(COALESCE(?, '')))
           )
         )
       )
     ORDER BY
       CASE UPPER(TRIM(COALESCE(p.prioridad, '')))
         WHEN 'CRITICA' THEN 1
         WHEN 'ALTA' THEN 2
         WHEN 'MEDIA' THEN 3
         WHEN 'BAJA' THEN 4
         ELSE 5
       END,
       CASE WHEN p.due_date IS NULL THEN 1 ELSE 0 END,
       p.due_date ASC,
       p.updated_at DESC`,
    [creator.correo, advisor.iniciales, advisor.correo, creator.iniciales]
  );

  return rows;
}

async function getPdfAdvisorData(connection, userId) {
  const [profileRows] = await connection.query(
    `SELECT id_SB AS id_usuario, nombre, iniciales, puesto
       FROM usuarios
      WHERE id_SB = ?
        AND estado = 1
      LIMIT 1`,
    [userId]
  );
  const asesor = profileRows[0] || null;
  if (!asesor) return null;

  const equipmentJoin = `LEFT JOIN (
      SELECT id_cotizacion, SUM(COALESCE(cantidad, 0)) AS equipos_hijos
        FROM ventas_cotizaciones_equipos_cor
       WHERE activo = 1
       GROUP BY id_cotizacion
    ) eq ON eq.id_cotizacion = q.id_cotizacion`;
  const totalEquipment = `(COALESCE(q.numero_equipos, 0) + COALESCE(eq.equipos_hijos, 0))`;

  const [quotes] = await connection.query(
    `SELECT
       q.id_cotizacion,
       q.nombre_proyecto,
       q.estatus_proyecto,
       q.cliente,
       ${totalEquipment} AS numero_equipos,
       q.ciudad,
       q.estado,
       q.fecha_solicitud,
       q.fecha_cotizacion,
       q.fecha_cambio_estatus,
       q.fecha_cierre,
       q.razon_perdido,
       q.empresa_vs_perdido,
       COALESCE(com.comentarios, '') AS comentarios
     FROM ventas_cotizaciones_cor q
     ${equipmentJoin}
     LEFT JOIN (
       SELECT vc.id_cotizacion,
              GROUP_CONCAT(
                CONCAT(
                  DATE_FORMAT(vc.created_at, '%d/%m/%Y'),
                  ' - ',
                  COALESCE(NULLIF(TRIM(u.iniciales), ''), u.nombre, 'Usuario'),
                  ': ',
                  vc.comentario
                )
                ORDER BY vc.created_at ASC
                SEPARATOR '\n'
              ) AS comentarios
         FROM ventas_cotizaciones_comentarios vc
         LEFT JOIN usuarios u ON u.id_SB = vc.id_usuario
        WHERE vc.activo = 1
        GROUP BY vc.id_cotizacion
     ) com ON com.id_cotizacion = q.id_cotizacion
     WHERE q.id_asesor = ?
       AND COALESCE(q.activo, 1) = 1
     ORDER BY q.id_cotizacion ASC`,
    [userId]
  );

  const [prospecting] = await connection.query(
    `SELECT p.id_pros, p.empresa, p.proyecto, p.contacto, p.ciudad, p.estado,
            COALESCE(NULLIF(TRIM(p.estatus), ''), pe.nombre) AS estatus,
            p.fecha_visita
       FROM ventas_prospecciones p
       LEFT JOIN ventas_prospeccion_estatus pe ON pe.id_estatus = p.id_estatus
      WHERE p.activo = 1
        AND p.id_usuario = ?
      ORDER BY p.fecha_visita DESC, p.id_pros DESC`,
    [userId]
  );

  const [networks] = await connection.query(
    `SELECT vr.id_redes, vr.nombre_contacto, vr.ciudad,
            contacto.articulo AS contacto_via,
            vr.nombre_empresa, vr.nombre_proyecto
       FROM ventas_redes vr
       LEFT JOIN catalogo_general contacto ON contacto.id_catalogo = vr.id_contacto_via
      WHERE vr.activo = 1
        AND (vr.id_usuario_asignado = ? OR vr.created_by = ?)
      ORDER BY vr.nombre_contacto ASC, vr.id_redes ASC`,
    [userId, userId]
  );

  const [installations] = await connection.query(
    `SELECT
       f.id_proyecto,
       MAX(f.proyecto) AS proyecto,
       MAX(f.supervisor_fl) AS supervisor,
       MAX(f.cliente) AS cliente,
       MAX(f.estatus) AS estatus,
       MAX(f.estado) AS estado,
       COUNT(*) AS total_equipos,
       MAX(f.avance_oc) AS avance_oc,
       MAX(f.avance_mo) AS avance_mo,
       MAX(f.avance_aj) AS avance_aj,
       COALESCE(mat.material, '') AS material
     FROM ins_fl f
     LEFT JOIN (
       SELECT id_ppns,
              GROUP_CONCAT(
                CONCAT_WS(' - ',
                  NULLIF(TRIM(estatus), ''),
                  CASE WHEN cantidad IS NULL THEN NULL ELSE CONCAT(cantidad, ' equipo(s)') END,
                  NULLIF(TRIM(marca), '')
                )
                ORDER BY id_log_ops ASC SEPARATOR '\n'
              ) AS material
         FROM log_ops
        GROUP BY id_ppns
     ) mat ON TRIM(COALESCE(mat.id_ppns, '')) = TRIM(COALESCE(f.id_proyecto, ''))
     WHERE f.activo = 1
       AND f.id_asesor = ?
     GROUP BY f.id_proyecto, mat.material
     ORDER BY proyecto ASC`,
    [userId]
  );

  const [logistics] = await connection.query(
    `SELECT
       l.id_log_ops,
       l.id_ppns,
       l.proyecto,
       l.supervisor,
       l.estatus,
       l.fecha_exw,
       l.fecha_llegada_estimada AS eta,
       l.fecha_salida_estimada AS etd,
       COALESCE(NULLIF(TRIM(l.fecha_entrega_real_obra), ''), NULLIF(TRIM(l.fecha_estimada_obra), ''), 'SIN FECHA') AS obra_real_estimada,
       COALESCE(NULLIF(TRIM(l.pago_cliente), ''), 'SIN FECHA') AS pago_cliente
     FROM log_ops l
     WHERE UPPER(TRIM(COALESCE(l.estatus, ''))) NOT IN ('ENTREGADO', 'ENTREGADA')
       AND (
         EXISTS (
           SELECT 1
             FROM ins_fl fs
            WHERE fs.activo = 1
              AND fs.id_asesor = ?
              AND TRIM(COALESCE(fs.id_proyecto, '')) = TRIM(COALESCE(l.id_ppns, ''))
         )
         OR UPPER(TRIM(COALESCE(l.asesor, ''))) IN (
           UPPER(TRIM(COALESCE(?, ''))),
           UPPER(TRIM(COALESCE(?, '')))
         )
       )
     ORDER BY
       CASE UPPER(TRIM(COALESCE(l.estatus, '')))
         WHEN 'SIN PRODUCCIÓN / DOCUMENTACIÓN PENDIENTE' THEN 1
         WHEN 'SIN PRODUCCION / DOCUMENTACION PENDIENTE' THEN 1
         WHEN 'SIN PRODUCCIÓN / PRIMERA VISITA A OBRA' THEN 2
         WHEN 'SIN PRODUCCION / PRIMERA VISITA A OBRA' THEN 2
         WHEN 'SIN PRODUCCIÓN / PENDIENTE LIBERACIÓN POR PARTE DEL CLIENTE' THEN 3
         WHEN 'SIN PRODUCCION / PENDIENTE LIBERACION POR PARTE DEL CLIENTE' THEN 3
         WHEN 'SIN PRODUCCIÓN / PROGRAMADOS A PRODUCCIÓN' THEN 4
         WHEN 'SIN PRODUCCION / PROGRAMADOS A PRODUCCION' THEN 4
         WHEN 'EN PRODUCCION' THEN 5
         WHEN 'EN PRODUCCIÓN' THEN 5
         WHEN 'PARADOS POR CLIENTE' THEN 6
         WHEN 'PENDIENTE PAGO LIBERACIÓN' THEN 7
         WHEN 'PENDIENTE PAGO LIBERACION' THEN 7
         WHEN 'PROGRAMADO' THEN 8
         WHEN 'EN TRANSITO' THEN 9
         WHEN 'EN TRÁNSITO' THEN 9
         WHEN 'PROGRAMA ENTREGA' THEN 10
         WHEN 'ALMACENADOS' THEN 11
         ELSE 99
       END,
       l.proyecto ASC,
       l.id_log_ops ASC`,
    [userId, asesor.iniciales, asesor.nombre]
  );

  const [clients] = await connection.query(
    `SELECT
       vc.id_cliente,
       vc.nombre_empresa AS empresa,
       vc.ciudad,
       COALESCE(NULLIF(TRIM(vc.estatus_cliente), ''), NULLIF(TRIM(vc.tipo_cliente), ''), '') AS estatus_cliente,
       COALESCE(qs.proyectos_vendidos, NULLIF(TRIM(vc.proyecto_vendido), ''), '') AS proyecto_vendido,
       COALESCE(qs.cotizaciones_sistema, 0) AS cotizaciones_sistema,
       COALESCE(ins.contratos_activos, 0) AS contratos_activos
     FROM ventas_clientes vc
     LEFT JOIN (
       SELECT
         q.id_cliente,
         COUNT(*) AS cotizaciones_sistema,
         GROUP_CONCAT(
           DISTINCT CASE
             WHEN UPPER(TRIM(COALESCE(q.estatus_proyecto, ''))) = 'VENDIDO'
             THEN q.nombre_proyecto END
           ORDER BY q.nombre_proyecto SEPARATOR '\n'
         ) AS proyectos_vendidos
       FROM ventas_cotizaciones_cor q
       WHERE q.activo = 1
         AND q.id_asesor = ?
       GROUP BY q.id_cliente
     ) qs ON qs.id_cliente = vc.id_cliente
     LEFT JOIN (
       SELECT UPPER(TRIM(COALESCE(cliente, ''))) AS cliente_normalizado,
              COUNT(DISTINCT id_proyecto) AS contratos_activos
         FROM ins_fl
        WHERE activo = 1
          AND id_asesor = ?
        GROUP BY UPPER(TRIM(COALESCE(cliente, '')))
     ) ins ON ins.cliente_normalizado = UPPER(TRIM(COALESCE(vc.nombre_empresa, '')))
     WHERE vc.activo = 1
       AND (
         vc.created_by = ?
         OR EXISTS (
           SELECT 1
             FROM usuarios uc
            WHERE uc.id_SB = ?
              AND uc.estado = 1
              AND UPPER(TRIM(COALESCE(uc.iniciales, ''))) = UPPER(TRIM(COALESCE(vc.iniciales, '')))
         )
         OR qs.id_cliente IS NOT NULL
       )
     ORDER BY vc.nombre_empresa ASC, vc.id_cliente ASC`,
    [userId, userId, userId, userId]
  );

  return {
    asesor,
    cotizaciones: quotes,
    prospeccion: prospecting,
    redes: networks,
    proyectos_activos: installations,
    logistica: logistics,
    clientes: clients
  };
}

module.exports.getPdfCreatorProfile = getPdfCreatorProfile;
module.exports.getPdfSharedTasks = getPdfSharedTasks;
module.exports.getPdfAdvisorData = getPdfAdvisorData;
