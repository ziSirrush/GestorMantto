'use strict';

const express = require('express');
const controller = require('./interacciones.controller');
const { requireAuth } = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(requireAuth);
router.get('/interacciones', controller.list);
router.post('/interacciones', controller.create);

module.exports = router;
