const express = require('express');
const healthController = require('./health.controller');

const router = express.Router();

router.get('/health', healthController.getHealth);

module.exports = router;
