const express = require('express');
const router = express.Router();

const supportController = require('../controllers/support.controller');
const { optionalAuth, requireAuth } = require('../middleware/auth.middleware');

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

router.get('/tickets/mias', requireAuth, supportController.getMyTickets);
router.get('/tickets/mias/:id', requireAuth, supportController.getMyTicketById);
router.post('/tickets/mias', requireAuth, supportController.createMyTicket);
router.patch('/tickets/mias/:id', requireAuth, supportController.updateMyTicket);
router.get('/tickets', requireAuth, supportController.getTickets);
router.get('/tickets/catalogos', requireAuth, supportController.getTicketCatalogs);
router.get('/tickets/:id', requireAuth, supportController.getTicketById);
router.post('/tickets', requireAuth, supportController.createTicket);
router.patch('/tickets/:id', requireAuth, supportController.updateTicket);
router.post('/tickets/:id/comentarios', requireAuth, supportController.addTicketComment);
router.post('/tickets/:id/adjuntos', requireAuth, supportController.addTicketAttachment);

/* ===========================
   NOTIFICACIONES
=========================== */

router.get('/notificaciones', requireAuth, supportController.getNotificaciones);

module.exports = router;
