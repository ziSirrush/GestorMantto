const express=require('express');
const controller=require('./catalogo-general.controller');
const {requireAuth}=require('../../middleware/auth.middleware');
const router=express.Router();
router.get('/',requireAuth,controller.list);
module.exports=router;
