const db = require('../config/db');

const DB_FIELDS = [
  'id_ppns',
  'ph_ns',
  'estatus',
  'marca',
  'no_control',
  'cantidad',
  'proyecto',
  'supervisor',
  'asesor',
  'ict',
  'incoterm',
  'proveedor',
  'carpeta',
  'pvo',
  'pago_cliente',
  'pago_liberacion',
  'fecha_produccion',
  'fecha_estimada_obra',
  'fecha_exw',
  'puerto_origen',
  'fecha_salida_estimada',
  'fecha_salida_real',
  'tiempo_transito',
  'puerto_destino',
  'fecha_llegada_estimada',
  'fecha_llegada_real',
  'fecha_pago_pedimento',
  'fecha_carga_transporte_nacional',
  'tiempo_aduana',
  'lugar_entrega',
  'fecha_entrega_programada',
  'fecha_entrega_real_obra',
  'fecha_entrada_almacen',
  'fecha_salida_almacen',
  'fecha_termino_aditiva',
  'diferencia_dias',
  'tiempo_total',
  'comentarios',
  'estatus_corte_anterior',
  'fecha_corte_anterior'
];

const REQUIRED_FIELDS = ['id_ppns', 'estatus'];

function cleanValue(value) {
  if (value === undefined || value === null || value === '') return null;
  return value;
}

function normalizeDateOnly(value) {
  const cleaned = cleanValue(value);
  if (cleaned === null) return null;

  if (cleaned instanceof Date && !Number.isNaN(cleaned.getTime())) {
    return cleaned.toISOString().slice(0, 10);
  }

  const text = String(cleaned).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : text;
}

function normalizeIncomingRow(row) {
  return {
    id_log_ops: Number(row.id_log_ops ?? row.id_Script),
    id_ppns: cleanValue(row.id_ppns),
    ph_ns: cleanValue(row.ph_ns),
    estatus: cleanValue(row.estatus),
    marca: cleanValue(row.marca),
    no_control: cleanValue(row.no_control),
    cantidad: cleanValue(row.cantidad),
    proyecto: cleanValue(row.proyecto),
    supervisor: cleanValue(row.supervisor),
    asesor: cleanValue(row.asesor),
    ict: cleanValue(row.ict),
    incoterm: cleanValue(row.incoterm),
    proveedor: cleanValue(row.proveedor),
    carpeta: cleanValue(row.carpeta),
    pvo: cleanValue(row.pvo),
    pago_cliente: cleanValue(row.pago_cliente),
    pago_liberacion: cleanValue(row.pago_liberacion),
    fecha_produccion: cleanValue(row.fecha_produccion),
    fecha_estimada_obra: cleanValue(row.fecha_estimada_obra),
    fecha_exw: cleanValue(row.fecha_exw),
    puerto_origen: cleanValue(row.puerto_origen),
    fecha_salida_estimada: cleanValue(row.fecha_salida_estimada),
    fecha_salida_real: cleanValue(row.fecha_salida_real),
    tiempo_transito: cleanValue(row.tiempo_transito),
    puerto_destino: cleanValue(row.puerto_destino),
    fecha_llegada_estimada: cleanValue(row.fecha_llegada_estimada),
    fecha_llegada_real: cleanValue(row.fecha_llegada_real),
    fecha_pago_pedimento: cleanValue(row.fecha_pago_pedimento),
    fecha_carga_transporte_nacional: cleanValue(row.fecha_carga_transporte_nacional),
    tiempo_aduana: cleanValue(row.tiempo_aduana),
    lugar_entrega: cleanValue(row.lugar_entrega),
    fecha_entrega_programada: cleanValue(row.fecha_entrega_programada),
    fecha_entrega_real_obra: cleanValue(row.fecha_entrega_real_obra),
    fecha_entrada_almacen: cleanValue(row.fecha_entrada_almacen ?? row.fecha_almacen),
    fecha_salida_almacen: cleanValue(row.fecha_salida_almacen ?? row.fecha_fin_almacen),
    fecha_termino_aditiva: cleanValue(row.fecha_termino_aditiva),
    diferencia_dias: cleanValue(row.diferencia_dias),
    tiempo_total: cleanValue(row.tiempo_total),
    comentarios: cleanValue(row.comentarios),
    estatus_corte_anterior: cleanValue(
      row.estatus_corte_anterior ?? row.estatus_sem_pasada
    ),
    fecha_corte_anterior: normalizeDateOnly(
      row.fecha_corte_anterior ?? row.fecha_corte
    )
  };
}

function comparable(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value);
}

function rowChanged(existing, incoming) {
  return DB_FIELDS.some(field => comparable(existing[field]) !== comparable(incoming[field]));
}

async function syncLogOps(req, res) {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

  if (!rows.length) {
    return res.status(400).json({
      ok: false,
      message: 'No se recibieron filas para sincronizar log_ops.'
    });
  }

  const conn = await db.getConnection();
  const summary = {
    received: rows.length,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    rejected: 0,
    errors: []
  };

  try {
    await conn.beginTransaction();

    for (let index = 0; index < rows.length; index += 1) {
      const incoming = normalizeIncomingRow(rows[index] || {});

      if (!Number.isInteger(incoming.id_log_ops) || incoming.id_log_ops <= 0) {
        summary.rejected += 1;
        summary.errors.push({ index, message: 'id_log_ops/id_Script inválido.' });
        continue;
      }

      const missing = REQUIRED_FIELDS.filter(field => !incoming[field]);
      if (missing.length) {
        summary.rejected += 1;
        summary.errors.push({
          index,
          id_log_ops: incoming.id_log_ops,
          message: `Faltan campos obligatorios: ${missing.join(', ')}`
        });
        continue;
      }

      const [existingRows] = await conn.query(
        `SELECT id_log_ops, ${DB_FIELDS.join(', ')}
         FROM log_ops
         WHERE id_log_ops = ?
         LIMIT 1`,
        [incoming.id_log_ops]
      );

      if (!existingRows.length) {
        const columns = ['id_log_ops', ...DB_FIELDS, 'fecha_sync'];
        const placeholders = columns.map(() => '?').join(', ');
        const values = [
          incoming.id_log_ops,
          ...DB_FIELDS.map(field => incoming[field]),
          new Date()
        ];

        await conn.query(
          `INSERT INTO log_ops (${columns.join(', ')}) VALUES (${placeholders})`,
          values
        );
        summary.inserted += 1;
        continue;
      }

      if (!rowChanged(existingRows[0], incoming)) {
        summary.unchanged += 1;
        continue;
      }

      const assignments = DB_FIELDS.map(field => `${field} = ?`).join(', ');
      const values = [...DB_FIELDS.map(field => incoming[field]), incoming.id_log_ops];

      await conn.query(
        `UPDATE log_ops
         SET ${assignments}, fecha_sync = NOW()
         WHERE id_log_ops = ?`,
        values
      );
      summary.updated += 1;
    }

    await conn.commit();

    return res.json({
      ok: true,
      message: 'log_ops sincronizada correctamente.',
      ...summary
    });
  } catch (error) {
    await conn.rollback();
    return res.status(500).json({
      ok: false,
      message: 'Error sincronizando log_ops.',
      error: error.message,
      ...summary
    });
  } finally {
    conn.release();
  }
}

async function getLogOps(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 5000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const params = [];
    const where = [];

    if (req.query.estatus) {
      where.push('estatus = ?');
      params.push(String(req.query.estatus));
    }
    if (req.query.id_ppns) {
      where.push('id_ppns = ?');
      params.push(String(req.query.id_ppns));
    }
    if (req.query.proyecto) {
      where.push('proyecto LIKE ?');
      params.push(`%${String(req.query.proyecto)}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await db.query(
      `SELECT * FROM log_ops
       ${whereSql}
       ORDER BY id_log_ops ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({ ok: true, source: 'aiven', data: rows, limit, offset });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando log_ops.',
      error: error.message
    });
  }
}

async function getLogOpsById(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, message: 'ID inválido.' });
    }

    const [rows] = await db.query(
      'SELECT * FROM log_ops WHERE id_log_ops = ? LIMIT 1',
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, message: 'Registro logístico no encontrado.' });
    }

    return res.json({ ok: true, source: 'aiven', data: rows[0] });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando el registro logístico.',
      error: error.message
    });
  }
}

module.exports = {
  syncLogOps,
  getLogOps,
  getLogOpsById
};
