const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('modules/panel-control-prueba-carga/panel-control-prueba-carga.js', 'utf8');
const context = {
  window: { setTimeout: () => 1, clearTimeout: () => {} },
  document: { getElementById: () => null },
  Date, Intl, console
};
vm.runInNewContext(source, context);
const session = {
  id: 'LOAD-VISTA-PREVIA', state: 'EJECUTANDO', scenario: 'SALUD', vus: 10,
  duration_seconds: 120, created_at: new Date(Date.now() - 76000).toISOString(),
  started_at: new Date(Date.now() - 68000).toISOString(),
  expires_at: new Date(Date.now() + 52000).toISOString(), runner_claimed: true,
  telemetry: {
    runner: { target_vus: 10, max_vus_active: 10, latest: { vus_active: 10 } },
    http: { active: 3, completed: 124, errors: 2, rps_backend: 6.3, latency_recent: { p95_ms: 180 } },
    sql: { completed: 12, slow_queries: 1, errors: 0 },
    system: { latest: { node: { cpu_percent: 27 }, mysql: { Threads_running: 2 } } }
  }
};
const capabilities = {
  permissions: { access: true, execute: true, stop: true }, execution_available: true, stop_control_available: true,
  runner_runtime: { ready: true, single_instance_confirmed: true, target_configured: true },
  limits: { min_vus: 10, step_vus: 10, max_vus_configured: 200, duration_default_seconds: 120, duration_max_seconds: 300 },
  telemetry: { live_window_seconds: 10, finalization_timeout_seconds: 20, summary_timeout_seconds: 15 },
  scenarios: [{ code: 'SALUD', label: 'Salud' }], active_session: session
};
const box = { innerHTML: '' };
context.window.ManttoPanelControlPruebaCarga.render(box, capabilities);
const css = fs.readFileSync('modules/panel-control-prueba-carga/panel-control-prueba-carga.css', 'utf8');
fs.writeFileSync('.pclt-preview.html', `<!doctype html><html lang="es"><meta charset="utf-8"><style>body{margin:0;background:#f3f6fa;font:14px Arial,sans-serif}.pc-page{padding:18px;max-width:1500px;margin:auto}${css}</style><main class="pc-page">${box.innerHTML}</main></html>`);
