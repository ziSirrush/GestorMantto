const bcrypt = require('bcrypt');
const db = require('../config/db');
const { validatePasswordRules } = require('../utils/passwordRules');

const PUBLIC_USER_SELECT = `
  u.id_SB,
  u.nombre,
  u.iniciales,
  u.puesto,
  u.area,
  u.empresa,
  u.rol_id,
  r.rol,
  r.descripcion AS rol_descripcion,
  u.correo,
  u.reporta_a,
  jefe.nombre AS reporta_a_nombre,
  u.estado,
  u.ultimo_acceso,
  u.created_at,
  u.updated_at
`;

function normalizeIdList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return [...new Set(value.map(Number).filter(Number.isFinite))];
  return [...new Set(String(value).split(',').map(v => Number(v.trim())).filter(Number.isFinite))];
}

function normalizeText(value) {
  return value === undefined || value === null ? null : String(value).trim();
}

function roleNames(user) {
  return [user?.rol, ...(user?.roles || [])].filter(Boolean);
}

async function userHasPermission(userId, permissionColumn) {
  const allowed = new Set(['usuarios', 'crear_usuario', 'editar_usuario', 'eliminar_usuario', 'programador']);
  if (!allowed.has(permissionColumn)) return false;

  const [rows] = await db.query(
    `SELECT 1
     FROM usuarios u
     LEFT JOIN usuario_roles ur
       ON ur.id_usuario = u.id_SB
      AND ur.activo = 1
     INNER JOIN permisos p
       ON p.rol_id IN (u.rol_id, ur.id_rol)
      AND p.estado = 1
     WHERE u.id_SB = ?
       AND (p.programador = 1 OR p.${permissionColumn} = 1)
     LIMIT 1`,
    [userId]
  );
  return rows.length > 0;
}

async function canManageUsers(req, permissionColumn) {
  const names = roleNames(req.user);
  if (names.includes('Programador')) return true;
  return userHasPermission(req.user.id_SB, permissionColumn);
}

async function audit(conn, actorId, eventType, details, ipAddress) {
  await conn.query(
    `INSERT INTO auth_audit (usuario_id, event_type, event_details, ip_address)
     VALUES (?, ?, ?, ?)`,
    [actorId, eventType, JSON.stringify(details || {}), ipAddress || null]
  );
}

async function getRolesForUser(userId, conn = db) {
  const [rows] = await conn.query(
    `SELECT
       ur.id_usuario_rol,
       r.id_rol,
       r.rol,
       r.descripcion,
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
  return rows;
}

async function getZonasForUser(userId, conn = db) {
  const [rows] = await conn.query(
    `SELECT
       uz.id_usuario_zop,
       z.id_zona,
       z.zona,
       z.nombre
     FROM usuario_zop uz
     INNER JOIN z_op z ON z.id_zona = uz.zona_id
     WHERE uz.usuario_id = ?
       AND uz.estado = 1
       AND z.estado = 1
     ORDER BY z.zona ASC`,
    [userId]
  );
  return rows;
}

async function validateRoleIds(conn, roleIds) {
  if (!roleIds.length) return;
  const [rows] = await conn.query(
    `SELECT id_rol FROM roles WHERE id_rol IN (?) AND estado = 1`,
    [roleIds]
  );
  if (rows.length !== roleIds.length) {
    throw new Error('Uno o más roles no existen o están inactivos.');
  }
}

async function validateZonaIds(conn, zonaIds) {
  if (!zonaIds.length) return;
  const [rows] = await conn.query(
    `SELECT id_zona FROM z_op WHERE id_zona IN (?) AND estado = 1`,
    [zonaIds]
  );
  if (rows.length !== zonaIds.length) {
    throw new Error('Una o más zonas no existen o están inactivas.');
  }
}

async function listUsuarios(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT ${PUBLIC_USER_SELECT}
       FROM usuarios u
       LEFT JOIN roles r ON r.id_rol = u.rol_id
       LEFT JOIN usuarios jefe ON jefe.id_SB = u.reporta_a
       ORDER BY u.estado DESC, r.id_rol ASC, u.nombre ASC`
    );
    return res.json({ ok: true, source: 'aiven', data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando usuarios.', error: error.message });
  }
}

async function directorio(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT
         u.id_SB,
         u.nombre,
         u.iniciales,
         u.puesto,
         u.area,
         u.empresa,
         u.correo,
         u.estado,
         r.rol
       FROM usuarios u
       LEFT JOIN roles r ON r.id_rol = u.rol_id
       WHERE u.estado = 1
       ORDER BY u.nombre ASC`
    );
    return res.json({ ok: true, source: 'aiven', data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando directorio.', error: error.message });
  }
}

async function detalle(req, res) {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) return res.status(400).json({ ok: false, message: 'ID inválido.' });

    const [rows] = await db.query(
      `SELECT ${PUBLIC_USER_SELECT}, ps.pregunta AS pregunta_seguridad
       FROM usuarios u
       LEFT JOIN roles r ON r.id_rol = u.rol_id
       LEFT JOIN usuarios jefe ON jefe.id_SB = u.reporta_a
       LEFT JOIN preguntas_seguridad ps ON ps.id_pregunta = u.id_pregunta
       WHERE u.id_SB = ?
       LIMIT 1`,
      [userId]
    );
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });

    const [roles, zonas] = await Promise.all([getRolesForUser(userId), getZonasForUser(userId)]);
    return res.json({ ok: true, source: 'aiven', data: { ...rows[0], roles_detalle: roles, zonas_detalle: zonas } });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando detalle de usuario.', error: error.message });
  }
}

async function rolesUsuario(req, res) {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) return res.status(400).json({ ok: false, message: 'ID inválido.' });
    const rows = await getRolesForUser(userId);
    return res.json({ ok: true, source: 'aiven', data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando roles del usuario.', error: error.message });
  }
}

async function zonasUsuario(req, res) {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) return res.status(400).json({ ok: false, message: 'ID inválido.' });
    const rows = await getZonasForUser(userId);
    return res.json({ ok: true, source: 'aiven', data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando zonas del usuario.', error: error.message });
  }
}

async function createUsuario(req, res) {
  if (!(await canManageUsers(req, 'crear_usuario'))) {
    return res.status(403).json({ ok: false, message: 'No tienes permisos para crear usuarios.' });
  }

  const payload = req.body || {};
  const nombre = normalizeText(payload.nombre);
  const iniciales = normalizeText(payload.iniciales)?.toUpperCase();
  const puesto = normalizeText(payload.puesto);
  const area = normalizeText(payload.area);
  const empresa = normalizeText(payload.empresa);
  const correo = normalizeText(payload.correo)?.toLowerCase();
  const rolId = Number(payload.rol_id || payload.id_rol);
  const reportaA = payload.reporta_a ? Number(payload.reporta_a) : null;
  const estado = payload.estado === undefined ? 1 : Number(payload.estado) ? 1 : 0;
  const idPregunta = payload.id_pregunta ? Number(payload.id_pregunta) : 11;
  const rolesAsociados = normalizeIdList(payload.roles_asociados || payload.roles || payload.role_ids);
  const zonas = normalizeIdList(payload.zonas || payload.zona_ids || payload.zonas_asignadas);
  const tempPassword = String(payload.password_temporal || payload.pass || '').trim();

  if (!nombre || !iniciales || !puesto || !area || !correo || !Number.isFinite(rolId)) {
    return res.status(400).json({ ok: false, message: 'Nombre, iniciales, puesto, área, correo y rol principal son obligatorios.' });
  }

  const finalPassword = tempPassword || `Mantto-${iniciales}-${new Date().getFullYear()}!`;
  const passwordError = validatePasswordRules(finalPassword);
  if (passwordError) return res.status(400).json({ ok: false, message: passwordError });

  const allRoleIds = [...new Set([rolId, ...rolesAsociados])];
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await validateRoleIds(conn, allRoleIds);
    await validateZonaIds(conn, zonas);

    if (reportaA) {
      const [superior] = await conn.query('SELECT id_SB FROM usuarios WHERE id_SB = ? AND estado = 1 LIMIT 1', [reportaA]);
      if (!superior.length) throw new Error('El superior directo no existe o está inactivo.');
    }

    const hash = await bcrypt.hash(finalPassword, 10);
    const [result] = await conn.query(
      `INSERT INTO usuarios
       (nombre, iniciales, puesto, area, empresa, rol_id, correo, pass, must_change_password, reporta_a, estado, id_pregunta, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
      [nombre, iniciales, puesto, area, empresa, rolId, correo, hash, reportaA, estado, idPregunta, req.user.correo, req.user.correo]
    );

    const newUserId = result.insertId;
    for (const roleId of allRoleIds) {
      await conn.query(
        `INSERT INTO usuario_roles (id_usuario, id_rol, principal, activo)
         VALUES (?, ?, ?, 1)`,
        [newUserId, roleId, roleId === rolId ? 1 : 0]
      );
    }

    for (const zonaId of zonas) {
      await conn.query(
        `INSERT INTO usuario_zop (usuario_id, zona_id, estado, created_by, updated_by)
         VALUES (?, ?, 1, ?, ?)`,
        [newUserId, zonaId, req.user.correo, req.user.correo]
      );
    }

    await audit(conn, req.user.id_SB, 'ADMIN_USER_CREATED', { target_user_id: newUserId, correo, rol_id: rolId, roles: allRoleIds, zonas }, req.ip);
    await conn.commit();

    const roles = await getRolesForUser(newUserId);
    const zonasDetalle = await getZonasForUser(newUserId);
    return res.status(201).json({ ok: true, message: 'Usuario creado correctamente.', data: { id_SB: newUserId, password_temporal: finalPassword, roles_detalle: roles, zonas_detalle: zonasDetalle } });
  } catch (error) {
    await conn.rollback();
    const status = error && error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, message: 'Error creando usuario.', error: error.message });
  } finally {
    conn.release();
  }
}

async function updateUsuario(req, res) {
  if (!(await canManageUsers(req, 'editar_usuario'))) {
    return res.status(403).json({ ok: false, message: 'No tienes permisos para editar usuarios.' });
  }

  const userId = Number(req.params.id);
  if (!Number.isFinite(userId)) return res.status(400).json({ ok: false, message: 'ID inválido.' });

  const payload = req.body || {};
  const nombre = normalizeText(payload.nombre);
  const iniciales = normalizeText(payload.iniciales)?.toUpperCase();
  const puesto = normalizeText(payload.puesto);
  const area = normalizeText(payload.area);
  const empresa = normalizeText(payload.empresa);
  const correo = normalizeText(payload.correo)?.toLowerCase();
  const rolId = Number(payload.rol_id || payload.id_rol);
  const reportaA = payload.reporta_a ? Number(payload.reporta_a) : null;
  const estado = payload.estado === undefined ? 1 : Number(payload.estado) ? 1 : 0;
  const rolesAsociados = normalizeIdList(payload.roles_asociados || payload.roles || payload.role_ids);
  const zonas = normalizeIdList(payload.zonas || payload.zona_ids || payload.zonas_asignadas);

  if (!nombre || !iniciales || !puesto || !area || !correo || !Number.isFinite(rolId)) {
    return res.status(400).json({ ok: false, message: 'Nombre, iniciales, puesto, área, correo y rol principal son obligatorios.' });
  }

  const allRoleIds = [...new Set([rolId, ...rolesAsociados])];
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [exists] = await conn.query('SELECT id_SB FROM usuarios WHERE id_SB = ? LIMIT 1', [userId]);
    if (!exists.length) {
      await conn.rollback();
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    }

    await validateRoleIds(conn, allRoleIds);
    await validateZonaIds(conn, zonas);

    if (reportaA) {
      if (reportaA === userId) throw new Error('El usuario no puede reportarse a sí mismo.');
      const [superior] = await conn.query('SELECT id_SB FROM usuarios WHERE id_SB = ? AND estado = 1 LIMIT 1', [reportaA]);
      if (!superior.length) throw new Error('El superior directo no existe o está inactivo.');
    }

    await conn.query(
      `UPDATE usuarios
       SET nombre = ?, iniciales = ?, puesto = ?, area = ?, empresa = ?, rol_id = ?, correo = ?, reporta_a = ?, estado = ?, updated_by = ?
       WHERE id_SB = ?`,
      [nombre, iniciales, puesto, area, empresa, rolId, correo, reportaA, estado, req.user.correo, userId]
    );

    await conn.query('DELETE FROM usuario_roles WHERE id_usuario = ?', [userId]);
    for (const roleId of allRoleIds) {
      await conn.query(
        `INSERT INTO usuario_roles (id_usuario, id_rol, principal, activo)
         VALUES (?, ?, ?, 1)`,
        [userId, roleId, roleId === rolId ? 1 : 0]
      );
    }

    await conn.query('DELETE FROM usuario_zop WHERE usuario_id = ?', [userId]);
    for (const zonaId of zonas) {
      await conn.query(
        `INSERT INTO usuario_zop (usuario_id, zona_id, estado, created_by, updated_by)
         VALUES (?, ?, 1, ?, ?)`,
        [userId, zonaId, req.user.correo, req.user.correo]
      );
    }

    await audit(conn, req.user.id_SB, 'ADMIN_USER_UPDATED', { target_user_id: userId, correo, rol_id: rolId, roles: allRoleIds, zonas }, req.ip);
    await conn.commit();

    const roles = await getRolesForUser(userId);
    const zonasDetalle = await getZonasForUser(userId);
    return res.json({ ok: true, message: 'Usuario actualizado correctamente.', data: { id_SB: userId, roles_detalle: roles, zonas_detalle: zonasDetalle } });
  } catch (error) {
    await conn.rollback();
    const status = error && error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, message: 'Error actualizando usuario.', error: error.message });
  } finally {
    conn.release();
  }
}

module.exports = {
  listUsuarios,
  directorio,
  detalle,
  rolesUsuario,
  zonasUsuario,
  createUsuario,
  updateUsuario
};
