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
    WHERE ner_any.codigo_evento = ${n}.tipo_notificacion
  )`;
}

function principalRoleIsUniqueSql_gnral(notificationAlias = 'n') {
  const n = safeAlias_gnral(notificationAlias, 'n');
  return `(
    SELECT COUNT(*)
    FROM usuario_roles ur_count
    INNER JOIN roles r_count
      ON r_count.id_rol = ur_count.id_rol
     AND r_count.estado = 1
    WHERE ur_count.id_usuario = ${n}.id_usuario
      AND ur_count.activo = 1
      AND ur_count.principal = 1
  ) = 1`;
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
    WHERE ur_policy.id_usuario = ${n}.id_usuario
      AND ur_policy.activo = 1
      AND ur_policy.principal = 1
      AND ${principalRoleIsUniqueSql_gnral(n)}
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

  // Compatibilidad de transicion:
  // - si un evento aun no tiene ninguna fila en notificacion_evento_roles,
  //   conserva exactamente la visibilidad legacy;
  // - en cuanto existe configuracion de matriz, solo el Rol Principal activo
  //   y habilitado puede ver la notificacion en Campana.
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

  // El bloque legacy replica la regla previa del job Push para eventos que
  // aun no se han incorporado a la matriz N1/N2.
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
  bellVisibilitySql_gnral,
  pushVisibilitySql_gnral
};
