const express = require('express');
const multer = require('multer');
const controller = require('./azure-storage.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireAzureDiagnosticsEnabled } = require('../../middleware/historical-sync.middleware');
const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.AZURE_STORAGE_MAX_FILE_MB || 25) * 1024 * 1024, files: 1 }
});

router.get('/status', requireAuth, controller.getStatus);
router.post('/diagnostico/subir', requireAuth, requireAzureDiagnosticsEnabled, upload.single('archivo'), controller.testUpload);
router.get('/diagnostico/acceso', requireAuth, requireAzureDiagnosticsEnabled, controller.testAccess);
router.delete('/diagnostico/blob', requireAuth, requireAzureDiagnosticsEnabled, express.json(), controller.testDelete);

module.exports = router;
