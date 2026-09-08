'use strict';

const db = require('../../config/db');
const repository = require('./portafolio-seguimiento-especial.repository');
const {
  buildPortafolioScopeSql_gnral
} = require('../../services/information-record-scope-gnral.service');

function httpError(status, message, code = null) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function positiveUserId(user) {
  const id = Number(user?.id_SB || user?.id || user?.user_id || 0);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function assertPersonalContext(req) {
  const actor = positiveUserId(req?.actorUser || req?.user);
  const effective = positiveUserId(req?.contextUser || req?.user);
  if (actor && effective && actor !== effective) {
    throw httpError(
      403,
      'Seguimiento Especial no está disponible en modo Visor porque su estado es personal por usuario.',
      'VIEWER_READ_ONLY'
    );
  }
}

function actorId(req) {
  assertPersonalContext(req);
  const id = positiveUserId(req?.actorUser || req?.user || req?.contextUser);
  if (!id) throw httpError(401, 'Sesión requerida.', 'AUTH_REQUIRED');
  return id;
}

function requestedActive(req) {
  if (!req?.body || !Object.prototype.hasOwnProperty.call(req.body, 'activo')) {
    throw httpError(400, 'activo es obligatorio.', 'SEGUIMIENTO_ESPECIAL_ACTIVE_REQUIRED');
  }
  const value = req.body.activo;
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  throw httpError(400, 'activo debe ser booleano o 0/1.', 'SEGUIMIENTO_ESPECIAL_ACTIVE_INVALID');
}

function projectRef(req) {
  const value = String(req?.params?.proyecto || '').trim();
  if (!value) throw httpError(400, 'Proyecto requerido.', 'PROJECT_REQUIRED');
  return value;
}

function equipmentRef(req) {
  const value = String(req?.params?.codigo || '').trim();
  if (!value) throw httpError(400, 'Equipo requerido.', 'EQUIPMENT_REQUIRED');
  return value;
}

function schemaError(error) {
  if (error?.code === 'ER_NO_SUCH_TABLE' && /portafolio_interes/i.test(String(error.message || ''))) {
    return httpError(
      503,
      'La tabla portafolio_interes requerida por Seguimiento Especial no está disponible en Aiven.',
      'PORTAFOLIO_INTERES_SCHEMA_MISSING'
    );
  }
  return error;
}

async function withTransaction(work) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const value = await work(connection);
    await connection.commit();
    return value;
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw schemaError(error);
  } finally {
    connection.release();
  }
}

function projectStatePayload(project, state) {
  const active = Boolean(state.suscripcionProyecto);
  return {
    tipo: 'PROYECTO',
    proyecto: project,
    activo: active,
    parcial: active && state.activos < state.total,
    total_equipos: state.total,
    equipos_activos: state.activos,
    updated_at: state.updatedAt || null
  };
}

async function list(req) {
  const userId = actorId(req);
  const scope = buildPortafolioScopeSql_gnral(req, 'p');
  try {
    const projectNames = await repository.listActiveProjectNames(db, userId, scope);
    const [projects, equipments] = await Promise.all([
      repository.listProjectSummaries(db, userId, projectNames, scope),
      repository.listActiveEquipment(db, userId, scope)
    ]);
    return {
      ok: true,
      data: {
        proyectos: projects,
        equipos: equipments,
        resumen: {
          proyectos: projects.length,
          equipos: equipments.length
        }
      }
    };
  } catch (error) {
    throw schemaError(error);
  }
}

async function getProject(req) {
  const userId = actorId(req);
  const project = projectRef(req);
  const scope = buildPortafolioScopeSql_gnral(req, 'p');
  try {
    const state = await repository.getProjectFollowupState(db, userId, project, scope);
    if (!state.total) throw httpError(404, 'Proyecto no encontrado dentro de tu alcance.', 'PROJECT_NOT_FOUND');
    return { ok: true, data: projectStatePayload(project, state) };
  } catch (error) {
    throw schemaError(error);
  }
}

async function setProject(req) {
  const userId = actorId(req);
  const project = projectRef(req);
  const active = requestedActive(req);
  const scope = buildPortafolioScopeSql_gnral(req, 'p');

  return withTransaction(async (connection) => {
    const equipments = await repository.listProjectEquipmentsScoped(connection, project, scope);
    if (!equipments.length) throw httpError(404, 'Proyecto no encontrado dentro de tu alcance.', 'PROJECT_NOT_FOUND');

    await repository.bulkSetProjectFollowup(connection, {
      userId,
      project,
      scope,
      active
    });

    const state = await repository.getProjectFollowupState(connection, userId, project, scope);
    return { ok: true, data: projectStatePayload(project, state) };
  });
}

async function getEquipment(req) {
  const userId = actorId(req);
  const code = equipmentRef(req);
  const scope = buildPortafolioScopeSql_gnral(req, 'p');
  try {
    const equipment = await repository.findEquipmentScoped(db, code, scope);
    if (!equipment) throw httpError(404, 'Equipo no encontrado dentro de tu alcance.', 'EQUIPMENT_NOT_FOUND');
    const followup = await repository.getEquipmentFollowup(db, userId, equipment.id_portafolio);
    const inherited = !followup && await repository.hasActiveProjectSubscription(db, userId, equipment.proyecto);
    return {
      ok: true,
      data: {
        tipo: 'EQUIPO',
        id_portafolio: Number(equipment.id_portafolio),
        equipo: equipment.numero_equipo,
        proyecto: equipment.proyecto,
        activo: followup ? Number(followup.activo || 0) === 1 : Boolean(inherited),
        origen: followup?.origen || (inherited ? 'PROYECTO_HEREDADO' : null),
        updated_at: followup?.updated_at || null
      }
    };
  } catch (error) {
    throw schemaError(error);
  }
}

async function setEquipment(req) {
  const userId = actorId(req);
  const code = equipmentRef(req);
  const active = requestedActive(req);
  const scope = buildPortafolioScopeSql_gnral(req, 'p');

  return withTransaction(async (connection) => {
    const equipment = await repository.findEquipmentScoped(connection, code, scope);
    if (!equipment) throw httpError(404, 'Equipo no encontrado dentro de tu alcance.', 'EQUIPMENT_NOT_FOUND');

    await repository.upsertEquipmentFollowup(connection, {
      userId,
      idPortafolio: equipment.id_portafolio,
      origin: 'EQUIPO',
      active
    });

    const followup = await repository.getEquipmentFollowup(connection, userId, equipment.id_portafolio);
    return {
      ok: true,
      data: {
        tipo: 'EQUIPO',
        id_portafolio: Number(equipment.id_portafolio),
        equipo: equipment.numero_equipo,
        proyecto: equipment.proyecto,
        activo: Number(followup?.activo || 0) === 1,
        origen: followup?.origen || null,
        updated_at: followup?.updated_at || null
      }
    };
  });
}

module.exports = {
  list,
  getProject,
  setProject,
  getEquipment,
  setEquipment
};
