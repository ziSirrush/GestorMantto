'use strict';

const db = require('../../config/db');

const ESTATUS_DOCUMENTACION_COR = Object.freeze(['04-M', '05-PA', '06-A', '07-PE']);
const ACCESS_PERMISSION_CODE_COR = 'INSTALACIONES_DOCUMENTACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const EXCLUDED_SUPERVISOR_USER_ID_COR = 38;
const EXCLUDED_SUPERVISOR_INITIALS_COR = Object.freeze(['ALF', 'AFL']);

function placeholders_cor(values) {
  return values.map(() => '?').join(', ');
}

function normalizedTextExpr_cor(alias, field) {
  return `NULLIF(TRIM(${alias}.${field}), '')`;
}

function generatedExpr_cor(alias, field) {
  const normalized = normalizedTextExpr_cor(alias, field);
  return `CASE
    WHEN ${normalized} IS NULL THEN 0
    WHEN UPPER(${normalized}) IN ('-', 'FALTA', 'FALTA.') THEN 0
    ELSE 1
  END`;
}

function requiredExpr_cor(alias) {
  return `CASE WHEN TRIM(COALESCE(${alias}.estatus, '')) = '04-M' THEN 6 ELSE 9 END`;
}

function generatedCountExpr_cor(alias) {
  return `(
    ${generatedExpr_cor(alias, 'fecha_cpvp')} +
    ${generatedExpr_cor(alias, 'fecha_ccnr')} +
    ${generatedExpr_cor(alias, 'fecha_ccr')} +
    ${generatedExpr_cor(alias, 'condiciones_obra')} +
    ${generatedExpr_cor(alias, 'fecha_cti')} +
    ${generatedExpr_cor(alias, 'fecha_revision_supervisor')} +
    ${generatedExpr_cor(alias, 'evaluacion_subcontrato')} +
    ${generatedExpr_cor(alias, 'minuta_interfon')} +
    ${generatedExpr_cor(alias, 'certificado_regulador')}
  )`;
}

function supervisorWhere_cor(supervisor, alias = 'f') {
  if (supervisor && Array.isArray(supervisor.dashboard_initials)) {
    const values = Array.from(new Set(
      supervisor.dashboard_initials
        .map(value => String(value == null ? '' : value).trim().toUpperCase())
        .filter(Boolean)
    ));
    if (!values.length) return { sql: '1 = 0', params: [] };
    return {
      sql: `UPPER(TRIM(COALESCE(${alias}.supervisor_fl, ''))) IN (${placeholders_cor(values)})`,
      params: values
    };
  }

  if (supervisor && supervisor.all === true) {
    return {
      sql: `(
        (${alias}.id_sup IS NULL OR ${alias}.id_sup <> ?)
        AND UPPER(TRIM(COALESCE(${alias}.supervisor_fl, ''))) NOT IN (${placeholders_cor(EXCLUDED_SUPERVISOR_INITIALS_COR)})
      )`,
      params: [EXCLUDED_SUPERVISOR_USER_ID_COR, ...EXCLUDED_SUPERVISOR_INITIALS_COR]
    };
  }

  if (!supervisor || !Number.isInteger(Number(supervisor.id_supervisor))) {
    return { sql: '1 = 0', params: [] };
  }

  const supervisorId = Number(supervisor.id_supervisor);
  const initials = String(supervisor.iniciales || '').trim();

  if (initials) {
    return {
      sql: `(
        ${alias}.id_sup = ?
        OR UPPER(TRIM(COALESCE(${alias}.supervisor_fl, ''))) = UPPER(?)
      )`,
      params: [supervisorId, initials]
    };
  }

  return {
    sql: `${alias}.id_sup = ?`,
    params: [supervisorId]
  };
}

function appendSupervisorScope_cor(where, params, supervisor, alias = 'f') {
  const clause = supervisorWhere_cor(supervisor, alias);
  where.push(clause.sql);
  params.push(...clause.params);
}

function appendStatusScope_cor(where, params, alias = 'f') {
  where.push(`TRIM(COALESCE(${alias}.estatus, '')) IN (${placeholders_cor(ESTATUS_DOCUMENTACION_COR)})`);
  params.push(...ESTATUS_DOCUMENTACION_COR);
}

function appendListFilters_cor(where, params, filters, alias = 'f') {
  if (filters.q) {
    const like = `%${filters.q}%`;
    where.push(`(
      ${alias}.proyecto LIKE ? OR
      ${alias}.id_proyecto LIKE ? OR
      ${alias}.referencia_sitio LIKE ? OR
      ${alias}.estado LIKE ? OR
      ${alias}.ciudad LIKE ?
    )`);
    params.push(like, like, like, like, like);
  }

  if (filters.estado) {
    where.push(`TRIM(COALESCE(${alias}.estado, '')) = ?`);
    params.push(filters.estado);
  }

  if (filters.estatus) {
    where.push(`TRIM(COALESCE(${alias}.estatus, '')) = ?`);
    params.push(filters.estatus);
  }
}

function dataset_cor(supervisor, filters = {}) {
  const where = [];
  const params = [];

  appendSupervisorScope_cor(where, params, supervisor, 'f');
  appendStatusScope_cor(where, params, 'f');
  appendListFilters_cor(where, params, filters, 'f');

  const required = requiredExpr_cor('f');
  const generated = generatedCountExpr_cor('f');
  const generatedForProgress = `LEAST(${generated}, ${required})`;

  return {
    sql: `SELECT
      f.id_ins_fl,
      f.id_proyecto,
      f.proyecto,
      f.referencia_sitio,
      f.supervisor_fl,
      f.id_sup,
      f.estado,
      f.ciudad,
      f.estatus,
      f.activo,
      f.fecha_cpvp,
      f.fecha_ccnr,
      f.fecha_ccr,
      f.condiciones_obra,
      f.fecha_cti,
      f.fecha_revision_supervisor,
      f.evaluacion_subcontrato,
      f.minuta_interfon,
      f.certificado_regulador,
      ${generatedExpr_cor('f', 'fecha_cpvp')} AS doc_cpvp_generado,
      ${generatedExpr_cor('f', 'fecha_ccnr')} AS doc_ccnr_generado,
      ${generatedExpr_cor('f', 'fecha_ccr')} AS doc_ccr_generado,
      ${generatedExpr_cor('f', 'condiciones_obra')} AS doc_condiciones_obra_generado,
      ${generatedExpr_cor('f', 'fecha_cti')} AS doc_cti_generado,
      ${generatedExpr_cor('f', 'fecha_revision_supervisor')} AS doc_revision_supervisor_generado,
      ${generatedExpr_cor('f', 'evaluacion_subcontrato')} AS doc_evaluacion_montaje_generado,
      ${generatedExpr_cor('f', 'minuta_interfon')} AS doc_minuta_interfon_generado,
      ${generatedExpr_cor('f', 'certificado_regulador')} AS doc_certificado_regulador_generado,
      ${required} AS documentos_requeridos,
      ${generated} AS documentos_generados,
      ${generatedForProgress} AS documentos_generados_progreso,
      GREATEST(${required} - ${generated}, 0) AS documentos_pendientes,
      CASE WHEN ${generated} >= ${required} THEN 1 ELSE 0 END AS documentacion_completa,
      CASE
        WHEN ${required} > 0
        THEN ROUND((${generatedForProgress} / ${required}) * 100, 1)
        ELSE 0
      END AS cumplimiento_porcentaje
    FROM ins_fl f
    WHERE ${where.join(' AND ')}`,
    params
  };
}

function outerDocumentationFilter_cor(filters) {
  if (filters.documentacion === 'PENDIENTE') return 'WHERE d.documentos_pendientes > 0';
  if (filters.documentacion === 'COMPLETA') return 'WHERE d.documentos_pendientes = 0';
  return '';
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
       ) AS heredado,
       EXISTS (
         SELECT 1
         FROM rol_permisos rp_cfg
         INNER JOIN (
           SELECT ur_cfg.id_rol
           FROM usuario_roles ur_cfg
           WHERE ur_cfg.id_usuario = ?
             AND ur_cfg.activo = 1
           UNION
           SELECT u_cfg.rol_id
           FROM usuarios u_cfg
           WHERE u_cfg.id_SB = ?
             AND u_cfg.estado = 1
             AND u_cfg.rol_id IS NOT NULL
         ) roles_configurados
           ON roles_configurados.id_rol = rp_cfg.id_rol
         INNER JOIN roles r_cfg
           ON r_cfg.id_rol = rp_cfg.id_rol
          AND r_cfg.estado = 1
         WHERE rp_cfg.id_subelemento_accion = psa.id_subelemento_accion
       ) AS rol_configurado
     FROM perm_subelemento_acciones psa
     WHERE psa.codigo_permiso IN (${placeholders_cor(codes)})
       AND psa.activo = 1`,
    [userId, userId, userId, userId, userId, ...codes]
  );

  const state = Object.fromEntries(codes.map(code => [code, {
    exists: false,
    configured: false,
    effective: false
  }]));

  rows.forEach(row => {
    const hasCustom = row.personalizado !== null && row.personalizado !== undefined;
    state[row.codigo_permiso] = {
      exists: true,
      configured: hasCustom || Number(row.rol_configurado) === 1,
      effective: hasCustom
        ? Number(row.personalizado) === 1
        : Number(row.heredado) === 1
    };
  });

  const accessState = state[ACCESS_PERMISSION_CODE_COR];
  const fallbackAccess = Boolean(accessState && accessState.exists && accessState.effective);

  return Object.fromEntries(codes.map(code => {
    const permission = state[code];
    if (!permission || !permission.exists) return [code, false];
    if (code === ACCESS_PERMISSION_CODE_COR) return [code, permission.effective];

    // Transicion segura: mientras el permiso granular no tenga una
    // configuracion expresa por rol o usuario, conserva el acceso vigente
    // del modulo. Una configuracion explicita (permitido=0/1) siempre gana.
    return [code, permission.configured ? permission.effective : fallbackAccess];
  }));
}

async function getUserSupervisorProfile_cor(userId) {
  const [rows] = await db.query(
    `SELECT
       u.id_SB AS id_supervisor,
       u.nombre,
       u.iniciales,
       u.puesto,
       u.area,
       u.estado,
       CASE
         WHEN EXISTS (
           SELECT 1
           FROM usuario_roles ur_scope
           INNER JOIN roles r_scope
             ON r_scope.id_rol = ur_scope.id_rol
            AND r_scope.estado = 1
           WHERE ur_scope.id_usuario = u.id_SB
             AND ur_scope.activo = 1
             AND UPPER(TRIM(COALESCE(r_scope.codigo, ''))) = 'SUPERVISOR_INSTALACIONES'
         )
         OR EXISTS (
           SELECT 1
           FROM roles r_legacy
           WHERE r_legacy.id_rol = u.rol_id
             AND r_legacy.estado = 1
             AND UPPER(TRIM(COALESCE(r_legacy.codigo, ''))) = 'SUPERVISOR_INSTALACIONES'
         )
         THEN 1
         ELSE 0
       END AS es_supervisor_instalaciones
     FROM usuarios u
     WHERE u.id_SB = ?
       AND u.estado = 1
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function listSupervisorOptions_cor() {
  const [rows] = await db.query(
    `SELECT
       COALESCE(u_by_initials.id_SB, u_by_id.id_SB) AS id_supervisor,
       COALESCE(u_by_initials.nombre, u_by_id.nombre, base.supervisor) AS nombre,
       COALESCE(u_by_initials.iniciales, u_by_id.iniciales, base.supervisor) AS iniciales,
       COALESCE(u_by_initials.puesto, u_by_id.puesto) AS puesto,
       base.total_equipos
     FROM (
       SELECT
         raw.supervisor,
         MAX(raw.id_sup) AS id_sup,
         SUM(raw.total_equipos) AS total_equipos
       FROM (
         SELECT
           TRIM(f.supervisor_fl) AS supervisor,
           MAX(f.id_sup) AS id_sup,
           COUNT(*) AS total_equipos
         FROM ins_fl f
         WHERE NULLIF(TRIM(f.supervisor_fl), '') IS NOT NULL
         GROUP BY TRIM(f.supervisor_fl)

         UNION ALL

         SELECT
           'EC' AS supervisor,
           u.id_SB AS id_sup,
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
       ) raw
       GROUP BY raw.supervisor
     ) base
     LEFT JOIN usuarios u_by_id
       ON u_by_id.id_SB = base.id_sup
      AND u_by_id.estado = 1
     LEFT JOIN usuarios u_by_initials
       ON u_by_initials.id_SB = (
         SELECT MIN(u_match.id_SB)
         FROM usuarios u_match
         WHERE u_match.estado = 1
           AND UPPER(TRIM(COALESCE(u_match.iniciales, ''))) = UPPER(base.supervisor)
       )
     WHERE COALESCE(u_by_initials.id_SB, u_by_id.id_SB) IS NOT NULL
       AND COALESCE(u_by_initials.id_SB, u_by_id.id_SB) <> ?
       AND UPPER(TRIM(COALESCE(base.supervisor, ''))) NOT IN (${placeholders_cor(EXCLUDED_SUPERVISOR_INITIALS_COR)})
     ORDER BY
       COALESCE(u_by_initials.iniciales, u_by_id.iniciales, base.supervisor) ASC,
       COALESCE(u_by_initials.nombre, u_by_id.nombre, base.supervisor) ASC`,
    [EXCLUDED_SUPERVISOR_USER_ID_COR, ...EXCLUDED_SUPERVISOR_INITIALS_COR]
  );

  return rows.map(row => ({
    ...row,
    total_equipos: Number(row.total_equipos || 0)
  }));
}

async function countRows_cor(supervisor, filters) {
  const data = dataset_cor(supervisor, filters);
  const documentationWhere = outerDocumentationFilter_cor(filters);
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM (${data.sql}) d
     ${documentationWhere}`,
    data.params
  );
  return Number(rows[0]?.total || 0);
}

async function listRows_cor(supervisor, filters, limit, offset) {
  const data = dataset_cor(supervisor, filters);
  const documentationWhere = outerDocumentationFilter_cor(filters);
  const [rows] = await db.query(
    `SELECT d.*
     FROM (${data.sql}) d
     ${documentationWhere}
     ORDER BY
       COALESCE(d.estatus, '') ASC,
       COALESCE(d.estado, '') ASC,
       COALESCE(d.proyecto, '') ASC,
       COALESCE(d.referencia_sitio, '') ASC,
       d.id_ins_fl ASC
     LIMIT ? OFFSET ?`,
    [...data.params, limit, offset]
  );
  return rows;
}

async function getSupervisorSummary_cor(supervisor) {
  const data = dataset_cor(supervisor, {});
  const [rows] = await db.query(
    `SELECT
       COUNT(*) AS total_equipos,
       COALESCE(SUM(d.documentos_requeridos), 0) AS documentos_requeridos,
       COALESCE(SUM(d.documentos_generados_progreso), 0) AS documentos_generados,
       COALESCE(SUM(d.documentos_pendientes), 0) AS documentos_pendientes,
       COALESCE(SUM(CASE WHEN d.documentacion_completa = 1 THEN 1 ELSE 0 END), 0) AS equipos_completos,
       COALESCE(SUM(CASE WHEN d.documentacion_completa = 0 THEN 1 ELSE 0 END), 0) AS equipos_con_pendientes,
       CASE
         WHEN COALESCE(SUM(d.documentos_requeridos), 0) > 0
         THEN ROUND(
           (COALESCE(SUM(d.documentos_generados_progreso), 0) /
            COALESCE(SUM(d.documentos_requeridos), 0)) * 100,
           1
         )
         ELSE 0
       END AS cumplimiento_porcentaje
     FROM (${data.sql}) d`,
    data.params
  );
  return rows[0] || {};
}

async function getProgressByStatus_cor(supervisor) {
  const data = dataset_cor(supervisor, {});
  const [rows] = await db.query(
    `SELECT
       d.estatus,
       COUNT(*) AS total_equipos,
       COALESCE(SUM(d.documentos_requeridos), 0) AS documentos_requeridos,
       COALESCE(SUM(d.documentos_generados_progreso), 0) AS documentos_generados,
       COALESCE(SUM(d.documentos_pendientes), 0) AS documentos_pendientes,
       CASE
         WHEN COALESCE(SUM(d.documentos_requeridos), 0) > 0
         THEN ROUND(
           (COALESCE(SUM(d.documentos_generados_progreso), 0) /
            COALESCE(SUM(d.documentos_requeridos), 0)) * 100,
           1
         )
         ELSE 0
       END AS cumplimiento_porcentaje
     FROM (${data.sql}) d
     GROUP BY d.estatus
     ORDER BY FIELD(d.estatus, '04-M', '05-PA', '06-A', '07-PE')`,
    data.params
  );
  return rows;
}

async function getFilterOptions_cor(supervisor) {
  const where = [];
  const params = [];
  appendSupervisorScope_cor(where, params, supervisor, 'f');
  appendStatusScope_cor(where, params, 'f');
  const whereSql = where.join(' AND ');

  const [stateRows] = await db.query(
    `SELECT DISTINCT TRIM(f.estado) AS valor
     FROM ins_fl f
     WHERE ${whereSql}
       AND NULLIF(TRIM(f.estado), '') IS NOT NULL
     ORDER BY valor ASC`,
    params
  );

  return {
    estados: stateRows.map(row => row.valor),
    estatus: [...ESTATUS_DOCUMENTACION_COR],
    documentacion: ['TODOS', 'PENDIENTE', 'COMPLETA']
  };
}

module.exports = {
  ESTATUS_DOCUMENTACION_COR,
  getEffectivePermissionsBulk_cor,
  getUserSupervisorProfile_cor,
  listSupervisorOptions_cor,
  countRows_cor,
  listRows_cor,
  getSupervisorSummary_cor,
  getProgressByStatus_cor,
  getFilterOptions_cor
};
