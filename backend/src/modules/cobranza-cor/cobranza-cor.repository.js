'use strict';

const db = require('../../config/db');

const TABLES_COR = Object.freeze({
  fuente: 'cobranza_fuente_cor',
  aditivas: 'cobranza_aditivas_cor',
  equipos: 'cobranza_equipos_cor'
});

const FUENTE_MUTABLE_COLUMNS_COR = Object.freeze([
  'proyecto',
  'cliente',
  'contractual',
  'porcentaje',
  'fondo_garantia',
  'porcentaje_fondo_garantia',
  'condicion',
  'moneda',
  'subtotal',
  'iva',
  'total',
  'factura',
  'pago_total',
  'estatus_factura',
  'fecha_pago',
  'fecha_vencimiento',
  'dias_vencimiento',
  'estimado_pago',
  'estatus_vencimiento',
  'orden_hito',
  'fecha_programada',
  'fecha_notificada',
  'estatus_hito',
  'anio_proyecto',
  'activo'
]);

const EQUIPO_MUTABLE_COLUMNS_COR = Object.freeze([
  'id_ins_fl',
  'id_log_ops',
  'orden',
  'ubicacion_torre',
  'activo',
  'updated_by'
]);

const ADITIVA_MUTABLE_COLUMNS_COR = Object.freeze([
  'anio_cot',
  'departamento',
  'categoria',
  'fecha_cot',
  'firma_cot',
  'no_cot',
  'ov',
  'factura',
  'estatus_trabajos',
  'estatus_cobranza',
  'sup',
  'pp_ns',
  'proyecto',
  'equipo',
  'descripcion',
  'comentario_fuente',
  'monto_subtotal',
  'iva_pct',
  'monto_iva',
  'monto_total',
  'gasto_subtotal',
  'oc',
  'diferencia',
  'utilidad_real_pct',
  'monto_pagado',
  'pagado_sin_iva',
  'pendiente_pago',
  'fecha_pago',
  'semana_pago',
  'moneda',
  'gasto_ejercido'
]);

async function getConnection_cor() {
  return db.getConnection();
}

async function insertRecord_cor(connection, tableName, record) {
  if (!Object.values(TABLES_COR).includes(tableName)) {
    throw new Error(`Tabla Cobranza COR no autorizada: ${tableName}`);
  }

  const columns = Object.keys(record || {});
  if (!columns.length) throw new Error('No hay columnas para insertar.');

  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map((column) => record[column]);
  const [result] = await connection.query(
    `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`,
    values
  );
  return result;
}

async function updateAditiva_cor(connection, idAditivaCor, record) {
  const assignments = ADITIVA_MUTABLE_COLUMNS_COR.map((column) => `${column} = ?`);
  const values = ADITIVA_MUTABLE_COLUMNS_COR.map((column) =>
    Object.prototype.hasOwnProperty.call(record || {}, column) ? record[column] : null
  );
  values.push(idAditivaCor);

  const [result] = await connection.query(
    `UPDATE ${TABLES_COR.aditivas}
        SET ${assignments.join(', ')}
      WHERE id_aditiva_cor = ?
        AND activo = 1`,
    values
  );
  return result;
}

function normalizedKeySql_cor(expression) {
  return `UPPER(TRIM(COALESCE(${expression}, '')))`;
}

function usablePpnsSql_cor(expression) {
  return `NULLIF(TRIM(COALESCE(${expression}, '')), '') IS NOT NULL
          AND ${normalizedKeySql_cor(expression)} NOT IN ('-', 'N/A', 'NA', 'N.A.', 'S/P', 'S/PP', 'SIN PP', 'SIN PPNS')`;
}

function normalizeVisibleUserIds_cor(visibleUserIds) {
  return [...new Set((Array.isArray(visibleUserIds) ? visibleUserIds : [])
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0))]
    .sort((a, b) => a - b);
}

// CORELLIAN fail-closed:
// - Full domain: no record filter.
// - Limited domain: PPNS must resolve to ins_fl and its SUP or ASESOR must be
//   part of the centrally-resolved visible user set. REL_ADMIN is already
//   converted to visible advisor IDs by alcance-cor.service.js; it is NOT
//   re-inferred here so a relationship cannot bypass the central scope engine.
function buildPpnsScope_cor(ppnsExpression, visibleUserIds) {
  if (visibleUserIds === null) return { sql: '', params: [] };

  const ids = normalizeVisibleUserIds_cor(visibleUserIds);
  if (!ids.length) return { sql: ' AND 1 = 0', params: [] };

  const placeholders = ids.map(() => '?').join(', ');
  return {
    sql: `
      AND EXISTS (
        SELECT 1
          FROM ins_fl fl_scope
         WHERE fl_scope.activo = 1
           AND ${normalizedKeySql_cor('fl_scope.id_proyecto')} = ${normalizedKeySql_cor(ppnsExpression)}
           AND (
             fl_scope.id_sup IN (${placeholders})
             OR fl_scope.id_asesor IN (${placeholders})
           )
      )`,
    params: [...ids, ...ids]
  };
}

async function canAccessPpns_cor(connection, ppns, visibleUserIds = null) {
  if (visibleUserIds === null) return true;
  const ids = normalizeVisibleUserIds_cor(visibleUserIds);
  if (!ids.length) return false;
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT 1 AS ok
       FROM ins_fl fl_check
      WHERE fl_check.activo = 1
        AND ${normalizedKeySql_cor('fl_check.id_proyecto')} = ${normalizedKeySql_cor('?')}
        AND (
          fl_check.id_sup IN (${placeholders})
          OR fl_check.id_asesor IN (${placeholders})
        )
      LIMIT 1`,
    [ppns, ...ids, ...ids]
  );
  return rows.length > 0;
}

function buildEstadosCuentaBaseSql_cor() {
  return `
    SELECT
      ${normalizedKeySql_cor('f.id_proyecto_origen')} AS ppns_key,
      MAX(NULLIF(TRIM(f.id_proyecto_origen), '')) AS ppns,
      GROUP_CONCAT(
        DISTINCT NULLIF(TRIM(f.proyecto), '')
        ORDER BY NULLIF(TRIM(f.proyecto), '')
        SEPARATOR ' - '
      ) AS proyecto,
      GROUP_CONCAT(
        DISTINCT NULLIF(TRIM(f.cliente), '')
        ORDER BY NULLIF(TRIM(f.cliente), '')
        SEPARATOR ' - '
      ) AS cliente,
      SUM(
        CASE
          WHEN NULLIF(TRIM(f.moneda), '') IS NOT NULL
           AND UPPER(TRIM(f.moneda)) <> 'MXN'
          THEN 1 ELSE 0
        END
      ) AS hitos_suministro,
      SUM(
        CASE WHEN UPPER(TRIM(COALESCE(f.moneda, ''))) = 'MXN' THEN 1 ELSE 0 END
      ) AS hitos_mxn,
      COUNT(DISTINCT f.id_fuente_cor) AS registros_estado_cuenta,
      GROUP_CONCAT(
        DISTINCT NULLIF(UPPER(TRIM(f.moneda)), '')
        ORDER BY NULLIF(UPPER(TRIM(f.moneda)), '')
        SEPARATOR '-'
      ) AS monedas,
      GROUP_CONCAT(
        DISTINCT NULLIF(TRIM(f.contractual), '')
        ORDER BY NULLIF(TRIM(f.contractual), '')
        SEPARATOR ' - '
      ) AS contractual,
      GROUP_CONCAT(
        DISTINCT CAST(f.anio_proyecto AS CHAR)
        ORDER BY f.anio_proyecto DESC
        SEPARATOR '-'
      ) AS anios
    FROM ${TABLES_COR.fuente} f
    WHERE f.activo = 1
      AND ${usablePpnsSql_cor('f.id_proyecto_origen')}
    GROUP BY ${normalizedKeySql_cor('f.id_proyecto_origen')}`;
}

function mainSelectSql_cor() {
  return `
    base.ppns,
    base.proyecto,
    base.cliente,
    (
      SELECT GROUP_CONCAT(
               DISTINCT NULLIF(TRIM(u_sup.iniciales), '')
               ORDER BY NULLIF(TRIM(u_sup.iniciales), '')
               SEPARATOR '-'
             )
        FROM ins_fl fl_sup
        INNER JOIN usuarios u_sup
          ON u_sup.id_SB = fl_sup.id_sup
         AND u_sup.estado = 1
       WHERE fl_sup.activo = 1
         AND ${normalizedKeySql_cor('fl_sup.id_proyecto')} = base.ppns_key
    ) AS supervisor_iniciales,
    (
      SELECT GROUP_CONCAT(
               DISTINCT NULLIF(TRIM(u_asesor.iniciales), '')
               ORDER BY NULLIF(TRIM(u_asesor.iniciales), '')
               SEPARATOR '-'
             )
        FROM ins_fl fl_asesor
        INNER JOIN usuarios u_asesor
          ON u_asesor.id_SB = fl_asesor.id_asesor
         AND u_asesor.estado = 1
       WHERE fl_asesor.activo = 1
         AND ${normalizedKeySql_cor('fl_asesor.id_proyecto')} = base.ppns_key
    ) AS asesor_iniciales,
    (
      SELECT GROUP_CONCAT(
               DISTINCT NULLIF(TRIM(u_admin.iniciales), '')
               ORDER BY NULLIF(TRIM(u_admin.iniciales), '')
               SEPARATOR '-'
             )
        FROM ins_fl fl_admin
        INNER JOIN usuarios_rel_admin ura
          ON ura.id_asesor = fl_admin.id_asesor
        INNER JOIN usuarios u_admin
          ON u_admin.id_SB = ura.id_admin
         AND u_admin.estado = 1
       WHERE fl_admin.activo = 1
         AND ${normalizedKeySql_cor('fl_admin.id_proyecto')} = base.ppns_key
    ) AS administrativo_iniciales,
    base.hitos_suministro,
    base.hitos_mxn,
    (
      SELECT COUNT(DISTINCT a_count.id_aditiva_cor)
        FROM ${TABLES_COR.aditivas} a_count
       WHERE a_count.activo = 1
         AND ${usablePpnsSql_cor('a_count.pp_ns')}
         AND ${normalizedKeySql_cor('a_count.pp_ns')} = base.ppns_key
    ) AS aditivas,
    base.monedas,
    base.registros_estado_cuenta,
    base.contractual,
    base.anios`;
}

function buildEstadosCuentaWhere_cor(filters = {}, visibleUserIds = null, { exactPpns = null } = {}) {
  const clauses = ['1 = 1'];
  const params = [];

  if (exactPpns) {
    clauses.push('base.ppns_key = ' + normalizedKeySql_cor('?'));
    params.push(exactPpns);
  }

  if (filters.buscar) {
    clauses.push(`(
      UPPER(TRIM(COALESCE(base.ppns, ''))) LIKE UPPER(?)
      OR UPPER(TRIM(COALESCE(base.proyecto, ''))) LIKE UPPER(?)
      OR UPPER(TRIM(COALESCE(base.cliente, ''))) LIKE UPPER(?)
    )`);
    const pattern = `%${filters.buscar}%`;
    params.push(pattern, pattern, pattern);
  }

  if (Number.isInteger(filters.anio)) {
    clauses.push(`EXISTS (
      SELECT 1
        FROM ${TABLES_COR.fuente} f_year
       WHERE f_year.activo = 1
         AND ${normalizedKeySql_cor('f_year.id_proyecto_origen')} = base.ppns_key
         AND f_year.anio_proyecto = ?
    )`);
    params.push(filters.anio);
  }

  if (filters.contractual) {
    clauses.push(`UPPER(TRIM(COALESCE(base.contractual, ''))) LIKE UPPER(?)`);
    params.push(`%${filters.contractual}%`);
  }

  const scope = buildPpnsScope_cor('base.ppns', visibleUserIds);
  params.push(...scope.params);

  return {
    sql: `${clauses.join('\n       AND ')}${scope.sql}`,
    params
  };
}

async function listEstadosCuenta_cor(connection, filters = {}, visibleUserIds = null) {
  const where = buildEstadosCuentaWhere_cor(filters, visibleUserIds);
  const [rows] = await connection.query(
    `SELECT ${mainSelectSql_cor()}
       FROM (${buildEstadosCuentaBaseSql_cor()}) base
      WHERE ${where.sql}
      ORDER BY base.proyecto ASC, base.ppns ASC`,
    where.params
  );
  return rows;
}

async function getEstadoCuentaByPpns_cor(connection, ppns, visibleUserIds = null) {
  const where = buildEstadosCuentaWhere_cor({}, visibleUserIds, { exactPpns: ppns });
  const [rows] = await connection.query(
    `SELECT ${mainSelectSql_cor()}
       FROM (${buildEstadosCuentaBaseSql_cor()}) base
      WHERE ${where.sql}
      LIMIT 1`,
    where.params
  );
  return rows[0] || null;
}

async function listFuenteEstadoCuenta_cor(connection, ppns) {
  const [rows] = await connection.query(
    `SELECT
       f.id_fuente_cor,
       f.proyecto,
       f.id_proyecto_origen,
       f.cliente,
       f.contractual,
       f.porcentaje,
       f.fondo_garantia,
       f.porcentaje_fondo_garantia,
       f.condicion,
       f.moneda,
       f.subtotal,
       f.iva,
       f.total,
       f.factura,
       f.pago_total,
       f.estatus_factura,
       DATE_FORMAT(f.fecha_pago, '%Y-%m-%d') AS fecha_pago,
       DATE_FORMAT(f.fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
       f.dias_vencimiento,
       f.estimado_pago,
       f.estatus_vencimiento,
       f.orden_hito,
       DATE_FORMAT(f.fecha_programada, '%Y-%m-%d') AS fecha_programada,
       DATE_FORMAT(f.fecha_notificada, '%Y-%m-%d') AS fecha_notificada,
       f.estatus_hito,
       f.anio_proyecto
     FROM ${TABLES_COR.fuente} f
     WHERE f.activo = 1
       AND ${usablePpnsSql_cor('f.id_proyecto_origen')}
       AND ${normalizedKeySql_cor('f.id_proyecto_origen')} = ${normalizedKeySql_cor('?')}
     ORDER BY COALESCE(f.orden_hito, 2147483647) ASC, f.id_fuente_cor ASC`,
    [ppns]
  );
  return rows;
}

async function listCrearEstadoCuentaProyectos_cor(connection, visibleUserIds = null, exactPpns = null) {
  const scope = buildPpnsScope_cor('fl.id_proyecto', visibleUserIds);
  const clauses = [
    'fl.activo = 1',
    usablePpnsSql_cor('fl.id_proyecto'),
    `NOT EXISTS (
       SELECT 1
         FROM ${TABLES_COR.fuente} f_existing
        WHERE f_existing.activo = 1
          AND ${normalizedKeySql_cor('f_existing.id_proyecto_origen')} = ${normalizedKeySql_cor('fl.id_proyecto')}
     )`
  ];
  const params = [];

  if (exactPpns) {
    clauses.push(`${normalizedKeySql_cor('fl.id_proyecto')} = ${normalizedKeySql_cor('?')}`);
    params.push(exactPpns);
  }
  params.push(...scope.params);

  const [rows] = await connection.query(
    `SELECT
       MAX(NULLIF(TRIM(fl.id_proyecto), '')) AS ppns,
       GROUP_CONCAT(DISTINCT NULLIF(TRIM(fl.proyecto), '') ORDER BY NULLIF(TRIM(fl.proyecto), '') SEPARATOR ' - ') AS proyecto,
       GROUP_CONCAT(DISTINCT NULLIF(TRIM(fl.cliente), '') ORDER BY NULLIF(TRIM(fl.cliente), '') SEPARATOR ' - ') AS cliente,
       COUNT(DISTINCT fl.id_ins_fl) AS equipos_total,
       GROUP_CONCAT(DISTINCT NULLIF(TRIM(u_sup.iniciales), '') ORDER BY NULLIF(TRIM(u_sup.iniciales), '') SEPARATOR '-') AS supervisor_iniciales,
       GROUP_CONCAT(DISTINCT NULLIF(TRIM(u_asesor.iniciales), '') ORDER BY NULLIF(TRIM(u_asesor.iniciales), '') SEPARATOR '-') AS asesor_iniciales,
       GROUP_CONCAT(DISTINCT NULLIF(TRIM(u_admin.iniciales), '') ORDER BY NULLIF(TRIM(u_admin.iniciales), '') SEPARATOR '-') AS administrativo_iniciales
     FROM ins_fl fl
     LEFT JOIN usuarios u_sup
       ON u_sup.id_SB = fl.id_sup
      AND u_sup.estado = 1
     LEFT JOIN usuarios u_asesor
       ON u_asesor.id_SB = fl.id_asesor
      AND u_asesor.estado = 1
     LEFT JOIN usuarios_rel_admin ura
       ON ura.id_asesor = fl.id_asesor
     LEFT JOIN usuarios u_admin
       ON u_admin.id_SB = ura.id_admin
      AND u_admin.estado = 1
     WHERE ${clauses.join('\n       AND ')}${scope.sql}
     GROUP BY ${normalizedKeySql_cor('fl.id_proyecto')}
     ORDER BY proyecto ASC, ppns ASC`,
    params
  );
  return rows;
}

async function listCrearEstadoCuentaEquipos_cor(connection, ppns) {
  const [rows] = await connection.query(
    `SELECT
       fl.id_ins_fl,
       fl.id_proyecto AS ppns,
       fl.referencia_sitio,
       fl.capacidad_kg,
       fl.numero_desembarques,
       fl.estatus,
       fl.estatus_produccion,
       fl.estatus_equipo_entrega
     FROM ins_fl fl
     WHERE fl.activo = 1
       AND ${normalizedKeySql_cor('fl.id_proyecto')} = ${normalizedKeySql_cor('?')}
     ORDER BY
       CASE WHEN NULLIF(TRIM(fl.referencia_sitio), '') IS NULL THEN 1 ELSE 0 END,
       fl.referencia_sitio ASC,
       fl.id_ins_fl ASC`,
    [ppns]
  );
  return rows;
}

async function listCrearEstadoCuentaLogOps_cor(connection, ppns) {
  const [rows] = await connection.query(
    `SELECT
       lo.id_log_ops,
       lo.id_ppns AS ppns,
       lo.ph_ns,
       lo.no_control,
       lo.marca,
       lo.estatus,
       lo.cantidad
     FROM log_ops lo
     WHERE ${normalizedKeySql_cor('lo.id_ppns')} = ${normalizedKeySql_cor('?')}
     ORDER BY lo.id_log_ops ASC`,
    [ppns]
  );
  return rows;
}

async function listEquiposEstadoCuenta_cor(connection, ppns, options = {}) {
  const includeInactive = options && options.includeInactive === true;
  const [rows] = await connection.query(
    `SELECT
       ce.id_equipo_cor,
       ce.ppns,
       ce.id_ins_fl,
       ce.id_log_ops,
       ce.orden,
       ce.ubicacion_torre,
       ce.activo,
       ce.created_by,
       ce.updated_by,
       fl.referencia_sitio,
       fl.capacidad_kg,
       fl.numero_desembarques,
       fl.estatus AS ins_fl_estatus,
       fl.estatus_produccion,
       fl.estatus_equipo_entrega,
       lo.ph_ns,
       lo.no_control,
       lo.marca,
       lo.estatus AS log_ops_estatus
     FROM ${TABLES_COR.equipos} ce
     LEFT JOIN ins_fl fl
       ON fl.id_ins_fl = ce.id_ins_fl
     LEFT JOIN log_ops lo
       ON lo.id_log_ops = ce.id_log_ops
     WHERE ${normalizedKeySql_cor('ce.ppns')} = ${normalizedKeySql_cor('?')}
       ${includeInactive ? '' : 'AND ce.activo = 1'}
     ORDER BY COALESCE(ce.orden, 2147483647) ASC, ce.id_equipo_cor ASC`,
    [ppns]
  );
  return rows;
}

async function existeFuentePpns_cor(connection, ppns) {
  const [rows] = await connection.query(
    `SELECT 1 AS existe
       FROM ${TABLES_COR.fuente} f
      WHERE f.activo = 1
        AND ${normalizedKeySql_cor('f.id_proyecto_origen')} = ${normalizedKeySql_cor('?')}
      LIMIT 1`,
    [ppns]
  );
  return rows.length > 0;
}

async function lockCrearEstadoCuentaPpns_cor(connection, ppns) {
  const [rows] = await connection.query(
    `SELECT fl.id_ins_fl
       FROM ins_fl fl
      WHERE fl.activo = 1
        AND ${normalizedKeySql_cor('fl.id_proyecto')} = ${normalizedKeySql_cor('?')}
      ORDER BY fl.id_ins_fl ASC
      FOR UPDATE`,
    [ppns]
  );
  return rows;
}

async function lockFuenteEstadoCuentaPpns_cor(connection, ppns) {
  const [rows] = await connection.query(
    `SELECT f.id_fuente_cor
       FROM ${TABLES_COR.fuente} f
      WHERE f.activo = 1
        AND ${normalizedKeySql_cor('f.id_proyecto_origen')} = ${normalizedKeySql_cor('?')}
      ORDER BY f.id_fuente_cor ASC
      FOR UPDATE`,
    [ppns]
  );
  return rows;
}

async function lockEquiposEstadoCuentaPpns_cor(connection, ppns) {
  const [rows] = await connection.query(
    `SELECT ce.id_equipo_cor
       FROM ${TABLES_COR.equipos} ce
      WHERE ce.activo = 1
        AND ${normalizedKeySql_cor('ce.ppns')} = ${normalizedKeySql_cor('?')}
      ORDER BY ce.id_equipo_cor ASC
      FOR UPDATE`,
    [ppns]
  );
  return rows;
}

async function updateFuenteEstadoCuenta_cor(connection, idFuenteCor, ppns, record) {
  const columns = FUENTE_MUTABLE_COLUMNS_COR.filter((column) =>
    Object.prototype.hasOwnProperty.call(record || {}, column)
  );
  if (!columns.length) return { affectedRows: 0 };
  const assignments = columns.map((column) => `${column} = ?`).join(', ');
  const values = columns.map((column) => record[column]);
  values.push(idFuenteCor, ppns);
  const [result] = await connection.query(
    `UPDATE ${TABLES_COR.fuente}
        SET ${assignments}
      WHERE id_fuente_cor = ?
        AND ${normalizedKeySql_cor('id_proyecto_origen')} = ${normalizedKeySql_cor('?')}`,
    values
  );
  return result;
}

async function updateEquipoEstadoCuenta_cor(connection, idEquipoCor, ppns, record) {
  const columns = EQUIPO_MUTABLE_COLUMNS_COR.filter((column) =>
    Object.prototype.hasOwnProperty.call(record || {}, column)
  );
  if (!columns.length) return { affectedRows: 0 };
  const assignments = columns.map((column) => `${column} = ?`).join(', ');
  const values = columns.map((column) => record[column]);
  values.push(idEquipoCor, ppns);
  const [result] = await connection.query(
    `UPDATE ${TABLES_COR.equipos}
        SET ${assignments}
      WHERE id_equipo_cor = ?
        AND ${normalizedKeySql_cor('ppns')} = ${normalizedKeySql_cor('?')}`,
    values
  );
  return result;
}

function buildAditivaScope_cor(alias, visibleUserIds) {
  return buildPpnsScope_cor(`${alias}.pp_ns`, visibleUserIds);
}

function buildAditivasWhere_cor(filters = {}, visibleUserIds = null) {
  const scope = buildAditivaScope_cor('a', visibleUserIds);
  const clauses = ['a.activo = 1'];
  const params = [];

  if (filters.buscar) {
    clauses.push(`(
      UPPER(TRIM(COALESCE(a.proyecto, ''))) LIKE UPPER(?)
      OR UPPER(TRIM(COALESCE(a.pp_ns, ''))) LIKE UPPER(?)
      OR UPPER(TRIM(COALESCE(a.no_cot, ''))) LIKE UPPER(?)
      OR UPPER(TRIM(COALESCE(a.ov, ''))) LIKE UPPER(?)
      OR UPPER(TRIM(COALESCE(a.factura, ''))) LIKE UPPER(?)
      OR UPPER(TRIM(COALESCE(a.equipo, ''))) LIKE UPPER(?)
      OR UPPER(TRIM(COALESCE(a.descripcion, ''))) LIKE UPPER(?)
    )`);
    const pattern = `%${filters.buscar}%`;
    params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  }

  if (Number.isInteger(filters.anio)) {
    clauses.push('a.anio_cot = ?');
    params.push(filters.anio);
  }

  const exactTextFilters = [
    ['departamento', 'a.departamento'],
    ['categoria', 'a.categoria'],
    ['firmaCot', 'a.firma_cot'],
    ['estatusTrabajos', 'a.estatus_trabajos'],
    ['estatusCobranza', 'a.estatus_cobranza'],
    ['supervisor', 'a.sup'],
    ['moneda', 'a.moneda']
  ];

  exactTextFilters.forEach(([key, column]) => {
    if (!filters[key]) return;
    clauses.push(`UPPER(TRIM(COALESCE(${column}, ''))) = UPPER(TRIM(?))`);
    params.push(filters[key]);
  });

  if (filters.soloPendientes === true) {
    clauses.push('COALESCE(a.pendiente_pago, 0) > 0');
  }

  params.push(...scope.params);
  return {
    sql: `${clauses.join('\n       AND ')}${scope.sql}`,
    params
  };
}

function aditivaSelectSql_cor() {
  return `
       a.id_aditiva_cor,
       a.anio_cot,
       a.departamento,
       a.categoria,
       DATE_FORMAT(a.fecha_cot, '%Y-%m-%d') AS fecha_cot,
       a.firma_cot,
       a.no_cot,
       a.ov,
       a.factura,
       a.estatus_trabajos,
       a.estatus_cobranza,
       a.sup,
       a.pp_ns,
       a.proyecto,
       a.equipo,
       a.descripcion,
       a.comentario_fuente,
       a.monto_subtotal,
       a.iva_pct,
       a.monto_iva,
       a.monto_total,
       a.gasto_subtotal,
       a.oc,
       a.diferencia,
       a.utilidad_real_pct,
       a.monto_pagado,
       a.pagado_sin_iva,
       a.pendiente_pago,
       DATE_FORMAT(a.fecha_pago, '%Y-%m-%d') AS fecha_pago,
       a.semana_pago,
       a.moneda,
       a.gasto_ejercido,
       EXISTS (
         SELECT 1
           FROM ${TABLES_COR.fuente} f_link
          WHERE f_link.activo = 1
            AND ${usablePpnsSql_cor('a.pp_ns')}
            AND ${normalizedKeySql_cor('f_link.id_proyecto_origen')} = ${normalizedKeySql_cor('a.pp_ns')}
       ) AS fuente_ppns_existe,
       (
         SELECT GROUP_CONCAT(
                  DISTINCT NULLIF(TRIM(f_project.proyecto), '')
                  ORDER BY NULLIF(TRIM(f_project.proyecto), '')
                  SEPARATOR ' - '
                )
           FROM ${TABLES_COR.fuente} f_project
          WHERE f_project.activo = 1
            AND ${usablePpnsSql_cor('a.pp_ns')}
            AND ${normalizedKeySql_cor('f_project.id_proyecto_origen')} = ${normalizedKeySql_cor('a.pp_ns')}
       ) AS fuente_proyecto,
       (
         SELECT MAX(f_year.anio_proyecto)
           FROM ${TABLES_COR.fuente} f_year
          WHERE f_year.activo = 1
            AND ${usablePpnsSql_cor('a.pp_ns')}
            AND ${normalizedKeySql_cor('f_year.id_proyecto_origen')} = ${normalizedKeySql_cor('a.pp_ns')}
       ) AS fuente_anio`;
}

async function listAditivas_cor(connection, filters = {}, visibleUserIds = null) {
  const where = buildAditivasWhere_cor(filters, visibleUserIds);
  const [rows] = await connection.query(
    `SELECT${aditivaSelectSql_cor()}
       FROM ${TABLES_COR.aditivas} a
      WHERE ${where.sql}
      ORDER BY
        CASE WHEN a.fecha_cot IS NULL THEN 1 ELSE 0 END ASC,
        a.fecha_cot DESC,
        a.id_aditiva_cor DESC`,
    where.params
  );
  return rows;
}

async function getAditiva_cor(connection, idAditivaCor, visibleUserIds = null) {
  const scope = buildAditivaScope_cor('a', visibleUserIds);
  const params = [idAditivaCor, ...scope.params];
  const [rows] = await connection.query(
    `SELECT${aditivaSelectSql_cor()}
       FROM ${TABLES_COR.aditivas} a
      WHERE a.id_aditiva_cor = ?
        AND a.activo = 1
        ${scope.sql}
      LIMIT 1`,
    params
  );
  return rows[0] || null;
}

module.exports = {
  TABLES_COR,
  getConnection_cor,
  insertRecord_cor,
  updateAditiva_cor,
  canAccessPpns_cor,
  listEstadosCuenta_cor,
  getEstadoCuentaByPpns_cor,
  listFuenteEstadoCuenta_cor,
  listCrearEstadoCuentaProyectos_cor,
  listCrearEstadoCuentaEquipos_cor,
  listCrearEstadoCuentaLogOps_cor,
  listEquiposEstadoCuenta_cor,
  existeFuentePpns_cor,
  lockCrearEstadoCuentaPpns_cor,
  lockFuenteEstadoCuentaPpns_cor,
  lockEquiposEstadoCuentaPpns_cor,
  updateFuenteEstadoCuenta_cor,
  updateEquipoEstadoCuenta_cor,
  listAditivas_cor,
  getAditiva_cor
};
