'use strict';

const db = require('../../config/db');

async function insert_gnral(row, executor = db) {
  const [result] = await executor.query(`
    INSERT INTO usuario_interacciones (
      id_usuario,
      tipo_interaccion,
      modulo,
      entidad,
      id_referencia,
      titulo,
      descripcion,
      empresa_contexto,
      ruta_destino,
      payload_json,
      detalle_json,
      metodo_http,
      endpoint,
      ip_address,
      user_agent,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
  `, [
    row.id_usuario,
    row.tipo_interaccion,
    row.modulo,
    row.entidad,
    row.id_referencia,
    row.titulo,
    row.descripcion,
    row.empresa_contexto,
    row.ruta_destino,
    row.payload_json,
    row.detalle_json,
    row.metodo_http,
    row.endpoint,
    row.ip_address,
    row.user_agent
  ]);

  return Number(result.insertId || 0);
}

async function listForUser_gnral({ userId, limit = 100, offset = 0 }) {
  const [rows] = await db.query(`
    SELECT
      ui.id_interaccion AS id,
      ui.id_interaccion,
      ui.id_usuario,
      ui.tipo_interaccion,
      ui.modulo,
      ui.entidad,
      ui.id_referencia,
      ui.titulo,
      ui.descripcion,
      ui.empresa_contexto,
      ui.ruta_destino,
      ui.payload_json,
      ui.detalle_json,
      ui.metodo_http,
      ui.endpoint,
      ui.ip_address,
      ui.created_at,
      ui.created_at AS fecha_creacion,
      CASE UPPER(ui.tipo_interaccion)
        WHEN 'NAVEGACION' THEN '🧭'
        WHEN 'CONSULTAR' THEN '👁️'
        WHEN 'CREAR' THEN '🆕'
        WHEN 'EDITAR' THEN '✏️'
        WHEN 'ACTUALIZAR' THEN '🔄'
        WHEN 'COMENTAR' THEN '💬'
        WHEN 'CAMBIAR_ESTATUS' THEN '🔄'
        WHEN 'CAMBIAR_PRIORIDAD' THEN '⚡'
        WHEN 'ASIGNAR' THEN '👤'
        WHEN 'VALIDAR' THEN '✅'
        WHEN 'VOBO' THEN '✅'
        WHEN 'ADJUNTAR' THEN '📎'
        WHEN 'ELIMINAR' THEN '🗑️'
        ELSE '🕘'
      END AS icono
    FROM usuario_interacciones ui
    WHERE ui.id_usuario = ?
      AND UPPER(ui.tipo_interaccion) IN (
        'CREAR', 'EDITAR', 'ACTUALIZAR', 'COMENTAR', 'CAMBIAR_ESTATUS',
        'CAMBIAR_PRIORIDAD', 'ASIGNAR', 'VALIDAR', 'VOBO', 'ADJUNTAR', 'ELIMINAR'
      )
      AND LOWER(COALESCE(ui.entidad, '')) <> 'usuario'
      AND LOWER(COALESCE(ui.modulo, '')) NOT IN ('usuarios', 'panel-control', 'notifications', 'services')
    ORDER BY ui.created_at DESC, ui.id_interaccion DESC
    LIMIT ? OFFSET ?
  `, [Number(userId), Number(limit), Number(offset)]);

  return rows;
}

module.exports = {
  insert_gnral,
  listForUser_gnral
};
