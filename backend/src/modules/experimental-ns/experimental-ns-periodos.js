'use strict';

// BLT NOW | Experimental NS | Fechas civiles CDMX: intervalos [inicio,fin) indexables.
// Reutilizado por Resumen del Dia, Proyectos, Criticos y la revision Live.
const {todayInMexico, offsetDay} = require('./experimental-ns-equipos-criticos.metrics');

function badDate() {
  const error = new Error('La fecha solicitada debe ser una fecha valida AAAA-MM-DD.');
  error.code = 'EXPERIMENTAL_NS_FECHA_INVALIDA';
  error.statusCode = 400;
  return error;
}

function assertDate(raw) {
  if (typeof raw !== 'string' || !/^(?:19|20|21)\d{2}-\d{2}-\d{2}$/.test(raw)) throw badDate();
  const value = new Date(raw + 'T00:00:00Z');
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0,10) !== raw) throw badDate();
  return raw;
}

function requestedDate(req) {
  const raw = req?.query?.fecha;
  return raw === undefined ? todayInMexico() : assertDate(raw);
}

function dayWindow(date) {
  const dateKey = assertDate(date);
  return {inicio: dateKey + ' 00:00:00', fin: offsetDay(dateKey,1) + ' 00:00:00'};
}

function lookbackDays(raw, fallback = 0) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (!/^[0-9]+$/.test(String(raw)) || !Number.isSafeInteger(Number(raw)) ||
      Number(raw) < 1 || Number(raw) > 3650) {
    const error = new Error('Periodo de consulta Experimental NS invalido.');
    error.code = 'EXPERIMENTAL_NS_PERIODO_INVALIDO';
    error.statusCode = 400;
    throw error;
  }
  return Number(raw);
}

function historicalWindow(today = todayInMexico(), extraDays = []) {
  const key = assertDate(today);
  const start = [key.slice(0,4)+'-01-01', offsetDay(key,-364)];
  for (const raw of extraDays) {
    const days = lookbackDays(raw,0);
    if (days) start.push(offsetDay(key,-days));
  }
  const first = start.sort()[0];
  return {inicio:first+' 00:00:00',fin:offsetDay(key,1)+' 00:00:00',desde:first,hasta:key};
}

module.exports={assertDate,requestedDate,dayWindow,historicalWindow,lookbackDays};
