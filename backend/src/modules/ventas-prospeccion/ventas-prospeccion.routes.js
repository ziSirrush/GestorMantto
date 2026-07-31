const express = require('express');
const controller = require('./ventas-prospeccion.controller');

const router = express.Router();

// Endpoints temporales de carga histórica desde respaldos de Google Sheets.
// Se mantienen sin sesión para conservar el patrón de los imports históricos existentes.
router.post('/prospeccion/sync', controller.syncProspections);
router.post('/prospeccion/comentarios/sync', controller.syncComments);

module.exports = router;
