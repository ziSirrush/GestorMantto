const crypto = require('crypto');
const repository = require('./notification.repository');
const logger = require('../../shared/logger');
const {
  resolveMatrixRecipientDecision_gnral
} = require('./notification-decision');
const {
  resolveSeguimientoRecipients_uni,
  VISUAL_CODE: SEGUIMIENTO_VISUAL_CODE
} = require('./portafolio-seguimiento-especial-notifications_uni.service');

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

function traceId_gnral(input) {
  const provided = String(input.traceId || input.trace_id || '').trim();
  return provided || crypto.randomUUID();
}

function dedupKey_gnral(input, codigoEvento) {
  const raw = input.dedupKey ?? input.dedup_key ?? input.claveDeduplicacion ??
    input.clave_deduplicacion ?? input.eventInstanceKey ?? input.event_instance_key;
  const value = String(raw ?? '').trim();
  if (!value) return null;
  return crypto
    .createHash('sha256')
    .update(`${codigoEvento}\u0000${value}`, 'utf8')
    .digest('hex');
}

function baseNotification_gnral(input, event, idUsuario, codigoEvento, traceId, dedupKey, visualCodes = []) {
  return {
    id_usuario: idUsuario,
    tipo_notificacion: codigoEvento,
    titulo_notificacion: String(input.titulo || event.titulo_default || event.nombre_evento).slice(0, 255),
    mensaje_notificacion: String(input.mensaje || event.mensaje_default || event.descripcion || event.nombre_evento),
    icono_notificacion: input.icono || event.icono_default || null,
    accion_notificacion: String(input.accion || event.accion_destino || 'ABRIR_MODULO').slice(0, 50),
    id_referencia: Number(input.idReferencia || input.id_referencia || 0) || null,
    ruta_destino: input.ruta || input.ruta_destino || event.ruta_default || null,
    clave_deduplicacion: dedupKey || null,
    trace_id: traceId || null,
    codigos_visuales: [...new Set((Array.isArray(visualCodes) ? visualCodes : [])
      .map((code) => String(code || '').trim().toUpperCase())
      .filter(Boolean))]
  };
}

function recipientVisualCodes_gnral(prepared, idUsuario) {
  return prepared.decoratedFollowRecipientIds?.has(Number(idUsuario))
    ? [SEGUIMIENTO_VISUAL_CODE]
    : [];
}

function emptyEmitResult_gnral(extra = {}) {
  return {
    created: 0,
    skipped: 0,
    recipients: [],
    bell_recipients: [],
    push_recipients: [],
    decisions: [],
    ...extra
  };
}

function logTrace_gnral({ traceId, codigoEvento, actorId, candidateRecipients, result }) {
  logger.info('[NOTIFICATION_TRACE]', {
    trace_id: traceId,
    codigo_evento: codigoEvento,
    actor_user_id: actorId,
    candidate_recipients: candidateRecipients,
    created: Number(result?.created || 0),
    skipped: Number(result?.skipped || 0),
    matrix_managed: result?.matrix_managed === true,
    legacy_mode: result?.legacy_mode === true,
    reason: result?.reason || null,
    zone_scope: result?.zone_scope ?? null,
    seguimiento_especial: result?.seguimiento_especial || null,
    decisions: Array.isArray(result?.decisions) ? result.decisions : []
  });
}

function seguimientoContext_gnral(input) {
  const context = input?.contextoSeguimiento ?? input?.contexto_seguimiento;
  return context && typeof context === 'object' ? context : null;
}

async function applySeguimientoLayer_gnral(connection, prepared) {
  const context = seguimientoContext_gnral(prepared.input);
  const normalRecipients = prepared.recipients.slice();
  prepared.normalRecipients = normalRecipients;
  prepared.followRecipientIds = new Set();
  prepared.decoratedFollowRecipientIds = new Set();
  prepared.seguimientoTrace = {
    applicable: false,
    normal_recipient_count: normalRecipients.length,
    follow_candidate_count: 0,
    follow_authorized_count: 0,
    follow_native_excluded_count: 0,
    follow_recipient_count: 0,
    final_recipient_count: normalRecipients.length,
    follow_decorated_count: 0,
    deduped_count: 0,
    visual_code: SEGUIMIENTO_VISUAL_CODE,
    catalog_lookup_status: 'NO_REQUERIDO'
  };

  if (!context) return prepared;

  try {
    const resolved = await resolveSeguimientoRecipients_uni({
      executor: connection,
      contextoNegocio: context,
      codigoEventoNativo: prepared.codigoEvento
    });
    const followers = Array.isArray(resolved?.followers) ? resolved.followers : [];
    const authorizedFollowerIds = normalizeRecipients(followers);
    const merged = normalizeRecipients([...normalRecipients, ...authorizedFollowerIds]);
    const nativeExcludedRecipientIds = prepared.nativeExcludedRecipientIds || new Set();
    const finalRecipients = merged.filter((id) => !nativeExcludedRecipientIds.has(id));
    const finalRecipientSet = new Set(finalRecipients);
    const followerIds = authorizedFollowerIds.filter((id) => finalRecipientSet.has(id));
    const decoratedIds = new Set();
    let catalogStatus = 'NO_REQUERIDO';

    if (followerIds.length) {
      try {
        const visual = await repository.findActiveVisualState(connection, SEGUIMIENTO_VISUAL_CODE);
        catalogStatus = visual ? 'RESUELTO' : 'NO_ENCONTRADO_O_INACTIVO';
        if (visual) followerIds.forEach((id) => decoratedIds.add(id));
      } catch (catalogError) {
        catalogStatus = 'ERROR';
        logger.error('[NOTIFICATION_SEGUIMIENTO_VISUAL_CATALOG_FAILED]', {
          trace_id: prepared.traceId,
          codigo_evento_nativo: prepared.codigoEvento,
          visual_code: SEGUIMIENTO_VISUAL_CODE,
          error_code: catalogError?.code || null,
          error: catalogError?.message || String(catalogError)
        });
      }
    }

    prepared.followRecipientIds = new Set(followerIds);
    prepared.decoratedFollowRecipientIds = decoratedIds;
    prepared.recipients = finalRecipients;
    prepared.candidateRecipients = normalizeRecipients([
      ...prepared.candidateRecipients,
      ...authorizedFollowerIds
    ]);
    prepared.actorExcluded = Boolean(
      prepared.actorId &&
      prepared.candidateRecipients.includes(prepared.actorId) &&
      nativeExcludedRecipientIds.has(prepared.actorId)
    );
    prepared.seguimientoTrace = {
      applicable: resolved?.applicable === true,
      tipo_contexto: resolved?.context?.tipo || null,
      ticket: resolved?.context?.ticket || null,
      id_portafolio: resolved?.context?.id_portafolio || null,
      numero_equipo: resolved?.context?.numero_equipo || null,
      proyecto: resolved?.context?.proyecto || null,
      zona_id: resolved?.context?.zona_id || null,
      snapshot_pre_mutacion: resolved?.context?.snapshot_pre_mutacion || null,
      normal_recipient_count: normalRecipients.length,
      follow_candidate_count: Number(resolved?.follow_candidate_count ?? followers.length),
      follow_authorized_count: Number(resolved?.follow_authorized_count ?? authorizedFollowerIds.length),
      follow_native_excluded_count: authorizedFollowerIds.length - followerIds.length,
      follow_recipient_count: followerIds.length,
      final_recipient_count: prepared.recipients.length,
      follow_decorated_count: decoratedIds.size,
      deduped_count: normalRecipients.length + authorizedFollowerIds.length - merged.length,
      visual_code: SEGUIMIENTO_VISUAL_CODE,
      catalog_lookup_status: catalogStatus
    };
  } catch (error) {
    logger.error('[NOTIFICATION_SEGUIMIENTO_RESOLUTION_FAILED]', {
      trace_id: prepared.traceId,
      codigo_evento_nativo: prepared.codigoEvento,
      actor_user_id: prepared.actorId,
      error_code: error?.code || null,
      error: error?.message || String(error)
    });
    prepared.seguimientoTrace.error_code = error?.code || 'SEGUIMIENTO_RESOLUTION_FAILED';
    prepared.seguimientoTrace.error_reason = error?.message || String(error);
  }

  return prepared;
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
        const error = new Error(`La interaccion ${codigoEvento} no esta habilitada para ninguno de los roles activos del usuario.`);
        error.status = 403;
        throw error;
      }

      if (String(allowed.politica || '').trim().toUpperCase() !== 'OPCIONAL') {
        const error = new Error(`La interaccion ${codigoEvento} es obligatoria por al menos uno de los roles activos y no puede modificarse desde Mi Perfil.`);
        error.status = 403;
        throw error;
      }

      normalizedByCode.set(codigoEvento, {
        codigo_evento: codigoEvento,
        campana: bool(item.campana, Number(allowed.campana_default ?? 1)),
        push: bool(item.push, Number(allowed.push_default ?? 0)),
        correo: bool(allowed.correo, Number(allowed.correo_default ?? 0)),
        silenciada: bool(item.silenciada, 0)
      });
    }

    await repository.upsertPreferences(connection, idUsuario, [...normalizedByCode.values()]);
  });

  return repository.listEventPreferences(idUsuario);
}

async function emitLegacy_gnral(connection, prepared, event) {
  const {
    input,
    codigoEvento,
    recipients,
    traceId,
    dedupKey
  } = prepared;
  const preferences = await repository.listPreferencesForUsers(connection, recipients, codigoEvento);
  const preferenceByUser = new Map(preferences.map((preference) => [Number(preference.id_usuario), preference]));
  const notifications = [];
  const decisions = [];

  for (const idUsuario of recipients) {
    const preference = preferenceByUser.get(idUsuario) || null;
    const obligatory = Number(event.obligatoria) === 1;
    const silenced = !obligatory && Number(preference?.silenciada || 0) === 1;
    const bellEnabled = obligatory || Number(preference?.campana ?? 1) === 1;
    if (silenced || !bellEnabled) {
      decisions.push({
        id_usuario: idUsuario,
        status: 'OMITIDA',
        reason: 'PREFERENCIA_DESACTIVADA',
        policy: obligatory ? 'OBLIGATORIA' : 'LEGACY'
      });
      continue;
    }

    notifications.push(baseNotification_gnral(
      input,
      event,
      idUsuario,
      codigoEvento,
      traceId,
      dedupKey,
      recipientVisualCodes_gnral(prepared, idUsuario)
    ));
  }

  const insertResult = await repository.insertNotifications(connection, notifications);
  const outcomeByUser = new Map(insertResult.outcomes.map((outcome) => [
    Number(outcome.notification.id_usuario),
    outcome
  ]));
  const bellRecipients = [];

  for (const notification of notifications) {
    const idUsuario = Number(notification.id_usuario);
    const outcome = outcomeByUser.get(idUsuario);
    if (outcome?.inserted) {
      bellRecipients.push(idUsuario);
      decisions.push({ id_usuario: idUsuario, status: 'CREADA', reason: null, policy: 'LEGACY' });
    } else if (outcome?.duplicate) {
      decisions.push({ id_usuario: idUsuario, status: 'OMITIDA', reason: 'DUPLICADO_EVITADO', policy: 'LEGACY' });
    }
  }

  return {
    created: insertResult.affectedRows,
    skipped: decisions.filter((decision) => decision.status !== 'CREADA').length,
    recipients: insertResult.insertedNotifications.map((item) => Number(item.id_usuario)),
    bell_recipients: bellRecipients,
    push_recipients: [],
    matrix_managed: false,
    legacy_mode: true,
    decisions,
    seguimiento_especial: prepared.seguimientoTrace
  };
}

async function emitMatrix_gnral(connection, prepared, event) {
  const {
    input,
    codigoEvento,
    recipients,
    traceId,
    dedupKey
  } = prepared;
  const zoneScope = resolveZoneScope_gnral(input);

  if (!zoneScope.declared) {
    logger.warn(`Notificacion ${codigoEvento} omitida: falta declarar alcance de Zona Operativa para un evento administrado por matriz.`);
    return emptyEmitResult_gnral({
      skipped: recipients.length,
      matrix_managed: true,
      legacy_mode: false,
      reason: 'ZONA_OPERATIVA_NO_DECLARADA',
      decisions: recipients.map((idUsuario) => ({
        id_usuario: idUsuario,
        status: 'OMITIDA',
        reason: 'ZONA_OPERATIVA_NO_DECLARADA'
      }))
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

  const pending = [];
  const decisions = [];

  for (const idUsuario of recipients) {
    const decision = resolveMatrixRecipientDecision_gnral({
      rows: rowsByUser.get(idUsuario) || [],
      event,
      zoneScope
    });

    if (!decision.eligible) {
      decisions.push({
        id_usuario: idUsuario,
        status: 'OMITIDA',
        reason: decision.reason,
        policy: decision.policy,
        role_ids: decision.role_ids,
        scope_allowed: decision.scope_allowed,
        scope_via: decision.scope_via || null,
        bell_enabled: false,
        push_enabled: false
      });
      continue;
    }

    pending.push({
      notification: baseNotification_gnral(
        input,
        event,
        idUsuario,
        codigoEvento,
        traceId,
        dedupKey,
        recipientVisualCodes_gnral(prepared, idUsuario)
      ),
      decision
    });
  }

  const insertResult = await repository.insertNotifications(
    connection,
    pending.map((item) => item.notification)
  );
  const outcomeByUser = new Map(insertResult.outcomes.map((outcome) => [
    Number(outcome.notification.id_usuario),
    outcome
  ]));

  const bellRecipients = [];
  const pushRecipients = [];

  for (const item of pending) {
    const idUsuario = Number(item.notification.id_usuario);
    const outcome = outcomeByUser.get(idUsuario);
    if (outcome?.inserted) {
      if (item.decision.bell_enabled) bellRecipients.push(idUsuario);
      if (item.decision.push_enabled) pushRecipients.push(idUsuario);
      decisions.push({
        id_usuario: idUsuario,
        status: 'CREADA',
        reason: null,
        policy: item.decision.policy,
        role_ids: item.decision.role_ids,
        scope_allowed: true,
        scope_via: item.decision.scope_via || null,
        bell_enabled: item.decision.bell_enabled,
        push_enabled: item.decision.push_enabled
      });
    } else if (outcome?.duplicate) {
      decisions.push({
        id_usuario: idUsuario,
        status: 'OMITIDA',
        reason: 'DUPLICADO_EVITADO',
        policy: item.decision.policy,
        role_ids: item.decision.role_ids,
        scope_allowed: true,
        scope_via: item.decision.scope_via || null,
        bell_enabled: item.decision.bell_enabled,
        push_enabled: item.decision.push_enabled
      });
    }
  }

  const skippedReasons = {};
  for (const decision of decisions) {
    if (!decision.reason) continue;
    skippedReasons[decision.reason] = Number(skippedReasons[decision.reason] || 0) + 1;
  }

  return {
    created: insertResult.affectedRows,
    skipped: decisions.filter((decision) => decision.status !== 'CREADA').length,
    recipients: insertResult.insertedNotifications.map((item) => Number(item.id_usuario)),
    bell_recipients: bellRecipients,
    push_recipients: pushRecipients,
    matrix_managed: true,
    legacy_mode: false,
    zone_scope: zoneScope.noAplica ? 'NO_APLICA' : zoneScope.ids,
    skipped_reasons: skippedReasons,
    decisions,
    seguimiento_especial: prepared.seguimientoTrace
  };
}

function prepareEmit_gnral(eventInput) {
  const input = eventInput || {};
  const codigoEvento = String(input.codigoEvento || input.codigo_evento || '').trim();
  if (!codigoEvento) throw new Error('codigoEvento es obligatorio.');

  const actorId = Number(input.actorUserId || input.actor_usuario_id || 0) || null;
  const candidateRecipients = normalizeRecipients(input.destinatarios || input.recipientUserIds);
  const nativeExcludedRecipientIds = new Set(actorId ? [actorId] : []);
  const recipients = candidateRecipients.filter((id) => !nativeExcludedRecipientIds.has(id));
  const actorExcluded = Boolean(actorId && candidateRecipients.includes(actorId));

  return {
    input,
    codigoEvento,
    actorId,
    candidateRecipients,
    recipients,
    normalRecipients: recipients.slice(),
    actorExcluded,
    nativeExcludedRecipientIds,
    followRecipientIds: new Set(),
    decoratedFollowRecipientIds: new Set(),
    traceId: traceId_gnral(input),
    dedupKey: dedupKey_gnral(input, codigoEvento)
  };
}

async function emitPreparedWithConnection_gnral(connection, prepared) {
  const {
    input,
    codigoEvento,
    actorId,
    traceId
  } = prepared;
  let actorExcluded = prepared.actorExcluded;

  const event = await repository.findEvent(connection, codigoEvento);
  if (!event) {
    if (input.allowMissingEvent === true || input.allow_missing_event === true) {
      const result = emptyEmitResult_gnral({
        skipped: prepared.recipients.length + (actorExcluded ? 1 : 0),
        reason: 'EVENTO_NO_REGISTRADO',
        trace_id: traceId,
        decisions: [
          ...(actorExcluded ? [{ id_usuario: actorId, status: 'OMITIDA', reason: 'ACTOR_EXCLUIDO' }] : []),
          ...prepared.recipients.map((idUsuario) => ({
            id_usuario: idUsuario,
            status: 'OMITIDA',
            reason: 'EVENTO_NO_REGISTRADO'
          }))
        ]
      });
      logger.warn(`Notificacion ${codigoEvento} omitida: el evento no existe en notificacion_eventos.`);
      logTrace_gnral({ traceId, codigoEvento, actorId, candidateRecipients: prepared.candidateRecipients, result });
      return result;
    }
    throw new Error(`Evento de notificacion no registrado: ${codigoEvento}`);
  }

  await applySeguimientoLayer_gnral(connection, prepared);
  actorExcluded = prepared.actorExcluded;

  if (!prepared.recipients.length) {
    const result = emptyEmitResult_gnral({
      skipped: prepared.candidateRecipients.length,
      reason: actorExcluded ? 'ACTOR_EXCLUIDO' : 'SIN_DESTINATARIOS',
      trace_id: traceId,
      seguimiento_especial: prepared.seguimientoTrace,
      decisions: actorExcluded
        ? [{ id_usuario: actorId, status: 'OMITIDA', reason: 'ACTOR_EXCLUIDO' }]
        : []
    });
    logTrace_gnral({
      traceId,
      codigoEvento,
      actorId,
      candidateRecipients: prepared.candidateRecipients,
      result
    });
    return result;
  }

  const requireRoleMatrix = input.requireRoleMatrix === true || input.require_role_matrix === true;
  const matrixConfigured = Number(event.matriz_roles_configurada) === 1;
  if (requireRoleMatrix && !matrixConfigured) {
    const result = emptyEmitResult_gnral({
      skipped: prepared.recipients.length + (actorExcluded ? 1 : 0),
      matrix_managed: true,
      legacy_mode: false,
      reason: 'MATRIZ_ROLES_NO_CONFIGURADA',
      trace_id: traceId,
      decisions: [
        ...(actorExcluded ? [{ id_usuario: actorId, status: 'OMITIDA', reason: 'ACTOR_EXCLUIDO' }] : []),
        ...prepared.recipients.map((idUsuario) => ({
          id_usuario: idUsuario,
          status: 'OMITIDA',
          reason: 'MATRIZ_ROLES_NO_CONFIGURADA'
        }))
      ]
    });
    logger.warn(`Notificacion ${codigoEvento} omitida: se exige al menos una relacion Evento + Rol activa.`);
    logTrace_gnral({ traceId, codigoEvento, actorId, candidateRecipients: prepared.candidateRecipients, result });
    return result;
  }

  let result;
  if (matrixConfigured) {
    result = await emitMatrix_gnral(connection, prepared, event);
  } else {
    result = await emitLegacy_gnral(connection, prepared, event);
  }

  if (actorExcluded) {
    result.skipped += 1;
    result.decisions = [
      { id_usuario: actorId, status: 'OMITIDA', reason: 'ACTOR_EXCLUIDO' },
      ...(result.decisions || [])
    ];
  }
  result.trace_id = traceId;
  result.dedup_enabled = Boolean(prepared.dedupKey);
  result.seguimiento_especial = prepared.seguimientoTrace;

  logTrace_gnral({
    traceId,
    codigoEvento,
    actorId,
    candidateRecipients: prepared.candidateRecipients,
    result
  });
  return result;
}

async function emitWithConnection_gnral(connection, eventInput) {
  if (!connection || typeof connection.query !== 'function') {
    throw new Error('Se requiere una conexion MySQL valida para emitir la notificacion dentro de una transaccion existente.');
  }
  return emitPreparedWithConnection_gnral(connection, prepareEmit_gnral(eventInput));
}

async function emit(eventInput) {
  const prepared = prepareEmit_gnral(eventInput);
  return repository.withTransaction((connection) =>
    emitPreparedWithConnection_gnral(connection, prepared)
  );
}

module.exports = {
  getPreferences,
  savePreferences,
  emit,
  emitWithConnection_gnral,
  applySeguimientoLayer_gnral,
  recipientVisualCodes_gnral
};
