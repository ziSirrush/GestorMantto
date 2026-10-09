'use strict';
// [Aster | 2026-10-09 | ASTER-MG | FIX_1_INSTALACIONES_ADMINISTRACION_EDICION_TOTAL_BACKEND_V001]
// Se actualizan aserciones de permisos segun la regla posterior aprobada.
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

test('Fase 2 + FIX1 conserva 11 grupos y 93 campos operativos unicos', () => {
  assert.deepEqual(Object.keys(constants.GROUPS_COR), EXPECTED_GROUPS);
  assert.equal(constants.ALL_OPERATIONAL_FIELDS_COR.length, 93);
  assert.equal(new Set(constants.ALL_OPERATIONAL_FIELDS_COR).size, 93);
});

test('FIX1: catalogo operativo exige dos permisos explicitos sin inferir privilegios del rol', () => {
  assert.equal(constants.ACCESS_PERMISSION_COR,
    'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL');
  assert.equal(constants.FULL_EDIT_PERMISSION_COR,
    'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.EDITAR');
  assert.equal(Object.keys(constants.GROUP_PERMISSIONS_COR).length, 11);
  for (const group of EXPECTED_GROUPS) {
    const pair = constants.GROUP_PERMISSIONS_COR[group];
    assert.equal(pair.view, constants.ACCESS_PERMISSION_COR);
    assert.equal(pair.edit, constants.FULL_EDIT_PERMISSION_COR);
  }
  assert.notEqual(constants.ACCESS_PERMISSION_COR,constants.FULL_EDIT_PERMISSION_COR);
});

test('rutas activan Guard General CORELLIAN y permiso EDITAR global', () => {
  const source = fs.readFileSync(path.join(MODULE_DIR, 'instalaciones-administracion.routes.js'), 'utf8');
  assert.doesNotMatch(source, /INSTALACIONES_ADMINISTRACION_PENDING_SECURITY/);
  assert.match(source, /humanInformationGuard_gnral/);
  assert.match(source, /domain:\s*'CORELLIAN'/);
  assert.match(source, /groupingCodesAny:\s*\['INSTALACIONES'\]/);
  assert.match(source, /requireGroupEdit_cor/);
  assert.match(source, /hasEffectivePermission\(userId, codes\.edit\)/);
});

test('FIX1: identidad y derivados se pueden capturar individualmente, sistema inmutable', () => {
  assert.equal(validation.normalizeGroupUpdate_cor('proyecto', {
    changes: { id_proyecto: 'P100' }
  }).id_proyecto, 'P100');
  assert.equal(validation.normalizeGroupUpdate_cor('seguimiento', {
    changes: { dias_sin_visita: '2' }
  }).dias_sin_visita, '2');
  assert.throws(() => validation.normalizeGroupUpdate_cor('proyecto', {
    changes: { id_ins_fl: 7 }
  }), {statusCode:400,code:'INSTALACIONES_ADMINISTRACION_CAMPO_SOLO_LECTURA'});
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

test('SQL de Fase 2 permanece idempotente, no crea estructura ni asigna usuarios/roles', () => {
  const source = fs.readFileSync(path.join(ROOT, 'database', 'FASE_2_INSTALACIONES_ADMINISTRACION_PERMISOS_V001.sql'), 'utf8');
  assert.doesNotMatch(source, /CREATE\s+TABLE/i);
  assert.doesNotMatch(source, /ALTER\s+TABLE/i);
  assert.doesNotMatch(source, /INSERT\s+INTO\s+usuario_permisos/i);
  assert.doesNotMatch(source, /INSERT\s+INTO\s+rol_permisos/i);
  assert.match(source, /ON DUPLICATE KEY UPDATE/g);
  assert.match(source, /23 AS esperados/);
  assert.match(source, /INSTALACIONES_ADMINISTRACION_GRUPOS_COSTOS/);
  assert.match(source, /INSTALACIONES_ADMINISTRACION_GRUPOS_RESPONSABLES/);
});

test('detalle filtra por autorizacion de modulo y mantiene validacion de alcance', () => {
  const source = fs.readFileSync(path.join(MODULE_DIR, 'instalaciones-administracion.service.js'), 'utf8');
  assert.match(source, /if \(!permissions\?\.\[groupKey\]\?\.can_view\) continue/);
  assert.match(source, /moduleAccess\.has_full_edit_permission/);
  assert.match(source, /LEGACY_GROUP_PERMISSIONS_COR/);
  assert.match(source, /can_edit:\s*moduleAccess\.can_edit/);
  assert.match(source, /ensureGroupEditPermission_cor/);
  assert.match(source, /resolveScope_cor\(req\)/);
});
