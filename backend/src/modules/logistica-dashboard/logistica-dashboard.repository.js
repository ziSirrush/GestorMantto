'use strict';

// [Aster | 2026-09-23 | ASTER-MG | FASE 1 DASHBOARD LOGISTICA ANALITICA V001]
// [Aster | 2026-09-23 | ASTER-MG | FIX PROMEDIOS POR ANIO V001]
// Aiven/log_ops se mantiene como unica fuente operativa.
// [BLT NOW | 2026-10-21 | FASE 2 DASHBOARD LOGISTICA V001] Rutas y periodos ETD.
// [BLT NOW | 2026-10-21 | FASE 4 DASHBOARD LOGISTICA V001] Muestras de fletes para simulacion.

const db = require('../../config/db');

const DATE_PREFIX_RE = '^[0-9]{4}-[0-9]{2}-[0-9]{2}';

function dateExpr(column) {
  return `STR_TO_DATE(LEFT(TRIM(${column}), 10), '%Y-%m-%d')`;
}

function averageYearFilter_cor(year) {
  if (year === null || year === undefined) {
    return { sql: '', params: [] };
  }

  return {
    sql: `AND CAST(LEFT(TRIM(fecha_salida_real), 4) AS UNSIGNED) = ?`,
    params: [Number(year)]
  };
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

async function averageYears_cor() {
  const [rows] = await db.query(
    `SELECT DISTINCT
       CAST(LEFT(TRIM(fecha_salida_real), 4) AS UNSIGNED) AS anio
     FROM log_ops
     WHERE TRIM(COALESCE(fecha_salida_real, '')) REGEXP ?
       AND CAST(LEFT(TRIM(fecha_salida_real), 4) AS UNSIGNED) BETWEEN 1900 AND 2200
     ORDER BY anio DESC`,
    [DATE_PREFIX_RE]
  );
  return rows;
}

async function averageDepartureByPort_cor(year = null) {
  const exw = dateExpr('fecha_exw');
  const departure = dateExpr('fecha_salida_real');
  const yearFilter = averageYearFilter_cor(year);

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
       ${yearFilter.sql}
     GROUP BY UPPER(TRIM(puerto_origen))
     ORDER BY UPPER(TRIM(puerto_origen)) ASC`,
    [DATE_PREFIX_RE, DATE_PREFIX_RE, ...yearFilter.params]
  );
  return rows;
}

async function averageTransitByPortMode_cor(year = null) {
  const departure = dateExpr('fecha_salida_real');
  const arrival = dateExpr('fecha_llegada_real');
  const yearFilter = averageYearFilter_cor(year);

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
       ${yearFilter.sql}
     GROUP BY UPPER(TRIM(puerto_destino)), UPPER(TRIM(ict))
     ORDER BY UPPER(TRIM(puerto_destino)) ASC, UPPER(TRIM(ict)) ASC`,
    [DATE_PREFIX_RE, DATE_PREFIX_RE, ...yearFilter.params]
  );
  return rows;
}

// El catalogo de periodo combina fechas reales de salida y ETD de contenedores.
// No modifica el catalogo historico usado por consumidores legacy.
async function analysisYears_cor() {
  const [rows] = await db.query(
    `SELECT DISTINCT anio
     FROM (
       SELECT CAST(LEFT(TRIM(fecha_salida_real), 4) AS UNSIGNED) AS anio
       FROM log_ops
       WHERE TRIM(COALESCE(fecha_salida_real, '')) REGEXP ?
       UNION ALL
       SELECT CAST(LEFT(TRIM(fecha_salida_estimada), 4) AS UNSIGNED) AS anio
       FROM log_ops
       WHERE TRIM(COALESCE(fecha_salida_estimada, '')) REGEXP ?
     ) AS catalogo
     WHERE anio BETWEEN 1900 AND 2200
     ORDER BY anio DESC`,
    [DATE_PREFIX_RE, DATE_PREFIX_RE]
  );
  return rows;
}

// Una fila de la tabla unificada representa un origen/destino/modo especificos.
// Cada tramo mantiene su propia muestra; TOTAL usa exclusivamente casos completos.
async function averageByRoute_cor(year = null) {
  const exw = dateExpr('fecha_exw');
  const departure = dateExpr('fecha_salida_real');
  const arrival = dateExpr('fecha_llegada_real');
  const yearFilter = averageYearFilter_cor(year);
  const salidaValida = `(TRIM(COALESCE(fecha_exw, '')) REGEXP '${DATE_PREFIX_RE}'
    AND ${exw} IS NOT NULL AND DATEDIFF(${departure}, ${exw}) >= 0)`;
  const transitoValido = `(TRIM(COALESCE(fecha_llegada_real, '')) REGEXP '${DATE_PREFIX_RE}'
    AND ${arrival} IS NOT NULL AND DATEDIFF(${arrival}, ${departure}) >= 0)`;
  const completo = `(${salidaValida} AND ${transitoValido})`;

  const [rows] = await db.query(
    `SELECT
       MIN(TRIM(puerto_origen)) AS puerto_origen,
       MIN(TRIM(puerto_destino)) AS puerto_destino,
       MIN(TRIM(ict)) AS modo,
       COUNT(CASE WHEN ${salidaValida} OR ${transitoValido} THEN 1 END) AS operaciones,
       COUNT(CASE WHEN ${salidaValida} THEN 1 END) AS operaciones_salida,
       ROUND(AVG(CASE WHEN ${salidaValida} THEN DATEDIFF(${departure}, ${exw}) END), 1) AS promedio_dias_salida,
       COUNT(CASE WHEN ${transitoValido} THEN 1 END) AS operaciones_transito,
       ROUND(AVG(CASE WHEN ${transitoValido} THEN DATEDIFF(${arrival}, ${departure}) END), 1) AS promedio_dias_llegada,
       COUNT(CASE WHEN ${completo} THEN 1 END) AS operaciones_completas,
       ROUND(AVG(CASE WHEN ${completo} THEN DATEDIFF(${arrival}, ${exw}) END), 1) AS promedio_dias_total
     FROM log_ops
     WHERE TRIM(COALESCE(puerto_origen, '')) <> ''
       AND TRIM(COALESCE(puerto_destino, '')) <> ''
       AND TRIM(COALESCE(ict, '')) <> ''
       AND TRIM(COALESCE(fecha_salida_real, '')) REGEXP ?
       AND ${departure} IS NOT NULL
       AND CAST(LEFT(TRIM(fecha_salida_real), 4) AS UNSIGNED) BETWEEN 1900 AND 2200
       ${yearFilter.sql}
     GROUP BY UPPER(TRIM(puerto_origen)), UPPER(TRIM(puerto_destino)), UPPER(TRIM(ict))
     HAVING operaciones_salida > 0 OR operaciones_transito > 0
     ORDER BY UPPER(TRIM(puerto_origen)), UPPER(TRIM(puerto_destino)), UPPER(TRIM(ict))`,
    [DATE_PREFIX_RE, ...yearFilter.params]
  );
  return rows;
}

function periodEtDFilter_cor(year) {
  return year == null
    ? { sql: '', params: [] }
    : { sql: 'AND CAST(LEFT(TRIM(fecha_salida_estimada), 4) AS UNSIGNED) = ?', params: [Number(year)] };
}

// NUEVO contrato para Fase 3. Los contenedores legacy siguen intactos en
// "contenedores" hasta conectar la UI a "contenedores_periodo".
async function periodContainers_cor(year = null) {
  const period = periodEtDFilter_cor(year);
  const [rows] = await db.query(
    `SELECT
       COALESCE(SUM(contenedores_20_dc), 0) AS contenedores_20_dc,
       COALESCE(SUM(contenedores_40_hq), 0) AS contenedores_40_hq,
       COUNT(CASE WHEN contenedores_20_dc IS NOT NULL OR contenedores_40_hq IS NOT NULL THEN 1 END) AS operaciones_con_dato
     FROM log_ops
     WHERE TRIM(COALESCE(fecha_salida_estimada, '')) REGEXP ?
       AND CAST(LEFT(TRIM(fecha_salida_estimada), 4) AS UNSIGNED) BETWEEN 1900 AND 2200
       AND CAST(SUBSTRING(TRIM(fecha_salida_estimada), 6, 2) AS UNSIGNED) BETWEEN 1 AND 12
       AND ${dateExpr('fecha_salida_estimada')} IS NOT NULL
       ${period.sql}`,
    [DATE_PREFIX_RE, ...period.params]
  );
  return rows[0] || { contenedores_20_dc: 0, contenedores_40_hq: 0, operaciones_con_dato: 0 };
}

async function periodContainerMonths_cor(year = null) {
  const period = periodEtDFilter_cor(year);
  const [rows] = await db.query(
    `SELECT
       CAST(SUBSTRING(TRIM(fecha_salida_estimada), 6, 2) AS UNSIGNED) AS mes,
       COALESCE(SUM(contenedores_20_dc), 0) AS contenedores_20_dc,
       COALESCE(SUM(contenedores_40_hq), 0) AS contenedores_40_hq
     FROM log_ops
     WHERE TRIM(COALESCE(fecha_salida_estimada, '')) REGEXP ?
       AND CAST(LEFT(TRIM(fecha_salida_estimada), 4) AS UNSIGNED) BETWEEN 1900 AND 2200
       AND CAST(SUBSTRING(TRIM(fecha_salida_estimada), 6, 2) AS UNSIGNED) BETWEEN 1 AND 12
       AND ${dateExpr('fecha_salida_estimada')} IS NOT NULL
       ${period.sql}
     GROUP BY CAST(SUBSTRING(TRIM(fecha_salida_estimada), 6, 2) AS UNSIGNED)
     ORDER BY mes ASC`,
    [DATE_PREFIX_RE, ...period.params]
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


// Lectura limitada y parametrizada, misma identidad puerto origen + destino + ICT
// y mismo criterio anual de la Fase 2. No introduce otra fuente de datos.
// Se usa una fila por registro para estimar percentiles empiricos; si se supera
// el limite, el servicio falla en vez de sesgar resultados truncando muestras.
async function freightSimulationSamples_cor({ year = null, puerto_origen, puerto_destino, ict, lugar_entrega = null }) {
  const yearFilter = averageYearFilter_cor(year);
  const placeFilter = lugar_entrega
    ? { sql: 'AND UPPER(TRIM(lugar_entrega)) = UPPER(TRIM(?))', params: [lugar_entrega] }
    : { sql: '', params: [] };
  const [rows] = await db.query(
    `SELECT id_log_ops, fecha_exw, fecha_salida_real, fecha_llegada_real,
            fecha_entrega_real_obra
     FROM log_ops
     WHERE UPPER(TRIM(puerto_origen)) = UPPER(TRIM(?))
       AND UPPER(TRIM(puerto_destino)) = UPPER(TRIM(?))
       AND UPPER(TRIM(ict)) = UPPER(TRIM(?))
       AND TRIM(COALESCE(fecha_salida_real, '')) REGEXP ?
       AND CAST(LEFT(TRIM(fecha_salida_real), 4) AS UNSIGNED) BETWEEN 1900 AND 2200
       ${yearFilter.sql}
       ${placeFilter.sql}
     ORDER BY id_log_ops ASC
     LIMIT 2001`,
    [puerto_origen, puerto_destino, ict, DATE_PREFIX_RE,
      ...yearFilter.params, ...placeFilter.params]
  );
  return rows;
}

module.exports = Object.freeze({
  statusCounts_cor,
  deliveredByYear_cor,
  averageYears_cor,
  analysisYears_cor,
  averageDepartureByPort_cor,
  averageTransitByPortMode_cor,
  averageByRoute_cor,
  currentYearContainers_cor,
  currentYearContainersByMonth_cor,
  periodContainers_cor,
  periodContainerMonths_cor,
  freightSimulationSamples_cor
});
