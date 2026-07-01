const jwt = require('jsonwebtoken');
const db = require('../config/db');

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
       u.rol_id,
       u.estado,
       r.rol AS rol
     FROM usuarios u
     LEFT JOIN roles r ON r.id_rol = u.rol_id
     WHERE u.id_SB = ?
     LIMIT 1`,
    [userId]
  );

  if (!rows.length || Number(rows[0].estado) !== 1) return null;

  const rolesRows = await loadUserRoles(userId);
  const roleNames = rolesRows.map(row => row.rol).filter(Boolean);

  return {
    id_SB: rows[0].id_SB,
    nombre: rows[0].nombre,
    iniciales: rows[0].iniciales,
    correo: rows[0].correo,
    empresa: rows[0].empresa,
    rol_id: rows[0].rol_id,
    rol: rows[0].rol,
    roles: roleNames,
    roles_detalle: rolesRows,
    is_programador: roleNames.includes('Programador') || rows[0].rol === 'Programador'
  };
}

async function optionalAuth(req, res, next) {
  try {
    const token = parseAuthHeader(req);
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await hydrateAuthUser(decoded);
    if (user) req.user = user;

    return next();
  } catch (error) {
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
    return next();
  } catch (error) {
    return res.status(401).json({ ok: false, message: 'Sesión inválida.', error: error.message });
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
  loadUserRoles
};
