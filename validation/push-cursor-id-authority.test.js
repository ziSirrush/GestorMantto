'use strict';

// [Aster | 2026-08-27 | ASTER-MG | FASE_1_CIERRE_LUMBRE_CURSOR_ID_UNICO_V001]
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const state = {
  notifications: [],
  sent: [],
  advances: [],
  queries: []
};

function resetState() {
  state.notifications = [];
  state.sent = [];
  state.advances = [];
  state.queries = [];
}

const repositoryMock = {
  async listPendingNotifications({ userId, cursorId, watermarkId, limit }) {
    state.queries.push({ userId, cursorId, watermarkId, limit });
    return state.notifications
      .filter((item) => item.id_notificacion > cursorId && item.id_notificacion <= watermarkId)
      .slice(0, limit);
  },
  async advanceSubscriptionCursor({ subscriptionId, cursorId, caughtUp }) {
    state.advances.push({ subscriptionId, cursorId, caughtUp });
    return { affectedRows: 1 };
  },
  async deactivateById() { return { affectedRows: 1 }; },
  async getNotificationWatermark() { return 0; },
  async listActiveSubscriptions() { return []; }
};

const senderMock = {
  getVapidConfig() { return {}; },
  validateVapidConfig() { return { ok: true }; },
  async sendPush(_subscription, payload) {
    state.sent.push(Number(payload.notificationId));
    return { ok: true };
  }
};

const loggerMock = { info() {}, warn() {}, error() {} };
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.endsWith('push-notifications.repository')) return repositoryMock;
  if (request.endsWith('push-notifications.sender')) return senderMock;
  if (request.endsWith('/shared/logger') || request.endsWith('\\shared\\logger')) return loggerMock;
  return originalLoad.call(this, request, parent, isMain);
};

let job;
try {
  job = require('../backend/src/jobs/pushNotifications.job');
} finally {
  Module._load = originalLoad;
}

function subscription(overrides = {}) {
  return {
    id_suscripcion: 900,
    id_usuario: 81,
    ultimo_id_notificacion: 100,
    endpoint: 'https://push.invalid/test',
    p256dh: 'test',
    auth: 'test',
    ...overrides
  };
}

test('ultimo_id_notificacion es la unica autoridad aunque exista un cursor legacy mayor', () => {
  assert.equal(job.cursorFor(subscription({
    ultimo_id_notificacion: 100,
    cursor_id_efectivo: 999,
    ultimo_uso_at: '2026-08-27 12:00:05'
  })), 100);
});

test('Notificacion tardia del mismo segundo no se pierde por un cursor legacy adelantado', async () => {
  resetState();
  process.env.WEB_PUSH_NOTIFICATIONS_PER_CYCLE = '20';
  state.notifications = [{
    id_notificacion: 101,
    tipo_notificacion: 'evento.prueba',
    titulo_notificacion: 'Evento 101',
    mensaje_notificacion: 'Mensaje',
    icono_notificacion: '',
    prioridad_notificacion: 'MEDIA',
    fecha_creacion: '2026-08-27 12:00:05'
  }];

  const result = await job.processSubscription(subscription({
    ultimo_id_notificacion: 100,
    cursor_id_efectivo: 101,
    ultimo_uso_at: '2026-08-27 12:00:05'
  }), 101);

  assert.equal(result.sent, 1);
  assert.deepEqual(state.sent, [101]);
  assert.deepEqual(state.queries.map((item) => item.cursorId), [100]);
  assert.equal(state.advances.at(-1).cursorId, 101);
});

test('Suscripcion sin cursor ID valido falla cerrado y no reenvia historicos desde cero', async () => {
  resetState();
  state.notifications = [{ id_notificacion: 1 }];

  await assert.rejects(
    () => job.processSubscription(subscription({ ultimo_id_notificacion: null }), 10),
    (error) => error && error.code === 'PUSH_SUBSCRIPTION_CURSOR_ID_INVALID'
  );

  assert.equal(state.queries.length, 0);
  assert.equal(state.sent.length, 0);
  assert.equal(state.advances.length, 0);
});

test('Repositorio lista suscripciones sin reconstruir cursor desde ultimo_uso_at', () => {
  const repository = fs.readFileSync(path.join(
    __dirname,
    '../backend/src/modules/push-notifications/push-notifications.repository.js'
  ), 'utf8');

  const start = repository.indexOf('async function listActiveSubscriptions');
  const end = repository.indexOf('async function getNotificationWatermark');
  const listBlock = repository.slice(start, end);

  assert.match(listBlock, /s\.ultimo_id_notificacion/);
  assert.doesNotMatch(listBlock, /cursor_id_efectivo/);
  assert.doesNotMatch(listBlock, /fecha_creacion/);
  assert.doesNotMatch(listBlock, /MAX\(n_cursor\.id_notificacion\)/);
  assert.doesNotMatch(listBlock, /GREATEST\s*\(/);
});
