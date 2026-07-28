const express = require('express');
const controller = require('./ventas-cotizaciones.controller');

const router = express.Router();

router.post('/cotizaciones/sync', controller.syncCotizaciones);

module.exports = router;
