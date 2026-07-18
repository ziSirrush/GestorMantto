const db = require('../../config/db');

async function getAllowedEmpresas() {
  const [rows] = await db.query(`
    SELECT DISTINCT empresa AS value
    FROM usuarios
    WHERE estado = 1 AND empresa IS NOT NULL AND empresa <> ''
    ORDER BY empresa ASC
  `);
  return rows;
}

async function getPendientes(userTaskWhere, userTaskParams) {
  const [rows] = await db.query(`
    SELECT
      p.*,
      COALESCE(st.total_subtareas, 0) AS total_subtareas,
      COALESCE(st.subtareas_cerradas, 0) AS subtareas_cerradas,
      COALESCE(cm.total_comentarios, 0) AS total_comentarios,
      COALESCE(rel.responsables, '') AS responsables,
      COALESCE(rel.seguimiento, '') AS seguimiento
    FROM pendientes p
    LEFT JOIN (
      SELECT id_pendiente,
             COUNT(*) AS total_subtareas,
             SUM(CASE WHEN estatus = 'Cerrado' THEN 1 ELSE 0 END) AS subtareas_cerradas
      FROM pendientes_subtareas
      GROUP BY id_pendiente
    ) st ON st.id_pendiente = p.id_pendiente
    LEFT JOIN (
      SELECT id_pendiente, COUNT(*) AS total_comentarios
      FROM pendientes_comentarios
      GROUP BY id_pendiente
    ) cm ON cm.id_pendiente = p.id_pendiente
    LEFT JOIN (
      SELECT id_pendiente,
             GROUP_CONCAT(CASE WHEN tipo_relacion = 'RESPONSABLE' THEN iniciales_usuario END ORDER BY iniciales_usuario SEPARATOR ', ') AS responsables,
             GROUP_CONCAT(CASE WHEN tipo_relacion = 'SEGUIMIENTO' THEN iniciales_usuario END ORDER BY iniciales_usuario SEPARATOR ', ') AS seguimiento
      FROM pendientes_usuarios
      GROUP BY id_pendiente
    ) rel ON rel.id_pendiente = p.id_pendiente
    WHERE ${userTaskWhere}
    ORDER BY
      CASE p.prioridad WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'MEDIA' THEN 3 WHEN 'BAJA' THEN 4 ELSE 5 END,
      CASE p.estatus WHEN 'Pendiente' THEN 1 WHEN 'En proceso' THEN 2 WHEN 'Cerrado' THEN 3 ELSE 4 END,
      CASE WHEN p.due_date IS NULL THEN 1 ELSE 0 END,
      p.due_date ASC,
      p.updated_at DESC
    LIMIT 200
  `, userTaskParams);
  return rows;
}

async function getNotificaciones(notifWhere, params, leido, limit) {
  const order = leido === 1
    ? 'ORDER BY COALESCE(n.fecha_lectura, n.fecha_creacion) DESC, n.fecha_creacion DESC'
    : 'ORDER BY n.fecha_creacion DESC';

  const [rows] = await db.query(`
    SELECT n.* FROM sup_notificaciones n
    ${notifWhere} AND n.leido = ?
    ${order}
    LIMIT ?
  `, [...params, leido, limit]);
  return rows;
}

async function getActividadReciente(userTaskWhere, userTaskParams) {
  const [rows] = await db.query(`
    SELECT * FROM (
      SELECT
        p.id_pendiente AS id,
        'tareas' AS modulo,
        p.pendiente AS titulo,
        CONCAT('Pendiente ', LOWER(p.estatus), ' · ', p.tipo_pendiente) AS descripcion,
        p.updated_at AS fecha_creacion,
        '✅' AS icono,
        p.id_pendiente AS id_referencia
      FROM pendientes p
      WHERE ${userTaskWhere}
      UNION ALL
      SELECT
        pc.id_comentario AS id,
        'tareas' AS modulo,
        p.pendiente AS titulo,
        CONCAT(COALESCE(u.iniciales, 'Usuario'), ' agregó comentario') AS descripcion,
        pc.fecha AS fecha_creacion,
        '💬' AS icono,
        p.id_pendiente AS id_referencia
      FROM pendientes_comentarios pc
      INNER JOIN pendientes p ON p.id_pendiente = pc.id_pendiente
      LEFT JOIN usuarios u ON u.id_SB = pc.id_usuario
      WHERE ${userTaskWhere}
    ) x
    ORDER BY fecha_creacion DESC
    LIMIT 20
  `, [...userTaskParams, ...userTaskParams]);
  return rows;
}

async function getAreas() {
  const [rows] = await db.query(`
    SELECT DISTINCT area AS value
    FROM usuarios
    WHERE estado = 1 AND area IS NOT NULL AND area <> ''
    ORDER BY area ASC
  `);
  return rows;
}

async function getUsuarios(empresa) {
  const params = [];
  let where = 'estado = 1';
  if (empresa) {
    where += ' AND empresa = ?';
    params.push(empresa);
  }

  const [rows] = await db.query(`
    SELECT id_SB, nombre, iniciales, correo, area, puesto, empresa
    FROM usuarios
    WHERE ${where}
    ORDER BY nombre ASC
  `, params);
  return rows;
}

async function getProyectos(empresa) {
  const params = [];
  let where = "estado_registro = 1 AND proyecto IS NOT NULL AND proyecto <> ''";
  if (empresa) {
    where += ' AND proyecto_cc_x_port = ?';
    params.push(empresa);
  }

  const [rows] = await db.query(`
    SELECT DISTINCT proyecto
    FROM portafolio
    WHERE ${where}
    ORDER BY proyecto ASC
    LIMIT 250
  `, params);
  return rows;
}

module.exports = {
  getAllowedEmpresas,
  getPendientes,
  getNotificaciones,
  getActividadReciente,
  getAreas,
  getUsuarios,
  getProyectos
};
