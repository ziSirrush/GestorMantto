'use strict';

const express=require('express');
const {humanInformationGuard_gnral}=require('../../middleware/information-access-gnral.middleware');
const controller=require('./experimental-ns-proyectos-mantenimiento.controller');
const {REQUIRED_PERMISSION}=require('./experimental-ns-proyectos-mantenimiento.service');

const router=express.Router();
function requireProgramador(req,res,next){
  if(!req.actorUser||req.actorUser.is_programador!==true){
    return res.status(403).json({ok:false,code:'EXPERIMENTAL_NS_PROGRAMMER_REQUIRED',
      message:'Experimental NS esta reservado a Programador.'});
  }
  return next();
}
const [session,permissionAndScope]=humanInformationGuard_gnral({
  domain:'UNITED',groupingCode:'EXPERIMENTAL_NS',permissionCode:REQUIRED_PERMISSION
});
router.get('/proyectos-mantenimiento/inicial',session,requireProgramador,permissionAndScope,controller.initial);
router.get('/proyectos-mantenimiento/detalle',session,requireProgramador,permissionAndScope,controller.detail);
module.exports=router;
