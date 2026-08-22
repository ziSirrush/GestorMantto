// [Aster | 2026-08-19 | ASTER-MG | FASE 4: Guard General por modulo]
const express = require('express');
const controller = require('./ventas-clientes.controller');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');

const requireVentasIntegration = requireIntegrationAuthFor('INTEGRATION_VENTAS_ID');
const router = express.Router();

function ventasGuard(permissionCodesAny) {
  return humanInformationGuard_gnral({
    permissionCodesAny: Array.isArray(permissionCodesAny) ? permissionCodesAny : [permissionCodesAny],
    domain: 'CORELLIAN',
    groupingCodesAny: ['VENTAS']
  });
}

router.post('/clientes/sync', requireVentasIntegration, controller.syncClientes);

router.get('/clientes/catalogos', ...ventasGuard('VENTAS_CLIENTES_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'), controller.getCatalogos);
router.get('/clientes/asesores-asignables', ...ventasGuard('VENTAS_CLIENTES_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'), controller.getAssignableAdvisors);
router.get('/clientes/kpis', ...ventasGuard('VENTAS_CLIENTES_KPI_INDICADORES_CLIENTES.VER'), controller.getKpis);
router.get('/clientes', ...ventasGuard('VENTAS_CLIENTES_TABLA_CLIENTES_LISTADO_CLIENTES.VER'), controller.listClientes);
router.get(
  '/clientes/:id',
  ...ventasGuard([
    'VENTAS_CLIENTES_TABLA_CLIENTES_DETALLE_CLIENTE.VER',
    'VENTAS_CLIENTES_TABLA_CLIENTES_LISTADO_CLIENTES.ABRIR_DETALLE'
  ]),
  controller.getCliente
);
router.post('/clientes', ...ventasGuard('VENTAS_CLIENTES_TABLA_CLIENTES_NUEVO_CLIENTE.CREAR'), controller.createCliente);
router.put('/clientes/:id', ...ventasGuard('VENTAS_CLIENTES_TABLA_CLIENTES_EDITAR_CLIENTE.EDITAR'), controller.updateCliente);
router.patch('/clientes/:id', ...ventasGuard('VENTAS_CLIENTES_TABLA_CLIENTES_EDITAR_CLIENTE.EDITAR'), controller.updateCliente);

// El catalogo no contiene DESACTIVAR_CLIENTE. No se inventa un permiso nuevo;
// la baja logica queda restringida al permiso real de edicion del cliente.
router.delete('/clientes/:id', ...ventasGuard('VENTAS_CLIENTES_TABLA_CLIENTES_EDITAR_CLIENTE.EDITAR'), controller.deleteCliente);

module.exports = router;
