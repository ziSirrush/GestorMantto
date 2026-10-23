'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_VA_ADMIN_FASE_6_V001]
// La alta y su auditoria se confirman en LA MISMA transaccion, o ninguna.
const interactions=require('../../services/interactions/interactions.service');
const {failPc_uni}=require('./cobranza-uni-administracion.pc-edit-validation');
async function auditPcCreate_uni(req,{id,actor,manual,derived,idProyecto},conn){
  if(!conn||typeof conn.query!=='function')throw new Error('Conexion de auditoria no valida.');
  const detail={source:'cobranza-uni-administracion',table:'pc',operation:'alta',
    id_pc:String(id),id_proyecto_cobranza:String(idProyecto),actor:String(actor),manual,derived};
  if(Buffer.byteLength(JSON.stringify(detail),'utf8')>60000)
    throw failPc_uni(413,'VA_ADMIN_ALTA_AUDITORIA_EXCESIVA','Registro de auditoria excesivo.');
  const result=await interactions.recordFromRequest_gnral(req,{
    tipo_interaccion:'AUDITAR_CAMBIO',modulo:'cobranza-uni-administracion',entidad:'pc',
    id_referencia:String(id),titulo:'Alta administrativa de Venta Adicional',
    descripcion:'Creacion de registro en pc',ruta_destino:'cobranza-uni-administracion',
    payload_json:{table:'pc',id_pc:String(id),operation:'alta'},
    detalle_json:detail,metodo_http:'POST',
    endpoint:String(req.originalUrl||req.url||'').split('?')[0].slice(0,500)
  },{executor:conn});
  if(!result||!/^[1-9]\d*$/.test(String(result.id_interaccion||'')))
    throw failPc_uni(500,'VA_ADMIN_ALTA_AUDITORIA_FALLIDA',
      'No se confirmo la auditoria; operacion cancelada.');
  return String(result.id_interaccion);
}
module.exports=Object.freeze({auditPcCreate_uni});
