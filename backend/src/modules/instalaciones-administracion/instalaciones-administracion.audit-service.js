'use strict';

// [Aster | 2026-10-08 | ASTER-MG | FASE_2_INSTALACIONES_ADMINISTRACION_PERMISOS_AUDITORIA_V001]
// [Aster | 2026-10-08 | ASTER-MG | FASE_5_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001]
// Reutiliza usuario_interacciones para auditoria interna detallada. No crea tabla.

const interactionsService = require('../../services/interactions/interactions.service');
const { GROUPS_COR } = require('./instalaciones-administracion.constants');

// El servicio central jsonForDb_gnral retorna NULL si supera 65535 bytes.
// Por integridad, un cambio que no permita guardar el before/after debe
// fallar dentro de la transaccion, nunca confirmar una auditoria incompleta.
const MAX_AUDIT_JSON_BYTES_COR = 65535;

function requestEndpoint_cor(req) {
  return String(req?.originalUrl || req?.url || '')
    .split('?')[0]
    .slice(0, 500) || null;
}

function changedSnapshot_cor(row, fields) {
  return Object.fromEntries(fields.map(field => [field, row?.[field] ?? null]));
}

function auditKnownError_cor(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function assertSerializableAudit_cor(detail) {
  let json;
  try {
    json = JSON.stringify(detail);
  } catch (_error) {
    throw auditKnownError_cor(422, 'INSTALACIONES_ADMINISTRACION_AUDITORIA_INVALIDA',
      'No es posible registrar la auditoria completa del cambio.');
  }
  if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > MAX_AUDIT_JSON_BYTES_COR) {
    throw auditKnownError_cor(413, 'INSTALACIONES_ADMINISTRACION_AUDITORIA_EXCEDE_LIMITE',
      'Los valores modificados superan el limite de auditoria. Divide la edicion en cambios menores.');
  }
}

async function recordGroupUpdate_cor(req, input = {}) {
  const groupKey = String(input.group || '').trim();
  const group = GROUPS_COR[groupKey];
  if (!group) throw new Error(`Grupo de auditoria no valido: ${groupKey || '(vacio)'}.`);

  const fields = Object.keys(input.changes || {});
  if (!fields.length) return null;

  const before = input.before || {};
  const after = input.after || {};
  const idInsFl = Number(after.id_ins_fl || before.id_ins_fl || input.id_ins_fl || 0) || null;
  const idProyecto = String(after.id_proyecto || before.id_proyecto || '').trim() || null;
  const referencia = String(after.referencia_sitio || before.referencia_sitio || '').trim() || null;
  const proyecto = String(after.proyecto || before.proyecto || '').trim() || null;
  const reference = idProyecto || String(idInsFl || '').trim() || null;

  const detail = {
    source: 'instalaciones-administracion',
    audit: {
      id_ins_fl: idInsFl,
      id_proyecto: idProyecto,
      referencia_sitio: referencia,
      grupo: groupKey,
      campos: fields,
      before: changedSnapshot_cor(before, fields),
      after: changedSnapshot_cor(after, fields)
    }
  };
  assertSerializableAudit_cor(detail);

  const result = await interactionsService.recordFromRequest_gnral(req, {
    tipo_interaccion: 'AUDITAR_CAMBIO',
    modulo: 'instalaciones-administracion',
    entidad: 'proyecto_instalaciones',
    id_referencia: reference,
    titulo: `Cambio auditado en ${group.label}`,
    descripcion: `${group.label}: ${fields.join(', ')}`,
    ruta_destino: 'instalaciones-administracion',
    payload_json: {
      type: 'proyecto',
      id: idProyecto,
      id_ins_fl: idInsFl,
      referencia_sitio: referencia,
      proyecto,
      grupo: groupKey
    },
    detalle_json: detail,
    metodo_http: 'PATCH',
    endpoint: requestEndpoint_cor(req)
  }, {
    executor: input.executor
  });

  // La misma conexion debe confirmar INSERT y devolver una PK valida.
  // Un resultado indeterminado provoca ROLLBACK del UPDATE en el repositorio.
  if (!Number.isSafeInteger(Number(result?.id_interaccion)) || Number(result.id_interaccion) <= 0) {
    throw auditKnownError_cor(500, 'INSTALACIONES_ADMINISTRACION_AUDITORIA_NO_CONFIRMADA',
      'La auditoria del cambio no pudo confirmarse; la operacion se cancelo.');
  }
  return result;
}

module.exports = {
  MAX_AUDIT_JSON_BYTES_COR,
  assertSerializableAudit_cor,
  recordGroupUpdate_cor
};
