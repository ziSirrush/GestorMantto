'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function loadInboxService(repositoryStub) {
  const modulePath = require.resolve('../backend/src/modules/notificaciones/notificaciones.service');
  delete require.cache[modulePath];
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === './notificaciones.repository') return repositoryStub;
    if (request === '../../services/notifications/notification.service') return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[modulePath];
  }
}

test('la campanita muestra la accion y consume la ruta masiva', () => {
  const homeSource = read('modules/home/home.js');
  const stylesSource = read('styles/home.css');
  const indexSource = read('index.html');

  assert.match(homeSource, /id="hdr-notif-mark-all">Marcar todo como visto/);
  assert.match(homeSource, /apiRequest\('\/api\/notificaciones\/abrir-todas', \{ method:'PATCH' \}\)/);
  assert.match(homeSource, /state\.unreadNotificationCount = 0/);
  assert.match(stylesSource, /\.hdr-notif-mark-all/);
  assert.equal((indexSource.match(/20260914-notif-mark-all-v001/g) || []).length, 2);
});

test('la ruta masiva queda protegida por el mismo router autenticado', () => {
  const routesSource = read('backend/src/modules/notificaciones/notificaciones.routes.js');
  assert.match(routesSource, /router\.use\(requireAuth\)/);
  assert.match(routesSource, /router\.patch\('\/notificaciones\/abrir-todas', notificacionesController\.abrirTodasLasNotificaciones\)/);
});

test('marcar todas usa el usuario autenticado y conserva el alcance de la campana', async () => {
  let receivedQuery = null;
  const service = loadInboxService({
    async marcarTodasComoAbiertas(query) {
      receivedQuery = query;
      return { affectedRows: 4 };
    }
  });

  const result = await service.abrirTodasLasNotificaciones({
    contextUser: { id_SB: 42, correo: 'persona@example.com', iniciales: 'ABC' },
    query: {}
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.data.actualizadas, 4);
  assert.match(receivedQuery.whereSql, /n\.id_usuario = \?/);
  assert.match(receivedQuery.whereSql, /pendientes_usuarios/);
  assert.deepEqual(receivedQuery.params.slice(0, 4), [42, 'persona@example.com', 'persona@example.com', 'ABC']);
});

test('marcar todas rechaza una sesion sin usuario y no escribe', async () => {
  let called = false;
  const service = loadInboxService({
    async marcarTodasComoAbiertas() {
      called = true;
      return { affectedRows: 1 };
    }
  });

  const result = await service.abrirTodasLasNotificaciones({ contextUser: {}, query: {} });
  assert.equal(result.status, 401);
  assert.equal(called, false);
});

test('el UPDATE masivo solo toca notificaciones nuevas, activas y visibles', () => {
  const repositorySource = read('backend/src/modules/notificaciones/notificaciones.repository.js');
  assert.match(repositorySource, /async function marcarTodasComoAbiertas\(\{ whereSql, params \}\)/);
  assert.match(repositorySource, /SET n\.leido = 1/);
  assert.match(repositorySource, /AND n\.leido = 0/);
  assert.match(repositorySource, /bellVisibilitySql_gnral\('n', 'e', 'p'\)/);
});
