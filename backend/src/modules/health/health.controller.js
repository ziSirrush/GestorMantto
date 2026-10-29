// [Aster | 2026-10-29 | ASTER-MG | AST-10 HEALTH DEDUPLICATION V001]
const db=require('../../config/db');
let pending=null;
let lastOk=null;
let validUntil=0;
async function healthCheck_aster(){
 const now=Date.now();
 if(lastOk && now<validUntil)return lastOk;
 if(pending)return pending;
 pending=db.testConnection().then(database=>{
   lastOk={database:'connected',server_time:database.server_time};
   validUntil=Date.now()+2000;
   return lastOk;
 }).catch(error=>{lastOk=null;validUntil=0;throw error})
   .finally(()=>{pending=null});
 return pending;
}
async function getHealth(req,res){
 try{
  const state=await healthCheck_aster();
  return res.status(200).json({ok:true,message:'BLT NOW API activa',
   environment:process.env.NODE_ENV||'development',...state});
 }catch(error){
  return res.status(503).json({ok:false,message:'BLT NOW API activa, pero MySQL no esta disponible',
   database:'disconnected',error:process.env.NODE_ENV==='production'?undefined:error.message});
 }
}
module.exports={getHealth,healthCheck_aster};
