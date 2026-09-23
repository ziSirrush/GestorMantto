'use strict';

// [Aster | 2026-09-23 | ASTER-MG | FASE 1 DASHBOARD LOGISTICA ANALITICA V001]
// [Aster | 2026-09-23 | ASTER-MG | FIX PROMEDIOS POR ANIO V001]

const repository = require('./logistica-dashboard.repository');
const { mexicoCityYear } = require('../../utils/temporal');

const STATUS_GROUPS = Object.freeze({
  sin_produccion: Object.freeze([
    Object.freeze({ status: 'SIN PRODUCCIÓN / Documentación Pendiente', label: 'Documentación Pendiente' }),
    Object.freeze({ status: 'SIN PRODUCCIÓN / Primera Visita a Obra', label: 'Primera Visita a Obra' }),
    Object.freeze({ status: 'SIN PRODUCCIÓN / Pendiente Liberación por Parte del Cliente', label: 'Pendiente Liberación Cliente' }),
    Object.freeze({ status: 'SIN PRODUCCIÓN / Programados a Producción', label: 'Programados a Producción' })
  ]),
  produccion: Object.freeze([
    Object.freeze({ status: 'EN PRODUCCIÓN', label: 'En Producción' }),
    Object.freeze({ status: 'PARADOS POR CLIENTE', label: 'Parados por Cliente' }),
    Object.freeze({ status: 'PENDIENTE PAGO LIBERACIÓN', label: 'Pendiente Pago Liberación' }),
    Object.freeze({ status: 'PROGRAMADO', label: 'Programado' })
  ]),
  logistica: Object.freeze([
    Object.freeze({ status: 'EN TRÁNSITO', label: 'En Tránsito' }),
    Object.freeze({ status: 'PROGRAMA ENTREGA', label: 'Programa Entrega' }),
    Object.freeze({ status: 'ALMACENADOS', label: 'Almacenados' })
  ])
});

function normalizeText(value) {
  return String(value == null ? '' : value)
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function buildStatusCharts_cor(rows) {
  const counts = new Map();
  for (const row of rows || []) {
    const key = normalizeText(row.estatus);
    counts.set(key, (counts.get(key) || 0) + toNumber(row.total));
  }

  return Object.fromEntries(Object.entries(STATUS_GROUPS).map(([group, statuses]) => [
    group,
    statuses.map(item => ({
      estatus: item.status,
      etiqueta: item.label,
      total: counts.get(normalizeText(item.status)) || 0
    }))
  ]));
}

function normalizeDeliveredYears_cor(rows) {
  return (rows || [])
    .map(row => ({ anio: Number(row.anio), total: toNumber(row.total) }))
    .filter(row => Number.isInteger(row.anio) && row.anio >= 1900 && row.anio <= 2200)
    .sort((a, b) => a.anio - b.anio);
}

function normalizeAverageYears_cor(rows) {
  return [...new Set((rows || [])
    .map(row => Number(row.anio))
    .filter(year => Number.isInteger(year) && year >= 1900 && year <= 2200))]
    .sort((a, b) => b - a);
}

function resolveAverageFilter_cor(requestedPeriod, currentYear) {
  const raw = String(requestedPeriod == null ? '' : requestedPeriod).trim();
  const normalized = normalizeText(raw);

  if (!raw) {
    return {
      value: currentYear,
      year: currentYear,
      all: false,
      label: `Año actual ${currentYear}`
    };
  }

  if (['ALL', 'TODOS', 'TODOS LOS ANOS'].includes(normalized)) {
    return {
      value: 'all',
      year: null,
      all: true,
      label: 'Todos los años'
    };
  }

  const year = Number(raw);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    const error = new Error('anio_promedios debe ser "all" o un año válido entre 1900 y 2200.');
    error.status = 400;
    throw error;
  }

  return {
    value: year,
    year,
    all: false,
    label: year === currentYear ? `Año actual ${year}` : String(year)
  };
}

function normalizeDepartureTable_cor(rows) {
  return (rows || []).map(row => ({
    puerto: String(row.puerto || '').trim(),
    operaciones: toNumber(row.operaciones),
    promedio_dias_salida: toNumber(row.promedio_dias_salida)
  }));
}

function normalizeTransitTable_cor(rows) {
  return (rows || []).map(row => ({
    puerto_destino: String(row.puerto_destino || '').trim(),
    modo: String(row.modo || '').trim(),
    operaciones: toNumber(row.operaciones),
    promedio_dias_llegada: toNumber(row.promedio_dias_llegada)
  }));
}

function normalizeContainers_cor(row, year) {
  const c20 = Math.max(0, toNumber(row?.contenedores_20_dc));
  const c40 = Math.max(0, toNumber(row?.contenedores_40_hq));
  const total = c20 + c40;

  return {
    anio: year,
    criterio_anio: 'fecha_salida_estimada (ETD)',
    contenedores_20_dc: c20,
    contenedores_40_hq: c40,
    total,
    porcentaje_20_dc: total ? Number(((c20 / total) * 100).toFixed(1)) : 0,
    porcentaje_40_hq: total ? Number(((c40 / total) * 100).toFixed(1)) : 0,
    operaciones_con_dato: toNumber(row?.operaciones_con_dato)
  };
}

const MONTH_NAMES = Object.freeze([
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
]);

function normalizeContainerMonths_cor(rows) {
  const byMonth = new Map(
    (rows || []).map(row => [Number(row.mes), row])
  );

  return MONTH_NAMES.map((nombre, index) => {
    const mes = index + 1;
    const row = byMonth.get(mes) || {};
    return {
      mes,
      mes_nombre: nombre,
      contenedores_20_dc: Math.max(0, toNumber(row.contenedores_20_dc)),
      contenedores_40_hq: Math.max(0, toNumber(row.contenedores_40_hq))
    };
  });
}

async function analytics_cor(requestedPeriod) {
  const currentYear = mexicoCityYear();
  if (!Number.isInteger(currentYear)) {
    const error = new Error('No fue posible resolver el año actual de America/Mexico_City.');
    error.status = 500;
    throw error;
  }

  const [statusRows, deliveredRows, averageYearRows, containerRow, containerMonthRows] = await Promise.all([
    repository.statusCounts_cor(),
    repository.deliveredByYear_cor(),
    repository.averageYears_cor(),
    repository.currentYearContainers_cor(currentYear),
    repository.currentYearContainersByMonth_cor(currentYear)
  ]);

  const averageYears = normalizeAverageYears_cor(averageYearRows);
  const averageFilter = resolveAverageFilter_cor(requestedPeriod, currentYear);

  const [departureRows, transitRows] = await Promise.all([
    repository.averageDepartureByPort_cor(averageFilter.year),
    repository.averageTransitByPortMode_cor(averageFilter.year)
  ]);

  return {
    anio_actual: currentYear,
    promedios: {
      periodo: averageFilter.value,
      etiqueta: averageFilter.label,
      criterio_anio: 'fecha_salida_real',
      anios_disponibles: averageYears
    },
    graficas: {
      ...buildStatusCharts_cor(statusRows),
      entregados_por_anio: normalizeDeliveredYears_cor(deliveredRows)
    },
    tablas: {
      salida_por_puerto: normalizeDepartureTable_cor(departureRows),
      llegada_por_modo_puerto: normalizeTransitTable_cor(transitRows)
    },
    contenedores: {
      ...normalizeContainers_cor(containerRow, currentYear),
      meses: normalizeContainerMonths_cor(containerMonthRows)
    },
    reglas_calculo: {
      filtro_promedios: averageFilter.all
        ? 'Todos los años con fecha_salida_real válida.'
        : `Año ${averageFilter.year} según fecha_salida_real.`,
      salida_por_puerto: 'AVG(fecha_salida_real - fecha_exw), solo pares de fechas válidos y no negativos. El año se determina por fecha_salida_real.',
      llegada_por_modo_puerto: 'AVG(fecha_llegada_real - fecha_salida_real), agrupado por puerto_destino + ict, solo pares válidos y no negativos. El año se determina por fecha_salida_real.',
      entregados_por_anio: 'COUNT por año de fecha_entrega_real_obra para estatus ENTREGADO, orden ascendente.',
      contenedores_anio_actual: 'SUM de contenedores_20_dc y contenedores_40_hq cuando el año de fecha_salida_estimada (ETD) es el año actual CDMX.',
      contenedores_por_mes: 'SUM mensual de contenedores_20_dc y contenedores_40_hq para enero-diciembre del año actual, usando fecha_salida_estimada (ETD).'
    }
  };
}

module.exports = Object.freeze({
  STATUS_GROUPS,
  normalizeText,
  buildStatusCharts_cor,
  normalizeDeliveredYears_cor,
  normalizeAverageYears_cor,
  resolveAverageFilter_cor,
  normalizeContainers_cor,
  normalizeContainerMonths_cor,
  analytics_cor
});
