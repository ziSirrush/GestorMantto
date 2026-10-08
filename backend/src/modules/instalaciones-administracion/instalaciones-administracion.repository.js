'use strict';

const db = require('../../config/db');

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

async function searchRecords_cor({ scope, search, limit = 25 }) {
  const params = [];
  const where = ['1 = 1'];
  const scoped = scopeClause_cor(scope, 'f');

  if (search) {
    const like = `%${search}%`;
    where.push(`(
      f.proyecto LIKE ?
      OR f.id_proyecto LIKE ?
      OR f.referencia_sitio LIKE ?
      OR f.numero_equipo_fabrica LIKE ?
      OR f.cliente LIKE ?
    )`);
    params.push(like, like, like, like, like);
  }

  params.push(...scoped.params, limit);

  const [rows] = await db.query(
    `SELECT
       f.id_ins_fl,
       f.id_proyecto,
       f.proyecto,
       f.referencia_sitio,
       f.estatus,
       f.numero_equipo_fabrica,
       f.tipo_equipo,
       f.marca,
       f.modelo,
       f.cliente,
       f.estado,
       f.ciudad,
       f.activo,
       f.updated_at
     FROM ins_fl f
     WHERE ${where.join(' AND ')}
     ${scoped.sql}
     ORDER BY COALESCE(f.proyecto, '') ASC, COALESCE(f.referencia_sitio, '') ASC, f.id_ins_fl ASC
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

async function updateRecordById_cor({ id, scope, changes, beforeCommit }) {
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

    const actualChanges = {};
    for (const [field, value] of Object.entries(changes)) {
      if (comparable_cor(before[field]) !== comparable_cor(value)) {
        actualChanges[field] = value;
      }
    }

    if (!Object.keys(actualChanges).length) {
      await conn.commit();
      transactionStarted = false;
      return {
        found: true,
        changed: false,
        before,
        after: before,
        changes: {}
      };
    }

    // Los nombres de campo llegan exclusivamente de allowlists del servicio.
    const assignments = Object.keys(actualChanges).map(field => `\`${field}\` = ?`).join(', ');
    const values = [...Object.values(actualChanges), id];

    await conn.query(
      `UPDATE ins_fl
          SET ${assignments}
        WHERE id_ins_fl = ?`,
      values
    );

    const after = await getRecordById_cor({
      id,
      scope,
      connection: conn,
      forUpdate: false
    });

    if (typeof beforeCommit === 'function') {
      await beforeCommit({
        connection: conn,
        before,
        after,
        changes: actualChanges
      });
    }

    await conn.commit();
    transactionStarted = false;

    return {
      found: true,
      changed: true,
      before,
      after,
      changes: actualChanges
    };
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
  searchRecords_cor,
  getRecordById_cor,
  listExistingActiveUsers_cor,
  updateRecordById_cor
};
