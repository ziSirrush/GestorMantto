'use strict';

const express = require('express');
const controller = require('./instalaciones-administracion.controller');
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


// [Aster | 2026-10-09 | ASTER-MG | FIX_3_INSTALACIONES_ADMINISTRACION_EDICION_MULTIPLE_V001]
// Todas las operaciones vuelven a validar proyecto, equipos, permisos,
// alcance y concurrencia dentro del servicio/repositorio. No confiar en UI.
router.patch(
  '/administracion/proyectos/:projectKey/equipos/edicion-multiple',
  ...accessGuard_cor,
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
