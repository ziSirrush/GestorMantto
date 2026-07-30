const repository=require('./catalogo-general.repository');
function clean(v,max){const s=String(v||'').trim();return s?s.slice(0,max):null;}
async function list(query){const c=await repository.getConnection();try{return{ok:true,source:'aiven',articulos:await repository.list(c,{area:clean(query.area,100),elemento:clean(query.elemento,150)})};}finally{c.release();}}
module.exports={list};
