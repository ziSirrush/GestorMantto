// [Claude | 2026-09-11 | Bitácora de Obra | FASE_1_BACKEND_V001]
const express = require('express');
const controller = require('./instalaciones-bitacora.controller');
const { requireAuth } = require('../../middleware/auth.middleware');

const router = express.Router();

router.get('/bitacora/:idProyecto', requireAuth, controller.getBitacora);
router.post('/bitacora/:idProyecto/sync', requireAuth, controller.syncBitacora);

module.exports = router;
