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

module.exports = {
  TABLES_COR,
  getConnection_cor,
  insertRecord_cor,
  resolveIndiceFuente_cor,
  resolveIndiceAditiva_cor
};
