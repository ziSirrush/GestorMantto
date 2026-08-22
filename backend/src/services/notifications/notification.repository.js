const db = require('../../config/db');

async function listEventPreferences(idUsuario, queryable = db) {
  const [rows] = await queryable.query(`
    SELECT
      e.codigo_evento,
      e.agrupacion,
      e.modulo,
      e.accion,
      e.nombre_evento,
      e.descripcion,
      e.prioridad_default,
      e.campana_default,
      e.push_default,
      e.correo_default,
      r.id_rol AS id_rol_principal,
      r.rol AS rol_principal,
      ner.politica,
      CASE WHEN ner.politica = 'OPCIONAL' THEN 1 ELSE 0 END AS configurable,
      CASE WHEN ner.politica = 'OBLIGATORIA' THEN 1 ELSE 0 END AS obligatoria,
      CASE
        WHEN ner.politica = 'OBLIGATORIA' THEN 1
        ELSE COALESCE(p.campana, e.campana_default, 1)
      END AS campana,
      CASE
        WHEN ner.politica = 'OBLIGATORIA' THEN 1
        ELSE COALESCE(p.push, e.push_default, 0)
      END AS push,
      COALESCE(p.correo, e.correo_default, 0) AS correo,
      CASE
        WHEN ner.politica = 'OBLIGATORIA' THEN 0
        ELSE COALESCE(p.silenciada, 0)
      END AS silenciada
    FROM usuarios u
    INNER JOIN usuario_roles ur
      ON ur.id_usuario = u.id_SB
     AND ur.activo = 1
     AND ur.principal = 1
    INNER JOIN roles r
      ON r.id_rol = ur.id_rol
     AND r.estado = 1
    INNER JOIN notificacion_evento_roles ner
      ON ner.id_rol = r.id_rol
     AND ner.activo = 1
     AND ner.politica IN ('OBLIGATORIA', 'OPCIONAL')
    INNER JOIN notificacion_eventos e
      ON e.codigo_evento = ner.codigo_evento
     AND e.activo = 1
    LEFT JOIN notificacion_preferencias p
      ON p.codigo_evento = e.codigo_evento
     AND p.id_usuario = u.id_SB
    WHERE u.id_SB = ?
      AND u.estado = 1
      AND (
        SELECT COUNT(*)
        FROM usuario_roles ur_count
        INNER JOIN roles r_count
          ON r_count.id_rol = ur_count.id_rol
         AND r_count.estado = 1
        WHERE ur_count.id_usuario = u.id_SB
          AND ur_count.activo = 1
          AND ur_count.principal = 1
      ) = 1
    ORDER BY e.agrupacion, e.modulo, e.orden, e.nombre_evento
  `, [idUsuario]);
  return rows;
}

async function findEvent(connection, codigoEvento) {
  const [rows] = await connection.query(`
    SELECT
      e.*,
      EXISTS (
        SELECT 1
        FROM notificacion_evento_roles ner
        WHERE ner.codigo_evento = e.codigo_evento
      ) AS matriz_roles_configurada
    FROM notificacion_eventos e
    WHERE e.codigo_evento = ?
      AND e.activo = 1
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

async function listPreferencesForUsers(connection, idUsuarios, codigoEvento) {
  const ids = [...new Set((Array.isArray(idUsuarios) ? idUsuarios : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return [];

  const [rows] = await connection.query(`
    SELECT *
    FROM notificacion_preferencias
    WHERE codigo_evento = ?
      AND id_usuario IN (?)
  `, [codigoEvento, ids]);
  return rows;
}

async function listRecipientPolicyContext(connection, {
  codigoEvento,
  idUsuarios,
  zonaOperativaIds = []
}) {
  const ids = [...new Set((Array.isArray(idUsuarios) ? idUsuarios : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
  const zoneIds = [...new Set((Array.isArray(zonaOperativaIds) ? zonaOperativaIds : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];

  if (!ids.length) return [];

  const zoneSql = zoneIds.length
    ? `EXISTS (
        SELECT 1
        FROM usuario_zop uz_policy
        WHERE uz_policy.usuario_id = u.id_SB
          AND uz_policy.estado = 1
          AND uz_policy.zona_id IN (?)
      )`
    : '1';

  const params = [];
  if (zoneIds.length) params.push(zoneIds);
  params.push(codigoEvento, ids);

  const [rows] = await connection.query(`
    SELECT
      u.id_SB AS id_usuario,
      ur.id_usuario_rol,
      r.id_rol AS id_rol_principal,
      r.rol AS rol_principal,
      ner.id_evento_rol,
      ner.politica,
      ner.activo AS configuracion_activa,
      p.campana,
      p.push,
      p.correo,
      p.silenciada,
      ${zoneSql} AS zona_autorizada
    FROM usuarios u
    LEFT JOIN usuario_roles ur
      ON ur.id_usuario = u.id_SB
     AND ur.activo = 1
     AND ur.principal = 1
    LEFT JOIN roles r
      ON r.id_rol = ur.id_rol
     AND r.estado = 1
    LEFT JOIN notificacion_evento_roles ner
      ON ner.codigo_evento = ?
     AND ner.id_rol = r.id_rol
    LEFT JOIN notificacion_preferencias p
      ON p.codigo_evento = ner.codigo_evento
     AND p.id_usuario = u.id_SB
    WHERE u.id_SB IN (?)
      AND u.estado = 1
    ORDER BY u.id_SB, ur.id_usuario_rol
  `, params);

  return rows;
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

async function upsertPreferences(connection, idUsuario, preferences) {
  const items = Array.isArray(preferences) ? preferences : [];
  if (!items.length) return { affectedRows: 0 };

  const placeholders = items.map(() => '(?, ?, ?, ?, ?, ?, NOW(), NOW())').join(', ');
  const params = items.flatMap((preference) => [
    idUsuario,
    preference.codigo_evento,
    preference.campana,
    preference.push,
    preference.correo,
    preference.silenciada
  ]);

  const [result] = await connection.query(`
    INSERT INTO notificacion_preferencias (
      id_usuario, codigo_evento, campana, push, correo, silenciada, created_at, updated_at
    ) VALUES ${placeholders}
    ON DUPLICATE KEY UPDATE
      campana = VALUES(campana),
      push = VALUES(push),
      correo = VALUES(correo),
      silenciada = VALUES(silenciada),
      updated_at = NOW()
  `, params);
  return result;
}

async function insertNotifications(connection, notifications) {
  const items = Array.isArray(notifications) ? notifications : [];
  if (!items.length) return { affectedRows: 0 };

  const placeholders = items.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, 0, 1, NOW(), NOW())').join(', ');
  const params = items.flatMap((notification) => [
    notification.id_usuario,
    notification.tipo_notificacion,
    notification.titulo_notificacion,
    notification.mensaje_notificacion,
    notification.icono_notificacion || null,
    notification.accion_notificacion,
    notification.id_referencia || null,
    notification.ruta_destino || null
  ]);

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
    ) VALUES ${placeholders}
  `, params);
  return result;
}

async function insertNotification(connection, notification) {
  return insertNotifications(connection, [notification]);
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
  listPreferencesForUsers,
  listRecipientPolicyContext,
  upsertPreference,
  upsertPreferences,
  insertNotification,
  insertNotifications,
  withTransaction
};
