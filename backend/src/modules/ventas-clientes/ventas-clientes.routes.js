const express = require('express');
const controller = require('./ventas-clientes.controller');
const { requireAuth } = require('../../middleware/auth.middleware');

const router = express.Router();

// Sin API key y sin sesión, igual que el sync histórico de Cotizaciones.
router.post('/clientes/sync', controller.syncClientes);

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
