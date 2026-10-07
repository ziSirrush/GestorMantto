'use strict';

// [Aster | 2026-10-07 | ASTER-MG | FASE 1 ENTREGAS V001]

const express = require('express');
const controller = require('./entregas-control.controller');
const service = require('./entregas-control.service');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');
const { createUploadMiddleware_gnral } = require('../../middleware/storage-upload.middleware');

const router = express.Router();
const P = service.PERMISSIONS_GNRAL;

function guard_gnral(permissionCode) {
  return humanInformationGuard_gnral({
    permissionCode,
    domain: 'GENERAL',
    groupingCode: 'ENTREGAS'
  });
}

function anyGuard_gnral(permissionCodesAny) {
  return humanInformationGuard_gnral({
    permissionCodesAny,
    domain: 'GENERAL',
    groupingCode: 'ENTREGAS'
  });
}

const uploadOne_gnral = createUploadMiddleware_gnral({
  fieldName: 'archivo',
  maxFiles: 1,
  required: true,
  policyName: 'GENERAL'
});

router.get('/opciones', ...guard_gnral(P.programadas_ver), controller.opciones_gnral);

router.get('/programadas', ...guard_gnral(P.programadas_ver), controller.programadas_gnral);
router.get('/programadas/:id', ...guard_gnral(P.programadas_ver), controller.programadaDetalle_gnral);
router.post('/programadas', ...guard_gnral(P.programadas_crear), controller.programadaCrear_gnral);
router.delete('/programadas/:id', ...guard_gnral(P.programadas_desactivar), controller.programadaDesactivar_gnral);

router.get('/mis-entregas', ...guard_gnral(P.mis_entregas_ver), controller.misEntregas_gnral);
router.post('/instancias/:id/archivo', ...guard_gnral(P.mis_entregas_adjuntar), uploadOne_gnral, controller.archivoSubir_gnral);
router.get('/instancias/:id/archivo/acceso', ...anyGuard_gnral([
  P.programadas_ver,
  P.mis_entregas_ver,
  P.validacion_ver
]), controller.archivoAcceso_gnral);

router.get('/validacion', ...guard_gnral(P.validacion_ver), controller.validacionPendiente_gnral);
router.post('/instancias/:id/validar', ...guard_gnral(P.validacion_validar), controller.validar_gnral);

router.get('/indicadores', ...guard_gnral(P.indicadores_ver), controller.indicadores_gnral);

module.exports = router;
