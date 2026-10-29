'use strict';
// [Aster | 2026-10-29 | ASTER-MG | AST-12 CLAMAV INSTREAM V001]
const net=require('node:net');
function scanEnabled(){return ['true','1','yes','on'].includes(String(process.env.STORAGE_AV_ENABLED||'false').toLowerCase())}
async function scanBuffer_aster(buffer) {
 if(!scanEnabled()){
  if(process.env.NODE_ENV==='production'){
   const error=new Error('Antivirus no configurado.');error.code='STORAGE_AV_UNAVAILABLE';error.status=503;throw error;
  }
  return {clean:true,mode:'local-unscanned'};
 }
 const host=String(process.env.STORAGE_AV_HOST||'').trim();
 const port=Number(process.env.STORAGE_AV_PORT||3310);
 if(!host || !Number.isInteger(port) || port<1 || port>65535){
  const error=new Error('ClamAV no configurado.');error.status=503;error.code='STORAGE_AV_UNAVAILABLE';throw error;
 }
 if(!Buffer.isBuffer(buffer))throw new TypeError('Expected buffer for antivirus scan.');
 const timeout=Math.max(1000,Math.min(30000,Number(process.env.STORAGE_AV_TIMEOUT_MS||8000)||8000));
 return new Promise((resolve,reject)=>{
  const socket=net.connect({host,port});
  let result='',settled=false;
  const done=(error,output)=>{
   if(settled)return;settled=true;socket.destroy();
   if(error)return reject(error);
   if(output.endsWith(' OK'))return resolve({clean:true,mode:'clamav'});
   const err=new Error(output.includes(' FOUND')?'El archivo contiene una amenaza.':'Respuesta antivirus no valida.');
   err.status=output.includes(' FOUND')?415:503;
   err.code=output.includes(' FOUND')?'STORAGE_MALWARE_FOUND':'STORAGE_AV_UNAVAILABLE';
   return reject(err);
  };
  socket.setTimeout(timeout,()=>done(Object.assign(new Error('Antivirus timeout'),{status:503,code:'STORAGE_AV_UNAVAILABLE'})));
  socket.on('error',err=>done(Object.assign(err,{status:503,code:'STORAGE_AV_UNAVAILABLE'})));
  socket.on('data',chunk=>{result+=chunk.toString('utf8');if(result.length>2048)return done(Object.assign(new Error('Antivirus response too long'),{status:503}));});
  socket.on('end',()=>done(null,result.trim()));
  socket.on('connect',()=>{
   socket.write(Buffer.from('zINSTREAM\0'));
   for(let offset=0;offset<buffer.length;offset+=32768){
    const chunk=buffer.subarray(offset,Math.min(offset+32768,buffer.length));
    const size=Buffer.alloc(4);size.writeUInt32BE(chunk.length);
    socket.write(size);socket.write(chunk);
   }
   socket.write(Buffer.alloc(4));socket.end();
  });
 });
}
module.exports={scanBuffer_aster};
