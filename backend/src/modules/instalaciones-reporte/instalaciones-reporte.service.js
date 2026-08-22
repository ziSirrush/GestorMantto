'use strict';

const repository = require('./instalaciones-reporte.repository');

const STATUS_NAMES = Object.freeze({
  '01-SUS': 'Equipos Suspendidos',
  '02-OC': 'Equipos en Obra Civil',
  '03-PM': 'Equipos Próximos a Montar',
  '04-M': 'Equipos en Montaje',
  '05-PA': 'Equipos Próximos a Ajustar',
  '06-A': 'Equipos en Ajuste',
  '07-PE': 'Equipos Próximos a Entregar',
  '08-T': 'Equipos Entregados'
});

const VISUAL_STATE_CODES = Object.freeze([
  'POSIBLE_SUSPENSION',
  'MONTAJE_ATRASADO',
  'AJUSTE_ATRASADO',
  'PENDIENTES_CALIDAD',
  'EQUIPO_ENTREGA_DETENIDO',
  'FALTA_CCR',
  'FALTA_CTI',
  'NO_LIBERADO_AJUSTE',
  'FALTA_REVISION_SUPERVISOR',
  'FALTA_FORMATO_ORIGINAL',
  'FALTA_PRIMERA_CCNR',
  'ACTUALIZAR_CCNR',
  'REQUIERE_VISITA',
  'DEBERIA_ESTAR_MONTAJE',
  'PROGRAMAR_MONTADOR',
  'MONTAJE_3_DIAS',
  'MONTAJE_7_DIAS',
  'MONTAJE_14_DIAS',
  'FIN_AJUSTE_MODIFICADO'
]);

const VISUAL_STATES_BY_STATUS = Object.freeze({
  '01-SUS': Object.freeze([]),
  '02-OC': Object.freeze([
    'POSIBLE_SUSPENSION',
    'REQUIERE_VISITA',
    'ACTUALIZAR_CCNR',
    'FALTA_PRIMERA_CCNR'
  ]),
  '03-PM': Object.freeze([
    'DEBERIA_ESTAR_MONTAJE',
    'PROGRAMAR_MONTADOR',
    'REQUIERE_VISITA',
    'ACTUALIZAR_CCNR',
    'FALTA_PRIMERA_CCNR'
  ]),
  '04-M': Object.freeze([
    'MONTAJE_14_DIAS',
    'MONTAJE_7_DIAS',
    'MONTAJE_3_DIAS',
    'FALTA_CCR',
    'MONTAJE_ATRASADO',
    'REQUIERE_VISITA'
  ]),
  '05-PA': Object.freeze([
    'FALTA_REVISION_SUPERVISOR',
    'NO_LIBERADO_AJUSTE',
    'FALTA_CTI',
    'REQUIERE_VISITA'
  ]),
  '06-A': Object.freeze([
    'AJUSTE_ATRASADO',
    'FIN_AJUSTE_MODIFICADO',
    'REQUIERE_VISITA',
    'FALTA_REVISION_SUPERVISOR',
    'NO_LIBERADO_AJUSTE',
    'FALTA_CTI'
  ]),
  '07-PE': Object.freeze([
    'PENDIENTES_CALIDAD'
  ]),
  '08-T': Object.freeze([
    'PENDIENTES_CALIDAD',
    'FALTA_FORMATO_ORIGINAL',
    'EQUIPO_ENTREGA_DETENIDO'
  ])
});

const DEFAULT_LIMIT = 5000;
const MAX_LIMIT = 5000;
const MONTHS = Object.freeze({
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12
});

function validationError(message, field, value) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'INSTALACIONES_REPORTE_VALIDATION';
  error.details = { field, value };
  return error;
}

function catalogError(missingCodes) {
  const error = new Error('El catálogo de Estados Visuales para Reporte de Instalaciones está incompleto.');
  error.statusCode = 500;
  error.code = 'INSTALACIONES_REPORTE_ESTADOS_VISUALES_INCOMPLETOS';
  error.details = { codigos_faltantes: missingCodes };
  return error;
}

function cleanText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function positiveInteger(value, field, options = {}) {
  if (value === undefined || value === null || value === '') {
    return options.defaultValue === undefined ? null : options.defaultValue;
  }

  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw validationError(`${field} debe ser un entero positivo.`, field, value);
  }

  if (options.max && normalized > options.max) {
    throw validationError(`${field} no puede ser mayor a ${options.max}.`, field, value);
  }

  return normalized;
}

function nonNegativeInteger(value, field, defaultValue = 0) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw validationError(`${field} debe ser un entero mayor o igual a 0.`, field, value);
  }
  return normalized;
}

function optionalYear(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const text = cleanText(value);
  if (!/^\d{4}$/.test(text)) {
    throw validationError(`${field} debe ser un año de 4 dígitos disponible en anio_termino.`, field, value);
  }
  return Number(text);
}

function normalizeFilters(query = {}) {
  const estatus = cleanText(query.estatus).toUpperCase();
  if (estatus && !repository.REPORT_STATUSES.includes(estatus)) {
    throw validationError(
      `estatus debe ser uno de: ${repository.REPORT_STATUSES.join(', ')}.`,
      'estatus',
      query.estatus
    );
  }

  return {
    estatus: estatus || null,
    id_sup: positiveInteger(query.id_sup, 'id_sup'),
    supervisor: cleanText(query.supervisor) || null,
    id_asesor: positiveInteger(query.id_asesor, 'id_asesor'),
    asesor: cleanText(query.asesor) || null,
    anio_termino: optionalYear(query.anio_termino, 'anio_termino'),
    limit: positiveInteger(query.limit, 'limit', {
      defaultValue: DEFAULT_LIMIT,
      max: MAX_LIMIT
    }),
    offset: nonNegativeInteger(query.offset, 'offset', 0)
  };
}

function mapOptions(rows) {
  const supervisors = [];
  const advisors = [];
  const statusCounts = new Map();

  for (const row of rows) {
    const type = String(row.tipo || '').toUpperCase();
    const total = Number(row.total || 0);

    if (type === 'SUPERVISOR') {
      supervisors.push({
        id_sup: row.id_valor ? Number(row.id_valor) || null : null,
        nombre: row.nombre || '',
        total
      });
      continue;
    }

    if (type === 'ASESOR') {
      advisors.push({
        id_asesor: row.id_valor ? Number(row.id_valor) || null : null,
        nombre: row.nombre || '',
        total
      });
      continue;
    }

    if (type === 'ESTATUS' && row.codigo) {
      statusCounts.set(String(row.codigo), total);
    }
  }

  return {
    supervisores: supervisors,
    asesores: advisors,
    estatus: repository.REPORT_STATUSES.map(codigo => ({
      codigo,
      nombre: STATUS_NAMES[codigo],
      total: statusCounts.get(codigo) || 0
    }))
  };
}

function mapSummary(rows) {
  const counts = new Map(
    rows.map(row => [String(row.estatus), Number(row.total || 0)])
  );

  const porEstatus = repository.REPORT_STATUSES.map(codigo => ({
    codigo,
    nombre: STATUS_NAMES[codigo],
    total: counts.get(codigo) || 0
  }));

  return {
    total: porEstatus.reduce((sum, item) => sum + item.total, 0),
    por_estatus: porEstatus
  };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '' || value === '-') return null;
  const normalized = Number.parseFloat(String(value).trim().replace(',', '.'));
  return Number.isFinite(normalized) ? normalized : null;
}

function percentageOrNull(value) {
  if (value === null || value === undefined || value === '' || value === '-') return null;
  const text = String(value).trim();
  const normalized = Number.parseFloat(text.includes('%') ? text : text.replace(',', '.'));
  if (!Number.isFinite(normalized)) return null;
  return normalized <= 1 ? normalized * 100 : normalized;
}

function isEmptyMarker(value) {
  if (value === null || value === undefined) return true;
  const text = String(value).trim();
  return text === '' || text === '-' || text === '.';
}

function dateKey(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === '-' || text === '.') return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return Number(iso[1] + iso[2] + iso[3]);

  const slash = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (slash) {
    return Number(
      slash[3] +
      String(slash[2]).padStart(2, '0') +
      String(slash[1]).padStart(2, '0')
    );
  }

  const legacy = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/);
  if (legacy) {
    const month = MONTHS[String(legacy[2]).toUpperCase()];
    if (!month) return null;
    const year = legacy[3].length === 2 ? `20${legacy[3]}` : legacy[3];
    return Number(year + String(month).padStart(2, '0') + String(legacy[1]).padStart(2, '0'));
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return Number(
    String(parsed.getUTCFullYear()) +
    String(parsed.getUTCMonth() + 1).padStart(2, '0') +
    String(parsed.getUTCDate()).padStart(2, '0')
  );
}

function commonVisitCcnrCodes(row) {
  const codes = [];
  const diasVisita = numberOrNull(row.dias_sin_visita);
  const enSitio = cleanText(row.estatus_produccion) === 'En Sitio';
  const tieneCcnr = !isEmptyMarker(row.fecha_ccnr);
  const diasCcnr = numberOrNull(row.dias_sin_ccnr);

  if (enSitio && !tieneCcnr) codes.push('FALTA_PRIMERA_CCNR');
  if (enSitio && tieneCcnr && diasCcnr !== null && diasCcnr >= 45) codes.push('ACTUALIZAR_CCNR');
  if (diasVisita !== null && diasVisita >= 45) codes.push('REQUIERE_VISITA');

  return { codes, diasVisita };
}

function evaluateVisualStateCodes(row, currentDate) {
  const status = cleanText(row.estatus).toUpperCase();
  const result = [];

  if (status === '02-OC') {
    const common = commonVisitCcnrCodes(row);
    if (common.diasVisita !== null && common.diasVisita > 200) result.push('POSIBLE_SUSPENSION');
    result.push(...common.codes);
    return result;
  }

  if (status === '03-PM') {
    const pctOc = percentageOrNull(row.avance_oc);
    if (pctOc === 100) result.push('DEBERIA_ESTAR_MONTAJE');
    else if (pctOc !== null && pctOc >= 95) result.push('PROGRAMAR_MONTADOR');
    result.push(...commonVisitCcnrCodes(row).codes);
    return result;
  }

  if (status === '04-M') {
    const diasRestantes = numberOrNull(row.dias_restantes);
    if (diasRestantes !== null) {
      if (diasRestantes < 0) result.push('MONTAJE_ATRASADO');
      else if (diasRestantes <= 3) result.push('MONTAJE_3_DIAS');
      else if (diasRestantes <= 7) result.push('MONTAJE_7_DIAS');
      else if (diasRestantes <= 14) result.push('MONTAJE_14_DIAS');
    }
    if (isEmptyMarker(row.fecha_ccr)) result.push('FALTA_CCR');
    const diasVisita = numberOrNull(row.dias_sin_visita);
    if (diasVisita !== null && diasVisita >= 45) result.push('REQUIERE_VISITA');
    return result;
  }

  if (status === '05-PA') {
    if (isEmptyMarker(row.fecha_revision_supervisor)) result.push('FALTA_REVISION_SUPERVISOR');
    if (cleanText(row.fecha_liberacion_ajuste) !== 'SI') result.push('NO_LIBERADO_AJUSTE');
    if (isEmptyMarker(row.fecha_cti)) result.push('FALTA_CTI');
    const diasVisita = numberOrNull(row.dias_sin_visita);
    if (diasVisita !== null && diasVisita >= 45) result.push('REQUIERE_VISITA');
    return result;
  }

  if (status === '06-A') {
    const planned = dateKey(row.fecha_fin_ajuste_planeado);
    const today = dateKey(currentDate);
    if (planned !== null && today !== null && planned < today) result.push('AJUSTE_ATRASADO');
    if (!isEmptyMarker(row.fecha_fin_ajuste_modificado)) result.push('FIN_AJUSTE_MODIFICADO');
    if (isEmptyMarker(row.fecha_revision_supervisor)) result.push('FALTA_REVISION_SUPERVISOR');
    if (cleanText(row.fecha_liberacion_ajuste) !== 'SI') result.push('NO_LIBERADO_AJUSTE');
    if (isEmptyMarker(row.fecha_cti)) result.push('FALTA_CTI');
    const diasVisita = numberOrNull(row.dias_sin_visita);
    if (diasVisita !== null && diasVisita >= 45) result.push('REQUIERE_VISITA');
    return result;
  }

  if (status === '07-PE') {
    if (cleanText(row.pendientes_calidad) === 'Con Pendientes') result.push('PENDIENTES_CALIDAD');
    return result;
  }

  if (status === '08-T') {
    if (cleanText(row.pendientes_calidad) === 'Con Pendientes') result.push('PENDIENTES_CALIDAD');
    if (cleanText(row.formato_caf_pg) !== 'Original') result.push('FALTA_FORMATO_ORIGINAL');
    if (cleanText(row.estatus_equipo_entrega) === 'Detenido') result.push('EQUIPO_ENTREGA_DETENIDO');
    return result;
  }

  return result;
}

function normalizeVisualCatalog(rows) {
  const catalog = (Array.isArray(rows) ? rows : []).map(row => ({
    id_estado_visual: Number(row.id_estado_visual) || null,
    codigo: cleanText(row.codigo),
    nombre: cleanText(row.nombre),
    descripcion: cleanText(row.descripcion) || null,
    categoria: cleanText(row.categoria),
    emoji: cleanText(row.emoji) || null,
    icono: cleanText(row.icono) || null,
    color_texto: cleanText(row.color_texto) || null,
    color_fondo: cleanText(row.color_fondo) || null,
    color_borde: cleanText(row.color_borde) || null,
    prioridad: Number(row.prioridad) || 100
  }));

  const found = new Set(catalog.map(row => row.codigo));
  const missing = VISUAL_STATE_CODES.filter(code => !found.has(code));
  if (missing.length) throw catalogError(missing);

  return catalog;
}

function visualStateConfig(catalog) {
  const byCode = new Map(catalog.map(row => [row.codigo, row]));
  const byStatus = {};

  for (const status of repository.REPORT_STATUSES) {
    byStatus[status] = (VISUAL_STATES_BY_STATUS[status] || [])
      .map(code => byCode.get(code))
      .filter(Boolean);
  }

  return {
    catalogo: catalog,
    por_estatus: byStatus
  };
}

async function getReport(query, informationAccess) {
  const filters = normalizeFilters(query);
  const [availableYears, currentDate] = await Promise.all([
    repository.getDeliveredYears(informationAccess),
    repository.getRulesDate()
  ]);

  const deliveredYear = filters.anio_termino !== null
    ? filters.anio_termino
    : (availableYears[0] || null);

  if (filters.anio_termino !== null && !availableYears.includes(filters.anio_termino)) {
    throw validationError(
      'anio_termino no está disponible para equipos entregados 08-T.',
      'anio_termino',
      filters.anio_termino
    );
  }

  const [rows, countRows, optionRows, visualStateRows] = await Promise.all([
    repository.listReportRows(filters, deliveredYear, informationAccess),
    repository.countReportRowsByStatus(filters, deliveredYear, informationAccess),
    repository.getFilterOptions(deliveredYear, informationAccess),
    repository.getVisualStates(VISUAL_STATE_CODES)
  ]);

  const catalog = normalizeVisualCatalog(visualStateRows);
  const data = rows.map(row => ({
    ...row,
    estados_visuales_codigos: evaluateVisualStateCodes(row, currentDate)
  }));
  const summary = mapSummary(countRows);

  return {
    module: 'instalaciones-reporte',
    generated_at: new Date().toISOString(),
    anio_entregados: deliveredYear,
    anios_entregados_disponibles: availableYears,
    fecha_reglas: currentDate,
    reglas: {
      solo_activos: true,
      entregados_por_anio_termino: true,
      oc_significa: 'Obra Civil',
      estados_visuales_dinamicos: true
    },
    applied_filters: {
      estatus: filters.estatus,
      id_sup: filters.id_sup,
      supervisor: filters.supervisor,
      id_asesor: filters.id_asesor,
      asesor: filters.asesor,
      anio_termino: deliveredYear
    },
    pagination: {
      limit: filters.limit,
      offset: filters.offset,
      total: summary.total,
      returned: data.length
    },
    summary,
    filters: {
      ...mapOptions(optionRows),
      anios_entregados: availableYears
    },
    estados_visuales: visualStateConfig(catalog),
    data
  };
}

module.exports = {
  getReport
};
