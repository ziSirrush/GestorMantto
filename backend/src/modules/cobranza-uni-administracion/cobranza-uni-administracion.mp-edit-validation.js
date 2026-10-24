'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_3_V001]
// F4: agrega factor_monto_anual a la whitelist preparada, con formula atomica.
// Unicamente opera tras corte GLOBAL aprobado; por defecto todo PATCH denegado.
const {MP_COLUMNS_UNI,MP_EDITABLE_FIELDS_UNI} = require('./cobranza-uni-administracion.constants');

const META_UNI = new Map(MP_COLUMNS_UNI.map(column=>[column.name,column]));
const CANDIDATES_UNI = new Set(MP_EDITABLE_FIELDS_UNI);
const PHASE3_SAFE_FIELDS_MP_UNI = Object.freeze([
  'zona_adm','periodicidad','momento_facturacion','forma_pago'
].filter(field=>CANDIDATES_UNI.has(field) && META_UNI.get(field)?.kind === 'editable'));
const PHASE4_SAFE_FIELDS_MP_UNI = Object.freeze(MP_EDITABLE_FIELDS_UNI.filter(
  field=>CANDIDATES_UNI.has(field) && META_UNI.get(field)?.kind==='editable'));
const SAFE_UNI = new Set(PHASE4_SAFE_FIELDS_MP_UNI);
const MAX_BULK_MP_UNI = 20;
const MAX_SIGNED_BIGINT_MP_UNI = 9223372036854775807n;

function failMp_uni(statusCode,code,message,details){
  const error=new Error(message);
  error.statusCode=statusCode;error.code=code;
  if(details!==undefined)error.details=details;
  return error;
}
function plain_uni(value){
  return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
    (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
}
function idMp_uni(value){
  if(typeof value!=='string'&&!(typeof value==='number'&&Number.isSafeInteger(value)))
    throw failMp_uni(400,'MP_ADMIN_ID_INVALIDO','El consecutivo debe ser un BIGINT positivo.');
  const id=String(value);
  if(!/^[1-9]\d{0,18}$/.test(id)||BigInt(id)>MAX_SIGNED_BIGINT_MP_UNI)
    throw failMp_uni(400,'MP_ADMIN_ID_INVALIDO','El consecutivo no es valido.');
  return id;
}
function fieldMp_uni(field){
  if(typeof field!=='string'||!SAFE_UNI.has(field))
    throw failMp_uni(400,'MP_ADMIN_CAMPO_PROTEGIDO',
      'Este campo no esta disponible para edicion en MP.',{field});
  return META_UNI.get(field);
}
function canonicalMpValue_uni(field,value,forWrite){
  const meta=fieldMp_uni(field);
  if(value===null||value===undefined){
    if(value===undefined)throw failMp_uni(400,'MP_ADMIN_VALOR_INVALIDO','Valor requerido.');
    return null;
  }
  if(meta.sqlType==='smallint unsigned'){
    if(typeof value!=='string' && !(typeof value==='number'&&Number.isSafeInteger(value)))
      throw failMp_uni(400,'MP_ADMIN_FACTOR_INVALIDO','El factor debe ser un entero o NULL.',{field});
    const raw=String(value).trim();
    if(!/^\d{1,5}$/.test(raw))
      throw failMp_uni(400,'MP_ADMIN_FACTOR_INVALIDO','Factor fuera del rango SMALLINT.',{field});
    const number=BigInt(raw);
    if(number>65535n||(forWrite&&number===0n))
      throw failMp_uni(400,'MP_ADMIN_FACTOR_INVALIDO','El factor debe ser positivo y maximo 65535.',{field});
    return String(number);
  }
  if(typeof value!=='string')throw failMp_uni(400,'MP_ADMIN_VALOR_INVALIDO',
    'El valor debe enviarse como texto o NULL.',{field});
  if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value))
    throw failMp_uni(400,'MP_ADMIN_VALOR_INVALIDO','Se detectaron caracteres de control.',{field});
  const limit=Number((/varchar\((\d+)\)/i.exec(meta.sqlType)||[])[1]);
  if(!Number.isSafeInteger(limit))throw new Error('Tipo SQL de MP no editable.');
  if(Array.from(value).length>limit)
    throw failMp_uni(400,'MP_ADMIN_VALOR_EXCESIVO','El campo supera su limite de caracteres.',{field});
  // Expected preserva exactamente la celda vista; el nuevo texto se normaliza.
  if(!forWrite)return value;
  const trimmed=value.trim();
  return trimmed===''?null:trimmed;
}
function comparableMp_uni(field,value){
  return canonicalMpValue_uni(field,value,false);
}
function inputMp_uni(field,value){
  return canonicalMpValue_uni(field,value,true);
}
function payload_uni(body,bulk){
  const allowed=bulk?['ids','changes','expected']:['changes','expected'];
  if(!plain_uni(body)||Object.keys(body).some(k=>!allowed.includes(k))||
     !plain_uni(body.changes)||!plain_uni(body.expected)||Object.keys(body.changes).length!==1)
    throw failMp_uni(400,'MP_ADMIN_PAYLOAD_INVALIDO',
      'Se requiere una sola celda con changes y expected.');
  const field=Object.keys(body.changes)[0];
  return {field,value:inputMp_uni(field,body.changes[field])};
}
function normalizeSingleMp_uni(body){
  const {field,value}=payload_uni(body,false);
  if(Object.keys(body.expected).length!==1||!Object.hasOwn(body.expected,field))
    throw failMp_uni(400,'MP_ADMIN_EXPECTED_REQUERIDO','Falta el valor original de la celda.');
  return Object.freeze({field,value,expected:comparableMp_uni(field,body.expected[field])});
}
function normalizeBulkMp_uni(body){
  const {field,value}=payload_uni(body,true);
  if(!Array.isArray(body.ids)||body.ids.length<2||body.ids.length>MAX_BULK_MP_UNI)
    throw failMp_uni(400,'MP_ADMIN_LOTE_INVALIDO','Selecciona de 2 a 20 registros.');
  const ids=body.ids.map(idMp_uni);
  if(new Set(ids).size!==ids.length)
    throw failMp_uni(400,'MP_ADMIN_LOTE_DUPLICADO','La seleccion contiene IDs repetidos.');
  ids.sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);
  if(Object.keys(body.expected).length!==ids.length||
    Object.keys(body.expected).some(k=>!ids.includes(k)))
    throw failMp_uni(400,'MP_ADMIN_EXPECTED_REQUERIDO','Faltan valores originales del lote.');
  const expected=Object.create(null);
  for(const id of ids){
    const item=body.expected[id];
    if(!plain_uni(item)||Object.keys(item).length!==1||!Object.hasOwn(item,field))
      throw failMp_uni(400,'MP_ADMIN_EXPECTED_REQUERIDO','Falta valor original del registro '+id);
    expected[id]=comparableMp_uni(field,item[field]);
  }
  return Object.freeze({ids:Object.freeze(ids),field,value,expected:Object.freeze(expected)});
}
module.exports=Object.freeze({
  PHASE3_SAFE_FIELDS_MP_UNI,PHASE4_SAFE_FIELDS_MP_UNI,MAX_BULK_MP_UNI,idMp_uni,
  failMp_uni,inputMp_uni,comparableMp_uni,normalizeSingleMp_uni,normalizeBulkMp_uni
});
