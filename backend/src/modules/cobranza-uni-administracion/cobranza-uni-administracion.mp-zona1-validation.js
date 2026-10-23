'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_6_V001]
// Invoice field allowlist and typed validation. No writes or dynamic SQL.
const {MP_ZONE1_COLUMNS_UNI}=require('./cobranza-uni-administracion.constants');
const {failMp_uni}=require('./cobranza-uni-administracion.mp-edit-validation');

const META=new Map(MP_ZONE1_COLUMNS_UNI.map(x=>[x.name,x]));
const INVOICE_FIELDS_MP_UNI=Object.freeze(MP_ZONE1_COLUMNS_UNI
  .filter(c=>/_\d{2}$/.test(c.name)&&c.sheetColumn&&c.kind==='source_pending_rules')
  .map(c=>c.name));
const SAFE=new Set(INVOICE_FIELDS_MP_UNI);
const MAX_DECIMAL=999999999999999999n;
const MIN_INT=-2147483648n;
const MAX_INT=2147483647n;
function plain_uni(v){
  if(v===null||typeof v!=='object'||Array.isArray(v))return false;
  const proto=Object.getPrototypeOf(v);
  return proto===null||proto===Object.prototype||Object.getPrototypeOf(proto)===null;
}
function idZone1_uni(value){
  if(typeof value!=='string'&&!(typeof value==='number'&&Number.isSafeInteger(value)))
    throw failMp_uni(400,'MP_ZONA1_ID_INVALIDO','ID de Zona 1 invalido.');
  const raw=String(value);
  if(!/^[1-9]\d{0,19}$/.test(raw)||BigInt(raw)>18446744073709551615n)
    throw failMp_uni(400,'MP_ZONA1_ID_INVALIDO','ID Zona 1 fuera de BIGINT UNSIGNED.');
  return raw;
}
function realDate_uni(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [y,m,d]=value.split('-').map(Number);
  if(y<1000||m<1||m>12||d<1||d>31)return false;
  const parsed=new Date(Date.UTC(y,m-1,d));
  return parsed.getUTCFullYear()===y&&parsed.getUTCMonth()===m-1&&parsed.getUTCDate()===d;
}
function validateInvoiceField_uni(field){
  if(typeof field!=='string'||!SAFE.has(field))
    throw failMp_uni(400,'MP_ZONA1_CAMPO_NO_PERMITIDO','Solo campos de los 12 bloques de facturacion.',{field});
  return META.get(field);
}
function invoiceValue_uni(field,value,forWrite){
  const meta=validateInvoiceField_uni(field);
  if(value===null)return null;
  if(typeof value!=='string'&&!(typeof value==='number'&&Number.isSafeInteger(value)))
    throw failMp_uni(400,'MP_ZONA1_VALOR_INVALIDO','Dato debe ser texto o NULL.',{field});
  const original=String(value);
  if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(original))
    throw failMp_uni(400,'MP_ZONA1_VALOR_INVALIDO','Caracteres de control prohibidos.',{field});
  const raw=original.trim();
  if(raw===''&&forWrite)return null;
  if(raw===''&&!forWrite)return original;
  if(meta.sqlType==='date'){
    if(!realDate_uni(raw))throw failMp_uni(400,'MP_ZONA1_FECHA_INVALIDA','Fecha ISO AAAA-MM-DD invalida.',{field});
    return raw;
  }
  if(meta.sqlType==='int'){
    if(!/^-?\d{1,12}$/.test(raw))throw failMp_uni(400,'MP_ZONA1_ENTERO_INVALIDO','Entero invalido.',{field});
    const n=BigInt(raw);
    if(n<MIN_INT||n>MAX_INT)throw failMp_uni(400,'MP_ZONA1_ENTERO_INVALIDO','Entero fuera del rango INT.',{field});
    return n.toString();
  }
  if(meta.sqlType==='decimal(18,2)'){
    const match=/^(-?)(\d{1,16})(?:\.(\d{1,2}))?$/.exec(raw);
    if(!match)throw failMp_uni(400,'MP_ZONA1_IMPORTE_INVALIDO','Decimal invalido.',{field});
    const cents=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0'));
    if(cents>MAX_DECIMAL)throw failMp_uni(400,'MP_ZONA1_IMPORTE_INVALIDO','Decimal fuera de rango.',{field});
    return (match[1]==='-'&&cents!==0n?'-':'')+(cents/100n).toString()+'.'+
      (cents%100n).toString().padStart(2,'0');
  }
  const limit=Number((/^varchar\((\d+)\)$/i.exec(meta.sqlType)||[])[1]);
  if(!Number.isSafeInteger(limit)||Array.from(original).length>limit)
    throw failMp_uni(400,'MP_ZONA1_TEXTO_EXCESIVO','Texto excede limite del campo.',{field});
  return forWrite?raw:original;
}
function normalizeInvoiceEdit_uni(body){
  if(!plain_uni(body)||!plain_uni(body.changes)||!plain_uni(body.expected)||
    Object.keys(body).some(k=>!['changes','expected','id_mp_zona_1'].includes(k))||
    Object.keys(body.changes).length!==1||Object.keys(body.expected).length!==1)
    throw failMp_uni(400,'MP_ZONA1_PAYLOAD_INVALIDO','Se requiere changes y expected de una celda.');
  const field=Object.keys(body.changes)[0];
  const value=invoiceValue_uni(field,body.changes[field],true);
  if(!Object.hasOwn(body.expected,field))
    throw failMp_uni(400,'MP_ZONA1_EXPECTED_REQUERIDO','Valor previo obligatorio.');
  return Object.freeze({field,value,expected:invoiceValue_uni(field,body.expected[field],false),
    ...(body.id_mp_zona_1!==undefined?{id_mp_zona_1:idZone1_uni(body.id_mp_zona_1)}:{})});
}
function normalizeInvoiceCreate_uni(body){
  if(!plain_uni(body)||!plain_uni(body.changes)||Object.keys(body).length!==1)
    throw failMp_uni(400,'MP_ZONA1_PAYLOAD_INVALIDO','Solo changes de facturacion.');
  const fields=Object.keys(body.changes);
  if(fields.length<1||fields.length>INVOICE_FIELDS_MP_UNI.length)
    throw failMp_uni(400,'MP_ZONA1_PAYLOAD_INVALIDO','Se requiere al menos una captura de factura.');
  const changes=Object.create(null);
  for(const field of fields)changes[field]=invoiceValue_uni(field,body.changes[field],true);
  if(Object.values(changes).every(v=>v===null))
    throw failMp_uni(400,'MP_ZONA1_CAPTURA_VACIA','Captura al menos un valor.');
  return Object.freeze({changes:Object.freeze(changes),fields:Object.freeze(fields)});
}
function normalizeLink_uni(body){
  if(!plain_uni(body)||Object.keys(body).length!==1||!Object.hasOwn(body,'id_mp_zona_1'))
    throw failMp_uni(400,'MP_ZONA1_VINCULO_INVALIDO','ID de fila Zona 1 requerido.');
  return Object.freeze({id_mp_zona_1:idZone1_uni(body.id_mp_zona_1)});
}
module.exports=Object.freeze({INVOICE_FIELDS_MP_UNI,validateInvoiceField_uni,
  idZone1_uni,invoiceValue_uni,normalizeInvoiceEdit_uni,normalizeInvoiceCreate_uni,normalizeLink_uni});
