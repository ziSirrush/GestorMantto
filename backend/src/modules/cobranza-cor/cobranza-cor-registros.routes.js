'use strict';

// [Aster | 2026-10-02 | ASTER-MG | COBRANZA COR FASE 6 EDITAR ELIMINAR V001]

const express = require('express');
const controller = require('./cobranza-cor-registros.controller');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();

const requireEstadosCuentaCor = humanInformationGuard_gnral({
  permissionCode: 'COBRANZA_ESTADOS_CUENTA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  domain: 'CORELLIAN',
  groupingCode: 'COBRANZA'
});

function rejectViewerMutation_cor(req, res, next) {
  if (req.viewerContext && req.viewerContext.active && req.viewerContext.readOnly) {
    return res.status(403).json({
      ok: false,
      code: 'VIEWER_READ_ONLY',
      message: 'El Visor de usuarios es de solo lectura. Sal del visor para realizar cambios en Cobranza.'
    });
  }
  return next();
}

router.put('/estados-cuenta/:ppns/facturas/:idFacturaCor', ...requireEstadosCuentaCor, rejectViewerMutation_cor, controller.actualizarFactura_cor);
router.delete('/estados-cuenta/:ppns/facturas/:idFacturaCor', ...requireEstadosCuentaCor, rejectViewerMutation_cor, controller.eliminarFactura_cor);
router.put('/estados-cuenta/:ppns/pagos/:idPagoCor', ...requireEstadosCuentaCor, rejectViewerMutation_cor, controller.actualizarPago_cor);
router.delete('/estados-cuenta/:ppns/pagos/:idPagoCor', ...requireEstadosCuentaCor, rejectViewerMutation_cor, controller.eliminarPago_cor);

module.exports = router;
