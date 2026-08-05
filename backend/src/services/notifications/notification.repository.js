const db = require('../../config/db');

async function listEventPreferences(idUsuario) {
  const [rows] = await db.query(`
    SELECT
      e.codigo_evento,
      e.agrupacion,
      e.modulo,
      e.accion,
      e.nombre_evento,
      e.descripcion,
      e.prioridad_default,
      e.configurable,
      e.obligatoria,
      COALESCE(p.campana, e.campana_default) AS campana,
      COALESCE(p.push, e.push_default) AS push,
      COALESCE(p.correo, e.correo_default) AS correo,
      COALESCE(p.silenciada, 0) AS silenciada
    FROM notificacion_eventos e
    LEFT JOIN notificacion_preferencias p
      ON p.codigo_evento = e.codigo_evento
     AND p.id_usuario = ?
    WHERE e.activo = 1
    ORDER BY e.agrupacion, e.modulo, e.orden, e.nombre_evento
  `, [idUsuario]);
  return rows;
}

async function findEvent(connection, codigoEvento) {
  const [rows] = await connection.query(`
    SELECT *
    FROM notificacion_eventos
    WHERE codigo_evento = ?
      AND activo = 1
    LIMIT 1
  `, [codigoEvento]);
  return rows[0] || null;
}

async function findPreference(connection, idUsuario, codigoEvento) {
  const [rows] = await connection.query(`
    SELECT *
    FROM notificacion_preferencias
    WHERE id_usuario = ?
      AND codigo_evento = ?
    LIMIT 1
  `, [idUsuario, codigoEvento]);
  return rows[0] || null;
}

async function upsertPreference(connection, idUsuario, preference) {
  const [result] = await connection.query(`
    INSERT INTO notificacion_preferencias (
      id_usuario, codigo_evento, campana, push, correo, silenciada, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
    ON DUPLICATE KEY UPDATE
      campana = VALUES(campana),
      push = VALUES(push),
      correo = VALUES(correo),
      silenciada = VALUES(silenciada),
      updated_at = NOW()
  `, [
    idUsuario,
    preference.codigo_evento,
    preference.campana,
    preference.push,
    preference.correo,
    preference.silenciada
  ]);
  return result;
}

async function insertNotification(connection, notification) {
  const [result] = await connection.query(`
    INSERT INTO sup_notificaciones (
      id_usuario,
      tipo_notificacion,
      titulo_notificacion,
      mensaje_notificacion,
      icono_notificacion,
      accion_notificacion,
      id_referencia,
      ruta_destino,
      leido,
      activo,
      fecha_creacion,
      fecha_actualizacion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, NOW(), NOW())
  `, [
    notification.id_usuario,
    notification.tipo_notificacion,
    notification.titulo_notificacion,
    notification.mensaje_notificacion,
    notification.icono_notificacion || null,
    notification.accion_notificacion,
    notification.id_referencia || null,
    notification.ruta_destino || null
  ]);
  return result;
}

async function withTransaction(work) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listEventPreferences,
  findEvent,
  findPreference,
  upsertPreference,
  insertNotification,
  withTransaction
};
