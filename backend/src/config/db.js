// [Aster | 2026-08-12 | ASTER-MG | PATCH: FIX_PREPRUEBA_BACKEND_M2M_V001]
// [Aster | 2026-08-27 | ASTER-MG | FIX_UTF8MB4_BACKUP_V001]
const mysql = require('mysql2/promise');

const requiredDbVariables = [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME'
];

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
