// [Aster | 2026-08-12 | ASTER-MG | PATCH: FASE_2_BACKEND_M2M_GUARDS_V001]
const express = require('express');
const controller = require('./ventas-clientes.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');

const requireVentasIntegration = requireIntegrationAuthFor('INTEGRATION_VENTAS_ID');

const router = express.Router();

// Carga manual desde Google Sheets. Con HMAC activo, solo acepta la identidad M2M de Ventas.
router.post('/clientes/sync', requireVentasIntegration, controller.syncClientes);

router.get('/clientes/catalogos', requireAuth, controller.getCatalogos);
router.get('/clientes/asesores-asignables', requireAuth, controller.getAssignableAdvisors);
router.get('/clientes/kpis', requireAuth, controller.getKpis);
router.get('/clientes', requireAuth, controller.listClientes);
router.get('/clientes/:id', requireAuth, controller.getCliente);
router.post('/clientes', requireAuth, controller.createCliente);
router.put('/clientes/:id', requireAuth, controller.updateCliente);
router.patch('/clientes/:id', requireAuth, controller.updateCliente);
router.delete('/clientes/:id', requireAuth, controller.deleteCliente);

module.exports = router;
