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
             TRIM(COALESCE(${alias}.adm, '')) = CAST(u_scope.id_SB AS CHAR)
             OR TRIM(COALESCE(${alias}.sup, '')) = CAST(u_scope.id_SB AS CHAR)
             OR TRIM(COALESCE(${alias}.vend, '')) = CAST(u_scope.id_SB AS CHAR)
           )
      )`,
    params
  };
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
       ON TRIM(COALESCE(i.adm, '')) = CAST(u_adm.id_SB AS CHAR)
     LEFT JOIN usuarios u_sup
       ON TRIM(COALESCE(i.sup, '')) = CAST(u_sup.id_SB AS CHAR)
     LEFT JOIN usuarios u_vend
       ON TRIM(COALESCE(i.vend, '')) = CAST(u_vend.id_SB AS CHAR)
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
       ON TRIM(COALESCE(i.adm, '')) = CAST(u_adm.id_SB AS CHAR)
     LEFT JOIN usuarios u_sup
       ON TRIM(COALESCE(i.sup, '')) = CAST(u_sup.id_SB AS CHAR)
     LEFT JOIN usuarios u_vend
       ON TRIM(COALESCE(i.vend, '')) = CAST(u_vend.id_SB AS CHAR)
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
  listFuenteEstadoCuenta_cor
};
