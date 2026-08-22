'use strict';

const service = require('./instalaciones-documentacion.service');

function statusFromError_cor(error) {
  const status = Number(error && (error.statusCode || error.status));
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
}

async function getBootstrap_cor(req, res) {
  try {
    const result = await service.getBootstrap_cor(req);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(statusFromError_cor(error)).json({
      ok: false,
      code: error.code || 'INSTALACIONES_DOCUMENTACION_ERROR',
      message: error.message || 'Error consultando Documentación Pendiente.'
    });
  }
}

module.exports = {
  getBootstrap_cor
};
