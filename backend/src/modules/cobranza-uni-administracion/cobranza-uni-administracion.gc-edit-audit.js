'use strict';

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_5_V001]
// Auditoria obligatoria EN LA MISMA transaccion de la actualizacion.
// Reusa usuario_interacciones; la Fase 6 agregara QA de trazabilidad integral.
const interactions = require('../../services/interactions/interactions.service');
const {fail_uni} = require('./cobranza-uni-administracion.gc-edit-validation');
const MAX_BYTES = 65535;

async function recordGcCell_uni(req, change, conn) {
  if (!conn || typeof conn.query !== 'function') throw new Error('Conexión de auditoría no disponible.');
  const detail = {
    source: 'cobranza-uni-administracion',
    table: 'gestion_credito',
    operation: change.operation || 'single',
    id_gc: String(change.id),
    field: change.field,
    before: change.before,
    after: change.after,
    // Una sola interaccion detalla tambien los calculos producidos por este
    // cambio manual. Si falla, el UPDATE completo se revierte.
    derived_changes: Array.isArray(change.derived_changes)
      ? change.derived_changes.map(item=>({field:item.field,before:item.before,after:item.after})) : []
  };
  const json=JSON.stringify(detail);
  if (!json || Buffer.byteLength(json,'utf8')>MAX_BYTES) {
    throw fail_uni(413,'GC_ADMIN_AUDITORIA_EXCESIVA','El cambio excede el límite de auditoría.');
  }
  const result=await interactions.recordFromRequest_gnral(req,{
    tipo_interaccion:'AUDITAR_CAMBIO',
    modulo:'cobranza-uni-administracion',
    entidad:'gestion_credito',
    id_referencia:String(change.id),
    titulo:'Edición administrativa de Gestión de Crédito',
    descripcion:`Cambio de ${change.field} en gestion_credito`,
    ruta_destino:'cobranza-uni-administracion',
    payload_json:{table:'gestion_credito',id_gc:String(change.id),field:change.field},
    detalle_json:detail,
    metodo_http:'PATCH',
    endpoint:String(req.originalUrl||req.url||'').split('?')[0].slice(0,500)
  },{executor:conn});
  if(!result || !/^\d+$/.test(String(result.id_interaccion||'')) ||
    BigInt(String(result.id_interaccion))<=0n){
    throw fail_uni(500,'GC_ADMIN_AUDITORIA_FALLIDA','No se confirmó la auditoría. Cambios cancelados.');
  }
  return String(result.id_interaccion);
}

module.exports=Object.freeze({recordGcCell_uni});
