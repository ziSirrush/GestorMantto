const notificacionesRepository = require('./notificaciones.repository');

function positiveInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function currentUserRef(req) {
  const user = req.user || {};
  return {
    id: user.id_SB || user.id || null,
    correo: user.correo || user.email || null,
    iniciales: user.iniciales || null
  };
}

function notificationStateFilter(value) {
  const estado = String(value || '').trim().toLowerCase();
  if (['nuevas', 'nueva', 'unread', 'no_leidas', 'no-leidas'].includes(estado)) return 0;
  if (['abiertas', 'abierta', 'read', 'leidas', 'leida'].includes(estado)) return 1;
  return null;
}

function buildNotificationQuery(req) {
  const user = currentUserRef(req);
  const params = [];
  let whereSql = 'WHERE n.activo = 1';

  if (user.id) {
    whereSql += ' AND n.id_usuario = ?';
    params.push(user.id);
  }

  const userCorreo = String(user.correo || '').trim().toLowerCase();
  const userIniciales = String(user.iniciales || '').trim().toUpperCase();
  const canScopeTasks = Boolean(userCorreo && userIniciales);

  if (canScopeTasks) {
    whereSql += ` AND (
      n.accion_notificacion <> 'ABRIR_TAREA'
      OR n.id_referencia IS NULL
      OR EXISTS (
        SELECT 1
        FROM pendientes p
        WHERE p.id_pendiente = n.id_referencia
          AND (
            (p.tipo_pendiente = 'PERSONAL' AND LOWER(TRIM(p.creado_por_email)) = ?)
            OR
            (
              p.tipo_pendiente = 'COLABORATIVA'
              AND (
                LOWER(TRIM(p.creado_por_email)) = ?
                OR EXISTS (
                  SELECT 1
                  FROM pendientes_usuarios pu_auth
                  WHERE pu_auth.id_pendiente = p.id_pendiente
                    AND pu_auth.tipo_relacion = 'RESPONSABLE'
                    AND UPPER(TRIM(pu_auth.iniciales_usuario)) = ?
                )
              )
            )
          )
      )
    )`;
    params.push(userCorreo, userCorreo, userIniciales);
  }

  const leido = notificationStateFilter(
    req.query.estado || req.query.status || req.query.tipo_vista
  );

  if (leido !== null) {
    whereSql += ' AND n.leido = ?';
    params.push(leido);
  }

  const orderSql = leido === 1
    ? 'ORDER BY COALESCE(n.fecha_lectura, n.fecha_creacion) DESC, n.fecha_creacion DESC'
    : 'ORDER BY n.fecha_creacion DESC';

  const limit = positiveInt(req.query.limit, leido === 1 ? 80 : 30, 1, 200);

  return { user, whereSql, params, orderSql, limit };
}

async function getNotificaciones(req) {
  const query = buildNotificationQuery(req);
  return notificacionesRepository.getNotificaciones(query);
}

async function abrirNotificacion(req) {
  const user = currentUserRef(req);
  const id = Number.parseInt(req.params.id, 10);

  if (!id) {
    return { status: 400, body: { ok: false, message: 'No se recibio id de notificacion.' } };
  }

  if (!user.id) {
    return { status: 401, body: { ok: false, message: 'Sesion sin usuario valido.' } };
  }

  const result = await notificacionesRepository.marcarComoAbierta(id, user.id);

  if (!result.affectedRows) {
    return { status: 404, body: { ok: false, message: 'Notificacion no encontrada.' } };
  }

  return {
    status: 200,
    body: { ok: true, source: 'aiven', message: 'Notificacion marcada como abierta.' }
  };
}

async function marcarNotificacionNueva(req) {
  const user = currentUserRef(req);
  const id = Number.parseInt(req.params.id, 10);

  if (!id) {
    return { status: 400, body: { ok: false, message: 'No se recibio id de notificacion.' } };
  }

  if (!user.id) {
    return { status: 401, body: { ok: false, message: 'Sesion sin usuario valido.' } };
  }

  const result = await notificacionesRepository.marcarComoNueva(id, user.id);

  if (!result.affectedRows) {
    return { status: 404, body: { ok: false, message: 'Notificacion no encontrada.' } };
  }

  return {
    status: 200,
    body: { ok: true, source: 'aiven', message: 'Notificacion marcada como nueva.' }
  };
}

module.exports = {
  getNotificaciones,
  abrirNotificacion,
  marcarNotificacionNueva
};
