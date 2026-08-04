const express = require('express');
const controller = require('./storage-reconciliation.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireStorageReconciliationEnabled } = require('../../middleware/storage-reconciliation.middleware');

const router = express.Router();

router.use(requireAuth, requireStorageReconciliationEnabled);
router.get('/resumen', controller.report);
router.get('/inventario', controller.inventory);
router.get('/uploads-legacy', controller.legacyUploads);
router.get('/metricas', controller.metrics);
router.post('/huerfanos/eliminar', express.json({ limit: '256kb' }), controller.deleteOrphans);

module.exports = router;
