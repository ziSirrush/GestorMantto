'use strict';

const db = require('../../config/db');

function getConnection() {
  return db.getConnection();
}

function positiveIds(values) {
  return [...new Set((values || [])
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0))];
}

async function findUsersByIds(connection, values) {
  const ids = positiveIds(values);
  if (!ids.length) return new Map();

  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT id_SB, nombre, iniciales, estado
       FROM usuarios
      WHERE id_SB IN (${placeholders})`,
    ids
  );

  return new Map(rows.map((row) => [Number(row.id_SB), row]));
}

async function findCatalogsByIds(connection, values) {
  const ids = positiveIds(values);
  if (!ids.length) return new Map();

  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT id_catalogo, area, elemento, articulo, activo
       FROM catalogo_general
      WHERE id_catalogo IN (${placeholders})`,
    ids
  );

  return new Map(rows.map((row) => [Number(row.id_catalogo), row]));
}


async function findCatalogsForImport(connection) {
  const [rows] = await connection.query(
    `SELECT id_catalogo, area, elemento, articulo, activo
       FROM catalogo_general
      WHERE activo = 1
        AND (
          (area = 'Ventas' AND elemento = 'Tipo Contacto')
          OR (area = 'General' AND elemento = 'Estado')
          OR (area = 'Ventas' AND elemento = 'Soli Red')
          OR (area = 'Ventas' AND elemento = 'Estatus Pros')
        )`
  );

  return rows;
}

async function findActiveQuotationIds(connection, values) {
  const ids = positiveIds(values);
  if (!ids.length) return new Set();

  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT id_cotizacion
       FROM ventas_cotizaciones_cor
      WHERE id_cotizacion IN (${placeholders})
        AND activo = 1`,
    ids
  );

  return new Set(rows.map((row) => Number(row.id_cotizacion)));
}

async function findExistingRedIds(connection, values) {
  const ids = positiveIds(values);
  if (!ids.length) return new Set();

  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT id_redes
       FROM ventas_redes
      WHERE id_redes IN (${placeholders})`,
    ids
  );

  return new Set(rows.map((row) => Number(row.id_redes)));
}

async function findExistingCommentIds(connection, values) {
  const ids = positiveIds(values);
  if (!ids.length) return new Set();

  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT id_comentario
       FROM ventas_redes_comentarios
      WHERE id_comentario IN (${placeholders})`,
    ids
  );

  return new Set(rows.map((row) => Number(row.id_comentario)));
}

async function upsertRed(connection, record) {
  await connection.query(
    `INSERT INTO ventas_redes (
       id_redes,
       nombre_contacto,
       id_contacto_via,
       contacto_via_origen,
       email,
       telefono,
       id_estado,
       estado_origen,
       nombre_empresa,
       ciudad,
       nombre_proyecto,
       informacion_enviada,
       id_solicitud,
       solicitud_origen,
       id_usuario_asignado,
       created_by,
       id_estatus,
       estatus_origen,
       fecha_cambio_estatus,
       id_cotizacion,
       cotizacion_origen,
       activo,
       created_at,
       updated_at,
       updated_by
     ) VALUES (
       ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
       1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), ?
     )
     ON DUPLICATE KEY UPDATE
       nombre_contacto = VALUES(nombre_contacto),
       id_contacto_via = VALUES(id_contacto_via),
       contacto_via_origen = VALUES(contacto_via_origen),
       email = VALUES(email),
       telefono = VALUES(telefono),
       id_estado = VALUES(id_estado),
       estado_origen = VALUES(estado_origen),
       nombre_empresa = VALUES(nombre_empresa),
       ciudad = VALUES(ciudad),
       nombre_proyecto = VALUES(nombre_proyecto),
       informacion_enviada = VALUES(informacion_enviada),
       id_solicitud = VALUES(id_solicitud),
       solicitud_origen = VALUES(solicitud_origen),
       id_usuario_asignado = VALUES(id_usuario_asignado),
       created_by = VALUES(created_by),
       id_estatus = VALUES(id_estatus),
       estatus_origen = VALUES(estatus_origen),
       fecha_cambio_estatus = VALUES(fecha_cambio_estatus),
       id_cotizacion = VALUES(id_cotizacion),
       cotizacion_origen = VALUES(cotizacion_origen),
       activo = 1,
       updated_at = CURRENT_TIMESTAMP(3),
       updated_by = VALUES(updated_by)`,
    [
      record.id_redes,
      record.nombre_contacto,
      record.id_contacto_via,
      record.contacto_via_origen,
      record.email,
      record.telefono,
      record.id_estado,
      record.estado_origen,
      record.nombre_empresa,
      record.ciudad,
      record.nombre_proyecto,
      record.informacion_enviada,
      record.id_solicitud,
      record.solicitud_origen,
      record.id_usuario_asignado,
      record.created_by,
      record.id_estatus,
      record.estatus_origen,
      record.fecha_cambio_estatus,
      record.id_cotizacion,
      record.cotizacion_origen,
      record.updated_by
    ]
  );
}

async function findEvidenceByOrderForUpdate(connection, idRedes, order) {
  const [rows] = await connection.query(
    `SELECT *
       FROM ventas_redes_archivos
      WHERE id_redes = ?
        AND orden_archivo = ?
      LIMIT 1
      FOR UPDATE`,
    [idRedes, order]
  );
  return rows[0] || null;
}

async function deleteLegacyEvidenceByOrder(connection, idRedes, order) {
  const [result] = await connection.query(
    `DELETE FROM ventas_redes_archivos
      WHERE id_redes = ?
        AND orden_archivo = ?
        AND UPPER(COALESCE(storage_provider, 'GLIDE')) <> 'AZURE_BLOB'`,
    [idRedes, order]
  );
  return Number(result.affectedRows || 0);
}

async function upsertLegacyEvidence(connection, record) {
  await connection.query(
    `INSERT INTO ventas_redes_archivos (
       id_redes,
       orden_archivo,
       nombre_archivo,
       nombre_original,
       extension,
       mime_type,
       tamanio_bytes,
       storage_provider,
       storage_url,
       storage_container,
       storage_blob_name,
       tipo_archivo,
       descripcion,
       id_usuario,
       activo,
       created_at,
       updated_at
     ) VALUES (
       ?, ?, ?, ?, ?, ?, NULL, 'GLIDE', ?, NULL, NULL,
       'EVIDENCIA_CONTACTO', ?, ?, 1,
       CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
     )
     ON DUPLICATE KEY UPDATE
       nombre_archivo = VALUES(nombre_archivo),
       nombre_original = VALUES(nombre_original),
       extension = VALUES(extension),
       mime_type = VALUES(mime_type),
       tamanio_bytes = NULL,
       storage_provider = 'GLIDE',
       storage_url = VALUES(storage_url),
       storage_container = NULL,
       storage_blob_name = NULL,
       tipo_archivo = 'EVIDENCIA_CONTACTO',
       descripcion = VALUES(descripcion),
       id_usuario = VALUES(id_usuario),
       activo = 1,
       updated_at = CURRENT_TIMESTAMP(3)`,
    [
      record.id_redes,
      record.orden_archivo,
      record.nombre_archivo,
      record.nombre_original,
      record.extension,
      record.mime_type,
      record.storage_url,
      record.descripcion,
      record.id_usuario
    ]
  );
}

async function insertComment(connection, record) {
  await connection.query(
    `INSERT INTO ventas_redes_comentarios (
       id_comentario,
       id_redes,
       id_usuario,
       comentario,
       fecha_hora,
       editado,
       activo,
       created_at,
       updated_at
     ) VALUES (
       ?, ?, ?, ?, ?,
       0, 1, COALESCE(?, CURRENT_TIMESTAMP(3)), CURRENT_TIMESTAMP(3)
     )`,
    [
      record.id_comentario,
      record.id_redes,
      record.id_usuario,
      record.comentario,
      record.fecha_hora,
      record.fecha_hora
    ]
  );
}

async function updateComment(connection, record) {
  await connection.query(
    `UPDATE ventas_redes_comentarios
        SET id_redes = ?,
            id_usuario = ?,
            comentario = ?,
            fecha_hora = ?,
            created_at = CASE
              WHEN ? IS NOT NULL THEN ?
              ELSE created_at
            END,
            editado = 0,
            activo = 1,
            updated_at = CURRENT_TIMESTAMP(3)
      WHERE id_comentario = ?`,
    [
      record.id_redes,
      record.id_usuario,
      record.comentario,
      record.fecha_hora,
      record.fecha_hora,
      record.fecha_hora,
      record.id_comentario
    ]
  );
}

async function listCommentAttachmentsForUpdate(connection, idComentario) {
  const [rows] = await connection.query(
    `SELECT *
       FROM ventas_redes_comentarios_adjuntos
      WHERE id_comentario = ?
      FOR UPDATE`,
    [idComentario]
  );
  return rows;
}

async function deleteLegacyCommentAttachments(connection, idComentario) {
  const [result] = await connection.query(
    `DELETE FROM ventas_redes_comentarios_adjuntos
      WHERE id_comentario = ?
        AND UPPER(COALESCE(storage_provider, 'GLIDE')) <> 'AZURE_BLOB'`,
    [idComentario]
  );
  return Number(result.affectedRows || 0);
}

async function insertLegacyCommentAttachment(connection, record) {
  const [result] = await connection.query(
    `INSERT INTO ventas_redes_comentarios_adjuntos (
       id_comentario,
       nombre_archivo,
       nombre_original,
       extension,
       mime_type,
       tamanio_bytes,
       storage_provider,
       storage_url,
       storage_container,
       storage_blob_name,
       tipo_archivo,
       descripcion,
       id_usuario,
       activo,
       created_at,
       updated_at
     ) VALUES (
       ?, ?, ?, ?, ?, NULL, 'GLIDE', ?, NULL, NULL,
       ?, 'Adjunto historico de comentario', ?, 1,
       COALESCE(?, CURRENT_TIMESTAMP(3)), CURRENT_TIMESTAMP(3)
     )`,
    [
      record.id_comentario,
      record.nombre_archivo,
      record.nombre_original,
      record.extension,
      record.mime_type,
      record.storage_url,
      record.mime_type,
      record.id_usuario,
      record.fecha_hora
    ]
  );
  return Number(result.insertId || 0);
}

module.exports = {
  getConnection,
  findUsersByIds,
  findCatalogsByIds,
  findCatalogsForImport,
  findActiveQuotationIds,
  findExistingRedIds,
  findExistingCommentIds,
  upsertRed,
  findEvidenceByOrderForUpdate,
  deleteLegacyEvidenceByOrder,
  upsertLegacyEvidence,
  insertComment,
  updateComment,
  listCommentAttachmentsForUpdate,
  deleteLegacyCommentAttachments,
  insertLegacyCommentAttachment
};
