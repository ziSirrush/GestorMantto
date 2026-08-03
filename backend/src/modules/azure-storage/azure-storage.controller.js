const service = require('./azure-storage.service');

async function getStatus(req, res, next) {
  try {
    const data = await service.status_gnral(req.user);
    return res.status(200).json({ ok: true, data });
  } catch (error) { return next(error); }
}

async function getContractStatus(req, res, next) {
  try {
    const data = await service.contractStatus_gnral(req.user, req.query || {});
    return res.status(200).json({ ok: true, data });
  } catch (error) { return next(error); }
}

async function testUpload(req, res, next) {
  try {
    const data = await service.testUpload_gnral(req.user, req.file, req.body || {});
    return res.status(201).json({
      ok: true,
      message: 'Archivo de diagnóstico cargado en Azure Blob Storage.',
      data
    });
  } catch (error) { return next(error); }
}

async function testAccess(req, res, next) {
  try {
    const data = await service.testAccess_gnral(req.user, req.query || {});
    return res.status(200).json({ ok: true, data });
  } catch (error) { return next(error); }
}

async function testDelete(req, res, next) {
  try {
    const data = await service.testDelete_gnral(req.user, req.body || {});
    return res.status(200).json({ ok: true, message: data.deleted ? 'Blob eliminado.' : 'El blob no existía.', data });
  } catch (error) { return next(error); }
}

async function testLifecycle(req, res, next) {
  try {
    const data = await service.testLifecycle_gnral(req.user, req.file, req.body || {});
    return res.status(200).json({
      ok: true,
      message: 'Ciclo técnico de carga, SAS y eliminación completado.',
      data
    });
  } catch (error) { return next(error); }
}

module.exports = {
  getStatus,
  getContractStatus,
  testUpload,
  testAccess,
  testDelete,
  testLifecycle
};
