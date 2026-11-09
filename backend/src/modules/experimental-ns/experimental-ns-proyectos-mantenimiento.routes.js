'use strict';

const express=require('express');
const {humanInformationGuard_gnral}=require('../../middleware/information-access-gnral.middleware');
const controller=require('./experimental-ns-proyectos-mantenimiento.controller');
const {REQUIRED_PERMISSION}=require('./experimental-ns-proyectos-mantenimiento.service');

const router=express.Router();
// Sin restriccion por rol: humanInformationGuard_gnral valida sesion, permiso, puerta y alcance.
const [session,permissionAndScope]=humanInformationGuard_gnral({
  domain:'UNITED',groupingCode:'EXPERIMENTAL_NS',permissionCode:REQUIRED_PERMISSION
});
router.get('/proyectos-mantenimiento/inicial',session,permissionAndScope,controller.initial);
router.get('/proyectos-mantenimiento/detalle',session,permissionAndScope,controller.detail);
module.exports=router;
