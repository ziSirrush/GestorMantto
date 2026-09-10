'use strict';

const PHOTO_MANAGER_ROLE_TOKENS_GNRAL = Object.freeze(new Set([
  'GESTOR DE FOTOGRAFIAS',
  'GESTOR_FOTOGRAFIAS'
]));

function normalizeRoleToken_gnral(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function roleValues_gnral(role) {
  if (!role) return [];
  if (typeof role !== 'object') return [role];

  return [
    role.rol,
    role.role,
    role.nombre,
    role.name,
    role.codigo,
    role.code,
    role.rol_codigo,
    role.role_code
  ];
}

function userRoleTokens_gnral(user) {
  if (!user) return new Set();

  const values = [
    user.rol,
    user.role,
    user.rol_codigo,
    user.role_code,
    user.codigo_rol
  ];

  for (const role of (Array.isArray(user.roles) ? user.roles : [])) {
    values.push(...roleValues_gnral(role));
  }

  for (const role of (Array.isArray(user.roles_detalle) ? user.roles_detalle : [])) {
    values.push(...roleValues_gnral(role));
  }

  return new Set(
    values
      .filter(Boolean)
      .map(normalizeRoleToken_gnral)
      .filter(Boolean)
  );
}

function userCanManageProjectPhotos_gnral(user) {
  const tokens = userRoleTokens_gnral(user);
  for (const allowed of PHOTO_MANAGER_ROLE_TOKENS_GNRAL) {
    if (tokens.has(allowed)) return true;
  }
  return false;
}

function requireProjectPhotoManager_gnral(req, res, next) {
  if (userCanManageProjectPhotos_gnral(req.user)) return next();

  return res.status(403).json({
    ok: false,
    code: 'PROJECT_PHOTO_MANAGEMENT_DENIED',
    message: 'Se requiere el rol Gestor de Fotografías para administrar fotografías de proyecto.'
  });
}

async function requireCorellianProjectPhotoScope_gnral(req, res, next) {
  // Se cargan sólo al evaluar alcance: las reglas puras de rol no deben depender
  // de credenciales ni de una conexión de base de datos para poder verificarse.
  const db = require('../config/db');
  const { buildInsFlScopeSql_gnral } = require('../services/information-record-scope-gnral.service');
  const project = String(req.params && req.params.id_ppns || '').trim();
  if (!project) {
    return res.status(400).json({ ok: false, message: 'ID de proyecto requerido.' });
  }

  const scope = buildInsFlScopeSql_gnral(req, 'f');

  try {
    const [rows] = await db.query(
      `SELECT f.id_ins_fl
       FROM ins_fl f
       WHERE LOWER(TRIM(COALESCE(f.id_proyecto, ''))) = LOWER(TRIM(?))
         AND ${scope.sql}
       LIMIT 1`,
      [project, ...(scope.params || [])]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, message: 'Proyecto no encontrado.' });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  PHOTO_MANAGER_ROLE_TOKENS_GNRAL,
  normalizeRoleToken_gnral,
  userRoleTokens_gnral,
  userCanManageProjectPhotos_gnral,
  requireProjectPhotoManager_gnral,
  requireCorellianProjectPhotoScope_gnral
};
