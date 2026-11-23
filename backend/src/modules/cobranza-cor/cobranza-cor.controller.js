'use strict';

const service = require('./cobranza-cor.service');
const dashboardService = require('./cobranza-cor-dashboard.service');

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

async function cargarFuente_cor(req, res, next) {
  try {
    return res.status(200).json(await service.cargarFuente_cor(req.body || {}));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function cargarAditivas_cor(req, res, next) {
  try {
    return res.status(200).json(await service.cargarAditivas_cor(req.body || {}));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function listarDashboard_cor(req, res, next) {
  try {
    return res.status(200).json(
      await dashboardService.listarDashboard_cor(req.query || {}, req.informationAccess)
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function sincronizarDashboard_cor(req, res, next) {
  try {
    // POST es lectura; scope CORELLIAN se obtiene solo del guard, nunca del body.
    const payload=req.body&&typeof req.body==='object'?req.body:{};
    res.set('Cache-Control','no-store');
    return res.status(200).json(await dashboardService.listarDashboard_cor(
      payload.query||{},req.informationAccess,null,null,
      {requested:true,known:payload.known||[]}
    ));
  } catch(error) {
    return sendKnownError(error,res,next);
  }
}

async function listarEstadosCuenta_cor(req, res, next) {
  try {
    return res.status(200).json(
      await service.listarEstadosCuenta_cor(req.query || {}, req.informationAccess)
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function detalleEstadoCuenta_cor(req, res, next) {
  try {
    return res.status(200).json(
      await service.detalleEstadoCuenta_cor(req.params.ppns, req.informationAccess)
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function catalogoCrearEstadoCuenta_cor(req, res, next) {
  try {
    return res.status(200).json(
      await service.catalogoCrearEstadoCuenta_cor(req.query || {}, req.informationAccess)
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function formularioEstadoCuenta_cor(req, res, next) {
  try {
    return res.status(200).json(
      await service.formularioEstadoCuenta_cor(req.params.ppns, req.informationAccess)
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function crearEstadoCuenta_cor(req, res, next) {
  try {
    return res.status(201).json(
      await service.crearEstadoCuenta_cor(
        req.body || {},
        req.informationAccess,
        req.actorUser && req.actorUser.id_SB
      )
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function actualizarEstadoCuenta_cor(req, res, next) {
  try {
    return res.status(200).json(
      await service.actualizarEstadoCuenta_cor(
        req.params.ppns,
        req.body || {},
        req.informationAccess,
        req.actorUser && req.actorUser.id_SB
      )
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function crearFacturaEstadoCuenta_cor(req, res, next) {
  try {
    return res.status(201).json(
      await service.crearFacturaEstadoCuenta_cor(
        req.params.ppns,
        req.body || {},
        req.informationAccess,
        req.actorUser && req.actorUser.id_SB
      )
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function cargarFacturas_cor(req, res, next) {
  try {
    return res.status(200).json(await service.cargarFacturas_cor(req.body || {}, req.integrationAuth || null));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function guardarRelacionPagoFacturaEstadoCuenta_cor(req, res, next) {
  try {
    return res.status(200).json(await service.guardarRelacionPagoFacturaEstadoCuenta_cor(
      req.params.ppns, req.params.idPagoCor, req.params.idFacturaCor,
      req.body || {}, req.informationAccess
    ));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function quitarRelacionPagoFacturaEstadoCuenta_cor(req, res, next) {
  try {
    return res.status(200).json(await service.quitarRelacionPagoFacturaEstadoCuenta_cor(
      req.params.ppns, req.params.idPagoCor, req.params.idFacturaCor,
      req.informationAccess
    ));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function aditivas_cor(req, res, next) {
  try {
    return res.status(200).json(
      await service.listarAditivas_cor(req.query || {}, req.informationAccess)
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function detalleAditiva_cor(req, res, next) {
  try {
    return res.status(200).json(
      await service.detalleAditiva_cor(req.params.idAditivaCor, req.informationAccess)
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function crearAditiva_cor(req, res, next) {
  try {
    return res.status(201).json(
      await service.crearAditiva_cor(req.body || {}, req.informationAccess)
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function actualizarAditiva_cor(req, res, next) {
  try {
    return res.status(200).json(
      await service.actualizarAditiva_cor(
        req.params.idAditivaCor,
        req.body || {},
        req.informationAccess
      )
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function adeudosContractuales_cor(_req, res, next) {
  try {
    return res.json({
      ok: true,
      source: 'aiven',
      ...service.getAdeudosContractuales_cor()
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  cargarFuente_cor,
  cargarAditivas_cor,
  cargarFacturas_cor,
  listarDashboard_cor,
  sincronizarDashboard_cor,
  listarEstadosCuenta_cor,
  detalleEstadoCuenta_cor,
  catalogoCrearEstadoCuenta_cor,
  formularioEstadoCuenta_cor,
  crearEstadoCuenta_cor,
  actualizarEstadoCuenta_cor,
  crearFacturaEstadoCuenta_cor,
  guardarRelacionPagoFacturaEstadoCuenta_cor,
  quitarRelacionPagoFacturaEstadoCuenta_cor,
  aditivas_cor,
  detalleAditiva_cor,
  crearAditiva_cor,
  actualizarAditiva_cor,
  adeudosContractuales_cor
};
