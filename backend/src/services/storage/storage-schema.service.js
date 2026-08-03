const db = require('../../config/db');

const REQUIRED_COLUMNS = Object.freeze({
  sup_adjuntos: Object.freeze([
    'storage_provider',
    'storage_container',
    'storage_blob_name'
  ]),
  pendientes_comentarios_adjuntos: Object.freeze([
    'storage_provider',
    'storage_container',
    'storage_blob_name',
    'tamano_bytes',
    'subido_por',
    'activo',
    'updated_at'
  ])
});

const CACHE_TTL_MS = Number(process.env.CFFAA_SCHEMA_CACHE_MS || 60000);
let cache = null;
let cacheExpiresAt = 0;

function normalizeTables(tableNames) {
  const values = Array.isArray(tableNames) ? tableNames : [tableNames];
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

async function readSchemaStatus_gnral(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cache && now < cacheExpiresAt) return cache;

  const tables = Object.keys(REQUIRED_COLUMNS);
  const placeholders = tables.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT TABLE_NAME, COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN (${placeholders})`,
    tables
  );

  const found = new Map(tables.map(table => [table, new Set()]));
  for (const row of rows) {
    if (found.has(row.TABLE_NAME)) found.get(row.TABLE_NAME).add(row.COLUMN_NAME);
  }

  const status = {};
  for (const table of tables) {
    const existing = found.get(table) || new Set();
    const missing = REQUIRED_COLUMNS[table].filter(column => !existing.has(column));
    status[table] = {
      ready: missing.length === 0,
      missing
    };
  }

  cache = {
    ready: Object.values(status).every(item => item.ready),
    checked_at: new Date().toISOString(),
    tables: status
  };
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cache;
}

async function assertStorageSchema_gnral(tableNames) {
  const requested = normalizeTables(tableNames);
  const unknown = requested.filter(table => !REQUIRED_COLUMNS[table]);
  if (unknown.length) {
    const error = new Error(`Tablas de Storage no reconocidas: ${unknown.join(', ')}.`);
    error.status = 500;
    error.code = 'CFFAA_UNKNOWN_STORAGE_TABLE';
    throw error;
  }

  const status = await readSchemaStatus_gnral();
  const missing = requested
    .map(table => ({ table, ...(status.tables[table] || { ready: false, missing: ['tabla_no_encontrada'] }) }))
    .filter(item => !item.ready);

  if (missing.length) {
    const detail = missing.map(item => `${item.table}: ${item.missing.join(', ')}`).join(' | ');
    const error = new Error(`La base de datos no está alineada para cargar archivos. Ejecuta CFFAA-00. ${detail}`);
    error.status = 503;
    error.code = 'CFFAA_STORAGE_SCHEMA_NOT_READY';
    error.details = missing;
    throw error;
  }

  return status;
}

function clearStorageSchemaCache_gnral() {
  cache = null;
  cacheExpiresAt = 0;
}

module.exports = {
  REQUIRED_COLUMNS,
  readSchemaStatus_gnral,
  assertStorageSchema_gnral,
  clearStorageSchemaCache_gnral
};
