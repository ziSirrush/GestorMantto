'use strict';

// [Aster | 2026-09-17 | ASTER-MG | FASE 2 INFORMES MOTOR BACKEND V001]
const service = require('./informes.service');

function sendError(res, error, fallbackMessage) {
  const status = Number(error && error.statusCode) || 500;
  const payload = {
    ok: false,
    message: status >= 500 ? fallbackMessage : error.message
  };
  if (status >= 500) payload.error = error.message;
  return res.status(status).json(payload);
}

async function getOpciones(req, res) {
  try {
    const resultado = await service.getOpciones(req);
    return res.json(resultado);
  } catch (error) {
    return sendError(res, error, 'Error obteniendo opciones de filtro de Informes.');
  }
}

async function generarInforme(req, res) {
  try {
    const resultado = await service.generarInforme(req);
    return res.json(resultado);
  } catch (error) {
    return sendError(res, error, 'Error generando el informe.');
  }
}

async function getMtbc(req, res) {
  try {
    const resultado = await service.getMtbc(req);
    return res.json(resultado);
  } catch (error) {
    return sendError(res, error, 'Error calculando MTBC del informe.');
  }
}

module.exports = { getOpciones, generarInforme, getMtbc };
