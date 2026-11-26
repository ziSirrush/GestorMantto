'use strict';

// Reglas de pagos manuales COR. No consulta BD ni activa el flujo nuevo.
// Los importes se mantienen en la moneda de la factura y en centavos exactos.
const CURRENCIES = new Set(['MXN', 'USD', 'EUR']);
const PAYMENT_STATUSES = new Set(['Parcial', 'Pagado']);
const REVERSAL_STATUSES = new Set(['Cancelado', 'Devuelto']);

function error_cor(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode, code: 'COBRANZA_COR_PAGO_MANUAL_INVALIDO' });
}

function decimalUnits_cor(value, scale, label, signed = false) {
  const raw = String(value ?? '').trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match || (!signed && match[1]) || (match[3] || '').length > scale) {
    throw error_cor(`${label} debe ser decimal con maximo ${scale} decimales.`);
  }
  const whole = match[2].replace(/^0+(?=\d)/, '');
  if (whole.length > 18 - scale) throw error_cor(`${label} fuera de rango.`);
  const units = BigInt(whole + (match[3] || '').padEnd(scale, '0'));
  return match[1] ? -units : units;
}

function decimalText_cor(units, scale = 2) {
  const negative = units < 0n;
  const digits = String(negative ? -units : units).padStart(scale + 1, '0');
  const result = `${negative ? '-' : ''}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  decimalUnits_cor(result, scale, 'Importe', true);
  return result;
}

function date_cor(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw error_cor('Fecha de pago invalida.');
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw || raw < '1000-01-01') {
    throw error_cor('Fecha de pago invalida.');
  }
  return raw;
}

function fechaOperativa_cor(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  return date_cor(`${parts.year}-${parts.month}-${parts.day}`);
}

function id_cor(value, label) {
  const raw = String(value ?? '');
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw error_cor(`${label} invalido.`);
  return Number(raw);
}

function moneda_cor(value) {
  const currency = String(value ?? '').trim().toUpperCase();
  if (!CURRENCIES.has(currency)) throw error_cor('Moneda de factura no reconocida.');
  return currency;
}

function normalizarPago_cor(payload, monedaFactura) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw error_cor('Pago invalido.');
  const moneda = moneda_cor(monedaFactura);
  const importe = decimalUnits_cor(payload.importe_aplicado, 2, 'Valor');
  if (importe <= 0n) throw error_cor('Valor debe ser mayor a cero.');
  const estatus = payload.estatus_pago;
  if (!PAYMENT_STATUSES.has(estatus)) throw error_cor('Solo Parcial o Pagado se permiten en captura y edicion.');
  const hasTdc = payload.tipo_cambio != null && String(payload.tipo_cambio).trim() !== '';
  if (hasTdc && moneda !== 'USD') throw error_cor('TDC solo se admite para factura USD pagada en MXN.');
  const tdc = hasTdc ? decimalUnits_cor(payload.tipo_cambio, 6, 'TDC') : null;
  if (tdc !== null && tdc <= 0n) throw error_cor('TDC debe ser mayor a cero.');
  // Valor siempre representa USD en factura USD; TDC conserva el equivalente MXN.
  // Redondeo comercial al centavo, sin alterar el saldo en USD.
  const equivalente = tdc === null ? null : decimalText_cor((importe * tdc + 500000n) / 1000000n);
  return {
    importe_aplicado: decimalText_cor(importe),
    fecha_pago: date_cor(payload.fecha_pago),
    estatus_pago: estatus,
    moneda,
    tipo_cambio: tdc === null ? null : decimalText_cor(tdc, 6),
    importe_mxn: equivalente
  };
}

function contramovimiento_cor(original, estatus, actor, { now = new Date(), yaRevertido = false } = {}) {
  if (!REVERSAL_STATUSES.has(estatus)) throw error_cor('Seleccione Cancelado o Devuelto.');
  if (!original || original.id_rel_pago_origen != null || yaRevertido || REVERSAL_STATUSES.has(original.estatus_pago)) {
    throw error_cor('El movimiento no puede revertirse nuevamente.', 409);
  }
  const pago = normalizarPago_cor(original, original.moneda);
  const invert = (value) => decimalText_cor(-decimalUnits_cor(value, 2, 'Importe'));
  return {
    ...pago,
    id_factura_cor: id_cor(original.id_factura_cor, 'Factura'),
    id_rel_pago_origen: id_cor(original.id_rel_pago, 'Pago original'),
    importe_aplicado: invert(pago.importe_aplicado),
    importe_mxn: pago.importe_mxn === null ? null : invert(pago.importe_mxn),
    fecha_pago: fechaOperativa_cor(now),
    estatus_pago: estatus,
    created_by: id_cor(actor, 'Usuario'),
    updated_by: id_cor(actor, 'Usuario')
  };
}

function saldoFactura_cor(total, movimientos) {
  const facturado = decimalUnits_cor(total, 2, 'Total factura');
  if (!Array.isArray(movimientos)) throw error_cor('Movimientos invalidos.');
  let neto = 0n;
  for (const movimiento of movimientos) {
    const importe = decimalUnits_cor(movimiento.importe_aplicado, 2, 'Importe aplicado', true);
    const reversible = REVERSAL_STATUSES.has(movimiento.estatus_pago);
    if (importe === 0n || (reversible ? importe > 0n : importe < 0n) || (!reversible && !PAYMENT_STATUSES.has(movimiento.estatus_pago))) {
      throw error_cor('Importe y estatus de movimiento incompatibles.');
    }
    neto += importe;
  }
  if (neto < 0n) throw error_cor('El neto de pagos no puede ser negativo.', 409);
  return {
    pagado: decimalText_cor(neto),
    saldo_pendiente: decimalText_cor(facturado > neto ? facturado - neto : 0n),
    saldo_a_favor: decimalText_cor(neto > facturado ? neto - facturado : 0n),
    estatus_factura: neto > 0n && facturado > 0n && neto >= facturado ? 'Pagado' : neto > 0n ? 'Parcial' : 'No pagado'
  };
}

module.exports = { normalizarPago_cor, contramovimiento_cor, saldoFactura_cor, fechaOperativa_cor };
