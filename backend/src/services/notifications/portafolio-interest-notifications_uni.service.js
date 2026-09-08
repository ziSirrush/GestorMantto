'use strict';

const notificationService = require('./notification.service');
const {
  listUsersWithEffectivePermission
} = require('../permissions/effective-permission.service');
const logger = require('../../shared/logger');

const PERMISSION_CODE =
  'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_SEGUIMIENTO_INTERES_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO';
const EVENT_CODE = 'PORTAFOLIO_INTERES_ACTUALIZACION';

const MEANINGFUL_INTERACTIONS = new Set([
  'CREAR',
  'EDITAR',
  'ACTUALIZAR',
  'COMENTAR',
  'CAMBIAR_ESTATUS',
  'CAMBIAR_PRIORIDAD',
  'ASIGNAR',
  'VALIDAR',
  'VOBO',
  'ADJUNTAR',
  'ELIMINAR'
]);

const EXCLUDED_MODULES = new Set([
  'portafolio-interes',
  'notifications',
  'services',
  'panel-control',
  'usuarios'
]);

function cleanText(value, max = 500) {
  const text = String(value == null ? '' : value).trim();
  return text ? text.slice(0, max) : null;
}

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function uniquePositiveIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
}

function initialContext(interaction) {
  const payload = parseJson(interaction?.payload_json);
  const detail = parseJson(interaction?.detalle_json);
  const stored = detail?.contexto && typeof detail.contexto === 'object' ? detail.contexto : {};
  const entity = cleanText(interaction?.entidad, 100)?.toLowerCase() || null;
  const reference = cleanText(interaction?.id_referencia, 255);

  const ticket = cleanText(
    stored.ticket || payload.ticket || payload.folio ||
    (entity === 'ticket' ? (payload.id || reference) : null),
    255
  );
  const equipment = cleanText(
    stored.equipo || payload.equipo || payload.codigo_equipo ||
    (entity === 'equipo' ? (payload.id || reference) : null),
    255
  );
  const project = cleanText(
    stored.proyecto || payload.proyecto || payload.project ||
    (entity === 'proyecto' ? (payload.id || reference) : null),
    255
  );

  return { entity, ticket, equipment, project };
}

async function resolveTicketContext(executor, reference) {
  const ref = cleanText(reference, 255);
  if (!ref) return null;
  const [rows] = await executor.query(
    `SELECT id, ticket, codigo_equipo, equipo, proyecto, proyecto_padre
       FROM tickets
      WHERE TRIM(COALESCE(ticket, '')) = TRIM(?)
         OR CAST(id AS CHAR) = ?
         OR TRIM(COALESCE(folio, '')) = TRIM(?)
         OR TRIM(COALESCE(id_interno, '')) = TRIM(?)
      ORDER BY id DESC
      LIMIT 1`,
    [ref, ref, ref, ref]
  );
  return rows[0] || null;
}

async function resolveEquipmentContext(executor, reference) {
  const ref = cleanText(reference, 255);
  if (!ref) return null;
  const [rows] = await executor.query(
    `SELECT id_portafolio, numero_equipo, identificacion_sitio, proyecto, zona_id
       FROM portafolio
      WHERE estado_registro = 1
        AND (
          TRIM(COALESCE(numero_equipo, '')) = TRIM(?)
          OR TRIM(COALESCE(identificacion_sitio, '')) = TRIM(?)
        )
      LIMIT 1`,
    [ref, ref]
  );
  return rows[0] || null;
}

function currentUnitedScopeSql(userAlias, zoneSql) {
  return `(
    EXISTS (
      SELECT 1
        FROM usuarios_alcance_informacion uai_interest
       WHERE uai_interest.id_usuario = ${userAlias}
         AND uai_interest.tipo_alcance = 'DOMINIO_COMPLETO'
         AND uai_interest.dominio = 'UNITED'
         AND uai_interest.activo = 1
    )
    OR (
      ${zoneSql} IS NOT NULL
      AND EXISTS (
        SELECT 1
          FROM usuario_zop uz_interest
         WHERE uz_interest.usuario_id = ${userAlias}
           AND uz_interest.zona_id = ${zoneSql}
           AND uz_interest.estado = 1
      )
    )
  )`;
}

async function recipientsForEquipment(executor, equipment) {
  const idPortafolio = Number(equipment?.id_portafolio || 0);
  const project = cleanText(equipment?.proyecto, 255);
  const zoneId = Number(equipment?.zona_id || 0) || null;
  if (!idPortafolio) return [];

  const [rows] = await executor.query(
    `SELECT DISTINCT candidate.id_usuario
       FROM (
         SELECT direct_interest.id_usuario
           FROM portafolio_interes direct_interest
          WHERE direct_interest.id_portafolio = ?
            AND direct_interest.activo = 1

         UNION

         SELECT project_interest.id_usuario
           FROM portafolio_interes project_interest
           INNER JOIN portafolio project_source
                   ON project_source.id_portafolio = project_interest.id_portafolio
                  AND project_source.estado_registro = 1
          WHERE project_interest.activo = 1
            AND project_interest.origen = 'PROYECTO'
            AND LOWER(TRIM(COALESCE(project_source.proyecto, ''))) = LOWER(TRIM(?))
            AND NOT EXISTS (
              SELECT 1
                FROM portafolio_interes direct_override
               WHERE direct_override.id_usuario = project_interest.id_usuario
                 AND direct_override.id_portafolio = ?
            )
       ) candidate
       INNER JOIN usuarios u_interest
               ON u_interest.id_SB = candidate.id_usuario
              AND u_interest.estado = 1
      WHERE ${currentUnitedScopeSql('candidate.id_usuario', '?')}`,
    [idPortafolio, project || '', idPortafolio, zoneId, zoneId]
  );

  return uniquePositiveIds(rows.map((row) => row.id_usuario));
}

async function recipientsForProject(executor, project) {
  const ref = cleanText(project, 255);
  if (!ref) return [];
  const [rows] = await executor.query(
    `SELECT DISTINCT pi.id_usuario
       FROM portafolio_interes pi
       INNER JOIN portafolio p_interest
               ON p_interest.id_portafolio = pi.id_portafolio
              AND p_interest.estado_registro = 1
       INNER JOIN usuarios u_interest
               ON u_interest.id_SB = pi.id_usuario
              AND u_interest.estado = 1
      WHERE pi.activo = 1
        AND pi.origen = 'PROYECTO'
        AND LOWER(TRIM(COALESCE(p_interest.proyecto, ''))) = LOWER(TRIM(?))
        AND ${currentUnitedScopeSql('pi.id_usuario', 'p_interest.zona_id')}`,
    [ref]
  );
  return uniquePositiveIds(rows.map((row) => row.id_usuario));
}

async function filterByInterestPermission(executor, recipients) {
  if (!recipients.length) return [];
  const permitted = new Set(await listUsersWithEffectivePermission(PERMISSION_CODE, executor));
  return recipients.filter((id) => permitted.has(id));
}

function activityLabel(type) {
  const map = {
    CREAR: 'se creó un registro',
    EDITAR: 'se editó información',
    ACTUALIZAR: 'se actualizó información',
    COMENTAR: 'se agregó un comentario',
    CAMBIAR_ESTATUS: 'cambió el estatus',
    CAMBIAR_PRIORIDAD: 'cambió la prioridad',
    ASIGNAR: 'se realizó una asignación',
    VALIDAR: 'se realizó una validación',
    VOBO: 'se actualizó un Vo.Bo.',
    ADJUNTAR: 'se adjuntó un archivo',
    ELIMINAR: 'se eliminó un registro'
  };
  return map[type] || 'se registró actividad';
}

async function resolveContext(executor, interaction) {
  const context = initialContext(interaction);
  let ticketRow = null;
  let equipmentRow = null;

  if (context.ticket) {
    ticketRow = await resolveTicketContext(executor, context.ticket);
    if (ticketRow) {
      context.equipment = cleanText(ticketRow.codigo_equipo || ticketRow.equipo, 255) || context.equipment;
      context.project = cleanText(ticketRow.proyecto || ticketRow.proyecto_padre, 255) || context.project;
    }
  }

  if (context.equipment) {
    equipmentRow = await resolveEquipmentContext(executor, context.equipment);
    if (equipmentRow) {
      context.equipment = cleanText(equipmentRow.numero_equipo, 255) || context.equipment;
      context.project = cleanText(equipmentRow.proyecto, 255) || context.project;
    }
  }

  return { context, ticketRow, equipmentRow };
}

async function processInteraction_uni(interaction, executor) {
  const type = String(interaction?.tipo_interaccion || '').trim().toUpperCase();
  const moduleName = String(interaction?.modulo || '').trim().toLowerCase();
  const entity = String(interaction?.entidad || '').trim().toLowerCase();
  const interactionId = Number(interaction?.id_interaccion || interaction?.id || 0);

  const endpoint = String(interaction?.endpoint || '').trim().toLowerCase();
  const payload = parseJson(interaction?.payload_json);
  const domainMarker = [
    moduleName,
    endpoint,
    payload?.source,
    payload?.origen,
    payload?.template
  ].filter(Boolean).join(' ').toLowerCase();

  if (!interactionId || !MEANINGFUL_INTERACTIONS.has(type)) return { skipped: true, reason: 'INTERACCION_NO_APLICA' };
  if (EXCLUDED_MODULES.has(moduleName)) return { skipped: true, reason: 'MODULO_EXCLUIDO' };
  if (/\/interes(?:\/|$|\?)/i.test(endpoint)) return { skipped: true, reason: 'CAMBIO_DE_SUSCRIPCION' };
  if (entity === 'cotizacion' || entity === 'proyecto_instalaciones') return { skipped: true, reason: 'ENTIDAD_NO_MANTTO' };
  if (/^\/api\/(?:instalaciones(?:\/|$)|ins-fl(?:\/|$)|ventas(?:\/|$)|logistica(?:\/|$)|cobranza-cor(?:\/|$))/i.test(endpoint)) {
    return { skipped: true, reason: 'DOMINIO_NO_MANTTO' };
  }
  if (/\b(?:instalaciones?|corellian)\b/i.test(domainMarker)) {
    return { skipped: true, reason: 'DOMINIO_NO_MANTTO' };
  }

  try {
    const resolved = await resolveContext(executor, interaction);
    const context = resolved.context;
    let recipients = [];
    let subject = null;

    if (resolved.equipmentRow) {
      recipients = await recipientsForEquipment(executor, resolved.equipmentRow);
      subject = `equipo ${resolved.equipmentRow.numero_equipo}`;
    } else if (context.project) {
      recipients = await recipientsForProject(executor, context.project);
      subject = `proyecto ${context.project}`;
    } else {
      return { skipped: true, reason: 'SIN_CONTEXTO_PORTAFOLIO' };
    }

    recipients = await filterByInterestPermission(executor, uniquePositiveIds(recipients));
    if (!recipients.length) return { skipped: true, reason: 'SIN_SEGUIDORES_AUTORIZADOS' };

    const originalTitle = cleanText(interaction?.titulo, 220);
    const originalDescription = cleanText(interaction?.descripcion, 350);
    const contextParts = [];
    if (context.ticket) contextParts.push(`Ticket ${context.ticket}`);
    if (context.project) contextParts.push(`Proyecto ${context.project}`);
    if (context.equipment) contextParts.push(`Equipo ${context.equipment}`);

    const messageParts = [
      `En ${subject} ${activityLabel(type)}.`,
      originalTitle && !/^actualizaste\b/i.test(originalTitle) ? originalTitle : null,
      originalDescription,
      contextParts.length ? contextParts.join(' · ') : null
    ].filter(Boolean);

    const result = await notificationService.emitWithConnection_gnral(executor, {
      codigoEvento: EVENT_CODE,
      destinatarios: recipients,
      actorUserId: Number(interaction?.id_usuario || 0) || null,
      eventInstanceKey: `usuario_interaccion:${interactionId}`,
      titulo: resolved.equipmentRow
        ? `Actividad en equipo de interés: ${resolved.equipmentRow.numero_equipo}`
        : `Actividad en proyecto de interés: ${context.project}`,
      mensaje: messageParts.join(' ').slice(0, 500),
      idReferencia: interactionId,
      ruta: 'proyectos',
      accion: 'ABRIR_MODULO'
    });

    return {
      skipped: false,
      recipients,
      created: Number(result?.created || 0),
      trace_id: result?.trace_id || null
    };
  } catch (error) {
    logger.error('[PORTAFOLIO_INTEREST_NOTIFICATION_FAILED]', {
      id_interaccion: interactionId || null,
      tipo_interaccion: type || null,
      modulo: moduleName || null,
      entidad: entity || null,
      error_code: error?.code || null,
      error: error?.message || String(error)
    });
    return {
      skipped: true,
      reason: 'ERROR_FANOUT_INTERES',
      error: error?.message || String(error)
    };
  }
}

module.exports = {
  processInteraction_uni
};
