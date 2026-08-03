const express = require('express');
const controller = require('./ventas-prospeccion.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const multer = require('multer');
const upload = multer({storage:multer.memoryStorage(),limits:{files:4,fileSize:Number(process.env.AZURE_STORAGE_MAX_FILE_MB||25)*1024*1024},fileFilter(_req,file,cb){if(!String(file.mimetype||'').startsWith('image/'))return cb(new Error('Solo se permiten imágenes.'));return cb(null,true);}});
const COMMENT_MIME_TYPES = new Set(['application/pdf','text/plain','text/csv','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const uploadComment = multer({storage:multer.memoryStorage(),limits:{files:4,fileSize:Number(process.env.AZURE_STORAGE_MAX_FILE_MB||25)*1024*1024},fileFilter(_req,file,cb){const type=String(file.mimetype||'').toLowerCase();if(type.startsWith('image/')||COMMENT_MIME_TYPES.has(type))return cb(null,true);return cb(new Error('Tipo de archivo no permitido.'));}});

const router = express.Router();

// Endpoints temporales de carga histórica desde respaldos de Google Sheets.
// Se mantienen sin sesión para conservar el patrón de los imports históricos existentes.
router.post('/prospeccion/sync', controller.syncProspections);
router.post('/prospeccion/comentarios/sync', controller.syncComments);

router.get('/prospeccion/catalogos-captura', requireAuth, controller.getCaptureCatalogs);
router.get('/prospeccion/fuentes', requireAuth, controller.searchSources);
router.get('/prospeccion/contactos', requireAuth, controller.getClientContacts);
router.post('/prospeccion', requireAuth, upload.array('fotos',4), controller.createVisit);
router.get('/prospeccion/catalogos', requireAuth, controller.getCatalogs);
router.get('/prospeccion/kpis', requireAuth, controller.getKpis);
router.get('/prospeccion/mapa', requireAuth, controller.getMap);
router.get('/prospeccion', requireAuth, controller.listProspections);
router.get('/prospeccion/detalle/catalogos', requireAuth, controller.getDetailCatalogs);
router.patch('/prospeccion/:id/estatus', requireAuth, controller.updateProspectionStatus);
router.post('/prospeccion/:id/comentarios', requireAuth, uploadComment.array('archivos',4), controller.createComment);
router.get('/prospeccion/:id', requireAuth, controller.getProspection);

module.exports = router;
