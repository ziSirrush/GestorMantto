'use strict';

const FULL_ACCESS_ROLE_IDS = new Set([1, 4, 34, 39]);
const MANAGER_ROLE_IDS = new Set([48, 50, 54]);

const FULL_ACCESS_NAMES = new Set([
  'director general',
  'director ventas',
  'jefa administracion ventas',
  'auxiliar direccion'
]);

const MANAGER_NAMES = new Set([
  'gerente de cuentas corporativas',
  'gerente comercial baja california y sureste',
  'gerente comercial zona norte'
]);

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function getActorId(actionContext) {
  const actorId = positiveInteger(actionContext?.user?.id_SB);
  if (!actorId) {
    const error = new Error('Sesión requerida.');
    error.statusCode = 401;
    throw error;
  }
  return actorId;
}

async function getProfile(connection, userId) {
  const [rows] = await connection.query(
    `SELECT
       u.id_SB,
       u.puesto,
       u.area,
       u.reporta_a,
       u.rol_id AS legacy_role_id,
       GROUP_CONCAT(DISTINCT r.id_rol ORDER BY r.id_rol) AS role_ids,
       GROUP_CONCAT(DISTINCT r.rol ORDER BY r.rol SEPARATOR '||') AS role_names
     FROM usuarios u
     LEFT JOIN usuario_roles ur
       ON ur.id_usuario = u.id_SB
      AND ur.activo = 1
     LEFT JOIN roles r
       ON r.id_rol = ur.id_rol
      AND r.estado = 1
     WHERE u.id_SB = ?
       AND u.estado = 1
     GROUP BY u.id_SB, u.puesto, u.area, u.reporta_a, u.rol_id
     LIMIT 1`,
    [userId]
  );

  const row = rows[0];
  if (!row) return null;

  const roleIds = String(row.role_ids || '')
    .split(',')
    .map(Number)
    .filter(Number.isInteger);

  const legacyRoleId = positiveInteger(row.legacy_role_id);
  if (legacyRoleId && !roleIds.includes(legacyRoleId)) roleIds.push(legacyRoleId);

  const roleNames = String(row.role_names || '')
    .split('||')
    .map(normalize)
    .filter(Boolean);

  const puesto = normalize(row.puesto);
  if (puesto && !roleNames.includes(puesto)) roleNames.push(puesto);

  return {
    idUsuario: Number(row.id_SB),
    puesto: row.puesto || '',
    area: row.area || '',
    reportaA: positiveInteger(row.reporta_a),
    roleIds,
    roleNames
  };
}

async function getDirectReportIds(connection, managerId) {
  const [rows] = await connection.query(
    `SELECT id_SB
       FROM usuarios
      WHERE reporta_a = ?
        AND estado = 1`,
    [managerId]
  );
  return rows.map((row) => Number(row.id_SB)).filter(Number.isInteger);
}

function matchesAny(profile, ids, names) {
  return profile.roleIds.some((id) => ids.has(id))
    || profile.roleNames.some((name) => names.has(name));
}

async function resolveVisibilityScope(connection, actionContext) {
  const actorId = getActorId(actionContext);
  const profile = await getProfile(connection, actorId);

  if (!profile) {
    const error = new Error('Usuario autenticado no disponible o inactivo.');
    error.statusCode = 401;
    throw error;
  }

  if (matchesAny(profile, FULL_ACCESS_ROLE_IDS, FULL_ACCESS_NAMES)) {
    return {
      mode: 'ALL',
      accessTotal: true,
      advisorIds: [],
      actorId,
      profile
    };
  }

  if (matchesAny(profile, MANAGER_ROLE_IDS, MANAGER_NAMES)) {
    const directReports = await getDirectReportIds(connection, actorId);
    return {
      mode: 'LIMITED',
      accessTotal: false,
      advisorIds: [...new Set([actorId, ...directReports])],
      actorId,
      profile
    };
  }

  return {
    mode: 'LIMITED',
    accessTotal: false,
    advisorIds: [actorId],
    actorId,
    profile
  };
}

function toClientVisibility(scope) {
  return {
    acceso_total: scope.mode === 'ALL',
    modo: scope.mode,
    usuario_id: scope.actorId,
    ids_asesores_visibles: scope.mode === 'ALL' ? [] : scope.advisorIds
  };
}

module.exports = {
  resolveVisibilityScope,
  toClientVisibility,
  getProfile,
  getDirectReportIds
};
