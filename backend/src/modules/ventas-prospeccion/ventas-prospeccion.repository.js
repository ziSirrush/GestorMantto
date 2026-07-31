const db = require('../../config/db');

function getConnection() {
  return db.getConnection();
}

async function findExistingUserIds(connection, userIds) {
  const ids = [...new Set(userIds.filter(Number.isInteger))];
  if (!ids.length) return new Set();

  const [rows] = await connection.query(
    `SELECT id_SB
       FROM usuarios
      WHERE id_SB IN (${ids.map(() => '?').join(', ')})`,
    ids
  );

  return new Set(rows.map((row) => Number(row.id_SB)));
}

async function findExistingProspectionIds(connection, prospectionIds) {
  const ids = [...new Set(prospectionIds.filter(Number.isInteger))];
  if (!ids.length) return new Set();

  const [rows] = await connection.query(
    `SELECT id_pros
       FROM ventas_prospecciones
      WHERE id_pros IN (${ids.map(() => '?').join(', ')})`,
    ids
  );

  return new Set(rows.map((row) => Number(row.id_pros)));
}

async function findStatusIdByName(connection, statusName) {
  if (!statusName) return null;
  const [rows] = await connection.query(
    `SELECT id_estatus
       FROM ventas_prospeccion_estatus
      WHERE UPPER(TRIM(nombre)) = UPPER(TRIM(?))
        AND activo = 1
      ORDER BY id_estatus ASC
      LIMIT 1`,
    [statusName]
  );
  return rows[0] ? Number(rows[0].id_estatus) : null;
}

async function upsertProspection(connection, record) {
  await connection.query(
    `INSERT INTO ventas_prospecciones (
       id_pros, empresa, proyecto, ubicacion, latitud, longitud,
       contacto, correo, telefono, comentario, id_usuario,
       ciudad, estado, tipo_proyecto, fecha_visita,
       id_estatus, estatus, fecha_cam_estatus,
       nuevo, proyecto_activo, proyecto_cotizado, activo
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 1)
     ON DUPLICATE KEY UPDATE
       empresa = VALUES(empresa),
       proyecto = VALUES(proyecto),
       ubicacion = VALUES(ubicacion),
       latitud = VALUES(latitud),
       longitud = VALUES(longitud),
       contacto = VALUES(contacto),
       correo = VALUES(correo),
       telefono = VALUES(telefono),
       comentario = VALUES(comentario),
       id_usuario = VALUES(id_usuario),
       ciudad = VALUES(ciudad),
       estado = VALUES(estado),
       tipo_proyecto = VALUES(tipo_proyecto),
       fecha_visita = VALUES(fecha_visita),
       id_estatus = VALUES(id_estatus),
       estatus = VALUES(estatus),
       fecha_cam_estatus = VALUES(fecha_cam_estatus),
       updated_at = CURRENT_TIMESTAMP(3)`,
    [
      record.id_pros,
      record.empresa,
      record.proyecto,
      record.ubicacion,
      record.latitud,
      record.longitud,
      record.contacto,
      record.correo,
      record.telefono,
      record.comentario,
      record.id_usuario,
      record.ciudad,
      record.estado,
      record.tipo_proyecto,
      record.fecha_visita,
      record.id_estatus,
      record.estatus,
      record.fecha_cam_estatus
    ]
  );
}

async function replaceVisitFiles(connection, idPros, files) {
  await connection.query(
    `DELETE FROM ventas_prospeccion_archivos
      WHERE id_pros = ?
        AND tipo_relacion = 'VISITA'`,
    [idPros]
  );

  for (const file of files) {
    await connection.query(
      `INSERT INTO ventas_prospeccion_archivos (
         id_pros, id_com_pors, tipo_relacion,
         nombre_archivo, nombre_original, mime_type, extension,
         storage_provider, storage_url, orden, es_imagen, activo
       ) VALUES (?, NULL, 'VISITA', ?, ?, ?, ?, 'GLIDE', ?, ?, 1, 1)`,
      [
        idPros,
        file.nombre_archivo,
        file.nombre_original,
        file.mime_type,
        file.extension,
        file.storage_url,
        file.orden
      ]
    );
  }
}

async function upsertComment(connection, record) {
  await connection.query(
    `INSERT INTO ventas_prospeccion_comentarios (
       id_com_pors, id_pros, id_usuario, comentario,
       fecha_hora, editado, activo, created_at
     ) VALUES (?, ?, ?, ?, ?, 0, 1, COALESCE(?, CURRENT_TIMESTAMP(3)))
     ON DUPLICATE KEY UPDATE
       id_pros = VALUES(id_pros),
       id_usuario = VALUES(id_usuario),
       comentario = VALUES(comentario),
       fecha_hora = VALUES(fecha_hora),
       activo = 1,
       created_at = CASE
         WHEN VALUES(fecha_hora) IS NOT NULL THEN VALUES(fecha_hora)
         ELSE created_at
       END,
       updated_at = CURRENT_TIMESTAMP(3)`,
    [
      record.id_com_pors,
      record.id_pros,
      record.id_usuario,
      record.comentario,
      record.fecha_hora,
      record.fecha_hora
    ]
  );
}

async function replaceCommentFile(connection, record) {
  await connection.query(
    `DELETE FROM ventas_prospeccion_archivos
      WHERE id_com_pors = ?
        AND tipo_relacion = 'COMENTARIO'`,
    [record.id_com_pors]
  );

  if (!record.file) return;

  await connection.query(
    `INSERT INTO ventas_prospeccion_archivos (
       id_pros, id_com_pors, tipo_relacion,
       nombre_archivo, nombre_original, mime_type, extension,
       storage_provider, storage_url, orden, es_imagen, activo,
       created_at
     ) VALUES (?, ?, 'COMENTARIO', ?, ?, ?, ?, 'GLIDE', ?, 1, ?, 1,
       COALESCE(?, CURRENT_TIMESTAMP(3)))`,
    [
      record.id_pros,
      record.id_com_pors,
      record.file.nombre_archivo,
      record.file.nombre_original,
      record.file.mime_type,
      record.file.extension,
      record.file.storage_url,
      record.file.es_imagen,
      record.fecha_hora
    ]
  );
}

module.exports = {
  getConnection,
  findExistingUserIds,
  findExistingProspectionIds,
  findStatusIdByName,
  upsertProspection,
  replaceVisitFiles,
  upsertComment,
  replaceCommentFile
};
