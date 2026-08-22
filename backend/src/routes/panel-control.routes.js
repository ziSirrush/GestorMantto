const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const controller = require('../controllers/panel-control.controller');
const notificationAdminController = require('../controllers/panel-control-notificaciones.controller');
const informationScopeController = require('../controllers/panel-control-alcance.controller');

const router = express.Router();

router.get('/session-permissions', requireAuth, controller.getSessionPermissions);
router.get('/viewer-users', requireAuth, controller.getViewerUsers);
router.get('/viewer-bootstrap', requireAuth, controller.getViewerBootstrap);
router.post('/viewer-context', requireAuth, controller.postViewerContext);
router.post('/viewer-close', requireAuth, controller.postViewerClose);
router.get('/bootstrap', requireAuth, controller.getBootstrap);
router.get('/notificaciones/matriz', requireAuth, notificationAdminController.getNotificationMatrix_gnral);
router.put('/notificaciones/matriz', requireAuth, notificationAdminController.saveNotificationMatrix_gnral);
router.get('/roles/:id/permisos', requireAuth, controller.getRolePermissions);
router.put('/roles/:id/permisos', requireAuth, controller.saveRolePermissions);
router.get('/usuarios/:id/permisos', requireAuth, controller.getUserPermissions);
router.put('/usuarios/:id/permisos', requireAuth, controller.saveUserPermissions);
router.put('/usuarios/alcance-informacion/masivo', requireAuth, informationScopeController.activateUserInformationScopeBulk_gnral);
router.get('/usuarios/:id/alcance-informacion', requireAuth, informationScopeController.getUserInformationScope_gnral);
router.put('/usuarios/:id/alcance-informacion', requireAuth, informationScopeController.saveUserInformationScope_gnral);
router.put('/usuarios/:id/roles', requireAuth, controller.saveUserRoles);
router.get('/admin/roles/:id', requireAuth, controller.getAdminRole);
router.post('/admin/roles', requireAuth, controller.createAdminRole);
router.put('/admin/roles/:id', requireAuth, controller.updateAdminRole);

module.exports = router;
