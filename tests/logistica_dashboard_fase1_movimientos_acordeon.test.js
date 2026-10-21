'use strict';

// FASE 1 DASHBOARD LOGISTICA V001: pruebas offline, sin BD ni servicios externos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dashboardPath = path.resolve(__dirname, '../modules/dashboard-logistica/dashboard-logistica.js');
const loaderPath = path.resolve(__dirname, '../core/module-loader.js');
const dashboard = fs.readFileSync(dashboardPath, 'utf8');
const loader = fs.readFileSync(loaderPath, 'utf8');

function runtime() {
  const hook = 'window.ManttoDashboardLogistica={init,reload:load};';
  assert.equal(dashboard.split(hook).length, 2, 'El punto de inyeccion del test debe existir una sola vez');
  const harness = dashboard.replace(
    hook,
    'window.__BLT_F1_TEST__={HTML,state,renderMovements,bindSinAccordion};\n  ' + hook
  );
  const elements = new Map();
  const window = {};
  const document = { getElementById: id => elements.get(id) || null };
  vm.runInNewContext(harness, { window, document, console }, { filename: dashboardPath });
  return { ...window.__BLT_F1_TEST__, elements };
}

test('solo cambios visuales: cinco columnas visibles y acordeon cerrado en HTML inicial', () => {
  const { HTML } = runtime();
  assert.match(HTML, /<th>Estatus anterior<\/th><th>Estatus nuevo<\/th>/);
  assert.match(HTML, /id="dl-sin-toggle"[^>]+aria-expanded="false"[^>]+aria-controls="dl-sin-panel"/);
  assert.match(HTML, /<div id="dl-sin-panel" hidden>/);
  assert.match(HTML, /<tbody id="dl-sin-body"><\/tbody>/);
  assert.match(HTML, /id="dl-sin-count"/);
});

test('movimientos semanales muestra anterior y actual; nuevos ingresos muestran guion', () => {
  const r = runtime();
  const host = { innerHTML: '' };
  r.elements.set('dl-mov-body', host);
  r.state.movements = [
    { tipo:'CAMBIO_ESTATUS', id_log_ops:100, id_ppns:'PP-100', proyecto:'Obra A', estatus_anterior:'EN PRODUCCION', estatus_actual:'EN TRANSITO' },
    { tipo:'NUEVO_INGRESO', id_log_ops:101, id_ppns:'PP-101', proyecto:'Obra B', estatus_actual:'EN PRODUCCION' }
  ];
  r.renderMovements();
  const trs = host.innerHTML.match(/<tr\b[^>]*>.*?<\/tr>/g) || [];
  assert.equal(trs.length, 2);
  assert.equal((trs[0].match(/<td\b/g) || []).length, 5);
  assert.equal((trs[1].match(/<td\b/g) || []).length, 5);
  assert.match(trs[0], /EN PRODUCCION/);
  assert.match(trs[0], /EN TRANSITO/);
  assert.match(trs[1], /<span class="dl-chip">—<\/span><\/td>/);
  assert.equal(r.state.movements.length, 2);
});

test('etiquetas historicas se escapan para prevenir HTML inyectado', () => {
  const r = runtime();
  const host = { innerHTML: '' };
  r.elements.set('dl-mov-body', host);
  r.state.movements = [{ id_log_ops:2, proyecto:'Demo', estatus_anterior:'<script>evil()</script>', estatus_actual:'ETAPA' }];
  r.renderMovements();
  assert.doesNotMatch(host.innerHTML, /<script>/);
  assert.match(host.innerHTML, /&lt;script&gt;/);
});

test('estado cargando y estado sin movimientos abarcan cinco columnas', () => {
  const r = runtime();
  const host = { innerHTML: '' };
  r.elements.set('dl-mov-body', host);
  r.state.cutLoading = true;
  r.renderMovements();
  assert.match(host.innerHTML, /colspan="5"/);
  r.state.cutLoading = false;
  r.state.movements = [];
  r.renderMovements();
  assert.match(host.innerHTML, /colspan="5"/);
});

test('acordeon permite expandir, contraer y activar desde encabezado', () => {
  const r = runtime();
  const head = { style:{}, onclick:null };
  const attributes = {};
  const panel = { hidden: true };
  const toggle = {
    textContent: 'Mostrar ▼',
    setAttribute(name, value) { attributes[name] = value; },
    closest(selector) { assert.equal(selector, '.dl-section-head'); return head; },
    click() { this.onclick({ target:this }); },
    onclick: null
  };
  r.elements.set('dl-sin-panel', panel);
  r.elements.set('dl-sin-toggle', toggle);
  r.bindSinAccordion();
  assert.equal(panel.hidden, true);
  assert.equal(attributes['aria-expanded'], 'false');
  toggle.click();
  assert.equal(panel.hidden, false);
  assert.equal(attributes['aria-expanded'], 'true');
  assert.equal(toggle.textContent, 'Ocultar ▲');
  head.onclick({ target: { closest:() => null } });
  assert.equal(panel.hidden, true);
  assert.equal(attributes['aria-expanded'], 'false');
  head.onclick({ target: { closest:() => toggle } });
  assert.equal(panel.hidden, true, 'Un clic en el boton no debe togglear dos veces');
});

test('loader incluye version JS nueva sin cambiar CSS ni rutas PVO', () => {
  assert.match(loader, /dashboard-logistica\.js\?v=20261021-dashboard-fase5-v001/);
  assert.match(loader, /dashboard-logistica\.css\?v=20260923-dashboard-ppns-final-v001/);
  assert.match(loader, /logistica-produccion\.js\?v=/);
});
