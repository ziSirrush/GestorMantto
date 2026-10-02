'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function loadInternals() {
  let source = read('modules/cobranza-cor/cobranza-cor-pagos.js');
  const marker = '  window.ManttoCobranzaCorPagos=Object.freeze({';
  assert.ok(source.includes(marker), 'No se encontro punto de exportacion del modulo.');
  source = source.replace(marker, `  window.__PagosCatalogoTest={\n    state,\n    canonicalProjectInput_cor,\n    projectLabel_cor,\n    projectMainLabel_cor,\n    rebuildProjectMaps_cor,\n    filterProjects_cor,\n    projectInputValue_cor,\n    resolveProjectInput_cor\n  };\n\n${marker}`);
  const document = {
    getElementById() { return null; },
    addEventListener() {},
    activeElement: null,
    documentElement: { clientWidth: 1280 }
  };
  const window = { addEventListener() {}, innerWidth: 1280 };
  vm.runInNewContext(source, {
    window, document, URLSearchParams, Intl, Number, String, Array, Object, Math, Promise,
    encodeURIComponent, console, Map, Set
  });
  return window.__PagosCatalogoTest;
}

test('reemplaza datalist nativo por combobox buscable propio', () => {
  const source = read('modules/cobranza-cor/cobranza-cor-pagos.js');
  assert.match(source, /data-ccor-pg-project-combo/);
  assert.match(source, /id="ccor-pg-project-dropdown" class="ccor-pg-project-dropdown" role="listbox"/);
  assert.doesNotMatch(source, /<datalist/i);
  assert.doesNotMatch(source, /list="ccor-pg-project-options"/);
});

test('el buscador acota por PPNS, proyecto o cliente sin perder el catalogo completo', () => {
  const api = loadInternals();
  api.state.projects = [
    { ppns: 'P14223', proyecto: '16 DE SEPTIEMBRE 3RA ETAPA', cliente: 'CLIENTE NORTE' },
    { ppns: 'P14302', proyecto: '5TA AVENIDA', cliente: 'CLIENTE CENTRO' },
    { ppns: 'P14669', proyecto: 'ACUEDUCTO 39', cliente: 'CLIENTE SUR' }
  ];
  api.rebuildProjectMaps_cor();
  assert.equal(api.filterProjects_cor('P14302').length, 1);
  assert.equal(api.filterProjects_cor('avenida').length, 1);
  assert.equal(api.filterProjects_cor('cliente sur').length, 1);
  assert.equal(api.filterProjects_cor('').length, 3);
});

test('seleccion exacta sigue resolviendo al PPNS real', () => {
  const api = loadInternals();
  api.state.projects = [
    { ppns: 'P14223', proyecto: '16 DE SEPTIEMBRE 3RA ETAPA', cliente: 'CLIENTE NORTE' }
  ];
  api.rebuildProjectMaps_cor();
  assert.equal(api.resolveProjectInput_cor('P14223').ppns, 'P14223');
  assert.equal(api.resolveProjectInput_cor('P14223 · 16 DE SEPTIEMBRE 3RA ETAPA · CLIENTE NORTE').ppns, 'P14223');
});

test('estilo del desplegable es claro y equivalente a un list tradicional', () => {
  const css = read('modules/cobranza-cor/cobranza-cor-pagos.css');
  assert.match(css, /\.ccor-pg-project-dropdown\{[^}]*background:#fff[^}]*border:1px solid #b8c4d6/);
  assert.match(css, /\.ccor-pg-project-option\{[^}]*background:#fff[^}]*color:#172033/);
  assert.match(css, /\.ccor-pg-project-combo-arrow/);
});

test('catalogo continua sin limit en frontend', () => {
  const source = read('modules/cobranza-cor/cobranza-cor-pagos.js');
  assert.match(source, /apiGet_cor\(API_PATH\+'\/proyectos'\)/);
  assert.doesNotMatch(source, /proyectos\?limit=/);
});

test('se conservan asignacion individual y masiva', () => {
  const source = read('modules/cobranza-cor/cobranza-cor-pagos.js');
  assert.match(source, /saveRowProject_cor/);
  assert.match(source, /saveBulkProject_cor/);
  assert.match(source, /API_PATH\+'\/proyecto\/masivo'/);
  assert.match(source, /data-ccor-pg-row-save/);
});

test('module-loader fuerza cache V004 para JS y CSS', () => {
  const loader = read('core/module-loader.js');
  assert.match(loader, /cobranza-pagos-list-buscable-tradicional-v004/);
  assert.match(loader, /cobranza-cor-pagos\.css\?v=20261002-cobranza-pagos-list-buscable-tradicional-v004/);
  assert.match(loader, /cobranza-cor-pagos\.js\?v=20261002-cobranza-pagos-list-buscable-tradicional-v004/);
});
