const express = require('express');
const router = express.Router();

const supportController = require('../controllers/support.controller');
const { optionalAuth, requireAuth } = require('../middleware/auth.middleware');
const { requireStorageSchema } = require('../middleware/storage-schema.middleware');
const { createUploadMiddleware_gnral } = require('../middleware/storage-upload.middleware');

const supportInitialUpload = createUploadMiddleware_gnral({
  mode: 'array',
  fieldName: 'archivos',
  maxFiles: 5,
  policyName: 'GENERAL',
  required: false,
  maxRequestMb: Number(process.env.CFFAA_STORAGE_MAX_REQUEST_MB || 50)
});

const supportSingleUpload = createUploadMiddleware_gnral({
  mode: 'single',
  fieldName: 'archivo',
  maxFiles: 1,
  policyName: 'GENERAL',
  required: true,
  maxRequestMb: Number(process.env.AZURE_STORAGE_MAX_FILE_MB || 25)
});

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
router.post(
  '/tickets/mias',
  requireAuth,
  requireStorageSchema('sup_tickets', 'sup_adjuntos'),
  supportInitialUpload,
  supportController.createMyTicket
);
router.patch('/tickets/mias/:id', requireAuth, supportController.updateMyTicket);
router.get('/tickets', requireAuth, supportController.getTickets);
router.get('/tickets/catalogos', requireAuth, supportController.getTicketCatalogs);
router.get('/tickets/:id', requireAuth, supportController.getTicketById);
router.post(
  '/tickets',
  requireAuth,
  requireStorageSchema('sup_tickets', 'sup_adjuntos'),
  supportInitialUpload,
  supportController.createTicket
);
router.patch('/tickets/:id', requireAuth, supportController.updateTicket);
router.post('/tickets/:id/comentarios', requireAuth, supportController.addTicketComment);
router.post(
  '/tickets/:id/adjuntos',
  requireAuth,
  requireStorageSchema('sup_tickets', 'sup_adjuntos'),
  supportSingleUpload,
  supportController.addTicketAttachment
);
router.get(
  '/tickets/:id/adjuntos/:idAdjunto/acceso',
  requireAuth,
  requireStorageSchema('sup_tickets', 'sup_adjuntos'),
  supportController.getTicketAttachmentAccess
);
router.delete(
  '/tickets/:id/adjuntos/:idAdjunto',
  requireAuth,
  requireStorageSchema('sup_tickets', 'sup_adjuntos'),
  supportController.deleteTicketAttachment
);

/* ===========================
   NOTIFICACIONES
=========================== */

router.get('/notificaciones', requireAuth, supportController.getNotificaciones);

module.exports = router;
