// [Aster | 2026-08-12 | ASTER-MG | PATCH: FASE_2_BACKEND_M2M_GUARDS_V001]
const express = require('express');
const router = express.Router();
const ticketsController = require('./tickets.controller');
const { optionalAuth, requireAuth } = require('../../middleware/auth.middleware');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');

const requireTicketsIntegration = requireIntegrationAuthFor('INTEGRATION_TICKETS_ID');

router.get('/tickets', ticketsController.getTickets);
router.get('/tickets/:ticket/interacciones', optionalAuth, ticketsController.getTicketInteracciones);
router.post('/tickets/:ticket/comentarios', requireAuth, ticketsController.createTicketComentario);
router.post('/tickets/:ticket/validacion', requireAuth, ticketsController.saveTicketValidacion);
router.get('/tickets/:ticket', optionalAuth, ticketsController.getTicketDetalle);
router.post('/tickets/:ticket/vobo', requireAuth, ticketsController.saveTicketVobo);
router.post('/tickets/sync', requireTicketsIntegration, ticketsController.syncTickets);
router.post('/tickets/sync-fechas-cdmx', requireTicketsIntegration, ticketsController.syncTicketDatesCdmx);

module.exports = router;
