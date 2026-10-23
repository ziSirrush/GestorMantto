'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_VA_ADMIN_FASE_5_V001]
// BUSCARV y SUMAR/CONTAR por proyecto, SOLO vista previa. Sin E/S.
// Una coincidencia ambigua nunca concede un valor ni permite mezclar proyectos.
const {
  calculatePcLocal_uni, moneyToCents_uni, centsToMoney_uni,
  termDays_uni
} = require('./cobranza-uni-administracion.pc-formulas');

const PREVIEW_RELATION_FIELDS_UNI = Object.freeze([
  'facturas_pendientes_pago','adeudo','terminos',
  'zona_operativa','estado','estatus_cartera'
]);
const LOOKUP_MAP_UNI = Object.freeze({
  terminos:'condiciones_pago', zona_operativa:'z_oper',
  estado:'estado', estatus_cartera:'estatus_cartera'
});
const MAX_RELATED_ROWS_UNI = 20000;

function normalText_uni(value) {
  return String(value == null ? '' : value).trim().normalize('NFC').toLowerCase();
}
function idText_uni(value) {
  const text=String(value==null?'':value).trim();
  if(!/^\d{1,20}$/.test(text)||/^0+$/.test(text))return null;
  // BIGINT se maneja como texto; no convertirlo a Number.
  return BigInt(text).toString();
}
function keyVerified_uni(identity) {
  const id=idText_uni(identity?.id_proyecto_cobranza);
  const project=normalText_uni(identity?.proyecto);
  return identity?.valido===true&&['VALIDO','VALIDO_SIN_ID'].includes(identity.estado)&&id&&project
    ? id+'\u0001'+project : null;
}
function sameVerifiedProject_uni(row,identity){
  const key=keyVerified_uni(identity);
  if(!key||normalText_uni(row?.proyecto)!==normalText_uni(identity.proyecto))return false;
  const raw=row?.id_proyecto_cobranza;
  if(raw===null||raw===undefined||raw==='')return true;
  const found=idText_uni(raw);
  return found!==null && found===idText_uni(identity.id_proyecto_cobranza);
}
function fieldValue_uni(records,field){
  if(!records.length)return {state:'missing',value:null};
  const values=[];
  for(const row of records){
    let value=row?.[field];
    if(value===null||value===undefined||String(value).trim()==='')return {state:'incomplete',value:null};
    value=String(value).trim();
    if(field==='condiciones_pago'){
      const term=termDays_uni(value);
      if(term===null)return {state:'invalid',value:null};
      value=String(term);
    }
    if(!values.some(entry=>normalText_uni(entry)===normalText_uni(value)))values.push(value);
    if(values.length>1)return {state:'conflict',value:null};
  }
  return {state:'single',value:values[0]};
}
function projectMp_uni(mpRows,identity){
  return mpRows.filter(row=>sameVerifiedProject_uni(row,identity));
}
function lookupRow_uni(row,identity,mpRows){
  const values={};const warnings=[];const sources={};
  const group=keyVerified_uni(identity);
  const matched=group?projectMp_uni(mpRows,identity):[];
  for(const [target,source] of Object.entries(LOOKUP_MAP_UNI)){
    const result=fieldValue_uni(matched,source);
    if(result.state==='single'){
      values[target]=result.value;
      sources[target]=identity.estado==='VALIDO'?'proyecto_fk':'proyecto_validado_sin_fk';
    }else if(target==='terminos'&&result.state==='missing'){
      // Sheets lo hacia por cliente. Solo se acepta si TODOS los MP del cliente
      // autorizado coinciden en dias, nunca por la primera fila encontrada.
      const client=normalText_uni(row?.cliente);
      const allClient=client?mpRows.filter(mp=>normalText_uni(mp.cliente)===client):[];
      const fallback=fieldValue_uni(allClient,source);
      if(fallback.state==='single'){
        values.terminos=fallback.value;sources.terminos='cliente_consistente';
      }else if(fallback.state==='missing')warnings.push('TERMINOS_SIN_ORIGEN_MP');
      else warnings.push('TERMINOS_CLIENTE_'+fallback.state.toUpperCase());
    }else if(target==='estatus_cartera'&&result.state==='missing'&&group){
      // BUSCARV AD de Sheets: SI.ERROR(...,"Inactivo"). No interpretar
      // identidad inexistente como Inactivo.
      values.estatus_cartera='Inactivo';sources.estatus_cartera='sin_mp_validado';
    }else if(result.state!=='missing'){
      warnings.push(target.toUpperCase()+'_MP_'+result.state.toUpperCase());
    }
  }
  if(!group)warnings.push('IDENTIDAD_PROYECTO_'+String(identity?.estado||'NO_VERIFICADA'));
  return {values,warnings,sources,group};
}
function rowsByProject_uni(pcRows,identity){
  return pcRows.filter(row=>sameVerifiedProject_uni(row,identity));
}
function calculateAggregate_uni(pcRows,identity,mpRows,cutoffIso,complete=true){
  if(!complete)return {complete:false,warnings:['LIMITE_REGISTROS_ALCANZADO']};
  let count=0,amount=0n;const warnings=[];
  const siblings=rowsByProject_uni(pcRows,identity);
  if(siblings.length===0)return {complete:false,warnings:['VENTAS_PROYECTO_NO_ENCONTRADAS']};
  for(const sibling of siblings){
    const lookup=lookupRow_uni(sibling,identity,mpRows);
    const withTerms=Object.hasOwn(lookup.values,'terminos')
      ? {...sibling,terminos:lookup.values.terminos} : sibling;
    const local=calculatePcLocal_uni(withTerms,cutoffIso);
    const open=normalText_uni(sibling.estatus_administrativo)==='abierta';
    const sourceConflict=lookup.warnings.some(code=>
      /^(?:TERMINOS_MP|TERMINOS_CLIENTE)_(?:CONFLICT|INCOMPLETE|INVALID)$/.test(code));
    if(open&&sibling.fecha_factura&&sourceConflict){
      warnings.push('TERMINOS_RELACION_CONFLICTIVA');continue;
    }
    if(open&&sibling.fecha_factura&&local.values.fecha_vencimiento===null){
      warnings.push('VENCIMIENTO_NO_CALCULABLE');continue;
    }
    if(local.values.estatus!=='VENCIDO')continue;
    count++;
    if(open){
      const cents=moneyToCents_uni(local.values.venta_total);
      if(cents===null){warnings.push('IMPORTE_NO_CALCULABLE');continue;}
      amount+=cents;
    }
  }
  const asMoney=centsToMoney_uni(amount);
  if(asMoney===null)warnings.push('TOTAL_FUERA_DE_RANGO');
  if(warnings.length)return {complete:false,warnings:[...new Set(warnings)]};
  return {complete:true,facturas_pendientes_pago:count,adeudo:asMoney,warnings:[]};
}
function buildPcRelationPreview_uni({pageRows,identities,mpRows,siblingRows,cutoffIso,
  complete=true}={}){
  if(!Array.isArray(pageRows)||!Array.isArray(mpRows)||!Array.isArray(siblingRows) ||
    !identities||typeof identities.get!=='function')throw new TypeError('Datos de relaciones pc invalidos.');
  const projects=new Map();const rows=[];const formulaRows=[];
  for(const row of pageRows){
    const id=String(row.id_pc);
    const identity=identities.get(id);
    const lookup=lookupRow_uni(row,identity,mpRows);
    const values={...lookup.values},warnings=[...lookup.warnings];
    const key=lookup.group;
    if(key){
      if(!projects.has(key)){
        projects.set(key,{key,id_proyecto_cobranza:idText_uni(identity.id_proyecto_cobranza),
          proyecto:identity.proyecto,
          ...calculateAggregate_uni(siblingRows,identity,mpRows,cutoffIso,complete)});
      }
      const project=projects.get(key);
      if(project.complete){
        values.facturas_pendientes_pago=project.facturas_pendientes_pago;
        values.adeudo=project.adeudo;
      }else warnings.push(...project.warnings);
    }
    formulaRows.push(Object.hasOwn(values,'terminos')?{...row,terminos:values.terminos}:row);
    rows.push(Object.freeze({id_pc:id,values:Object.freeze(values),
      warnings:Object.freeze([...new Set(warnings)]),sources:Object.freeze({...lookup.sources})}));
  }
  let sum=0n,missing=0,number=0;
  for(const project of projects.values()){
    if(!project.complete){missing++;continue;}
    sum+=moneyToCents_uni(project.adeudo);
    number+=project.facturas_pendientes_pago;
  }
  const total=centsToMoney_uni(sum);
  return Object.freeze({
    source:'relaciones_aiven',mode:'preview_only',as_of:cutoffIso,
    fields:PREVIEW_RELATION_FIELDS_UNI,
    rows:Object.freeze(rows),
    formula_rows:Object.freeze(formulaRows),
    // Totales por proyecto unico DE ESTA PAGINA, NO KPI global del portafolio.
    project_summary:Object.freeze({projects:projects.size,complete:projects.size-missing,
      incomplete:missing,facturas_pendientes_pago:missing||total===null?null:number,
      adeudo:missing||total===null?null:total})
  });
}
module.exports=Object.freeze({
  PREVIEW_RELATION_FIELDS_UNI,MAX_RELATED_ROWS_UNI,
  normalText_uni,idText_uni,keyVerified_uni,sameVerifiedProject_uni,
  fieldValue_uni,lookupRow_uni,calculateAggregate_uni,buildPcRelationPreview_uni
});
