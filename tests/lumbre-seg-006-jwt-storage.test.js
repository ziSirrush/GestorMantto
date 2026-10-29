'use strict';
// [Lumbre | 2026-10-29 | LUMBRE-MG | PRUEBA_VISOR_CANAL_EFIMERO_V002]

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'core', 'auth.js'), 'utf8');
const viewerSource = fs.readFileSync(path.join(ROOT, 'core', 'user-viewer.js'), 'utf8');

class MemoryBroadcastChannel {
  static groups = new Map();

  static reset() { this.groups.clear(); }

  constructor(name) {
    this.name = name;
    this.onmessage = null;
    this.closed = false;
    const channels = MemoryBroadcastChannel.groups.get(name) || new Set();
    channels.add(this);
    MemoryBroadcastChannel.groups.set(name, channels);
  }

  postMessage(data) {
    const channels = MemoryBroadcastChannel.groups.get(this.name) || new Set();
    channels.forEach(channel => {
      if (channel !== this && !channel.closed) channel.onmessage?.({ data });
    });
  }

  close() {
    this.closed = true;
    MemoryBroadcastChannel.groups.get(this.name)?.delete(this);
  }
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    key(index) { return [...values.keys()][index] || null; },
    get length() { return values.size; }
  };
}

function fixture(payload, options = {}) {
  if (options.resetChannels !== false) MemoryBroadcastChannel.reset();
  const localStorage = memoryStorage(options.localStorage);
  const sessionStorage = memoryStorage(options.sessionStorage);
  const timers = [];
  const alerts = [];
  const window = {
    MANTTO_API_BASE: 'https://api.example.invalid',
    MANTTO_SESSION_API_BASE: 'https://api.example.invalid',
    ManttoDevicePermissions: { async requireForSession() { return true; } },
    navigator: {},
    location: { href: options.href || 'https://app.example.invalid/' },
    history: { state: null, replaceState() {} },
    opener: {},
    closed: false,
    alert(message) { alerts.push(String(message)); },
    close() { this.closed = true; },
    atob(value) { return Buffer.from(value, 'base64').toString('binary'); },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    clearTimeout() {},
    addEventListener() {},
    BroadcastChannel: MemoryBroadcastChannel
  };
  const document = {
    title: 'BLT NOW',
    hidden: false,
    getElementById() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    dispatchEvent() {}
  };
  const sandbox = {
    Buffer,
    URL,
    URLSearchParams,
    FormData: global.FormData,
    CustomEvent: function CustomEvent() {},
    console,
    document,
    localStorage,
    sessionStorage,
    window,
    fetch: options.fetch || (async () => ({ ok: true, status: 200, async json() { return payload; } }))
  };
  vm.runInNewContext(source, sandbox, { filename: 'core/auth.js' });
  return { window, localStorage, sessionStorage, alerts };
}

test('el JWT de acceso queda limitado a sessionStorage', async () => {
  const token = 'header.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.signature';
  const payload = { ok: true, token, user: { id_SB: 7 }, session_csrf_token: 'csrf-value' };
  const { window, localStorage, sessionStorage } = fixture(payload);

  await window.ManttoAuth.api('/api/auth/login', { method: 'GET' });

  assert.equal(sessionStorage.getItem('mantto_token'), token);
  assert.equal(localStorage.getItem('mantto_token'), null);
  assert.equal(localStorage.getItem('mantto_user'), null);
  assert.equal(localStorage.getItem('mantto_session'), null);
  assert.equal(localStorage.getItem('mantto_session_csrf'), 'csrf-value');
});

test('el JWT temporal del visor se entrega por un canal efímero y no por almacenamiento compartido', () => {
  const { window, localStorage, sessionStorage } = fixture({ ok: true });
  const url = window.ManttoAuth.createViewerLaunch({
    user: { id_SB: 22, nombre: 'Vista' },
    viewer_token: 'viewer.jwt.signature'
  });

  const launchId = new URL(url).searchParams.get('viewer_launch');
  const receiver = new window.BroadcastChannel(`mantto:viewer:launch:${launchId}`);
  let received = null;
  receiver.onmessage = event => { received = event.data; };
  receiver.postMessage({ type: 'MANTTO_VIEWER_READY', launch_id: launchId });

  assert.match(url, /viewer_launch=viewer-/);
  assert.equal(received.type, 'MANTTO_VIEWER_CONTEXT');
  assert.equal(received.payload.viewer_token, 'viewer.jwt.signature');
  assert.equal(received.payload.user.id_SB, 22);
  assert.equal(sessionStorage.getItem('mantto_viewer_token'), null);
  assert.equal([...localStorage.values.values()].some(value => value.includes('viewer.jwt.signature')), false);
  receiver.postMessage({ type: 'MANTTO_VIEWER_RECEIVED', launch_id: launchId });
  receiver.close();
});

test('la pestaña del visor consume el canal y arranca con la identidad seleccionada', async () => {
  const actor = { id_SB: 7, nombre: 'Actor' };
  const viewed = { id_SB: 22, nombre: 'Vista' };
  const token = 'header.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.signature';
  const parent = fixture({ ok: true });
  const url = parent.window.ManttoAuth.createViewerLaunch({
    user: viewed,
    viewer_token: 'viewer.jwt.signature'
  });
  const child = fixture(null, {
    resetChannels: false,
    href: url,
    sessionStorage: {
      mantto_token: token,
      mantto_user: JSON.stringify(actor),
      mantto_session: JSON.stringify({ token, user: actor })
    },
    fetch: async requestUrl => {
      const json = String(requestUrl).endsWith('/api/panel-control/viewer-bootstrap')
        ? { ok: true, data: { usuario: viewed } }
        : { ok: true, user: actor };
      return { ok: true, status: 200, async json() { return json; } };
    }
  });

  await child.window.ManttoAuth.init();

  assert.equal(child.alerts.length, 0);
  assert.equal(child.window.closed, false);
  assert.equal(child.window.ManttoAuth.isViewingAs(), true);
  assert.equal(child.window.ManttoAuth.getUser().id_SB, 22);
  assert.equal(child.sessionStorage.getItem('mantto_viewer_token'), 'viewer.jwt.signature');
});

test('el código no vuelve a escribir JWT o sesión de actor en localStorage', () => {
  assert.doesNotMatch(source, /localStorage\.setItem\((?:TOKEN_KEY|USER_KEY|SESSION_KEY)/);
  assert.doesNotMatch(source, /localStorage\.getItem\(TOKEN_KEY\).*\|\|\s*['"]/);
  assert.doesNotMatch(source, /VIEWER_LAUNCH_PREFIX/);
  assert.doesNotMatch(source, /targetWindow\?\.sessionStorage/);
  assert.match(source, /launchedViewUser=await consumeViewerLaunch\(\)/);
  assert.doesNotMatch(viewerSource, /createViewerLaunch\?\.\([^;]+viewerWindow\);/s);
});
