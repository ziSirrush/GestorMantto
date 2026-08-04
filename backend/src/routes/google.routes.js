'use strict';

const express = require('express');

const googleController = require('../controllers/google.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/login', requireAuth, googleController.login);
router.get('/callback', googleController.callback);
router.get('/status', requireAuth, googleController.status);
router.post('/disconnect', requireAuth, googleController.disconnect);

module.exports = router;
