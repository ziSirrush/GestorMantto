'use strict';

const express = require('express');
const controller = require('./cobranza-cor.controller');
const { requireAuth } = require('../../middleware/auth.middleware');

const router = express.Router();

router.get('/aditivas', requireAuth, controller.aditivas_cor);
router.get('/adeudos-contractuales', requireAuth, controller.adeudosContractuales_cor);

module.exports = router;
