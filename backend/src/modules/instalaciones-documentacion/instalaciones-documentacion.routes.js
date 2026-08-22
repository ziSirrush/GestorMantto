'use strict';

const express = require('express');
const controller = require('./instalaciones-documentacion.controller');
const { requireAuth } = require('../../middleware/auth.middleware');

const router = express.Router();

router.get('/documentacion/bootstrap', requireAuth, controller.getBootstrap_cor);

module.exports = router;
