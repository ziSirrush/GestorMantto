'use strict';
const service=require('./logistica-produccion.service');
const wrap=fn=>async(req,res,next)=>{try{const result=await fn(req);res.status(result.status||200).json(result.body||result);}catch(e){if(e.status||e.statusCode)return res.status(e.status||e.statusCode).json({ok:false,code:e.code,message:e.message});next(e);}};
module.exports={
 list:wrap(req=>service.list(req.query)),options:wrap(req=>service.options(req.query)),detail:wrap(req=>service.detail(req.params.id)),
 create:wrap(async req=>({status:201,body:await service.create(req.body||{},req.user)})),update:wrap(req=>service.update(req.params.id,req.body||{},req.user)),
 files:wrap(req=>service.listFiles(req.params.id).then(data=>({ok:true,data}))),upload:wrap(req=>service.upload(req.params.id,req.body||{},req.file,req.user)),replaceFile:wrap(req=>service.replaceFile(req.params.id,req.params.idArchivo,req.file,req.user)),
 removeFile:wrap(req=>service.removeFile(req.params.id,req.params.idArchivo,req.user)),comments:wrap(req=>service.detail(req.params.id).then(x=>({ok:true,data:x.data.comentarios}))),
 addComment:wrap(req=>service.addComment(req.params.id,req.body||{},req.user)),editComment:wrap(req=>service.editComment(req.params.id,req.params.idComentario,req.body||{},req.user)),
 removeComment:wrap(req=>service.removeComment(req.params.id,req.params.idComentario,req.user)),documents:wrap(req=>service.documents(req.query,false)),missingDocuments:wrap(req=>service.documents(req.query,true)),
 pvoComplete:wrap(req=>service.pvo(req.query,false)),pvoMissing:wrap(req=>service.pvo(req.query,true))
};
