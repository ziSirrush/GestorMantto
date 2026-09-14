'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const temporal = require('../backend/src/utils/temporal');

test('CDMX resuelve correctamente el dia civil al cruzar medianoche UTC', () => {
  const instant = new Date('2026-01-01T05:30:00.000Z');
  assert.equal(temporal.mexicoCityDate(instant), '2025-12-31');
  assert.equal(temporal.mexicoCityYear(instant), 2025);
  assert.equal(temporal.mexicoCityUtcOffsetMinutes(instant), -360);
});

test('fecha civil CDMX se representa como marcador UTC sin cambiar su dia literal', () => {
  const instant = new Date('2026-09-14T16:00:00.000Z');
  assert.equal(
    temporal.mexicoCityCivilDateUtc(instant).toISOString(),
    '2026-09-14T00:00:00.000Z'
  );
});

test('SQL de hoy CDMX es dinamico y no congela una fecha literal al iniciar Node', () => {
  const instant = new Date('2026-09-14T16:00:00.000Z');
  const sql = temporal.sqlMexicoCityToday(instant);
  assert.match(sql, /^DATE\(DATE_ADD\(UTC_TIMESTAMP\(3\), INTERVAL -360 MINUTE\)\)$/);
  assert.doesNotMatch(sql, /2026-09-14/);
});

test('sqlDateLiteral solo acepta fechas civiles YYYY-MM-DD', () => {
  assert.equal(temporal.sqlDateLiteral('2026-09-14'), "DATE('2026-09-14')");
  assert.throws(() => temporal.sqlDateLiteral('14/09/2026'), /YYYY-MM-DD/);
});
