'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_2_V001]
// Fase 6: simulacion POST sin escritura y alta POST cerrada hasta corte GC+VA+MP.
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
      return {
        table,
        label: meta.label,
        primary_key: meta.primaryKey,
        can_view: canView,
        can_edit: canView && req.viewerContext?.active !== true && effective.get(codes.edit) === true &&
          (table !== 'pc' || pcEditFeatureEnabled_uni()),
        ...(table==='pc'?{
          can_prepare_create:canView && req.viewerContext?.active !== true && effective.get(codes.edit)===true,
          can_create:canView && req.viewerContext?.active !== true && effective.get(codes.edit)===true && createGateEnabled_uni()
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
      (table!=='pc' || pcEditFeatureEnabled_uni());
    const canPrepareCreate=table==='pc' && req.viewerContext?.active !== true && rights.get(cfg.edit)===true;
    return res.json({ok:true,table,can_view:true,can_edit:canEdit,
      ...(table==='pc'?{editable_fields:canEdit?PHASE3_SAFE_FIELDS_UNI:[],
        edit_policy:'safe_fields_until_authorized_cutover',
        can_prepare_create:canPrepareCreate,
        can_create:canPrepareCreate && createGateEnabled_uni()}:{})});
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
