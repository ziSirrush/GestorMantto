'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_2_V001]
// Contrato de Administracion: GC / VA / MP, permisos efectivos y alcance UNITED.
const express = require('express');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');
const { listEffectivePermissions } = require('../../services/permissions/effective-permission.service');
const { TABLES_UNI } = require('./cobranza-uni-administracion.constants');
const { MAIN_VISUAL, TABLE_PERMISSIONS, ALL_TABLE_PERMISSIONS } =
  require('./cobranza-uni-administracion.permissions');

const {listGestionCredito_uni} = require('./cobranza-uni-administracion.gc-service');
const {listVentaAdicionalAdmin_uni} = require('./cobranza-uni-administracion.pc-service');
const {PHASE3_SAFE_FIELDS_UNI} = require('./cobranza-uni-administracion.pc-edit-validation');
const {pcEditFeatureEnabled_uni,updateSinglePc_uni,updateMultiPc_uni} =
  require('./cobranza-uni-administracion.pc-edit-service');
const {createGateEnabled_uni,preflightCreatePc_uni,createPc_uni} =
  require('./cobranza-uni-administracion.pc-create-service');
const {updateSingleGc_uni,updateMultiGc_uni} =
  require('./cobranza-uni-administracion.gc-edit-service');
// [BLT NOW | 2026-10-23 | MP CI FIX V001]
// La ruta administrativa comparte modulo con GC/VA; cargar dependencias de MP
// solo cuando se consultan permisos/operaciones MP evita acoplar el arranque
// de VA a los contratos de edicion de MP (tests y funcionalidad independientes).
const mpEditService_uni=()=>require('./cobranza-uni-administracion.mp-edit-service');
const mpValidation_uni=()=>require('./cobranza-uni-administracion.mp-edit-validation');
const mpEditFeatureEnabled_uni=()=>mpEditService_uni().mpEditFeatureEnabled_uni();
const updateSingleMp_uni=(...args)=>mpEditService_uni().updateSingleMp_uni(...args);
const updateMultiMp_uni=(...args)=>mpEditService_uni().updateMultiMp_uni(...args);

const router = express.Router();
const guard = humanInformationGuard_gnral({
  permissionCode: MAIN_VISUAL,
  domain: 'UNITED',
  groupingCode: 'COBRANZA_UNI'
});

function effectiveId(req) {
  const user = req.contextUser || req.user || null;
  const id = Number(user && (user.id_SB || user.id));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

router.get('/contrato', ...guard, async (req, res, next) => {
  try {
    const id = effectiveId(req);
    if (!id) return res.status(401).json({ok:false,code:'EFFECTIVE_USER_REQUIRED'});
    const effective = await listEffectivePermissions(id, ALL_TABLE_PERMISSIONS);
    const tables = Object.entries(TABLES_UNI).map(([table, meta]) => {
      const codes = TABLE_PERMISSIONS[table];
      const canView = effective.get(codes.view) === true;
      const canEdit = canView && req.viewerContext?.active !== true &&
        effective.get(codes.edit) === true &&
        (table !== 'pc' || pcEditFeatureEnabled_uni()) &&
        (table !== 'detalle_mp_2026' || mpEditFeatureEnabled_uni());
      return {
        table,
        label: meta.label,
        primary_key: meta.primaryKey,
        can_view: canView,
        can_edit: canEdit,
        ...(table==='pc'?{
          can_prepare_create:canView && req.viewerContext?.active !== true && effective.get(codes.edit)===true,
          can_create:canView && req.viewerContext?.active !== true && effective.get(codes.edit)===true && createGateEnabled_uni()
        }:{}),
        ...(table==='detalle_mp_2026'?{
          // Misma puerta Excel de /tablas/:tabla/acceso; el legado de alta/vinculo
          // NO concede escritura desde el contrato de usuario.
          can_write_zone1:canEdit &&
            require('./cobranza-uni-administracion.mp-zona1-write-service').zone1ExcelWriteEnabled_uni()
        }:{}),
        schema_ready: meta.schemaReady
      };
    });
    return res.json({ok:true,source:'permisos',readonly:true,tables});
  } catch (error) { return next(error); }
});

// Comprobar permiso de tabla por separado: la seleccion no hereda EDITAR del Main.
router.get('/tablas/:tabla/acceso', ...guard, async (req, res, next) => {
  try {
    const table = String(req.params.tabla || '');
    const cfg = TABLE_PERMISSIONS[table];
    if (!cfg) return res.status(404).json({ok:false,code:'TABLA_NO_EXISTE'});
    const id = effectiveId(req);
    if (!id) return res.status(401).json({ok:false,code:'EFFECTIVE_USER_REQUIRED'});
    const rights = await listEffectivePermissions(id, [cfg.view, cfg.edit]);
    if (rights.get(cfg.view) !== true) {
      return res.status(403).json({ok:false,code:'COBRANZA_UNI_ADMIN_TABLA_DENEGADA'});
    }
    const canEdit=req.viewerContext?.active !== true && rights.get(cfg.edit) === true &&
      (table!=='pc' || pcEditFeatureEnabled_uni()) &&
      (table!=='detalle_mp_2026' || mpEditFeatureEnabled_uni());
    const canPrepareCreate=table==='pc' && req.viewerContext?.active !== true && rights.get(cfg.edit)===true;
    const canWriteZone1=table==='detalle_mp_2026' && canEdit &&
      require('./cobranza-uni-administracion.mp-zona1-write-service').zone1ExcelWriteEnabled_uni();
    return res.json({ok:true,table,can_view:true,can_edit:canEdit,
      ...(table==='pc'?{editable_fields:canEdit?PHASE3_SAFE_FIELDS_UNI:[],
        edit_policy:'safe_fields_permission_and_write_gate',
        can_prepare_create:canPrepareCreate,
        can_create:canPrepareCreate && createGateEnabled_uni()}:{}),
      ...(table==='detalle_mp_2026'?{
        editable_fields:canEdit?mpValidation_uni().PHASE4_SAFE_FIELDS_MP_UNI:[],
        edit_policy:'safe_fields_permission_and_write_gate',
        can_write_zone1:canWriteZone1,
        zona1_editable_fields:canWriteZone1
          ? require('./cobranza-uni-administracion.mp-zona1-validation').INVOICE_FIELDS_MP_UNI:[]
      }:{})});
  } catch(error) { return next(error); }
});

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_3_V001]
// Consulta tipo Excel GC: permiso VER propio, puerta UNITED y alcance por fila.
// EDITAR no concede lectura por si solo; la lectura NO concede escritura.
router.get('/tablas/gestion_credito/registros', ...guard, async (req, res, next) => {
  try {
    const id = effectiveId(req);
    if (!id) return res.status(401).json({ok:false,code:'EFFECTIVE_USER_REQUIRED'});
    const permission = TABLE_PERMISSIONS.gestion_credito.view;
    const rights = await listEffectivePermissions(id, [permission]);
    if (rights.get(permission) !== true) {
      return res.status(403).json({ok:false,code:'COBRANZA_UNI_ADMIN_TABLA_DENEGADA'});
    }
    const result = await listGestionCredito_uni(req);
    return res.json(result);
  } catch (error) {
    if (error && error.statusCode === 400) {
      return res.status(400).json({
        ok:false, code:error.code || 'COBRANZA_UNI_ADMIN_CONSULTA_INVALIDA',
        message:error.message
      });
    }
    return next(error);
  }
});


// [BLT NOW | 2026-10-23 | COBRANZA_UNI_VA_ADMIN_FASE_2_V001]
// Lectura pc: permiso VER independiente; la puerta MAIN y el alcance UNITED
// permanecen obligatorios. Este endpoint NUNCA escribe ni recalcula pc.
router.get('/tablas/pc/registros', ...guard, async (req,res,next)=>{
  try {
    const id = effectiveId(req);
    if (!id) return res.status(401).json({ok:false,code:'EFFECTIVE_USER_REQUIRED'});
    const permission = TABLE_PERMISSIONS.pc.view;
    const rights = await listEffectivePermissions(id,[permission]);
    if (rights.get(permission) !== true) {
      return res.status(403).json({ok:false,code:'COBRANZA_UNI_ADMIN_TABLA_DENEGADA'});
    }
    return res.json(await listVentaAdicionalAdmin_uni(req));
  } catch(error) {
    if (error && error.statusCode === 400) {
      return res.status(400).json({ok:false,
        code:error.code || 'COBRANZA_UNI_VA_ADMIN_CONSULTA_INVALIDA',
        message:error.message});
    }
    return next(error);
  }
});


// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_2_V001]
// Lectura MP independiente: guard MAIN, permiso VER propio y scope oficial
// UNITED por fila dentro del servicio. Nunca JOIN por nombre ni operaciones DML.
router.get('/tablas/detalle_mp_2026/registros', ...guard, async(req,res,next)=>{
  try {
    const id = effectiveId(req);
    if (!id) return res.status(401).json({ok:false,code:'EFFECTIVE_USER_REQUIRED'});
    const permission = TABLE_PERMISSIONS.detalle_mp_2026.view;
    const rights = await listEffectivePermissions(id,[permission]);
    if (rights.get(permission) !== true)
      return res.status(403).json({ok:false,code:'COBRANZA_UNI_ADMIN_TABLA_DENEGADA'});
    const {listMantenimientoPreventivoAdmin_uni} = require('./cobranza-uni-administracion.mp-service');
    return res.json(await listMantenimientoPreventivoAdmin_uni(req));
  } catch(error) {
    if (error && error.statusCode === 400)
      return res.status(400).json({ok:false,
        code:error.code||'COBRANZA_UNI_MP_ADMIN_CONSULTA_INVALIDA',message:error.message});
    return next(error);
  }
});

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_7_V001]
// Conciliacion READ ONLY: guarda de Administracion y permiso MP.VER efectivo,
// filtros oficiales de UNITED/identidad en el servicio. No expone huérfanos
// globales de Zona 1 ni habilita corte GAS por resultados favorables.
router.get('/tablas/detalle_mp_2026/conciliacion', ...guard, async(req,res,next)=>{
  try{
    const {reconcileMpAdmin_uni}=require('./cobranza-uni-administracion.mp-reconciliation');
    return res.json(await reconcileMpAdmin_uni(req));
  }catch(error){
    if(error&&[400,401,403].includes(error.statusCode))
      return res.status(error.statusCode).json({ok:false,
        code:error.code||'MP_F7_CONCILIACION_DENEGADA',message:error.message});
    return next(error);
  }
});

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_EXCEL_FASE_4_V001]
// Zona 1 solo en pestaña de MP: GET paginado con MAIN + MP.VER,
// scope/identidad oficial dentro del mismo SELECT, nunca JOIN textual.
router.get('/tablas/detalle_mp_2026/zona-1/registros', ...guard, async(req,res,next)=>{
  try{
    const id=effectiveId(req);
    if(!id)return res.status(401).json({ok:false,code:'EFFECTIVE_USER_REQUIRED'});
    const permission=TABLE_PERMISSIONS.detalle_mp_2026.view;
    const rights=await listEffectivePermissions(id,[permission]);
    if(rights.get(permission)!==true)
      return res.status(403).json({ok:false,code:'COBRANZA_UNI_ADMIN_TABLA_DENEGADA'});
    const {listMpZona1Grid_uni}=require('./cobranza-uni-administracion.mp-zona1-grid');
    return res.json(await listMpZona1Grid_uni(req));
  }catch(error){
    if(error&&[400,401,403,409].includes(error.statusCode))
      return res.status(error.statusCode).json({ok:false,
        code:error.code||'MP_ZONA1_GRID_CONSULTA_INVALIDA',message:error.message});
    return next(error);
  }
});

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_5_V001]
// Detalle Zona 1 READ ONLY por id_dmp; misma puerta MAIN/UNITED y MP.VER.
// La identidad de proyecto se valida otra vez en el servicio; sin JOIN textual.
router.get('/tablas/detalle_mp_2026/registros/:id/zona-1', ...guard, async(req,res,next)=>{
  try{
    const actor=effectiveId(req);
    if(!actor)return res.status(401).json({ok:false,code:'EFFECTIVE_USER_REQUIRED'});
    const permission=TABLE_PERMISSIONS.detalle_mp_2026.view;
    const rights=await listEffectivePermissions(actor,[permission]);
    if(rights.get(permission)!==true)
      return res.status(403).json({ok:false,code:'COBRANZA_UNI_ADMIN_TABLA_DENEGADA'});
    const {getZona1DetalleMp_uni}=require('./cobranza-uni-administracion.mp-zona1-service');
    return res.json(await getZona1DetalleMp_uni(req,req.params.id));
  }catch(error){
    if(error&&[400,403,404,409].includes(error.statusCode))
      return res.status(error.statusCode).json({ok:false,
        code:error.code||'MP_ZONA1_CONSULTA_INVALIDA',message:error.message});
    return next(error);
  }
});

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_6_V001]
// API heredada: preflight SELECT y alta/vinculo protegidos con puerta propia;
// no hay consumidores de esos POST en el editor Excel. Se conservan para
// compatibilidad hasta verificar que no existen clientes externos.
const zona1Write_uni=()=>require('./cobranza-uni-administracion.mp-zona1-write-service');
const zona1BasePath_uni='/tablas/detalle_mp_2026/zona-1/:id';
function sendZone1Error_uni(error,res,next){
  if(error&&[400,401,403,404,409,413,422].includes(error.statusCode))
    return res.status(error.statusCode).json({ok:false,
      code:error.code||'MP_ZONA1_OPERACION_INVALIDA',message:error.message});
  return next(error);
}
router.post(zona1BasePath_uni+'/validar-vinculo',...guard,async(req,res,next)=>{
  try{return res.json(await zona1Write_uni().preflightLinkZone1_uni(req,req.params.id,req.body));}
  catch(error){return sendZone1Error_uni(error,res,next);}
});
router.post(zona1BasePath_uni+'/validar-alta',...guard,async(req,res,next)=>{
  try{return res.json(await zona1Write_uni().preflightCreateZone1_uni(req,req.params.id,req.body));}
  catch(error){return sendZone1Error_uni(error,res,next);}
});
router.post(zona1BasePath_uni+'/validar-cambio/:zonaId',...guard,async(req,res,next)=>{
  try{return res.json(await zona1Write_uni().preflightEditZone1_uni(req,req.params.id,req.params.zonaId,req.body));}
  catch(error){return sendZone1Error_uni(error,res,next);}
});
router.post(zona1BasePath_uni+'/vincular',...guard,async(req,res,next)=>{
  try{return res.json(await zona1Write_uni().linkZone1_uni(req,req.params.id,req.body));}
  catch(error){return sendZone1Error_uni(error,res,next);}
});
router.post(zona1BasePath_uni,...guard,async(req,res,next)=>{
  try{return res.status(201).json(await zona1Write_uni().createZone1_uni(req,req.params.id,req.body));}
  catch(error){return sendZone1Error_uni(error,res,next);}
});
// F5: un campo en 2-20 filas; todo o nada, permisos revalidados en servicio.
// El path fijo DEBE ir antes de /zona-1/:id/:zonaId.
router.patch('/tablas/detalle_mp_2026/zona-1/registros/edicion-multiple',...guard,async(req,res,next)=>{
  try{
    const {editBulkZone1Excel_uni}=require('./cobranza-uni-administracion.mp-zona1-excel-bulk');
    return res.json(await editBulkZone1Excel_uni(req,req.body));
  }catch(error){return sendZone1Error_uni(error,res,next);}
});
router.patch(zona1BasePath_uni+'/:zonaId',...guard,async(req,res,next)=>{
  try{return res.json(await zona1Write_uni().editZone1_uni(req,req.params.id,req.params.zonaId,req.body));}
  catch(error){return sendZone1Error_uni(error,res,next);}
});

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_3_V001]
// PATCH de MP con permiso, alcance, concurrencia y auditoria del servicio.
// Una peticion PATCH NUNCA autoriza por si misma.
function sendMpWriteError_uni(error,res,next){
  if(error && [400,401,403,404,409,413,422].includes(error.statusCode))
    return res.status(error.statusCode).json({ok:false,
      code:error.code||'MP_ADMIN_EDICION_INVALIDA',message:error.message,
      details:error.details||undefined});
  return next(error);
}
router.patch('/tablas/detalle_mp_2026/registros/edicion-multiple', ...guard,async(req,res,next)=>{
  try{return res.json(await updateMultiMp_uni(req,req.body));}
  catch(error){return sendMpWriteError_uni(error,res,next);}
});
router.patch('/tablas/detalle_mp_2026/registros/:id', ...guard,async(req,res,next)=>{
  try{return res.json(await updateSingleMp_uni(req,req.params.id,req.body));}
  catch(error){return sendMpWriteError_uni(error,res,next);}
});

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_4_V001]
// La ruta hereda guard: sesion, permiso MAIN, puerta UNITED/COBRANZA_UNI.
// El servicio REVALIDA VER+EDITAR y el alcance territorial POR FILA dentro
// de la transaccion. Nunca se escribe desde la ruta GET de Fase 3.
function sendWriteError_uni(error,res,next){
  if(error && [400,401,403,404,409,413,422].includes(error.statusCode)){
    return res.status(error.statusCode).json({ok:false,
      code:error.code||'GC_ADMIN_EDICION_INVALIDA',message:error.message,
      details:error.details||undefined});
  }
  return next(error);
}

router.patch('/tablas/gestion_credito/registros/edicion-multiple', ...guard,
  async (req,res,next)=>{
    try {return res.json(await updateMultiGc_uni(req,req.body));}
    catch(error){return sendWriteError_uni(error,res,next);}
  }
);
router.patch('/tablas/gestion_credito/registros/:id', ...guard,
  async (req,res,next)=>{
    try {return res.json(await updateSingleGc_uni(req,req.params.id,req.body));}
    catch(error){return sendWriteError_uni(error,res,next);}
  }
);

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_VA_ADMIN_FASE_3_V001]
// PUT/POST/DELETE are not supported. GET remains read-only. PATCH requires
// MAIN+VER+EDITAR, server feature cutover gate and verified row scope.
function sendPcWriteError_uni(error,res,next){
  if(error && [400,401,403,404,409,413,422].includes(error.statusCode)){
    return res.status(error.statusCode).json({ok:false,
      code:error.code||'VA_ADMIN_EDICION_INVALIDA',message:error.message,
      details:error.details||undefined});
  }
  return next(error);
}
router.patch('/tablas/pc/registros/edicion-multiple', ...guard, async(req,res,next)=>{
  try{return res.json(await updateMultiPc_uni(req,req.body));}
  catch(error){return sendPcWriteError_uni(error,res,next);}
});
router.patch('/tablas/pc/registros/:id', ...guard, async(req,res,next)=>{
  try{return res.json(await updateSinglePc_uni(req,req.params.id,req.body));}
  catch(error){return sendPcWriteError_uni(error,res,next);}
});

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_VA_ADMIN_FASE_6_V001]
// La simulacion POST hace solo SELECT y exige MAIN+VER+EDITAR.
// La alta real repite TODOS los controles y requiere los tres flags del corte.
router.post('/tablas/pc/registros/validar-alta', ...guard, async(req,res,next)=>{
  try{return res.json(await preflightCreatePc_uni(req,req.body));}
  catch(error){return sendPcWriteError_uni(error,res,next);}
});
router.post('/tablas/pc/registros', ...guard, async(req,res,next)=>{
  try{return res.status(201).json(await createPc_uni(req,req.body));}
  catch(error){return sendPcWriteError_uni(error,res,next);}
});

module.exports = router;
