'use strict';

const db = require('../../config/db');
const repository = require('./portafolio-interes.repository');
const {
  buildPortafolioScopeSql_gnral
} = require('../../services/information-record-scope-gnral.service');

function httpError(status, message, code = null) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function actorId(req) {
  const user = req?.actorUser || req?.user || req?.contextUser || {};
  const id = Number(user.id_SB || user.id || user.user_id || 0);
  if (!Number.isInteger(id) || id <= 0) throw httpError(401, 'Sesión requerida.', 'AUTH_REQUIRED');
  return id;
}

function requestedActive(req) {
  if (!req?.body || !Object.prototype.hasOwnProperty.call(req.body, 'activo')) {
    throw httpError(400, 'activo es obligatorio.', 'INTEREST_ACTIVE_REQUIRED');
  }
  const value = req.body.activo;
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  throw httpError(400, 'activo debe ser booleano o 0/1.', 'INTEREST_ACTIVE_INVALID');
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
    return httpError(503, 'La tabla portafolio_interes no está disponible en Aiven.', 'PORTAFOLIO_INTERES_SCHEMA_MISSING');
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

async function getProjectInterest(req) {
  const userId = actorId(req);
  const project = projectRef(req);
  const scope = buildPortafolioScopeSql_gnral(req, 'p');
  try {
    const state = await repository.getProjectInterestState(db, userId, project, scope);
    if (!state.total) throw httpError(404, 'Proyecto no encontrado dentro de tu alcance.', 'PROJECT_NOT_FOUND');
    return {
      ok: true,
      data: {
        tipo: 'PROYECTO',
        proyecto: project,
        activo: Boolean(state.suscripcion_proyecto),
        parcial: Boolean(state.suscripcion_proyecto) && state.activos < state.total,
        total_equipos: state.total,
        equipos_activos: state.activos
      }
    };
  } catch (error) {
    throw schemaError(error);
  }
}

async function setProjectInterest(req) {
  const userId = actorId(req);
  const project = projectRef(req);
  const active = requestedActive(req);
  const scope = buildPortafolioScopeSql_gnral(req, 'p');

  return withTransaction(async (connection) => {
    const equipments = await repository.listProjectEquipmentsScoped(connection, project, scope);
    if (!equipments.length) throw httpError(404, 'Proyecto no encontrado dentro de tu alcance.', 'PROJECT_NOT_FOUND');

    await repository.bulkSetProjectInterest(connection, {
      userId,
      project,
      scope,
      active
    });



    const state = await repository.getProjectInterestState(connection, userId, project, scope);
    return {
      ok: true,
      data: {
        tipo: 'PROYECTO',
        proyecto: project,
        activo: Boolean(state.suscripcion_proyecto),
        parcial: Boolean(state.suscripcion_proyecto) && state.activos < state.total,
        total_equipos: state.total,
        equipos_activos: state.activos
      }
    };
  });
}

async function getEquipmentInterest(req) {
  const userId = actorId(req);
  const code = equipmentRef(req);
  const scope = buildPortafolioScopeSql_gnral(req, 'p');
  try {
    const equipment = await repository.findEquipmentScoped(db, code, scope);
    if (!equipment) throw httpError(404, 'Equipo no encontrado dentro de tu alcance.', 'EQUIPMENT_NOT_FOUND');
    const interest = await repository.getEquipmentInterest(db, userId, equipment.id_portafolio);
    const inherited = !interest && await repository.hasActiveProjectSubscription(db, userId, equipment.proyecto);
    return {
      ok: true,
      data: {
        tipo: 'EQUIPO',
        id_portafolio: Number(equipment.id_portafolio),
        equipo: equipment.numero_equipo,
        proyecto: equipment.proyecto,
        activo: interest ? Number(interest.activo || 0) === 1 : Boolean(inherited),
        origen: interest?.origen || (inherited ? 'PROYECTO_HEREDADO' : null)
      }
    };
  } catch (error) {
    throw schemaError(error);
  }
}

async function setEquipmentInterest(req) {
  const userId = actorId(req);
  const code = equipmentRef(req);
  const active = requestedActive(req);
  const scope = buildPortafolioScopeSql_gnral(req, 'p');

  return withTransaction(async (connection) => {
    const equipment = await repository.findEquipmentScoped(connection, code, scope);
    if (!equipment) throw httpError(404, 'Equipo no encontrado dentro de tu alcance.', 'EQUIPMENT_NOT_FOUND');

    await repository.upsertEquipmentInterest(connection, {
      userId,
      idPortafolio: equipment.id_portafolio,
      origin: 'EQUIPO',
      active
    });



    const interest = await repository.getEquipmentInterest(connection, userId, equipment.id_portafolio);
    return {
      ok: true,
      data: {
        tipo: 'EQUIPO',
        id_portafolio: Number(equipment.id_portafolio),
        equipo: equipment.numero_equipo,
        proyecto: equipment.proyecto,
        activo: Number(interest?.activo || 0) === 1,
        origen: interest?.origen || null
      }
    };
  });
}

module.exports = {
  getProjectInterest,
  setProjectInterest,
  getEquipmentInterest,
  setEquipmentInterest
};
