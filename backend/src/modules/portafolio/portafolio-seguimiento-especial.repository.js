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
       p.ciudad,
       p.estado,
       p.zona_id,
       p.zona_operativa,
       p.estatus_servicio
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
       p.ciudad,
       p.estado,
       p.zona_id,
       p.zona_operativa,
       p.estatus_servicio
     FROM portafolio p
     WHERE p.estado_registro = 1
       AND LOWER(TRIM(COALESCE(p.proyecto, ''))) = LOWER(TRIM(?))
       AND ${scoped.sql}
     ORDER BY p.numero_equipo ASC`,
    [ref, ...scoped.params]
  );
  return rows;
}

async function getEquipmentFollowup(executor, userId, idPortafolio) {
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
  const ref = String(project || '').trim();
  if (!ref) return false;

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
    [Number(userId), ref]
  );
  return rows.length > 0;
}

async function getProjectFollowupState(executor, userId, project, scope) {
  const conn = executorOrDb(executor);
  const scoped = scopeParts(scope);
  const ref = String(project || '').trim();
  const [rows] = await conn.query(
    `SELECT
       COUNT(*) AS total_equipos,
       SUM(CASE WHEN pi.id_interes IS NOT NULL THEN 1 ELSE 0 END) AS relaciones_directas,
       SUM(CASE WHEN COALESCE(pi.activo, 0) = 1 THEN 1 ELSE 0 END) AS directos_activos,
       SUM(CASE WHEN COALESCE(pi.activo, 0) = 1 AND pi.origen = 'PROYECTO' THEN 1 ELSE 0 END) AS origen_proyecto_activos,
       MAX(CASE WHEN pi.activo = 1 THEN pi.updated_at ELSE NULL END) AS ultima_actualizacion
     FROM portafolio p
     LEFT JOIN portafolio_interes pi
       ON pi.id_portafolio = p.id_portafolio
      AND pi.id_usuario = ?
     WHERE p.estado_registro = 1
       AND LOWER(TRIM(COALESCE(p.proyecto, ''))) = LOWER(TRIM(?))
       AND ${scoped.sql}`,
    [Number(userId), ref, ...scoped.params]
  );

  const row = rows[0] || {};
  const total = Number(row.total_equipos || 0);
  const directRows = Number(row.relaciones_directas || 0);
  const directActive = Number(row.directos_activos || 0);
  const projectSubscription = total > 0
    ? await hasActiveProjectSubscription(conn, userId, ref)
    : false;

  // Un proyecto marcado materializa los equipos existentes. Si el Portafolio
  // recibe después un equipo nuevo, éste hereda el seguimiento mientras no
  // exista una excepción directa para usuario+equipo. Una fila directa activa
  // o inactiva siempre prevalece sobre la herencia.
  const inheritedActive = projectSubscription ? Math.max(0, total - directRows) : 0;

  return {
    total,
    activos: Math.min(total, directActive + inheritedActive),
    origenProyectoActivos: Number(row.origen_proyecto_activos || 0),
    suscripcionProyecto: projectSubscription,
    updatedAt: row.ultima_actualizacion || null
  };
}

async function listActiveProjectNames(executor, userId, scope) {
  const conn = executorOrDb(executor);
  const scoped = scopeParts(scope);
  const [rows] = await conn.query(
    `SELECT DISTINCT p.proyecto
       FROM portafolio_interes pi
       INNER JOIN portafolio p
               ON p.id_portafolio = pi.id_portafolio
              AND p.estado_registro = 1
      WHERE pi.id_usuario = ?
        AND pi.activo = 1
        AND pi.origen = 'PROYECTO'
        AND NULLIF(TRIM(COALESCE(p.proyecto, '')), '') IS NOT NULL
        AND ${scoped.sql}
      ORDER BY p.proyecto ASC`,
    [Number(userId), ...scoped.params]
  );
  return rows.map((row) => String(row.proyecto || '').trim()).filter(Boolean);
}

async function listProjectSummaries(executor, userId, projects, scope) {
  const normalized = [...new Set((Array.isArray(projects) ? projects : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
  if (!normalized.length) return [];

  const summaries = [];
  for (const project of normalized) {
    const state = await getProjectFollowupState(executor, userId, project, scope);
    if (!state.total || !state.suscripcionProyecto) continue;
    summaries.push({
      proyecto: project,
      total_equipos: state.total,
      equipos_activos: state.activos,
      equipos_origen_proyecto: state.origenProyectoActivos,
      parcial: state.activos < state.total,
      updated_at: state.updatedAt || null
    });
  }

  return summaries.sort((left, right) =>
    String(left.proyecto || '').localeCompare(String(right.proyecto || ''), 'es', { sensitivity: 'base' })
  );
}

async function listActiveEquipment(executor, userId, scope) {
  const conn = executorOrDb(executor);
  const scoped = scopeParts(scope);
  const normalizedUserId = Number(userId);

  const [rows] = await conn.query(
    `SELECT
       pi.id_interes,
       p.id_portafolio,
       CASE
         WHEN pi.id_interes IS NOT NULL THEN pi.origen
         ELSE 'PROYECTO_HEREDADO'
       END AS origen,
       1 AS activo,
       COALESCE(pi.created_at, project_follow.created_at) AS created_at,
       COALESCE(pi.updated_at, project_follow.updated_at) AS updated_at,
       p.numero_equipo,
       p.identificacion_sitio,
       p.proyecto,
       p.ciudad,
       p.estado,
       p.zona_id,
       p.zona_operativa,
       p.estatus_servicio
     FROM portafolio p
     LEFT JOIN portafolio_interes pi
       ON pi.id_portafolio = p.id_portafolio
      AND pi.id_usuario = ?
     LEFT JOIN (
       SELECT
         LOWER(TRIM(COALESCE(p_source.proyecto, ''))) AS project_key,
         MIN(psi.created_at) AS created_at,
         MAX(psi.updated_at) AS updated_at
       FROM portafolio_interes psi
       INNER JOIN portafolio p_source
               ON p_source.id_portafolio = psi.id_portafolio
              AND p_source.estado_registro = 1
       WHERE psi.id_usuario = ?
         AND psi.activo = 1
         AND psi.origen = 'PROYECTO'
         AND NULLIF(TRIM(COALESCE(p_source.proyecto, '')), '') IS NOT NULL
       GROUP BY LOWER(TRIM(COALESCE(p_source.proyecto, '')))
     ) project_follow
       ON project_follow.project_key = LOWER(TRIM(COALESCE(p.proyecto, '')))
     WHERE p.estado_registro = 1
       AND ${scoped.sql}
       AND (
         (pi.id_interes IS NOT NULL AND pi.activo = 1)
         OR
         (pi.id_interes IS NULL AND project_follow.project_key IS NOT NULL)
       )
     ORDER BY p.proyecto ASC, p.numero_equipo ASC`,
    [normalizedUserId, normalizedUserId, ...scoped.params]
  );

  return rows.map((row) => ({
    ...row,
    id_interes: row.id_interes == null ? null : Number(row.id_interes),
    id_portafolio: Number(row.id_portafolio),
    activo: true
  }));
}

async function upsertEquipmentFollowup(executor, { userId, idPortafolio, origin, active }) {
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

async function bulkSetProjectFollowup(executor, { userId, project, scope, active }) {
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
  getEquipmentFollowup,
  hasActiveProjectSubscription,
  getProjectFollowupState,
  listActiveProjectNames,
  listProjectSummaries,
  listActiveEquipment,
  upsertEquipmentFollowup,
  bulkSetProjectFollowup
};
