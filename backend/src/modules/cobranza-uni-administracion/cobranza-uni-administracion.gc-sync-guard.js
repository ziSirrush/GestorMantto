'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_6_V001]
// Marcador por registro: una edicion humana bloquea la sobrescritura GAS.
// Se escribe en la MISMA transaccion y despues de bloquear gestion_credito.
const { id_uni, fail_uni } = require('./cobranza-uni-administracion.gc-edit-validation');
const TABLE = '`cobranza_uni_gc_admin_guard`';

async function markManualEdit_uni(conn, input) {
  if (!conn || typeof conn.query !== 'function') throw new Error('Conexión MySQL ausente.');
  const id = id_uni(input.id);
  const actor = Number(input.actor);
  const field = String(input.field || '').trim();
  if (!Number.isSafeInteger(actor) || actor <= 0 || !/^[a-z_]{1,64}$/.test(field)) {
    throw fail_uni(400, 'GC_ADMIN_PROTECCION_INVALIDA', 'Marcador de edicion invalido.');
  }
  const [result] = await conn.query(
    `INSERT INTO ${TABLE} (id_gc,id_usuario,campo) VALUES (?,?,?) `+
    'ON DUPLICATE KEY UPDATE id_usuario=VALUES(id_usuario), campo=VALUES(campo), updated_at=CURRENT_TIMESTAMP',
    [id, actor, field]
  );
  if (!result || Number(result.affectedRows) < 1) {
    throw fail_uni(500, 'GC_ADMIN_PROTECCION_FALLIDA', 'No se confirmó la protección del registro.');
  }
  return true;
}

async function guardAvailable_uni(conn) {
  try {
    // La verificacion no crea tablas ni cambia nada; SQL protegido opcional
    // para NO romper el sync legado antes de la migracion manual.
    await conn.query(`SELECT id_gc FROM ${TABLE} LIMIT 0`);
    return true;
  } catch (error) {
    if (error && (error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146)) return false;
    throw error;
  }
}

async function isManuallyProtected_uni(conn, id) {
  const safeId = id_uni(id);
  const [rows] = await conn.query(`SELECT id_gc FROM ${TABLE} WHERE id_gc = ? LIMIT 1`, [safeId]);
  return Array.isArray(rows) && rows.length > 0;
}

module.exports = Object.freeze({markManualEdit_uni,guardAvailable_uni,isManuallyProtected_uni});
