// [Aster | 2026-08-27 | ASTER-MG | FASE_1_CIERRE_LUMBRE_CURSOR_ID_UNICO_V001]
const db = require('../../config/db');
const { pushVisibilitySql_gnral } = require('../../services/notifications/notification-policy');

async function upsertSubscription({ userId, endpoint, p256dh, auth, userAgent, deviceName }) {
  const [result] = await db.query(`
    INSERT INTO notificaciones_push_suscripciones (
      id_usuario, endpoint, p256dh, auth, user_agent, dispositivo_nombre,
      activo, ultimo_uso_at, ultimo_id_notificacion
    ) VALUES (
      ?, ?, ?, ?, ?, ?, 1, NOW(),
      (
        SELECT COALESCE(MAX(n_cursor.id_notificacion), 0)
        FROM sup_notificaciones n_cursor
        WHERE n_cursor.id_usuario = ?
      )
    )
    ON DUPLICATE KEY UPDATE
      id_usuario = VALUES(id_usuario),
      p256dh = VALUES(p256dh),
      auth = VALUES(auth),
      user_agent = VALUES(user_agent),
      dispositivo_nombre = VALUES(dispositivo_nombre),
      activo = 1,
      ultimo_uso_at = COALESCE(ultimo_uso_at, NOW()),
      updated_at = NOW()
  `, [userId, endpoint, p256dh, auth, userAgent || null, deviceName || null, userId]);
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
    SELECT id_suscripcion, activo, ultimo_uso_at, ultimo_id_notificacion, updated_at
    FROM notificaciones_push_suscripciones
    WHERE id_usuario = ? AND endpoint = ?
    LIMIT 1
  `, [userId, endpoint]);
  return rows[0] || null;
}

async function listActiveSubscriptions(limit = 300) {
  const [rows] = await db.query(`
    SELECT
      s.id_suscripcion,
      s.id_usuario,
      s.endpoint,
      s.p256dh,
      s.auth,
      s.ultimo_uso_at,
      s.ultimo_id_notificacion,
      s.created_at
    FROM notificaciones_push_suscripciones s
    WHERE s.activo = 1
    ORDER BY COALESCE(s.ultimo_uso_at, s.created_at) ASC, s.id_suscripcion ASC
    LIMIT ?
  `, [Number(limit)]);
  return rows;
}

async function getNotificationWatermark() {
  const [rows] = await db.query(`
    SELECT COALESCE(MAX(id_notificacion), 0) AS watermark_id
    FROM sup_notificaciones
  `);
  return Number(rows[0]?.watermark_id || 0);
}

async function listPendingNotifications({ userId, cursorId, watermarkId, limit = 20 }) {
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
      n.fecha_creacion,
      COALESCE(e.prioridad_default, 'MEDIA') AS prioridad_notificacion
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
      AND n.id_notificacion > ?
      AND n.id_notificacion <= ?
      AND ${pushVisibilitySql_gnral('n', 'e', 'p')}
    ORDER BY n.id_notificacion ASC
    LIMIT ?
  `, [userId, Number(cursorId || 0), Number(watermarkId || 0), Number(limit)]);
  return rows;
}

async function advanceSubscriptionCursor({ subscriptionId, cursorId, caughtUp = false }) {
  const normalizedCursorId = Math.max(0, Number(cursorId || 0));
  const [result] = await db.query(`
    UPDATE notificaciones_push_suscripciones
    SET
      ultimo_id_notificacion = GREATEST(COALESCE(ultimo_id_notificacion, 0), ?),
      ultimo_uso_at = CASE WHEN ? = 1 THEN NOW() ELSE ultimo_uso_at END,
      updated_at = NOW()
    WHERE id_suscripcion = ? AND activo = 1
  `, [normalizedCursorId, caughtUp ? 1 : 0, subscriptionId]);
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
  getNotificationWatermark,
  listPendingNotifications,
  advanceSubscriptionCursor,
  deactivateById
};
