const service=require('./catalogo-general.service');
async function list(req,res,next){try{return res.json(await service.list(req.query||{}));}catch(e){return next(e);}}
module.exports={list};
