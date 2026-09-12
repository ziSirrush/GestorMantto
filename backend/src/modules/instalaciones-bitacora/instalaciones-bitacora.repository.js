// [Claude | 2026-09-11 | Bitácora de Obra | FASE_1_BACKEND_V001]
const db = require('../../config/db');

async function listDocumentos(idProyecto) {
  const [rows] = await db.query(
    `SELECT
       id_documento,
       drive_file_id,
       nombre_archivo,
       ruta_carpeta,
       mime_type,
       web_view_link,
       fecha_creacion_drive,
       fecha_modificacion_drive,
       fecha_primera_deteccion,
       fecha_ultima_deteccion,
       fecha_baja,
       estatus,
       CASE
         WHEN estatus = 'eliminado' THEN COALESCE(fecha_baja, fecha_modificacion_drive, fecha_creacion_drive, fecha_primera_deteccion)
         ELSE COALESCE(fecha_modificacion_drive, fecha_creacion_drive, fecha_primera_deteccion)
       END AS fecha_movimiento
     FROM instalaciones_bitacora_documentos
     WHERE id_proyecto = ?
     ORDER BY fecha_movimiento DESC, nombre_archivo ASC`,
    [idProyecto]
  );
  return rows;
}

async function getSyncEstado(idProyecto) {
  const [rows] = await db.query(
    `SELECT id_proyecto, ultima_sincronizacion, ultimo_usuario, total_activos, total_eliminados, truncado
     FROM instalaciones_bitacora_sync_estado
     WHERE id_proyecto = ?
     LIMIT 1`,
    [idProyecto]
  );
  return rows[0] || null;
}

async function findExistingFileIds(connection, idProyecto) {
  const [rows] = await connection.query(
    `SELECT drive_file_id, estatus
     FROM instalaciones_bitacora_documentos
     WHERE id_proyecto = ?`,
    [idProyecto]
  );
  return rows;
}

async function upsertDocumento(connection, idProyecto, doc) {
  await connection.query(
    `INSERT INTO instalaciones_bitacora_documentos (
       id_proyecto, carpeta_raiz_id, drive_file_id, drive_parent_folder_id,
       nombre_archivo, ruta_carpeta, mime_type, web_view_link,
       fecha_creacion_drive, fecha_modificacion_drive,
       fecha_primera_deteccion, fecha_ultima_deteccion, fecha_baja,
       estatus, detectado_por_usuario
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NULL, 'activo', ?)
     ON DUPLICATE KEY UPDATE
       carpeta_raiz_id = VALUES(carpeta_raiz_id),
       drive_parent_folder_id = VALUES(drive_parent_folder_id),
       nombre_archivo = VALUES(nombre_archivo),
       ruta_carpeta = VALUES(ruta_carpeta),
       mime_type = VALUES(mime_type),
       web_view_link = VALUES(web_view_link),
       fecha_creacion_drive = VALUES(fecha_creacion_drive),
       fecha_modificacion_drive = VALUES(fecha_modificacion_drive),
       fecha_ultima_deteccion = NOW(),
       fecha_baja = NULL,
       estatus = 'activo',
       detectado_por_usuario = VALUES(detectado_por_usuario)`,
    [
      idProyecto,
      doc.carpeta_raiz_id,
      doc.drive_file_id,
      doc.drive_parent_folder_id,
      doc.nombre_archivo,
      doc.ruta_carpeta,
      doc.mime_type,
      doc.web_view_link,
      doc.fecha_creacion_drive,
      doc.fecha_modificacion_drive,
      doc.detectado_por_usuario
    ]
  );
}

async function marcarEliminados(connection, idProyecto, driveFileIdsPresentes) {
  if (!driveFileIdsPresentes.length) {
    const [result] = await connection.query(
      `UPDATE instalaciones_bitacora_documentos
       SET estatus = 'eliminado', fecha_baja = NOW()
       WHERE id_proyecto = ? AND estatus = 'activo'`,
      [idProyecto]
    );
    return result.affectedRows;
  }

  const placeholders = driveFileIdsPresentes.map(() => '?').join(', ');
  const [result] = await connection.query(
    `UPDATE instalaciones_bitacora_documentos
     SET estatus = 'eliminado', fecha_baja = NOW()
     WHERE id_proyecto = ? AND estatus = 'activo' AND drive_file_id NOT IN (${placeholders})`,
    [idProyecto, ...driveFileIdsPresentes]
  );
  return result.affectedRows;
}

async function upsertSyncEstado(connection, idProyecto, estado) {
  await connection.query(
    `INSERT INTO instalaciones_bitacora_sync_estado (
       id_proyecto, ultima_sincronizacion, ultimo_usuario, total_activos, total_eliminados, truncado
     ) VALUES (?, NOW(), ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       ultima_sincronizacion = NOW(),
       ultimo_usuario = VALUES(ultimo_usuario),
       total_activos = VALUES(total_activos),
       total_eliminados = VALUES(total_eliminados),
       truncado = VALUES(truncado)`,
    [idProyecto, estado.ultimo_usuario, estado.total_activos, estado.total_eliminados, estado.truncado ? 1 : 0]
  );
}

async function getConnection() {
  return db.getConnection();
}

module.exports = {
  listDocumentos,
  getSyncEstado,
  findExistingFileIds,
  upsertDocumento,
  marcarEliminados,
  upsertSyncEstado,
  getConnection
};
