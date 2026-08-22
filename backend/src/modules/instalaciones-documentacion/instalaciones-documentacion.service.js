'use strict';

const db = require('../../config/db');
const repository = require('./instalaciones-documentacion.repository');
const {
  resolveInformationScopeForContext_gnral,
  hasCompleteDomain_gnral,
  runInformationScopeWithFallback_gnral
} = require('../../services/information-scope-gnral.service');

const PAGE_SIZE_COR = 30;

const PERMISSIONS_COR = Object.freeze({
  acceso_visual: 'INSTALACIONES_DOCUMENTACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  resumen_ver: 'INSTALACIONES_DOCUMENTACION_RESUMEN_INDICADORES.VER',
  filtros_ver: 'INSTALACIONES_DOCUMENTACION_FILTROS_CONTROLES.VER',
  filtros_filtrar: 'INSTALACIONES_DOCUMENTACION_FILTROS_CONTROLES.FILTRAR',
  listado_ver: 'INSTALACIONES_DOCUMENTACION_LISTADO_EQUIPOS.VER',
  listado_buscar: 'INSTALACIONES_DOCUMENTACION_LISTADO_EQUIPOS.BUSCAR',
  listado_abrir_detalle: 'INSTALACIONES_DOCUMENTACION_LISTADO_EQUIPOS.ABRIR_DETALLE'
});

const STATUS_LABELS_COR = Object.freeze({
  '04-M': 'Montaje',
  '05-PA': 'Próximos a Ajustar',
  '06-A': 'Ajuste',
  '07-PE': 'Próximos a Entregar'
});

function makeError_cor(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function cleanText_cor(value, maxLength = 255) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text.slice(0, maxLength);
}

function positiveInteger_cor(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function positivePage_cor(value) {
  return positiveInteger_cor(value) || 1;
}

function normalizeDocumentationFilter_cor(value) {
  const normalized = cleanText_cor(value, 20).toUpperCase();
  if (!normalized || normalized === 'TODOS') return 'TODOS';
  if (normalized === 'PENDIENTE' || normalized === 'COMPLETA') return normalized;
  throw makeError_cor(
    400,
    'INSTALACIONES_DOCUMENTACION_FILTRO_DOCUMENTACION_INVALIDO',
    'El filtro de documentación debe ser TODOS, PENDIENTE o COMPLETA.'
  );
}

function normalizeFilters_cor(query) {
  const estatus = cleanText_cor(query?.estatus, 20).toUpperCase();
  if (estatus && !repository.ESTATUS_DOCUMENTACION_COR.includes(estatus)) {
    throw makeError_cor(
      400,
      'INSTALACIONES_DOCUMENTACION_ESTATUS_INVALIDO',
      'El estatus solicitado no pertenece al alcance de Documentación Pendiente.'
    );
  }

  return {
    q: cleanText_cor(query?.q, 180),
    estado: cleanText_cor(query?.estado, 255),
    estatus,
    documentacion: normalizeDocumentationFilter_cor(query?.documentacion)
  };
}

function permissionObject_cor(rows) {
  const permissions = {};
  Object.entries(PERMISSIONS_COR).forEach(([key, code]) => {
    permissions[key] = Boolean(rows[code]);
  });
  return permissions;
}

function assertFilterPermissions_cor(filters, permissions) {
  if (filters.q && !permissions.listado_buscar) {
    throw makeError_cor(
      403,
      'INSTALACIONES_DOCUMENTACION_BUSCAR_DENEGADO',
      'No tienes permiso para buscar dentro de Documentación Pendiente.'
    );
  }

  const usesStructuredFilter = Boolean(
    filters.estado ||
    filters.estatus ||
    filters.documentacion !== 'TODOS'
  );

  if (usesStructuredFilter && !permissions.filtros_filtrar) {
    throw makeError_cor(
      403,
      'INSTALACIONES_DOCUMENTACION_FILTRAR_DENEGADO',
      'No tienes permiso para aplicar filtros en Documentación Pendiente.'
    );
  }
}

function bool_cor(value) {
  return Number(value) === 1;
}

function documentValue_cor(value) {
  return value === null || value === undefined ? null : value;
}

function mapSupervisor_cor(row) {
  if (!row) return null;
  const supervisorId = positiveInteger_cor(row.id_supervisor);
  return {
    id_supervisor: supervisorId,
    nombre: row.nombre || null,
    iniciales: row.iniciales || null,
    puesto: row.puesto || null,
    total_equipos: Number(row.total_equipos || 0),
    all: row.all === true
  };
}

function allSupervisorsOption_cor() {
  return {
    id_supervisor: null,
    nombre: 'Todos los supervisores',
    iniciales: null,
    puesto: null,
    total_equipos: 0,
    all: true
  };
}

async function resolveSupervisorContextLegacy_cor(userId, query) {
  const requestedSupervisorId = positiveInteger_cor(
    query?.id_supervisor || query?.supervisor_id
  );
  const currentProfile = await repository.getUserSupervisorProfile_cor(userId);

  if (!currentProfile) {
    throw makeError_cor(
      401,
      'INSTALACIONES_DOCUMENTACION_USER_NOT_FOUND',
      'El usuario autenticado no está disponible o está inactivo.'
    );
  }

  const isInstallationSupervisor = Number(currentProfile.es_supervisor_instalaciones) === 1;

  if (isInstallationSupervisor) {
    if (requestedSupervisorId && requestedSupervisorId !== userId) {
      throw makeError_cor(
        403,
        'INSTALACIONES_DOCUMENTACION_CAMBIO_SUPERVISOR_DENEGADO',
        'Un Supervisor de Instalaciones solo puede consultar su propia documentación.'
      );
    }

    return {
      mode: 'INDIVIDUAL',
      can_switch: false,
      selected: mapSupervisor_cor(currentProfile),
      options: []
    };
  }

  const options = (await repository.listSupervisorOptions_cor()).map(mapSupervisor_cor);

  if (requestedSupervisorId) {
    const selected = options.find(item => item.id_supervisor === requestedSupervisorId) || null;
    if (!selected) {
      throw makeError_cor(
        404,
        'INSTALACIONES_DOCUMENTACION_SUPERVISOR_NO_DISPONIBLE',
        'El supervisor solicitado no está disponible para Documentación Pendiente.'
      );
    }

    return {
      mode: 'SUPERVISOR',
      can_switch: true,
      selected,
      options
    };
  }

  return {
    mode: 'ALL',
    can_switch: true,
    selected: allSupervisorsOption_cor(),
    options
  };
}


function aggregateSupervisorScope_cor(options) {
  const initials = [...new Set((options || []).map(item => String(item?.iniciales || '').trim()).filter(Boolean))];
  return {
    id_supervisor: null,
    nombre: initials.length ? `${initials.length} supervisor(es) dentro del alcance` : 'Sin supervisores dentro del alcance',
    iniciales: null,
    puesto: null,
    total_equipos: (options || []).reduce((sum, item) => sum + Number(item?.total_equipos || 0), 0),
    all: false,
    dashboard_initials: initials
  };
}

async function resolveSupervisorContextModern_cor(req, userId, query) {
  const requestedSupervisorId = positiveInteger_cor(query?.id_supervisor || query?.supervisor_id);
  const scope = await resolveInformationScopeForContext_gnral(db, {
    user: req?.user,
    contextUser: req?.contextUser || req?.user || { id_SB: userId }
  });
  const allOptions = (await repository.listSupervisorOptions_cor()).map(mapSupervisor_cor);

  if (hasCompleteDomain_gnral(scope, 'CORELLIAN')) {
    if (requestedSupervisorId) {
      const selected = allOptions.find(item => item.id_supervisor === requestedSupervisorId) || null;
      if (!selected) {
        throw makeError_cor(404, 'INSTALACIONES_DOCUMENTACION_SUPERVISOR_NO_DISPONIBLE', 'El supervisor solicitado no está disponible para Documentación Pendiente.');
      }
      return { mode: 'SUPERVISOR', can_switch: true, selected, options: allOptions, source: 'INFORMATION_SCOPE' };
    }
    return { mode: 'ALL', can_switch: true, selected: allSupervisorsOption_cor(), options: allOptions, source: 'INFORMATION_SCOPE' };
  }

  const allowedIds = new Set((scope.usuarios_visibles || []).map(Number));
  const options = allOptions.filter(item => allowedIds.has(Number(item.id_supervisor)));

  if (requestedSupervisorId) {
    const selected = options.find(item => item.id_supervisor === requestedSupervisorId) || null;
    if (!selected) {
      throw makeError_cor(403, 'INSTALACIONES_DOCUMENTACION_SUPERVISOR_FUERA_ALCANCE', 'El supervisor solicitado queda fuera de tu Alcance de Información.');
    }
    return { mode: 'SUPERVISOR', can_switch: options.length > 1, selected, options, source: 'INFORMATION_SCOPE' };
  }

  if (options.length === 1) {
    return { mode: 'INDIVIDUAL', can_switch: false, selected: options[0], options: [], source: 'INFORMATION_SCOPE' };
  }

  return {
    mode: 'ALCANCE',
    can_switch: options.length > 1,
    selected: aggregateSupervisorScope_cor(options),
    options,
    source: 'INFORMATION_SCOPE'
  };
}

async function resolveSupervisorContext_cor(req, userId, query) {
  return runInformationScopeWithFallback_gnral({
    label: 'instalaciones-documentacion',
    modern: () => resolveSupervisorContextModern_cor(req, userId, query),
    legacy: () => resolveSupervisorContextLegacy_cor(userId, query)
  });
}

function mapRow_cor(row) {
  return {
    id_ins_fl: Number(row.id_ins_fl),
    id_proyecto: row.id_proyecto || null,
    proyecto: row.proyecto || null,
    referencia_sitio: row.referencia_sitio || null,
    supervisor: row.supervisor_fl || null,
    id_supervisor: row.id_sup ? Number(row.id_sup) : null,
    estado: row.estado || null,
    ciudad: row.ciudad || null,
    estatus: row.estatus || null,
    activo: bool_cor(row.activo),
    documentos: {
      cpvp: {
        valor: documentValue_cor(row.fecha_cpvp),
        generado: bool_cor(row.doc_cpvp_generado)
      },
      ccnr: {
        valor: documentValue_cor(row.fecha_ccnr),
        generado: bool_cor(row.doc_ccnr_generado)
      },
      ccr: {
        valor: documentValue_cor(row.fecha_ccr),
        generado: bool_cor(row.doc_ccr_generado)
      },
      condiciones_obra: {
        valor: documentValue_cor(row.condiciones_obra),
        generado: bool_cor(row.doc_condiciones_obra_generado)
      },
      cti: {
        valor: documentValue_cor(row.fecha_cti),
        generado: bool_cor(row.doc_cti_generado)
      },
      revision_supervisor: {
        valor: documentValue_cor(row.fecha_revision_supervisor),
        generado: bool_cor(row.doc_revision_supervisor_generado)
      },
      evaluacion_montaje: {
        valor: documentValue_cor(row.evaluacion_subcontrato),
        generado: bool_cor(row.doc_evaluacion_montaje_generado)
      },
      minuta_interfon: {
        valor: documentValue_cor(row.minuta_interfon),
        generado: bool_cor(row.doc_minuta_interfon_generado)
      },
      certificado_regulador: {
        valor: documentValue_cor(row.certificado_regulador),
        generado: bool_cor(row.doc_certificado_regulador_generado)
      }
    },
    documentos_requeridos: Number(row.documentos_requeridos || 0),
    documentos_generados: Number(row.documentos_generados || 0),
    documentos_generados_progreso: Number(row.documentos_generados_progreso || 0),
    documentos_pendientes: Number(row.documentos_pendientes || 0),
    cumplimiento_porcentaje: Number(row.cumplimiento_porcentaje || 0),
    documentacion_completa: bool_cor(row.documentacion_completa)
  };
}

function mapSummary_cor(row) {
  return {
    total_equipos: Number(row?.total_equipos || 0),
    documentos_requeridos: Number(row?.documentos_requeridos || 0),
    documentos_generados: Number(row?.documentos_generados || 0),
    documentos_pendientes: Number(row?.documentos_pendientes || 0),
    equipos_completos: Number(row?.equipos_completos || 0),
    equipos_con_pendientes: Number(row?.equipos_con_pendientes || 0),
    cumplimiento_porcentaje: Number(row?.cumplimiento_porcentaje || 0)
  };
}

function mapProgressByStatus_cor(rows) {
  const byCode = new Map((Array.isArray(rows) ? rows : []).map(row => [String(row.estatus), row]));
  return repository.ESTATUS_DOCUMENTACION_COR.map(estatus => {
    const row = byCode.get(estatus) || {};
    return {
      estatus,
      nombre: STATUS_LABELS_COR[estatus] || estatus,
      total_equipos: Number(row.total_equipos || 0),
      documentos_requeridos: Number(row.documentos_requeridos || 0),
      documentos_generados: Number(row.documentos_generados || 0),
      documentos_pendientes: Number(row.documentos_pendientes || 0),
      cumplimiento_porcentaje: Number(row.cumplimiento_porcentaje || 0)
    };
  });
}

async function getBootstrap_cor(req) {
  const effectiveUser = req?.contextUser || req?.user;
  const userId = Number(effectiveUser?.id_SB || effectiveUser?.id || effectiveUser?.user_id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw makeError_cor(401, 'INSTALACIONES_DOCUMENTACION_USER_REQUIRED', 'Sesión sin usuario válido.');
  }

  const permissionRows = await repository.getEffectivePermissionsBulk_cor(
    userId,
    Object.values(PERMISSIONS_COR)
  );
  const permissions = permissionObject_cor(permissionRows);

  if (!permissions.acceso_visual) {
    throw makeError_cor(
      403,
      'INSTALACIONES_DOCUMENTACION_ACCESO_DENEGADO',
      'No tienes permiso para acceder a Documentación Pendiente.'
    );
  }

  const filters = normalizeFilters_cor(req?.query || {});
  assertFilterPermissions_cor(filters, permissions);

  const supervisorContext = await resolveSupervisorContext_cor(
    req,
    userId,
    req?.query || {}
  );
  const selectedSupervisor = supervisorContext.selected;
  const requestedPage = positivePage_cor(req?.query?.page);
  const usesListFilters = Boolean(
    filters.q ||
    filters.estado ||
    filters.estatus ||
    filters.documentacion !== 'TODOS'
  );

  const [summaryRow, progressRows, filterOptions] = await Promise.all([
    permissions.resumen_ver && selectedSupervisor
      ? repository.getSupervisorSummary_cor(selectedSupervisor)
      : Promise.resolve(null),
    permissions.resumen_ver && selectedSupervisor
      ? repository.getProgressByStatus_cor(selectedSupervisor)
      : Promise.resolve([]),
    permissions.filtros_ver && selectedSupervisor
      ? repository.getFilterOptions_cor(selectedSupervisor)
      : Promise.resolve({
          estados: [],
          estatus: [...repository.ESTATUS_DOCUMENTACION_COR],
          documentacion: ['TODOS', 'PENDIENTE', 'COMPLETA']
        })
  ]);

  let totalRows = 0;
  if (permissions.listado_ver && selectedSupervisor) {
    if (!usesListFilters && permissions.resumen_ver) {
      totalRows = Number(summaryRow?.total_equipos || 0);
    } else {
      totalRows = await repository.countRows_cor(selectedSupervisor, filters);
    }
  }

  const totalPages = permissions.listado_ver
    ? Math.max(1, Math.ceil(Number(totalRows || 0) / PAGE_SIZE_COR))
    : 1;
  const page = permissions.listado_ver
    ? Math.min(requestedPage, totalPages)
    : 1;
  const offset = (page - 1) * PAGE_SIZE_COR;

  const rows = permissions.listado_ver && selectedSupervisor && Number(totalRows || 0) > 0
    ? await repository.listRows_cor(selectedSupervisor, filters, PAGE_SIZE_COR, offset)
    : [];

  return {
    generated_at: new Date().toISOString(),
    source: 'aiven',
    page_size: PAGE_SIZE_COR,
    supervisor_context: {
      mode: supervisorContext.mode,
      can_switch: supervisorContext.can_switch,
      selected: selectedSupervisor,
      options: supervisorContext.can_switch ? supervisorContext.options : []
    },
    pagination: {
      page,
      page_size: PAGE_SIZE_COR,
      total_rows: Number(totalRows || 0),
      total_pages: totalPages,
      has_previous: page > 1,
      has_next: page < totalPages
    },
    filters: permissions.filtros_ver
      ? {
          applied: filters,
          options: filterOptions
        }
      : null,
    resumen: permissions.resumen_ver ? mapSummary_cor(summaryRow) : null,
    progreso_por_estatus: permissions.resumen_ver ? mapProgressByStatus_cor(progressRows) : [],
    data: rows.map(mapRow_cor),
    permissions,
    business_rules: {
      visibilidad_primaria: 'PERMISOS_EFECTIVOS + ALCANCE_INFORMACION',
      selector_supervisor_controlado_por: 'usuarios_alcance_informacion',
      fallback_emergencia: 'INFORMATION_SCOPE_MODE=LEGACY',
      permisos_granulares_fallback_acceso_visual_si_no_configurados: true,
      estatus_incluidos: [...repository.ESTATUS_DOCUMENTACION_COR],
      documentos_requeridos_04_m: 6,
      documentos_requeridos_otras_etapas: 9,
      documento_pendiente_si: ['NULL', 'VACIO', '-', 'FALTA', 'FALTA.'],
      tendencia_historica_disponible: false
    }
  };
}

module.exports = {
  PAGE_SIZE_COR,
  PERMISSIONS_COR,
  getBootstrap_cor
};
