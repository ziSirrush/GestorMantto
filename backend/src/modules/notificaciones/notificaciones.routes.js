const express = require('express');
const notificacionesController = require('./notificaciones.controller');
const legacyDataController = require('../../controllers/data.controller');
const { requireAuth } = require('../../middleware/auth.middleware');

const router = express.Router();

router.get('/notificaciones', requireAuth, notificacionesController.getNotificaciones);
router.patch('/notificaciones/:id/abrir', requireAuth, notificacionesController.abrirNotificacion);
router.patch('/notificaciones/:id/nuevo', requireAuth, notificacionesController.marcarNotificacionNueva);
router.get('/notificaciones/preferencias', requireAuth, notificacionesController.getPreferencias);
router.put('/notificaciones/preferencias', requireAuth, notificacionesController.guardarPreferencias);

// Compatibilidad temporal: estas dos rutas ya estaban agrupadas en este adaptador,
// pero pertenecen al dominio Usuarios. Se conservan sin cambios hasta migrar dicho dominio.
router.get('/usuarios', legacyDataController.getUsuarios);
router.get('/users', legacyDataController.getUsuarios);

module.exports = router;
