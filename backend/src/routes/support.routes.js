const express = require('express');
const router = express.Router();

const supportController = require('../controllers/support.controller');
const { optionalAuth, requireAuth, requireRole } = require('../middleware/auth.middleware');

/* ===========================
   CENTRO DE AYUDA / NORI
=========================== */

router.get('/menu', optionalAuth, supportController.getMenu);
router.get('/node/:id_nodo', optionalAuth, supportController.getNode);
router.get('/faq', optionalAuth, supportController.getFaq);
router.get('/avisos', optionalAuth, supportController.getAvisos);

/* ===========================
   SOLICITUDES
=========================== */

router.get('/tickets', requireAuth, supportController.getTickets);
router.post('/tickets', requireAuth, supportController.createTicket);
router.patch('/tickets/:id', requireAuth, requireRole('Programador'), supportController.updateTicket);

/* ===========================
   NOTIFICACIONES
=========================== */

router.get('/notificaciones', requireAuth, supportController.getNotificaciones);

module.exports = router;
