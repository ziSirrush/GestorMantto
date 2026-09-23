'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const repositoryPath = path.join(root, 'backend/src/modules/logistica-dashboard/logistica-dashboard.repository.js');
const servicePath = path.join(root, 'backend/src/modules/logistica-dashboard/logistica-dashboard.service.js');
const controllerPath = path.join(root, 'backend/src/modules/logistica-dashboard/logistica-dashboard.controller.js');
const frontendPath = path.join(root, 'modules/dashboard-logistica/dashboard-logistica.js');
const cssPath = path.join(root, 'modules/dashboard-logistica/dashboard-logistica.css');
const loaderPath = path.join(root, 'core/module-loader.js');

const repositorySource = fs.readFileSync(repositoryPath, 'utf8');
const serviceSource = fs.readFileSync(servicePath, 'utf8');
const controllerSource = fs.readFileSync(controllerPath, 'utf8');
const frontendSource = fs.readFileSync(frontendPath, 'utf8');
const cssSource = fs.readFileSync(cssPath, 'utf8');
const loaderSource = fs.readFileSync(loaderPath, 'utf8');

function loadCommonJs(source, requireMap) {
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require(id) {
      if (!(id in requireMap)) throw new Error('Unexpected require: ' + id);
      return requireMap[id];
    },
    console,
    setTimeout,
    clearTimeout
  };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})(require,module,exports);`, sandbox, { timeout: 2000 });
  return module.exports;
}

assert(repositorySource.includes('async function averageYears_cor()'), 'Debe publicar el catálogo de años registrados.');
assert(repositorySource.includes("CAST(LEFT(TRIM(fecha_salida_real), 4) AS UNSIGNED) = ?"), 'El filtro de año debe usar fecha_salida_real como número.');
assert(repositorySource.includes('async function averageDepartureByPort_cor(year = null)'), 'Salida por puerto debe aceptar año o histórico.');
assert(repositorySource.includes('async function averageTransitByPortMode_cor(year = null)'), 'Tránsito por modo debe aceptar año o histórico.');

const calls = [];
const fakeRepository = {
  statusCounts_cor: async () => [],
  deliveredByYear_cor: async () => [],
  averageYears_cor: async () => [{ anio: 2026 }, { anio: 2025 }, { anio: 2024 }],
  currentYearContainers_cor: async year => ({ contenedores_20_dc: 2, contenedores_40_hq: 3, operaciones_con_dato: 4, year }),
  currentYearContainersByMonth_cor: async () => [],
  averageDepartureByPort_cor: async year => { calls.push(['departure', year]); return []; },
  averageTransitByPortMode_cor: async year => { calls.push(['transit', year]); return []; }
};

const service = loadCommonJs(serviceSource, {
  './logistica-dashboard.repository': fakeRepository,
  '../../utils/temporal': { mexicoCityYear: () => 2026 }
});

(async () => {
  calls.length = 0;
  const current = await service.analytics_cor();
  assert.deepStrictEqual(calls, [['departure', 2026], ['transit', 2026]], 'Sin filtro debe usar el año actual en ambos promedios.');
  assert.strictEqual(current.promedios.periodo, 2026);
  assert.strictEqual(current.promedios.criterio_anio, 'fecha_salida_real');
  assert.deepStrictEqual(Array.from(current.promedios.anios_disponibles), [2026, 2025, 2024]);
  assert.strictEqual(current.contenedores.anio, 2026, 'El filtro de promedios no debe cambiar el ring anual.');

  calls.length = 0;
  const all = await service.analytics_cor('all');
  assert.deepStrictEqual(calls, [['departure', null], ['transit', null]], 'Todos los años debe quitar solo el filtro de año de promedios.');
  assert.strictEqual(all.promedios.periodo, 'all');
  assert.strictEqual(all.promedios.etiqueta, 'Todos los años');

  calls.length = 0;
  const historical = await service.analytics_cor('2025');
  assert.deepStrictEqual(calls, [['departure', 2025], ['transit', 2025]], 'Un año registrado debe aplicarse a los dos promedios.');
  assert.strictEqual(historical.promedios.periodo, 2025);

  const controllerCalls = [];
  const controller = loadCommonJs(controllerSource, {
    './logistica-dashboard.service': {
      analytics_cor: async period => {
        controllerCalls.push(period);
        return { promedios: { periodo: period } };
      }
    }
  });
  const req = { query: { anio_promedios: '2024' } };
  let payload = null;
  await controller.analytics_cor(req, { json(value) { payload = value; return value; } }, error => { throw error; });
  assert.deepStrictEqual(controllerCalls, ['2024']);
  assert(payload && payload.ok === true);

  assert(frontendSource.includes('id="dl-cut-select"'), 'Debe conservar el selector de cortes históricos.');
  assert(frontendSource.includes('id="dl-containers-months-first"') && frontendSource.includes('id="dl-containers-months-second"'), 'Debe conservar las dos tablas mensuales del ring.');
  assert(frontendSource.includes('id="dl-average-year-search"'), 'Frontend debe incluir barra de búsqueda.');
  assert(frontendSource.includes('list="dl-average-year-options"'), 'La barra debe sugerir años registrados.');
  assert(frontendSource.includes("anio_promedios="), 'Frontend debe mandar el filtro al backend.');
  assert(frontendSource.includes("'Todos los años'"), 'Frontend debe ofrecer histórico completo.');
  assert(frontendSource.includes('El año '+"'+year+'"+' no aparece entre los años registrados.'), 'Debe impedir años no registrados desde la UI.');
  assert(cssSource.includes('.dl-average-filter-card'), 'Debe existir estilo localizado para la barra.');
  assert(loaderSource.includes('20260923-dashboard-promedios-anio-v001'), 'Debe existir cache-bust del FIX.');

  console.log('OK - FIX_DASHBOARD_LOGISTICA_PROMEDIOS_POR_ANIO_V001');
  console.log('  Default: año actual por fecha_salida_real');
  console.log('  Filtro: Todos los años o año registrado');
  console.log('  Ring de contenedores permanece en el año actual por ETD');
})();
