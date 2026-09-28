'use strict';

const db = require('../../config/db');

const STATUS_NAMES = Object.freeze([
  'Threads_connected',
  'Threads_running',
  'Connections',
  'Aborted_connects',
  'Questions',
  'Queries',
  'Slow_queries'
]);

function unavailableMetrics() {
  return STATUS_NAMES.reduce((acc, key) => {
    acc[key] = 'N/D';
    return acc;
  }, { available: false });
}

async function collectMySqlMetrics() {
  try {
    const placeholders = STATUS_NAMES.map(() => '?').join(', ');
    const [rows] = await db.query(
      `SHOW GLOBAL STATUS WHERE Variable_name IN (${placeholders})`,
      STATUS_NAMES
    );

    const result = unavailableMetrics();
    result.available = true;
    for (const row of rows || []) {
      const key = String(row.Variable_name || '');
      if (!STATUS_NAMES.includes(key)) continue;
      const value = Number(row.Value);
      result[key] = Number.isFinite(value) ? value : String(row.Value ?? 'N/D');
    }
    return result;
  } catch (_error) {
    return unavailableMetrics();
  }
}

module.exports = { collectMySqlMetrics, STATUS_NAMES };
