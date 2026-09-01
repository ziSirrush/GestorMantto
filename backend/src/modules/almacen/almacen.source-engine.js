'use strict';

// [Aster | 2026-09-01 | ASTER-MG | FIX ALMACEN ARCHIVO BLOB + STAGING ACTIVO V001]
// El Excel original vive en Azure Blob privado. almacen_fuente_excel conserva:
// - una fila ARCHIVO por cierre para metadatos/referencia;
// - filas normalizadas solamente para el cierre cargado operativamente.
// Los lotes legacy sin ARCHIVO siguen siendo legibles para una migracion segura.

const db = require('../../config/db');

const TABLE = 'almacen_fuente_excel';
const RECORD_TYPES = Object.freeze({
  INVENTORY: 'INVENTARIO',
  LOAN: 'PRESTAMO',
  GUARD: 'RESGUARDO',
  ARCHIVE: 'ARCHIVO'
});
const ARCHIVE_KIND = 'ALMACEN_ARCHIVO_BLOB_V1';

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
    const error = new Error('El identificador del cierre seleccionado es invalido.');
    error.status = 400;
    throw error;
  }
  return lot;
}

function normalizeArchiveMetadata(value) {
  const parsed = safeJson(value, null);
  if (!parsed || parsed.kind !== ARCHIVE_KIND) return null;
  const blobName = String(parsed.storage_blob_name || '').trim();
  if (!blobName) return null;
  return parsed;
}

async function archiveRecordByLot(lotId, conn = db) {
  const lot = normalizeRequestedLot(lotId);
  if (!lot) return null;
  const [rows] = await conn.query(
    `SELECT id,
            lote_importacion AS loteImportacion,
            archivo_origen AS archivoOrigen,
            fecha_corte AS fechaCorte,
            fecha_importacion AS fechaImportacion,
            activo,
            hash_archivo AS hashArchivo,
            raw_json AS rawJson,
            creado_por AS creadoPor
       FROM ${TABLE}
      WHERE lote_importacion=?
        AND tipo_registro=?
      ORDER BY id DESC
      LIMIT 1`,
    [lot, RECORD_TYPES.ARCHIVE]
  );
  if (!rows.length) return null;
  const row = rows[0];
  const metadata = normalizeArchiveMetadata(row.rawJson);
  if (!metadata) return null;
  return {
    ...row,
    activo: Number(row.activo || 0) === 1,
    metadata
  };
}

function archiveDataset(metadata, type) {
  const datasets = Array.isArray(metadata?.datasets) ? metadata.datasets : [];
  const item = datasets.find(dataset => String(dataset?.type || '').toUpperCase() === type);
  if (!item) return null;
  return {
    hojaOrigen: item.sheetName || null,
    filas: Number(item.rows || 0),
    encabezados: Array.isArray(item.headers) ? item.headers : [],
    mapeo: item.mapping && typeof item.mapping === 'object' ? item.mapping : {},
    quality: item.quality && typeof item.quality === 'object' ? item.quality : null
  };
}

function mergeDataset(type, operational, archiveMetadata) {
  const archived = archiveDataset(archiveMetadata, type);
  if (archived) return archived;
  return operational || null;
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
            SUM(CASE WHEN tipo_registro<>? THEN 1 ELSE 0 END) AS filasOperativas
       FROM ${TABLE}
      WHERE lote_importacion=?
      GROUP BY lote_importacion
      LIMIT 1`,
    [RECORD_TYPES.ARCHIVE, lot]
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
        AND tipo_registro<>?
      GROUP BY tipo_registro`,
    [lot, RECORD_TYPES.ARCHIVE]
  );

  const operationalDatasets = {};
  for (const row of types) {
    operationalDatasets[row.tipoRegistro] = {
      hojaOrigen: row.hojaOrigen,
      filas: Number(row.filas || 0),
      encabezados: safeJson(row.encabezadosJson, []),
      mapeo: safeJson(row.mapeoJson, {})
    };
  }

  const archiveRecord = await archiveRecordByLot(lot, conn);
  const archiveMetadata = archiveRecord?.metadata || null;
  const datasets = {};
  for (const type of [RECORD_TYPES.INVENTORY, RECORD_TYPES.LOAN, RECORD_TYPES.GUARD]) {
    const dataset = mergeDataset(type, operationalDatasets[type], archiveMetadata);
    if (dataset) datasets[type] = dataset;
  }

  const loadedRows = Number(metadata.filasOperativas || 0);
  const logicalRows = archiveMetadata && Number.isFinite(Number(archiveMetadata.rows))
    ? Number(archiveMetadata.rows)
    : loadedRows;

  return {
    provider: 'EXCEL_TEMPORAL',
    selection,
    loteImportacion: metadata.loteImportacion,
    archivoOrigen: archiveMetadata?.nombre_original || metadata.archivoOrigen,
    fechaCorte: archiveMetadata?.fecha_corte || metadata.fechaCorte,
    fechaImportacion: archiveMetadata?.fecha_importacion || metadata.fechaImportacion,
    hashArchivo: archiveMetadata?.hash_archivo || metadata.hashArchivo,
    activo: Number(metadata.activo || 0) === 1,
    filas: logicalRows,
    filasCargadas: loadedRows,
    loaded: loadedRows > 0,
    archived: Boolean(archiveRecord),
    reloadable: Boolean(archiveRecord),
    archiveProvider: archiveRecord ? 'AZURE_BLOB' : null,
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
  const active = await activeSource(conn);
  if (!requested) return active;

  // Contrato V001: las pantallas operativas siempre leen el staging ACTIVO.
  // `loteImportacion` puede seguir llegando desde una sesion/frontend anterior;
  // si apunta a un historico se ignora para evitar consultas vacias o a snapshots
  // legacy. La unica forma de cambiar de cierre es reactivarlo explicitamente.
  if (!active) return null;
  if (String(active.loteImportacion) === requested) return active;
  return active;
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
            SUM(CASE WHEN tipo_registro<>? THEN 1 ELSE 0 END) AS filasOperativas,
            SUM(CASE WHEN tipo_registro='INVENTARIO' THEN 1 ELSE 0 END) AS inventarioFilas,
            SUM(CASE WHEN tipo_registro='PRESTAMO' THEN 1 ELSE 0 END) AS prestamoFilas,
            SUM(CASE WHEN tipo_registro='RESGUARDO' THEN 1 ELSE 0 END) AS resguardoFilas
       FROM ${TABLE}
      GROUP BY lote_importacion
      ORDER BY MAX(activo) DESC,
               COALESCE(MAX(fecha_corte),'1000-01-01') DESC,
               MAX(fecha_importacion) DESC
      LIMIT ${limit}`,
    [RECORD_TYPES.ARCHIVE]
  );

  const lots = rows.map(row => row.loteImportacion);
  const archiveMap = new Map();
  if (lots.length) {
    const placeholders = lots.map(() => '?').join(',');
    const [archives] = await conn.query(
      `SELECT lote_importacion AS loteImportacion, raw_json AS rawJson
         FROM ${TABLE}
        WHERE tipo_registro=?
          AND lote_importacion IN (${placeholders})
        ORDER BY id DESC`,
      [RECORD_TYPES.ARCHIVE, ...lots]
    );
    for (const row of archives) {
      if (archiveMap.has(row.loteImportacion)) continue;
      const metadata = normalizeArchiveMetadata(row.rawJson);
      if (metadata) archiveMap.set(row.loteImportacion, metadata);
    }
  }

  return rows.map(row => {
    const archive = archiveMap.get(row.loteImportacion) || null;
    const datasets = {};
    for (const type of [RECORD_TYPES.INVENTORY, RECORD_TYPES.LOAN, RECORD_TYPES.GUARD]) {
      const fromArchive = archiveDataset(archive, type);
      if (fromArchive) datasets[type] = fromArchive;
    }
    if (!datasets[RECORD_TYPES.INVENTORY]) datasets[RECORD_TYPES.INVENTORY] = { filas:Number(row.inventarioFilas || 0) };
    if (!datasets[RECORD_TYPES.LOAN]) datasets[RECORD_TYPES.LOAN] = { filas:Number(row.prestamoFilas || 0) };
    if (!datasets[RECORD_TYPES.GUARD]) datasets[RECORD_TYPES.GUARD] = { filas:Number(row.resguardoFilas || 0) };

    const loadedRows = Number(row.filasOperativas || 0);
    return {
      provider: 'EXCEL_TEMPORAL',
      loteImportacion: row.loteImportacion,
      archivoOrigen: archive?.nombre_original || row.archivoOrigen,
      fechaCorte: archive?.fecha_corte || row.fechaCorte,
      fechaImportacion: archive?.fecha_importacion || row.fechaImportacion,
      hashArchivo: archive?.hash_archivo || row.hashArchivo,
      activo: Number(row.activo || 0) === 1,
      filas: archive && Number.isFinite(Number(archive.rows)) ? Number(archive.rows) : loadedRows,
      filasCargadas: loadedRows,
      loaded: loadedRows > 0,
      archived: Boolean(archive),
      reloadable: Boolean(archive),
      archiveProvider: archive ? 'AZURE_BLOB' : null,
      datasets
    };
  });
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
  ARCHIVE_KIND,
  safeJson,
  normalizeRequestedLot,
  normalizeArchiveMetadata,
  archiveRecordByLot,
  sourceByLot,
  activeSource,
  resolveSource,
  listSources,
  buildDatasetFilter
};
