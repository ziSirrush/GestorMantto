'use strict';

// Capa interna: no montar rutas hasta validar el permiso granular y el corte Aiven.
const { normalizarPago_cor, contramovimiento_cor, saldoFactura_cor } = require('./cobranza-cor-pagos-manuales.domain');

const FLAG = 'BLT_COBRANZA_COR_PAGOS_MANUALES_V1';
const FACT = 'cobranza_facturas_cor';
const REL = 'cobranza_rel_pagos';
const fields = ['id_factura_cor', 'importe_aplicado', 'fecha_pago', 'estatus_pago', 'moneda', 'tipo_cambio', 'importe_mxn', 'id_rel_pago_origen', 'origen_registro', 'created_by', 'updated_by'];
function fail(message, statusCode = 409) {
  throw Object.assign(new Error(message), { statusCode, code: 'COBRANZA_COR_PAGO_MANUAL' });
}
function id(value) {
  const n = Number(value);
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(n)) fail('Identificador invalido.', 400);
  return n;
}
function key(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
}
function facturaKey(row) {
  const tipo = key(row.tipo_concepto);
  const concepto = tipo === 'HITO' ? row.id_fuente_cor : row.id_aditiva_cor;
  const folio = key(row.factura).replace(/[\s_-]*MXN$/, '').trim();
  return folio ? JSON.stringify([tipo, concepto == null ? null : String(concepto), folio]) : `ID:${row.id_factura_cor}`;
}
function scope(context) {
  if (String(context?.dominio || context?.empresa || '').toUpperCase() !== 'CORELLIAN') fail('Alcance no autorizado.', 403);
  if (context.requiere_filtro_usuario === false) return null;
  if (context.requiere_filtro_usuario !== true || !Array.isArray(context.usuarios_visibles)) fail('Alcance no resuelto.', 403);
  return [...new Set(context.usuarios_visibles.map(Number).filter(n => Number.isSafeInteger(n) && n > 0))];
}
function blocked(row) {
  return row.id_rel_pago_origen != null || row.origen_registro !== 'MANUAL' || !['Parcial', 'Pagado'].includes(row.estatus_pago);
}

function createService_cor({ repository, authorizeMutation, enabled = () => process.env[FLAG] === '1' }) {
  // authorizeMutation debe usar el guard granular efectivo, nunca datos del formulario.
  async function mutate({ ppns, facturaId, pagoId, actor, informationAccess, payload = {} }, action) {
    if (!enabled()) fail('Pagos manuales no habilitados.', 503);
    if (typeof authorizeMutation !== 'function' || await authorizeMutation({ actor, informationAccess }) !== true) fail('Edicion no autorizada.', 403);
    const actorId = id(actor);
    if (Number(informationAccess?.actor_user_id) !== actorId) fail('Actor no autorizado.', 403);
    const visible = scope(informationAccess);
    const projectId = String(ppns ?? '').trim();
    if (!projectId || projectId.length > 100) fail('PPNS invalido.', 400);
    const connection = await repository.getConnection_cor();
    try {
      await connection.beginTransaction();
      try {
        const project = await repository.getEstadoCuentaByPpns_cor(connection, projectId, visible);
        if (!project?.ppns) fail('Estado de Cuenta no encontrado.', 404);
        // Bloquear primero las facturas del proyecto, en orden estable; el mismo orden
        // debe respetarse al integrar las futuras operaciones de factura y pago.
        const [facturas] = await connection.query(`SELECT id_factura_cor, ppns, tipo_concepto, id_fuente_cor, id_aditiva_cor, factura, moneda, total, pagado, estatus_factura, estatus_factura_origen FROM ${FACT} WHERE activo = 1 AND UPPER(TRIM(ppns)) = UPPER(TRIM(?)) ORDER BY id_factura_cor FOR UPDATE`, [project.ppns]);
        const factura = facturas.find(row => Number(row.id_factura_cor) === id(facturaId));
        if (!factura) fail('Factura no encontrada en el proyecto.', 404);
        if (facturas.filter(row => facturaKey(row) === facturaKey(factura)).length !== 1) fail('Factura historica duplicada; requiere conciliacion previa.');
        if ([factura.estatus_factura, factura.estatus_factura_origen].some(value => /^(CANCEL|ANUL)/.test(key(value)))) fail('Factura cancelada.');
        const [rows] = await connection.query(`SELECT id_rel_pago, id_factura_cor, id_pago_cor, importe_aplicado, DATE_FORMAT(fecha_pago, '%Y-%m-%d') AS fecha_pago, estatus_pago, moneda, tipo_cambio, importe_mxn, id_rel_pago_origen, origen_registro FROM ${REL} WHERE id_factura_cor = ? ORDER BY id_rel_pago FOR UPDATE`, [factura.id_factura_cor]);
        if (rows.some(row => row.moneda !== factura.moneda)) fail('Moneda historica no conciliada.');
        const before = saldoFactura_cor(factura.total, rows);
        if (saldoFactura_cor(factura.total, [{ importe_aplicado: factura.pagado || '0', estatus_pago: 'Pagado' }].filter(row => Number(row.importe_aplicado) !== 0)).pagado !== before.pagado) fail('Importe historico no conciliado; no se modifica la factura.');
        let next = rows.slice();
        let resultId;
        if (action === 'crear') {
          if (before.estatus_factura === 'Pagado') fail('Factura ya liquidada.');
          const record = { ...normalizarPago_cor(payload, factura.moneda), id_factura_cor: factura.id_factura_cor, id_rel_pago_origen: null, origen_registro: 'MANUAL', created_by: actorId, updated_by: actorId };
          next.push(record);
          resultId = await insert(connection, record);
        } else {
          const original = rows.find(row => Number(row.id_rel_pago) === id(pagoId));
          if (!original) fail('Pago no encontrado en esta factura.', 404);
          if (blocked(original) || rows.some(row => Number(row.id_rel_pago_origen) === Number(original.id_rel_pago))) fail('Pago historico o revertido; operacion bloqueada.');
          if (action === 'editar') {
            const record = normalizarPago_cor(payload, factura.moneda);
            next = rows.map(row => row === original ? { ...row, ...record } : row);
            await connection.query(`UPDATE ${REL} SET importe_aplicado=?, fecha_pago=?, estatus_pago=?, tipo_cambio=?, importe_mxn=?, updated_by=? WHERE id_rel_pago=? AND id_factura_cor=?`, [record.importe_aplicado, record.fecha_pago, record.estatus_pago, record.tipo_cambio, record.importe_mxn, actorId, original.id_rel_pago, factura.id_factura_cor]);
            resultId = original.id_rel_pago;
          } else if (action === 'revertir') {
            const record = { ...contramovimiento_cor(original, payload.estatus_pago, actorId), origen_registro: 'MANUAL' };
            next.push(record);
            resultId = await insert(connection, record);
          } else fail('Accion invalida.', 400);
        }
        const after = saldoFactura_cor(factura.total, next);
        await connection.query(`UPDATE ${FACT} SET pagado=?, estatus_factura=?, updated_by=? WHERE id_factura_cor=? AND activo=1`, [after.pagado, after.estatus_factura, actorId, factura.id_factura_cor]);
        await connection.commit();
        return { ok: true, id_rel_pago: resultId, id_factura_cor: factura.id_factura_cor, ...after };
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    } finally {
      connection.release();
    }
  }
  return { crear: input => mutate(input, 'crear'), editar: input => mutate(input, 'editar'), revertir: input => mutate(input, 'revertir') };
}
async function insert(connection, record) {
  const [result] = await connection.query(`INSERT INTO ${REL} (id_pago_cor, ${fields.join(', ')}) VALUES (NULL, ${fields.map(() => '?').join(', ')})`, fields.map(field => record[field] ?? null));
  return result.insertId;
}

module.exports = { createService_cor, FLAG };
