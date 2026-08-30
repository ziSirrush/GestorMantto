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
const OPERATIONS_PERMISSION = 'ALMACEN_MOVIMIENTOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

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

router.get('/stock', ...almacenGuard(OPERATIONS_PERMISSION), controller.stock);
router.get('/prestamos/catalogos', ...almacenGuard(OPERATIONS_PERMISSION), controller.loanCatalogs);
router.get('/prestamos/resumen', ...almacenGuard(OPERATIONS_PERMISSION), controller.loanSummary);
router.get('/prestamos', ...almacenGuard(OPERATIONS_PERMISSION), controller.loans);
router.get('/resguardos/catalogos', ...almacenGuard(OPERATIONS_PERMISSION), controller.guardCatalogs);
router.get('/resguardos', ...almacenGuard(OPERATIONS_PERMISSION), controller.guards);

router.get('/auditoria/catalogos', ...almacenGuard(OPERATIONS_PERMISSION), controller.auditCatalogs);
router.get('/auditoria/muestra', ...almacenGuard(OPERATIONS_PERMISSION), controller.auditSample);

router.get('/importaciones/capabilities', ...almacenGuard(INVENTORY_PERMISSION), controller.capabilities);
router.post('/importaciones/validar', ...almacenGuard(INVENTORY_PERMISSION), requireImportRole, upload.single('archivo'), controller.validateImport);
router.post('/importaciones', ...almacenGuard(INVENTORY_PERMISSION), requireImportRole, upload.single('archivo'), controller.importSpreadsheet);

module.exports = router;
