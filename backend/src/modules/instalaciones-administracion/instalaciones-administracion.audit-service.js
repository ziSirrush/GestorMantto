'use strict';

// [Aster | 2026-10-08 | ASTER-MG | FASE_2_INSTALACIONES_ADMINISTRACION_PERMISOS_AUDITORIA_V001]
// Reutiliza usuario_interacciones para auditoria interna detallada. No crea tabla.

const interactionsService = require('../../services/interactions/interactions.service');
const { GROUPS_COR } = require('./instalaciones-administracion.constants');

function requestEndpoint_cor(req) {
  return String(req?.originalUrl || req?.url || '')
    .split('?')[0]
    .slice(0, 500) || null;
}

function changedSnapshot_cor(row, fields) {
  return Object.fromEntries(fields.map(field => [field, row?.[field] ?? null]));
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

  return interactionsService.recordFromRequest_gnral(req, {
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
    detalle_json: {
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
    },
    metodo_http: 'PATCH',
    endpoint: requestEndpoint_cor(req)
  }, {
    executor: input.executor
  });
}

module.exports = {
  recordGroupUpdate_cor
};
