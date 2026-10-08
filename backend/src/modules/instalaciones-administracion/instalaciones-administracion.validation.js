'use strict';

const {
  GROUPS_COR,
  SYSTEM_READONLY_FIELDS_COR,
  POLICY_PENDING_FIELDS_COR,
  DERIVED_POLICY_PENDING_FIELDS_COR,
  RESPONSIBLE_ID_FIELDS_COR
} = require('./instalaciones-administracion.constants');

const VARCHAR_LIMITS_COR = Object.freeze({
  proyecto: 255,
  id_proyecto: 100,
  referencia_sitio: 255,
  estatus: 255,
  fecha_visita: 255,
  avance_oc: 255,
  avance_mo: 255,
  avance_aj: 255,
  numero_pisos: 255,
  numero_desembarques: 255,
  numero_puertas: 255,
  velocidad_ms: 255,
  capacidad_kg: 255,
  entrepiso_mm: 255,
  longitud_mm: 255,
  ancho_peldano_mm: 255,
  fecha_cpvp: 255,
  estatus_produccion: 255,
  fecha_descarga: 255,
  fecha_colocacion_esc_ramp: 255,
  fecha_ccnr: 255,
  fecha_ccr: 255,
  subcontratista: 255,
  fecha_inicio_montaje: 255,
  fecha_fin_montaje_planeado: 255,
  fecha_fin_montaje_modificado: 255,
  fecha_fin_montaje_real: 255,
  dias_restantes: 255,
  fecha_cti: 255,
  fecha_revision_supervisor: 255,
  fecha_minuta_revision_ajuste: 255,
  fecha_liberacion_ajuste: 255,
  ajustador: 255,
  fecha_inicio_ajuste: 255,
  fecha_fin_ajuste_planeado: 255,
  fecha_fin_ajuste_modificado: 255,
  fecha_fin_ajuste_real: 255,
  fecha_reporte_ajuste: 255,
  fecha_protocolo_aceptacion: 255,
  estatus_inspeccion_calidad: 255,
  fecha_entrega_cliente: 255,
  formato_caf_pg: 255,
  estatus_equipo_entrega: 255,
  anio_termino: 255,
  dias_sin_visita: 255,
  dias_sin_ccnr: 255,
  estado: 255,
  supervisor_fl: 255,
  ciudad: 255,
  fecha_posible_recepcion_cubo: 255,
  fecha_posible_inicio_ajuste: 255,
  certificado_regulador: 255,
  vendedor: 255,
  cliente: 500
});

const DEFAULT_TEXT_LIMIT_COR = 20000;

function knownError_cor(statusCode, code, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function positiveId_cor(value, field = 'id_ins_fl') {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_ID_INVALIDO', `${field} debe ser un entero positivo.`, {
      field,
      value
    });
  }
  return numeric;
}

function normalizeActive_cor(value) {
  if (value === true || value === 1 || value === '1') return 1;
  if (value === false || value === 0 || value === '0') return 0;

  const text = String(value ?? '').trim().toUpperCase();
  if (['ACTIVO', 'SI', 'SÍ', 'TRUE'].includes(text)) return 1;
  if (['INACTIVO', 'NO', 'FALSE'].includes(text)) return 0;

  throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_VALOR_INVALIDO', 'activo solo admite 0/1 o booleano.', {
    field: 'activo',
    value
  });
}

function normalizeResponsibleId_cor(value, field) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_VALOR_INVALIDO', `${field} debe ser un ID positivo o null.`, {
      field,
      value
    });
  }
  return numeric;
}

function normalizeText_cor(value, field) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') {
    throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_VALOR_INVALIDO', `${field} debe ser un valor escalar.`, {
      field
    });
  }

  const text = String(value).trim();
  if (!text) return null;

  const maxLength = VARCHAR_LIMITS_COR[field] || DEFAULT_TEXT_LIMIT_COR;
  if (text.length > maxLength) {
    throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_VALOR_LARGO', `${field} excede la longitud permitida.`, {
      field,
      max_length: maxLength,
      actual_length: text.length
    });
  }

  return text;
}

function normalizeFieldValue_cor(field, value) {
  if (field === 'activo') return normalizeActive_cor(value);
  if (RESPONSIBLE_ID_FIELDS_COR.includes(field)) return normalizeResponsibleId_cor(value, field);
  return normalizeText_cor(value, field);
}

function normalizeGroupUpdate_cor(groupKey, body = {}) {
  const group = GROUPS_COR[groupKey];
  if (!group) {
    throw knownError_cor(404, 'INSTALACIONES_ADMINISTRACION_GRUPO_NO_EXISTE', 'El grupo solicitado no existe.', {
      group: groupKey
    });
  }

  const changes = body && typeof body.changes === 'object' && !Array.isArray(body.changes)
    ? body.changes
    : null;

  if (!changes || !Object.keys(changes).length) {
    throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_CAMBIOS_REQUERIDOS', 'Se requiere un objeto changes con al menos un campo.');
  }

  const normalized = {};
  for (const [field, value] of Object.entries(changes)) {
    if (SYSTEM_READONLY_FIELDS_COR.includes(field)) {
      throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_CAMPO_SOLO_LECTURA', `${field} es de solo lectura.`, { field });
    }

    if (!group.fields.includes(field)) {
      throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_CAMPO_FUERA_GRUPO', `${field} no pertenece al grupo ${groupKey}.`, {
        field,
        group: groupKey
      });
    }

    if (POLICY_PENDING_FIELDS_COR.includes(field)) {
      throw knownError_cor(409, 'INSTALACIONES_ADMINISTRACION_POLITICA_PENDIENTE', `${field} permanece bloqueado hasta definir la politica de identidad.`, {
        field,
        group: groupKey
      });
    }

    if (DERIVED_POLICY_PENDING_FIELDS_COR.includes(field)) {
      throw knownError_cor(409, 'INSTALACIONES_ADMINISTRACION_DERIVADO_PENDIENTE', `${field} permanece bloqueado hasta definir si sera calculado o editable.`, {
        field,
        group: groupKey
      });
    }

    normalized[field] = normalizeFieldValue_cor(field, value);
  }

  return normalized;
}

function publicContract_cor() {
  return Object.entries(GROUPS_COR).map(([key, group]) => ({
    key,
    label: group.label,
    fields: [...group.fields],
    editable_fields: group.fields.filter(field => (
      !POLICY_PENDING_FIELDS_COR.includes(field) &&
      !DERIVED_POLICY_PENDING_FIELDS_COR.includes(field)
    )),
    pending_policy_fields: group.fields.filter(field => (
      POLICY_PENDING_FIELDS_COR.includes(field) ||
      DERIVED_POLICY_PENDING_FIELDS_COR.includes(field)
    ))
  }));
}

module.exports = {
  VARCHAR_LIMITS_COR,
  knownError_cor,
  positiveId_cor,
  normalizeFieldValue_cor,
  normalizeGroupUpdate_cor,
  publicContract_cor
};
