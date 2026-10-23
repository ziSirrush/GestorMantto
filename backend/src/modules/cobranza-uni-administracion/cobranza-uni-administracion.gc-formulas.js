'use strict';

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_5_V001]
// El servidor es la unica autoridad de formulas. No usar Number para dinero;
// DECIMAL(18,2) se opera en centavos exactos con BigInt.
// Fiel a la hoja: campos numericos vacios se interpretan como cero.
// Una categoria sin regla NO inventa limite: credito/suministro/disponible = NULL.
const {
  GC_DERIVED_FIELDS_UNI, GC_DERIVED_DEPENDENCIES_UNI
} = require('./cobranza-uni-administracion.constants');

const CENTS = 100n;
const MAX_CENTS = 999999999999999999n; // DECIMAL(18,2)
const MIN_INT = -2147483648n;
const MAX_INT = 2147483647n;
const DERIVED_SET = new Set(GC_DERIVED_FIELDS_UNI);
const ORDER = Object.freeze([
  'adeudo', 'facts_adeudadas', 'credito_para_va',
  'nivel_riesgo_credito', 'suministro', 'credito_disponible_venta', 'anticipo'
]);
const MONETARY = new Set(['adeudo','credito_para_va','credito_disponible_venta']);
const INTEGER = new Set(['facts_adeudadas']);

const TIERS = Object.freeze({
  RESIDENCIAL: Object.freeze([15000,30000]),
  COMERCIAL: Object.freeze([50000,80000]),
  OFICINAS: Object.freeze([50000,80000]),
  HOTEL: Object.freeze([50000,80000]),
  HOSPITAL: Object.freeze([50000,80000]),
  FABRICA: Object.freeze([50000,80000]),
  AEROPUERTO: Object.freeze([50000,80000]),
  OTRO: Object.freeze([10000,30000]),
  MIXTO: Object.freeze([10000,40000]),
  ESCUELA: Object.freeze([10000,30000])
});

function calculationError_uni(code,message,field,details) {
  const error=new Error(message);
  error.statusCode=422;
  error.code=code;
  error.details={field,...(details||{})};
  return error;
}
function normalCategory_uni(value) {
  return String(value==null?'':value).normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
}
function decimalCents_uni(value,field) {
  if(value===null||value===undefined||value==='') return 0n;
  if(typeof value!=='string' && !(typeof value==='number'&&Number.isSafeInteger(value))) {
    throw calculationError_uni('GC_ADMIN_ORIGEN_NUMERICO_INVALIDO',
      `Importe origen no valido: ${field}.`,field);
  }
  const raw=String(value).trim();
  const match=/^([+-]?)(\d{1,20})(?:\.(\d{1,2}))?$/.exec(raw);
  if(!match)throw calculationError_uni('GC_ADMIN_ORIGEN_NUMERICO_INVALIDO',
    `El importe origen ${field} no respeta DECIMAL(18,2).`,field);
  const amount=BigInt(match[2])*CENTS+BigInt((match[3]||'').padEnd(2,'0'));
  const signed=match[1]==='-'?-amount:amount;
  if(signed>MAX_CENTS||signed < -MAX_CENTS) {
    throw calculationError_uni('GC_ADMIN_ORIGEN_NUMERICO_INVALIDO',
      `El importe origen ${field} excede DECIMAL(18,2).`,field);
  }
  return signed;
}
function intValue_uni(value,field) {
  if(value===null||value===undefined||value==='') return 0n;
  if(typeof value!=='string' && !(typeof value==='number'&&Number.isSafeInteger(value))) {
    throw calculationError_uni('GC_ADMIN_ORIGEN_NUMERICO_INVALIDO',
      `Cantidad origen no valida: ${field}.`,field);
  }
  const raw=String(value).trim();
  if(!/^[+-]?\d{1,20}$/.test(raw))throw calculationError_uni('GC_ADMIN_ORIGEN_NUMERICO_INVALIDO',
    `Cantidad origen no valida: ${field}.`,field);
  const number=BigInt(raw);
  if(number<MIN_INT||number>MAX_INT)throw calculationError_uni('GC_ADMIN_ORIGEN_NUMERICO_INVALIDO',
    `La cantidad ${field} excede INT.`,field);
  return number;
}
function money_uni(cents,field){
  if(cents>MAX_CENTS||cents< -MAX_CENTS)throw calculationError_uni(
    'GC_ADMIN_CALCULO_FUERA_RANGO',`El calculo ${field} excede DECIMAL(18,2).`,field);
  const sign=cents<0n?'-':'';
  const absolute=cents<0n?-cents:cents;
  return `${sign}${absolute/CENTS}.${String(absolute%CENTS).padStart(2,'0')}`;
}
function integer_uni(number,field){
  if(number<MIN_INT||number>MAX_INT)throw calculationError_uni(
    'GC_ADMIN_CALCULO_FUERA_RANGO',`El calculo ${field} excede INT.`,field);
  return String(number);
}
function credit_uni(category, count){
  const tier=TIERS[normalCategory_uni(category)];
  if(!tier)return null;
  return money_uni(BigInt(count>=5n?tier[1]:tier[0])*CENTS,'credito_para_va');
}
function labelRisk_uni(count){
  return count<=1n?'BAJO':count===2n?'MEDIO':'ALTO';
}
function valueForField_uni(field,next){
  if(field==='adeudo') return money_uni(
    decimalCents_uni(next.montp_mp,'montp_mp')+decimalCents_uni(next.monto_va,'monto_va'),field);
  if(field==='facts_adeudadas') return integer_uni(
    intValue_uni(next.facturas_mp,'facturas_mp')+intValue_uni(next.facturas_va,'facturas_va'),field);
  if(field==='credito_para_va')return credit_uni(next.categoria,
    intValue_uni(next.recuento_no_equipos,'recuento_no_equipos'));
  if(field==='nivel_riesgo_credito')return labelRisk_uni(intValue_uni(next.facts_adeudadas,'facts_adeudadas'));
  if(field==='suministro'){
    if(next.credito_para_va===null||next.credito_para_va===undefined||next.credito_para_va==='')return null;
    return decimalCents_uni(next.adeudo,'adeudo')>decimalCents_uni(next.credito_para_va,'credito_para_va')
      ?'NO SUMINISTRO':'SUMINISTRO';
  }
  if(field==='credito_disponible_venta'){
    if(next.credito_para_va===null||next.credito_para_va===undefined||next.credito_para_va==='')return null;
    return money_uni(decimalCents_uni(next.credito_para_va,'credito_para_va')-
      decimalCents_uni(next.adeudo,'adeudo'),field);
  }
  if(field==='anticipo'){
    if(next.nivel_riesgo_credito===null||next.nivel_riesgo_credito===undefined)return null;
    const risk=normalCategory_uni(next.nivel_riesgo_credito);
    if(risk==='ALTO'||risk==='MEDIO')return 'SI';
    if(risk==='BAJO')return 'NO';
    // Nunca activar anticipo con una etiqueta legacy desconocida.
    return null;
  }
  throw new Error('Formula fuera del contrato GC: '+field);
}
function equalsDerived_uni(field,existing,value){
  if(existing===null||existing===undefined||existing==='')return value===null;
  if(value===null)return false;
  if(MONETARY.has(field)){
    try{return decimalCents_uni(existing,field)===decimalCents_uni(value,field);}
    catch(_err){return false;}
  }
  if(INTEGER.has(field)){
    try{return intValue_uni(existing,field)===intValue_uni(value,field);}
    catch(_err){return false;}
  }
  return String(existing)===String(value);
}

/**
 * Retorna solo campos derivados alcanzables por la celda original modificada.
 * Cada campo marcado dirty activa sus dependientes, aunque no cambie su valor;
 * esto permite reparar una salida derivada obsoleta sin tocar otra rama ajena.
 */
function deriveForChange_uni(before,editedField,editedValue){
  if(!before||typeof before!=='object'||Array.isArray(before))throw new Error('Registro fuente ausente.');
  if(DERIVED_SET.has(editedField))throw new Error('No se permite cambiar un derivado.');
  const dirty=new Set([editedField]);
  const next={...before,[editedField]:editedValue};
  const patch={};
  const changes=[];
  const warnings=[];
  for(const field of ORDER){
    const deps=GC_DERIVED_DEPENDENCIES_UNI[field];
    if(!deps.some(dependency=>dirty.has(dependency)))continue;
    const result=valueForField_uni(field,next);
    if(result===null && field==='credito_para_va')warnings.push({
      code:'CATEGORIA_SIN_REGLA',
      field:'categoria',
      message:'Categoria sin regla de credito: se deja el limite y dependientes sin calcular (NULL).'
    });
    next[field]=result;
    if(!equalsDerived_uni(field,before[field],result)){
      patch[field]=result;
      changes.push(Object.freeze({field,before:before[field]??null,after:result}));
    }
    dirty.add(field);
  }
  return Object.freeze({
    patch:Object.freeze(patch),
    changes:Object.freeze(changes),
    warnings:Object.freeze(warnings)
  });
}

module.exports=Object.freeze({
  TIERS,ORDER,decimalCents_uni,intValue_uni,money_uni,
  labelRisk_uni,deriveForChange_uni
});
