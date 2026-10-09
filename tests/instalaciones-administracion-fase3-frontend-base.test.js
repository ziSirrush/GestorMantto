'use strict';
// [Aster | 2026-10-08 | ASTER-MG | FIX_1_INSTALACIONES_ADMINISTRACION_REDISENO_V001]
// [Aster | 2026-10-08 | ASTER-MG | FIX_2_INSTALACIONES_ADMINISTRACION_DETALLE_EQUIPO_V001]
// Actualiza el contrato de UI de Fase 3: el listado legado fue reemplazado por
// un navegador paginado de proyectos y sus equipos (sin modificar permisos).
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

test('sidebar conserva permiso exacto, ruta y vista', () => {
  assert.match(index, new RegExp(`data-permission-code="${ACCESS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.match(index, new RegExp(`data-route="${ROUTE}"`));
  assert.match(index, new RegExp(`id="view-${ROUTE}"`));
});
test('loader sigue registrando CSS y JS del modulo', () => {
  assert.match(loader, /'instalaciones-administracion'/);
  assert.match(loader, /modules\/instalaciones-administracion\/instalaciones-administracion_cor\.css/);
  assert.match(loader, /modules\/instalaciones-administracion\/instalaciones-administracion_cor\.js/);
});
test('router preserva la navegacion al modulo', () => {
  assert.match(router, /'instalaciones-administracion':'Administraci/);
  assert.match(router, /function showInstalacionesAdministracion_cor\(\)/);
  assert.match(router, /ManttoInstalacionesAdministracion_cor\.init/);
});
test('frontend FIX1 + FIX2 conserva filtros y agrega PATCH atomico por equipo', () => {
  assert.match(js, /ROOT\+'\/filtros'/);
  assert.match(js, /ROOT\+'\/proyectos\?'/);
  assert.match(js, /'\/equipos\?'/);
  assert.match(js, /ROOT\+'\/registros\/'/);
  assert.match(js, /method:'PATCH'/);
  assert.match(js, /JSON\.stringify\(\{groups:p\.groups\}\)/);
  assert.doesNotMatch(js, /localStorage|sessionStorage/);
});
test('jerarquia visual de proyectos, equipos, detalle y filtros', () => {
  assert.match(html, /iadm-cor-search-form/);
  assert.match(html, /iadm-cor-filter-status/);
  assert.match(html, /iadm-cor-filter-supervisor/);
  assert.match(html, /iadm-cor-projects/);
  assert.match(html, /iadm-cor-equipment-list/);
  assert.match(html, /iadm-cor-selected/);
  assert.match(html, /iadm-cor-group-picker/);
  assert.match(html, /iadm-cor-system-grid/);
  assert.match(html, /instalaciones-administracion-form_cor/);
  assert.match(js, /iadm-cor-detail-section/);
  assert.match(html,/iadm-cor-detail-edit-btn/);
});
test('F6 permisos de grupo y formularios no se relajan', () => {
  assert.match(js, /permissions\?\.can_view===true/);
  assert.match(js, /permissions\?\.can_edit/);
  assert.match(js, /editable_fields/);
  assert.match(js, /JSON\.stringify\(\{groups:p\.groups\}\)/);
  assert.match(js, /mantto:session-expired/);
});
test('responsive, sin zoom artificial', () => {
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(formCss, /@media\(max-width:760px\)/);
  assert.match(formCss, /@media\(max-width:480px\)/);
  assert.doesNotMatch(formCss, /\bzoom\s*:/i);
  assert.doesNotMatch(formCss, /transform\s*:\s*scale\s*\(/i);
});
test('recurso adicional de estilos lleva cache bust de FIX 2', () => {
  assert.match(html, /instalaciones-administracion-form_cor\.css\?v=20261008-fix2-v001/);
});
