'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_VA_ADMIN_FASE_4_V001]
// Motor PURO de las ocho formulas locales de Sheets para pc.
// Nunca consulta ni escribe MySQL/GAS; los BUSCARV y acumulados son Fase 5.
// La fecha de corte se obtiene en America/Mexico_City al momento de consultar.

const TIME_ZONE_UNI = 'America/Mexico_City';
const PC_LOCAL_FORMULA_FIELDS_UNI = Object.freeze([
  'mes_ov','pagado_iva','no_pagado_iva','venta_total',
  'mes_factura','fecha_vencimiento','dias_vencimiento','estatus'
]);
const MONTHS_UNI = Object.freeze([
  'ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'
]);
const CENTS_LIMIT_UNI = 999999999999999999n; // DECIMAL(18,2)
const DAY_MS_UNI = 86400000;

function dateIso_uni(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year=Number(match[1]), month=Number(match[2]), day=Number(match[3]);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month-1, day);
  const dt = new Date(ms);
  return dt.getUTCFullYear()===year && dt.getUTCMonth()===month-1 && dt.getUTCDate()===day ?
    {iso:value.trim(),year,month,day,epoch:ms}:null;
}
function todayMexicoCity_uni(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.valueOf())) throw new TypeError('Fecha de consulta invalida.');
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:TIME_ZONE_UNI,year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(date);
  const get=part=>parts.find(entry=>entry.type===part)?.value;
  const iso=`${get('year')}-${get('month')}-${get('day')}`;
  if (!dateIso_uni(iso)) throw new TypeError('No se pudo determinar la fecha CDMX.');
  return iso;
}
function monthUni_uni(date) {
  if (!date) return null;
  return MONTHS_UNI[date.month-1]+'-'+String(date.year).slice(-2);
}
function moneyToCents_uni(value) {
  if (value===undefined || value===null || value==='') return null;
  // MySQL devuelve DECIMAL(18,2) como texto. Nunca usar floats para la regla IVA.
  const raw=typeof value==='string' ? value.trim() :
    typeof value==='number' && Number.isSafeInteger(value) ? String(value) : null;
  if (raw===null) return null;
  const match=/^(-?)(\d{1,16})(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const cents=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0'));
  return cents > CENTS_LIMIT_UNI ? null : (match[1] ? -cents : cents);
}
function centsToMoney_uni(cents) {
  if (typeof cents!=='bigint' || cents > CENTS_LIMIT_UNI || cents < -CENTS_LIMIT_UNI)
    return null;
  const abs=cents<0n ? -cents : cents;
  return (cents<0n && abs!==0n ? '-' : '')+
    String(abs/100n)+'.'+String(abs%100n).padStart(2,'0');
}
function withVatCents_uni(cents) {
  const abs=cents<0n ? -cents : cents;
  const computed=(abs*116n+50n)/100n; // redondeo comercial a dos decimales
  return cents<0n ? -computed : computed;
}
function normalizeStatus_uni(value) {
  return String(value==null ? '' : value).trim().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
function termDays_uni(value) {
  if (value===null || value===undefined || value==='') return null;
  const text=String(value).trim();
  if(!/^\d{1,4}$/.test(text))return null;
  const days=Number(text);
  return Number.isSafeInteger(days) && days>=0 && days<=3650 ? days : null;
}
function addDays_uni(date, days) {
  if (!date || !Number.isSafeInteger(days) || days<0 || days>3650) return null;
  const result=new Date(date.epoch+days*DAY_MS_UNI);
  const iso=result.toISOString().slice(0,10);
  return dateIso_uni(iso) ? iso : null;
}
function dayDiff_uni(later, earlier) {
  const late=dateIso_uni(later), early=dateIso_uni(earlier);
  if (!late || !early) return null;
  return Math.round((late.epoch-early.epoch)/DAY_MS_UNI);
}
function calculatePcLocal_uni(row, cutoffIso) {
  if (!row || typeof row!=='object' || Array.isArray(row))
    throw new TypeError('Registro pc invalido.');
  const cutoff=dateIso_uni(cutoffIso);
  if (!cutoff) throw new TypeError('Fecha de corte CDMX invalida.');
  const warnings=[];
  const fechaOv=dateIso_uni(row.fecha_ov);
  if(row.fecha_ov != null && row.fecha_ov !== '' && !fechaOv)
    warnings.push('FECHA_OV_INVALIDA');
  const fechaFactura=dateIso_uni(row.fecha_factura);
  if(row.fecha_factura != null && row.fecha_factura !== '' && !fechaFactura)
    warnings.push('FECHA_FACTURA_INVALIDA');
  if(row.fecha_factura==null || row.fecha_factura==='') warnings.push('FECHA_FACTURA_AUSENTE');
  const value=moneyToCents_uni(row.precio_venta);
  if(value===null) warnings.push('PRECIO_VENTA_NO_CALCULABLE');
  const exempt=normalizeStatus_uni(row.tipo_pago)==='recibo';
  const total=value===null ? null : (exempt ? value : withVatCents_uni(value));
  const ventaTotal=centsToMoney_uni(total);
  if(total!==null && ventaTotal===null) warnings.push('PRECIO_IVA_EXCEDE_DECIMAL');
  const estatusAdmin=normalizeStatus_uni(row.estatus_administrativo);
  const paid=estatusAdmin==='pagado por completo';
  const open=estatusAdmin==='abierta';
  const term=termDays_uni(row.terminos);
  if(fechaFactura && term===null) warnings.push('TERMINOS_INVALIDOS_O_AUSENTES');
  const due=fechaFactura && term!==null ? addDays_uni(fechaFactura,term) : null;
  if(fechaFactura && term!==null && due===null) warnings.push('FECHA_VENCIMIENTO_FUERA_DE_RANGO');
  const days=open && due ? dayDiff_uni(cutoff.iso,due) : 0;
  const daysValid=Number.isSafeInteger(days) ? days : 0;
  const values=Object.freeze({
    mes_ov:monthUni_uni(fechaOv),
    pagado_iva:ventaTotal===null ? null : (paid ? ventaTotal : '0.00'),
    no_pagado_iva:ventaTotal===null ? null : (open ? ventaTotal : '0.00'),
    venta_total:ventaTotal,
    mes_factura:monthUni_uni(fechaFactura),
    fecha_vencimiento:due,
    dias_vencimiento:daysValid,
    estatus:daysValid>0 ? 'VENCIDO' : 'CORRIENTE'
  });
  return Object.freeze({values,warnings:Object.freeze(warnings)});
}
function previewPcLocalRows_uni(rows,options={}) {
  if(!Array.isArray(rows))throw new TypeError('Listado pc invalido.');
  const asOf=options.cutoffIso===undefined ? todayMexicoCity_uni(options.now||new Date()) : options.cutoffIso;
  if(!dateIso_uni(asOf))throw new TypeError('Fecha de corte invalida.');
  return Object.freeze({
    source:'formulas_backend',mode:'preview_only',time_zone:TIME_ZONE_UNI,
    as_of:asOf,fields:PC_LOCAL_FORMULA_FIELDS_UNI,
    rows:Object.freeze(rows.map(row=>{
      const calculated=calculatePcLocal_uni(row,asOf);
      return Object.freeze({id_pc:String(row.id_pc),...calculated});
    }))
  });
}
module.exports=Object.freeze({
  TIME_ZONE_UNI,PC_LOCAL_FORMULA_FIELDS_UNI,
  dateIso_uni,todayMexicoCity_uni,monthUni_uni,moneyToCents_uni,
  centsToMoney_uni,withVatCents_uni,termDays_uni,addDays_uni,dayDiff_uni,
  calculatePcLocal_uni,previewPcLocalRows_uni
});
