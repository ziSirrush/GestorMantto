function normalizeUser_gnral(user) {
  const source = user || {};
  return {
    id: Number(source.id_SB || source.id || source.user_id || 0) || null,
    correo: String(source.correo || source.email || '').trim(),
    iniciales: String(source.iniciales || source.initials || '').trim().toUpperCase(),
    empresa: String(source.empresa || '').trim() || null
  };
}

async function getPendienteAccessContext_gnral(executor, idPendiente, user, options = {}) {
  const id = Number.parseInt(idPendiente, 10);
  const normalizedUser = normalizeUser_gnral(user);

  if (!id) {
    return {
      exists: false,
      allowed: false,
      creator: false,
      related: false,
      row: null,
      user: normalizedUser
    };
  }

  const lockClause = options.forUpdate === true ? ' FOR UPDATE' : '';
  const [rows] = await executor.query(`
    SELECT
      p.*,
      EXISTS (
        SELECT 1
        FROM pendientes_usuarios pu
        WHERE pu.id_pendiente = p.id_pendiente
          AND UPPER(TRIM(pu.iniciales_usuario)) = UPPER(TRIM(?))
      ) AS relacionado
    FROM pendientes p
    WHERE p.id_pendiente = ?
    LIMIT 1${lockClause}
  `, [normalizedUser.iniciales, id]);

  if (!rows.length) {
    return {
      exists: false,
      allowed: false,
      creator: false,
      related: false,
      row: null,
      user: normalizedUser
    };
  }

  const row = rows[0];
  const creator = Boolean(
    normalizedUser.correo &&
    String(row.creado_por_email || '').trim().toLowerCase() === normalizedUser.correo.toLowerCase()
  );
  const related = Boolean(Number(row.relacionado || 0));
  const allowed = String(row.tipo_pendiente || '').toUpperCase() === 'PERSONAL'
    ? creator
    : (creator || related);

  return {
    exists: true,
    allowed,
    creator,
    related,
    row,
    user: normalizedUser
  };
}

function accessError_gnral(access, options = {}) {
  if (!access || !access.exists) {
    const error = new Error(options.notFoundMessage || 'Pendiente no encontrado.');
    error.status = 404;
    error.code = 'PENDIENTE_NOT_FOUND';
    error.expose = true;
    return error;
  }
  if (!access.allowed) {
    const error = new Error(options.forbiddenMessage || 'No tienes acceso a esta tarea.');
    error.status = 403;
    error.code = 'PENDIENTE_ACCESS_FORBIDDEN';
    error.expose = true;
    return error;
  }
  return null;
}

function assertAccess_gnral(access, options = {}) {
  const error = accessError_gnral(access, options);
  if (error) throw error;
  return access;
}

function assertCreator_gnral(access, options = {}) {
  assertAccess_gnral(access, options);
  if (!access.creator) {
    const error = new Error(options.creatorMessage || 'Solo el creador puede realizar esta acción.');
    error.status = 403;
    error.code = 'PENDIENTE_CREATOR_REQUIRED';
    error.expose = true;
    throw error;
  }
  return access;
}

module.exports = {
  normalizeUser_gnral,
  getPendienteAccessContext_gnral,
  accessError_gnral,
  assertAccess_gnral,
  assertCreator_gnral
};
