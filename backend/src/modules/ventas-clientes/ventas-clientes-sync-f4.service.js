// [Aster | 2026-08-30 | ASTER-MG | FASE 4 DASHBOARD VENTAS: sync Clientes idempotente]
'use strict';

const repository = require('./ventas-clientes.repository');

const BATCH_SIZE = 300;

function httpError(statusCode, message, detalles) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.detalles = detalles;
  return error;
}

function cleanText(value, maxLength = null) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return maxLength ? text.slice(0, maxLength) : text;
}

function activeValue(value) {
  if (value === undefined || value === null || value === '') return 1;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = String(value).trim().toLowerCase();
  return ['0', 'false', 'no', 'inactivo'].includes(text) ? 0 : 1;
}

function positiveInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizePayload(source) {
  const aliases = {
    nombre_empresa: ['nombre_empresa', 'Nombre de la Empresa'],
    razon_social: ['razon_social', 'Razon Social', 'Razón Social'],
    ciudad: ['ciudad', 'Ciudad'],
    estado: ['estado', 'Estado'],
    ubicacion: ['ubicacion', 'Ubicacion', 'Ubicación'],
    nombre_contacto: ['nombre_contacto', 'Nombre del Contacto'],
    puesto_contacto: ['puesto_contacto', 'Puesto del Contacto', 'Puesto Contacto'],
    email: ['email', 'Email', 'correo'],
    telefono: ['telefono', 'Telefono', 'Teléfono'],
    tipo_cliente: ['tipo_cliente', 'Tipo de Cliente'],
    estatus_cliente: ['estatus_cliente', 'Estatus con Cliente'],
    proyecto_vendido: ['proyecto_vendido', 'Proyecto Vendido'],
    iniciales: ['iniciales', 'Iniciales'],
    visualiza: ['visualiza', 'Visualiza'],
    comentarios: ['comentarios', 'Comentarios'],
    activo: ['activo']
  };

  function read(field) {
    for (const alias of aliases[field]) {
      if (Object.prototype.hasOwnProperty.call(source, alias)) return source[alias];
    }
    return undefined;
  }

  const normalized = {};
  const textFields = {
    nombre_empresa: 200,
    razon_social: 250,
    ciudad: 120,
    estado: 120,
    ubicacion: 500,
    nombre_contacto: 200,
    puesto_contacto: 150,
    email: 200,
    telefono: 80,
    tipo_cliente: 100,
    estatus_cliente: 100,
    proyecto_vendido: 500,
    iniciales: 30,
    visualiza: 255,
    comentarios: null
  };

  for (const [field, maxLength] of Object.entries(textFields)) {
    normalized[field] = cleanText(read(field), maxLength);
  }

  if (normalized.estatus_cliente) normalized.estatus_cliente = normalized.estatus_cliente.toUpperCase();
  normalized.activo = activeValue(read('activo'));

  if (!normalized.nombre_empresa) {
    throw httpError(400, 'nombre_empresa es obligatorio.');
  }

  normalized.created_by = positiveInteger(source?.created_by);
  normalized.updated_by = positiveInteger(source?.updated_by);
  return normalized;
}

function extractRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.registros)) return payload.registros;
  if (Array.isArray(payload?.records)) return payload.records;
  return null;
}

function changesForExisting(record) {
  const changes = { ...record };
  // Una resincronización no debe sustituir la autoría original del registro canónico.
  delete changes.created_by;
  // Si el origen no trae actor de actualización, se conserva el existente.
  if (!changes.updated_by) delete changes.updated_by;
  return changes;
}

async function sync(payload) {
  const records = extractRecords(payload);
  if (!records) throw httpError(400, 'Se esperaba un arreglo en registros o records.');
  if (!records.length) {
    return {
      ok: true,
      source: 'aiven',
      total_recibidos: 0,
      total_validos: 0,
      insertados: 0,
      actualizados: 0,
      rechazados: 0,
      bloques_procesados: 0,
      tamano_bloque: BATCH_SIZE,
      errores: []
    };
  }

  const valid = [];
  const errors = [];
  records.forEach((row, index) => {
    try {
      valid.push({ ...normalizePayload(row || {}), _fila: index + 2 });
    } catch (error) {
      errors.push({ fila: index + 2, motivo: error.message });
    }
  });

  let inserted = 0;
  let updated = 0;
  let processedBatches = 0;

  for (let start = 0; start < valid.length; start += BATCH_SIZE) {
    const batch = valid.slice(start, start + BATCH_SIZE);
    const connection = await repository.getConnection();

    try {
      await connection.beginTransaction();

      for (let position = 0; position < batch.length; position += 1) {
        const item = batch[position];
        const { _fila, ...record } = item;
        const savepoint = `ventas_clientes_f4_${position}`;

        try {
          await connection.query(`SAVEPOINT ${savepoint}`);

          // Reutiliza la identidad de negocio ya existente en el repositorio:
          // empresa + contacto + email + teléfono normalizados.
          const existing = await repository.findByIdentity(connection, record);
          if (existing?.id_cliente) {
            await repository.update(connection, Number(existing.id_cliente), changesForExisting(record));
            updated += 1;
          } else {
            await repository.insert(connection, record);
            inserted += 1;
          }

          await connection.query(`RELEASE SAVEPOINT ${savepoint}`);
        } catch (rowError) {
          try { await connection.query(`ROLLBACK TO SAVEPOINT ${savepoint}`); } catch (_rollbackError) {}
          try { await connection.query(`RELEASE SAVEPOINT ${savepoint}`); } catch (_releaseError) {}
          errors.push({ fila: _fila, motivo: rowError.message });
        }
      }

      await connection.commit();
      processedBatches += 1;
    } catch (error) {
      try { await connection.rollback(); } catch (_rollbackError) {}
      throw httpError(500, `Falló estructuralmente el bloque ${processedBatches + 1}: ${error.message}`);
    } finally {
      connection.release();
    }
  }

  return {
    ok: true,
    parcial: errors.length > 0,
    source: 'aiven',
    total_recibidos: records.length,
    total_validos: inserted + updated,
    insertados: inserted,
    actualizados: updated,
    rechazados: errors.length,
    bloques_procesados: processedBatches,
    tamano_bloque: BATCH_SIZE,
    errores: errors
  };
}

module.exports = { sync };
