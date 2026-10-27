'use strict';

// [Aster | 2026-10-20 | ASTER-MG | INT9 M2M/HMAC QA V001]
// Prueba local aislada: sin Azure, Aiven, credenciales reales o dependencias HTTP.
// Ejecutar desde la raiz del repositorio:
//   node --test tests/instalaciones-programacion-personal-m2m.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const Module = require('node:module');

const moduleDir = path.resolve(__dirname, '../backend/src/modules/instalaciones-programacion-personal');
const routePath = path.join(moduleDir, 'instalaciones-programacion-personal.routes.js');
const servicePath = path.join(moduleDir, 'instalaciones-programacion-personal.service.js');
const FULL_PATH = '/api/instalaciones/programacion/personal';
const TEST_SECRET = 'solo-para-qa-local-int9-valor-no-productivo';
let rows = [];
let counter = 100;
let messages = [];

const db = {
  async execute(sql, values = []) {
    if (/INSERT INTO instalaciones_personal/.test(sql)) {
      const [tipo_personal,nombre,contratista,puesto,categoria,experiencia,created_by,updated_by] = values;
      if (rows.some(x => x.tipo_personal === tipo_personal && x.nombre === nombre &&
          (x.contratista || '') === (contratista || '') && x.activo === 1)) {
        const error = new Error('duplicate');
        error.code = 'ER_DUP_ENTRY';
        throw error;
      }
      const id_personal = ++counter;
      rows.push({id_personal,tipo_personal,nombre,contratista,puesto,categoria,experiencia,
        created_by,updated_by,activo:1,created_at:'2026-10-20',updated_at:'2026-10-20'});
      return [{insertId:id_personal}];
    }
    if (/WHERE id_personal=\? AND tipo_personal=\? AND activo=1/.test(sql)) {
      const [id,tipo] = values;
      return [rows.filter(x => x.id_personal === id && x.tipo_personal === tipo && x.activo === 1)];
    }
    throw new Error(`Consulta DB no simulada: ${sql.slice(0,120)}`);
  }
};

const registered = [];
const express = {
  Router() {
    const router = {};
    for (const method of ['get','post','put','delete']) {
      router[method] = (pattern, ...handlers) => {
        registered.push({method:method.toUpperCase(),pattern,handlers});
        return router;
      };
    }
    return router;
  }
};

function humanRequireAuth(req, res, next) {
  if (!req.get('authorization')?.startsWith('Bearer ') || !req.user?.id_SB) {
    return res.status(401).json({ok:false,code:'SESSION_REQUIRED'});
  }
  return next();
}
function humanScope(req, res, next) {
  if (req.user.domain !== 'CORELLIAN') {
    return res.status(403).json({ok:false,code:'SCOPE_DENIED'});
  }
  return next();
}

const originalLoader = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename === routePath) {
    if (request === 'express') return express;
    if (request === '../../middleware/information-access-gnral.middleware') {
      return {humanInformationGuard_gnral: () => [humanRequireAuth, humanScope]};
    }
    if (request === '../../services/permissions/effective-permission.service') {
      return {hasEffectivePermission:async (userId, code) => Number(userId) === 42 && code.endsWith('.CREAR')};
    }
    // INT9 Ajustadores F3: la ruta importa este servicio en inicializacion.
    // La prueba M2M del catalogo lo aisla para no abrir Aiven/credenciales.
    if (request === './instalaciones-programacion-personal.asignaciones.service' ||
        request === './instalaciones-programacion-personal.analitica.service' ||
        request === './instalaciones-programacion-personal.ajustadores-sync.service') return {};
  }
  if (parent?.filename === servicePath) {
    if (request === '../../config/db') return db;
    if (request === './instalaciones-programacion-personal.asignaciones.service') return {};
  }
  return originalLoader.call(this, request, parent, isMain);
};
let router;
let service;
try {
  service = require(servicePath);
  router = require(routePath);
} finally {
  Module._load = originalLoader;
}
assert.ok(router);
assert.ok(service.crear);

function requestHeaders(body, params = {}) {
  const timestamp = params.timestamp || String(Math.floor(Date.now()/1000));
  const id = params.id || 'ventas-appscript';
  const secret = params.secret || TEST_SECRET;
  const canonicalPath = params.path || FULL_PATH;
  const canonical = `${timestamp}\nPOST\n${canonicalPath}\n${JSON.stringify(body)}`;
  return {
    'X-Integration-Id': id,
    'X-Integration-Timestamp': timestamp,
    'X-Integration-Signature': crypto.createHmac('sha256',secret).update(canonical).digest('hex')
  };
}

async function invoke(fn, req, res) {
  return new Promise((resolve,reject) => {
    let done = false;
    function next(value) {
      if (done) return;
      done = true;
      resolve({called:true,value});
    }
    try {
      Promise.resolve(fn(req,res,next)).then(() => {
        if (!done) resolve({called:false});
      },reject);
    } catch (error) { reject(error); }
  });
}

async function run(body, headers = {}, user = null) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key,value]) => [key.toLowerCase(),value])
  );
  const req = {
    method:'POST', originalUrl:FULL_PATH, body,
    rawBody:Buffer.from(JSON.stringify(body)),
    user,
    get(name) { return normalized[String(name).toLowerCase()]; }
  };
  const res = {
    statusCode:200, body:null, ended:false,
    status(code) {this.statusCode=code;return this;},
    json(value) {this.body=value;this.ended=true;return this;}
  };
  for (const route of registered.filter(x => x.method === 'POST' && x.pattern === '/programacion/personal')) {
    let skipRoute = false;
    for (const fn of route.handlers) {
      const result = await invoke(fn,req,res);
      if (result.called) {
        if (result.value === 'route') {skipRoute=true;break;}
        if (result.value) throw result.value;
        continue;
      }
      if (res.ended) return res;
      throw new Error('Middleware no devolvio respuesta ni next()');
    }
    if (!skipRoute && res.ended) return res;
  }
  throw new Error('Ninguna ruta respondio');
}

const montador = Object.freeze({tipo:'MONTADOR',nombre:'Juan QATest',contratista:'Alfa Test',puesto:'Mecánico',categoria:'A'});
const ajustador = Object.freeze({tipo:'AJUSTADOR',nombre:'Miguel QATest',categoria:'B',experiencia:'5 años'});
const user = Object.freeze({id_SB:42,domain:'CORELLIAN'});

test.beforeEach(() => {
  rows=[];counter=100;messages=[];
  process.env.INTEGRATION_VENTAS_ID='ventas-appscript';
  process.env.INTEGRATION_VENTAS_SECRET=TEST_SECRET;
  process.env.INTEGRATION_AUTH_ENABLED='false';
  console.info = (...args) => messages.push(args);
});
const realInfo = console.info;
test.after(() => {
  console.info=realInfo;
  delete process.env.INTEGRATION_VENTAS_ID;
  delete process.env.INTEGRATION_VENTAS_SECRET;
  delete process.env.INTEGRATION_AUTH_ENABLED;
});

test('HMAC valido acepta Montador con flag global off, FK de usuario NULL y log de origen',async()=>{
  const response=await run({...montador,created_by:123,updated_by:456},requestHeaders({...montador,created_by:123,updated_by:456}));
  assert.equal(response.statusCode,201);
  assert.equal(response.body.data.tipo,'MONTADOR');
  assert.equal(rows[0].created_by,null);
  assert.equal(rows[0].updated_by,null);
  assert.equal(messages[0]?.[0],'INT9_PERSONAL_ALTA_M2M');
  assert.equal(messages[0]?.[1]?.integration_id,'ventas-appscript');
  assert.equal(messages[0]?.[1]?.id_personal,101);
});

test('HMAC valido acepta Ajustador sin token JWT',async()=>{
  const response=await run(ajustador,requestHeaders(ajustador));
  assert.equal(response.statusCode,201);
  assert.equal(rows[0].contratista,null);
  assert.equal(rows[0].puesto,null);
  assert.equal(rows[0].experiencia,'5 años');
});

test('Sin HMAC ni JWT responde 401 y no inserta',async()=>{
  const response=await run(montador);
  assert.equal(response.statusCode,401);
  assert.equal(rows.length,0);
});

test('HMAC parcial aun con JWT valido no retrocede a sesion humana',async()=>{
  const response=await run(montador,{'X-Integration-Id':'ventas-appscript','Authorization':'Bearer dummy'},user);
  assert.equal(response.statusCode,401);
  assert.equal(response.body.code,'INTEGRATION_AUTH_HEADERS_MISSING');
  assert.equal(rows.length,0);
});

test('HMAC incorrecto bloqueado, no inserta',async()=>{
  const response=await run(montador,{...requestHeaders(montador),'X-Integration-Signature':'0'.repeat(64)});
  assert.equal(response.statusCode,401);
  assert.equal(response.body.code,'INTEGRATION_AUTH_INVALID_SIGNATURE');
  assert.equal(rows.length,0);
});

test('HMAC vencido bloqueado',async()=>{
  const response=await run(montador,requestHeaders(montador,{timestamp:String(Math.floor(Date.now()/1000)-3600)}));
  assert.equal(response.statusCode,401);
  assert.equal(response.body.code,'INTEGRATION_AUTH_EXPIRED_TIMESTAMP');
  assert.equal(rows.length,0);
});

test('Otra identidad M2M autorizada globalmente no se admite en INT9',async()=>{
  process.env.INTEGRATION_LOGISTICA_ID='logistica-appscript';
  process.env.INTEGRATION_LOGISTICA_SECRET=TEST_SECRET;
  try {
    const response=await run(montador,requestHeaders(montador,{id:'logistica-appscript'}));
    assert.equal(response.statusCode,401);
    assert.equal(response.body.code,'INTEGRATION_AUTH_WRONG_ROUTE_ID');
    assert.equal(rows.length,0);
  } finally {
    delete process.env.INTEGRATION_LOGISTICA_ID;
    delete process.env.INTEGRATION_LOGISTICA_SECRET;
  }
});

test('Secret de Ventas faltante bloquea la integracion',async()=>{
  delete process.env.INTEGRATION_VENTAS_SECRET;
  const response=await run(montador,requestHeaders(montador));
  assert.equal(response.statusCode,401);
  assert.equal(response.body.code,'INTEGRATION_AUTH_UNKNOWN_ID');
  assert.equal(rows.length,0);
});

test('JWT humano conserva Guard y created_by reales',async()=>{
  const response=await run(montador,{'Authorization':'Bearer dummy'},user);
  assert.equal(response.statusCode,201);
  assert.equal(rows[0].created_by,42);
  assert.equal(rows[0].updated_by,42);
  assert.equal(messages.length,0);
});

test('JWT sin permiso y JWT fuera CORELLIAN bloqueados',async()=>{
  let response=await run(montador,{'Authorization':'Bearer dummy'},{id_SB:11,domain:'CORELLIAN'});
  assert.equal(response.statusCode,403);
  response=await run(montador,{'Authorization':'Bearer dummy'},{id_SB:42,domain:'UNITED'});
  assert.equal(response.statusCode,403);
  assert.equal(rows.length,0);
});

test('Reenvio identico se rechaza con 409 (duplicados protegidos)',async()=>{
  const headers=requestHeaders(montador);
  const first=await run(montador,headers);
  const second=await run(montador,headers);
  assert.equal(first.statusCode,201);
  assert.equal(second.statusCode,409);
  assert.equal(second.body.code,'INT9_PERSONA_DUPLICADA');
  assert.equal(rows.length,1);
});

test('Las demas mutaciones INT9 conservan sus guards JWT originales',()=>{
  assert.ok(registered.some(x => x.method==='PUT' && x.pattern==='/programacion/personal/:tipo/:id'));
  assert.ok(registered.some(x => x.method==='DELETE' && x.pattern==='/programacion/personal/:tipo/:id'));
  assert.equal(registered.filter(x => x.method==='POST' && x.pattern==='/programacion/personal').length,2);
  assert.ok(registered.some(x=>x.method==='POST'&&x.pattern==='/programacion/asignaciones'));
});

test('HMAC valido tambien funciona con el flag global activo', async () => {
  process.env.INTEGRATION_AUTH_ENABLED = 'true';
  const response = await run(ajustador, requestHeaders(ajustador));
  assert.equal(response.statusCode, 201);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].created_by, null);
});

test('La firma HMAC depende de los bytes del cuerpo recibido', async () => {
  const headers = requestHeaders(montador);
  const altered = {...montador, nombre: 'Nombre Alterado'};
  const response = await run(altered, headers);
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.code, 'INTEGRATION_AUTH_INVALID_SIGNATURE');
  assert.equal(rows.length, 0);
});

test('La firma HMAC esta ligada a la ruta canonica exacta', async () => {
  const headers = requestHeaders(montador, {path:'/api/ventas/clientes/sync'});
  const response = await run(montador, headers);
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.code, 'INTEGRATION_AUTH_INVALID_SIGNATURE');
  assert.equal(rows.length, 0);
});

test('Una identidad M2M completamente desconocida se rechaza', async () => {
  const response = await run(montador,requestHeaders(montador, {id:'desconocida-appscript'}));
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.code, 'INTEGRATION_AUTH_UNKNOWN_ID');
  assert.equal(rows.length, 0);
});

test('M2M no puede insertar un Montador sin contratista', async () => {
  const invalid = {...montador, contratista:''};
  const response = await run(invalid,requestHeaders(invalid));
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.code, 'INT9_DATO_OBLIGATORIO');
  assert.equal(rows.length, 0);
  assert.equal(messages.length, 0);
});
