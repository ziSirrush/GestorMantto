const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { getViewerTarget } = require('../services/user-viewer.service');

function parseAuthHeader(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  if (!header || !String(header).startsWith('Bearer ')) return null;
  return String(header).slice(7).trim();
}

async function loadUserRoles(userId) {
  const [roles] = await db.query(
    `SELECT
       r.id_rol,
       r.rol,
       r.codigo,
       r.nivel,
       r.empresa,
       ur.principal,
       ur.activo
     FROM usuario_roles ur
     INNER JOIN roles r ON r.id_rol = ur.id_rol
     WHERE ur.id_usuario = ?
       AND ur.activo = 1
       AND r.estado = 1
     ORDER BY ur.principal DESC, r.id_rol ASC`,
    [userId]
  );

  return roles;
}

async function loadUserZones(userId) {
  const [zones] = await db.query(
    `SELECT
       z.id_zona,
       z.zona,
       z.nombre
     FROM usuario_zop uz
     INNER JOIN z_op z
       ON z.id_zona = uz.zona_id
      AND z.estado = 1
     WHERE uz.usuario_id = ?
       AND uz.estado = 1
     ORDER BY z.zona, z.nombre`,
    [userId]
  );

  return zones;
}

function isSafeReadMethod(req) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(String(req.method || 'GET').toUpperCase());
}

function keepsActorIdentity(req) {
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  return path === '/api/auth/me' || path.startsWith('/api/device-permissions');
}

async function hydrateAuthUser(decoded) {
  const userId = decoded && (decoded.id_SB || decoded.id || decoded.user_id);
  if (!userId) return null;

  const [rows] = await db.query(
    `SELECT
       u.id_SB,
       u.nombre,
       u.iniciales,
       u.correo,
       u.empresa,
       u.puesto,
       u.area,
       u.reporta_a,
       u.rol_id,
       u.estado,
       u.criticos_fallas,
       u.criticos_periodo,
       r.rol AS rol
     FROM usuarios u
     LEFT JOIN roles r ON r.id_rol = u.rol_id
     WHERE u.id_SB = ?
     LIMIT 1`,
    [userId]
  );

  if (!rows.length || Number(rows[0].estado) !== 1) return null;

  const [rolesRows, zonesRows] = await Promise.all([
    loadUserRoles(userId),
    loadUserZones(userId)
  ]);
  const roleNames = rolesRows.map(row => row.rol).filter(Boolean);
  const programmerRoles = new Set(['Programador', 'Programador United', 'Programador Corellian']);

  return {
    id_SB: rows[0].id_SB,
    nombre: rows[0].nombre,
    iniciales: rows[0].iniciales,
    correo: rows[0].correo,
    empresa: rows[0].empresa,
    puesto: rows[0].puesto,
    area: rows[0].area,
    reporta_a: rows[0].reporta_a,
    rol_id: rows[0].rol_id,
    rol: rows[0].rol,
    roles: roleNames,
    roles_detalle: rolesRows,
    zonas: zonesRows,
    zonas_detalle: zonesRows,
    criticos_fallas: Number(rows[0].criticos_fallas || 3),
    criticos_periodo: Number(rows[0].criticos_periodo || 35),
    is_programador: roleNames.some(role => programmerRoles.has(role)) || programmerRoles.has(rows[0].rol)
  };
}


async function hydrateViewContext(req, actor) {
  const viewerToken = String(req.get('X-Viewer-Token') || '').trim();
  let targetUserId = null;

  if (viewerToken) {
    let payload;
    try {
      payload = jwt.verify(viewerToken, process.env.JWT_SECRET);
    } catch (verifyError) {
      const error = new Error('El contexto temporal del Visor de usuarios expiró o dejó de ser válido.');
      error.status = 403;
      error.code = 'VIEWER_CONTEXT_INVALID';
      throw error;
    }
    if (payload?.type !== 'user_viewer' || Number(payload.actor_id) !== Number(actor.id_SB) || payload.read_only !== true) {
      const error = new Error('El contexto temporal del Visor de usuarios no es válido.');
      error.status = 403;
      error.code = 'VIEWER_CONTEXT_INVALID';
      throw error;
    }
    targetUserId = Number(payload.target_id);
  } else {
    const raw = req.get('X-View-User-ID');
    if (!raw) return null;
    targetUserId = Number(raw);
  }

  const target = await getViewerTarget(actor, targetUserId);
  targetUserId = Number(target.id_SB);

  const viewed = await hydrateAuthUser({
    id_SB: targetUserId,
    id: targetUserId,
    user_id: targetUserId
  });

  if (!viewed) {
    const error = new Error('El usuario visualizado no existe o está inactivo.');
    error.status = 404;
    throw error;
  }

  return viewed;
}


async function optionalAuth(req, res, next) {
  try {
    const token = parseAuthHeader(req);
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await hydrateAuthUser(decoded);
    if (!user) return next();

    req.user = user;
    req.actorUser = user;

    const viewedUser = await hydrateViewContext(req, user);
    req.contextUser = viewedUser || user;
    req.viewerContext = viewedUser ? {
      active: true,
      readOnly: true,
      actorUserId: Number(user.id_SB),
      targetUserId: Number(viewedUser.id_SB)
    } : null;

    if (viewedUser && isSafeReadMethod(req) && !keepsActorIdentity(req)) {
      req.user = viewedUser;
    }

    return next();
  } catch (error) {
    if (String(req.get('X-Viewer-Token') || '').trim()) {
      return res.status(error.status || 403).json({
        ok: false,
        code: error.code || 'VIEWER_CONTEXT_INVALID',
        message: error.message || 'El contexto del Visor de usuarios no es válido.'
      });
    }
    return next();
  }
}

async function requireAuth(req, res, next) {
  try {
    const token = parseAuthHeader(req);
    if (!token) {
      return res.status(401).json({ ok: false, message: 'Sesión requerida.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await hydrateAuthUser(decoded);

    if (!user) {
      return res.status(401).json({ ok: false, message: 'Sesión inválida o usuario inactivo.' });
    }

    req.user = user;
    req.actorUser = user;

    const viewedUser = await hydrateViewContext(req, user);
    req.contextUser = viewedUser || user;
    req.viewerContext = viewedUser ? {
      active: true,
      readOnly: true,
      actorUserId: Number(user.id_SB),
      targetUserId: Number(viewedUser.id_SB)
    } : null;

    // En modo visor, las consultas de lectura deben ejecutarse exactamente con
    // la identidad efectiva del usuario visualizado. La identidad real queda
    // preservada en req.actorUser para permisos del visor y auditoría.
    if (viewedUser && isSafeReadMethod(req) && !keepsActorIdentity(req)) {
      req.user = viewedUser;
    }

    return next();
  } catch (error) {
    const status = error.status || 401;
    return res.status(status).json({ ok: false, message: error.message || 'Sesión inválida.' });
  }
}

function requireRole(roleName) {
  return function roleGuard(req, res, next) {
    const roles = (req.user && req.user.roles) || [];
    if (roles.includes(roleName) || (req.user && req.user.rol === roleName)) return next();

    return res.status(403).json({
      ok: false,
      message: 'No tienes permisos para realizar esta acción.'
    });
  };
}

module.exports = {
  optionalAuth,
  requireAuth,
  requireRole,
  loadUserRoles,
  loadUserZones,
  hydrateAuthUser
};
