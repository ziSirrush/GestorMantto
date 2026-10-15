'use strict';

// [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 2 V001]
// API humana, sin bypass M2M. Visible unicamente despues de conceder permisos.
const express = require('express');
const controller = require('./customer-experience-visitas.controller');
const service = require('./customer-experience-visitas.service');
const { hasEffectivePermission } = require('../../services/permissions/effective-permission.service');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();
const p = service.PERMISSIONS_COR;

// Un permiso de accion NO sustituye al ACCESO_VISUAL preexistente del modulo.
// El guard valida tambien identidad efectiva, agrupacion y alcance CORELLIAN.
async function requireVisual_cor(req, res, next) {
  try {
    const id = Number(req.informationAccess?.effective_user_id);
    const allowed = Number.isSafeInteger(id) && id > 0
      && await hasEffectivePermission(id, p.visual);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        code: 'CX_VISITAS_VISUAL_DENIED',
        message: 'No tienes acceso al modulo de Visitas.'
      });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

function actionGuard_cor(actionCode) {
  return [
    ...humanInformationGuard_gnral({
      permissionCode: actionCode,
      domain: 'CORELLIAN',
      groupingCode: 'CUSTOMER_EXPERIENCE'
    }),
    requireVisual_cor
  ];
}

router.get('/', ...actionGuard_cor(p.list), controller.list_cor);
router.get('/:id/historial', ...actionGuard_cor(p.history), controller.history_cor);
router.get('/:id', ...actionGuard_cor(p.list), controller.get_cor);
router.post('/', ...actionGuard_cor(p.create), controller.create_cor);
router.patch('/:id', ...actionGuard_cor(p.edit), controller.edit_cor);
router.delete('/:id', ...actionGuard_cor(p.deactivate), controller.deactivate_cor);

module.exports = router;
