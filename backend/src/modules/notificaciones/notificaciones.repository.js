const db = require('../../config/db');

async function getNotificaciones({ whereSql, params, orderSql, limit }) {
  const [rows] = await db.query(`
    SELECT *
    FROM sup_notificaciones n
    ${whereSql}
    ${orderSql}
    LIMIT ?
  `, [...params, limit]);

  return rows;
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
  marcarComoAbierta,
  marcarComoNueva
};
