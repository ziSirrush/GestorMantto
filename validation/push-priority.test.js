'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.endsWith('push-notifications.repository')) return {};
  if (request.endsWith('push-notifications.sender')) {
    return {
      getVapidConfig() { return {}; },
      validateVapidConfig() { return { ok: false, reason: 'test' }; },
      async sendPush() { return { ok: true }; }
    };
  }
  if (request.endsWith('/shared/logger') || request.endsWith('\\shared\\logger')) {
    return { info() {}, warn() {}, error() {} };
  }
  return originalLoad.call(this, request, parent, isMain);
};

let job;
try {
  job = require('../backend/src/jobs/pushNotifications.job');
} finally {
  Module._load = originalLoad;
}

function notification(priority, icon = '✅') {
  return {
    id_notificacion: 10,
    tipo_notificacion: 'evento.prueba',
    titulo_notificacion: 'Evento de prueba',
    mensaje_notificacion: 'Mensaje',
    icono_notificacion: icon,
    prioridad_notificacion: priority
  };
}

test('Push propaga prioridad y antepone el indicador visual no critico', () => {
  assert.equal(job.payloadFor(notification('ALTA')).title, '🟠 ✅ Evento de prueba');
  assert.equal(job.payloadFor(notification('MEDIA', '💬')).title, '🟡 💬 Evento de prueba');
  assert.equal(job.payloadFor(notification('BAJA', '')).title, '⚪ Evento de prueba');
  assert.equal(job.payloadFor(notification('CRITICA', '🚨🆘')).title, '🚨🆘 Evento de prueba');
  assert.equal(job.payloadFor(notification('CRITICA')).priority, 'CRITICA');
});

test('Urgencia y TTL siguen CRITICA, ALTA, MEDIA y BAJA', () => {
  assert.deepEqual(job.deliveryOptionsFor(notification('CRITICA')), { ttl: 300, urgency: 'high' });
  assert.deepEqual(job.deliveryOptionsFor(notification('ALTA')), { ttl: 900, urgency: 'high' });
  assert.deepEqual(job.deliveryOptionsFor(notification('MEDIA')), { ttl: 3600, urgency: 'normal' });
  assert.deepEqual(job.deliveryOptionsFor(notification('BAJA')), { ttl: 86400, urgency: 'low' });
});

test('Repositorio y Service Worker transportan y aplican la prioridad', () => {
  const repository = fs.readFileSync(path.join(
    __dirname,
    '../backend/src/modules/push-notifications/push-notifications.repository.js'
  ), 'utf8');
  const worker = fs.readFileSync(path.join(__dirname, '../service-worker.js'), 'utf8');

  assert.match(repository, /prioridad_default/);
  assert.match(repository, /prioridad_notificacion/);
  assert.match(worker, /payload\.priority/);
  assert.match(worker, /requireInteraction/);
  assert.match(worker, /CRITICA/);
});
