'use strict';

const express = require('express');
const controller = require('./instalaciones-administracion.controller');
const tableService = require('./instalaciones-administracion.tabla-service');
const autoService = require('./instalaciones-administracion.auto-service');
const { DIRECT_READONLY_FIELDS_COR } = require('./instalaciones-administracion.auto-rules');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');
const { hasEffectivePermission } = require('../../services/permissions/effective-permission.service');
const {
  ACCESS_PERMISSION_COR,
  GROUP_PERMISSIONS_COR
} = require('./instalaciones-administracion.constants');

const router = express.Router();

const accessGuard_cor = humanInformationGuard_gnral({
  permissionCode: ACCESS_PERMISSION_COR,
  domain: 'CORELLIAN',
  groupingCodesAny: ['INSTALACIONES']
});

function effectiveUserId_cor(req) {
  const user = req?.contextUser || req?.user || null;
  const id = Number(user?.id_SB || user?.id || 0);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function requireGroupEdit_cor(req, res, next) {
  try {
    const groupKey = String(req.params.grupo || '').trim();
    const codes = GROUP_PERMISSIONS_COR[groupKey];
    if (!codes) {
      return res.status(404).json({
        ok: false,
        code: 'INSTALACIONES_ADMINISTRACION_GRUPO_NO_EXISTE',
        message: 'El grupo solicitado no existe.'
      });
    }

    const userId = effectiveUserId_cor(req);
    const allowed = userId && await hasEffectivePermission(userId, codes.edit);
    if (!allowed || req.viewerContext?.active === true) {
      return res.status(403).json({
        ok: false,
        code: 'INSTALACIONES_ADMINISTRACION_EDICION_DENEGADA',
        message: 'No tienes permiso para editar este grupo.'
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

router.get(
  '/administracion/contrato',
  ...accessGuard_cor,
  controller.contract_cor
);


// [Aster | 2026-10-08 | ASTER-MG | FIX_1_INSTALACIONES_ADMINISTRACION_REDISENO_V001]
router.get('/administracion/filtros',...accessGuard_cor,controller.browseFilters_cor);
router.get('/administracion/proyectos',...accessGuard_cor,controller.projects_cor);
router.get('/administracion/proyectos/:projectKey/equipos',...accessGuard_cor,controller.projectEquipments_cor);

// [Aster | 2026-10-13 | ASTER-MG | FASE_1_CORRECTIVA_INSTALACIONES_TABLA_EXCEL_V001]
router.get('/administracion/proyectos/:projectKey/equipos/tabla',...accessGuard_cor,async(req,res,next)=>{
  try {
    const result=await tableService.projectEquipmentTable_cor(req,req.params.projectKey,req.query||{});
    return res.json({ok:true,source:'aiven',...result});
  } catch(error) {
    if(error?.statusCode)return res.status(error.statusCode).json({
      ok:false,code:error.code||'INSTALACIONES_ADMINISTRACION_TABLA_ERROR',message:error.message
    });
    return next(error);
  }
});


// [Mantto Gestor | 2026-10-13 | FASE_1_INSTALACIONES_ADMIN_V2_BACKEND_V001]
// Contratos nuevos: no sustituyen los endpoints de borradores de la V1
// hasta desplegar la nueva tabla en Fases 2/3. Guard CORELLIAN intacto.
function autoKnownError_cor(error,res,next){
  if(error?.statusCode){return res.status(error.statusCode).json({
    ok:false,code:error.code||'INSTALACIONES_ADMINISTRACION_AUTO_ERROR',
    message:error.message,details:error.details||undefined
  });}
  return next(error);
}

router.get('/administracion/catalogos-edicion',...accessGuard_cor,async(req,res,next)=>{
  try {return res.json({ok:true,source:'aiven',...await autoService.getEditCatalogs_cor(req)});}
  catch(error){return autoKnownError_cor(error,res,next);}
});

router.patch('/administracion/proyectos/:projectKey/equipos/edicion-multiple-directa',
  ...accessGuard_cor,async(req,res,next)=>{
    try {return res.json({ok:true,source:'aiven',
      ...await autoService.updateDirectMulti_cor(req,req.params.projectKey,req.body||{})});}
    catch(error){return autoKnownError_cor(error,res,next);}
  });

router.patch('/administracion/proyectos/:projectKey/equipos/:id/edicion-directa',
  ...accessGuard_cor,async(req,res,next)=>{
    try {return res.json({ok:true,source:'aiven',
      ...await autoService.updateDirect_cor(req,req.params.projectKey,req.params.id,req.body||{})});}
    catch(error){return autoKnownError_cor(error,res,next);}
  });

// Mientras conviven frontend V1/V2, las rutas de la TABLA V1 tampoco
// permiten escribir columnas ocultas o autocalculadas por HTTP directo.
const protectedTableFields_cor = new Set(DIRECT_READONLY_FIELDS_COR);
function forbidProtectedTableFields_cor(req,res,next){
  const input=req.body?.groups;
  if(!input || typeof input!=='object' || Array.isArray(input))return next();
  for(const payload of Object.values(input)){
    const fields=payload?.changes;
    if(!fields || typeof fields!=='object' || Array.isArray(fields))continue;
    const restricted=Object.keys(fields).find(f=>protectedTableFields_cor.has(f));
    if(restricted)return res.status(400).json({ok:false,
      code:'INSTALACIONES_ADMINISTRACION_TABLA_SOLO_LECTURA',
      message:'No se permite editar directamente IDs, controles ni calculados.',
      details:{field:restricted}
    });
  }
  return next();
}

// [Aster | 2026-10-09 | ASTER-MG | FIX_3_INSTALACIONES_ADMINISTRACION_EDICION_MULTIPLE_V001]
// Todas las operaciones vuelven a validar proyecto, equipos, permisos,
// alcance y concurrencia dentro del servicio/repositorio. No confiar en UI.
// [Aster | 2026-10-13 | ASTER-MG | FASE_3_INSTALACIONES_ADMINISTRACION_GUARDADO_AUDITORIA_V001]
// Un equipo, un proyecto verificado dentro de la transaccion y un Guard CORELLIAN.
router.patch(
  '/administracion/proyectos/:projectKey/equipos/:id/tabla',
  ...accessGuard_cor,
  forbidProtectedTableFields_cor,
  controller.updateTableEquipment_cor
);

router.patch(
  '/administracion/proyectos/:projectKey/equipos/edicion-multiple',
  ...accessGuard_cor,
  forbidProtectedTableFields_cor,
  controller.updateMulti_cor
);

router.get(
  '/administracion/registros',
  ...accessGuard_cor,
  controller.search_cor
);

// The user catalog is protected again in the service by RESPONSABLES.EDITAR.
router.get(
  '/administracion/usuarios',
  ...accessGuard_cor,
  controller.users_cor
);

router.get(
  '/administracion/registros/:id',
  ...accessGuard_cor,
  controller.detail_cor
);

// [Aster | 2026-10-08 | ASTER-MG | FIX_2_INSTALACIONES_ADMINISTRACION_DETALLE_EQUIPO_V001]
// La ruta recibe un unico ID ins_fl. El servicio valida EDITAR por grupo
// y el Guard valida sesion + permiso de modulo + puerta/scope CORELLIAN.
router.patch(
  '/administracion/registros/:id/detalle',
  ...accessGuard_cor,
  controller.updateDetail_cor
);

router.patch(
  '/administracion/registros/:id/grupos/:grupo',
  ...accessGuard_cor,
  requireGroupEdit_cor,
  controller.updateGroup_cor
);

module.exports = router;
