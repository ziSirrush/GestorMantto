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

async function directorGeneralUserIds_gnral(executor = db) {
  const [rows] = await executor.query(`
    SELECT DISTINCT u.id_SB
      FROM usuarios u
      INNER JOIN usuario_roles ur
        ON ur.id_usuario = u.id_SB
       AND ur.activo = 1
      INNER JOIN roles r
        ON r.id_rol = ur.id_rol
       AND r.estado = 1
     WHERE u.estado = 1
       AND (
         UPPER(TRIM(COALESCE(r.rol, ''))) = 'DIRECTOR GENERAL'
         OR UPPER(TRIM(COALESCE(r.codigo, ''))) IN ('DIRECTOR GENERAL', 'DIRECTOR_GENERAL')
       )
     ORDER BY u.id_SB ASC
  `);

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

  if (!normalizedAction) return emptyResult_gnral('ACCION_FOTOGRAFICA_INVALIDA');
  if (!project || !photoSlot || !stableUrl) return emptyResult_gnral('IDENTIDAD_FOTOGRAFIA_INCOMPLETA');
  if (!userCanManageProjectPhotos_gnral(actor)) return emptyResult_gnral('ACTOR_SIN_ROL_GESTOR_FOTOGRAFIAS');

  try {
    const recipients = await directorGeneralUserIds_gnral();
    if (!recipients.length) return emptyResult_gnral('SIN_DIRECTOR_GENERAL_ACTIVO');

    const uploaded = normalizedAction === ACTION_UPLOADED_GNRAL;
    const domainName = normalizeDomain_gnral(domain) === 'UNITED' ? 'United' : 'Corellian';
    const verb = uploaded ? 'cargó' : 'eliminó';
    const title = uploaded
      ? 'Fotografía de proyecto cargada'
      : 'Fotografía de proyecto eliminada';

    return emitBusinessEventSafe_gnral({
      codigoEvento: EVENT_PROJECT_PHOTO_UPDATED_GNRAL,
      destinatarios: recipients,
      actorUserId: actorId_gnral(actionContext),
      // Si el Gestor también tiene el rol Director General, debe recibir el aviso:
      // la audiencia se define por el rol destino, no por ser distinto del actor.
      excludeActor: false,
      zonaOperativaNoAplica: true,
      requireRoleMatrix: true,
      allowMissingEvent: false,
      titulo: title,
      mensaje: `${actorName_gnral(actionContext)} ${verb} una fotografía del proyecto ${project} (${domainName}).`,
      icono: uploaded ? '📷' : '🗑️',
      accion: 'ABRIR_MODULO',
      idReferencia: positiveId_gnral(photoRecordId),
      ruta: `detalle:proyecto:${project}`,
      eventInstanceKey: `project-photo:${normalizedAction}:${normalizeDomain_gnral(domain)}:${project}:${photoSlot}:${stableUrl}`
    }, {
      label: `project-photo:${normalizedAction.toLowerCase()}`
    });
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
  directorGeneralUserIds_gnral,
  notifyProjectPhotoChange_gnral,
  notifyProjectPhotoUploaded_gnral,
  notifyProjectPhotoDeleted_gnral
};
