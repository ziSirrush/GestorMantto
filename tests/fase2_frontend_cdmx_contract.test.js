'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const FRONTEND_TARGETS = [
  'core/app.js',
  'core/details.js',
  'core/pdf/pdf-engine.js',
  'modules/callcenter/callcenter.js',
  'modules/dashboard-operativo/dashboard-operativo.js',
  'modules/equipos-criticos/equipos-criticos.js',
  'modules/instalaciones-proyectos/instalaciones-proyectos.js',
  'modules/instalaciones-reporte/instalaciones-reporte_cor.js',
  'modules/ventas-dashboard/ventas-dashboard-pdf.js',
  'modules/ventas-dashboard/ventas-dashboard.js'
];

test('frontend operativo no usa anio del navegador ni fecha UTC como hoy', () => {
  for (const relative of FRONTEND_TARGETS) {
    const source = read(relative);
    assert.doesNotMatch(source, /new Date\(\)\.getFullYear\(\)/, relative);
    assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)\.slice\(0\s*,\s*10\)/, relative);
  }
});

test('relojes y reportes principales declaran contrato CDMX', () => {
  const app = read('core/app.js');
  const pdf = read('core/pdf/pdf-engine.js');
  const salesPdf = read('modules/ventas-dashboard/ventas-dashboard-pdf.js');
  const installations = read('modules/instalaciones-reporte/instalaciones-reporte_cor.js');
  assert.match(app, /America\/Mexico_City|mexicoCityTime|formatMexicoCityDate/);
  assert.match(pdf, /America\/Mexico_City|mexicoCityDate|formatMexicoCityDate/);
  assert.match(salesPdf, /reportDateCdmx\(\)/);
  assert.match(salesPdf, /reportDateStampCdmx\(\)/);
  assert.match(installations, /printDate_cor[\s\S]{0,500}America\/Mexico_City|printDate_cor[\s\S]{0,300}formatMexicoCityDate/);
});

test('fechas civiles de Tickets siguen literales en detalle', () => {
  const source = read('core/details.js');
  assert.match(source, /Fechas operativas DATE\/ISO: conservar el día recibido/);
  assert.match(source, /m=s\.match\(\/\^\(\\d\{4\}\)-\(\\d\{2\}\)-\(\\d\{2\}\)\//);
});

test('formatos de ventas que reciben DATE no dependen de timezone del navegador', () => {
  for (const relative of [
    'modules/ventas-prospeccion/ventas-prospeccion.js',
    'modules/ventas-mapa-prospeccion/ventas-mapa-prospeccion.js',
    'modules/ventas-clientes-detalle/ventas-clientes-detalle.js',
    'modules/ventas-dashboard/ventas-dashboard.js'
  ]) {
    const source = read(relative);
    assert.match(source, /\^\(\\d\{4\}\)-\(\\d\{2\}\)-\(\\d\{2\}\)/, relative);
  }
});
