'use strict';

const express = require('express');
const router = express.Router();
const detalleMp2026LegacyController = require('../controllers/detalle-mp-2026.controller');
// [Mantto Gestor | 2026-10-13 | FASE 2] Resumen y detalle de MP protegidos.
const relacionesProtegidasUni = require('../controllers/cobranza-uni-relaciones-protegidas.controller');
const { requireIntegrationAuthFor } = require('../middleware/integration-auth.middleware');
const { humanInformationGuard_gnral } = require('../middleware/information-access-gnral.middleware');

const requireCobranzaUniIntegration = requireIntegrationAuthFor('INTEGRATION_COBRANZA_UNI_ID');

const mantenimientoPreventivoGuard = humanInformationGuard_gnral({
  permissionCode: 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  domain: 'UNITED',
  groupingCode: 'COBRANZA_UNI'
});

router.get('/', ...mantenimientoPreventivoGuard, relacionesProtegidasUni.getMainDetalleMp2026);
router.get('/:id', ...mantenimientoPreventivoGuard, relacionesProtegidasUni.getDetalleMp2026);

// M2M: permanece fuera del alcance humano.
router.post('/sync', requireCobranzaUniIntegration, detalleMp2026LegacyController.syncDetalleMp2026);

// [BLT NOW | 2026-10-23 | MP ZONA 1 FASE 8 V001]
// El planchado inicial SIEMPRE requiere HMAC Cobranza UNI, aunque el M2M
// historico este deshabilitado globalmente. El modo import exige dos flags
// extras del servidor y solo realiza INSERT sin tocar /sync, GC ni VA.
const requireMpZone1ImportM2M = requireIntegrationAuthFor('INTEGRATION_COBRANZA_UNI_ID',{
  alwaysRequireAuth:true,algorithm:'sha256'
});
router.post('/zona-1/importacion-inicial', requireMpZone1ImportM2M, async(req,res,next)=>{
  try{
    const {importInitialZone1_uni}=require('../modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-zona1-import-service');
    return res.json(await importInitialZone1_uni(req.body));
  }catch(error){
    if(error && [400,403,409,413,422].includes(error.statusCode))
      return res.status(error.statusCode).json({ok:false,
        code:error.code||'MPZ1_IMPORT_REJECTED',message:error.message,
        details:error.details||undefined});
    return next(error);
  }
});

module.exports = router;
