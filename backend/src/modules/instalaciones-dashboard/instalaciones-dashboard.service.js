'use strict';

const db = require('../../config/db');
const interactionsService = require('../../services/interactions/interactions.service');
const repository = require('./instalaciones-dashboard.repository');
const documentationRepository = require('../instalaciones-documentacion/instalaciones-documentacion.repository');

const DOCUMENTATION_PAGE_SIZE_COR = 30;

const PERMISSIONS_COR = Object.freeze({
  acceso_visual: 'INSTALACIONES_DASHBOARD_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  selector_ver: 'INSTALACIONES_DASHBOARD_SELECTOR_SUPERVISORES_SELECTOR.VER',
  selector_filtrar: 'INSTALACIONES_DASHBOARD_SELECTOR_SUPERVISORES_SELECTOR.FILTRAR',
  comentarios_ver: 'INSTALACIONES_DASHBOARD_COMENTARIOS_JUNTA_LISTADO.VER',
  reporte_selector_ver: 'INSTALACIONES_DASHBOARD_REPORTE_SECCION_SELECTOR.VER',
  reporte_selector_filtrar: 'INSTALACIONES_DASHBOARD_REPORTE_SECCION_SELECTOR.FILTRAR',
  reporte_listado_ver: 'INSTALACIONES_DASHBOARD_REPORTE_SECCION_LISTADO.VER',
  reporte_abrir_detalle: 'INSTALACIONES_DASHBOARD_REPORTE_SECCION_LISTADO.ABRIR_DETALLE',
  reporte_editar: 'INSTALACIONES_DASHBOARD_REPORTE_SECCION_LISTADO.EDITAR',
  proyectos_ver: 'INSTALACIONES_DASHBOARD_PROYECTOS_ACTIVOS_LISTADO.VER',
  proyectos_abrir_detalle: 'INSTALACIONES_DASHBOARD_PROYECTOS_ACTIVOS_LISTADO.ABRIR_DETALLE',
  aditivas_indicadores_ver: 'INSTALACIONES_DASHBOARD_ADITIVAS_INDICADORES.VER',
  aditivas_pendientes_ver: 'INSTALACIONES_DASHBOARD_ADITIVAS_PENDIENTES.VER',
  adeudos_ver: 'INSTALACIONES_DASHBOARD_ADEUDOS_CONTRACTUALES_LISTADO.VER',
  adeudos_abrir_detalle: 'INSTALACIONES_DASHBOARD_ADEUDOS_CONTRACTUALES_LISTADO.ABRIR_DETALLE'
});

const REPORT_SECTIONS_COR = Object.freeze([
  {
    codigo: '01-SUS', nombre: 'Equipos Suspendidos', notificaciones: false,
    columnas: [
      ['CPVP', 'fecha_cpvp', 'fecha'], ['FABRICACIÓN', 'estatus_produccion', 'texto'],
      ['FECHA DE DESCARGA', 'fecha_descarga', 'fecha'], ['ULTIMA VISITA', 'fecha_visita', 'fecha'],
      ['COMENTARIO', 'comentarios_fl', 'comentario'], ['% OC', 'avance_oc', 'pct'],
      ['ULTIMA CCNR', 'fecha_ccnr', 'fecha']
    ]
  },
  {
    codigo: '02-OC', nombre: 'Equipos en Obra Civil', notificaciones: true,
    columnas: [
      ['CPVP', 'fecha_cpvp', 'fecha'], ['FABRICACIÓN', 'estatus_produccion', 'texto'],
      ['FECHA DE DESCARGA', 'fecha_descarga', 'fecha'], ['ULTIMA VISITA', 'fecha_visita', 'fecha'],
      ['COMENTARIO', 'comentarios_fl', 'comentario'], ['% OC', 'avance_oc', 'pct'],
      ['ULTIMA CCNR', 'fecha_ccnr', 'fecha']
    ]
  },
  {
    codigo: '03-PM', nombre: 'Equipos Proximos a Montar', notificaciones: true,
    columnas: [
      ['CPVP', 'fecha_cpvp', 'fecha'], ['FABRICACIÓN', 'estatus_produccion', 'texto'],
      ['FECHA DE DESCARGA', 'fecha_descarga', 'fecha'], ['ULTIMA VISITA', 'fecha_visita', 'fecha'],
      ['COMENTARIO', 'comentarios_fl', 'comentario'], ['% OC', 'avance_oc', 'pct'],
      ['ULTIMA CCNR', 'fecha_ccnr', 'fecha'], ['POSIBLE RECEPCIÓN DE CUBO', 'fecha_posible_recepcion_cubo', 'fecha']
    ]
  },
  {
    codigo: '04-M', nombre: 'Equipos en Montaje', notificaciones: true,
    columnas: [
      ['CCR', 'fecha_ccr', 'fecha'], ['SUB', 'subcontratista', 'texto'],
      ['INICIO DE MONTAJE', 'fecha_inicio_montaje', 'fecha'],
      ['FIN DE MONTAJE', ['fecha_fin_montaje_modificado', 'fecha_fin_montaje_planeado'], 'fecha'],
      ['DIAS RESTANTES', 'dias_restantes', 'texto'], ['ULTIMA VISITA', 'fecha_visita', 'fecha'],
      ['% M', 'avance_mo', 'pct'], ['COMENTARIO', 'comentarios_fl', 'comentario']
    ]
  },
  {
    codigo: '05-PA', nombre: 'Equipos Proximos a Ajustar', notificaciones: true,
    columnas: [
      ['REVISIÓN POR SUPERVISOR', 'fecha_revision_supervisor', 'fecha'],
      ['REVISIÓN POR AJUSTE', 'fecha_minuta_revision_ajuste', 'fecha'],
      ['¿LIBERADO?', 'fecha_liberacion_ajuste', 'texto'], ['CTI', 'fecha_cti', 'fecha'],
      ['ULTIMA VISITA', 'fecha_visita', 'fecha'], ['COMENTARIO', 'comentarios_fl', 'comentario'],
      ['POSIBLE INICIO DE AJUSTE', 'fecha_posible_inicio_ajuste', 'fecha']
    ]
  },
  {
    codigo: '06-A', nombre: 'Equipos en Ajuste', notificaciones: true,
    columnas: [
      ['AJUSTADOR', 'ajustador', 'texto'], ['INICIO DE AJUSTE', 'fecha_inicio_ajuste', 'fecha'],
      ['FIN DE AJUSTE', 'fecha_fin_ajuste_planeado', 'fecha'],
      ['FIN DE AJUSTE MODIFICADO', 'fecha_fin_ajuste_modificado', 'fecha'],
      ['COMENTARIO', 'comentarios_fl', 'comentario']
    ]
  },
  {
    codigo: '07-PE', nombre: 'Equipos Proximos a Entregar', notificaciones: true,
    columnas: [
      ['INSPECCIÓN DE CALIDAD', 'fecha_protocolo_aceptacion', 'fecha'],
      ['ESTATUS DE INSPECCIÓN', 'estatus_inspeccion_calidad', 'texto'],
      ['¿PENDIENTES?', 'pendientes_calidad', 'texto'], ['ENTREGA AL CLIENTE (CAF-PG)', 'fecha_entrega_cliente', 'fecha'],
      ['FORMATO', 'formato_caf_pg', 'texto'], ['EL EQUIPO SE QUEDA', 'estatus_equipo_entrega', 'texto']
    ]
  },
  {
    codigo: '08-T', nombre: 'Equipos Entregados', notificaciones: true,
    columnas: [
      ['INSPECCIÓN DE CALIDAD', 'fecha_protocolo_aceptacion', 'fecha'],
      ['ESTATUS DE INSPECCIÓN', 'estatus_inspeccion_calidad', 'texto'],
      ['¿PENDIENTES?', 'pendientes_calidad', 'texto'], ['ENTREGA AL CLIENTE (CAF-PG)', 'fecha_entrega_cliente', 'fecha'],
      ['FORMATO', 'formato_caf_pg', 'texto'], ['EL EQUIPO SE QUEDA', 'estatus_equipo_entrega', 'texto']
    ]
  }
]);

const QUICK_EDIT_FIELDS_COR = Object.freeze({
  '01-SUS': new Set(['estatus']),
  '02-OC': new Set(['estatus', 'fecha_posible_recepcion_cubo', 'comentarios_fl']),
  '03-PM': new Set(['estatus', 'fecha_posible_recepcion_cubo', 'comentarios_fl']),
  '04-M': new Set(['estatus', 'comentarios_fl']),
  '05-PA': new Set(['estatus', 'ajustador', 'fecha_posible_inicio_ajuste', 'comentarios_fl']),
  '06-A': new Set(['estatus', 'fecha_inicio_ajuste', 'fecha_fin_ajuste_planeado', 'ajustador', 'comentarios_fl']),
  '07-PE': new Set(['estatus', 'comentarios_fl']),
  '08-T': new Set(['estatus', 'comentarios_fl'])
});

const QUICK_EDIT_LABELS_COR = Object.freeze({
  estatus: 'Estatus',
  fecha_posible_recepcion_cubo: 'Posible recepción de cubo',
  comentarios_fl: 'Comentario',
  ajustador: 'Ajustador',
  fecha_posible_inicio_ajuste: 'Posible inicio de Ajuste',
  fecha_inicio_ajuste: 'Fecha Inicio Ajuste',
  fecha_fin_ajuste_planeado: 'Fecha Fin Ajuste'
});

const QUICK_EDIT_DATE_FIELDS_COR = new Set([
  'fecha_posible_recepcion_cubo',
  'fecha_posible_inicio_ajuste',
  'fecha_inicio_ajuste',
  'fecha_fin_ajuste_planeado'
]);

const REPORT_STATUS_CODES_COR = new Set(REPORT_SECTIONS_COR.map(item => item.codigo));

function makeError_cor(statusCode, code, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function normalizeSupervisorList_cor(raw, options = {}) {
  const source = Array.isArray(raw) ? raw : [raw];
  const values = source
    .flatMap(value => String(value == null ? '' : value).split(','))
    .map(value => value.trim())
    .filter(Boolean);

  const unique = Array.from(new Set(values));
  if (!unique.length && options.required !== false) {
    throw makeError_cor(
      400,
      'INSTALACIONES_DASHBOARD_SUPERVISORES_REQUIRED',
      'Selecciona al menos un supervisor.'
    );
  }
  if (unique.length > 50) {
    throw makeError_cor(
      400,
      'INSTALACIONES_DASHBOARD_SUPERVISORES_LIMIT',
      'No se pueden consultar más de 50 supervisores por solicitud.'
    );
  }
  if (unique.some(value => value.length > 100)) {
    throw makeError_cor(
      400,
      'INSTALACIONES_DASHBOARD_SUPERVISOR_INVALID',
      'Se recibió un identificador de supervisor inválido.'
    );
  }
  return unique;
}

function booleanQuery_cor(value) {
  return ['1', 'true', 'yes', 'on', 'si', 'sí'].includes(String(value == null ? '' : value).trim().toLowerCase());
}

function dashboardScope_cor(query = {}) {
  const special = String(query.filtro_especial || query.special || '').trim().toUpperCase();
  const ajusteActivo = special === 'AFL' || booleanQuery_cor(query.ajuste_activo);
  const modoJunta = booleanQuery_cor(query.modo_junta);
  const supervisors = normalizeSupervisorList_cor(query.supervisores, { required: !ajusteActivo });

  return {
    supervisors,
    ajusteActivo,
    modoJunta,
    filtroEspecial: ajusteActivo ? 'AFL' : null
  };
}

function permissionObject_cor(rows) {
  const result = {};
  Object.entries(PERMISSIONS_COR).forEach(([key, code]) => {
    result[key] = Boolean(rows[code]);
  });
  return result;
}

function numberOrNull_cor(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero_cor(value) {
  const parsed = numberOrNull_cor(value);
  return parsed === null ? 0 : parsed;
}

function percentNumber_cor(value) {
  if (value === null || value === undefined || value === '' || value === '-') return null;
  let text = String(value).trim().replace(',', '.');
  const hadPercent = text.includes('%');
  text = text.replace('%', '');
  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed)) return null;
  if (hadPercent) return parsed;
  return parsed <= 1 ? parsed * 100 : parsed;
}

function positivePage_cor(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function boolNumber_cor(value) {
  return Number(value) === 1;
}

function mapDocumentationSummary_cor(row) {
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

function mapDocumentationRow_cor(row) {
  return {
    id_ins_fl: Number(row.id_ins_fl),
    id_proyecto: row.id_proyecto || null,
    proyecto: row.proyecto || null,
    referencia_sitio: row.referencia_sitio || null,
    supervisor: row.supervisor_fl || null,
    estado: row.estado || null,
    ciudad: row.ciudad || null,
    estatus: row.estatus || null,
    documentos: {
      cpvp: { valor: row.fecha_cpvp ?? null, generado: boolNumber_cor(row.doc_cpvp_generado) },
      ccnr: { valor: row.fecha_ccnr ?? null, generado: boolNumber_cor(row.doc_ccnr_generado) },
      ccr: { valor: row.fecha_ccr ?? null, generado: boolNumber_cor(row.doc_ccr_generado) },
      condiciones_obra: { valor: row.condiciones_obra ?? null, generado: boolNumber_cor(row.doc_condiciones_obra_generado) },
      cti: { valor: row.fecha_cti ?? null, generado: boolNumber_cor(row.doc_cti_generado) },
      revision_supervisor: { valor: row.fecha_revision_supervisor ?? null, generado: boolNumber_cor(row.doc_revision_supervisor_generado) },
      evaluacion_montaje: { valor: row.evaluacion_subcontrato ?? null, generado: boolNumber_cor(row.doc_evaluacion_montaje_generado) },
      minuta_interfon: { valor: row.minuta_interfon ?? null, generado: boolNumber_cor(row.doc_minuta_interfon_generado) },
      certificado_regulador: { valor: row.certificado_regulador ?? null, generado: boolNumber_cor(row.doc_certificado_regulador_generado) }
    },
    documentos_requeridos: Number(row.documentos_requeridos || 0),
    documentos_generados_progreso: Number(row.documentos_generados_progreso || 0),
    documentos_pendientes: Number(row.documentos_pendientes || 0),
    cumplimiento_porcentaje: Number(row.cumplimiento_porcentaje || 0)
  };
}

async function getMeetingDocumentation_cor(supervisors, requestedPage) {
  const scope = { dashboard_initials: supervisors };
  const summary = mapDocumentationSummary_cor(
    await documentationRepository.getSupervisorSummary_cor(scope)
  );
  const totalRows = summary.total_equipos;
  const totalPages = Math.max(1, Math.ceil(totalRows / DOCUMENTATION_PAGE_SIZE_COR));
  const page = Math.min(positivePage_cor(requestedPage), totalPages);
  const offset = (page - 1) * DOCUMENTATION_PAGE_SIZE_COR;
  const rows = totalRows > 0
    ? await documentationRepository.listRows_cor(
        scope,
        { q:'', estado:'', estatus:'', documentacion:'TODOS' },
        DOCUMENTATION_PAGE_SIZE_COR,
        offset
      )
    : [];

  return {
    visible: true,
    selected_supervisors: [...supervisors],
    resumen: summary,
    pagination: {
      page,
      page_size: DOCUMENTATION_PAGE_SIZE_COR,
      total_rows: totalRows,
      total_pages: totalPages,
      has_previous: page > 1,
      has_next: page < totalPages
    },
    rows: rows.map(mapDocumentationRow_cor),
    business_rule: 'Misma regla de Documentación Pendiente: 04-M requiere 6 documentos; 05-PA, 06-A y 07-PE requieren 9.'
  };
}

function isEmptyMarker_cor(value) {
  if (value === null || value === undefined) return true;
  const text = String(value).trim();
  return text === '' || text === '-' || text === '.';
}

function dateYmd_cor(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function commonVisitCcnrFlags_cor(row) {
  const diasVisita = numberOrNull_cor(row.dias_sin_visita);
  const enSitio = String(row.estatus_produccion || '').trim() === 'En Sitio';
  const tieneCcnr = !isEmptyMarker_cor(row.fecha_ccnr);
  const diasCcnr = numberOrNull_cor(row.dias_sin_ccnr);
  const flags = [];

  if (enSitio && !tieneCcnr) flags.push({ emoji: '‼️', texto: 'Falta 1era CCNR' });
  if (enSitio && tieneCcnr && diasCcnr !== null && diasCcnr >= 45) {
    flags.push({ emoji: '⚠️', texto: 'Actualizar CCNR' });
  }
  if (diasVisita !== null && diasVisita >= 45) flags.push({ emoji: '📅', texto: 'Requiere visita' });

  return { flags, diasVisita };
}

function notificationsForRow_cor(row, todayYmd) {
  const status = String(row.estatus || '').trim();
  const result = [];

  if (status === '02-OC') {
    const common = commonVisitCcnrFlags_cor(row);
    if (common.diasVisita !== null && common.diasVisita > 200) {
      result.push({ emoji: '✂️', texto: 'Mayor a 200 dias sin visita (posible suspension)' });
    }
    result.push(...common.flags);
  } else if (status === '03-PM') {
    const common = commonVisitCcnrFlags_cor(row);
    const pctOc = percentNumber_cor(row.avance_oc);
    if (pctOc === 100) result.push({ emoji: '📌', texto: 'Deberia estar en montaje' });
    else if (pctOc !== null && pctOc >= 95) result.push({ emoji: '☢️', texto: 'Programar montador' });
    result.push(...common.flags);
  } else if (status === '04-M') {
    const dias = numberOrNull_cor(row.dias_restantes);
    if (dias !== null) {
      if (dias < 0) result.push({ emoji: '⏰', texto: 'Montaje con atraso' });
      else if (dias <= 3) result.push({ emoji: '🔴', texto: 'Quedan 3 dias o menos para terminar el montaje' });
      else if (dias <= 7) result.push({ emoji: '🟠', texto: 'Quedan 7 dias o menos para terminar el montaje' });
      else if (dias <= 14) result.push({ emoji: '🟡', texto: 'Quedan 14 dias o menos para terminar el montaje' });
    }
    if (isEmptyMarker_cor(row.fecha_ccr)) result.push({ emoji: '🚫', texto: 'Falta CCR' });
    const diasVisita = numberOrNull_cor(row.dias_sin_visita);
    if (diasVisita !== null && diasVisita >= 45) result.push({ emoji: '📅', texto: 'Requiere visita' });
  } else if (status === '05-PA') {
    if (isEmptyMarker_cor(row.fecha_revision_supervisor)) result.push({ emoji: '👁️', texto: 'Falta revision de supervisor' });
    if (String(row.fecha_liberacion_ajuste || '').trim().toUpperCase() !== 'SI') result.push({ emoji: '👎', texto: 'No liberado por ajuste' });
    if (isEmptyMarker_cor(row.fecha_cti)) result.push({ emoji: '🚫', texto: 'Falta CTI' });
    const diasVisita = numberOrNull_cor(row.dias_sin_visita);
    if (diasVisita !== null && diasVisita >= 45) result.push({ emoji: '📅', texto: 'Requiere visita' });
  } else if (status === '06-A') {
    const planned = dateYmd_cor(row.fecha_fin_ajuste_planeado);
    if (planned && todayYmd && planned < todayYmd) result.push({ emoji: '⏰', texto: 'Ajuste con retraso' });
    if (!isEmptyMarker_cor(row.fecha_fin_ajuste_modificado)) result.push({ emoji: '❌', texto: 'Fin ajuste modificado' });
    if (isEmptyMarker_cor(row.fecha_revision_supervisor)) result.push({ emoji: '👁️', texto: 'Falta revision de supervisor' });
    if (String(row.fecha_liberacion_ajuste || '').trim().toUpperCase() !== 'SI') result.push({ emoji: '👎', texto: 'No liberado por ajuste' });
    if (isEmptyMarker_cor(row.fecha_cti)) result.push({ emoji: '🚫', texto: 'Falta CTI' });
    const diasVisita = numberOrNull_cor(row.dias_sin_visita);
    if (diasVisita !== null && diasVisita >= 45) result.push({ emoji: '📅', texto: 'Requiere visita' });
  } else if (status === '07-PE') {
    if (String(row.pendientes_calidad || '').trim() === 'Con Pendientes') result.push({ emoji: '❌', texto: 'Pendientes calidad' });
  } else if (status === '08-T') {
    if (String(row.pendientes_calidad || '').trim() === 'Con Pendientes') result.push({ emoji: '❌', texto: 'Pendientes calidad' });
    if (String(row.formato_caf_pg || '').trim() !== 'Original') result.push({ emoji: '🚫', texto: 'Formato original falta' });
    if (String(row.estatus_equipo_entrega || '').trim() === 'Detenido') result.push({ emoji: '🛑', texto: 'Se queda detenido' });
  }

  return result;
}

const COBRANZA_COR_ROUTES = Object.freeze({
  aditivas: '/api/cobranza-cor/aditivas',
  adeudos_contractuales: '/api/cobranza-cor/adeudos-contractuales'
});

function pendingAditivasCor_cor(includeIndicators, includePending) {
  return {
    allowed_indicadores: Boolean(includeIndicators),
    allowed_pendientes: Boolean(includePending),
    available: false,
    supported: false,
    source_domain: 'CORELLIAN',
    source_route: COBRANZA_COR_ROUTES.aditivas,
    source_table: null,
    status: 'PENDING_COBRANZA_COR_TABLES',
    total_registros: 0,
    indicadores: null,
    pendientes: [],
    message: 'Cobranza Corellian aún no tiene las tablas fuente creadas. La ruta queda reservada y no se consulta información de United.'
  };
}

function pendingContractualCor_cor(allowed) {
  return {
    allowed: Boolean(allowed),
    available: false,
    supported: false,
    source_domain: 'CORELLIAN',
    source_route: COBRANZA_COR_ROUTES.adeudos_contractuales,
    source_table: null,
    status: 'PENDING_COBRANZA_COR_TABLES',
    rows: [],
    message: 'Los adeudos contractuales de Cobranza Corellian quedan referenciados, pero su tabla fuente aún no existe. No se usa Cobranza United como sustituto.'
  };
}

async function getBootstrap_cor(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw makeError_cor(401, 'INSTALACIONES_DASHBOARD_USER_REQUIRED', 'Sesión sin usuario válido.');
  }

  const permissionCodes = Object.values(PERMISSIONS_COR);
  const [rules, permissionRows] = await Promise.all([
    repository.getRulesDate_cor(),
    repository.getEffectivePermissionsBulk_cor(userId, permissionCodes)
  ]);
  const permissions = permissionObject_cor(permissionRows);

  const [supervisors, aflUser, ajusteActivoTotal] = permissions.selector_ver
    ? await Promise.all([
        repository.getSupervisors_cor(),
        repository.getSpecialAflUser_cor(),
        repository.getAjusteActivoCount_cor()
      ])
    : [[], null, 0];

  return {
    generated_at: new Date().toISOString(),
    rules_date: rules.fecha_actual,
    current_year: rules.anio_actual,
    supervisors: supervisors.map(row => ({
      supervisor: row.supervisor,
      total_equipos: Number(row.total_equipos) || 0
    })),
    special_filters: permissions.selector_ver ? [{
      codigo: 'AFL',
      tipo: 'AJUSTE_ACTIVO',
      etiqueta: 'AFL · Alejandro Flores',
      usuario_id: aflUser ? Number(aflUser.id_SB) : 38,
      usuario_nombre: aflUser ? aflUser.nombre : 'Alejandro Flores',
      iniciales_bd: aflUser ? aflUser.iniciales : 'ALF',
      usuario_verificado: Boolean(aflUser && Number(aflUser.estado) === 1),
      total_equipos: Number(ajusteActivoTotal) || 0,
      regla: { estatus: repository.AJUSTE_STATUS_COR || '06-A', activo: 1 }
    }] : [],
    meeting_mode: {
      supported: true,
      hides: ['comentarios_junta', 'proyectos_activos'],
      note: 'Modo Junta evita consultar y mostrar Comentarios de Junta y Proyectos Activos.'
    },
    sections: permissions.reporte_selector_ver ? REPORT_SECTIONS_COR : [],
    permissions,
    compatibility: {
      aditivas: pendingAditivasCor_cor(
        permissions.aditivas_indicadores_ver,
        permissions.aditivas_pendientes_ver
      ),
      adeudos_contractuales: pendingContractualCor_cor(permissions.adeudos_ver)
    }
  };
}

async function getSummary_cor(userId, query) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw makeError_cor(401, 'INSTALACIONES_DASHBOARD_USER_REQUIRED', 'Sesión sin usuario válido.');
  }

  const scope = dashboardScope_cor(query);
  const supervisors = scope.supervisors;
  const relevantCodes = [
    PERMISSIONS_COR.comentarios_ver,
    PERMISSIONS_COR.proyectos_ver,
    PERMISSIONS_COR.reporte_listado_ver,
    PERMISSIONS_COR.aditivas_indicadores_ver,
    PERMISSIONS_COR.aditivas_pendientes_ver,
    PERMISSIONS_COR.adeudos_ver
  ];
  const permissionRows = await repository.getEffectivePermissionsBulk_cor(userId, relevantCodes);
  const canComments = Boolean(permissionRows[PERMISSIONS_COR.comentarios_ver]);
  const canProjects = Boolean(permissionRows[PERMISSIONS_COR.proyectos_ver]);
  const canDocumentation = Boolean(permissionRows[PERMISSIONS_COR.reporte_listado_ver]);
  const canAditivaIndicators = Boolean(permissionRows[PERMISSIONS_COR.aditivas_indicadores_ver]);
  const canAditivaPending = Boolean(permissionRows[PERMISSIONS_COR.aditivas_pendientes_ver]);
  const canContractual = Boolean(permissionRows[PERMISSIONS_COR.adeudos_ver]);
  const showComments = canComments && !scope.modoJunta;
  const showProjects = canProjects && !scope.modoJunta;
  const showDocumentation = canDocumentation && scope.modoJunta && supervisors.length > 0;
  const needsProjects = showProjects;
  const repositoryOptions = { ajusteActivo: scope.ajusteActivo };

  const [comments, activeProjects, documentation] = await Promise.all([
    showComments
      ? repository.listCommentsByUserAndSupervisors_cor(userId, supervisors, repositoryOptions)
      : Promise.resolve([]),
    needsProjects
      ? repository.listActiveProjects_cor(supervisors, repositoryOptions)
      : Promise.resolve([]),
    showDocumentation
      ? getMeetingDocumentation_cor(supervisors, query.documentacion_page)
      : Promise.resolve({
          visible: false,
          selected_supervisors: [...supervisors],
          resumen: null,
          pagination: { page:1, page_size:DOCUMENTATION_PAGE_SIZE_COR, total_rows:0, total_pages:1, has_previous:false, has_next:false },
          rows: [],
          message: supervisors.length
            ? 'Documentación Pendiente se muestra únicamente en Modo Junta.'
            : 'Selecciona al menos un supervisor para consultar Documentación Pendiente.'
        })
  ]);

  return {
    generated_at: new Date().toISOString(),
    selected_supervisors: supervisors,
    filtro_especial: scope.filtroEspecial,
    modo_junta: scope.modoJunta,
    scope: {
      ajuste_activo: scope.ajusteActivo,
      estatus_forzado: scope.ajusteActivo ? (repository.AJUSTE_STATUS_COR || '06-A') : null,
      activo: scope.ajusteActivo ? 1 : null
    },
    blocks: {
      comentarios_junta: {
        allowed: canComments,
        visible: !scope.modoJunta,
        skipped: scope.modoJunta,
        total: showComments ? comments.length : 0,
        rows: showComments ? comments : []
      },
      proyectos_activos: {
        allowed: canProjects,
        visible: !scope.modoJunta,
        skipped: scope.modoJunta,
        total: showProjects ? activeProjects.length : 0,
        rows: showProjects ? activeProjects : []
      },
      documentacion_pendiente: {
        allowed: canDocumentation,
        visible: showDocumentation,
        skipped: !showDocumentation,
        ...documentation
      },
      aditivas: pendingAditivasCor_cor(canAditivaIndicators, canAditivaPending),
      adeudos_contractuales: pendingContractualCor_cor(canContractual)
    }
  };
}

async function getReport_cor(query) {
  const scope = dashboardScope_cor(query);
  const supervisors = scope.supervisors;
  const requestedStatus = String(query.seccion || query.estatus || '').trim();
  const status = scope.ajusteActivo ? (repository.AJUSTE_STATUS_COR || '06-A') : requestedStatus;
  const section = REPORT_SECTIONS_COR.find(item => item.codigo === status);
  if (!section) {
    throw makeError_cor(
      400,
      'INSTALACIONES_DASHBOARD_SECTION_INVALID',
      'Selecciona una sección válida entre 01-SUS y 08-T.'
    );
  }

  const rules = await repository.getRulesDate_cor();
  const rows = await repository.listReportRows_cor(
    supervisors,
    status,
    rules.anio_actual,
    { ajusteActivo: scope.ajusteActivo }
  );
  const data = rows.map(row => ({
    ...row,
    notificaciones: notificationsForRow_cor(row, rules.fecha_actual)
  }));

  return {
    generated_at: new Date().toISOString(),
    rules_date: rules.fecha_actual,
    current_year: rules.anio_actual,
    selected_supervisors: supervisors,
    filtro_especial: scope.filtroEspecial,
    modo_junta: scope.modoJunta,
    requested_section: requestedStatus || null,
    section_forced: scope.ajusteActivo,
    section,
    total: data.length,
    rows: data
  };
}


function normalizeQuickEditValue_cor(field, value) {
  if (field === 'estatus') {
    const status = String(value == null ? '' : value).trim().toUpperCase();
    if (!REPORT_STATUS_CODES_COR.has(status)) {
      throw makeError_cor(400, 'INSTALACIONES_DASHBOARD_STATUS_INVALID', 'El estatus seleccionado no pertenece al reporte.');
    }
    return status;
  }

  if (QUICK_EDIT_DATE_FIELDS_COR.has(field)) {
    const text = String(value == null ? '' : value).trim();
    if (!text) return '';
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      throw makeError_cor(400, 'INSTALACIONES_DASHBOARD_DATE_INVALID', 'La fecha debe enviarse en formato YYYY-MM-DD.');
    }
    const parsed = new Date(text + 'T00:00:00Z');
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
      throw makeError_cor(400, 'INSTALACIONES_DASHBOARD_DATE_INVALID', 'La fecha indicada no es válida.');
    }
    return text;
  }

  const text = String(value == null ? '' : value);
  if (field === 'ajustador') return text.trim().slice(0, 255);
  if (field === 'comentarios_fl') return text.slice(0, 65535);
  return text;
}

function interactionValue_cor(value) {
  const text = String(value == null ? '' : value);
  return text.length > 1200 ? text.slice(0, 1200) + '…' : text;
}

async function updateQuickEdit_cor(req, userId, idInsFl, body = {}) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw makeError_cor(401, 'INSTALACIONES_DASHBOARD_USER_REQUIRED', 'Sesión sin usuario válido.');
  }
  const id = Number(idInsFl);
  if (!Number.isInteger(id) || id <= 0) {
    throw makeError_cor(400, 'INSTALACIONES_DASHBOARD_ROW_INVALID', 'El equipo indicado no es válido.');
  }
  if (req && req.viewerContext && req.viewerContext.active) {
    throw makeError_cor(403, 'VIEWER_READ_ONLY', 'El Visor de usuarios es de solo lectura y no permite editar equipos.');
  }
  if (!booleanQuery_cor(body.modo_junta)) {
    throw makeError_cor(400, 'INSTALACIONES_DASHBOARD_MEETING_MODE_REQUIRED', 'La edición rápida solo está disponible en Modo Junta.');
  }

  const field = String(body.campo || body.field || '').trim();
  if (!QUICK_EDIT_LABELS_COR[field]) {
    throw makeError_cor(400, 'INSTALACIONES_DASHBOARD_FIELD_INVALID', 'El campo solicitado no está habilitado para edición rápida.');
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const current = await repository.getReportRowById_cor(id, connection, true);
    if (!current || Number(current.activo) !== 1) {
      throw makeError_cor(404, 'INSTALACIONES_DASHBOARD_ROW_NOT_FOUND', 'El equipo ya no está disponible en el reporte activo.');
    }

    const currentStatus = String(current.estatus || '').trim();
    const allowed = QUICK_EDIT_FIELDS_COR[currentStatus];
    if (!allowed || !allowed.has(field)) {
      throw makeError_cor(
        403,
        'INSTALACIONES_DASHBOARD_FIELD_NOT_ALLOWED',
        'Ese campo no está habilitado para edición rápida en la sección actual.',
        { estatus: currentStatus, campo: field }
      );
    }

    const nextValue = normalizeQuickEditValue_cor(field, body.valor);
    const previousValue = current[field] == null ? '' : String(current[field]);
    if (previousValue === nextValue) {
      await connection.commit();
      return { changed: false, field, previous_value: previousValue, value: nextValue, row: current, interaction: null };
    }

    const affected = await repository.updateReportField_cor(id, field, nextValue, connection);
    if (affected !== 1) {
      throw makeError_cor(409, 'INSTALACIONES_DASHBOARD_UPDATE_CONFLICT', 'El equipo cambió mientras se intentaba guardar. Vuelve a cargar la sección.');
    }

    const updated = await repository.getReportRowById_cor(id, connection, false);
    const label = QUICK_EDIT_LABELS_COR[field];
    const reference = String((updated && updated.referencia_sitio) || current.referencia_sitio || id);
    const interaction = await interactionsService.recordFromRequest_gnral(req, {
      tipo_interaccion: field === 'estatus' ? 'CAMBIAR_ESTATUS' : 'EDITAR',
      modulo: 'instalaciones-dashboard',
      entidad: 'equipo',
      id_referencia: reference,
      titulo: field === 'estatus' ? 'Cambio de estatus desde Modo Junta' : 'Edición rápida desde Modo Junta',
      descripcion: label + ' actualizado en ' + reference + '.',
      ruta_destino: 'instalaciones-dashboard',
      payload_json: {
        id_ins_fl: id,
        id_proyecto: (updated && updated.id_proyecto) || current.id_proyecto || null,
        proyecto: (updated && updated.proyecto) || current.proyecto || null,
        referencia_sitio: (updated && updated.referencia_sitio) || current.referencia_sitio || null,
        campo: field,
        valor_anterior: interactionValue_cor(previousValue),
        valor_nuevo: interactionValue_cor(nextValue),
        estatus_anterior: currentStatus,
        estatus_actual: (updated && updated.estatus) || currentStatus
      },
      detalle_json: {
        source: 'instalaciones-dashboard-modo-junta',
        section_before: currentStatus,
        section_after: (updated && updated.estatus) || currentStatus,
        field
      },
      metodo_http: 'PATCH',
      endpoint: req.originalUrl || '/api/instalaciones/dashboard/reporte/:id_ins_fl/celda'
    }, { executor: connection });

    await connection.commit();
    return {
      changed: true,
      field,
      previous_value: previousValue,
      value: nextValue,
      row: updated,
      interaction: interaction ? { id_interaccion: interaction.id_interaccion, tipo_interaccion: interaction.tipo_interaccion } : null
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  PERMISSIONS_COR,
  REPORT_SECTIONS_COR,
  getBootstrap_cor,
  getSummary_cor,
  getReport_cor,
  updateQuickEdit_cor
};
