'use strict';

const db = require('../config/db');
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
  'preferencias', 'matriz', 'auditoria', 'equipos', 'tickets', 'proyectos'
]);

const contextKeys = Object.freeze({
  ticket: ['ticket', 'no_ticket', 'numero_ticket', 'folio_ticket', 'folio'],
  proyecto: ['proyecto', 'project', 'proyecto_codigo', 'codigo_proyecto', 'proyecto_nombre', 'nombre_proyecto', 'proyecto_padre'],
  equipo: ['equipo', 'numero_equipo', 'codigo_equipo', 'equipo_numero', 'no_equipo']
});

function cleanReference_gnral(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  if (!text || invalidReferenceWords.has(text.toLowerCase())) return null;
  return text.slice(0, 150);
}

function cleanContext_gnral(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  return text ? text.slice(0, 180) : null;
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

function referenceFromPayload_gnral(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return cleanReference_gnral(
    payload.id || payload.id_referencia || payload.referenceId || payload.codigo ||
    payload.ticket || payload.proyecto || payload.project || payload.equipo
  );
}

function entityFromRoute_gnral(route, payload) {
  const type = String(payload?.type || '').trim().toLowerCase();
  if (['ticket', 'proyecto', 'equipo'].includes(type)) return type;

  const r = String(route || '').toLowerCase();
  if (r === 'tareas') return 'tarea';
  if (r.includes('cotizacion')) return 'cotizacion';
  if (r.includes('prospeccion')) return 'prospeccion';
  if (r.includes('redes')) return 'redes';
  if (r.includes('ticket')) return 'ticket';
  if (r.includes('instalaciones-proyectos')) return 'proyecto_instalaciones';
  if (r.includes('proyecto')) return 'proyecto';
  if (r.includes('portafolio') || r.includes('equipo')) return 'equipo';
  if (r.includes('soporte')) return 'soporte';
  if (r.includes('usuario')) return 'usuario';
  return null;
}

function actionType_gnral(method, path) {
  const p = String(path || '').toLowerCase();
  if (p.includes('coment')) return 'COMENTAR';
  if (p.includes('vobo') || p.includes('vo-bo') || p.includes('vo_bo')) return 'VOBO';
  if (p.includes('validacion') || p.includes('/validar') || p.includes('/aprobar') || p.includes('/rechazar')) return 'VALIDAR';
  if (p.includes('/estatus') || p.includes('/status')) return 'CAMBIAR_ESTATUS';
  if (p.includes('/prioridad')) return 'CAMBIAR_PRIORIDAD';
  if (p.includes('/asign') || p.includes('/responsable')) return 'ASIGNAR';
  if (p.includes('/archivo') || p.includes('/adjunto') || p.includes('/evidencia') || p.includes('/foto') || p.includes('/imagen')) {
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

function isImageUpload_gnral(req, path) {
  const p = String(path || '').toLowerCase();
  if (p.includes('/foto') || p.includes('/imagen') || p.includes('/image')) return true;
  const files = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) files.push(...req.files);
  else if (req.files && typeof req.files === 'object') {
    Object.values(req.files).forEach(value => {
      if (Array.isArray(value)) files.push(...value);
      else if (value) files.push(value);
    });
  }
  return files.some(file => String(file?.mimetype || '').toLowerCase().startsWith('image/'));
}

function actionVerb_gnral(type, req, path) {
  const verbs = {
    CREAR: 'Creaste',
    EDITAR: 'Editaste',
    ACTUALIZAR: 'Actualizaste',
    COMENTAR: 'Comentaste en',
    CAMBIAR_ESTATUS: 'Cambiaste el estatus de',
    CAMBIAR_PRIORIDAD: 'Cambiaste la prioridad de',
    ASIGNAR: 'Asignaste en',
    VALIDAR: 'Validaste',
    VOBO: 'Registraste Vo.Bo. en',
    ELIMINAR: 'Eliminaste'
  };
  if (type === 'ADJUNTAR') return isImageUpload_gnral(req, path) ? 'Cargaste imagen en' : 'Adjuntaste archivo en';
  return verbs[type] || 'Actualizaste';
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
  const routeEntity = entityFromRoute_gnral(route, payload);
  const payloadRef = referenceFromPayload_gnral(payload);
  const mapped = mappedTarget_gnral(entity, reference);

  // Si la mutación ocurrió dentro de un detalle, conserva el contexto del objeto
  // que el usuario estaba viendo. Esto evita que el id de un archivo/comentario
  // nuevo reemplace por error al Ticket/Proyecto/Equipo padre.
  if (route && payload && routeEntity && routeEntity === entity) {
    if (!reference || !payloadRef || String(payloadRef) === String(reference)) {
      return { route, payload };
    }
  }

  if (mapped) return mapped;
  if (route && payload) return { route, payload };
  if (route) return { route, payload: null };
  return { route: 'home', payload: null };
}

function inspectContextValue_gnral(value, keys, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 3) return null;
  for (const key of keys) {
    const candidate = cleanContext_gnral(value[key]);
    if (candidate) return candidate;
  }
  for (const key of ['data', 'result', 'row', 'registro', 'detalle', 'ticket', 'proyecto', 'equipo']) {
    const nested = value[key];
    if (!nested || typeof nested !== 'object') continue;
    const found = inspectContextValue_gnral(nested, keys, depth + 1);
    if (found) return found;
  }
  return null;
}

function contextFromSources_gnral(req, responseBody, entity, reference, target) {
  const headerPayload = parseHeaderPayload_gnral(req);
  const sources = [headerPayload, req.body, responseBody, target?.payload].filter(Boolean);
  const context = { ticket: null, proyecto: null, equipo: null };

  for (const source of sources) {
    if (!context.ticket) context.ticket = inspectContextValue_gnral(source, contextKeys.ticket);
    if (!context.proyecto) context.proyecto = inspectContextValue_gnral(source, contextKeys.proyecto);
    if (!context.equipo) context.equipo = inspectContextValue_gnral(source, contextKeys.equipo);
  }

  if (entity === 'ticket' && !context.ticket) context.ticket = cleanContext_gnral(reference);
  if ((entity === 'proyecto' || entity === 'proyecto_instalaciones') && !context.proyecto) context.proyecto = cleanContext_gnral(reference);
  if (entity === 'equipo' && !context.equipo) context.equipo = cleanContext_gnral(reference);

  return context;
}

async function enrichTicketContext_gnral(context) {
  const ticket = cleanContext_gnral(context?.ticket);
  if (!ticket) return context;

  try {
    const [rows] = await db.query(`
      SELECT
        ticket,
        folio,
        id_interno,
        proyecto,
        proyecto_padre,
        codigo_equipo
      FROM tickets
      WHERE TRIM(COALESCE(ticket, '')) = ?
         OR CAST(id AS CHAR) = ?
         OR TRIM(COALESCE(folio, '')) = ?
         OR TRIM(COALESCE(id_interno, '')) = ?
      ORDER BY id DESC
      LIMIT 1
    `, [ticket, ticket, ticket, ticket]);

    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!row) return context;

    return {
      ticket: cleanContext_gnral(row.ticket || row.folio || row.id_interno || ticket) || ticket,
      proyecto: context.proyecto || cleanContext_gnral(row.proyecto || row.proyecto_padre),
      equipo: context.equipo || cleanContext_gnral(row.codigo_equipo)
    };
  } catch (error) {
    logger.warn('H1 Interacciones: no fue posible enriquecer el contexto del ticket.', {
      message: error.message,
      ticket
    });
    return context;
  }
}

function ticketLabel_gnral(value) {
  const text = cleanContext_gnral(value);
  if (!text) return null;
  return /^#/.test(text) ? `Ticket ${text}` : `Ticket #${text}`;
}

function humanCopy_gnral(type, entity, reference, context, req, path, route) {
  const label = entityLabel_gnral(entity, route);
  let primary = null;

  if (entity === 'ticket') primary = ticketLabel_gnral(context.ticket || reference);
  else if (entity === 'proyecto' || entity === 'proyecto_instalaciones') {
    primary = context.proyecto ? `Proyecto ${context.proyecto}` : (reference ? `${label} ${reference}` : label);
  } else if (entity === 'equipo') {
    primary = context.equipo ? `Equipo ${context.equipo}` : (reference ? `Equipo ${reference}` : 'Equipo');
  } else {
    primary = reference ? `${label} ${reference}` : label;
  }

  const title = `${actionVerb_gnral(type, req, path)} ${primary}`.replace(/\s+/g, ' ').trim().slice(0, 255);

  const parts = [];
  if (context.ticket) parts.push(ticketLabel_gnral(context.ticket));
  if (context.proyecto) parts.push(`Proyecto ${context.proyecto}`);
  if (context.equipo) parts.push(`Equipo ${context.equipo}`);

  const unique = [];
  parts.filter(Boolean).forEach(part => {
    if (!unique.includes(part)) unique.push(part);
  });

  const description = (unique.length ? unique.join(' · ') : primary).slice(0, 500);
  return { title, description };
}

function payloadWithContext_gnral(targetPayload, context) {
  const payload = targetPayload && typeof targetPayload === 'object' ? { ...targetPayload } : {};
  if (context.ticket) payload.ticket = context.ticket;
  if (context.proyecto) payload.proyecto = context.proyecto;
  if (context.equipo) payload.equipo = context.equipo;
  return Object.keys(payload).length ? payload : null;
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

    (async () => {
      const endpoint = endpointEntity_gnral(path);
      const route = headerRoute_gnral(req);
      const routePayload = parseHeaderPayload_gnral(req);
      const routeEntity = entityFromRoute_gnral(route, routePayload);
      const routeReference = routeEntity ? referenceFromPayload_gnral(routePayload) : null;
      const responseReference = responseReference_gnral(res.locals.__h1InteractionResponseBody);

      // Prioridad: entidad/ref del endpoint -> entidad/ref de la pantalla actual ->
      // id de respuesta. Así un archivo o comentario no suplanta al objeto padre.
      const entity = endpoint.kind || routeEntity || null;
      const reference = endpoint.id || routeReference || (entity ? responseReference : null);
      const type = actionType_gnral(method, path);
      const target = targetFromRequest_gnral(req, entity, reference);

      let context = contextFromSources_gnral(
        req,
        res.locals.__h1InteractionResponseBody,
        entity,
        reference,
        target
      );
      if (entity === 'ticket') context = await enrichTicketContext_gnral(context);

      const copy = humanCopy_gnral(type, entity, reference, context, req, path, target.route || route || path);
      const publicPayload = payloadWithContext_gnral(target.payload, context);

      await interactionsService.recordFromRequest_gnral(req, {
        tipo_interaccion: type,
        modulo: target.route || route || 'general',
        entidad: entity,
        id_referencia: reference,
        titulo: copy.title,
        descripcion: copy.description,
        ruta_destino: target.route || route || 'home',
        payload_json: publicPayload,
        detalle_json: {
          source: 'backend-http',
          status: Number(res.statusCode || 0),
          contexto: context
        },
        // Se conservan únicamente para auditoría interna en Aiven.
        // listForUser_gnral no los expone al cliente.
        metodo_http: method,
        endpoint: path
      });
    })().catch(error => {
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
