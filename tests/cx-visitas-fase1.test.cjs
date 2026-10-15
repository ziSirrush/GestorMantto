// [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 1 V001]
// Static contract tests. They do NOT replace MySQL/Aiven execution or E2E.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const directory = path.join(ROOT, 'database');
const files = Object.freeze({
  precheck: '00_PRECHECK_FASE_1_CX_VISITAS_V001.sql',
  apply: '01_APLICAR_FASE_1_CX_VISITAS_V001.sql',
  smoke: '02_SMOKE_FASE_1_CX_VISITAS_V001.sql',
  rollback: '99_ROLLBACK_LOGICO_FASE_1_CX_VISITAS_V001.sql'
});
const sql = Object.fromEntries(Object.entries(files).map(([key, filename]) =>
  [key, fs.readFileSync(path.join(directory, filename), 'utf8')]
));

function statementsOnly(content) {
  return content.split('\n').filter(line => !/^\s*--/.test(line)).join('\n');
}

test('Los cuatro scripts son SQL versionado con identidad BLT NOW', () => {
  for (const [key, contents] of Object.entries(sql)) {
    assert.match(contents, /ChatGPT\s*\|\s*2026-10-15\s*\|\s*BLT NOW/);
    assert.match(contents, /FASE 1 V001/);
    assert.match(contents, /\bUSE mydb\s*;/i, `${key}: falta seleccion explicita de esquema`);
  }
});

test('Precheck y smoke son de solo lectura, sin DDL o DML', () => {
  for (const key of ['precheck', 'smoke']) {
    const q = statementsOnly(sql[key]);
    assert.doesNotMatch(q, /\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE|CREATE\s+TABLE|ALTER\s+TABLE|TRUNCATE\s+TABLE)\b/i);
  }
  assert.match(sql.precheck, /BLOQUEADO_NO_EJECUTAR_APLICAR/);
});

test('Migracion agrega solo las dos tablas de CX Visitas sin tablas de Ventas', () => {
  const q = statementsOnly(sql.apply);
  const tables = [...q.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)/gi)]
    .map(match => match[1]);
  assert.deepEqual(tables, ['cx_visitas', 'cx_visitas_historial']);
  assert.doesNotMatch(q, /\bALTER\s+TABLE\b|\bDROP\s+TABLE\b|\bTRUNCATE\b/i);
  assert.match(q, /FOREIGN\s+KEY\s*\(id_visita\)\s*REFERENCES\s+cx_visitas\s*\(id_visita\)/i);
  assert.match(q, /ON\s+DELETE\s+RESTRICT/i);
  assert.match(q, /\bENGINE=InnoDB\b/i);
  assert.match(q, /\bDATETIME\(3\)/);
  assert.match(q, /\binactivo\s+TINYINT\(1\)\s+NOT\s+NULL\s+DEFAULT\s+0/i);
});

test('Precondiciones SQL se fuerzan ANTES de cualquier CREATE TABLE', () => {
  const q = statementsOnly(sql.apply);
  const guard = q.indexOf('PREPARE cx_visitas_guard_v001');
  const create = q.indexOf('CREATE TABLE IF NOT EXISTS cx_visitas');
  const schemaGuard = q.indexOf('PREPARE cx_visitas_schema_guard_v001');
  const catalogStart = q.indexOf('START TRANSACTION;');
  assert.ok(guard > 0 && guard < create);
  assert.ok(schemaGuard > create && schemaGuard < catalogStart);
  assert.match(q, /__BLT_NOW_CX_VISITAS_PRECHECK_BLOQUEADO_V001__/);
  assert.match(q, /__BLT_NOW_CX_VISITAS_ESQUEMA_INVALIDO_V001__/);
});

test('La integracion reutiliza modulo y permiso visual preexistentes', () => {
  const q = statementsOnly(sql.apply);
  assert.match(q, /CUSTOMER_EXPERIENCE_VISITAS_ACCESO_VISUAL_MODULO\.ACCESO_VISUAL/);
  assert.match(q, /pm\.codigo = 'CUSTOMER_EXPERIENCE_VISITAS'/);
  assert.doesNotMatch(q, /INSERT\s+INTO\s+perm_modulos\b/i);
  assert.doesNotMatch(q, /UPDATE\s+perm_modulos\b/i);
  assert.doesNotMatch(q, /INSERT\s+INTO\s+perm_acciones\b/i);
  assert.doesNotMatch(q, /UPDATE\s+perm_acciones\b/i);
  assert.doesNotMatch(q, /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+rol_permisos\b/i);
});

test('Permisos nuevos: cinco acciones existentes bajo una sola rama', () => {
  const q = statementsOnly(sql.apply);
  assert.match(q, /INSERT\s+INTO\s+perm_elementos/i);
  assert.match(q, /INSERT\s+INTO\s+perm_subelementos/i);
  assert.match(q, /INSERT\s+INTO\s+perm_subelemento_acciones/i);
  assert.match(q, /CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS/);
  for (const action of ['VER', 'CREAR', 'EDITAR', 'DESACTIVAR', 'VER_HISTORIAL']) {
    assert.match(q, new RegExp(`'${action}'`));
    assert.match(sql.smoke, new RegExp(`CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS\\.${action}`));
  }
  assert.match(sql.smoke, /5 AS esperados/);
});

test('Rollback es logico y preserva permisos visuales, registros y tablas', () => {
  const q = statementsOnly(sql.rollback);
  assert.match(q, /UPDATE\s+perm_subelemento_acciones/i);
  assert.match(q, /UPDATE\s+perm_subelementos/i);
  assert.match(q, /UPDATE\s+perm_elementos/i);
  assert.doesNotMatch(q, /\b(?:DROP|DELETE|TRUNCATE|ALTER)\s+(?:TABLE|FROM)/i);
  assert.doesNotMatch(q, /(?:UPDATE|DELETE\s+FROM)\s+perm_modulos\b/i);
  const visual = 'CUSTOMER_EXPERIENCE_VISITAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
  const beforeSelect = q.split('SELECT codigo_permiso, activo')[0];
  assert.ok(!beforeSelect.includes(visual), 'No tocar el permiso visual preexistente');
});

test('El paquete no habilita temporalmente el boton CX Visitas ni altera APIs', () => {
  const sourceNames = Object.keys(files);
  assert.equal(sourceNames.length, 4);
  assert.doesNotMatch(statementsOnly(sql.apply), /\b(?:modules\/|core\/app\.js|backend\/src\/modules\/)\b/);
});
