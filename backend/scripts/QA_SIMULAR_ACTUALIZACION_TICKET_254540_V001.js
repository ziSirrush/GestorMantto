'use strict';

// Simula el evento de una actualización sin escribir en tickets.
// Por defecto solo hace precheck; --confirm crea una notificación QA real.

const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../src/config/db');
const { resolveSeguimientoRecipients_uni } = require('../src/services/notifications/portafolio-seguimiento-especial-notifications_uni.service');
const { emitBusinessEventSafe_gnral } = require('../src/services/notifications/notification-business-emitter.service');

const TICKET_REF = '254540';
const EXPECTED_FOLLOWER_ID = 4;
const EVENT_CODE = 'TICKET_ACTUALIZADO';
const EVENT_INSTANCE_KEY = 'qa:ticket-254540:actualizacion:2026-09-30:v1';

async function main() {
  const [tickets] = await db.query(
    'SELECT id, ticket, codigo_equipo, proyecto, proyecto_padre FROM tickets WHERE ticket = ? ORDER BY id DESC LIMIT 1',
    [TICKET_REF]
  );
  const ticket = tickets[0];
  if (!ticket) throw new Error(`Ticket ${TICKET_REF} no encontrado.`);

  const [direct] = await db.query(`
    SELECT id_usuario FROM seguimiento_especial
    WHERE origen = 'UNITED' AND entidad_tipo = 'TICKET'
      AND entidad_id = ? AND activo = 1
    ORDER BY id_usuario
  `, [ticket.id]);
  const directIds = direct.map((row) => Number(row.id_usuario));

  const resolved = await resolveSeguimientoRecipients_uni({
    executor: db,
    contextoNegocio: {
      dominio: 'UNITED',
      tipo: 'TICKET',
      id_ticket: Number(ticket.id),
      ticket: ticket.ticket,
      numero_equipo: ticket.codigo_equipo,
      proyecto: ticket.proyecto || ticket.proyecto_padre
    },
    codigoEventoNativo: EVENT_CODE
  });
  const resolvedIds = (resolved.followers || []).map((row) => Number(row.id_usuario));
  const [events] = await db.query(
    'SELECT activo, campana_default, push_default FROM notificacion_eventos WHERE codigo_evento = ? LIMIT 1',
    [EVENT_CODE]
  );

  console.log(JSON.stringify({
    ticket: ticket.ticket,
    ticket_id: Number(ticket.id),
    seguidores_directos: directIds,
    destinatarios_resueltos: resolvedIds,
    zona_id: Number(resolved.context?.zona_id) || null,
    evento: events[0] || null
  }, null, 2));

  if (JSON.stringify(directIds) !== JSON.stringify([EXPECTED_FOLLOWER_ID]) ||
      JSON.stringify(resolvedIds) !== JSON.stringify([EXPECTED_FOLLOWER_ID]) ||
      resolved.applicable !== true ||
      !Number(resolved.context?.zona_id) ||
      Number(events[0]?.activo) !== 1) {
    throw new Error('Precheck falló: se esperaba únicamente al seguidor directo 4 y el evento activo.');
  }

  if (!process.argv.includes('--confirm')) {
    console.log('PRECHECK PASS. No se creó ninguna notificación.');
    return;
  }

  const traceId = crypto.randomUUID();
  const result = await emitBusinessEventSafe_gnral({
    codigoEvento: EVENT_CODE,
    destinatarios: [],
    actorUserId: null,
    zonaOperativaId: Number(resolved.context.zona_id),
    requireRoleMatrix: true,
    allowMissingEvent: false,
    titulo: 'Ticket actualizado (QA)',
    mensaje: `[QA] Simulación de actualización del Ticket ${TICKET_REF}. No se modificaron sus datos.`,
    icono: '🔄',
    accion: 'ABRIR_TICKET',
    idReferencia: Number(ticket.id),
    ruta: `detalle:ticket:${TICKET_REF}`,
    eventInstanceKey: EVENT_INSTANCE_KEY,
    traceId,
    contextoSeguimiento: {
      dominio: 'UNITED',
      tipo: 'TICKET',
      id_ticket: Number(ticket.id),
      ticket: ticket.ticket,
      numero_equipo: ticket.codigo_equipo,
      proyecto: ticket.proyecto || ticket.proyecto_padre,
      zona_id: Number(resolved.context.zona_id),
      identificador_operacion: EVENT_INSTANCE_KEY
    }
  }, { label: 'qa-simular-actualizacion-ticket-254540-v001' });

  const [persisted] = await db.query(`
    SELECT id_notificacion, id_usuario, tipo_notificacion, fecha_creacion,
           JSON_CONTAINS(
             COALESCE(codigos_visuales_json, JSON_ARRAY()),
             JSON_QUOTE('SEGUIMIENTO_ESPECIAL')
           ) AS seguimiento_especial
    FROM sup_notificaciones
    WHERE trace_id = ?
    ORDER BY id_notificacion
  `, [traceId]);

  console.log(JSON.stringify({
    trace_id: traceId,
    motor: {
      ok: result?.ok,
      created: result?.created,
      recipients: result?.recipients,
      reason: result?.reason || null
    },
    notificaciones: persisted
  }, null, 2));

  if (result?.ok !== true || Number(result?.created) !== 1 ||
      persisted.length !== 1 || Number(persisted[0].id_usuario) !== EXPECTED_FOLLOWER_ID ||
      persisted[0].tipo_notificacion !== EVENT_CODE ||
      Number(persisted[0].seguimiento_especial) !== 1) {
    throw new Error('QA FAIL: la entrega no coincide con un único seguidor directo.');
  }

  console.log('QA PASS: una notificación TICKET_ACTUALIZADO para el seguidor directo 4; Ticket sin modificar.');
}

main()
  .catch((error) => {
    console.error(`QA FAIL: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.end());
