'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FIX_PATH = path.join(
  __dirname,
  '../backend/sql/20260827_FIX_PUSH_DEFAULT_ACTIVO_V001.sql'
);
const VERIFY_PATH = path.join(
  __dirname,
  '../backend/sql/20260827_VERIFICAR_FIX_PUSH_DEFAULT_ACTIVO_V001.sql'
);

const fixSql = fs.readFileSync(FIX_PATH, 'utf8');
const verifySql = fs.readFileSync(VERIFY_PATH, 'utf8');

const targetEvents = [
  'tareas.comentario.creado',
  'tickets.comentario.creado',
  'ventas.cotizacion.comentario',
  'ventas.cotizacion.estatus',
  'ventas.prospeccion.comentario',
  'ventas.prospeccion.estatus',
  'ventas.redes.comentario',
  'ventas.redes.estatus'
];

function effectivePush({ policy = 'OPCIONAL', preferencePush = null, silenced = false, defaultPush = 1 }) {
  if (String(policy).toUpperCase() === 'OBLIGATORIA') return true;
  if (silenced) return false;
  const value = preferencePush === null || preferencePush === undefined
    ? defaultPush
    : preferencePush;
  return Number(value) === 1;
}

test('FIX declara exactamente los ocho eventos auditados como objetivo', () => {
  for (const code of targetEvents) assert.match(fixSql, new RegExp(code.replace(/[.]/g, '\\.')));
  assert.match(fixSql, /SET @mg_expected_targets = 8;/);
});

test('FIX solo cambia push_default y no escribe preferencias ni matriz Evento-Rol', () => {
  assert.match(fixSql, /UPDATE\s+notificacion_eventos[\s\S]*SET\s+push_default\s*=\s*1/i);
  assert.doesNotMatch(fixSql, /UPDATE\s+notificacion_preferencias/i);
  assert.doesNotMatch(fixSql, /INSERT\s+INTO\s+notificacion_preferencias/i);
  assert.doesNotMatch(fixSql, /DELETE\s+FROM\s+notificacion_preferencias/i);
  assert.doesNotMatch(fixSql, /UPDATE\s+notificacion_evento_roles/i);
  assert.doesNotMatch(fixSql, /INSERT\s+INTO\s+notificacion_evento_roles/i);
  assert.doesNotMatch(fixSql, /DELETE\s+FROM\s+notificacion_evento_roles/i);
});

test('UPDATE es compatible con Safe Updates al usar codigo_evento, PK del catalogo', () => {
  assert.match(fixSql, /UPDATE\s+notificacion_eventos[\s\S]*WHERE\s+codigo_evento\s+IN\s*\(/i);
});

test('preflight bloquea el UPDATE si el catalogo esperado dejo de coincidir', () => {
  assert.match(fixSql, /@mg_preflight_ok/);
  assert.match(fixSql, /@mg_found_targets\s*=\s*@mg_expected_targets/);
  assert.match(fixSql, /@mg_valid_targets\s*=\s*@mg_expected_targets/);
  assert.match(fixSql, /AND\s+@mg_preflight_ok\s*=\s*1/i);
});

test('usuario opcional sin preferencia explicita recibe Push por defecto', () => {
  assert.equal(effectivePush({ policy: 'OPCIONAL', preferencePush: null, defaultPush: 1 }), true);
});

test('preferencia explicita push=0 sigue ganando sobre el nuevo default', () => {
  assert.equal(effectivePush({ policy: 'OPCIONAL', preferencePush: 0, defaultPush: 1 }), false);
});

test('silenciar una notificacion opcional sigue impidiendo Push', () => {
  assert.equal(effectivePush({ policy: 'OPCIONAL', preferencePush: 1, silenced: true, defaultPush: 1 }), false);
});

test('evento obligatorio conserva Push activo independientemente del default personal', () => {
  assert.equal(effectivePush({ policy: 'OBLIGATORIA', preferencePush: 0, silenced: true, defaultPush: 0 }), true);
});

test('SQL de verificacion es estrictamente de solo lectura', () => {
  const noComments = verifySql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(noComments, /\b(UPDATE|INSERT|DELETE|ALTER|DROP|TRUNCATE|CREATE|REPLACE)\b/i);
  assert.match(noComments, /SELECT/i);
});
