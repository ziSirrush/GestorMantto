'use strict';

// [Aster | 2026-10-07 | ASTER-MG | FASE 1 ENTREGAS V001]

const service = require('./entregas-control.service');

function effectiveUserId_gnral(req) {
  const user = req.contextUser || req.user;
  return Number(user && (user.id_SB || user.id || user.user_id));
}

function response_gnral(res, data, status = 200) {
  return res.status(status).json({
    ok: true,
    source: 'aiven',
    generated_at: new Date().toISOString(),
    data
  });
}

async function opciones_gnral(_req, res, next) {
  try { return response_gnral(res, await service.opciones_gnral()); }
  catch (error) { return next(error); }
}

async function programadas_gnral(req, res, next) {
  try { return response_gnral(res, await service.listarProgramadas_gnral(effectiveUserId_gnral(req), req.query || {})); }
  catch (error) { return next(error); }
}

async function programadaDetalle_gnral(req, res, next) {
  try { return response_gnral(res, await service.detalleProgramada_gnral(effectiveUserId_gnral(req), req.params.id)); }
  catch (error) { return next(error); }
}

async function programadaCrear_gnral(req, res, next) {
  try { return response_gnral(res, await service.crearProgramada_gnral(effectiveUserId_gnral(req), req.body || {}), 201); }
  catch (error) { return next(error); }
}

async function programadaDesactivar_gnral(req, res, next) {
  try { return response_gnral(res, await service.desactivarProgramada_gnral(effectiveUserId_gnral(req), req.params.id)); }
  catch (error) { return next(error); }
}

async function misEntregas_gnral(req, res, next) {
  try { return response_gnral(res, await service.misEntregas_gnral(effectiveUserId_gnral(req), req.query || {})); }
  catch (error) { return next(error); }
}

async function archivoSubir_gnral(req, res, next) {
  try {
    return response_gnral(
      res,
      await service.subirArchivo_gnral(effectiveUserId_gnral(req), req.params.id, req.file),
      200
    );
  } catch (error) { return next(error); }
}

async function archivoAcceso_gnral(req, res, next) {
  try { return response_gnral(res, await service.archivoAcceso_gnral(req, req.params.id)); }
  catch (error) { return next(error); }
}

async function validacionPendiente_gnral(req, res, next) {
  try { return response_gnral(res, await service.validacionPendiente_gnral(effectiveUserId_gnral(req))); }
  catch (error) { return next(error); }
}

async function validar_gnral(req, res, next) {
  try { return response_gnral(res, await service.validar_gnral(effectiveUserId_gnral(req), req.params.id, req.body || {})); }
  catch (error) { return next(error); }
}

async function indicadores_gnral(req, res, next) {
  try { return response_gnral(res, await service.indicadores_gnral(effectiveUserId_gnral(req))); }
  catch (error) { return next(error); }
}

module.exports = Object.freeze({
  opciones_gnral,
  programadas_gnral,
  programadaDetalle_gnral,
  programadaCrear_gnral,
  programadaDesactivar_gnral,
  misEntregas_gnral,
  archivoSubir_gnral,
  archivoAcceso_gnral,
  validacionPendiente_gnral,
  validar_gnral,
  indicadores_gnral
});
