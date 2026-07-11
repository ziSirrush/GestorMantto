const express = require('express');
const router = express.Router();
const controller = require('../controllers/usuarios-rel-admin.controller');
const { requireAuth } = require('../middleware/auth.middleware');

router.get('/', requireAuth, controller.listRelaciones);
router.post('/', requireAuth, controller.createRelacion);
router.delete('/:id', requireAuth, controller.deleteRelacion);

module.exports = router;
