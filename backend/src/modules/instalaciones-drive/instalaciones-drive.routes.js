// [Aster | 2026-08-12 | ASTER-MG | PATCH: FASE_2_BACKEND_M2M_GUARDS_V001]
const express = require('express');
const controller = require('./instalaciones-drive.controller');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');

const requireInstalacionesDriveIntegration = requireIntegrationAuthFor('INTEGRATION_INSTALACIONES_DRIVE_ID');

const router = express.Router();

router.post('/drive/carpetas/sync', requireInstalacionesDriveIntegration, controller.syncCarpetas);

module.exports = router;
