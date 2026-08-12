const express = require('express');
const proyectosController = require('./proyectos.controller');
const { requireAuth } = require('../../middleware/auth.middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/proyectos/filtros', proyectosController.getProyectosFiltros);
router.get('/proyectos/detalle', proyectosController.getProyectoDetalle);
router.get('/proyectos/detalle/:proyecto', proyectosController.getProyectoDetalle);
router.get('/proyectos/:proyecto', proyectosController.getProyectoDetalle);
router.get('/proyectos', proyectosController.getProyectos);

module.exports = router;
