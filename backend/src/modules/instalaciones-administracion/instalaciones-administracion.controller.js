'use strict';

const service = require('./instalaciones-administracion.service');

function sendKnownError_cor(error, res, next) {
  if (error && error.statusCode) {
    return res.status(error.statusCode).json({
      ok: false,
      code: error.code || 'INSTALACIONES_ADMINISTRACION_ERROR',
      message: error.message,
      details: error.details || undefined
    });
  }
  return next(error);
}

async function contract_cor(req, res, next) {
  try {
    const result = await service.getContract_cor(req);
    return res.json({ ok: true, source: 'backend', ...result });
  } catch (error) {
    return sendKnownError_cor(error, res, next);
  }
}

async function search_cor(req, res, next) {
  try {
    const result = await service.searchRecords_cor(req, req.query || {});
    return res.json({ ok: true, source: 'aiven', ...result });
  } catch (error) {
    return sendKnownError_cor(error, res, next);
  }
}

async function detail_cor(req, res, next) {
  try {
    const result = await service.getRecord_cor(req, req.params.id);
    return res.json({ ok: true, source: 'aiven', ...result });
  } catch (error) {
    return sendKnownError_cor(error, res, next);
  }
}

async function users_cor(req, res, next) {
  try {
    const result = await service.getResponsibleOptions_cor(req);
    return res.json({ ok: true, source: 'aiven', ...result });
  } catch (error) {
    return sendKnownError_cor(error, res, next);
  }
}

async function updateGroup_cor(req, res, next) {
  try {
    const result = await service.updateGroup_cor(
      req,
      req.params.id,
      String(req.params.grupo || '').trim(),
      req.body || {}
    );
    return res.json({ ok: true, source: 'aiven', ...result });
  } catch (error) {
    return sendKnownError_cor(error, res, next);
  }
}


// [Aster | 2026-10-08 | ASTER-MG | FIX_2_INSTALACIONES_ADMINISTRACION_DETALLE_EQUIPO_V001]
async function updateDetail_cor(req, res, next) {
  try {
    const result = await service.updateDetail_cor(req, req.params.id, req.body || {});
    return res.json({ok: true, source: 'aiven', ...result});
  } catch (error) {
    return sendKnownError_cor(error, res, next);
  }
}

// [Aster | 2026-10-08 | ASTER-MG | FIX_1_INSTALACIONES_ADMINISTRACION_REDISENO_V001]
async function projects_cor(req,res,next) {
  try { return res.json({ok:true,...await service.listProjects_cor(req,req.query||{})}); }
  catch(error) { return sendKnownError_cor(error,res,next); }
}
async function projectEquipments_cor(req,res,next) {
  try { return res.json({ok:true,...await service.listProjectEquipments_cor(req,req.params.projectKey,req.query||{})}); }
  catch(error) { return sendKnownError_cor(error,res,next); }
}
async function browseFilters_cor(req,res,next) {
  try { return res.json({ok:true,...await service.listBrowseFilters_cor(req)}); }
  catch(error) { return sendKnownError_cor(error,res,next); }
}


// [Aster | 2026-10-09 | ASTER-MG | FIX_3_INSTALACIONES_ADMINISTRACION_EDICION_MULTIPLE_V001]
async function updateMulti_cor(req, res, next) {
  try {
    const result = await service.updateMulti_cor(req, req.params.projectKey, req.body || {});
    return res.json({ ok: true, source: 'aiven', ...result });
  } catch (error) {
    return sendKnownError_cor(error, res, next);
  }
}

module.exports = {
  contract_cor,
  search_cor,
  detail_cor,
  users_cor,
  updateGroup_cor,
  updateDetail_cor,
  updateMulti_cor,
  projects_cor,
  projectEquipments_cor,
  browseFilters_cor
};
