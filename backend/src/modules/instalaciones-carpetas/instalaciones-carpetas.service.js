'use strict';

const interactionsService = require('../../services/interactions/interactions.service');
const repository = require('./instalaciones-carpetas.repository');

const PERMISSIONS_COR = Object.freeze({
  acceso_visual: 'INSTALACIONES_CARPETAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  carpetas_ver: 'INSTALACIONES_CARPETAS_CARPETAS_REGISTRADAS_LISTADO.VER',
  carpetas_buscar: 'INSTALACIONES_CARPETAS_CARPETAS_REGISTRADAS_LISTADO.BUSCAR',
  carpetas_redirigir: 'INSTALACIONES_CARPETAS_CARPETAS_REGISTRADAS_LISTADO.REDIRIGIR',
  proyectos_ver: 'INSTALACIONES_CARPETAS_PROYECTOS_SIN_CARPETA_LISTADO.VER',
  proyectos_buscar: 'INSTALACIONES_CARPETAS_PROYECTOS_SIN_CARPETA_LISTADO.BUSCAR',
  relacionador_ver: 'INSTALACIONES_CARPETAS_RELACIONADOR_FORMULARIO.VER',
  relacionador_crear: 'INSTALACIONES_CARPETAS_RELACIONADOR_FORMULARIO.CREAR'
});

function makeError_cor(statusCode, code, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function cleanText_cor(value, maxLength = 255) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text.slice(0, maxLength);
}

function positiveInteger_cor(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function permissionObject_cor(rows, accessGranted) {
  const result = {};
  Object.entries(PERMISSIONS_COR).forEach(([key, code]) => {
    result[key] = code === PERMISSIONS_COR.acceso_visual
      ? Boolean(accessGranted)
      : Boolean(rows[code]);
  });
  return result;
}

function folderForPanel_cor(row, canRedirect) {
  return {
    id_carpeta: Number(row.id_carpeta),
    nombre_carpeta: row.nombre_carpeta || null,
    carpeta_id: row.carpeta_id || null,
    enlace: canRedirect ? (row.enlace || null) : null,
    activo: Number(row.activo) === 1,
    fecha_sincronizacion: row.fecha_sincronizacion || null,
    updated_at: row.updated_at || null,
    id_proyecto_drive: row.id_proyecto_drive ? Number(row.id_proyecto_drive) : null,
    id_proyecto: row.id_proyecto || null,
    nombre_proyecto: row.nombre_proyecto || null,
    vinculado_at: row.vinculado_at || null
  };
}

function folderForSelector_cor(row) {
  return {
    id_carpeta: Number(row.id_carpeta),
    nombre_carpeta: row.nombre_carpeta || null,
    carpeta_id: row.carpeta_id || null
  };
}

function projectForList_cor(row) {
  const activo = Number(row.proyecto_activo) === 1;
  return {
    id_proyecto: row.id_proyecto || null,
    nombre_proyecto: row.nombre_proyecto || null,
    ciudad: row.ciudad || null,
    estado: row.estado || null,
    supervisores: row.supervisores || null,
    total_equipos: Number(row.total_equipos) || 0,
    equipos_cerrados: Number(row.equipos_cerrados) || 0,
    proyecto_activo: activo,
    proyecto_estado: activo ? 'ACTIVO' : 'INACTIVO'
  };
}

async function getBootstrap_cor(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw makeError_cor(401, 'INSTALACIONES_CARPETAS_USER_REQUIRED', 'Sesión sin usuario válido.');
  }

  const codesWithoutAccess = Object.values(PERMISSIONS_COR)
    .filter(code => code !== PERMISSIONS_COR.acceso_visual);
  const permissionRows = await repository.getEffectivePermissionsBulk_cor(userId, codesWithoutAccess);
  const permissions = permissionObject_cor(permissionRows, true);

  const needsFolders = permissions.carpetas_ver;
  const needsProjects = permissions.proyectos_ver || permissions.relacionador_ver;

  const [folderRows, projectRows, availableFolderRows] = await Promise.all([
    needsFolders ? repository.listRegisteredFolders_cor() : Promise.resolve([]),
    needsProjects ? repository.listProjectsWithoutFolder_cor() : Promise.resolve([]),
    permissions.relacionador_ver
      ? repository.listAvailableFolders_cor()
      : Promise.resolve([])
  ]);

  return {
    generated_at: new Date().toISOString(),
    carpetas_registradas: permissions.carpetas_ver
      ? folderRows.map(row => folderForPanel_cor(row, permissions.carpetas_redirigir))
      : [],
    proyectos_sin_carpeta: needsProjects
      ? projectRows.map(projectForList_cor)
      : [],
    carpetas_disponibles: permissions.relacionador_ver
      ? availableFolderRows.map(folderForSelector_cor)
      : [],
    permissions
  };
}

function relationInput_cor(body) {
  const projectId = cleanText_cor(body && body.id_proyecto, 100);
  const folderId = positiveInteger_cor(body && body.id_carpeta);

  if (!projectId) {
    throw makeError_cor(
      400,
      'INSTALACIONES_CARPETAS_PROJECT_REQUIRED',
      'Selecciona un proyecto válido para relacionar.'
    );
  }
  if (!folderId) {
    throw makeError_cor(
      400,
      'INSTALACIONES_CARPETAS_FOLDER_REQUIRED',
      'Selecciona una carpeta válida para relacionar.'
    );
  }

  return { id_proyecto: projectId, id_carpeta: folderId };
}

function activeRelationConflict_cor(projectRelation, folderRelation, input) {
  if (projectRelation && Number(projectRelation.activo) === 1) {
    if (Number(projectRelation.id_carpeta) === input.id_carpeta) {
      return { same: true, relation: projectRelation };
    }
    throw makeError_cor(
      409,
      'INSTALACIONES_CARPETAS_PROJECT_ALREADY_LINKED',
      'El proyecto ya tiene una carpeta relacionada.',
      {
        id_proyecto: input.id_proyecto,
        id_carpeta_actual: Number(projectRelation.id_carpeta),
        id_proyecto_drive: Number(projectRelation.id_proyecto_drive)
      }
    );
  }

  if (folderRelation && Number(folderRelation.activo) === 1) {
    if (String(folderRelation.id_proyecto) === input.id_proyecto) {
      return { same: true, relation: folderRelation };
    }
    throw makeError_cor(
      409,
      'INSTALACIONES_CARPETAS_FOLDER_ALREADY_LINKED',
      'La carpeta seleccionada ya está relacionada con otro proyecto.',
      {
        id_carpeta: input.id_carpeta,
        id_proyecto_actual: folderRelation.id_proyecto,
        id_proyecto_drive: Number(folderRelation.id_proyecto_drive)
      }
    );
  }

  return { same: false, relation: null };
}

function chooseInactiveRelation_cor(projectRelation, folderRelation) {
  const projectInactive = projectRelation && Number(projectRelation.activo) === 0
    ? projectRelation
    : null;
  const folderInactive = folderRelation && Number(folderRelation.activo) === 0
    ? folderRelation
    : null;

  if (projectInactive && folderInactive) {
    if (Number(projectInactive.id_proyecto_drive) === Number(folderInactive.id_proyecto_drive)) {
      return projectInactive;
    }

    throw makeError_cor(
      409,
      'INSTALACIONES_CARPETAS_INACTIVE_RELATION_CONFLICT',
      'El proyecto y la carpeta pertenecen a dos relaciones inactivas diferentes. No se fusionan automáticamente para preservar la trazabilidad.',
      {
        relacion_inactiva_proyecto: Number(projectInactive.id_proyecto_drive),
        relacion_inactiva_carpeta: Number(folderInactive.id_proyecto_drive)
      }
    );
  }

  return projectInactive || folderInactive || null;
}

async function createRelation_cor(req, userId, body) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw makeError_cor(401, 'INSTALACIONES_CARPETAS_USER_REQUIRED', 'Sesión sin usuario válido.');
  }
  if (req && req.viewerContext && req.viewerContext.active) {
    throw makeError_cor(
      403,
      'VIEWER_READ_ONLY',
      'El Visor de usuarios es de solo lectura y no permite relacionar proyectos con carpetas.'
    );
  }

  const input = relationInput_cor(body || {});
  const connection = await repository.getConnection_cor();

  try {
    await connection.beginTransaction();

    const project = await repository.findProjectByIdForUpdate_cor(connection, input.id_proyecto);
    if (!project) {
      throw makeError_cor(
        404,
        'INSTALACIONES_CARPETAS_PROJECT_NOT_FOUND',
        'El proyecto ya no existe en Instalaciones.'
      );
    }

    const folder = await repository.findFolderByIdForUpdate_cor(connection, input.id_carpeta);
    if (!folder) {
      throw makeError_cor(
        404,
        'INSTALACIONES_CARPETAS_FOLDER_NOT_FOUND',
        'La carpeta seleccionada ya no existe en el catálogo sincronizado.'
      );
    }
    if (Number(folder.activo) !== 1) {
      throw makeError_cor(
        409,
        'INSTALACIONES_CARPETAS_FOLDER_INACTIVE',
        'La carpeta seleccionada está inactiva y no puede relacionarse.'
      );
    }

    const projectRelation = await repository.findRelationByProjectForUpdate_cor(
      connection,
      input.id_proyecto
    );
    const folderRelation = await repository.findRelationByFolderForUpdate_cor(
      connection,
      input.id_carpeta
    );

    const activeConflict = activeRelationConflict_cor(projectRelation, folderRelation, input);
    if (activeConflict.same) {
      const relation = await repository.getRelationDetail_cor(
        connection,
        activeConflict.relation.id_proyecto_drive
      );
      await connection.commit();
      return {
        changed: false,
        message: 'El proyecto ya estaba relacionado con esa carpeta.',
        relation,
        interaction: null
      };
    }

    const canonicalName = cleanText_cor(project.nombre_proyecto, 255) || null;
    const reusableRelation = chooseInactiveRelation_cor(projectRelation, folderRelation);
    let relationId;
    let reusedInactive = false;

    if (reusableRelation) {
      const affected = await repository.reactivateRelation_cor(
        connection,
        reusableRelation.id_proyecto_drive,
        {
          id_proyecto: input.id_proyecto,
          nombre_proyecto: canonicalName,
          id_carpeta: input.id_carpeta,
          id_usuario: userId
        }
      );
      if (affected !== 1) {
        throw makeError_cor(
          409,
          'INSTALACIONES_CARPETAS_RELATION_UPDATE_CONFLICT',
          'La relación cambió mientras se intentaba guardar. Vuelve a cargar el módulo.'
        );
      }
      relationId = Number(reusableRelation.id_proyecto_drive);
      reusedInactive = true;
    } else {
      relationId = await repository.insertRelation_cor(connection, {
        id_proyecto: input.id_proyecto,
        nombre_proyecto: canonicalName,
        id_carpeta: input.id_carpeta,
        id_usuario: userId
      });
    }

    const relation = await repository.getRelationDetail_cor(connection, relationId);
    const interaction = await interactionsService.recordFromRequest_gnral(req, {
      tipo_interaccion: 'CREAR',
      modulo: 'instalaciones-carpetas',
      entidad: 'proyecto_drive',
      id_referencia: input.id_proyecto,
      titulo: 'Relación Proyecto - Carpeta guardada',
      descripcion: `Se relacionó el proyecto ${input.id_proyecto} con la carpeta ${folder.nombre_carpeta || input.id_carpeta}.`,
      ruta_destino: 'instalaciones-carpetas',
      payload_json: {
        id_proyecto_drive: relationId,
        id_proyecto: input.id_proyecto,
        nombre_proyecto: canonicalName,
        id_carpeta: input.id_carpeta,
        carpeta_id: folder.carpeta_id || null,
        nombre_carpeta: folder.nombre_carpeta || null,
        reutilizo_relacion_inactiva: reusedInactive
      },
      detalle_json: {
        source: 'instalaciones-carpetas-relacionador',
        operation: reusedInactive ? 'REACTIVAR_RELACION' : 'CREAR_RELACION'
      },
      metodo_http: 'POST',
      endpoint: req.originalUrl || '/api/instalaciones/carpetas/relacion'
    }, { executor: connection });

    await connection.commit();

    return {
      changed: true,
      message: 'Proyecto y carpeta relacionados correctamente.',
      relation,
      interaction: interaction
        ? {
            id_interaccion: interaction.id_interaccion,
            tipo_interaccion: interaction.tipo_interaccion
          }
        : null
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}

    if (error && error.code === 'ER_DUP_ENTRY' && !error.statusCode) {
      throw makeError_cor(
        409,
        'INSTALACIONES_CARPETAS_RELATION_DUPLICATE',
        'El proyecto o la carpeta fueron relacionados por otra operación. Vuelve a cargar el módulo.'
      );
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  PERMISSIONS_COR,
  getBootstrap_cor,
  createRelation_cor
};
