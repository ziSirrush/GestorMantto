'use strict';
// [Aster | 2026-09-01 | ASTER-MG | FIX REESTRUCTURACION LOGISTICA PRODUCCION V001]
// [Aster | 2026-09-01 | ASTER-MG | ENDPOINT SYNC M2M LOGISTICA PRODUCCION V001]
const service=require('./logistica-produccion.service');
const syncService=require('./logistica-produccion-sync.service');
const wrap=fn=>async(req,res,next)=>{try{const result=await fn(req);res.status(result.status||200).json(result.body||result);}catch(e){if(e.status||e.statusCode)return res.status(e.status||e.statusCode).json({ok:false,code:e.code,message:e.message,detalles:e.detalles||undefined});next(e);}};
module.exports={
 sync:wrap(req=>syncService.sync(req.body||{})),
 list:wrap(req=>service.list(req.query)),options:wrap(req=>service.options(req.query)),detail:wrap(req=>service.detail(req.params.id)),
 manualCatalogs:wrap(()=>service.manualCatalogs()),manualProjects:wrap(req=>service.manualProjects(req.query)),
 manualAdvisors:wrap(req=>service.manualAdvisors(req.query)),manualSupervisors:wrap(req=>service.manualSupervisors(req.query)),manualPpns:wrap(req=>service.manualPpns(req.query)),
 create:wrap(async req=>({status:201,body:await service.create(req.body||{},req.user)})),update:wrap(req=>service.update(req.params.id,req.body||{},req.user)),
 files:wrap(req=>service.listFiles(req.params.id).then(data=>({ok:true,data}))),upload:wrap(req=>service.upload(req.params.id,req.body||{},req.file,req.user)),replaceFile:wrap(req=>service.replaceFile(req.params.id,req.params.idArchivo,req.file,req.user)),
 removeFile:wrap(req=>service.removeFile(req.params.id,req.params.idArchivo,req.user)),documents:wrap(req=>service.documents(req.query,false)),missingDocuments:wrap(req=>service.documents(req.query,true)),
 pvoComplete:wrap(req=>service.pvo(req.query,false)),pvoMissing:wrap(req=>service.pvo(req.query,true))
};
