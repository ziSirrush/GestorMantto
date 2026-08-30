'use strict';

const INTEREST_MODULE = 'ventas-cotizaciones';
const INTEREST_ENTITY = 'cotizacion';
const INTEREST_ON = 'PROYECTO_INTERES_ACTIVADO';
const INTEREST_OFF = 'PROYECTO_INTERES_DESACTIVADO';

function buildScopeClause(scope, alias = 'q') {
  const prefix = alias ? `${alias}.` : '';
  if (!scope || scope.mode === 'ALL') return { sql: '', params: [] };

  const ids = Array.isArray(scope.advisorIds)
    ? [...new Set(scope.advisorIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    : [];

  if (!ids.length) return { sql: '1 = 0', params: [] };

  const placeholders = ids.map(() => '?').join(', ');
  return {
    sql: `(${prefix}id_asesor IN (${placeholders}) OR ${prefix}id_admin IN (${placeholders}))`,
    params: [...ids, ...ids]
  };
}

async function getLatestProjectInterest(connection, idUsuario, idCotizacion) {
  const [rows] = await connection.query(
    `SELECT id_interaccion, id_usuario, tipo_interaccion, modulo, entidad,
            id_referencia, titulo, descripcion, payload_json, detalle_json,
            created_at
       FROM usuario_interacciones
      WHERE id_usuario = ?
        AND modulo = ?
        AND entidad = ?
        AND id_referencia = ?
        AND tipo_interaccion IN (?, ?)
      ORDER BY id_interaccion DESC
      LIMIT 1`,
    [idUsuario, INTEREST_MODULE, INTEREST_ENTITY, String(idCotizacion), INTEREST_ON, INTEREST_OFF]
  );
  return rows[0] || null;
}

async function insertProjectInterestEvent(connection, record) {
  const [result] = await connection.query(
    `INSERT INTO usuario_interacciones (
       id_usuario, tipo_interaccion, modulo, entidad, id_referencia,
       titulo, descripcion, empresa_contexto, ruta_destino,
       payload_json, detalle_json, metodo_http, endpoint,
       ip_address, user_agent
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id_usuario,
      record.activo ? INTEREST_ON : INTEREST_OFF,
      INTEREST_MODULE,
      INTEREST_ENTITY,
      String(record.id_cotizacion),
      record.activo ? 'Marcaste Proyecto de interés' : 'Quitaste Proyecto de interés',
      record.descripcion || null,
      record.empresa_contexto || null,
      'ventas-cotizaciones-detalle',
      JSON.stringify({ activo: Boolean(record.activo) }),
      JSON.stringify(record.detalle || {}),
      'PUT',
      `/api/ventas/cotizaciones/${record.id_cotizacion}/interes`,
      record.ip_address || null,
      record.user_agent || null
    ]
  );
  return Number(result.insertId || 0);
}

function interestIsActive(event) {
  return String(event?.tipo_interaccion || '').trim().toUpperCase() === INTEREST_ON;
}

async function listProjectInterests(connection, options) {
  const idUsuario = Number(options?.idUsuario);
  const pageSize = Math.min(30, Math.max(1, Number(options?.pageSize) || 30));
  const page = Math.max(1, Number(options?.page) || 1);
  const offset = (page - 1) * pageSize;
  const search = String(options?.search || '').trim();
  const scopeClause = buildScopeClause(options?.scope, 'q');

  const clauses = [
    'q.activo = 1',
    'ui.tipo_interaccion = ?'
  ];
  const params = [INTEREST_ON];

  if (scopeClause.sql) {
    clauses.push(scopeClause.sql);
    params.push(...scopeClause.params);
  }

  if (search) {
    clauses.push(`(
      q.nombre_proyecto LIKE ?
      OR q.cliente LIKE ?
      OR q.estatus_proyecto LIKE ?
      OR q.asesor LIKE ?
      OR q.ciudad LIKE ?
      OR q.estado LIKE ?
      OR CAST(q.id_cotizacion AS CHAR) LIKE ?
    )`);
    const like = `%${search}%`;
    params.push(like, like, like, like, like, like, like);
  }

  const latestSql = `
    SELECT ui_latest.id_referencia, MAX(ui_latest.id_interaccion) AS id_interaccion
      FROM usuario_interacciones ui_latest
     WHERE ui_latest.id_usuario = ?
       AND ui_latest.modulo = ?
       AND ui_latest.entidad = ?
       AND ui_latest.tipo_interaccion IN (?, ?)
       AND ui_latest.id_referencia IS NOT NULL
     GROUP BY ui_latest.id_referencia
  `;
  const latestParams = [idUsuario, INTEREST_MODULE, INTEREST_ENTITY, INTEREST_ON, INTEREST_OFF];
  const whereSql = `WHERE ${clauses.join(' AND ')}`;
  const fromSql = `
      FROM ventas_cotizaciones_cor q
      JOIN (${latestSql}) latest
        ON latest.id_referencia = CAST(q.id_cotizacion AS CHAR)
      JOIN usuario_interacciones ui
        ON ui.id_interaccion = latest.id_interaccion
  `;

  const [countRows] = await connection.query(
    `SELECT COUNT(*) AS total
       ${fromSql}
       ${whereSql}`,
    [...latestParams, ...params]
  );

  const [rows] = await connection.query(
    `SELECT
       q.id_cotizacion,
       q.nombre_proyecto,
       q.cliente,
       q.estatus_proyecto,
       q.numero_equipos,
       q.fecha_solicitud,
       q.fecha_cotizacion,
       q.fecha_cambio_estatus,
       q.fecha_cierre,
       q.ciudad,
       q.estado,
       q.asesor,
       q.id_asesor,
       q.id_admin,
       ui.id_interaccion AS id_interaccion_interes,
       ui.created_at AS fecha_interes
       ${fromSql}
       ${whereSql}
      ORDER BY ui.created_at DESC, ui.id_interaccion DESC, q.id_cotizacion DESC
      LIMIT ? OFFSET ?`,
    [...latestParams, ...params, pageSize, offset]
  );

  const total = Number(countRows[0]?.total || 0);
  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: total ? Math.ceil(total / pageSize) : 0
  };
}

module.exports = {
  INTEREST_MODULE,
  INTEREST_ENTITY,
  INTEREST_ON,
  INTEREST_OFF,
  getLatestProjectInterest,
  insertProjectInterestEvent,
  interestIsActive,
  listProjectInterests
};
