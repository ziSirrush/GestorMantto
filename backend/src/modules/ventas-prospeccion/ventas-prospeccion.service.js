const path = require('path');
const mime = require('mime-types');
const repository = require('./ventas-prospeccion.repository');

const BATCH_SIZE = 300;

function httpError(statusCode, message, detalles) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.detalles = detalles;
  return error;
}

function readRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.registros)) return payload.registros;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function cleanText(value, maxLength = null) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return maxLength ? text.slice(0, maxLength) : text;
}

function requiredPositiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw httpError(400, `${field} debe ser un entero positivo.`);
  }
  return number;
}

function parseIsoDate(value, field) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw httpError(400, `${field} no contiene una fecha válida.`, { valor: text });
  }
  return date;
}

function parseLocation(value) {
  const text = cleanText(value, 150);
  if (!text) return { ubicacion: null, latitud: null, longitud: null };

  const parts = text.split(',').map((part) => part.trim());
  if (parts.length < 2) return { ubicacion: text, latitud: null, longitud: null };

  const latitud = Number(parts[0]);
  const longitud = Number(parts[1]);
  if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) {
    return { ubicacion: text, latitud: null, longitud: null };
  }
  if (latitud < -90 || latitud > 90 || longitud < -180 || longitud > 180) {
    return { ubicacion: text, latitud: null, longitud: null };
  }

  return { ubicacion: text, latitud, longitud };
}

function buildFile(urlValue, idPros, label, order = 1) {
  const storageUrl = cleanText(urlValue);
  if (!storageUrl) return null;

  let fileName = `prospeccion_${idPros}_${label}`;
  let extension = null;

  try {
    const parsed = new URL(storageUrl);
    const candidate = decodeURIComponent(path.basename(parsed.pathname || ''));
    if (candidate) fileName = candidate.slice(0, 255);
  } catch (_error) {
    // Se conserva el nombre generado; la URL se validará como texto no vacío.
  }

  extension = path.extname(fileName).replace('.', '').toLowerCase() || null;
  const mimeType = extension ? mime.lookup(extension) || null : null;
  const image = Boolean(mimeType && String(mimeType).startsWith('image/'));

  return {
    nombre_archivo: fileName,
    nombre_original: fileName,
    mime_type: mimeType,
    extension,
    storage_url: storageUrl,
    orden: order,
    es_imagen: image ? 1 : 0
  };
}

function normalizeProspection(source) {
  const idPros = requiredPositiveInteger(source.id_pros, 'id_pros');
  const idUsuario = requiredPositiveInteger(source.id_usuario, 'id_usuario');
  const location = parseLocation(source.ubicacion);

  const files = [
    buildFile(source.foto_1, idPros, 'foto_1', 1),
    buildFile(source.foto_2, idPros, 'foto_2', 2),
    buildFile(source.foto_3, idPros, 'foto_3', 3),
    buildFile(source.foto_4, idPros, 'foto_4', 4)
  ].filter(Boolean);

  return {
    id_pros: idPros,
    empresa: cleanText(source.empresa, 255),
    proyecto: cleanText(source.proyecto, 255),
    ...location,
    contacto: cleanText(source.contacto, 255),
    correo: cleanText(source.correo, 255),
    telefono: cleanText(source.telefono, 100),
    comentario: cleanText(source.comenario ?? source.comentario),
    id_usuario: idUsuario,
    ciudad: cleanText(source.ciudad, 150),
    estado: cleanText(source.estado, 150),
    tipo_proyecto: cleanText(source.tipo_proyecto, 150),
    fecha_visita: parseIsoDate(source.fecha_visita, 'fecha_visita'),
    estatus: cleanText(source.estatus, 150),
    fecha_cam_estatus: parseIsoDate(source.fecha_cam_estatus, 'fecha_cam_estatus'),
    files
  };
}

function normalizeComment(source) {
  const idComment = requiredPositiveInteger(source.id_com_pors, 'id_com_pors');
  const idPros = requiredPositiveInteger(source.id_pros, 'id_pros');
  const idUsuario = requiredPositiveInteger(source.id_usuario, 'id_usuario');
  const comentario = cleanText(source.comentario);
  if (!comentario) throw httpError(400, 'comentario es obligatorio.');

  const fechaHora = parseIsoDate(source.fecha_hora, 'fecha_hora');
  const file = buildFile(source.adjunto, idPros, `comentario_${idComment}`, 1);

  return {
    id_com_pors: idComment,
    id_pros: idPros,
    id_usuario: idUsuario,
    comentario,
    fecha_hora: fechaHora,
    file
  };
}

async function resolveStatusIds(connection, records) {
  const cache = new Map();
  for (const record of records) {
    if (!record.estatus) {
      record.id_estatus = null;
      continue;
    }
    const key = record.estatus.trim().toUpperCase();
    if (!cache.has(key)) {
      cache.set(key, await repository.findStatusIdByName(connection, record.estatus));
    }
    record.id_estatus = cache.get(key);
  }
}

async function syncProspections(payload) {
  const rawRecords = readRecords(payload);
  if (!rawRecords.length) {
    throw httpError(400, 'No se recibieron registros de prospección. Usa un arreglo o { registros: [...] }.');
  }

  const result = {
    ok: true,
    source: 'aiven',
    received: rawRecords.length,
    processed: 0,
    rejected: 0,
    batch_size: BATCH_SIZE,
    errors: []
  };

  for (let offset = 0; offset < rawRecords.length; offset += BATCH_SIZE) {
    const batch = rawRecords.slice(offset, offset + BATCH_SIZE);
    const connection = await repository.getConnection();

    try {
      const normalized = [];
      for (let index = 0; index < batch.length; index += 1) {
        try {
          normalized.push({ record: normalizeProspection(batch[index]), row: offset + index + 1 });
        } catch (error) {
          result.rejected += 1;
          if (result.errors.length < 100) {
            result.errors.push({ row: offset + index + 1, message: error.message, details: error.detalles });
          }
        }
      }

      await connection.beginTransaction();

      const userIds = normalized.map((item) => item.record.id_usuario);
      const existingUsers = await repository.findExistingUserIds(connection, userIds);
      await resolveStatusIds(connection, normalized.map((item) => item.record));

      for (const item of normalized) {
        const { record, row } = item;
        if (!existingUsers.has(record.id_usuario)) {
          result.rejected += 1;
          if (result.errors.length < 100) {
            result.errors.push({ row, message: `El id_usuario ${record.id_usuario} no existe en usuarios.id_SB.` });
          }
          continue;
        }

        await repository.upsertProspection(connection, record);
        await repository.replaceVisitFiles(connection, record.id_pros, record.files);
        result.processed += 1;
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  result.ok = result.rejected === 0;
  result.message = result.ok
    ? 'Prospecciones cargadas correctamente.'
    : 'La carga terminó con registros rechazados.';
  return result;
}

async function syncComments(payload) {
  const rawRecords = readRecords(payload);
  if (!rawRecords.length) {
    throw httpError(400, 'No se recibieron comentarios. Usa un arreglo o { registros: [...] }.');
  }

  const result = {
    ok: true,
    source: 'aiven',
    received: rawRecords.length,
    processed: 0,
    rejected: 0,
    batch_size: BATCH_SIZE,
    errors: []
  };

  for (let offset = 0; offset < rawRecords.length; offset += BATCH_SIZE) {
    const batch = rawRecords.slice(offset, offset + BATCH_SIZE);
    const connection = await repository.getConnection();

    try {
      const normalized = [];
      for (let index = 0; index < batch.length; index += 1) {
        try {
          normalized.push({ record: normalizeComment(batch[index]), row: offset + index + 1 });
        } catch (error) {
          result.rejected += 1;
          if (result.errors.length < 100) {
            result.errors.push({ row: offset + index + 1, message: error.message, details: error.detalles });
          }
        }
      }

      await connection.beginTransaction();

      const existingUsers = await repository.findExistingUserIds(
        connection,
        normalized.map((item) => item.record.id_usuario)
      );
      const existingProspections = await repository.findExistingProspectionIds(
        connection,
        normalized.map((item) => item.record.id_pros)
      );

      for (const item of normalized) {
        const { record, row } = item;
        if (!existingUsers.has(record.id_usuario)) {
          result.rejected += 1;
          if (result.errors.length < 100) {
            result.errors.push({ row, message: `El id_usuario ${record.id_usuario} no existe en usuarios.id_SB.` });
          }
          continue;
        }
        if (!existingProspections.has(record.id_pros)) {
          result.rejected += 1;
          if (result.errors.length < 100) {
            result.errors.push({ row, message: `La prospección ${record.id_pros} no existe. Carga primero la hoja principal.` });
          }
          continue;
        }

        await repository.upsertComment(connection, record);
        await repository.replaceCommentFile(connection, record);
        result.processed += 1;
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  result.ok = result.rejected === 0;
  result.message = result.ok
    ? 'Comentarios de prospección cargados correctamente.'
    : 'La carga terminó con registros rechazados.';
  return result;
}

module.exports = {
  syncProspections,
  syncComments
};
