'use strict';
// F9A: unica escritura permitida -> ns_portafolio_pruebas. Nada de DDL ni tabla productiva.
const mapping = require('./netsuite-portafolio.mapping');

const TABLE = 'ns_portafolio_pruebas';
const CHUNK_ROWS = 50;
const TEXT_TYPES = new Set(['char','varchar','text','tinytext','mediumtext','longtext']);

function blocked() {
  return mapping.invalid('Esquema de ns_portafolio_pruebas no verificado. No se escribio ningun registro.',
    503,'NS_PORTAFOLIO_SCHEMA_BLOCKED');
}

function pool() {
  // Carga diferida: el receptor deshabilitado no intenta conectar con Aiven.
  return require('../../config/db');
}

async function preflight(database = pool()) {
  const [tables] = await database.query(`
    SELECT ENGINE FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ns_portafolio_pruebas'
  `);
  if (!Array.isArray(tables) || tables.length !== 1 ||
      String(tables[0].ENGINE || '').toUpperCase() !== 'INNODB') throw blocked();

  const [columns] = await database.query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, EXTRA, IS_NULLABLE, COLUMN_DEFAULT
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ns_portafolio_pruebas'
  `);
  const byColumn = new Map((columns || []).map(col => [col.COLUMN_NAME, col]));
  const id = byColumn.get('id_portafolio');
  const state = byColumn.get('estado_registro');
  if (!id || !/auto_increment/i.test(String(id.EXTRA)) || !state || !byColumn.has('zona_id') ||
      String(state.COLUMN_DEFAULT) !== '1' || String(state.IS_NULLABLE).toUpperCase() !== 'NO') throw blocked();
  const lengths = new Map();
  for (const name of mapping.COLUMNS) {
    const col = byColumn.get(name);
    const length = Number(col?.CHARACTER_MAXIMUM_LENGTH);
    if (!col || !TEXT_TYPES.has(String(col.DATA_TYPE || '').toLowerCase()) ||
        !Number.isFinite(length) || length < 1) throw blocked();
    lengths.set(name, length);
  }
  if (String(byColumn.get('numero_equipo').IS_NULLABLE).toUpperCase() !== 'NO') throw blocked();

  const [indexes] = await database.query(`
    SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ns_portafolio_pruebas'
  `);
  const groups = new Map();
  for (const idx of indexes || []) {
    if (!groups.has(idx.INDEX_NAME)) groups.set(idx.INDEX_NAME, []);
    groups.get(idx.INDEX_NAME).push(idx);
  }
  const uniqueKey = [...groups.values()].some(rows => rows.length === 1 &&
    Number(rows[0].NON_UNIQUE) === 0 && rows[0].COLUMN_NAME === 'numero_equipo');
  const primary = (groups.get('PRIMARY') || []);
  if (!uniqueKey || primary.length !== 1 || primary[0].COLUMN_NAME !== 'id_portafolio') throw blocked();
  // Si hay otro indice unico (ajeno al PK / numero_equipo), ON DUPLICATE KEY podria
  // actualizar un registro diferente. Ante ese riesgo, abortar antes de cualquier DML.
  for (const [indexName, rows] of groups) {
    if (indexName === 'PRIMARY') continue;
    if (rows.some(row => Number(row.NON_UNIQUE) === 0) &&
       !(rows.length === 1 && rows[0].COLUMN_NAME === 'numero_equipo')) throw blocked();
  }
  const [triggers] = await database.query(`
    SELECT TRIGGER_NAME FROM INFORMATION_SCHEMA.TRIGGERS
    WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE = 'ns_portafolio_pruebas'
  `);
  // Un trigger podria actualizar otras tablas; no se habilita sin auditoria explicita.
  if (!Array.isArray(triggers) || triggers.length) throw blocked();
  return lengths;
}

function insertStatement(count) {
  const cols = mapping.COLUMNS.map(name => '`' + name + '`');
  const fields = '(' + cols.join(',') + ')';
  const values = '(' + cols.map(() => '?').join(',') + ')';
  const changes = mapping.COLUMNS.filter(name => name !== 'numero_equipo').map(name => {
    const q = '`' + name + '`';
    // Fila nueva: campos vacios -> NULL; fila existente: NULL entrante no borra datos.
    return q + ' = COALESCE(VALUES(' + q + '), ' + q + ')';
  });
  return `INSERT INTO \`${TABLE}\` ${fields} VALUES ${Array(count).fill(values).join(',')} ` +
    `ON DUPLICATE KEY UPDATE ${changes.join(', ')}`;
}

async function publishRows(rows, database = pool(), shouldContinue = () => true) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 10000) {
    throw mapping.invalid('Cantidad de registros fuera del limite de F9A.', 422, 'NS_PORTAFOLIO_ROW_LIMIT');
  }
  if (!shouldContinue()) throw mapping.invalid('Carga de Portafolio pausada.',503,'NS_PORTAFOLIO_PAUSED');
  // PRECHECK de nuevo al publicar: si cambio la tabla durante la carga no persistir.
  await preflight(database);
  const connection = await database.getConnection();
  let started = false;
  try {
    if (!shouldContinue()) throw mapping.invalid('Carga de Portafolio pausada.',503,'NS_PORTAFOLIO_PAUSED');
    await connection.beginTransaction();
    started = true;
    for (let offset=0; offset<rows.length; offset+=CHUNK_ROWS) {
      if (!shouldContinue()) throw mapping.invalid('Carga pausada; cambios revertidos.',503,'NS_PORTAFOLIO_PAUSED');
      const batch = rows.slice(offset, offset+CHUNK_ROWS);
      const binds = batch.flatMap(row => mapping.COLUMNS.map(column => row[column]));
      await connection.execute(insertStatement(batch.length), binds);
    }
    if (!shouldContinue()) throw mapping.invalid('Carga pausada; cambios revertidos.',503,'NS_PORTAFOLIO_PAUSED');
    await connection.commit();
    started = false;
    return { filasConfirmadas: rows.length };
  } catch (error) {
    if (started) {
      try { await connection.rollback(); }
      catch (rollbackError) { console.error('[NS_PORTAFOLIO_ROLLBACK_ERROR]', rollbackError.code || 'UNKNOWN'); }
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { TABLE, CHUNK_ROWS, preflight, insertStatement, publishRows };
