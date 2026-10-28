'use strict';
// Fuente BLTNOW_NS_Tickets_Fuente_V002.js (FIX V003), 36 columnas en orden fijo.
// IMPORTANTE: El origen NO incluye formulas en el manifiesto HTTP; se comprueban
// nombre, join, indice y etiqueta para distinguir formulas repetidas.
const definitions = [
  ['internalid', '', 'ID interno', 'id_interno'],
  ['casenumber', '', 'No. Ticket', 'ticket'],
  ['status', '', 'Estado Ticket', 'estado_ticket'],
  ['custentity_blt_estado_proyecto', 'customer', 'Estado', 'estado'],
  ['custentity_blt_ciudad_proyecto', 'customer', 'Ciudad', 'ciudad'],
  ['custentity_blt_proyecto_padre', 'customer', 'Proyecto', 'proyecto'],
  ['formulatext', '', 'Código Equipo', 'codigo_equipo'],
  ['custevent_blt_referencia_sitio', '', 'Referencia en Sitio', 'referencia_en_zona_operativa'],
  ['custevent_blt_zonaop_callcenter_', '', 'Zona Operativa', 'zona'],
  ['title', '', 'Asunto', 'descripcion'],
  ['custevent_blt_f_reporte', '', 'F Reporte', 'fecha_reporte'],
  ['custevent_blt_h_reporte', '', 'H Reporte', 'h_reporte'],
  ['custevent_blt_estatusequipo', '', 'Estatus Equipo Inicial', 'estatus_equipo_ir'],
  ['custevent_blt_f_llegada', '', 'F Llegada', 'fecha_llegada'],
  ['custevent_blt_h_llegada', '', 'H Llegada', 'h_llegada'],
  ['custevent_bt_personaqueatiende_', '', 'Persona que atiende', 'persona_que_atiende'],
  ['custevent_blt_f_solucion', '', 'F Solución', 'fecha_cierre'],
  ['custevent_blt_h_solucion', '', 'H Solución', 'h_solucion'],
  ['custevent_blt_tecnico_solucion', '', 'Técnico de Solución', 'tecnico'],
  ['custevent_blt_estatus_cierre', '', 'Estatus Equipo Final', 'estatus_equipo_final'],
  ['custevent_blt_causa', '', 'Causa', 'causa'],
  ['custevent_blt_accion_cierre', '', 'Acción en Cierre', 'accion_en_cierre'],
  ['custevent_blt_responsabilidad', '', 'RESPONSABILIDAD', 'responsabilidad'],
  ['custevent_blt_causa_falla', '', 'Causa de Falla', 'causa_falla'],
  ['formulanumeric', '', 'Tiempo Llegada (hrs)', 'tiempo_llegada'],
  ['formulanumeric', '', 'Tiempo Solución (hrs)', 'tiempo_solucion'],
  ['custevent_blt_producto_callcenter', '', 'Producto', 'tipo_equipo'],
  ['custentity_blt_prioridad_proyecto', 'company', 'Prioridad Proyecto', 'prioridad'],
  ['custevent_blt_ejecutivo_callcenter', '', 'Ejecutivo Call Center', 'ejecutivo_call'],
  ['custevent_blt_empleado_cierre', '', 'BLT Empleado Cierre ', 'blt_empleado'],
  ['custeventblt_ticket_noatendido', '', 'Ticket excede tiempo de atención (Motivo)', 'ticket_excede'],
  ['custevent_blt_zonaadmin_callcenter', '', 'Zona Administrativa', 'zona_administrativa'],
  ['custevent_blt_zona_falla', '', 'Zona de falla', 'zona_de_falla'],
  ['formulatext', '', 'Mes reporte', 'mes_reporte'],
  ['custevent_blt_proyecto_padre', '', 'Proyecto Padre', 'proyecto_padre'],
  ['custeventblt_mot_det', '', 'Motivo equipo detenido', 'custeventblt_mot_det']
];
const FIELD_MAP = Object.freeze(definitions.map(([name,join,label,column]) =>
  Object.freeze({name,join,label,column})));
const COLUMNS = Object.freeze(FIELD_MAP.map(item=>item.column));
const NUMERIC = new Set(['tiempo_llegada','tiempo_solucion']);
const DATES = Object.freeze([
  ['fecha_reporte','h_reporte'],['fecha_llegada','h_llegada'],['fecha_cierre','h_solucion']
]);

function invalid(message, statusCode=422, code='NS_TICKETS_INVALID') {
  const error=new Error(message);error.statusCode=statusCode;error.code=code;return error;
}
const norm=s=>String(s==null?'':s).trim().toLowerCase();
function validateColumns(columns) {
  if (!Array.isArray(columns) || columns.length !== FIELD_MAP.length) {
    throw invalid('Tickets requiere exactamente 36 columnas.',422,'NS_TICKETS_COLUMNS');
  }
  for (let i=0;i<FIELD_MAP.length;i++) {
    const actual=columns[i], expected=FIELD_MAP[i];
    if (!actual || actual.indice!==i || norm(actual.nombre)!==norm(expected.name) ||
        norm(actual.join)!==norm(expected.join) ||
        String(actual.label==null?'':actual.label).trim()!==expected.label.trim() ||
        actual.summary != null && String(actual.summary).trim()!=='') {
      throw invalid('Manifiesto de Tickets incompatible en columna '+(i+1),422,'NS_TICKETS_COLUMNS');
    }
  }
  return COLUMNS;
}
function scalar(raw, column) {
  if (raw===null || raw===undefined || raw==='') return null;
  if (typeof raw==='boolean') return raw?'1':'0';
  if (typeof raw!=='string' && (typeof raw!=='number' || !Number.isFinite(raw))) {
    throw invalid('Valor no escalar en '+column,422,'NS_TICKETS_VALUE_TYPE');
  }
  const value=String(raw).trim();
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value)) {
    throw invalid('Control no permitido en '+column,422,'NS_TICKETS_VALUE_CONTROL');
  }
  return value||null;
}
function validDate(year,month,day) {
  const d=new Date(Date.UTC(year,month-1,day));
  return Number.isInteger(year) && year>=1900 && year<=2100 && d.getUTCFullYear()===year &&
    d.getUTCMonth()===month-1 && d.getUTCDate()===day;
}
function parseDate(raw,format) {
  let y,m,d,clock='';
  let match=/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}:\d{2}(?::\d{2})?))?$/.exec(raw);
  if (match) { y=Number(match[1]);m=Number(match[2]);d=Number(match[3]);clock=match[4]||''; }
  else {
    match=/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?))?$/.exec(raw);
    if (!match || !['DD/MM/YYYY','MM/DD/YYYY'].includes(format)) {
      throw invalid('Fecha de Tickets fuera del formato configurado.',422,'NS_TICKETS_DATE_FORMAT');
    }
    const a=Number(match[1]),b=Number(match[2]);
    d=format==='DD/MM/YYYY'?a:b;m=format==='DD/MM/YYYY'?b:a;y=Number(match[3]);clock=match[4]||'';
  }
  if (!validDate(y,m,d)) throw invalid('Fecha de Tickets invalida.',422,'NS_TICKETS_DATE_INVALID');
  return {day:`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,clock};
}
function parseTime(raw) {
  if (!raw) return null;
  const m=/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/.exec(raw);
  if (!m) throw invalid('Hora de Tickets sin formato verificable.',422,'NS_TICKETS_TIME_FORMAT');
  let h=Number(m[1]);const minute=Number(m[2]);const second=Number(m[3]||0);
  if (minute>59 || second>59 || (m[4] ? h<1||h>12 : h>23)) {
    throw invalid('Hora de Tickets invalida.',422,'NS_TICKETS_TIME_INVALID');
  }
  if (m[4]) h=(h%12)+(m[4].toUpperCase()==='PM'?12:0);
  return `${String(h).padStart(2,'0')}:${String(minute).padStart(2,'0')}:${String(second).padStart(2,'0')}`;
}
function datetime(date, hour, format) {
  if (!date) return null;
  const parsed=parseDate(date,format);
  const embedded=parseTime(parsed.clock), separate=parseTime(hour);
  if (embedded && separate && embedded!==separate) {
    throw invalid('Fecha y hora de Tickets inconsistentes.',422,'NS_TICKETS_TIME_CONFLICT');
  }
  return parsed.day+' '+(separate||embedded||'00:00:00');
}
function decimal(value,col,shape) {
  if (value===null) return null;
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) {
    throw invalid('Numero decimal invalido en '+col,422,'NS_TICKETS_DECIMAL_INVALID');
  }
  const [a,b='']=value.replace('-','').split('.');
  const p=Number(shape?.precision),s=Number(shape?.scale);
  if (!Number.isInteger(p)||!Number.isInteger(s)||s<0||p<=s ||
      a.replace(/^0+/,'').length>p-s || b.length>s) {
    throw invalid('Decimal fuera de escala en '+col,422,'NS_TICKETS_DECIMAL_RANGE');
  }
  return value;
}
function convertRow(row, sourceMapping, schema, dateFormat) {
  if (!row || !Array.isArray(row.valores) || row.valores.length!==COLUMNS.length ||
      !Array.isArray(sourceMapping) || sourceMapping.length!==COLUMNS.length) {
    throw invalid('Ancho del registro Tickets invalido.',422,'NS_TICKETS_ROW_WIDTH');
  }
  if (!['DD/MM/YYYY','MM/DD/YYYY'].includes(dateFormat)) {
    throw invalid('Locale de Tickets no aprobado.',503,'NS_TICKETS_DATE_CONFIG');
  }
  const record=Object.create(null);
  for (let i=0;i<COLUMNS.length;i++) {
    const name=sourceMapping[i],def=schema?.get(name);
    if (name!==COLUMNS[i] || !def) throw invalid('Campo o DDL de Tickets no validado.',503,'NS_TICKETS_SCHEMA_BLOCKED');
    let value=scalar(row.valores[i],name);
    if (NUMERIC.has(name)) value=decimal(value,name,def);
    else if (value!==null && def.max && [...value].length>def.max) {
      throw invalid('Valor excede longitud de '+name,422,'NS_TICKETS_VALUE_TOO_LONG');
    }
    record[name]=value;
  }
  for (const [date,hour] of DATES) {
    record[date]=datetime(record[date],record[hour],dateFormat);
  }
  if (!record.ticket || !record.id_interno || !/^\d+$/.test(record.id_interno)) {
    throw invalid('Ticket e ID interno de NS son obligatorios.',422,'NS_TICKETS_KEY_MISSING');
  }
  if (row.idOrigen==null || String(row.idOrigen)!==record.id_interno ||
      (row.tipoOrigen!=null && norm(row.tipoOrigen)!=='supportcase')) {
    throw invalid('Identidad del Ticket no coincide con su origen.',422,'NS_TICKETS_ORIGIN_MISMATCH');
  }
  return record;
}
module.exports={FIELD_MAP,COLUMNS,NUMERIC,DATES,validateColumns,convertRow,invalid,parseDate,parseTime};
