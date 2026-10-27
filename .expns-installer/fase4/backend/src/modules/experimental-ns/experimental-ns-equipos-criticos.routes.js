'use strict';

const express = require('express');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');
const controller = require('./experimental-ns-equipos-criticos.controller');
const { REQUIRED_PERMISSION } = require('./experimental-ns-equipos-criticos.service');

const router = express.Router();
function requireProgramador(req,res,next) {
  if (!req.actorUser || req.actorUser.is_programador !== true) {
    return res.status(403).json({ok:false,code:'EXPERIMENTAL_NS_PROGRAMMER_REQUIRED',
      message:'Experimental NS esta reservado al rol Programador.'});
  }
  return next();
}
const [requireSession, requireSpecificPermission] = humanInformationGuard_gnral({
  domain:'UNITED',groupingCode:'EXPERIMENTAL_NS',permissionCode:REQUIRED_PERMISSION
});
router.get('/equipos-criticos/inicial',requireSession,requireProgramador,requireSpecificPermission,controller.initial);
router.get('/equipos-criticos/detalle',requireSession,requireProgramador,requireSpecificPermission,controller.detail);
module.exports = router;
