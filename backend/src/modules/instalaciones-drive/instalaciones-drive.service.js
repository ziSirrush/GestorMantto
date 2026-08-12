// [Aster | 2026-08-12 | ASTER-MG | PATCH: FASE_4_BACKEND_FLEXIBLE_REGISTRO_V001]
const repository = require('./instalaciones-drive.repository');
const logger = require('../../shared/logger');

const MAX_REGISTROS_POR_SOLICITUD = 300;

function createValidationError(message, detalles) {
  const error = new Error(message);
  error.statusCode = 400;
  error.detalles = detalles;
  return error;
}

function cleanText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeActive(value) {
  if (value === undefined || value === null || value === '') return 1;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value === 0 ? 0 : 1;

  const text = String(value).trim().toLowerCase();
  if (['0', 'false', 'no', 'inactivo'].includes(text)) return 0;
  return 1;
}

function normalizeDateTime(value) {
  const text = cleanText(value);
  if (!text) return null;

  const mysqlDateTime = text.match(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/);
  if (mysqlDateTime) return text.replace('T', ' ');

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeRow(row, index) {
  const nombreCarpeta = cleanText(row?.nombre_carpeta);
  const carpetaId = cleanText(row?.carpeta_id);
  const enlace = cleanText(row?.enlace);

  const faltantes = [];
  if (!nombreCarpeta) faltantes.push('nombre_carpeta');
  if (!carpetaId) faltantes.push('carpeta_id');
  if (!enlace) faltantes.push('enlace');

  if (faltantes.length) {
    return {
      ok: false,
      error: {
        index,
        carpeta_id: carpetaId || null,
        message: `Faltan campos obligatorios: ${faltantes.join(', ')}`
      }
    };
  }

  return {
    ok: true,
    value: {
      _index: index,
      nombre_carpeta: nombreCarpeta,
      carpeta_id: carpetaId,
      enlace,
      activo: normalizeActive(row?.activo),
      fecha_sincronizacion: normalizeDateTime(row?.fecha_sincronizacion)
    }
  };
}

async function syncCarpetas(body) {
  const registros = Array.isArray(body.registros) ? body.registros : [];
  const bloque = Number(body.bloque || 1);
  const totalBloques = Number(body.total_bloques || 1);

  if (!registros.length) {
    throw createValidationError('No se recibieron registros para sincronizar.');
  }

  if (registros.length > MAX_REGISTROS_POR_SOLICITUD) {
    throw createValidationError(
      `El bloque supera el máximo permitido de ${MAX_REGISTROS_POR_SOLICITUD} registros.`,
      { recibidos: registros.length }
    );
  }

  const validos = [];
  const erroresValidacion = [];
  const idsBloque = new Set();

  registros.forEach((row, index) => {
    const normalized = normalizeRow(row, index);

    if (!normalized.ok) {
      erroresValidacion.push(normalized.error);
      return;
    }

    if (idsBloque.has(normalized.value.carpeta_id)) {
      erroresValidacion.push({
        index,
        carpeta_id: normalized.value.carpeta_id,
        message: 'carpeta_id duplicado dentro del mismo bloque.'
      });
      return;
    }

    idsBloque.add(normalized.value.carpeta_id);
    validos.push(normalized.value);
  });

  logger.info('Inicio sincronización de carpetas de Instalaciones.', {
    bloque,
    total_bloques: totalBloques,
    recibidos: registros.length,
    validos: validos.length,
    rechazados: erroresValidacion.length
  });

  const resultadoDb = await repository.syncCarpetas(validos);
  const detallesErrores = [
    ...erroresValidacion,
    ...(resultadoDb.detalles_errores || [])
  ];

  const resultado = {
    ok: true,
    parcial: detallesErrores.length > 0,
    message: detallesErrores.length
      ? 'Bloque de carpetas procesado con registros rechazados.'
      : 'Bloque de carpetas procesado correctamente.',
    bloque,
    total_bloques: totalBloques,
    recibidos: registros.length,
    procesados: resultadoDb.insertados + resultadoDb.actualizados + resultadoDb.sin_cambios,
    insertados: resultadoDb.insertados,
    actualizados: resultadoDb.actualizados,
    sin_cambios: resultadoDb.sin_cambios,
    errores: detallesErrores.length,
    detalles_errores: detallesErrores
  };

  logger.info('Fin sincronización de carpetas de Instalaciones.', resultado);

  return resultado;
}

module.exports = {
  syncCarpetas
};
