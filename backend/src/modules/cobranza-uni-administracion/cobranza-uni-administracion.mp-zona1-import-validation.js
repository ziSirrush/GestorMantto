'use strict';
// [BLT NOW | 2026-10-23 | MP ZONA1 FASE 8 V001]
// Contrato cerrado para planchado inicial. Prohibe campos/llaves no previstos.
const {MP_ZONE1_SHEET_HEADERS_UNI,MP_ZONE1_COLUMNS_UNI} =
  require('./cobranza-uni-administracion.mp-contract');
const {idMp_uni,failMp_uni} = require('./cobranza-uni-administracion.mp-edit-validation');

const CONTRACT = 'MP_ZONA1_INITIAL_V001';
const MAX_BATCH = 20;
const SHEET_FIELDS = Object.freeze(MP_ZONE1_SHEET_HEADERS_UNI.map(c=>c.name));
const FIELD_SET = new Set(SHEET_FIELDS);
const TYPES = new Map(MP_ZONE1_COLUMNS_UNI.map(c=>[c.name,c.sqlType]));
const MIN_INT = -2147483648n, MAX_INT = 2147483647n;

function bad(code,message,details){return failMp_uni(400,code,message,details);}
function plain(value){
  return value!==null && typeof value==='object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value)===Object.prototype || Object.getPrototypeOf(value)===null);
}
function identity(value){
  return String(value===null||value===undefined?'':value).trim().normalize('NFC').toLocaleUpperCase('es-MX');
}
function realDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [y,m,d]=value.split('-').map(Number);
  if(y<1000||y>9999||m<1||m>12||d<1||d>31)return false;
  const date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y && date.getUTCMonth()===m-1 && date.getUTCDate()===d;
}
function canonicalValue(field,value){
  const type=TYPES.get(field);
  if(!FIELD_SET.has(field)||!type)throw bad('MPZ1_IMPORT_FIELD_UNKNOWN','Columna fuera del contrato.',{field});
  if(value===null)return null;
  if(typeof value!=='string' && !(typeof value==='number'&&Number.isSafeInteger(value)))
    throw bad('MPZ1_IMPORT_VALUE_INVALID','Solo se admiten strings, enteros seguros o NULL.',{field});
  const raw=String(value).trim();
  if(!raw)return null;
  if(/[\x00-\x1f\x7f]/.test(raw))
    throw bad('MPZ1_IMPORT_VALUE_INVALID','Caracteres de control no admitidos.',{field});
  if(type==='date'){
    if(!realDate(raw))throw bad('MPZ1_IMPORT_DATE_INVALID','Fecha invalida; usar AAAA-MM-DD.',{field});
    return raw;
  }
  if(type==='int'){
    if(!/^-?\d{1,12}$/.test(raw))throw bad('MPZ1_IMPORT_INT_INVALID','Entero invalido.',{field});
    const number=BigInt(raw);
    if(number<MIN_INT||number>MAX_INT)throw bad('MPZ1_IMPORT_INT_INVALID','Entero fuera del rango INT.',{field});
    return number.toString();
  }
  if(type==='decimal(18,2)'){
    const match=/^(-?)(\d{1,20})(?:\.(\d{1,2}))?$/.exec(raw);
    if(!match)throw bad('MPZ1_IMPORT_DECIMAL_INVALID','Importe no valido (max. 2 decimales).',{field});
    const units=BigInt(match[2]);
    if(units>9999999999999999n)throw bad('MPZ1_IMPORT_DECIMAL_INVALID','Importe fuera del rango DECIMAL(18,2).',{field});
    const fraction=(match[3]||'').padEnd(2,'0');
    const negative=match[1]==='-' && !(units===0n && fraction==='00');
    return (negative?'-':'')+units.toString()+'.'+fraction;
  }
  const limit=Number((/^varchar\((\d+)\)$/.exec(type)||[])[1]);
  if(!Number.isSafeInteger(limit) || Array.from(raw).length>limit)
    throw bad('MPZ1_IMPORT_TEXT_LIMIT','Texto excede longitud SQL.',{field});
  return raw;
}
function normalizeBatch(body){
  if(!plain(body) || Object.keys(body).some(k=>!['contract','batch_id','mode','rows'].includes(k)) ||
     body.contract!==CONTRACT || !['preview','import'].includes(body.mode) ||
     typeof body.batch_id!=='string'||!/^[a-f0-9]{64}$/.test(body.batch_id) ||
     !Array.isArray(body.rows)||body.rows.length<1||body.rows.length>MAX_BATCH)
    throw bad('MPZ1_IMPORT_BATCH_INVALID','Contrato, modo, lote o hash invalidos.');
  const ids=new Set(),sheetRows=new Set();
  const rows=body.rows.map(item=>{
    if(!plain(item) || Object.keys(item).some(k=>!['id_dmp','sheet_row','data'].includes(k)) ||
       !Number.isSafeInteger(item.sheet_row)||item.sheet_row<2||item.sheet_row>1000000 ||
       !plain(item.data))throw bad('MPZ1_IMPORT_ROW_INVALID','Fila de importacion invalida.');
    const id=idMp_uni(item.id_dmp);
    if(ids.has(id)||sheetRows.has(item.sheet_row))
      throw bad('MPZ1_IMPORT_DUPLICATE','Consecutivo o fila Sheets duplicados en lote.');
    ids.add(id);sheetRows.add(item.sheet_row);
    const incoming=Object.keys(item.data);
    if(incoming.length!==SHEET_FIELDS.length || incoming.some(name=>!FIELD_SET.has(name)) ||
       SHEET_FIELDS.some(name=>!Object.hasOwn(item.data,name)))
      throw bad('MPZ1_IMPORT_COLUMNS_INVALID','La fila debe contener las 124 columnas exactas de Sheets.',
        {sheet_row:item.sheet_row});
    const data=Object.create(null);
    for(const name of SHEET_FIELDS){
      try{data[name]=canonicalValue(name,item.data[name]);}
      catch(error){if(error.statusCode===400)error.details={...(error.details||{}),sheet_row:item.sheet_row};throw error;}
    }
    if(!identity(data.proyecto)||!identity(data.idns))
      throw bad('MPZ1_IMPORT_IDENTITY_REQUIRED','Proyecto e ID (idns) obligatorios.',{sheet_row:item.sheet_row});
    return Object.freeze({id_dmp:id,sheet_row:item.sheet_row,data:Object.freeze(data)});
  });
  rows.sort((a,b)=>BigInt(a.id_dmp)<BigInt(b.id_dmp)?-1:BigInt(a.id_dmp)>BigInt(b.id_dmp)?1:0);
  return Object.freeze({contract:CONTRACT,batch_id:body.batch_id,mode:body.mode,rows:Object.freeze(rows)});
}
module.exports=Object.freeze({CONTRACT,MAX_BATCH,SHEET_FIELDS,
  normalizeBatch,canonicalValue,identity,realDate});
