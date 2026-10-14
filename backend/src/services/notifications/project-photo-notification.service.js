'use strict';

const db = require('../../config/db');
const logger = require('../../shared/logger');
const { userCanManageProjectPhotos_gnral } = require('../../middleware/project-photo.middleware');
const { emitBusinessEventSafe_gnral } = require('./notification-business-emitter.service');

const EVENT_PROJECT_PHOTO_UPDATED_GNRAL = 'FOTOGRAFIA_PROYECTO_ACTUALIZADA';
const ACTION_UPLOADED_GNRAL = 'CARGADA';
const ACTION_DELETED_GNRAL = 'ELIMINADA';

function positiveId_gnral(value) {
  const id = Number(value || 0);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function cleanText_gnral(value, max = 255) {
  const text = String(value == null ? '' : value).trim();
  return text ? text.slice(0, max) : null;
}

function actionUser_gnral(actionContext) {
  return actionContext?.user || actionContext?.contextUser || actionContext || null;
}

function actorId_gnral(actionContext) {
  const actor = actionUser_gnral(actionContext);
  return positiveId_gnral(actor && (actor.id_SB || actor.id || actor.user_id));
}

function actorName_gnral(actionContext) {
  const actor = actionUser_gnral(actionContext) || {};
  return cleanText_gnral(
    actor.nombre || actor.name || actor.iniciales || actor.correo || actor.email,
    160
  ) || 'Un Gestor de Fotografías';
}

function normalizeAction_gnral(value) {
  const action = String(value || '').trim().toUpperCase();
  return action === ACTION_UPLOADED_GNRAL || action === ACTION_DELETED_GNRAL
    ? action
    : null;
}

function normalizeDomain_gnral(value) {
  return String(value || '').trim().toUpperCase() === 'UNITED' ? 'UNITED' : 'CORELLIAN';
}

/**
 * El Panel de Control es la fuente de verdad de destinatarios.
 * Resuelve usuarios con una relacion ACTIVA Evento + Rol desde
 * notificacion_evento_roles; no declara nombres de roles en codigo.
 * El motor notification.service vuelve a validar las politicas
 * OBLIGATORIA/OPCIONAL, Mi Perfil y los canales Campana/Push.
 */
async function notificationMatrixRecipientIds_gnral(executor = db) {
  const [rows] = await executor.query(`
    SELECT DISTINCT u.id_SB
      FROM notificacion_eventos e
      INNER JOIN notificacion_evento_roles ner
        ON ner.codigo_evento = e.codigo_evento
       AND ner.activo = 1
       AND ner.politica IN ('OBLIGATORIA', 'OPCIONAL')
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
  `, [EVENT_PROJECT_PHOTO_UPDATED_GNRAL]);

  return [...new Set(rows
    .map((row) => positiveId_gnral(row.id_SB))
    .filter(Boolean))];
}

function emptyResult_gnral(reason) {
  return {
    ok: false,
    created: 0,
    skipped: 0,
    recipients: [],
    reason
  };
}

async function notifyProjectPhotoChange_gnral({
  action,
  domain,
  projectId,
  photoRecordId,
  slot,
  storageUrl,
  actionContext
} = {}) {
  const normalizedAction = normalizeAction_gnral(action);
  const project = cleanText_gnral(projectId, 255);
  const photoSlot = cleanText_gnral(slot, 80);
  const stableUrl = cleanText_gnral(storageUrl, 1500);
  const actor = actionUser_gnral(actionContext);

  if (!normalizedAction || !project || !photoSlot || !stableUrl) {
    const reason = !normalizedAction
      ? 'ACCION_FOTOGRAFICA_INVALIDA'
      : 'IDENTIDAD_FOTOGRAFIA_INCOMPLETA';
    logger.warn('[PROJECT_PHOTO_NOTIFICATION_INPUT_REJECTED]', {
      codigo_evento: EVENT_PROJECT_PHOTO_UPDATED_GNRAL,
      dominio: normalizeDomain_gnral(domain),
      proyecto: project,
      actor_user_id: actorId_gnral(actionContext),
      reason
    });
    return emptyResult_gnral(reason);
  }
  if (!userCanManageProjectPhotos_gnral(actor)) {
    logger.warn('[PROJECT_PHOTO_NOTIFICATION_ACTOR_REJECTED]', {
      codigo_evento: EVENT_PROJECT_PHOTO_UPDATED_GNRAL,
      dominio: normalizeDomain_gnral(domain),
      proyecto: project,
      actor_user_id: actorId_gnral(actionContext),
      reason: 'ACTOR_SIN_ROL_GESTOR_FOTOGRAFIAS'
    });
    return emptyResult_gnral('ACTOR_SIN_ROL_GESTOR_FOTOGRAFIAS');
  }

  try {
    const recipients = await notificationMatrixRecipientIds_gnral();
    const domainCode = normalizeDomain_gnral(domain);
    if (!recipients.length) {
      logger.warn('[PROJECT_PHOTO_NOTIFICATION_NO_PANEL_RECIPIENTS]', {
        codigo_evento: EVENT_PROJECT_PHOTO_UPDATED_GNRAL,
        dominio: domainCode,
        proyecto: project,
        accion_fotografia: normalizedAction,
        actor_user_id: actorId_gnral(actionContext),
        reason: 'SIN_DESTINATARIOS_HABILITADOS_EN_PANEL'
      });
      return emptyResult_gnral('SIN_DESTINATARIOS_HABILITADOS_EN_PANEL');
    }

    const uploaded = normalizedAction === ACTION_UPLOADED_GNRAL;
    const domainName = domainCode === 'UNITED' ? 'United' : 'Corellian';
    // El tipo de ruta es el contrato de navegacion; el ID no indica dominio.
    // CORELLIAN exige el detalle unificado con alcance de Instalaciones.
    const destination = domainCode === 'CORELLIAN'
      ? `detalle:proyecto-corellian:${project}`
      : `detalle:proyecto:${project}`;
    const verb = uploaded ? 'cargó' : 'eliminó';
    const title = uploaded
      ? 'Fotografía de proyecto cargada'
      : 'Fotografía de proyecto eliminada';

    const emission = await emitBusinessEventSafe_gnral({
      codigoEvento: EVENT_PROJECT_PHOTO_UPDATED_GNRAL,
      destinatarios: recipients,
      actorUserId: actorId_gnral(actionContext),
      // Los roles receptores proceden del Panel (no del codigo). Si el
      // actor pertenece a la matriz habilitada, tambien puede recibir.
      excludeActor: false,
      zonaOperativaNoAplica: true,
      requireRoleMatrix: true,
      allowMissingEvent: false,
      titulo: title,
      mensaje: `${actorName_gnral(actionContext)} ${verb} una fotografía del proyecto ${project} (${domainName}).`,
      icono: uploaded ? '📷' : '🗑️',
      accion: 'ABRIR_MODULO',
      idReferencia: positiveId_gnral(photoRecordId),
      ruta: destination,
      eventInstanceKey: `project-photo:${normalizedAction}:${domainCode}:${project}:${photoSlot}:${stableUrl}`
    }, {
      label: `project-photo:${normalizedAction.toLowerCase()}`
    });

    // "Creada" no equivale a "entregada por Push". El envio depende de
    // suscripcion y despacho posteriores; registrar ambas capas por separado.
    const diagnostics = {
      codigo_evento: EVENT_PROJECT_PHOTO_UPDATED_GNRAL,
      dominio: domainCode,
      proyecto: project,
      accion_fotografia: normalizedAction,
      actor_user_id: actorId_gnral(actionContext),
      destino: destination,
      destinatarios_panel_candidatos: recipients.length,
      creadas: Number(emission?.created || 0),
      omitidas: Number(emission?.skipped || 0),
      push_elegibles: Array.isArray(emission?.push_recipients) ? emission.push_recipients.length : 0,
      razon: emission?.reason || null,
      razones_omision: emission?.skipped_reasons || null,
      trace_id: emission?.trace_id || null,
      error_code: emission?.error_code || null
    };
    if (!diagnostics.creadas) logger.warn('[PROJECT_PHOTO_NOTIFICATION_NOT_CREATED]', diagnostics);
    else logger.info('[PROJECT_PHOTO_NOTIFICATION_EMISSION]', diagnostics);
    return emission;
  } catch (error) {
    logger.error('[PROJECT_PHOTO_NOTIFICATION_FAILED]', {
      codigo_evento: EVENT_PROJECT_PHOTO_UPDATED_GNRAL,
      accion_fotografia: normalizedAction,
      dominio: normalizeDomain_gnral(domain),
      proyecto: project,
      campo: photoSlot,
      actor_user_id: actorId_gnral(actionContext),
      error_code: error?.code || null,
      error: error?.message || String(error)
    });
    return emptyResult_gnral('ERROR_NOTIFICACION_FOTOGRAFIA_PROYECTO');
  }
}

function notifyProjectPhotoUploaded_gnral(input) {
  return notifyProjectPhotoChange_gnral({ ...input, action: ACTION_UPLOADED_GNRAL });
}

function notifyProjectPhotoDeleted_gnral(input) {
  return notifyProjectPhotoChange_gnral({ ...input, action: ACTION_DELETED_GNRAL });
}

module.exports = {
  EVENT_PROJECT_PHOTO_UPDATED_GNRAL,
  ACTION_UPLOADED_GNRAL,
  ACTION_DELETED_GNRAL,
  notificationMatrixRecipientIds_gnral,
  notifyProjectPhotoChange_gnral,
  notifyProjectPhotoUploaded_gnral,
  notifyProjectPhotoDeleted_gnral
};
