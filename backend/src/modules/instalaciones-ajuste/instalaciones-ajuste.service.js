'use strict';

const repository = require('./instalaciones-ajuste.repository');
const { hasEffectivePermission } = require('../../services/permissions/effective-permission.service');

const SIN_ANIO_VALUE_COR = '__SIN_ANIO__';
const DEFAULT_LIMIT_COR = 100;
const MAX_LIMIT_COR = 500;

const PERMISSIONS_COR = Object.freeze({
  acceso_visual: 'INSTALACIONES_AJUSTE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  comportamiento_selector_ver: 'INSTALACIONES_AJUSTE_COMPORTAMIENTO_TIPO_SELECTOR.VER',
  comportamiento_filtrar: 'INSTALACIONES_AJUSTE_COMPORTAMIENTO_TIPO_SELECTOR.FILTRAR',
  comportamiento_resumen_ver: 'INSTALACIONES_AJUSTE_COMPORTAMIENTO_TIPO_RESUMEN.VER',
  detalle_ver: 'INSTALACIONES_AJUSTE_DETALLE_ANIO_LISTADO.VER',
  detalle_abrir: 'INSTALACIONES_AJUSTE_DETALLE_ANIO_LISTADO.ABRIR_DETALLE'
});

const MONTHS_COR = Object.freeze({
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11
});

function validationError_cor(message, field, value) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'INSTALACIONES_AJUSTE_VALIDATION';
  error.details = { field, value };
  return error;
}

function cleanText_cor(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function rawText_cor(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function positiveInteger_cor(value, field, defaultValue, maxValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw validationError_cor(`${field} debe ser un entero positivo.`, field, value);
  }
  if (maxValue && normalized > maxValue) {
    throw validationError_cor(`${field} no puede ser mayor a ${maxValue}.`, field, value);
  }
  return normalized;
}

function nonNegativeInteger_cor(value, field, defaultValue = 0) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw validationError_cor(`${field} debe ser un entero mayor o igual a 0.`, field, value);
  }
  return normalized;
}

function parseDate_cor(value) {
  if (value === null || value === undefined || value === '' || value === '-' || value === '.') {
    return null;
  }
  if (typeof value !== 'string') return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const legacy = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (legacy) {
    const month = MONTHS_COR[legacy[2]];
    if (month === undefined) return null;
    const parsed = new Date(
      2000 + Number.parseInt(legacy[3], 10),
      month,
      Number.parseInt(legacy[1], 10)
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function daysBetween_cor(startValue, endValue) {
  const start = parseDate_cor(startValue);
  const end = parseDate_cor(endValue);
  if (!start || !end) return null;
  return Math.round((end - start) / 86400000);
}

function metrics_cor(row) {
  const inicio = row.fecha_inicio_ajuste;
  const teorico = row.fecha_fin_ajuste_planeado;
  const real = row.fecha_fin_ajuste_real;
  const calidad = row.fecha_protocolo_aceptacion;
  const cliente = row.fecha_entrega_cliente;

  return {
    inicio,
    teorico,
    real,
    calidad,
    cliente,
    inicio_teorico: daysBetween_cor(inicio, teorico),
    teorico_real: daysBetween_cor(teorico, real),
    real_calidad: daysBetween_cor(real, calidad),
    calidad_cliente: daysBetween_cor(calidad, cliente),
    inicio_real: daysBetween_cor(inicio, real),
    inicio_calidad: daysBetween_cor(inicio, calidad),
    inicio_cliente: daysBetween_cor(inicio, cliente)
  };
}

function hasAnyMetric_cor(metrics) {
  return [
    metrics.inicio_teorico,
    metrics.teorico_real,
    metrics.real_calidad,
    metrics.calidad_cliente,
    metrics.inicio_real,
    metrics.inicio_calidad,
    metrics.inicio_cliente
  ].some(value => value !== null);
}

function yearKey_cor(value) {
  const normalized = cleanText_cor(value);
  return normalized || SIN_ANIO_VALUE_COR;
}

function yearLabel_cor(value) {
  return value === SIN_ANIO_VALUE_COR ? '(sin año)' : value;
}

function compareYears_cor(a, b) {
  if (a === SIN_ANIO_VALUE_COR) return 1;
  if (b === SIN_ANIO_VALUE_COR) return -1;

  const aNumber = Number(a);
  const bNumber = Number(b);
  if (Number.isFinite(aNumber) && Number.isFinite(bNumber) && aNumber !== bNumber) {
    return bNumber - aNumber;
  }
  return String(b).localeCompare(String(a), 'es', { sensitivity: 'base', numeric: true });
}

function compareYearsAscending_cor(a, b) {
  if (a === SIN_ANIO_VALUE_COR) return 1;
  if (b === SIN_ANIO_VALUE_COR) return -1;

  const aNumber = Number(a);
  const bNumber = Number(b);
  if (Number.isFinite(aNumber) && Number.isFinite(bNumber) && aNumber !== bNumber) {
    return aNumber - bNumber;
  }
  return String(a).localeCompare(String(b), 'es', { sensitivity: 'base', numeric: true });
}

function average_cor(metricsList, field) {
  const values = metricsList
    .map(metrics => metrics[field])
    .filter(value => value !== null);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function buildYearCatalog_cor(qualifiedRows) {
  const counts = new Map();
  for (const item of qualifiedRows) {
    const key = yearKey_cor(item.row.anio_termino);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return [...counts.entries()]
    .sort(([a], [b]) => compareYears_cor(a, b))
    .map(([valor, total]) => ({
      valor,
      etiqueta: yearLabel_cor(valor),
      total_equipos: total
    }));
}

function buildTypeCatalog_cor(qualifiedRows) {
  const counts = new Map();

  for (const item of qualifiedRows) {
    const numeroPisos = item.row.numero_pisos;
    const capacidadKg = item.row.capacidad_kg;
    if (numeroPisos === null || numeroPisos === undefined || numeroPisos === '') continue;
    if (capacidadKg === null || capacidadKg === undefined || capacidadKg === '') continue;

    const clave = `${String(numeroPisos)}|${String(capacidadKg)}`;
    if (!counts.has(clave)) {
      counts.set(clave, {
        clave,
        numero_pisos: String(numeroPisos),
        capacidad_kg: String(capacidadKg),
        total_equipos: 0
      });
    }
    counts.get(clave).total_equipos += 1;
  }

  return [...counts.values()]
    .filter(item => item.total_equipos >= 5)
    .sort((a, b) => b.total_equipos - a.total_equipos);
}

function qualifyRows_cor(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => ({ row, metrics: metrics_cor(row) }))
    .filter(item => hasAnyMetric_cor(item.metrics));
}

async function resolvePermissions_cor(userId) {
  const entries = Object.entries(PERMISSIONS_COR);
  const values = await Promise.all(
    entries.map(([, code]) => hasEffectivePermission(userId, code))
  );
  return Object.fromEntries(entries.map(([key], index) => [key, Boolean(values[index])]));
}

async function getBootstrap_cor(userId) {
  const permissions = await resolvePermissions_cor(userId);
  const shouldLoadSource = permissions.comportamiento_selector_ver || permissions.detalle_ver;
  const sourceRows = shouldLoadSource ? await repository.listBootstrapSource_cor() : [];
  const qualifiedRows = qualifyRows_cor(sourceRows);

  return {
    module: 'instalaciones-ajuste',
    reglas: {
      estatus_fuente: '08-T',
      considera_activos_e_inactivos: true,
      requiere_metrica_calculable: true,
      tipo_minimo_equipos: 5,
      formatos_fecha_interpretados: ['YYYY-MM-DD', 'DD-Mon-AA']
    },
    permisos: permissions,
    total_historico_calificado: qualifiedRows.length,
    tipos_equipo: permissions.comportamiento_selector_ver
      ? buildTypeCatalog_cor(qualifiedRows)
      : [],
    anios: permissions.detalle_ver
      ? buildYearCatalog_cor(qualifiedRows)
      : []
  };
}

function normalizeTypeQuery_cor(query = {}) {
  const numeroPisos = rawText_cor(query.numero_pisos);
  const capacidadKg = rawText_cor(query.capacidad_kg);

  if (!numeroPisos) {
    throw validationError_cor('numero_pisos es obligatorio.', 'numero_pisos', query.numero_pisos);
  }
  if (!capacidadKg) {
    throw validationError_cor('capacidad_kg es obligatorio.', 'capacidad_kg', query.capacidad_kg);
  }
  if (numeroPisos.length > 255) {
    throw validationError_cor('numero_pisos excede la longitud permitida.', 'numero_pisos', query.numero_pisos);
  }
  if (capacidadKg.length > 255) {
    throw validationError_cor('capacidad_kg excede la longitud permitida.', 'capacidad_kg', query.capacidad_kg);
  }

  return { numeroPisos, capacidadKg };
}

async function getBehavior_cor(query) {
  const { numeroPisos, capacidadKg } = normalizeTypeQuery_cor(query);
  const rows = await repository.listTypeSource_cor(numeroPisos, capacidadKg);
  const qualifiedRows = qualifyRows_cor(rows);
  const grouped = new Map();

  for (const item of qualifiedRows) {
    const key = yearKey_cor(item.row.anio_termino);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item.metrics);
  }

  const porAnio = [...grouped.entries()]
    .sort(([a], [b]) => compareYearsAscending_cor(a, b))
    .map(([anio, metricsList]) => ({
      anio,
      etiqueta_anio: yearLabel_cor(anio),
      total_equipos: metricsList.length,
      promedio_dias_inicio_real: average_cor(metricsList, 'inicio_real'),
      promedio_dias_inicio_calidad: average_cor(metricsList, 'inicio_calidad'),
      promedio_dias_inicio_cliente: average_cor(metricsList, 'inicio_cliente')
    }));

  return {
    tipo: {
      clave: `${numeroPisos}|${capacidadKg}`,
      numero_pisos: numeroPisos,
      capacidad_kg: capacidadKg,
      total_equipos: qualifiedRows.length
    },
    por_anio: porAnio
  };
}

function normalizeYearFilter_cor(query = {}) {
  const rawYear = cleanText_cor(query.anio);
  if (!rawYear) return null;
  if (rawYear.length > 255) {
    throw validationError_cor('anio excede la longitud permitida.', 'anio', query.anio);
  }

  return rawYear === SIN_ANIO_VALUE_COR
    ? { valor: SIN_ANIO_VALUE_COR, sin_anio: true }
    : { valor: rawYear, sin_anio: false };
}

function normalizeDetailTypeFilter_cor(query = {}) {
  const numeroPisos = rawText_cor(query.numero_pisos);
  const capacidadKg = rawText_cor(query.capacidad_kg);
  if (!numeroPisos && !capacidadKg) return null;
  return normalizeTypeQuery_cor(query);
}

function inverted_cor(currentValue, previousValue) {
  const current = parseDate_cor(currentValue);
  const previous = parseDate_cor(previousValue);
  return Boolean(current && previous && current < previous);
}

function mapDetailRow_cor(item) {
  const row = item.row;
  const metrics = item.metrics;

  return {
    id_ins_fl: Number(row.id_ins_fl) || null,
    id_proyecto: row.id_proyecto || null,
    proyecto: row.proyecto || null,
    referencia_sitio: row.referencia_sitio || null,
    numero_pisos: row.numero_pisos || null,
    capacidad_kg: row.capacidad_kg || null,
    anio_termino: cleanText_cor(row.anio_termino) || null,
    activo: Number(row.activo) === 1 ? 1 : 0,
    fechas: {
      inicio_ajuste: metrics.inicio || null,
      fin_teorico: metrics.teorico || null,
      fin_real: metrics.real || null,
      entrega_calidad: metrics.calidad || null,
      entrega_cliente: metrics.cliente || null
    },
    dias: {
      inicio_teorico: metrics.inicio_teorico,
      teorico_real: metrics.teorico_real,
      real_calidad: metrics.real_calidad,
      calidad_cliente: metrics.calidad_cliente,
      inicio_real: metrics.inicio_real,
      inicio_calidad: metrics.inicio_calidad,
      inicio_cliente: metrics.inicio_cliente
    },
    inversiones_fecha: {
      fin_teorico_antes_inicio: inverted_cor(metrics.teorico, metrics.inicio),
      fin_real_antes_inicio: inverted_cor(metrics.real, metrics.inicio),
      calidad_antes_real: inverted_cor(metrics.calidad, metrics.real),
      cliente_antes_calidad: inverted_cor(metrics.cliente, metrics.calidad)
    }
  };
}

async function getDetail_cor(query = {}) {
  const yearFilter = normalizeYearFilter_cor(query);
  const typeFilter = normalizeDetailTypeFilter_cor(query);
  const limit = positiveInteger_cor(query.limit, 'limit', DEFAULT_LIMIT_COR, MAX_LIMIT_COR);
  const offset = nonNegativeInteger_cor(query.offset, 'offset', 0);

  const rows = await repository.listYearSource_cor(yearFilter, typeFilter);
  const qualifiedRows = qualifyRows_cor(rows);
  const pagedRows = qualifiedRows.slice(offset, offset + limit).map(mapDetailRow_cor);

  return {
    anio: yearFilter ? yearFilter.valor : null,
    etiqueta_anio: yearFilter ? yearLabel_cor(yearFilter.valor) : 'Todos los años',
    tipo: typeFilter ? {
      clave: `${typeFilter.numeroPisos}|${typeFilter.capacidadKg}`,
      numero_pisos: typeFilter.numeroPisos,
      capacidad_kg: typeFilter.capacidadKg
    } : null,
    pagination: {
      limit,
      offset,
      total: qualifiedRows.length,
      returned: pagedRows.length
    },
    data: pagedRows
  };
}

module.exports = {
  PERMISSIONS_COR,
  SIN_ANIO_VALUE_COR,
  getBootstrap_cor,
  getBehavior_cor,
  getDetail_cor
};
