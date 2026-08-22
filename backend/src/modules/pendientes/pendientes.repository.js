const db = require('../../config/db');

function executor_gnral(executor) {
  return executor || db;
}

function getExecutor_gnral() {
  return db;
}

async function getConnection_gnral() {
  return db.getConnection();
}

async function getAllowedEmpresas_gnral(executor) {
  const connection = executor_gnral(executor);
  const [rows] = await connection.query(`
    SELECT DISTINCT empresa AS value
    FROM usuarios
    WHERE estado = 1 AND empresa IS NOT NULL AND empresa <> ''
    ORDER BY empresa ASC
  `);
  return rows.map(row => row.value).filter(Boolean);
}

async function findUserCompanyByEmail_gnral(executor, email) {
  const connection = executor_gnral(executor);
  const [rows] = await connection.query(`
    SELECT empresa
    FROM usuarios
    WHERE LOWER(TRIM(correo)) = LOWER(TRIM(?))
      AND empresa IS NOT NULL
      AND TRIM(empresa) <> ''
    ORDER BY estado DESC, id_SB ASC
    LIMIT 1
  `, [email]);
  return rows[0] || null;
}

async function getCatalogAreas_gnral(executor) {
  const connection = executor_gnral(executor);
  const [rows] = await connection.query(`
    SELECT DISTINCT area AS value
    FROM usuarios
    WHERE estado = 1 AND area IS NOT NULL AND area <> ''
    ORDER BY area ASC
  `);
  return rows;
}

async function getCatalogUsers_gnral(executor, empresa) {
  const connection = executor_gnral(executor);
  const params = [];
  let where = 'estado = 1';
  if (empresa) {
    where += ' AND empresa = ?';
    params.push(empresa);
  }
  const [rows] = await connection.query(`
    SELECT id_SB, nombre, iniciales, correo, area, puesto, empresa
    FROM usuarios
    WHERE ${where}
    ORDER BY nombre ASC
  `, params);
  return rows;
}

async function getCatalogProjects_gnral(executor, { empresa, search }) {
  const connection = executor_gnral(executor);
  const params = [];
  let where = "estado_registro = 1 AND proyecto IS NOT NULL AND proyecto <> ''";
  if (empresa) {
    where += ' AND proyecto_cc_x_port = ?';
    params.push(empresa);
  }
  if (search) {
    where += ' AND proyecto LIKE ?';
    params.push(search);
  }
  const [rows] = await connection.query(`
    SELECT DISTINCT proyecto
    FROM portafolio
    WHERE ${where}
    ORDER BY proyecto ASC
    LIMIT 250
  `, params);
  return rows;
}

async function getCatalogEquipment_gnral(executor, { empresa, proyecto, search }) {
  const connection = executor_gnral(executor);
  const params = [];
  let where = "estado_registro = 1 AND numero_equipo IS NOT NULL AND numero_equipo <> ''";
  if (empresa) {
    where += ' AND proyecto_cc_x_port = ?';
    params.push(empresa);
  }
  if (proyecto) {
    where += ' AND proyecto = ?';
    params.push(proyecto);
  }
  if (search) {
    where += ' AND (numero_equipo LIKE ? OR identificacion_sitio LIKE ?)';
    params.push(search, search);
  }
  const [rows] = await connection.query(`
    SELECT DISTINCT numero_equipo, identificacion_sitio, proyecto, proyecto_cc_x_port
    FROM portafolio
    WHERE ${where}
    ORDER BY proyecto ASC, identificacion_sitio ASC, numero_equipo ASC
    LIMIT 500
  `, params);
  return rows;
}

async function listPendientes_gnral(executor, { user, type, status, search, limit }) {
  const connection = executor_gnral(executor);
  const clauses = [`(
    (p.tipo_pendiente = 'PERSONAL' AND LOWER(TRIM(p.creado_por_email)) = LOWER(TRIM(?)))
    OR
    (p.tipo_pendiente = 'COLABORATIVA' AND (
      LOWER(TRIM(p.creado_por_email)) = LOWER(TRIM(?))
      OR EXISTS (
        SELECT 1
        FROM pendientes_usuarios pu_scope
        WHERE pu_scope.id_pendiente = p.id_pendiente
          AND UPPER(TRIM(pu_scope.iniciales_usuario)) = UPPER(TRIM(?))
      )
    ))
  )`];
  const params = [user.correo, user.correo, user.iniciales || ''];

  if (type === 'PERSONAL' || type === 'COLABORATIVA') {
    clauses.push('p.tipo_pendiente = ?');
    params.push(type);
  }
  if (['Pendiente', 'En proceso', 'Cerrado'].includes(status)) {
    clauses.push('p.estatus = ?');
    params.push(status);
  }
  if (search) {
    clauses.push(`(
      p.pendiente LIKE ? OR p.descripcion LIKE ? OR p.proyecto LIKE ? OR p.equipo LIKE ? OR p.area LIKE ?
    )`);
    params.push(search, search, search, search, search);
  }

  const [rows] = await connection.query(`
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
    WHERE ${clauses.join(' AND ')}
    ORDER BY
      CASE p.prioridad WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'MEDIA' THEN 3 WHEN 'BAJA' THEN 4 ELSE 5 END,
      CASE p.estatus WHEN 'Pendiente' THEN 1 WHEN 'En proceso' THEN 2 WHEN 'Cerrado' THEN 3 ELSE 4 END,
      CASE WHEN p.due_date IS NULL THEN 1 ELSE 0 END,
      p.due_date ASC,
      p.updated_at DESC
    LIMIT ?
  `, [...params, limit]);
  return rows;
}

async function listSubtasks_gnral(executor, idPendiente) {
  const connection = executor_gnral(executor);
  const [rows] = await connection.query(`
    SELECT *
    FROM pendientes_subtareas
    WHERE id_pendiente = ?
    ORDER BY orden ASC, id_subtarea ASC
  `, [idPendiente]);
  return rows;
}

async function listTaskUsers_gnral(executor, idPendiente) {
  const connection = executor_gnral(executor);
  const [rows] = await connection.query(`
    SELECT pu.*, u.nombre, u.correo, u.area, u.puesto
    FROM pendientes_usuarios pu
    LEFT JOIN usuarios u ON u.iniciales = pu.iniciales_usuario
    WHERE pu.id_pendiente = ?
    ORDER BY pu.tipo_relacion ASC, pu.iniciales_usuario ASC
  `, [idPendiente]);
  return rows;
}

async function listTaskComments_gnral(executor, idPendiente) {
  const connection = executor_gnral(executor);
  const [rows] = await connection.query(`
    SELECT pc.*, u.nombre, u.iniciales, u.correo
    FROM pendientes_comentarios pc
    LEFT JOIN usuarios u ON u.id_SB = pc.id_usuario
    WHERE pc.id_pendiente = ?
    ORDER BY pc.fecha ASC, pc.id_comentario ASC
  `, [idPendiente]);
  return rows;
}

async function replaceTaskUsers_gnral(executor, idPendiente, initials, relationType) {
  const connection = executor_gnral(executor);
  await connection.query('DELETE FROM pendientes_usuarios WHERE id_pendiente = ?', [idPendiente]);
  for (const iniciales of initials) {
    await connection.query(
      'INSERT INTO pendientes_usuarios (id_pendiente, iniciales_usuario, tipo_relacion) VALUES (?, ?, ?)',
      [idPendiente, iniciales, relationType]
    );
  }
}

async function replaceSubtasks_gnral(executor, idPendiente, subtasks) {
  const connection = executor_gnral(executor);
  await connection.query('DELETE FROM pendientes_subtareas WHERE id_pendiente = ?', [idPendiente]);
  for (const item of subtasks) {
    await connection.query(
      'INSERT INTO pendientes_subtareas (id_pendiente, subtarea, estatus, orden) VALUES (?, ?, ?, ?)',
      [idPendiente, item.subtarea, item.estatus, item.orden]
    );
  }
}

async function listTaskResponsibles_gnral(executor, idPendiente) {
  const connection = executor_gnral(executor);
  const [rows] = await connection.query(`
    SELECT iniciales_usuario
    FROM pendientes_usuarios
    WHERE id_pendiente = ?
      AND tipo_relacion = 'RESPONSABLE'
  `, [idPendiente]);
  return rows;
}

async function listActiveUsersByInitials_gnral(executor, initials) {
  const connection = executor_gnral(executor);
  if (!initials.length) return [];
  const placeholders = initials.map(() => '?').join(',');
  const [rows] = await connection.query(`
    SELECT id_SB, nombre, iniciales
    FROM usuarios
    WHERE estado = 1 AND iniciales IN (${placeholders})
  `, initials);
  return rows;
}

async function insertTaskAssignmentNotification_gnral(executor, record) {
  const connection = executor_gnral(executor);
  await connection.query(`
    INSERT INTO sup_notificaciones (
      id_usuario, tipo_notificacion, titulo_notificacion, mensaje_notificacion,
      icono_notificacion, accion_notificacion, id_referencia, ruta_destino,
      leido, activo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
  `, [
    record.id_usuario,
    record.tipo_notificacion,
    record.titulo_notificacion,
    record.mensaje_notificacion,
    record.icono_notificacion,
    record.accion_notificacion,
    record.id_referencia,
    record.ruta_destino
  ]);
}

async function insertTask_gnral(executor, record) {
  const connection = executor_gnral(executor);
  const [result] = await connection.query(`
    INSERT INTO pendientes (
      pendiente, tipo_pendiente, estatus, area, empresa, descripcion,
      creado_por_email, creado_por_iniciales, due_date,
      proyecto, equipo, photo_url, adjunto_url, con_subtareas, prioridad
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
  `, [
    record.pendiente,
    record.tipo_pendiente,
    record.estatus,
    record.area,
    record.empresa,
    record.descripcion,
    record.creado_por_email,
    record.creado_por_iniciales,
    record.due_date,
    record.proyecto,
    record.equipo,
    record.con_subtareas,
    record.prioridad
  ]);
  return result.insertId;
}

async function updateTask_gnral(executor, idPendiente, record) {
  const connection = executor_gnral(executor);
  const [result] = await connection.query(`
    UPDATE pendientes SET
      pendiente = ?, tipo_pendiente = ?, area = ?, empresa = ?, descripcion = ?,
      due_date = ?, proyecto = ?, equipo = ?, con_subtareas = ?, prioridad = ?
    WHERE id_pendiente = ?
  `, [
    record.pendiente,
    record.tipo_pendiente,
    record.area,
    record.empresa,
    record.descripcion,
    record.due_date,
    record.proyecto,
    record.equipo,
    record.con_subtareas,
    record.prioridad,
    idPendiente
  ]);
  return result;
}

async function clearLegacyEvidence_gnral(executor, idPendiente) {
  const connection = executor_gnral(executor);
  return connection.query(
    'UPDATE pendientes SET photo_url = NULL, adjunto_url = NULL WHERE id_pendiente = ?',
    [idPendiente]
  );
}

async function getPriorityContext_gnral(executor, idPendiente, initials) {
  const connection = executor_gnral(executor);
  const [rows] = await connection.query(`
    SELECT p.tipo_pendiente, p.creado_por_email, pu.iniciales_usuario
    FROM pendientes p
    LEFT JOIN pendientes_usuarios pu
      ON pu.id_pendiente = p.id_pendiente
      AND pu.tipo_relacion = 'RESPONSABLE'
      AND pu.iniciales_usuario = ?
    WHERE p.id_pendiente = ?
    LIMIT 1
  `, [initials, idPendiente]);
  return rows[0] || null;
}

async function updatePriority_gnral(executor, idPendiente, priority) {
  const connection = executor_gnral(executor);
  const [result] = await connection.query(
    'UPDATE pendientes SET prioridad = ? WHERE id_pendiente = ?',
    [priority, idPendiente]
  );
  return result;
}

async function getCreatorEmail_gnral(executor, idPendiente) {
  const connection = executor_gnral(executor);
  const [rows] = await connection.query(
    'SELECT creado_por_email FROM pendientes WHERE id_pendiente = ? LIMIT 1',
    [idPendiente]
  );
  return rows[0] || null;
}

async function updateStatus_gnral(executor, idPendiente, status) {
  const connection = executor_gnral(executor);
  const [result] = await connection.query(
    'UPDATE pendientes SET estatus = ? WHERE id_pendiente = ?',
    [status, idPendiente]
  );
  return result;
}

async function findActiveUserIdByEmail_gnral(executor, email) {
  const connection = executor_gnral(executor);
  const [rows] = await connection.query(
    'SELECT id_SB FROM usuarios WHERE LOWER(TRIM(correo)) = LOWER(TRIM(?)) AND estado = 1 LIMIT 1',
    [email]
  );
  return rows[0] || null;
}

async function listRelatedActiveUserIds_gnral(executor, idPendiente) {
  const connection = executor_gnral(executor);
  const [rows] = await connection.query(`
    SELECT DISTINCT u.id_SB
    FROM pendientes_usuarios pu
    INNER JOIN usuarios u
      ON UPPER(TRIM(u.iniciales)) = UPPER(TRIM(pu.iniciales_usuario))
    WHERE pu.id_pendiente = ?
      AND u.estado = 1
  `, [idPendiente]);
  return rows;
}

async function listTaskPortafolioZones_gnral(executor, { equipment, project }) {
  const connection = executor_gnral(executor);
  const clauses = [];
  const params = [];
  if (equipment) {
    clauses.push("(TRIM(COALESCE(numero_equipo, '')) = TRIM(?) OR TRIM(COALESCE(identificacion_sitio, '')) = TRIM(?))");
    params.push(equipment, equipment);
  }
  if (project) {
    clauses.push("TRIM(COALESCE(proyecto, '')) = TRIM(?)");
    params.push(project);
  }
  if (!clauses.length) return [];
  const [rows] = await connection.query(`
    SELECT zona_operativa
    FROM portafolio
    WHERE estado_registro = 1
      AND (${clauses.join(' OR ')})
      AND zona_operativa IS NOT NULL
      AND TRIM(zona_operativa) <> ''
    ORDER BY id_portafolio DESC
    LIMIT 5
  `, params);
  return rows;
}

async function findActiveZoneId_gnral(executor, zoneValue) {
  const connection = executor_gnral(executor);
  const raw = String(zoneValue || '').trim();
  if (!raw) return null;
  const normalized = raw.toUpperCase().replace(/[-\s]/g, '');
  const [rows] = await connection.query(`
    SELECT id_zona, zona
    FROM z_op
    WHERE estado = 1
      AND (
        UPPER(TRIM(zona)) = UPPER(TRIM(?))
        OR UPPER(REPLACE(REPLACE(TRIM(zona), '-', ''), ' ', '')) = ?
      )
    ORDER BY id_zona ASC
    LIMIT 1
  `, [raw, normalized]);
  return rows[0] ? Number(rows[0].id_zona) || null : null;
}

async function insertLegacyCommentNotification_gnral(executor, record) {
  const connection = executor_gnral(executor);
  return connection.query(`
    INSERT INTO sup_notificaciones (
      id_usuario, tipo_notificacion, titulo_notificacion, mensaje_notificacion,
      icono_notificacion, accion_notificacion, id_referencia, ruta_destino,
      leido, activo
    ) VALUES (?, 'TAREA_COMENTARIO', 'Nueva interacción en tarea', ?, '💬', 'ABRIR_TAREA', ?, ?, 0, 1)
  `, [record.id_usuario, record.mensaje, record.id_referencia, record.ruta_destino]);
}

async function insertComment_gnral(executor, { idPendiente, idUsuario, comentario }) {
  const connection = executor_gnral(executor);
  const [result] = await connection.query(
    'INSERT INTO pendientes_comentarios (id_pendiente, id_usuario, comentario) VALUES (?, ?, ?)',
    [idPendiente, idUsuario, comentario]
  );
  return result.insertId;
}

async function updateSubtaskStatus_gnral(executor, { idPendiente, idSubtarea, status }) {
  const connection = executor_gnral(executor);
  const [result] = await connection.query(
    'UPDATE pendientes_subtareas SET estatus = ? WHERE id_pendiente = ? AND id_subtarea = ?',
    [status, idPendiente, idSubtarea]
  );
  return result;
}

async function deleteTaskNotifications_gnral(executor, idPendiente) {
  const connection = executor_gnral(executor);
  return connection.query(
    'DELETE FROM sup_notificaciones WHERE id_referencia = ? AND accion_notificacion = ?',
    [idPendiente, 'ABRIR_TAREA']
  );
}

async function deleteTask_gnral(executor, idPendiente) {
  const connection = executor_gnral(executor);
  const [result] = await connection.query(
    'DELETE FROM pendientes WHERE id_pendiente = ?',
    [idPendiente]
  );
  return result;
}

module.exports = {
  getExecutor_gnral,
  getConnection_gnral,
  getAllowedEmpresas_gnral,
  findUserCompanyByEmail_gnral,
  getCatalogAreas_gnral,
  getCatalogUsers_gnral,
  getCatalogProjects_gnral,
  getCatalogEquipment_gnral,
  listPendientes_gnral,
  listSubtasks_gnral,
  listTaskUsers_gnral,
  listTaskComments_gnral,
  replaceTaskUsers_gnral,
  replaceSubtasks_gnral,
  listTaskResponsibles_gnral,
  listActiveUsersByInitials_gnral,
  insertTaskAssignmentNotification_gnral,
  insertTask_gnral,
  updateTask_gnral,
  clearLegacyEvidence_gnral,
  getPriorityContext_gnral,
  updatePriority_gnral,
  getCreatorEmail_gnral,
  updateStatus_gnral,
  findActiveUserIdByEmail_gnral,
  listRelatedActiveUserIds_gnral,
  listTaskPortafolioZones_gnral,
  findActiveZoneId_gnral,
  insertLegacyCommentNotification_gnral,
  insertComment_gnral,
  updateSubtaskStatus_gnral,
  deleteTaskNotifications_gnral,
  deleteTask_gnral
};
