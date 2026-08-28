// [Aster | 2026-08-12 | ASTER-MG | PATCH: FIX_PREPRUEBA_BACKEND_M2M_V001]
// [Aster | 2026-08-27 | ASTER-MG | FIX_UTF8MB4_BACKUP_V001]
// [Aster | 2026-08-28 | ASTER-MG | FASE_5_SQL_AIVEN_OPTIMIZACION_V001]
// [Lumbre | 2026-08-28 | DB_OBSERVABILITY_GET_CONNECTION_GUARD_V001]
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const requiredDbVariables = [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME'
];

const DB_OBSERVABILITY_MARK = Symbol('manttoDbObservability');

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
  if (!enabled || !target || target[DB_OBSERVABILITY_MARK]) return target;

  const slowQueryMs = positiveNumber(process.env.DB_SLOW_QUERY_MS, 750, 1);
  const traceAll = isEnabled(process.env.DB_QUERY_TRACE_ALL, false);

  for (const methodName of ['query', 'execute']) {
    if (typeof target[methodName] !== 'function') continue;
    const original = target[methodName].bind(target);

    target[methodName] = async function observedDatabaseCall(...args) {
      const startedAt = process.hrtime.bigint();
      try {
        const result = await original(...args);
        const telemetry = buildQueryTelemetry(`${label}.${methodName}`, args[0], startedAt, result, null);
        if (traceAll || telemetry.duration_ms >= slowQueryMs) {
          const eventName = telemetry.duration_ms >= slowQueryMs ? '[DB_SLOW_QUERY]' : '[DB_QUERY]';
          console.warn(eventName, JSON.stringify(telemetry));
        }
        return result;
      } catch (error) {
        const telemetry = buildQueryTelemetry(`${label}.${methodName}`, args[0], startedAt, null, error);
        console.error('[DB_QUERY_ERROR]', JSON.stringify(telemetry));
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

const useSsl = isEnabled(process.env.DB_SSL, true);

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
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: Number(process.env.DB_QUEUE_LIMIT || 0),
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  ssl: useSsl
    ? {
        // Aiven usa TLS. El contrato historico del proyecto es DB_SSL=true.
        // Se mantiene un unico contrato SSL mediante DB_SSL.
        rejectUnauthorized: false
      }
    : undefined
});

installQueryObservability(pool, 'pool');

if (typeof pool.getConnection === 'function') {
  const originalGetConnection = pool.getConnection.bind(pool);
  pool.getConnection = async function getObservedConnection(...args) {
    const connection = await originalGetConnection(...args);
    return installQueryObservability(connection, 'connection');
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
