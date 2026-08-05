const db = require('../../config/db');

const TABLE = 'ventas_cotizaciones_cor';

function buildScopeClause(scope, alias = '') {
  const prefix = alias ? `${alias}.` : '';
  if (!scope || scope.mode === 'ALL') return { sql: '', params: [] };
  const ids = Array.isArray(scope.advisorIds) ? scope.advisorIds.filter(Number.isInteger) : [];
  if (!ids.length) return { sql: '1 = 0', params: [] };
  return { sql: `${prefix}id_asesor IN (${ids.map(() => '?').join(', ')})`, params: ids };
}


async function getConnection() {
  return db.getConnection();
}

async function findExistingCotizacionOriginIds(connection, originIds) {
  if (!originIds.length) return new Set();

  const placeholders = originIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT id_cot_origen
       FROM ${TABLE}
      WHERE id_cot_origen IN (${placeholders})`,
    originIds
  );

  return new Set(rows.map((row) => Number(row.id_cot_origen)));
}

async function findExistingUserIds(connection, userIds) {
  if (!userIds.length) return new Set();

  const placeholders = userIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT id_SB
       FROM usuarios
      WHERE id_SB IN (${placeholders})
        AND estado = 1`,
    userIds
  );

  return new Set(rows.map((row) => Number(row.id_SB)));
}

async function findUserIdsIncludingInactive(connection, userIds) {
  if (!userIds.length) return new Set();
  const placeholders = userIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT id_SB
       FROM usuarios
      WHERE id_SB IN (${placeholders})`,
    userIds
  );
  return new Set(rows.map((row) => Number(row.id_SB)));
}


const SEARCH_COLUMNS = [
  'nombre_proyecto',
  'cliente',
  'contacto',
  'telefono',
  'correo',
  'ciudad',
  'estado',
  'tipo_proyecto',
  'tipo_equipos',
  'asesor',
  'admin',
  'zona',
  'estatus_proyecto',
  'razon_perdido',
  'empresa_vs_perdido',
  'id_equipo_vendido'
];

function buildListWhere(search, filters, scope = null, options = {}) {
  const clauses = [];
  const params = [];
  const normalizedFilters = { ...(filters || {}) };

  if (search) {
    const like = `%${search}%`;
    const searchClauses = SEARCH_COLUMNS.map((column) => `${column} LIKE ?`);
    searchClauses.push('CAST(id_cotizacion AS CHAR) LIKE ?');
    searchClauses.push('CAST(id_cot_origen AS CHAR) LIKE ?');
    clauses.push(`(${searchClauses.join(' OR ')})`);
    params.push(...Array(searchClauses.length).fill(like));
  }

  // Relación comercial del detalle de cliente:
  // 1) vínculo físico por id_cliente cuando exista;
  // 2) respaldo histórico por nombre de cliente + asesor.
  const relationId = Number(normalizedFilters.id_cliente);
  const relationClient = String(normalizedFilters.cliente || '').trim();
  const relationAdvisor = String(normalizedFilters.asesor || '').trim();

  delete normalizedFilters.id_cliente;
  delete normalizedFilters.cliente;
  delete normalizedFilters.asesor;

  if (Number.isInteger(relationId) && relationId > 0 && relationClient && relationAdvisor) {
    clauses.push(`(
      id_cliente = ?
      OR (
        UPPER(TRIM(cliente)) = UPPER(TRIM(?))
        AND UPPER(TRIM(asesor)) = UPPER(TRIM(?))
      )
    )`);
    params.push(relationId, relationClient, relationAdvisor);
  } else if (Number.isInteger(relationId) && relationId > 0) {
    clauses.push('id_cliente = ?');
    params.push(relationId);
  } else if (relationClient && relationAdvisor) {
    clauses.push('UPPER(TRIM(cliente)) = UPPER(TRIM(?))');
    clauses.push('UPPER(TRIM(asesor)) = UPPER(TRIM(?))');
    params.push(relationClient, relationAdvisor);
  } else {
    if (relationClient) {
      clauses.push('UPPER(TRIM(cliente)) = UPPER(TRIM(?))');
      params.push(relationClient);
    }
    if (relationAdvisor) {
      clauses.push('UPPER(TRIM(asesor)) = UPPER(TRIM(?))');
      params.push(relationAdvisor);
    }
  }

  for (const [field, value] of Object.entries(normalizedFilters)) {
    clauses.push(`${field} = ?`);
    params.push(value);
  }

  const scopeClause = buildScopeClause(scope);
  if (scopeClause.sql) {
    clauses.push(scopeClause.sql);
    params.push(...scopeClause.params);
  }

  if (Number.isInteger(options.year)) {
    clauses.push(`LEFT(COALESCE(NULLIF(TRIM(fecha_solicitud), ''), NULLIF(TRIM(fecha_cotizacion), '')), 4) = ?`);
    params.push(String(options.year));
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

async function list(connection, options, scope = null) {
  const where = buildListWhere(options.search, options.filters, scope, { year: options.year });
  const direction = options.sortDirection === 'asc' ? 'ASC' : 'DESC';

  const [countRows] = await connection.query(
    `SELECT COUNT(*) AS total
       FROM ${TABLE}
       ${where.sql}`,
    where.params
  );

  const [rows] = await connection.query(
    `SELECT *
       FROM ${TABLE}
       ${where.sql}
      ORDER BY ${options.sortBy} ${direction}, id_cotizacion DESC
      LIMIT ? OFFSET ?`,
    [...where.params, options.pageSize, options.offset]
  );

  return {
    rows,
    total: Number(countRows[0]?.total || 0)
  };
}




function buildSpecializedWhere(search, filters, statuses, scope = null, options = {}) {
  const base = buildListWhere(search, filters, scope);
  const clauses = [];
  const params = [...base.params];

  if (base.sql) clauses.push(base.sql.replace(/^WHERE\s+/i, ''));

  if (Array.isArray(statuses) && statuses.length) {
    clauses.push(`TRIM(estatus_proyecto) IN (${statuses.map(() => '?').join(', ')})`);
    params.push(...statuses);
  }

  if (Number.isInteger(options.year)) {
    const yearField = options.yearField === 'fecha_cierre'
      ? `NULLIF(TRIM(fecha_cierre), '')`
      : options.yearField === 'fecha_cambio_estatus'
        ? `NULLIF(TRIM(fecha_cambio_estatus), '')`
        : `COALESCE(NULLIF(TRIM(fecha_solicitud), ''), NULLIF(TRIM(fecha_cotizacion), ''))`;
    clauses.push(`LEFT(${yearField}, 4) = ?`);
    params.push(String(options.year));
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

async function listByStatuses(connection, options, statuses, scope = null) {
  const where = buildSpecializedWhere(options.search, options.filters, statuses, scope);
  const direction = options.sortDirection === 'asc' ? 'ASC' : 'DESC';

  const [countRows] = await connection.query(
    `SELECT COUNT(*) AS total
       FROM ${TABLE}
       ${where.sql}`,
    where.params
  );

  const [rows] = await connection.query(
    `SELECT *
       FROM ${TABLE}
       ${where.sql}
      ORDER BY ${options.sortBy} ${direction}, id_cotizacion DESC
      LIMIT ? OFFSET ?`,
    [...where.params, options.pageSize, options.offset]
  );

  return { rows, total: Number(countRows[0]?.total || 0) };
}


async function listVendidos(connection, options, scope = null) {
  // El periodo de una venta se determina exclusivamente por fecha_cierre.
  const wherePeriodo = buildSpecializedWhere(options.search, options.filters, ['Vendido'], scope, {
    year: options.year,
    yearField: 'fecha_cierre'
  });

  // El control de vendidos sin fecha no pertenece a ningún año; respeta el resto de filtros y el alcance.
  const whereSinPeriodo = buildSpecializedWhere(options.search, options.filters, ['Vendido'], scope);
  const sinFechaClause = whereSinPeriodo.sql
    ? `${whereSinPeriodo.sql} AND NULLIF(TRIM(fecha_cierre), '') IS NULL`
    : `WHERE NULLIF(TRIM(fecha_cierre), '') IS NULL`;

  const [countRows] = await connection.query(
    `SELECT
       COUNT(*) AS total_cotizaciones,
       COALESCE(SUM(numero_equipos), 0) AS total_equipos,
       SUM(CASE WHEN NULLIF(TRIM(fecha_cierre), '') IS NOT NULL THEN 1 ELSE 0 END) AS con_fecha_cierre
     FROM ${TABLE}
     ${wherePeriodo.sql}`,
    wherePeriodo.params
  );

  const [missingDateRows] = await connection.query(
    `SELECT COUNT(*) AS sin_fecha_cierre
       FROM ${TABLE}
       ${sinFechaClause}`,
    whereSinPeriodo.params
  );

  const [rows] = await connection.query(
    `SELECT *
       FROM ${TABLE}
       ${wherePeriodo.sql}
      ORDER BY NULLIF(TRIM(fecha_cierre), '') IS NULL ASC, fecha_cierre DESC, id_cotizacion DESC
      LIMIT ? OFFSET ?`,
    [...wherePeriodo.params, options.pageSize, options.offset]
  );

  return {
    rows,
    total: Number(countRows[0]?.total_cotizaciones || 0),
    resumen: {
      ...(countRows[0] || {}),
      sin_fecha_cierre: Number(missingDateRows[0]?.sin_fecha_cierre || 0)
    }
  };
}

async function listPerdidos(connection, options, scope = null) {
  // Una pérdida pertenece al año de fecha_cambio_estatus.
  const where = buildSpecializedWhere(options.search, options.filters, ['Perdido'], scope, {
    year: options.year,
    yearField: 'fecha_cambio_estatus'
  });

  const [summaryRows] = await connection.query(
    `SELECT
       COUNT(*) AS total_cotizaciones,
       COALESCE(SUM(numero_equipos), 0) AS total_equipos,
       SUM(CASE WHEN NULLIF(TRIM(razon_perdido), '') IS NOT NULL THEN 1 ELSE 0 END) AS con_razon,
       SUM(CASE WHEN NULLIF(TRIM(razon_perdido), '') IS NULL THEN 1 ELSE 0 END) AS sin_razon
     FROM ${TABLE}
     ${where.sql}`,
    where.params
  );

  const [rows] = await connection.query(
    `SELECT *
       FROM ${TABLE}
       ${where.sql}
      ORDER BY NULLIF(TRIM(fecha_cambio_estatus), '') IS NULL ASC,
               fecha_cambio_estatus DESC,
               id_cotizacion DESC
      LIMIT ? OFFSET ?`,
    [...where.params, options.pageSize, options.offset]
  );

  return {
    rows,
    total: Number(summaryRows[0]?.total_cotizaciones || 0),
    resumen: summaryRows[0] || {}
  };
}

async function summarizeByStatuses(connection, options, statuses, scope = null) {
  const where = buildSpecializedWhere(options.search, options.filters, statuses, scope);

  const [summaryRows] = await connection.query(
    `SELECT
       COUNT(*) AS total_cotizaciones,
       COALESCE(SUM(numero_equipos), 0) AS total_equipos,
       COALESCE(AVG(numero_equipos), 0) AS promedio_equipos
     FROM ${TABLE}
     ${where.sql}`,
    where.params
  );

  const [statusRows] = await connection.query(
    `SELECT
       TRIM(estatus_proyecto) AS estatus,
       COUNT(*) AS total_cotizaciones,
       COALESCE(SUM(numero_equipos), 0) AS total_equipos
     FROM ${TABLE}
     ${where.sql}
     GROUP BY TRIM(estatus_proyecto)
     ORDER BY FIELD(estatus, ${statuses.map(() => '?').join(', ')}), estatus ASC`,
    [...where.params, ...statuses]
  );

  return { resumen: summaryRows[0] || {}, por_estatus: statusRows };
}

async function getProjection(connection, options, groups, scope = null) {
  const allStatuses = [...groups.alta, ...groups.media, ...groups.temprana];
  const where = buildSpecializedWhere(options.search, options.filters, allStatuses, scope, {
    year: options.year,
    yearField: 'fecha_cotizacion'
  });

  const caseSql = `CASE
    WHEN TRIM(estatus_proyecto) IN (${groups.alta.map(() => '?').join(', ')}) THEN 'ALTA'
    WHEN TRIM(estatus_proyecto) IN (${groups.media.map(() => '?').join(', ')}) THEN 'MEDIA'
    WHEN TRIM(estatus_proyecto) IN (${groups.temprana.map(() => '?').join(', ')}) THEN 'TEMPRANA'
    ELSE NULL
  END`;
  const groupParams = [...groups.alta, ...groups.media, ...groups.temprana];

  const [rows] = await connection.query(
    `SELECT
       ${caseSql} AS nivel,
       COUNT(*) AS total_cotizaciones,
       COALESCE(SUM(numero_equipos), 0) AS total_equipos
     FROM ${TABLE}
     ${where.sql}
     GROUP BY nivel
     HAVING nivel IS NOT NULL
     ORDER BY FIELD(nivel, 'ALTA', 'MEDIA', 'TEMPRANA')`,
    [...groupParams, ...where.params]
  );

  const [statusRows] = await connection.query(
    `SELECT
       ${caseSql} AS nivel,
       TRIM(estatus_proyecto) AS estatus,
       COUNT(*) AS total_cotizaciones,
       COALESCE(SUM(numero_equipos), 0) AS total_equipos
     FROM ${TABLE}
     ${where.sql}
     GROUP BY nivel, TRIM(estatus_proyecto)
     HAVING nivel IS NOT NULL
     ORDER BY FIELD(nivel, 'ALTA', 'MEDIA', 'TEMPRANA'), total_cotizaciones DESC, estatus ASC`,
    [...groupParams, ...where.params]
  );

  const [detailRows] = await connection.query(
    `SELECT *
       FROM ${TABLE}
       ${where.sql}
      ORDER BY FIELD(TRIM(estatus_proyecto), ${allStatuses.map(() => '?').join(', ')}),
               nombre_proyecto ASC,
               id_cotizacion DESC`,
    [...where.params, ...allStatuses]
  );

  return { por_nivel: rows, detalle_estatus: statusRows, cotizaciones: detailRows };
}


async function getProjectionStagePage(connection, options, status, scope = null, page = 1, pageSize = 10) {
  const where = buildSpecializedWhere(options.search, options.filters, [status], scope, {
    year: options.year,
    yearField: 'fecha_cotizacion'
  });
  const offset = (page - 1) * pageSize;

  const [[summary]] = await connection.query(
    `SELECT
       COUNT(*) AS total_cotizaciones,
       COALESCE(SUM(numero_equipos), 0) AS total_equipos
     FROM ${TABLE}
     ${where.sql}`,
    where.params
  );

  const [rows] = await connection.query(
    `SELECT *
       FROM ${TABLE}
       ${where.sql}
      ORDER BY nombre_proyecto ASC, id_cotizacion DESC
      LIMIT ? OFFSET ?`,
    [...where.params, pageSize, offset]
  );

  return {
    rows,
    total: Number(summary?.total_cotizaciones || 0),
    totalEquipos: Number(summary?.total_equipos || 0)
  };
}

async function getKpis(connection, options, scope = null) {
  const where = buildListWhere(options.search, options.filters, scope, { year: options.year });

  const [summaryRows] = await connection.query(
    `SELECT
       COUNT(*) AS total_cotizaciones,
       SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END) AS activas,
       SUM(CASE WHEN activo = 0 THEN 1 ELSE 0 END) AS inactivas,
       COALESCE(SUM(numero_equipos), 0) AS total_equipos,
       COALESCE(AVG(numero_equipos), 0) AS promedio_equipos,
       SUM(CASE WHEN id_asesor IS NOT NULL THEN 1 ELSE 0 END) AS con_asesor,
       SUM(CASE WHEN id_asesor IS NULL THEN 1 ELSE 0 END) AS sin_asesor,
       SUM(CASE WHEN id_admin IS NOT NULL THEN 1 ELSE 0 END) AS con_administrativo,
       SUM(CASE WHEN id_admin IS NULL THEN 1 ELSE 0 END) AS sin_administrativo,
       SUM(CASE WHEN NULLIF(TRIM(estatus_proyecto), '') IS NOT NULL THEN 1 ELSE 0 END) AS con_estatus,
       SUM(CASE WHEN NULLIF(TRIM(estatus_proyecto), '') IS NULL THEN 1 ELSE 0 END) AS sin_estatus
     FROM ${TABLE}
     ${where.sql}`,
    where.params
  );

  const [statusRows] = await connection.query(
    `SELECT
       COALESCE(NULLIF(TRIM(estatus_proyecto), ''), 'SIN ESTATUS') AS estatus,
       COUNT(*) AS total,
       COALESCE(SUM(numero_equipos), 0) AS equipos
     FROM ${TABLE}
     ${where.sql}
     GROUP BY COALESCE(NULLIF(TRIM(estatus_proyecto), ''), 'SIN ESTATUS')
     ORDER BY total DESC, estatus ASC`,
    where.params
  );

  const [advisorRows] = await connection.query(
    `SELECT
       id_asesor,
       COALESCE(NULLIF(TRIM(asesor), ''), 'SIN ASESOR') AS asesor,
       COUNT(*) AS total,
       COALESCE(SUM(numero_equipos), 0) AS equipos
     FROM ${TABLE}
     ${where.sql}
     GROUP BY id_asesor, COALESCE(NULLIF(TRIM(asesor), ''), 'SIN ASESOR')
     ORDER BY total DESC, asesor ASC`,
    where.params
  );

  // Vendidas y perdidas usan la fecha del evento comercial, no la fecha de origen de la cotización.
  const vendidosWhere = buildSpecializedWhere(options.search, options.filters, ['Vendido'], scope, {
    year: options.year,
    yearField: 'fecha_cierre'
  });
  const perdidosWhere = buildSpecializedWhere(options.search, options.filters, ['Perdido'], scope, {
    year: options.year,
    yearField: 'fecha_cambio_estatus'
  });

  const [[vendidosRows], [perdidosRows]] = await Promise.all([
    connection.query(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(numero_equipos), 0) AS equipos_vendidos
         FROM ${TABLE}
         ${vendidosWhere.sql}
         AND NULLIF(TRIM(fecha_cierre), '') IS NOT NULL`,
      vendidosWhere.params
    ),
    connection.query(
      `SELECT COUNT(*) AS total
         FROM ${TABLE}
         ${perdidosWhere.sql}
         AND NULLIF(TRIM(fecha_cambio_estatus), '') IS NOT NULL`,
      perdidosWhere.params
    )
  ]);

  return {
    resumen: summaryRows[0] || {},
    por_estatus: statusRows,
    por_asesor: advisorRows,
    vendidas_periodo: Number(vendidosRows[0]?.total || 0),
    equipos_vendidos_periodo: Number(vendidosRows[0]?.equipos_vendidos || 0),
    perdidas_periodo: Number(perdidosRows[0]?.total || 0)
  };
}

async function getCatalogos(connection) {
  const [distinctRows, advisorRows, adminRows, relationRows] = await Promise.all([
    connection.query(`
      SELECT
        GROUP_CONCAT(DISTINCT NULLIF(TRIM(estatus_proyecto), '') ORDER BY estatus_proyecto SEPARATOR '||') AS estatus_proyecto,
        GROUP_CONCAT(DISTINCT NULLIF(TRIM(zona), '') ORDER BY zona SEPARATOR '||') AS zonas,
        GROUP_CONCAT(DISTINCT NULLIF(TRIM(estado), '') ORDER BY estado SEPARATOR '||') AS estados,
        GROUP_CONCAT(DISTINCT NULLIF(TRIM(ciudad), '') ORDER BY ciudad SEPARATOR '||') AS ciudades,
        GROUP_CONCAT(DISTINCT NULLIF(TRIM(tipo_proyecto), '') ORDER BY tipo_proyecto SEPARATOR '||') AS tipos_proyecto,
        GROUP_CONCAT(DISTINCT NULLIF(TRIM(tipo_equipos), '') ORDER BY tipo_equipos SEPARATOR '||') AS tipos_equipos,
        GROUP_CONCAT(DISTINCT NULLIF(TRIM(mx), '') ORDER BY mx SEPARATOR '||') AS monedas,
        GROUP_CONCAT(
          DISTINCT LEFT(COALESCE(NULLIF(TRIM(fecha_solicitud), ''), NULLIF(TRIM(fecha_cotizacion), '')), 4)
          ORDER BY LEFT(COALESCE(NULLIF(TRIM(fecha_solicitud), ''), NULLIF(TRIM(fecha_cotizacion), '')), 4) DESC
          SEPARATOR '||'
        ) AS anios,
        GROUP_CONCAT(
          DISTINCT LEFT(NULLIF(TRIM(fecha_cierre), ''), 4)
          ORDER BY LEFT(NULLIF(TRIM(fecha_cierre), ''), 4) DESC
          SEPARATOR '||'
        ) AS anios_cierre,
        GROUP_CONCAT(
          DISTINCT LEFT(NULLIF(TRIM(fecha_cambio_estatus), ''), 4)
          ORDER BY LEFT(NULLIF(TRIM(fecha_cambio_estatus), ''), 4) DESC
          SEPARATOR '||'
        ) AS anios_perdidos,
        GROUP_CONCAT(
          DISTINCT NULLIF(TRIM(razon_perdido), '')
          ORDER BY razon_perdido
          SEPARATOR '||'
        ) AS razones_perdido
      FROM ${TABLE}
      WHERE activo = 1
        AND COALESCE(NULLIF(TRIM(fecha_solicitud), ''), NULLIF(TRIM(fecha_cotizacion), '')) IS NOT NULL
    `),
    connection.query(`
      SELECT DISTINCT
        u.id_SB AS id_usuario,
        u.nombre,
        u.iniciales,
        u.correo,
        u.empresa,
        u.puesto,
        r.rol
      FROM usuarios_rel_admin ura
      INNER JOIN usuarios u
        ON u.id_SB = ura.id_asesor
       AND u.estado = 1
      LEFT JOIN roles r
        ON r.id_rol = u.rol_id
       AND r.estado = 1
      WHERE LOWER(COALESCE(u.area, '')) = 'ventas'
      ORDER BY u.nombre
    `),
    connection.query(`
      SELECT DISTINCT
        u.id_SB AS id_usuario,
        u.nombre,
        u.iniciales,
        u.correo,
        u.empresa,
        u.puesto,
        r.rol
      FROM usuarios_rel_admin ura
      INNER JOIN usuarios u
        ON u.id_SB = ura.id_admin
       AND u.estado = 1
      LEFT JOIN roles r
        ON r.id_rol = u.rol_id
       AND r.estado = 1
      WHERE LOWER(COALESCE(u.area, '')) = 'ventas'
      ORDER BY u.nombre
    `),
    connection.query(`
      SELECT DISTINCT id_asesor, id_admin
      FROM usuarios_rel_admin
      ORDER BY id_asesor, id_admin
    `)
  ]);

  const split = (value) => value ? String(value).split('||').filter(Boolean) : [];
  const row = distinctRows[0][0] || {};

  return {
    asesores: advisorRows[0],
    administrativos: adminRows[0],
    relaciones_admin: relationRows[0].map((item) => ({
      id_asesor: Number(item.id_asesor),
      id_admin: Number(item.id_admin)
    })),
    estatus_proyecto: split(row.estatus_proyecto),
    zonas: split(row.zonas),
    estados: split(row.estados),
    ciudades: split(row.ciudades),
    tipos_proyecto: split(row.tipos_proyecto),
    tipos_equipos: split(row.tipos_equipos),
    monedas: split(row.monedas),
    anios: split(row.anios).map(Number).filter(Number.isInteger),
    anios_cierre: split(row.anios_cierre).map(Number).filter(Number.isInteger),
    anios_perdidos: split(row.anios_perdidos).map(Number).filter(Number.isInteger),
    razones_perdido: split(row.razones_perdido)
  };
}


async function listEquipmentRows(connection, idCotizacion) {
  const [rows] = await connection.query(
    `SELECT id_cotizacion_equipo, id_cotizacion, tipo_equipo, cantidad, orden, activo, created_at, updated_at
       FROM ventas_cotizaciones_equipos_cor
      WHERE id_cotizacion = ?
        AND activo = 1
      ORDER BY orden ASC, id_cotizacion_equipo ASC`,
    [idCotizacion]
  );

  return rows.map((row) => ({
    ...row,
    id_cotizacion_equipo: Number(row.id_cotizacion_equipo),
    id_cotizacion: Number(row.id_cotizacion),
    cantidad: Number(row.cantidad),
    orden: Number(row.orden),
    activo: Number(row.activo)
  }));
}

async function replaceEquipmentRows(connection, idCotizacion, rows) {
  await connection.query(
    'DELETE FROM ventas_cotizaciones_equipos_cor WHERE id_cotizacion = ?',
    [idCotizacion]
  );

  if (!rows.length) return { affectedRows: 0 };

  const values = rows.map((row) => [
    idCotizacion,
    row.tipo_equipo,
    row.cantidad,
    row.orden,
    1
  ]);

  const [result] = await connection.query(
    `INSERT INTO ventas_cotizaciones_equipos_cor
      (id_cotizacion, tipo_equipo, cantidad, orden, activo)
     VALUES ?`,
    [values]
  );
  return result;
}

async function findById(connection, idCotizacion, { includeInactive = false, scope = null } = {}) {
  const scopeClause = buildScopeClause(scope);
  const [rows] = await connection.query(
    `SELECT vc.*, vcc.puesto_contacto
       FROM ${TABLE} vc
       LEFT JOIN ventas_clientes_contactos vcc ON vcc.id_contacto = vc.id_contacto
      WHERE vc.id_cotizacion = ?
        ${includeInactive ? '' : 'AND vc.activo = 1'}
        ${scopeClause.sql ? `AND ${scopeClause.sql}` : ''}
      LIMIT 1`,
    [idCotizacion, ...scopeClause.params]
  );

  return rows[0] || null;
}

async function findByOriginId(connection, idCotOrigen, excludeId = null) {
  if (!idCotOrigen) return null;

  const params = [idCotOrigen];
  let excludeSql = '';
  if (excludeId) {
    excludeSql = 'AND id_cotizacion <> ?';
    params.push(excludeId);
  }

  const [rows] = await connection.query(
    `SELECT id_cotizacion
       FROM ${TABLE}
      WHERE id_cot_origen = ?
        ${excludeSql}
      LIMIT 1`,
    params
  );

  return rows[0] || null;
}

async function create(connection, record) {
  const columns = Object.keys(record);
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map((column) => record[column]);

  const [result] = await connection.query(
    `INSERT INTO ${TABLE} (${columns.join(', ')})
     VALUES (${placeholders})`,
    values
  );

  return result;
}

async function update(connection, idCotizacion, changes) {
  const columns = Object.keys(changes);
  if (!columns.length) return { affectedRows: 0 };

  const assignments = columns.map((column) => `${column} = ?`).join(', ');
  const values = columns.map((column) => changes[column]);
  values.push(idCotizacion);

  const [result] = await connection.query(
    `UPDATE ${TABLE}
        SET ${assignments},
            updated_at = CURRENT_TIMESTAMP
      WHERE id_cotizacion = ?`,
    values
  );

  return result;
}

async function softDelete(connection, idCotizacion, updatedBy) {
  const [result] = await connection.query(
    `UPDATE ${TABLE}
        SET activo = 0,
            updated_by = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id_cotizacion = ?
        AND activo = 1`,
    [updatedBy, idCotizacion]
  );

  return result;
}

async function upsertMany(connection, records) {
  if (!records.length) return { affectedRows: 0 };

  const columns = [
    'id_cot_origen',
    'nombre_proyecto',
    'cliente',
    'contacto',
    'telefono',
    'correo',
    'ciudad',
    'estado',
    'tipo_proyecto',
    'numero_equipos',
    'tipo_equipos',
    'informacion_envia',
    'asesor',
    'id_asesor',
    'visualiza',
    'anio_mes_cotizacion',
    'mx',
    'fecha_cotizacion',
    'fecha_solicitud',
    'zona',
    'estatus_proyecto',
    'razon_perdido',
    'admin',
    'id_admin',
    'fecha_cambio_estatus',
    'fecha_cierre',
    'comentario',
    'empresa_vs_perdido',
    'id_equipo_vendido',
    'anio_actual',
    'activo',
    'created_by',
    'updated_by'
  ];

  const placeholders = records
    .map(() => `(${columns.map(() => '?').join(', ')})`)
    .join(', ');

  const values = [];
  for (const record of records) {
    for (const column of columns) values.push(record[column]);
  }

  const updateColumns = columns.filter(
    (column) => !['id_cot_origen', 'created_by'].includes(column)
  );

  const updateSql = updateColumns
    .map((column) => `${column} = VALUES(${column})`)
    .concat('updated_at = CURRENT_TIMESTAMP')
    .join(',\n        ');

  const [result] = await connection.query(
    `INSERT INTO ${TABLE} (${columns.join(', ')})
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
        ${updateSql}`,
    values
  );

  return result;
}


async function findUsersByIds(connection, userIds) {
  if (!userIds.length) return new Map();

  const placeholders = userIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT id_SB, iniciales, nombre, correo
       FROM usuarios
      WHERE id_SB IN (${placeholders})
        AND estado = 1`,
    userIds
  );

  return new Map(rows.map((row) => [Number(row.id_SB), row]));
}

async function listComentarios(connection, idCotizacion, { page = 1, pageSize = 50 } = {}) {
  const offset = (page - 1) * pageSize;
  const [rows] = await connection.query(
    `SELECT c.*, u.nombre AS usuario_nombre, u.iniciales AS usuario_iniciales
       FROM ventas_cotizaciones_comentarios c
       LEFT JOIN usuarios u ON u.id_SB = c.id_usuario
      WHERE c.id_cotizacion = ?
        AND c.activo = 1
      ORDER BY c.created_at ASC, c.id_comentario ASC
      LIMIT ? OFFSET ?`,
    [idCotizacion, pageSize, offset]
  );
  const [[count]] = await connection.query(
    `SELECT COUNT(*) total
       FROM ventas_cotizaciones_comentarios
      WHERE id_cotizacion = ?
        AND activo = 1`,
    [idCotizacion]
  );
  return { rows, total: Number(count.total || 0) };
}

async function listArchivosByComentarioIds(connection, comentarioIds) {
  if (!comentarioIds.length) return [];
  const placeholders = comentarioIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT a.*, u.nombre AS usuario_nombre, u.iniciales AS usuario_iniciales
       FROM ventas_cotizaciones_archivos a
       LEFT JOIN usuarios u ON u.id_SB = a.id_usuario
      WHERE a.id_comentario IN (${placeholders})
        AND a.activo = 1
      ORDER BY a.created_at ASC, a.id_archivo ASC`,
    comentarioIds
  );
  return rows;
}

async function findExistingCotizacionIds(connection, ids) {
  if (!ids.length) return new Set();
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT id_cotizacion
       FROM ventas_cotizaciones_cor
      WHERE id_cotizacion IN (${placeholders})`,
    ids
  );
  return new Set(rows.map((row) => Number(row.id_cotizacion)));
}

async function findComentario(connection, idCotizacion, idComentario) {
  const [rows] = await connection.query(
    `SELECT c.*, u.nombre AS usuario_nombre, u.iniciales AS usuario_iniciales
       FROM ventas_cotizaciones_comentarios c
       LEFT JOIN usuarios u ON u.id_SB = c.id_usuario
      WHERE c.id_cotizacion = ?
        AND c.id_comentario = ?
        AND c.activo = 1
      LIMIT 1`,
    [idCotizacion, idComentario]
  );
  return rows[0] || null;
}

async function createComentario(connection, record) {
  const columns = Object.keys(record);
  const values = columns.map((key) => record[key]);
  const [result] = await connection.query(
    `INSERT INTO ventas_cotizaciones_comentarios (${columns.join(',')})
     VALUES (${columns.map(() => '?').join(',')})`,
    values
  );
  return result;
}

async function updateComentario(connection, idCotizacion, idComentario, comentario) {
  const [result] = await connection.query(
    `UPDATE ventas_cotizaciones_comentarios
        SET comentario = ?, editado = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id_cotizacion = ? AND id_comentario = ? AND activo = 1`,
    [comentario, idCotizacion, idComentario]
  );
  return result;
}

async function softDeleteComentario(connection, idCotizacion, idComentario) {
  const [result] = await connection.query(
    `UPDATE ventas_cotizaciones_comentarios
        SET activo = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id_cotizacion = ? AND id_comentario = ? AND activo = 1`,
    [idCotizacion, idComentario]
  );
  return result;
}

async function listArchivosByComentario(connection, idCotizacion, idComentario, { forUpdate = false } = {}) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await connection.query(
    `SELECT a.*, u.nombre AS usuario_nombre, u.iniciales AS usuario_iniciales
       FROM ventas_cotizaciones_archivos a
       LEFT JOIN usuarios u ON u.id_SB = a.id_usuario
      WHERE a.id_cotizacion = ?
        AND a.id_comentario = ?
        AND a.activo = 1
      ORDER BY a.created_at ASC, a.id_archivo ASC${lock}`,
    [idCotizacion, idComentario]
  );
  return rows;
}

async function softDeleteArchivosByComentario(connection, idCotizacion, idComentario) {
  const [result] = await connection.query(
    `UPDATE ventas_cotizaciones_archivos
        SET activo = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id_cotizacion = ? AND id_comentario = ? AND activo = 1`,
    [idCotizacion, idComentario]
  );
  return result;
}

async function listArchivos(connection, idCotizacion, { page = 1, pageSize = 50 } = {}) {
  const offset = (page - 1) * pageSize;
  const [rows] = await connection.query(
    `SELECT a.*, u.nombre AS usuario_nombre, u.iniciales AS usuario_iniciales
       FROM ventas_cotizaciones_archivos a
       LEFT JOIN usuarios u ON u.id_SB = a.id_usuario
      WHERE a.id_cotizacion = ? AND a.activo = 1
      ORDER BY a.created_at DESC, a.id_archivo DESC
      LIMIT ? OFFSET ?`,
    [idCotizacion, pageSize, offset]
  );
  const [[count]] = await connection.query(
    `SELECT COUNT(*) total
       FROM ventas_cotizaciones_archivos
      WHERE id_cotizacion = ? AND activo = 1`,
    [idCotizacion]
  );
  return { rows, total: Number(count.total || 0) };
}

async function findArchivo(connection, idCotizacion, idArchivo, { forUpdate = false } = {}) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await connection.query(
    `SELECT a.*, u.nombre AS usuario_nombre, u.iniciales AS usuario_iniciales
       FROM ventas_cotizaciones_archivos a
       LEFT JOIN usuarios u ON u.id_SB = a.id_usuario
      WHERE a.id_cotizacion = ? AND a.id_archivo = ? AND a.activo = 1
      LIMIT 1${lock}`,
    [idCotizacion, idArchivo]
  );
  return rows[0] || null;
}

async function createArchivo(connection, record) {
  const columns = Object.keys(record);
  const values = columns.map((key) => record[key]);
  const [result] = await connection.query(
    `INSERT INTO ventas_cotizaciones_archivos (${columns.join(',')})
     VALUES (${columns.map(() => '?').join(',')})`,
    values
  );
  return result;
}

async function updateArchivo(connection, idCotizacion, idArchivo, changes) {
  const columns = Object.keys(changes);
  const values = columns.map((key) => changes[key]);
  values.push(idCotizacion, idArchivo);
  const [result] = await connection.query(
    `UPDATE ventas_cotizaciones_archivos
        SET ${columns.map((key) => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id_cotizacion = ? AND id_archivo = ? AND activo = 1`,
    values
  );
  return result;
}

async function softDeleteArchivo(connection, idCotizacion, idArchivo) {
  const [result] = await connection.query(
    `UPDATE ventas_cotizaciones_archivos
        SET activo = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id_cotizacion = ? AND id_archivo = ? AND activo = 1`,
    [idCotizacion, idArchivo]
  );
  return result;
}

module.exports = { getConnection, findExistingCotizacionOriginIds, findExistingUserIds, findUserIdsIncludingInactive, findUsersByIds, list, listByStatuses, listVendidos, listPerdidos,
  summarizeByStatuses, getProjection, getProjectionStagePage, getKpis, getCatalogos, listEquipmentRows, replaceEquipmentRows, findById, findByOriginId, create, update, softDelete,
  upsertMany, findExistingCotizacionIds, listComentarios, listArchivosByComentarioIds, findComentario, createComentario, updateComentario, softDeleteComentario,
  listArchivos, findArchivo, createArchivo, updateArchivo, softDeleteArchivo,
  listArchivosByComentario, softDeleteArchivosByComentario };
