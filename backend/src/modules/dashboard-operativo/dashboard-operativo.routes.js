const express = require('express');
const dashboardOperativoController = require('./dashboard-operativo.controller');
const { requireAuth } = require('../../middleware/auth.middleware');

const router = express.Router();

router.get(
  '/servicios-preventivos/resumen-supervisor',
  requireAuth,
  dashboardOperativoController.getPreventivosSupervisor
);

module.exports = router;
