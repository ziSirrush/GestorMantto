'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const policy = require('../backend/src/services/notifications/notification-policy');

const EXPECTED_FOLLOW_ONLY = [
  'PORTAFOLIO_EQUIPO_INGRESO',
  'PORTAFOLIO_EQUIPO_SALIDA',
  'PORTAFOLIO_EQUIPO_CAMBIO',
  'TICKET_CREADO',
  'TICKET_ESTATUS_CAMBIADO',
  'TICKET_PRIORIDAD_CAMBIADA',
  'TICKET_ASIGNACION_CAMBIADA',
  'TICKET_RESPONSABILIDAD_CAMBIADA'
];

test('politica de lectura reconoce los ocho eventos follow-only', () => {
  assert.deepEqual(policy.FOLLOW_ONLY_EVENT_CODES_GNRAL, EXPECTED_FOLLOW_ONLY);
  const sql = policy.followOnlyEventSql_gnral('n');
  for (const code of EXPECTED_FOLLOW_ONLY) {
    assert.match(sql, new RegExp(code));
  }
});

test('Campana bloquea fallback legacy para follow-only sin metadata Seguimiento', () => {
  const sql = policy.bellVisibilitySql_gnral('n', 'e', 'p');
  assert.match(sql, /JSON_CONTAINS[\s\S]*SEGUIMIENTO_ESPECIAL/);
  assert.match(sql, /NOT \(UPPER\(TRIM\(COALESCE\(n\.tipo_notificacion/);
  assert.match(sql, /NOT EXISTS[\s\S]*notificacion_evento_roles/);
});

test('Push bloquea fallback legacy y matriz para follow-only sin metadata Seguimiento', () => {
  const sql = policy.pushVisibilitySql_gnral('n', 'e', 'p');
  assert.match(sql, /JSON_CONTAINS[\s\S]*SEGUIMIENTO_ESPECIAL/);
  assert.match(sql, /NOT \(UPPER\(TRIM\(COALESCE\(n\.tipo_notificacion/);
  assert.match(sql, /COALESCE\(p\.push, 1\)/);
  assert.match(sql, /notificacion_evento_roles/);
});
