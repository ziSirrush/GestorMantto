'use strict';

const path = require('path');
const mime = require('mime-types');
const repository = require('./ventas-redes-sync.repository');

const BATCH_SIZE = 300;
const MAX_ERRORS = 100;
const AZURE_PROVIDER = 'AZURE_BLOB';
const LEGACY_PROVIDER = 'GLIDE';

const CATALOG_PATHS = Object.freeze({
  id_contacto_via: Object.freeze({ area: 'Ventas', elemento: 'Tipo Contacto' }),
  id_estado: Object.freeze({ area: 'General', elemento: 'Estado' }),
  id_solicitud: Object.freeze({ area: 'Ventas', elemento: 'Soli Red' }),
  id_estatus: Object.freeze({ area: 'Ventas', elemento: 'Estatus Pros' })
});

function httpError(statusCode, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.status = statusCode;
  if (details !== undefined) error.details = details;
  return error;
}

function assertOneTimeBackupPayload(payload) {
  const origin = cleanText(payload?.origen, 100, 'origen');
  if (origin !== 'GLIDE_BACKUP_SHEETS' || payload?.carga_unica !== true) {
    throw httpError(400, 'Ruta exclusiva para la carga historica unica desde GLIDE_BACKUP_SHEETS.');
  }
}

function readRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.registros)) return payload.registros;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function cleanText(value, maxLength = null, field = 'texto') {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (maxLength && text.length > maxLength) {
    throw httpError(400, `${field} excede el maximo de ${maxLength} caracteres.`);
  }
  return text;
}

function requiredPositiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw httpError(400, `${field} debe ser un entero positivo.`);
  }
  return number;
}

function optionalPositiveInteger(value, field) {
  const text = cleanText(value, null, field);
  if (!text) return null;
  return requiredPositiveInteger(text, field);
}

function optionalCatalogReference(value, field) {
  const text = cleanText(value, 255, field);
  if (!text) return null;

  const number = Number(text);
  if (Number.isInteger(number) && number > 0) return number;
  return text;
}

function optionalHistoricalReference(value, field) {
  const text = cleanText(value, 255, field);
  if (!text) return null;

  const number = Number(text);
  if (Number.isInteger(number) && number > 0) return number;
  return text;
}

function parseIsoDate(value, field) {
  const text = cleanText(value, null, field);
  if (!text) return null;

  const utcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
  if (!utcPattern.test(text)) {
    throw httpError(400, `${field} debe usar formato ISO UTC, por ejemplo 2025-06-21T22:04:00.152Z.`);
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw httpError(400, `${field} no contiene una fecha valida.`, { value: text });
  }
  return date;
}

function normalizeEmail(value) {
  const email = cleanText(value, 190, 'email');
  return email ? email.toLowerCase() : null;
}

function normalizeLegacyUrl(value, field) {
  const url = cleanText(value, null, field);
  if (!url) return null;
  if (url.length > 1000) {
    throw httpError(400, `${field} excede el maximo de 1000 caracteres.`);
  }
  if (!/^https:\/\/storage\.googleapis\.com\//i.test(url)) {
    throw httpError(400, `${field} debe ser una URL HTTPS de storage.googleapis.com.`);
  }
  return url;
}

function buildLegacyFile(urlValue, fallbackName, field) {
  const storageUrl = normalizeLegacyUrl(urlValue, field);
  if (!storageUrl) return null;

  let fileName = fallbackName;
  try {
    const parsed = new URL(storageUrl);
    const candidate = decodeURIComponent(path.basename(parsed.pathname || ''));
    if (candidate) fileName = candidate;
  } catch (_error) {
    // The URL format was already validated; keep the generated fallback name.
  }

  fileName = String(fileName || fallbackName).slice(0, 255);
  const extension = path.extname(fileName).replace('.', '').toLowerCase().slice(0, 20) || null;
  const mimeType = mime.lookup(fileName) || null;

  return {
    nombre_archivo: fileName,
    nombre_original: fileName,
    extension,
    mime_type: mimeType,
    storage_provider: LEGACY_PROVIDER,
    storage_url: storageUrl
  };
}

function sourceRow(source, fallback) {
  const value = Number(source?.fila_origen);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeRed(source) {
  const idRedes = requiredPositiveInteger(source.id_redes, 'id_redes');
  const createdBy = optionalPositiveInteger(source.created_by, 'created_by');
  const assignedTo = optionalPositiveInteger(source.id_usuario_asignado, 'id_usuario_asignado');

  return {
    id_redes: idRedes,
    nombre_contacto: cleanText(source.nombre_contacto, 180, 'nombre_contacto'),
    id_contacto_via: optionalCatalogReference(source.id_contacto_via, 'id_contacto_via'),
    email: normalizeEmail(source.email),
    telefono: cleanText(source.telefono, 30, 'telefono'),
    id_estado: optionalCatalogReference(source.id_estado, 'id_estado'),
    nombre_empresa: cleanText(source.nombre_empresa, 200, 'nombre_empresa'),
    ciudad: cleanText(source.ciudad, 150, 'ciudad'),
    nombre_proyecto: cleanText(source.nombre_proyecto, 220, 'nombre_proyecto'),
    informacion_enviada: cleanText(source.informacion_enviada, null, 'informacion_enviada'),
    id_solicitud: optionalCatalogReference(source.id_solicitud, 'id_solicitud'),
    id_usuario_asignado: assignedTo,
    created_by: createdBy,
    id_estatus: optionalCatalogReference(source.id_estatus, 'id_estatus'),
    fecha_cambio_estatus: parseIsoDate(source.fecha_cambio_estatus, 'fecha_cambio_estatus'),
    id_cotizacion: optionalHistoricalReference(source.id_cotizacion, 'id_cotizacion'),
    evidence: [
      {
        order: 1,
        file: buildLegacyFile(source.imagen_1_url, `redes_${idRedes}_imagen_1`, 'imagen_1_url')
      },
      {
        order: 2,
        file: buildLegacyFile(source.imagen_2_url, `redes_${idRedes}_imagen_2`, 'imagen_2_url')
      }
    ],
    evidence_user_id: createdBy || assignedTo || null
  };
}

function normalizeComment(source) {
  const idComentario = requiredPositiveInteger(source.id_comentario, 'id_comentario');
  const idRedes = requiredPositiveInteger(source.id_redes, 'id_redes');
  const idUsuario = optionalPositiveInteger(source.id_usuario, 'id_usuario');
  const fechaHora = parseIsoDate(source.fecha_hora, 'fecha_hora');

  return {
    id_comentario: idComentario,
    id_redes: idRedes,
    id_usuario: idUsuario,
    comentario: cleanText(source.comentario, null, 'comentario'),
    fecha_hora: fechaHora,
    attachment: buildLegacyFile(
      source.archivo_adjunto_url,
      `redes_comentario_${idComentario}`,
      'archivo_adjunto_url'
    )
  };
}

function pushError(result, row, message, details) {
  result.rejected += 1;
  if (result.errors.length < MAX_ERRORS) {
    const item = { row, message };
    if (details !== undefined) item.details = details;
    result.errors.push(item);
  }
}


function normalizeLookupText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function buildCatalogReferences(rows) {
  const byId = new Map();
  const byPathAndArticle = new Map();

  for (const row of rows || []) {
    const id = Number(row.id_catalogo);
    if (!Number.isInteger(id) || id <= 0) continue;

    byId.set(id, row);
    const key = [
      normalizeLookupText(row.area),
      normalizeLookupText(row.elemento),
      normalizeLookupText(row.articulo)
    ].join('|');

    if (!byPathAndArticle.has(key)) byPathAndArticle.set(key, []);
    byPathAndArticle.get(key).push(row);
  }

  return { byId, byPathAndArticle };
}

function pushWarning(result, row, field, value, message) {
  result.warnings_count += 1;
  if (result.warnings.length < MAX_ERRORS) {
    result.warnings.push({ row, field, value, message });
  }
}

function resolveCatalogReference(record, field, references, result, row) {
  const value = record[field];
  if (value === null) return;

  const expected = CATALOG_PATHS[field];
  if (Number.isInteger(value)) {
    const catalogRow = references.byId.get(value);
    if (
      catalogRow &&
      String(catalogRow.area || '') === expected.area &&
      String(catalogRow.elemento || '') === expected.elemento
    ) {
      return;
    }

    pushWarning(
      result,
      row,
      field,
      value,
      `${field} no pudo normalizarse en catalogo_general\\${expected.area}\\${expected.elemento}\\; se guardara NULL y se conservara el valor original.`
    );
    record[field] = null;
    return;
  }

  const key = [
    normalizeLookupText(expected.area),
    normalizeLookupText(expected.elemento),
    normalizeLookupText(value)
  ].join('|');
  const matches = references.byPathAndArticle.get(key) || [];

  if (matches.length === 1) {
    record[field] = Number(matches[0].id_catalogo);
    return;
  }

  pushWarning(
    result,
    row,
    field,
    value,
    matches.length > 1
      ? `${field} tiene multiples coincidencias; se guardara NULL y se conservara el valor original.`
      : `${field} no existe en catalogo_general\\${expected.area}\\${expected.elemento}\\; se guardara NULL y se conservara el valor original.`
  );
  record[field] = null;
}

function buildQuotationReferences(rows) {
  const byId = new Map();
  const byOriginId = new Map();
  const byText = new Map();

  function addText(value, row) {
    const key = normalizeLookupText(value);
    if (!key) return;
    if (!byText.has(key)) byText.set(key, []);
    byText.get(key).push(row);
  }

  for (const row of rows || []) {
    const id = Number(row.id_cotizacion);
    if (Number.isInteger(id) && id > 0) byId.set(id, row);

    const originId = Number(row.id_cot_origen);
    if (Number.isInteger(originId) && originId > 0) byOriginId.set(originId, row);

    addText(row.nombre_proyecto, row);
    addText(row.visualiza, row);
    addText(row.cliente, row);
  }

  return { byId, byOriginId, byText };
}

function resolveQuotationReference(record, references, result, row) {
  const value = record.id_cotizacion;
  if (value === null) return;

  if (Number.isInteger(value)) {
    const direct = references.byId.get(value);
    if (direct) {
      record.id_cotizacion = Number(direct.id_cotizacion);
      return;
    }

    const byOrigin = references.byOriginId.get(value);
    if (byOrigin) {
      record.id_cotizacion = Number(byOrigin.id_cotizacion);
      return;
    }
  } else {
    const matches = references.byText.get(normalizeLookupText(value)) || [];
    if (matches.length === 1) {
      record.id_cotizacion = Number(matches[0].id_cotizacion);
      return;
    }
  }

  pushWarning(
    result,
    row,
    'id_cotizacion',
    value,
    'La referencia historica de cotizacion no pudo resolverse de forma unica; se guardara NULL.'
  );
  record.id_cotizacion = null;
}

function normalizeRedRelations(record, references, result, row) {
  for (const field of Object.keys(CATALOG_PATHS)) {
    resolveCatalogReference(record, field, references.catalogs, result, row);
  }

  for (const field of ['id_usuario_asignado', 'created_by']) {
    const id = record[field];
    if (id !== null && !references.users.has(id)) {
      pushWarning(
        result,
        row,
        field,
        id,
        `${field} no existe en usuarios.id_SB; se guardara NULL.`
      );
      record[field] = null;
    }
  }

  resolveQuotationReference(record, references.quotations, result, row);
}

function baseResult(rawRecords, payload, actionContext) {
  const executedBy = Number(actionContext?.user?.id_SB || actionContext?.user?.id || 0) || null;
  return {
    ok: true,
    source: 'aiven',
    origen: cleanText(payload?.origen, 100, 'origen') || null,
    hoja: cleanText(payload?.hoja, 100, 'hoja') || null,
    executed_by: executedBy,
    received: rawRecords.length,
    processed: 0,
    rejected: 0,
    inserted: 0,
    updated: 0,
    batch_size: BATCH_SIZE,
    errors: [],
    warnings_count: 0,
    warnings: []
  };
}

async function syncEvidence(connection, record, result) {
  for (const item of record.evidence) {
    const existing = await repository.findEvidenceByOrderForUpdate(
      connection,
      record.id_redes,
      item.order
    );

    const existingProvider = String(existing?.storage_provider || LEGACY_PROVIDER).trim().toUpperCase();
    if (existing && existingProvider === AZURE_PROVIDER) {
      result.azure_evidence_preserved += 1;
      continue;
    }

    if (!item.file) {
      result.evidence_removed += await repository.deleteLegacyEvidenceByOrder(
        connection,
        record.id_redes,
        item.order
      );
      continue;
    }

    await repository.upsertLegacyEvidence(connection, {
      ...item.file,
      id_redes: record.id_redes,
      orden_archivo: item.order,
      descripcion: item.order === 1 ? 'Imagen 1' : 'Imagen 2',
      id_usuario: record.evidence_user_id
    });
    result.evidence_imported += 1;
  }
}

async function syncRecords(payload, actionContext = {}) {
  assertOneTimeBackupPayload(payload);
  const rawRecords = readRecords(payload);
  if (!rawRecords.length) {
    throw httpError(400, 'No se recibieron registros de Redes. Usa { registros: [...] }.');
  }

  const result = {
    ...baseResult(rawRecords, payload, actionContext),
    evidence_imported: 0,
    evidence_removed: 0,
    azure_evidence_preserved: 0
  };

  for (let offset = 0; offset < rawRecords.length; offset += BATCH_SIZE) {
    const batch = rawRecords.slice(offset, offset + BATCH_SIZE);
    const connection = await repository.getConnection();

    try {
      const normalized = [];
      for (let index = 0; index < batch.length; index += 1) {
        const row = sourceRow(batch[index], offset + index + 2);
        try {
          normalized.push({ row, record: normalizeRed(batch[index]) });
        } catch (error) {
          pushError(result, row, error.message, error.details);
        }
      }

      await connection.beginTransaction();

      const records = normalized.map((item) => item.record);
      const userIds = records.flatMap((record) => [record.id_usuario_asignado, record.created_by]);
      const references = {
        catalogs: buildCatalogReferences(await repository.findCatalogsForImport(connection)),
        users: await repository.findUsersByIds(connection, userIds),
        quotations: buildQuotationReferences(
          await repository.findActiveQuotationReferences(connection)
        )
      };

      const knownRedIds = await repository.findExistingRedIds(
        connection,
        records.map((record) => record.id_redes)
      );

      for (const item of normalized) {
        normalizeRedRelations(item.record, references, result, item.row);

        const existed = knownRedIds.has(item.record.id_redes);
        item.record.updated_by = result.executed_by;
        await repository.upsertRed(connection, item.record);
        await syncEvidence(connection, item.record, result);

        result.processed += 1;
        if (existed) result.updated += 1;
        else result.inserted += 1;
        knownRedIds.add(item.record.id_redes);
      }

      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch (_rollbackError) {}
      throw error;
    } finally {
      connection.release();
    }
  }

  result.ok = result.rejected === 0;
  result.message = result.ok
    ? (result.warnings_count > 0
      ? 'Registros de Redes cargados; algunas relaciones historicas no pudieron resolverse y se guardaron como NULL.'
      : 'Registros de Redes cargados correctamente.')
    : 'La carga de Redes termino con registros rechazados.';
  return result;
}

async function syncCommentAttachment(connection, record, result) {
  const existing = await repository.listCommentAttachmentsForUpdate(
    connection,
    record.id_comentario
  );
  const hasAzure = existing.some((file) => (
    String(file.storage_provider || '').trim().toUpperCase() === AZURE_PROVIDER
  ));

  result.attachments_removed += await repository.deleteLegacyCommentAttachments(
    connection,
    record.id_comentario
  );

  if (!record.attachment) return;
  if (hasAzure) {
    result.azure_attachments_preserved += 1;
    return;
  }

  await repository.insertLegacyCommentAttachment(connection, {
    ...record.attachment,
    id_comentario: record.id_comentario,
    id_usuario: record.id_usuario,
    fecha_hora: record.fecha_hora
  });
  result.attachments_imported += 1;
}

async function syncComments(payload, actionContext = {}) {
  assertOneTimeBackupPayload(payload);
  const rawRecords = readRecords(payload);
  if (!rawRecords.length) {
    throw httpError(400, 'No se recibieron comentarios de Redes. Usa { registros: [...] }.');
  }

  const result = {
    ...baseResult(rawRecords, payload, actionContext),
    attachments_imported: 0,
    attachments_removed: 0,
    azure_attachments_preserved: 0
  };

  for (let offset = 0; offset < rawRecords.length; offset += BATCH_SIZE) {
    const batch = rawRecords.slice(offset, offset + BATCH_SIZE);
    const connection = await repository.getConnection();

    try {
      const normalized = [];
      for (let index = 0; index < batch.length; index += 1) {
        const row = sourceRow(batch[index], offset + index + 2);
        try {
          normalized.push({ row, record: normalizeComment(batch[index]) });
        } catch (error) {
          pushError(result, row, error.message, error.details);
        }
      }

      await connection.beginTransaction();

      const records = normalized.map((item) => item.record);
      const users = await repository.findUsersByIds(
        connection,
        records.map((record) => record.id_usuario)
      );
      const redIds = await repository.findExistingRedIds(
        connection,
        records.map((record) => record.id_redes)
      );
      const knownCommentIds = await repository.findExistingCommentIds(
        connection,
        records.map((record) => record.id_comentario)
      );

      for (const item of normalized) {
        const { record } = item;
        const relationErrors = [];
        if (!redIds.has(record.id_redes)) {
          relationErrors.push(`id_redes=${record.id_redes} no existe. Carga primero la Hoja 7.`);
        }
        if (record.id_usuario !== null && !users.has(record.id_usuario)) {
          relationErrors.push(`id_usuario=${record.id_usuario} no existe en usuarios.id_SB.`);
        }

        if (relationErrors.length) {
          pushError(result, item.row, 'El comentario contiene relaciones invalidas.', relationErrors);
          continue;
        }

        const existed = knownCommentIds.has(record.id_comentario);
        if (existed) await repository.updateComment(connection, record);
        else await repository.insertComment(connection, record);

        await syncCommentAttachment(connection, record, result);

        result.processed += 1;
        if (existed) result.updated += 1;
        else result.inserted += 1;
        knownCommentIds.add(record.id_comentario);
      }

      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch (_rollbackError) {}
      throw error;
    } finally {
      connection.release();
    }
  }

  result.ok = result.rejected === 0;
  result.message = result.ok
    ? 'Comentarios de Redes cargados correctamente.'
    : 'La carga de comentarios de Redes termino con registros rechazados.';
  return result;
}

module.exports = {
  BATCH_SIZE,
  CATALOG_PATHS,
  normalizeRed,
  normalizeComment,
  syncRecords,
  syncComments
};
