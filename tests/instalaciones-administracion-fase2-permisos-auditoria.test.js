'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MODULE_DIR = path.join(ROOT, 'backend', 'src', 'modules', 'instalaciones-administracion');
const constants = require(path.join(MODULE_DIR, 'instalaciones-administracion.constants'));
const validation = require(path.join(MODULE_DIR, 'instalaciones-administracion.validation'));

const EXPECTED_GROUPS = [
  'proyecto',
  'seguimiento',
  'cliente_contrato',
  'ubicacion_contacto',
  'equipo',
  'produccion_logistica',
  'montaje',
  'ajuste_calidad',
  'entrega_garantia_mantenimiento',
  'costos',
  'responsables'
];

test('Fase 2 conserva 11 grupos y 93 campos operativos unicos', () => {
  assert.deepEqual(Object.keys(constants.GROUPS_COR), EXPECTED_GROUPS);
  assert.equal(constants.ALL_OPERATIONAL_FIELDS_COR.length, 93);
  assert.equal(new Set(constants.ALL_OPERATIONAL_FIELDS_COR).size, 93);
});

test('catalogo de permisos contiene acceso visual + VER/EDITAR por cada grupo', () => {
  assert.equal(
    constants.ACCESS_PERMISSION_COR,
    'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
  );
  assert.equal(Object.keys(constants.GROUP_PERMISSIONS_COR).length, 11);

  const codes = [constants.ACCESS_PERMISSION_COR];
  for (const group of EXPECTED_GROUPS) {
    const pair = constants.GROUP_PERMISSIONS_COR[group];
    assert.ok(pair.view.endsWith('.VER'));
    assert.ok(pair.edit.endsWith('.EDITAR'));
    codes.push(pair.view, pair.edit);
  }

  assert.equal(codes.length, 23);
  assert.equal(new Set(codes).size, 23);
});

test('rutas activan Guard General CORELLIAN y permiso EDITAR por grupo', () => {
  const source = fs.readFileSync(path.join(MODULE_DIR, 'instalaciones-administracion.routes.js'), 'utf8');
  assert.doesNotMatch(source, /INSTALACIONES_ADMINISTRACION_PENDING_SECURITY/);
  assert.match(source, /humanInformationGuard_gnral/);
  assert.match(source, /domain:\s*'CORELLIAN'/);
  assert.match(source, /groupingCodesAny:\s*\['INSTALACIONES'\]/);
  assert.match(source, /requireGroupEdit_cor/);
  assert.match(source, /hasEffectivePermission\(userId, codes\.edit\)/);
});

test('identidad y derivados pendientes siguen fallando cerrado', () => {
  assert.throws(
    () => validation.normalizeGroupUpdate_cor('proyecto', { changes: { id_proyecto: 'P100' } }),
    error => error?.code === 'INSTALACIONES_ADMINISTRACION_POLITICA_PENDIENTE' && error?.statusCode === 409
  );
  assert.throws(
    () => validation.normalizeGroupUpdate_cor('seguimiento', { changes: { dias_sin_visita: '2' } }),
    error => error?.code === 'INSTALACIONES_ADMINISTRACION_DERIVADO_PENDIENTE' && error?.statusCode === 409
  );
});

test('auditoria detallada reutiliza usuario_interacciones y conserva before/after', () => {
  const source = fs.readFileSync(path.join(MODULE_DIR, 'instalaciones-administracion.audit-service.js'), 'utf8');
  assert.match(source, /interactionsService\.recordFromRequest_gnral/);
  assert.match(source, /tipo_interaccion:\s*'AUDITAR_CAMBIO'/);
  assert.match(source, /executor:\s*input\.executor/);
  assert.match(source, /before:\s*changedSnapshot_cor\(before, fields\)/);
  assert.match(source, /after:\s*changedSnapshot_cor\(after, fields\)/);
});

test('auditoria se ejecuta antes del COMMIT para rollback atomico si falla', () => {
  const source = fs.readFileSync(path.join(MODULE_DIR, 'instalaciones-administracion.repository.js'), 'utf8');
  const callback = source.indexOf("if (typeof beforeCommit === 'function')");
  const commit = source.indexOf('await conn.commit();', callback);
  assert.ok(callback >= 0);
  assert.ok(commit > callback);
});

test('SQL de permisos es idempotente, no crea estructura y no asigna usuarios/roles', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'database', 'FASE_2_INSTALACIONES_ADMINISTRACION_PERMISOS_V001.sql'),
    'utf8'
  );
  assert.doesNotMatch(source, /CREATE\s+TABLE/i);
  assert.doesNotMatch(source, /ALTER\s+TABLE/i);
  assert.doesNotMatch(source, /INSERT\s+INTO\s+usuario_permisos/i);
  assert.doesNotMatch(source, /INSERT\s+INTO\s+rol_permisos/i);
  assert.match(source, /ON DUPLICATE KEY UPDATE/g);
  assert.match(source, /23 AS esperados/);
  assert.match(source, /INSTALACIONES_ADMINISTRACION_GRUPOS_COSTOS/);
  assert.match(source, /INSTALACIONES_ADMINISTRACION_GRUPOS_RESPONSABLES/);
});

test('respuesta de detalle se filtra por permisos de grupo', () => {
  const source = fs.readFileSync(path.join(MODULE_DIR, 'instalaciones-administracion.service.js'), 'utf8');
  assert.match(source, /if \(!permissions\?\.\[groupKey\]\?\.can_view\) continue/);
  assert.match(source, /can_view:\s*Boolean\(view \|\| edit\)/);
  assert.match(source, /ensureGroupEditPermission_cor/);
});
