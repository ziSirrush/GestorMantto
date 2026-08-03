const express = require('express');
const multer = require('multer');
const router = express.Router();
const supportUpload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: Number(process.env.AZURE_STORAGE_MAX_FILE_MB || 25) * 1024 * 1024 } });

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
router.post('/tickets/:id/adjuntos', requireAuth, supportUpload.single('archivo'), supportController.addTicketAttachment);
router.get('/tickets/:id/adjuntos/:idAdjunto/acceso', requireAuth, supportController.getTicketAttachmentAccess);

/* ===========================
   NOTIFICACIONES
=========================== */

router.get('/notificaciones', requireAuth, supportController.getNotificaciones);

module.exports = router;
