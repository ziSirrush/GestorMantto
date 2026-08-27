'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const state = {
  notifications: [],
  sent: [],
  cursor: 0,
  advances: [],
  queries: [],
  deactivated: [],
  failId: null,
  failStatus: null,
  failOnce: false
};

function resetState(count = 0) {
  state.notifications = Array.from({ length: count }, (_, index) => ({
    id_notificacion: index + 1,
    tipo_notificacion: 'evento.prueba',
    titulo_notificacion: `Evento ${index + 1}`,
    mensaje_notificacion: 'Mensaje',
    icono_notificacion: '',
    prioridad_notificacion: 'MEDIA',
    fecha_creacion: '2026-08-27 12:00:00'
  }));
  state.sent = [];
  state.cursor = 0;
  state.advances = [];
  state.queries = [];
  state.deactivated = [];
  state.failId = null;
  state.failStatus = null;
  state.failOnce = false;
}

const repositoryMock = {
  async listPendingNotifications({ userId, cursorId, watermarkId, limit }) {
    state.queries.push({ userId, cursorId, watermarkId, limit });
    return state.notifications
      .filter((item) => item.id_notificacion > cursorId && item.id_notificacion <= watermarkId)
      .slice(0, limit);
  },
  async advanceSubscriptionCursor({ subscriptionId, cursorId, caughtUp }) {
    state.cursor = Math.max(state.cursor, Number(cursorId || 0));
    state.advances.push({ subscriptionId, cursorId: Number(cursorId || 0), caughtUp: Boolean(caughtUp) });
    return { affectedRows: 1 };
  },
  async deactivateById(subscriptionId) {
    state.deactivated.push(subscriptionId);
    return { affectedRows: 1 };
  },
  async getNotificationWatermark() {
    return state.notifications.reduce((max, item) => Math.max(max, item.id_notificacion), 0);
  },
  async listActiveSubscriptions() {
    return [];
  }
};

const senderMock = {
  getVapidConfig() { return {}; },
  validateVapidConfig() { return { ok: true }; },
  async sendPush(_subscription, payload) {
    if (state.failId === Number(payload.notificationId)) {
      const error = new Error('Fallo controlado');
      if (state.failStatus != null) error.statusCode = state.failStatus;
      if (state.failOnce) state.failId = null;
      throw error;
    }
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

function subscription() {
  return {
    id_suscripcion: 900,
    id_usuario: 81,
    ultimo_id_notificacion: state.cursor,
    cursor_id_efectivo: state.cursor,
    endpoint: 'https://push.invalid/test',
    p256dh: 'test',
    auth: 'test'
  };
}

async function runUntilCaughtUp(watermarkId, maxCycles = 20) {
  const results = [];
  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const result = await job.processSubscription(subscription(), watermarkId);
    results.push(result);
    if (result.caughtUp) return results;
  }
  throw new Error('No se alcanzo el watermark dentro del maximo de ciclos de prueba.');
}

test('Rafaga de 45 se entrega 20 + 20 + 5 sin saltos', async () => {
  resetState(45);
  process.env.WEB_PUSH_NOTIFICATIONS_PER_CYCLE = '20';

  const results = await runUntilCaughtUp(45);

  assert.deepEqual(results.map((item) => item.sent), [20, 20, 5]);
  assert.equal(state.cursor, 45);
  assert.deepEqual(state.sent, Array.from({ length: 45 }, (_, index) => index + 1));
});

test('Rafaga de 100 conserva todos los ids y no adelanta el cursor antes de tiempo', async () => {
  resetState(100);
  process.env.WEB_PUSH_NOTIFICATIONS_PER_CYCLE = '20';

  const results = await runUntilCaughtUp(100);

  assert.equal(results.length, 5);
  assert.deepEqual(results.map((item) => item.sent), [20, 20, 20, 20, 20]);
  assert.equal(state.cursor, 100);
  assert.equal(new Set(state.sent).size, 100);
});

test('25 notificaciones con la misma fecha se recorren por id sin perdida', async () => {
  resetState(25);
  state.notifications.forEach((item) => { item.fecha_creacion = '2026-08-27 12:34:56'; });
  process.env.WEB_PUSH_NOTIFICATIONS_PER_CYCLE = '20';

  const results = await runUntilCaughtUp(25);

  assert.deepEqual(results.map((item) => item.sent), [20, 5]);
  assert.deepEqual(state.sent, Array.from({ length: 25 }, (_, index) => index + 1));
});

test('Fallo temporal en id 17 conserva cursor 16 y reintenta desde 17 sin duplicar 1-16', async () => {
  resetState(25);
  process.env.WEB_PUSH_NOTIFICATIONS_PER_CYCLE = '20';
  state.failId = 17;
  state.failOnce = true;

  await assert.rejects(() => job.processSubscription(subscription(), 25), /Fallo controlado/);
  assert.equal(state.cursor, 16);
  assert.deepEqual(state.sent, Array.from({ length: 16 }, (_, index) => index + 1));

  await runUntilCaughtUp(25);
  assert.deepEqual(state.sent, Array.from({ length: 25 }, (_, index) => index + 1));
  assert.equal(new Set(state.sent).size, 25);
});

test('410 conserva progreso previo y desactiva la suscripcion', async () => {
  resetState(10);
  process.env.WEB_PUSH_NOTIFICATIONS_PER_CYCLE = '20';
  state.failId = 5;
  state.failStatus = 410;

  const result = await job.processSubscription(subscription(), 10);

  assert.equal(result.expired, true);
  assert.equal(state.cursor, 4);
  assert.deepEqual(state.sent, [1, 2, 3, 4]);
  assert.deepEqual(state.deactivated, [900]);
});

test('Notificacion creada despues del watermark queda para el siguiente ciclo', async () => {
  resetState(21);
  process.env.WEB_PUSH_NOTIFICATIONS_PER_CYCLE = '20';

  const first = await job.processSubscription(subscription(), 20);
  assert.equal(first.caughtUp, true);
  assert.equal(state.cursor, 20);
  assert.equal(state.sent.includes(21), false);

  const second = await job.processSubscription(subscription(), 21);
  assert.equal(second.sent, 1);
  assert.equal(state.cursor, 21);
  assert.equal(state.sent.at(-1), 21);
});

test('Sin filas elegibles avanza de forma segura al watermark', async () => {
  resetState(0);
  state.cursor = 10;

  const result = await job.processSubscription(subscription(), 30);

  assert.equal(result.sent, 0);
  assert.equal(result.caughtUp, true);
  assert.equal(state.cursor, 30);
});

test('Limite invalido nunca se convierte en LIMIT 0', () => {
  process.env.WEB_PUSH_NOTIFICATIONS_PER_CYCLE = '0';
  assert.equal(job.notificationLimit(), 20);
  process.env.WEB_PUSH_NOTIFICATIONS_PER_CYCLE = '-5';
  assert.equal(job.notificationLimit(), 20);
  process.env.WEB_PUSH_NOTIFICATIONS_PER_CYCLE = 'no-numero';
  assert.equal(job.notificationLimit(), 20);
  process.env.WEB_PUSH_NOTIFICATIONS_PER_CYCLE = '5000';
  assert.equal(job.notificationLimit(), 100);
});

test('Repositorio usa cursor y watermark por id, no fecha, para el despacho pendiente', () => {
  const repository = fs.readFileSync(path.join(
    __dirname,
    '../backend/src/modules/push-notifications/push-notifications.repository.js'
  ), 'utf8');

  const start = repository.indexOf('async function listPendingNotifications');
  const end = repository.indexOf('async function advanceSubscriptionCursor');
  const pendingBlock = repository.slice(start, end);

  assert.match(pendingBlock, /n\.id_notificacion\s*>\s*\?/);
  assert.match(pendingBlock, /n\.id_notificacion\s*<=\s*\?/);
  assert.match(pendingBlock, /ORDER BY n\.id_notificacion ASC/);
  assert.doesNotMatch(pendingBlock, /n\.fecha_creacion\s*>\s*\?/);
  assert.match(repository, /MAX\(id_notificacion\).*watermark_id/s);
  assert.match(repository, /GREATEST\(COALESCE\(ultimo_id_notificacion, 0\), \?\)/);
});

test('Migracion conserva el equivalente del cursor temporal y no crea tablas nuevas', () => {
  const migration = fs.readFileSync(path.join(
    __dirname,
    '../backend/sql/20260827_FIX_PUSH_CURSOR_ID_V001.sql'
  ), 'utf8');

  assert.match(migration, /ADD COLUMN ultimo_id_notificacion INT UNSIGNED NULL/);
  assert.match(migration, /MAX\(n\.id_notificacion\)/);
  assert.match(migration, /n\.fecha_creacion\s*<=\s*COALESCE\(s\.ultimo_uso_at, s\.created_at\)/);
  assert.doesNotMatch(migration, /CREATE TABLE/i);
});
