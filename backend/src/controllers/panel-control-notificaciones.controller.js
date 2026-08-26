const db = require('../config/db');

const POLITICAS_VALIDAS_GNRAL = new Set(['OBLIGATORIA', 'OPCIONAL']);

function actorScope_gnral(req) {
  const roles = new Set([req.user?.rol, ...(req.user?.roles || [])].filter(Boolean));
  if (roles.has('Programador') || roles.has('Director General')) {
    return { all: true, companies: ['GENERAL', 'UNITED', 'CORELLIAN'] };
  }

  const companies = new Set(['GENERAL']);
  if (roles.has('Programador United')) companies.add('UNITED');
  if (roles.has('Programador Corellian')) companies.add('CORELLIAN');
  return { all: false, companies: [...companies] };
}

function actorCanManage_gnral(req) {
  const roles = new Set([req.user?.rol, ...(req.user?.roles || [])].filter(Boolean));
  return roles.has('Programador') || roles.has('Programador United') ||
    roles.has('Programador Corellian') || roles.has('Director General');
}

function companySql_gnral(column, scope) {
  if (scope.all) return { clause: '1 = 1', params: [] };
  return { clause: `${column} IN (?)`, params: [scope.companies] };
}

function setNotificationNoStoreHeaders_gnral(res) {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

function denyUnlessManager_gnral(req, res) {
  if (actorCanManage_gnral(req)) return false;
  res.status(403).json({
    ok: false,
    message: 'No tienes autorización para administrar la configuración de notificaciones.'
  });
  return true;
}

async function loadNotificationMatrix_gnral(conn, req) {
  const scope = actorScope_gnral(req);
  const roleFilter = companySql_gnral('r.empresa', scope);

  const [eventosRows, rolesRows, configuracionesRows] = await Promise.all([
    conn.query(`
      SELECT
        e.codigo_evento,
        e.agrupacion,
        e.modulo,
        e.accion,
        e.nombre_evento,
        e.descripcion,
        e.prioridad_default,
        e.configurable,
        e.orden,
        e.activo
      FROM notificacion_eventos e
      WHERE e.activo = 1
      ORDER BY e.agrupacion, e.modulo, e.orden, e.nombre_evento, e.codigo_evento
    `),
    conn.query(`
      SELECT
        r.id_rol,
        r.rol,
        r.codigo,
        r.descripcion,
        r.nivel,
        r.es_sistema,
        r.empresa,
        r.estado
      FROM roles r
      WHERE r.estado = 1
        AND ${roleFilter.clause}
      ORDER BY r.empresa, r.nivel DESC, r.rol, r.id_rol
    `, roleFilter.params),
    conn.query(`
      SELECT
        ner.id_evento_rol,
        ner.codigo_evento,
        ner.id_rol,
        ner.politica,
        ner.activo,
        ner.created_at,
        ner.updated_at
      FROM notificacion_evento_roles ner
      INNER JOIN notificacion_eventos e
        ON e.codigo_evento = ner.codigo_evento
       AND e.activo = 1
      INNER JOIN roles r
        ON r.id_rol = ner.id_rol
       AND r.estado = 1
      WHERE ${roleFilter.clause}
      ORDER BY ner.codigo_evento, r.empresa, r.nivel DESC, r.rol, ner.id_rol
    `, roleFilter.params)
  ]);

  return {
    eventos: eventosRows[0].map((row) => ({
      ...row,
      configurable: Number(row.configurable) === 1,
      activo: Number(row.activo) === 1
    })),
    roles: rolesRows[0].map((row) => ({
      ...row,
      es_sistema: Number(row.es_sistema) === 1,
      estado: Number(row.estado) === 1
    })),
    configuraciones: configuracionesRows[0].map((row) => ({
      ...row,
      id_evento_rol: Number(row.id_evento_rol),
      id_rol: Number(row.id_rol),
      activo: Number(row.activo) === 1
    })),
    alcance: scope
  };
}

function normalizeChanges_gnral(rawChanges) {
  const normalized = new Map();

  for (const change of rawChanges) {
    const codigoEvento = String(change?.codigo_evento || '').trim();
    const idRol = Number(change?.id_rol);
    const habilitado = change?.habilitado;

    if (!codigoEvento) {
      const error = new Error('Cada cambio debe incluir codigo_evento.');
      error.status = 400;
      throw error;
    }
    if (!Number.isInteger(idRol) || idRol <= 0) {
      const error = new Error('Cada cambio debe incluir un id_rol válido.');
      error.status = 400;
      throw error;
    }
    if (typeof habilitado !== 'boolean') {
      const error = new Error('Cada cambio debe indicar habilitado como booleano.');
      error.status = 400;
      throw error;
    }

    let politica = null;
    if (habilitado) {
      politica = String(change?.politica || '').trim().toUpperCase();
      if (!POLITICAS_VALIDAS_GNRAL.has(politica)) {
        const error = new Error('La política debe ser OBLIGATORIA u OPCIONAL cuando la interacción está habilitada.');
        error.status = 400;
        throw error;
      }
    }

    normalized.set(`${codigoEvento}\u0000${idRol}`, {
      codigo_evento: codigoEvento,
      id_rol: idRol,
      habilitado,
      politica
    });
  }

  return [...normalized.values()];
}

async function validateChanges_gnral(conn, req, changes) {
  if (!changes.length) return;

  const scope = actorScope_gnral(req);
  const roleFilter = companySql_gnral('r.empresa', scope);
  const eventCodes = [...new Set(changes.map((change) => change.codigo_evento))];
  const roleIds = [...new Set(changes.map((change) => change.id_rol))];

  const [eventRows, roleRows] = await Promise.all([
    conn.query(
      `SELECT codigo_evento
       FROM notificacion_eventos
       WHERE activo = 1
         AND codigo_evento IN (?)`,
      [eventCodes]
    ),
    conn.query(
      `SELECT r.id_rol
       FROM roles r
       WHERE r.estado = 1
         AND r.id_rol IN (?)
         AND ${roleFilter.clause}`,
      [roleIds, ...roleFilter.params]
    )
  ]);

  const validEvents = new Set(eventRows[0].map((row) => String(row.codigo_evento)));
  const missingEvents = eventCodes.filter((code) => !validEvents.has(code));
  if (missingEvents.length) {
    const error = new Error(`Una o más interacciones no existen o están inactivas: ${missingEvents.join(', ')}`);
    error.status = 400;
    throw error;
  }

  const validRoles = new Set(roleRows[0].map((row) => Number(row.id_rol)));
  const missingRoles = roleIds.filter((id) => !validRoles.has(id));
  if (missingRoles.length) {
    const error = new Error(`Uno o más roles no existen, están inactivos o quedan fuera de tu alcance: ${missingRoles.join(', ')}`);
    error.status = 403;
    throw error;
  }
}

async function persistChanges_gnral(conn, changes) {
  const enabled = changes.filter((change) => change.habilitado);
  const disabled = changes.filter((change) => !change.habilitado);

  if (enabled.length) {
    const placeholders = enabled.map(() => '(?, ?, ?, 1)').join(', ');
    const params = enabled.flatMap((change) => [
      change.codigo_evento,
      change.id_rol,
      change.politica
    ]);

    await conn.query(`
      INSERT INTO notificacion_evento_roles
        (codigo_evento, id_rol, politica, activo)
      VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE
        politica = VALUES(politica),
        activo = 1,
        updated_at = CURRENT_TIMESTAMP
    `, params);
  }

  if (disabled.length) {
    const placeholders = disabled.map(() => '(?, ?)').join(', ');
    const params = disabled.flatMap((change) => [
      change.codigo_evento,
      change.id_rol
    ]);

    await conn.query(`
      UPDATE notificacion_evento_roles
      SET activo = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE (codigo_evento, id_rol) IN (${placeholders})
    `, params);
  }
}

async function assertAffectedEventsHaveActiveRoles_gnral(conn, eventCodes) {
  const codes = [...new Set((Array.isArray(eventCodes) ? eventCodes : [])
    .map((code) => String(code || '').trim())
    .filter(Boolean))];
  if (!codes.length) return;

  const [rows] = await conn.query(`
    SELECT
      e.codigo_evento,
      SUM(CASE WHEN r.id_rol IS NOT NULL THEN 1 ELSE 0 END) AS roles_activos
    FROM notificacion_eventos e
    LEFT JOIN notificacion_evento_roles ner
      ON ner.codigo_evento = e.codigo_evento
     AND ner.activo = 1
     AND ner.politica IN ('OBLIGATORIA', 'OPCIONAL')
    LEFT JOIN roles r
      ON r.id_rol = ner.id_rol
     AND r.estado = 1
    WHERE e.activo = 1
      AND e.codigo_evento IN (?)
    GROUP BY e.codigo_evento
    HAVING SUM(CASE WHEN r.id_rol IS NOT NULL THEN 1 ELSE 0 END) = 0
  `, [codes]);

  if (rows.length) {
    const eventList = rows.map((row) => String(row.codigo_evento)).join(', ');
    const error = new Error(
      `No se puede guardar: toda interacción activa debe conservar al menos un rol activo. Revisa: ${eventList}`
    );
    error.status = 409;
    error.code = 'NOTIFICATION_EVENT_REQUIRES_ACTIVE_ROLE';
    throw error;
  }
}

async function getNotificationMatrix_gnral(req, res, next) {
  try {
    if (denyUnlessManager_gnral(req, res)) return;
    setNotificationNoStoreHeaders_gnral(res);
    const data = await loadNotificationMatrix_gnral(db, req);
    return res.json({ ok: true, data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ ok: false, message: error.message });
    return next(error);
  }
}

async function saveNotificationMatrix_gnral(req, res, next) {
  if (denyUnlessManager_gnral(req, res)) return;
  setNotificationNoStoreHeaders_gnral(res);

  const conn = await db.getConnection();
  let transactionStarted = false;
  try {
    const rawChanges = Array.isArray(req.body?.changes) ? req.body.changes : [];
    const changes = normalizeChanges_gnral(rawChanges);

    if (!changes.length) {
      const matriz = await loadNotificationMatrix_gnral(conn, req);
      return res.json({ ok: true, data: { updated: 0, matriz } });
    }

    await validateChanges_gnral(conn, req, changes);

    await conn.beginTransaction();
    transactionStarted = true;
    await persistChanges_gnral(conn, changes);
    await assertAffectedEventsHaveActiveRoles_gnral(
      conn,
      changes.map((change) => change.codigo_evento)
    );
    await conn.commit();
    transactionStarted = false;

    const matriz = await loadNotificationMatrix_gnral(conn, req);
    return res.json({
      ok: true,
      data: {
        updated: changes.length,
        matriz
      }
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await conn.rollback();
      } catch (_) {
        // El error original conserva prioridad sobre un fallo secundario de rollback.
      }
    }
    if (error.status) return res.status(error.status).json({ ok: false, message: error.message });
    return next(error);
  } finally {
    conn.release();
  }
}

module.exports = {
  getNotificationMatrix_gnral,
  saveNotificationMatrix_gnral
};
