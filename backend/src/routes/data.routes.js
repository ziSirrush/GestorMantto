const express = require('express');
const router = express.Router();

const dataController = require('../controllers/data.controller');
const criticosController = require('../controllers/criticos.controller');
const { optionalAuth, requireAuth } = require('../middleware/auth.middleware');

router.get('/estados-visuales', dataController.getEstadosVisuales);
router.get('/tickets', dataController.getTickets);
router.get('/tickets/:ticket', dataController.getTicketDetalle);
router.post('/tickets/:ticket/vobo', requireAuth, dataController.saveTicketVobo);
router.post('/tickets/sync', dataController.syncTickets);

router.get('/portafolio/filtros', dataController.getPortafolioFiltros);
router.get('/portafolio/dashboard', dataController.getPortafolioDashboard);
router.get('/portafolio/movimientos', dataController.getPortafolioMovimientos);
router.get('/portafolio/movimientos/:codigo/detalle', dataController.getPortafolioMovimientoDetalle);
router.get('/portafolio/equipos/:codigo', dataController.getPortafolioEquipoDetalle);
router.get('/portafolio/equipos', dataController.getPortafolioEquipos);
router.get('/portafolio/proyectos/detalle/:proyecto', dataController.getPortafolioProyectoDetalle);
router.get('/portafolio', dataController.getPortafolio);
router.post('/portafolio/sync', dataController.syncPortafolio);
router.get('/equipos', dataController.getEquipos);
router.get('/proyectos/filtros', dataController.getProyectosFiltros);
router.get('/proyectos/detalle', dataController.getProyectoDetalle);
router.get('/proyectos/detalle/:proyecto', dataController.getProyectoDetalle);
router.get('/proyectos/:proyecto', dataController.getProyectoDetalle);
router.get('/proyectos', dataController.getProyectos);

router.get('/equipos-criticos', criticosController.getEquiposCriticos);
router.get('/equipos-criticos/:codigo/tickets', criticosController.getEquipoCriticoTickets);
router.get('/proyectos-criticos', criticosController.getProyectosCriticos);
router.get('/proyectos-criticos/:proyecto/tickets', criticosController.getProyectoCriticoTickets);

router.get('/home/bootstrap', requireAuth, dataController.getHomeBootstrap);
router.get('/pendientes/catalogos', requireAuth, dataController.getPendientesCatalogos);
router.get('/pendientes', optionalAuth, dataController.getPendientes);
router.get('/pendientes/:id', requireAuth, dataController.getPendienteDetalle);
router.post('/pendientes', requireAuth, dataController.createPendiente);
router.put('/pendientes/:id', requireAuth, dataController.updatePendiente);
router.delete('/pendientes/:id', requireAuth, dataController.deletePendiente);
router.patch('/pendientes/:id/estatus', requireAuth, dataController.updatePendienteEstatus);
router.patch('/pendientes/:id/prioridad', requireAuth, dataController.updatePendientePrioridad);
router.post('/pendientes/:id/comentarios', requireAuth, dataController.createPendienteComentario);
router.patch('/pendientes/:id/subtareas/:idSubtarea', requireAuth, dataController.updatePendienteSubtarea);
router.get('/notificaciones', optionalAuth, dataController.getNotificaciones);
router.patch('/notificaciones/:id/abrir', requireAuth, dataController.abrirNotificacion);
router.patch('/notificaciones/:id/nuevo', requireAuth, dataController.marcarNotificacionNueva);
router.get('/actividad-reciente', optionalAuth, dataController.getActividadReciente);

router.get('/usuarios', dataController.getUsuarios);
router.get('/users', dataController.getUsuarios);

router.get('/permisos', dataController.getPermisos);
router.get('/roles', dataController.getRoles);
router.get('/zonas', dataController.getZonas);
router.get('/usuario-zop', dataController.getUsuarioZop);

module.exports = router;
