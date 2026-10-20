'use strict';

// BLT NOW | 2026-10-20 | ALTAS FASE 4 V001
// Persistencia autoritativa de calculados SOLO para nuevas altas humanas.
// AR/BB del Excel son previsiones: nunca se insertan en campos *_real.
const formulas = require('./instalaciones-administracion-altas-formulas');
const PERSISTED_FIELDS_COR = Object.freeze([
  'estatus_completo', 'dias_sin_ccnr', 'dias_sin_visita', 'dias_restantes',
  'meses_garantia_restantes', 'anio_termino', 'costo_mensual_mantenimiento_cem'
]);
const EXTRA_INPUT_FIELDS_COR = Object.freeze([
  'meses_garantia_actas', 'meses_garantia_sitio', 'fecha_descarga',
  'fecha_entrega_cliente', 'meses_mantenimiento_gratuito',
  'presupuesto_mantenimiento_cem'
]);

function decimalCor(value, digits) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (digits == null) return String(n);
  // TEXT en ins_fl, sin separadores ni simbolos monetarios.
  return n.toFixed(digits);
}

function persistedForRowCor(row, day) {
  const p = formulas.calculateCor(row, {today: day});
  return {
    estatus_completo: p.estatus_completo,
    dias_sin_ccnr: decimalCor(p.dias_sin_ccnr),
    dias_sin_visita: decimalCor(p.dias_sin_visita),
    dias_restantes: decimalCor(p.dias_restantes),
    meses_garantia_restantes: decimalCor(p.meses_garantia_restantes, 6),
    anio_termino: decimalCor(p.anio_termino),
    costo_mensual_mantenimiento_cem: decimalCor(p.costo_mensual_mantenimiento_cem, 2)
  };
}

module.exports = Object.freeze({PERSISTED_FIELDS_COR, EXTRA_INPUT_FIELDS_COR,
  decimalCor, persistedForRowCor});
