const express = require('express');
const controller = require('./ventas-cotizaciones.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireVentasPermission } = require('../../middleware/ventas-cotizaciones-permissions.middleware');

const router = express.Router();

// Endpoint histórico de carga inicial. No forma parte de la operación cotidiana.
router.post('/cotizaciones/sync', controller.syncCotizaciones);

router.get('/cotizaciones/catalogos', requireAuth, requireVentasPermission('ver'), controller.getCatalogos);
router.get('/cotizaciones/kpis', requireAuth, requireVentasPermission('ver'), controller.getKpis);
router.get('/cotizaciones/embudo', requireAuth, requireVentasPermission('ver'), controller.getEmbudo);
router.get('/cotizaciones/vendidos', requireAuth, requireVentasPermission('ver'), controller.getVendidos);
router.get('/cotizaciones/perdidos', requireAuth, requireVentasPermission('ver'), controller.getPerdidos);
router.get('/cotizaciones/proyeccion', requireAuth, requireVentasPermission('ver'), controller.getProyeccion);
router.get('/cotizaciones', requireAuth, requireVentasPermission('ver'), controller.listCotizaciones);
router.get('/cotizaciones/:id/comentarios', requireAuth, requireVentasPermission('ver'), controller.listComentarios);
router.post('/cotizaciones/:id/comentarios', requireAuth, requireVentasPermission('editar'), controller.createComentario);
router.patch('/cotizaciones/:id/comentarios/:idComentario', requireAuth, requireVentasPermission('editar'), controller.updateComentario);
router.delete('/cotizaciones/:id/comentarios/:idComentario', requireAuth, requireVentasPermission('eliminar'), controller.deleteComentario);
router.get('/cotizaciones/:id/archivos', requireAuth, requireVentasPermission('ver'), controller.listArchivos);
router.post('/cotizaciones/:id/archivos', requireAuth, requireVentasPermission('editar'), controller.createArchivo);
router.get('/cotizaciones/:id/archivos/:idArchivo', requireAuth, requireVentasPermission('ver'), controller.getArchivo);
router.patch('/cotizaciones/:id/archivos/:idArchivo', requireAuth, requireVentasPermission('editar'), controller.updateArchivo);
router.delete('/cotizaciones/:id/archivos/:idArchivo', requireAuth, requireVentasPermission('eliminar'), controller.deleteArchivo);
router.patch('/cotizaciones/:id/estatus', requireAuth, requireVentasPermission('editar'), controller.updateEstatus);
router.patch('/cotizaciones/:id/asignacion', requireAuth, requireVentasPermission('editar'), controller.updateAsignacion);
router.get('/cotizaciones/:id', requireAuth, requireVentasPermission('ver'), controller.getCotizacion);
router.post('/cotizaciones', requireAuth, requireVentasPermission('crear'), controller.createCotizacion);
router.put('/cotizaciones/:id', requireAuth, requireVentasPermission('editar'), controller.updateCotizacion);
router.delete('/cotizaciones/:id', requireAuth, requireVentasPermission('eliminar'), controller.deleteCotizacion);

module.exports = router;
