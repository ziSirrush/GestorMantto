const db = require('../../config/db');
const service = require('./ventas-cotizaciones.service');
const editBootstrapService = require('./ventas-cotizaciones-editar-bootstrap.service');
const commentNotifications = require('../../services/notifications/comment-notification.service');

function sendKnownError(error, res, next) {
  const status = Number(error.statusCode || error.status);
  if (status) {
    return res.status(status).json({
      ok: false,
      code: error.code || undefined,
      message: error.message,
      detalles: error.detalles || error.details || undefined
    });
  }
  return next(error);
}

function buildActionContext(req) {
  return {
    user: req.user,
    contextUser: req.contextUser || req.user,
    informationAccess: req.informationAccess || null,
    ip: req.ip || req.socket?.remoteAddress || null,
    userAgent: req.get('user-agent') || null
  };
}

async function syncCotizaciones(req, res, next) {
  try { return res.status(200).json(await service.sync(req.body || {})); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function syncComentariosHistoricos(req, res, next) {
  try { return res.status(200).json(await service.syncComentariosHistoricos(req.body || {})); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function listCotizaciones(req, res, next) {
  try { return res.status(200).json(await service.list(req.query || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function getKpis(req, res, next) {
  try { return res.status(200).json(await service.getKpis(req.query || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function getEmbudo(req, res, next) {
  try { return res.status(200).json(await service.getEmbudo(req.query || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function getVendidos(req, res, next) {
  try { return res.status(200).json(await service.getVendidos(req.query || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function getPerdidos(req, res, next) {
  try { return res.status(200).json(await service.getPerdidos(req.query || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function getProyeccion(req, res, next) {
  try { return res.status(200).json(await service.getProyeccion(req.query || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function getCatalogos(req, res, next) {
  try {
    const response = await service.getCatalogos(buildActionContext(req));
    const [estadoZonaRows] = await db.query(`
      SELECT DISTINCT
        TRIM(estado) AS estado,
        TRIM(zona) AS zona
      FROM ventas_cotizaciones_cor
      WHERE activo = 1
        AND NULLIF(TRIM(estado), '') IS NOT NULL
        AND NULLIF(TRIM(zona), '') IS NOT NULL
      ORDER BY TRIM(estado), TRIM(zona)
    `);

    response.catalogos = response.catalogos || {};
    response.catalogos.estado_zonas = estadoZonaRows.map((row) => ({
      estado: row.estado,
      zona: row.zona
    }));

    return res.status(200).json(response);
  } catch (error) { return sendKnownError(error, res, next); }
}

async function getCotizacion(req, res, next) {
  try { return res.status(200).json(await service.getById(req.params.id, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function getEditBootstrap(req, res, next) {
  try { return res.status(200).json(await editBootstrapService.get(req.params.id, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function createCotizacion(req, res, next) {
  try { return res.status(201).json(await service.create(req.body || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function updateCotizacion(req, res, next) {
  try { return res.status(200).json(await service.update(req.params.id, req.body || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function deleteCotizacion(req, res, next) {
  try { return res.status(200).json(await service.remove(req.params.id, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function updateEstatus(req, res, next) {
  try { return res.status(200).json(await service.updateEstatus(req.params.id, req.body || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function updateAsignacion(req, res, next) {
  try { return res.status(200).json(await service.updateAsignacion(req.params.id, req.body || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function listComentarios(req, res, next) {
  try { return res.status(200).json(await service.listComentarios(req.params.id, req.query || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function createComentario(req, res, next) {
  try {
    const actionContext = buildActionContext(req);
    const result = await service.createComentario(
      req.params.id,
      req.body || {},
      req.file || null,
      actionContext
    );
    const notificationResult = await commentNotifications.notifyCotizacionComment_gnral(req.params.id, actionContext);
    return res.status(201).json({ ...result, notificaciones: Number(notificationResult?.created || 0) });
  } catch (error) { return sendKnownError(error, res, next); }
}

async function updateComentario(req, res, next) {
  try { return res.status(200).json(await service.updateComentario(req.params.id, req.params.idComentario, req.body || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function deleteComentario(req, res, next) {
  try { return res.status(200).json(await service.deleteComentario(req.params.id, req.params.idComentario, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function listArchivos(req, res, next) {
  try { return res.status(200).json(await service.listArchivos(req.params.id, req.query || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function createArchivo(req, res, next) {
  try { return res.status(201).json(await service.createArchivo(req.params.id, req.body || {}, req.file, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function getArchivo(req, res, next) {
  try { return res.status(200).json(await service.getArchivo(req.params.id, req.params.idArchivo, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function getArchivoAccess(req, res, next) {
  try {
    return res.status(200).json(await service.getArchivoAccess(
      req.params.id,
      req.params.idArchivo,
      req.query || {},
      buildActionContext(req)
    ));
  } catch (error) { return sendKnownError(error, res, next); }
}

async function updateArchivo(req, res, next) {
  try { return res.status(200).json(await service.updateArchivo(req.params.id, req.params.idArchivo, req.body || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function deleteArchivo(req, res, next) {
  try { return res.status(200).json(await service.deleteArchivo(req.params.id, req.params.idArchivo, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

module.exports = {
  syncCotizaciones, syncComentariosHistoricos, listCotizaciones, getKpis, getEmbudo, getVendidos, getPerdidos,
  getProyeccion, getCatalogos, getCotizacion, getEditBootstrap, updateEstatus, updateAsignacion,
  listComentarios, createComentario, updateComentario, deleteComentario,
  listArchivos, createArchivo, getArchivo, getArchivoAccess, updateArchivo, deleteArchivo,
  createCotizacion, updateCotizacion, deleteCotizacion
};
