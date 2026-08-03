const service = require('./ventas-cotizaciones.service');

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

async function syncCotizaciones(req, res, next) {
  try {
    const result = await service.sync(req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}



async function syncComentariosHistoricos(req, res, next) {
  try {
    const result = await service.syncComentariosHistoricos(req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function listCotizaciones(req, res, next) {
  try {
    const result = await service.list(req.query || {}, buildActionContext(req));
    return res.status(200).json(result);
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}


async function getKpis(req, res, next) {
  try {
    const result = await service.getKpis(req.query || {}, buildActionContext(req));
    return res.status(200).json(result);
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}


async function getEmbudo(req, res, next) {
  try {
    const result = await service.getEmbudo(req.query || {}, buildActionContext(req));
    return res.status(200).json(result);
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function getVendidos(req, res, next) {
  try {
    const result = await service.getVendidos(req.query || {}, buildActionContext(req));
    return res.status(200).json(result);
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function getPerdidos(req, res, next) {
  try {
    const result = await service.getPerdidos(req.query || {}, buildActionContext(req));
    return res.status(200).json(result);
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function getProyeccion(req, res, next) {
  try {
    const result = await service.getProyeccion(req.query || {}, buildActionContext(req));
    return res.status(200).json(result);
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function getCatalogos(req, res, next) {
  try {
    const result = await service.getCatalogos(buildActionContext(req));
    return res.status(200).json(result);
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function getCotizacion(req, res, next) {
  try {
    const result = await service.getById(req.params.id, buildActionContext(req));
    return res.status(200).json(result);
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function createCotizacion(req, res, next) {
  try {
    const result = await service.create(req.body || {}, buildActionContext(req));
    return res.status(201).json(result);
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function updateCotizacion(req, res, next) {
  try {
    const result = await service.update(req.params.id, req.body || {}, buildActionContext(req));
    return res.status(200).json(result);
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function deleteCotizacion(req, res, next) {
  try {
    const result = await service.remove(req.params.id, buildActionContext(req));
    return res.status(200).json(result);
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}


async function updateEstatus(req, res, next) {
  try {
    const result = await service.updateEstatus(req.params.id, req.body || {}, buildActionContext(req));
    return res.status(200).json(result);
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function updateAsignacion(req, res, next) {
  try {
    const result = await service.updateAsignacion(req.params.id, req.body || {}, buildActionContext(req));
    return res.status(200).json(result);
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function listComentarios(req, res, next) {
  try { return res.status(200).json(await service.listComentarios(req.params.id, req.query || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}
async function createComentario(req, res, next) {
  try { return res.status(201).json(await service.createComentario(req.params.id, req.body || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
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
  getProyeccion, getCatalogos, getCotizacion, updateEstatus, updateAsignacion,
  listComentarios, createComentario, updateComentario, deleteComentario,
  listArchivos, createArchivo, getArchivo, updateArchivo, deleteArchivo,
  createCotizacion, updateCotizacion, deleteCotizacion
};
