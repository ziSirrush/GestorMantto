// [Aster | 2026-08-12 | ASTER-MG | PATCH: FASE_2_BACKEND_M2M_GUARDS_V001]
const express = require('express');
const router = express.Router();
const portafolioController = require('./portafolio.controller');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');

const requirePortafolioIntegration = requireIntegrationAuthFor('INTEGRATION_PORTAFOLIO_ID');

router.get('/portafolio/filtros', portafolioController.getPortafolioFiltros);
router.get('/portafolio/dashboard', portafolioController.getPortafolioDashboard);
router.get('/portafolio/movimientos', portafolioController.getPortafolioMovimientos);
router.get('/portafolio/movimientos-semanales/catalogo', portafolioController.getPortafolioSemanasDisponibles);
router.get('/portafolio/movimientos-semanales', portafolioController.getPortafolioMovimientosSemanales);
router.get('/portafolio/movimientos/:codigo/detalle', portafolioController.getPortafolioMovimientoDetalle);
router.post('/portafolio/equipos/tickets-lote', portafolioController.getPortafolioEquipoTicketsLote);
router.get('/portafolio/equipos/:codigo', portafolioController.getPortafolioEquipoDetalle);
router.get('/portafolio/equipos', portafolioController.getPortafolioEquipos);
router.get('/portafolio/proyectos/detalle/:proyecto', portafolioController.getPortafolioProyectoDetalle);
router.get('/portafolio', portafolioController.getPortafolio);
router.post('/portafolio/sync', requirePortafolioIntegration, portafolioController.syncPortafolio);
router.get('/equipos', portafolioController.getEquipos);

module.exports = router;
