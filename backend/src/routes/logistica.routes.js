const express = require('express');
const router = express.Router();
const logisticaController = require('../controllers/logistica.controller');

router.post('/sync', logisticaController.syncLogOps);
router.get('/', logisticaController.getLogOps);
router.get('/:id', logisticaController.getLogOpsById);

module.exports = router;
