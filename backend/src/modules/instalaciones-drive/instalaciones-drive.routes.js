const express = require('express');
const controller = require('./instalaciones-drive.controller');

const router = express.Router();

router.post('/drive/carpetas/sync', controller.syncCarpetas);

module.exports = router;
