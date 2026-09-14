'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BACKEND_SRC = path.join(ROOT, 'backend', 'src');

function jsFiles(dir) {
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...jsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) output.push(full);
  }
  return output;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('backend no conserva CURDATE o CURRENT_DATE como reloj de negocio', () => {
  const offenders = [];
  for (const file of jsFiles(BACKEND_SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    if (/\bCURDATE\s*\(|\bCURRENT_DATE\s*(?:\(|\b)/i.test(text)) {
      offenders.push(path.relative(ROOT, file));
    }
  }
  assert.deepEqual(offenders, []);
});

test('backend no usa new Date().getFullYear() como anio operativo por defecto', () => {
  const offenders = [];
  for (const file of jsFiles(BACKEND_SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    if (/new Date\(\)\.getFullYear\(\)/.test(text)) offenders.push(path.relative(ROOT, file));
  }
  assert.deepEqual(offenders, []);
});

test('Dashboard Operativo y reglas de Instalaciones toman fecha operativa CDMX', () => {
  assert.match(
    read('backend/src/modules/dashboard-operativo/dashboard-operativo.controller.js'),
    /mexicoCityDate\(\)\.slice\(0, 7\)/
  );
  assert.match(
    read('backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.repository.js'),
    /fecha_actual:\s*mexicoCityDate\(\)/
  );
  assert.match(
    read('backend/src/modules/instalaciones-reporte/instalaciones-reporte.repository.js'),
    /return mexicoCityDate\(\)/
  );
});

test('cortes semanales mantienen America/Mexico_City explicito', () => {
  for (const rel of [
    'backend/src/jobs/portafolioCierreSemanal.job.js',
    'backend/src/jobs/logisticaCierreSemanal.job.js',
    'backend/src/jobs/almacenCierreIncorrecto.job.js'
  ]) {
    assert.match(read(rel), /America\/Mexico_City/, rel);
  }
});

test('archivos de sync no reciben el helper de hoy CDMX de Fase 3', () => {
  const offenders = [];
  for (const file of jsFiles(BACKEND_SRC)) {
    const name = path.basename(file).toLowerCase();
    if (!name.includes('sync') && !name.includes('sincron')) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes('sqlMexicoCityToday')) offenders.push(path.relative(ROOT, file));
  }
  assert.deepEqual(offenders, []);
});

test('bloque syncTickets legacy permanece fuera de la normalizacion CDMX de Fase 3', () => {
  const text = read('backend/src/controllers/data.controller.legacy.js');
  const start = text.indexOf('async function syncTickets(req, res)');
  const end = text.indexOf('async function syncTicketDatesCdmx(req, res)');
  assert.ok(start >= 0 && end > start, 'No se pudieron localizar los limites del bloque syncTickets');
  const block = text.slice(start, end);
  assert.doesNotMatch(block, /sqlMexicoCityToday|mexicoCityYear|mexicoCityCivilDateUtc/);
});
