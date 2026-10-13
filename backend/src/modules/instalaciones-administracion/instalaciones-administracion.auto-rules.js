'use strict';

// [Mantto Gestor | 2026-10-13 | FASE_1_INSTALACIONES_ADMIN_V2_BACKEND_V001]
// Reglas puras reutilizadas por la escritura manual y el mantenimiento diario.
// No consulta BD, no depende de la zona horaria del host y no altera datos.

const STATUS_LABELS_COR = Object.freeze({
  '01-SUS': 'Equipos Suspendidos',
  '02-OC': 'Equipos en Obra Civil',
  '03-PM': 'Equipos Proximos a Montar',
  '04-M': 'Equipos en Montaje',
  '05-PA': 'Equipos Proximos a Ajustar',
  '06-A': 'Equipos en Ajuste',
  '07-PE': 'Equipos Proximos a Entregar',
  '08-T': 'Equipos Entregados'
});

const AUTO_FIELDS_COR = Object.freeze([
  'estatus_completo', 'dias_sin_visita', 'dias_sin_ccnr', 'dias_restantes'
]);
const AUTO_IDS_COR = Object.freeze(['id_asesor', 'id_sup', 'id_admin']);
const HIDDEN_FIELDS_COR = Object.freeze([
  'id_ins_fl', 'id_proyecto', ...AUTO_IDS_COR, 'activo', 'created_at', 'updated_at'
]);
const DIRECT_READONLY_FIELDS_COR = Object.freeze([...new Set([...AUTO_FIELDS_COR, ...HIDDEN_FIELDS_COR])]);
const DEPENDENCY_FIELDS_COR = Object.freeze([
  'estatus', 'fecha_visita', 'fecha_ccnr',
  'fecha_fin_montaje_modificado', 'fecha_fin_montaje_planeado'
]);
const STATUS_CODES_COR = Object.freeze(Object.keys(STATUS_LABELS_COR));
const TZ_COR = 'America/Mexico_City';
const EMPTY_DATE_MARKERS_COR = new Set(['', '-', '.', 'N/A', 'NA', 'N/D', 'NULL']);

function knownError_cor(statusCode, code, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function zonedToday_cor(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('Fecha tecnica invalida.');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_COR, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).reduce((obj, item) => {
    if (['year', 'month', 'day'].includes(item.type)) obj[item.type] = item.value;
    return obj;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseCivilDate_cor(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {kind:'valid', date: value.toISOString().slice(0,10)};
  }
  const input = String(value ?? '').trim();
  if (value == null || EMPTY_DATE_MARKERS_COR.has(input.toUpperCase())) {
    return {kind:'empty', date:null};
  }
  // ins_fl es VARCHAR/TEXT: admitir fechas historicas ISO y DD/MM/AAAA.
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(input);
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input);
  const year = iso ? Number(iso[1]) : dmy ? Number(dmy[3]) : 0;
  const month = iso ? Number(iso[2]) : dmy ? Number(dmy[2]) : 0;
  const day = iso ? Number(iso[3]) : dmy ? Number(dmy[1]) : 0;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return {kind:'invalid', date:null};
  }
  const candidate = new Date(Date.UTC(year,month-1,day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth()+1 !== month || candidate.getUTCDate() !== day) {
    return {kind:'invalid', date:null};
  }
  const ymd = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  return {kind:'valid', date:ymd};
}

function daysBetween_cor(earlier, later) {
  const a = Date.parse(`${earlier}T00:00:00Z`);
  const b = Date.parse(`${later}T00:00:00Z`);
  return Math.round((b-a)/86400000);
}

function derivedForRow_cor(row, todayYmd) {
  const today = parseCivilDate_cor(todayYmd);
  if (today.kind !== 'valid') throw new Error('Dia de corte no valido para calculos.');
  const data = {};
  const status = String(row?.estatus ?? '').trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(STATUS_LABELS_COR, status)) {
    data.estatus_completo = STATUS_LABELS_COR[status];
  }
  for (const [target, origin] of [
    ['dias_sin_visita','fecha_visita'],['dias_sin_ccnr','fecha_ccnr']
  ]) {
    const parsed = parseCivilDate_cor(row?.[origin]);
    if (parsed.kind === 'empty') data[target] = null;
    else if (parsed.kind === 'valid') data[target] = String(daysBetween_cor(parsed.date,today.date));
    // Valores heredados mal formados: no se sobreescriben a ciegas.
  }
  const changed = parseCivilDate_cor(row?.fecha_fin_montaje_modificado);
  const planned = parseCivilDate_cor(row?.fecha_fin_montaje_planeado);
  if (changed.kind === 'valid') {
    data.dias_restantes = String(daysBetween_cor(today.date, changed.date));
  } else if (changed.kind === 'empty') {
    if (planned.kind === 'valid') data.dias_restantes = String(daysBetween_cor(today.date, planned.date));
    else if (planned.kind === 'empty') data.dias_restantes = null;
  }
  // Estado no parseable: conservar valor original y reportar durante QA.
  return data;
}

function assertManualFields_cor(changes, allowedFields) {
  const keys = Object.keys(changes || {});
  if (!keys.length || keys.length !== 1) {
    throw knownError_cor(400,'INSTALACIONES_ADMINISTRACION_CELDA_UNICA',
      'La edicion directa modifica exactamente una columna por operacion.');
  }
  const field = keys[0];
  if (DIRECT_READONLY_FIELDS_COR.includes(field)) {
    throw knownError_cor(400,'INSTALACIONES_ADMINISTRACION_SOLO_LECTURA',
      'Las columnas tecnicas o calculadas no admiten edicion manual.',{field});
  }
  if (!allowedFields.includes(field)) {
    throw knownError_cor(400,'INSTALACIONES_ADMINISTRACION_CAMPO_NO_AUTORIZADO',
      'Campo no autorizado para edicion directa.',{field});
  }
  if (field === 'estatus' && !STATUS_CODES_COR.includes(String(changes[field] || ''))) {
    throw knownError_cor(400,'INSTALACIONES_ADMINISTRACION_ESTATUS_INVALIDO',
      'Selecciona uno de los ocho estatus autorizados.',{field});
  }
  return field;
}

module.exports = Object.freeze({
  STATUS_LABELS_COR, STATUS_CODES_COR, AUTO_FIELDS_COR, AUTO_IDS_COR,
  HIDDEN_FIELDS_COR, DIRECT_READONLY_FIELDS_COR, DEPENDENCY_FIELDS_COR,
  TZ_COR, knownError_cor, zonedToday_cor, parseCivilDate_cor,
  daysBetween_cor, derivedForRow_cor, assertManualFields_cor
});
