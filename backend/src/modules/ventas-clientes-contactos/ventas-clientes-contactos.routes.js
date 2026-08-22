// [Aster | 2026-08-19 | ASTER-MG | FASE 1 VENTAS: Guard General y permisos funcionales]
'use strict';

const express = require('express');
const controller = require('./ventas-clientes-contactos.controller');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();

function ventasGuard(permissionCodesAny) {
  return humanInformationGuard_gnral({
    permissionCodesAny: Array.isArray(permissionCodesAny) ? permissionCodesAny : [permissionCodesAny],
    domain: 'CORELLIAN',
    groupingCodesAny: ['VENTAS']
  });
}

const CLIENTE_DETAIL_ACCESS = Object.freeze([
  'VENTAS_CLIENTES_TABLA_CLIENTES_DETALLE_CLIENTE.VER',
  'VENTAS_CLIENTES_TABLA_CLIENTES_LISTADO_CLIENTES.ABRIR_DETALLE'
]);

router.get('/clientes/:id/contactos', ...ventasGuard(CLIENTE_DETAIL_ACCESS), controller.list);
router.post('/clientes/:id/contactos', ...ventasGuard('VENTAS_CLIENTES_TABLA_CLIENTES_NUEVO_CONTACTO.CREAR'), controller.create);
router.put('/clientes/:id/contactos/:idContacto', ...ventasGuard('VENTAS_CLIENTES_TABLA_CLIENTES_EDITAR_CONTACTO.EDITAR'), controller.update);
router.patch('/clientes/:id/contactos/:idContacto', ...ventasGuard('VENTAS_CLIENTES_TABLA_CLIENTES_EDITAR_CONTACTO.EDITAR'), controller.update);
router.patch('/clientes/:id/contactos/:idContacto/principal', ...ventasGuard('VENTAS_CLIENTES_TABLA_CLIENTES_EDITAR_CONTACTO.EDITAR'), controller.setPrincipal);
router.delete('/clientes/:id/contactos/:idContacto', ...ventasGuard('VENTAS_CLIENTES_TABLA_CLIENTES_DESACTIVAR_CONTACTO.DESACTIVAR'), controller.remove);

module.exports = router;
