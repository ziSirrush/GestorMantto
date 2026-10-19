'use strict';

// [Aster | 2026-10-19 | ASTER-MG | ALMACEN NS FASE 1 BASE + FASE 2 SYNC V001]
// Reemplazo integral del router Excel. Conserva las rutas de los siete
// apartados del frontend; solo Inventario/Dashboard/Stock/Auditoria cuentan
// con informacion contrastable en las busquedas recibidas hasta la F2.

const express = require('express');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');
const ns = require('./almacen.ns-query-service');
const audit = require('./almacen.ns-audit-service');
const nsSyncRoutes = require('./almacen.ns-sync-routes');
const router = express.Router();
// Receptor Sheets M2M aislado de los permisos humanos y de Excel.
router.use('/sync', nsSyncRoutes);

const PERMISSION = Object.freeze({
  dashboard:'ALMACEN_DASHBOARD_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  inventario:'ALMACEN_INVENTARIOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  // Codigo legado existente en el Panel de Control. NO se inventa uno nuevo.
  stock:'ALMACEN_MOVIMIENTOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  prestamos:'ALMACEN_PRESTAMOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  resguardos:'ALMACEN_RESGUARDOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  auditoria:'ALMACEN_AUDITORIA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  carga:'ALMACEN_CARGA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
});

function guard(permission){
  return humanInformationGuard_gnral({permissionCodesAny:[permission],domain:'CORELLIAN',groupingCodesAny:['ALMACEN']});
}
function guardAny(){
  return humanInformationGuard_gnral({
    permissionCodesAny:Object.values(PERMISSION),domain:'CORELLIAN',groupingCodesAny:['ALMACEN']
  });
}
function read(handler){
  return async (req,res,next)=>{
    try{const scope=ns.readScope(req);res.json(await handler(scope,req.query||{},req));}
    catch(e){next(e);}
  };
}
function auditRead(handler){
  return async (req,res,next)=>{
    try{const scope=ns.readScope(req);res.json(await handler(scope,req));}
    catch(e){next(e);}
  };
}
function auditWrite(handler){
  return async (req,res,next)=>{
    try{const scope=ns.readScope(req);res.json(await handler(scope,req));}
    catch(e){next(e);}
  };
}
function legacyGone(req,res){
  return res.status(410).json({
    ok:false,code:'ALMACEN_EXCEL_RETIRED',
    message:'La carga manual de Excel fue retirada. NetSuite/Sheets se integrara en Fase 3.'
  });
}

// La fuente es el ultimo corte NetSuite publicado, completo y ACTIVO.
router.get('/fuentes',...guardAny(),read(scope=>ns.listSources(scope)));
router.get('/dashboard',...guard(PERMISSION.dashboard),read(scope=>ns.getDashboard(scope)));
router.get('/inventario',...guard(PERMISSION.inventario),read((scope,q)=>ns.getInventory(scope,q)));
router.get('/inventario/catalogos',...guard(PERMISSION.inventario),read(scope=>ns.getCatalogs(scope)));
router.get('/inventario/empresa',...guard(PERMISSION.inventario),read((scope,q)=>ns.getCompany(scope,q)));
router.get('/inventario/almacenes',...guard(PERMISSION.inventario),read((scope,q)=>ns.getWarehouses(scope,q)));
router.get('/inventario/top',...guard(PERMISSION.inventario),read((scope,q)=>ns.getTop(scope,q)));

router.get('/stock',...guard(PERMISSION.stock),read((scope,q)=>ns.getStock(scope,q)));
router.get('/stock/reabasto',...guard(PERMISSION.stock),read((scope,q)=>ns.getStockReabasto(scope,q)));
router.patch('/stock/reabasto',...guard(PERMISSION.stock),legacyGone);

router.get('/prestamos/catalogos',...guard(PERMISSION.prestamos),read(scope=>ns.getLoanCatalogs(scope)));
router.get('/prestamos/resumen',...guard(PERMISSION.prestamos),read(scope=>ns.getLoanSummary(scope)));
router.get('/prestamos',...guard(PERMISSION.prestamos),read((scope,q)=>ns.getLoans(scope,q)));
router.get('/resguardos/catalogos',...guard(PERMISSION.resguardos),read(scope=>ns.getGuardCatalogs(scope)));
router.get('/resguardos',...guard(PERMISSION.resguardos),read((scope,q)=>ns.getGuards(scope,q)));

router.get('/auditoria/catalogos',...guard(PERMISSION.auditoria),read(scope=>ns.getAuditCatalogs(scope)));
router.get('/auditoria/muestra',...guard(PERMISSION.auditoria),read((scope,q)=>ns.getAuditSample(scope,q)));
router.get('/auditoria/historico',...guard(PERMISSION.auditoria),read((scope,q)=>audit.listAudits(scope,q)));
router.post('/auditoria',...guard(PERMISSION.auditoria),auditWrite((scope,req)=>audit.createAudit(scope,req.body||{},req)));
router.get('/auditoria/:folio',...guard(PERMISSION.auditoria),auditRead((scope,req)=>audit.getAudit(scope,req.params.folio)));
router.patch('/auditoria/:folio/items/:id',...guard(PERMISSION.auditoria),auditWrite((scope,req)=>audit.updateAuditItem(scope,req.params.folio,req.params.id,req.body||{},req)));
router.post('/auditoria/:folio/cerrar',...guard(PERMISSION.auditoria),auditWrite((scope,req)=>audit.closeAudit(scope,req.params.folio,req)));

// El apartado Carga de Informacion sigue existiendo. En Fase 4 se reemplaza
// su UI de Excel por monitoreo de lotes NetSuite. Sin escritura legacy.
router.get('/importaciones/capabilities',...guard(PERMISSION.inventario),read(async scope=>({
  ok:true,canImport:false,source:await ns.activeSource(scope),loadRoute:'almacen-carga',provider:'NETSUITE_AIVEN'
})));
router.get('/carga/capabilities',...guard(PERMISSION.carga),read(async scope=>({
  ok:true,canImport:false,source:await ns.activeSource(scope),provider:'NETSUITE_AIVEN',
  message:'La importacion de Excel fue retirada. Sincronizacion via Sheets pendiente de Fase 3.'
})));
router.post('/carga/validar',...guard(PERMISSION.carga),legacyGone);
router.post('/carga/archivar-activo',...guard(PERMISSION.carga),legacyGone);
router.post('/carga/archivar',...guard(PERMISSION.carga),legacyGone);
router.post('/carga/importar',...guard(PERMISSION.carga),legacyGone);
router.post('/carga/fuentes/:lote/activar',...guard(PERMISSION.carga),legacyGone);

module.exports=router;
