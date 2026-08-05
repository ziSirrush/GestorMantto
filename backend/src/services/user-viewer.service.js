'use strict';

const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { hasEffectivePermission } = require('./permissions/effective-permission.service');

const VIEWER_PERMISSION_CODE = 'GENERAL_VISOR_USUARIOS_OPERACION.USAR_VISOR';

function roleSet(user) {
  return new Set([user?.rol, ...(user?.roles || [])].filter(Boolean));
}

function viewerCompanyScope(actor) {
  const roles = roleSet(actor);
  if (roles.has('Programador')) return null;

  const companies = [];
  if (roles.has('Programador United')) companies.push('UNITED');
  if (roles.has('Programador Corellian')) companies.push('CORELLIAN');

  return companies.length ? companies : null;
}

function companyIsAllowed(company, scope) {
  if (!scope) return true;
  const normalized = String(company || '').toUpperCase();
  return scope.some(item => normalized.includes(item));
}


async function auditViewerEvent(actorUserId, eventType, details, ipAddress, conn = db) {
  try {
    await conn.query(
      `INSERT INTO auth_audit (
        usuario_id,
        event_type,
        event_details,
        ip_address
      ) VALUES (?, ?, ?, ?)`,
      [
        Number(actorUserId),
        String(eventType || 'VIEWER_EVENT').slice(0, 50),
        JSON.stringify(details || {}),
        ipAddress || null
      ]
    );
  } catch (error) {
    console.warn('[VIEWER AUDIT]', error.message);
  }
}

async function canUseUserViewer(actor, conn = db) {
  return hasEffectivePermission(actor?.id_SB, VIEWER_PERMISSION_CODE, conn);
}

async function assertCanUseUserViewer(actor, conn = db) {
  const allowed = await canUseUserViewer(actor, conn);
  if (allowed) return true;

  const error = new Error('Tu sesión no está autorizada para usar el Visor de usuarios.');
  error.status = 403;
  throw error;
}

function normalizeRolesCompact(value) {
  if (!value) return [];
  return String(value).split(';;').filter(Boolean).map(item => {
    const [id_rol, rol, codigo, principal, nivel] = item.split('|');
    return {
      id_rol: Number(id_rol),
      rol,
      codigo,
      principal: Number(principal) === 1,
      nivel: Number(nivel || 0)
    };
  });
}

async function listViewerUsers(actor, conn = db) {
  await assertCanUseUserViewer(actor, conn);
  const scope = viewerCompanyScope(actor);
  const params = [Number(actor.id_SB)];
  let companyFilter = '';

  if (scope) {
    companyFilter = `AND (${scope.map(() => "UPPER(COALESCE(u.empresa, '')) LIKE ?").join(' OR ')})`;
    params.push(...scope.map(company => `%${company}%`));
  }

  const [rows] = await conn.query(
    `SELECT
       u.id_SB,
       u.nombre,
       u.iniciales,
       u.correo,
       u.puesto,
       u.area,
       u.empresa,
       u.rol_id,
       principal_role.rol AS rol,
       u.estado,
       GROUP_CONCAT(
         DISTINCT CONCAT(
           r.id_rol, '|', r.rol, '|', COALESCE(r.codigo, ''), '|', ur.principal, '|', COALESCE(r.nivel, 0)
         )
         ORDER BY ur.principal DESC, r.nivel DESC, r.rol
         SEPARATOR ';;'
       ) AS roles_compactos
     FROM usuarios u
     LEFT JOIN roles principal_role
       ON principal_role.id_rol = u.rol_id
      AND principal_role.estado = 1
     LEFT JOIN usuario_roles ur
       ON ur.id_usuario = u.id_SB
      AND ur.activo = 1
     LEFT JOIN roles r
       ON r.id_rol = ur.id_rol
      AND r.estado = 1
     WHERE u.estado = 1
       AND u.id_SB <> ?
       ${companyFilter}
     GROUP BY u.id_SB, u.nombre, u.iniciales, u.correo, u.puesto, u.area, u.empresa, u.rol_id, principal_role.rol, u.estado
     ORDER BY u.nombre`,
    params
  );

  return rows.map(row => ({
    ...row,
    roles: normalizeRolesCompact(row.roles_compactos)
  }));
}

async function getViewerTarget(actor, targetUserId, conn = db) {
  await assertCanUseUserViewer(actor, conn);

  const normalizedTargetId = Number(targetUserId);
  if (!Number.isInteger(normalizedTargetId) || normalizedTargetId <= 0 || normalizedTargetId === Number(actor?.id_SB)) {
    const error = new Error('El usuario seleccionado no es válido para el Visor de usuarios.');
    error.status = 400;
    throw error;
  }

  const [rows] = await conn.query(
    `SELECT
       u.id_SB,
       u.nombre,
       u.iniciales,
       u.correo,
       u.empresa,
       u.puesto,
       u.area,
       u.rol_id,
       u.estado
     FROM usuarios u
     WHERE u.id_SB = ?
       AND u.estado = 1
     LIMIT 1`,
    [normalizedTargetId]
  );

  if (!rows.length) {
    const error = new Error('El usuario visualizado no existe o está inactivo.');
    error.status = 404;
    throw error;
  }

  const scope = viewerCompanyScope(actor);
  if (!companyIsAllowed(rows[0].empresa, scope)) {
    const error = new Error('El usuario visualizado no pertenece a tu alcance.');
    error.status = 403;
    throw error;
  }

  return rows[0];
}

async function createViewerContext(actor, targetUserId, conn = db) {
  const target = await getViewerTarget(actor, targetUserId, conn);
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (!secret) {
    const error = new Error('JWT_SECRET no está configurado para crear el contexto del visor.');
    error.status = 500;
    throw error;
  }

  const viewerToken = jwt.sign({
    type: 'user_viewer',
    actor_id: Number(actor.id_SB),
    target_id: Number(target.id_SB),
    read_only: true
  }, secret, { expiresIn: '30m' });

  return {
    viewer_token: viewerToken,
    expires_in_seconds: 1800,
    target_user_id: Number(target.id_SB),
    read_only: true
  };
}

module.exports = {
  VIEWER_PERMISSION_CODE,
  canUseUserViewer,
  assertCanUseUserViewer,
  listViewerUsers,
  getViewerTarget,
  createViewerContext,
  auditViewerEvent
};
