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
             OR UPPER(TRIM(COALESCE(${alias}.adm, ''))) = UPPER(TRIM(u_scope.iniciales))
             OR TRIM(COALESCE(${alias}.sup, '')) = CAST(u_scope.id_SB AS CHAR)
             OR UPPER(TRIM(COALESCE(${alias}.sup, ''))) = UPPER(TRIM(u_scope.iniciales))
             OR TRIM(COALESCE(${alias}.vend, '')) = CAST(u_scope.id_SB AS CHAR)
             OR UPPER(TRIM(COALESCE(${alias}.vend, ''))) = UPPER(TRIM(u_scope.iniciales))
           )
      )`,
    params
  };
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

  if (filters.soloConFuente === true) {
    clauses.push('COALESCE(fsum.registros_estado_cuenta, 0) > 0');
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
       i.edo,
       i.estatus,
       i.cobranza_usd,
       i.cobranza_mxn,
       i.fianzas,
       i.tipo_fianza,
       i.repse_siroc,
       COALESCE(fsum.registros_estado_cuenta, 0) AS registros_estado_cuenta,
       fsum.monedas
     FROM ${TABLES_COR.indice} i
     LEFT JOIN (
       SELECT
         id_indice_cor,
         COUNT(*) AS registros_estado_cuenta,
         GROUP_CONCAT(
           DISTINCT NULLIF(UPPER(TRIM(moneda)), '')
           ORDER BY UPPER(TRIM(moneda))
           SEPARATOR ','
         ) AS monedas
       FROM ${TABLES_COR.fuente}
       WHERE activo = 1
         AND id_indice_cor IS NOT NULL
       GROUP BY id_indice_cor
     ) fsum ON fsum.id_indice_cor = i.id_indice_cor
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
       i.edo,
       i.estatus,
       i.cobranza_usd,
       i.cobranza_mxn,
       i.fianzas,
       i.tipo_fianza,
       i.repse_siroc
     FROM ${TABLES_COR.indice} i
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
    `SELECT
       id_fuente_cor,
       id_indice_cor,
       proyecto,
       id_proyecto_origen,
       porcentaje,
       condicion,
       moneda,
       subtotal,
       iva,
       total,
       factura,
       pago_total,
       estatus_factura,
       DATE_FORMAT(fecha_pago, '%Y-%m-%d') AS fecha_pago,
       DATE_FORMAT(fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
       dias_vencimiento,
       estimado_pago,
       estatus_vencimiento,
       anio_proyecto
     FROM ${TABLES_COR.fuente}
     WHERE id_indice_cor = ?
       AND activo = 1
     ORDER BY id_fuente_cor ASC`,
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
