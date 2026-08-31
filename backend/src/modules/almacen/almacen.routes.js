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

function almacenGuard(permissionCode) {
  return humanInformationGuard_gnral({ permissionCodesAny:[permissionCode], domain:'CORELLIAN', groupingCodesAny:['ALMACEN'] });
}

async function requireImportRole(req,res,next){
  try{
    const user=req.contextUser||req.user||{};
    const userId=Number(user.id_SB||user.id);
    if(!Number.isInteger(userId)||userId<=0)return res.status(401).json({ok:false,message:'Sesión sin usuario válido.'});
    if(!(await service.canImport(userId)))return res.status(403).json({ok:false,message:'La carga temporal de Excel está restringida a Programador / Programador Corellian.'});
    next();
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

router.get('/importaciones/capabilities', ...almacenGuard(INVENTORY_PERMISSION), controller.capabilities);
router.post('/importaciones/validar', ...almacenGuard(INVENTORY_PERMISSION), requireImportRole, upload.single('archivo'), controller.validateImport);
router.post('/importaciones', ...almacenGuard(INVENTORY_PERMISSION), requireImportRole, upload.single('archivo'), controller.importSpreadsheet);

module.exports = router;
