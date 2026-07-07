const db = require('../config/db');

const TZ = process.env.PORTAFOLIO_CIERRE_TZ || 'America/Mexico_City';
const HOUR = Number.parseInt(process.env.PORTAFOLIO_CIERRE_HOUR || '23', 10);
const MINUTE = Number.parseInt(process.env.PORTAFOLIO_CIERRE_MINUTE || '59', 10);
const ENABLED = String(process.env.PORTAFOLIO_CIERRE_MENSUAL_ENABLED || 'true').toLowerCase() !== 'false';

let lastRunKey = null;
let timer = null;

function nowParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    key: `${parts.year}-${parts.month}`,
    date: `${parts.year}-${parts.month}-${parts.day}`
  };
}

function isLastDayOfMonth(parts) {
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return next.getUTCMonth() + 1 !== parts.month;
}

async function runMonthlyClose(corteDate) {
  const [result] = await db.query(
    `UPDATE portafolio
     SET estatus_ul_mes = estatus_servicio,
         estatus_ul_mes_fecha = ?
     WHERE id_portafolio > 0`,
    [corteDate]
  );

  console.log('[Portafolio] Cierre mensual ejecutado:', {
    corte: corteDate,
    rowsMatched: result.affectedRows,
    changedRows: result.changedRows
  });

  return result;
}

async function checkMonthlyClose(date = new Date()) {
  if (!ENABLED) return { skipped: true, reason: 'disabled' };
  const parts = nowParts(date);
  const shouldRun = isLastDayOfMonth(parts) && parts.hour === HOUR && parts.minute === MINUTE;

  if (!shouldRun) return { skipped: true, reason: 'not_scheduled_time', parts };
  if (lastRunKey === parts.key) return { skipped: true, reason: 'already_ran_this_month', parts };

  lastRunKey = parts.key;
  try {
    await runMonthlyClose(parts.date);
    return { ok: true, parts };
  } catch (error) {
    lastRunKey = null;
    console.error('[Portafolio] Error ejecutando cierre mensual:', error.message);
    return { ok: false, error: error.message, parts };
  }
}

function startPortafolioCierreMensualJob() {
  if (!ENABLED) {
    console.log('[Portafolio] Cierre mensual automático desactivado por variable de entorno.');
    return null;
  }
  if (timer) return timer;

  console.log(`[Portafolio] Cierre mensual automático activo: último día del mes ${String(HOUR).padStart(2, '0')}:${String(MINUTE).padStart(2, '0')} (${TZ}).`);
  timer = setInterval(() => {
    checkMonthlyClose().catch(error => console.error('[Portafolio] Error en job de cierre mensual:', error.message));
  }, 30000);
  timer.unref?.();
  return timer;
}

module.exports = {
  startPortafolioCierreMensualJob,
  checkMonthlyClose,
  runMonthlyClose
};
