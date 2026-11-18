'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pdf = fs.readFileSync(path.join(root, 'modules/cobranza-cor/cobranza-cor-estados-cuenta-pdf.js'), 'utf8');
const loaderPath = path.join(root, 'core/module-loader.js');

test('PDF COR conserva la pantalla renderizada sin recalcular datos', () => {
  assert.match(pdf, /cloneNode\(true\)/);
  assert.match(pdf, /#view-placeholder \.ccor-ec-detail-page/);
  assert.match(pdf, /ccor-ec-project-header/);
  assert.match(pdf, /ccor-ec-summary-grid/);
  assert.match(pdf, /\.ccor-ec-account-section/);
  assert.doesNotMatch(pdf, /ManttoHttp|\bfetch\s*\(|\bXMLHttpRequest\b|applyFuenteRules_cor|buildFrontendSummary_cor/);
});

test('PDF COR excluye las tablas de Facturas, Pagos y controles de edicion', () => {
  assert.match(pdf, /\.ccor-ec-facturas-section/);
  assert.match(pdf, /\.ccor-ec-pagos-section/);
  assert.match(pdf, /snapshot\.querySelectorAll\(ignore\.join\(','\)\)/);
  assert.match(pdf, /snapshot\.querySelectorAll\('button'\)/);
  assert.match(pdf, /ccor-ec-pdf-static-value/);
  assert.match(pdf, /\[data-payment-breakdown-toggle\]/);
});

test('PDF COR abre impresion A3 horizontal solo desde la vista de detalle', () => {
  assert.match(pdf, /currentRoute_cor\(\)!==ROUTE/);
  assert.match(pdf, /@page\{size:A3 landscape;margin:10mm\}/);
  assert.match(pdf, /window\.print\(\)/);
  assert.match(pdf, /afterprint/);
  assert.match(pdf, /MutationObserver/);
});

test('PDF COR se carga desde la ruta de Estados de Cuenta y no globalmente', () => {
  const loader = fs.readFileSync(loaderPath, 'utf8');
  const entry = loader.split('\n').find(line => line.includes("'cobranza-estados-cuenta':"));
  assert.ok(entry, 'Falta la ruta de Cobranza COR');
  assert.match(entry, /cobranza-cor-estados-cuenta-pdf\.js\?v=/);
  const others = loader.split('\n').filter(line => line.includes('cobranza-cor-estados-cuenta-pdf.js') && !line.includes("'cobranza-estados-cuenta':"));
  assert.equal(others.length, 0, 'El PDF no debe cargarse en otros modulos');
});

test('PDF COR no permite exportar hasta aprobar el formato', () => {
  const vm = require('node:vm');
  assert.match(pdf, /const PDF_EXPORT_ENABLED_COR=false;/);
  assert.match(pdf, /btn\.disabled=!PDF_EXPORT_ENABLED_COR;/);
  assert.match(pdf, /PDF en revisión/);
  assert.match(pdf, /if\(!PDF_EXPORT_ENABLED_COR\) return false;/);
  let calls = 0;
  const fakeWindow = { print(){ calls += 1; } };
  const fakeDocument = {
    readyState:'loading',
    addEventListener(){},
    querySelector(){ throw new Error('La exportacion no debe consultar la vista'); }
  };
  vm.runInNewContext(pdf, {window:fakeWindow,document:fakeDocument}, {timeout:1000});
  assert.equal(fakeWindow.ManttoCobranzaCorEstadoCuentaPdf.print(), false);
  assert.equal(calls, 0);
});
