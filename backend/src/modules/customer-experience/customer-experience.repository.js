'use strict';

// [Aster | 2026-10-07 | ASTER-MG | FASE 2 CUSTOMER EXPERIENCE ENCUESTAS V001]
// Aiven es la unica fuente operativa. Fase 2 reutiliza las tablas CX creadas
// en Fase 0 y no crea ni altera estructura.

const db = require('../../config/db');

const VI_FILTERS_COR = Object.freeze(['tipo_encuesta', 'vendedor', 'supervisor']);
const MT_FILTERS_COR = Object.freeze([
  'estado',
  'z_general',
  'z_operativa',
  'z_administrativa',
  'superintendente',
  'supervisor_operativo',
  'categoria',
  'prioridad'
]);

function whereExact_cor(filters, allowedFields) {
  const clauses = [];
  const params = [];

  for (const field of allowedFields) {
    const value = filters && filters[field] != null ? String(filters[field]).trim() : '';
    if (!value) continue;
    clauses.push(`TRIM(\`${field}\`) = ?`);
    params.push(value);
  }

  return {
    sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

async function optionsVentaInstalacion_cor() {
  const [rows] = await db.query(
    `SELECT tipo_encuesta, vendedor, supervisor
       FROM cx_venta_instalacion_encuestas`
  );
  return rows;
}

async function optionsMantenimiento_cor() {
  const [rows] = await db.query(
    `SELECT estado,
            z_general,
            z_operativa,
            z_administrativa,
            superintendente,
            supervisor_operativo,
            categoria,
            prioridad
       FROM cx_mantenimiento_encuestas`
  );
  return rows;
}

async function dashboardVentaInstalacion_cor(filters) {
  const where = whereExact_cor(filters, VI_FILTERS_COR);
  const [rows] = await db.query(
    `SELECT tipo_encuesta,
            vendedor,
            supervisor,
            calificacion_nps,
            nps
       FROM cx_venta_instalacion_encuestas${where.sql}`,
    where.params
  );
  return rows;
}

async function dashboardMantenimiento_cor(filters) {
  const where = whereExact_cor(filters, MT_FILTERS_COR);
  const [rows] = await db.query(
    `SELECT estado,
            z_general,
            z_operativa,
            z_administrativa,
            superintendente,
            supervisor_operativo,
            categoria,
            prioridad,
            indice_de_recomendacion,
            tipo_de_cliente,
            indice_de_confianza,
            percepcion_de_valor,
            indice_de_riesgo_churn,
            csat_mantenimiento,
            csat_atencion_de_fallas,
            csat_seguimiento_de_supervisor,
            csat_cotizaciones_suministros_y_reparaci,
            csat_facturacion,
            csat_atencion_al_cliente,
            csat_general
       FROM cx_mantenimiento_encuestas${where.sql}`,
    where.params
  );
  return rows;
}

async function listVentaInstalacion_cor(filters) {
  const where = whereExact_cor(filters, VI_FILTERS_COR);
  const [rows] = await db.query(
    `SELECT *
       FROM cx_venta_instalacion_encuestas${where.sql}
      ORDER BY id DESC`,
    where.params
  );
  return rows;
}

async function listMantenimiento_cor(filters) {
  const where = whereExact_cor(filters, MT_FILTERS_COR);
  const [rows] = await db.query(
    `SELECT *
       FROM cx_mantenimiento_encuestas${where.sql}
      ORDER BY id DESC`,
    where.params
  );
  return rows;
}

module.exports = Object.freeze({
  optionsVentaInstalacion_cor,
  optionsMantenimiento_cor,
  dashboardVentaInstalacion_cor,
  dashboardMantenimiento_cor,
  listVentaInstalacion_cor,
  listMantenimiento_cor
});
