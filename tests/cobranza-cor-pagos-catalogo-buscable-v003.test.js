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
  source = source.replace(marker, `  window.__PagosCatalogoTest={\n    state,\n    canonicalProjectInput_cor,\n    projectLabel_cor,\n    rebuildProjectMaps_cor,\n    projectDatalistOptions_cor,\n    projectInputValue_cor,\n    resolveProjectInput_cor\n  };\n\n${marker}`);
  const document = {
    getElementById() { return null; },
    addEventListener() {},
    activeElement: null
  };
  const window = {};
  vm.runInNewContext(source, {
    window, document, URLSearchParams, Intl, Number, String, Array, Object, Math, Promise,
    encodeURIComponent, console, Map, Set
  });
  return window.__PagosCatalogoTest;
}

test('asignacion individual y masiva usan campo escribible con un solo datalist compartido', () => {
  const source = read('modules/cobranza-cor/cobranza-cor-pagos.js');
  assert.match(source, /id="ccor-pg-bulk-project" type="search" list="ccor-pg-project-options"/);
  assert.match(source, /data-ccor-pg-row-project[^>]+list="ccor-pg-project-options"/);
  assert.match(source, /<datalist id="ccor-pg-project-options">/);
  assert.doesNotMatch(source, /<select id="ccor-pg-bulk-project"/);
  assert.doesNotMatch(source, /<select class="ccor-pg-row-project"/);
});

test('catalogo buscable muestra PPNS, proyecto y cliente en cada opcion', () => {
  const api = loadInternals();
  api.state.projects = [
    { ppns: 'P100', proyecto: 'TORRE REFORMA', cliente: 'CLIENTE UNO' },
    { ppns: 'P200', proyecto: 'CENTRO MÉDICO', cliente: 'CLIENTE DOS' }
  ];
  api.rebuildProjectMaps_cor();
  const html = api.projectDatalistOptions_cor();
  assert.match(html, /P100 · TORRE REFORMA · CLIENTE UNO/);
  assert.match(html, /P200 · CENTRO MÉDICO · CLIENTE DOS/);
});

test('entrada elegida se resuelve al PPNS real y acepta PPNS escrito directamente', () => {
  const api = loadInternals();
  api.state.projects = [
    { ppns: 'P100', proyecto: 'TORRE REFORMA', cliente: 'CLIENTE UNO' },
    { ppns: 'P200', proyecto: 'CENTRO MÉDICO', cliente: 'CLIENTE DOS' }
  ];
  api.rebuildProjectMaps_cor();

  assert.equal(api.resolveProjectInput_cor('P100').ppns, 'P100');
  assert.equal(api.resolveProjectInput_cor('P200 · CENTRO MEDICO · CLIENTE DOS').ppns, 'P200');
  assert.equal(api.resolveProjectInput_cor('proyecto inexistente').valid, false);
});

test('se conserva el catalogo agrupado sin volver a introducir limit', () => {
  const source = read('modules/cobranza-cor/cobranza-cor-pagos.js');
  assert.match(source, /apiGet_cor\(API_PATH\+'\/proyectos'\)/);
  assert.doesNotMatch(source, /proyectos\?limit=/);
});

test('module-loader fuerza cache nuevo para JS y CSS del catalogo buscable', () => {
  const loader = read('core/module-loader.js');
  assert.match(loader, /cobranza-pagos-catalogo-buscable-v003/);
  assert.match(loader, /cobranza-cor-pagos\.css\?v=20261002-cobranza-pagos-catalogo-buscable-v003/);
  assert.match(loader, /cobranza-cor-pagos\.js\?v=20261002-cobranza-pagos-catalogo-buscable-v003/);
});
