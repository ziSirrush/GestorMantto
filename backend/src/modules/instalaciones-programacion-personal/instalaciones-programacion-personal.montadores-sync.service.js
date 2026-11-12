'use strict';
const montage=require('./instalaciones-programacion-personal.montadores.service');
const MAX=80;
function verified(req){const id=String(process.env.INTEGRATION_INS_FL_ID||'').trim();return Boolean(id&&req.integrationAuth?.integrationId===id);}
async function ejecutarSyncConMontadores(req,res,nextSync){
 if(!verified(req))return nextSync(req,res);
 let body=null,status=200;
 const facade={status(value){status=value;return this;},json(value){body=value;return this;}};
 await nextSync(req,facade);
 if(body===null)throw Error('INT9_MONTAJE_RESPUESTA_FALTANTE');
 if(status>=400||body.ok!==true)return res.status(status).json(body);
 const ids=[...new Set((req.int9MontajeCommittedChanges||[]).filter(id=>Number.isSafeInteger(id)&&id>0))].sort((a,b)=>a-b);
 const chosen=ids.slice(0,MAX);
 const report={procesados:0,creadas:0,historicas:0,revisiones:0,errores:0,omitidos_por_limite:ids.length-chosen.length};
 for(const id of chosen){
  try{
   const item=await montage.reconcile(id,{tecnico:true,actorId:null});
   report.procesados++;report.creadas+=item.creadas||0;report.historicas+=item.historicas||0;
   if(item.estado==='REQUIERE_REVISION')report.revisiones++;
  }catch(error){report.errores++;console.error('[INT9_MONTAJE_SYNC]',JSON.stringify({id,code:String(error?.code||'ERROR')}));}
 }
 report.estado=report.errores||report.revisiones||report.omitidos_por_limite?'REQUIERE_ATENCION':report.procesados?'PROCESADO':'SIN_CAMBIOS';
 return res.status(status).json({...body,programacion_montadores:report});
}
module.exports={ejecutarSyncConMontadores,_test:{verified}};
