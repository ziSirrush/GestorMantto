'use strict';
// BLT NOW | EXPERIMENTAL NS | F6 | Solo GET autenticado y alcance individual.
const express = require('express');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');
const repository = require('./experimental-ns-live.repository');
const coalescer = require('./experimental-ns-live-coalescer');
const router = express.Router();
const PERMISSIONS = Object.freeze({
  'resumen-dia':'EXPERIMENTAL_NS_RESUMEN_DIA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  'equipos-criticos':'EXPERIMENTAL_NS_EQUIPOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  'proyectos-mantenimiento':'EXPERIMENTAL_NS_PROYECTOS_MANTENIMIENTO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
});
function requireProgramador(req,res,next) {
  if (!req.actorUser || req.actorUser.is_programador !== true) {
    return res.status(403).json({ok:false,code:'EXPERIMENTAL_NS_PROGRAMMER_REQUIRED',message:'Acceso reservado a Programador.'});
  }
  return next();
}
for (const [moduleName,code] of Object.entries(PERMISSIONS)) {
  const [session,access] = humanInformationGuard_gnral({domain:'UNITED',groupingCode:'EXPERIMENTAL_NS',permissionCode:code});
  router.get('/live/'+moduleName+'/revision',session,requireProgramador,access,async(req,res,next)=>{
    try {
      const version = await coalescer.revision(req, repository);
      res.set('Cache-Control','no-store, private');
      return res.json({ok:true,source:'experimental-ns',version});
    } catch (error) { return next(error); }
  });
}
module.exports = router;
