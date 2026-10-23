'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_3_V001]
// Auditoria obligatoria en usuario_interacciones usando la MISMA conexion.
const interactions=require('../../services/interactions/interactions.service');
const {failMp_uni}=require('./cobranza-uni-administracion.mp-edit-validation');

async function auditMpCell_uni(req,change,conn){
  if(!conn||typeof conn.query!=='function')throw new Error('Conexion transaccional para auditoria ausente.');
  const detail={
    source:'cobranza-uni-administracion',table:'detalle_mp_2026',
    operation:change.operation||'single',id_dmp:String(change.id),
    field:change.field,before:change.before,after:change.after,
    actor:String(change.actor),
    derived_changes:Array.isArray(change.derived_changes)?change.derived_changes
      .map(item=>({field:item.field,before:item.before,after:item.after})):[]
  };
  const json=JSON.stringify(detail);
  if(!json||Buffer.byteLength(json,'utf8')>60000)
    throw failMp_uni(413,'MP_ADMIN_AUDITORIA_EXCESIVA','El cambio supera el limite de auditoria.');
  const response=await interactions.recordFromRequest_gnral(req,{
    tipo_interaccion:'AUDITAR_CAMBIO',modulo:'cobranza-uni-administracion',
    entidad:'detalle_mp_2026',id_referencia:String(change.id),
    titulo:'Edicion administrativa de Mantenimiento Preventivo',
    descripcion:'Cambio de '+change.field+' en detalle_mp_2026',
    ruta_destino:'cobranza-uni-administracion',
    payload_json:{table:'detalle_mp_2026',id_dmp:String(change.id),field:change.field},
    detalle_json:detail,metodo_http:'PATCH',
    endpoint:String(req?.originalUrl||req?.url||'').split('?')[0].slice(0,500)
  },{executor:conn});
  const id=String(response?.id_interaccion??'');
  if(!/^[1-9]\d*$/.test(id))
    throw failMp_uni(500,'MP_ADMIN_AUDITORIA_FALLIDA','La auditoria no se confirmo; transaccion cancelada.');
  return id;
}
module.exports=Object.freeze({auditMpCell_uni});
