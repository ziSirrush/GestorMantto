const db = require('../../config/db');

function uniqueValues(values) {
  return [...new Set((values || []).filter((value) => value !== null && value !== undefined))];
}

function buildPlaceholders(values) {
  return values.map(() => '?').join(', ');
}

async function getConnection() {
  return db.getConnection();
}

async function findProjectsByIds(connection, projectIds) {
  const ids = uniqueValues(projectIds.map((value) => String(value).trim()).filter(Boolean));

  if (!ids.length) return [];

  const [rows] = await connection.query(
    `SELECT
       id_proyecto,
       MAX(NULLIF(TRIM(proyecto), '')) AS nombre_proyecto
     FROM ins_fl
     WHERE id_proyecto IN (${buildPlaceholders(ids)})
     GROUP BY id_proyecto`,
    ids
  );

  return rows;
}

async function findFoldersByDriveIds(connection, driveFolderIds) {
  const ids = uniqueValues(
    driveFolderIds.map((value) => String(value).trim()).filter(Boolean)
  );

  if (!ids.length) return [];

  const [rows] = await connection.query(
    `SELECT
       id_carpeta,
       carpeta_id,
       nombre_carpeta,
       enlace,
       activo
     FROM instalaciones_drive_carpetas
     WHERE carpeta_id IN (${buildPlaceholders(ids)})`,
    ids
  );

  return rows;
}

async function findUsersByInitials(connection, initials) {
  const normalizedInitials = uniqueValues(
    initials.map((value) => String(value).trim().toUpperCase()).filter(Boolean)
  );

  if (!normalizedInitials.length) return [];

  const [rows] = await connection.query(
    `SELECT
       id_SB AS id_usuario,
       UPPER(TRIM(iniciales)) AS iniciales,
       nombre,
       estado
     FROM usuarios
     WHERE UPPER(TRIM(iniciales)) IN (${buildPlaceholders(normalizedInitials)})`,
    normalizedInitials
  );

  return rows;
}

async function findProjectDriveRelationsByProjectIds(connection, projectIds) {
  const ids = uniqueValues(projectIds.map((value) => String(value).trim()).filter(Boolean));

  if (!ids.length) return [];

  const [rows] = await connection.query(
    `SELECT
       id_proyecto_drive,
       id_proyecto,
       nombre_proyecto,
       id_carpeta,
       activo,
       created_by,
       updated_by
     FROM instalaciones_proyecto_drive
     WHERE id_proyecto IN (${buildPlaceholders(ids)})`,
    ids
  );

  return rows;
}

async function findProjectDriveRelationsByFolderIds(connection, folderIds) {
  const ids = uniqueValues(folderIds.map((value) => Number(value)).filter(Number.isInteger));

  if (!ids.length) return [];

  const [rows] = await connection.query(
    `SELECT
       id_proyecto_drive,
       id_proyecto,
       nombre_proyecto,
       id_carpeta,
       activo
     FROM instalaciones_proyecto_drive
     WHERE id_carpeta IN (${buildPlaceholders(ids)})`,
    ids
  );

  return rows;
}

async function upsertProjectDrive(connection, project) {
  const [result] = await connection.query(
    `INSERT INTO instalaciones_proyecto_drive
       (
         id_proyecto,
         nombre_proyecto,
         id_carpeta,
         activo,
         created_by,
         updated_by
       )
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       id_proyecto_drive = LAST_INSERT_ID(id_proyecto_drive),
       nombre_proyecto = VALUES(nombre_proyecto),
       id_carpeta = VALUES(id_carpeta),
       activo = VALUES(activo),
       updated_by = VALUES(updated_by),
       updated_at = CURRENT_TIMESTAMP`,
    [
      project.id_proyecto,
      project.nombre_proyecto,
      project.id_carpeta,
      project.activo,
      project.created_by,
      project.updated_by
    ]
  );

  return {
    id_proyecto_drive: result.insertId,
    affected_rows: result.affectedRows,
    changed_rows: result.changedRows || 0
  };
}

async function deleteProjectUsers(connection, projectDriveId) {
  const [result] = await connection.query(
    `DELETE FROM instalaciones_proyecto_usuarios
     WHERE id_proyecto_drive = ?`,
    [projectDriveId]
  );

  return result.affectedRows;
}

async function insertProjectUsers(connection, relationships) {
  if (!relationships.length) return 0;

  const placeholders = relationships.map(() => '(?, ?, ?, ?)').join(', ');
  const params = [];

  for (const relationship of relationships) {
    params.push(
      relationship.id_proyecto_drive,
      relationship.id_usuario,
      relationship.tipo,
      relationship.activo
    );
  }

  const [result] = await connection.query(
    `INSERT INTO instalaciones_proyecto_usuarios
       (id_proyecto_drive, id_usuario, tipo, activo)
     VALUES ${placeholders}`,
    params
  );

  return result.affectedRows;
}

async function findProjectFolderDetail(connection, projectId) {
  const normalizedProjectId = String(projectId || '').trim();
  if (!normalizedProjectId) return null;

  const [rows] = await connection.query(
    `SELECT
       ipd.id_proyecto_drive,
       ipd.id_proyecto,
       ipd.nombre_proyecto,
       ipd.id_carpeta,
       ipd.activo,
       idc.carpeta_id,
       idc.nombre_carpeta,
       idc.enlace,
       idc.activo AS carpeta_activa
     FROM instalaciones_proyecto_drive ipd
     LEFT JOIN instalaciones_drive_carpetas idc
       ON idc.id_carpeta = ipd.id_carpeta
     WHERE ipd.id_proyecto = ?
     LIMIT 1`,
    [normalizedProjectId]
  );

  return rows[0] || null;
}

module.exports = {
  getConnection,
  findProjectsByIds,
  findFoldersByDriveIds,
  findUsersByInitials,
  findProjectDriveRelationsByProjectIds,
  findProjectDriveRelationsByFolderIds,
  upsertProjectDrive,
  deleteProjectUsers,
  insertProjectUsers,
  findProjectFolderDetail
};
