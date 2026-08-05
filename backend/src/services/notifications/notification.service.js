const repository = require('./notification.repository');

function bool(value, fallback = 0) {
  if (value === undefined || value === null) return fallback ? 1 : 0;
  return value === true || value === 1 || value === '1' ? 1 : 0;
}

function userIdFromReq(req) {
  const user = req.contextUser || req.user || {};
  return Number(user.id_SB || user.id || 0) || null;
}

function normalizeRecipients(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => Number(value && typeof value === 'object' ? (value.id_usuario || value.id_SB || value.id) : value))
    .filter((value) => Number.isInteger(value) && value > 0))];
}

async function getPreferences(req) {
  const idUsuario = userIdFromReq(req);
  if (!idUsuario) {
    const error = new Error('Sesion sin usuario valido.');
    error.status = 401;
    throw error;
  }
  return repository.listEventPreferences(idUsuario);
}

async function savePreferences(req) {
  const idUsuario = userIdFromReq(req);
  if (!idUsuario) {
    const error = new Error('Sesion sin usuario valido.');
    error.status = 401;
    throw error;
  }

  const items = Array.isArray(req.body?.preferencias) ? req.body.preferencias : [];
  if (!items.length) {
    const error = new Error('No se recibieron preferencias.');
    error.status = 400;
    throw error;
  }

  await repository.withTransaction(async (connection) => {
    for (const item of items) {
      const codigoEvento = String(item.codigo_evento || '').trim();
      if (!codigoEvento) continue;
      const event = await repository.findEvent(connection, codigoEvento);
      if (!event || !Number(event.configurable) || Number(event.obligatoria)) continue;
      await repository.upsertPreference(connection, idUsuario, {
        codigo_evento: codigoEvento,
        campana: bool(item.campana, event.campana_default),
        push: bool(item.push, event.push_default),
        correo: bool(item.correo, event.correo_default),
        silenciada: bool(item.silenciada, 0)
      });
    }
  });

  return repository.listEventPreferences(idUsuario);
}

/**
 * Punto unico para generar notificaciones de negocio.
 * Los modulos deben entregar destinatarios ya relacionados con la entidad;
 * este servicio elimina duplicados, excluye al actor y aplica preferencias.
 */
async function emit(eventInput) {
  const input = eventInput || {};
  const codigoEvento = String(input.codigoEvento || input.codigo_evento || '').trim();
  if (!codigoEvento) throw new Error('codigoEvento es obligatorio.');

  const actorId = Number(input.actorUserId || input.actor_usuario_id || 0) || null;
  const recipients = normalizeRecipients(input.destinatarios || input.recipientUserIds)
    .filter((id) => !actorId || id !== actorId);

  if (!recipients.length) return { created: 0, skipped: 0, recipients: [] };

  return repository.withTransaction(async (connection) => {
    const event = await repository.findEvent(connection, codigoEvento);
    if (!event) throw new Error(`Evento de notificacion no registrado: ${codigoEvento}`);

    const createdRecipients = [];
    let skipped = 0;

    for (const idUsuario of recipients) {
      const preference = await repository.findPreference(connection, idUsuario, codigoEvento);
      const obligatory = Number(event.obligatoria) === 1;
      const silenced = !obligatory && Number(preference?.silenciada || 0) === 1;
      const bellEnabled = obligatory || Number(preference?.campana ?? event.campana_default) === 1;
      if (silenced || !bellEnabled) {
        skipped += 1;
        continue;
      }

      await repository.insertNotification(connection, {
        id_usuario: idUsuario,
        tipo_notificacion: codigoEvento,
        titulo_notificacion: String(input.titulo || event.titulo_default || event.nombre_evento).slice(0, 255),
        mensaje_notificacion: String(input.mensaje || event.mensaje_default || event.descripcion || event.nombre_evento),
        icono_notificacion: input.icono || event.icono_default || null,
        accion_notificacion: String(input.accion || event.accion_destino || 'ABRIR_MODULO').slice(0, 50),
        id_referencia: Number(input.idReferencia || input.id_referencia || 0) || null,
        ruta_destino: input.ruta || input.ruta_destino || event.ruta_default || null
      });
      createdRecipients.push(idUsuario);
    }

    return { created: createdRecipients.length, skipped, recipients: createdRecipients };
  });
}

module.exports = {
  getPreferences,
  savePreferences,
  emit
};
