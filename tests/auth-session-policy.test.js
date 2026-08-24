'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const jwt = require('../backend/node_modules/jsonwebtoken');

const root = path.resolve(__dirname, '..');
const secret = 'test-only-session-secret';

function loadInternals(relativePath, appendedSource, dependencyStubs) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8') + appendedSource;
  const loadedModule = { exports: {} };
  const sandbox = {
    Buffer,
    Date,
    console,
    module: loadedModule,
    exports: loadedModule.exports,
    process: { env: { JWT_SECRET: secret, JWT_EXPIRES_IN: '5m', NODE_ENV: 'production' } },
    require(request) {
      if (Object.prototype.hasOwnProperty.call(dependencyStubs, request)) {
        return dependencyStubs[request];
      }
      throw new Error(`Dependencia no simulada: ${request}`);
    }
  };
  vm.runInNewContext(source, sandbox, { filename });
  return loadedModule.exports.__sessionPolicyTests;
}

function storage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    key(index) { return [...values.keys()][index] || null; },
    get length() { return values.size; }
  };
}

async function testBackendPolicy() {
  const controllerPolicy = loadInternals(
    'backend/src/controllers/auth.controller.js',
    '\nmodule.exports.__sessionPolicyTests = { signSessionToken, sessionExpiryTimestamp, MAX_SESSION_SECONDS };',
    {
      bcrypt: {},
      jsonwebtoken: jwt,
      '../config/db': {},
      '../middleware/auth.middleware': { loadUserRoles: async () => [] },
      '../services/auth-session.service': {
        createRefreshSession: async () => ({}),
        rotateRefreshSession: async () => ({}),
        revokeCurrentSession: async () => {},
        revokeUserSessions: async () => {}
      }
    }
  );

  const user = {
    id_SB: 7,
    correo: 'session-test@example.invalid',
    rol: 'Usuario',
    roles: ['Usuario'],
    password_changed_at: new Date('2026-01-01T00:00:00Z')
  };
  const absoluteExpiresAt = new Date(Date.now() + 90 * 86400 * 1000);
  const regularToken = controllerPolicy.signSessionToken(user, user.roles, absoluteExpiresAt);
  const regularPayload = jwt.verify(regularToken, secret);

  assert.strictEqual(controllerPolicy.MAX_SESSION_SECONDS, 12 * 60 * 60);
  assert.strictEqual(regularPayload.exp - regularPayload.iat, 12 * 60 * 60);
  assert.strictEqual(
    regularPayload.session_absolute_expires_at,
    Math.floor(absoluteExpiresAt.getTime() / 1000)
  );

  const nearAbsoluteExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const finalToken = controllerPolicy.signSessionToken(user, user.roles, nearAbsoluteExpiresAt);
  const finalPayload = jwt.verify(finalToken, secret);
  assert.strictEqual(finalPayload.exp, Math.floor(nearAbsoluteExpiresAt.getTime() / 1000));
  assert.throws(
    () => controllerPolicy.sessionExpiryTimestamp(new Date(Date.now() - 1000)),
    error => error && error.code === 'SESSION_ABSOLUTE_EXPIRED'
  );

  let sessionMode = 'create';
  let insertedSession = null;
  let rotatedSession = null;
  const sessionDb = {
    async query(sql, params) {
      if (sessionMode === 'create' && sql.includes('INSERT INTO auth_sessions')) {
        insertedSession = params;
        return [{ insertId: 1 }];
      }
      if (sessionMode === 'rotate' && sql.includes('FROM auth_sessions')) {
        return [[{
          id_session: 1,
          usuario_id: user.id_SB,
          token_hash: insertedSession[1],
          csrf_hash: insertedSession[2],
          session_version: insertedSession[3],
          session_started_at: insertedSession[4],
          idle_expires_at: insertedSession[5],
          absolute_expires_at: insertedSession[6]
        }]];
      }
      if (sessionMode === 'rotate' && sql.includes('UPDATE auth_sessions')) {
        rotatedSession = params;
        return [{ affectedRows: 1 }];
      }
      throw new Error(`SQL de sesión no esperado: ${sql.slice(0, 80)}`);
    }
  };
  const sessionPolicy = loadInternals(
    'backend/src/services/auth-session.service.js',
    '\nmodule.exports.__sessionPolicyTests = { cookieValue, IDLE_DAYS, ABSOLUTE_DAYS, createRefreshSession, rotateRefreshSession };',
    {
      crypto: require('crypto'),
      '../config/db': sessionDb,
      '../middleware/auth.middleware': { hydrateAuthUser: async () => user }
    }
  );
  const cookie = sessionPolicy.cookieValue(
    { secure: true, get: () => '' },
    'refresh-token',
    90 * 86400
  );
  assert.strictEqual(sessionPolicy.IDLE_DAYS, 90);
  assert.strictEqual(sessionPolicy.ABSOLUTE_DAYS, 90);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=None/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Partitioned/);
  assert.match(cookie, /Max-Age=7776000/);

  const request = {
    secure: true,
    ip: '127.0.0.1',
    headers: { cookie: '' },
    get(name) {
      if (name === 'User-Agent') return 'auth-session-policy-test';
      if (name === 'X-Session-CSRF') return this.csrfToken || '';
      return '';
    }
  };
  const response = {
    cookies: [],
    append(name, value) {
      if (name === 'Set-Cookie') this.cookies.push(value);
    }
  };
  const startedAt = new Date();
  const created = await sessionPolicy.createRefreshSession(request, response, user, startedAt);
  assert.strictEqual(
    new Date(created.absoluteExpiresAt).getTime() - startedAt.getTime(),
    90 * 86400 * 1000
  );
  assert.strictEqual(
    new Date(created.idleExpiresAt).getTime(),
    new Date(created.absoluteExpiresAt).getTime()
  );

  const refreshCookie = response.cookies[0].split(';')[0];
  request.headers.cookie = refreshCookie;
  request.csrfToken = created.csrfToken;
  sessionMode = 'rotate';
  const rotated = await sessionPolicy.rotateRefreshSession(request, response);
  assert.strictEqual(
    new Date(rotated.absoluteExpiresAt).getTime(),
    new Date(created.absoluteExpiresAt).getTime()
  );
  assert.strictEqual(
    new Date(rotatedSession[1]).getTime(),
    new Date(created.absoluteExpiresAt).getTime()
  );
}

async function testFrontendSchedulingAndCsrfRotation() {
  const localStorage = storage();
  const sessionStorage = storage();
  const timers = [];
  const fetchCalls = [];
  let nextPayload = null;
  const window = {
    MANTTO_API_BASE: 'https://api.example.invalid',
    MANTTO_SESSION_API_BASE: 'https://api.example.invalid',
    navigator: {},
    location: { href: 'https://app.example.invalid/' },
    atob(value) { return Buffer.from(value, 'base64').toString('binary'); },
    setTimeout(callback, delay) {
      timers.push({ callback, delay, cleared: false });
      return timers.length;
    },
    clearTimeout(id) {
      if (timers[id - 1]) timers[id - 1].cleared = true;
    },
    addEventListener() {}
  };
  const document = {
    hidden: false,
    getElementById() { return null; },
    querySelectorAll() { return []; },
    dispatchEvent() {},
    addEventListener() {}
  };
  const sandbox = {
    Buffer,
    Date,
    URL,
    URLSearchParams,
    FormData: global.FormData,
    CustomEvent: function CustomEvent() {},
    console,
    document,
    localStorage,
    sessionStorage,
    window,
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() { return nextPayload; }
      };
    }
  };
  const authSource = fs.readFileSync(path.join(root, 'core/auth.js'), 'utf8');
  vm.runInNewContext(authSource, sandbox, { filename: 'core/auth.js' });

  const absoluteSeconds = Math.floor((Date.now() + 90 * 86400 * 1000) / 1000);
  nextPayload = {
    ok: true,
    token: jwt.sign({ session_absolute_expires_at: absoluteSeconds }, secret, { expiresIn: '12h' }),
    user: { id_SB: 7, nombre: 'Prueba' },
    session_csrf_token: 'csrf-rotado-1'
  };
  await window.ManttoAuth.api('/api/auth/login', { method: 'GET' });

  const regularTimer = timers[timers.length - 1];
  const expectedDelay = (12 * 60 - 5) * 60 * 1000;
  assert(Math.abs(regularTimer.delay - expectedDelay) < 5000);
  assert.strictEqual(localStorage.getItem('mantto_session_csrf'), 'csrf-rotado-1');
  assert.strictEqual(fetchCalls[0].options.credentials, 'include');

  const finalAbsoluteSeconds = Math.floor((Date.now() + 60 * 60 * 1000) / 1000);
  nextPayload = {
    ok: true,
    token: jwt.sign({
      session_absolute_expires_at: finalAbsoluteSeconds,
      exp: finalAbsoluteSeconds
    }, secret),
    user: { id_SB: 7, nombre: 'Prueba' },
    session_csrf_token: 'csrf-rotado-2'
  };
  await window.ManttoAuth.api('/api/auth/first-login/password', { method: 'GET' });

  const finalTimer = timers[timers.length - 1];
  assert(finalTimer.delay > 59 * 60 * 1000);
  assert(finalTimer.delay <= 60 * 60 * 1000 + 1000);
  assert.strictEqual(localStorage.getItem('mantto_session_csrf'), 'csrf-rotado-2');
}

(async () => {
  await testBackendPolicy();
  await testFrontendSchedulingAndCsrfRotation();
  console.log('OK auth-session-policy');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
