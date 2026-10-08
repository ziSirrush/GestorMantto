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
    if (!allowed) {
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

router.get(
  '/administracion/registros',
  ...accessGuard_cor,
  controller.search_cor
);

router.get(
  '/administracion/registros/:id',
  ...accessGuard_cor,
  controller.detail_cor
);

router.patch(
  '/administracion/registros/:id/grupos/:grupo',
  ...accessGuard_cor,
  requireGroupEdit_cor,
  controller.updateGroup_cor
);

module.exports = router;
