'use strict';

// [Aster | 2026-08-31 | ASTER-MG | FASE 3 ALMACEN CIERRES/AUDITORIA PERSISTENTE V001]
// Persistencia de Auditoría separada de almacen_fuente_excel.

const crypto = require('crypto');
const db = require('../../config/db');
const queryService = require('./almacen.query-service');

const TABLE = 'almacen_auditoria';
const ALLOWED_OPEN_STATUSES = new Set(['BORRADOR', 'EN_PROCESO', 'REVISADA']);

function auditError(message, status = 400, details = null) {
  const error = new Error(message);
  error.status = status;
  if (details) error.details = details;
  return error;
}

function normalizeFolio(value) {
  const folio = String(value == null ? '' : value).trim();
  if (!folio || folio.length > 50 || !/^[A-Z0-9_-]+$/i.test(folio)) {
    throw auditError('Folio de auditoría inválido.', 400);
  }
  return folio;
}

function normalizeUserId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw auditError('Usuario de auditoría inválido.', 401);
  return id;
}

function normalizePhysical(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw auditError('La existencia física debe ser un número mayor o igual a cero.', 422);
  return n;
}

function normalizeObservations(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text.length > 4000) throw auditError('Las observaciones no pueden exceder 4,000 caracteres.', 422);
  return text || null;
}

function makeFolio() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `AUD-${y}${m}${d}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

function toNumber(value) {
  return value == null ? null : Number(value);
}

function metricsFromRows(rows) {
  let total = 0;
  let completed = 0;
  let exact = 0;
  let expectedPieces = 0;
  let foundPieces = 0;
  let valueDifference = 0;
  let valued = 0;
  for (const row of rows) {
    total += 1;
    const expected = Number(row.existenciaEsperada || 0);
    expectedPieces += expected;
    if (row.existenciaFisica == null) continue;
    const found = Number(row.existenciaFisica || 0);
    completed += 1;
    foundPieces += found;
    if (Math.abs(found - expected) < 1e-9) exact += 1;
    if (row.valorDiferencia != null) {
      valued += 1;
      valueDifference += Number(row.valorDiferencia || 0);
    }
  }
  return {
    total,
    completed,
    exact,
    pending: Math.max(0, total - completed),
    matchPercent: total ? exact * 100 / total : 0,
    expectedPieces,
    foundPieces,
    pieceDifference: foundPieces - expectedPieces,
    valued,
    valueDifference
  };
}

async function listAudits(query = {}, conn = db) {
  const where = [];
  const params = [];
  const lot = String(query.loteImportacion || '').trim();
  const status = String(query.estatus || '').trim().toUpperCase();
  if (lot) { where.push('lote_importacion=?'); params.push(lot); }
  if (status) { where.push('estatus=?'); params.push(status); }
  const limitRaw = Number(query.limit || 100);
  const limit = Math.min(250, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 100));
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await conn.query(
    `SELECT folio_auditoria AS folioAuditoria,
            MAX(lote_importacion) AS loteImportacion,
            MAX(fecha_corte) AS fechaCorte,
            MAX(empresa) AS empresa,
            MAX(almacen) AS almacen,
            MAX(estatus) AS estatus,
            COUNT(*) AS referencias,
            SUM(CASE WHEN existencia_fisica IS NOT NULL THEN 1 ELSE 0 END) AS capturadas,
            COALESCE(SUM(existencia_esperada),0) AS existenciaEsperada,
            COALESCE(SUM(existencia_fisica),0) AS existenciaFisica,
            COALESCE(SUM(diferencia),0) AS diferencia,
            COALESCE(SUM(valor_diferencia),0) AS valorDiferencia,
            MAX(auditado_por) AS auditadoPor,
            MAX(fecha_inicio) AS fechaInicio,
            MAX(fecha_cierre) AS fechaCierre,
            MAX(updated_at) AS updatedAt
       FROM ${TABLE}
       ${sqlWhere}
      GROUP BY folio_auditoria
      ORDER BY COALESCE(MAX(fecha_inicio), MAX(created_at)) DESC
      LIMIT ${limit}`,
    params
  );
  return {
    ok: true,
    rows: rows.map(row => ({
      ...row,
      referencias: Number(row.referencias || 0),
      capturadas: Number(row.capturadas || 0),
      existenciaEsperada: Number(row.existenciaEsperada || 0),
      existenciaFisica: Number(row.existenciaFisica || 0),
      diferencia: Number(row.diferencia || 0),
      valorDiferencia: Number(row.valorDiferencia || 0)
    }))
  };
}

async function getAudit(folioValue, conn = db) {
  const folio = normalizeFolio(folioValue);
  const [rows] = await conn.query(
    `SELECT id_auditoria AS idAuditoria,
            folio_auditoria AS folioAuditoria,
            lote_importacion AS loteImportacion,
            fecha_corte AS fechaCorte,
            empresa,
            almacen,
            codigo_articulo AS codigo,
            articulo,
            categoria,
            unidad_medida AS unidadMedida,
            existencia_esperada AS existenciaEsperada,
            precio_unitario AS precioUnitario,
            valor_esperado AS valorEsperado,
            existencia_fisica AS existenciaFisica,
            diferencia,
            valor_diferencia AS valorDiferencia,
            observaciones,
            estatus,
            auditado_por AS auditadoPor,
            cerrado_por AS cerradoPor,
            fecha_inicio AS fechaInicio,
            fecha_cierre AS fechaCierre,
            created_at AS createdAt,
            updated_at AS updatedAt
       FROM ${TABLE}
      WHERE folio_auditoria=?
      ORDER BY id_auditoria`,
    [folio]
  );
  if (!rows.length) throw auditError('La auditoría solicitada no existe.', 404, { folioAuditoria: folio });
  const items = rows.map(row => ({
    ...row,
    idAuditoria: Number(row.idAuditoria),
    existenciaEsperada: Number(row.existenciaEsperada || 0),
    precioUnitario: toNumber(row.precioUnitario),
    valorEsperado: toNumber(row.valorEsperado),
    existenciaFisica: toNumber(row.existenciaFisica),
    diferencia: toNumber(row.diferencia),
    valorDiferencia: toNumber(row.valorDiferencia)
  }));
  const first = items[0];
  return {
    ok: true,
    audit: {
      folioAuditoria: first.folioAuditoria,
      loteImportacion: first.loteImportacion,
      fechaCorte: first.fechaCorte,
      empresa: first.empresa,
      almacen: first.almacen,
      estatus: first.estatus,
      auditadoPor: first.auditadoPor,
      cerradoPor: first.cerradoPor,
      fechaInicio: first.fechaInicio,
      fechaCierre: first.fechaCierre,
      items,
      metrics: metricsFromRows(items)
    }
  };
}

async function createAudit(input = {}, userIdValue) {
  const userId = normalizeUserId(userIdValue);
  const company = String(input.company || input.empresa || '').trim();
  const warehouse = String(input.warehouse || input.almacen || '').trim();
  const lot = String(input.loteImportacion || '').trim();
  if (!company || !warehouse) throw auditError('Empresa y almacén son requeridos para iniciar una auditoría.', 400);
  if (!lot) throw auditError('Selecciona un cierre antes de iniciar la auditoría.', 400);

  const sampleResponse = await queryService.getAuditSample({ loteImportacion: lot, company, warehouse });
  const sample = sampleResponse.sample;
  if (!sample || !Array.isArray(sample.items) || !sample.items.length) {
    throw auditError('El cierre seleccionado no generó una muestra de auditoría.', 422);
  }

  const conn = await db.getConnection();
  const folio = makeFolio();
  try {
    await conn.beginTransaction();
    const sql = `INSERT INTO ${TABLE}
      (folio_auditoria,lote_importacion,fecha_corte,empresa,almacen,codigo_articulo,articulo,categoria,unidad_medida,
       existencia_esperada,precio_unitario,valor_esperado,existencia_fisica,observaciones,estatus,
       auditado_por,fecha_inicio,created_by,updated_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,'EN_PROCESO',?,CURRENT_TIMESTAMP,?,?)`;
    for (const item of sample.items) {
      await conn.query(sql, [
        folio,
        sample.loteImportacion,
        sample.fechaCorte || null,
        item.company || company,
        item.warehouse || warehouse,
        item.code || null,
        item.article || item.code || 'Sin descripción',
        item.category || null,
        null,
        Number(item.expected || 0),
        item.unitValue == null ? null : Number(item.unitValue),
        item.expectedValue == null ? null : Number(item.expectedValue),
        userId,
        userId,
        userId
      ]);
    }
    await conn.commit();
  } catch (error) {
    try { await conn.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    conn.release();
  }
  return getAudit(folio);
}

async function updateAuditItem(folioValue, idValue, input = {}, userIdValue) {
  const folio = normalizeFolio(folioValue);
  const id = Number(idValue);
  const userId = normalizeUserId(userIdValue);
  if (!Number.isInteger(id) || id <= 0) throw auditError('Renglón de auditoría inválido.', 400);
  const physical = normalizePhysical(input.existenciaFisica ?? input.found);
  const observations = normalizeObservations(input.observaciones);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [currentRows] = await conn.query(
      `SELECT estatus FROM ${TABLE} WHERE id_auditoria=? AND folio_auditoria=? FOR UPDATE`,
      [id, folio]
    );
    if (!currentRows.length) throw auditError('El renglón de auditoría solicitado no existe.', 404);
    const status = String(currentRows[0].estatus || '').toUpperCase();
    if (!ALLOWED_OPEN_STATUSES.has(status)) throw auditError('La auditoría está cerrada o cancelada y ya no admite cambios.', 409);
    await conn.query(
      `UPDATE ${TABLE}
          SET existencia_fisica=?, observaciones=?, estatus='EN_PROCESO', updated_by=?
        WHERE id_auditoria=? AND folio_auditoria=?`,
      [physical, observations, userId, id, folio]
    );
    await conn.commit();
  } catch (error) {
    try { await conn.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    conn.release();
  }
  return getAudit(folio);
}

async function closeAudit(folioValue, userIdValue) {
  const folio = normalizeFolio(folioValue);
  const userId = normalizeUserId(userIdValue);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT id_auditoria,estatus,existencia_fisica FROM ${TABLE} WHERE folio_auditoria=? FOR UPDATE`,
      [folio]
    );
    if (!rows.length) throw auditError('La auditoría solicitada no existe.', 404);
    const currentStatus = String(rows[0].estatus || '').toUpperCase();
    if (currentStatus === 'CERRADA') throw auditError('La auditoría ya se encuentra cerrada.', 409);
    if (currentStatus === 'CANCELADA') throw auditError('Una auditoría cancelada no puede cerrarse.', 409);
    const pending = rows.filter(row => row.existencia_fisica == null).length;
    if (pending) throw auditError('Completa todos los conteos antes de cerrar la auditoría.', 422, { pendientes: pending });
    await conn.query(
      `UPDATE ${TABLE}
          SET estatus='CERRADA', cerrado_por=?, fecha_cierre=CURRENT_TIMESTAMP, updated_by=?
        WHERE folio_auditoria=?`,
      [userId, userId, folio]
    );
    await conn.commit();
  } catch (error) {
    try { await conn.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    conn.release();
  }
  return getAudit(folio);
}

module.exports = {
  TABLE,
  listAudits,
  getAudit,
  createAudit,
  updateAuditItem,
  closeAudit
};
