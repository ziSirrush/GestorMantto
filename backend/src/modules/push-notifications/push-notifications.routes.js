const express = require('express');
const controller = require('./push-notifications.controller');
const { requireAuth } = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(requireAuth);
router.get('/config', controller.getConfig);
router.get('/status', controller.status);
router.post('/subscriptions', controller.subscribe);
router.delete('/subscriptions', controller.unsubscribe);

module.exports = router;
