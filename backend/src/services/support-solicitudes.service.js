'use strict';

const db = require('../config/db');

const SUPPORT_ROLE_NAMES = new Set([
  'Soporte',
  'Programador',
  'Programador United',
  'Programador Corellian'
]);

function getRoleNames(user) {
  return new Set([
    user && user.rol,
    ...((user && Array.isArray(user.roles)) ? user.roles : [])
  ].filter(Boolean));
}

function canAdministrateSupport(user) {
  const roles = getRoleNames(user);
  return Array.from(SUPPORT_ROLE_NAMES).some(role => roles.has(role));
}

async function getTableColumns(tableName) {
  const [rows] = await db.query(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [tableName]
  );

  return new Set(rows.map(row => row.COLUMN_NAME));
}

function firstColumn(columns, candidates, fallbackSql = 'NULL') {
  const found = candidates.find(candidate => columns.has(candidate));
  return found ? `t.\`${found}\`` : fallbackSql;
}

function normalizeLimit(value, fallback = 500, max = 1000) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

async function listSolicitudes(filters = {}) {
  const columns = await getTableColumns('sup_tickets');
  if (!columns.size) {
    const error = new Error('La tabla sup_tickets no existe o no está disponible.');
    error.status = 500;
    throw error;
  }

  const idSql = firstColumn(columns, ['id_ticket', 'id_sup_ticket', 'id']);
  const folioSql = firstColumn(columns, ['folio', 'numero_solicitud'], `CONCAT('SUP-', ${idSql})`);
  const asuntoSql = firstColumn(columns, ['asunto_ticket', 'asunto', 'titulo']);
  const moduloSql = firstColumn(columns, ['modulo_ticket', 'modulo', 'modulo_afectado']);
  const estadoSql = firstColumn(columns, ['estado_ticket', 'estado', 'status']);
  const usuarioSql = firstColumn(columns, ['id_usuario', 'usuario_id', 'created_by', 'creado_por']);
  const incidenteSql = firstColumn(columns, ['fecha_incidente', 'fecha_creacion', 'created_at']);
  const ultimoMensajeSql = firstColumn(
    columns,
    ['fecha_ultimo_mensaje', 'fecha_ultima_respuesta', 'fecha_actualizacion', 'updated_at', 'fecha_creacion', 'created_at']
  );
  const activoSql = firstColumn(columns, ['activo'], '1');

  const where = [`COALESCE(${activoSql}, 1) = 1`];
  const params = [];

  if (filters.q) {
    const search = `%${String(filters.q).trim()}%`;
    where.push(`(${folioSql} LIKE ? OR ${asuntoSql} LIKE ? OR ${moduloSql} LIKE ? OR ${estadoSql} LIKE ?)`);
    params.push(search, search, search, search);
  }

  if (filters.estado) {
    where.push(`${estadoSql} = ?`);
    params.push(String(filters.estado).trim());
  }

  if (filters.modulo) {
    where.push(`${moduloSql} = ?`);
    params.push(String(filters.modulo).trim());
  }

  const limit = normalizeLimit(filters.limit);

  const [rows] = await db.query(
    `SELECT
       ${idSql} AS id_solicitud,
       ${folioSql} AS numero_solicitud,
       ${asuntoSql} AS asunto,
       ${moduloSql} AS modulo,
       ${estadoSql} AS estado,
       ${incidenteSql} AS fecha_incidente,
       ${ultimoMensajeSql} AS fecha_ultimo_mensaje,
       ${usuarioSql} AS id_usuario,
       u.nombre AS usuario_nombre,
       u.correo AS usuario_correo
     FROM sup_tickets t
     LEFT JOIN usuarios u
       ON u.id_SB = ${usuarioSql}
     WHERE ${where.join(' AND ')}
     ORDER BY ${ultimoMensajeSql} DESC, ${idSql} DESC
     LIMIT ${limit}`,
    params
  );

  return rows;
}

async function getSolicitudById(id) {
  const columns = await getTableColumns('sup_tickets');
  if (!columns.size) {
    const error = new Error('La tabla sup_tickets no existe o no está disponible.');
    error.status = 500;
    throw error;
  }

  const idColumn = ['id_ticket', 'id_sup_ticket', 'id'].find(candidate => columns.has(candidate));
  if (!idColumn) {
    const error = new Error('No se encontró la columna identificadora de sup_tickets.');
    error.status = 500;
    throw error;
  }

  const [rows] = await db.query(
    `SELECT
       t.*,
       u.nombre AS usuario_nombre,
       u.correo AS usuario_correo,
       s.nombre AS soporte_nombre,
       s.correo AS soporte_correo,
       c.nombre_categoria
     FROM sup_tickets t
     LEFT JOIN usuarios u ON u.id_SB = t.id_usuario
     LEFT JOIN usuarios s ON s.id_SB = t.id_soporte
     LEFT JOIN sup_ticket_categorias c ON c.id_ticket_categoria = t.id_ticket_categoria
     WHERE t.\`${idColumn}\` = ?
     LIMIT 1`,
    [id]
  );

  return rows[0] || null;
}

async function notifySupportUsers({ ticketId, folio, asunto }) {
  if (!ticketId) return 0;

  const [result] = await db.query(
    `INSERT INTO sup_notificaciones
       (id_usuario, tipo_notificacion, titulo_notificacion, mensaje_notificacion,
        icono_notificacion, accion_notificacion, id_referencia, ruta_destino,
        leido, activo, fecha_creacion, fecha_actualizacion)
     SELECT DISTINCT
       u.id_SB,
       'SOLICITUD_SOPORTE',
       'Nueva solicitud de soporte',
       CONCAT(?, ' - ', ?),
       '🎫',
       'ABRIR_SOLICITUD',
       ?,
       'soporte-solicitudes',
       0,
       1,
       NOW(),
       NOW()
     FROM usuarios u
     INNER JOIN usuario_roles ur
       ON ur.id_usuario = u.id_SB
      AND ur.activo = 1
     INNER JOIN roles r
       ON r.id_rol = ur.id_rol
      AND r.estado = 1
     WHERE u.estado = 1
       AND r.rol = 'Soporte'`,
    [folio || `SUP-${ticketId}`, asunto || 'Solicitud de soporte', ticketId]
  );

  return Number(result.affectedRows || 0);
}

module.exports = {
  canAdministrateSupport,
  listSolicitudes,
  getSolicitudById,
  notifySupportUsers
};
