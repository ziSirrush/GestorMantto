const service = require('./storage-reconciliation.service');

async function report(req, res, next) {
  try {
    const data = await service.reconciliationReport_gnral(req.query || {}, req.user || {});
    return res.status(200).json({ ok: true, data });
  } catch (error) { return next(error); }
}

async function inventory(req, res, next) {
  try {
    const data = await service.inventory_gnral();
    return res.status(200).json({ ok: true, data });
  } catch (error) { return next(error); }
}

async function legacyUploads(req, res, next) {
  try {
    const data = await service.legacyUploadsReport_gnral(req.query || {});
    return res.status(200).json({ ok: true, data });
  } catch (error) { return next(error); }
}

async function metrics(req, res, next) {
  try {
    const data = await service.metricsReport_gnral(req.query || {});
    return res.status(200).json({ ok: true, data });
  } catch (error) { return next(error); }
}

async function deleteOrphans(req, res, next) {
  try {
    const data = await service.deleteOrphans_gnral(req.body || {}, req.user || {});
    return res.status(200).json({
      ok: true,
      message: 'Limpieza controlada procesada. Revisa el detalle de cada blob.',
      data
    });
  } catch (error) { return next(error); }
}

module.exports = {
  report,
  inventory,
  legacyUploads,
  metrics,
  deleteOrphans
};
