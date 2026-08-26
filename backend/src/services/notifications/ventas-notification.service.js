'use strict';

const db = require('../../config/db');
const logger = require('../../shared/logger');
const ventasVisibility = require('../../modules/ventas/ventas-visibility.service');
const businessEmitter = require('./notification-business-emitter.service');

const EVENTS = Object.freeze({
  COTIZACION_COMENTARIO: 'ventas.cotizacion.comentario',
  COTIZACION_ESTATUS: 'ventas.cotizacion.estatus',
  PROSPECCION_COMENTARIO: 'ventas.prospeccion.comentario',
  PROSPECCION_ESTATUS: 'ventas.prospeccion.estatus',
  REDES_COMENTARIO: 'ventas.redes.comentario',
  REDES_ESTATUS: 'ventas.redes.estatus'
});

const ROUTES = Object.freeze({
  COTIZACION: 'ventas-cotizaciones-detalle',
  PROSPECCION: 'ventas-prospeccion-detalle',
  REDES: 'ventas-asignacion-redes-detalle'
});

function positiveId_gnral(value) {
  const id = Number(value || 0);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function actorId_gnral(actionContext) {
  return positiveId_gnral(
    actionContext?.contextUser?.id_SB ||
    actionContext?.contextUser?.id ||
    actionContext?.user?.id_SB ||
    actionContext?.user?.id
  );
}

function actorName_gnral(actionContext) {
  return String(
    actionContext?.contextUser?.nombre ||
    actionContext?.contextUser?.iniciales ||
    actionContext?.contextUser?.correo ||
    actionContext?.user?.nombre ||
    actionContext?.user?.iniciales ||
    actionContext?.user?.correo ||
    'Usuario'
  ).trim() || 'Usuario';
}

function text_gnral(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function dateIdentity_gnral(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const raw = String(value).trim();
  return raw || null;
}

function uniqueIds_gnral(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(positiveId_gnral)
    .filter(Boolean))];
}

async function matrixCandidateUserIds_gnral(codigoEvento) {
  const [rows] = await db.query(`
    SELECT DISTINCT u.id_SB
      FROM notificacion_eventos e
      INNER JOIN notificacion_evento_roles ner
        ON ner.codigo_evento = e.codigo_evento
       AND ner.activo = 1
      INNER JOIN roles r
        ON r.id_rol = ner.id_rol
       AND r.estado = 1
      INNER JOIN usuario_roles ur
        ON ur.id_rol = r.id_rol
       AND ur.activo = 1
      INNER JOIN usuarios u
        ON u.id_SB = ur.id_usuario
       AND u.estado = 1
     WHERE e.codigo_evento = ?
       AND e.activo = 1
     ORDER BY u.id_SB ASC
  `, [codigoEvento]);

  return uniqueIds_gnral(rows.map((row) => row.id_SB));
}

async function recipientHasRecordScope_gnral(userId, ownerIds) {
  const scope = await ventasVisibility.resolveVisibilityScope(db, {
    user: { id_SB: userId },
    contextUser: { id_SB: userId }
  });

  if (scope?.mode === 'ALL' || scope?.accessTotal === true) return true;

  const visibleIds = new Set(uniqueIds_gnral(scope?.advisorIds));
  return uniqueIds_gnral(ownerIds).some((id) => visibleIds.has(id));
}

async function resolveRecipients_gnral(codigoEvento, ownerIds, actionContext) {
  const actorId = actorId_gnral(actionContext);
  const candidates = await matrixCandidateUserIds_gnral(codigoEvento);
  const recipients = [];

  for (const userId of candidates) {
    if (actorId && userId === actorId) continue;
    try {
      if (await recipientHasRecordScope_gnral(userId, ownerIds)) {
        recipients.push(userId);
      }
    } catch (error) {
      logger.error('[VENTAS_NOTIFICATION_SCOPE_FAILED]', {
        codigo_evento: codigoEvento,
        id_usuario: userId,
        error: error.message
      });
    }
  }

  return recipients;
}

async function emitSalesEventSafe_gnral({
  codigoEvento,
  ownerIds,
  actionContext,
  title,
  message,
  referenceId,
  route,
  eventInstanceKey
}) {
  try {
    const recipients = await resolveRecipients_gnral(codigoEvento, ownerIds, actionContext);
    return businessEmitter.emitBusinessEventSafe_gnral({
      codigoEvento,
      destinatarios: recipients,
      actorUserId: actorId_gnral(actionContext),
      // Ventas pertenece a CORELLIAN y no utiliza z_op. El alcance real del
      // registro ya fue validado arriba con el mismo resolver de Ventas.
      zonaOperativaNoAplica: true,
      requireRoleMatrix: true,
      allowMissingEvent: false,
      titulo: title,
      mensaje: message,
      accion: 'ABRIR_MODULO',
      idReferencia: positiveId_gnral(referenceId),
      ruta: route,
      eventInstanceKey
    }, {
      label: `ventas:${codigoEvento}`
    });
  } catch (error) {
    logger.error('[VENTAS_NOTIFICATION_RESOLUTION_FAILED]', {
      codigo_evento: codigoEvento,
      id_referencia: positiveId_gnral(referenceId),
      error: error.message
    });
    return {
      ok: false,
      created: 0,
      skipped: 0,
      recipients: [],
      reason: 'ERROR_RESOLUCION_VENTAS'
    };
  }
}

async function loadCotizacion_gnral(idCotizacion) {
  const [rows] = await db.query(`
    SELECT
      id_cotizacion,
      id_asesor,
      id_admin,
      nombre_proyecto,
      cliente,
      estatus_proyecto,
      fecha_cambio_estatus,
      updated_at
    FROM ventas_cotizaciones_cor
    WHERE id_cotizacion = ?
      AND activo = 1
    LIMIT 1
  `, [idCotizacion]);
  return rows[0] || null;
}

async function loadProspeccion_gnral(idPros) {
  const [rows] = await db.query(`
    SELECT
      id_pros,
      id_usuario,
      proyecto,
      empresa,
      estatus,
      fecha_cam_estatus,
      updated_at
    FROM ventas_prospecciones
    WHERE id_pros = ?
      AND activo = 1
    LIMIT 1
  `, [idPros]);
  return rows[0] || null;
}

async function loadRedes_gnral(idRedes) {
  const [rows] = await db.query(`
    SELECT
      vr.id_redes,
      vr.id_usuario_asignado,
      vr.nombre_proyecto,
      vr.nombre_empresa,
      vr.id_estatus,
      cg.articulo AS estatus,
      vr.fecha_cambio_estatus,
      vr.updated_at
    FROM ventas_redes vr
    LEFT JOIN catalogo_general cg
      ON cg.id_catalogo = vr.id_estatus
    WHERE vr.id_redes = ?
      AND COALESCE(vr.activo, 1) = 1
    LIMIT 1
  `, [idRedes]);
  return rows[0] || null;
}

async function captureSafe_gnral(label, loader, id) {
  const referenceId = positiveId_gnral(id);
  if (!referenceId) return null;
  try {
    return await loader(referenceId);
  } catch (error) {
    logger.error('[VENTAS_NOTIFICATION_CAPTURE_FAILED]', {
      label,
      id_referencia: referenceId,
      error: error.message
    });
    return null;
  }
}

function captureCotizacionStatus_gnral(idCotizacion) {
  return captureSafe_gnral('cotizacion.estatus', loadCotizacion_gnral, idCotizacion);
}

function captureProspeccionStatus_gnral(idPros) {
  return captureSafe_gnral('prospeccion.estatus', loadProspeccion_gnral, idPros);
}

function captureRedesStatus_gnral(idRedes) {
  return captureSafe_gnral('redes.estatus', loadRedes_gnral, idRedes);
}

async function notifyCotizacionComment_gnral(idCotizacion, idComentario, actionContext) {
  const id = positiveId_gnral(idCotizacion);
  const commentId = positiveId_gnral(idComentario);
  if (!id || !commentId) return { created: 0, reason: 'IDENTIDAD_COMENTARIO_INVALIDA' };

  try {
    const row = await loadCotizacion_gnral(id);
    if (!row) return { created: 0, reason: 'COTIZACION_NO_ENCONTRADA' };
    const label = text_gnral(row.nombre_proyecto, text_gnral(row.cliente, `Cotizacion ${id}`));
    return emitSalesEventSafe_gnral({
      codigoEvento: EVENTS.COTIZACION_COMENTARIO,
      ownerIds: [row.id_asesor, row.id_admin],
      actionContext,
      title: 'Nuevo comentario en cotizacion',
      message: `${actorName_gnral(actionContext)} comento en ${label}`,
      referenceId: id,
      route: ROUTES.COTIZACION,
      eventInstanceKey: `ventas-cotizacion-comentario:${id}:${commentId}`
    });
  } catch (error) {
    logger.error('[VENTAS_COTIZACION_COMMENT_NOTIFICATION_FAILED]', { id_cotizacion: id, error: error.message });
    return { created: 0, reason: 'ERROR_NOTIFICACION_COTIZACION_COMENTARIO' };
  }
}

async function notifyProspeccionComment_gnral(idPros, idComentario, actionContext) {
  const id = positiveId_gnral(idPros);
  const commentId = positiveId_gnral(idComentario);
  if (!id || !commentId) return { created: 0, reason: 'IDENTIDAD_COMENTARIO_INVALIDA' };

  try {
    const row = await loadProspeccion_gnral(id);
    if (!row) return { created: 0, reason: 'PROSPECCION_NO_ENCONTRADA' };
    const label = text_gnral(row.proyecto, text_gnral(row.empresa, `Prospeccion ${id}`));
    return emitSalesEventSafe_gnral({
      codigoEvento: EVENTS.PROSPECCION_COMENTARIO,
      ownerIds: [row.id_usuario],
      actionContext,
      title: 'Nuevo comentario en prospeccion',
      message: `${actorName_gnral(actionContext)} comento en ${label}`,
      referenceId: id,
      route: ROUTES.PROSPECCION,
      eventInstanceKey: `ventas-prospeccion-comentario:${id}:${commentId}`
    });
  } catch (error) {
    logger.error('[VENTAS_PROSPECCION_COMMENT_NOTIFICATION_FAILED]', { id_pros: id, error: error.message });
    return { created: 0, reason: 'ERROR_NOTIFICACION_PROSPECCION_COMENTARIO' };
  }
}

async function notifyRedesComment_gnral(idRedes, idComentario, actionContext) {
  const id = positiveId_gnral(idRedes);
  const commentId = positiveId_gnral(idComentario);
  if (!id || !commentId) return { created: 0, reason: 'IDENTIDAD_COMENTARIO_INVALIDA' };

  try {
    const row = await loadRedes_gnral(id);
    if (!row) return { created: 0, reason: 'REDES_NO_ENCONTRADA' };
    const label = text_gnral(row.nombre_proyecto, text_gnral(row.nombre_empresa, `Asignacion a Redes ${id}`));
    return emitSalesEventSafe_gnral({
      codigoEvento: EVENTS.REDES_COMENTARIO,
      ownerIds: [row.id_usuario_asignado],
      actionContext,
      title: 'Nuevo comentario en Asignacion a Redes',
      message: `${actorName_gnral(actionContext)} comento en ${label}`,
      referenceId: id,
      route: ROUTES.REDES,
      eventInstanceKey: `ventas-redes-comentario:${id}:${commentId}`
    });
  } catch (error) {
    logger.error('[VENTAS_REDES_COMMENT_NOTIFICATION_FAILED]', { id_redes: id, error: error.message });
    return { created: 0, reason: 'ERROR_NOTIFICACION_REDES_COMENTARIO' };
  }
}

function statusChanged_gnral(beforeValue, afterValue) {
  return String(beforeValue ?? '').trim().toLowerCase() !== String(afterValue ?? '').trim().toLowerCase();
}

async function notifyCotizacionStatus_gnral(idCotizacion, before, actionContext) {
  const id = positiveId_gnral(idCotizacion);
  if (!id || !before) return { created: 0, reason: 'ESTADO_PREVIO_NO_DISPONIBLE' };

  try {
    const after = await loadCotizacion_gnral(id);
    if (!after) return { created: 0, reason: 'COTIZACION_NO_ENCONTRADA' };
    if (!statusChanged_gnral(before.estatus_proyecto, after.estatus_proyecto)) {
      return { created: 0, reason: 'ESTATUS_SIN_CAMBIO' };
    }
    const marker = dateIdentity_gnral(after.fecha_cambio_estatus) || dateIdentity_gnral(after.updated_at);
    if (!marker) return { created: 0, reason: 'IDENTIDAD_ESTATUS_NO_DISPONIBLE' };
    const label = text_gnral(after.nombre_proyecto, text_gnral(after.cliente, `Cotizacion ${id}`));
    return emitSalesEventSafe_gnral({
      codigoEvento: EVENTS.COTIZACION_ESTATUS,
      ownerIds: [after.id_asesor, after.id_admin],
      actionContext,
      title: 'Estatus de cotizacion actualizado',
      message: `${actorName_gnral(actionContext)} cambio ${label}: ${text_gnral(before.estatus_proyecto, 'Sin estatus')} -> ${text_gnral(after.estatus_proyecto, 'Sin estatus')}`,
      referenceId: id,
      route: ROUTES.COTIZACION,
      eventInstanceKey: `ventas-cotizacion-estatus:${id}:${text_gnral(before.estatus_proyecto, 'NULL')}->${text_gnral(after.estatus_proyecto, 'NULL')}:${marker}`
    });
  } catch (error) {
    logger.error('[VENTAS_COTIZACION_STATUS_NOTIFICATION_FAILED]', { id_cotizacion: id, error: error.message });
    return { created: 0, reason: 'ERROR_NOTIFICACION_COTIZACION_ESTATUS' };
  }
}

async function notifyProspeccionStatus_gnral(idPros, before, actionContext) {
  const id = positiveId_gnral(idPros);
  if (!id || !before) return { created: 0, reason: 'ESTADO_PREVIO_NO_DISPONIBLE' };

  try {
    const after = await loadProspeccion_gnral(id);
    if (!after) return { created: 0, reason: 'PROSPECCION_NO_ENCONTRADA' };
    if (!statusChanged_gnral(before.estatus, after.estatus)) {
      return { created: 0, reason: 'ESTATUS_SIN_CAMBIO' };
    }
    const marker = dateIdentity_gnral(after.fecha_cam_estatus) || dateIdentity_gnral(after.updated_at);
    if (!marker) return { created: 0, reason: 'IDENTIDAD_ESTATUS_NO_DISPONIBLE' };
    const label = text_gnral(after.proyecto, text_gnral(after.empresa, `Prospeccion ${id}`));
    return emitSalesEventSafe_gnral({
      codigoEvento: EVENTS.PROSPECCION_ESTATUS,
      ownerIds: [after.id_usuario],
      actionContext,
      title: 'Estatus de prospeccion actualizado',
      message: `${actorName_gnral(actionContext)} cambio ${label}: ${text_gnral(before.estatus, 'Sin estatus')} -> ${text_gnral(after.estatus, 'Sin estatus')}`,
      referenceId: id,
      route: ROUTES.PROSPECCION,
      eventInstanceKey: `ventas-prospeccion-estatus:${id}:${text_gnral(before.estatus, 'NULL')}->${text_gnral(after.estatus, 'NULL')}:${marker}`
    });
  } catch (error) {
    logger.error('[VENTAS_PROSPECCION_STATUS_NOTIFICATION_FAILED]', { id_pros: id, error: error.message });
    return { created: 0, reason: 'ERROR_NOTIFICACION_PROSPECCION_ESTATUS' };
  }
}

async function notifyRedesStatus_gnral(idRedes, before, actionContext) {
  const id = positiveId_gnral(idRedes);
  if (!id || !before) return { created: 0, reason: 'ESTADO_PREVIO_NO_DISPONIBLE' };

  try {
    const after = await loadRedes_gnral(id);
    if (!after) return { created: 0, reason: 'REDES_NO_ENCONTRADA' };
    if (positiveId_gnral(before.id_estatus) === positiveId_gnral(after.id_estatus)) {
      return { created: 0, reason: 'ESTATUS_SIN_CAMBIO' };
    }
    const marker = dateIdentity_gnral(after.fecha_cambio_estatus) || dateIdentity_gnral(after.updated_at);
    if (!marker) return { created: 0, reason: 'IDENTIDAD_ESTATUS_NO_DISPONIBLE' };
    const label = text_gnral(after.nombre_proyecto, text_gnral(after.nombre_empresa, `Asignacion a Redes ${id}`));
    return emitSalesEventSafe_gnral({
      codigoEvento: EVENTS.REDES_ESTATUS,
      ownerIds: [after.id_usuario_asignado],
      actionContext,
      title: 'Estatus de Asignacion a Redes actualizado',
      message: `${actorName_gnral(actionContext)} cambio ${label}: ${text_gnral(before.estatus, 'Sin estatus')} -> ${text_gnral(after.estatus, 'Sin estatus')}`,
      referenceId: id,
      route: ROUTES.REDES,
      eventInstanceKey: `ventas-redes-estatus:${id}:${positiveId_gnral(before.id_estatus) || 'NULL'}->${positiveId_gnral(after.id_estatus) || 'NULL'}:${marker}`
    });
  } catch (error) {
    logger.error('[VENTAS_REDES_STATUS_NOTIFICATION_FAILED]', { id_redes: id, error: error.message });
    return { created: 0, reason: 'ERROR_NOTIFICACION_REDES_ESTATUS' };
  }
}

module.exports = {
  EVENTS,
  ROUTES,
  captureCotizacionStatus_gnral,
  captureProspeccionStatus_gnral,
  captureRedesStatus_gnral,
  notifyCotizacionComment_gnral,
  notifyCotizacionStatus_gnral,
  notifyProspeccionComment_gnral,
  notifyProspeccionStatus_gnral,
  notifyRedesComment_gnral,
  notifyRedesStatus_gnral
};
