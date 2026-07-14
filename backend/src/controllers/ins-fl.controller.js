const db = require('../config/db');

const DB_FIELDS = [
  'proyecto',
  'id_proyecto',
  'referencia_sitio',
  'estatus',
  'fecha_visita',
  'comentarios_fl',
  'avance_oc',
  'avance_mo',
  'avance_aj',
  'numero_pisos',
  'numero_desembarques',
  'numero_puertas',
  'velocidad_ms',
  'capacidad_kg',
  'entrepiso_mm',
  'longitud_mm',
  'ancho_peldano_mm',
  'fecha_cpvp',
  'estatus_produccion',
  'fecha_descarga',
  'fecha_colocacion_esc_ramp',
  'fecha_ccnr',
  'fecha_ccr',
  'subcontratista',
  'fecha_inicio_montaje',
  'fecha_fin_montaje_planeado',
  'fecha_fin_montaje_modificado',
  'fecha_fin_montaje_real',
  'dias_restantes',
  'fecha_cti',
  'fecha_revision_supervisor',
  'fecha_minuta_revision_ajuste',
  'fecha_liberacion_ajuste',
  'ajustador',
  'fecha_inicio_ajuste',
  'fecha_fin_ajuste_planeado',
  'fecha_fin_ajuste_modificado',
  'fecha_fin_ajuste_real',
  'fecha_reporte_ajuste',
  'fecha_protocolo_aceptacion',
  'estatus_inspeccion_calidad',
  'pendientes_calidad',
  'fecha_entrega_cliente',
  'formato_caf_pg',
  'estatus_equipo_entrega',
  'anio_termino',
  'dias_sin_visita',
  'dias_sin_ccnr',
  'estado',
  'supervisor_fl',
  'ciudad',
  'fecha_posible_recepcion_cubo',
  'fecha_posible_inicio_ajuste',
  'condiciones_obra',
  'evaluacion_subcontrato',
  'minuta_interfon',
  'certificado_regulador',
  'vendedor',
  'cliente',
  'id_sup',
  'id_asesor',
  'id_admin',
  'activo'
];

const REQUIRED_FIELDS = ['proyecto', 'id_proyecto', 'referencia_sitio'];

const DATE_FIELDS = new Set([
  'fecha_visita',
  'fecha_cpvp',
  'fecha_descarga',
  'fecha_colocacion_esc_ramp',
  'fecha_ccnr',
  'fecha_ccr',
  'fecha_inicio_montaje',
  'fecha_fin_montaje_planeado',
  'fecha_fin_montaje_modificado',
  'fecha_fin_montaje_real',
  'fecha_cti',
  'fecha_revision_supervisor',
  'fecha_minuta_revision_ajuste',
  'fecha_liberacion_ajuste',
  'fecha_inicio_ajuste',
  'fecha_fin_ajuste_planeado',
  'fecha_fin_ajuste_modificado',
  'fecha_fin_ajuste_real',
  'fecha_reporte_ajuste',
  'fecha_protocolo_aceptacion',
  'fecha_entrega_cliente',
  'fecha_posible_recepcion_cubo',
  'fecha_posible_inicio_ajuste'
]);

const INTEGER_FIELDS = new Set([
  'numero_pisos',
  'numero_desembarques',
  'numero_puertas',
  'capacidad_kg',
  'entrepiso_mm',
  'longitud_mm',
  'ancho_peldano_mm',
  'dias_restantes',
  'anio_termino',
  'dias_sin_visita',
  'dias_sin_ccnr',
  'id_sup',
  'id_asesor',
  'id_admin',
  'activo'
]);

const DECIMAL_FIELDS = new Set([
  'avance_oc',
  'avance_mo',
  'avance_aj',
  'velocidad_ms'
]);

function cleanValue(value) {
  if (value === undefined || value === null || value === '') return null;

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text || text === '-' || text === '.' || text.toUpperCase() === 'N/A') {
      return null;
    }
    return text;
  }

  return value;
}

function normalizeDateOnly(value) {
  const cleaned = cleanValue(value);
  if (cleaned === null) return null;

  if (cleaned instanceof Date && !Number.isNaN(cleaned.getTime())) {
    return cleaned.toISOString().slice(0, 10);
  }

  const text = String(cleaned).trim();
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return text;
}

function normalizeNumber(value, { integer = false, percent = false } = {}) {
  const cleaned = cleanValue(value);
  if (cleaned === null) return null;

  if (typeof cleaned === 'number' && Number.isFinite(cleaned)) {
    const numeric = percent && Math.abs(cleaned) <= 1 ? cleaned * 100 : cleaned;
    return integer ? Math.trunc(numeric) : numeric;
  }

  const raw = String(cleaned).trim();
  const hasPercent = raw.includes('%');
  const normalized = raw
    .replace(/,/g, '')
    .replace(/%/g, '')
    .replace(/[^\d.-]/g, '');

  if (!normalized || normalized === '-' || normalized === '.') return null;

  let numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return null;

  if (percent && !hasPercent && Math.abs(numeric) <= 1) {
    numeric *= 100;
  }

  return integer ? Math.trunc(numeric) : numeric;
}

function normalizeActive(value) {
  const cleaned = cleanValue(value);
  if (cleaned === null) return 1;

  if (typeof cleaned === 'boolean') return cleaned ? 1 : 0;
  if (typeof cleaned === 'number') return cleaned ? 1 : 0;

  const text = String(cleaned).trim().toUpperCase();
  if (['0', 'NO', 'FALSE', 'INACTIVO'].includes(text)) return 0;
  if (['1', 'SI', 'SÍ', 'TRUE', 'ACTIVO'].includes(text)) return 1;

  return 1;
}

function normalizeIncomingRow(row) {
  const incoming = {};

  for (const field of DB_FIELDS) {
    if (field === 'activo') {
      incoming[field] = normalizeActive(row[field]);
      continue;
    }

    if (DATE_FIELDS.has(field)) {
      incoming[field] = normalizeDateOnly(row[field]);
      continue;
    }

    if (INTEGER_FIELDS.has(field)) {
      incoming[field] = normalizeNumber(row[field], { integer: true });
      continue;
    }

    if (DECIMAL_FIELDS.has(field)) {
      incoming[field] = normalizeNumber(row[field], {
        integer: false,
        percent: field.startsWith('avance_')
      });
      continue;
    }

    incoming[field] = cleanValue(row[field]);
  }

  return incoming;
}

function comparable(value) {
  if (value === undefined || value === null || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number') return String(value);

  return String(value).trim();
}

function rowChanged(existing, incoming) {
  return DB_FIELDS.some(
    field => comparable(existing[field]) !== comparable(incoming[field])
  );
}

async function syncInsFl(req, res) {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

  if (!rows.length) {
    return res.status(400).json({
      ok: false,
      message: 'No se recibieron filas para sincronizar ins_fl.'
    });
  }

  const conn = await db.getConnection();
  const summary = {
    received: rows.length,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    rejected: 0,
    errors: []
  };

  try {
    await conn.beginTransaction();

    for (let index = 0; index < rows.length; index += 1) {
      const incoming = normalizeIncomingRow(rows[index] || {});

      const missing = REQUIRED_FIELDS.filter(field => !incoming[field]);
      if (missing.length) {
        summary.rejected += 1;
        summary.errors.push({
          index,
          id_proyecto: incoming.id_proyecto,
          referencia_sitio: incoming.referencia_sitio,
          message: `Faltan campos obligatorios: ${missing.join(', ')}`
        });
        continue;
      }

      const [existingRows] = await conn.query(
        `SELECT id_ins_fl, ${DB_FIELDS.join(', ')}
         FROM ins_fl
         WHERE f.id_proyecto = ?
           AND referencia_sitio = ?
         LIMIT 1`,
        [incoming.id_proyecto, incoming.referencia_sitio]
      );

      if (!existingRows.length) {
        const placeholders = DB_FIELDS.map(() => '?').join(', ');
        const values = DB_FIELDS.map(field => incoming[field]);

        await conn.query(
          `INSERT INTO ins_fl (${DB_FIELDS.join(', ')})
           VALUES (${placeholders})`,
          values
        );

        summary.inserted += 1;
        continue;
      }

      if (!rowChanged(existingRows[0], incoming)) {
        summary.unchanged += 1;
        continue;
      }

      const assignments = DB_FIELDS.map(field => `${field} = ?`).join(', ');
      const values = [
        ...DB_FIELDS.map(field => incoming[field]),
        existingRows[0].id_ins_fl
      ];

      await conn.query(
        `UPDATE ins_fl
         SET ${assignments}
         WHERE id_ins_fl = ?`,
        values
      );

      summary.updated += 1;
    }

    await conn.commit();

    return res.json({
      ok: true,
      message: 'ins_fl sincronizada correctamente.',
      ...summary
    });
  } catch (error) {
    await conn.rollback();

    return res.status(500).json({
      ok: false,
      message: 'Error sincronizando ins_fl.',
      error: error.message,
      ...summary
    });
  } finally {
    conn.release();
  }
}

async function getInsFl(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 5000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const params = [];
    const where = [];

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
        (row['FOTO BLT'] || row['FOTO BLT 2'] || row['FOTO BLT 3'] || row['FOTO BLT 4'] || row['FOTO BLT 5'] || row['FOTO BLT 6'] || row['FOTO BLT 7'] || null);
    });

    return res.json({
      ok: true,
      source: 'aiven',
      data: rows,
      limit,
      offset
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando ins_fl.',
      error: error.message
    });
  }
}

async function getInsFlById(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        ok: false,
        message: 'ID inválido.'
      });
    }

    const [rows] = await db.query(
      'SELECT * FROM ins_fl WHERE id_ins_fl = ? LIMIT 1',
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: 'Registro de instalación no encontrado.'
      });
    }

    return res.json({
      ok: true,
      source: 'aiven',
      data: rows[0]
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando el registro de instalación.',
      error: error.message
    });
  }
}

async function getInsFlProjects(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 5000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const params = [];
    const where = [];

    if (req.query.proyecto) {
      where.push('f.f.proyecto LIKE ?');
      params.push(`%${String(req.query.proyecto)}%`);
    }

    if (req.query.id_sup) {
      where.push('f.f.id_sup = ?');
      params.push(Number(req.query.id_sup));
    }

    if (req.query.id_asesor) {
      where.push('f.f.id_asesor = ?');
      params.push(Number(req.query.id_asesor));
    }

    if (req.query.id_admin) {
      where.push(`EXISTS (
        SELECT 1
        FROM usuarios_rel_admin ura_filter
        WHERE ura_filter.id_asesor = f.id_asesor
          AND ura_filter.f.id_admin = ?
      )`);
      params.push(Number(req.query.id_admin));
    }

    if (req.query.activo !== undefined && req.query.activo !== '') {
      where.push('f.f.activo = ?');
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
           GROUP_CONCAT(
             DISTINCT ura.id_admin
             ORDER BY ura.id_admin
             SEPARATOR ','
           ) AS id_admin,
           GROUP_CONCAT(
             DISTINCT u_admin.iniciales
             ORDER BY u_admin.iniciales
             SEPARATOR ', '
           ) AS admin_iniciales
         FROM usuarios_rel_admin ura
         INNER JOIN usuarios u_admin
           ON u_admin.id_SB = ura.id_admin
         GROUP BY ura.id_asesor
       ) admin_rel ON admin_rel.id_asesor = f.id_asesor
       ${whereSql}
       GROUP BY f.id_proyecto
       ORDER BY proyecto ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    rows.forEach(row => {
      const campo = row.foto_principal;
      row.foto_portada =
        (campo && row[campo]) ? row[campo] :
        (row['FOTO BLT'] || row['FOTO BLT 2'] || row['FOTO BLT 3'] || row['FOTO BLT 4'] || row['FOTO BLT 5'] || row['FOTO BLT 6'] || row['FOTO BLT 7'] || null);
    });

    return res.json({
      ok: true,
      source: 'aiven',
      data: rows,
      limit,
      offset
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando proyectos de instalaciones.',
      error: error.message
    });
  }
}

async function getInsFlProjectPhotos(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 5000, 1), 5000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const params = [];
    const where = [];

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
        NULLIF(TRIM(p.foto_blt_5), '') IS NOT NULL
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
         p.imagen_drive AS \`Imagen Drive\`,
         p.imagen_p_g AS \`Imagen P G\`
       FROM ins_proyecto_fotos p
       LEFT JOIN ins_fl f
         ON TRIM(f.id_proyecto) = TRIM(p.id_ppns)
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

    rows.forEach(row => {
      const campo = row.foto_principal;
      row.foto_portada =
        (campo && row[campo]) ? row[campo] :
        (row['FOTO BLT'] || row['FOTO BLT 2'] || row['FOTO BLT 3'] || row['FOTO BLT 4'] || row['FOTO BLT 5'] || row['FOTO BLT 6'] || row['FOTO BLT 7'] || null);
    });

    return res.json({
      ok: true,
      source: 'aiven',
      data: rows,
      limit,
      offset
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando fotografias de proyectos.',
      error: error.message
    });
  }
}

async function updateInsFlProjectMainPhoto(req, res) {
  const allowedFields = new Set([
    'foto_blt_1', 'foto_blt_2', 'foto_blt_3', 'foto_blt_4',
    'foto_blt_5', 'foto_blt_6', 'foto_blt_7'
  ]);

  try {
    const idPpns = String(req.params.id_ppns || '').trim();
    const field = String(req.body && req.body.campo || '').trim();

    if (!idPpns) {
      return res.status(400).json({ ok: false, message: 'ID de proyecto requerido.' });
    }
    if (!allowedFields.has(field)) {
      return res.status(400).json({ ok: false, message: 'La fotografía seleccionada no es válida.' });
    }

    const [rows] = await db.query(
      `SELECT id_photo, ${field} AS selected_url
       FROM ins_proyecto_fotos
       WHERE TRIM(id_ppns) = TRIM(?)
       LIMIT 1`,
      [idPpns]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, message: 'No se encontró el registro fotográfico del proyecto.' });
    }
    if (!rows[0].selected_url || !String(rows[0].selected_url).trim()) {
      return res.status(400).json({ ok: false, message: 'La fotografía seleccionada está vacía.' });
    }

    await db.query(
      `UPDATE ins_proyecto_fotos
       SET foto_principal = ?
       WHERE id_photo = ?`,
      [field, rows[0].id_photo]
    );

    return res.json({ ok: true, id_ppns: idPpns, foto_principal: field });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error actualizando la fotografía principal del proyecto.',
      error: error.message
    });
  }
}

async function getInsFlClientConcentrate(req, res) {
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
    GROUP BY f.id_proyecto
    ORDER BY cliente ASC, proyecto ASC`;

  try {
    let rows;
    try {
      [rows] = await db.query(baseSelect(true));
    } catch (error) {
      if (error && (error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146)) {
        [rows] = await db.query(baseSelect(false));
      } else {
        throw error;
      }
    }

    return res.json({ ok: true, source: 'aiven', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando el concentrado de clientes de Instalaciones.',
      error: error.message
    });
  }
}

module.exports = {
  syncInsFl,
  getInsFl,
  getInsFlById,
  getInsFlProjects,
  getInsFlProjectPhotos,
  updateInsFlProjectMainPhoto,
  getInsFlClientConcentrate
};
