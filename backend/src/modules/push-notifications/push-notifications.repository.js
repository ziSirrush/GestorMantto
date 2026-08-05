const db = require('../../config/db');

async function upsertSubscription({ userId, endpoint, p256dh, auth, userAgent, deviceName }) {
  const [result] = await db.query(`
    INSERT INTO notificaciones_push_suscripciones (
      id_usuario, endpoint, p256dh, auth, user_agent, dispositivo_nombre, activo, ultimo_uso_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, NOW())
    ON DUPLICATE KEY UPDATE
      id_usuario = VALUES(id_usuario),
      p256dh = VALUES(p256dh),
      auth = VALUES(auth),
      user_agent = VALUES(user_agent),
      dispositivo_nombre = VALUES(dispositivo_nombre),
      activo = 1,
      ultimo_uso_at = COALESCE(ultimo_uso_at, NOW()),
      updated_at = NOW()
  `, [userId, endpoint, p256dh, auth, userAgent || null, deviceName || null]);
  return result;
}

async function deactivateSubscription({ userId, endpoint }) {
  const [result] = await db.query(`
    UPDATE notificaciones_push_suscripciones
    SET activo = 0, updated_at = NOW()
    WHERE id_usuario = ? AND endpoint = ?
  `, [userId, endpoint]);
  return result;
}

async function getSubscriptionStatus({ userId, endpoint }) {
  const [rows] = await db.query(`
    SELECT id_suscripcion, activo, ultimo_uso_at, updated_at
    FROM notificaciones_push_suscripciones
    WHERE id_usuario = ? AND endpoint = ?
    LIMIT 1
  `, [userId, endpoint]);
  return rows[0] || null;
}

async function listActiveSubscriptions(limit = 300) {
  const [rows] = await db.query(`
    SELECT id_suscripcion, id_usuario, endpoint, p256dh, auth, ultimo_uso_at, created_at
    FROM notificaciones_push_suscripciones
    WHERE activo = 1
    ORDER BY COALESCE(ultimo_uso_at, created_at) ASC, id_suscripcion ASC
    LIMIT ?
  `, [Number(limit)]);
  return rows;
}

async function listPendingNotifications({ userId, cursor, cycleCutoff, limit = 20 }) {
  const [rows] = await db.query(`
    SELECT
      n.id_notificacion,
      n.tipo_notificacion,
      n.titulo_notificacion,
      n.mensaje_notificacion,
      n.icono_notificacion,
      n.accion_notificacion,
      n.id_referencia,
      n.ruta_destino,
      n.fecha_creacion
    FROM sup_notificaciones n
    LEFT JOIN notificacion_eventos e
      ON e.codigo_evento = n.tipo_notificacion
     AND e.activo = 1
    LEFT JOIN notificacion_preferencias p
      ON p.codigo_evento = n.tipo_notificacion
     AND p.id_usuario = n.id_usuario
    WHERE n.id_usuario = ?
      AND n.activo = 1
      AND n.leido = 0
      AND n.fecha_creacion > ?
      AND n.fecha_creacion <= ?
      AND (
        COALESCE(e.obligatoria, 0) = 1
        OR (COALESCE(p.push, 1) = 1 AND COALESCE(p.silenciada, 0) = 0)
      )
    ORDER BY n.fecha_creacion ASC, n.id_notificacion ASC
    LIMIT ?
  `, [userId, cursor, cycleCutoff, Number(limit)]);
  return rows;
}

async function advanceSubscriptionCursor({ subscriptionId, cycleCutoff }) {
  const [result] = await db.query(`
    UPDATE notificaciones_push_suscripciones
    SET ultimo_uso_at = ?, updated_at = NOW()
    WHERE id_suscripcion = ? AND activo = 1
  `, [cycleCutoff, subscriptionId]);
  return result;
}

async function deactivateById(subscriptionId) {
  const [result] = await db.query(`
    UPDATE notificaciones_push_suscripciones
    SET activo = 0, updated_at = NOW()
    WHERE id_suscripcion = ?
  `, [subscriptionId]);
  return result;
}

module.exports = {
  upsertSubscription,
  deactivateSubscription,
  getSubscriptionStatus,
  listActiveSubscriptions,
  listPendingNotifications,
  advanceSubscriptionCursor,
  deactivateById
};
