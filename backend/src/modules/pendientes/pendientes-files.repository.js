const db = require('../../config/db');

function executor_gnral(executor) {
  return executor || db;
}

function normalizeIds_gnral(values) {
  return [...new Set((values || [])
    .map(value => Number.parseInt(value, 10))
    .filter(value => Number.isInteger(value) && value > 0))];
}

async function getActiveDirectFilesForTasks_gnral(executor, ids) {
  const connection = executor_gnral(executor);
  const taskIds = normalizeIds_gnral(ids);
  if (!taskIds.length) return [];

  const placeholders = taskIds.map(() => '?').join(',');
  const [rows] = await connection.query(`
    SELECT pa.*
    FROM pendientes_archivos pa
    WHERE pa.id_pendiente IN (${placeholders})
      AND pa.activo = 1
    ORDER BY pa.id_pendiente ASC, pa.created_at ASC, pa.id_archivo ASC
  `, taskIds);
  return rows;
}

async function listDirectFiles_gnral(executor, idPendiente, options = {}) {
  const connection = executor_gnral(executor);
  const activeClause = options.includeInactive === true ? '' : ' AND activo = 1';
  const lockClause = options.forUpdate === true ? ' FOR UPDATE' : '';
  const [rows] = await connection.query(`
    SELECT *
    FROM pendientes_archivos
    WHERE id_pendiente = ?${activeClause}
    ORDER BY activo DESC, created_at ASC, id_archivo ASC${lockClause}
  `, [idPendiente]);
  return rows;
}

async function getDirectFileById_gnral(executor, idPendiente, idArchivo, options = {}) {
  const connection = executor_gnral(executor);
  const activeClause = options.allowInactive === true ? '' : ' AND activo = 1';
  const lockClause = options.forUpdate === true ? ' FOR UPDATE' : '';
  const [rows] = await connection.query(`
    SELECT *
    FROM pendientes_archivos
    WHERE id_pendiente = ?
      AND id_archivo = ?${activeClause}
    LIMIT 1${lockClause}
  `, [idPendiente, idArchivo]);
  return rows[0] || null;
}

async function deactivateActiveDirectFiles_gnral(executor, idPendiente, userId, reason) {
  const connection = executor_gnral(executor);
  const [result] = await connection.query(`
    UPDATE pendientes_archivos
    SET activo = 0,
        eliminado_por = ?,
        eliminado_at = CURRENT_TIMESTAMP,
        motivo_baja = ?
    WHERE id_pendiente = ?
      AND activo = 1
  `, [
    userId || null,
    String(reason || 'REEMPLAZO').slice(0, 80),
    idPendiente
  ]);
  return result;
}

async function deactivateDirectFileById_gnral(executor, idPendiente, idArchivo, userId, reason) {
  const connection = executor_gnral(executor);
  const [result] = await connection.query(`
    UPDATE pendientes_archivos
    SET activo = 0,
        eliminado_por = ?,
        eliminado_at = CURRENT_TIMESTAMP,
        motivo_baja = ?
    WHERE id_pendiente = ?
      AND id_archivo = ?
      AND activo = 1
  `, [
    userId || null,
    String(reason || 'ELIMINACION_MANUAL').slice(0, 80),
    idPendiente,
    idArchivo
  ]);
  return result;
}

async function insertDirectFile_gnral(executor, record) {
  const connection = executor_gnral(executor);
  const [result] = await connection.query(`
    INSERT INTO pendientes_archivos (
      id_pendiente,
      tipo_archivo,
      nombre_original,
      mime_type,
      tamano_bytes,
      storage_provider,
      storage_container,
      storage_blob_name,
      storage_url,
      origen_archivo,
      subido_por,
      activo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `, [
    record.id_pendiente,
    record.tipo_archivo,
    record.nombre_original,
    record.mime_type || null,
    record.tamano_bytes === undefined ? null : record.tamano_bytes,
    record.storage_provider,
    record.storage_container || null,
    record.storage_blob_name,
    record.storage_url || null,
    record.origen_archivo || 'NUEVO',
    record.subido_por || null
  ]);
  return result.insertId;
}

async function listCommentAttachments_gnral(executor, commentIds) {
  const connection = executor_gnral(executor);
  const ids = normalizeIds_gnral(commentIds);
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await connection.query(`
    SELECT *
    FROM pendientes_comentarios_adjuntos
    WHERE id_comentario IN (${placeholders})
      AND COALESCE(activo, 1) = 1
    ORDER BY fecha ASC, id_adjunto ASC
  `, ids);
  return rows;
}

async function getCommentAttachmentById_gnral(executor, idPendiente, idComentario, idAdjunto) {
  const connection = executor_gnral(executor);
  const [rows] = await connection.query(`
    SELECT pca.*, pc.id_pendiente
    FROM pendientes_comentarios_adjuntos pca
    INNER JOIN pendientes_comentarios pc
      ON pc.id_comentario = pca.id_comentario
    WHERE pc.id_pendiente = ?
      AND pc.id_comentario = ?
      AND pca.id_adjunto = ?
      AND COALESCE(pca.activo, 1) = 1
    LIMIT 1
  `, [idPendiente, idComentario, idAdjunto]);
  return rows[0] || null;
}

async function insertCommentAttachment_gnral(executor, idComentario, record) {
  const connection = executor_gnral(executor);
  const [result] = await connection.query(`
    INSERT INTO pendientes_comentarios_adjuntos (
      id_comentario,
      nombre_archivo,
      archivo_url,
      tipo_archivo,
      storage_provider,
      storage_container,
      storage_blob_name,
      tamano_bytes,
      subido_por,
      activo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `, [
    idComentario,
    record.nombre_archivo,
    record.archivo_url,
    record.tipo_archivo || null,
    record.storage_provider,
    record.storage_container || null,
    record.storage_blob_name,
    record.tamano_bytes === undefined ? null : record.tamano_bytes,
    record.subido_por || null
  ]);
  return result.insertId;
}

async function listTaskAzureReferences_gnral(executor, idPendiente) {
  const connection = executor_gnral(executor);
  const [directRows] = await connection.query(`
    SELECT
      storage_provider,
      storage_container,
      storage_blob_name,
      nombre_original,
      'pendiente_evidencia' AS entidad_tipo
    FROM pendientes_archivos
    WHERE id_pendiente = ?
      AND UPPER(COALESCE(storage_provider, '')) = 'AZURE_BLOB'
      AND storage_blob_name IS NOT NULL
      AND storage_blob_name <> ''
  `, [idPendiente]);

  const [commentRows] = await connection.query(`
    SELECT
      pca.storage_provider,
      pca.storage_container,
      pca.storage_blob_name,
      pca.nombre_archivo AS nombre_original,
      'pendiente_comentario' AS entidad_tipo
    FROM pendientes_comentarios_adjuntos pca
    INNER JOIN pendientes_comentarios pc
      ON pc.id_comentario = pca.id_comentario
    WHERE pc.id_pendiente = ?
      AND UPPER(COALESCE(pca.storage_provider, '')) = 'AZURE_BLOB'
      AND pca.storage_blob_name IS NOT NULL
      AND pca.storage_blob_name <> ''
  `, [idPendiente]);

  return [...directRows, ...commentRows];
}

module.exports = {
  getActiveDirectFilesForTasks_gnral,
  listDirectFiles_gnral,
  getDirectFileById_gnral,
  deactivateActiveDirectFiles_gnral,
  deactivateDirectFileById_gnral,
  insertDirectFile_gnral,
  listCommentAttachments_gnral,
  getCommentAttachmentById_gnral,
  insertCommentAttachment_gnral,
  listTaskAzureReferences_gnral
};
