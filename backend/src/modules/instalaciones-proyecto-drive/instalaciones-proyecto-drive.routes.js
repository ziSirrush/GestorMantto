// [Aster | 2026-08-12 | ASTER-MG | PATCH: FASE_2_BACKEND_M2M_GUARDS_V001]
const express = require('express');
const controller = require('./instalaciones-proyecto-drive.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');

const requireInstalacionesDriveIntegration = requireIntegrationAuthFor('INTEGRATION_INSTALACIONES_DRIVE_ID');

const router = express.Router();

router.post('/proyecto-drive/sync', requireInstalacionesDriveIntegration, controller.syncProyectoDrive);
router.get('/proyecto-drive/:idProyecto', requireAuth, controller.getProyectoDrive);

module.exports = router;
