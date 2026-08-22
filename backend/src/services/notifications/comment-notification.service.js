'use strict';

const db = require('../../config/db');
const logger = require('../../shared/logger');
const notificationService = require('./notification.service');

function positiveId_gnral(value) {
  const id = Number(value || 0);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function actorId_gnral(actionContext) {
  return positiveId_gnral(
    actionContext?.user?.id_SB ||
    actionContext?.user?.id ||
    actionContext?.contextUser?.id_SB ||
    actionContext?.contextUser?.id
  );
}

function actorName_gnral(actionContext) {
  return String(
    actionContext?.user?.nombre ||
    actionContext?.user?.correo ||
    actionContext?.contextUser?.nombre ||
    actionContext?.contextUser?.correo ||
    'Usuario'
  ).trim() || 'Usuario';
}

function recipientIds_gnral(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(positiveId_gnral)
    .filter(Boolean))];
}

async function emitCommentSafe_gnral({
  recipientIds,
  actionContext,
  title,
  message,
  referenceId,
  route
}) {
  try {
    const result = await notificationService.emit({
      codigoEvento: 'COMENTARIO',
      destinatarios: recipientIds_gnral(recipientIds),
      actorUserId: actorId_gnral(actionContext),
      // Ventas no usa el dominio z_op de Operacion. La relacion con el
      // registro se resuelve en cada consulta de destinatarios de este archivo.
      zonaOperativaNoAplica: true,
      requireRoleMatrix: true,
      allowMissingEvent: true,
      titulo: title,
      mensaje: message,
      icono: '💬',
      accion: 'ABRIR_MODULO',
      idReferencia: positiveId_gnral(referenceId),
      ruta: route
    });

    return result || { created: 0 };
  } catch (error) {
    // Una falla del canal de notificaciones nunca debe revertir un comentario
    // que ya fue guardado correctamente por el modulo de negocio.
    logger.error('No se pudo emitir la notificacion general COMENTARIO.', {
      message: error.message,
      code: error.code || null,
      referenceId: positiveId_gnral(referenceId),
      route
    });
    return { created: 0, skipped: 0, reason: 'ERROR_EMISION_COMENTARIO' };
  }
}

async function notifyCotizacionComment_gnral(idCotizacion, actionContext) {
  try {
    const id = positiveId_gnral(idCotizacion);
    if (!id) return { created: 0, reason: 'REFERENCIA_INVALIDA' };

    const [rows] = await db.query(`
      SELECT id_asesor, id_admin, created_by, nombre_proyecto
      FROM ventas_cotizaciones_cor
      WHERE id_cotizacion = ?
        AND activo = 1
      LIMIT 1
    `, [id]);

    const row = rows[0];
    if (!row) return { created: 0, reason: 'COTIZACION_NO_ENCONTRADA' };

    const actorName = actorName_gnral(actionContext);
    const label = String(row.nombre_proyecto || `Cotizacion ${id}`).trim();
    return emitCommentSafe_gnral({
      recipientIds: [row.id_asesor, row.id_admin, row.created_by],
      actionContext,
      title: 'Nuevo comentario en cotizacion',
      message: `${actorName} comento en ${label}`,
      referenceId: id,
      route: 'ventas-cotizaciones-detalle'
    });
  } catch (error) {
    logger.error('No se pudieron resolver destinatarios de comentario de Cotizaciones.', {
      message: error.message,
      idCotizacion
    });
    return { created: 0, reason: 'ERROR_DESTINATARIOS_COTIZACION' };
  }
}

async function notifyProspeccionComment_gnral(idProspeccion, actionContext) {
  try {
    const id = positiveId_gnral(idProspeccion);
    if (!id) return { created: 0, reason: 'REFERENCIA_INVALIDA' };

    const [rows] = await db.query(`
      SELECT id_usuario, proyecto, empresa
      FROM ventas_prospecciones
      WHERE id_pros = ?
        AND activo = 1
      LIMIT 1
    `, [id]);

    const row = rows[0];
    if (!row) return { created: 0, reason: 'PROSPECCION_NO_ENCONTRADA' };

    const actorName = actorName_gnral(actionContext);
    const label = String(row.proyecto || row.empresa || `Prospeccion ${id}`).trim();
    return emitCommentSafe_gnral({
      recipientIds: [row.id_usuario],
      actionContext,
      title: 'Nuevo comentario en prospeccion',
      message: `${actorName} comento en ${label}`,
      referenceId: id,
      route: 'ventas-prospeccion-detalle'
    });
  } catch (error) {
    logger.error('No se pudieron resolver destinatarios de comentario de Prospeccion.', {
      message: error.message,
      idProspeccion
    });
    return { created: 0, reason: 'ERROR_DESTINATARIOS_PROSPECCION' };
  }
}

async function notifyRedesComment_gnral(idRedes, actionContext) {
  try {
    const id = positiveId_gnral(idRedes);
    if (!id) return { created: 0, reason: 'REFERENCIA_INVALIDA' };

    const [rows] = await db.query(`
      SELECT id_usuario_asignado, created_by, nombre_proyecto, nombre_empresa
      FROM ventas_redes
      WHERE id_redes = ?
        AND COALESCE(activo, 1) = 1
      LIMIT 1
    `, [id]);

    const row = rows[0];
    if (!row) return { created: 0, reason: 'REDES_NO_ENCONTRADA' };

    const actorName = actorName_gnral(actionContext);
    const label = String(row.nombre_proyecto || row.nombre_empresa || `Asignacion a Redes ${id}`).trim();
    return emitCommentSafe_gnral({
      recipientIds: [row.id_usuario_asignado, row.created_by],
      actionContext,
      title: 'Nuevo comentario en Asignacion a Redes',
      message: `${actorName} comento en ${label}`,
      referenceId: id,
      route: 'ventas-asignacion-redes-detalle'
    });
  } catch (error) {
    logger.error('No se pudieron resolver destinatarios de comentario de Asignacion a Redes.', {
      message: error.message,
      idRedes
    });
    return { created: 0, reason: 'ERROR_DESTINATARIOS_REDES' };
  }
}

module.exports = {
  notifyCotizacionComment_gnral,
  notifyProspeccionComment_gnral,
  notifyRedesComment_gnral
};
