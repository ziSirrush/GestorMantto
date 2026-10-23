'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_VA_ADMIN_FASE_6_V001]
// Alta distinta a edicion: permite los 15 campos manuales, NUNCA 14 derivados/FK.
const {
  PC_EDITABLE_FIELDS_UNI, PC_COLUMNS_UNI, PC_DERIVED_FIELDS_UNI
} = require('./cobranza-uni-administracion.constants');
const {
  failPc_uni, idPc_uni
} = require('./cobranza-uni-administracion.pc-edit-validation');
const {
  moneyToCents_uni,centsToMoney_uni,dateIso_uni,normalizeStatus_uni
} = require('./cobranza-uni-administracion.pc-formulas');

const MAX_CREATE_FIELDS_UNI=PC_EDITABLE_FIELDS_UNI.length;
const META_UNI=new Map(PC_COLUMNS_UNI.map(meta=>[meta.name,meta]));
const ALLOWED_UNI=new Set(PC_EDITABLE_FIELDS_UNI);
const REQUIRED_UNI=Object.freeze(['proyecto','cliente','precio_venta','tipo_pago','estatus_administrativo']);
const MAX_COMMENT_LENGTH_UNI=4000;
const INVALID_CONTROL_UNI=/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

function isPlain_uni(value){
  return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
    (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
}
function createField_uni(field,value){
  const meta=META_UNI.get(field);
  if(!ALLOWED_UNI.has(field)||!meta){
    throw failPc_uni(400,'VA_ADMIN_ALTA_CAMPO_PROTEGIDO',
      'El alta solo admite campos manuales autorizados.',{field});
  }
  if(value===null)return null;
  if(typeof value!=='string'||INVALID_CONTROL_UNI.test(value)){
    throw failPc_uni(400,'VA_ADMIN_ALTA_VALOR_INVALIDO',
      'Valor invalido para el campo manual.',{field});
  }
  const text=value.trim();
  if(!text)return null;
  if(meta.sqlType==='date'){
    if(!dateIso_uni(text))throw failPc_uni(400,'VA_ADMIN_ALTA_FECHA_INVALIDA',
      'Fecha invalida; usa AAAA-MM-DD desde 1900.',{field});
    return text;
  }
  if(meta.sqlType==='decimal(18,2)'){
    const cents=moneyToCents_uni(text);
    if(cents===null)throw failPc_uni(400,'VA_ADMIN_ALTA_IMPORTE_INVALIDO',
      'Importe fuera de precision DECIMAL(18,2).',{field});
    return centsToMoney_uni(cents);
  }
  const max=meta.sqlType==='text'?MAX_COMMENT_LENGTH_UNI:
    Number((/varchar\((\d+)\)/.exec(meta.sqlType)||[])[1]);
  if(!Number.isSafeInteger(max)||Array.from(text).length>max){
    throw failPc_uni(413,'VA_ADMIN_ALTA_TEXTO_EXCESIVO',
      'El valor excede la longitud permitida.',{field});
  }
  return text;
}
function normalizeCreatePc_uni(body,{requireId=false}={}){
  if(!isPlain_uni(body)||Object.keys(body).some(k=>!['id_pc','fields'].includes(k))||
     !isPlain_uni(body.fields)||Object.keys(body.fields).length>MAX_CREATE_FIELDS_UNI){
    throw failPc_uni(400,'VA_ADMIN_ALTA_PAYLOAD_INVALIDO','Solicitud de alta invalida.');
  }
  const fields=Object.create(null);
  for(const field of PC_EDITABLE_FIELDS_UNI)fields[field]=null;
  for(const [field,value] of Object.entries(body.fields)){
    fields[field]=createField_uni(field,value);
  }
  for(const field of REQUIRED_UNI){
    if(fields[field]===null){
      throw failPc_uni(422,'VA_ADMIN_ALTA_CAMPO_REQUERIDO',
        'Falta un campo obligatorio para el alta.',{field});
    }
  }
  const opened=String(fields.estatus_administrativo||'').trim().toLowerCase()==='abierta';
  if(opened&&!fields.fecha_factura){
    throw failPc_uni(422,'VA_ADMIN_ALTA_FACTURA_REQUERIDA',
      'Una factura abierta necesita fecha de factura para calcular el vencimiento.');
  }
  const supplied=body.id_pc;
  const idEmpty=supplied===null||supplied===undefined||supplied==='';
  if(requireId&&idEmpty)throw failPc_uni(422,'VA_ADMIN_ALTA_ID_REQUERIDO',
    'El consecutivo debe ser confirmado antes de crear el registro.');
  const id=idEmpty?null:idPc_uni(supplied);
  return Object.freeze({id_pc:id,fields:Object.freeze(fields)});
}
module.exports=Object.freeze({
  MAX_CREATE_FIELDS_UNI,REQUIRED_UNI,createField_uni,normalizeCreatePc_uni,
  CREATE_FIELDS_UNI:PC_EDITABLE_FIELDS_UNI,
  PROHIBITED_DERIVED_UNI:PC_DERIVED_FIELDS_UNI
});
