'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('el Detalle móvil intercala cuentas generales e hitos por tipo', () => {
  const css = read('modules/cobranza-cor/cobranza-cor-estados-cuenta.css');
  const marker = '/* [Aster | 2026-11-18 | ASTER-MG | COBRANZA COR DETALLE MOVIL REACOMODO V001]';
  const start = css.indexOf(marker);
  const end = css.indexOf('/* [Aster | 2026-09-30 | ASTER-MG | COBRANZA COR FASE 4 DETALLE FACTURAS V001] */', start);

  assert.ok(start >= 0 && end > start);
  const mobile = css.slice(start, end);

  assert.match(mobile, /@media \(max-width:760px\)/);
  assert.match(mobile, /\.ccor-ec-detail-page > \.ccor-ec-summary-grid\{display:contents\}/);
  assert.match(mobile, /\.ccor-ec-summary-card\.is-supply\{order:3\}/);
  assert.match(mobile, /\.ccor-ec-account-section\.is-supply\{order:4\}/);
  assert.match(mobile, /\.ccor-ec-summary-card\.is-installation\{order:5\}/);
  assert.match(mobile, /\.ccor-ec-account-section\.is-installation\{order:6\}/);
});

test('el reacomodo no modifica la distribución de escritorio y renueva el CSS de la PWA', () => {
  const css = read('modules/cobranza-cor/cobranza-cor-estados-cuenta.css');
  const app = read('core/app.js');

  assert.match(css, /\.ccor-ec-summary-grid\{\s*display:grid;\s*grid-template-columns:1fr 1fr;/);
  assert.match(app, /cobranza-cor-estados-cuenta\.css\?v=20261118-facturas-consolidacion-v001/);
});
