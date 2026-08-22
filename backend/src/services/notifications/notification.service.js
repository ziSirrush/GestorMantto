const repository = require('./notification.repository');
const logger = require('../../shared/logger');

function bool(value, fallback = 0) {
  if (value === undefined || value === null) return fallback ? 1 : 0;
  return value === true || value === 1 || value === '1' ? 1 : 0;
}

function boolWithDefault_gnral(value, fallback) {
  if (value === undefined || value === null) return Number(fallback) === 1;
  return value === true || value === 1 || value === '1';
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

function normalizePositiveIds_gnral(values) {
  const source = Array.isArray(values) ? values : [values];
  return [...new Set(source
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0))];
}

function resolveZoneScope_gnral(input) {
  const noAplica = input.zonaOperativaNoAplica === true ||
    input.zona_operativa_no_aplica === true;

  const rawZones = [];
  if (Array.isArray(input.zonasOperativasIds)) rawZones.push(...input.zonasOperativasIds);
  if (Array.isArray(input.zonas_operativas_ids)) rawZones.push(...input.zonas_operativas_ids);
  if (input.zonaOperativaId !== undefined && input.zonaOperativaId !== null) rawZones.push(input.zonaOperativaId);
  if (input.zona_operativa_id !== undefined && input.zona_operativa_id !== null) rawZones.push(input.zona_operativa_id);
  if (input.zonaId !== undefined && input.zonaId !== null) rawZones.push(input.zonaId);
  if (input.zona_id !== undefined && input.zona_id !== null) rawZones.push(input.zona_id);

  const ids = normalizePositiveIds_gnral(rawZones);

  if (noAplica && ids.length) {
    const error = new Error('La notificacion no puede declarar Zona Operativa y zonaOperativaNoAplica al mismo tiempo.');
    error.code = 'NOTIFICATION_ZONE_SCOPE_CONFLICT';
    throw error;
  }

  return {
    declared: noAplica || ids.length > 0,
    noAplica,
    ids
  };
}

function baseNotification_gnral(input, event, idUsuario, codigoEvento) {
  return {
    id_usuario: idUsuario,
    tipo_notificacion: codigoEvento,
    titulo_notificacion: String(input.titulo || event.titulo_default || event.nombre_evento).slice(0, 255),
    mensaje_notificacion: String(input.mensaje || event.mensaje_default || event.descripcion || event.nombre_evento),
    icono_notificacion: input.icono || event.icono_default || null,
    accion_notificacion: String(input.accion || event.accion_destino || 'ABRIR_MODULO').slice(0, 50),
    id_referencia: Number(input.idReferencia || input.id_referencia || 0) || null,
    ruta_destino: input.ruta || input.ruta_destino || event.ruta_default || null
  };
}

function emptyEmitResult_gnral(extra = {}) {
  return {
    created: 0,
    skipped: 0,
    recipients: [],
    bell_recipients: [],
    push_recipients: [],
    ...extra
  };
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
    return repository.listEventPreferences(idUsuario);
  }

  await repository.withTransaction(async (connection) => {
    const visiblePreferences = await repository.listEventPreferences(idUsuario, connection);
    const allowedByCode = new Map(visiblePreferences.map((item) => [String(item.codigo_evento), item]));
    const normalizedByCode = new Map();

    for (const item of items) {
      const codigoEvento = String(item.codigo_evento || '').trim();
      if (!codigoEvento) {
        const error = new Error('Se recibio una preferencia sin codigo_evento.');
        error.status = 400;
        throw error;
      }

      const allowed = allowedByCode.get(codigoEvento);
      if (!allowed) {
        const error = new Error(`La interaccion ${codigoEvento} no esta habilitada para el Rol Principal del usuario.`);
        error.status = 403;
        throw error;
      }

      if (String(allowed.politica || '').trim().toUpperCase() !== 'OPCIONAL') {
        const error = new Error(`La interaccion ${codigoEvento} es obligatoria y no puede modificarse desde Mi Perfil.`);
        error.status = 403;
        throw error;
      }

      normalizedByCode.set(codigoEvento, {
        codigo_evento: codigoEvento,
        campana: bool(item.campana, Number(allowed.campana_default ?? 1)),
        push: bool(item.push, Number(allowed.push_default ?? 0)),
        // Correo no forma parte del control de Mi Perfil en N5. Se conserva
        // el valor efectivo actual para no alterar un canal no expuesto en UI.
        correo: bool(allowed.correo, Number(allowed.correo_default ?? 0)),
        silenciada: bool(item.silenciada, 0)
      });
    }

    await repository.upsertPreferences(connection, idUsuario, [...normalizedByCode.values()]);
  });

  return repository.listEventPreferences(idUsuario);
}

async function emitLegacy_gnral(connection, input, event, codigoEvento, recipients) {
  const preferences = await repository.listPreferencesForUsers(connection, recipients, codigoEvento);
  const preferenceByUser = new Map(preferences.map((preference) => [Number(preference.id_usuario), preference]));
  const notifications = [];
  const bellRecipients = [];
  let skipped = 0;

  for (const idUsuario of recipients) {
    const preference = preferenceByUser.get(idUsuario) || null;
    const obligatory = Number(event.obligatoria) === 1;
    const silenced = !obligatory && Number(preference?.silenciada || 0) === 1;
    const bellEnabled = obligatory || Number(preference?.campana ?? 1) === 1;
    if (silenced || !bellEnabled) {
      skipped += 1;
      continue;
    }

    notifications.push(baseNotification_gnral(input, event, idUsuario, codigoEvento));
    bellRecipients.push(idUsuario);
  }

  await repository.insertNotifications(connection, notifications);

  return {
    created: notifications.length,
    skipped,
    recipients: notifications.map((item) => item.id_usuario),
    bell_recipients: bellRecipients,
    push_recipients: [],
    matrix_managed: false,
    legacy_mode: true
  };
}

async function emitMatrix_gnral(connection, input, event, codigoEvento, recipients) {
  const zoneScope = resolveZoneScope_gnral(input);

  // Un evento administrado por matriz debe declarar expresamente su alcance
  // operativo: uno o mas zona_id, o zonaOperativaNoAplica=true. De esta forma
  // un modulo nuevo no puede omitir accidentalmente el filtro zonal.
  if (!zoneScope.declared) {
    logger.warn(`Notificacion ${codigoEvento} omitida: falta declarar alcance de Zona Operativa para un evento administrado por matriz.`);
    return emptyEmitResult_gnral({
      skipped: recipients.length,
      matrix_managed: true,
      legacy_mode: false,
      reason: 'ZONA_OPERATIVA_NO_DECLARADA'
    });
  }

  const rows = await repository.listRecipientPolicyContext(connection, {
    codigoEvento,
    idUsuarios: recipients,
    zonaOperativaIds: zoneScope.ids
  });

  const rowsByUser = new Map();
  for (const row of rows) {
    const idUsuario = Number(row.id_usuario);
    if (!rowsByUser.has(idUsuario)) rowsByUser.set(idUsuario, []);
    rowsByUser.get(idUsuario).push(row);
  }

  const notifications = [];
  const bellRecipients = [];
  const pushRecipients = [];
  const skippedReasons = {
    usuario_inactivo_o_sin_contexto: 0,
    rol_principal_invalido: 0,
    rol_no_habilitado: 0,
    fuera_zona_operativa: 0,
    canales_desactivados: 0
  };

  for (const idUsuario of recipients) {
    const userRows = rowsByUser.get(idUsuario) || [];
    if (!userRows.length) {
      skippedReasons.usuario_inactivo_o_sin_contexto += 1;
      continue;
    }

    const principalRows = userRows.filter((row) => Number(row.id_rol_principal) > 0);
    if (principalRows.length !== 1) {
      skippedReasons.rol_principal_invalido += 1;
      logger.warn(`Notificacion ${codigoEvento}: usuario ${idUsuario} omitido porque no tiene exactamente un Rol Principal activo.`);
      continue;
    }

    const context = principalRows[0];
    const politica = String(context.politica || '').trim().toUpperCase();
    const configActive = Number(context.configuracion_activa) === 1;
    if (!configActive || !['OBLIGATORIA', 'OPCIONAL'].includes(politica)) {
      skippedReasons.rol_no_habilitado += 1;
      continue;
    }

    if (!zoneScope.noAplica && Number(context.zona_autorizada) !== 1) {
      skippedReasons.fuera_zona_operativa += 1;
      continue;
    }

    let bellEnabled = false;
    let pushEnabled = false;

    if (politica === 'OBLIGATORIA') {
      bellEnabled = true;
      pushEnabled = true;
    } else {
      const silenced = Number(context.silenciada || 0) === 1;
      if (!silenced) {
        bellEnabled = boolWithDefault_gnral(context.campana, event.campana_default ?? 1);
        pushEnabled = boolWithDefault_gnral(context.push, event.push_default ?? 0);
      }
    }

    if (!bellEnabled && !pushEnabled) {
      skippedReasons.canales_desactivados += 1;
      continue;
    }

    notifications.push(baseNotification_gnral(input, event, idUsuario, codigoEvento));
    if (bellEnabled) bellRecipients.push(idUsuario);
    if (pushEnabled) pushRecipients.push(idUsuario);
  }

  await repository.insertNotifications(connection, notifications);

  const skipped = Object.values(skippedReasons).reduce((sum, value) => sum + Number(value || 0), 0);
  return {
    created: notifications.length,
    skipped,
    recipients: notifications.map((item) => item.id_usuario),
    bell_recipients: bellRecipients,
    push_recipients: pushRecipients,
    matrix_managed: true,
    legacy_mode: false,
    zone_scope: zoneScope.noAplica ? 'NO_APLICA' : zoneScope.ids,
    skipped_reasons: skippedReasons
  };
}

/**
 * Punto unico para generar notificaciones de negocio.
 *
 * Contrato de relacion:
 * - los modulos siguen entregando exclusivamente destinatarios relacionados
 *   con la entidad que origino la interaccion;
 * - este motor NO amplia esa lista por rol;
 * - elimina duplicados y excluye al actor;
 * - cuando el evento ya esta administrado por notificacion_evento_roles,
 *   filtra por Rol Principal, Zona Operativa y politica OBLIGATORIA/OPCIONAL;
 * - eventos aun no migrados a la matriz conservan temporalmente el flujo legacy.
 */
function prepareEmit_gnral(eventInput) {
  const input = eventInput || {};
  const codigoEvento = String(input.codigoEvento || input.codigo_evento || '').trim();
  if (!codigoEvento) throw new Error('codigoEvento es obligatorio.');

  const actorId = Number(input.actorUserId || input.actor_usuario_id || 0) || null;
  const recipients = normalizeRecipients(input.destinatarios || input.recipientUserIds)
    .filter((id) => !actorId || id !== actorId);

  return { input, codigoEvento, recipients };
}

async function emitWithConnection_gnral(connection, eventInput) {
  if (!connection || typeof connection.query !== 'function') {
    throw new Error('Se requiere una conexion MySQL valida para emitir la notificacion dentro de una transaccion existente.');
  }

  const { input, codigoEvento, recipients } = prepareEmit_gnral(eventInput);
  if (!recipients.length) return emptyEmitResult_gnral();

  const event = await repository.findEvent(connection, codigoEvento);
  if (!event) {
    if (input.allowMissingEvent === true || input.allow_missing_event === true) {
      logger.warn(`Notificacion ${codigoEvento} omitida: el evento no existe en notificacion_eventos.`);
      return emptyEmitResult_gnral({
        skipped: recipients.length,
        reason: 'EVENTO_NO_REGISTRADO'
      });
    }
    throw new Error(`Evento de notificacion no registrado: ${codigoEvento}`);
  }

  const requireRoleMatrix = input.requireRoleMatrix === true || input.require_role_matrix === true;
  const matrixConfigured = Number(event.matriz_roles_configurada) === 1;
  if (requireRoleMatrix && !matrixConfigured) {
    logger.warn(`Notificacion ${codigoEvento} omitida: N6 exige configuracion Interaccion + Rol en Panel de Control.`);
    return emptyEmitResult_gnral({
      skipped: recipients.length,
      matrix_managed: true,
      legacy_mode: false,
      reason: 'MATRIZ_ROLES_NO_CONFIGURADA'
    });
  }

  if (matrixConfigured) {
    return emitMatrix_gnral(connection, input, event, codigoEvento, recipients);
  }

  return emitLegacy_gnral(connection, input, event, codigoEvento, recipients);
}

async function emit(eventInput) {
  const prepared = prepareEmit_gnral(eventInput);
  if (!prepared.recipients.length) return emptyEmitResult_gnral();

  return repository.withTransaction((connection) =>
    emitWithConnection_gnral(connection, prepared.input)
  );
}

module.exports = {
  getPreferences,
  savePreferences,
  emit,
  emitWithConnection_gnral
};
