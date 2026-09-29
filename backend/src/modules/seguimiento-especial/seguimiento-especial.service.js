'use strict';

const db = require('../../config/db');
const repository = require('./seguimiento-especial.repository');
const {
  buildTicketScopeSql_gnral
} = require('../../services/information-record-scope-gnral.service');

function httpError(status, message, code = null) {
  const error = new Error(message);
  error.status = status;
  error.statusCode = status;
  if (code) error.code = code;
  return error;
}

function positiveUserId(user) {
  const id = Number(user?.id_SB || user?.id || user?.user_id || 0);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function assertPersonalContext(req) {
  const actor = positiveUserId(req?.actorUser || req?.user);
  const effective = positiveUserId(req?.contextUser || req?.user);
  if (actor && effective && actor !== effective) {
    throw httpError(
      403,
      'Seguimiento Especial no esta disponible en modo Visor porque su estado es personal por usuario.',
      'VIEWER_READ_ONLY'
    );
  }
}

function actorId(req) {
  assertPersonalContext(req);
  const id = positiveUserId(req?.actorUser || req?.user || req?.contextUser);
  if (!id) throw httpError(401, 'Sesion requerida.', 'AUTH_REQUIRED');
  return id;
}

function ticketRef(req) {
  const value = String(req?.params?.ticket || '').trim();
  if (!value) throw httpError(400, 'Ticket requerido.', 'TICKET_REQUIRED');
  return value;
}

function requestedActive(req) {
  if (!req?.body || !Object.prototype.hasOwnProperty.call(req.body, 'activo')) {
    throw httpError(400, 'activo es obligatorio.', 'SEGUIMIENTO_ESPECIAL_ACTIVE_REQUIRED');
  }
  const value = req.body.activo;
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  throw httpError(400, 'activo debe ser booleano o 0/1.', 'SEGUIMIENTO_ESPECIAL_ACTIVE_INVALID');
}

function schemaError(error) {
  const message = String(error?.message || '');
  if (error?.code === 'ER_NO_SUCH_TABLE' && /seguimiento_especial/i.test(message)) {
    return httpError(
      503,
      'La tabla seguimiento_especial requerida por Seguimiento Especial no esta disponible en Aiven.',
      'SEGUIMIENTO_ESPECIAL_SCHEMA_MISSING'
    );
  }
  return error;
}

async function withTransaction(work) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const value = await work(connection);
    await connection.commit();
    return value;
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw schemaError(error);
  } finally {
    connection.release();
  }
}

function subscriptionActive(subscription) {
  return Number(subscription?.activo || 0) === 1;
}

function ticketStatePayload(ticket, subscription) {
  return {
    tipo: repository.ENTITY_TICKET,
    origen: repository.ORIGIN_UNITED,
    id_seguimiento: subscription?.id_seguimiento == null
      ? null
      : Number(subscription.id_seguimiento),
    id_ticket: Number(ticket.id_ticket),
    ticket: ticket.ticket,
    proyecto: ticket.proyecto || ticket.proyecto_padre || null,
    proyecto_padre: ticket.proyecto_padre || null,
    equipo: ticket.equipo || null,
    codigo_equipo: ticket.codigo_equipo || null,
    estado_ticket: ticket.estado_ticket || null,
    estado: ticket.estado || null,
    prioridad: ticket.prioridad || null,
    responsabilidad: ticket.responsabilidad || null,
    fecha_reporte: ticket.fecha_reporte || null,
    fecha_cierre: ticket.fecha_cierre || null,
    estatus_equipo_final: ticket.estatus_equipo_final || null,
    activo: subscriptionActive(subscription),
    created_at: subscription?.created_at || subscription?.seguimiento_created_at || null,
    updated_at: subscription?.updated_at || subscription?.seguimiento_updated_at || null
  };
}

async function resolveTicket(executor, req) {
  const ref = ticketRef(req);
  const scope = buildTicketScopeSql_gnral(req, 't');
  const ticket = await repository.findTicketScoped(executor, ref, scope);
  if (!ticket) {
    throw httpError(
      404,
      'Ticket no encontrado dentro de tu alcance.',
      'TICKET_NOT_FOUND'
    );
  }
  return ticket;
}

async function listTickets(req) {
  const userId = actorId(req);
  const scope = buildTicketScopeSql_gnral(req, 't');

  try {
    const rows = await repository.listActiveTicketSubscriptions(db, { userId, scope });
    const tickets = rows.map((row) => ticketStatePayload(row, row));
    return {
      ok: true,
      data: {
        tickets,
        resumen: {
          tickets: tickets.length
        }
      }
    };
  } catch (error) {
    throw schemaError(error);
  }
}

async function getTicket(req) {
  const userId = actorId(req);

  try {
    const ticket = await resolveTicket(db, req);
    const subscription = await repository.getSubscription(db, {
      userId,
      origin: repository.ORIGIN_UNITED,
      entityType: repository.ENTITY_TICKET,
      entityId: ticket.id_ticket
    });

    return {
      ok: true,
      data: ticketStatePayload(ticket, subscription)
    };
  } catch (error) {
    throw schemaError(error);
  }
}

async function setTicket(req) {
  const userId = actorId(req);
  const active = requestedActive(req);

  return withTransaction(async (connection) => {
    const ticket = await resolveTicket(connection, req);
    const identity = {
      userId,
      origin: repository.ORIGIN_UNITED,
      entityType: repository.ENTITY_TICKET,
      entityId: ticket.id_ticket
    };
    const current = await repository.getSubscription(connection, identity);
    const currentActive = subscriptionActive(current);

    // Desactivar algo nunca seguido no crea una fila inactiva innecesaria.
    if (!current && !active) {
      return {
        ok: true,
        cambio: false,
        data: ticketStatePayload(ticket, null)
      };
    }

    // Operacion idempotente: no altera updated_at si el estado ya coincide.
    if (current && currentActive === active) {
      return {
        ok: true,
        cambio: false,
        data: ticketStatePayload(ticket, current)
      };
    }

    await repository.upsertSubscription(connection, {
      ...identity,
      entityKey: ticket.ticket,
      active
    });

    const subscription = await repository.getSubscription(connection, identity);
    return {
      ok: true,
      cambio: true,
      data: ticketStatePayload(ticket, subscription)
    };
  });
}

module.exports = {
  listTickets,
  getTicket,
  setTicket,
  ticketStatePayload,
  subscriptionActive
};
