const service = require('./ventas-clientes.service');

function sendKnownError(error, res, next) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      ok: false,
      message: error.message,
      detalles: error.detalles || undefined
    });
  }
  return next(error);
}

function buildActionContext(req) {
  return {
    user: req.user,
    contextUser: req.contextUser || req.user,
    ip: req.ip || req.socket?.remoteAddress || null,
    userAgent: req.get('user-agent') || null
  };
}

async function syncClientes(req, res, next) {
  try { return res.status(200).json(await service.sync(req.body || {})); }
  catch (error) { return sendKnownError(error, res, next); }
}
async function listClientes(req, res, next) {
  try { return res.status(200).json(await service.list(req.query || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}
async function getKpis(req, res, next) {
  try { return res.status(200).json(await service.getKpis(req.query || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}
async function getCatalogos(req, res, next) {
  try { return res.status(200).json(await service.getCatalogos(buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}
<<<<<<< HEAD
=======
async function getAssignableAdvisors(req, res, next) {
  try { return res.status(200).json(await service.getAssignableAdvisors(buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}
>>>>>>> b39f76e (Ventas .4)
async function getCliente(req, res, next) {
  try { return res.status(200).json(await service.getById(req.params.id, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}
async function createCliente(req, res, next) {
  try { return res.status(201).json(await service.create(req.body || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}
async function updateCliente(req, res, next) {
  try { return res.status(200).json(await service.update(req.params.id, req.body || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}
async function deleteCliente(req, res, next) {
  try { return res.status(200).json(await service.remove(req.params.id, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

module.exports = {
  syncClientes,
  listClientes,
  getKpis,
  getCatalogos,
<<<<<<< HEAD
=======
  getAssignableAdvisors,
>>>>>>> b39f76e (Ventas .4)
  getCliente,
  createCliente,
  updateCliente,
  deleteCliente
};
