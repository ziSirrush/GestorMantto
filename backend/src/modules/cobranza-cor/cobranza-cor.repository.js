'use strict';

const db = require('../../config/db');

const TABLES_COR = Object.freeze({
  indice: 'cobranza_indice_cor',
  fuente: 'cobranza_fuente_cor',
  aditivas: 'cobranza_aditivas_cor'
});

async function getConnection_cor() {
  return db.getConnection();
}

async function insertRecord_cor(connection, tableName, record) {
  if (!Object.values(TABLES_COR).includes(tableName)) {
    throw new Error(`Tabla Cobranza COR no autorizada: ${tableName}`);
  }

  const columns = Object.keys(record);
  if (!columns.length) throw new Error('No hay columnas para insertar.');

  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map((column) => record[column]);

  const [result] = await connection.query(
    `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`,
    values
  );

  return result;
}

async function resolveIndiceFuente_cor(connection, proyecto, anioProyecto) {
  const params = [proyecto];
  let yearSql = '';

  if (Number.isInteger(anioProyecto)) {
    yearSql = ' AND anio = ?';
    params.push(anioProyecto);
  }

  const [rows] = await connection.query(
    `SELECT id_indice_cor
       FROM ${TABLES_COR.indice}
      WHERE activo = 1
        AND UPPER(TRIM(proyecto)) = UPPER(TRIM(?))
        ${yearSql}
      ORDER BY id_indice_cor ASC
      LIMIT 2`,
    params
  );

  return {
    id_indice_cor: rows.length === 1 ? Number(rows[0].id_indice_cor) : null,
    matches: rows.length
  };
}

async function resolveIndiceAditiva_cor(connection, proyecto, ppNs) {
  const clauses = ['activo = 1'];
  const params = [];

  if (proyecto) {
    clauses.push('UPPER(TRIM(proyecto)) = UPPER(TRIM(?))');
    params.push(proyecto);
  }

  if (ppNs) {
    clauses.push('UPPER(TRIM(pp)) = UPPER(TRIM(?))');
    params.push(ppNs);
  }

  if (clauses.length === 1) {
    return { id_indice_cor: null, matches: 0 };
  }

  const [rows] = await connection.query(
    `SELECT id_indice_cor
       FROM ${TABLES_COR.indice}
      WHERE ${clauses.join(' AND ')}
      ORDER BY id_indice_cor ASC
      LIMIT 2`,
    params
  );

  return {
    id_indice_cor: rows.length === 1 ? Number(rows[0].id_indice_cor) : null,
    matches: rows.length
  };
}

function userIdSql_cor(expression) {
  return `CAST(NULLIF(TRIM(${expression}), '') AS UNSIGNED)`;
}

function buildIndiceScope_cor(alias, visibleUserIds) {
  if (visibleUserIds === null) {
    return { sql: '', params: [] };
  }

  const ids = [...new Set((Array.isArray(visibleUserIds) ? visibleUserIds : [])
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0))];

  if (!ids.length) {
    return { sql: ' AND 1 = 0', params: [] };
  }

  const placeholders = ids.map(() => '?').join(', ');
  const params = [...ids];

  return {
    sql: `
      AND EXISTS (
        SELECT 1
          FROM usuarios u_scope
         WHERE u_scope.estado = 1
           AND u_scope.id_SB IN (${placeholders})
           AND (
             ${userIdSql_cor(`${alias}.adm`)} = u_scope.id_SB
             OR ${userIdSql_cor(`${alias}.sup`)} = u_scope.id_SB
             OR ${userIdSql_cor(`${alias}.vend`)} = u_scope.id_SB
           )
      )`,
    params
  };
}

function buildAditivaScope_cor(alias, visibleUserIds) {
  if (visibleUserIds === null) {
    return { sql: '', params: [] };
  }

  const indiceScope = buildIndiceScope_cor('i_scope', visibleUserIds);

  return {
    sql: `
      AND EXISTS (
        SELECT 1
          FROM ${TABLES_COR.indice} i_scope
         WHERE i_scope.id_indice_cor = ${alias}.id_indice_cor
           AND i_scope.activo = 1
           ${indiceScope.sql}
      )`,
    params: indiceScope.params
  };
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
       a.id_indice_cor,
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
       i.proyecto AS indice_proyecto,
       i.pp AS indice_pp,
       i.anio AS indice_anio`;
}

async function listAditivas_cor(connection, filters = {}, visibleUserIds = null) {
  const where = buildAditivasWhere_cor(filters, visibleUserIds);
  const [rows] = await connection.query(
    `SELECT${aditivaSelectSql_cor()}
       FROM ${TABLES_COR.aditivas} a
       LEFT JOIN ${TABLES_COR.indice} i
         ON i.id_indice_cor = a.id_indice_cor
        AND i.activo = 1
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
       LEFT JOIN ${TABLES_COR.indice} i
         ON i.id_indice_cor = a.id_indice_cor
        AND i.activo = 1
      WHERE a.id_aditiva_cor = ?
        AND a.activo = 1
        ${scope.sql}
      LIMIT 1`,
    params
  );

  return rows[0] || null;
}

function usableProjectKeySql_cor(expression) {
  return `NULLIF(TRIM(COALESCE(${expression}, '')), '') IS NOT NULL
          AND UPPER(TRIM(COALESCE(${expression}, ''))) NOT IN ('-', 'N/A', 'NA', 'N.A.', 'S/P', 'S/PP', 'SIN PP')`;
}

// Normaliza diferencias de captura solo para el DETALLE del Estado de Cuenta.
// El listado MAIN no usa esta resolucion por PP/nombre.
function normalizedProjectSql_cor(expression) {
  const base = `REGEXP_REPLACE(
            UPPER(
              TRIM(
                REPLACE(
                  REPLACE(
                    REPLACE(
                      REPLACE(COALESCE(${expression}, ''), CONVERT(0xC2A0 USING utf8mb4), ' '),
                      CONVERT(0x09 USING utf8mb4), ' '
                    ),
                    CONVERT(0x0D USING utf8mb4), ' '
                  ),
                  CONVERT(0x0A USING utf8mb4), ' '
                )
              )
            ),
            '[^[:alnum:]]+',
            ' '
          )`;

  return `TRIM(
            REGEXP_REPLACE(
              REGEXP_REPLACE(${base}, '^WALMART[[:space:]]+', 'WM '),
              '^WM[[:space:]]+SC[[:space:]]+',
              'WM '
            )
          ) COLLATE utf8mb4_unicode_ci`;
}

// REGLA EXCLUSIVA DEL DETALLE:
// una fila de FUENTE pertenece al proyecto seleccionado por FK, nombre normalizado
// o PP/ID Proyecto cuando ese PP es seguro/desambiguado.
function fuenteMatchesIndiceSql_cor(fuenteAlias, indiceAlias) {
  const f = fuenteAlias;
  const i = indiceAlias;
  const normalizedFuente = normalizedProjectSql_cor(`${f}.proyecto`);
  const normalizedIndice = normalizedProjectSql_cor(`${i}.proyecto`);
  const ppMatch = `(
          ${usableProjectKeySql_cor(`${i}.pp`)}
          AND ${usableProjectKeySql_cor(`${f}.id_proyecto_origen`)}
          AND UPPER(TRIM(${f}.id_proyecto_origen)) = UPPER(TRIM(${i}.pp))
        )`;
  const uniquePpMatch = `(
          SELECT COUNT(DISTINCT i_pp.id_indice_cor)
            FROM ${TABLES_COR.indice} i_pp
           WHERE i_pp.activo = 1
             AND ${usableProjectKeySql_cor('i_pp.pp')}
             AND UPPER(TRIM(i_pp.pp)) = UPPER(TRIM(${f}.id_proyecto_origen))
        ) = 1`;
  const projectMatch = `(
          NULLIF(${normalizedFuente}, '') IS NOT NULL
          AND NULLIF(${normalizedIndice}, '') IS NOT NULL
          AND ${normalizedFuente} = ${normalizedIndice}
        )`;
  const ppNameDisambiguation = `(
          NULLIF(${normalizedFuente}, '') IS NOT NULL
          AND NULLIF(${normalizedIndice}, '') IS NOT NULL
          AND SOUNDEX(${normalizedFuente}) = SOUNDEX(${normalizedIndice})
        )`;

  return `(
        ${f}.id_indice_cor = ${i}.id_indice_cor
        OR ${projectMatch}
        OR (
          ${ppMatch}
          AND (
            ${uniquePpMatch}
            OR ${ppNameDisambiguation}
          )
        )
      )`;
}

async function listEstadosCuenta_cor(connection, filters = {}, visibleUserIds = null) {
  const scope = buildIndiceScope_cor('i', visibleUserIds);
  const clauses = ['i.activo = 1'];
  const params = [];

  if (filters.buscar) {
    clauses.push(`(
      UPPER(TRIM(i.proyecto)) LIKE UPPER(?)
      OR UPPER(TRIM(COALESCE(i.pp, ''))) LIKE UPPER(?)
    )`);
    const pattern = `%${filters.buscar}%`;
    params.push(pattern, pattern);
  }

  if (Number.isInteger(filters.anio)) {
    clauses.push('i.anio = ?');
    params.push(filters.anio);
  }

  if (filters.estatus) {
    clauses.push('UPPER(TRIM(COALESCE(i.estatus, \'\'))) = UPPER(TRIM(?))');
    params.push(filters.estatus);
  }

  // MAIN: no intenta resolver FUENTE por PP ni por nombre.
  // El filtro solo reconoce movimientos que ya tienen la FK directa id_indice_cor.
  if (filters.soloConFuente === true) {
    clauses.push(`EXISTS (
      SELECT 1
        FROM ${TABLES_COR.fuente} f_filter
       WHERE f_filter.activo = 1
         AND f_filter.id_indice_cor = i.id_indice_cor
    )`);
  }

  params.push(...scope.params);

  const [rows] = await connection.query(
    `SELECT
       i.id_indice_cor,
       i.proyecto,
       i.qty,
       i.anio,
       i.pp,
       i.mrc,
       i.adm,
       i.sup,
       i.vend,
       u_adm.id_SB AS adm_usuario_id,
       u_adm.nombre AS adm_usuario_nombre,
       u_adm.iniciales AS adm_usuario_iniciales,
       u_sup.id_SB AS sup_usuario_id,
       u_sup.nombre AS sup_usuario_nombre,
       u_sup.iniciales AS sup_usuario_iniciales,
       u_vend.id_SB AS vend_usuario_id,
       u_vend.nombre AS vend_usuario_nombre,
       u_vend.iniciales AS vend_usuario_iniciales,
       i.edo,
       i.estatus,
       i.cobranza_usd,
       i.cobranza_mxn,
       i.fianzas,
       i.tipo_fianza,
       i.repse_siroc,
       (
         SELECT COUNT(DISTINCT f_count.id_fuente_cor)
           FROM ${TABLES_COR.fuente} f_count
          WHERE f_count.activo = 1
            AND f_count.id_indice_cor = i.id_indice_cor
       ) AS registros_estado_cuenta,
       (
         SELECT GROUP_CONCAT(
                  DISTINCT NULLIF(UPPER(TRIM(f_currency.moneda)), '')
                  ORDER BY UPPER(TRIM(f_currency.moneda))
                  SEPARATOR ','
                )
           FROM ${TABLES_COR.fuente} f_currency
          WHERE f_currency.activo = 1
            AND f_currency.id_indice_cor = i.id_indice_cor
       ) AS monedas
     FROM ${TABLES_COR.indice} i
     LEFT JOIN usuarios u_adm
       ON u_adm.id_SB = ${userIdSql_cor('i.adm')}
     LEFT JOIN usuarios u_sup
       ON u_sup.id_SB = ${userIdSql_cor('i.sup')}
     LEFT JOIN usuarios u_vend
       ON u_vend.id_SB = ${userIdSql_cor('i.vend')}
     WHERE ${clauses.join('\n       AND ')}
       ${scope.sql}
     ORDER BY i.proyecto ASC, i.id_indice_cor ASC`,
    params
  );

  return rows;
}

async function getIndiceEstadoCuenta_cor(connection, idIndiceCor, visibleUserIds = null) {
  const scope = buildIndiceScope_cor('i', visibleUserIds);
  const params = [idIndiceCor, ...scope.params];

  const [rows] = await connection.query(
    `SELECT
       i.id_indice_cor,
       i.proyecto,
       i.qty,
       i.anio,
       i.pp,
       i.mrc,
       i.adm,
       i.sup,
       i.vend,
       u_adm.id_SB AS adm_usuario_id,
       u_adm.nombre AS adm_usuario_nombre,
       u_adm.iniciales AS adm_usuario_iniciales,
       u_sup.id_SB AS sup_usuario_id,
       u_sup.nombre AS sup_usuario_nombre,
       u_sup.iniciales AS sup_usuario_iniciales,
       u_vend.id_SB AS vend_usuario_id,
       u_vend.nombre AS vend_usuario_nombre,
       u_vend.iniciales AS vend_usuario_iniciales,
       i.edo,
       i.estatus,
       i.cobranza_usd,
       i.cobranza_mxn,
       i.fianzas,
       i.tipo_fianza,
       i.repse_siroc
     FROM ${TABLES_COR.indice} i
     LEFT JOIN usuarios u_adm
       ON u_adm.id_SB = ${userIdSql_cor('i.adm')}
     LEFT JOIN usuarios u_sup
       ON u_sup.id_SB = ${userIdSql_cor('i.sup')}
     LEFT JOIN usuarios u_vend
       ON u_vend.id_SB = ${userIdSql_cor('i.vend')}
     WHERE i.id_indice_cor = ?
       AND i.activo = 1
       ${scope.sql}
     LIMIT 1`,
    params
  );

  return rows[0] || null;
}

async function listFuenteEstadoCuenta_cor(connection, idIndiceCor) {
  const [rows] = await connection.query(
    `SELECT DISTINCT
       f.id_fuente_cor,
       f.id_indice_cor,
       f.proyecto,
       f.id_proyecto_origen,
       f.porcentaje,
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
       f.anio_proyecto
     FROM ${TABLES_COR.fuente} f
     INNER JOIN ${TABLES_COR.indice} i
       ON i.id_indice_cor = ?
      AND i.activo = 1
     WHERE f.activo = 1
       AND ${fuenteMatchesIndiceSql_cor('f', 'i')}
     ORDER BY f.id_fuente_cor ASC`,
    [idIndiceCor]
  );

  return rows;
}

module.exports = {
  TABLES_COR,
  getConnection_cor,
  insertRecord_cor,
  resolveIndiceFuente_cor,
  resolveIndiceAditiva_cor,
  listEstadosCuenta_cor,
  getIndiceEstadoCuenta_cor,
  listFuenteEstadoCuenta_cor,
  listAditivas_cor,
  getAditiva_cor
};
