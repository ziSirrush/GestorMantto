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
const formCss = read('modules/instalaciones-administracion/instalaciones-administracion-form_cor.css');
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

test('router reconoce Administracion y activa el modulo', () => {
  assert.match(router, /'instalaciones-administracion':'Administraci/);
  assert.match(router, /function showInstalacionesAdministracion_cor\(\)/);
  assert.match(router, /ManttoInstalacionesAdministracion_cor\.init/);
  assert.match(router, /route==='instalaciones-administracion'/);
});

test('frontend de Fases 3 y 4 conserva GET e incorpora PATCH parcial', () => {
  assert.match(js, /ROOT\+'\/contrato'/);
  assert.match(js, /ROOT\+'\/registros\?'/);
  assert.match(js, /ROOT\+'\/registros\/'/);
  assert.match(js, /method:'PATCH'/);
  assert.match(js, /changes:p\.changes,expected:p\.expected/);
});

test('frontend mantiene lectura y no persiste datos operativos localmente', () => {
  assert.doesNotMatch(js, /localStorage/);
  assert.doesNotMatch(js, /sessionStorage/);
  assert.match(js, /JSON\.stringify\(\{changes:p\.changes,expected:p\.expected\}\)/);
  assert.match(html, /instalaciones-administracion-form_cor/);
});

test('estructura visual mantiene buscador, selector, acordeon y sistema', () => {
  assert.match(html, /iadm-cor-search-form/);
  assert.match(html, /iadm-cor-group-picker/);
  assert.match(html, /iadm-cor-groups/);
  assert.match(html, /iadm-cor-system-grid/);
  assert.match(js, /<details class="iadm-cor-group" open>/);
});

test('el frontend filtra por grupos visibles y reconoce permisos de edicion', () => {
  assert.match(js, /permissions\?\.can_view===true/);
  assert.match(js, /permissions\?\.can_edit/);
  assert.match(js, /editable_fields/);
});

test('responsive usa CSS de fases 3 y 4, sin zoom artificial', () => {
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(formCss, /@media\(max-width:760px\)/);
  assert.doesNotMatch(formCss, /\bzoom\s*:/i);
  assert.doesNotMatch(formCss, /transform\s*:\s*scale\s*\(/i);
});

test('el recurso adicional de estilos usa version fija de Fase 4', () => {
  assert.match(html, /instalaciones-administracion-form_cor\.css\?v=20261008-fase4-v001/);
});
