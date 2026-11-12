'use strict';
// INT9 Montadores 04-M: QA paginado, sin cron y sin escrituras sobre personal.
const db=require('../config/db');
const service=require('../modules/instalaciones-programacion-personal/instalaciones-programacion-personal.montadores.service');
const PAGE=50,BATCH=5;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let running=false;
async function scanEquipos({onProgress=null,shouldStop=null}={}){
 if(running)throw Object.assign(new Error('Conciliación 04-M ocupada'),{code:'INT9_MONTAJE_EN_PROCESO'});
 running=true;
 const stats={fase:'EQUIPOS_04_M',total_equipos:0,creadas:0,historicas:0,
  revisiones:0,errores:0,detalles:[],lotes_completados:0,ultimo_id_ins_fl:0};
 try{
  for(const phase of ['04-M','RELACIONES_ANTERIORES']){
   let last=0;stats.fase=phase;
   while(true){
    if(shouldStop?.())return {...stats,interrumpida:true};
    const sql=phase==='04-M'
      ?"SELECT id_ins_fl FROM ins_fl WHERE id_ins_fl>? AND activo=1 AND TRIM(estatus)='04-M' ORDER BY id_ins_fl LIMIT ?"
      :"SELECT id_ins_fl FROM instalaciones_programacion_contratistas_fl WHERE id_ins_fl>? AND activo=1 ORDER BY id_ins_fl LIMIT ?";
    const [rows]=await db.query(sql,[last,PAGE]);
    if(!rows.length)break;
    const cursor=Number(rows[rows.length-1].id_ins_fl);
    if(!Number.isSafeInteger(cursor)||cursor<=last)throw Error('INT9_MONTAJE_CURSOR_INVALIDO');
    for(let i=0;i<rows.length;i+=BATCH){
     if(shouldStop?.())return {...stats,interrumpida:true};
     for(const row of rows.slice(i,i+BATCH)){
      const id=Number(row.id_ins_fl);
      try{
       const r=await service.reconcile(id,{tecnico:true,actorId:null});
       stats.total_equipos++;stats.creadas+=r.creadas||0;stats.historicas+=r.historicas||0;
       if(r.estado==='REQUIERE_REVISION'){
        stats.revisiones++;
        if(stats.detalles.length<12)stats.detalles.push({id_ins_fl:id,codigo:r.motivo||'REVISION'});
       }
      }catch(error){
       stats.total_equipos++;stats.errores++;
       if(stats.detalles.length<12)stats.detalles.push({id_ins_fl:id,codigo:String(error?.code||'ERROR')});
      }
      stats.ultimo_id_ins_fl=id;
     }
     stats.lotes_completados++;
     onProgress?.({...stats,detalles:stats.detalles.slice()});
     await delay(250);
    }
    last=cursor;
    if(rows.length<PAGE)break;
   }
  }
  stats.fase='FINALIZADA';onProgress?.({...stats,detalles:stats.detalles.slice()});
  return {...stats,interrumpida:false};
 }finally{running=false;}
}
module.exports={scanEquipos};
