'use strict';

// DS Cobranza COR: orquestacion de lectura. No implementa ni modifica formulas financieras.
// El motor se carga al atender una consulta, no al importar el modulo en QA.
const MAX_PROJECTS_PER_PAGE = 8;
const MAX_SUMMARY_PAGE_SIZE = 24;
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
  const tipo = normalizeKey_cor(query.tipo || 'DETALLE');
  if (!['DETALLE', 'RESUMEN'].includes(tipo)) throw badRequestDashboard_cor('Tipo de consulta no admitido.');
  const pagina = parsePositiveInteger_cor(query.pagina, 1, 100000, 'pagina');
  const tamano = parsePositiveInteger_cor(query.tamano, tipo === 'RESUMEN' ? 24 : 8,
    tipo === 'RESUMEN' ? MAX_SUMMARY_PAGE_SIZE : MAX_PROJECTS_PER_PAGE, 'tamano');
  const q = normalizeFilter_cor(query.q, 200, 'busqueda');
  const asesorRaw = normalizeFilter_cor(query.asesor, 100, 'asesor');
  const asesor = asesorRaw ? parsePositiveInteger_cor(asesorRaw, null, Number.MAX_SAFE_INTEGER, 'asesor') : null;
  const moneda = normalizeKey_cor(normalizeFilter_cor(query.moneda, 20, 'moneda'));
  if (moneda && !CURRENCIES.has(moneda)) {
    throw badRequestDashboard_cor('Moneda no admitida.');
  }
  let anio = null;
  if (query.anio !== undefined && query.anio !== null && String(query.anio).trim() !== '') {
    anio = parsePositiveInteger_cor(query.anio, 0, 9999, 'anio');
    if (anio < 1900 || anio > 2100) throw badRequestDashboard_cor('anio fuera del rango permitido.');
  }
  let anioCobro = null;
  if (query.anio_cobro !== undefined && String(query.anio_cobro).trim() !== '') {
    anioCobro = parsePositiveInteger_cor(query.anio_cobro, null, 2100, 'anio_cobro');
    if (anioCobro < 1900) throw badRequestDashboard_cor('anio_cobro fuera del rango permitido.');
  }
  return { pagina, tamano, tipo, q, asesor, moneda, anio, anio_cobro: anioCobro };
}

function advisorMatches_cor(project, advisor) {
  if (!advisor) return true;
  return Number(project?.id_asesor) === Number(advisor);
}

function currencyMatches_cor(project, currency) {
  if (!currency) return true;
  const currencies = Array.isArray(project?.monedas) ? project.monedas : [];
  if (currency === 'SIN_MONEDA') return currencies.length === 0 || currencies.some(v => !normalizeKey_cor(v) || !CURRENCIES.has(normalizeKey_cor(v)));
  return currencies.some(v => normalizeKey_cor(v) === currency);
}

function groupAssignments_cor(rows) {
  const byPpns = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const ppns = normalizeKey_cor(row?.ppns_key);
    const id = Number(row?.id_asesor);
    if (!ppns || !Number.isSafeInteger(id) || id < 1) continue;
    if (!byPpns.has(ppns)) byPpns.set(ppns, new Map());
    const initial = String(row?.iniciales ?? '').trim();
    byPpns.get(ppns).set(id, initial || 'ID ' + id);
  }
  return byPpns;
}

function assignAdvisor_cor(project, assignments) {
  const ppns = normalizeKey_cor(project?.ppns);
  const advisors = [...(assignments.get(ppns) || new Map()).entries()];
  if (advisors.length === 1) {
    return { ...project, id_asesor: advisors[0][0], asesor: advisors[0][1],
      asesores_distintos: 1 };
  }
  if (advisors.length > 1) {
    return { ...project, id_asesor: null, asesor: 'Varios asesores (revisar)',
      asesores_distintos: advisors.length };
  }
  return { ...project, id_asesor: null, asesor: null, asesores_distintos: 0 };
}

// Proyeccion de solo lectura: envia al DS los campos que consume el motor
// visual de Estados de Cuenta sin formularios, adjuntos ni datos adicionales.
function projectFinancialSummary_cor(detail, project) {
  const pick = (row, fields) => Object.fromEntries(fields.map(key => [key, row?.[key] ?? null]));
  const sourceFields = [
    'id_fuente_cor','condicion','moneda','subtotal','iva','total',
    'factura_fuente','factura','estatus_factura_fuente',
    'pago_total_fuente','pago_total','pago_contabilizado','pendiente_calculado',
    'fecha_pago','fecha_vencimiento','condiciones_pago_dias',
    'dias_vencimiento','estimado_pago','estatus_vencimiento','anio_proyecto'
  ];
  const invoiceFields = [
    'id_factura_cor','ids_factura_cor','id_fuente_cor','tipo_concepto',
    'factura','moneda','pagado','importe_pagado','fecha_factura'
  ];
  return {
    proyecto: { ppns: project.ppns, proyecto: project.proyecto, asesor: project.asesor,
      id_asesor: project.id_asesor, asesores_distintos: project.asesores_distintos },
    estado_cuenta: (detail.estado_cuenta || []).map(row => pick(row, sourceFields)),
    facturas: (detail.facturas || []).map(row => pick(row, invoiceFields)),
    pagos: (detail.pagos || []).map(row => pick(row, ['id_pago_cor','fecha_pago'])),
    relaciones_pagos: (detail.relaciones_pagos || []).map(row =>
      pick(row, ['id_pago_cor','id_factura_cor','importe_aplicado']))
  };
}

async function listarDashboard_cor(query = {}, informationAccess, injectedMotor = null, injectedRepository = null) {
  const filters = normalizeDashboardQuery_cor(query);
  const motor = injectedMotor || require('./cobranza-cor.service');
  const repository = injectedRepository || require('./cobranza-cor.repository');

  // Solo obtenemos PPNS visibles a traves del motor de alcance CORELLIAN.
  const listado = await motor.listarEstadosCuenta_cor(
    { q: filters.q, anio: filters.anio },
    informationAccess
  );
  const records = Array.isArray(listado?.data) ? listado.data : [];
  const seen = new Set();
  const uniqueRecords = records.filter(row => {
    const ppns = normalizeKey_cor(row?.ppns);
    if (!ppns || seen.has(ppns)) return false;
    seen.add(ppns);
    return true;
  });

  // Una consulta por lote para traducir PPNS -> id_asesor. Sin ampliar scope:
  // la consulta recibe exclusivamente los PPNS autorizados arriba.
  let assignmentRows = [];
  if (uniqueRecords.length) {
    const connection = await repository.getConnection_cor();
    try {
      assignmentRows = await repository.listDashboardAdvisors_cor(
        connection, uniqueRecords.map(row => row.ppns)
      );
    } finally {
      connection.release();
    }
  }
  const assignments = groupAssignments_cor(assignmentRows);
  const enriched = uniqueRecords.map(row => assignAdvisor_cor(row, assignments));
  const catalogYears = [...new Set(enriched.flatMap(row =>
    Array.isArray(row?.anios) ? row.anios.map(Number).filter(Number.isInteger) : []
  ))].sort((a, b) => b - a);
  const catalogAdvisors = [...new Map(assignmentRows
    .filter(row => Number.isSafeInteger(Number(row.id_asesor)) && Number(row.id_asesor) > 0)
    .map(row => [Number(row.id_asesor), {
      id: Number(row.id_asesor), iniciales: String(row.iniciales || '').trim() || 'ID ' + row.id_asesor
    }])).values()].sort((a, b) => a.iniciales.localeCompare(b.iniciales, 'es'));

  const allowed = enriched.filter(row =>
    advisorMatches_cor(row, filters.asesor) && currencyMatches_cor(row, filters.moneda));
  const totalPages = Math.ceil(allowed.length / filters.tamano);
  const start = (filters.pagina - 1) * filters.tamano;
  const selected = allowed.slice(start, start + filters.tamano);
  const data = [];

  // Solo dos conexiones de detalle simultaneas; cada detalle usa el motor existente.
  for (let i = 0; i < selected.length; i += DETAIL_CONCURRENCY) {
    const batch = selected.slice(i, i + DETAIL_CONCURRENCY);
    const resolved = await Promise.all(batch.map(async row => {
      const detail = await motor.detalleEstadoCuenta_cor(row.ppns, informationAccess);
      const project = {
        ...detail.proyecto, id_asesor: row.id_asesor,
        asesor: row.asesor, asesores_distintos: row.asesores_distintos
      };
      // El modo resumen conserva los campos usados por el motor visual de Edo,
      // pero excluye catalogos de formulario y otras estructuras sin uso en el DS.
      return filters.tipo === 'RESUMEN'
        ? projectFinancialSummary_cor(detail, project)
        : { ...detail, proyecto: project };
    }));
    data.push(...resolved);
  }

  return {
    ok: true, source: 'aiven', domain: 'CORELLIAN',
    route: '/api/cobranza-cor/dashboard', scope_aplicado: listado.scope_aplicado,
    motor: 'estados-cuenta', tipo: filters.tipo.toLowerCase(),
    totales_parciales: filters.tipo !== 'RESUMEN',
    filtros: { q: filters.q, asesor: filters.asesor, moneda: filters.moneda,
      anio: filters.anio, anio_cobro: filters.anio_cobro },
    paginacion: { pagina: filters.pagina, tamano: filters.tamano,
      total_proyectos: allowed.length, total_paginas: totalPages,
      proyectos_pagina: data.length },
    catalogos: { anios: catalogYears, asesores: catalogAdvisors },
    data
  };
}

module.exports = {
  listarDashboard_cor,
  normalizeDashboardQuery_cor,
  advisorMatches_cor,
  currencyMatches_cor,
  groupAssignments_cor,
  assignAdvisor_cor,
  projectFinancialSummary_cor
};
