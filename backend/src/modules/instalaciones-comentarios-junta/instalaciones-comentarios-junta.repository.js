async function listByUser(connection, idUsuario, filters = {}) {
  const params = [idUsuario];
  let where = 'WHERE c.id_usuario = ? AND c.activo = 1';
  if (filters.referencia_sitio) {
    where += ' AND c.referencia_sitio = ?';
    params.push(filters.referencia_sitio);
  }
  const [rows] = await connection.query(`
    SELECT c.*, u.nombre AS usuario_nombre, u.iniciales AS usuario_iniciales
    FROM instalaciones_comentarios_junta c
    LEFT JOIN usuarios u ON u.id_SB = c.id_usuario
    ${where}
    ORDER BY c.fecha_creacion DESC, c.id_comentario DESC
    LIMIT 1000
  `, params);
  return rows;
}

async function create(connection, record) {
  const [result] = await connection.query(`
    INSERT INTO instalaciones_comentarios_junta (
      id_usuario, id_proyecto, proyecto, referencia_sitio,
      comentario, responsables, semana_iso, semana_orden
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    record.id_usuario,
    record.id_proyecto,
    record.proyecto,
    record.referencia_sitio,
    record.comentario,
    record.responsables,
    record.semana_iso,
    record.semana_orden
  ]);
  return result.insertId;
}

module.exports = { listByUser, create };
