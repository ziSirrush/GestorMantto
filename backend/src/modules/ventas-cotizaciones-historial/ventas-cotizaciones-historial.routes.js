const express = require('express');
const controller = require('./ventas-cotizaciones-historial.controller');
const { requireAuth } = require('../../middleware/auth.middleware');

const router = express.Router();

// Consulta global para Dirección y usuarios con alcance comercial total.
router.get('/cotizaciones/historial', requireAuth, controller.listGlobal);
// Bitácora de una cotización. No se expone POST público: el historial se genera desde operaciones reales.
router.get('/cotizaciones/:id/historial', requireAuth, controller.listByCotizacion);

module.exports = router;
