const db = require('../../config/db');

const STORAGE_SOURCES = Object.freeze([
  {
    module: 'home-pendientes',
    table: 'pendientes_archivos',
    idColumn: 'id_archivo',
    entityType: 'pendiente',
    entityColumn: 'id_pendiente',
    activeColumn: 'activo',
    createdColumn: 'created_at'
  },
  {
    module: 'home-pendientes-comentarios',
    table: 'pendientes_comentarios_adjuntos',
    idColumn: 'id_adjunto',
    entityType: 'comentario-pendiente',
    entityColumn: 'id_comentario',
    activeColumn: 'activo',
    createdColumn: 'fecha'
  },
  {
    module: 'soporte',
    table: 'sup_adjuntos',
    idColumn: 'id_adjunto',
    entityType: 'ticket-soporte',
    entityColumn: 'id_ticket',
    activeColumn: 'activo',
    createdColumn: 'fecha_creacion'
  },
  {
    module: 'ventas-prospeccion',
    table: 'ventas_prospeccion_archivos',
    idColumn: 'id_archivo',
    entityType: 'prospeccion',
    entityColumn: 'id_pros',
    activeColumn: 'activo',
    createdColumn: 'created_at'
  },
  {
    module: 'ventas-cotizaciones',
    table: 'ventas_cotizaciones_archivos',
    idColumn: 'id_archivo',
    entityType: 'cotizacion',
    entityColumn: 'id_cotizacion',
    activeColumn: 'activo',
    createdColumn: 'created_at'
  }
]);

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

async function schemaMap_gnral() {
  const tables = STORAGE_SOURCES.map(source => source.table);
  const placeholders = tables.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT TABLE_NAME, COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (${placeholders})`,
    tables
  );

  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.TABLE_NAME)) map.set(row.TABLE_NAME, new Set());
    map.get(row.TABLE_NAME).add(row.COLUMN_NAME);
  }
  return map;
}

function sourceReady(source, columns) {
  return Boolean(columns)
    && [source.idColumn, source.entityColumn, 'storage_provider', 'storage_container', 'storage_blob_name']
      .every(column => columns.has(column));
}

async function listStorageReferences_gnral(options = {}) {
  const schema = await schemaMap_gnral();
  const rows = [];
  const sourceStatus = [];
  const includeEmpty = options.includeEmpty === true;

  for (const source of STORAGE_SOURCES) {
    const columns = schema.get(source.table);
    const ready = sourceReady(source, columns);
    sourceStatus.push({ module: source.module, table: source.table, ready });
    if (!ready) continue;

    const hasActive = columns.has(source.activeColumn);
    const hasCreated = columns.has(source.createdColumn);
    const sql = `SELECT
        ${quoteIdentifier(source.idColumn)} AS archivo_id,
        ${quoteIdentifier(source.entityColumn)} AS entidad_id,
        storage_provider,
        storage_container,
        storage_blob_name,
        ${hasActive ? quoteIdentifier(source.activeColumn) : '1'} AS activo,
        ${hasCreated ? quoteIdentifier(source.createdColumn) : 'NULL'} AS created_at
      FROM ${quoteIdentifier(source.table)}
      ${includeEmpty ? '' : "WHERE storage_blob_name IS NOT NULL AND TRIM(storage_blob_name) <> ''"}`;
    const [sourceRows] = await db.query(sql);
    for (const row of sourceRows) {
      rows.push({
        module: source.module,
        table: source.table,
        entity_type: source.entityType,
        archivo_id: row.archivo_id,
        entidad_id: row.entidad_id,
        storage_provider: row.storage_provider || null,
        storage_container: row.storage_container || null,
        storage_blob_name: row.storage_blob_name || null,
        activo: row.activo == null ? 1 : Number(row.activo),
        created_at: row.created_at || null
      });
    }
  }

  return { rows, sources: sourceStatus };
}

async function providerInventory_gnral() {
  const schema = await schemaMap_gnral();
  const inventory = [];
  const sources = [];

  for (const source of STORAGE_SOURCES) {
    const columns = schema.get(source.table);
    const ready = Boolean(columns && columns.has('storage_provider'));
    sources.push({ module: source.module, table: source.table, ready });
    if (!ready) continue;

    const activeExpression = columns.has(source.activeColumn)
      ? `SUM(CASE WHEN ${quoteIdentifier(source.activeColumn)} = 1 THEN 1 ELSE 0 END)`
      : 'COUNT(*)';
    const inactiveExpression = columns.has(source.activeColumn)
      ? `SUM(CASE WHEN ${quoteIdentifier(source.activeColumn)} = 0 THEN 1 ELSE 0 END)`
      : '0';
    const [rows] = await db.query(
      `SELECT COALESCE(NULLIF(UPPER(TRIM(storage_provider)), ''), '(SIN_PROVEEDOR)') AS proveedor,
              COUNT(*) AS total,
              ${activeExpression} AS activos,
              ${inactiveExpression} AS inactivos
         FROM ${quoteIdentifier(source.table)}
        GROUP BY COALESCE(NULLIF(UPPER(TRIM(storage_provider)), ''), '(SIN_PROVEEDOR)')
        ORDER BY total DESC, proveedor ASC`
    );
    inventory.push({ module: source.module, table: source.table, providers: rows });
  }

  return { sources, inventory };
}

async function isBlobReferenced_gnral(blobName, containerName) {
  const cleanBlob = String(blobName || '').replace(/^\/+/, '');
  const schema = await schemaMap_gnral();
  const matches = [];

  for (const source of STORAGE_SOURCES) {
    const columns = schema.get(source.table);
    if (!sourceReady(source, columns)) continue;
    const hasActive = columns.has(source.activeColumn);
    const [rows] = await db.query(
      `SELECT ${quoteIdentifier(source.idColumn)} AS archivo_id,
              ${quoteIdentifier(source.entityColumn)} AS entidad_id,
              storage_provider,
              ${hasActive ? quoteIdentifier(source.activeColumn) : '1'} AS activo
         FROM ${quoteIdentifier(source.table)}
        WHERE storage_blob_name = ?
          AND (storage_container = ? OR storage_container IS NULL OR TRIM(storage_container) = '')
        LIMIT 20`,
      [cleanBlob, containerName]
    );
    for (const row of rows) {
      matches.push({
        module: source.module,
        table: source.table,
        entity_type: source.entityType,
        storage_provider: row.storage_provider || null,
        archivo_id: row.archivo_id,
        entidad_id: row.entidad_id,
        activo: row.activo == null ? 1 : Number(row.activo)
      });
    }
  }
  return matches;
}

async function pendingDeleteBlobs_gnral() {
  const [rows] = await db.query(
    `SELECT id_operacion, storage_container, storage_blob_name, estado, intentos, max_intentos
       FROM storage_operaciones_pendientes
      WHERE tipo_operacion = 'ELIMINAR_BLOB'
        AND estado IN ('PENDIENTE','PROCESANDO','ERROR')`
  );
  return rows;
}

async function queueSummary_gnral() {
  const [rows] = await db.query(
    `SELECT estado, COUNT(*) AS total
       FROM storage_operaciones_pendientes
      GROUP BY estado
      ORDER BY estado`
  );
  return rows;
}

async function legacyUploadReferences_gnral(options = {}) {
  const maxColumns = Math.max(1, Math.min(500, Math.floor(Number(options.maxColumns || 250))));
  const sampleLimit = Math.max(1, Math.min(20, Math.floor(Number(options.sampleLimit || 5))));
  const [candidates] = await db.query(
    `SELECT c.TABLE_NAME, c.COLUMN_NAME
       FROM information_schema.COLUMNS c
       INNER JOIN information_schema.TABLES t
         ON t.TABLE_SCHEMA = c.TABLE_SCHEMA
        AND t.TABLE_NAME = c.TABLE_NAME
        AND t.TABLE_TYPE = 'BASE TABLE'
      WHERE c.TABLE_SCHEMA = DATABASE()
        AND c.DATA_TYPE IN ('char','varchar','tinytext','text','mediumtext','longtext')
        AND (
          LOWER(c.COLUMN_NAME) LIKE '%url%'
          OR LOWER(c.COLUMN_NAME) LIKE '%ruta%'
          OR LOWER(c.COLUMN_NAME) IN ('photo_url','adjunto_url','evidencia_url','archivo_url')
        )
      ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
      LIMIT ${maxColumns}`
  );

  const references = [];
  for (const candidate of candidates) {
    const table = quoteIdentifier(candidate.TABLE_NAME);
    const column = quoteIdentifier(candidate.COLUMN_NAME);
    const predicate = `(${column} LIKE '%/uploads/%' OR ${column} LIKE 'uploads/%' OR ${column} LIKE '%\\\\uploads\\\\%')`;
    const [countRows] = await db.query(`SELECT COUNT(*) AS total FROM ${table} WHERE ${predicate}`);
    const total = Number(countRows[0] && countRows[0].total || 0);
    if (!total) continue;
    const [samples] = await db.query(
      `SELECT LEFT(${column}, 500) AS referencia
         FROM ${table}
        WHERE ${predicate}
        LIMIT ${sampleLimit}`
    );
    references.push({
      table: candidate.TABLE_NAME,
      column: candidate.COLUMN_NAME,
      total,
      samples: samples.map(row => row.referencia)
    });
  }

  return {
    candidate_columns_scanned: candidates.length,
    references,
    total_references: references.reduce((sum, item) => sum + item.total, 0)
  };
}

module.exports = {
  STORAGE_SOURCES,
  quoteIdentifier,
  schemaMap_gnral,
  listStorageReferences_gnral,
  providerInventory_gnral,
  isBlobReferenced_gnral,
  pendingDeleteBlobs_gnral,
  queueSummary_gnral,
  legacyUploadReferences_gnral
};
