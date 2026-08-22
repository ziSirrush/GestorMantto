'use strict';

const reporteService = require('../instalaciones-reporte/instalaciones-reporte.service');

const PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 5000;
const STATUS_03_PM = '03-PM';
const STATUS_04_M = '04-M';

function validationError(message, field, value) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'INSTALACIONES_PMM_VALIDATION';
  error.details = { field, value };
  return error;
}

function normalizePage(value) {
  if (value === undefined || value === null || value === '') return 1;
  const page = Number(value);
  if (!Number.isInteger(page) || page <= 0) {
    throw validationError('page debe ser un entero positivo.', 'page', value);
  }
  return page;
}

function normalizePageSize(value) {
  if (value === undefined || value === null || value === '') return PAGE_SIZE;
  const pageSize = Number(value);
  if (!Number.isInteger(pageSize) || pageSize <= 0 || pageSize > MAX_PAGE_SIZE) {
    throw validationError(
      `page_size debe ser un entero entre 1 y ${MAX_PAGE_SIZE}.`,
      'page_size',
      value
    );
  }
  return pageSize;
}

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function dateSortValue(value) {
  const text = cleanText(value);
  if (!text || text === '-' || text === '.') return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return Number(`${iso[1]}${iso[2]}${iso[3]}`);

  const slash = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (slash) {
    return Number(`${slash[3]}${String(slash[2]).padStart(2, '0')}${String(slash[1]).padStart(2, '0')}`);
  }

  const months = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
  };
  const legacy = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/);
  if (!legacy) return null;
  const month = months[String(legacy[2]).toUpperCase()];
  if (!month) return null;
  const year = legacy[3].length === 2 ? `20${legacy[3]}` : legacy[3];
  return Number(`${year}${month}${String(legacy[1]).padStart(2, '0')}`);
}

function stableRowCompare(a, b) {
  const project = cleanText(a.proyecto).localeCompare(cleanText(b.proyecto), 'es', {
    sensitivity: 'base',
    numeric: true
  });
  if (project !== 0) return project;
  const reference = cleanText(a.referencia_sitio).localeCompare(cleanText(b.referencia_sitio), 'es', {
    sensitivity: 'base',
    numeric: true
  });
  if (reference !== 0) return reference;
  return Number(a.id_ins_fl || 0) - Number(b.id_ins_fl || 0);
}

function sortStageRows(status, rows) {
  const source = Array.isArray(rows) ? [...rows] : [];
  if (status !== STATUS_03_PM) return source.sort(stableRowCompare);

  return source.sort((a, b) => {
    const aDate = dateSortValue(a.fecha_posible_recepcion_cubo);
    const bDate = dateSortValue(b.fecha_posible_recepcion_cubo);
    if (aDate !== null && bDate === null) return -1;
    if (aDate === null && bDate !== null) return 1;
    if (aDate !== null && bDate !== null && aDate !== bDate) return aDate - bDate;
    return stableRowCompare(a, b);
  });
}

function pickVisualConfig(report, status) {
  const source = report && report.estados_visuales && typeof report.estados_visuales === 'object'
    ? report.estados_visuales
    : {};
  const byStatus = source.por_estatus && typeof source.por_estatus === 'object'
    ? source.por_estatus
    : {};
  const statusItems = Array.isArray(byStatus[status]) ? byStatus[status] : [];
  const allowedCodes = new Set(statusItems.map(item => String(item && item.codigo || '').trim()).filter(Boolean));
  const catalog = Array.isArray(source.catalogo)
    ? source.catalogo.filter(item => allowedCodes.has(String(item && item.codigo || '').trim()))
    : statusItems;

  return {
    catalogo: catalog,
    por_estatus: {
      [status]: statusItems
    }
  };
}

function baseRow(row) {
  return {
    id_ins_fl: row.id_ins_fl,
    id_proyecto: row.id_proyecto,
    estatus: row.estatus,
    id_sup: row.id_sup,
    supervisor_fl: row.supervisor_fl,
    proyecto: row.proyecto,
    referencia_sitio: row.referencia_sitio,
    comentarios_fl: row.comentarios_fl,
    estados_visuales_codigos: Array.isArray(row.estados_visuales_codigos)
      ? row.estados_visuales_codigos
      : []
  };
}

function map03Pm(row) {
  return {
    ...baseRow(row),
    avance_oc: row.avance_oc,
    fecha_posible_recepcion_cubo: row.fecha_posible_recepcion_cubo
  };
}

function map04M(row) {
  return {
    ...baseRow(row),
    avance_mo: row.avance_mo,
    fecha_ccr: row.fecha_ccr,
    subcontratista: row.subcontratista,
    fecha_inicio_montaje: row.fecha_inicio_montaje,
    fecha_fin_montaje_planeado: row.fecha_fin_montaje_planeado,
    fecha_fin_montaje_modificado: row.fecha_fin_montaje_modificado,
    fecha_fin_montaje_real: row.fecha_fin_montaje_real,
    dias_restantes: row.dias_restantes
  };
}

async function getStageTable(status, query, mapper, informationAccess) {
  const page = normalizePage(query && query.page);
  const pageSize = normalizePageSize(query && query.page_size);
  const offset = (page - 1) * pageSize;
  const supervisor = cleanText(query && query.supervisor);

  const report = await reporteService.getReport({
    estatus: status,
    supervisor: supervisor || undefined,
    limit: MAX_PAGE_SIZE,
    offset: 0
  }, informationAccess);

  const rows = sortStageRows(status, report && report.data);
  const total = Number(report && report.pagination && report.pagination.total || 0);
  const pagedRows = rows.slice(offset, offset + pageSize);

  return {
    module: 'instalaciones-pmm',
    tabla: status,
    generated_at: report.generated_at || new Date().toISOString(),
    fecha_reglas: report.fecha_reglas || null,
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize),
      returned: pagedRows.length
    },
    estados_visuales: pickVisualConfig(report, status),
    data: pagedRows.map(mapper)
  };
}

function getTable03Pm(query = {}, informationAccess = null) {
  return getStageTable(STATUS_03_PM, query, map03Pm, informationAccess);
}

function getTable04M(query = {}, informationAccess = null) {
  return getStageTable(STATUS_04_M, query, map04M, informationAccess);
}

module.exports = {
  PAGE_SIZE,
  MAX_PAGE_SIZE,
  getTable03Pm,
  getTable04M
};
