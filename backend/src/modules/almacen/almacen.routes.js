'use strict';

const express = require('express');
const multer = require('multer');
const controller = require('./almacen.controller');
const service = require('./almacen.service');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();
const upload = multer({ storage:multer.memoryStorage(), limits:{ fileSize:25*1024*1024, files:1 } });

const DASHBOARD_PERMISSION = 'ALMACEN_DASHBOARD_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const INVENTORY_PERMISSION = 'ALMACEN_INVENTARIOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
// Stock conserva temporalmente el codigo de permiso legado porque el SQL de migracion
// reutiliza el registro historico de Movimientos. Los demas modulos usan su permiso propio.
const STOCK_PERMISSION = 'ALMACEN_MOVIMIENTOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const LOANS_PERMISSION = 'ALMACEN_PRESTAMOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const GUARDS_PERMISSION = 'ALMACEN_RESGUARDOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const AUDIT_PERMISSION = 'ALMACEN_AUDITORIA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const LOAD_PERMISSION = 'ALMACEN_CARGA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

function almacenGuard(permissionCode) {
  return humanInformationGuard_gnral({ permissionCodesAny:[permissionCode], domain:'CORELLIAN', groupingCodesAny:['ALMACEN'] });
}

async function inventoryCapabilities(_req,res,next){
  try{
    // Inventario conserva solamente la lectura de la fuente activa.
    // La mutación del lote fue separada a Almacén > Carga de Información.
    res.json({ok:true,canImport:false,source:await service.activeSource(),loadRoute:'almacen-carga'});
  }catch(error){next(error);}
}

async function loadCapabilities(_req,res,next){
  try{
    // Llegar aquí implica que humanInformationGuard_gnral ya validó LOAD_PERMISSION.
    res.json({ok:true,canImport:true,source:await service.activeSource(),permission:LOAD_PERMISSION});
  }catch(error){next(error);}
}


router.get('/dashboard', ...almacenGuard(DASHBOARD_PERMISSION), controller.dashboard);
router.get('/inventario', ...almacenGuard(INVENTORY_PERMISSION), controller.inventory);
router.get('/inventario/catalogos', ...almacenGuard(INVENTORY_PERMISSION), controller.catalogs);
router.get('/inventario/empresa', ...almacenGuard(INVENTORY_PERMISSION), controller.company);
router.get('/inventario/almacenes', ...almacenGuard(INVENTORY_PERMISSION), controller.warehouses);
router.get('/inventario/top', ...almacenGuard(INVENTORY_PERMISSION), controller.top);

router.get('/stock', ...almacenGuard(STOCK_PERMISSION), controller.stock);
router.get('/prestamos/catalogos', ...almacenGuard(LOANS_PERMISSION), controller.loanCatalogs);
router.get('/prestamos/resumen', ...almacenGuard(LOANS_PERMISSION), controller.loanSummary);
router.get('/prestamos', ...almacenGuard(LOANS_PERMISSION), controller.loans);
router.get('/resguardos/catalogos', ...almacenGuard(GUARDS_PERMISSION), controller.guardCatalogs);
router.get('/resguardos', ...almacenGuard(GUARDS_PERMISSION), controller.guards);

router.get('/auditoria/catalogos', ...almacenGuard(AUDIT_PERMISSION), controller.auditCatalogs);
router.get('/auditoria/muestra', ...almacenGuard(AUDIT_PERMISSION), controller.auditSample);

// El módulo Inventario ya no expone funciones de carga.
router.get('/importaciones/capabilities', ...almacenGuard(INVENTORY_PERMISSION), inventoryCapabilities);

// Carga de Información: permiso independiente administrable desde Panel de Control.
router.get('/carga/capabilities', ...almacenGuard(LOAD_PERMISSION), loadCapabilities);
router.post('/carga/validar', ...almacenGuard(LOAD_PERMISSION), upload.single('archivo'), controller.validateImport);
router.post('/carga/importar', ...almacenGuard(LOAD_PERMISSION), upload.single('archivo'), controller.importSpreadsheet);

module.exports = router;
