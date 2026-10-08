'use strict';

// [Aster | 2026-10-08 | ASTER-MG | FASE_4_INSTALACIONES_ADMINISTRACION_FORMULARIOS_GUARDADO_V001]
// ins_fl stores the majority of values as VARCHAR/TEXT. Only changed values
// are normalized; historical, non-editable values remain untouched.

const DATE_FIELDS_COR = Object.freeze([
  'fecha_visita', 'fecha_descarga', 'fecha_colocacion_esc_ramp',
  'fecha_cpvp', 'fecha_posible_recepcion_cubo', 'fecha_ccnr', 'fecha_ccr',
  'fecha_inicio_montaje', 'fecha_fin_montaje_planeado',
  'fecha_fin_montaje_modificado', 'fecha_fin_montaje_real', 'fecha_cti',
  'fecha_revision_supervisor', 'fecha_posible_inicio_ajuste',
  'fecha_minuta_revision_ajuste', 'fecha_liberacion_ajuste',
  'fecha_inicio_ajuste', 'fecha_fin_ajuste_planeado',
  'fecha_fin_ajuste_modificado', 'fecha_fin_ajuste_real',
  'fecha_reporte_ajuste', 'fecha_protocolo_aceptacion',
  'fecha_entrega_cliente'
]);
const PERCENT_FIELDS_COR = Object.freeze(['avance_oc', 'avance_mo', 'avance_aj']);
const COST_FIELDS_COR = Object.freeze([
  'presupuesto_mantenimiento_cem', 'costo_mensual_mantenimiento_cem'
]);
const MULTILINE_FIELDS_COR = Object.freeze([
  'comentarios_fl', 'condiciones_obra', 'evaluacion_subcontrato',
  'minuta_interfon', 'pendientes_calidad', 'direccion_proyecto',
  'contacto_cliente_sitio'
]);
const USER_FIELDS_COR = Object.freeze(['id_sup', 'id_asesor', 'id_admin']);

function validationError_cor(field, message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = 'INSTALACIONES_ADMINISTRACION_VALOR_INVALIDO';
  err.details = { field };
  return err;
}

function validDate_cor(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

function canonicalDecimal_cor(value, field, options) {
  if (value === null) return null;
  const raw = String(value).trim();
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) throw validationError_cor(field, `${field} debe ser un numero no negativo con maximo dos decimales.`);
  const num = Number(raw);
  if (!Number.isFinite(num) || num > options.max) {
    throw validationError_cor(field, `${field} excede el rango autorizado.`);
  }
  const fraction = match[2] || '';
  return `${Number(match[1])}${fraction ? '.' + fraction.replace(/0+$/, '') : ''}`.replace(/\.$/, '');
}

function normalizeEditedFields_cor(changes) {
  const output = {};
  for (const [field, value] of Object.entries(changes || {})) {
    if (DATE_FIELDS_COR.includes(field)) {
      if (value !== null && !validDate_cor(String(value))) {
        throw validationError_cor(field, `${field} debe tener una fecha valida en formato AAAA-MM-DD.`);
      }
      output[field] = value === null ? null : String(value);
    } else if (PERCENT_FIELDS_COR.includes(field)) {
      if (value === null) { output[field] = null; continue; }
      const text = String(value).trim().replace(/%$/, '').trim();
      const normalized = canonicalDecimal_cor(text, field, { max: 100 });
      output[field] = `${normalized}%`;
    } else if (COST_FIELDS_COR.includes(field)) {
      output[field] = canonicalDecimal_cor(value, field, { max: 9999999999.99 });
    } else {
      output[field] = value;
    }
  }
  return output;
}

function fieldMeta_cor(field, maxlengths = {}) {
  if (USER_FIELDS_COR.includes(field)) return { kind: 'user' };
  if (field === 'activo') return { kind: 'boolean' };
  if (DATE_FIELDS_COR.includes(field)) return { kind: 'date', format: 'YYYY-MM-DD' };
  if (PERCENT_FIELDS_COR.includes(field)) return { kind: 'percent', min: 0, max: 100, precision: 2 };
  if (COST_FIELDS_COR.includes(field)) return { kind: 'money', min: 0, max: 9999999999.99, precision: 2 };
  if (MULTILINE_FIELDS_COR.includes(field)) return { kind: 'textarea', max_length: maxlengths[field] || 20000 };
  return { kind: 'text', max_length: maxlengths[field] || 20000 };
}

module.exports = {
  DATE_FIELDS_COR, PERCENT_FIELDS_COR, COST_FIELDS_COR,
  MULTILINE_FIELDS_COR, USER_FIELDS_COR,
  validDate_cor, normalizeEditedFields_cor, fieldMeta_cor
};
