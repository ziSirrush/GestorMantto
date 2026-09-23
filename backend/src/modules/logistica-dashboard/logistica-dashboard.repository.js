'use strict';

// [Aster | 2026-09-23 | ASTER-MG | FASE 1 DASHBOARD LOGISTICA ANALITICA V001]
// Consultas agregadas para Dashboard Logistica.
// Aiven/log_ops se mantiene como unica fuente operativa.

const db = require('../../config/db');

const DATE_PREFIX_RE = '^[0-9]{4}-[0-9]{2}-[0-9]{2}';

function dateExpr(column) {
  return `STR_TO_DATE(LEFT(TRIM(${column}), 10), '%Y-%m-%d')`;
}

async function statusCounts_cor() {
  const [rows] = await db.query(
    `SELECT
       estatus,
       COUNT(*) AS total
     FROM log_ops
     WHERE estatus IS NOT NULL
       AND TRIM(estatus) <> ''
     GROUP BY estatus
     ORDER BY estatus ASC`
  );
  return rows;
}

async function deliveredByYear_cor() {
  const [rows] = await db.query(
    `SELECT
       CAST(LEFT(TRIM(fecha_entrega_real_obra), 4) AS UNSIGNED) AS anio,
       COUNT(*) AS total
     FROM log_ops
     WHERE UPPER(TRIM(estatus)) = 'ENTREGADO'
       AND TRIM(COALESCE(fecha_entrega_real_obra, '')) REGEXP ?
     GROUP BY CAST(LEFT(TRIM(fecha_entrega_real_obra), 4) AS UNSIGNED)
     ORDER BY anio ASC`,
    [DATE_PREFIX_RE]
  );
  return rows;
}

async function averageDepartureByPort_cor() {
  const exw = dateExpr('fecha_exw');
  const departure = dateExpr('fecha_salida_real');

  const [rows] = await db.query(
    `SELECT
       MIN(TRIM(puerto_origen)) AS puerto,
       COUNT(*) AS operaciones,
       ROUND(AVG(DATEDIFF(${departure}, ${exw})), 1) AS promedio_dias_salida
     FROM log_ops
     WHERE TRIM(COALESCE(puerto_origen, '')) <> ''
       AND TRIM(COALESCE(fecha_exw, '')) REGEXP ?
       AND TRIM(COALESCE(fecha_salida_real, '')) REGEXP ?
       AND DATEDIFF(${departure}, ${exw}) >= 0
     GROUP BY UPPER(TRIM(puerto_origen))
     ORDER BY UPPER(TRIM(puerto_origen)) ASC`,
    [DATE_PREFIX_RE, DATE_PREFIX_RE]
  );
  return rows;
}

async function averageTransitByPortMode_cor() {
  const departure = dateExpr('fecha_salida_real');
  const arrival = dateExpr('fecha_llegada_real');

  const [rows] = await db.query(
    `SELECT
       MIN(TRIM(puerto_destino)) AS puerto_destino,
       MIN(TRIM(ict)) AS modo,
       COUNT(*) AS operaciones,
       ROUND(AVG(DATEDIFF(${arrival}, ${departure})), 1) AS promedio_dias_llegada
     FROM log_ops
     WHERE TRIM(COALESCE(puerto_destino, '')) <> ''
       AND TRIM(COALESCE(ict, '')) <> ''
       AND TRIM(COALESCE(fecha_salida_real, '')) REGEXP ?
       AND TRIM(COALESCE(fecha_llegada_real, '')) REGEXP ?
       AND DATEDIFF(${arrival}, ${departure}) >= 0
     GROUP BY UPPER(TRIM(puerto_destino)), UPPER(TRIM(ict))
     ORDER BY UPPER(TRIM(puerto_destino)) ASC, UPPER(TRIM(ict)) ASC`,
    [DATE_PREFIX_RE, DATE_PREFIX_RE]
  );
  return rows;
}

async function currentYearContainers_cor(year) {
  const [rows] = await db.query(
    `SELECT
       COALESCE(SUM(contenedores_20_dc), 0) AS contenedores_20_dc,
       COALESCE(SUM(contenedores_40_hq), 0) AS contenedores_40_hq,
       COUNT(CASE
         WHEN contenedores_20_dc IS NOT NULL OR contenedores_40_hq IS NOT NULL THEN 1
       END) AS operaciones_con_dato
     FROM log_ops
     WHERE LEFT(TRIM(COALESCE(fecha_salida_estimada, '')), 4) = ?`,
    [String(year)]
  );
  return rows[0] || {
    contenedores_20_dc: 0,
    contenedores_40_hq: 0,
    operaciones_con_dato: 0
  };
}

async function currentYearContainersByMonth_cor(year) {
  const [rows] = await db.query(
    `SELECT
       CAST(SUBSTRING(TRIM(fecha_salida_estimada), 6, 2) AS UNSIGNED) AS mes,
       COALESCE(SUM(contenedores_20_dc), 0) AS contenedores_20_dc,
       COALESCE(SUM(contenedores_40_hq), 0) AS contenedores_40_hq
     FROM log_ops
     WHERE CAST(LEFT(TRIM(COALESCE(fecha_salida_estimada, '')), 4) AS UNSIGNED) = ?
       AND CAST(SUBSTRING(TRIM(COALESCE(fecha_salida_estimada, '')), 6, 2) AS UNSIGNED) BETWEEN 1 AND 12
     GROUP BY CAST(SUBSTRING(TRIM(fecha_salida_estimada), 6, 2) AS UNSIGNED)
     ORDER BY mes ASC`,
    [Number(year)]
  );
  return rows;
}

module.exports = Object.freeze({
  statusCounts_cor,
  deliveredByYear_cor,
  averageDepartureByPort_cor,
  averageTransitByPortMode_cor,
  currentYearContainers_cor,
  currentYearContainersByMonth_cor
});
