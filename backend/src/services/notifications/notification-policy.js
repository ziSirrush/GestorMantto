function safeAlias_gnral(value, fallback) {
  const alias = String(value || fallback || '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
    throw new Error('Alias SQL invalido para politica de notificaciones.');
  }
  return alias;
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

  // Todos los roles activos del usuario participan en la decision.
  // Si cualquiera de ellos marca el evento OBLIGATORIO, el canal queda activo.
  // Las preferencias personales solo se evalúan cuando el rol aplicable es OPCIONAL.
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
  const matrixExists = matrixExistsSql_gnral(notificationAlias);
  const matrixBell = matrixChannelSql_gnral({
    notificationAlias,
    eventAlias,
    preferenceAlias,
    channel: 'campana'
  });

  // Compatibilidad temporal para codigos legacy que todavia no tienen una
  // relacion activa Evento <-> Rol. Los eventos oficiales administrados por
  // matriz solo son visibles si alguno de los roles activos del usuario aplica.
  return `(
    NOT ${matrixExists}
    OR ${matrixBell}
  )`;
}

function pushVisibilitySql_gnral(notificationAlias = 'n', eventAlias = 'e', preferenceAlias = 'p') {
  const n = safeAlias_gnral(notificationAlias, 'n');
  const e = safeAlias_gnral(eventAlias, 'e');
  const p = safeAlias_gnral(preferenceAlias, 'p');
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

  return `(
    (NOT ${matrixExists} AND ${legacyPush})
    OR ${matrixPush}
  )`;
}

module.exports = {
  matrixExistsSql_gnral,
  matrixChannelSql_gnral,
  bellVisibilitySql_gnral,
  pushVisibilitySql_gnral
};
