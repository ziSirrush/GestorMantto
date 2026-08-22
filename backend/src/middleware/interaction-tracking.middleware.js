'use strict';

const interactionsService = require('../services/interactions/interactions.service');
const logger = require('../shared/logger');

const TRACKED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const entityPatterns = [
  { kind: 'tarea', re: /^\/api\/pendientes(?:\/([^/?#]+))?/i },
  { kind: 'ticket', re: /^\/api\/(?:tickets|ticket)(?:\/([^/?#]+))?/i },
  { kind: 'cotizacion', re: /^\/api\/ventas\/cotizaciones(?:\/([^/?#]+))?/i },
  { kind: 'prospeccion', re: /^\/api\/ventas\/prospeccion(?:\/([^/?#]+))?/i },
  { kind: 'redes', re: /^\/api\/ventas\/redes(?:\/([^/?#]+))?/i },
  { kind: 'soporte', re: /^\/api\/(?:soporte(?:-solicitudes)?|support)(?:\/solicitudes)?(?:\/([^/?#]+))?/i },
  { kind: 'proyecto_instalaciones', re: /^\/api\/instalaciones\/(?:proyectos|proyecto)(?:\/([^/?#]+))?/i },
  { kind: 'proyecto', re: /^\/api\/proyectos(?:\/([^/?#]+))?/i },
  { kind: 'equipo', re: /^\/api\/(?:portafolio|equipos)(?:\/([^/?#]+))?/i },
  { kind: 'usuario', re: /^\/api\/(?:usuarios|panel-control\/usuarios)(?:\/([^/?#]+))?/i }
];

const invalidReferenceWords = new Set([
  'catalogos', 'catalogo', 'bootstrap', 'sync', 'estado', 'estatus', 'prioridad',
  'comentarios', 'comentario', 'archivos', 'archivo', 'adjuntos', 'adjunto',
  'subtareas', 'subtarea', 'detalle', 'dashboard', 'resumen', 'search', 'buscar',
  'preferencias', 'matriz', 'auditoria'
]);

function cleanReference_gnral(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  if (!text || invalidReferenceWords.has(text.toLowerCase())) return null;
  return text.slice(0, 150);
}

function requestPath_gnral(req) {
  return String(req.originalUrl || req.url || '').split('?')[0] || '/';
}

function shouldIgnore_gnral(method, path) {
  if (!TRACKED_METHODS.has(method)) return true;
  const p = String(path || '').toLowerCase();

  if (
    p === '/api/health' ||
    p.startsWith('/api/interacciones') ||
    p.startsWith('/api/auth/') ||
    p.startsWith('/api/push') ||
    p.startsWith('/api/device-permissions') ||
    p.startsWith('/api/notificaciones') ||
    p.startsWith('/api/panel-control') ||
    p === '/api/usuarios' || p.startsWith('/api/usuarios/') ||
    p === '/api/users' || p.startsWith('/api/users/') ||
    p === '/api/roles' || p.startsWith('/api/roles/') ||
    p === '/api/permisos' || p.startsWith('/api/permisos/') ||
    p.includes('/viewer') ||
    p.includes('/sync') ||
    p.includes('/import')
  ) return true;

  return false;
}

function endpointEntity_gnral(path) {
  for (const pattern of entityPatterns) {
    const match = String(path || '').match(pattern.re);
    if (match) {
      return {
        kind: pattern.kind,
        id: cleanReference_gnral(match[1])
      };
    }
  }
  return { kind: null, id: null };
}

function responseReference_gnral(value) {
  const keys = [
    'id_pendiente', 'id_ticket', 'id_cotizacion', 'id_pros', 'id_redes',
    'id_solicitud', 'id_proyecto', 'id_equipo', 'id_usuario', 'id_SB', 'id'
  ];

  function inspect(object, depth) {
    if (!object || typeof object !== 'object' || depth > 3) return null;
    for (const key of keys) {
      const candidate = cleanReference_gnral(object[key]);
      if (candidate) return candidate;
    }
    for (const key of ['data', 'result', 'row', 'registro', 'pendiente', 'solicitud']) {
      const nested = inspect(object[key], depth + 1);
      if (nested) return nested;
    }
    return null;
  }

  return inspect(value, 0);
}

function parseHeaderPayload_gnral(req) {
  const raw = String(req.get('X-Mantto-Payload') || '').trim();
  if (!raw || raw.length > 4000) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function headerRoute_gnral(req) {
  const route = String(req.get('X-Mantto-Route') || '').trim();
  return route ? route.slice(0, 500) : null;
}

function actionType_gnral(method, path) {
  const p = String(path || '').toLowerCase();
  if (p.includes('coment')) return 'COMENTAR';
  if (p.includes('vobo') || p.includes('vo-bo') || p.includes('vo_bo')) return 'VOBO';
  if (p.includes('validacion') || p.includes('/validar') || p.includes('/aprobar') || p.includes('/rechazar')) return 'VALIDAR';
  if (p.includes('/estatus') || p.includes('/status')) return 'CAMBIAR_ESTATUS';
  if (p.includes('/prioridad')) return 'CAMBIAR_PRIORIDAD';
  if (p.includes('/asign') || p.includes('/responsable')) return 'ASIGNAR';
  if (p.includes('/archivo') || p.includes('/adjunto') || p.includes('/evidencia') || p.includes('/foto')) {
    return method === 'DELETE' ? 'ELIMINAR' : 'ADJUNTAR';
  }
  if (method === 'DELETE') return 'ELIMINAR';
  if (method === 'POST') return 'CREAR';
  if (method === 'PUT') return 'EDITAR';
  if (method === 'PATCH') return 'ACTUALIZAR';
  return 'INTERACCION';
}

function entityLabel_gnral(entity, route) {
  const labels = {
    tarea: 'Tarea',
    ticket: 'Ticket',
    cotizacion: 'Cotización',
    prospeccion: 'Prospección',
    redes: 'Asignación a Redes',
    soporte: 'Solicitud de Soporte',
    proyecto: 'Proyecto',
    proyecto_instalaciones: 'Proyecto de Instalación',
    equipo: 'Equipo',
    usuario: 'Usuario'
  };
  return labels[String(entity || '').toLowerCase()] || String(route || 'Registro').replace(/[-_]+/g, ' ');
}

function actionVerb_gnral(type) {
  const verbs = {
    CREAR: 'Creaste',
    EDITAR: 'Editaste',
    ACTUALIZAR: 'Actualizaste',
    COMENTAR: 'Comentaste',
    CAMBIAR_ESTATUS: 'Cambiaste el estatus de',
    CAMBIAR_PRIORIDAD: 'Cambiaste la prioridad de',
    ASIGNAR: 'Asignaste en',
    VALIDAR: 'Validaste',
    VOBO: 'Registraste Vo.Bo. en',
    ADJUNTAR: 'Adjuntaste archivo en',
    ELIMINAR: 'Eliminaste'
  };
  return verbs[type] || 'Interactuaste con';
}

function mappedTarget_gnral(entity, reference) {
  const ref = cleanReference_gnral(reference);
  if (!entity || !ref) return null;

  if (entity === 'tarea') return { route: 'tareas', payload: { id: ref } };
  if (entity === 'ticket') return { route: 'detalle', payload: { type: 'ticket', id: ref } };
  if (entity === 'cotizacion') return { route: 'ventas-cotizaciones-detalle', payload: { id: ref } };
  if (entity === 'prospeccion') return { route: 'ventas-prospeccion-detalle', payload: { id: ref } };
  if (entity === 'redes') return { route: 'ventas-asignacion-redes-detalle', payload: { id: ref } };
  if (entity === 'soporte') return { route: 'soporte-solicitudes', payload: { id: ref } };
  if (entity === 'proyecto') return { route: 'detalle', payload: { type: 'proyecto', id: ref } };
  if (entity === 'proyecto_instalaciones') return { route: 'detalle', payload: { type: 'proyecto', id: ref, source: 'instalaciones-proyectos' } };
  if (entity === 'equipo') return { route: 'detalle', payload: { type: 'equipo', id: ref } };
  if (entity === 'usuario') return { route: 'usuarios', payload: { id: ref } };
  return null;
}

function targetFromRequest_gnral(req, entity, reference) {
  const route = headerRoute_gnral(req);
  const payload = parseHeaderPayload_gnral(req);
  const mapped = mappedTarget_gnral(entity, reference);

  if (route && payload) {
    const payloadRef = cleanReference_gnral(
      payload.id || payload.id_referencia || payload.referenceId || payload.codigo ||
      payload.proyecto || payload.equipo || payload.ticket
    );
    if (!reference || !payloadRef || String(payloadRef) === String(reference)) {
      return { route, payload };
    }
  }

  if (mapped) return mapped;
  if (route) return { route, payload };
  return { route: 'home', payload: null };
}

function interactionTrackingMiddleware_gnral(req, res, next) {
  const method = String(req.method || 'GET').toUpperCase();
  const path = requestPath_gnral(req);

  if (shouldIgnore_gnral(method, path)) return next();

  if (!res.locals.__h1InteractionJsonWrapped) {
    res.locals.__h1InteractionJsonWrapped = true;
    const originalJson = res.json.bind(res);
    res.json = function h1InteractionJson(body) {
      res.locals.__h1InteractionResponseBody = body;
      return originalJson(body);
    };
  }

  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;

    const actor = req.actorUser || req.user || null;
    if (!actor || !(actor.id_SB || actor.id)) return;

    const endpoint = endpointEntity_gnral(path);
    const reference = endpoint.id || responseReference_gnral(res.locals.__h1InteractionResponseBody);
    const type = actionType_gnral(method, path);
    const target = targetFromRequest_gnral(req, endpoint.kind, reference);
    const label = entityLabel_gnral(endpoint.kind, target.route || path);
    const title = `${actionVerb_gnral(type)} ${label}${reference ? ' · ' + reference : ''}`.slice(0, 255);

    interactionsService.recordFromRequest_gnral(req, {
      tipo_interaccion: type,
      modulo: target.route || headerRoute_gnral(req) || 'general',
      entidad: endpoint.kind,
      id_referencia: reference,
      titulo: title,
      descripcion: `Acción ${method} completada correctamente.`.slice(0, 500),
      ruta_destino: target.route || headerRoute_gnral(req) || 'home',
      payload_json: target.payload || null,
      detalle_json: {
        source: 'backend-http',
        status: Number(res.statusCode || 0)
      },
      metodo_http: method,
      endpoint: path
    }).catch(error => {
      logger.error('H1 Interacciones: no fue posible registrar una acción exitosa.', {
        message: error.message,
        method,
        path,
        status: res.statusCode
      });
    });
  });

  return next();
}

module.exports = {
  interactionTrackingMiddleware_gnral
};
