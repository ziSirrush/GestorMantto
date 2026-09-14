'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const humanTime = require('../core/human-time.js');
const temporal = require('../backend/src/utils/temporal.js');

test('DATE literal conserva el dia sin conversion de zona', () => {
  assert.equal(
    humanTime.formatDateTime('2026-09-14', { timeZone: 'America/Mexico_City' }),
    '14/09/2026'
  );
  assert.equal(humanTime.parseInstant('2026-09-14'), null);
});

test('DATETIME UTC interno se presenta en la zona solicitada', () => {
  assert.equal(
    humanTime.formatDateTime('2026-09-14 18:00:00', { timeZone: 'America/Mexico_City' }),
    '14/09/2026 - 12:00'
  );
});

test('helper central de Mexico City resuelve fecha, hora y anio operativos', () => {
  const instant = '2027-01-01T04:30:15.000Z';
  assert.equal(humanTime.mexicoCityDate(instant), '2026-12-31');
  assert.equal(humanTime.mexicoCityTime(instant), '22:30');
  assert.equal(humanTime.mexicoCityYear(instant), 2026);
  assert.equal(humanTime.formatMexicoCityDateTime(instant), '31/12/2026 - 22:30');
});

test('lineas de interaccion aceptan epoch absoluto sin depender de timezone MySQL', () => {
  const epoch = Date.parse('2026-09-14T18:00:00.000Z');
  assert.equal(
    humanTime.formatInteractionLines(`@${epoch} - JV: comentario`, { timeZone: 'America/Mexico_City' }),
    '14/09/2026 - 12:00 - JV: comentario'
  );
});

test('helper backend produce UTC canonico y fecha operativa CDMX', () => {
  const instant = new Date('2027-01-01T04:30:15.123Z');
  assert.equal(temporal.utcDateTime(instant), '2027-01-01 04:30:15.123');
  assert.equal(temporal.mexicoCityDate(instant), '2026-12-31');
  assert.equal(temporal.mexicoCityTime(instant), '22:30');
  assert.equal(temporal.mexicoCityYear(instant), 2026);
});
