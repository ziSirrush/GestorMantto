const express = require('express');
const controller = require('./ventas-cotizaciones.controller');
const { requireAuth } = require('../../middleware/auth.middleware');

const router = express.Router();

// Endpoint histórico de carga inicial. No forma parte de la operación cotidiana.
router.post('/cotizaciones/sync', controller.syncCotizaciones);
router.post('/cotizaciones/comentarios/sync', controller.syncComentariosHistoricos);

router.get('/cotizaciones/catalogos', requireAuth, controller.getCatalogos);
router.get('/cotizaciones/kpis', requireAuth, controller.getKpis);
router.get('/cotizaciones/embudo', requireAuth, controller.getEmbudo);
router.get('/cotizaciones/vendidos', requireAuth, controller.getVendidos);
router.get('/cotizaciones/perdidos', requireAuth, controller.getPerdidos);
router.get('/cotizaciones/proyeccion', requireAuth, controller.getProyeccion);
router.get('/cotizaciones', requireAuth, controller.listCotizaciones);
router.get('/cotizaciones/:id/comentarios', requireAuth, controller.listComentarios);
router.post('/cotizaciones/:id/comentarios', requireAuth, controller.createComentario);
router.patch('/cotizaciones/:id/comentarios/:idComentario', requireAuth, controller.updateComentario);
router.delete('/cotizaciones/:id/comentarios/:idComentario', requireAuth, controller.deleteComentario);
router.get('/cotizaciones/:id/archivos', requireAuth, controller.listArchivos);
router.post('/cotizaciones/:id/archivos', requireAuth, controller.createArchivo);
router.get('/cotizaciones/:id/archivos/:idArchivo', requireAuth, controller.getArchivo);
router.patch('/cotizaciones/:id/archivos/:idArchivo', requireAuth, controller.updateArchivo);
router.delete('/cotizaciones/:id/archivos/:idArchivo', requireAuth, controller.deleteArchivo);
router.patch('/cotizaciones/:id/estatus', requireAuth, controller.updateEstatus);
router.patch('/cotizaciones/:id/asignacion', requireAuth, controller.updateAsignacion);
router.get('/cotizaciones/:id', requireAuth, controller.getCotizacion);
router.post('/cotizaciones', requireAuth, controller.createCotizacion);
router.put('/cotizaciones/:id', requireAuth, controller.updateCotizacion);
router.delete('/cotizaciones/:id', requireAuth, controller.deleteCotizacion);

module.exports = router;
