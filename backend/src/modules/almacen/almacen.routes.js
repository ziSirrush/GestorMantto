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
const SOURCE_PERMISSIONS = Object.freeze([
  DASHBOARD_PERMISSION,
  INVENTORY_PERMISSION,
  STOCK_PERMISSION,
  LOANS_PERMISSION,
  GUARDS_PERMISSION,
  AUDIT_PERMISSION,
  LOAD_PERMISSION
]);

function almacenGuard(permissionCode) {
  return humanInformationGuard_gnral({ permissionCodesAny:[permissionCode], domain:'CORELLIAN', groupingCodesAny:['ALMACEN'] });
}

function almacenSourceGuard() {
  return humanInformationGuard_gnral({ permissionCodesAny:SOURCE_PERMISSIONS, domain:'CORELLIAN', groupingCodesAny:['ALMACEN'] });
}

async function inventoryCapabilities(req,res,next){
  try{
    // Inventario es de solo lectura y respeta el cierre solicitado por Fase 3.
    // La mutación/importación sigue separada en Almacén > Carga de Información.
    res.json({ok:true,canImport:false,source:await service.resolveSource(req.query||{}),loadRoute:'almacen-carga'});
  }catch(error){next(error);}
}

async function loadCapabilities(_req,res,next){
  try{
    // Llegar aquí implica que humanInformationGuard_gnral ya validó LOAD_PERMISSION.
    res.json({ok:true,canImport:true,source:await service.activeSource(),permission:LOAD_PERMISSION});
  }catch(error){next(error);}
}

// Fuente común e histórico de cierres.
router.get('/fuentes', ...almacenSourceGuard(), controller.sources);
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

// [Aster | 2026-08-31 | ASTER-MG | FASE 3 ALMACEN CIERRES/AUDITORIA PERSISTENTE V001]
// almacen_fuente_excel permanece inmutable desde Auditoría; las capturas viven en almacen_auditoria.
router.get('/auditoria/historico', ...almacenGuard(AUDIT_PERMISSION), controller.listAudits);
router.post('/auditoria', ...almacenGuard(AUDIT_PERMISSION), controller.createAudit);
router.get('/auditoria/:folio', ...almacenGuard(AUDIT_PERMISSION), controller.getAudit);
router.patch('/auditoria/:folio/items/:id', ...almacenGuard(AUDIT_PERMISSION), controller.updateAuditItem);
router.post('/auditoria/:folio/cerrar', ...almacenGuard(AUDIT_PERMISSION), controller.closeAudit);

// El módulo Inventario ya no expone funciones de carga.
router.get('/importaciones/capabilities', ...almacenGuard(INVENTORY_PERMISSION), inventoryCapabilities);

// [Aster | 2026-09-01 | ASTER-MG | FIX ALMACEN ARCHIVO BLOB + STAGING ACTIVO V001]
// Carga de Información: el Excel original queda privado en Azure Blob. Aiven solo
// conserva una fila ARCHIVO por cierre y las filas normalizadas del cierre activo.
router.get('/carga/capabilities', ...almacenGuard(LOAD_PERMISSION), loadCapabilities);
router.post('/carga/validar', ...almacenGuard(LOAD_PERMISSION), upload.single('archivo'), controller.validateImport);
router.post('/carga/archivar-activo', ...almacenGuard(LOAD_PERMISSION), upload.single('archivo'), controller.archiveActive);
router.post('/carga/archivar', ...almacenGuard(LOAD_PERMISSION), upload.single('archivo'), controller.archiveSpreadsheet);
router.post('/carga/importar', ...almacenGuard(LOAD_PERMISSION), upload.single('archivo'), controller.importSpreadsheet);
router.post('/carga/fuentes/:lote/activar', ...almacenGuard(LOAD_PERMISSION), controller.activateSource);

module.exports = router;
