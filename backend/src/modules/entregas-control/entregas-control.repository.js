'use strict';

// [Aster | 2026-10-07 | ASTER-MG | FASE 1 ENTREGAS V001]
// Persistencia Aiven/MySQL. No crea estructura; depende de Fase 0.

const db = require('../../config/db');

function executor_gnral(executor) {
  return executor || db;
}

function lockClause_gnral(options) {
  return options && options.forUpdate === true ? ' FOR UPDATE' : '';
}

async function listActiveUsers_gnral(executor) {
  const connection = executor_gnral(executor);
  const [rows] = await connection.query(`
    SELECT id_SB, nombre, iniciales, puesto
    FROM usuarios
    WHERE estado = 1
    ORDER BY nombre ASC, id_SB ASC
  `);
  return rows;
}

async function getActiveUserById_gnral(executor, userId) {
  const connection = executor_gnral(executor);
  const [rows] = await connection.query(`
    SELECT id_SB, nombre, iniciales, puesto, correo
    FROM usuarios
    WHERE id_SB = ?
      AND estado = 1
    LIMIT 1
  `, [userId]);
  return rows[0] || null;
}

async function insertProgramada_gnral(executor, record) {
  const connection = executor_gnral(executor);
  const [result] = await connection.query(`
    INSERT INTO entregas_programadas (
      id_responsable,
      id_colaborador,
      titulo,
      descripcion,
      tipo_recurrencia,
      fecha_inicio,
      activo,
      created_by
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `, [
    record.id_responsable,
    record.id_colaborador,
    record.titulo,
    record.descripcion || null,
    record.tipo_recurrencia,
    record.fecha_inicio,
    record.created_by || null
  ]);
  return Number(result.insertId);
}

async function insertInstancias_gnral(executor, idProgramada, instancias) {
  const connection = executor_gnral(executor);
  if (!Array.isArray(instancias) || !instancias.length) return 0;
  const placeholders = instancias.map(() => '(?, ?, ?)').join(',');
  const params = [];
  for (const item of instancias) {
    params.push(idProgramada, item.numero_ocurrencia, item.fecha_limite);
  }
  const [result] = await connection.query(`
    INSERT INTO entregas_instancias (
      id_entrega_programada,
      numero_ocurrencia,
      fecha_limite
    ) VALUES ${placeholders}
  `, params);
  return Number(result.affectedRows || 0);
}

async function getProgramadaById_gnral(executor, idProgramada, options = {}) {
  const connection = executor_gnral(executor);
  const [rows] = await connection.query(`
    SELECT
      p.*,
      r.nombre AS responsable_nombre,
      c.nombre AS colaborador_nombre,
      c.iniciales AS colaborador_iniciales,
      c.puesto AS colaborador_puesto
    FROM entregas_programadas p
    INNER JOIN usuarios r ON r.id_SB = p.id_responsable
    INNER JOIN usuarios c ON c.id_SB = p.id_colaborador
    WHERE p.id_entrega_programada = ?
    LIMIT 1${lockClause_gnral(options)}
  `, [idProgramada]);
  return rows[0] || null;
}

function instanciaSelect_gnral() {
  return `
    SELECT
      i.*,
      DATE_FORMAT(i.fecha_entrega, '%Y-%m-%d') AS fecha_entrega_dia,
      DATE_FORMAT(i.fecha_entrega, '%Y-%m-%d %H:%i:%s') AS fecha_entrega_texto,
      DATE_FORMAT(i.fecha_validacion, '%Y-%m-%d %H:%i:%s') AS fecha_validacion_texto
    FROM entregas_instancias i`;
}

async function listInstanciasByProgramada_gnral(executor, idProgramada) {
  const connection = executor_gnral(executor);
  const [rows] = await connection.query(`${instanciaSelect_gnral()}
    WHERE i.id_entrega_programada = ?
    ORDER BY i.numero_ocurrencia ASC, i.id_instancia ASC
  `, [idProgramada]);
  return rows;
}

async function listProgramadasByResponsable_gnral(executor, userId, options = {}) {
  const connection = executor_gnral(executor);
  const clauses = ['p.id_responsable = ?'];
  const params = [userId];
  if (options.includeInactive !== true) clauses.push('p.activo = 1');
  if (Number.isInteger(options.idColaborador) && options.idColaborador > 0) {
    clauses.push('p.id_colaborador = ?');
    params.push(options.idColaborador);
  }
  const [rows] = await connection.query(`
    SELECT
      p.*,
      c.nombre AS colaborador_nombre,
      c.iniciales AS colaborador_iniciales,
      c.puesto AS colaborador_puesto
    FROM entregas_programadas p
    INNER JOIN usuarios c ON c.id_SB = p.id_colaborador
    WHERE ${clauses.join(' AND ')}
    ORDER BY p.created_at DESC, p.id_entrega_programada DESC
  `, params);
  return rows;
}

async function deactivateProgramada_gnral(executor, idProgramada) {
  const connection = executor_gnral(executor);
  const [result] = await connection.query(`
    UPDATE entregas_programadas
    SET activo = 0,
        updated_at = CURRENT_TIMESTAMP
    WHERE id_entrega_programada = ?
      AND activo = 1
  `, [idProgramada]);
  return Number(result.affectedRows || 0);
}

async function listMisEntregas_gnral(executor, userId) {
  const connection = executor_gnral(executor);
  const [rows] = await connection.query(`
    SELECT
      i.*,
      DATE_FORMAT(i.fecha_entrega, '%Y-%m-%d') AS fecha_entrega_dia,
      DATE_FORMAT(i.fecha_entrega, '%Y-%m-%d %H:%i:%s') AS fecha_entrega_texto,
      DATE_FORMAT(i.fecha_validacion, '%Y-%m-%d %H:%i:%s') AS fecha_validacion_texto,
      p.titulo,
      p.descripcion,
      p.tipo_recurrencia,
      p.id_responsable,
      r.nombre AS responsable_nombre
    FROM entregas_instancias i
    INNER JOIN entregas_programadas p
      ON p.id_entrega_programada = i.id_entrega_programada
    INNER JOIN usuarios r
      ON r.id_SB = p.id_responsable
    WHERE p.id_colaborador = ?
      AND p.activo = 1
    ORDER BY i.fecha_limite ASC, i.id_instancia ASC
  `, [userId]);
  return rows;
}

async function getInstanciaContext_gnral(executor, idInstancia, options = {}) {
  const connection = executor_gnral(executor);
  const [rows] = await connection.query(`
    SELECT
      i.*,
      DATE_FORMAT(i.fecha_entrega, '%Y-%m-%d') AS fecha_entrega_dia,
      DATE_FORMAT(i.fecha_entrega, '%Y-%m-%d %H:%i:%s') AS fecha_entrega_texto,
      DATE_FORMAT(i.fecha_validacion, '%Y-%m-%d %H:%i:%s') AS fecha_validacion_texto,
      p.id_responsable,
      p.id_colaborador,
      p.titulo,
      p.activo AS programada_activa,
      r.nombre AS responsable_nombre,
      c.nombre AS colaborador_nombre
    FROM entregas_instancias i
    INNER JOIN entregas_programadas p
      ON p.id_entrega_programada = i.id_entrega_programada
    INNER JOIN usuarios r ON r.id_SB = p.id_responsable
    INNER JOIN usuarios c ON c.id_SB = p.id_colaborador
    WHERE i.id_instancia = ?
    LIMIT 1${lockClause_gnral(options)}
  `, [idInstancia]);
  return rows[0] || null;
}

async function updateInstanciaArchivo_gnral(executor, idInstancia, record) {
  const connection = executor_gnral(executor);
  const [result] = await connection.query(`
    UPDATE entregas_instancias
    SET fecha_entrega = ?,
        nombre_archivo = ?,
        mime_type = ?,
        tamano_bytes = ?,
        storage_provider = ?,
        storage_container = ?,
        storage_blob_name = ?,
        entregado_por = ?,
        validado = NULL,
        validado_por = NULL,
        fecha_validacion = NULL,
        comentario_validacion = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id_instancia = ?
  `, [
    record.fecha_entrega,
    record.nombre_archivo,
    record.mime_type || null,
    record.tamano_bytes == null ? null : record.tamano_bytes,
    record.storage_provider,
    record.storage_container || null,
    record.storage_blob_name,
    record.entregado_por,
    idInstancia
  ]);
  return Number(result.affectedRows || 0);
}

async function listValidacionPendiente_gnral(executor, userId) {
  const connection = executor_gnral(executor);
  const [rows] = await connection.query(`
    SELECT
      i.*,
      DATE_FORMAT(i.fecha_entrega, '%Y-%m-%d') AS fecha_entrega_dia,
      DATE_FORMAT(i.fecha_entrega, '%Y-%m-%d %H:%i:%s') AS fecha_entrega_texto,
      DATE_FORMAT(i.fecha_validacion, '%Y-%m-%d %H:%i:%s') AS fecha_validacion_texto,
      p.titulo,
      p.id_responsable,
      p.id_colaborador,
      c.nombre AS colaborador_nombre,
      c.iniciales AS colaborador_iniciales
    FROM entregas_instancias i
    INNER JOIN entregas_programadas p
      ON p.id_entrega_programada = i.id_entrega_programada
    INNER JOIN usuarios c
      ON c.id_SB = p.id_colaborador
    WHERE p.id_responsable = ?
      AND i.fecha_entrega IS NOT NULL
      AND i.validado IS NULL
    ORDER BY i.fecha_entrega ASC, i.id_instancia ASC
  `, [userId]);
  return rows;
}

async function updateValidacion_gnral(executor, idInstancia, record) {
  const connection = executor_gnral(executor);
  const [result] = await connection.query(`
    UPDATE entregas_instancias
    SET validado = ?,
        validado_por = ?,
        fecha_validacion = ?,
        comentario_validacion = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id_instancia = ?
  `, [
    record.validado,
    record.validado_por,
    record.fecha_validacion,
    record.comentario_validacion || null,
    idInstancia
  ]);
  return Number(result.affectedRows || 0);
}

async function listIndicadoresRows_gnral(executor, userId) {
  const connection = executor_gnral(executor);
  const [rows] = await connection.query(`
    SELECT
      i.*,
      DATE_FORMAT(i.fecha_entrega, '%Y-%m-%d') AS fecha_entrega_dia,
      DATE_FORMAT(i.fecha_entrega, '%Y-%m-%d %H:%i:%s') AS fecha_entrega_texto,
      p.id_colaborador,
      c.nombre AS colaborador_nombre
    FROM entregas_instancias i
    INNER JOIN entregas_programadas p
      ON p.id_entrega_programada = i.id_entrega_programada
    INNER JOIN usuarios c
      ON c.id_SB = p.id_colaborador
    WHERE p.id_responsable = ?
      AND p.activo = 1
    ORDER BY c.nombre ASC, i.fecha_limite ASC
  `, [userId]);
  return rows;
}

module.exports = Object.freeze({
  listActiveUsers_gnral,
  getActiveUserById_gnral,
  insertProgramada_gnral,
  insertInstancias_gnral,
  getProgramadaById_gnral,
  listInstanciasByProgramada_gnral,
  listProgramadasByResponsable_gnral,
  deactivateProgramada_gnral,
  listMisEntregas_gnral,
  getInstanciaContext_gnral,
  updateInstanciaArchivo_gnral,
  listValidacionPendiente_gnral,
  updateValidacion_gnral,
  listIndicadoresRows_gnral
});
