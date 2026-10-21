'use strict';

// BLT NOW | 2026-10-20 | FIX_API_AIVEN_PRESION_CONEXIONES_V001
// Valida de manera AISLADA: no contacta Aiven, Azure ni archivos operativos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const cfgDir = path.join(ROOT, 'backend', 'src', 'config');
const dbSource = fs.readFileSync(path.join(cfgDir, 'db.js'), 'utf8');
const bootstrapSource = fs.readFileSync(path.join(ROOT,'backend','src','bootstrap.js'),'utf8');
const { createConnectionPressureGuard, isConnectionCapacityError, isPoolQueueError } =
  require('../backend/src/config/db-capacity-guard');

function noisyError(code='ER_CON_COUNT_ERROR', errno=1040) {
  const e = new Error('Too many connections');
  e.code=code;e.errno=errno;return e;
}

const quietConsole = Object.freeze({ warn(){}, error(){}, info(){} });
function silenceGuard(callback) {
  const oldWarn = console.warn;
  console.warn=()=>{};
  try{return callback();}finally{console.warn=oldWarn;}
}

// Preserva pruebas previas de contencion de la version 102026.12.
test('cada instancia limita por defecto su ocupación de conexiones Aiven', () => {
  assert.match(dbSource, /DB_CONNECTION_LIMIT_CAP,\s*2/);
  assert.match(dbSource, /Math\.min\(requestedConnectionLimit, connectionLimitCap\)/);
  assert.match(dbSource, /connectionLimit,/);
});

test('el pool libera conexiones ociosas después de la ráfaga', () => {
  assert.match(dbSource, /maxIdle:\s*maxIdleConnections/);
  assert.match(dbSource, /DB_MAX_IDLE_CONNECTIONS,\s*1/);
  assert.match(dbSource, /DB_IDLE_TIMEOUT_MS,\s*30000/);
});

test('1040 y 1203 representan agotamiento real de conexiones', () => {
  assert.equal(isConnectionCapacityError(noisyError()),true);
  assert.equal(isConnectionCapacityError(noisyError('ER_TOO_MANY_USER_CONNECTIONS',1203)),true);
  assert.equal(isConnectionCapacityError(Object.assign(new Error(),{errno:1040})),true);
  assert.equal(isConnectionCapacityError(Object.assign(new Error('syntax'),{code:'ER_PARSE_ERROR',errno:1064})),false);
});

test('cortacircuito detiene la ráfaga, retorna 503 y se recupera sin intervención', () => {
  let tick = 100_000;
  const guard = createConnectionPressureGuard({now:()=>tick,backoffMs:5000,maxBackoffMs:30000});
  const original = noisyError();
  assert.equal(silenceGuard(()=>guard.record(original)),true);
  assert.equal(original.code,'DB_CONNECTION_CAPACITY');
  assert.equal(original.dbErrorCode,'ER_CON_COUNT_ERROR');
  assert.equal(original.statusCode,503);
  assert.equal(original.retryAfterSeconds,5);
  assert.throws(()=>guard.assertAvailable(),error=>error.code==='DB_CONNECTION_CAPACITY' && error.status===503);
  tick+=5001;
  assert.doesNotThrow(()=>guard.assertAvailable());
  assert.equal(silenceGuard(()=>guard.record(noisyError())),true);
  assert.equal(guard.remainingMs(),10000);
  tick+=10001;
  guard.recordSuccess();
  assert.equal(silenceGuard(()=>guard.record(noisyError())),true);
  assert.equal(guard.remainingMs(),5000);
});

test('el cortacircuito no oculta errores diferentes a saturación', () => {
  const guard = createConnectionPressureGuard({now:()=>1,backoffMs:5000});
  const other = Object.assign(new Error('Otra falla'),{code:'ER_PARSE_ERROR',errno:1064});
  assert.equal(guard.record(other),false);
  assert.equal(other.code,'ER_PARSE_ERROR');
  assert.equal(guard.remainingMs(),0);
});

test('cola del pool llena produce 503 recuperable sin clasificarlo como MySQL 1040', () => {
  const error=new Error('Queue limit reached.');
  const guard=createConnectionPressureGuard();
  assert.equal(isPoolQueueError(error),true);
  assert.equal(guard.recordQueue(error),true);
  assert.equal(error.code,'DB_POOL_QUEUE_FULL');
  assert.equal(error.statusCode,503);
  assert.equal(error.retryAfterSeconds,2);
  assert.equal(guard.remainingMs(),0);
});

function loadModule(code,mocks,overrides={}) {
  const module={exports:{}};
  const requireLocal=name=>{
    if (Object.prototype.hasOwnProperty.call(mocks,name))return mocks[name];
    throw new Error('Dependencia no declarada '+name);
  };
  new Function('require','module','exports','process','console','setTimeout','clearTimeout',code)(
    requireLocal,module,module.exports,
    overrides.process||process,
    overrides.console||quietConsole,
    overrides.setTimeout||setTimeout,
    overrides.clearTimeout||clearTimeout
  );
  return module.exports;
}

function loadDb({mode='mysqlFull',observability=true,connections=10,queue='0'}={}) {
  let hits=0, options;
  const pool={
    async query(){hits++;if(mode==='mysqlFull')throw noisyError();
      if(mode==='queue')throw new Error('Queue limit reached.');
      return [[{server_time:'2026-10-20T23:59:00Z'}]];},
    async execute(){return this.query();},
    async getConnection(){hits++;if(mode==='mysqlFull')throw noisyError();
      return {async query(){return [[1]];},release(){}};},
    async end(){}
  };
  const env={DB_HOST:'localhost',DB_PORT:'3306',DB_USER:'test',DB_PASSWORD:'not-used',
    DB_NAME:'test',DB_SSL:'false',DB_QUERY_OBSERVABILITY_ENABLED:String(observability),
    DB_CONNECTION_LIMIT:String(connections),DB_QUEUE_LIMIT:queue};
  const exported=loadModule(dbSource,{
    crypto:require('node:crypto'),
    'mysql2/promise':{createPool(x){options=x;return pool;}},
    '../modules/panel-control-prueba-carga/panel-control-prueba-carga.registry':{
      beginSql(){},finishSql(){},beginPoolAcquire(){},finishPoolAcquire(){}
    },
    '../modules/panel-control-prueba-carga/panel-control-prueba-carga.context':{
      getCurrentLoadTestSessionId(){return null;}
    },
    './db-capacity-guard':require('../backend/src/config/db-capacity-guard')
  },{process:{env,hrtime:process.hrtime},console:quietConsole});
  return {pool:exported,options,hits:()=>hits};
}

test('el pool limita a 2 conexiones y 30 pendientes aun con cola=0 configurada', () => {
  const {options}=loadDb({mode:'ok',connections:50,queue:'0'});
  assert.equal(options.connectionLimit,2);
  assert.equal(options.maxIdle,1);
  assert.equal(options.queueLimit,30);
  assert.equal(options.waitForConnections,true);
  assert.equal(options.charset,'utf8mb4');
  assert.equal(options.timezone,'Z');
});

test('sin telemetría, tras error 1040 no abre mas conexiones durante el enfriamiento', async () => {
  const db=loadDb({mode:'mysqlFull',observability:false});
  await assert.rejects(db.pool.query('SELECT NOW()'), e=>e.code==='DB_CONNECTION_CAPACITY' && e.status===503);
  assert.equal(db.hits(),1);
  await assert.rejects(db.pool.query('SELECT NOW()'), e=>e.code==='DB_CONNECTION_CAPACITY' && e.retryAfterSeconds>=1);
  assert.equal(db.hits(),1);
  await assert.rejects(db.pool.getConnection(), e=>e.code==='DB_CONNECTION_CAPACITY');
  assert.equal(db.hits(),1);
});

test('saturación local de cola devuelve 503 sin activar enfriamiento de conexiones externas', async () => {
  const db=loadDb({mode:'queue'});
  await assert.rejects(db.pool.query('SELECT 1'),e=>e.code==='DB_POOL_QUEUE_FULL' && e.statusCode===503);
  await assert.rejects(db.pool.query('SELECT 1'),e=>e.code==='DB_POOL_QUEUE_FULL');
  assert.equal(db.hits(),2);
});

test('error middleware informa Retry-After sin revelar datos internos', () => {
  const source=fs.readFileSync(path.join(ROOT,'backend','src','middleware','error.middleware.js'),'utf8');
  const mw=loadModule(source,{
    '../shared/logger':{error(){}},
    '../services/storage/storage-errors.service':{normalizeUploadError_gnral:e=>e}
  },{process:{env:{NODE_ENV:'production'}}});
  const headers={};let output={},status;
  const response={headersSent:false,set(k,v){headers[k]=v;return this;},status(x){status=x;return this;},json(x){output=x;return this;}};
  const err=Object.assign(new Error('La base de datos está temporalmente saturada.'),{
    statusCode:503,code:'DB_CONNECTION_CAPACITY',expose:true,retryAfterSeconds:5
  });
  mw.errorHandler(err,{method:'GET',originalUrl:'/api/health'},response,()=>{});
  assert.equal(status,503);
  assert.equal(headers['Retry-After'],'5');
  assert.equal(output.code,'DB_CONNECTION_CAPACITY');
  assert.equal(output.ok,false);
  assert.equal('error' in output,false);
});

function bootFixture({failedChecks=1}={}) {
  const timers=[];let checks=0,serverRuns=0,starts={};const signaled=[];
  const server={once(){return this;},removeListener(){return this;},listen(_port,_host,callback){serverRuns++;callback();},close(done){done(null);}};
  const mocks={
    http:{createServer(){return server;}},
    './app':{createApp(){return {}; }},
    './config/db':{
      async testConnection(){checks++;if(checks<=failedChecks)throw noisyError();return {server_time:'2026-10-21'};},
      async close(){}
    },
    './config/env.config':{validateEnvironment(){}},
    './shared/logger':quietConsole,
    './services/storage/storage-schema.service':{async readSchemaStatus_gnral(){return {ready:true};}}
  };
  for(const [file,keys] of Object.entries({
    './jobs/portafolioCierreMensual.job':['startPortafolioCierreMensualJob'],
    './jobs/portafolioCierreSemanal.job':['startPortafolioCierreSemanalJob'],
    './jobs/logisticaCierreSemanal.job':['startLogisticaCierreSemanalJob','stopLogisticaCierreSemanalJob'],
    './jobs/pushNotifications.job':['startPushNotificationsJob','stopPushNotificationsJob'],
    './jobs/storageOperations.job':['startStorageOperationsJob','stopStorageOperationsJob'],
    './jobs/almacenCierreIncorrecto.job':['startAlmacenCierreIncorrectoJob','stopAlmacenCierreIncorrectoJob'],
    './jobs/equiposCriticosSalidaU35.job':['startEquiposCriticosSalidaU35Job','stopEquiposCriticosSalidaU35Job'],
    './jobs/movimientosCriticosCierreSemanal.job':['startMovimientosCriticosCierreSemanalJob','stopMovimientosCriticosCierreSemanalJob'],
    './jobs/instalacionesAdministracionCalculados.job':['startInstalacionesAdministracionCalculadosJob','stopInstalacionesAdministracionCalculadosJob'],
    './jobs/cobranzaUniFkValidator.job':['startCobranzaUniFkValidatorJob','stopCobranzaUniFkValidatorJob']
  })){
    mocks[file]={};for(const k of keys)mocks[file][k]=()=>{starts[k]=(starts[k]||0)+1;};
  }
  const runner=loadModule(bootstrapSource,mocks,{
    process:{env:{PORT:'3001'},once:(name,cb)=>signaled.push({name,cb}),exit(){}},
    setTimeout(fn,ms){const item={fn,ms,cancelled:false,unref(){}};timers.push(item);return item;},
    clearTimeout(timer){timer.cancelled=true;}
  });
  return {runner,timers,starts,checks:()=>checks,serverRuns:()=>serverRuns,signaled};
}

test('si Aiven falla al inicio la API escucha y reintenta sin duplicar jobs',async()=>{
  const f=bootFixture({failedChecks:2});
  await f.runner.startServer();
  assert.equal(f.serverRuns(),1);
  assert.equal(f.timers.length,1);
  assert.equal(f.timers[0].ms,30000);
  assert.equal(f.starts.startPortafolioCierreMensualJob||0,0);
  assert.equal(f.starts.startCobranzaUniFkValidatorJob,1);
  await f.timers[0].fn();
  assert.equal(f.timers.length,2);
  assert.equal(f.timers[1].ms,60000);
  assert.equal(f.starts.startPushNotificationsJob||0,0);
  await f.timers[1].fn();
  assert.equal(f.timers.length,2);
  assert.equal(f.starts.startPortafolioCierreMensualJob,1);
  assert.equal(f.starts.startPortafolioCierreSemanalJob,1);
  assert.equal(f.starts.startPushNotificationsJob,1);
  assert.equal(f.starts.startInstalacionesAdministracionCalculadosJob,1);
  assert.equal(f.starts.startCobranzaUniFkValidatorJob,1);
  assert.equal(f.checks(),3);
});

test('cuando la DB arranca lista no programa reintentos adicionales',async()=>{
  const f=bootFixture({failedChecks:0});
  await f.runner.startServer();
  assert.equal(f.starts.startPushNotificationsJob,1);
  assert.equal(f.timers.length,0);
});
