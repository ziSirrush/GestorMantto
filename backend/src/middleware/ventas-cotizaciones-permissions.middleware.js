'use strict';

const db = require('../config/db');
const SALES_GROUP_CODE = 'VENTAS';
const VISUAL_ACTION_CODE = 'ACCESO_VISUAL';

const VENTAS_PERMISSION_CODES = Object.freeze({
  cotizaciones: Object.freeze({
    kpis: 'VENTAS_COTIZACIONES_KPI_INDICADORES_COTIZACIONES.VER',
    listar: 'VENTAS_COTIZACIONES_TABLA_COTIZACIONES_LISTADO_COTIZACIONES.VER',
    buscar: 'VENTAS_COTIZACIONES_TABLA_COTIZACIONES_LISTADO_COTIZACIONES.BUSCAR',
    filtrar: 'VENTAS_COTIZACIONES_TABLA_COTIZACIONES_LISTADO_COTIZACIONES.FILTRAR',
    ordenar: 'VENTAS_COTIZACIONES_TABLA_COTIZACIONES_LISTADO_COTIZACIONES.ORDENAR',
    abrirDetalle: 'VENTAS_COTIZACIONES_TABLA_COTIZACIONES_LISTADO_COTIZACIONES.ABRIR_DETALLE',
    crear: 'VENTAS_COTIZACIONES_TABLA_COTIZACIONES_NUEVA_COTIZACION.CREAR',
    verDetalle: 'VENTAS_COTIZACIONES_TABLA_COTIZACIONES_DETALLE_COTIZACION.VER',
    cambiarEstado: 'VENTAS_COTIZACIONES_TABLA_COTIZACIONES_DETALLE_COTIZACION.CAMBIAR_ESTADO',
    comentar: 'VENTAS_COTIZACIONES_TABLA_COTIZACIONES_DETALLE_COTIZACION.AGREGAR_COMENTARIO',
    adjuntar: 'VENTAS_COTIZACIONES_TABLA_COTIZACIONES_DETALLE_COTIZACION.ADJUNTAR_ARCHIVO',
    editar: 'VENTAS_COTIZACIONES_TABLA_COTIZACIONES_EDITAR_COTIZACION.EDITAR',
    eliminarLegacy: 'VENTAS_COTIZACIONES_OPERACION.ELIMINAR'
  }),
  clientes: Object.freeze({
    kpis: 'VENTAS_CLIENTES_KPI_INDICADORES_CLIENTES.VER',
    listar: 'VENTAS_CLIENTES_TABLA_CLIENTES_LISTADO_CLIENTES.VER',
    buscar: 'VENTAS_CLIENTES_TABLA_CLIENTES_LISTADO_CLIENTES.BUSCAR',
    filtrar: 'VENTAS_CLIENTES_TABLA_CLIENTES_LISTADO_CLIENTES.FILTRAR',
    ordenar: 'VENTAS_CLIENTES_TABLA_CLIENTES_LISTADO_CLIENTES.ORDENAR',
    abrirDetalle: 'VENTAS_CLIENTES_TABLA_CLIENTES_LISTADO_CLIENTES.ABRIR_DETALLE',
    crear: 'VENTAS_CLIENTES_TABLA_CLIENTES_NUEVO_CLIENTE.CREAR',
    verDetalle: 'VENTAS_CLIENTES_TABLA_CLIENTES_DETALLE_CLIENTE.VER',
    editar: 'VENTAS_CLIENTES_TABLA_CLIENTES_EDITAR_CLIENTE.EDITAR',
    crearContacto: 'VENTAS_CLIENTES_TABLA_CLIENTES_NUEVO_CONTACTO.CREAR',
    editarContacto: 'VENTAS_CLIENTES_TABLA_CLIENTES_EDITAR_CONTACTO.EDITAR',
    desactivarContacto: 'VENTAS_CLIENTES_TABLA_CLIENTES_DESACTIVAR_CONTACTO.DESACTIVAR',
    eliminarLegacy: 'VENTAS_CLIENTES_OPERACION.ELIMINAR'
  }),
  vendidos: Object.freeze({
    kpis: 'VENTAS_VENDIDOS_KPI_INDICADORES_VENDIDOS.VER',
    listar: 'VENTAS_VENDIDOS_TABLA_COTIZACIONES_VENDIDAS_LISTADO.VER',
    buscar: 'VENTAS_VENDIDOS_TABLA_COTIZACIONES_VENDIDAS_LISTADO.BUSCAR',
    filtrar: 'VENTAS_VENDIDOS_TABLA_COTIZACIONES_VENDIDAS_LISTADO.FILTRAR',
    ordenar: 'VENTAS_VENDIDOS_TABLA_COTIZACIONES_VENDIDAS_LISTADO.ORDENAR',
    abrirDetalle: 'VENTAS_VENDIDOS_TABLA_COTIZACIONES_VENDIDAS_LISTADO.ABRIR_DETALLE'
  }),
  perdidos: Object.freeze({
    kpis: 'VENTAS_PERDIDOS_KPI_INDICADORES_PERDIDOS.VER',
    listar: 'VENTAS_PERDIDOS_TABLA_COTIZACIONES_PERDIDAS_LISTADO.VER',
    buscar: 'VENTAS_PERDIDOS_TABLA_COTIZACIONES_PERDIDAS_LISTADO.BUSCAR',
    filtrar: 'VENTAS_PERDIDOS_TABLA_COTIZACIONES_PERDIDAS_LISTADO.FILTRAR',
    ordenar: 'VENTAS_PERDIDOS_TABLA_COTIZACIONES_PERDIDAS_LISTADO.ORDENAR',
    abrirDetalle: 'VENTAS_PERDIDOS_TABLA_COTIZACIONES_PERDIDAS_LISTADO.ABRIR_DETALLE'
  }),
  proyeccion: Object.freeze({
    kpis: 'VENTAS_PROYECCION_BOTONES_KPI_ETAPAS.VER',
    filtrarKpis: 'VENTAS_PROYECCION_BOTONES_KPI_ETAPAS.FILTRAR',
    listar: 'VENTAS_PROYECCION_TABLA_COTIZACIONES_POR_ESTATUS_LISTADO.VER',
    buscar: 'VENTAS_PROYECCION_TABLA_COTIZACIONES_POR_ESTATUS_LISTADO.BUSCAR',
    filtrar: 'VENTAS_PROYECCION_TABLA_COTIZACIONES_POR_ESTATUS_LISTADO.FILTRAR',
    ordenar: 'VENTAS_PROYECCION_TABLA_COTIZACIONES_POR_ESTATUS_LISTADO.ORDENAR',
    abrirDetalle: 'VENTAS_PROYECCION_TABLA_COTIZACIONES_POR_ESTATUS_LISTADO.ABRIR_DETALLE',
    historial: 'VENTAS_PROYECCION_TABLA_COTIZACIONES_POR_ESTATUS_HISTORIAL.VER_HISTORIAL'
  }),
  prospeccion: Object.freeze({
    kpis: 'VENTAS_PROSPECCION_KPI_INDICADORES.VER',
    listar: 'VENTAS_PROSPECCION_TABLA_VISITAS_LISTADO.VER',
    buscar: 'VENTAS_PROSPECCION_TABLA_VISITAS_LISTADO.BUSCAR',
    filtrar: 'VENTAS_PROSPECCION_TABLA_VISITAS_LISTADO.FILTRAR',
    ordenar: 'VENTAS_PROSPECCION_TABLA_VISITAS_LISTADO.ORDENAR',
    abrirDetalle: 'VENTAS_PROSPECCION_TABLA_VISITAS_LISTADO.ABRIR_DETALLE',
    crear: 'VENTAS_PROSPECCION_TABLA_VISITAS_NUEVA_VISITA.CREAR',
    adjuntarEvidencia: 'VENTAS_PROSPECCION_TABLA_VISITAS_NUEVA_VISITA.ADJUNTAR_EVIDENCIA',
    verDetalle: 'VENTAS_PROSPECCION_TABLA_VISITAS_DETALLE_PROSPECCION.VER',
    cambiarEstado: 'VENTAS_PROSPECCION_TABLA_VISITAS_DETALLE_PROSPECCION.CAMBIAR_ESTADO',
    comentar: 'VENTAS_PROSPECCION_TABLA_VISITAS_DETALLE_PROSPECCION.AGREGAR_COMENTARIO',
    adjuntar: 'VENTAS_PROSPECCION_TABLA_VISITAS_DETALLE_PROSPECCION.ADJUNTAR_ARCHIVO',
    redirigir: 'VENTAS_PROSPECCION_TABLA_VISITAS_DETALLE_PROSPECCION.REDIRIGIR',
    editar: 'VENTAS_PROSPECCION_TABLA_VISITAS_EDITAR_PROSPECCION.EDITAR'
  }),
  mapaProspeccion: Object.freeze({
    verFiltros: 'VENTAS_MAPA_PROSPECCION_MAPA_VISITAS_FILTROS.VER',
    filtrar: 'VENTAS_MAPA_PROSPECCION_MAPA_VISITAS_FILTROS.FILTRAR',
    verMarcadores: 'VENTAS_MAPA_PROSPECCION_MAPA_VISITAS_MARCADORES.VER',
    abrirDetalle: 'VENTAS_MAPA_PROSPECCION_MAPA_VISITAS_MARCADORES.ABRIR_DETALLE'
  }),
  fotosMapa: Object.freeze({
    kpis: 'VENTAS_FOTOS_MAPA_KPI_INDICADORES.VER',
    verFiltros: 'VENTAS_FOTOS_MAPA_FILTROS_PROYECTOS.VER',
    buscar: 'VENTAS_FOTOS_MAPA_FILTROS_PROYECTOS.BUSCAR',
    filtrar: 'VENTAS_FOTOS_MAPA_FILTROS_PROYECTOS.FILTRAR',
    listar: 'VENTAS_FOTOS_MAPA_GALERIA_PROYECTOS_LISTADO.VER',
    verFoto: 'VENTAS_FOTOS_MAPA_GALERIA_PROYECTOS_FOTOGRAFIA.VER',
    verProyecto: 'VENTAS_FOTOS_MAPA_GALERIA_PROYECTOS_DETALLE_PROYECTO.VER_PROYECTO'
  }),
  redes: Object.freeze({
    listar: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_LISTADO.VER',
    buscar: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_LISTADO.BUSCAR',
    filtrar: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_LISTADO.FILTRAR',
    ordenar: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_LISTADO.ORDENAR',
    abrirDetalle: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_LISTADO.ABRIR_DETALLE',
    crear: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_NUEVA_ASIGNACION.CREAR',
    asignarCrear: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_NUEVA_ASIGNACION.ASIGNAR_RESPONSABLES',
    adjuntarCrear: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_NUEVA_ASIGNACION.ADJUNTAR_ARCHIVO',
    verDetalle: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_DETALLE.VER',
    cambiarEstado: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_DETALLE.CAMBIAR_ESTADO',
    editar: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_EDITAR.EDITAR',
    asignarEditar: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_EDITAR.ASIGNAR_RESPONSABLES',
    verImagenes: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_IMAGENES.VER',
    adjuntarImagenes: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_IMAGENES.ADJUNTAR_ARCHIVO',
    verComentarios: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_COMENTARIOS.VER',
    comentar: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_COMENTARIOS.AGREGAR_COMENTARIO',
    adjuntarComentario: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_COMENTARIOS.ADJUNTAR_ARCHIVO',
    verRelacion: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_RELACION_COTIZACION.VER',
    gestionarRelacion: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_RELACION_COTIZACION.GESTIONAR_RELACION_COTIZACION',
    abrirCotizacion: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_RELACION_COTIZACION.ABRIR_DETALLE',
    eliminarLegacy: 'VENTAS_ASIGNACION_REDES_OPERACION.ELIMINAR'
  }),
  dashboard: Object.freeze({
    selector: 'VENTAS_DASHBOARD_SELECTOR_RESPONSABLE_COMERCIAL.VER',
    filtrarSelector: 'VENTAS_DASHBOARD_SELECTOR_RESPONSABLE_COMERCIAL.FILTRAR',
    kpis: 'VENTAS_DASHBOARD_KPI_COMERCIALES_INDICADORES.VER',
    verFiltros: 'VENTAS_DASHBOARD_FILTROS_INFORMACION_MODULOS.VER',
    filtrar: 'VENTAS_DASHBOARD_FILTROS_INFORMACION_MODULOS.FILTRAR',
    clientes: 'VENTAS_DASHBOARD_TABLAS_CONSULTA_CLIENTES.VER',
    abrirClientes: 'VENTAS_DASHBOARD_TABLAS_CONSULTA_CLIENTES.ABRIR_DETALLE',
    cotizaciones: 'VENTAS_DASHBOARD_TABLAS_CONSULTA_COTIZACIONES.VER',
    abrirCotizaciones: 'VENTAS_DASHBOARD_TABLAS_CONSULTA_COTIZACIONES.ABRIR_DETALLE',
    vendidos: 'VENTAS_DASHBOARD_TABLAS_CONSULTA_VENDIDOS.VER',
    abrirVendidos: 'VENTAS_DASHBOARD_TABLAS_CONSULTA_VENDIDOS.ABRIR_DETALLE',
    perdidos: 'VENTAS_DASHBOARD_TABLAS_CONSULTA_PERDIDOS.VER',
    abrirPerdidos: 'VENTAS_DASHBOARD_TABLAS_CONSULTA_PERDIDOS.ABRIR_DETALLE',
    prospeccion: 'VENTAS_DASHBOARD_TABLAS_CONSULTA_PROSPECCION.VER',
    abrirProspeccion: 'VENTAS_DASHBOARD_TABLAS_CONSULTA_PROSPECCION.ABRIR_DETALLE',
    redes: 'VENTAS_DASHBOARD_TABLAS_CONSULTA_ASIGNACION_REDES.VER',
    abrirRedes: 'VENTAS_DASHBOARD_TABLAS_CONSULTA_ASIGNACION_REDES.ABRIR_DETALLE',
    instalaciones: 'VENTAS_DASHBOARD_TABLAS_CONSULTA_INSTALACIONES.VER',
    abrirInstalaciones: 'VENTAS_DASHBOARD_TABLAS_CONSULTA_INSTALACIONES.ABRIR_DETALLE',
    logistica: 'VENTAS_DASHBOARD_TABLAS_CONSULTA_LOGISTICA.VER',
    abrirLogistica: 'VENTAS_DASHBOARD_TABLAS_CONSULTA_LOGISTICA.ABRIR_DETALLE',
    tareasAsignadas: 'VENTAS_DASHBOARD_TABLAS_CONSULTA_TAREAS_ASIGNADAS.VER',
    abrirTareasAsignadas: 'VENTAS_DASHBOARD_TABLAS_CONSULTA_TAREAS_ASIGNADAS.ABRIR_DETALLE',
    tareasCreadas: 'VENTAS_DASHBOARD_TABLAS_CONSULTA_TAREAS_CREADAS.VER',
    abrirTareasCreadas: 'VENTAS_DASHBOARD_TABLAS_CONSULTA_TAREAS_CREADAS.ABRIR_DETALLE',
    generarPdfGeneral: 'VENTAS_DASHBOARD_PDF_REPORTES.GENERAR_PDF_GENERAL',
    generarPdfIndividual: 'VENTAS_DASHBOARD_PDF_REPORTES.GENERAR_PDF_INDIVIDUAL'
  })
});

// Compatibilidad con las rutas históricas de Cotizaciones.
const PERMISSION_CODES = Object.freeze({
  ver: VENTAS_PERMISSION_CODES.cotizaciones.listar,
  crear: VENTAS_PERMISSION_CODES.cotizaciones.crear,
  editar: VENTAS_PERMISSION_CODES.cotizaciones.editar,
  eliminar: VENTAS_PERMISSION_CODES.cotizaciones.eliminarLegacy
});

const MODULE_VISUAL_CODES = Object.freeze({
  VENTAS_COTIZACIONES: 'VENTAS_COTIZACIONES_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  VENTAS_CLIENTES: 'VENTAS_CLIENTES_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  VENTAS_VENDIDOS: 'VENTAS_VENDIDOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  VENTAS_PERDIDOS: 'VENTAS_PERDIDOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  VENTAS_PROYECCION: 'VENTAS_PROYECCION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  VENTAS_PROSPECCION: 'VENTAS_PROSPECCION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  VENTAS_MAPA_PROSPECCION: 'VENTAS_MAPA_PROSPECCION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  VENTAS_FOTOS_MAPA: 'VENTAS_FOTOS_MAPA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  VENTAS_ASIGNACION_REDES: 'VENTAS_ASIGNACION_REDES_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  VENTAS_DASHBOARD: 'VENTAS_DASHBOARD_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
});

function activeUserRolesSql() {
  return `(
    SELECT ur.id_rol
      FROM usuario_roles ur
     WHERE ur.id_usuario = ?
       AND ur.activo = 1
    UNION
    SELECT u.rol_id
      FROM usuarios u
     WHERE u.id_SB = ?
       AND u.estado = 1
       AND u.rol_id IS NOT NULL
  )`;
}

function currentUserId(req) {
  const contextUser = req.contextUser || req.user;
  const userId = Number(contextUser?.id_SB);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

function normalizeCodes(codes) {
  return [...new Set((Array.isArray(codes) ? codes : [codes]).map((code) => String(code || '').trim()).filter(Boolean))];
}

function modulePrefix(permissionCode) {
  const code = String(permissionCode || '');
  return Object.keys(MODULE_VISUAL_CODES)
    .sort((a, b) => b.length - a.length)
    .find((prefix) => code === prefix || code.startsWith(`${prefix}_`)) || null;
}

function moduleVisualPermissionCode(permissionCode) {
  const prefix = modulePrefix(permissionCode);
  return prefix ? MODULE_VISUAL_CODES[prefix] : null;
}

async function getPermissionState(userId, permissionCode) {
  const [rows] = await db.query(
    `SELECT
       psa.id_subelemento_accion,
       (
         SELECT up.permitido
           FROM usuario_permisos up
          WHERE up.id_usuario = ?
            AND up.id_subelemento_accion = psa.id_subelemento_accion
            AND up.activo = 1
            AND (up.fecha_inicio IS NULL OR up.fecha_inicio <= NOW())
            AND (up.fecha_fin IS NULL OR up.fecha_fin >= NOW())
          ORDER BY up.updated_at DESC, up.id_usuario_permiso DESC
          LIMIT 1
       ) AS personalizado,
       EXISTS (
         SELECT 1
           FROM rol_permisos rp
           INNER JOIN ${activeUserRolesSql()} roles_usuario
                   ON roles_usuario.id_rol = rp.id_rol
           INNER JOIN roles r
                   ON r.id_rol = rp.id_rol
                  AND r.estado = 1
          WHERE rp.id_subelemento_accion = psa.id_subelemento_accion
       ) AS configurado_rol,
       EXISTS (
         SELECT 1
           FROM rol_permisos rp
           INNER JOIN ${activeUserRolesSql()} roles_usuario
                   ON roles_usuario.id_rol = rp.id_rol
           INNER JOIN roles r
                   ON r.id_rol = rp.id_rol
                  AND r.estado = 1
          WHERE rp.id_subelemento_accion = psa.id_subelemento_accion
            AND rp.permitido = 1
       ) AS heredado
     FROM perm_subelemento_acciones psa
     WHERE psa.codigo_permiso = ?
       AND psa.activo = 1
     LIMIT 1`,
    [userId, userId, userId, userId, userId, permissionCode]
  );

  if (!rows.length) {
    return {
      code: permissionCode,
      exists: false,
      configured: false,
      personalized: null,
      inherited: false,
      effective: false
    };
  }

  const personalized = rows[0].personalizado === null || rows[0].personalizado === undefined
    ? null
    : Number(rows[0].personalizado) === 1;
  const inherited = Number(rows[0].heredado) === 1;
  const configured = personalized !== null || Number(rows[0].configurado_rol) === 1;

  return {
    code: permissionCode,
    id: Number(rows[0].id_subelemento_accion),
    exists: true,
    configured,
    personalized,
    inherited,
    effective: personalized === null ? inherited : personalized
  };
}

async function hasPermission(userId, permissionCode) {
  const state = await getPermissionState(userId, permissionCode);
  return state.effective === true;
}

async function hasModuleVisualAccess(userId, permissionCode) {
  const visualCode = moduleVisualPermissionCode(permissionCode);
  if (!visualCode) return false;
  const state = await getPermissionState(userId, visualCode);
  return state.effective === true;
}

async function hasSalesVisualAccess(userId) {
  const [rows] = await db.query(
    `SELECT
       psa.codigo_permiso,
       (
         SELECT up.permitido
           FROM usuario_permisos up
          WHERE up.id_usuario = ?
            AND up.id_subelemento_accion = psa.id_subelemento_accion
            AND up.activo = 1
            AND (up.fecha_inicio IS NULL OR up.fecha_inicio <= NOW())
            AND (up.fecha_fin IS NULL OR up.fecha_fin >= NOW())
          ORDER BY up.updated_at DESC, up.id_usuario_permiso DESC
          LIMIT 1
       ) AS personalizado,
       EXISTS (
         SELECT 1
           FROM rol_permisos rp
           INNER JOIN ${activeUserRolesSql()} roles_usuario
                   ON roles_usuario.id_rol = rp.id_rol
           INNER JOIN roles r
                   ON r.id_rol = rp.id_rol
                  AND r.estado = 1
          WHERE rp.id_subelemento_accion = psa.id_subelemento_accion
            AND rp.permitido = 1
       ) AS heredado
      FROM perm_agrupaciones pag
      INNER JOIN perm_modulos pm
              ON pm.id_agrupacion = pag.id_agrupacion
             AND pm.activo = 1
      INNER JOIN perm_elementos pe
              ON pe.id_modulo = pm.id_modulo
             AND pe.activo = 1
      INNER JOIN perm_subelementos ps
              ON ps.id_elemento = pe.id_elemento
             AND ps.activo = 1
      INNER JOIN perm_subelemento_acciones psa
              ON psa.id_subelemento = ps.id_subelemento
             AND psa.activo = 1
      INNER JOIN perm_acciones pac
              ON pac.id_accion = psa.id_accion
             AND pac.activo = 1
     WHERE pag.codigo = ?
       AND pag.activo = 1
       AND pac.codigo = ?`,
    [userId, userId, userId, SALES_GROUP_CODE, VISUAL_ACTION_CODE]
  );

  return rows.some((row) => {
    if (row.personalizado !== null && row.personalizado !== undefined) {
      return Number(row.personalizado) === 1;
    }
    return Number(row.heredado) === 1;
  });
}

async function temporaryFallbackAllowed(req, userId, permissionCode, fallback) {
  if (fallback === 'none') return false;
  // El Alcance de Información nunca concede permisos funcionales.
  // Las acciones se resuelven exclusivamente por el catálogo de permisos.
  if (fallback === 'sales') return hasSalesVisualAccess(userId);
  return hasModuleVisualAccess(userId, permissionCode);
}

async function canUsePermission(req, permissionCode, options = {}) {
  const userId = currentUserId(req);
  if (!userId) {
    return {
      allowed: false,
      status: 401,
      mode: 'SIN_SESION',
      code: permissionCode
    };
  }

  const state = await getPermissionState(userId, permissionCode);
  if (state.configured) {
    return {
      allowed: state.effective,
      status: state.effective ? 200 : 403,
      mode: 'GRANULAR',
      code: permissionCode,
      state
    };
  }

  const fallback = options.fallback || 'module';
  const allowed = await temporaryFallbackAllowed(req, userId, permissionCode, fallback);
  return {
    allowed,
    status: allowed ? 200 : 403,
    mode: 'TRANSICION_SIN_CONFIGURAR',
    code: permissionCode,
    state
  };
}

async function canUseAnyPermission(req, permissionCodes, options = {}) {
  const codes = normalizeCodes(permissionCodes);
  const decisions = [];
  for (const code of codes) decisions.push(await canUsePermission(req, code, options));
  const allowed = decisions.some((decision) => decision.allowed);
  return {
    allowed,
    status: allowed ? 200 : (decisions.some((decision) => decision.status === 401) ? 401 : 403),
    mode: allowed ? decisions.find((decision) => decision.allowed)?.mode : 'DENEGADO',
    codes,
    decisions
  };
}

function denyResponse(res, decision) {
  return res.status(decision.status || 403).json({
    ok: false,
    message: decision.status === 401
      ? 'Sesión sin usuario válido.'
      : 'No tienes permisos para realizar esta acción.',
    permiso: decision.code || decision.codes || null,
    modo_permisos: decision.mode || 'GRANULAR'
  });
}

function requireVentasPermission(actionOrCode, options = {}) {
  const permissionCode = PERMISSION_CODES[actionOrCode] || actionOrCode;
  if (!permissionCode) throw new Error(`Permiso de Ventas no configurado: ${actionOrCode}`);

  return async function ventasPermissionGuard(req, res, next) {
    try {
      const decision = await canUsePermission(req, permissionCode, options);
      if (!decision.allowed) return denyResponse(res, decision);
      req.ventasPermissionDecision = decision;
      return next();
    } catch (error) {
      console.error('[Ventas][Permisos]', {
        permissionCode,
        userId: currentUserId(req),
        code: error?.code || null,
        errno: error?.errno || null,
        sqlMessage: error?.sqlMessage || null,
        message: error?.message || String(error)
      });
      return next(error);
    }
  };
}

function requireVentasAnyPermission(permissionCodes, options = {}) {
  const codes = normalizeCodes(permissionCodes);
  if (!codes.length) throw new Error('No se configuraron permisos de Ventas para la ruta.');

  return async function ventasAnyPermissionGuard(req, res, next) {
    try {
      const decision = await canUseAnyPermission(req, codes, options);
      if (!decision.allowed) return denyResponse(res, decision);
      req.ventasPermissionDecision = decision;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function uploadedFileCount(req) {
  if (req.file) return 1;
  if (Array.isArray(req.files)) return req.files.length;
  if (req.files && typeof req.files === 'object') {
    return Object.values(req.files).reduce((total, files) => total + (Array.isArray(files) ? files.length : 0), 0);
  }
  return 0;
}

function requireVentasPermissionIfFiles(permissionCode, options = {}) {
  const guard = requireVentasPermission(permissionCode, options);
  return function ventasFilePermissionGuard(req, res, next) {
    if (uploadedFileCount(req) === 0) return next();
    return guard(req, res, next);
  };
}


function requireVentasPermissionIf(permissionCode, predicate, options = {}) {
  if (typeof predicate !== 'function') throw new TypeError('La condición del permiso debe ser una función.');
  const guard = requireVentasPermission(permissionCode, options);
  return function ventasConditionalPermissionGuard(req, res, next) {
    let required = false;
    try {
      required = Boolean(predicate(req));
    } catch (error) {
      return next(error);
    }
    if (!required) return next();
    return guard(req, res, next);
  };
}

// Conserva el nombre histórico. Ahora significa que existe por lo menos una
// asignación granular explícita para el usuario o alguno de sus roles.
async function hasLoadedSalesGranularPermissions(userId) {
  const [rows] = await db.query(
    `SELECT EXISTS (
       SELECT 1
         FROM perm_agrupaciones pag
         INNER JOIN perm_modulos pm
                 ON pm.id_agrupacion = pag.id_agrupacion
                AND pm.activo = 1
         INNER JOIN perm_elementos pe
                 ON pe.id_modulo = pm.id_modulo
                AND pe.activo = 1
         INNER JOIN perm_subelementos ps
                 ON ps.id_elemento = pe.id_elemento
                AND ps.activo = 1
         INNER JOIN perm_subelemento_acciones psa
                 ON psa.id_subelemento = ps.id_subelemento
                AND psa.activo = 1
         INNER JOIN perm_acciones pac
                 ON pac.id_accion = psa.id_accion
                AND pac.activo = 1
         LEFT JOIN usuario_permisos up
                ON up.id_usuario = ?
               AND up.id_subelemento_accion = psa.id_subelemento_accion
               AND up.activo = 1
               AND (up.fecha_inicio IS NULL OR up.fecha_inicio <= NOW())
               AND (up.fecha_fin IS NULL OR up.fecha_fin >= NOW())
         LEFT JOIN rol_permisos rp
                ON rp.id_subelemento_accion = psa.id_subelemento_accion
               AND rp.id_rol IN ${activeUserRolesSql()}
         LEFT JOIN roles r
                ON r.id_rol = rp.id_rol
               AND r.estado = 1
        WHERE pag.codigo = ?
          AND pag.activo = 1
          AND pac.codigo <> ?
          AND (up.id_usuario_permiso IS NOT NULL OR r.id_rol IS NOT NULL)
     ) AS cargados`,
    [userId, userId, userId, SALES_GROUP_CODE, VISUAL_ACTION_CODE]
  );

  return Number(rows[0]?.cargados) === 1;
}

module.exports = {
  PERMISSION_CODES,
  VENTAS_PERMISSION_CODES,
  getPermissionState,
  hasPermission,
  hasLoadedSalesGranularPermissions,
  hasSalesVisualAccess,
  hasModuleVisualAccess,
  canUsePermission,
  canUseAnyPermission,
  requireVentasPermission,
  requireVentasAnyPermission,
  requireVentasPermissionIfFiles,
  requireVentasPermissionIf
};
