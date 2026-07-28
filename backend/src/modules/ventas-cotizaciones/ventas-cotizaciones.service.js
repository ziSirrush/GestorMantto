const repository = require('./ventas-cotizaciones.repository');

const BATCH_SIZE = 300;
const MAX_RECORDS = 5000;

function badRequest(message, detalles) {
  const error = new Error(message);
  error.statusCode = 400;
  error.detalles = detalles;
  return error;
}

function cleanText(value, maxLength = null) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return maxLength ? text.slice(0, maxLength) : text;
}

function requiredText(value, maxLength) {
  return cleanText(value, maxLength) || '';
}

function positiveInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function nonNegativeInteger(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : fallback;
}

function activeValue(value) {
  if (value === undefined || value === null || value === '') return 1;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = String(value).trim().toLowerCase();
  return ['0', 'false', 'no', 'inactivo'].includes(text) ? 0 : 1;
}

function normalizeRecord(row, index) {
  const sourceId = positiveInteger(row?.id_cot ?? row?.id_cot_origen);
  if (!sourceId) {
    return {
      ok: false,
      error: {
        fila: index + 2,
        id_cot: row?.id_cot ?? null,
        motivo: 'id_cot es obligatorio y debe ser un entero positivo.'
      }
    };
  }

  const nombreProyecto = requiredText(row?.nombre_proyecto, 200);
  if (!nombreProyecto) {
    return {
      ok: false,
      error: {
        fila: index + 2,
        id_cot: sourceId,
        motivo: 'nombre_proyecto es obligatorio.'
      }
    };
  }

  return {
    ok: true,
    value: {
      id_cot_origen: sourceId,
      nombre_proyecto: nombreProyecto,
      cliente: requiredText(row?.cliente, 200),
      contacto: cleanText(row?.contacto, 150),
      telefono: cleanText(row?.telefono, 50),
      correo: cleanText(row?.correo, 150),
      ciudad: cleanText(row?.ciudad, 100),
      estado: cleanText(row?.estado, 100),
      tipo_proyecto: cleanText(row?.tipo_proyecto, 100),
      numero_equipos: nonNegativeInteger(row?.numero_equipos, 0),
      tipo_equipos: cleanText(row?.tipo_equipos, 100),
      informacion_envia: cleanText(row?.informacion_envia, 255),
      asesor: cleanText(row?.asesor, 20),
      id_asesor: positiveInteger(row?.id_asesor),
      visualiza: cleanText(row?.visualiza, 255),
      anio_mes_cotizacion: cleanText(row?.anio_mes_cotizacion, 20),
      mx: cleanText(row?.mx, 100),
      fecha_cotizacion: cleanText(row?.fecha_cotizacion, 50),
      fecha_solicitud: cleanText(row?.fecha_solicitud, 50),
      zona: cleanText(row?.zona, 100),
      estatus_proyecto: cleanText(row?.estatus_proyecto, 100),
      razon_perdido: cleanText(row?.razon_perdido, 255),
      admin: cleanText(row?.admin, 20),
      id_admin: positiveInteger(row?.id_admin),
      fecha_cambio_estatus: cleanText(row?.fecha_cambio_estatus, 50),
      fecha_cierre: cleanText(row?.fecha_cierre, 50),
      comentario: cleanText(row?.comentario),
      empresa_vs_perdido: cleanText(row?.empresa_vs_perdido, 200),
      id_equipo_vendido: cleanText(row?.id_equipo_vendido, 100),
      anio_actual: cleanText(row?.anio_actual, 20),
      activo: activeValue(row?.activo),
      created_by: positiveInteger(row?.created_by),
      updated_by: positiveInteger(row?.updated_by)
    }
  };
}

function extractRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.registros)) return payload.registros;
  if (Array.isArray(payload?.records)) return payload.records;
  return null;
}

function splitBatches(records) {
  const batches = [];
  for (let index = 0; index < records.length; index += BATCH_SIZE) {
    batches.push(records.slice(index, index + BATCH_SIZE));
  }
  return batches;
}

async function sync(payload) {
  const input = extractRecords(payload);

  if (!input) {
    throw badRequest('El cuerpo debe ser un arreglo o contener registros: [...].');
  }
  if (!input.length) throw badRequest('No se recibieron registros para sincronizar.');
  if (input.length > MAX_RECORDS) {
    throw badRequest(`La petición excede el máximo de ${MAX_RECORDS} registros.`);
  }

  const normalized = [];
  const rejected = [];
  const seen = new Set();

  input.forEach((row, index) => {
    const result = normalizeRecord(row, index);
    if (!result.ok) {
      rejected.push(result.error);
      return;
    }

    if (seen.has(result.value.id_cot_origen)) {
      rejected.push({
        fila: index + 2,
        id_cot: result.value.id_cot_origen,
        motivo: 'id_cot duplicado dentro de la misma petición.'
      });
      return;
    }

    seen.add(result.value.id_cot_origen);
    normalized.push(result.value);
  });

  const connection = await repository.getConnection();
  let inserted = 0;
  let updated = 0;
  let processedBatches = 0;

  try {
    const sourceIds = normalized.map((row) => row.id_cot_origen);
    const existingIds = await repository.findExistingSourceIds(connection, sourceIds);

    const requestedUserIds = [...new Set(
      normalized
        .flatMap((row) => [row.id_asesor, row.id_admin, row.created_by, row.updated_by])
        .filter(Boolean)
    )];
    const existingUserIds = await repository.findExistingUserIds(connection, requestedUserIds);

    const valid = [];
    for (const row of normalized) {
      const missingUsers = [
        ['id_asesor', row.id_asesor],
        ['id_admin', row.id_admin],
        ['created_by', row.created_by],
        ['updated_by', row.updated_by]
      ].filter(([, id]) => id && !existingUserIds.has(id));

      if (missingUsers.length) {
        rejected.push({
          id_cot: row.id_cot_origen,
          motivo: `IDs de usuario inexistentes: ${missingUsers
            .map(([field, id]) => `${field}=${id}`)
            .join(', ')}.`
        });
        continue;
      }

      valid.push(row);
    }

    for (const batch of splitBatches(valid)) {
      await connection.beginTransaction();
      try {
        await repository.upsertMany(connection, batch);
        await connection.commit();
        processedBatches += 1;

        for (const row of batch) {
          if (existingIds.has(row.id_cot_origen)) updated += 1;
          else inserted += 1;
        }
      } catch (error) {
        await connection.rollback();
        error.message = `Falló el bloque ${processedBatches + 1}: ${error.message}`;
        throw error;
      }
    }
  } finally {
    connection.release();
  }

  return {
    ok: true,
    source: 'aiven',
    total_recibidos: input.length,
    total_validos: inserted + updated,
    insertados: inserted,
    actualizados: updated,
    rechazados: rejected.length,
    bloques_procesados: processedBatches,
    tamano_bloque: BATCH_SIZE,
    errores: rejected
  };
}

module.exports = { sync };
