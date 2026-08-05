'use strict';

const db = require('../../config/db');
const repository = require('./ventas-dashboard.repository');

function positiveInteger(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error(`${fieldName} es requerido y debe ser un entero positivo.`);
    error.status = 400;
    throw error;
  }
  return parsed;
}

async function listCommercialUsers() {
  const usuarios = await repository.listCommercialUsers(db);
  return { ok: true, usuarios };
}

async function getCommercialKpis(query = {}) {
  const userId = positiveInteger(query.usuario_id, 'usuario_id');
  const allowed = await repository.isCommercialUser(db, userId);
  if (!allowed) {
    const error = new Error('El responsable comercial seleccionado no está activo o no tiene un rol permitido para Dashboard Ventas.');
    error.status = 404;
    throw error;
  }

  const raw = await repository.getCommercialKpis(db, userId);
  return {
    ok: true,
    usuario_id: userId,
    kpis: {
      cotizados: {
        cotizaciones: Number(raw.cotizados_cotizaciones || 0),
        equipos: Number(raw.cotizados_equipos || 0)
      },
      vendidos: {
        cotizaciones: Number(raw.vendidos_cotizaciones || 0),
        equipos: Number(raw.vendidos_equipos || 0)
      },
      perdidos: {
        cotizaciones: Number(raw.perdidos_cotizaciones || 0),
        equipos: Number(raw.perdidos_equipos || 0)
      }
    }
  };
}

async function getCommercialTables(query = {}) {
  const userId = positiveInteger(query.usuario_id, 'usuario_id');
  const allowed = await repository.isCommercialUser(db, userId);
  if (!allowed) {
    const error = new Error('El responsable comercial seleccionado no está activo o no tiene un rol permitido para Dashboard Ventas.');
    error.status = 404;
    throw error;
  }
  return { ok: true, usuario_id: userId, tablas: await repository.getCommercialTables(db, userId) };
}



async function getOperationalTables(query = {}) {
  const userId = positiveInteger(query.usuario_id, 'usuario_id');
  const allowed = await repository.isCommercialUser(db, userId);
  if (!allowed) {
    const error = new Error('El responsable comercial seleccionado no está activo o no tiene un rol permitido para Dashboard Ventas.');
    error.status = 404;
    throw error;
  }
  return { ok: true, usuario_id: userId, tablas: await repository.getOperationalTables(db, userId) };
}

module.exports = { listCommercialUsers, getCommercialKpis, getCommercialTables, getOperationalTables };
