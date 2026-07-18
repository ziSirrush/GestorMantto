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

assertDatabaseEnvironment();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: Number(process.env.DB_QUEUE_LIMIT || 0),
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  ssl: {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
  }
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
