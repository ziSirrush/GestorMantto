const repository = require('./instalaciones-proyecto-drive.repository');
const logger = require('../../shared/logger');

const DEFAULT_BATCH_SIZE = 300;
const MAX_BATCH_SIZE = 300;

const USER_TYPES = Object.freeze({
  supervisor: 'SUPERVISOR',
  asesor: 'ASESOR',
  aux: 'AUX_ADMIN',
  lectura: 'LECTURA'
});

function createValidationError(message, detalles) {
  const error = new Error(message);
  error.statusCode = 400;
  error.detalles = detalles;
  return error;
}

function cleanText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeActive(value) {
  if (value === undefined || value === null || value === '') return 1;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value === 0 ? 0 : 1;

  const text = cleanText(value).toLowerCase();
  return ['0', 'false', 'no', 'inactivo'].includes(text) ? 0 : 1;
}

function normalizeOptionalUserId(value) {
  if (value === undefined || value === null || value === '') return null;

  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function normalizeBatchSize(value) {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_BATCH_SIZE;
  }

  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized < 1 || normalized > MAX_BATCH_SIZE) {
    throw createValidationError(
      `tamano_bloque debe ser un entero entre 1 y ${MAX_BATCH_SIZE}.`,
      { tamano_bloque: value }
    );
  }

  return normalized;
}

function normalizeInitials(value) {
  const source = Array.isArray(value)
    ? value
    : value === undefined || value === null || value === ''
      ? []
      : [value];

  const normalized = [];
  const seen = new Set();

  for (const item of source) {
    const initials = cleanText(item).toUpperCase();
    if (!initials || seen.has(initials)) continue;

    seen.add(initials);
    normalized.push(initials);
  }

  return normalized;
}

function normalizeRecord(row, index) {
  const idProyecto = cleanText(row?.id_proyecto);
  const nombreProyecto = cleanText(row?.proyecto || row?.nombre_proyecto);
  const carpetaId = cleanText(row?.carpeta_id);

  const missing = [];
  if (!idProyecto) missing.push('id_proyecto');
  if (!nombreProyecto) missing.push('proyecto');
  if (!carpetaId) missing.push('carpeta_id');

  if (missing.length) {
    return {
      ok: false,
      error: {
        index,
        id_proyecto: idProyecto || null,
        carpeta_id: carpetaId || null,
        message: `Faltan o son inválidos los campos obligatorios: ${missing.join(', ')}.`
      }
    };
  }

  return {
    ok: true,
    value: {
      index,
      id_proyecto: idProyecto,
      nombre_proyecto: nombreProyecto,
      carpeta_id: carpetaId,
      id_carpeta: null,
      activo: normalizeActive(row?.activo),
      created_by: normalizeOptionalUserId(row?.created_by),
      updated_by: normalizeOptionalUserId(row?.updated_by),
      usuarios: {
        SUPERVISOR: normalizeInitials(row?.supervisor),
        ASESOR: normalizeInitials(row?.asesor),
        AUX_ADMIN: normalizeInitials(row?.aux ?? row?.aux_admin),
        LECTURA: normalizeInitials(row?.lectura)
      }
    }
  };
}

function splitIntoBatches(records, batchSize) {
  const batches = [];

  for (let index = 0; index < records.length; index += batchSize) {
    batches.push(records.slice(index, index + batchSize));
  }

  return batches;
}

function collectInitials(records) {
  const values = new Set();

  for (const record of records) {
    for (const initials of Object.values(record.usuarios)) {
      for (const value of initials) values.add(value);
    }
  }

  return [...values];
}

function mapBy(rows, key) {
  return new Map(rows.map((row) => [String(row[key]), row]));
}

function validateRequestRecords(records) {
  const errors = [];
  const seenProjects = new Map();
  const seenFolders = new Map();

  for (const record of records) {
    if (seenProjects.has(record.id_proyecto)) {
      errors.push({
        index: record.index,
        id_proyecto: record.id_proyecto,
        message: `id_proyecto duplicado en la petición. Primera aparición: índice ${seenProjects.get(record.id_proyecto)}.`
      });
    } else {
      seenProjects.set(record.id_proyecto, record.index);
    }

    const folderKey = record.carpeta_id;
    if (seenFolders.has(folderKey)) {
      errors.push({
        index: record.index,
        carpeta_id: record.carpeta_id,
        message: `carpeta_id duplicado en la petición. Primera aparición: índice ${seenFolders.get(folderKey)}.`
      });
    } else {
      seenFolders.set(folderKey, record.index);
    }
  }

  return errors;
}

function buildRelationships(projectDriveId, record, usersByInitials) {
  const relationships = [];

  for (const [type, initialsList] of Object.entries(record.usuarios)) {
    for (const initials of initialsList) {
      const user = usersByInitials.get(initials);
      if (!user) continue;

      relationships.push({
        id_proyecto_drive: projectDriveId,
        id_usuario: user.id_usuario,
        tipo: type,
        activo: 1
      });
    }
  }

  return relationships;
}

async function validateBatchReferences(connection, records) {
  const projectIds = records.map((record) => record.id_proyecto);
  const driveFolderIds = records.map((record) => record.carpeta_id);
  const initials = collectInitials(records);

  const [projects, folders, users, projectRelations] = await Promise.all([
    repository.findProjectsByIds(connection, projectIds),
    repository.findFoldersByDriveIds(connection, driveFolderIds),
    repository.findUsersByInitials(connection, initials),
    repository.findProjectDriveRelationsByProjectIds(connection, projectIds)
  ]);

  const internalFolderIds = folders.map((folder) => folder.id_carpeta);
  const folderRelations = await repository.findProjectDriveRelationsByFolderIds(
    connection,
    internalFolderIds
  );

  const projectsById = mapBy(projects, 'id_proyecto');
  const foldersByDriveId = mapBy(folders, 'carpeta_id');
  const usersByInitials = mapBy(users, 'iniciales');
  const existingByProject = mapBy(projectRelations, 'id_proyecto');
  const existingByFolder = mapBy(folderRelations, 'id_carpeta');
  const errors = [];

  for (const record of records) {
    const project = projectsById.get(record.id_proyecto);
    const folder = foldersByDriveId.get(record.carpeta_id);
    const folderRelation = folder
      ? existingByFolder.get(String(folder.id_carpeta))
      : null;

    if (!project) {
      errors.push({
        index: record.index,
        id_proyecto: record.id_proyecto,
        message: 'El proyecto no existe en ins_fl.'
      });
    }

    if (!folder) {
      errors.push({
        index: record.index,
        carpeta_id: record.carpeta_id,
        message: 'La carpeta no existe en instalaciones_drive_carpetas.'
      });
    } else if (Number(folder.activo) !== 1) {
      errors.push({
        index: record.index,
        carpeta_id: record.carpeta_id,
        message: 'La carpeta existe, pero está inactiva.'
      });
    } else {
      record.id_carpeta = Number(folder.id_carpeta);
    }

    if (folderRelation && String(folderRelation.id_proyecto) !== record.id_proyecto) {
      errors.push({
        index: record.index,
        id_proyecto: record.id_proyecto,
        carpeta_id: record.carpeta_id,
        message: `La carpeta ya está asignada al proyecto ${folderRelation.id_proyecto}.`
      });
    }

    for (const [type, initialsList] of Object.entries(record.usuarios)) {
      for (const userInitials of initialsList) {
        if (!usersByInitials.has(userInitials)) {
          errors.push({
            index: record.index,
            id_proyecto: record.id_proyecto,
            tipo: type,
            iniciales: userInitials,
            message: 'Las iniciales no corresponden a un usuario registrado.'
          });
        }
      }
    }
  }

  return {
    errors,
    projectsById,
    usersByInitials,
    existingByProject
  };
}

async function saveProject(connection, record, projectSource, existingRelation) {
  const canonicalName = cleanText(projectSource?.nombre_proyecto);
  const result = await repository.upsertProjectDrive(connection, {
    id_proyecto: record.id_proyecto,
    nombre_proyecto: canonicalName || record.nombre_proyecto,
    id_carpeta: record.id_carpeta,
    activo: record.activo,
    created_by: record.created_by,
    updated_by: record.updated_by
  });

  return {
    id_proyecto_drive: result.id_proyecto_drive,
    was_inserted: !existingRelation
  };
}

async function saveUsers(connection, projectDriveId, record, usersByInitials) {
  await repository.deleteProjectUsers(connection, projectDriveId);

  const relationships = buildRelationships(projectDriveId, record, usersByInitials);
  const inserted = await repository.insertProjectUsers(connection, relationships);

  return {
    relationships: inserted
  };
}

async function processBatch(records, batchNumber, totalBatches) {
  const connection = await repository.getConnection();

  try {
    await connection.beginTransaction();

    const references = await validateBatchReferences(connection, records);

    if (references.errors.length) {
      throw createValidationError(
        `El bloque ${batchNumber} contiene referencias inválidas.`,
        {
          bloque: batchNumber,
          total_bloques: totalBatches,
          errores: references.errors
        }
      );
    }

    const result = {
      insertados: 0,
      actualizados: 0,
      relaciones: 0
    };

    for (const record of records) {
      const existingRelation = references.existingByProject.get(record.id_proyecto);
      const savedProject = await saveProject(
        connection,
        record,
        references.projectsById.get(record.id_proyecto),
        existingRelation
      );

      const savedUsers = await saveUsers(
        connection,
        savedProject.id_proyecto_drive,
        record,
        references.usersByInitials
      );

      if (savedProject.was_inserted) result.insertados += 1;
      else result.actualizados += 1;

      result.relaciones += savedUsers.relationships;
    }

    await connection.commit();

    logger.info('Bloque de proyectos Drive procesado.', {
      bloque: batchNumber,
      total_bloques: totalBatches,
      proyectos: records.length,
      ...result
    });

    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      logger.error('No fue posible ejecutar rollback en sincronización Proyecto Drive.', {
        bloque: batchNumber,
        total_bloques: totalBatches,
        error: rollbackError.message
      });
    }

    throw error;
  } finally {
    connection.release();
  }
}

function buildFinalResponse(startedAt, projects, totals) {
  return {
    ok: true,
    proyectos: projects,
    insertados: totals.insertados,
    actualizados: totals.actualizados,
    relaciones: totals.relaciones,
    errores: 0,
    tiempo_ms: Date.now() - startedAt
  };
}

async function sync(body) {
  const startedAt = Date.now();
  const sourceRecords = Array.isArray(body?.registros) ? body.registros : [];
  const batchSize = normalizeBatchSize(body?.tamano_bloque);

  if (!sourceRecords.length) {
    throw createValidationError('No se recibieron registros para sincronizar.');
  }

  const records = [];
  const normalizationErrors = [];

  sourceRecords.forEach((row, index) => {
    const normalized = normalizeRecord(row, index);

    if (!normalized.ok) {
      normalizationErrors.push(normalized.error);
      return;
    }

    records.push(normalized.value);
  });

  normalizationErrors.push(...validateRequestRecords(records));

  if (normalizationErrors.length) {
    throw createValidationError('La petición contiene registros inválidos.', {
      errores: normalizationErrors
    });
  }

  const batches = splitIntoBatches(records, batchSize);
  const totals = {
    insertados: 0,
    actualizados: 0,
    relaciones: 0
  };

  logger.info('SYNC DRIVE PROYECTOS - Inicio.', {
    proyectos: records.length,
    tamano_bloque: batchSize,
    total_bloques: batches.length
  });

  for (let index = 0; index < batches.length; index += 1) {
    const batchNumber = index + 1;

    logger.info('SYNC DRIVE PROYECTOS - Bloque.', {
      bloque: batchNumber,
      total_bloques: batches.length,
      proyectos: batches[index].length
    });

    const result = await processBatch(batches[index], batchNumber, batches.length);
    totals.insertados += result.insertados;
    totals.actualizados += result.actualizados;
    totals.relaciones += result.relaciones;
  }

  const response = buildFinalResponse(startedAt, records.length, totals);

  logger.info('SYNC DRIVE PROYECTOS - Fin.', response);

  return response;
}

module.exports = {
  sync,
  processBatch,
  saveProject,
  saveUsers,
  buildFinalResponse
};
