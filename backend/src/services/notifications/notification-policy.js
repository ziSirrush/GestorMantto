function safeAlias_gnral(value, fallback) {
  const alias = String(value || fallback || '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
    throw new Error('Alias SQL invalido para politica de notificaciones.');
  }
  return alias;
}

const SEGUIMIENTO_VISUAL_CODE_GNRAL = 'SEGUIMIENTO_ESPECIAL';
const FOLLOW_ONLY_EVENT_CODES_GNRAL = Object.freeze([
  'PORTAFOLIO_EQUIPO_INGRESO',
  'PORTAFOLIO_EQUIPO_SALIDA',
  'PORTAFOLIO_EQUIPO_CAMBIO',
  'TICKET_CREADO',
  'TICKET_ESTATUS_CAMBIADO',
  'TICKET_PRIORIDAD_CAMBIADA',
  'TICKET_ASIGNACION_CAMBIADA',
  'TICKET_RESPONSABILIDAD_CAMBIADA'
]);


/**
 * Seguimiento Especial ya fue autorizado por el resolver UNITED antes de
 * persistir la notificacion. El codigo visual es metadata semantica del origen
 * de la entrega y permite que Campana/Push no vuelvan a vetarla por la matriz
 * del evento nativo.
 */
function seguimientoEspecialSql_gnral(notificationAlias = 'n') {
  const n = safeAlias_gnral(notificationAlias, 'n');
  return `JSON_CONTAINS(
    COALESCE(${n}.codigos_visuales_json, JSON_ARRAY()),
    JSON_QUOTE('${SEGUIMIENTO_VISUAL_CODE_GNRAL}')
  )`;
}

function followOnlyEventSql_gnral(notificationAlias = 'n') {
  const n = safeAlias_gnral(notificationAlias, 'n');
  const codes = FOLLOW_ONLY_EVENT_CODES_GNRAL
    .map((code) => `'${code}'`)
    .join(', ');
  return `UPPER(TRIM(COALESCE(${n}.tipo_notificacion, ''))) IN (${codes})`;
}

function matrixExistsSql_gnral(notificationAlias = 'n') {
  const n = safeAlias_gnral(notificationAlias, 'n');
  return `EXISTS (
    SELECT 1
    FROM notificacion_evento_roles ner_any
    INNER JOIN roles r_any
      ON r_any.id_rol = ner_any.id_rol
     AND r_any.estado = 1
    WHERE ner_any.codigo_evento = ${n}.tipo_notificacion
      AND ner_any.activo = 1
      AND ner_any.politica IN ('OBLIGATORIA', 'OPCIONAL')
  )`;
}

function matrixChannelSql_gnral({
  notificationAlias = 'n',
  eventAlias = 'e',
  preferenceAlias = 'p',
  channel = 'campana'
} = {}) {
  const n = safeAlias_gnral(notificationAlias, 'n');
  const e = safeAlias_gnral(eventAlias, 'e');
  const p = safeAlias_gnral(preferenceAlias, 'p');
  const channelName = channel === 'push' ? 'push' : 'campana';
  const defaultColumn = channelName === 'push' ? 'push_default' : 'campana_default';
  const fallback = channelName === 'push' ? 0 : 1;

  // Todos los roles activos del usuario participan en la decision NATIVA.
  // Seguimiento Especial se resuelve antes y se exceptua en las funciones de
  // visibilidad finales, no dentro de esta matriz.
  return `EXISTS (
    SELECT 1
    FROM usuario_roles ur_policy
    INNER JOIN roles r_policy
      ON r_policy.id_rol = ur_policy.id_rol
     AND r_policy.estado = 1
    INNER JOIN notificacion_evento_roles ner_policy
      ON ner_policy.codigo_evento = ${n}.tipo_notificacion
     AND ner_policy.id_rol = ur_policy.id_rol
     AND ner_policy.activo = 1
     AND ner_policy.politica IN ('OBLIGATORIA', 'OPCIONAL')
    WHERE ur_policy.id_usuario = ${n}.id_usuario
      AND ur_policy.activo = 1
      AND (
        ner_policy.politica = 'OBLIGATORIA'
        OR (
          ner_policy.politica = 'OPCIONAL'
          AND COALESCE(${p}.silenciada, 0) = 0
          AND COALESCE(${p}.${channelName}, ${e}.${defaultColumn}, ${fallback}) = 1
        )
      )
  )`;
}

function bellVisibilitySql_gnral(notificationAlias = 'n', eventAlias = 'e', preferenceAlias = 'p') {
  const seguimiento = seguimientoEspecialSql_gnral(notificationAlias);
  const followOnlyEvent = followOnlyEventSql_gnral(notificationAlias);
  const matrixExists = matrixExistsSql_gnral(notificationAlias);
  const matrixBell = matrixChannelSql_gnral({
    notificationAlias,
    eventAlias,
    preferenceAlias,
    channel: 'campana'
  });

  // FOLLOW-ONLY falla cerrado en lectura: una fila historica o accidental sin
  // metadata SEGUIMIENTO_ESPECIAL nunca puede reaparecer por fallback legacy.
  // Para los demas eventos se conserva la politica anterior.
  return `(
    ${seguimiento}
    OR (
      NOT (${followOnlyEvent})
      AND (
        NOT ${matrixExists}
        OR ${matrixBell}
      )
    )
  )`;
}

function pushVisibilitySql_gnral(notificationAlias = 'n', eventAlias = 'e', preferenceAlias = 'p') {
  const n = safeAlias_gnral(notificationAlias, 'n');
  const e = safeAlias_gnral(eventAlias, 'e');
  const p = safeAlias_gnral(preferenceAlias, 'p');
  const seguimiento = seguimientoEspecialSql_gnral(n);
  const followOnlyEvent = followOnlyEventSql_gnral(n);
  const matrixExists = matrixExistsSql_gnral(n);
  const matrixPush = matrixChannelSql_gnral({
    notificationAlias: n,
    eventAlias: e,
    preferenceAlias: p,
    channel: 'push'
  });

  const legacyPush = `(
    COALESCE(${e}.obligatoria, 0) = 1
    OR (
      COALESCE(${p}.push, 1) = 1
      AND COALESCE(${p}.silenciada, 0) = 0
    )
  )`;

  // FOLLOW-ONLY falla cerrado en lectura: solo una fila persistida con metadata
  // SEGUIMIENTO_ESPECIAL puede salir por Push. Los demas eventos conservan
  // exactamente la politica nativa/legacy previa.
  return `(
    ${seguimiento}
    OR (
      NOT (${followOnlyEvent})
      AND (
        (NOT ${matrixExists} AND ${legacyPush})
        OR ${matrixPush}
      )
    )
  )`;
}

module.exports = {
  SEGUIMIENTO_VISUAL_CODE_GNRAL,
  FOLLOW_ONLY_EVENT_CODES_GNRAL,
  seguimientoEspecialSql_gnral,
  followOnlyEventSql_gnral,
  matrixExistsSql_gnral,
  matrixChannelSql_gnral,
  bellVisibilitySql_gnral,
  pushVisibilitySql_gnral
};
