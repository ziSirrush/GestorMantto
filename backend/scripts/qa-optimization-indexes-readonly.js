'use strict';
// Diagnostico solo lectura. JAMAS ejecuta DML ni DDL.
// Ejecutar manualmente solo con consentimiento y conexion de lectura autorizada.
const CHECKS=Object.freeze([
  {name:'tickets-fecha',table:'tickets',sql:'SELECT id,fecha_reporte FROM tickets WHERE fecha_reporte >= ? AND fecha_reporte < ? ORDER BY id DESC LIMIT 50',params:['2026-11-01','2026-12-01']},
  {name:'tickets-equipo',table:'tickets',sql:'SELECT id,codigo_equipo FROM tickets WHERE codigo_equipo = ? AND fecha_reporte >= ? LIMIT 50',params:['QA-EQUIPO-ONLY','2026-01-01']},
  {name:'preventivos-mes',table:'servicios_preventivos',sql:'SELECT numero_equipo,servicio_realizado FROM servicios_preventivos WHERE mes_servicio >= ? AND mes_servicio < ? AND tipo_servicio = ? LIMIT 50',params:['2026-11-01','2026-12-01','PREVENTIVO']},
  {name:'almacen-lote',table:'almacen_ns_inventario',sql:'SELECT id_inventario,id_articulo_ns FROM almacen_ns_inventario WHERE id_lote = ? AND id_subsidiaria_ns IN (?) LIMIT 50',params:['QA-LOTE', ['2','5']]},
  {name:'cobranza-ppns',table:'cobranza_facturas_cor',sql:'SELECT id_factura_cor,ppns FROM cobranza_facturas_cor WHERE activo = 1 AND UPPER(TRIM(COALESCE(ppns,\'\'))) = ? LIMIT 50',params:['QA-PPNS']},
  {name:'instalaciones-proyecto',table:'ins_fl',sql:'SELECT id_ins_fl,id_proyecto FROM ins_fl WHERE activo = 1 AND id_proyecto = ? LIMIT 50',params:['QA-PPNS']},
  {name:'ns-tickets-fecha',table:'ns_tickets_pruebas',sql:'SELECT id,ticket FROM ns_tickets_pruebas WHERE fecha_reporte >= ? AND fecha_reporte < ? LIMIT 50',params:['2026-11-01','2026-12-01']}
]);
async function inspectIndexes(database){
 const results=[];
 for(const item of CHECKS){
   const [indexes]=await database.query('SHOW INDEX FROM `'+item.table+'`');
   const [plan]=await database.query('EXPLAIN FORMAT=JSON '+item.sql,item.params);
   results.push({name:item.name,table:item.table,
     indexes:(indexes||[]).map(row=>({name:row.Key_name,column:row.Column_name,unique:Number(row.Non_unique)===0})),
     plan:plan?.[0]?.EXPLAIN??null});
 }
 return results;
}
async function main(){
 if(process.argv.includes('--allow-live-readonly')!==true || process.env.BLT_QA_OPT_READONLY!=='1'){
   throw new Error('Diagnostico NO iniciado: requiere --allow-live-readonly y BLT_QA_OPT_READONLY=1.');
 }
 const db=require('../src/config/db');
 try{
   const report=await inspectIndexes(db);
   process.stdout.write(JSON.stringify({ok:true,kind:'read-only',count:report.length,checks:report},null,2)+'\n');
 }finally{if(typeof db.end==='function')await db.end();}
}
if(require.main===module)main().catch(err=>{
 console.error('[QA_OPT_READONLY]',err.code||err.message||'UNKNOWN');process.exitCode=1;
});
module.exports={CHECKS,inspectIndexes};
