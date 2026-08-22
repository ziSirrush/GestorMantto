const db = require('../../config/db');
const { bellVisibilitySql_gnral } = require('../../services/notifications/notification-policy');

async function getNotificaciones({ whereSql, params, orderSql, limit }) {
  const [rows] = await db.query(`
    SELECT n.*
    FROM sup_notificaciones n
    LEFT JOIN notificacion_eventos e
      ON e.codigo_evento = n.tipo_notificacion
     AND e.activo = 1
    LEFT JOIN notificacion_preferencias p
      ON p.codigo_evento = n.tipo_notificacion
     AND p.id_usuario = n.id_usuario
    ${whereSql}
      AND ${bellVisibilitySql_gnral('n', 'e', 'p')}
    ${orderSql}
    LIMIT ?
  `, [...params, limit]);

  return rows;
}

async function getEstadoNotificaciones({ whereSql, params }) {
  const [rows] = await db.query(`
    SELECT
      COUNT(*) AS nuevas,
      COALESCE(MAX(n.id_notificacion), 0) AS ultimo_id
    FROM sup_notificaciones n
    LEFT JOIN notificacion_eventos e
      ON e.codigo_evento = n.tipo_notificacion
     AND e.activo = 1
    LEFT JOIN notificacion_preferencias p
      ON p.codigo_evento = n.tipo_notificacion
     AND p.id_usuario = n.id_usuario
    ${whereSql}
      AND n.leido = 0
      AND ${bellVisibilitySql_gnral('n', 'e', 'p')}
  `, params);

  const row = rows[0] || {};
  return {
    nuevas: Number(row.nuevas || 0),
    ultimo_id: Number(row.ultimo_id || 0)
  };
}

async function marcarComoAbierta(idNotificacion, idUsuario) {
  const [result] = await db.query(`
    UPDATE sup_notificaciones
    SET leido = 1,
        fecha_lectura = COALESCE(fecha_lectura, NOW()),
        fecha_actualizacion = NOW()
    WHERE id_notificacion = ?
      AND id_usuario = ?
      AND activo = 1
  `, [idNotificacion, idUsuario]);

  return result;
}

async function marcarComoNueva(idNotificacion, idUsuario) {
  const [result] = await db.query(`
    UPDATE sup_notificaciones
    SET leido = 0,
        fecha_lectura = NULL,
        fecha_actualizacion = NOW()
    WHERE id_notificacion = ?
      AND id_usuario = ?
      AND activo = 1
  `, [idNotificacion, idUsuario]);

  return result;
}

module.exports = {
  getNotificaciones,
  getEstadoNotificaciones,
  marcarComoAbierta,
  marcarComoNueva
};
