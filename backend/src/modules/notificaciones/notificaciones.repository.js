const db = require('../../config/db');
const { bellVisibilitySql_gnral } = require('../../services/notifications/notification-policy');

async function getNotificaciones({ whereSql, params, orderSql, limit }) {
  const [rows] = await db.query(`
    SELECT n.*,
      CASE
        WHEN n.tipo_notificacion = 'FOTOGRAFIA_PROYECTO_ACTUALIZADA'
          AND n.ruta_destino LIKE 'detalle:proyecto:%'
          AND EXISTS (
            SELECT 1 FROM ins_proyecto_fotos pf_cor
            WHERE pf_cor.id_photo = n.id_referencia
              AND LOWER(TRIM(pf_cor.id_ppns)) = LOWER(TRIM(SUBSTRING(
                n.ruta_destino, CHAR_LENGTH('detalle:proyecto:') + 1
              )))
          )
          AND NOT EXISTS (
            SELECT 1 FROM portafolio_proyecto_fotos pf_uni
            WHERE pf_uni.id_photo = n.id_referencia
              AND LOWER(TRIM(pf_uni.proyecto)) = LOWER(TRIM(SUBSTRING(
                n.ruta_destino, CHAR_LENGTH('detalle:proyecto:') + 1
              )))
          )
        THEN CONCAT('detalle:proyecto-corellian:', SUBSTRING(
          n.ruta_destino, CHAR_LENGTH('detalle:proyecto:') + 1
        ))
        WHEN n.tipo_notificacion = 'FOTOGRAFIA_PROYECTO_ACTUALIZADA'
          AND n.ruta_destino LIKE 'detalle:proyecto:%'
          AND EXISTS (
            SELECT 1 FROM portafolio_proyecto_fotos pf_uni_only
            WHERE pf_uni_only.id_photo = n.id_referencia
              AND LOWER(TRIM(pf_uni_only.proyecto)) = LOWER(TRIM(SUBSTRING(
                n.ruta_destino, CHAR_LENGTH('detalle:proyecto:') + 1
              )))
          )
          AND NOT EXISTS (
            SELECT 1 FROM ins_proyecto_fotos pf_cor_only
            WHERE pf_cor_only.id_photo = n.id_referencia
              AND LOWER(TRIM(pf_cor_only.id_ppns)) = LOWER(TRIM(SUBSTRING(
                n.ruta_destino, CHAR_LENGTH('detalle:proyecto:') + 1
              )))
          )
        THEN n.ruta_destino
        WHEN n.tipo_notificacion = 'FOTOGRAFIA_PROYECTO_ACTUALIZADA'
          AND n.ruta_destino LIKE 'detalle:proyecto:%'
        THEN 'notifications'
        ELSE n.ruta_destino
      END AS ruta_destino_resuelta
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

  // Proyeccion de lectura: el historico en Aiven no se modifica.
  // Si ambos dominios coinciden o ninguno lo hace, la ruta se queda en la
  // bandeja de notificaciones: no se infiere un proyecto por su nombre.
  return rows.map((row) => {
    const { ruta_destino_resuelta, ...data } = row;
    return {
      ...data,
      ruta_destino: ruta_destino_resuelta || data.ruta_destino
    };
  });
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
        fecha_lectura = COALESCE(fecha_lectura, UTC_TIMESTAMP(3)),
        fecha_actualizacion = UTC_TIMESTAMP(3)
    WHERE id_notificacion = ?
      AND id_usuario = ?
      AND activo = 1
  `, [idNotificacion, idUsuario]);

  return result;
}

async function marcarTodasComoAbiertas({ whereSql, params }) {
  const [result] = await db.query(`
    UPDATE sup_notificaciones n
    LEFT JOIN notificacion_eventos e
      ON e.codigo_evento = n.tipo_notificacion
     AND e.activo = 1
    LEFT JOIN notificacion_preferencias p
      ON p.codigo_evento = n.tipo_notificacion
     AND p.id_usuario = n.id_usuario
    SET n.leido = 1,
        n.fecha_lectura = COALESCE(n.fecha_lectura, UTC_TIMESTAMP(3)),
        n.fecha_actualizacion = UTC_TIMESTAMP(3)
    ${whereSql}
      AND n.leido = 0
      AND ${bellVisibilitySql_gnral('n', 'e', 'p')}
  `, params);

  return result;
}

async function marcarComoNueva(idNotificacion, idUsuario) {
  const [result] = await db.query(`
    UPDATE sup_notificaciones
    SET leido = 0,
        fecha_lectura = NULL,
        fecha_actualizacion = UTC_TIMESTAMP(3)
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
  marcarTodasComoAbiertas,
  marcarComoNueva
};
