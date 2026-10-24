'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_6_V001]
// Mandatory audit using the same MySQL transaction and effective human actor.
const interactions=require('../../services/interactions/interactions.service');
const {failMp_uni}=require('./cobranza-uni-administracion.mp-edit-validation');
async function auditZone1_uni(req,change,conn){
  if(!conn||typeof conn.query!=='function')throw new Error('Transaction connection required.');
  const detail={source:'cobranza-uni-administracion',table:'detalle_mp_2026_zona_1',
    operation:change.operation,id_dmp:String(change.id_dmp),
    id_mp_zona_1:String(change.id_mp_zona_1),actor:String(change.actor),
    ...(change.field?{field:change.field,before:change.before,after:change.after}:{}),
    ...(change.derived_changes?{derived_changes:change.derived_changes}:{}),
    ...(change.fields?{fields:change.fields}:{}),
    ...(change.previous_link!==undefined?{previous_link:change.previous_link}:{}),
    link:String(change.id_dmp)};
  if(Buffer.byteLength(JSON.stringify(detail),'utf8')>60000)
    throw failMp_uni(413,'MP_ZONA1_AUDITORIA_EXCESIVA','Auditoria excede limite.');
  const result=await interactions.recordFromRequest_gnral(req,{
    tipo_interaccion:'AUDITAR_CAMBIO',modulo:'cobranza-uni-administracion',
    entidad:'detalle_mp_2026_zona_1',id_referencia:String(change.id_mp_zona_1),
    titulo:'Administracion de facturacion MP Zona 1',
    descripcion:'Operacion '+change.operation+' de MP Zona 1',
    ruta_destino:'cobranza-uni-administracion',
    payload_json:{table:'detalle_mp_2026_zona_1',id_dmp:String(change.id_dmp),
      id_mp_zona_1:String(change.id_mp_zona_1),operation:change.operation},
    detalle_json:detail,metodo_http:change.operation==='edit'?'PATCH':'POST',
    endpoint:String(req?.originalUrl||req?.url||'').split('?')[0].slice(0,500)
  },{executor:conn});
  if(!/^[1-9]\d*$/.test(String(result?.id_interaccion??'')))
    throw failMp_uni(500,'MP_ZONA1_AUDITORIA_FALLIDA','Auditoria no confirmada, rollback obligatorio.');
  return String(result.id_interaccion);
}
module.exports=Object.freeze({auditZone1_uni});
