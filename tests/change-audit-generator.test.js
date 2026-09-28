'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { collect, generate } = require('../tools/generate-change-audit');

const SHA = 'a'.repeat(40);
function record(id, overrides = {}) {
  return {
    schema_version: 1, change_id: id, title: 'Resultado final', module: 'Instalaciones',
    company: 'GENERAL', type: 'correction', layer: ['FRONTEND'],
    final_summary: 'Comportamiento vigente', reason: 'Omisión', user_impact: 'Reporte completo',
    status: 'published', finalized_at: '2026-09-28T00:00:00-06:00',
    responsible: 'Programador', validation: 'PDF revisado',
    references: { commit: SHA, issue: null, pull_request: null }, ...overrides
  };
}
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mantto-audit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function put(dir, data, name = data.change_id) {
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(data));
}

test('un change_id conserva solo el resultado final; borradores y cancelados no cuentan', t => {
  const dir = fixture(t);
  const id = 'MG-2026-09-INSTALACIONES-PDF';
  put(dir, record(id, { final_summary: 'Versión 1', finalized_at: '2026-09-20T12:00:00-06:00' }));
  put(dir, record(id, { final_summary: 'Versión 5', finalized_at: '2026-09-28T00:00:00-06:00' }));
  put(dir, record('MG-2026-09-DRAFT', { status: 'draft', references: {} }));
  put(dir, record('MG-2026-09-CANCELLED', { status: 'cancelled', references: {} }));
  assert.deepEqual(collect(dir).map(item => item.final_summary), ['Versión 5']);
  put(dir, record('MG-2026-09-OTHER'));
  assert.equal(collect(dir).length, 2);
});

test('rechaza duplicados, fechas inválidas, SHA corto y campos publicados vacíos', t => {
  const dir = fixture(t);
  const id = 'MG-2026-09-ONE';
  put(dir, record(id));
  put(dir, record(id), 'MG-2026-09-TWO');
  assert.throws(() => collect(dir), /duplicado/);
  fs.rmSync(path.join(dir, 'MG-2026-09-TWO.json'));
  for (const [field, value, expected] of [
    ['finalized_at', '2026-09-28T00:00:00', /zona horaria/],
    ['finalized_at', '2026-02-30T00:00:00-06:00', /inexistente/],
    ['references', { commit: 'abc' }, /SHA completo/],
    ['title', '', /title obligatorio/],
    ['status', 'review', /status inválido/],
    ['layer', ['FRONTEND', 'FRONTEND'], /layer inválida/]
  ]) {
    put(dir, record(id, { [field]: value }));
    assert.throws(() => collect(dir), expected);
  }
});

test('genera orden estable y serializa texto no confiable sin ejecutar HTML', t => {
  const dir = fixture(t);
  const output = path.join(dir, 'generated.js');
  put(dir, record('MG-2026-09-B', { title: '</script><script>alert(1)</script>' }));
  put(dir, record('MG-2026-09-A'));
  const payload = generate({ dir, output, commit: SHA, generatedAt: '2026-09-28T12:00:00.000Z' });
  assert.deepEqual(payload.changes.map(item => item.change_id), ['MG-2026-09-A', 'MG-2026-09-B']);
  const source = fs.readFileSync(output, 'utf8');
  assert.doesNotMatch(source, /<script>/);
  const context = { window: {} };
  vm.runInNewContext(source, context);
  assert.equal(context.window.MANTTO_CHANGE_AUDIT.changes[1].title, '</script><script>alert(1)</script>');
});

test('actualiza la versión de caché de ambos metadatos con el commit de despliegue', t => {
  const dir = fixture(t);
  const output = path.join(dir, 'generated.js');
  const indexPath = path.join(dir, 'index.html');
  fs.writeFileSync(indexPath, '<script src="./core/build-info.generated.js?v=old"></script><script src="./core/change-audit.generated.js?v=old"></script>');
  generate({ dir, output, indexPath, commit: SHA, generatedAt: '2026-09-28T12:00:00.000Z' });
  const html = fs.readFileSync(indexPath, 'utf8');
  assert.match(html, new RegExp(`build-info\\.generated\\.js\\?v=${SHA}`));
  assert.match(html, new RegExp(`change-audit\\.generated\\.js\\?v=${SHA}`));
});

test('semana CDMX, alcance por rol y contenido escapado en la interfaz', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'panel-control', 'panel-control.js'), 'utf8')
    .replace(/\}\)\(\);\s*$/, 'window.__auditTest={auditWeekKey,renderChangeAudit,state,auditCompaniesForUser};})();');
  const box = { innerHTML: '', querySelector: () => null };
  const user = { rol: 'Programador Corellian' };
  const context = {
    window: { ManttoAuth: { getUser: () => user }, MANTTO_BUILD_INFO: { provider: 'LOCAL', commit: SHA }, MANTTO_CHANGE_AUDIT: {
      schemaVersion: 1, generatedAt: '2026-09-28T12:00:00Z', buildCommit: SHA,
      changes: [
        record('MG-2026-09-GENERAL', { title: '<img src=x onerror=alert(1)>', finalized_at: '2026-09-27T23:59:00-06:00' }),
        record('MG-2026-09-CORELLIAN', { company: 'CORELLIAN' }),
        record('MG-2026-09-UNITED', { company: 'UNITED', title: 'UNITED_SECRETO' })
      ]
    } },
    sessionStorage: { getItem: () => null }, document: {}, Intl, Date, URL, setTimeout
  };
  vm.runInNewContext(source, context);
  const audit = context.window.__auditTest;
  assert.equal(audit.auditWeekKey(new Date('2026-09-27T23:59:00-06:00')), '2026-09-21');
  assert.equal(audit.auditWeekKey(new Date('2026-09-28T00:00:00-06:00')), '2026-09-28');
  assert.deepEqual(Array.from(audit.auditCompaniesForUser()), ['GENERAL', 'CORELLIAN']);
  audit.state.auditWeek = '2026-09-28';
  audit.renderChangeAudit(box);
  assert.match(box.innerHTML, /MG-2026-09-CORELLIAN|Resultado final/);
  assert.doesNotMatch(box.innerHTML, /UNITED_SECRETO/);
  assert.match(box.innerHTML, /<b>1<\/b><span>Cambios lógicos/);
  context.window.MANTTO_CHANGE_AUDIT.changes.push(record('MG-2026-09-CORELLIAN-SECOND', { company: 'CORELLIAN', title: 'Segundo resultado' }));
  audit.renderChangeAudit(box);
  assert.match(box.innerHTML, /<b>2<\/b><span>Cambios lógicos/);
  assert.match(box.innerHTML, /<b>1<\/b><span>Módulos afectados/);
  audit.state.auditType = 'feature';
  audit.renderChangeAudit(box);
  assert.match(box.innerHTML, /<b>0<\/b><span>Cambios lógicos/);
  audit.state.auditType = '';
  audit.state.auditWeek = '2026-09-21';
  audit.renderChangeAudit(box);
  assert.match(box.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(box.innerHTML, /<img src=x/);
  context.window.MANTTO_BUILD_INFO.commit = 'b'.repeat(40);
  audit.renderChangeAudit(box);
  assert.match(box.innerHTML, /No se pudo cargar el registro de Auditoría de esta versión/);
  assert.doesNotMatch(box.innerHTML, /&lt;img src=x onerror/);
});
