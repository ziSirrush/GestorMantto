'use strict';
/* BLT NOW · Experimental NS · F8
 * Banco de carga SINTETICO. Solo 127.0.0.1 y repositorio simulado; nunca Azure/NetSuite/Aiven.
 * 1 / 10 / 50 clientes HTTP concurrentes, 4 oleadas por caso.
 */
const http=require('node:http');
const crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const path=require('node:path');
const coalescer=require(path.join(__dirname,'../../backend/src/modules/experimental-ns/experimental-ns-live-coalescer'));
const SIZES=[1,10,50];
const WAVES=4;
const PERMISSION='EXPERIMENTAL_NS_RESUMEN_DIA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const fingerprint=scope=>crypto.createHash('sha256').update('NS-MOCK-'+scope).digest('hex');
const percentile=(xs,p)=>{if(!xs.length)return null;const v=xs.slice().sort((a,b)=>a-b);return Math.round(v[Math.ceil(v.length*p)-1]*100)/100;};

async function executeScenario(server,users){
  let reads=0,requests=0,failures=0;
  const repository={
    queries(req){return {portafolio:'FROM ns_portafolio_pruebas WHERE zona_id=?',tickets:'FROM ns_tickets_pruebas WHERE zona_id=?',
      pParams:[req.scopeZone],tParams:[req.scopeZone]};},
    async revision(req){reads+=2;await sleep(16);return fingerprint(req.scopeZone);}
  };
  const handler=async(req,res)=>{
    requests++;
    if(req.method!=='GET'||req.url!=='/api/experimental-ns/live/resumen-dia/revision'){
      res.writeHead(404);return res.end('No existe');
    }
    const user=Number(req.headers['x-demo-user']);
    if(!Number.isInteger(user)||user<1||user>users){res.writeHead(403);return res.end('No autorizado en simulacion');}
    const scopeZone=user%2+1;
    const authorized={scopeZone,informationAccess:{dominio:'UNITED',acceso_puerta:true,
      agrupacion:{codigo:'EXPERIMENTAL_NS'},permission_code:PERMISSION}};
    try{
      const version=await coalescer.revision(authorized,repository);
      res.setHeader('Content-Type','application/json');
      res.setHeader('Cache-Control','no-store, private');
      res.end(JSON.stringify({ok:true,source:'experimental-ns',version}));
    }catch(_error){failures++;res.writeHead(503);res.end('{"ok":false}');}
  };
  server.removeAllListeners('request');server.on('request',handler);
  const address=server.address();
  const url=`http://127.0.0.1:${address.port}/api/experimental-ns/live/resumen-dia/revision`;
  const latencies=[];let totalCalls=0;
  const started=performance.now();
  for(let wave=0;wave<WAVES;wave++){
    // Cada oleada representa una verificacion tras un cambio; no reutiliza
    // TTL de oleadas anteriores, pero agrupa los GET simultaneos dentro de cada una.
    coalescer.resetForTests();
    await Promise.all(Array.from({length:users},async(_,i)=>{
      const t=performance.now();
      const response=await fetch(url,{headers:{'X-Demo-User':String(i+1)}});
      const payload=await response.json();
      if(!response.ok||payload.ok!==true||payload.version!==fingerprint((i+1)%2+1))
        throw Error(`Respuesta simulada invalida: usuario ${i+1}`);
      latencies.push(performance.now()-t);totalCalls++;
    }));
  }
  return {
    usuarios:users,oleadas:WAVES,solicitudesHTTP:requests,errores:failures,
    consultasMySQLSimuladas:reads,
    consultasSinCoalescencia:users*WAVES*2,
    reduccionConsultasPct:Number((100*(1-reads/(users*WAVES*2))).toFixed(1)),
    p50_HTTP_ms:percentile(latencies,.5),p95_HTTP_ms:percentile(latencies,.95),
    duracion_ms:Number((performance.now()-started).toFixed(2)),
    notas:'Loopback HTTP + repositorio simulado, sin BD; no predice Azure.'
  };
}
async function main(){
  const server=http.createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const results=[];
    for(const size of SIZES)results.push(await executeScenario(server,size));
    console.log(JSON.stringify({tipo:'EXPERIMENTAL_NS_F8_SIMULACION_LOCAL',fecha:new Date().toISOString(),resultados:results},null,2));
  }finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
}
if(require.main===module)main().catch(error=>{console.error('[F8_CARGA_SIMULADA]',error);process.exitCode=1;});
module.exports={executeScenario};
