// [Aster | 2026-09-14 | ASTER-MG | FASE 1 NUCLEO TEMPORAL V001]
'use strict';

const SYSTEM_TIME_ZONE = 'America/Mexico_City';

function asDate(value = new Date()) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function utcDateTime(value = new Date(), { milliseconds = true } = {}) {
  const date = asDate(value);
  if (!date) return null;
  const iso = date.toISOString();
  return (milliseconds ? iso.slice(0, 23) : iso.slice(0, 19)).replace('T', ' ');
}

function mexicoCityParts(value = new Date(), { seconds = false } = {}) {
  const date = asDate(value);
  if (!date) return null;
  const options = {
    timeZone: SYSTEM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  };
  if (seconds) options.second = '2-digit';
  return new Intl.DateTimeFormat('en-CA', options).formatToParts(date).reduce((parts, part) => {
    if (part.type !== 'literal') parts[part.type] = part.value;
    return parts;
  }, {});
}

function mexicoCityDate(value = new Date()) {
  const parts = mexicoCityParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : null;
}

function mexicoCityTime(value = new Date(), { seconds = false } = {}) {
  const parts = mexicoCityParts(value, { seconds });
  if (!parts) return null;
  return `${parts.hour}:${parts.minute}${seconds ? `:${parts.second}` : ''}`;
}

function mexicoCityYear(value = new Date()) {
  const parts = mexicoCityParts(value);
  return parts ? Number(parts.year) : null;
}

function sqlDateLiteral(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error('Fecha civil invalida para SQL. Se esperaba YYYY-MM-DD.');
  }
  return `DATE('${text}')`;
}

function mexicoCityUtcOffsetMinutes(value = new Date()) {
  const date = asDate(value);
  if (!date) return null;
  const parts = mexicoCityParts(date, { seconds: true });
  if (!parts) return null;
  const wallClockAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second || 0)
  );
  const instantRoundedToSecond = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((wallClockAsUtc - instantRoundedToSecond) / 60000);
}

function sqlMexicoCityNow(value = new Date()) {
  const offsetMinutes = mexicoCityUtcOffsetMinutes(value);
  if (!Number.isInteger(offsetMinutes)) {
    throw new Error('No fue posible resolver el offset de America/Mexico_City.');
  }
  return `DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${offsetMinutes} MINUTE)`;
}

function sqlMexicoCityToday(value = new Date()) {
  return `DATE(${sqlMexicoCityNow(value)})`;
}

function mexicoCityCivilDateUtc(value = new Date()) {
  const date = mexicoCityDate(value);
  if (!date) return null;
  return new Date(`${date}T00:00:00.000Z`);
}

module.exports = Object.freeze({
  SYSTEM_TIME_ZONE,
  SQL_UTC_NOW: 'UTC_TIMESTAMP(3)',
  utcDateTime,
  mexicoCityDate,
  mexicoCityTime,
  mexicoCityYear,
  sqlDateLiteral,
  mexicoCityUtcOffsetMinutes,
  sqlMexicoCityNow,
  sqlMexicoCityToday,
  mexicoCityCivilDateUtc
});
