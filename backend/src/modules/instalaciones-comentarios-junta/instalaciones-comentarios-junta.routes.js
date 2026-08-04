const express = require('express');
const controller = require('./instalaciones-comentarios-junta.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const router = express.Router();
router.get('/comentarios-junta', requireAuth, controller.list);
router.post('/comentarios-junta', requireAuth, controller.create);
module.exports = router;
