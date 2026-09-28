'use strict';

const CATALOG_VERSION = '20260928-v001';

const SCENARIO_CATALOG = Object.freeze({
  SALUD: Object.freeze({
    code: 'SALUD',
    label: 'Salud',
    requests: Object.freeze([
      Object.freeze({ method: 'GET', path: '/api/health', think_seconds: 1 })
    ])
  }),
  HOME: Object.freeze({
    code: 'HOME',
    label: 'Home',
    requests: Object.freeze([
      Object.freeze({ method: 'GET', path: '/api/home/bootstrap', think_seconds: 2 })
    ])
  }),
  CALL_CENTER: Object.freeze({
    code: 'CALL_CENTER',
    label: 'Call Center',
    requests: Object.freeze([
      Object.freeze({ method: 'GET', path: '/api/operacion/dashboard-call-center/inicial', think_seconds: 2 })
    ])
  }),
  MIXTO_LECTURA: Object.freeze({
    code: 'MIXTO_LECTURA',
    label: 'Mixto lectura',
    requests: Object.freeze([
      Object.freeze({ method: 'GET', path: '/api/home/bootstrap', think_seconds: 2 }),
      Object.freeze({ method: 'GET', path: '/api/home/snapshot', think_seconds: 2 }),
      Object.freeze({ method: 'GET', path: '/api/operacion/dashboard-call-center/inicial', think_seconds: 3 }),
      Object.freeze({ method: 'GET', path: '/api/health', think_seconds: 1 })
    ])
  })
});

function publicScenarios() {
  return Object.values(SCENARIO_CATALOG).map(item => ({
    code: item.code,
    label: item.label
  }));
}

function runnerScenario(code) {
  const normalized = String(code || '').trim().toUpperCase();
  const item = SCENARIO_CATALOG[normalized];
  if (!item) return null;
  return {
    code: item.code,
    label: item.label,
    catalog_version: CATALOG_VERSION,
    requests: item.requests.map(request => ({ ...request }))
  };
}

function scenarioExists(code) {
  return Boolean(runnerScenario(code));
}

module.exports = {
  CATALOG_VERSION,
  SCENARIO_CATALOG,
  publicScenarios,
  runnerScenario,
  scenarioExists
};
