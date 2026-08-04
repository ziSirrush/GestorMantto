const db = require('../../config/db');

const TABLE = 'storage_eventos';

async function insertEvent_gnral(event) {
  const [result] = await db.query(
    `INSERT INTO ${TABLE} (
       tipo_evento, storage_provider, storage_container, storage_blob_name,
       modulo, entidad_tipo, entidad_id, archivo_id, usuario_id,
       codigo, tamano_bytes, http_method, request_path, detalle_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.tipo_evento,
      event.storage_provider || null,
      event.storage_container || null,
      event.storage_blob_name || null,
      event.modulo || null,
      event.entidad_tipo || null,
      event.entidad_id === undefined || event.entidad_id === null ? null : String(event.entidad_id),
      event.archivo_id === undefined || event.archivo_id === null ? null : String(event.archivo_id),
      event.usuario_id || null,
      event.codigo || null,
      event.tamano_bytes === undefined || event.tamano_bytes === null ? null : Number(event.tamano_bytes),
      event.http_method || null,
      event.request_path || null,
      event.detalle_json ? JSON.stringify(event.detalle_json) : null
    ]
  );
  return result.insertId;
}

async function summary_gnral(days = 30) {
  const safeDays = Math.max(1, Math.min(365, Math.floor(Number(days || 30))));
  const [totals] = await db.query(
    `SELECT tipo_evento, COUNT(*) AS total,
            COALESCE(SUM(tamano_bytes), 0) AS total_bytes
       FROM ${TABLE}
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)
      GROUP BY tipo_evento
      ORDER BY tipo_evento`
  );

  const [daily] = await db.query(
    `SELECT DATE(created_at) AS fecha, tipo_evento, COUNT(*) AS total
       FROM ${TABLE}
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)
      GROUP BY DATE(created_at), tipo_evento
      ORDER BY fecha ASC, tipo_evento ASC`
  );

  const [modules] = await db.query(
    `SELECT COALESCE(NULLIF(TRIM(modulo), ''), '(SIN_MODULO)') AS modulo,
            tipo_evento, COUNT(*) AS total
       FROM ${TABLE}
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)
      GROUP BY COALESCE(NULLIF(TRIM(modulo), ''), '(SIN_MODULO)'), tipo_evento
      ORDER BY total DESC, modulo ASC, tipo_evento ASC
      LIMIT 200`
  );

  const [codes] = await db.query(
    `SELECT COALESCE(NULLIF(TRIM(codigo), ''), '(SIN_CODIGO)') AS codigo,
            COUNT(*) AS total
       FROM ${TABLE}
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)
        AND tipo_evento IN ('UPLOAD_ERROR','ACCESS_DENIED','ACCESS_ERROR','REJECTED','DELETE_ERROR')
      GROUP BY COALESCE(NULLIF(TRIM(codigo), ''), '(SIN_CODIGO)')
      ORDER BY total DESC, codigo ASC
      LIMIT 100`
  );

  return { days: safeDays, totals, daily, modules, codes };
}

async function countAll_gnral() {
  const [rows] = await db.query(`SELECT COUNT(*) AS total FROM ${TABLE}`);
  return Number(rows[0] && rows[0].total || 0);
}

module.exports = {
  TABLE,
  insertEvent_gnral,
  summary_gnral,
  countAll_gnral
};
