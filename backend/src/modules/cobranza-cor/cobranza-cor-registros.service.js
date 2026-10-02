'use strict';

// [Aster | 2026-10-02 | ASTER-MG | COBRANZA COR FASE 6 EDITAR ELIMINAR V001]

const estadoCuentaService = require('./cobranza-cor.service');
const repository = require('./cobranza-cor.repository');
const registrosRepository = require('./cobranza-cor-registros.repository');

function httpError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

function badRequest(message, code = 'COBRANZA_COR_REGISTRO_INVALIDO') {
  return httpError(400, message, code);
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function requiredText(value, label, maxLength) {
  const text = cleanText(value);
  if (!text) throw badRequest(`${label} es obligatorio.`);
  if (Array.from(text).length > maxLength) throw badRequest(`${label} excede ${maxLength} caracteres.`);
  return text;
}

function optionalText(value, label, maxLength) {
  const text = cleanText(value);
  if (!text) return null;
  if (Array.from(text).length > maxLength) throw badRequest(`${label} excede ${maxLength} caracteres.`);
  return text;
}

function positiveId(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw badRequest(`${label} debe ser un entero positivo.`);
  return number;
}

function actorId(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function optionalDate(value, label) {
  const raw = cleanText(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw badRequest(`${label} debe usar YYYY-MM-DD.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw badRequest(`${label} no es una fecha valida.`);
  }
  return raw;
}

function optionalDecimal(value, label) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const raw = String(value).trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw)) throw badRequest(`${label} debe tener maximo 2 decimales.`);
  const number = Number(raw);
  if (!Number.isFinite(number) || Math.abs(number) >= 1e16) throw badRequest(`${label} esta fuera de rango.`);
  return number;
}

function nonNegativeDecimal(value, label) {
  const number = optionalDecimal(value, label);
  if (number !== null && number < 0) throw badRequest(`${label} no puede ser negativo.`);
  return number;
}

function normalizeFacturaInput(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw badRequest('El cuerpo de Factura debe ser un objeto JSON.');
  const tipo = String(payload.tipo_concepto || '').trim().toUpperCase();
  if (!['HITO', 'ADITIVA'].includes(tipo)) throw badRequest('Tipo de Factura debe ser HITO o ADITIVA.');
  const idConcepto = positiveId(payload.id_concepto ?? (tipo === 'HITO' ? payload.id_fuente_cor : payload.id_aditiva_cor), 'id_concepto');
  const subtotal = nonNegativeDecimal(payload.subtotal, 'Subtotal');
  const iva = nonNegativeDecimal(payload.iva, 'IVA');
  const total = Math.round(((subtotal || 0) + (iva || 0)) * 100) / 100;
  return {
    tipo_concepto: tipo,
    id_concepto: idConcepto,
    factura: requiredText(payload.factura, 'Factura', 150),
    fecha_factura: optionalDate(payload.fecha_factura, 'Fecha factura'),
    subtotal,
    iva,
    total,
    fecha_vencimiento: optionalDate(payload.fecha_vencimiento, 'Fecha vencimiento')
  };
}

function normalizePagoInput(payload, current) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw badRequest('El cuerpo de Pago debe ser un objeto JSON.');
  const importe = optionalDecimal(
    Object.prototype.hasOwnProperty.call(payload, 'importe_complemento_pago') ? payload.importe_complemento_pago : current.importe_complemento_pago,
    'Importe complemento pago'
  );
  if (importe === 0) throw badRequest('Importe complemento pago no puede ser cero.');
  return {
    no_factura: Object.prototype.hasOwnProperty.call(payload, 'no_factura')
      ? optionalText(payload.no_factura, 'No. Factura', 150)
      : cleanText(current.no_factura),
    complemento_pago: Object.prototype.hasOwnProperty.call(payload, 'complemento_pago')
      ? optionalText(payload.complemento_pago, 'Complemento pago', 255)
      : cleanText(current.complemento_pago),
    fecha_complemento_pago: Object.prototype.hasOwnProperty.call(payload, 'fecha_complemento_pago')
      ? optionalDate(payload.fecha_complemento_pago, 'Fecha complemento pago')
      : cleanText(current.fecha_complemento_pago),
    importe_complemento_pago: importe
  };
}

async function canonicalPpnsWithAccess(ppnsValue, informationAccess) {
  const ppns = requiredText(ppnsValue, 'PPNS', 100);
  const detail = await estadoCuentaService.detalleEstadoCuenta_cor(ppns, informationAccess);
  const canonical = cleanText(detail && detail.proyecto && detail.proyecto.ppns);
  if (!canonical) throw httpError(404, 'PPNS no encontrado o fuera del alcance autorizado.');
  return canonical;
}

async function resolverConceptoFactura(connection, ppns, input) {
  if (input.tipo_concepto === 'HITO') {
    const hito = await repository.getHitoFacturable_cor(connection, ppns, input.id_concepto);
    if (!hito) throw httpError(404, 'El Hito seleccionado no pertenece a este Estado de Cuenta.');
    return { moneda: cleanText(hito.moneda)?.toUpperCase() || null, id_fuente_cor: input.id_concepto, id_aditiva_cor: null };
  }
  const aditiva = await repository.getAditivaFacturable_cor(connection, ppns, input.id_concepto);
  if (!aditiva) throw httpError(404, 'La Aditiva seleccionada no pertenece a este Estado de Cuenta.');
  return { moneda: cleanText(aditiva.moneda)?.toUpperCase() || null, id_fuente_cor: null, id_aditiva_cor: input.id_concepto };
}

async function actualizarFactura_cor(ppnsValue, idFacturaValue, payload, informationAccess, actorUserId) {
  const ppns = await canonicalPpnsWithAccess(ppnsValue, informationAccess);
  const idFacturaCor = positiveId(idFacturaValue, 'idFacturaCor');
  const input = normalizeFacturaInput(payload);
  const connection = await repository.getConnection_cor();
  try {
    await connection.beginTransaction();
    try {
      const current = await registrosRepository.lockFactura_cor(connection, ppns, idFacturaCor);
      if (!current) throw httpError(404, 'Factura no encontrada en este Estado de Cuenta.');
      const concepto = await resolverConceptoFactura(connection, ppns, input);
      await registrosRepository.updateFactura_cor(connection, ppns, idFacturaCor, {
        ...input,
        ...concepto,
        updated_by: actorId(actorUserId)
      });
      // El estatus de la Factura sigue siendo derivado de los importes aplicados.
      // Si cambia el total, se recalcula dentro de la misma transaccion.
      await registrosRepository.recalcFacturaEstatus_cor(connection, idFacturaCor);
      await connection.commit();
      return { ok: true, ppns, id_factura_cor: idFacturaCor };
    } catch (error) {
      try { await connection.rollback(); } catch (_rollbackError) {}
      throw error;
    }
  } finally {
    connection.release();
  }
}

async function eliminarFactura_cor(ppnsValue, idFacturaValue, informationAccess) {
  const ppns = await canonicalPpnsWithAccess(ppnsValue, informationAccess);
  const idFacturaCor = positiveId(idFacturaValue, 'idFacturaCor');
  const connection = await repository.getConnection_cor();
  try {
    await connection.beginTransaction();
    try {
      const current = await registrosRepository.lockFactura_cor(connection, ppns, idFacturaCor);
      if (!current) throw httpError(404, 'Factura no encontrada en este Estado de Cuenta.');
      const relaciones_eliminadas = await registrosRepository.deleteFacturaRelations_cor(connection, idFacturaCor);
      const eliminadas = await registrosRepository.deleteFactura_cor(connection, ppns, idFacturaCor);
      if (eliminadas !== 1) throw httpError(409, 'La Factura cambio durante la eliminacion. Vuelve a intentarlo.');
      await connection.commit();
      return { ok: true, ppns, id_factura_cor: idFacturaCor, relaciones_eliminadas };
    } catch (error) {
      try { await connection.rollback(); } catch (_rollbackError) {}
      throw error;
    }
  } finally {
    connection.release();
  }
}

async function actualizarPago_cor(ppnsValue, idPagoValue, payload, informationAccess) {
  const ppns = await canonicalPpnsWithAccess(ppnsValue, informationAccess);
  const idPagoCor = positiveId(idPagoValue, 'idPagoCor');
  const connection = await repository.getConnection_cor();
  try {
    await connection.beginTransaction();
    try {
      const current = await registrosRepository.lockPago_cor(connection, ppns, idPagoCor);
      if (!current) throw httpError(404, 'Pago no encontrado en este Estado de Cuenta.');
      const input = normalizePagoInput(payload, current);
      const aplicado = await registrosRepository.sumPagoAplicado_cor(connection, idPagoCor);
      const disponible = Math.abs(Number(input.importe_complemento_pago || 0));
      if (aplicado > disponible + 0.005) {
        throw badRequest('El nuevo importe del Pago es menor que el importe ya aplicado a Facturas.');
      }
      await registrosRepository.updatePago_cor(connection, idPagoCor, input);
      await connection.commit();
      return { ok: true, ppns, id_pago_cor: idPagoCor };
    } catch (error) {
      try { await connection.rollback(); } catch (_rollbackError) {}
      throw error;
    }
  } finally {
    connection.release();
  }
}

async function eliminarPago_cor(ppnsValue, idPagoValue, informationAccess) {
  const ppns = await canonicalPpnsWithAccess(ppnsValue, informationAccess);
  const idPagoCor = positiveId(idPagoValue, 'idPagoCor');
  const connection = await repository.getConnection_cor();
  try {
    await connection.beginTransaction();
    try {
      const current = await registrosRepository.lockPago_cor(connection, ppns, idPagoCor);
      if (!current) throw httpError(404, 'Pago no encontrado en este Estado de Cuenta.');
      const facturas = await registrosRepository.listPagoFacturasForUpdate_cor(connection, idPagoCor);
      const relaciones_eliminadas = await registrosRepository.deletePagoRelations_cor(connection, idPagoCor);
      const eliminados = await registrosRepository.deletePago_cor(connection, idPagoCor);
      if (eliminados !== 1) throw httpError(409, 'El Pago cambio durante la eliminacion. Vuelve a intentarlo.');
      for (const row of facturas) {
        await registrosRepository.recalcFacturaEstatus_cor(connection, Number(row.id_factura_cor));
      }
      await connection.commit();
      return {
        ok: true,
        ppns,
        id_pago_cor: idPagoCor,
        relaciones_eliminadas,
        sincronizacion_fuente: 'El Pago puede reaparecer si Hoja SB vuelve a enviar el mismo id_pago.'
      };
    } catch (error) {
      try { await connection.rollback(); } catch (_rollbackError) {}
      throw error;
    }
  } finally {
    connection.release();
  }
}

module.exports = {
  actualizarFactura_cor,
  eliminarFactura_cor,
  actualizarPago_cor,
  eliminarPago_cor
};
