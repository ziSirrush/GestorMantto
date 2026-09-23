'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('Crear Estado de Cuenta COR queda registrado en navegación y loader', () => {
  const router = read('core/router.js');
  const loader = read('core/module-loader.js');
  assert.match(router, /cobranza-estados-cuenta-crear-nuevo/);
  assert.match(router, /ManttoCobranzaCorEstadoCuentaCrearNuevo/);
  assert.match(loader, /cobranza-cor-estados-cuenta-crear-nuevo\.js\?v=20260917-crear-estado-v001/);
  assert.match(loader, /cobranza-cor-estados-cuenta-crear-nuevo\.css\?v=20260917-crear-estado-v001/);
});

test('Backend expone catálogo y alta manual de Estados de Cuenta', () => {
  const routes = read('backend/src/modules/cobranza-cor/cobranza-cor.routes.js');
  const service = read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  const repository = read('backend/src/modules/cobranza-cor/cobranza-cor.repository.js');
  assert.match(routes, /get\('\/estados-cuenta\/crear-nuevo\/catalogo'/);
  assert.match(routes, /post\('\/estados-cuenta'/);
  assert.match(service, /async function crearEstadoCuenta_cor/);
  assert.match(repository, /equipos: 'cobranza_equipos_cor'/);
  assert.match(repository, /f\.orden_hito/);
  assert.match(repository, /f\.fecha_programada/);
  assert.match(repository, /f\.fecha_notificada/);
  assert.match(repository, /f\.estatus_hito/);
});

test('Alta usa PPNS, ins_fl y log_ops sin reintroducir Índice', () => {
  const createFrontend = read('modules/cobranza-cor/cobranza-cor-estados-cuenta-crear-nuevo.js');
  const service = read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  const repository = read('backend/src/modules/cobranza-cor/cobranza-cor.repository.js');
  const combined = [createFrontend, service, repository].join('\n');
  assert.match(createFrontend, /API_SAVE = '\/api\/cobranza-cor\/estados-cuenta'/);
  assert.match(repository, /FROM ins_fl fl/);
  assert.match(repository, /FROM log_ops lo/);
  assert.doesNotMatch(combined, /cobranza_indice_cor|id_indice_cor|idIndiceCor/);
});

test('Listado de Estados de Cuenta ofrece Crear nuevo', () => {
  const frontend = read('modules/cobranza-cor/cobranza-cor-estados-cuenta.js');
  assert.match(frontend, /id="ccor-ec-create-new"/);
  assert.match(frontend, /ManttoRouter\.go\('cobranza-estados-cuenta-crear-nuevo'/);
});
