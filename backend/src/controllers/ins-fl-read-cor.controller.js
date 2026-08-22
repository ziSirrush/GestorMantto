'use strict';

// [Aster | 2026-08-18 | ASTER-MG | FIX: INSTALACIONES_ALCANCE_USUARIO_V001]
// Lecturas con alcance efectivo para Instalaciones/Corellian.
// No altera la sincronizacion ni las mutaciones existentes de ins_fl.

const db = require('../config/db');
const azureStorage = require('../services/storage/azure-storage.service');
const visibilityService = require('../modules/ventas/ventas-visibility.service');

const PROJECT_PHOTO_ALIASES = Object.freeze([
  ['foto_blt_1', 'FOTO BLT'],
  ['foto_blt_2', 'FOTO BLT 2'],
  ['foto_blt_3', 'FOTO BLT 3'],
  ['foto_blt_4', 'FOTO BLT 4'],
  ['foto_blt_5', 'FOTO BLT 5'],
  ['foto_blt_6', 'FOTO BLT 6'],
  ['foto_blt_7', 'FOTO BLT 7']
]);

function normalizeActive(value) {
  if (value === undefined || value === null || value === '') return 1;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value ? 1 : 0;

  const text = String(value).trim().toUpperCase();
  if (['0', 'NO', 'FALSE', 'INACTIVO'].includes(text)) return 0;
  if (['1', 'SI', 'SÍ', 'TRUE', 'ACTIVO'].includes(text)) return 1;
  return 1;
}

function statusFromError(error) {
  const status = Number(error && (error.statusCode || error.status));
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
}

async function resolveScope_cor(req) {
  // Compatibilidad con los consumidores históricos de Ventas, pero la fuente
  // primaria ya es usuarios_alcance_informacion. El modo Visor utiliza
  // contextUser antes que el actor real.
  return visibilityService.resolveVisibilityScope(db, req);
}

function appendInformationScope_cor(where, params, scope, alias = 'f') {
  if (scope && scope.mode === 'ALL') return;

  const ids = [...new Set(
    (scope && Array.isArray(scope.advisorIds) ? scope.advisorIds : [])
      .map(Number)
      .filter(id => Number.isInteger(id) && id > 0)
  )];

  if (!ids.length) {
    where.push('1 = 0');
    return;
  }

  const placeholders = ids.map(() => '?').join(', ');
  where.push(`(
    ${alias}.id_asesor IN (${placeholders})
    OR ${alias}.id_sup IN (${placeholders})
    OR ${alias}.id_admin IN (${placeholders})
  )`);
  params.push(...ids, ...ids, ...ids);
}

function azureBlobNameFromStableUrl(value) {
  const raw = String(value || '').trim();
  if (!/^https:\/\//i.test(raw) || !/\.blob\.core\.windows\.net\//i.test(raw)) return null;

  try {
    const parsed = new URL(raw);
    const container = String(process.env.AZURE_STORAGE_BLOB_CONTAINER_NAME || '').trim();
    if (!container) return null;

    const prefix = '/' + container + '/';
    const decodedPath = decodeURIComponent(parsed.pathname || '');
    if (!decodedPath.startsWith(prefix)) return null;
    return decodedPath.slice(prefix.length);
  } catch (_error) {
    return null;
  }
}

async function presentProjectPhotoUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const blobName = azureBlobNameFromStableUrl(raw);
  if (!blobName) return raw;

  try {
    const access = await azureStorage.createReadSas_gnral(blobName);
    return access.url;
  } catch (_error) {
    // Se conserva el comportamiento vigente: una falla temporal al emitir SAS
    // no debe romper toda la lectura del proyecto.
    return raw;
  }
}

async function presentProjectPhotoRow(row) {
  const copy = { ...row };

  for (const [field, alias] of PROJECT_PHOTO_ALIASES) {
    if (Object.prototype.hasOwnProperty.call(copy, field)) {
      copy[field] = await presentProjectPhotoUrl(copy[field]);
    }
    if (Object.prototype.hasOwnProperty.call(copy, alias)) {
      copy[alias] = await presentProjectPhotoUrl(copy[alias]);
    }
  }

  const selected = String(copy.foto_principal || '').trim();
  const selectedAlias = PROJECT_PHOTO_ALIASES.find(([field]) => field === selected);
  const selectedUrl = selectedAlias
    ? (copy[selectedAlias[1]] || copy[selectedAlias[0]] || null)
    : null;

  copy.foto_portada = selectedUrl ||
    copy['FOTO BLT'] || copy.foto_blt_1 ||
    copy['FOTO BLT 2'] || copy.foto_blt_2 ||
    copy['FOTO BLT 3'] || copy.foto_blt_3 ||
    copy['FOTO BLT 4'] || copy.foto_blt_4 ||
    copy['FOTO BLT 5'] || copy.foto_blt_5 ||
    copy['FOTO BLT 6'] || copy.foto_blt_6 ||
    copy['FOTO BLT 7'] || copy.foto_blt_7 || null;

  return copy;
}

async function getInsFl_cor(req, res) {
  try {
    const scope = await resolveScope_cor(req);
    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 5000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const params = [];
    const where = [];

    appendInformationScope_cor(where, params, scope, 'f');

    if (req.query.id_proyecto) {
      where.push('f.id_proyecto = ?');
      params.push(String(req.query.id_proyecto));
    }

    if (req.query.proyecto) {
      where.push('f.proyecto LIKE ?');
      params.push(`%${String(req.query.proyecto)}%`);
    }

    if (req.query.referencia_sitio) {
      where.push('f.referencia_sitio LIKE ?');
      params.push(`%${String(req.query.referencia_sitio)}%`);
    }

    if (req.query.estatus) {
      where.push('f.estatus = ?');
      params.push(String(req.query.estatus));
    }

    if (req.query.id_sup) {
      where.push('f.id_sup = ?');
      params.push(Number(req.query.id_sup));
    }

    if (req.query.id_asesor) {
      where.push('f.id_asesor = ?');
      params.push(Number(req.query.id_asesor));
    }

    if (req.query.id_admin) {
      where.push('f.id_admin = ?');
      params.push(Number(req.query.id_admin));
    }

    if (req.query.activo !== undefined && req.query.activo !== '') {
      where.push('f.activo = ?');
      params.push(normalizeActive(req.query.activo));
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await db.query(
      `SELECT
         f.*,
         COALESCE(
           (
             SELECT GROUP_CONCAT(DISTINCT u_admin.iniciales ORDER BY u_admin.iniciales SEPARATOR ', ')
             FROM usuarios_rel_admin ura
             INNER JOIN usuarios u_admin ON u_admin.id_SB = ura.id_admin
             WHERE ura.id_asesor = f.id_asesor
           ),
           (
             SELECT u_directo.iniciales
             FROM usuarios u_directo
             WHERE u_directo.id_SB = f.id_admin
             LIMIT 1
           )
         ) AS rel_admin
       FROM ins_fl f
       ${whereSql}
       ORDER BY f.id_ins_fl ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    rows.forEach(row => {
      const campo = row.foto_principal;
      row.foto_portada =
        (campo && row[campo]) ? row[campo] :
        (row['FOTO BLT'] || row['FOTO BLT 2'] || row['FOTO BLT 3'] ||
         row['FOTO BLT 4'] || row['FOTO BLT 5'] || row['FOTO BLT 6'] ||
         row['FOTO BLT 7'] || null);
    });

    return res.json({
      ok: true,
      source: 'aiven',
      data: rows,
      limit,
      offset
    });
  } catch (error) {
    return res.status(statusFromError(error)).json({
      ok: false,
      message: error.message || 'Error consultando ins_fl.'
    });
  }
}

async function getInsFlById_cor(req, res) {
  try {
    const scope = await resolveScope_cor(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, message: 'ID inválido.' });
    }

    const params = [id];
    const where = ['f.id_ins_fl = ?'];
    appendInformationScope_cor(where, params, scope, 'f');

    const [rows] = await db.query(
      `SELECT f.*
       FROM ins_fl f
       WHERE ${where.join(' AND ')}
       LIMIT 1`,
      params
    );

    if (!rows.length) {
      // Se responde 404 tanto si no existe como si queda fuera del alcance para
      // no revelar la existencia de registros no autorizados.
      return res.status(404).json({
        ok: false,
        message: 'Registro de instalación no encontrado.'
      });
    }

    return res.json({ ok: true, source: 'aiven', data: rows[0] });
  } catch (error) {
    return res.status(statusFromError(error)).json({
      ok: false,
      message: error.message || 'Error consultando el registro de instalación.'
    });
  }
}

async function getInsFlProjects_cor(req, res) {
  try {
    const scope = await resolveScope_cor(req);
    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 5000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const params = [];
    const where = [];

    appendInformationScope_cor(where, params, scope, 'f');

    if (req.query.proyecto) {
      where.push('f.proyecto LIKE ?');
      params.push(`%${String(req.query.proyecto)}%`);
    }

    if (req.query.id_sup) {
      where.push('f.id_sup = ?');
      params.push(Number(req.query.id_sup));
    }

    if (req.query.id_asesor) {
      where.push('f.id_asesor = ?');
      params.push(Number(req.query.id_asesor));
    }

    if (req.query.id_admin) {
      where.push(`EXISTS (
        SELECT 1
        FROM usuarios_rel_admin ura_filter
        WHERE ura_filter.id_asesor = f.id_asesor
          AND ura_filter.id_admin = ?
      )`);
      params.push(Number(req.query.id_admin));
    }

    if (req.query.activo !== undefined && req.query.activo !== '') {
      where.push('f.activo = ?');
      params.push(normalizeActive(req.query.activo));
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await db.query(
      `SELECT
         f.id_proyecto,
         MAX(f.proyecto) AS proyecto,
         MAX(f.cliente) AS cliente,
         MAX(f.vendedor) AS vendedor,
         MAX(f.estado) AS estado,
         MAX(f.ciudad) AS ciudad,
         MAX(f.id_sup) AS id_sup,
         MAX(f.id_asesor) AS id_asesor,
         MAX(admin_rel.id_admin) AS id_admin,
         MAX(u_sup.iniciales) AS supervisor_iniciales,
         MAX(u_asesor.iniciales) AS asesor_iniciales,
         MAX(admin_rel.admin_iniciales) AS admin_iniciales,
         COUNT(*) AS total_equipos,
         SUM(CASE WHEN f.activo = 1 THEN 1 ELSE 0 END) AS equipos_activos,
         SUM(CASE WHEN f.estatus = '08-T' THEN 1 ELSE 0 END) AS equipos_terminados,
         MAX(f.updated_at) AS ultima_actualizacion
       FROM ins_fl f
       LEFT JOIN usuarios u_sup ON u_sup.id_SB = f.id_sup
       LEFT JOIN usuarios u_asesor ON u_asesor.id_SB = f.id_asesor
       LEFT JOIN (
         SELECT
           ura.id_asesor,
           GROUP_CONCAT(DISTINCT ura.id_admin ORDER BY ura.id_admin SEPARATOR ',') AS id_admin,
           GROUP_CONCAT(DISTINCT u_admin.iniciales ORDER BY u_admin.iniciales SEPARATOR ', ') AS admin_iniciales
         FROM usuarios_rel_admin ura
         INNER JOIN usuarios u_admin ON u_admin.id_SB = ura.id_admin
         GROUP BY ura.id_asesor
       ) admin_rel ON admin_rel.id_asesor = f.id_asesor
       ${whereSql}
       GROUP BY f.id_proyecto
       ORDER BY proyecto ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    rows.forEach(row => {
      // El endpoint histórico no une la tabla de fotos. Se conserva la
      // propiedad para no cambiar el contrato de respuesta.
      row.foto_portada = null;
    });

    return res.json({
      ok: true,
      source: 'aiven',
      data: rows,
      limit,
      offset
    });
  } catch (error) {
    return res.status(statusFromError(error)).json({
      ok: false,
      message: error.message || 'Error consultando proyectos de instalaciones.'
    });
  }
}

async function getInsFlProjectPhotos_cor(req, res) {
  try {
    const scope = await resolveScope_cor(req);
    const limit = Math.min(Math.max(Number(req.query.limit) || 5000, 1), 5000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const params = [];
    const where = [];

    appendInformationScope_cor(where, params, scope, 'f');

    if (req.query.id_ppns) {
      where.push('p.id_ppns = ?');
      params.push(String(req.query.id_ppns).trim());
    }

    if (req.query.solo_con_fotos === '1' || req.query.solo_con_fotos === 'true') {
      where.push(`(
        NULLIF(TRIM(p.foto_blt_1), '') IS NOT NULL OR
        NULLIF(TRIM(p.foto_blt_2), '') IS NOT NULL OR
        NULLIF(TRIM(p.foto_blt_3), '') IS NOT NULL OR
        NULLIF(TRIM(p.foto_blt_4), '') IS NOT NULL OR
        NULLIF(TRIM(p.foto_blt_5), '') IS NOT NULL OR
        NULLIF(TRIM(p.foto_blt_6), '') IS NOT NULL OR
        NULLIF(TRIM(p.foto_blt_7), '') IS NOT NULL
      )`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await db.query(
      `SELECT
         p.id_photo,
         p.id_ppns AS \`ID Proyecto\`,
         MAX(f.proyecto) AS \`Proyecto\`,
         MAX(f.ciudad) AS \`Ciudad\`,
         MAX(f.estado) AS \`Estado\`,
         MAX(f.cliente) AS \`Cliente\`,
         MAX(f.vendedor) AS \`Asesor\`,
         MAX(f.supervisor_fl) AS \`Supervisor\`,
         p.carpeta AS \`Carpeta\`,
         p.foto_blt_1 AS \`FOTO BLT\`,
         p.foto_blt_2 AS \`FOTO BLT 2\`,
         p.foto_blt_3 AS \`FOTO BLT 3\`,
         p.foto_blt_4 AS \`FOTO BLT 4\`,
         p.foto_blt_5 AS \`FOTO BLT 5\`,
         p.foto_blt_6 AS \`FOTO BLT 6\`,
         p.foto_blt_7 AS \`FOTO BLT 7\`,
         p.foto_principal AS foto_principal,
         p.imagen_drive AS \`Imagen Drive\`,
         p.imagen_p_g AS \`Imagen P G\`
       FROM ins_proyecto_fotos p
       LEFT JOIN ins_fl f ON TRIM(f.id_proyecto) = TRIM(p.id_ppns)
       ${whereSql}
       GROUP BY
         p.id_photo, p.id_ppns, p.carpeta,
         p.foto_blt_1, p.foto_blt_2, p.foto_blt_3,
         p.foto_blt_4, p.foto_blt_5, p.foto_blt_6,
         p.foto_blt_7, p.foto_principal, p.imagen_drive, p.imagen_p_g
       ORDER BY Proyecto ASC, p.id_ppns ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const presentedRows = [];
    for (const row of rows) {
      presentedRows.push(await presentProjectPhotoRow(row));
    }

    return res.json({
      ok: true,
      source: 'aiven',
      data: presentedRows,
      limit,
      offset
    });
  } catch (error) {
    return res.status(statusFromError(error)).json({
      ok: false,
      message: error.message || 'Error consultando fotografias de proyectos.'
    });
  }
}

async function getInsFlClientConcentrate_cor(req, res) {
  try {
    const scope = await resolveScope_cor(req);
    const params = [];
    const scopeWhere = [];
    appendInformationScope_cor(scopeWhere, params, scope, 'f');

    const scopeSql = scopeWhere.length ? ` AND ${scopeWhere.join(' AND ')}` : '';
    const baseSelect = photoJoin => `SELECT
      f.id_proyecto,
      MAX(f.proyecto) AS proyecto,
      MAX(f.cliente) AS cliente,
      MAX(f.estado) AS estado,
      MAX(f.ciudad) AS ciudad,
      MAX(f.id_sup) AS id_sup,
      MAX(f.id_asesor) AS id_asesor,
      MAX(u_sup.iniciales) AS supervisor_iniciales,
      MAX(u_asesor.iniciales) AS asesor_iniciales,
      COUNT(*) AS total_equipos,
      SUM(CASE WHEN f.estatus = '08-T' THEN 1 ELSE 0 END) AS equipos_terminados,
      ${photoJoin ? `MAX(p.carpeta) AS carpeta,
      MAX(p.foto_blt_1) AS foto_blt_1,
      MAX(p.foto_blt_2) AS foto_blt_2,
      MAX(p.foto_blt_3) AS foto_blt_3,
      MAX(p.foto_blt_4) AS foto_blt_4,
      MAX(p.foto_blt_5) AS foto_blt_5,
      MAX(p.foto_blt_6) AS foto_blt_6,
      MAX(p.foto_blt_7) AS foto_blt_7,
      MAX(p.imagen_drive) AS imagen_drive,
      MAX(p.imagen_p_g) AS imagen_p_g` : `NULL AS carpeta,
      NULL AS foto_blt_1, NULL AS foto_blt_2, NULL AS foto_blt_3,
      NULL AS foto_blt_4, NULL AS foto_blt_5, NULL AS foto_blt_6,
      NULL AS foto_blt_7, NULL AS imagen_drive, NULL AS imagen_p_g`}
    FROM ins_fl f
    LEFT JOIN usuarios u_sup ON u_sup.id_SB = f.id_sup
    LEFT JOIN usuarios u_asesor ON u_asesor.id_SB = f.id_asesor
    ${photoJoin ? 'LEFT JOIN ins_proyecto_fotos p ON p.id_ppns = f.id_proyecto' : ''}
    WHERE f.cliente IS NOT NULL
      AND TRIM(f.cliente) <> ''
      ${scopeSql}
    GROUP BY f.id_proyecto
    ORDER BY cliente ASC, proyecto ASC`;

    let rows;
    try {
      [rows] = await db.query(baseSelect(true), params);
    } catch (error) {
      if (error && (error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146)) {
        [rows] = await db.query(baseSelect(false), params);
      } else {
        throw error;
      }
    }

    return res.json({ ok: true, source: 'aiven', data: rows });
  } catch (error) {
    return res.status(statusFromError(error)).json({
      ok: false,
      message: error.message || 'Error consultando el concentrado de clientes de Instalaciones.'
    });
  }
}

module.exports = {
  getInsFl_cor,
  getInsFlById_cor,
  getInsFlProjects_cor,
  getInsFlProjectPhotos_cor,
  getInsFlClientConcentrate_cor
};
