'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_VA_ADMIN_FASE_3_V001]
// Isolated, fail-closed edits. No calculated, FK or identity-dependent writes
// before the formula and relationship engines of phases 4 and 5.
const {
  PC_COLUMNS_UNI,PC_EDITABLE_FIELDS_UNI,PC_DERIVED_DEPENDENCIES_UNI
} = require('./cobranza-uni-administracion.constants');

const META = new Map(PC_COLUMNS_UNI.map(column=>[column.name,column]));
const IDENTITY_FIELDS = new Set(['proyecto','cliente']);
const DERIVATIVE_ORIGINS = new Set(
  Object.values(PC_DERIVED_DEPENDENCIES_UNI).flat()
);
const PHASE3_SAFE_FIELDS_UNI = Object.freeze(PC_EDITABLE_FIELDS_UNI.filter(
  field => !IDENTITY_FIELDS.has(field) && !DERIVATIVE_ORIGINS.has(field)
));
const SAFE = new Set(PHASE3_SAFE_FIELDS_UNI);
const MAX_BULK = 20;
const MAX_ID = 9223372036854775807n;
const MAX_TEXT = 4000;

function failPc_uni(statusCode,code,message,details){
  const error=new Error(message); error.statusCode=statusCode;error.code=code;
  if(details!==undefined)error.details=details;
  return error;
}
function plain_uni(o){
  return o!==null&&typeof o==='object'&&!Array.isArray(o)&&
    (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
}
function idPc_uni(x){
  if(typeof x!=='string' && !(typeof x==='number'&&Number.isSafeInteger(x)))
    throw failPc_uni(400,'VA_ADMIN_ID_INVALIDO','Identificador invalido.');
  const id=String(x);
  if(!/^[1-9]\d{0,18}$/.test(id)||BigInt(id)>MAX_ID)
    throw failPc_uni(400,'VA_ADMIN_ID_INVALIDO','El ID debe ser BIGINT positivo.');
  return id;
}
function isRealDate_uni(s){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const [y,m,d]=s.split('-').map(Number);
  if(y<1000||m<1||m>12||d<1||d>31)return false;
  const dt=new Date(Date.UTC(y,m-1,d));
  return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d;
}
function validatedField_uni(field){
  if(typeof field!=='string'||!SAFE.has(field))
    throw failPc_uni(400,'VA_ADMIN_CAMPO_NO_DISPONIBLE',
      'Campo protegido, calculado o reservado hasta fases posteriores.',{field});
  return META.get(field);
}
function inputValue_uni(field,value){
  const meta=validatedField_uni(field);
  if(value===null)return null;
  if(typeof value!=='string')throw failPc_uni(400,'VA_ADMIN_VALOR_INVALIDO',
    'El nuevo valor debe enviarse como texto o NULL.',{field});
  if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))
    throw failPc_uni(400,'VA_ADMIN_VALOR_INVALIDO','Caracteres de control no permitidos.',{field});
  const text=value.trim();
  if(!text)return null;
  if(meta.sqlType==='date'){
    if(!isRealDate_uni(text))throw failPc_uni(400,'VA_ADMIN_FECHA_INVALIDA',
      'La fecha debe tener formato AAAA-MM-DD y existir.',{field});
    return text;
  }
  if(meta.sqlType==='text'){
    if(Array.from(text).length>MAX_TEXT)throw failPc_uni(413,'VA_ADMIN_VALOR_EXCESIVO',
      'Los comentarios superan el limite permitido.',{field});
    return text;
  }
  const n=Number((/varchar\((\d+)\)/.exec(meta.sqlType)||[])[1]);
  if(!Number.isSafeInteger(n)||Array.from(text).length>n)
    throw failPc_uni(400,'VA_ADMIN_VALOR_EXCESIVO',
      'Se excede el tamano maximo del campo.',{field});
  return text;
}
function comparablePc_uni(field,value){
  validatedField_uni(field);
  if(value===null||value===undefined||value==='')return null;
  if(typeof value!=='string')throw failPc_uni(400,'VA_ADMIN_VALOR_INVALIDO','Valor original invalido.',{field});
  // Existing database values must be compared exactly, not silently trimmed.
  return value;
}
function payload_uni(body,bulk){
  const allowed=bulk?['ids','changes','expected']:['changes','expected'];
  if(!plain_uni(body)||Object.keys(body).some(k=>!allowed.includes(k))||
     !plain_uni(body.changes)||!plain_uni(body.expected)||
     Object.keys(body.changes).length!==1)
    throw failPc_uni(400,'VA_ADMIN_PAYLOAD_INVALIDO','Operacion de una celda: changes y expected obligatorios.');
  const field=Object.keys(body.changes)[0];
  return {field,value:inputValue_uni(field,body.changes[field])};
}
function normalizeSinglePc_uni(body){
  const {field,value}=payload_uni(body,false);
  if(Object.keys(body.expected).length!==1||!Object.hasOwn(body.expected,field))
    throw failPc_uni(400,'VA_ADMIN_EXPECTED_REQUERIDO','Se requiere el valor original de la celda.');
  return Object.freeze({field,value,expected:comparablePc_uni(field,body.expected[field])});
}
function normalizeBulkPc_uni(body){
  const {field,value}=payload_uni(body,true);
  if(!Array.isArray(body.ids)||body.ids.length<2||body.ids.length>MAX_BULK)
    throw failPc_uni(400,'VA_ADMIN_LOTE_INVALIDO','Selecciona de 2 a 20 registros.');
  const ids=body.ids.map(idPc_uni);
  if(new Set(ids).size!==ids.length)
    throw failPc_uni(400,'VA_ADMIN_LOTE_DUPLICADO','El lote contiene IDs repetidos.');
  const canonical=ids.sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);
  if(Object.keys(body.expected).length!==canonical.length||
     Object.keys(body.expected).some(k=>!canonical.includes(k)))
    throw failPc_uni(400,'VA_ADMIN_EXPECTED_REQUERIDO','Los valores originales del lote son obligatorios.');
  const expected=Object.create(null);
  for(const id of canonical){
    const item=body.expected[id];
    if(!plain_uni(item)||Object.keys(item).length!==1||!Object.hasOwn(item,field))
      throw failPc_uni(400,'VA_ADMIN_EXPECTED_REQUERIDO','Valor original faltante para registro '+id);
    expected[id]=comparablePc_uni(field,item[field]);
  }
  return Object.freeze({ids:canonical,field,value,expected:Object.freeze(expected)});
}
module.exports=Object.freeze({
  PHASE3_SAFE_FIELDS_UNI, MAX_BULK, idPc_uni,failPc_uni,
  inputValue_uni,comparablePc_uni,normalizeSinglePc_uni,normalizeBulkPc_uni
});
