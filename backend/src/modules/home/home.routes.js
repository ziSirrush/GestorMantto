const express = require('express');
const homeController = require('./home.controller');
const { optionalAuth, requireAuth } = require('../../middleware/auth.middleware');

const router = express.Router();

router.get('/home/bootstrap', requireAuth, homeController.getHomeBootstrap);
router.get('/actividad-reciente', optionalAuth, homeController.getActividadReciente);

module.exports = router;
