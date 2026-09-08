'use strict';

const db = require('../../config/db');

function executorOrDb(executor) {
  return executor && typeof executor.query === 'function' ? executor : db;
}

function scopeParts(scope) {
  const safe = scope && typeof scope.sql === 'string' ? scope : { sql: '1 = 0', params: [] };
  return {
    sql: safe.sql || '1 = 0',
    params: Array.isArray(safe.params) ? safe.params : []
  };
}

async function findEquipmentScoped(executor, code, scope) {
  const conn = executorOrDb(executor);
  const scoped = scopeParts(scope);
  const ref = String(code || '').trim();
  const [rows] = await conn.query(
    `SELECT
       p.id_portafolio,
       p.numero_equipo,
       p.identificacion_sitio,
       p.proyecto,
       p.proyecto_cc_x_port,
       p.zona_id
     FROM portafolio p
     WHERE p.estado_registro = 1
       AND (
         TRIM(COALESCE(p.numero_equipo, '')) = TRIM(?)
         OR TRIM(COALESCE(p.identificacion_sitio, '')) = TRIM(?)
       )
       AND ${scoped.sql}
     LIMIT 1`,
    [ref, ref, ...scoped.params]
  );
  return rows[0] || null;
}

async function listProjectEquipmentsScoped(executor, project, scope) {
  const conn = executorOrDb(executor);
  const scoped = scopeParts(scope);
  const ref = String(project || '').trim();
  const [rows] = await conn.query(
    `SELECT
       p.id_portafolio,
       p.numero_equipo,
       p.identificacion_sitio,
       p.proyecto,
       p.proyecto_cc_x_port,
       p.zona_id
     FROM portafolio p
     WHERE p.estado_registro = 1
       AND LOWER(TRIM(COALESCE(p.proyecto, ''))) = LOWER(TRIM(?))
       AND ${scoped.sql}
     ORDER BY p.numero_equipo ASC`,
    [ref, ...scoped.params]
  );
  return rows;
}

async function getEquipmentInterest(executor, userId, idPortafolio) {
  const conn = executorOrDb(executor);
  const [rows] = await conn.query(
    `SELECT id_interes, id_usuario, id_portafolio, origen, activo, created_at, updated_at
       FROM portafolio_interes
      WHERE id_usuario = ?
        AND id_portafolio = ?
      LIMIT 1`,
    [Number(userId), Number(idPortafolio)]
  );
  return rows[0] || null;
}

async function hasActiveProjectSubscription(executor, userId, project) {
  const conn = executorOrDb(executor);
  const [rows] = await conn.query(
    `SELECT 1
       FROM portafolio_interes pi
       INNER JOIN portafolio p_source
               ON p_source.id_portafolio = pi.id_portafolio
              AND p_source.estado_registro = 1
      WHERE pi.id_usuario = ?
        AND pi.activo = 1
        AND pi.origen = 'PROYECTO'
        AND LOWER(TRIM(COALESCE(p_source.proyecto, ''))) = LOWER(TRIM(?))
      LIMIT 1`,
    [Number(userId), String(project || '').trim()]
  );
  return rows.length > 0;
}

async function getProjectInterestState(executor, userId, project, scope) {
  const conn = executorOrDb(executor);
  const scoped = scopeParts(scope);
  const [rows] = await conn.query(
    `SELECT
       COUNT(*) AS total_equipos,
       SUM(CASE WHEN pi.id_interes IS NOT NULL THEN 1 ELSE 0 END) AS relaciones_directas,
       SUM(CASE WHEN COALESCE(pi.activo, 0) = 1 THEN 1 ELSE 0 END) AS directos_activos,
       SUM(CASE WHEN pi.id_interes IS NOT NULL AND COALESCE(pi.activo, 0) = 0 THEN 1 ELSE 0 END) AS directos_inactivos
     FROM portafolio p
     LEFT JOIN portafolio_interes pi
       ON pi.id_portafolio = p.id_portafolio
      AND pi.id_usuario = ?
     WHERE p.estado_registro = 1
       AND LOWER(TRIM(COALESCE(p.proyecto, ''))) = LOWER(TRIM(?))
       AND ${scoped.sql}`,
    [Number(userId), String(project || '').trim(), ...scoped.params]
  );
  const row = rows[0] || {};
  const total = Number(row.total_equipos || 0);
  const directRows = Number(row.relaciones_directas || 0);
  const directActive = Number(row.directos_activos || 0);
  const projectSubscription = total > 0
    ? await hasActiveProjectSubscription(conn, userId, project)
    : false;
  const inheritedActive = projectSubscription ? Math.max(0, total - directRows) : 0;
  return {
    total,
    activos: directActive + inheritedActive,
    inactivos: Math.max(0, total - directActive - inheritedActive),
    suscripcion_proyecto: projectSubscription
  };
}

async function upsertEquipmentInterest(executor, { userId, idPortafolio, origin, active }) {
  const conn = executorOrDb(executor);
  const [result] = await conn.query(
    `INSERT INTO portafolio_interes
       (id_usuario, id_portafolio, origen, activo)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       origen = VALUES(origen),
       activo = VALUES(activo),
       updated_at = CURRENT_TIMESTAMP`,
    [Number(userId), Number(idPortafolio), String(origin), active ? 1 : 0]
  );
  return result;
}

async function bulkSetProjectInterest(executor, { userId, project, scope, active }) {
  const conn = executorOrDb(executor);
  const scoped = scopeParts(scope);
  const [result] = await conn.query(
    `INSERT INTO portafolio_interes
       (id_usuario, id_portafolio, origen, activo)
     SELECT ?, p.id_portafolio, 'PROYECTO', ?
       FROM portafolio p
      WHERE p.estado_registro = 1
        AND LOWER(TRIM(COALESCE(p.proyecto, ''))) = LOWER(TRIM(?))
        AND ${scoped.sql}
     ON DUPLICATE KEY UPDATE
       origen = 'PROYECTO',
       activo = VALUES(activo),
       updated_at = CURRENT_TIMESTAMP`,
    [Number(userId), active ? 1 : 0, String(project || '').trim(), ...scoped.params]
  );
  return result;
}

module.exports = {
  findEquipmentScoped,
  listProjectEquipmentsScoped,
  getEquipmentInterest,
  hasActiveProjectSubscription,
  getProjectInterestState,
  upsertEquipmentInterest,
  bulkSetProjectInterest
};
