const db = require('../config/db');

function actorScope(req) {
  const roles = new Set([req.user?.rol, ...(req.user?.roles || [])].filter(Boolean));
  if (roles.has('Programador') || roles.has('Director General')) {
    return { all: true, companies: ['GENERAL', 'UNITED', 'CORELLIAN'] };
  }

  const companies = new Set(['GENERAL']);
  if (roles.has('Programador United')) companies.add('UNITED');
  if (roles.has('Programador Corellian')) companies.add('CORELLIAN');
  return { all: false, companies: [...companies] };
}

function actorCanManage(req) {
  const roles = new Set([req.user?.rol, ...(req.user?.roles || [])].filter(Boolean));
  return roles.has('Programador') || roles.has('Programador United') ||
    roles.has('Programador Corellian') || roles.has('Director General');
}

function companySql(column, scope) {
  if (scope.all) return { clause: '1 = 1', params: [] };
  return { clause: `${column} IN (?)`, params: [scope.companies] };
}

function userCompanySql(column, scope) {
  if (scope.all) return { clause: '1 = 1', params: [] };
  const clauses = [];
  const params = [];
  if (scope.companies.includes('GENERAL')) clauses.push(`UPPER(COALESCE(${column}, '')) IN ('GENERAL', 'BLT')`);
  if (scope.companies.includes('UNITED')) clauses.push(`UPPER(COALESCE(${column}, '')) LIKE '%UNITED%'`);
  if (scope.companies.includes('CORELLIAN')) clauses.push(`UPPER(COALESCE(${column}, '')) LIKE '%CORELLIAN%'`);
  return { clause: `(${clauses.join(' OR ') || '0 = 1'})`, params };
}

async function assertRoleInScope(conn, roleId, scope) {
  const roleFilter = companySql('empresa', scope);
  const [rows] = await conn.query(
    `SELECT id_rol FROM roles WHERE id_rol = ? AND estado = 1 AND ${roleFilter.clause} LIMIT 1`,
    [roleId, ...roleFilter.params]
  );
  if (!rows.length) {
    const error = new Error('El rol no pertenece a tu alcance de administración.');
    error.status = 403;
    throw error;
  }
}

async function assertUserInScope(conn, userId, scope) {
  const userFilter = userCompanySql('empresa', scope);
  const [rows] = await conn.query(
    `SELECT id_SB FROM usuarios WHERE id_SB = ? AND ${userFilter.clause} LIMIT 1`,
    [userId, ...userFilter.params]
  );
  if (!rows.length) {
    const error = new Error('El usuario no pertenece a tu alcance de administración.');
    error.status = 403;
    throw error;
  }
}

async function assertPermissionInScope(conn, permissionId, scope) {
  const catalogFilter = companySql('pa.empresa', scope);
  const [rows] = await conn.query(`
    SELECT psa.id_subelemento_accion
    FROM perm_subelemento_acciones psa
    INNER JOIN perm_subelementos ps ON ps.id_subelemento = psa.id_subelemento
    INNER JOIN perm_elementos pe ON pe.id_elemento = ps.id_elemento
    INNER JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
    INNER JOIN perm_agrupaciones pa ON pa.id_agrupacion = pm.id_agrupacion
    WHERE psa.id_subelemento_accion = ? AND psa.activo = 1 AND ${catalogFilter.clause}
    LIMIT 1
  `, [permissionId, ...catalogFilter.params]);
  if (!rows.length) {
    const error = new Error('El permiso no pertenece a tu alcance de administración.');
    error.status = 403;
    throw error;
  }
}


async function assertHierarchyInScope(conn, level, id, scope) {
  const catalogFilter = companySql('pa.empresa', scope);
  const normalizedLevel = String(level || '').toLowerCase();
  let sql;
  if (normalizedLevel === 'group') {
    sql = `SELECT pa.id_agrupacion AS id
           FROM perm_agrupaciones pa
           WHERE pa.id_agrupacion = ? AND ${catalogFilter.clause}
           LIMIT 1`;
  } else if (normalizedLevel === 'module') {
    sql = `SELECT pm.id_modulo AS id
           FROM perm_modulos pm
           INNER JOIN perm_agrupaciones pa ON pa.id_agrupacion = pm.id_agrupacion
           WHERE pm.id_modulo = ? AND ${catalogFilter.clause}
           LIMIT 1`;
  } else {
    const error = new Error('Nivel jerárquico inválido.');
    error.status = 400;
    throw error;
  }
  const [rows] = await conn.query(sql, [id, ...catalogFilter.params]);
  if (!rows.length) {
    const error = new Error('El contenedor no pertenece a tu alcance de administración.');
    error.status = 403;
    throw error;
  }
}

function denyUnlessManager(req, res) {
  if (actorCanManage(req)) return false;
  res.status(403).json({ ok: false, message: 'No tienes autorización para administrar permisos.' });
  return true;
}


async function ensureVisualCatalogPermissions(conn) {
  await conn.query(`
    INSERT INTO perm_acciones
      (codigo, nombre, descripcion, requiere_auditoria, activo)
    VALUES
      ('ACCESO_VISUAL', 'Acceso visual', 'Permite mostrar un contenedor del catálogo aunque todavía se encuentre en construcción.', 0, 1)
    ON DUPLICATE KEY UPDATE
      nombre = VALUES(nombre),
      descripcion = VALUES(descripcion),
      activo = 1,
      updated_at = CURRENT_TIMESTAMP
  `);

  await conn.query(`
    INSERT INTO perm_elementos
      (id_modulo, codigo, nombre, tipo, orden, activo)
    SELECT
      pm.id_modulo,
      CONCAT(pm.codigo, '_ACCESO_VISUAL'),
      'Acceso visual',
      'VISUAL',
      0,
      1
    FROM perm_modulos pm
    WHERE pm.activo = 1
      AND pm.codigo NOT LIKE '__AGRUPACION_VISUAL_%'
      AND NOT EXISTS (
        SELECT 1
        FROM perm_elementos pe0
        INNER JOIN perm_subelementos ps0 ON ps0.id_elemento = pe0.id_elemento AND ps0.activo = 1
        INNER JOIN perm_subelemento_acciones psa0 ON psa0.id_subelemento = ps0.id_subelemento AND psa0.activo = 1
        INNER JOIN perm_acciones pa0 ON pa0.id_accion = psa0.id_accion AND pa0.activo = 1
        WHERE pe0.id_modulo = pm.id_modulo
          AND pe0.activo = 1
      )
    ON DUPLICATE KEY UPDATE
      nombre = VALUES(nombre),
      tipo = 'VISUAL',
      activo = 1,
      updated_at = CURRENT_TIMESTAMP
  `);

  await conn.query(`
    INSERT INTO perm_subelementos
      (id_elemento, codigo, nombre, orden, activo)
    SELECT
      pe.id_elemento,
      CONCAT(pm.codigo, '_ACCESO_VISUAL_MODULO'),
      'Mostrar módulo',
      0,
      1
    FROM perm_modulos pm
    INNER JOIN perm_elementos pe
      ON pe.id_modulo = pm.id_modulo
     AND pe.codigo = CONCAT(pm.codigo, '_ACCESO_VISUAL')
    WHERE pm.activo = 1
      AND pm.codigo NOT LIKE '__AGRUPACION_VISUAL_%'
    ON DUPLICATE KEY UPDATE
      nombre = VALUES(nombre),
      activo = 1,
      updated_at = CURRENT_TIMESTAMP
  `);

  await conn.query(`
    INSERT INTO perm_subelemento_acciones
      (id_subelemento, id_accion, codigo_permiso, activo)
    SELECT
      ps.id_subelemento,
      pa.id_accion,
      CONCAT(pm.codigo, '_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'),
      1
    FROM perm_modulos pm
    INNER JOIN perm_elementos pe
      ON pe.id_modulo = pm.id_modulo
     AND pe.codigo = CONCAT(pm.codigo, '_ACCESO_VISUAL')
    INNER JOIN perm_subelementos ps
      ON ps.id_elemento = pe.id_elemento
     AND ps.codigo = CONCAT(pm.codigo, '_ACCESO_VISUAL_MODULO')
    INNER JOIN perm_acciones pa ON pa.codigo = 'ACCESO_VISUAL'
    WHERE pm.activo = 1
      AND pm.codigo NOT LIKE '__AGRUPACION_VISUAL_%'
    ON DUPLICATE KEY UPDATE
      activo = 1,
      updated_at = CURRENT_TIMESTAMP
  `);

  await conn.query(`
    INSERT INTO perm_modulos
      (id_agrupacion, codigo, nombre, ruta_frontend, orden, activo)
    SELECT
      pg.id_agrupacion,
      CONCAT('__AGRUPACION_VISUAL_', pg.id_agrupacion),
      'Acceso visual de agrupación',
      NULL,
      9999,
      1
    FROM perm_agrupaciones pg
    WHERE pg.activo = 1
      AND NOT EXISTS (
        SELECT 1
        FROM perm_modulos pm0
        WHERE pm0.id_agrupacion = pg.id_agrupacion
          AND pm0.activo = 1
          AND pm0.codigo NOT LIKE '__AGRUPACION_VISUAL_%'
      )
    ON DUPLICATE KEY UPDATE
      nombre = VALUES(nombre),
      ruta_frontend = VALUES(ruta_frontend),
      activo = 1,
      updated_at = CURRENT_TIMESTAMP
  `);

  await conn.query(`
    INSERT INTO perm_elementos
      (id_modulo, codigo, nombre, tipo, orden, activo)
    SELECT
      pm.id_modulo,
      CONCAT(pm.codigo, '_ELEMENTO'),
      'Acceso visual de agrupación',
      'VISUAL',
      0,
      1
    FROM perm_modulos pm
    WHERE pm.activo = 1
      AND pm.codigo LIKE '__AGRUPACION_VISUAL_%'
    ON DUPLICATE KEY UPDATE
      nombre = VALUES(nombre),
      tipo = 'VISUAL',
      activo = 1,
      updated_at = CURRENT_TIMESTAMP
  `);

  await conn.query(`
    INSERT INTO perm_subelementos
      (id_elemento, codigo, nombre, orden, activo)
    SELECT
      pe.id_elemento,
      CONCAT(pm.codigo, '_SUBELEMENTO'),
      'Mostrar agrupación',
      0,
      1
    FROM perm_modulos pm
    INNER JOIN perm_elementos pe
      ON pe.id_modulo = pm.id_modulo
     AND pe.codigo = CONCAT(pm.codigo, '_ELEMENTO')
    WHERE pm.activo = 1
      AND pm.codigo LIKE '__AGRUPACION_VISUAL_%'
    ON DUPLICATE KEY UPDATE
      nombre = VALUES(nombre),
      activo = 1,
      updated_at = CURRENT_TIMESTAMP
  `);

  await conn.query(`
    INSERT INTO perm_subelemento_acciones
      (id_subelemento, id_accion, codigo_permiso, activo)
    SELECT
      ps.id_subelemento,
      pa.id_accion,
      CONCAT(pm.codigo, '.ACCESO_VISUAL'),
      1
    FROM perm_modulos pm
    INNER JOIN perm_elementos pe
      ON pe.id_modulo = pm.id_modulo
     AND pe.codigo = CONCAT(pm.codigo, '_ELEMENTO')
    INNER JOIN perm_subelementos ps
      ON ps.id_elemento = pe.id_elemento
     AND ps.codigo = CONCAT(pm.codigo, '_SUBELEMENTO')
    INNER JOIN perm_acciones pa ON pa.codigo = 'ACCESO_VISUAL'
    WHERE pm.activo = 1
      AND pm.codigo LIKE '__AGRUPACION_VISUAL_%'
    ON DUPLICATE KEY UPDATE
      activo = 1,
      updated_at = CURRENT_TIMESTAMP
  `);
}

async function getBootstrap(req, res, next) {
  try {
    if (denyUnlessManager(req, res)) return;
    await ensureVisualCatalogPermissions(db);
    const scope = actorScope(req);
    const roleFilter = companySql('r.empresa', scope);
    const userFilter = userCompanySql('u.empresa', scope);
    const catalogFilter = companySql('pa.empresa', scope);

    const [rolesRows, usersRows, catalogRows, totalsRows] = await Promise.all([
      db.query(`
        SELECT r.id_rol, r.rol, r.codigo, r.descripcion, r.nivel, r.es_sistema,
               r.empresa, r.estado,
               SUM(CASE WHEN rp.permitido = 1 THEN 1 ELSE 0 END) AS permisos_permitidos,
               COUNT(rp.id_rol_permiso) AS permisos_configurados
        FROM roles r
        LEFT JOIN rol_permisos rp ON rp.id_rol = r.id_rol
        WHERE ${roleFilter.clause}
        GROUP BY r.id_rol, r.rol, r.codigo, r.descripcion, r.nivel, r.es_sistema, r.empresa, r.estado
        ORDER BY r.rol
      `, roleFilter.params),
      db.query(`
        SELECT u.id_SB, u.nombre, u.iniciales, u.correo, u.puesto, u.area, u.empresa, u.estado,
               COALESCE(SUM(CASE WHEN up.activo = 1
                  AND (up.fecha_inicio IS NULL OR up.fecha_inicio <= NOW())
                  AND (up.fecha_fin IS NULL OR up.fecha_fin >= NOW()) THEN 1 ELSE 0 END), 0) AS personalizaciones,
               GROUP_CONCAT(DISTINCT CONCAT(r.id_rol, '|', r.rol, '|', COALESCE(r.codigo,''), '|', ur.principal, '|', COALESCE(r.nivel,0))
                            ORDER BY ur.principal DESC, r.nivel DESC, r.rol SEPARATOR ';;') AS roles_compactos
        FROM usuarios u
        LEFT JOIN usuario_roles ur ON ur.id_usuario = u.id_SB AND ur.activo = 1
        LEFT JOIN roles r ON r.id_rol = ur.id_rol AND r.estado = 1 AND ${roleFilter.clause}
        LEFT JOIN usuario_permisos up ON up.id_usuario = u.id_SB
        WHERE ${userFilter.clause}
        GROUP BY u.id_SB, u.nombre, u.iniciales, u.correo, u.puesto, u.area, u.empresa, u.estado
        ORDER BY u.estado DESC, u.nombre
      `, [...roleFilter.params, ...userFilter.params]),
      db.query(`
        SELECT psa.id_subelemento_accion,
               pa.id_agrupacion, pa.codigo AS agrupacion_codigo, pa.nombre AS agrupacion_nombre,
               pa.empresa AS agrupacion_empresa, pa.orden AS agrupacion_orden, pa.activo AS agrupacion_activo,
               pm.id_modulo, pm.codigo AS modulo_codigo, pm.nombre AS modulo_nombre, pm.orden AS modulo_orden, pm.activo AS modulo_activo,
               CASE WHEN pm.codigo LIKE '__AGRUPACION_VISUAL_%' THEN 1 ELSE 0 END AS modulo_interno_visual,
               pe.id_elemento, pe.codigo AS elemento_codigo, pe.nombre AS elemento_nombre,
               pe.tipo AS elemento_tipo, pe.orden AS elemento_orden,
               ps.id_subelemento, ps.codigo AS subelemento_codigo, ps.nombre AS subelemento_nombre,
               ps.orden AS subelemento_orden,
               pac.id_accion, pac.codigo AS accion_codigo, pac.nombre AS accion_nombre,
               pac.descripcion AS accion_descripcion, pac.requiere_auditoria
        FROM perm_agrupaciones pa
        LEFT JOIN perm_modulos pm ON pm.id_agrupacion = pa.id_agrupacion
        LEFT JOIN perm_elementos pe ON pe.id_modulo = pm.id_modulo AND pe.activo = 1
        LEFT JOIN perm_subelementos ps ON ps.id_elemento = pe.id_elemento AND ps.activo = 1
        LEFT JOIN perm_subelemento_acciones psa ON psa.id_subelemento = ps.id_subelemento AND psa.activo = 1
        LEFT JOIN perm_acciones pac ON pac.id_accion = psa.id_accion AND pac.activo = 1
        WHERE ${catalogFilter.clause}
        ORDER BY pa.orden, pm.orden, pe.orden, ps.orden, pac.nombre
      `, catalogFilter.params),
      db.query(`
        SELECT
          (SELECT COUNT(*) FROM roles r WHERE r.estado = 1 AND ${roleFilter.clause}) AS roles_activos,
          (SELECT COUNT(*) FROM usuarios u WHERE u.estado = 1 AND ${userFilter.clause}) AS usuarios_activos,
          (SELECT COUNT(*) FROM perm_subelemento_acciones psa
             INNER JOIN perm_subelementos ps ON ps.id_subelemento = psa.id_subelemento
             INNER JOIN perm_elementos pe ON pe.id_elemento = ps.id_elemento
             INNER JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
             INNER JOIN perm_agrupaciones pa ON pa.id_agrupacion = pm.id_agrupacion
             WHERE psa.activo = 1 AND ${catalogFilter.clause}) AS permisos_disponibles,
          (SELECT COUNT(*) FROM usuario_permisos up
             INNER JOIN usuarios u ON u.id_SB = up.id_usuario
             WHERE up.activo = 1 AND ${userFilter.clause}
             AND (up.fecha_inicio IS NULL OR up.fecha_inicio <= NOW())
             AND (up.fecha_fin IS NULL OR up.fecha_fin >= NOW())) AS personalizaciones_activas
      `, [...roleFilter.params, ...userFilter.params, ...catalogFilter.params, ...userFilter.params])
    ]);

    const users = usersRows[0].map((row) => ({
      ...row,
      personalizaciones: Number(row.personalizaciones || 0),
      roles: row.roles_compactos
        ? row.roles_compactos.split(';;').map((item) => {
            const [id_rol, rol, codigo, principal, nivel] = item.split('|');
            return { id_rol: Number(id_rol), rol, codigo, principal: Number(principal) === 1, nivel: Number(nivel || 0) };
          })
        : []
    }));

    res.json({
      ok: true,
      data: {
        roles: rolesRows[0].map((row) => ({
          ...row,
          permisos_permitidos: Number(row.permisos_permitidos || 0),
          permisos_configurados: Number(row.permisos_configurados || 0)
        })),
        usuarios: users,
        catalogo: catalogRows[0],
        totales: totalsRows[0][0],
        alcance: scope
      }
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ ok: false, message: error.message });
    next(error);
  }
}


async function getSessionPermissions(req, res, next) {
  try {
    await ensureVisualCatalogPermissions(db);
    const contextUser = req.contextUser || req.user;
    const userId = Number(contextUser?.id_SB);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ ok: false, message: 'Sesión sin usuario válido.' });
    }

    const [catalogRows, permissionRows] = await Promise.all([
      db.query(`
        SELECT psa.id_subelemento_accion,
               pa.id_agrupacion, pa.codigo AS agrupacion_codigo, pa.nombre AS agrupacion_nombre,
               pa.empresa AS agrupacion_empresa, pa.orden AS agrupacion_orden, pa.activo AS agrupacion_activo,
               pm.id_modulo, pm.codigo AS modulo_codigo, pm.nombre AS modulo_nombre, pm.orden AS modulo_orden, pm.activo AS modulo_activo,
               CASE WHEN pm.codigo LIKE '__AGRUPACION_VISUAL_%' THEN 1 ELSE 0 END AS modulo_interno_visual,
               pe.id_elemento, pe.codigo AS elemento_codigo, pe.nombre AS elemento_nombre,
               pe.tipo AS elemento_tipo, pe.orden AS elemento_orden,
               ps.id_subelemento, ps.codigo AS subelemento_codigo, ps.nombre AS subelemento_nombre,
               ps.orden AS subelemento_orden,
               pac.id_accion, pac.codigo AS accion_codigo, pac.nombre AS accion_nombre,
               pac.descripcion AS accion_descripcion, pac.requiere_auditoria
        FROM perm_agrupaciones pa
        LEFT JOIN perm_modulos pm ON pm.id_agrupacion = pa.id_agrupacion
        LEFT JOIN perm_elementos pe ON pe.id_modulo = pm.id_modulo AND pe.activo = 1
        LEFT JOIN perm_subelementos ps ON ps.id_elemento = pe.id_elemento AND ps.activo = 1
        LEFT JOIN perm_subelemento_acciones psa ON psa.id_subelemento = ps.id_subelemento AND psa.activo = 1
        LEFT JOIN perm_acciones pac ON pac.id_accion = psa.id_accion AND pac.activo = 1
        WHERE pa.activo = 1
        ORDER BY pa.orden, pm.orden, pe.orden, ps.orden, pac.nombre
      `),
      db.query(`
        SELECT psa.id_subelemento_accion,
               COALESCE(MAX(CASE WHEN rp.permitido = 1 THEN 1 ELSE 0 END), 0) AS heredado,
               MAX(CASE WHEN up.id_usuario_permiso IS NOT NULL THEN up.permitido ELSE NULL END) AS personalizado
        FROM perm_subelemento_acciones psa
        LEFT JOIN usuario_roles ur
          ON ur.id_usuario = ? AND ur.activo = 1
        LEFT JOIN roles r
          ON r.id_rol = ur.id_rol AND r.estado = 1
        LEFT JOIN rol_permisos rp
          ON rp.id_rol = r.id_rol
         AND rp.id_subelemento_accion = psa.id_subelemento_accion
        LEFT JOIN usuario_permisos up
          ON up.id_usuario = ?
         AND up.id_subelemento_accion = psa.id_subelemento_accion
         AND up.activo = 1
         AND (up.fecha_inicio IS NULL OR up.fecha_inicio <= NOW())
         AND (up.fecha_fin IS NULL OR up.fecha_fin >= NOW())
        WHERE psa.activo = 1
        GROUP BY psa.id_subelemento_accion
        ORDER BY psa.id_subelemento_accion
      `, [userId, userId])
    ]);

    const permisos = permissionRows[0].map((row) => {
      const personalizado = row.personalizado === null ? null : Number(row.personalizado) === 1;
      const heredado = Number(row.heredado) === 1;
      return {
        id_subelemento_accion: row.id_subelemento_accion,
        efectivo: personalizado === null ? heredado : personalizado
      };
    });

    return res.json({
      ok: true,
      data: {
        usuario_id: userId,
        catalogo: catalogRows[0],
        permisos
      }
    });
  } catch (error) {
    next(error);
  }
}

async function getRolePermissions(req, res, next) {
  try {
    if (denyUnlessManager(req, res)) return;
    await ensureVisualCatalogPermissions(db);
    const roleId = Number(req.params.id);
    if (!Number.isInteger(roleId) || roleId <= 0) return res.status(400).json({ ok: false, message: 'Rol inválido.' });
    await assertRoleInScope(db, roleId, actorScope(req));

    const [permissionRows, groupRows, moduleRows] = await Promise.all([
      db.query(`
        SELECT psa.id_subelemento_accion, COALESCE(rp.permitido, 0) AS permitido
        FROM perm_subelemento_acciones psa
        LEFT JOIN rol_permisos rp
          ON rp.id_subelemento_accion = psa.id_subelemento_accion
         AND rp.id_rol = ?
        WHERE psa.activo = 1
        ORDER BY psa.id_subelemento_accion
      `, [roleId]),
      db.query(`SELECT id_agrupacion, activo AS permitido FROM perm_agrupaciones ORDER BY orden, id_agrupacion`),
      db.query(`SELECT id_modulo, activo AS permitido FROM perm_modulos ORDER BY orden, id_modulo`)
    ]);

    res.json({
      ok: true,
      data: {
        permisos: permissionRows[0].map((r) => ({ id_subelemento_accion: r.id_subelemento_accion, permitido: Number(r.permitido) === 1 })),
        jerarquia: {
          agrupaciones: groupRows[0].map((r) => ({ id_agrupacion: r.id_agrupacion, permitido: Number(r.permitido) === 1 })),
          modulos: moduleRows[0].map((r) => ({ id_modulo: r.id_modulo, permitido: Number(r.permitido) === 1 }))
        }
      }
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ ok: false, message: error.message });
    next(error);
  }
}

async function saveRolePermissions(req, res, next) {
  const conn = await db.getConnection();
  try {
    if (denyUnlessManager(req, res)) return;
    const roleId = Number(req.params.id);
    const changes = Array.isArray(req.body?.changes) ? req.body.changes : [];
    const hierarchyChanges = Array.isArray(req.body?.hierarchy_changes) ? req.body.hierarchy_changes : [];
    if (!Number.isInteger(roleId) || roleId <= 0) return res.status(400).json({ ok: false, message: 'Rol inválido.' });
    await assertRoleInScope(conn, roleId, actorScope(req));
    if (hierarchyChanges.length) {
      return res.status(400).json({ ok: false, message: 'Los contenedores visuales deben guardarse mediante permisos reales del catálogo. Actualiza el frontend al FIX V022.' });
    }
    if (!changes.length) return res.json({ ok: true, data: { updated: 0 } });

    await conn.beginTransaction();
    for (const change of changes) {
      const permissionId = Number(change.id_subelemento_accion);
      if (!Number.isInteger(permissionId) || permissionId <= 0) throw new Error('Se recibió un permiso inválido.');
      await assertPermissionInScope(conn, permissionId, actorScope(req));
      await conn.query(`
        INSERT INTO rol_permisos
          (id_rol, id_subelemento_accion, permitido, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          permitido = VALUES(permitido),
          updated_by = VALUES(updated_by),
          updated_at = CURRENT_TIMESTAMP
      `, [roleId, permissionId, change.permitido ? 1 : 0, req.user.id_SB, req.user.id_SB]);
    }
    await conn.commit();
    res.json({ ok: true, data: { updated: changes.length } });
  } catch (error) {
    await conn.rollback();
    if (error.status) return res.status(error.status).json({ ok: false, message: error.message });
    next(error);
  } finally {
    conn.release();
  }
}

async function getUserPermissions(req, res, next) {
  try {
    if (denyUnlessManager(req, res)) return;
    await ensureVisualCatalogPermissions(db);
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ ok: false, message: 'Usuario inválido.' });
    const scope = actorScope(req);
    await assertUserInScope(db, userId, scope);
    const roleFilter = companySql('r.empresa', scope);

    const [roles, permissions, groupPermissions, modulePermissions] = await Promise.all([
      db.query(`
        SELECT r.id_rol, r.rol, r.codigo, ur.principal
        FROM usuario_roles ur
        INNER JOIN roles r ON r.id_rol = ur.id_rol
        WHERE ur.id_usuario = ? AND ur.activo = 1 AND r.estado = 1 AND ${roleFilter.clause}
        ORDER BY ur.principal DESC, r.rol
      `, [userId, ...roleFilter.params]),
      db.query(`
        SELECT psa.id_subelemento_accion,
               COALESCE(MAX(CASE WHEN rp.permitido = 1 THEN 1 ELSE 0 END), 0) AS heredado,
               MAX(CASE WHEN up.id_usuario_permiso IS NOT NULL THEN up.permitido ELSE NULL END) AS personalizado,
               MAX(CASE WHEN up.id_usuario_permiso IS NOT NULL THEN up.motivo ELSE NULL END) AS motivo,
               MAX(CASE WHEN up.id_usuario_permiso IS NOT NULL THEN up.fecha_inicio ELSE NULL END) AS fecha_inicio,
               MAX(CASE WHEN up.id_usuario_permiso IS NOT NULL THEN up.fecha_fin ELSE NULL END) AS fecha_fin
        FROM perm_subelemento_acciones psa
        LEFT JOIN usuario_roles ur
          ON ur.id_usuario = ? AND ur.activo = 1
        LEFT JOIN rol_permisos rp
          ON rp.id_rol = ur.id_rol
         AND rp.id_subelemento_accion = psa.id_subelemento_accion
        LEFT JOIN usuario_permisos up
          ON up.id_usuario = ?
         AND up.id_subelemento_accion = psa.id_subelemento_accion
         AND up.activo = 1
         AND (up.fecha_inicio IS NULL OR up.fecha_inicio <= NOW())
         AND (up.fecha_fin IS NULL OR up.fecha_fin >= NOW())
        WHERE psa.activo = 1
        GROUP BY psa.id_subelemento_accion
        ORDER BY psa.id_subelemento_accion
      `, [userId, userId]),
      db.query(`SELECT id_agrupacion, activo FROM perm_agrupaciones ORDER BY orden, id_agrupacion`),
      db.query(`SELECT id_modulo, activo FROM perm_modulos ORDER BY orden, id_modulo`)
    ]);

    res.json({
      ok: true,
      data: {
        roles: roles[0].map((r) => ({ ...r, principal: Number(r.principal) === 1 })),
        permisos: permissions[0].map((r) => {
          const personalizado = r.personalizado === null ? null : Number(r.personalizado) === 1;
          const heredado = Number(r.heredado) === 1;
          return {
            id_subelemento_accion: r.id_subelemento_accion,
            heredado,
            personalizado,
            efectivo: personalizado === null ? heredado : personalizado,
            motivo: r.motivo,
            fecha_inicio: r.fecha_inicio,
            fecha_fin: r.fecha_fin
          };
        }),
        jerarquia: {
          agrupaciones: groupPermissions[0].map((r) => {
            const activo = Number(r.activo) === 1;
            return { id_agrupacion: r.id_agrupacion, heredado: activo, personalizado: null, efectivo: activo };
          }),
          modulos: modulePermissions[0].map((r) => {
            const activo = Number(r.activo) === 1;
            return { id_modulo: r.id_modulo, heredado: activo, personalizado: null, efectivo: activo };
          })
        }
      }
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ ok: false, message: error.message });
    next(error);
  }
}

async function saveUserPermissions(req, res, next) {
  const conn = await db.getConnection();
  try {
    if (denyUnlessManager(req, res)) return;
    const userId = Number(req.params.id);
    const changes = Array.isArray(req.body?.changes) ? req.body.changes : [];
    const hierarchyChanges = Array.isArray(req.body?.hierarchy_changes) ? req.body.hierarchy_changes : [];
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ ok: false, message: 'Usuario inválido.' });
    await assertUserInScope(conn, userId, actorScope(req));
    if (hierarchyChanges.length) {
      return res.status(400).json({ ok: false, message: 'Los contenedores visuales deben guardarse mediante permisos reales del catálogo. Actualiza el frontend al FIX V022.' });
    }
    if (!changes.length) return res.json({ ok: true, data: { updated: 0 } });

    await conn.beginTransaction();
    for (const change of changes) {
      const permissionId = Number(change.id_subelemento_accion);
      const mode = String(change.mode || '').toLowerCase();
      if (!Number.isInteger(permissionId) || permissionId <= 0) throw new Error('Se recibió un permiso inválido.');
      await assertPermissionInScope(conn, permissionId, actorScope(req));
      if (!['inherit', 'allow', 'deny'].includes(mode)) throw new Error('Se recibió un modo de permiso inválido.');

      if (mode === 'inherit') {
        await conn.query(
          'DELETE FROM usuario_permisos WHERE id_usuario = ? AND id_subelemento_accion = ?',
          [userId, permissionId]
        );
      } else {
        await conn.query(`
          INSERT INTO usuario_permisos
            (id_usuario, id_subelemento_accion, permitido, motivo, fecha_inicio, fecha_fin, activo, created_by, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
          ON DUPLICATE KEY UPDATE
            permitido = VALUES(permitido), motivo = VALUES(motivo),
            fecha_inicio = VALUES(fecha_inicio), fecha_fin = VALUES(fecha_fin),
            activo = 1, updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP
        `, [
          userId,
          permissionId,
          mode === 'allow' ? 1 : 0,
          change.motivo ? String(change.motivo).trim().slice(0, 255) : null,
          change.fecha_inicio || null,
          change.fecha_fin || null,
          req.user.id_SB,
          req.user.id_SB
        ]);
      }
    }
    await conn.commit();
    res.json({ ok: true, data: { updated: changes.length } });
  } catch (error) {
    await conn.rollback();
    if (error.status) return res.status(error.status).json({ ok: false, message: error.message });
    next(error);
  } finally {
    conn.release();
  }
}

async function saveUserRoles(req, res, next) {
  const conn = await db.getConnection();
  try {
    if (denyUnlessManager(req, res)) return;
    const userId = Number(req.params.id);
    const roleIds = [...new Set((Array.isArray(req.body?.role_ids) ? req.body.role_ids : []).map(Number))];
    const principalRoleId = Number(req.body?.principal_role_id);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ ok: false, message: 'Usuario inválido.' });
    if (!roleIds.length || roleIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      return res.status(400).json({ ok: false, message: 'Debes asignar al menos un rol válido.' });
    }
    if (!roleIds.includes(principalRoleId)) {
      return res.status(400).json({ ok: false, message: 'El rol principal debe formar parte de los roles activos.' });
    }

    const scope = actorScope(req);
    await assertUserInScope(conn, userId, scope);
    const roleFilter = companySql('empresa', scope);
    const [validRoles] = await conn.query(
      `SELECT id_rol, rol FROM roles WHERE estado = 1 AND id_rol IN (?) AND ${roleFilter.clause}`,
      [roleIds, ...roleFilter.params]
    );
    if (validRoles.length !== roleIds.length) {
      return res.status(403).json({ ok: false, message: 'Uno o más roles están fuera de tu alcance de administración.' });
    }

    const normalizedNames = new Set(validRoles.map((role) => String(role.rol || '').trim().toLowerCase()));
    const hasMasterProgrammer = normalizedNames.has('programador');
    const hasScopedProgrammer = normalizedNames.has('programador united') || normalizedNames.has('programador corellian');
    if (hasMasterProgrammer && hasScopedProgrammer) {
      return res.status(400).json({
        ok: false,
        message: 'Programador es incompatible con Programador United y Programador Corellian.'
      });
    }

    await conn.beginTransaction();
    const [managedRoles] = await conn.query(`SELECT id_rol FROM roles WHERE ${roleFilter.clause}`, roleFilter.params);
    const managedIds = managedRoles.map((row) => Number(row.id_rol));
    if (managedIds.length) {
      await conn.query('DELETE FROM usuario_roles WHERE id_usuario = ? AND id_rol IN (?)', [userId, managedIds]);
    }
    await conn.query('UPDATE usuario_roles SET principal = 0 WHERE id_usuario = ?', [userId]);
    for (const roleId of roleIds) {
      await conn.query(
        `INSERT INTO usuario_roles (id_usuario, id_rol, principal, activo)
         VALUES (?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE principal = VALUES(principal), activo = 1, updated_at = CURRENT_TIMESTAMP`,
        [userId, roleId, roleId === principalRoleId ? 1 : 0]
      );
    }
    await conn.query('UPDATE usuarios SET rol_id = ?, updated_by = ? WHERE id_SB = ?', [principalRoleId, req.user.correo || req.user.id_SB, userId]);
    await conn.commit();
    res.json({ ok: true, data: { updated: roleIds.length } });
  } catch (error) {
    await conn.rollback();
    if (error.status) return res.status(error.status).json({ ok: false, message: error.message });
    next(error);
  } finally {
    conn.release();
  }
}

module.exports = {
  getBootstrap,
  getSessionPermissions,
  getRolePermissions,
  saveRolePermissions,
  getUserPermissions,
  saveUserPermissions,
  saveUserRoles
};
