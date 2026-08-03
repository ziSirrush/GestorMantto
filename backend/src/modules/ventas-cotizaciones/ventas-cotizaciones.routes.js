'use strict';

const express = require('express');
const controller = require('./ventas-cotizaciones.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireVentasPermission } = require('../../middleware/ventas-cotizaciones-permissions.middleware');

const router = express.Router();
const canView = requireVentasPermission('ver');
const canCreate = requireVentasPermission('crear');
const canEdit = requireVentasPermission('editar');
const canDelete = requireVentasPermission('eliminar');

// Endpoints históricos de carga inicial. Se conservan sin cambios para no
// alterar el proceso de importación existente dentro de este FIX operativo.
router.post('/cotizaciones/sync', controller.syncCotizaciones);
router.post('/cotizaciones/comentarios/sync', controller.syncComentariosHistoricos);

router.get('/cotizaciones/catalogos', requireAuth, canView, controller.getCatalogos);
router.get('/cotizaciones/kpis', requireAuth, canView, controller.getKpis);
router.get('/cotizaciones/embudo', requireAuth, canView, controller.getEmbudo);
router.get('/cotizaciones/vendidos', requireAuth, canView, controller.getVendidos);
router.get('/cotizaciones/perdidos', requireAuth, canView, controller.getPerdidos);
router.get('/cotizaciones/proyeccion', requireAuth, canView, controller.getProyeccion);
router.get('/cotizaciones', requireAuth, canView, controller.listCotizaciones);
router.get('/cotizaciones/:id/comentarios', requireAuth, canView, controller.listComentarios);
router.post('/cotizaciones/:id/comentarios', requireAuth, canEdit, controller.createComentario);
router.patch('/cotizaciones/:id/comentarios/:idComentario', requireAuth, canEdit, controller.updateComentario);
router.delete('/cotizaciones/:id/comentarios/:idComentario', requireAuth, canEdit, controller.deleteComentario);
router.get('/cotizaciones/:id/archivos', requireAuth, canView, controller.listArchivos);
router.post('/cotizaciones/:id/archivos', requireAuth, canEdit, controller.createArchivo);
router.get('/cotizaciones/:id/archivos/:idArchivo', requireAuth, canView, controller.getArchivo);
router.patch('/cotizaciones/:id/archivos/:idArchivo', requireAuth, canEdit, controller.updateArchivo);
router.delete('/cotizaciones/:id/archivos/:idArchivo', requireAuth, canEdit, controller.deleteArchivo);
router.patch('/cotizaciones/:id/estatus', requireAuth, canEdit, controller.updateEstatus);
router.patch('/cotizaciones/:id/asignacion', requireAuth, canEdit, controller.updateAsignacion);
router.get('/cotizaciones/:id', requireAuth, canView, controller.getCotizacion);
router.post('/cotizaciones', requireAuth, canCreate, controller.createCotizacion);
router.put('/cotizaciones/:id', requireAuth, canEdit, controller.updateCotizacion);
router.delete('/cotizaciones/:id', requireAuth, canDelete, controller.deleteCotizacion);

module.exports = router;
