const db = require('../config/db');

const BLOCKED_COLUMNS = new Set(['pass', 'respuesta_recuperacion', 'totp_secret', 'recovery_codes']);
const TABLE_ALLOWLIST = new Set([
  'auth_audit', 'pendientes', 'pendientes_comentarios', 'pendientes_comentarios_adjuntos', 'pendientes_subtareas', 'pendientes_usuarios',
  'permisos', 'portafolio', 'preguntas_seguridad', 'roles', 'sup_adjuntos', 'sup_avisos', 'sup_faq', 'sup_faq_categorias',
  'sup_flujos', 'sup_nodos', 'sup_notificaciones', 'sup_opciones', 'sup_ticket_categorias', 'sup_tickets', 'tickets',
  'usuario_roles', 'usuario_zop', 'usuarios', 'z_op'
]);

function ensureTable(table) {
  if (!TABLE_ALLOWLIST.has(table)) {
    const error = new Error('Tabla no permitida.');
    error.status = 403;
    throw error;
  }
}

async function tables(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT table_name AS tabla
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
       ORDER BY table_name ASC`
    );
    return res.json({ ok: true, source: 'aiven', data: rows.filter(r => TABLE_ALLOWLIST.has(r.tabla)) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando tablas.', error: error.message });
  }
}

async function schema(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT table_name AS tabla, column_name AS columna, data_type, column_key, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
       ORDER BY table_name ASC, ordinal_position ASC`
    );
    const data = rows.filter(r => TABLE_ALLOWLIST.has(r.tabla) && !BLOCKED_COLUMNS.has(r.columna));
    return res.json({ ok: true, source: 'aiven', data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando esquema.', error: error.message });
  }
}

async function columns(req, res) {
  try {
    const table = req.params.table;
    ensureTable(table);
    const [rows] = await db.query(
      `SELECT column_name AS columna, data_type, column_key, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = ?
       ORDER BY ordinal_position ASC`,
      [table]
    );
    return res.json({ ok: true, source: 'aiven', data: rows.filter(r => !BLOCKED_COLUMNS.has(r.columna)) });
  } catch (error) {
    return res.status(error.status || 500).json({ ok: false, message: 'Error consultando columnas.', error: error.message });
  }
}

async function count(req, res) {
  try {
    const table = req.params.table;
    ensureTable(table);
    const [rows] = await db.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
    return res.json({ ok: true, source: 'aiven', data: rows[0] });
  } catch (error) {
    return res.status(error.status || 500).json({ ok: false, message: 'Error consultando conteo.', error: error.message });
  }
}

async function rows(req, res) {
  try {
    const table = req.params.table;
    ensureTable(table);
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const [columns] = await db.query(
      `SELECT column_name AS columna
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = ?
       ORDER BY ordinal_position ASC`,
      [table]
    );
    const safeColumns = columns.map(c => c.columna).filter(c => !BLOCKED_COLUMNS.has(c));
    const columnSql = safeColumns.map(c => `\`${c}\``).join(', ') || '*';
    const [data] = await db.query(`SELECT ${columnSql} FROM \`${table}\` LIMIT ? OFFSET ?`, [limit, offset]);
    return res.json({ ok: true, source: 'aiven', limit, offset, data });
  } catch (error) {
    return res.status(error.status || 500).json({ ok: false, message: 'Error consultando registros.', error: error.message });
  }
}

module.exports = { tables, schema, columns, count, rows };
