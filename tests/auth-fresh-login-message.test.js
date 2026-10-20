'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'core', 'auth.js'), 'utf8');

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    key(index) { return [...values.keys()][index] || null; },
    get length() { return values.size; }
  };
}

async function runInit(initialLocalStorage) {
  const localStorage = memoryStorage(initialLocalStorage);
  const sessionStorage = memoryStorage();
  const elements = new Map();
  const createElement = () => ({
    textContent: '',
    className: '',
    value: '',
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}
  });
  ['login-msg', 'auth-screen', 'app', 'auth-bootstrap-screen', 'login-form',
    'first-login-form', 'recovery-form'].forEach(id => elements.set(id, createElement()));

  const window = {
    MANTTO_API_BASE: 'https://api.example.invalid',
    MANTTO_SESSION_API_BASE: 'https://api.example.invalid',
    navigator: {},
    location: { href: 'https://app.example.invalid/' },
    atob(value) { return Buffer.from(value, 'base64').toString('binary'); },
    setTimeout() { return 1; },
    clearTimeout() {},
    addEventListener() {}
  };
  const document = {
    title: 'BLT NOW',
    hidden: false,
    getElementById(id) { return elements.get(id) || null; },
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
    fetch: async () => ({
      ok: false,
      status: 401,
      async json() { return { ok:false, code:'SESSION_REQUIRED', message:'No hay sesión renovable.' }; }
    })
  };
  vm.runInNewContext(source, sandbox, { filename:'core/auth.js' });
  await window.ManttoAuth.init();
  return elements.get('login-msg');
}

test('un visitante nuevo ve el login limpio y no un falso aviso de sesion vencida', async () => {
  const message = await runInit({});
  assert.equal(message.textContent, '');
  assert.equal(message.className, 'auth-msg ');
});

test('un dispositivo con evidencia local conserva el aviso de sesion realmente vencida', async () => {
  const message = await runInit({ mantto_session: JSON.stringify({ created_at:'2026-10-19T00:00:00.000Z' }) });
  assert.match(message.textContent, /sesión renovable ya no es válida/i);
  assert.equal(message.className, 'auth-msg info');
});
