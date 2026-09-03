'use strict';
// [Aster | 2026-09-01 | ASTER-MG | FIX REESTRUCTURACION LOGISTICA PRODUCCION V001]
// [Aster | 2026-09-01 | ASTER-MG | ENDPOINT SYNC M2M LOGISTICA PRODUCCION V001]
// [Aster | 2026-09-03 | ASTER-MG | FASE 2 PVO-PRODUCCION FUENTES LOG_OPS INS_FL V001]
const express=require('express');
const controller=require('./logistica-produccion.controller');
const {requireAuth}=require('../../middleware/auth.middleware');
const {requireIntegrationAuthFor}=require('../../middleware/integration-auth.middleware');
const {createUploadMiddleware_gnral}=require('../../middleware/storage-upload.middleware');
const upload=createUploadMiddleware_gnral({fieldName:'archivo',required:true,maxFiles:1,maxFileMb:25,policyName:'GENERAL'});
const requireLogisticaIntegration=requireIntegrationAuthFor('INTEGRATION_VENTAS_ID');
const router=express.Router();

// M2M debe declararse ANTES de router.use(requireAuth):
// usa la misma identidad/secret de Logistica ya configurada en Azure.
router.post('/sync',requireLogisticaIntegration,controller.sync);

router.use(requireAuth);
router.get('/opciones-ppns',controller.options);
router.get('/manual/catalogos',controller.manualCatalogs);
router.get('/manual/proyectos',controller.manualProjects);
// Alias temporal para clientes anteriores. Ya no consulta Cotizaciones: devuelve log_ops.
router.get('/manual/proyectos-vendidos',controller.manualProjects);
router.get('/manual/asesores',controller.manualAdvisors);
router.get('/manual/supervisores',controller.manualSupervisors);
router.get('/manual/ppns',controller.manualPpns);
router.get('/documentos/faltantes',controller.missingDocuments);
router.get('/documentos',controller.documents);
router.get('/pvo/completos',controller.pvoComplete);
router.get('/pvo/faltantes',controller.pvoMissing);
router.get('/',controller.list);
router.post('/',controller.create);
router.get('/:id',controller.detail);
router.patch('/:id',controller.update);
router.get('/:id/archivos',controller.files);
router.post('/:id/archivos',upload,controller.upload);
router.patch('/:id/archivos/:idArchivo',upload,controller.replaceFile);
router.delete('/:id/archivos/:idArchivo',controller.removeFile);
module.exports=router;
