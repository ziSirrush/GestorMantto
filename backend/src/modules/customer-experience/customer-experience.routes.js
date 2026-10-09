'use strict';

// [Aster | 2026-10-07 | ASTER-MG | FASE 2 CUSTOMER EXPERIENCE ENCUESTAS V001]
// [Aster | 2026-10-08 | ASTER-MG | FIX CX MANTENIMIENTO SYNC V001]
// [Aster | 2026-10-09 | ASTER-MG | FIX CX VI BACKEND SYNC V001]

const express = require('express');
const controller = require('./customer-experience.controller');
const service = require('./customer-experience.service');
const { requireIntegrationAuthFor, isIntegrationAuthEnabled } = require('../../middleware/integration-auth.middleware');
const {
  humanInformationGuard_gnral,
  requireCompleteInformationDomain_gnral
} = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();
const completeCorellian_cor = requireCompleteInformationDomain_gnral('CORELLIAN');
const requireVentasIntegration_cor = requireIntegrationAuthFor('INTEGRATION_VENTAS_ID');

// La nueva ruta de escritura es estricta aun cuando el bypass global M2M siga apagado.
function requireCxViSignedRequests_cor(req, res, next) {
  if (!isIntegrationAuthEnabled()) {
    return res.status(503).json({
      ok: false,
      code: 'CX_VI_SYNC_AUTH_NOT_ENABLED',
      message: 'Habilita INTEGRATION_AUTH_ENABLED=true antes de sincronizar Customer Experience.'
    });
  }
  return next();
}

const dashboardGuard_cor = humanInformationGuard_gnral({
  permissionCode: service.PERMISSIONS_COR.dashboard_acceso_visual,
  domain: 'CORELLIAN',
  groupingCode: 'CUSTOMER_EXPERIENCE'
});

const encuestasGuard_cor = humanInformationGuard_gnral({
  permissionCode: service.PERMISSIONS_COR.encuestas_acceso_visual,
  domain: 'CORELLIAN',
  groupingCode: 'CUSTOMER_EXPERIENCE'
});

const optionsGuard_cor = humanInformationGuard_gnral({
  permissionCodesAny: [
    service.PERMISSIONS_COR.dashboard_acceso_visual,
    service.PERMISSIONS_COR.encuestas_acceso_visual
  ],
  domain: 'CORELLIAN',
  groupingCode: 'CUSTOMER_EXPERIENCE'
});

// Las tablas CX no tienen una llave inequívoca usuario/territorio. Tanto los
// agregados como el detalle contienen informacion corporativa y PII, por lo que
// Fase 2 conserva fallo cerrado y exige alcance completo CORELLIAN.
router.get('/opciones', ...optionsGuard_cor, completeCorellian_cor, controller.options_cor);
router.get('/dashboard', ...dashboardGuard_cor, completeCorellian_cor, controller.dashboard_cor);

router.get('/venta-instalacion/encuestas', ...encuestasGuard_cor, completeCorellian_cor, controller.listVentaInstalacion_cor);
router.get('/mantenimiento/encuestas', ...encuestasGuard_cor, completeCorellian_cor, controller.listMantenimiento_cor);
router.get('/mantenimiento/analisis-preguntas', ...encuestasGuard_cor, completeCorellian_cor, controller.closedQuestionsAnalysis_cor);
router.get('/mantenimiento/analisis-preguntas/detalle', ...encuestasGuard_cor, completeCorellian_cor, controller.closedQuestionDetail_cor);
router.get('/mantenimiento/analisis-temas', ...encuestasGuard_cor, completeCorellian_cor, controller.themesAnalysis_cor);
router.get('/mantenimiento/analisis-temas/detalle', ...encuestasGuard_cor, completeCorellian_cor, controller.themeDetail_cor);

// Sync M2M Google Sheets -> Backend Azure -> Aiven.
// Reutiliza la identidad de integracion de Ventas acordada para CX.
router.post('/mantenimiento/sync', requireVentasIntegration_cor, controller.syncMantenimiento_cor);

// CX Venta/Instalaciones: 91 columnas exactas; requiere una foto completa.
// Validacion: nunca escribe. Sync: reconcilia con una sola transaccion MySQL.
router.post('/venta-instalacion/sync/validar',
  requireCxViSignedRequests_cor, requireVentasIntegration_cor,
  controller.validarVentaInstalacionSync_cor);
router.post('/venta-instalacion/sync',
  requireCxViSignedRequests_cor, requireVentasIntegration_cor,
  controller.syncVentaInstalacion_cor);

module.exports = router;
