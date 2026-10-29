'use strict';
// [Lumbre | 2026-10-29 | LUMBRE-MG | PRUEBA_JWT_SIN_LOCALSTORAGE_V001]

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'core', 'auth.js'), 'utf8');

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

function fixture(payload) {
  const localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  const timers = [];
  const window = {
    MANTTO_API_BASE: 'https://api.example.invalid',
    MANTTO_SESSION_API_BASE: 'https://api.example.invalid',
    navigator: {},
    location: { href: 'https://app.example.invalid/' },
    history: { state: null, replaceState() {} },
    atob(value) { return Buffer.from(value, 'base64').toString('binary'); },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    clearTimeout() {},
    addEventListener() {}
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
    fetch: async () => ({ ok: true, status: 200, async json() { return payload; } })
  };
  vm.runInNewContext(source, sandbox, { filename: 'core/auth.js' });
  return { window, localStorage, sessionStorage };
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

test('el JWT temporal del visor se entrega solo al sessionStorage de la pestaña destino', () => {
  const { window, localStorage } = fixture({ ok: true });
  const targetStorage = memoryStorage();
  const url = window.ManttoAuth.createViewerLaunch({
    user: { id_SB: 22, nombre: 'Vista' },
    viewer_token: 'viewer.jwt.signature'
  }, { sessionStorage: targetStorage });

  assert.match(url, /viewer_launch=session/);
  assert.equal(targetStorage.getItem('mantto_viewer_token'), 'viewer.jwt.signature');
  assert.equal(JSON.parse(targetStorage.getItem('mantto_view_user')).id_SB, 22);
  assert.equal([...localStorage.values.values()].some(value => value.includes('viewer.jwt.signature')), false);
});

test('el código no vuelve a escribir JWT o sesión de actor en localStorage', () => {
  assert.doesNotMatch(source, /localStorage\.setItem\((?:TOKEN_KEY|USER_KEY|SESSION_KEY)/);
  assert.doesNotMatch(source, /localStorage\.getItem\(TOKEN_KEY\).*\|\|\s*['"]/);
  assert.doesNotMatch(source, /VIEWER_LAUNCH_PREFIX/);
});
