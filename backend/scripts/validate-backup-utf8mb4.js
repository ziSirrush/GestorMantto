'use strict';

const fs = require('fs');
const path = require('path');

const EXPECTED_CRITICAL_ICONS = Object.freeze({
  PERSONA_ATRAPADA: '🚨',
  FALLA_EQUIPO_CRITICO: '🆘',
  NUEVO_EQUIPO_CRITICO: '💥',
  PERSONA_ATRAPADA_EQUIPO_CRITICO: '🚨🆘',
  PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO: '🚨💥'
});

function findNotificationEventsInsert(text) {
  const marker = 'INSERT INTO `notificacion_eventos` VALUES ';
  const start = text.indexOf(marker);
  if (start < 0) return '';
  const endMarker = '\n/*!40000 ALTER TABLE `notificacion_eventos` ENABLE KEYS */;';
  const end = text.indexOf(endMarker, start);
  return end < 0 ? text.slice(start) : text.slice(start, end);
}

function validateDumpText(text) {
  const source = String(text || '');
  const errors = [];
  const warnings = [];

  if (!source.startsWith('-- MySQL dump')) {
    errors.push('El archivo no inicia con un encabezado de mysqldump reconocido.');
  }

  const header = source.slice(0, 20000);
  if (!/SET NAMES utf8mb4\b/i.test(header)) {
    errors.push('El dump no declara SET NAMES utf8mb4 en el encabezado.');
  }
  if (/SET NAMES utf8\s*\*\//i.test(header) && !/SET NAMES utf8mb4\b/i.test(header)) {
    errors.push('El dump declara SET NAMES utf8/utf8mb3 en lugar de utf8mb4.');
  }

  if (!/-- Dump completed on \d{4}-\d{2}-\d{2}/.test(source.slice(-5000))) {
    errors.push('No se encontro la marca final "Dump completed"; el respaldo puede estar incompleto.');
  }

  const createStart = source.indexOf('CREATE TABLE `notificacion_eventos`');
  if (createStart < 0) {
    errors.push('No se encontro la tabla notificacion_eventos en el dump.');
  } else {
    const createEnd = source.indexOf(';', createStart);
    const createBlock = source.slice(createStart, createEnd >= 0 ? createEnd + 1 : createStart + 10000);
    if (!/DEFAULT CHARSET=utf8mb4\b/i.test(createBlock)) {
      errors.push('notificacion_eventos no esta declarada con DEFAULT CHARSET=utf8mb4.');
    }
  }

  const eventInsert = findNotificationEventsInsert(source);
  if (!eventInsert) {
    errors.push('No se encontro el INSERT de datos de notificacion_eventos.');
  } else {
    for (const [code, icon] of Object.entries(EXPECTED_CRITICAL_ICONS)) {
      const eventPos = eventInsert.indexOf(`'${code}'`);
      if (eventPos < 0) {
        errors.push(`No se encontro el evento critico ${code} en el respaldo.`);
        continue;
      }
      const nextTuple = eventInsert.indexOf('),(', eventPos);
      const row = eventInsert.slice(eventPos, nextTuple < 0 ? eventInsert.length : nextTuple + 1);
      if (!row.includes(icon)) {
        errors.push(`El evento ${code} no conserva su icono esperado ${icon}.`);
      }
    }
  }

  for (const icon of new Set(Object.values(EXPECTED_CRITICAL_ICONS).flatMap((value) => [...value]))) {
    if (!source.includes(icon)) {
      warnings.push(`No se encontro el caracter ${icon} en el dump completo.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
}

function validateDumpFile(filePath) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    return {
      ok: false,
      errors: [`No existe el archivo: ${absolute}`],
      warnings: [],
      file: absolute,
      bytes: 0
    };
  }

  const stat = fs.statSync(absolute);
  if (!stat.isFile() || stat.size <= 0) {
    return {
      ok: false,
      errors: [`El respaldo esta vacio o no es un archivo regular: ${absolute}`],
      warnings: [],
      file: absolute,
      bytes: stat.size || 0
    };
  }

  const text = fs.readFileSync(absolute, 'utf8');
  return {
    ...validateDumpText(text),
    file: absolute,
    bytes: stat.size
  };
}

function printResult(result) {
  console.log(`Archivo: ${result.file || '(memoria)'}`);
  if (Number.isFinite(result.bytes)) console.log(`Bytes: ${result.bytes}`);

  for (const warning of result.warnings || []) {
    console.warn(`[WARN] ${warning}`);
  }

  if (result.ok) {
    console.log('[OK] Respaldo UTF8MB4 validado.');
    return;
  }

  for (const error of result.errors || []) {
    console.error(`[ERROR] ${error}`);
  }
  console.error('[ERROR] El respaldo NO debe marcarse como validado.');
}

if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Uso: node backend/scripts/validate-backup-utf8mb4.js <SABANA_YYYYMMDD.sql>');
    process.exit(2);
  }

  const result = validateDumpFile(filePath);
  printResult(result);
  process.exit(result.ok ? 0 : 1);
}

module.exports = {
  EXPECTED_CRITICAL_ICONS,
  findNotificationEventsInsert,
  validateDumpText,
  validateDumpFile
};
