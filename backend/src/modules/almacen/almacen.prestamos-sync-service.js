'use strict';

// Carga inicial manual. No calcula valor ni modifica prestamos existentes.
const crypto = require('node:crypto');
const MAX_ROWS = 5000;
const LOCK = 'almacen_ns_prestamos_carga_inicial';
const TEXT = Object.freeze({
  nombre_articulo: 500, numero_parte_fabricante_original: 255,
  categoria_articulo: 255, ubicacion_inventario_texto: 255, codigo: 255,
  empresa: 255, ag: 255, responsable: 255, correo_seguimiento: 255,
  sitio: 500, antiguedad: 80
});
const DECIMALS = Object.freeze({
  cantidad_fisica_total_reportada: 4, ultimo_precio_compra: 6,
  cantidad: 4, costo_unitario: 6, valor: 4
});
const COLUMNS = Object.freeze(['id_articulo_ns', ...Object.keys(TEXT),
  'fecha_evento', ...Object.keys(DECIMALS)]);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function fail(message, status = 422, code = 'ALMACEN_PRESTAMOS_INVALID') {
  const error = new Error(message);
  Object.assign(error, { statusCode: status, code });
  throw error;
}
function decimal(value, scale, label) {
  if (value == null || value === '') return null;
  if (!['string', 'number'].includes(typeof value) ||
      (typeof value === 'number' && !Number.isFinite(value))) fail(`${label}: decimal invalido.`);
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value).trim());
  if (!match) fail(`${label}: enviar decimal sin separadores de miles ni notacion cientifica.`);
  const integer = match[2].replace(/^0+(?=\d)/, '');
  const fraction = (match[3] || '').replace(/0+$/, '');
  if (integer.length > 20 - scale || fraction.length > scale) fail(`${label}: excede DECIMAL(20,${scale}).`);
  const sign = /[1-9]/.test(integer + fraction) ? match[1] : '';
  return sign + integer + '.' + fraction.padEnd(scale, '0');
}
function normalizeRow(row, index) {
  const label = `Fila ${index + 1}`;
  if (!row || typeof row !== 'object' || Array.isArray(row)) fail(`${label}: objeto requerido.`);
  for (const key of Object.keys(row)) if (!COLUMNS.includes(key)) fail(`${label}: campo no admitido: ${key}.`);
  const id = row.id_articulo_ns;
  const missingId = id == null || (typeof id === 'string' && id.trim() === '');
  if (!missingId && (!['number', 'string'].includes(typeof id) ||
      (typeof id === 'number' && !Number.isSafeInteger(id)) || !/^[1-9]\d*$/.test(String(id)) ||
      BigInt(id) > 18446744073709551615n)) fail(`${label}: id_articulo_ns debe ser positivo o estar vacio; usar texto para IDs grandes.`);
  // El catalogo puede cargarse despues. No inventar IDs para pendientes.
  const normalized = { id_articulo_ns: missingId ? null : String(id) };
  for (const [key, max] of Object.entries(TEXT)) {
    const value = row[key];
    if (value != null && typeof value !== 'string') fail(`${label}: ${key} debe ser texto.`);
    const text = value == null ? '' : value.trim();
    if ([...text].length > max) fail(`${label}: ${key} excede ${max} caracteres.`);
    normalized[key] = text || null;
  }
  if (!normalized.nombre_articulo) fail(`${label}: nombre_articulo obligatorio.`);
  const date = row.fecha_evento;
  normalized.fecha_evento = date == null || date === '' ? null : date;
  if (normalized.fecha_evento !== null) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1000-01-01') fail(`${label}: fecha_evento debe usar AAAA-MM-DD.`);
    const parsed = new Date(date + 'T00:00:00Z');
    if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) fail(`${label}: fecha_evento invalida.`);
  }
  for (const [key, scale] of Object.entries(DECIMALS)) normalized[key] = decimal(row[key], scale, `${label}: ${key}`);
  return normalized;
}
function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('Objeto JSON requerido.');
  if (Object.keys(payload).some(key => !['idLote', 'filas'].includes(key))) fail('Solo se admiten idLote y filas.');
  if (typeof payload.idLote !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.idLote)) fail('idLote debe ser UUID.');
  if (!Array.isArray(payload.filas) || !payload.filas.length || payload.filas.length > MAX_ROWS) fail(`Enviar entre 1 y ${MAX_ROWS} filas en una sola solicitud completa.`);
  return { idLote: payload.idLote.toLowerCase(), rows: payload.filas.map(normalizeRow) };
}
function createPrestamosSyncService(db) {
  async function loadInitial(payload) {
    // Se valida TODO antes de adquirir conexion o comenzar escrituras.
    const { idLote, rows } = normalizePayload(payload);
    const hashes = rows.map(row => sha(JSON.stringify(row)));
    const conn = await db.getConnection();
    let locked = false;
    let transaction = false;
    let returnConnection = true;
    try {
      const [lockRows] = await conn.query('SELECT GET_LOCK(?, 0) AS acquired', [LOCK]);
      locked = Number(lockRows[0]?.acquired) === 1;
      if (!locked) fail('Ya hay una carga inicial en curso; reintentar el mismo lote.', 409, 'ALMACEN_PRESTAMOS_BUSY');
      await conn.beginTransaction();
      transaction = true;
      const [counts] = await conn.query('SELECT COUNT(*) AS total FROM almacen_ns_prestamos');
      if (Number(counts[0].total) > 0) {
        const [existing] = await conn.query('SELECT hash_fila FROM almacen_ns_prestamos WHERE ultimo_lote_id = ? ORDER BY id_prestamo', [idLote]);
        const same = Number(counts[0].total) === rows.length && existing.length === rows.length &&
          existing.every((row, index) => row.hash_fila === hashes[index]);
        if (!same) fail('La tabla ya contiene datos. La carga inicial no reemplaza ni actualiza registros.', 409, 'ALMACEN_PRESTAMOS_INITIAL_CONFLICT');
        await conn.commit();
        transaction = false;
        return { ok: true, idLote, insertados: 0, total: rows.length, repetido: true };
      }
      const columns = [...COLUMNS, 'ultimo_lote_id', 'hash_fila', 'raw_json'];
      for (let start = 0; start < rows.length; start += 100) {
        const chunk = rows.slice(start, start + 100);
        const placeholders = chunk.map(() => '(' + columns.map(() => '?').join(',') + ')').join(',');
        const values = chunk.flatMap((row, offset) => [...COLUMNS.map(key => row[key]), idLote, hashes[start + offset], JSON.stringify(row)]);
        await conn.query(`INSERT INTO almacen_ns_prestamos (${columns.map(key => '`' + key + '`').join(',')}) VALUES ${placeholders}`, values);
      }
      await conn.commit();
      transaction = false;
      return { ok: true, idLote, insertados: rows.length, total: rows.length, repetido: false };
    } catch (error) {
      if (transaction) {
        try { await conn.rollback(); }
        catch { conn.destroy(); returnConnection = false; locked = false; }
      }
      throw error;
    } finally {
      if (locked) {
        try { await conn.query('SELECT RELEASE_LOCK(?)', [LOCK]); }
        catch { conn.destroy(); returnConnection = false; }
      }
      if (returnConnection) conn.release();
    }
  }
  return { loadInitial };
}
module.exports = { createPrestamosSyncService, normalizePayload, MAX_ROWS };
