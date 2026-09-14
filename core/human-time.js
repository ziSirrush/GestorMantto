// [Aster | 2026-09-14 | ASTER-MG | FASE 2 FRONTEND CDMX V001]
(function(root, factory){
  'use strict';

  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.ManttoHumanTime = api;
})(typeof window !== 'undefined' ? window : globalThis, function(){
  'use strict';

  const SYSTEM_TIME_ZONE = 'America/Mexico_City';
  const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const SQL_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2})(\.\d{1,6})?)?$/;
  const OFFSET_RE = /(Z|[+-]\d{2}:?\d{2})$/i;

  function rawText(value){
    return String(value == null ? '' : value).trim();
  }

  function dateOnlyParts(value){
    const match = rawText(value).match(DATE_ONLY_RE);
    if(!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const check = new Date(Date.UTC(year, month - 1, day));
    if(
      check.getUTCFullYear() !== year ||
      check.getUTCMonth() !== month - 1 ||
      check.getUTCDate() !== day
    ) return null;
    return { year:match[1], month:match[2], day:match[3] };
  }

  function formatDateLiteral(value, options){
    const settings = options || {};
    const fallback = Object.prototype.hasOwnProperty.call(settings, 'fallback') ? settings.fallback : '—';
    const parts = dateOnlyParts(value);
    if(!parts) return fallback;
    return parts.day + '/' + parts.month + '/' + parts.year;
  }

  function parseInstant(value){
    if(value instanceof Date){
      return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
    }
    if(typeof value === 'number'){
      const numericDate = new Date(value);
      return Number.isNaN(numericDate.getTime()) ? null : numericDate;
    }

    const text = rawText(value);
    if(!text || dateOnlyParts(text)) return null;

    // Contrato Mantto Gestor:
    // - DATE (YYYY-MM-DD) no es un instante y nunca se convierte de zona.
    // - DATETIME interno sin sufijo representa un instante almacenado en UTC.
    // - ISO con Z/offset conserva el instante que ya trae la fuente.
    const sqlMatch = text.match(SQL_DATETIME_RE);
    let normalized = text;
    if(sqlMatch && !OFFSET_RE.test(text)){
      normalized = sqlMatch[1] + 'T' + sqlMatch[2] + ':' + (sqlMatch[3] || '00') + (sqlMatch[4] || '') + 'Z';
    }

    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function partMap(formatter, date){
    return formatter.formatToParts(date).reduce(function(parts, part){
      if(part.type !== 'literal') parts[part.type] = part.value;
      return parts;
    }, {});
  }

  function dateTimeParts(value, settings){
    const date = value === undefined ? new Date() : parseInstant(value);
    if(!date) return null;
    const intlOptions = {
      day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit', hourCycle:'h23'
    };
    if(settings && settings.seconds) intlOptions.second = '2-digit';
    if(settings && settings.timeZone) intlOptions.timeZone = settings.timeZone;
    return partMap(new Intl.DateTimeFormat((settings && settings.locale) || 'es-MX', intlOptions), date);
  }

  function formatDateTime(value, options){
    const settings = options || {};
    const fallback = Object.prototype.hasOwnProperty.call(settings, 'fallback') ? settings.fallback : '—';

    // Una fecha civil no adquiere hora ni cambia de día por la zona del visor.
    if(dateOnlyParts(value)) return formatDateLiteral(value, { fallback });

    const parts = dateTimeParts(value, settings);
    if(!parts) return fallback;
    const time = parts.hour + ':' + parts.minute + (settings.seconds ? ':' + parts.second : '');
    return parts.day + '/' + parts.month + '/' + parts.year + ' - ' + time;
  }

  function formatInteractionLines(value, options){
    const text = String(value == null ? '' : value);
    if(!text) return text;
    return text.split(/\r?\n/).map(function(line){
      const epochMatch = line.match(/^\s*@([0-9]{10,13})\s+-\s+([\s\S]*)$/);
      if(epochMatch){
        const rawEpoch = Number(epochMatch[1]);
        const epochMs = epochMatch[1].length <= 10 ? rawEpoch * 1000 : rawEpoch;
        return formatDateTime(epochMs, options) + ' - ' + epochMatch[2];
      }
      const match = line.match(/^\s*((?:\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:Z|[+-]\d{2}:?\d{2})?)\s+-\s+([\s\S]*)$/);
      if(!match) return line;
      return formatDateTime(match[1], options) + ' - ' + match[2];
    }).join('\n');
  }

  function viewerTimeZone(){
    try{ return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; }
    catch(_error){ return ''; }
  }

  function mexicoCityParts(value, options){
    const settings = Object.assign({}, options || {}, { timeZone:SYSTEM_TIME_ZONE });
    return dateTimeParts(value === undefined ? new Date() : value, settings);
  }

  function mexicoCityDate(value){
    const parts = mexicoCityParts(value);
    return parts ? parts.year + '-' + parts.month + '-' + parts.day : '';
  }

  function civilDateOffset(dateText, days){
    const parts = dateOnlyParts(dateText);
    if(!parts) return '';
    const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + Number(days || 0)));
    return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + String(date.getUTCDate()).padStart(2, '0');
  }

  function mexicoCityDateOffset(days, value){
    return civilDateOffset(mexicoCityDate(value), days);
  }

  function mexicoCityMonthOffset(months, value, separator){
    const base = dateOnlyParts(mexicoCityDate(value));
    if(!base) return '';
    const date = new Date(Date.UTC(Number(base.year), Number(base.month) - 1 + Number(months || 0), 1));
    const joiner = separator === '_' ? '_' : '-';
    return date.getUTCFullYear() + joiner + String(date.getUTCMonth() + 1).padStart(2, '0');
  }

  function formatMexicoCityDate(value, options){
    const settings = options || {};
    const fallback = Object.prototype.hasOwnProperty.call(settings, 'fallback') ? settings.fallback : '—';
    const literal = dateOnlyParts(value);
    const locale = settings.locale || 'es-MX';
    const dateOptions = Object.assign({ day:'2-digit', month:'2-digit', year:'numeric' }, settings.dateOptions || {});
    let date;
    if(literal){
      date = new Date(Date.UTC(Number(literal.year), Number(literal.month) - 1, Number(literal.day), 12, 0, 0));
      dateOptions.timeZone = 'UTC';
    }else{
      date = value === undefined ? new Date() : parseInstant(value);
      if(!date) return fallback;
      dateOptions.timeZone = SYSTEM_TIME_ZONE;
    }
    try{ return new Intl.DateTimeFormat(locale, dateOptions).format(date); }
    catch(_error){ return fallback; }
  }

  function mexicoCityTime(value, options){
    const settings = options || {};
    const parts = mexicoCityParts(value, { seconds:Boolean(settings.seconds) });
    if(!parts) return '';
    return parts.hour + ':' + parts.minute + (settings.seconds ? ':' + parts.second : '');
  }

  function mexicoCityYear(value){
    const parts = mexicoCityParts(value);
    return parts ? Number(parts.year) : null;
  }

  function formatMexicoCityDateTime(value, options){
    return formatDateTime(value === undefined ? new Date() : value, Object.assign({}, options || {}, { timeZone:SYSTEM_TIME_ZONE }));
  }

  return Object.freeze({
    SYSTEM_TIME_ZONE,
    parseInstant,
    formatDateLiteral,
    formatDateTime,
    formatInteractionLines,
    viewerTimeZone,
    mexicoCityDate,
    mexicoCityDateOffset,
    mexicoCityMonthOffset,
    mexicoCityTime,
    mexicoCityYear,
    formatMexicoCityDate,
    formatMexicoCityDateTime
  });
});
