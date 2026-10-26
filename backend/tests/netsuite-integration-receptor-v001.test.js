'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const path = require('node:path');
const contract = require('../src/modules/netsuite-integration/netsuite-integration.contract');
const auth = require('../src/middleware/integration-auth.middleware');

const loteId = '5ba8905a-8597-49ae-b5ed-d49e31d663e8';
const basePath = '/api/integraciones/netsuite/v1';
const secret = 'TEST_ONLY_BLT_NS_SECRET_NOT_A_REAL_CREDENTIAL_64_CHARACTERS';

function validBegin() {
  return {
    versionContrato: 1,
    loteId,
    origen: 'NETSUITE',
    dataset: 'PRUEBA',
    modoCarga: 'COMPLETA',
    busquedaGuardada: 'customsearch_integracion_piloto',
    fechaExtraccionUtc: '2026-10-26T17:00:00.000Z',
    filasEsperadas: 1,
    paginasEsperadas: 1,
    tamanoPagina: 300,
    columnas: [
      { indice: 0, nombre: 'internalid', join: null, summary: null, label: null },
      { indice: 1, nombre: 'entityid', join: null, summary: null, label: 'Empresa' }
    ]
  };
}

function validPage() {
  const filas = [{
    posicion: 1,
    idOrigen: '123',
    tipoOrigen: 'customer',
    valores: ['123', 'Cliente de prueba']
  }];
  return {
    pagina: 1,
    filas,
    hashPagina: crypto.createHash('sha256').update(JSON.stringify(filas), 'utf8').digest('hex')
  };
}

function validFinish() {
  return {
    loteId,
    hashCarga: crypto.createHash('sha256').update(validPage().hashPagina).digest('hex'),
    filasEsperadas: 1,
    paginasEsperadas: 1
  };
}

function captureError(f) {
  assert.throws(f, e => e.statusCode === 422 && typeof e.code === 'string');
}

test('Contrato: inicio compatible con SuiteScript V001', () => {
  const r = contract.validateBegin(validBegin());
  assert.deepEqual(r, { loteId, dataset: 'PRUEBA', paginasEsperadas: 1, numeroColumnas: 2 });
});

test('Contrato: rechaza versiones, origen y dataset incorrectos', () => {
  for (const [key, value] of [['versionContrato', 2], ['origen', 'GAS'], ['dataset', 'no permitido']]) {
    const b = validBegin(); b[key] = value;
    captureError(() => contract.validateBegin(b));
  }
});

test('Contrato: rechaza incongruencia entre paginas y filas', () => {
  const b = validBegin(); b.paginasEsperadas = 2;
  captureError(() => contract.validateBegin(b));
});

test('Contrato: rechaza metadatos de columnas inconsistentes', () => {
  const b = validBegin(); b.columnas[1].indice = 0;
  captureError(() => contract.validateBegin(b));
});

test('Contrato: pagina valida y SHA256 correcto', () => {
  const p = validPage();
  assert.deepEqual(contract.validatePage(loteId, p), {
    loteId, pagina: 1, hashPagina: p.hashPagina, cantidad: 1
  });
});

test('Contrato: rechaza pagina alterada sin actualizar firma hash', () => {
  const p = validPage(); p.filas[0].valores[1] = 'Valor manipulado';
  captureError(() => contract.validatePage(loteId, p));
});

test('Contrato: rechaza posicion incorrecta en pagina', () => {
  const p = validPage(); p.filas[0].posicion = 2;
  p.hashPagina = crypto.createHash('sha256').update(JSON.stringify(p.filas)).digest('hex');
  captureError(() => contract.validatePage(loteId, p));
});

test('Contrato: finalizacion valida y lote distinto rechazado', () => {
  const final = validFinish();
  assert.equal(contract.validateFinish(loteId, final).loteId, loteId);
  captureError(() => contract.validateFinish('1ba8905a-8597-49ae-b5ed-d49e31d663e8', final));
});

function fakeReq(method, url, payload, headers = {}) {
  const body = payload === null ? '' : JSON.stringify(payload);
  return {
    method,
    originalUrl: url,
    rawBody: Buffer.from(body),
    body: payload,
    get(name) { return headers[String(name).toLowerCase()]; }
  };
}

function sign(req, id = 'netsuite-bltnow', pass = secret, timestamp = String(Math.floor(Date.now() / 1000))) {
  const canonical = Buffer.concat([
    Buffer.from(`${timestamp}\n${req.method}\n${req.originalUrl}\n`),
    req.rawBody
  ]);
  const signature = crypto.createHmac('sha256', pass).update(canonical).digest('hex');
  const headers = {
    'x-integration-id': id,
    'x-integration-timestamp': timestamp,
    'x-integration-signature': signature
  };
  return fakeReq(req.method, req.originalUrl, req.body, headers);
}

function response() {
  return {
    statusCode: 200, payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

const originalEnv = {
  INTEGRATION_NETSUITE_ID: process.env.INTEGRATION_NETSUITE_ID,
  INTEGRATION_NETSUITE_SECRET: process.env.INTEGRATION_NETSUITE_SECRET,
  INTEGRATION_AUTH_ENABLED: process.env.INTEGRATION_AUTH_ENABLED
};
process.env.INTEGRATION_NETSUITE_ID = 'netsuite-bltnow';
process.env.INTEGRATION_NETSUITE_SECRET = secret;
process.env.INTEGRATION_AUTH_ENABLED = 'false';

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
process.once('exit', restoreEnv);

const requireNsAuth = auth.requireIntegrationAuthFor('INTEGRATION_NETSUITE_ID', {
  alwaysRequireAuth: true, algorithm: 'sha256'
});

test('Seguridad: exige firma aunque INTEGRATION_AUTH_ENABLED=false', () => {
  const req = fakeReq('GET', `${basePath}/estado`, null);
  const res = response();
  let passed = false;
  requireNsAuth(req, res, () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.code, 'INTEGRATION_AUTH_HEADERS_MISSING');
});

test('Seguridad: firma correcta del emisor y ruta exacta', () => {
  const req = sign(fakeReq('POST', `${basePath}/lotes`, validBegin()));
  const res = response();
  let passed = false;
  requireNsAuth(req, res, () => { passed = true; });
  assert.equal(passed, true);
  assert.equal(req.integrationAuth.integrationId, 'netsuite-bltnow');
});

test('Seguridad: firma con secreto incorrecto rechazada', () => {
  const req = sign(fakeReq('POST', `${basePath}/lotes`, validBegin()), 'netsuite-bltnow', 'OTRO_SECRETO');
  const res = response();
  let passed = false;
  requireNsAuth(req, res, () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.code, 'INTEGRATION_AUTH_INVALID_SIGNATURE');
});

test('Seguridad: identidad distinta rechazada', () => {
  const req = sign(fakeReq('POST', `${basePath}/lotes`, validBegin()), 'otra-integracion');
  const res = response();
  let passed = false;
  requireNsAuth(req, res, () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(res.statusCode, 401);
});

test('Seguridad: firma vencida rechazada', () => {
  const req = sign(fakeReq('POST', `${basePath}/lotes`, validBegin()), 'netsuite-bltnow', secret, '1698329999');
  const res = response();
  let passed = false;
  requireNsAuth(req, res, () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(res.payload.code, 'INTEGRATION_AUTH_EXPIRED_TIMESTAMP');
});

test('Seguridad: firma de una ruta no sirve para otra', () => {
  const signed = sign(fakeReq('POST', `${basePath}/lotes`, validBegin()));
  signed.originalUrl = `${basePath}/lotes/${loteId}/finalizar`;
  const res = response();
  let passed = false;
  requireNsAuth(signed, res, () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(res.payload.code, 'INTEGRATION_AUTH_INVALID_SIGNATURE');
});

test('Rutas: GET estado existe y POST de negocio no acusa exito antes de Aiven', () => {
  const recorder = { uses: [], posts: new Map(), gets: new Map() };
  const fakeExpress = {
    Router() {
      return {
        use(...handlers) { recorder.uses.push(handlers); },
        get(path, ...handlers) { recorder.gets.set(path, handlers); },
        post(path, ...handlers) { recorder.posts.set(path, handlers); }
      };
    }
  };
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'express') return fakeExpress;
    return originalLoad.apply(this, [request, parent, isMain]);
  };
  try {
    const target = require.resolve('../src/modules/netsuite-integration/netsuite-integration.routes');
    delete require.cache[target];
    require(target);
  } finally {
    Module._load = originalLoad;
  }
  assert.equal(recorder.uses.length, 1);
  assert.ok(recorder.gets.has('/estado'));
  assert.equal(recorder.posts.size, 3);
  const getResponse = response();
  recorder.gets.get('/estado')[0]({}, getResponse);
  assert.equal(getResponse.payload.persistenciaHabilitada, false);
  for (const [route, body] of [
    ['/lotes', validBegin()],
    ['/lotes/:loteId/paginas', validPage()],
    ['/lotes/:loteId/finalizar', validFinish()]
  ]) {
    const res = response();
    let error = null;
    recorder.posts.get(route)[0]({body,params:{loteId}}, res, e => { error = e; });
    assert.equal(error, null);
    assert.equal(res.statusCode, 503);
    assert.equal(res.payload.ok, false);
    assert.equal(res.payload.code, 'NS_DATASET_DESTINATION_PENDING');
  }
});
