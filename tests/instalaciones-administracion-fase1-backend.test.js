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

test('contrato contiene 11 grupos y 93 campos operativos unicos', () => {
  assert.deepEqual(Object.keys(constants.GROUPS_COR), EXPECTED_GROUPS);
  assert.equal(constants.ALL_OPERATIONAL_FIELDS_COR.length, 93);
  assert.equal(new Set(constants.ALL_OPERATIONAL_FIELDS_COR).size, 93);
});

test('campos de sistema no forman parte de captura operativa', () => {
  for (const field of constants.SYSTEM_READONLY_FIELDS_COR) {
    assert.equal(constants.ALL_OPERATIONAL_FIELDS_COR.includes(field), false, field);
  }
});

test('FIX1 backend: identidad y derivados editables en ficha individual', () => {
  assert.equal(validation.normalizeGroupUpdate_cor('proyecto', {changes:{id_proyecto:'P100'}}).id_proyecto, 'P100');
  assert.equal(validation.normalizeGroupUpdate_cor('proyecto', {changes:{referencia_sitio:'Elevador 1'}}).referencia_sitio, 'Elevador 1');
  assert.equal(validation.normalizeGroupUpdate_cor('montaje', {changes:{dias_restantes:'10'}}).dias_restantes, '10');
});

test('rechaza campos fuera del grupo', () => {
  assert.throws(
    () => validation.normalizeGroupUpdate_cor('costos', { changes: { ciudad: 'CDMX' } }),
    error => error && error.code === 'INSTALACIONES_ADMINISTRACION_CAMPO_FUERA_GRUPO'
  );
});

test('normaliza activo e IDs responsables sin perder marcadores de negocio', () => {
  const proyecto = validation.normalizeGroupUpdate_cor('proyecto', { changes: { activo: '0', estatus: 'N/A' } });
  assert.equal(proyecto.activo, 0);
  assert.equal(proyecto.estatus, 'N/A');

  const responsables = validation.normalizeGroupUpdate_cor('responsables', {
    changes: { id_sup: '15', id_asesor: null, supervisor_fl: '-' }
  });
  assert.equal(responsables.id_sup, 15);
  assert.equal(responsables.id_asesor, null);
  assert.equal(responsables.supervisor_fl, '-');
});

test('FIX1 backend: contrato expone los 93 campos operativos editables', () => {
  const contract = validation.publicContract_cor();
  const proyecto = contract.find(item => item.key === 'proyecto');
  assert.ok(proyecto.editable_fields.includes('id_proyecto'));
  assert.ok(proyecto.editable_fields.includes('referencia_sitio'));
  const seguimiento = contract.find(item => item.key === 'seguimiento');
  assert.ok(seguimiento.editable_fields.includes('dias_sin_visita'));
  assert.ok(contract.every(item=>item.pending_policy_fields.length===0));
  assert.equal(contract.reduce((total,item)=>total+item.editable_fields.length,0),93);
});

test('rutas de Fase 1 estan montadas y activadas mediante el Guard de Fase 2', () => {
  const routeFile = fs.readFileSync(path.join(MODULE_DIR, 'instalaciones-administracion.routes.js'), 'utf8');
  const indexFile = fs.readFileSync(path.join(ROOT, 'backend', 'src', 'routes', 'index.js'), 'utf8');
  assert.doesNotMatch(routeFile, /INSTALACIONES_ADMINISTRACION_PENDING_SECURITY/);
  assert.match(routeFile, /humanInformationGuard_gnral/);
  assert.match(routeFile, /router\.patch\(/);
  assert.match(indexFile, /instalacionesAdministracionRoutes/);
  assert.match(indexFile, /router\.use\('\/instalaciones', instalacionesAdministracionRoutes\)/);
});
