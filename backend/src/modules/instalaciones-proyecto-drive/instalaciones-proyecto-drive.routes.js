const express = require('express');
const controller = require('./instalaciones-proyecto-drive.controller');

const router = express.Router();

router.post('/proyecto-drive/sync', controller.syncProyectoDrive);

module.exports = router;
