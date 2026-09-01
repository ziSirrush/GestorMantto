'use strict';

// [Aster | 2026-09-01 | ASTER-MG | ENDPOINT SYNC M2M LOGISTICA PRODUCCION V001]
// Importa las 2 hojas de staging de Logistica > Produccion.
// - Respeta EXACTAMENTE id_produccion e id_archivo preparados en Sheets.
// - Produccion es idempotente por id_produccion + legacy_source_key.
// - Archivos son idempotentes por id_archivo + (id_produccion,tipo_archivo,numero_archivo).
// - Procesamiento por bloques de 300, con SAVEPOINT por fila.

const db = require('../../config/db');

const BATCH_SIZE = 300;
const STATUS_CATALOG = Object.freeze({ area: 'Logistica', elemento: 'Estatus Produccion' });
const MODES = new Set(['SEMI_AUTOMATICO', 'MANUAL']);
const ORIGINS = new Set(['GESTOR', 'MIGRACION_SHEETS']);
const FILE_TYPES = new Set(['CPVO', 'GM']);
const FILE_ORIGINS = new Set(['NUEVO', 'LEGACY']);

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

function positiveInteger(value, field, required = false) {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (required) throw httpError(400, `${field} es obligatorio.`);
    return null;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw httpError(400, `${field} debe ser un entero positivo. Recibido: ${String(value).trim()}`);
  }
  return number;
}

function integerInRange(value, field, min, max, required = false) {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (required) throw httpError(400, `${field} es obligatorio.`);
    return null;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw httpError(400, `${field} debe estar entre ${min} y ${max}.`);
  }
  return number;
}

function activeValue(value) {
  if (value === undefined || value === null || String(value).trim() === '') return 1;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = String(value).trim().toLowerCase();
  return ['0', 'false', 'no', 'inactivo'].includes(text) ? 0 : 1;
}

function strictDate(value, field) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw httpError(400, `${field} debe venir como YYYY-MM-DD.`);
  }
  return text;
}

function strictDateTime(value, field) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(text)) {
    throw httpError(400, `${field} debe venir como YYYY-MM-DD o YYYY-MM-DD HH:mm[:ss].`);
  }
  return text.length === 10 ? `${text} 00:00:00` : text.replace('T', ' ');
}

function normalizeMode(value) {
  const mode = String(value || 'MANUAL').trim().toUpperCase();
  if (!MODES.has(mode)) throw httpError(400, `modo_registro inválido: ${mode}`);
  return mode;
}

function normalizeOrigin(value) {
  const origin = String(value || 'MIGRACION_SHEETS').trim().toUpperCase();
  if (!ORIGINS.has(origin)) throw httpError(400, `origen_registro inválido: ${origin}`);
  return origin;
}

function normalizeProduction(source) {
  const id = positiveInteger(source?.id_produccion, 'id_produccion', true);
  const legacyKey = cleanText(source?.legacy_source_key, 120);
  if (!legacyKey) throw httpError(400, 'legacy_source_key es obligatorio para sincronización idempotente.');

  return {
    id_produccion: id,
    id_log_ops: positiveInteger(source?.id_log_ops, 'id_log_ops'),
    modo_registro: normalizeMode(source?.modo_registro),
    ppns: cleanText(source?.ppns, 50),
    proyecto: cleanText(source?.proyecto, 255),
    id_cotizacion_venta: positiveInteger(source?.id_cotizacion_venta, 'id_cotizacion_venta'),
    id_asesor: positiveInteger(source?.id_asesor, 'id_asesor'),
    id_supervisor: positiveInteger(source?.id_supervisor, 'id_supervisor'),
    fecha_pvo: strictDate(source?.fecha_pvo, 'fecha_pvo'),
    fecha_pvo_fl: strictDate(source?.fecha_pvo_fl, 'fecha_pvo_fl'),
    fecha_cubos: strictDate(source?.fecha_cubos, 'fecha_cubos'),
    estatus_logistica: cleanText(source?.estatus_logistica, 100),
    id_estatus_produccion: positiveInteger(source?.id_estatus_produccion, 'id_estatus_produccion'),
    comentario: cleanText(source?.comentario),
    fecha_envio_docs_fabrica: strictDate(source?.fecha_envio_docs_fabrica, 'fecha_envio_docs_fabrica'),
    fecha_envio_pago_fabrica: strictDate(source?.fecha_envio_pago_fabrica, 'fecha_envio_pago_fabrica'),
    semana_registro: integerInRange(source?.semana_registro, 'semana_registro', 1, 53, true),
    anio_registro: integerInRange(source?.anio_registro, 'anio_registro', 2000, 2100, true),
    origen_registro: normalizeOrigin(source?.origen_registro),
    legacy_source_key: legacyKey,
    activo: activeValue(source?.activo),
    created_by: positiveInteger(source?.created_by, 'created_by'),
    updated_by: positiveInteger(source?.updated_by, 'updated_by'),
    created_at: strictDateTime(source?.created_at, 'created_at'),
    updated_at: strictDateTime(source?.updated_at, 'updated_at')
  };
}

function normalizeFile(source) {
  const idArchivo = positiveInteger(source?.id_archivo, 'id_archivo', true);
  const parentId = positiveInteger(source?.id_produccion, 'archivo.id_produccion', true);
  const type = String(source?.tipo_archivo || '').trim().toUpperCase();
  if (!FILE_TYPES.has(type)) throw httpError(400, `tipo_archivo inválido: ${type || '(vacío)'}`);

  const maxSlot = type === 'CPVO' ? 2 : 10;
  const slot = integerInRange(source?.numero_archivo, 'numero_archivo', 1, maxSlot, true);
  const fileName = cleanText(source?.nombre_archivo, 255);
  if (!fileName) throw httpError(400, 'nombre_archivo es obligatorio.');

  const fileOrigin = String(source?.origen_archivo || 'LEGACY').trim().toUpperCase();
  if (!FILE_ORIGINS.has(fileOrigin)) throw httpError(400, `origen_archivo inválido: ${fileOrigin}`);

  const size = source?.tamanio_bytes === undefined || source?.tamanio_bytes === null || String(source.tamanio_bytes).trim() === ''
    ? null
    : Number(source.tamanio_bytes);
  if (size !== null && (!Number.isInteger(size) || size < 0 || size > 26214400)) {
    throw httpError(400, 'tamanio_bytes debe ser un entero entre 0 y 26214400.');
  }

  return {
    id_archivo: idArchivo,
    id_produccion: parentId,
    tipo_archivo: type,
    numero_archivo: slot,
    nombre_archivo: fileName,
    nombre_original: cleanText(source?.nombre_original, 255),
    extension: cleanText(source?.extension, 20),
    mime_type: cleanText(source?.mime_type, 150),
    tamanio_bytes: size,
    storage_provider: cleanText(source?.storage_provider, 30) || 'LEGACY_REF',
    storage_container: cleanText(source?.storage_container, 150),
    storage_blob_name: cleanText(source?.storage_blob_name, 500),
    storage_url: cleanText(source?.storage_url),
    origen_archivo: fileOrigin,
    id_usuario: positiveInteger(source?.id_usuario, 'id_usuario'),
    activo: activeValue(source?.activo),
    eliminado_por: positiveInteger(source?.eliminado_por, 'eliminado_por'),
    eliminado_at: strictDateTime(source?.eliminado_at, 'eliminado_at'),
    created_at: strictDateTime(source?.created_at, 'archivo.created_at'),
    updated_at: strictDateTime(source?.updated_at, 'archivo.updated_at')
  };
}

function extractArrays(payload) {
  const production = Array.isArray(payload?.produccion)
    ? payload.produccion
    : (Array.isArray(payload?.registros) ? payload.registros : null);
  const files = Array.isArray(payload?.archivos) ? payload.archivos : [];
  if (!production) throw httpError(400, 'Se esperaba un arreglo en produccion o registros.');
  return { production, files };
}

async function validateStatusCatalog(connection, id) {
  if (!id) return;
  const [rows] = await connection.query(
    `SELECT id_catalogo
       FROM catalogo_general
      WHERE id_catalogo=? AND activo=1 AND area=? AND elemento=?
      LIMIT 1`,
    [id, STATUS_CATALOG.area, STATUS_CATALOG.elemento]
  );
  if (!rows.length) {
    throw httpError(400, `id_estatus_produccion ${id} no pertenece al catálogo activo Logistica / Estatus Produccion.`);
  }
}

async function findProductionIdentity(connection, record) {
  const [rows] = await connection.query(
    `SELECT id_produccion,legacy_source_key
       FROM logistica_produccion
      WHERE id_produccion=? OR legacy_source_key=?
      FOR UPDATE`,
    [record.id_produccion, record.legacy_source_key]
  );

  if (rows.length > 1) {
    throw httpError(409, `Conflicto: id_produccion ${record.id_produccion} y legacy_source_key pertenecen a registros distintos.`);
  }
  if (!rows.length) return null;

  const existing = rows[0];
  if (Number(existing.id_produccion) !== record.id_produccion) {
    throw httpError(409, `legacy_source_key ya existe con id_produccion ${existing.id_produccion}, no con ${record.id_produccion}.`);
  }
  if (cleanText(existing.legacy_source_key) !== record.legacy_source_key) {
    throw httpError(409, `id_produccion ${record.id_produccion} ya existe con otro legacy_source_key.`);
  }
  return existing;
}

async function insertProduction(connection, record) {
  await connection.query(
    `INSERT INTO logistica_produccion
      (id_produccion,id_log_ops,modo_registro,ppns,proyecto,id_cotizacion_venta,id_asesor,id_supervisor,
       fecha_pvo,fecha_pvo_fl,fecha_cubos,estatus_logistica,id_estatus_produccion,comentario,
       fecha_envio_docs_fabrica,fecha_envio_pago_fabrica,semana_registro,anio_registro,
       origen_registro,legacy_source_key,activo,created_by,updated_by,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),COALESCE(?,CURRENT_TIMESTAMP))`,
    [
      record.id_produccion,record.id_log_ops,record.modo_registro,record.ppns,record.proyecto,record.id_cotizacion_venta,
      record.id_asesor,record.id_supervisor,record.fecha_pvo,record.fecha_pvo_fl,record.fecha_cubos,
      record.estatus_logistica,record.id_estatus_produccion,record.comentario,
      record.fecha_envio_docs_fabrica,record.fecha_envio_pago_fabrica,record.semana_registro,record.anio_registro,
      record.origen_registro,record.legacy_source_key,record.activo,record.created_by,record.updated_by,
      record.created_at,record.updated_at
    ]
  );
}

async function updateProduction(connection, record) {
  await connection.query(
    `UPDATE logistica_produccion SET
       id_log_ops=?,modo_registro=?,ppns=?,proyecto=?,id_cotizacion_venta=?,id_asesor=?,id_supervisor=?,
       fecha_pvo=?,fecha_pvo_fl=?,fecha_cubos=?,estatus_logistica=?,id_estatus_produccion=?,comentario=?,
       fecha_envio_docs_fabrica=?,fecha_envio_pago_fabrica=?,semana_registro=?,anio_registro=?,
       origen_registro=?,legacy_source_key=?,activo=?,updated_by=?,updated_at=COALESCE(?,CURRENT_TIMESTAMP)
     WHERE id_produccion=?`,
    [
      record.id_log_ops,record.modo_registro,record.ppns,record.proyecto,record.id_cotizacion_venta,
      record.id_asesor,record.id_supervisor,record.fecha_pvo,record.fecha_pvo_fl,record.fecha_cubos,
      record.estatus_logistica,record.id_estatus_produccion,record.comentario,
      record.fecha_envio_docs_fabrica,record.fecha_envio_pago_fabrica,record.semana_registro,record.anio_registro,
      record.origen_registro,record.legacy_source_key,record.activo,record.updated_by,record.updated_at,
      record.id_produccion
    ]
  );
}

async function assertParentExists(connection, idProduccion) {
  const [rows] = await connection.query(
    'SELECT id_produccion FROM logistica_produccion WHERE id_produccion=? LIMIT 1',
    [idProduccion]
  );
  if (!rows.length) throw httpError(400, `No existe logistica_produccion.id_produccion=${idProduccion}.`);
}

async function findFileIdentity(connection, record) {
  const [rows] = await connection.query(
    `SELECT id_archivo,id_produccion,tipo_archivo,numero_archivo
       FROM logistica_produccion_archivos
      WHERE id_archivo=?
         OR (id_produccion=? AND tipo_archivo=? AND numero_archivo=?)
      FOR UPDATE`,
    [record.id_archivo,record.id_produccion,record.tipo_archivo,record.numero_archivo]
  );

  if (rows.length > 1) {
    throw httpError(409, `Conflicto de archivo: id_archivo ${record.id_archivo} y el slot apuntan a filas distintas.`);
  }
  if (!rows.length) return null;

  const existing = rows[0];
  if (Number(existing.id_archivo) !== record.id_archivo) {
    throw httpError(409, `El slot ${record.id_produccion}/${record.tipo_archivo}/${record.numero_archivo} ya usa id_archivo ${existing.id_archivo}.`);
  }
  if (
    Number(existing.id_produccion) !== record.id_produccion ||
    String(existing.tipo_archivo) !== record.tipo_archivo ||
    Number(existing.numero_archivo) !== record.numero_archivo
  ) {
    throw httpError(409, `id_archivo ${record.id_archivo} ya existe asociado a otro padre/tipo/slot.`);
  }
  return existing;
}

async function insertFile(connection, record) {
  await connection.query(
    `INSERT INTO logistica_produccion_archivos
      (id_archivo,id_produccion,tipo_archivo,numero_archivo,nombre_archivo,nombre_original,extension,mime_type,tamanio_bytes,
       storage_provider,storage_container,storage_blob_name,storage_url,origen_archivo,id_usuario,activo,
       eliminado_por,eliminado_at,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),COALESCE(?,CURRENT_TIMESTAMP))`,
    [
      record.id_archivo,record.id_produccion,record.tipo_archivo,record.numero_archivo,record.nombre_archivo,
      record.nombre_original,record.extension,record.mime_type,record.tamanio_bytes,record.storage_provider,
      record.storage_container,record.storage_blob_name,record.storage_url,record.origen_archivo,record.id_usuario,
      record.activo,record.eliminado_por,record.eliminado_at,record.created_at,record.updated_at
    ]
  );
}

async function updateFile(connection, record) {
  await connection.query(
    `UPDATE logistica_produccion_archivos SET
       id_produccion=?,tipo_archivo=?,numero_archivo=?,nombre_archivo=?,nombre_original=?,extension=?,mime_type=?,tamanio_bytes=?,
       storage_provider=?,storage_container=?,storage_blob_name=?,storage_url=?,origen_archivo=?,id_usuario=?,activo=?,
       eliminado_por=?,eliminado_at=?,updated_at=COALESCE(?,CURRENT_TIMESTAMP)
     WHERE id_archivo=?`,
    [
      record.id_produccion,record.tipo_archivo,record.numero_archivo,record.nombre_archivo,record.nombre_original,
      record.extension,record.mime_type,record.tamanio_bytes,record.storage_provider,record.storage_container,
      record.storage_blob_name,record.storage_url,record.origen_archivo,record.id_usuario,record.activo,
      record.eliminado_por,record.eliminado_at,record.updated_at,record.id_archivo
    ]
  );
}

async function sync(payload) {
  const arrays = extractArrays(payload || {});
  const productionErrors = [];
  const fileErrors = [];
  const normalizedProduction = [];
  const normalizedFiles = [];

  arrays.production.forEach((row, index) => {
    try { normalizedProduction.push({ ...normalizeProduction(row || {}), _fila: index + 2 }); }
    catch (error) { productionErrors.push({ tipo:'PRODUCCION', fila:index + 2, motivo:error.message }); }
  });

  arrays.files.forEach((row, index) => {
    try { normalizedFiles.push({ ...normalizeFile(row || {}), _fila: index + 2 }); }
    catch (error) { fileErrors.push({ tipo:'ARCHIVO', fila:index + 2, motivo:error.message }); }
  });

  let prodInserted = 0;
  let prodUpdated = 0;
  let fileInserted = 0;
  let fileUpdated = 0;
  let prodBatches = 0;
  let fileBatches = 0;

  for (let start = 0; start < normalizedProduction.length; start += BATCH_SIZE) {
    const batch = normalizedProduction.slice(start, start + BATCH_SIZE);
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      for (let position = 0; position < batch.length; position += 1) {
        const item = batch[position];
        const { _fila, ...record } = item;
        const savepoint = `log_prod_sync_p_${position}`;
        try {
          await connection.query(`SAVEPOINT ${savepoint}`);
          await validateStatusCatalog(connection, record.id_estatus_produccion);
          const existing = await findProductionIdentity(connection, record);
          if (existing) {
            await updateProduction(connection, record);
            prodUpdated += 1;
          } else {
            await insertProduction(connection, record);
            prodInserted += 1;
          }
          await connection.query(`RELEASE SAVEPOINT ${savepoint}`);
        } catch (rowError) {
          try { await connection.query(`ROLLBACK TO SAVEPOINT ${savepoint}`); } catch (_error) {}
          try { await connection.query(`RELEASE SAVEPOINT ${savepoint}`); } catch (_error) {}
          productionErrors.push({ tipo:'PRODUCCION', fila:_fila, id_produccion:record.id_produccion, motivo:rowError.message });
        }
      }
      await connection.commit();
      prodBatches += 1;
    } catch (error) {
      try { await connection.rollback(); } catch (_error) {}
      throw httpError(500, `Falló estructuralmente el bloque de Producción ${prodBatches + 1}: ${error.message}`);
    } finally {
      connection.release();
    }
  }

  for (let start = 0; start < normalizedFiles.length; start += BATCH_SIZE) {
    const batch = normalizedFiles.slice(start, start + BATCH_SIZE);
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      for (let position = 0; position < batch.length; position += 1) {
        const item = batch[position];
        const { _fila, ...record } = item;
        const savepoint = `log_prod_sync_f_${position}`;
        try {
          await connection.query(`SAVEPOINT ${savepoint}`);
          await assertParentExists(connection, record.id_produccion);
          const existing = await findFileIdentity(connection, record);
          if (existing) {
            await updateFile(connection, record);
            fileUpdated += 1;
          } else {
            await insertFile(connection, record);
            fileInserted += 1;
          }
          await connection.query(`RELEASE SAVEPOINT ${savepoint}`);
        } catch (rowError) {
          try { await connection.query(`ROLLBACK TO SAVEPOINT ${savepoint}`); } catch (_error) {}
          try { await connection.query(`RELEASE SAVEPOINT ${savepoint}`); } catch (_error) {}
          fileErrors.push({ tipo:'ARCHIVO', fila:_fila, id_archivo:record.id_archivo, id_produccion:record.id_produccion, motivo:rowError.message });
        }
      }
      await connection.commit();
      fileBatches += 1;
    } catch (error) {
      try { await connection.rollback(); } catch (_error) {}
      throw httpError(500, `Falló estructuralmente el bloque de Archivos ${fileBatches + 1}: ${error.message}`);
    } finally {
      connection.release();
    }
  }

  const errors = productionErrors.concat(fileErrors);
  const totalReceived = arrays.production.length + arrays.files.length;
  const totalValid = prodInserted + prodUpdated + fileInserted + fileUpdated;

  return {
    ok: true,
    parcial: errors.length > 0,
    source: 'aiven',
    endpoint: '/api/logistica/produccion/sync',
    total_recibidos: totalReceived,
    total_validos: totalValid,
    insertados: prodInserted + fileInserted,
    actualizados: prodUpdated + fileUpdated,
    rechazados: errors.length,
    bloques_procesados: prodBatches + fileBatches,
    tamano_bloque: BATCH_SIZE,
    produccion: {
      recibidos: arrays.production.length,
      insertados: prodInserted,
      actualizados: prodUpdated,
      rechazados: productionErrors.length,
      bloques: prodBatches
    },
    archivos: {
      recibidos: arrays.files.length,
      insertados: fileInserted,
      actualizados: fileUpdated,
      rechazados: fileErrors.length,
      bloques: fileBatches
    },
    errores: errors
  };
}

module.exports = { sync };
