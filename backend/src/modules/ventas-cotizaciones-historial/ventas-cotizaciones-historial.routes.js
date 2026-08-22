// [Aster | 2026-08-19 | ASTER-MG | FASE 1 VENTAS: Guard General y permisos funcionales]
'use strict';

const express = require('express');
const controller = require('./ventas-cotizaciones-historial.controller');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();

function ventasGuard(permissionCodesAny) {
  return humanInformationGuard_gnral({
    permissionCodesAny: Array.isArray(permissionCodesAny) ? permissionCodesAny : [permissionCodesAny],
    domain: 'CORELLIAN',
    groupingCodesAny: ['VENTAS']
  });
}

const HISTORIAL_PERMISSION = 'VENTAS_PROYECCION_TABLA_COTIZACIONES_POR_ESTATUS_HISTORIAL.VER_HISTORIAL';

// Consulta global del historial. Fase 2 aplicará usuarios_visibles directamente en la consulta.
router.get('/cotizaciones/historial', ...ventasGuard(HISTORIAL_PERMISSION), controller.listGlobal);
// Bitácora de una cotización. No se expone POST público: el historial se genera desde operaciones reales.
router.get('/cotizaciones/:id/historial', ...ventasGuard(HISTORIAL_PERMISSION), controller.listByCotizacion);

module.exports = router;
