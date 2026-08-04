const db = require('../../config/db');

const TABLE = 'storage_operaciones_pendientes';

async function enqueue_gnral(record) {
  const values = [
    record.dedup_key,
    record.tipo_operacion,
    record.storage_provider,
    record.storage_container || null,
    record.storage_blob_name,
    record.modulo || null,
    record.entidad_tipo || null,
    record.entidad_id === undefined || record.entidad_id === null ? null : String(record.entidad_id),
    record.motivo || null,
    record.solicitado_por || null,
    record.ultimo_error || null,
    record.max_intentos || 10
  ];

  const [result] = await db.query(
    `INSERT IGNORE INTO ${TABLE} (
       dedup_key, tipo_operacion, storage_provider, storage_container,
       storage_blob_name, modulo, entidad_tipo, entidad_id, motivo,
       solicitado_por, ultimo_error, max_intentos, estado, proximo_intento
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', NOW())`,
    values
  );

  if (!result.affectedRows) {
    await db.query(
      `UPDATE ${TABLE}
       SET ultimo_error = COALESCE(?, ultimo_error),
           motivo = COALESCE(?, motivo),
           modulo = COALESCE(?, modulo),
           entidad_tipo = COALESCE(?, entidad_tipo),
           entidad_id = COALESCE(?, entidad_id),
           solicitado_por = COALESCE(?, solicitado_por),
           estado = CASE WHEN estado = 'COMPLETADA' THEN estado ELSE 'PENDIENTE' END,
           proximo_intento = CASE WHEN estado = 'COMPLETADA' THEN proximo_intento ELSE NOW() END,
           updated_at = CURRENT_TIMESTAMP
       WHERE dedup_key = ?`,
      [
        record.ultimo_error || null,
        record.motivo || null,
        record.modulo || null,
        record.entidad_tipo || null,
        record.entidad_id === undefined || record.entidad_id === null ? null : String(record.entidad_id),
        record.solicitado_por || null,
        record.dedup_key
      ]
    );
  }

  const [rows] = await db.query(`SELECT * FROM ${TABLE} WHERE dedup_key = ? LIMIT 1`, [record.dedup_key]);
  return rows[0] || null;
}

async function recoverStale_gnral(staleMinutes) {
  const safeMinutes = Math.max(1, Math.floor(Number(staleMinutes || 15)));
  const [result] = await db.query(
    `UPDATE ${TABLE}
     SET estado = 'ERROR',
         ultimo_error = COALESCE(ultimo_error, 'Operación recuperada después de quedar en PROCESANDO.'),
         proximo_intento = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE estado = 'PROCESANDO'
       AND ultimo_intento_at < DATE_SUB(NOW(), INTERVAL ${safeMinutes} MINUTE)`
  );
  return result.affectedRows;
}

async function claimBatch_gnral(limit) {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit || 20))));
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT *
       FROM ${TABLE}
       WHERE estado IN ('PENDIENTE', 'ERROR')
         AND intentos < max_intentos
         AND (proximo_intento IS NULL OR proximo_intento <= NOW())
       ORDER BY id_operacion ASC
       LIMIT ${safeLimit}
       FOR UPDATE SKIP LOCKED`
    );

    if (!rows.length) {
      await connection.commit();
      return [];
    }

    const ids = rows.map(row => Number(row.id_operacion));
    const placeholders = ids.map(() => '?').join(',');
    await connection.query(
      `UPDATE ${TABLE}
       SET estado = 'PROCESANDO',
           intentos = intentos + 1,
           ultimo_intento_at = NOW(),
           updated_at = CURRENT_TIMESTAMP
       WHERE id_operacion IN (${placeholders})`,
      ids
    );
    await connection.commit();

    return rows.map(row => ({ ...row, estado: 'PROCESANDO', intentos: Number(row.intentos || 0) + 1 }));
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    connection.release();
  }
}

async function markCompleted_gnral(idOperacion) {
  const [result] = await db.query(
    `UPDATE ${TABLE}
     SET estado = 'COMPLETADA',
         ultimo_error = NULL,
         completed_at = NOW(),
         proximo_intento = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id_operacion = ?`,
    [idOperacion]
  );
  return result.affectedRows > 0;
}

async function markRetry_gnral(operation, errorMessage, nextAttemptAt) {
  const exhausted = Number(operation.intentos || 0) >= Number(operation.max_intentos || 10);
  const [result] = await db.query(
    `UPDATE ${TABLE}
     SET estado = ?,
         ultimo_error = ?,
         proximo_intento = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id_operacion = ?`,
    [
      exhausted ? 'DESCARTADA' : 'ERROR',
      String(errorMessage || 'Error desconocido').slice(0, 65000),
      exhausted ? null : nextAttemptAt,
      operation.id_operacion
    ]
  );
  return { updated: result.affectedRows > 0, exhausted };
}

async function status_gnral() {
  const [rows] = await db.query(
    `SELECT estado, COUNT(*) AS total
     FROM ${TABLE}
     GROUP BY estado
     ORDER BY estado`
  );
  return rows;
}

module.exports = {
  TABLE,
  enqueue_gnral,
  recoverStale_gnral,
  claimBatch_gnral,
  markCompleted_gnral,
  markRetry_gnral,
  status_gnral
};
