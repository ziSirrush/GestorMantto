'use strict';

// El Estado de Cuenta se publica sin activacion de Azure. Solo la escritura
// y la lectura de columnas nuevas esperan la migracion SQL de Aiven.
// El permiso granular se registra/asigna en la matriz existente, nunca en el JWT.
const { createService_cor, FLAG } = require('./cobranza-cor-pagos-manuales.service');
const repository = require('./cobranza-cor.repository');
const { hasEffectivePermission } = require('../../services/permissions/effective-permission.service');

// Flag anterior reservado al modulo general Pagos, fuera del alcance de esta fase.
function enabled_cor() { return process.env[FLAG] === '1'; }
function permissionCode_cor() { return 'COBRANZA_ESTADOS_CUENTA_ACCESO_VISUAL_MODULO.EDITAR'; }
async function estadoCuentaReady_cor() {
  const connection = await repository.getConnection_cor();
  try { return await repository.pagosManualesSchemaReady_cor(connection); }
  finally { connection.release(); }
}
async function canEdit_cor({ actor, informationAccess, connection }) {
  const code = permissionCode_cor();
  const uid = Number(actor);
  if (!Number.isSafeInteger(uid) || uid <= 0) return false;
  if (String(informationAccess?.dominio || informationAccess?.empresa || '').toUpperCase() !== 'CORELLIAN'
      || Number(informationAccess.actor_user_id) !== uid
      || Number(informationAccess.effective_user_id) !== uid
      || informationAccess.acceso_puerta !== true) return false;
  return hasEffectivePermission(uid, code, connection);
}
function guardActor_cor(req) {
  if (req.viewerContext?.active) return null;
  return req.actorUser?.id_SB;
}
function jsonError_cor(error, res, next) {
  const status = Number(error?.statusCode || error?.status);
  if (status >= 400 && status < 600) {
    return res.status(status).json({ ok: false, code: error.code || 'COBRANZA_COR_PAGOS_MANUALES', message: error.message });
  }
  return next(error);
}
async function requireEditIfEnabled_cor(req, res, next) {
  try {
    if (!await estadoCuentaReady_cor()) return next();
    if (!await canEdit_cor({ actor: guardActor_cor(req), informationAccess: req.informationAccess })) {
      return res.status(403).json({ ok: false, code: 'COBRANZA_COR_EDICION_REQUERIDA', message: 'Edicion de Estado de Cuenta no autorizada.' });
    }
    return next();
  } catch (error) { return next(error); }
}
function rejectLegacyIfEnabled_cor(req, res, next) {
  if (!enabled_cor()) return next();
  return res.status(409).json({ ok: false, code: 'COBRANZA_COR_FLUJO_MANUAL', message: 'Esta operacion de Pagos NS ya no esta disponible. Actualice la aplicacion.' });
}
async function rejectLegacyEstadoCuentaIfReady_cor(req, res, next) {
  try {
    if (!await estadoCuentaReady_cor()) return next();
    return res.status(409).json({ ok:false, code:'COBRANZA_COR_FLUJO_MANUAL', message:'Esta operacion de Estado de Cuenta ya fue sustituida por pagos manuales.' });
  } catch (error) { return next(error); }
}
const service = createService_cor({ repository, authorizeMutation: canEdit_cor, enabled: estadoCuentaReady_cor });
function handler_cor(action) {
  return async (req, res, next) => {
    try {
      const data = await service[action]({
        ppns: req.params.ppns, facturaId: req.params.idFacturaCor,
        pagoId: req.params.idRelPago, actor: guardActor_cor(req),
        informationAccess: req.informationAccess, payload: req.body || {}
      });
      return res.status(action === 'crear' ? 201 : 200).json(data);
    } catch (error) { return jsonError_cor(error, res, next); }
  };
}
async function listMovements_cor(connection, ppns) {
  const [rows] = await connection.query(
    `SELECT r.id_rel_pago, r.id_factura_cor, r.importe_aplicado,
            DATE_FORMAT(r.fecha_pago, '%Y-%m-%d') AS fecha_pago,
            r.estatus_pago, r.moneda, r.tipo_cambio, r.importe_mxn,
            r.id_rel_pago_origen, r.origen_registro, f.factura
       FROM cobranza_rel_pagos r
       JOIN cobranza_facturas_cor f ON f.id_factura_cor = r.id_factura_cor
      WHERE f.activo = 1 AND UPPER(TRIM(f.ppns)) = UPPER(TRIM(?))
      ORDER BY r.fecha_pago, r.id_rel_pago`, [ppns]
  );
  const reversed = new Set(rows.filter(r => r.id_rel_pago_origen != null).map(r => String(r.id_rel_pago_origen)));
  return rows.map(row => ({
    ...row,
    bloqueado: row.origen_registro !== 'MANUAL' || row.id_rel_pago_origen != null
      || reversed.has(String(row.id_rel_pago)) || !['Parcial','Pagado'].includes(row.estatus_pago)
  }));
}
function dateReferences_cor(movements) {
  const reversed = new Set(movements.filter(r => r.id_rel_pago_origen != null).map(r => String(r.id_rel_pago_origen)));
  const active = movements.filter(r => r.id_rel_pago_origen == null
    && !reversed.has(String(r.id_rel_pago)) && Number(r.importe_aplicado) > 0);
  return {
    payments: active.map(row => ({ id_pago_cor: row.id_rel_pago, no_factura: null, fecha_pago: row.fecha_pago })),
    relations: active.map(row => ({ id_pago_cor: row.id_rel_pago, id_factura_cor: row.id_factura_cor, importe_aplicado: row.importe_aplicado }))
  };
}
function invoiceFields_cor(serialized, raw) {
  const status = [raw?.estatus_factura, raw?.estatus_factura_origen].map(v => String(v || '').trim().toUpperCase());
  const cancelled = status.some(v => /^(CANCEL|ANUL)/.test(v));
  const total = Number(serialized.total), paid = Number(serialized.importe_pagado);
  const credit = serialized.aplicado_a_condicion || serialized.total == null || total <= 0
    ? 0 : Math.max(0, Math.round((paid - total) * 100) / 100);
  return {
    ...serialized, saldo_a_favor: credit,
    puede_recibir_pago: !cancelled && serialized.total != null
      && total > 0 && serialized.duplicados_consolidados === 0
      && ['MXN','USD','EUR'].includes(serialized.moneda)
      && !['Pagado','Aplicado a Anticipo'].includes(serialized.estatus_factura)
  };
}
// Consulta independiente; BG pendiente de verificar contrato de identidad, moneda y monto.
async function conciliacion_cor(req, res, next) {
  if (!enabled_cor()) return res.json({ ok: true, habilitado: false });
  const scope = req.informationAccess;
  if (scope?.acceso_dominio_completo !== true || String(scope.dominio || scope.empresa || '').toUpperCase() !== 'CORELLIAN') {
    return res.status(403).json({ ok:false, message:'La conciliacion requiere alcance completo de CORELLIAN.' });
  }
  let connection, transaction = false;
  try {
    connection = await repository.getConnection_cor();
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    transaction = true;
    const projects = await repository.listEstadosCuenta_cor(connection, {}, null);
    const norm = value => String(value ?? '').trim().toUpperCase();
    const catalog = new Map(projects.filter(p => norm(p.ppns)).map(p => [norm(p.ppns), p]));
    const [rows] = await connection.query(
      'SELECT id_factura_cor, ppns, tipo_concepto, id_fuente_cor, id_aditiva_cor, factura, moneda, total, pagado, origen_registro, estatus_factura FROM cobranza_facturas_cor WHERE activo=1 ORDER BY ppns, id_factura_cor'
    );
    const invoices = new Map();
    for (const row of rows) {
      const ppns = norm(row.ppns);
      if (!catalog.has(ppns)) continue;
      if (!invoices.has(ppns)) invoices.set(ppns, []);
      invoices.get(ppns).push(row);
    }
    const { buildFacturaGroups_cor } = require('./cobranza-cor.service');
    const data = [];
    for (const [ppns, facturas] of invoices) {
      const byCurrency = new Map();
      for (const group of buildFacturaGroups_cor(facturas, [])) {
        const currency = norm(group.row.moneda) || 'SIN_MONEDA';
        const cents = Math.round(group.applied * 100);
        if (!Number.isSafeInteger(cents)) throw Error('Importe de conciliacion fuera de rango.');
        const bucket = byCurrency.get(currency) || { cents:0, facturas:0, duplicados:0 };
        bucket.cents += cents;
        if (!Number.isSafeInteger(bucket.cents)) throw Error('Importe acumulado fuera de rango.');
        bucket.facturas++;
        bucket.duplicados += group.duplicates;
        byCurrency.set(currency, bucket);
      }
      for (const [moneda, bucket] of byCurrency) {
        const p = catalog.get(ppns);
        data.push({ ppns:p.ppns, proyecto:p.proyecto, cliente:p.cliente, moneda,
          aplicado:(bucket.cents/100).toFixed(2), facturas:bucket.facturas,
          duplicados_consolidados:bucket.duplicados, total_bg:null, diferencia:null });
      }
    }
    await connection.commit(); transaction = false;
    return res.json({ ok:true, habilitado:true, bg_disponible:false, estado_bg:'PENDIENTE_CONTRATO_BG', data });
  } catch (error) { return jsonError_cor(error, res, next); }
  finally {
    if (connection) {
      try { if (transaction) await connection.rollback(); }
      finally { connection.release(); }
    }
  }
}
module.exports = { conciliacion_cor, enabled_cor, canEdit_cor, permissionCode_cor, requireEditIfEnabled_cor,
  rejectLegacyIfEnabled_cor, rejectLegacyEstadoCuentaIfReady_cor, estadoCuentaReady_cor, handler_cor, listMovements_cor, dateReferences_cor, invoiceFields_cor };
