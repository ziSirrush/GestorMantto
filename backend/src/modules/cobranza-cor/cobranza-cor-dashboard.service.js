'use strict';

// DS Cobranza COR: orquestacion de lectura. No implementa ni modifica formulas financieras.
// El motor se carga al atender una consulta, no al importar el modulo en QA.
const MAX_PROJECTS_PER_PAGE = 8;
const DETAIL_CONCURRENCY = 2;
const CURRENCIES = new Set(['MXN', 'USD', 'EUR', 'SIN_MONEDA']);

function badRequestDashboard_cor(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function parsePositiveInteger_cor(value, fallback, max, label) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) throw badRequestDashboard_cor(label + ' debe ser entero positivo.');
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) {
    throw badRequestDashboard_cor(label + ' fuera del rango permitido.');
  }
  return number;
}

function normalizeFilter_cor(value, max, label) {
  const text = String(value ?? '').trim();
  if (text.length > max) throw badRequestDashboard_cor(label + ' excede la longitud permitida.');
  return text;
}

function normalizeKey_cor(value) {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeDashboardQuery_cor(query = {}) {
  const pagina = parsePositiveInteger_cor(query.pagina, 1, 100000, 'pagina');
  const tamano = parsePositiveInteger_cor(query.tamano, 8, MAX_PROJECTS_PER_PAGE, 'tamano');
  const q = normalizeFilter_cor(query.q, 200, 'busqueda');
  const asesor = normalizeFilter_cor(query.asesor, 100, 'asesor');
  const moneda = normalizeKey_cor(normalizeFilter_cor(query.moneda, 20, 'moneda'));
  if (moneda && !CURRENCIES.has(moneda)) {
    throw badRequestDashboard_cor('Moneda no admitida.');
  }
  let anio = null;
  if (query.anio !== undefined && query.anio !== null && String(query.anio).trim() !== '') {
    anio = parsePositiveInteger_cor(query.anio, 0, 9999, 'anio');
    if (anio < 1900 || anio > 2100) throw badRequestDashboard_cor('anio fuera del rango permitido.');
  }
  return { pagina, tamano, q, asesor, moneda, anio };
}

function advisorMatches_cor(project, advisor) {
  if (!advisor) return true;
  // Las iniciales se reciben de la consulta oficial de Estados de Cuenta.
  const values = String(project?.asesor ?? '').split('-').map(v => normalizeKey_cor(v)).filter(Boolean);
  return values.includes(normalizeKey_cor(advisor));
}

function currencyMatches_cor(project, currency) {
  if (!currency) return true;
  const currencies = Array.isArray(project?.monedas) ? project.monedas : [];
  if (currency === 'SIN_MONEDA') return currencies.length === 0 || currencies.some(v => !normalizeKey_cor(v) || !CURRENCIES.has(normalizeKey_cor(v)));
  return currencies.some(v => normalizeKey_cor(v) === currency);
}

async function listarDashboard_cor(query = {}, informationAccess, injectedMotor = null) {
  const motor = injectedMotor || require('./cobranza-cor.service');
  const filters = normalizeDashboardQuery_cor(query);
  // Misma validacion de alcance CORELLIAN y mismo catalogo PPNS que Estados de Cuenta.
  const listado = await motor.listarEstadosCuenta_cor(
    { q: filters.q, anio: filters.anio },
    informationAccess
  );
  const records = Array.isArray(listado?.data) ? listado.data : [];
  const catalogYears = [...new Set(records.flatMap(row =>
    Array.isArray(row?.anios) ? row.anios.map(Number).filter(Number.isInteger) : []
  ))].sort((a, b) => b - a);
  const catalogAdvisors = [...new Set(records.flatMap(row =>
    String(row?.asesor ?? '').split('-').map(v => v.trim()).filter(Boolean)
  ))].sort((a, b) => a.localeCompare(b, 'es'));
  const seen = new Set();
  const allowed = records.filter(row => {
    const ppns = normalizeKey_cor(row?.ppns);
    if (!ppns || seen.has(ppns)) return false;
    seen.add(ppns);
    return advisorMatches_cor(row, filters.asesor) && currencyMatches_cor(row, filters.moneda);
  });
  const totalPages = Math.ceil(allowed.length / filters.tamano);
  const start = (filters.pagina - 1) * filters.tamano;
  const selected = allowed.slice(start, start + filters.tamano);
  const data = [];
  // Limite de 2 lecturas simultaneas: nunca cargar toda la cartera en una peticion.
  for (let i = 0; i < selected.length; i += DETAIL_CONCURRENCY) {
    const group = await Promise.all(selected.slice(i, i + DETAIL_CONCURRENCY).map(row =>
      motor.detalleEstadoCuenta_cor(row.ppns, informationAccess)
    ));
    data.push(...group);
  }
  return {
    ok: true,
    source: 'aiven',
    domain: 'CORELLIAN',
    route: '/api/cobranza-cor/dashboard',
    scope_aplicado: listado.scope_aplicado,
    motor: 'estados-cuenta',
    totales_parciales: true,
    filtros: { q: filters.q, asesor: filters.asesor, moneda: filters.moneda, anio: filters.anio },
    paginacion: {
      pagina: filters.pagina,
      tamano: filters.tamano,
      total_proyectos: allowed.length,
      total_paginas: totalPages,
      proyectos_pagina: data.length
    },
    catalogos: { anios: catalogYears, asesores: catalogAdvisors },
    data
  };
}

module.exports = {
  listarDashboard_cor,
  normalizeDashboardQuery_cor,
  advisorMatches_cor,
  currencyMatches_cor
};
