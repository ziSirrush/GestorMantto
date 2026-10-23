'use strict';

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_1_V001]
// Pruebas sin conexión a Aiven ni modificaciones de datos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const contract = require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants');

const ROOT = path.resolve(__dirname, '..');
const MAIN = path.join(ROOT, 'modules', 'cobranza-uni', 'administracion', 'main', 'main.js');

test('Fase 1: tablas y claves reales, con GC como unico esquema definido', () => {
  assert.deepEqual(Object.keys(contract.TABLES_UNI), [
    'gestion_credito', 'pc', 'detalle_mp_2026'
  ]);
  assert.equal(contract.TABLES_UNI.gestion_credito.primaryKey, 'id_gc');
  assert.equal(contract.TABLES_UNI.pc.primaryKey, 'id_pc');
  assert.equal(contract.TABLES_UNI.detalle_mp_2026.primaryKey, 'id_dmp');
  assert.equal(contract.getTableContract_uni('gestion_credito').columns.length, 29);
  assert.equal(contract.getTableContract_uni('pc').columns, null);
  assert.equal(contract.getTableContract_uni('detalle_mp_2026').columns, null);
  assert.equal(contract.getTableContract_uni('tabla_inexistente'), null);
});

test('Fase 1: 29 columnas GC con 20 editables, 2 protegidas y 7 derivadas', () => {
  const cols = contract.GC_COLUMNS_UNI;
  assert.equal(cols.length, 29);
  assert.equal(new Set(cols.map(c => c.name)).size, 29);
  assert.equal(cols.filter(c => c.kind === 'editable').length, 20);
  assert.equal(cols.filter(c => c.kind === 'protected').length, 2);
  assert.equal(cols.filter(c => c.kind === 'derived').length, 7);
  assert.deepEqual(contract.GC_PROTECTED_FIELDS_UNI, ['id_gc', 'id_proyecto_cobranza']);
  assert.equal(cols.find(c => c.name === 'idns').editable, true);
  assert.equal(cols.find(c => c.name === 'id_gc').editable, false);
  assert.equal(cols.find(c => c.name === 'id_proyecto_cobranza').editable, false);
});

test('Fase 1: columnas de calculo protegidas y dependencias conocidas', () => {
  for (const [name, dependencies] of Object.entries(contract.GC_DERIVED_DEPENDENCIES_UNI)) {
    const field = contract.GC_COLUMNS_UNI.find(c => c.name === name);
    assert.equal(field?.kind, 'derived', name);
    assert.equal(field.editable, false);
    for (const dependency of dependencies) {
      assert.ok(contract.GC_COLUMNS_UNI.some(c => c.name === dependency), dependency);
    }
  }
  assert.equal(contract.GC_DERIVED_FIELDS_UNI.length, 7);
});

test('Fase 1: los tipos y nombres de la BD no se alteran', () => {
  const cols = Object.fromEntries(contract.GC_COLUMNS_UNI.map(c => [c.name, c]));
  assert.equal(cols.montp_mp.sqlType, 'decimal(18,2)');
  assert.equal(cols.suministro.sqlType, 'varchar(100)');
  assert.equal(cols.anticipo.sqlType, 'varchar(50)');
  assert.equal(cols.id_gc.sqlType, 'bigint');
  assert.equal(cols.id_gc.nullable, false);
  assert.equal(cols.id_proyecto_cobranza.sqlType, 'bigint unsigned');
  assert.equal(Object.isFrozen(cols.adeudo), true);
  assert.equal(Object.isFrozen(contract.GC_COLUMNS_UNI), true);
});

test('Fase 1/Fase 2: el frontend sigue sin poder modificar registros', async () => {
  const src = fs.readFileSync(MAIN, 'utf8');
  const window = { ManttoAuth: { getToken() { return ''; } } };
  const root = {
    classList: { add(value) { assert.equal(value, 'cua-uni-view'); } },
    innerHTML: '',
    addEventListener() {},
    replaceChildren() {}
  };
  const document = {
    addEventListener() {},
    getElementById(id) {
      assert.equal(id, 'view-cobranza-uni-administracion');
      return root;
    }
  };
  vm.runInNewContext(src, { window, document });
  assert.equal(typeof window.ManttoCobranzaAdministracion_uni.init, 'function');
  assert.equal(await window.ManttoCobranzaAdministracion_uni.init(), false);
  assert.match(root.innerHTML, /Administración de Cobranza UNI/);
  assert.doesNotMatch(src, /\.patch\(|\.post\(/);
});
