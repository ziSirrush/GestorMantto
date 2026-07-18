const express = require('express');
const router = express.Router();
const ticketsController = require('./tickets.controller');
const { optionalAuth, requireAuth } = require('../../middleware/auth.middleware');

router.get('/tickets', ticketsController.getTickets);
router.get('/tickets/:ticket/interacciones', optionalAuth, ticketsController.getTicketInteracciones);
router.post('/tickets/:ticket/comentarios', requireAuth, ticketsController.createTicketComentario);
router.post('/tickets/:ticket/validacion', requireAuth, ticketsController.saveTicketValidacion);
router.get('/tickets/:ticket', optionalAuth, ticketsController.getTicketDetalle);
router.post('/tickets/:ticket/vobo', requireAuth, ticketsController.saveTicketVobo);
router.post('/tickets/sync', ticketsController.syncTickets);

module.exports = router;
