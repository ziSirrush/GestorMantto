'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const sourcePath = path.join(root, 'modules', 'panel-control-prueba-carga', 'panel-control-prueba-carga.js');

function harness() {
  let source = fs.readFileSync(sourcePath, 'utf8');
  source = source.replace(
    /window\.ManttoPanelControlPruebaCarga=\{[\s\S]*?\n  \};\n\}\)\(\);\s*$/,
    'window.__pcltUi={state,render,progressSnapshot,addConsoleEvent,clearLocalSession};})();'
  );
  const context = {
    window: { setTimeout: () => 1, clearTimeout: () => {} },
    document: { getElementById: () => null },
    Date,
    Intl,
    console
  };
  vm.runInNewContext(source, context);
  assert.ok(context.window.__pcltUi, 'se cargó el módulo real de la interfaz');
  return context.window.__pcltUi;
}

function capabilities(session) {
  return {
    permissions: { access: true, execute: true, stop: true },
    execution_available: true,
    stop_control_available: true,
    runner_runtime: { ready: true, single_instance_confirmed: true, target_configured: true },
    limits: { min_vus: 10, step_vus: 10, max_vus_configured: 200, duration_default_seconds: 120, duration_max_seconds: 300 },
    telemetry: { finalization_timeout_seconds: 20, summary_timeout_seconds: 15, live_window_seconds: 10 },
    scenarios: [{ code: 'SALUD', label: 'Salud' }],
    active_session: session
  };
}

function session(overrides = {}) {
  return {
    id: 'LOAD-UI-TEST', state: 'LISTA', scenario: 'SALUD', vus: 10, duration_seconds: 120,
    created_at: '2026-09-28T12:00:00.000Z', started_at: null,
    expires_at: '2026-09-28T12:15:00.000Z', runner_claimed: false,
    telemetry: { http: { completed: 0, errors: 0, rps_backend: 0 }, sql: { errors: 0 } },
    ...overrides
  };
}

test('UI: temporizador distingue espera, ejecución y cierre anticipado', () => {
  const ui = harness();
  const at = Date.parse('2026-09-28T12:01:00.000Z');
  const ready = ui.progressSnapshot(session(), at);
  assert.equal(ready.percent, 0);
  assert.equal(ready.remaining, '14:00');

  const running = ui.progressSnapshot(session({ state: 'EJECUTANDO', started_at: '2026-09-28T12:00:00.000Z' }), at);
  assert.equal(running.percent, 50);
  assert.equal(running.elapsed, '01:00');
  assert.equal(running.remaining, '01:00');

  const stopped = ui.progressSnapshot(session({
    state: 'ABORTADA_MANUAL', started_at: '2026-09-28T12:00:00.000Z', stopped_at: '2026-09-28T12:00:30.000Z'
  }), at);
  assert.equal(stopped.percent, 25);
  assert.equal(stopped.elapsed, '00:30');
  assert.equal(stopped.remaining, '—');
});

test('UI: sesión LISTA muestra comando, temporizador y consola legibles', () => {
  const ui = harness();
  const box = { innerHTML: '' };
  const prepared = session();
  ui.render(box, capabilities(prepared));
  assert.match(box.innerHTML, /Siguiente paso: iniciar k6 en PowerShell/);
  assert.match(box.innerHTML, /iniciar-mantto-load-test\.ps1/);
  assert.match(box.innerHTML, /Copiar comando/);
  assert.match(box.innerHTML, /role="progressbar"/);
  assert.match(box.innerHTML, /Eventos en vivo/);
  assert.match(box.innerHTML, /Esperando el launcher externo/);
});

test('UI: consola temporal marca tráfico, errores y transición sin exponer token', () => {
  const ui = harness();
  const box = { innerHTML: '' };
  const prepared = session({ runner_token: 'SECRETO_NO_MOSTRAR' });
  ui.render(box, capabilities(prepared));
  const running = session({
    state: 'EJECUTANDO', runner_claimed: true, runner_token: 'SECRETO_NO_MOSTRAR',
    started_at: '2026-09-28T12:00:00.000Z',
    telemetry: { http: { completed: 12, errors: 2, rps_backend: 6 }, sql: { errors: 1 } }
  });
  ui.state.session = running;
  ui.render(box, capabilities(running));
  assert.match(box.innerHTML, /Runner conectado/);
  assert.match(box.innerHTML, /LISTA → EJECUTANDO/);
  assert.match(box.innerHTML, /Tráfico: \+12 HTTP/);
  assert.match(box.innerHTML, /Errores HTTP backend: \+2/);
  assert.match(box.innerHTML, /Errores SQL: \+1/);
  assert.doesNotMatch(box.innerHTML, /SECRETO_NO_MOSTRAR/);

  for (let index = 0; index < 80; index += 1) ui.addConsoleEvent(`Evento ${index}`);
  assert.equal(ui.state.consoleEvents.length, 50);
  ui.clearLocalSession();
  assert.equal(ui.state.consoleEvents.length, 0);
});

test('UI: el módulo usa superficies claras y texto oscuro del Panel de Control', () => {
  const css = fs.readFileSync(path.join(root, 'modules', 'panel-control-prueba-carga', 'panel-control-prueba-carga.css'), 'utf8');
  assert.match(css, /\.pclt-card,\.pclt-session-card\{[\s\S]*?background:#fff/);
  assert.match(css, /\.pclt-head\{[\s\S]*?background:linear-gradient\(135deg,#17202a,#263547\)/);
  assert.match(css, /\.pclt-card input,\.pclt-card select\{[\s\S]*?background:#fff;color:var\(--pclt-ink\)/);
  assert.match(css, /\.pclt-console\{[\s\S]*?background:#17202a;color:#e8f2ff/);
});
