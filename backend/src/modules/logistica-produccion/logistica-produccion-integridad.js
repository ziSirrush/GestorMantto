'use strict';
// [Aster | 2026-10-20 | ASTER-MG | FIX PVO PRODUCCION IDENTIDAD PPNS V001]
// La FK id_log_ops verifica existencia, pero no que el PPNS corresponda al mismo proyecto.
// ins_fl puede no existir todavia; cuando existe, se consulta solo por PPNS persistido.

function normalizePpns(value) {
  return String(value == null ? '' : value).trim().toUpperCase();
}

function hasLogLink(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function samePpns(left, right) {
  const a = normalizePpns(left);
  const b = normalizePpns(right);
  return Boolean(a && b && a === b);
}

function isProductionLinkValid(row) {
  return !hasLogLink(row?.id_log_ops) || samePpns(row?.ppns, row?.ppns_logistica);
}

function integrityError(context = 'PVO-Produccion') {
  const error = new Error(`${context}: el PPNS de PVO-Produccion no coincide con el PPNS del registro de Logistica. No se combinaran proyectos ni documentos hasta revisar la referencia.`);
  error.status = 409;
  error.statusCode = 409;
  error.code = 'PVO_PPNS_INCONSISTENTE';
  return error;
}

function assertSamePpns(stored, linked, context) {
  if (!samePpns(stored, linked)) throw integrityError(context);
}

function assertProductionLink(row, context) {
  if (!isProductionLinkValid(row)) throw integrityError(context);
}

module.exports = { normalizePpns, hasLogLink, samePpns, isProductionLinkValid, integrityError, assertSamePpns, assertProductionLink };
