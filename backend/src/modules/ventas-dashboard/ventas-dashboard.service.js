'use strict';

const db = require('../../config/db');
const repository = require('./ventas-dashboard.repository');
const ventasVisibility = require('../ventas/ventas-visibility.service');

function positiveInteger(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error(`${fieldName} es requerido y debe ser un entero positivo.`);
    error.status = 400;
    throw error;
  }
  return parsed;
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeDashboardYear(value) {
  const currentYear = new Date().getFullYear();
  if (value === undefined || value === null || String(value).trim() === '') return currentYear;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    const error = new Error('anio debe ser un entero entre 1900 y 2200.');
    error.status = 400;
    throw error;
  }
  return year;
}

function normalizeVisibleUserIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))]
    .sort((a, b) => a - b);
}

async function resolveDashboardScope(context = {}) {
  const actionContext = context.actionContext || context;
  return ventasVisibility.resolveVisibilityScope(db, actionContext);
}

function dashboardUserDto(row) {
  return {
    id_usuario: Number(row.id_usuario ?? row.id_SB),
    nombre: row.nombre || '',
    iniciales: row.iniciales || '',
    puesto: row.puesto || null,
    area: row.area || null,
    empresa: row.empresa || null,
    tipo_perfil: row.tipo_perfil || row.puesto || row.area || null
  };
}

async function listDashboardUsersForScope(scope) {
  const rows = await repository.listCommercialUsers(db);
  const allowedIds = scope?.mode === 'ALL'
    ? null
    : new Set(normalizeVisibleUserIds(scope?.advisorIds));

  return rows
    .filter((row) => allowedIds === null || allowedIds.has(Number(row.id_usuario ?? row.id_SB)))
    .map(dashboardUserDto);
}

async function assertActiveDashboardUser(userId) {
  const id = positiveInteger(userId, 'usuario_id');
  const exists = await repository.isCommercialUser(db, id);
  if (!exists) {
    const error = new Error('El usuario seleccionado no existe, no está activo o no es un responsable comercial válido del Dashboard Ventas.');
    error.status = 404;
    throw error;
  }
  return id;
}

function scopeAllowsUser(scope, userId) {
  if (!scope || scope.mode === 'ALL') return true;
  const ids = normalizeVisibleUserIds(scope.advisorIds);
  return ids.includes(Number(userId));
}

async function resolveDashboardSelection(query = {}, context = {}) {
  const raw = String(query.usuario_id ?? '').trim().toLowerCase();
  const scope = context.scope || await resolveDashboardScope(context);

  if (raw && !['todos', 'all'].includes(raw)) {
    const userId = await assertActiveDashboardUser(raw);
    if (!scopeAllowsUser(scope, userId)) {
      const error = new Error('El responsable seleccionado queda fuera de tu Alcance de Información de Ventas.');
      error.status = 403;
      throw error;
    }
    return {
      mode: 'USER',
      userId,
      userIds: [userId],
      scope
    };
  }

  const users = await listDashboardUsersForScope(scope);
  return {
    mode: 'ALL',
    userId: null,
    userIds: users.map((user) => Number(user.id_usuario)).filter((id) => Number.isInteger(id) && id > 0),
    scope
  };
}

async function getPdfCapabilities(context = {}) {
  positiveInteger(context.user_id, 'user_id');
  return {
    ok: true,
    fase: 'B1',
    pdf: {
      general: Boolean(context.can_general),
      individual: Boolean(context.can_individual)
    }
  };
}

async function preparePdf(query = {}, context = {}) {
  const type = String(query.tipo || '').trim().toLowerCase();
  if (!['general', 'individual'].includes(type)) {
    const error = new Error('tipo debe ser general o individual.');
    error.status = 400;
    throw error;
  }

  positiveInteger(context.user_id, 'user_id');
  if (type === 'general') {
    if (!context.can_general) {
      const error = new Error('No tienes permiso para preparar el PDF general de Dashboard Ventas.');
      error.status = 403;
      throw error;
    }
    return {
      ok: true,
      fase: 'B1',
      preparado: true,
      tipo: 'general',
      asesores: 'alcance_de_informacion',
      message: 'Flujo general validado dentro del Alcance de Información. La generación del archivo se habilitará en la Fase B4.'
    };
  }

  if (!context.can_individual) {
    const error = new Error('No tienes permiso para preparar el PDF individual de Dashboard Ventas.');
    error.status = 403;
    throw error;
  }

  const advisorId = positiveInteger(query.usuario_id, 'usuario_id');
  await assertActiveDashboardUser(advisorId);

  return {
    ok: true,
    fase: 'B1',
    preparado: true,
    tipo: 'individual',
    usuario_id: advisorId,
    message: 'Flujo individual validado. La generación del archivo se habilitará en la Fase B3.'
  };
}

function parseDateValue(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const latin = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (latin) {
    const date = new Date(Number(latin[3]), Number(latin[2]) - 1, Number(latin[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractYear(...values) {
  for (const value of values) {
    const date = parseDateValue(value);
    if (date) return String(date.getFullYear());
    const match = String(value || '').match(/\b(19|20)\d{2}\b/);
    if (match) return match[0];
  }
  return 'Sin año';
}

function daysBetween(startValue, endValue) {
  const start = parseDateValue(startValue);
  const end = parseDateValue(endValue);
  if (!start || !end) return null;
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000);
  return days >= 0 ? days : null;
}

function groupByYear(rows, yearResolver, direction = 'asc', withEquipmentTotal = false) {
  const groups = new Map();
  for (const row of rows) {
    const year = yearResolver(row);
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(row);
  }
  const years = [...groups.keys()].sort((a, b) => {
    if (a === 'Sin año') return 1;
    if (b === 'Sin año') return -1;
    return direction === 'desc' ? Number(b) - Number(a) : Number(a) - Number(b);
  });
  return years.map((year) => {
    const records = groups.get(year).sort((a, b) => String(a.proyecto || '').localeCompare(String(b.proyecto || ''), 'es', { sensitivity: 'base' }));
    return {
      anio: year,
      registros: records,
      ...(withEquipmentTotal ? { total_equipos: records.reduce((sum, row) => sum + Number(row.numero_equipos || 0), 0) } : {})
    };
  });
}

function normalizeAdvisorPdfData(raw) {
  const quotes = Array.isArray(raw?.cotizaciones) ? raw.cotizaciones : [];
  const vendidos = quotes
    .filter((row) => normalize(row.estatus_proyecto) === 'vendido')
    .map((row) => ({
      id_cotizacion: row.id_cotizacion,
      proyecto: row.nombre_proyecto,
      estatus: row.estatus_proyecto,
      cliente: row.cliente,
      numero_equipos: Number(row.numero_equipos || 0),
      ciudad: row.ciudad,
      dias_vendido: daysBetween(row.fecha_solicitud || row.fecha_cotizacion, row.fecha_cierre),
      fecha_cierre: row.fecha_cierre
    }));
  const perdidos = quotes
    .filter((row) => normalize(row.estatus_proyecto) === 'perdido')
    .map((row) => ({
      id_cotizacion: row.id_cotizacion,
      proyecto: row.nombre_proyecto,
      perdido_contra: row.empresa_vs_perdido,
      razon_perdido: row.razon_perdido,
      cliente: row.cliente,
      numero_equipos: Number(row.numero_equipos || 0),
      fecha_referencia: row.fecha_cierre || row.fecha_cambio_estatus || row.fecha_cotizacion || row.fecha_solicitud
    }));
  const activas = quotes
    .filter((row) => !['vendido', 'perdido'].includes(normalize(row.estatus_proyecto)))
    .map((row) => ({
      id_cotizacion: row.id_cotizacion,
      proyecto: row.nombre_proyecto,
      estatus: row.estatus_proyecto || 'Sin Estatus',
      cliente: row.cliente,
      numero_equipos: Number(row.numero_equipos || 0),
      ciudad: row.ciudad,
      comentarios: row.comentarios || ''
    }))
    .sort((a, b) => normalize(a.estatus).localeCompare(normalize(b.estatus), 'es') || normalize(a.proyecto).localeCompare(normalize(b.proyecto), 'es'));

  const kpis = {
    cotizados: {
      cotizaciones: quotes.length,
      equipos: quotes.reduce((sum, row) => sum + Number(row.numero_equipos || 0), 0)
    },
    vendidos: {
      cotizaciones: vendidos.length,
      equipos: vendidos.reduce((sum, row) => sum + Number(row.numero_equipos || 0), 0)
    },
    perdidos: {
      cotizaciones: perdidos.length,
      equipos: perdidos.reduce((sum, row) => sum + Number(row.numero_equipos || 0), 0)
    },
    cotizaciones_activas: activas.length,
    proyectos_activos: Array.isArray(raw?.proyectos_activos) ? raw.proyectos_activos.length : 0
  };

  return {
    asesor: raw.asesor,
    kpis,
    vendidos: groupByYear(vendidos, (row) => extractYear(row.fecha_cierre), 'asc', true),
    perdidos: groupByYear(perdidos, (row) => extractYear(row.fecha_referencia), 'desc', false),
    cotizaciones_activas: activas,
    prospeccion: Array.isArray(raw?.prospeccion) ? raw.prospeccion : [],
    redes: Array.isArray(raw?.redes) ? raw.redes : [],
    proyectos_activos: Array.isArray(raw?.proyectos_activos) ? raw.proyectos_activos : [],
    logistica: Array.isArray(raw?.logistica) ? raw.logistica : [],
    clientes: Array.isArray(raw?.clientes) ? raw.clientes : []
  };
}

async function getPdfData(query = {}, context = {}) {
  const type = String(query.tipo || '').trim().toLowerCase();
  if (!['general', 'individual'].includes(type)) {
    const error = new Error('tipo debe ser general o individual.');
    error.status = 400;
    throw error;
  }

  const creatorId = positiveInteger(context.user_id, 'user_id');
  if (type === 'general') {
    if (!context.can_general) {
      const error = new Error('No tienes permiso para preparar los datos del PDF general de Dashboard Ventas.');
      error.status = 403;
      throw error;
    }
  } else if (!context.can_individual) {
    const error = new Error('No tienes permiso para preparar los datos del PDF individual de Dashboard Ventas.');
    error.status = 403;
    throw error;
  }

  const creator = await repository.getPdfCreatorProfile(db, creatorId);
  if (!creator) {
    const error = new Error('No fue posible identificar al usuario efectivo que genera el PDF.');
    error.status = 404;
    throw error;
  }

  let advisors;
  if (type === 'general') {
    const scope = await resolveDashboardScope(context);
    advisors = await listDashboardUsersForScope(scope);
  } else {
    const advisorId = positiveInteger(query.usuario_id, 'usuario_id');
    await assertActiveDashboardUser(advisorId);
    advisors = [{ id_usuario: advisorId }];
  }

  const advisorReports = [];
  for (const advisor of advisors) {
    const advisorId = positiveInteger(advisor.id_usuario, 'id_usuario');
    const raw = await repository.getPdfAdvisorData(db, advisorId);
    if (!raw) continue;
    const report = normalizeAdvisorPdfData(raw);
    const sharedTasks = await repository.getPdfSharedTasks(db, creatorId, advisorId);
    if (sharedTasks.length > 0) report.tareas_colaborativas = sharedTasks;
    advisorReports.push(report);
  }

  return {
    ok: true,
    fase: 'B4',
    tipo: type,
    generado_por: creator,
    total_asesores: advisorReports.length,
    asesores: advisorReports,
    message: type === 'general'
      ? `Datos preparados para ${advisorReports.length} usuarios dentro del Alcance de Información.`
      : 'Datos del usuario seleccionado preparados correctamente.'
  };
}

async function listCommercialUsers(actionContext = {}) {
  const scope = await resolveDashboardScope({ actionContext });
  const usuarios = await listDashboardUsersForScope(scope);
  return {
    ok: true,
    usuarios,
    visibilidad: ventasVisibility.toClientVisibility(scope)
  };
}

async function getCommercialKpis(query = {}, context = {}) {
  const selection = await resolveDashboardSelection(query, context);
  const year = normalizeDashboardYear(query.anio ?? query.year);
  const [raw, availableYears] = await Promise.all([
    repository.getCommercialKpis(db, selection.userIds, year),
    repository.listCommercialYears(db, selection.userIds)
  ]);
  const years = [...new Set([new Date().getFullYear(), year, ...availableYears])]
    .filter((item) => Number.isInteger(Number(item)))
    .map(Number)
    .sort((a, b) => b - a);

  return {
    ok: true,
    modo: selection.mode,
    usuario_id: selection.userId,
    usuarios_incluidos: selection.userIds.length,
    anio: year,
    anios_disponibles: years,
    kpis: {
      cotizados: {
        cotizaciones: Number(raw.cotizados_cotizaciones || 0),
        equipos: Number(raw.cotizados_equipos || 0)
      },
      vendidos: {
        cotizaciones: Number(raw.vendidos_cotizaciones || 0),
        equipos: Number(raw.vendidos_equipos || 0)
      },
      perdidos: {
        cotizaciones: Number(raw.perdidos_cotizaciones || 0),
        equipos: Number(raw.perdidos_equipos || 0)
      }
    }
  };
}


function filterTablesByPermission(tables, allowedTableKeys) {
  const allowed = new Set(Array.isArray(allowedTableKeys) ? allowedTableKeys : []);
  return Object.fromEntries(Object.entries(tables || {}).filter(([key]) => allowed.has(key)));
}

async function getCommercialTables(query = {}, context = {}) {
  const selection = await resolveDashboardSelection(query, context);
  const year = normalizeDashboardYear(query.anio ?? query.year);
  return {
    ok: true,
    modo: selection.mode,
    usuario_id: selection.userId,
    usuarios_incluidos: selection.userIds.length,
    anio: year,
    tablas: filterTablesByPermission(
      await repository.getCommercialTables(db, selection.userIds, year),
      context.allowedTableKeys
    )
  };
}

async function getOperationalTables(query = {}, context = {}) {
  const selection = await resolveDashboardSelection(query, context);
  return {
    ok: true,
    modo: selection.mode,
    usuario_id: selection.userId,
    usuarios_incluidos: selection.userIds.length,
    tablas: filterTablesByPermission(
      await repository.getOperationalTables(db, selection.userIds),
      context.allowedTableKeys
    )
  };
}

module.exports = {
  listCommercialUsers,
  getCommercialKpis,
  getCommercialTables,
  getOperationalTables,
  getPdfCapabilities,
  preparePdf,
  getPdfData
};
