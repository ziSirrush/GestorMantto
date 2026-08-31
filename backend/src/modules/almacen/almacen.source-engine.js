'use strict';

// [Aster | 2026-08-31 | ASTER-MG | FASE 2 ALMACEN MOTOR FUENTE/CIERRE V001]
// Fuente temporal desacoplada para Gestión de Almacén.
// Hoy resuelve lotes de almacen_fuente_excel. En el futuro esta capa puede
// apuntar a información nativa sin obligar a reescribir cada pantalla.

const db = require('../../config/db');

const TABLE = 'almacen_fuente_excel';
const RECORD_TYPES = Object.freeze({
  INVENTORY: 'INVENTARIO',
  LOAN: 'PRESTAMO',
  GUARD: 'RESGUARDO'
});

function safeJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_error) { return fallback; }
}

function normalizeRequestedLot(input) {
  const raw = input && typeof input === 'object'
    ? (input.loteImportacion ?? input.lote ?? '')
    : input;
  const lot = String(raw == null ? '' : raw).trim();
  if (!lot) return '';
  if (lot.length > 128) {
    const error = new Error('El identificador del cierre seleccionado es inválido.');
    error.status = 400;
    throw error;
  }
  return lot;
}

async function sourceByLot(lotId, conn = db, selection = 'SELECCIONADO') {
  const lot = normalizeRequestedLot(lotId);
  if (!lot) return null;

  const [lots] = await conn.query(
    `SELECT lote_importacion AS loteImportacion,
            MAX(archivo_origen) AS archivoOrigen,
            MAX(fecha_corte) AS fechaCorte,
            MAX(fecha_importacion) AS fechaImportacion,
            MAX(hash_archivo) AS hashArchivo,
            MAX(activo) AS activo,
            COUNT(*) AS filas
       FROM ${TABLE}
      WHERE lote_importacion=?
      GROUP BY lote_importacion
      LIMIT 1`,
    [lot]
  );
  if (!lots.length) return null;

  const metadata = lots[0];
  const [types] = await conn.query(
    `SELECT tipo_registro AS tipoRegistro,
            MAX(hoja_origen) AS hojaOrigen,
            COUNT(*) AS filas,
            ANY_VALUE(encabezados_json) AS encabezadosJson,
            ANY_VALUE(mapeo_json) AS mapeoJson
       FROM ${TABLE}
      WHERE lote_importacion=?
      GROUP BY tipo_registro`,
    [lot]
  );

  const datasets = {};
  for (const row of types) {
    datasets[row.tipoRegistro] = {
      hojaOrigen: row.hojaOrigen,
      filas: Number(row.filas || 0),
      encabezados: safeJson(row.encabezadosJson, []),
      mapeo: safeJson(row.mapeoJson, {})
    };
  }

  return {
    provider: 'EXCEL_TEMPORAL',
    selection,
    loteImportacion: metadata.loteImportacion,
    archivoOrigen: metadata.archivoOrigen,
    fechaCorte: metadata.fechaCorte,
    fechaImportacion: metadata.fechaImportacion,
    hashArchivo: metadata.hashArchivo,
    activo: Number(metadata.activo || 0) === 1,
    filas: Number(metadata.filas || 0),
    datasets,
    hojaOrigen: datasets[RECORD_TYPES.INVENTORY]?.hojaOrigen || null,
    encabezados: datasets[RECORD_TYPES.INVENTORY]?.encabezados || [],
    mapeo: datasets[RECORD_TYPES.INVENTORY]?.mapeo || {}
  };
}

async function activeSource(conn = db) {
  const [rows] = await conn.query(
    `SELECT lote_importacion AS loteImportacion
       FROM ${TABLE}
      WHERE activo=1
      GROUP BY lote_importacion
      ORDER BY MAX(fecha_importacion) DESC
      LIMIT 1`
  );
  if (!rows.length) return null;
  return sourceByLot(rows[0].loteImportacion, conn, 'ACTIVO');
}

async function resolveSource(input, conn = db) {
  const requested = normalizeRequestedLot(input);
  if (!requested) return activeSource(conn);

  const source = await sourceByLot(requested, conn, 'SELECCIONADO');
  if (!source) {
    const error = new Error('El cierre de Almacén solicitado no existe o ya no está disponible.');
    error.status = 404;
    error.details = { loteImportacion: requested };
    throw error;
  }
  return source;
}

async function listSources(input = {}, conn = db) {
  const requestedLimit = Number(input?.limit || 100);
  const limit = Math.min(250, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 100));

  const [rows] = await conn.query(
    `SELECT lote_importacion AS loteImportacion,
            MAX(archivo_origen) AS archivoOrigen,
            MAX(fecha_corte) AS fechaCorte,
            MAX(fecha_importacion) AS fechaImportacion,
            MAX(hash_archivo) AS hashArchivo,
            MAX(activo) AS activo,
            COUNT(*) AS filas,
            SUM(CASE WHEN tipo_registro='INVENTARIO' THEN 1 ELSE 0 END) AS inventarioFilas,
            SUM(CASE WHEN tipo_registro='PRESTAMO' THEN 1 ELSE 0 END) AS prestamoFilas,
            SUM(CASE WHEN tipo_registro='RESGUARDO' THEN 1 ELSE 0 END) AS resguardoFilas
       FROM ${TABLE}
      GROUP BY lote_importacion
      ORDER BY MAX(activo) DESC,
               COALESCE(MAX(fecha_corte),'1000-01-01') DESC,
               MAX(fecha_importacion) DESC
      LIMIT ${limit}`
  );

  return rows.map(row => ({
    provider: 'EXCEL_TEMPORAL',
    loteImportacion: row.loteImportacion,
    archivoOrigen: row.archivoOrigen,
    fechaCorte: row.fechaCorte,
    fechaImportacion: row.fechaImportacion,
    hashArchivo: row.hashArchivo,
    activo: Number(row.activo || 0) === 1,
    filas: Number(row.filas || 0),
    datasets: {
      INVENTARIO: { filas: Number(row.inventarioFilas || 0) },
      PRESTAMO: { filas: Number(row.prestamoFilas || 0) },
      RESGUARDO: { filas: Number(row.resguardoFilas || 0) }
    }
  }));
}

function buildDatasetFilter(source, recordType, alias = '') {
  if (!source?.loteImportacion) return { sql: '1=0', params: [] };
  const prefix = alias ? `${alias}.` : '';
  return {
    sql: `${prefix}lote_importacion=? AND ${prefix}tipo_registro=?`,
    params: [source.loteImportacion, recordType]
  };
}

module.exports = {
  TABLE,
  RECORD_TYPES,
  normalizeRequestedLot,
  sourceByLot,
  activeSource,
  resolveSource,
  listSources,
  buildDatasetFilter
};
