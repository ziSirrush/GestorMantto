'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const service = fs.readFileSync(path.join(root, 'backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.service.js'), 'utf8');
const repository = fs.readFileSync(path.join(root, 'backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.repository.js'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'modules/instalaciones-dashboard/instalaciones-dashboard_cor.js'), 'utf8');
const policy = require('../backend/src/modules/instalaciones-administracion/instalaciones-administracion.field-policy');

test('Modo Junta autoriza campos persistidos visibles y bloquea calculados', () => {
  const start = service.indexOf('const REPORT_SECTIONS_COR = ');
  const end = service.indexOf('const REPORT_STATUS_CODES_COR = ', start);
  assert.ok(start >= 0 && end > start);
  const fragment = service.slice(start, end) +
    '\nthis.allowed = QUICK_EDIT_FIELDS_COR; this.labels = QUICK_EDIT_LABELS_COR;';
  const sandbox = {};
  vm.runInNewContext(fragment, sandbox);
  assert.ok(sandbox.allowed['01-SUS'].has('ciudad'));
  assert.ok(sandbox.allowed['01-SUS'].has('supervisor_fl'));
  assert.ok(sandbox.allowed['01-SUS'].has('vendedor'));
  assert.ok(sandbox.allowed['01-SUS'].has('fecha_cpvp'));
  assert.ok(sandbox.allowed['01-SUS'].has('avance_oc'));
  assert.ok(sandbox.allowed['04-M'].has('fecha_minuta_revision_ajuste'));
  assert.ok(sandbox.allowed['04-M'].has('fecha_fin_montaje_modificado'));
  assert.ok(sandbox.allowed['05-PA'].has('numero_pisos'));
  assert.ok(sandbox.allowed['05-PA'].has('fecha_liberacion_ajuste'));
  assert.ok(sandbox.allowed['08-T'].has('pendientes_calidad'));
  assert.equal(sandbox.allowed['04-M'].has('dias_restantes'), false);
  assert.equal(sandbox.allowed['04-M'].has('referencia_sitio'), false);
  assert.equal(sandbox.allowed['08-T'].has('activo'), false);
  assert.equal(sandbox.labels.ciudad, 'Ciudad');
});

test('Validaciones de fechas y porcentajes reutilizan politica de Administracion', () => {
  const start = service.indexOf('function normalizeQuickEditValue_cor(');
  const end = service.indexOf('function interactionValue_cor(', start);
  assert.ok(start >= 0 && end > start);
  const ctx = {
    DATE_FIELDS_COR: policy.DATE_FIELDS_COR,
    PERCENT_FIELDS_COR: policy.PERCENT_FIELDS_COR,
    MULTILINE_FIELDS_COR: policy.MULTILINE_FIELDS_COR,
    normalizeEditedFields_cor: policy.normalizeEditedFields_cor,
    REPORT_STATUS_CODES_COR: new Set(['01-SUS','02-OC','03-PM','04-M','05-PA','06-A','07-PE','08-T']),
    makeError_cor: (_status, code, message) => Object.assign(new Error(message), { code })
  };
  vm.runInNewContext(service.slice(start, end) + '\nthis.normalize = normalizeQuickEditValue_cor;', ctx);
  assert.equal(ctx.normalize('fecha_cpvp', '2026-11-06'), '2026-11-06');
  assert.throws(() => ctx.normalize('fecha_cpvp', '2026-02-31'), /fecha valida/i);
  assert.equal(ctx.normalize('avance_oc', '25'), '25%');
  assert.equal(ctx.normalize('pendientes_calidad', '  Texto  '), '  Texto  ');
  assert.equal(ctx.normalize('ciudad', '  Toluca  '), 'Toluca');
  assert.throws(() => ctx.normalize('estatus', '09-Z'), /estatus/i);
});

test('El frontend no recarga el reporte despues del PATCH y renderiza solo la celda', () => {
  const start = frontend.indexOf('async function saveCellEditor_cor()');
  const end = frontend.indexOf('function bindResultRows_cor()', start);
  assert.ok(start >= 0 && end > start);
  const save = frontend.slice(start, end);
  assert.doesNotMatch(save, /loadReport_cor\s*\(/);
  assert.doesNotMatch(save, /refreshAfterQuickEdit_cor/);
  assert.match(save, /applyQuickEditResult_cor\(context, response\)/);
  assert.match(save, /valor_anterior:context.previousValue/);
  assert.match(frontend, /context.cell.querySelector\('\.idb-cor-cell-value'\)/);
  assert.match(frontend, /identity.concat\(columns\).map/);
});

test('PATCH protege concurrencia y repositorio permite solo columnas validadas', () => {
  assert.match(service, /INSTALACIONES_DASHBOARD_STALE_VALUE/);
  assert.match(service, /updateReportField_cor\(id, field, nextValue, connection, allowed\)/);
  assert.match(repository, /allowedFields instanceof Set/);
  assert.match(repository, /allowedFields\.has\(column\)/);
  assert.match(repository, /UPDATE ins_fl SET/);
});
