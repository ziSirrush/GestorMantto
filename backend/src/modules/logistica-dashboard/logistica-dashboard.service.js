'use strict';

// [Aster | 2026-09-23 | ASTER-MG | FASE 1 DASHBOARD LOGISTICA ANALITICA V001]
// [Aster | 2026-09-23 | ASTER-MG | FIX PROMEDIOS POR ANIO V001]
// [BLT NOW | 2026-10-21 | FASE 4 DASHBOARD LOGISTICA V001] Motor simulador historico.
// [BLT NOW | 2026-10-21 | FASE 2 DASHBOARD LOGISTICA V001] Datos de ruta y periodo.

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

function normalizeAverageOrNull_cor(value, operations) {
  if (!Number.isFinite(Number(operations)) || Number(operations) <= 0 || value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeRouteTable_cor(rows) {
  return (rows || []).map(row => {
    const operacionesSalida = Math.max(0, toNumber(row.operaciones_salida));
    const operacionesTransito = Math.max(0, toNumber(row.operaciones_transito));
    const operacionesCompletas = Math.max(0, toNumber(row.operaciones_completas));
    return {
      puerto_origen: String(row.puerto_origen || '').trim(),
      puerto_destino: String(row.puerto_destino || '').trim(),
      modo: String(row.modo || '').trim(),
      operaciones: Math.max(0, toNumber(row.operaciones)),
      operaciones_salida: operacionesSalida,
      promedio_dias_salida: normalizeAverageOrNull_cor(row.promedio_dias_salida, operacionesSalida),
      operaciones_transito: operacionesTransito,
      promedio_dias_llegada: normalizeAverageOrNull_cor(row.promedio_dias_llegada, operacionesTransito),
      operaciones_completas: operacionesCompletas,
      // NUNCA sumar promedios de muestras diferentes para este campo.
      promedio_dias_total: normalizeAverageOrNull_cor(row.promedio_dias_total, operacionesCompletas)
    };
  }).filter(row => row.puerto_origen && row.puerto_destino && row.modo && row.operaciones > 0);
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

  const averageFilter = resolveAverageFilter_cor(requestedPeriod, currentYear);
  const [statusRows, deliveredRows, averageYearRows, analysisYearRows, containerRow, containerMonthRows] = await Promise.all([
    repository.statusCounts_cor(),
    repository.deliveredByYear_cor(),
    repository.averageYears_cor(),
    repository.analysisYears_cor(),
    repository.currentYearContainers_cor(currentYear),
    repository.currentYearContainersByMonth_cor(currentYear)
  ]);

  const averageYears = normalizeAverageYears_cor(averageYearRows);
  const analysisYears = normalizeAverageYears_cor(analysisYearRows);

  const [departureRows, transitRows, routeRows, periodContainerRow, periodContainerMonthRows] = await Promise.all([
    repository.averageDepartureByPort_cor(averageFilter.year),
    repository.averageTransitByPortMode_cor(averageFilter.year),
    repository.averageByRoute_cor(averageFilter.year),
    repository.periodContainers_cor(averageFilter.year),
    repository.periodContainerMonths_cor(averageFilter.year)
  ]);

  return {
    anio_actual: currentYear,
    promedios: {
      periodo: averageFilter.value,
      etiqueta: averageFilter.label,
      criterio_anio: 'fecha_salida_real',
      // Union de salidas reales + ETD: permite consultar anos con solo contenedores.
      anios_disponibles: analysisYears,
      anios_con_salida_real: averageYears
    },
    graficas: {
      ...buildStatusCharts_cor(statusRows),
      entregados_por_anio: normalizeDeliveredYears_cor(deliveredRows)
    },
    tablas: {
      salida_por_puerto: normalizeDepartureTable_cor(departureRows),
      llegada_por_modo_puerto: normalizeTransitTable_cor(transitRows),
      promedios_por_ruta: normalizeRouteTable_cor(routeRows)
    },
    contenedores: {
      // Legacy visual: conserva ano actual hasta actualizar la UI en Fase 3.
      ...normalizeContainers_cor(containerRow, currentYear),
      meses: normalizeContainerMonths_cor(containerMonthRows)
    },
    contenedores_periodo: {
      ...normalizeContainers_cor(periodContainerRow, averageFilter.value),
      periodo: averageFilter.value,
      etiqueta: averageFilter.all ? 'Todos los años (ETD)' : `ETD ${averageFilter.year}`,
      meses: normalizeContainerMonths_cor(periodContainerMonthRows)
    },
    reglas_calculo: {
      filtro_promedios: averageFilter.all
        ? 'Todos los años con fecha_salida_real válida.'
        : `Año ${averageFilter.year} según fecha_salida_real.`,
      salida_por_puerto: 'AVG(fecha_salida_real - fecha_exw), solo pares de fechas válidos y no negativos. El año se determina por fecha_salida_real.',
      llegada_por_modo_puerto: 'AVG(fecha_llegada_real - fecha_salida_real), agrupado por puerto_destino + ict, solo pares válidos y no negativos. El año se determina por fecha_salida_real.',
      entregados_por_anio: 'COUNT por año de fecha_entrega_real_obra para estatus ENTREGADO, orden ascendente.',
      contenedores_anio_actual: 'SUM de contenedores_20_dc y contenedores_40_hq cuando el año de fecha_salida_estimada (ETD) es el año actual CDMX.',
      contenedores_por_mes: 'SUM mensual de contenedores_20_dc y contenedores_40_hq para enero-diciembre del año actual, usando fecha_salida_estimada (ETD).',
      promedios_por_ruta: 'Agrupacion puerto_origen + puerto_destino + ict. Cada tramo usa pares de fechas validos no negativos; total es AVG(fecha_llegada_real - fecha_exw) SOLO sobre registros con ambos tramos completos. Ano segun fecha_salida_real.',
      contenedores_periodo: 'SUM por fecha_salida_estimada (ETD) valida: ano seleccionado o historico completo. En historico, el desglose de 12 meses consolida los meses de todos los anos.'
    }
  };
}


// SIMULADOR FLETES (FASE 4). Todas las duraciones provienen de operaciones
// con fechas coherentes de UNA MISMA COHORTE, no de sumar medias aisladas.
// El tramo puerto -> obra incluye cualquier espera (aduana, almacenamiento,
// programacion) entre ambas fechas; no se declara que sea solo transporte.
const SIM_FREIGHT_MAX_ROWS_COR = 2000;
const SIM_FREIGHT_MIN_PERCENTILES_COR = 10;
const MILLIS_PER_DAY_COR = 86400000;

function freightInputError_cor(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function freightText_cor(value, name, limit, required = true) {
  if (value == null || value === '') {
    if (required) throw freightInputError_cor(`${name} es obligatorio.`);
    return null;
  }
  if (typeof value !== 'string') throw freightInputError_cor(`${name} debe ser texto.`);
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) throw freightInputError_cor(`${name} es obligatorio.`);
    return null;
  }
  if (trimmed.length > limit || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw freightInputError_cor(`${name} tiene longitud o caracteres no validos.`);
  }
  return trimmed;
}

function freightDayNumber_cor(raw, strictInput = false) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  const match = strictInput
    ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    : /^(\d{4})-(\d{2})-(\d{2})(?:$|[ T])/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.getTime() / MILLIS_PER_DAY_COR;
}

function freightAddDays_cor(baseDay, duration) {
  return new Date((baseDay + Math.round(duration)) * MILLIS_PER_DAY_COR).toISOString().slice(0, 10);
}

function freightRound_cor(value) {
  return Math.round(value * 10) / 10;
}

// Percentil empírico con interpolación lineal entre observaciones ordenadas;
// no se inventan porcentajes de demora ni se extrapola fuera de la muestra.
function freightQuantile_cor(sorted, p) {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function freightMetric_cor(samples, field, method) {
  const values = samples.map(row => row[field]).sort((a, b) => a - b);
  if (method === 'promedio') return values.reduce((acc, value) => acc + value, 0) / values.length;
  return freightQuantile_cor(values, method === 'optimista' ? 0.25 : 0.75);
}

function freightObservedSamples_cor(rows, startKind) {
  const list = [];
  for (const row of rows) {
    const departure = freightDayNumber_cor(row.fecha_salida_real);
    const arrival = freightDayNumber_cor(row.fecha_llegada_real);
    const delivered = freightDayNumber_cor(row.fecha_entrega_real_obra);
    if (departure == null || arrival == null || delivered == null || arrival < departure || delivered < arrival) continue;
    if (startKind === 'exw') {
      const exw = freightDayNumber_cor(row.fecha_exw);
      if (exw == null || departure < exw) continue;
      list.push({
        dias_zarpe: departure - exw,
        dias_puerto: arrival - exw,
        dias_obra: delivered - exw
      });
    } else {
      list.push({
        dias_zarpe: 0,
        dias_puerto: arrival - departure,
        dias_obra: delivered - departure
      });
    }
  }
  return list;
}

function freightScenario_cor(samples, mode, startKind, startDay, startDate) {
  const zarpe = freightMetric_cor(samples, 'dias_zarpe', mode);
  const puerto = freightMetric_cor(samples, 'dias_puerto', mode);
  const obra = freightMetric_cor(samples, 'dias_obra', mode);
  // Los tres cuantiles provienen de distribuciones acumulativas emparejadas.
  // Son monótonos porque cada observacion cumple zarpe <= puerto <= obra.
  return {
    metodo: mode === 'promedio' ? 'Media aritmetica' : (mode === 'optimista' ? 'Percentil 25' : 'Percentil 75'),
    fechas: {
      exw: startKind === 'exw' ? startDate : null,
      zarpe: freightAddDays_cor(startDay, zarpe),
      llegada_puerto: freightAddDays_cor(startDay, puerto),
      llegada_obra: freightAddDays_cor(startDay, obra)
    },
    dias_desde_inicio: {
      zarpe: freightRound_cor(zarpe),
      llegada_puerto: freightRound_cor(puerto),
      llegada_obra: freightRound_cor(obra)
    },
    dias_etapas: {
      exw_zarpe: startKind === 'exw' ? freightRound_cor(zarpe) : null,
      zarpe_puerto: freightRound_cor(puerto - zarpe),
      puerto_obra: freightRound_cor(obra - puerto),
      total: freightRound_cor(obra)
    }
  };
}

async function freightSimulation_cor(query = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    throw freightInputError_cor('Parámetros de simulacion no validos.');
  }
  const currentYear = mexicoCityYear();
  if (!Number.isInteger(currentYear)) {
    const error = new Error('No se pudo resolver el año actual de CDMX.');
    error.status = 500;
    throw error;
  }
  const filter = resolveAverageFilter_cor(query.anio_promedios, currentYear);
  const origin = freightText_cor(query.puerto_origen, 'puerto_origen', 150);
  const destination = freightText_cor(query.puerto_destino, 'puerto_destino', 150);
  const mode = freightText_cor(query.ict, 'ict', 100);
  const deliveryPlace = freightText_cor(query.lugar_entrega, 'lugar_entrega', 150, false);
  const hasExw = query.fecha_exw != null && query.fecha_exw !== '';
  const hasDeparture = query.fecha_zarpe != null && query.fecha_zarpe !== '';
  if (hasExw === hasDeparture) {
    throw freightInputError_cor('Indica exactamente una fecha inicial: fecha_exw o fecha_zarpe.');
  }
  const startKind = hasExw ? 'exw' : 'zarpe';
  const startDate = freightText_cor(hasExw ? query.fecha_exw : query.fecha_zarpe, 'fecha inicial', 10);
  const startDay = freightDayNumber_cor(startDate, true);
  if (startDay == null) {
    throw freightInputError_cor('La fecha inicial debe ser valida con formato YYYY-MM-DD (1900-2200).');
  }

  const rows = await repository.freightSimulationSamples_cor({
    year: filter.year,
    puerto_origen: origin,
    puerto_destino: destination,
    ict: mode,
    lugar_entrega: deliveryPlace
  });
  if (!Array.isArray(rows)) {
    const error = new Error('La lectura de muestras de Logistica no devolvio una lista.');
    error.status = 500;
    throw error;
  }
  if (rows.length > SIM_FREIGHT_MAX_ROWS_COR) {
    const error = new Error('Hay mas de 2000 operaciones en esta ruta/periodo. Refina los filtros para evitar un calculo parcial.');
    error.status = 422;
    throw error;
  }
  const samples = freightObservedSamples_cor(rows, startKind);
  const sufficient = samples.length >= SIM_FREIGHT_MIN_PERCENTILES_COR;
  const warnings = [];
  if (!deliveryPlace) warnings.push('Sin lugar de entrega especifico: el tramo puerto-obra combina destinos finales de la ruta.');
  if (samples.length === 0) warnings.push('No hay operaciones con todas las fechas reales necesarias en la ruta y periodo seleccionados.');
  else if (!sufficient) warnings.push('Muestra menor a 10 operaciones completas: solo se muestra la media; no se estiman percentiles.');
  warnings.push('Puerto a obra comprende cualquier espera entre llegada real y entrega real; no representa exclusivamente dias de carretera.');

  return {
    estado: samples.length ? 'estimacion' : 'sin_datos',
    periodo: filter.value,
    criterio_anio: 'fecha_salida_real',
    ruta: {
      puerto_origen: origin,
      puerto_destino: destination,
      ict: mode,
      lugar_entrega: deliveryPlace
    },
    inicio: { tipo: startKind === 'exw' ? 'EXW' : 'ZARPE', fecha: startDate },
    muestra: {
      registros_consultados: rows.length,
      operaciones_completas: samples.length,
      registros_descartados: rows.length - samples.length,
      minimo_para_escenarios: SIM_FREIGHT_MIN_PERCENTILES_COR
    },
    escenarios: {
      optimista: sufficient ? freightScenario_cor(samples, 'optimista', startKind, startDay, startDate) : null,
      promedio: samples.length ? freightScenario_cor(samples, 'promedio', startKind, startDay, startDate) : null,
      conservador: sufficient ? freightScenario_cor(samples, 'conservador', startKind, startDay, startDate) : null
    },
    metodologia: {
      fuente: 'log_ops',
      filtro_anio: 'año de fecha_salida_real (zarpe real)',
      cohorte: startKind === 'exw'
        ? 'Mismas operaciones con EXW, zarpe, llegada a puerto y entrega en obra reales válidas y ordenadas.'
        : 'Mismas operaciones con zarpe, llegada a puerto y entrega en obra reales válidas y ordenadas.',
      percentiles: 'P25 optimista y P75 conservador con al menos 10 observaciones; valores acumulados, sin porcentajes de demora arbitrarios.',
      redondeo: 'Dias estadisticos con 1 decimal; fechas proyectadas redondeadas al dia calendario mas cercano (UTC).'
    },
    advertencias: warnings
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
  normalizeRouteTable_cor,
  analytics_cor,
  freightSimulation_cor
});
