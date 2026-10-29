// [Aster | 2026-08-12 | ASTER-MG | PATCH: FIX_PREPRUEBA_BACKEND_M2M_V001]
// [Aster | 2026-08-27 | ASTER-MG | FIX_UTF8MB4_BACKUP_V001]
// [Aster | 2026-08-28 | ASTER-MG | FASE_5_SQL_AIVEN_OPTIMIZACION_V001]
// [Lumbre | 2026-08-28 | DB_OBSERVABILITY_GET_CONNECTION_GUARD_V001]
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { buildAivenTlsOptions } = require('./aiven-tls');
const loadTestRegistry = require('../modules/panel-control-prueba-carga/panel-control-prueba-carga.registry');
const { getCurrentLoadTestSessionId } = require('../modules/panel-control-prueba-carga/panel-control-prueba-carga.context');
const { createConnectionPressureGuard } = require('./db-capacity-guard');

const requiredDbVariables = [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME'
];

const DB_OBSERVABILITY_MARK = Symbol('manttoDbObservability');
const connectionPressureGuard = createConnectionPressureGuard({
  backoffMs: positiveNumber(process.env.DB_CONNECTION_PRESSURE_BACKOFF_MS, 5000, 1000),
  maxBackoffMs: positiveNumber(process.env.DB_CONNECTION_PRESSURE_MAX_BACKOFF_MS, 30000, 1000)
});

// DB_QUEUE_LIMIT=0 (sin limite) no es seguro durante una averia de Aiven.
// Limitar la cola por instancia evita acumular promesas y memoria sin fin.
function boundedQueueLimit(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 100) : 30;
}

function assertDatabaseEnvironment() {
  const missing = requiredDbVariables.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(`Faltan variables de base de datos: ${missing.join(', ')}`);
  }
}

function isEnabled(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function positiveNumber(value, fallback, minimum = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) return fallback;
  return parsed;
}

function sqlText(sqlOrOptions) {
  if (typeof sqlOrOptions === 'string') return sqlOrOptions;
  if (sqlOrOptions && typeof sqlOrOptions.sql === 'string') return sqlOrOptions.sql;
  return '';
}

function isExpectedDuplicate(sqlOrOptions, error) {
  if (!(error?.code === 'ER_DUP_ENTRY' || Number(error?.errno) === 1062)) return false;
  return /\/\*\s*BLT_EXPECTED_DUPLICATE\s*\*\//i.test(sqlText(sqlOrOptions));
}

function sanitizedSqlShape(sql) {
  const maxLength = Math.max(200, Math.min(4000, Number(process.env.DB_QUERY_SHAPE_MAX_LENGTH || 1200)));
  return String(sql || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/'(?:''|\\'|[^'])*'/g, "'?'")
    .replace(/"(?:""|\\"|[^"])*"/g, '"?"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function queryFingerprint(shape) {
  return crypto
    .createHash('sha256')
    .update(String(shape || ''))
    .digest('hex')
    .slice(0, 16);
}

function queryOperation(shape) {
  const match = String(shape || '').match(/^([A-Za-z]+)/);
  return match ? match[1].toUpperCase() : 'SQL';
}

function resultSummary(result) {
  const first = Array.isArray(result) ? result[0] : null;
  if (Array.isArray(first)) return { rows: first.length };
  if (first && typeof first === 'object') {
    const summary = {};
    if (Number.isFinite(Number(first.affectedRows))) summary.affected_rows = Number(first.affectedRows);
    if (Number.isFinite(Number(first.changedRows))) summary.changed_rows = Number(first.changedRows);
    if (Number.isFinite(Number(first.insertId)) && Number(first.insertId) > 0) summary.insert_id = Number(first.insertId);
    return summary;
  }
  return {};
}

function buildQueryTelemetry(label, sqlOrOptions, startedAt, result, error) {
  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  const shape = sanitizedSqlShape(sqlText(sqlOrOptions));
  const payload = {
    source: label,
    duration_ms: Number(durationMs.toFixed(2)),
    operation: queryOperation(shape),
    fingerprint: queryFingerprint(shape),
    sql_shape: shape || '[sql no disponible]'
  };

  if (result) Object.assign(payload, resultSummary(result));
  if (error) {
    payload.error_code = error.code || null;
    payload.error_errno = Number.isFinite(Number(error.errno)) ? Number(error.errno) : null;
    payload.sql_state = error.sqlState || null;
  }

  return payload;
}

function installQueryObservability(target, label) {
  const enabled = isEnabled(process.env.DB_QUERY_OBSERVABILITY_ENABLED, true);
  // Proteccion de capacidad SIEMPRE activa, aun con telemetria deshabilitada.
  if (!target || target[DB_OBSERVABILITY_MARK]) return target;

  const slowQueryMs = positiveNumber(process.env.DB_SLOW_QUERY_MS, 750, 1);
  const traceAll = isEnabled(process.env.DB_QUERY_TRACE_ALL, false);

  for (const methodName of ['query', 'execute']) {
    if (typeof target[methodName] !== 'function') continue;
    const original = target[methodName].bind(target);

    target[methodName] = async function observedDatabaseCall(...args) {
      if (label === 'pool') connectionPressureGuard.assertAvailable();
      const startedAt = process.hrtime.bigint();
      const loadTestSessionId = getCurrentLoadTestSessionId();
      if (loadTestSessionId) loadTestRegistry.beginSql(loadTestSessionId);
      try {
        const result = await original(...args);
        if (label === 'pool') connectionPressureGuard.recordSuccess();
        if (enabled || loadTestSessionId) {
          const telemetry = buildQueryTelemetry(`${label}.${methodName}`, args[0], startedAt, result, null);
          if (loadTestSessionId) loadTestRegistry.finishSql(loadTestSessionId, telemetry);
          if (enabled && (traceAll || telemetry.duration_ms >= slowQueryMs)) {
            const eventName = telemetry.duration_ms >= slowQueryMs ? '[DB_SLOW_QUERY]' : '[DB_QUERY]';
            console.warn(eventName, JSON.stringify(telemetry));
          }
        }
        return result;
      } catch (error) {
        // Registrar primero el codigo MySQL original antes de normalizar el 503.
        if (enabled || loadTestSessionId) {
          const telemetry = buildQueryTelemetry(`${label}.${methodName}`, args[0], startedAt, null, error);
          if (loadTestSessionId) loadTestRegistry.finishSql(loadTestSessionId, telemetry);
          if (enabled) {
            if (isExpectedDuplicate(args[0], error)) {
              console.info('[DB_DEDUPLICATED]', JSON.stringify(telemetry));
            } else {
              console.error('[DB_QUERY_ERROR]', JSON.stringify(telemetry));
            }
          }
        }
        if (label === 'pool') {
          if (!connectionPressureGuard.record(error)) connectionPressureGuard.recordQueue(error);
        }
        throw error;
      }
    };
  }

  Object.defineProperty(target, DB_OBSERVABILITY_MARK, {
    value: true,
    enumerable: false,
    configurable: false
  });

  return target;
}

assertDatabaseEnvironment();

// Certificado y nombre del servidor verificados antes de crear el pool.
const dbTlsOptions = buildAivenTlsOptions();
// Contención operativa: Aiven agotó max_connections durante el despliegue.
// El valor histórico sigue siendo configurable, pero cada instancia de Azure
// queda limitada por defecto a dos conexiones y conserva solo una ociosa. El
// cap puede elevarse explícitamente cuando Aiven tenga capacidad confirmada.
const requestedConnectionLimit = positiveNumber(process.env.DB_CONNECTION_LIMIT, 10, 1);
const connectionLimitCap = positiveNumber(process.env.DB_CONNECTION_LIMIT_CAP, 2, 1);
const connectionLimit = Math.max(1, Math.floor(Math.min(requestedConnectionLimit, connectionLimitCap)));
const maxIdleConnections = Math.max(1, Math.floor(Math.min(
  connectionLimit,
  positiveNumber(process.env.DB_MAX_IDLE_CONNECTIONS, 1, 1)
)));
const maxPendingRequests = boundedQueueLimit(process.env.DB_QUEUE_LIMIT);
const poolWaitWarnMs = positiveNumber(process.env.DB_POOL_WAIT_WARN_MS, 250, 1);
const poolWaitLogIntervalMs = positiveNumber(process.env.DB_POOL_WAIT_LOG_INTERVAL_MS, 60000, 1000);
const poolWaitLogState = new Map();

function warnPoolWait(waitMs, outcome, error = null) {
  if (waitMs < poolWaitWarnMs) return;
  const now = Number(process.hrtime.bigint() / 1000000n);
  const previous = poolWaitLogState.get(outcome);
  if (previous && now - previous.loggedAt < poolWaitLogIntervalMs) {
    previous.suppressed += 1;
    previous.maxSuppressedWaitMs = Math.max(previous.maxSuppressedWaitMs, waitMs);
    return;
  }

  console.warn('[DB_POOL_WAIT]', JSON.stringify({
    wait_ms: Number(waitMs.toFixed(2)),
    outcome,
    effective_connection_limit: connectionLimit,
    max_idle_connections: maxIdleConnections,
    max_pending_requests: maxPendingRequests,
    suppressed_since_last_log: previous?.suppressed || 0,
    max_suppressed_wait_ms: previous?.suppressed
      ? Number(previous.maxSuppressedWaitMs.toFixed(2))
      : null,
    ...(error ? {
      error_code: error.code || null,
      error_errno: Number.isFinite(Number(error.errno)) ? Number(error.errno) : null
    } : {})
  }));
  poolWaitLogState.set(outcome, { loggedAt: now, suppressed: 0, maxSuppressedWaitMs: 0 });
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // Contrato fijo del proyecto: toda conexion de aplicacion usa utf8mb4.
  // No se expone como variable configurable para evitar una regresion a utf8/utf8mb3.
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit,
  maxIdle: maxIdleConnections,
  idleTimeout: positiveNumber(process.env.DB_IDLE_TIMEOUT_MS, 30000, 1000),
  queueLimit: maxPendingRequests,
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // Contrato fijo del proyecto: hace deterministica la frontera MySQL -> Node,
  // sin depender del TZ del proceso Node y sin tocar la zona horaria de Aiven
  // (no emite SET time_zone; solo cambia como el driver interpreta el texto
  // que el servidor ya devolvio).
  // - timezone:'Z' interpreta todo DATETIME/TIMESTAMP recibido como UTC al
  //   construir el objeto Date, en vez de 'local' (que variaria segun host).
  // - dateStrings:['DATE'] devuelve las columnas DATE puras como cadena
  //   literal 'YYYY-MM-DD', sin pasar por conversion de zona horaria
  //   (evita que una fecha civil se recorra un dia).
  // No se expone como variable de entorno: es un contrato de interpretacion,
  // no una preferencia de despliegue.
  timezone: 'Z',
  dateStrings: ['DATE'],
  ssl: dbTlsOptions
});

console.warn('[DB_POOL_CAPACITY]', JSON.stringify({
  requested_connection_limit:requestedConnectionLimit,
  effective_connection_limit:connectionLimit,
  max_idle_connections:maxIdleConnections,
  max_pending_requests:maxPendingRequests,
  pool_wait_warn_ms:poolWaitWarnMs,
  pool_wait_log_interval_ms:poolWaitLogIntervalMs
}));

installQueryObservability(pool, 'pool');

if (typeof pool.getConnection === 'function') {
  const originalGetConnection = pool.getConnection.bind(pool);
  pool.getConnection = async function getObservedConnection(...args) {
    connectionPressureGuard.assertAvailable();
    const loadTestSessionId = getCurrentLoadTestSessionId();
    const startedAt = process.hrtime.bigint();
    if (loadTestSessionId) loadTestRegistry.beginPoolAcquire(loadTestSessionId);
    try {
      const connection = await originalGetConnection(...args);
      const waitMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      connectionPressureGuard.recordSuccess();
      warnPoolWait(waitMs, 'acquired');
      if (loadTestSessionId) {
        loadTestRegistry.finishPoolAcquire(loadTestSessionId, waitMs, null);
      }
      return installQueryObservability(connection, 'connection');
    } catch (error) {
      const waitMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      warnPoolWait(waitMs, 'error', error);
      if (loadTestSessionId) {
        loadTestRegistry.finishPoolAcquire(loadTestSessionId, waitMs, error);
      }
      if (!connectionPressureGuard.record(error)) connectionPressureGuard.recordQueue(error);
      throw error;
    }
  };
}

async function testConnection() {
  try {
    const [rows] = await pool.query('SELECT NOW() AS server_time');
    return rows[0];
  } catch (error) {
    error.message = `No fue posible conectar con MySQL: ${error.message}`;
    throw error;
  }
}

async function close() {
  await pool.end();
}

pool.testConnection = testConnection;
pool.close = close;

module.exports = pool;
