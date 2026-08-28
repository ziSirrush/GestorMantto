'use strict';

const db = require('../../config/db');

const AFL_USER_ID_COR = 38;
const AFL_USER_EMAIL_COR = 'alflores@bltmexico.com.mx';
const AJUSTE_STATUS_COR = '06-A';

function placeholders_cor(values) {
  return values.map(() => '?').join(', ');
}

function projectKeySql_cor(alias) {
  return `CASE
    WHEN NULLIF(TRIM(${alias}.id_proyecto), '') IS NOT NULL
      THEN CONCAT('ID:', TRIM(${alias}.id_proyecto))
    ELSE CONCAT('NOMBRE:', LOWER(TRIM(COALESCE(${alias}.proyecto, ''))))
  END`;
}

function validProjectSql_cor(alias) {
  return `(NULLIF(TRIM(${alias}.id_proyecto), '') IS NOT NULL
    OR NULLIF(TRIM(${alias}.proyecto), '') IS NOT NULL)`;
}

function supervisorClause_cor(alias, supervisors) {
  const values = Array.isArray(supervisors) ? supervisors.filter(Boolean) : [];
  if (!values.length) return { sql: '', params: [] };
  return {
    sql: `AND TRIM(COALESCE(${alias}.supervisor_fl, '')) IN (${placeholders_cor(values)})`,
    params: [...values]
  };
}

function ajusteClause_cor(alias, ajusteActivo) {
  if (!ajusteActivo) return '';
  return `AND ${alias}.activo = 1 AND TRIM(COALESCE(${alias}.estatus, '')) = '${AJUSTE_STATUS_COR}'`;
}

function activeProjectsDerivedSql_cor(supervisors, options = {}) {
  const ajusteActivo = Boolean(options.ajusteActivo);
  const selectedKey = projectKeySql_cor('s');
  const allKey = projectKeySql_cor('f');
  const selectedSupervisor = supervisorClause_cor('s', supervisors);

  if (ajusteActivo) {
    const scopedSupervisor = supervisorClause_cor('f', supervisors);
    return {
      sql: `
        SELECT
          ${allKey} AS project_key,
          MAX(NULLIF(TRIM(f.id_proyecto), '')) AS id_proyecto,
          MAX(NULLIF(TRIM(f.proyecto), '')) AS proyecto,
          MAX(NULLIF(TRIM(f.ciudad), '')) AS ciudad,
          MAX(NULLIF(TRIM(f.estado), '')) AS estado,
          MAX(NULLIF(TRIM(f.vendedor), '')) AS asesor,
          MAX(NULLIF(TRIM(f.cliente), '')) AS cliente,
          GROUP_CONCAT(DISTINCT NULLIF(TRIM(f.supervisor_fl), '') ORDER BY TRIM(f.supervisor_fl) SEPARATOR ', ') AS supervisores,
          COUNT(*) AS total_equipos,
          COUNT(*) AS equipos_no_entregados,
          MAX(CASE WHEN NULLIF(TRIM(f.id_proyecto), '') IS NULL THEN 1 ELSE 0 END) AS sin_id_proyecto
        FROM ins_fl f
        WHERE ${validProjectSql_cor('f')}
          AND f.activo = 1
          AND TRIM(COALESCE(f.estatus, '')) = '${AJUSTE_STATUS_COR}'
          ${scopedSupervisor.sql}
        GROUP BY ${allKey}
      `,
      params: [...scopedSupervisor.params]
    };
  }

  return {
    sql: `
      SELECT
        ${allKey} AS project_key,
        MAX(NULLIF(TRIM(f.id_proyecto), '')) AS id_proyecto,
        MAX(NULLIF(TRIM(f.proyecto), '')) AS proyecto,
        MAX(NULLIF(TRIM(f.ciudad), '')) AS ciudad,
        MAX(NULLIF(TRIM(f.estado), '')) AS estado,
        MAX(NULLIF(TRIM(f.vendedor), '')) AS asesor,
        MAX(NULLIF(TRIM(f.cliente), '')) AS cliente,
        GROUP_CONCAT(DISTINCT NULLIF(TRIM(f.supervisor_fl), '') ORDER BY TRIM(f.supervisor_fl) SEPARATOR ', ') AS supervisores,
        COUNT(*) AS total_equipos,
        SUM(CASE WHEN COALESCE(TRIM(f.estatus), '') <> '08-T' THEN 1 ELSE 0 END) AS equipos_no_entregados,
        MAX(CASE WHEN NULLIF(TRIM(f.id_proyecto), '') IS NULL THEN 1 ELSE 0 END) AS sin_id_proyecto
      FROM ins_fl f
      INNER JOIN (
        SELECT DISTINCT ${selectedKey} AS project_key
        FROM ins_fl s
        WHERE ${validProjectSql_cor('s')}
          ${selectedSupervisor.sql}
      ) seleccionados
        ON seleccionados.project_key = ${allKey}
      WHERE ${validProjectSql_cor('f')}
      GROUP BY ${allKey}
      HAVING sin_id_proyecto = 1 OR equipos_no_entregados > 0
    `,
    params: [...selectedSupervisor.params]
  };
}

async function getRulesDate_cor() {
  const [rows] = await db.query(
    `SELECT
       DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') AS fecha_actual,
       YEAR(CURRENT_DATE()) AS anio_actual`
  );
  const row = rows[0] || {};
  return {
    fecha_actual: String(row.fecha_actual || '').trim() || new Date().toISOString().slice(0, 10),
    anio_actual: Number(row.anio_actual) || new Date().getFullYear()
  };
}

async function getSupervisors_cor() {
  const [rows] = await db.query(
    `SELECT
       base.supervisor,
       SUM(base.total_equipos) AS total_equipos
     FROM (
       SELECT
         TRIM(f.supervisor_fl) AS supervisor,
         COUNT(*) AS total_equipos
       FROM ins_fl f
       WHERE NULLIF(TRIM(f.supervisor_fl), '') IS NOT NULL
       GROUP BY TRIM(f.supervisor_fl)

       UNION ALL

       SELECT
         'EC' AS supervisor,
         0 AS total_equipos
       FROM usuarios u
       WHERE u.estado = 1
         AND UPPER(TRIM(COALESCE(u.iniciales, ''))) = 'EC'
         AND (
           EXISTS (
             SELECT 1
             FROM usuario_roles ur
             INNER JOIN roles r
               ON r.id_rol = ur.id_rol
              AND r.estado = 1
             WHERE ur.id_usuario = u.id_SB
               AND ur.activo = 1
               AND UPPER(TRIM(COALESCE(r.codigo, ''))) = 'SUPERVISOR_INSTALACIONES'
           )
           OR EXISTS (
             SELECT 1
             FROM roles r
             WHERE r.id_rol = u.rol_id
               AND r.estado = 1
               AND UPPER(TRIM(COALESCE(r.codigo, ''))) = 'SUPERVISOR_INSTALACIONES'
           )
         )
     ) base
     GROUP BY base.supervisor
     ORDER BY base.supervisor ASC`
  );
  return rows;
}

async function getSpecialAflUser_cor() {
  const [rows] = await db.query(
    `SELECT id_SB, nombre, iniciales, puesto, area, empresa, correo, estado
       FROM usuarios
      WHERE id_SB = ?
        AND LOWER(TRIM(COALESCE(correo, ''))) = LOWER(?)
      LIMIT 1`,
    [AFL_USER_ID_COR, AFL_USER_EMAIL_COR]
  );
  return rows[0] || null;
}

async function getAjusteActivoCount_cor() {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
       FROM ins_fl f
      WHERE f.activo = 1
        AND TRIM(COALESCE(f.estatus, '')) = ?`,
    [AJUSTE_STATUS_COR]
  );
  return Number(rows[0] && rows[0].total) || 0;
}

async function getEffectivePermissionsBulk_cor(userId, permissionCodes) {
  const codes = Array.from(new Set(
    (Array.isArray(permissionCodes) ? permissionCodes : [])
      .map(code => String(code || '').trim())
      .filter(Boolean)
  ));

  if (!codes.length) return {};

  const [rows] = await db.query(
    `SELECT
       psa.codigo_permiso,
       (
         SELECT up.permitido
         FROM usuario_permisos up
         WHERE up.id_usuario = ?
           AND up.id_subelemento_accion = psa.id_subelemento_accion
           AND up.activo = 1
           AND (up.fecha_inicio IS NULL OR up.fecha_inicio <= NOW())
           AND (up.fecha_fin IS NULL OR up.fecha_fin >= NOW())
         ORDER BY up.updated_at DESC, up.id_usuario_permiso DESC
         LIMIT 1
       ) AS personalizado,
       EXISTS (
         SELECT 1
         FROM rol_permisos rp
         INNER JOIN (
           SELECT ur.id_rol
           FROM usuario_roles ur
           WHERE ur.id_usuario = ?
             AND ur.activo = 1
           UNION
           SELECT u.rol_id
           FROM usuarios u
           WHERE u.id_SB = ?
             AND u.estado = 1
             AND u.rol_id IS NOT NULL
         ) roles_usuario
           ON roles_usuario.id_rol = rp.id_rol
         INNER JOIN roles r
           ON r.id_rol = rp.id_rol
          AND r.estado = 1
         WHERE rp.id_subelemento_accion = psa.id_subelemento_accion
           AND rp.permitido = 1
       ) AS heredado
     FROM perm_subelemento_acciones psa
     WHERE psa.codigo_permiso IN (${placeholders_cor(codes)})
       AND psa.activo = 1`,
    [userId, userId, userId, ...codes]
  );

  const result = Object.fromEntries(codes.map(code => [code, false]));
  rows.forEach(row => {
    const hasCustom = row.personalizado !== null && row.personalizado !== undefined;
    result[row.codigo_permiso] = hasCustom
      ? Number(row.personalizado) === 1
      : Number(row.heredado) === 1;
  });
  return result;
}

async function listCommentsByUserAndSupervisors_cor(userId, supervisors, options = {}) {
  const supervisor = supervisorClause_cor('f', supervisors);
  const ajusteActivo = Boolean(options.ajusteActivo);
  const [rows] = await db.query(
    `SELECT
       c.id_comentario,
       c.id_proyecto,
       c.proyecto,
       c.referencia_sitio,
       c.comentario,
       c.responsables,
       c.semana_iso,
       c.semana_orden,
       c.fecha_creacion
     FROM instalaciones_comentarios_junta c
     WHERE c.id_usuario = ?
       AND c.activo = 1
       AND EXISTS (
         SELECT 1
         FROM ins_fl f
         WHERE TRIM(COALESCE(f.referencia_sitio, '')) = TRIM(COALESCE(c.referencia_sitio, ''))
           ${supervisor.sql}
           ${ajusteClause_cor('f', ajusteActivo)}
           AND (
             (NULLIF(TRIM(c.id_proyecto), '') IS NOT NULL
               AND TRIM(COALESCE(f.id_proyecto, '')) = TRIM(c.id_proyecto))
             OR
             (NULLIF(TRIM(c.id_proyecto), '') IS NULL
               AND NULLIF(TRIM(c.proyecto), '') IS NOT NULL
               AND LOWER(TRIM(COALESCE(f.proyecto, ''))) = LOWER(TRIM(c.proyecto)))
             OR
             (NULLIF(TRIM(c.id_proyecto), '') IS NULL
               AND NULLIF(TRIM(c.proyecto), '') IS NULL)
           )
       )
     ORDER BY TRIM(COALESCE(c.proyecto, '')) ASC,
              c.semana_orden DESC,
              c.id_comentario DESC
     LIMIT 1000`,
    [userId, ...supervisor.params]
  );
  return rows;
}

async function listActiveProjects_cor(supervisors, options = {}) {
  const derived = activeProjectsDerivedSql_cor(supervisors, options);
  const [rows] = await db.query(
    `SELECT
       p.project_key,
       p.id_proyecto,
       p.proyecto,
       p.ciudad,
       p.estado,
       p.asesor,
       p.cliente,
       p.supervisores,
       p.total_equipos,
       p.equipos_no_entregados
     FROM (${derived.sql}) p
     ORDER BY p.proyecto ASC, p.id_proyecto ASC`,
    derived.params
  );
  return rows;
}

async function listReportRows_cor(supervisors, status, currentYear, options = {}) {
  const supervisor = supervisorClause_cor('f', supervisors);
  const params = [...supervisor.params, status];
  let yearClause = '';
  if (status === '08-T') {
    yearClause = 'AND CAST(TRIM(f.anio_termino) AS UNSIGNED) = ?';
    params.push(currentYear);
  }

  const [rows] = await db.query(
    `SELECT
       f.id_ins_fl,
       f.id_proyecto,
       f.proyecto,
       f.referencia_sitio,
       f.estatus,
       f.estado,
       f.ciudad,
       f.cliente,
       f.id_sup,
       f.supervisor_fl,
       f.id_asesor,
       f.vendedor,
       f.fecha_visita,
       f.comentarios_fl,
       f.avance_oc,
       f.avance_mo,
       f.numero_pisos,
       f.numero_desembarques,
       f.numero_puertas,
       f.capacidad_kg,
       f.fecha_cpvp,
       f.estatus_produccion,
       f.fecha_descarga,
       f.fecha_ccnr,
       f.dias_sin_ccnr,
       f.dias_sin_visita,
       f.fecha_posible_recepcion_cubo,
       f.fecha_ccr,
       f.subcontratista,
       f.fecha_inicio_montaje,
       f.fecha_fin_montaje_planeado,
       f.fecha_fin_montaje_modificado,
       f.dias_restantes,
       f.fecha_revision_supervisor,
       f.fecha_minuta_revision_ajuste,
       f.fecha_liberacion_ajuste,
       f.fecha_cti,
       f.fecha_posible_inicio_ajuste,
       f.ajustador,
       f.fecha_inicio_ajuste,
       f.fecha_fin_ajuste_planeado,
       f.fecha_fin_ajuste_modificado,
       f.fecha_protocolo_aceptacion,
       f.estatus_inspeccion_calidad,
       f.pendientes_calidad,
       f.fecha_entrega_cliente,
       f.formato_caf_pg,
       f.estatus_equipo_entrega,
       f.anio_termino,
       f.activo,
       f.updated_at
     FROM ins_fl f
     WHERE f.activo = 1
       ${supervisor.sql}
       AND f.estatus = ?
       ${yearClause}
     ORDER BY f.proyecto ASC, f.referencia_sitio ASC, f.id_ins_fl ASC`,
    params
  );
  return rows;
}


const QUICK_EDIT_COLUMNS_COR = new Set([
  'estatus',
  'fecha_posible_recepcion_cubo',
  'comentarios_fl',
  'ajustador',
  'fecha_posible_inicio_ajuste',
  'fecha_inicio_ajuste',
  'fecha_fin_ajuste_planeado',
  'fecha_fin_ajuste_modificado'
]);

async function getReportRowById_cor(idInsFl, executor = db, forUpdate = false) {
  const id = Number(idInsFl);
  if (!Number.isInteger(id) || id <= 0) return null;
  const lockSql = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await executor.query(
    `SELECT
       f.id_ins_fl,
       f.id_proyecto,
       f.proyecto,
       f.referencia_sitio,
       f.estatus,
       f.estado,
       f.ciudad,
       f.cliente,
       f.id_sup,
       f.supervisor_fl,
       f.id_asesor,
       f.vendedor,
       f.fecha_visita,
       f.comentarios_fl,
       f.avance_oc,
       f.avance_mo,
       f.numero_pisos,
       f.numero_desembarques,
       f.numero_puertas,
       f.capacidad_kg,
       f.fecha_cpvp,
       f.estatus_produccion,
       f.fecha_descarga,
       f.fecha_ccnr,
       f.dias_sin_ccnr,
       f.dias_sin_visita,
       f.fecha_posible_recepcion_cubo,
       f.fecha_ccr,
       f.subcontratista,
       f.fecha_inicio_montaje,
       f.fecha_fin_montaje_planeado,
       f.fecha_fin_montaje_modificado,
       f.dias_restantes,
       f.fecha_revision_supervisor,
       f.fecha_minuta_revision_ajuste,
       f.fecha_liberacion_ajuste,
       f.fecha_cti,
       f.fecha_posible_inicio_ajuste,
       f.ajustador,
       f.fecha_inicio_ajuste,
       f.fecha_fin_ajuste_planeado,
       f.fecha_fin_ajuste_modificado,
       f.fecha_protocolo_aceptacion,
       f.estatus_inspeccion_calidad,
       f.pendientes_calidad,
       f.fecha_entrega_cliente,
       f.formato_caf_pg,
       f.estatus_equipo_entrega,
       f.anio_termino,
       f.activo,
       f.updated_at
     FROM ins_fl f
     WHERE f.id_ins_fl = ?
     LIMIT 1${lockSql}`,
    [id]
  );
  return rows[0] || null;
}

async function updateReportField_cor(idInsFl, field, value, executor = db) {
  const id = Number(idInsFl);
  const column = String(field || '').trim();
  if (!Number.isInteger(id) || id <= 0 || !QUICK_EDIT_COLUMNS_COR.has(column)) {
    return 0;
  }
  const [result] = await executor.query(
    `UPDATE ins_fl SET \`${column}\` = ? WHERE id_ins_fl = ? AND activo = 1`,
    [value, id]
  );
  return Number(result.affectedRows || 0);
}


module.exports = {
  AJUSTE_STATUS_COR,
  getRulesDate_cor,
  getSupervisors_cor,
  getSpecialAflUser_cor,
  getAjusteActivoCount_cor,
  getEffectivePermissionsBulk_cor,
  listCommentsByUserAndSupervisors_cor,
  listActiveProjects_cor,
  listReportRows_cor,
  getReportRowById_cor,
  updateReportField_cor
};
