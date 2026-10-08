'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const index = read('index.html');
const loader = read('core/module-loader.js');
const router = read('core/router.js');
const html = read('modules/instalaciones-administracion/instalaciones-administracion_cor.html');
const css = read('modules/instalaciones-administracion/instalaciones-administracion_cor.css');
const js = read('modules/instalaciones-administracion/instalaciones-administracion_cor.js');

const ROUTE = 'instalaciones-administracion';
const ACCESS = 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

test('sidebar usa permiso exacto fail-closed y registra la vista', () => {
  assert.match(index, new RegExp(`data-permission-code="${ACCESS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.match(index, new RegExp(`data-route="${ROUTE}"`));
  assert.match(index, new RegExp(`id="view-${ROUTE}"`));
});

test('module-loader registra CSS/JS y ruta persistente', () => {
  assert.match(loader, /'instalaciones-administracion'/);
  assert.match(loader, /modules\/instalaciones-administracion\/instalaciones-administracion_cor\.css/);
  assert.match(loader, /modules\/instalaciones-administracion\/instalaciones-administracion_cor\.js/);
});

test('router reconoce Administración y activa el módulo', () => {
  assert.match(router, /'instalaciones-administracion':'Administración'/);
  assert.match(router, /function showInstalacionesAdministracion_cor\(\)/);
  assert.match(router, /ManttoInstalacionesAdministracion_cor\.init/);
  assert.match(router, /route==='instalaciones-administracion'/);
});

test('frontend base consume solo endpoints GET de Fase 2', () => {
  assert.match(js, /\/api\/instalaciones\/administracion\/contrato/);
  assert.match(js, /\/api\/instalaciones\/administracion\/registros\?/);
  assert.match(js, /\/api\/instalaciones\/administracion\/registros\//);
  assert.match(js, /method:'GET'/);
  assert.doesNotMatch(js, /method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
  assert.doesNotMatch(js, /\/grupos\//);
});

test('Fase 3 no implementa guardado ni persistencia local', () => {
  assert.doesNotMatch(js, /localStorage/);
  assert.doesNotMatch(js, /sessionStorage/);
  assert.doesNotMatch(html, /Guardar cambios/i);
  assert.match(html, /Fase 3 la vista es de consulta/);
});

test('estructura visual contiene búsqueda, selector, acordeón y sistema solo lectura', () => {
  assert.match(html, /iadm-cor-search-form/);
  assert.match(html, /iadm-cor-group-picker/);
  assert.match(html, /iadm-cor-groups/);
  assert.match(html, /Información del sistema · solo lectura/);
  assert.match(js, /<details class="iadm-cor-group" open>/);
});

test('permisos de grupos se consumen desde contrato backend', () => {
  assert.match(js, /group\.permissions\.can_view === true/);
  assert.match(js, /group\.permissions && group\.permissions\.can_edit/);
  assert.match(js, /pending_policy_fields/);
  assert.match(js, /derived_pending_policy_fields/);
});

test('responsive sin zoom ni transform scale', () => {
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:480px\)/);
  assert.doesNotMatch(css, /\bzoom\s*:/i);
  assert.doesNotMatch(css, /transform\s*:\s*scale\s*\(/i);
});

test('cache-bust central queda actualizado para Fase 3', () => {
  assert.match(index, /core\/module-loader\.js\?v=20261008-instalaciones-administracion-fase3-v001/);
  assert.match(index, /core\/router\.js\?v=20261008-instalaciones-administracion-fase3-v001/);
});
