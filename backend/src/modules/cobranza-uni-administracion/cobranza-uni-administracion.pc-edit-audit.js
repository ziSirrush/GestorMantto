'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_VA_ADMIN_FASE_3_V001]
// One audited interaction per modified row, within the same SQL transaction.
const interactions=require('../../services/interactions/interactions.service');
const {failPc_uni}=require('./cobranza-uni-administracion.pc-edit-validation');

async function auditPcCell_uni(req,change,conn){
  if(!conn||typeof conn.query!=='function')throw new Error('Transaccion de auditoria no disponible.');
  const detail={
    source:'cobranza-uni-administracion',table:'pc',operation:change.operation||'single',
    id_pc:String(change.id),field:change.field,before:change.before,after:change.after,
    actor:String(change.actor),
    ...(Array.isArray(change.derived_changes)?{
      derived_changes:change.derived_changes.map(item=>({field:item.field,
        before:item.before,after:item.after}))}: {})
  };
  if(Buffer.byteLength(JSON.stringify(detail),'utf8')>60000)
    throw failPc_uni(413,'VA_ADMIN_AUDITORIA_EXCESIVA','Auditoria excede limite seguro.');
  const result=await interactions.recordFromRequest_gnral(req,{
    tipo_interaccion:'AUDITAR_CAMBIO',modulo:'cobranza-uni-administracion',entidad:'pc',
    id_referencia:String(change.id),titulo:'Edicion administrativa de Venta Adicional',
    descripcion:'Cambio de '+change.field+' en pc',ruta_destino:'cobranza-uni-administracion',
    payload_json:{table:'pc',id_pc:String(change.id),field:change.field},
    detalle_json:detail,metodo_http:'PATCH',
    endpoint:String(req.originalUrl||req.url||'').split('?')[0].slice(0,500)
  },{executor:conn});
  if(!result||!/^[1-9]\d*$/.test(String(result.id_interaccion||'')))
    throw failPc_uni(500,'VA_ADMIN_AUDITORIA_FALLIDA','No se confirmo la auditoria. Cambios cancelados.');
  return String(result.id_interaccion);
}
module.exports=Object.freeze({auditPcCell_uni});
