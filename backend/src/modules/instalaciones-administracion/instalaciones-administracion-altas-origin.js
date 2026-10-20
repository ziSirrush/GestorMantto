'use strict';

// BLT NOW | 2026-10-20 | ALTAS FASE 4 V001
// Utiliza la auditoria POST/CREAR ya existente como procedencia autorizada.
// NO depende de nombres de usuarios, de nuevos campos ni de una segunda BD.
const LOCK_NAME_COR = 'bltnow:ins_fl:altas_vs_gas:v1';
function positiveCor(v) {
  const id = Number(v);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function humanCreatedIdsCor(connection, candidates) {
  const expected = new Map();
  for (const row of candidates || []) {
    const id = positiveCor(row?.id_ins_fl);
    const project = String(row?.id_proyecto || '').trim();
    if (id && project) expected.set(id, project);
  }
  if (!expected.size) return new Set();
  const projects = [...new Set(expected.values())];
  const created = new Set();
  // idx_ui_referencia cubre modulo, entidad e id_referencia; no se escanea
  // toda la tabla ni se confia en auditaciones de otros tipos/modulos.
  for (let i = 0; i < projects.length; i += 100) {
    const part = projects.slice(i, i + 100);
    const [rows] = await connection.query(
      `SELECT id_referencia,
              JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.id_ins_fl')) AS audit_equipment_id
         FROM usuario_interacciones
        WHERE modulo = 'instalaciones-administracion'
          AND entidad = 'proyecto_instalaciones'
          AND tipo_interaccion = 'CREAR'
          AND metodo_http = 'POST'
          AND id_referencia IN (${part.map(() => '?').join(',')})`, part
    );
    for (const audit of rows) {
      const id = positiveCor(audit.audit_equipment_id);
      if (id && expected.get(id) === String(audit.id_referencia || '').trim()) created.add(id);
    }
  }
  return created;
}

async function acquireCor(connection) {
  const [rows] = await connection.query('SELECT GET_LOCK(?,10) AS granted', [LOCK_NAME_COR]);
  return Number(rows?.[0]?.granted) === 1;
}
async function releaseCor(connection) {
  const [rows] = await connection.query('SELECT RELEASE_LOCK(?) AS released', [LOCK_NAME_COR]);
  if (Number(rows?.[0]?.released) !== 1) throw Error('No se confirmo liberar el candado de sincronizacion.');
}

module.exports = Object.freeze({LOCK_NAME_COR, humanCreatedIdsCor, acquireCor, releaseCor});
