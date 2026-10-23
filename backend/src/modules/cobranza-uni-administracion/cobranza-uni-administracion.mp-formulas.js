'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_4_V001]
// Calculos monetarios EXACTOS, sin Number y sin SQL. Preview de lectura puro.
// NO sustituye los BUSCARV de Zona 1 ni escribe mientras GAS siga activo.
const {MP_FORMULAS_UNI}=require('./cobranza-uni-administracion.constants');
const MAX_MONEY_CENTS_UNI=999999999999999999n; // DECIMAL(18,2)
const MAX_FACTOR_UNI=65535n; // SMALLINT UNSIGNED
const MAX_SIGNED_BIGINT_UNI=9223372036854775807n;

function parseMoneyMp_uni(value) {
  if(value===null||value===undefined||value==='')return {state:'missing',cents:null};
  // MySQL DECIMAL se entrega como texto. Un numero JS solo se acepta si es entero seguro.
  if(typeof value!=='string' && !(typeof value==='number' && Number.isSafeInteger(value)))
    return {state:'invalid',cents:null};
  const text=String(value).trim();
  if(!/^-?\d{1,16}(?:\.\d{1,2})?$/.test(text))return {state:'invalid',cents:null};
  const negative=text[0]==='-';
  const [integer,fraction='']=(negative?text.slice(1):text).split('.');
  const cents=BigInt(integer)*100n+BigInt(fraction.padEnd(2,'0')||'0');
  if(cents>MAX_MONEY_CENTS_UNI)return {state:'invalid',cents:null};
  return {state:'valid',cents:negative?-cents:cents};
}
function formatMoneyMp_uni(cents) {
  if(typeof cents!=='bigint'||cents>MAX_MONEY_CENTS_UNI||cents< -MAX_MONEY_CENTS_UNI)
    throw new RangeError('Importe fuera del rango DECIMAL(18,2).');
  const sign=cents<0n?'-':'';
  const absolute=cents<0n?-cents:cents;
  return sign+String(absolute/100n)+'.'+String(absolute%100n).padStart(2,'0');
}
function parseFactorMp_uni(value){
  if(value===null||value===undefined||value==='')return {state:'missing',factor:null};
  if(typeof value!=='string' && !(typeof value==='number'&&Number.isSafeInteger(value)))
    return {state:'invalid',factor:null};
  const text=String(value).trim();
  if(!/^\d{1,5}$/.test(text))return {state:'invalid',factor:null};
  const factor=BigInt(text);
  if(factor===0n||factor>MAX_FACTOR_UNI)return {state:'invalid',factor:null};
  return {state:'valid',factor};
}
function previewMontoAnualMp_uni(row){
  if(!row||typeof row!=='object')throw new TypeError('Registro MP requerido.');
  const factor=parseFactorMp_uni(row.factor_monto_anual);
  const iguala=parseMoneyMp_uni(row.iguala);
  const stored=parseMoneyMp_uni(row.monto_anual);
  const base={field:'monto_anual',expression:MP_FORMULAS_UNI.monto_anual.expression,
    source:'detalle_mp_2026',calculated:null,
    stored:stored.state==='valid'?formatMoneyMp_uni(stored.cents):null,
    stored_state:stored.state,matches_stored:null};
  if(factor.state!=='valid')
    return Object.freeze({...base,status:factor.state==='missing'?'sin_factor':'factor_invalido'});
  if(iguala.state!=='valid')
    return Object.freeze({...base,status:iguala.state==='missing'?'sin_iguala':'iguala_invalida'});
  const cents=iguala.cents*factor.factor;
  if(cents>MAX_MONEY_CENTS_UNI||cents< -MAX_MONEY_CENTS_UNI)
    return Object.freeze({...base,status:'fuera_rango'});
  return Object.freeze({...base,status:'ready',
    calculated:formatMoneyMp_uni(cents),
    matches_stored:stored.state==='valid'?stored.cents===cents:false});
}
// Unicamente una comprobacion de consistencia. NO es formula de Sheets:
// P era BUSCARV de Zona 1. No escribir ni reemplazar pendiente en MySQL.
function previewPendienteMp_uni(row){
  if(!row||typeof row!=='object')throw new TypeError('Registro MP requerido.');
  const current=parseMoneyMp_uni(row.pendiente_corriente);
  const overdue=parseMoneyMp_uni(row.pendiente_vencido);
  const pending=parseMoneyMp_uni(row.pendiente);
  const base={status:'incomplete',component_sum:null,
    stored:pending.state==='valid'?formatMoneyMp_uni(pending.cents):null,matches_stored:null,
    policy:'diagnostic_only_no_recalculation'};
  if([current,overdue,pending].some(item=>item.state==='invalid'))
    return Object.freeze({...base,status:'invalid'});
  if([current,overdue,pending].some(item=>item.state==='missing'))
    return Object.freeze(base);
  const sum=current.cents+overdue.cents;
  if(sum>MAX_MONEY_CENTS_UNI||sum< -MAX_MONEY_CENTS_UNI)
    return Object.freeze({...base,status:'out_of_range'});
  return Object.freeze({...base,status:sum===pending.cents?'consistent':'different',
    component_sum:formatMoneyMp_uni(sum),matches_stored:sum===pending.cents});
}
function idMpPreview_uni(value){
  if(typeof value!=='string' && !(typeof value==='number'&&Number.isSafeInteger(value)))
    throw new Error('ID de MP no verificable en vista previa.');
  const id=String(value);
  if(!/^[1-9]\d{0,18}$/.test(id)||BigInt(id)>MAX_SIGNED_BIGINT_UNI)
    throw new Error('ID de MP no verificable en vista previa.');
  return id;
}
function buildMpFormulaPreview_uni(rows){
  if(!Array.isArray(rows))throw new TypeError('La consulta MP debe devolver filas.');
  const ids=new Set();
  const preview=[];
  const summary={rows:rows.length,ready:0,missing_factor:0,amount_differences:0,pending_differences:0};
  for(const row of rows){
    const id=idMpPreview_uni(row?.id_dmp);
    if(ids.has(id))throw new Error('IDs duplicados en lectura MP; vista previa denegada.');
    ids.add(id);
    const annual=previewMontoAnualMp_uni(row);
    const pending=previewPendienteMp_uni(row);
    const warnings=[];
    if(annual.status==='ready'){
      summary.ready++;
      if(!annual.matches_stored){summary.amount_differences++;warnings.push('MP_MONTO_ANUAL_DIFERENTE');}
    }else if(annual.status==='sin_factor')summary.missing_factor++;
    else if(!['sin_iguala'].includes(annual.status))warnings.push('MP_MONTO_ANUAL_NO_CALCULABLE');
    if(pending.status==='different'){
      summary.pending_differences++;warnings.push('MP_PENDIENTE_COMPONENTES_DIFERENTES');
    }
    preview.push(Object.freeze({id_dmp:id,monto_anual:annual,pendiente:pending,
      warnings:Object.freeze(warnings)}));
  }
  return Object.freeze({mode:'preview_only',table:'detalle_mp_2026',
    source:'detalle_mp_2026',expression:'iguala * factor_monto_anual',
    rows:Object.freeze(preview),summary:Object.freeze(summary)});
}
module.exports=Object.freeze({
  MAX_MONEY_CENTS_UNI,MAX_FACTOR_UNI,
  parseMoneyMp_uni,formatMoneyMp_uni,parseFactorMp_uni,
  previewMontoAnualMp_uni,previewPendienteMp_uni,buildMpFormulaPreview_uni
});
