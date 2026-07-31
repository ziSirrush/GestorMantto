const express = require('express');
const controller = require('./device-permissions.controller');
const { requireAuth } = require('../../middleware/auth.middleware');

const router = express.Router();
router.use(requireAuth);
router.get('/status', controller.status);
router.post('/sync', controller.sync);
module.exports = router;
