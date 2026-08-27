'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sqlPath = path.join(
  __dirname,
  '../backend/sql/20260827_FIX_CRITICOS_DESTINO_TICKET_V001.sql'
);
const sql = fs.readFileSync(sqlPath, 'utf8');

const BASE_EVENTS = [
  'FALLA_EQUIPO_CRITICO',
  'NUEVO_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA'
];

test('FIX 3 alinea exclusivamente los tres eventos criticos base a ABRIR_TICKET', () => {
  assert.match(sql, /UPDATE\s+notificacion_eventos/i);
  assert.match(sql, /SET\s+accion_destino\s*=\s*'ABRIR_TICKET'/i);
  for (const code of BASE_EVENTS) assert.match(sql, new RegExp(`'${code}'`));
});

test('FIX 3 no reescribe historicos, matriz ni preferencias', () => {
  const executableSql = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
  const updateStatements = [...executableSql.matchAll(/UPDATE\s+([A-Za-z0-9_]+)/gi)].map((m) => m[1]);
  assert.deepEqual([...new Set(updateStatements)], ['notificacion_eventos']);
  assert.doesNotMatch(sql, /UPDATE\s+sup_notificaciones/i);
  assert.doesNotMatch(sql, /UPDATE\s+notificacion_evento_roles/i);
  assert.doesNotMatch(sql, /UPDATE\s+notificacion_preferencias/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM/i);
});

test('FIX 3 es idempotente y protege acciones inesperadas', () => {
  assert.match(sql, /accion_destino\s*=\s*'ABRIR_MODULO'/i);
  assert.match(sql, /accion_destino\s+NOT\s+IN\s*\(\s*'ABRIR_MODULO'\s*,\s*'ABRIR_TICKET'\s*\)/i);
  assert.match(sql, /@fix3_total_eventos\s*=\s*3/i);
  assert.match(sql, /@fix3_eventos_activos\s*=\s*3/i);
  assert.match(sql, /@fix3_acciones_inesperadas\s*=\s*0/i);
});

test('FIX 3 no cambia ruta_default, prioridad, icono ni canales', () => {
  assert.doesNotMatch(sql, /SET\s+ruta_default\s*=/i);
  assert.doesNotMatch(sql, /SET\s+prioridad_default\s*=/i);
  assert.doesNotMatch(sql, /SET\s+icono_default\s*=/i);
  assert.doesNotMatch(sql, /SET\s+push_default\s*=/i);
  assert.doesNotMatch(sql, /SET\s+campana_default\s*=/i);
});
