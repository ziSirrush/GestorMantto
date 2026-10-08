'use strict';

// [Aster | 2026-10-08 | ASTER-MG | FASE_5_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001]

const db = require('../../config/db');
const { ALL_OPERATIONAL_FIELDS_COR } = require('./instalaciones-administracion.constants');

const SEARCHABLE_FIELDS_COR = Object.freeze([
  'proyecto', 'id_proyecto', 'referencia_sitio', 'numero_equipo_fabrica', 'cliente'
]);
const SUMMARY_FIELDS_COR = Object.freeze([
  'proyecto', 'id_proyecto', 'referencia_sitio', 'estatus',
  'numero_equipo_fabrica', 'tipo_equipo', 'marca', 'modelo',
  'cliente', 'estado', 'ciudad', 'activo'
]);

function scopeClause_cor(scope, alias = 'f') {
  if (scope && scope.mode === 'ALL') return { sql: '', params: [] };

  const ids = [...new Set(
    (scope && Array.isArray(scope.advisorIds) ? scope.advisorIds : [])
      .map(Number)
      .filter(id => Number.isInteger(id) && id > 0)
  )];

  if (!ids.length) return { sql: ' AND 1 = 0', params: [] };

  const placeholders = ids.map(() => '?').join(', ');
  return {
    sql: ` AND (
      ${alias}.id_asesor IN (${placeholders})
      OR ${alias}.id_sup IN (${placeholders})
      OR ${alias}.id_admin IN (${placeholders})
    )`,
    params: [...ids, ...ids, ...ids]
  };
}

function comparable_cor(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return String(value).trim();
}

function safeOperationalColumns_cor(fields) {
  const allowed = new Set(ALL_OPERATIONAL_FIELDS_COR);
  return [...new Set((fields || []).filter(field => allowed.has(field)))];
}

async function searchRecords_cor({ scope, search, limit = 25, visibleFields = [] }) {
  const allowed = new Set(safeOperationalColumns_cor(visibleFields));
  const columns = SUMMARY_FIELDS_COR.filter(field => allowed.has(field));
  const searchable = SEARCHABLE_FIELDS_COR.filter(field => allowed.has(field));
  const select = [
    'f.id_ins_fl',
    ...columns.map(field => `f.\`${field}\``),
    'f.updated_at'
  ];
  const scoped = scopeClause_cor(scope, 'f');
  const params = [];
  const where = ['1 = 1'];

  if (search) {
    const searchableConditions = searchable.map(field => `f.\`${field}\` LIKE ?`);
    for (const field of searchable) params.push(`%${search}%`);
    const numeric = Number(search);
    if (Number.isSafeInteger(numeric) && numeric > 0) {
      searchableConditions.push('f.id_ins_fl = ?');
      params.push(numeric);
    }
    if (!searchableConditions.length) return [];
    where.push(`(${searchableConditions.join(' OR ')})`);
  }

  params.push(...scoped.params, limit);
  // Un ORDER BY basado en un campo oculto tambien puede revelar datos
  // indirectamente. Nunca ordenar ni filtrar con columnas sin VER/EDITAR.
  const order = allowed.has('proyecto')
    ? `COALESCE(f.proyecto, '') ASC, ${allowed.has('referencia_sitio') ? "COALESCE(f.referencia_sitio, '') ASC, " : ''}f.id_ins_fl ASC`
    : 'f.id_ins_fl DESC';

  const [rows] = await db.query(
    `SELECT ${select.join(', ')}
       FROM ins_fl f
      WHERE ${where.join(' AND ')}
      ${scoped.sql}
      ORDER BY ${order}
      LIMIT ?`,
    params
  );
  return rows;
}

async function getRecordById_cor({ id, scope, connection = db, forUpdate = false }) {
  const scoped = scopeClause_cor(scope, 'f');
  const [rows] = await connection.query(
    `SELECT f.*
       FROM ins_fl f
      WHERE f.id_ins_fl = ?
      ${scoped.sql}
      LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [id, ...scoped.params]
  );
  return rows[0] || null;
}

async function listExistingActiveUsers_cor(ids) {
  const unique = [...new Set((ids || []).map(Number).filter(id => Number.isInteger(id) && id > 0))];
  if (!unique.length) return [];
  const placeholders = unique.map(() => '?').join(', ');
  const [rows] = await db.query(
    `SELECT id_SB
       FROM usuarios
      WHERE estado = 1
        AND id_SB IN (${placeholders})`,
    unique
  );
  return rows.map(row => Number(row.id_SB));
}

async function listActiveUsers_cor() {
  const [rows] = await db.query(
    `SELECT id_SB, nombre, iniciales, puesto, empresa
       FROM usuarios
      WHERE estado = 1
      ORDER BY nombre ASC, id_SB ASC`
  );
  return rows;
}

function concurrencyError_cor(fields) {
  const error = new Error('El registro fue modificado desde tu ultima lectura. Recarga y revisa los valores antes de guardar.');
  error.statusCode = 409;
  error.code = 'INSTALACIONES_ADMINISTRACION_CONFLICTO_CONCURRENCIA';
  error.details = { fields };
  return error;
}

async function updateRecordById_cor({ id, scope, changes, expected, beforeCommit }) {
  const conn = await db.getConnection();
  let transactionStarted = false;

  try {
    await conn.beginTransaction();
    transactionStarted = true;

    const before = await getRecordById_cor({
      id,
      scope,
      connection: conn,
      forUpdate: true
    });

    if (!before) {
      await conn.rollback();
      transactionStarted = false;
      return { found: false };
    }

    // Compare only the fields edited by this user, while holding a row lock.
    // Unrelated changes are not overwritten and do not cause false conflicts.
    const conflicts = Object.keys(changes).filter(field => (
      comparable_cor(before[field]) !== comparable_cor(expected[field])
    ));
    if (conflicts.length) throw concurrencyError_cor(conflicts);

    const actualChanges = {};
    for (const [field, value] of Object.entries(changes)) {
      if (comparable_cor(before[field]) !== comparable_cor(value)) {
        actualChanges[field] = value;
      }
    }

    if (!Object.keys(actualChanges).length) {
      await conn.commit();
      transactionStarted = false;
      return { found: true, changed: false, before, after: before, changes: {} };
    }

    // Column names come exclusively from the group allowlist in validation.
    const assignments = Object.keys(actualChanges).map(field => `\`${field}\` = ?`).join(', ');
    const values = [...Object.values(actualChanges), id];

    await conn.query(
      `UPDATE ins_fl
          SET ${assignments}
        WHERE id_ins_fl = ?`,
      values
    );

    // The update can change id_sup/id_asesor/id_admin and therefore the
    // record scope. Read after-image by locked primary key for audit only.
    const after = await getRecordById_cor({
      id, scope: { mode: 'ALL' }, connection: conn, forUpdate: false
    });
    if (!after) throw new Error('No fue posible obtener la imagen posterior del registro actualizado.');

    if (typeof beforeCommit === 'function') {
      await beforeCommit({ connection: conn, before, after, changes: actualChanges });
    }

    await conn.commit();
    transactionStarted = false;
    return { found: true, changed: true, before, after, changes: actualChanges };
  } catch (error) {
    if (transactionStarted) {
      try { await conn.rollback(); } catch (_rollbackError) {}
    }
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = {
  scopeClause_cor,
  comparable_cor,
  searchRecords_cor,
  getRecordById_cor,
  listExistingActiveUsers_cor,
  listActiveUsers_cor,
  updateRecordById_cor
};
