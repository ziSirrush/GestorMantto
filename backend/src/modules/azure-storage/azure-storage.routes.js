const express = require('express');
const controller = require('./azure-storage.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireAzureDiagnosticsEnabled } = require('../../middleware/historical-sync.middleware');
const { createUploadMiddleware_gnral } = require('../../middleware/storage-upload.middleware');
const reconciliationRoutes = require('../storage-reconciliation/storage-reconciliation.routes');

const router = express.Router();
const uploadDiagnostic = createUploadMiddleware_gnral({
  mode: 'single',
  fieldName: 'archivo',
  maxFiles: 1,
  policyName: 'GENERAL',
  required: true
});

router.use('/reconciliacion', reconciliationRoutes);
router.get('/status', requireAuth, controller.getStatus);
router.get('/diagnostico/contrato', requireAuth, requireAzureDiagnosticsEnabled, controller.getContractStatus);
router.post('/diagnostico/ciclo', requireAuth, requireAzureDiagnosticsEnabled, uploadDiagnostic, controller.testLifecycle);
router.post('/diagnostico/subir', requireAuth, requireAzureDiagnosticsEnabled, uploadDiagnostic, controller.testUpload);
router.get('/diagnostico/acceso', requireAuth, requireAzureDiagnosticsEnabled, controller.testAccess);
router.delete('/diagnostico/blob', requireAuth, requireAzureDiagnosticsEnabled, express.json(), controller.testDelete);

module.exports = router;
