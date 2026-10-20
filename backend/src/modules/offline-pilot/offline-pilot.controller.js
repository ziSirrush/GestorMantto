'use strict';

const service = require('./offline-pilot.service');
const exporter = require('./offline-pilot.export');
const synchronizer = require('./offline-pilot.sync');

async function getCapabilities(req, res, next) {
  try {
    const data = await service.getCapabilities(req);
    return res.status(200).json({
      ok: true,
      source: 'aiven',
      generated_at: new Date().toISOString(),
      data
    });
  } catch (error) {
    if (typeof next === 'function') return next(error);
    return res.status(error?.status || 500).json({ok: false, code: error?.code || 'OFFLINE_CAPABILITIES_ERROR', message: error?.message || 'No fue posible validar el catalogo offline.'});
  }
}

async function exportResumenDiaManifest(req, res, next) {
  try { return res.status(200).json(await exporter.getManifest(req)); }
  catch (error) { return next(error); }
}

async function exportResumenDiaPage(req, res, next) {
  try { return res.status(200).json(await exporter.getPage(req)); }
  catch (error) { return next(error); }
}

async function syncOfflineAction(req,res,next) {
  try {
    const result=await synchronizer.syncAction(req,req.body);
    return res.status(200).json(result);
  }catch(error){
    // Errores funcionales especificos pueden devolverse sin exponer detalles SQL.
    if(error?.code?.startsWith('OFFLINE_SYNC_')&&Number.isInteger(error.status)){
      return res.status(error.status).json({ok:false,code:error.code,message:error.message});
    }
    return next(error);
  }
}
module.exports = {getCapabilities, exportResumenDiaManifest, exportResumenDiaPage, syncOfflineAction};
