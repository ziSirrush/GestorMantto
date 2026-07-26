const express = require('express');
const controller = require('./instalaciones-proyecto-drive.controller');
const { requireAuth } = require('../../middleware/auth.middleware');

const router = express.Router();

router.post('/proyecto-drive/sync', controller.syncProyectoDrive);
router.get('/proyecto-drive/:idProyecto', requireAuth, controller.getProyectoDrive);

module.exports = router;
