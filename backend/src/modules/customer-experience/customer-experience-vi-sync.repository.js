'use strict';

// [Aster | 2026-10-09 | ASTER-MG | FIX CX VI BACKEND SYNC V001]
// Reconciliacion exacta y atomica de una foto completa (no UPSERT por clave).
// Conserva los IDs de filas identicas, respetando su multiplicidad.

const db = require('../../config/db');
const contract = require('./customer-experience-vi-sync.contract');

const FIELDS_COR = contract.CX_VI_SYNC_FIELDS_COR;
const TABLE_COR = contract.CX_VI_SYNC_TABLE_COR;
const BATCH_COR = contract.CX_VI_SYNC_BATCH_SIZE_COR;
const LOCK_COR = 'mantto_cx_venta_instalacion_snapshot_v001';
const SELECT_FIELDS_COR = ['id', ...FIELDS_COR].map(field => `\`${field}\``).join(', ');
const INSERT_FIELDS_COR = FIELDS_COR.map(field => `\`${field}\``).join(', ');
const PLACEHOLDER_COR = `(${FIELDS_COR.map(() => '?').join(', ')})`;

function fail_cor(status, code, message) {
  const error = new Error(message);
  error.statusCode = status;
  error.code = code;
  return error;
}

function canonical_cor(row) {
  return JSON.stringify(FIELDS_COR.map(field => {
    const value = row[field];
    return value === undefined || value === null || value === '' ? null : String(value);
  }));
}

async function persistSnapshot_cor(records) {
  const connection = await db.getConnection();
  let lock = false;
  let transaction = false;
  try {
    // Serializa snapshots, aun si inicialmente la tabla esta vacia.
    const [[obtained]] = await connection.query('SELECT GET_LOCK(?, 10) AS acquired', [LOCK_COR]);
    if (Number(obtained?.acquired) !== 1) {
      throw fail_cor(409, 'CX_VI_SYNC_BUSY', 'Otro snapshot CX Venta/Instalaciones esta en proceso.');
    }
    lock = true;
    await connection.beginTransaction();
    transaction = true;

    const [existing] = await connection.query(
      `SELECT ${SELECT_FIELDS_COR} FROM \`${TABLE_COR}\` ORDER BY \`id\` FOR UPDATE`
    );
    const byContent = new Map();
    for (const row of existing) {
      const fingerprint = canonical_cor(row);
      if (!byContent.has(fingerprint)) byContent.set(fingerprint, []);
      byContent.get(fingerprint).push(row.id);
    }

    const inserts = [];
    let untouched = 0;
    for (const record of records) {
      const fingerprint = canonical_cor(record);
      const candidates = byContent.get(fingerprint);
      if (candidates && candidates.length) {
        candidates.pop();
        untouched += 1;
      } else {
        inserts.push(record);
      }
    }

    const deleteIds = [...byContent.values()].flat();
    for (let start = 0; start < deleteIds.length; start += BATCH_COR) {
      const chunk = deleteIds.slice(start, start + BATCH_COR);
      await connection.query(
        `DELETE FROM \`${TABLE_COR}\` WHERE \`id\` IN (${chunk.map(() => '?').join(', ')})`,
        chunk
      );
    }
    for (let start = 0; start < inserts.length; start += BATCH_COR) {
      const chunk = inserts.slice(start, start + BATCH_COR);
      await connection.query(
        `INSERT INTO \`${TABLE_COR}\` (${INSERT_FIELDS_COR}) VALUES ${chunk.map(() => PLACEHOLDER_COR).join(', ')}`,
        chunk.flatMap(record => FIELDS_COR.map(field => record[field]))
      );
    }
    await connection.commit();
    transaction = false;
    return {
      sin_cambios: untouched,
      insertados: inserts.length,
      eliminados: deleteIds.length,
      total_final: records.length
    };
  } catch (error) {
    if (transaction) {
      try { await connection.rollback(); } catch (_rollbackError) {}
    }
    throw error;
  } finally {
    if (lock) {
      try { await connection.query('SELECT RELEASE_LOCK(?) AS released', [LOCK_COR]); }
      catch (_releaseError) {}
    }
    connection.release();
  }
}

module.exports = Object.freeze({ persistSnapshot_cor });
