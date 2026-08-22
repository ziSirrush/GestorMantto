'use strict';

const db = require('../../config/db');

const SOURCE_FIELDS_COR = `
  f.id_ins_fl,
  f.id_proyecto,
  f.proyecto,
  f.referencia_sitio,
  f.estatus,
  f.numero_pisos,
  f.capacidad_kg,
  f.fecha_inicio_ajuste,
  f.fecha_fin_ajuste_planeado,
  f.fecha_fin_ajuste_real,
  f.fecha_protocolo_aceptacion,
  f.fecha_entrega_cliente,
  f.anio_termino,
  f.activo
`;

function deliveredWhere_cor(extraClauses = []) {
  const clauses = ["TRIM(COALESCE(f.estatus, '')) = '08-T'", ...extraClauses];
  return `WHERE ${clauses.join(' AND ')}`;
}

async function listBootstrapSource_cor() {
  const [rows] = await db.query(
    `SELECT ${SOURCE_FIELDS_COR}
       FROM ins_fl f
       ${deliveredWhere_cor()}
       ORDER BY f.id_ins_fl ASC`
  );
  return rows;
}

async function listTypeSource_cor(numeroPisos, capacidadKg) {
  const [rows] = await db.query(
    `SELECT ${SOURCE_FIELDS_COR}
       FROM ins_fl f
       ${deliveredWhere_cor([
         "COALESCE(f.numero_pisos, '') = ?",
         "COALESCE(f.capacidad_kg, '') = ?"
       ])}
       ORDER BY f.id_ins_fl ASC`,
    [numeroPisos, capacidadKg]
  );
  return rows;
}

async function listYearSource_cor(yearFilter, typeFilter) {
  const params = [];
  const extra = [];

  if (yearFilter && yearFilter.sin_anio) {
    extra.push("NULLIF(TRIM(COALESCE(f.anio_termino, '')), '') IS NULL");
  } else if (yearFilter) {
    extra.push("TRIM(COALESCE(f.anio_termino, '')) = ?");
    params.push(yearFilter.valor);
  }

  if (typeFilter) {
    extra.push("COALESCE(f.numero_pisos, '') = ?");
    extra.push("COALESCE(f.capacidad_kg, '') = ?");
    params.push(typeFilter.numeroPisos, typeFilter.capacidadKg);
  }

  const [rows] = await db.query(
    `SELECT ${SOURCE_FIELDS_COR}
       FROM ins_fl f
       ${deliveredWhere_cor(extra)}
       ORDER BY
         COALESCE(f.proyecto, '') ASC,
         COALESCE(f.referencia_sitio, '') ASC,
         f.id_ins_fl ASC`,
    params
  );
  return rows;
}

module.exports = {
  listBootstrapSource_cor,
  listTypeSource_cor,
  listYearSource_cor
};
