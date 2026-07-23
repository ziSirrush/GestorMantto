const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const controller = require('../controllers/panel-control.controller');

const router = express.Router();

router.get('/session-permissions', requireAuth, controller.getSessionPermissions);
router.get('/bootstrap', requireAuth, controller.getBootstrap);
router.get('/roles/:id/permisos', requireAuth, controller.getRolePermissions);
router.put('/roles/:id/permisos', requireAuth, controller.saveRolePermissions);
router.get('/usuarios/:id/permisos', requireAuth, controller.getUserPermissions);
router.put('/usuarios/:id/permisos', requireAuth, controller.saveUserPermissions);
router.put('/usuarios/:id/roles', requireAuth, controller.saveUserRoles);

module.exports = router;
