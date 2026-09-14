'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const humanTime = require('../core/human-time.js');

test('fecha operativa CDMX cruza correctamente medianoche UTC', () => {
  const instant = '2026-01-01T05:30:00.000Z';
  assert.equal(humanTime.mexicoCityDate(instant), '2025-12-31');
  assert.equal(humanTime.mexicoCityYear(instant), 2025);
  assert.equal(humanTime.mexicoCityTime(instant), '23:30');
  assert.equal(humanTime.formatMexicoCityDate(instant), '31/12/2025');
});

test('offsets civiles parten del dia CDMX y no de UTC ni del navegador', () => {
  const instant = '2026-01-01T05:30:00.000Z';
  assert.equal(humanTime.mexicoCityDateOffset(-1, instant), '2025-12-30');
  assert.equal(humanTime.mexicoCityDateOffset(1, instant), '2026-01-01');
  assert.equal(humanTime.mexicoCityMonthOffset(0, instant), '2025-12');
  assert.equal(humanTime.mexicoCityMonthOffset(1, instant), '2026-01');
  assert.equal(humanTime.mexicoCityMonthOffset(-1, instant, '_'), '2025_11');
});

test('DATE literal conserva siempre el dia en formato de reporte CDMX', () => {
  assert.equal(humanTime.formatMexicoCityDate('2026-09-14'), '14/09/2026');
  assert.equal(humanTime.formatDateTime('2026-09-14', { timeZone:'Pacific/Auckland' }), '14/09/2026');
});
