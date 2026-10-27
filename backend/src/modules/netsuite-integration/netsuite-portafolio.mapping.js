'use strict';
// BLT NOW / NS -> Aiven: correspondencia aprobada en REPORTE_PRUEBA_NS_PORTAFOLIO_V001.
// Solo tabla ns_portafolio_pruebas. Una columna imprevista bloquea el lote.
const FIELD_MAP = Object.freeze([
  Object.freeze({ name: "entityid", join: "", column: "id_equipo_ns" }),
  Object.freeze({ name: "formulatext", join: "", column: "numero_equipo" }),
  Object.freeze({ name: "companyname", join: "", column: "identificacion_sitio" }),
  Object.freeze({ name: "custentity_blt_proyecto_padre", join: "", column: "proyecto" }),
  Object.freeze({ name: "customer", join: "", column: "cliente" }),
  Object.freeze({ name: "subsidiarynohierarchy", join: "", column: "subsidiaria" }),
  Object.freeze({ name: "custentity_blt_region", join: "", column: "region" }),
  Object.freeze({ name: "custentity_blt_estado_proyecto", join: "", column: "estado" }),
  Object.freeze({ name: "custentity_blt_ciudad_proyecto", join: "", column: "ciudad" }),
  Object.freeze({ name: "custentity_blt_calle_prpyecto", join: "", column: "direccion" }),
  Object.freeze({ name: "custentity1", join: "", column: "zona_operativa" }),
  Object.freeze({ name: "custentity2", join: "", column: "zona_administrativa" }),
  Object.freeze({ name: "custentity_blt_categoria_proyecto", join: "", column: "categoria" }),
  Object.freeze({ name: "custentity_blt_prioridad_proyecto", join: "", column: "prioridad" }),
  Object.freeze({ name: "isinactive", join: "", column: "inactivo" }),
  Object.freeze({ name: "custentity7", join: "", column: "motivo_inactivo" }),
  Object.freeze({ name: "pricelevel", join: "customer", column: "nivel_precio" }),
  Object.freeze({ name: "terms", join: "customer", column: "terminos" }),
  Object.freeze({ name: "custentity_blt_project_status_service", join: "", column: "estatus_servicio" }),
  Object.freeze({ name: "custentity_blt_causa_no_servicio", join: "", column: "causa_no_servicio" }),
  Object.freeze({ name: "custentity_blt_project_det_no_serv", join: "", column: "detalle_no_servicio" }),
  Object.freeze({ name: "custentity_blt_frec_meses", join: "", column: "frecuencia" }),
  Object.freeze({ name: "custentity_blt_status_cobranza", join: "", column: "estatus_cobranza" }),
  Object.freeze({ name: "custentity_blt_val_unit_precio", join: "", column: "precio_unitario" }),
  Object.freeze({ name: "custentity_blt_estado_poliza", join: "", column: "tipo_poliza" }),
  Object.freeze({ name: "jobbillingtype", join: "", column: "tipo_facturacion" }),
  Object.freeze({ name: "custentity_blt_project_susp_temp", join: "", column: "suspension_temporal" }),
  Object.freeze({ name: "custentity_blt_proj_causa_susp_temp", join: "", column: "causa_suspension_temporal" }),
  Object.freeze({ name: "custrecord_blt_numero_contrato_fabricant", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "numero_contrato_fabricante" }),
  Object.freeze({ name: "custrecord_blt_producto", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "producto" }),
  Object.freeze({ name: "custrecord_blt_marca", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "marca" }),
  Object.freeze({ name: "custrecord_blt_modelo", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "modelo" }),
  Object.freeze({ name: "custrecord_blt_paradas", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "no_paradas" }),
  Object.freeze({ name: "custrecord_blt_pisos", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "no_accesos" }),
  Object.freeze({ name: "custrecord_blt_velocidad", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "velocidad_ms" }),
  Object.freeze({ name: "custrecord_blt_capacidad", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "capacidad_kg" }),
  Object.freeze({ name: "custrecord_blt_desnivel", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "desnivel_mm" }),
  Object.freeze({ name: "custrecord_blt_longitud", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "longitud_mm" }),
  Object.freeze({ name: "custrecord_blt_ancho_peldano", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "ancho_peldano_mm" }),
  Object.freeze({ name: "custrecord_blt_inclinacion", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "inclinacion_grados" }),
  Object.freeze({ name: "custrecord_blt_tiempo_mp", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "tiempo_mp_hrs" }),
  Object.freeze({ name: "custrecord_blt_no_gratuitos", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "no_gratuitos" }),
  Object.freeze({ name: "custrecord_blt_no_garantia", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "no_garantia" }),
  Object.freeze({ name: "custrecord_blt_fecha_instalacion", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "fecha_instalacion" }),
  Object.freeze({ name: "custrecord_blt_fecha_entrega", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "fecha_entrega" }),
  Object.freeze({ name: "custrecord_blt_termino_garantia", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "termino_garantia" }),
  Object.freeze({ name: "custrecord_blt_fecha_recepcion_mtto", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "fecha_recepcion_mantenimiento" }),
  Object.freeze({ name: "custrecord_blt_mes_inicio_gratuitos", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "mes_inicio_gratuitos" }),
  Object.freeze({ name: "custrecord_blt_mes_termino_gratuitos", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "mes_termino_gratuitos" }),
  Object.freeze({ name: "custrecord_blt_mes_obj_inicio_cobranza", join: "CUSTENTITY_BLT_CODIGO_EQUIPO", column: "mes_objetivo_inicio_cobranza" }),
  Object.freeze({ name: "custentity_blt_fecha_ingreso_portafolio", join: "", column: "fecha_ingreso_portafolio" }),
  Object.freeze({ name: "custrecord18", join: "custentity1", column: "superintendente" }),
  Object.freeze({ name: "custrecord_blt_supervisor_zona", join: "custentity1", column: "supervisor_zona" }),
 ]);

const SOURCE_KEY = (name, join) => `${String(name || '').toLowerCase()}|${String(join || '').toLowerCase()}`;
const COLUMNS = Object.freeze(FIELD_MAP.map(field => field.column));
const FIELD_BY_SOURCE = new Map(FIELD_MAP.map(field => [SOURCE_KEY(field.name, field.join), field]));
const DATE_COLUMNS = new Set([
  'fecha_instalacion', 'fecha_entrega', 'termino_garantia', 'fecha_recepcion_mantenimiento',
  'fecha_ingreso_portafolio'
]);

function invalid(message, statusCode = 422, code = 'NS_PORTAFOLIO_INVALID') {
  const err = new Error(message);
  err.statusCode = statusCode; err.code = code;
  return err;
}

function validateColumns(sourceColumns) {
  if (!Array.isArray(sourceColumns) || sourceColumns.length !== FIELD_MAP.length) {
    throw invalid('Portafolio requiere exactamente las 53 columnas de la busqueda aprobada.', 422, 'NS_PORTAFOLIO_COLUMNS');
  }
  const mapped = [];
  const seen = new Set();
  for (const [index, column] of sourceColumns.entries()) {
    if (!column || column.indice !== index) throw invalid('Indices de columnas de NS incorrectos.');
    const key = SOURCE_KEY(column.nombre, column.join);
    const match = FIELD_BY_SOURCE.get(key);
    if (!match || seen.has(key)) throw invalid('Campo NS inesperado o repetido: ' + String(column.nombre || ''), 422, 'NS_PORTAFOLIO_COLUMNS');
    seen.add(key);
    mapped.push(match.column);
  }
  if (seen.size !== FIELD_MAP.length) throw invalid('Faltan campos de Portafolio.', 422, 'NS_PORTAFOLIO_COLUMNS');
  return Object.freeze(mapped);
}

function convertScalar(value, name) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw invalid('Valor NS no escalar en ' + name);
  }
  const text = String(value).trim();
  if (/\u0000|[\u0001-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
    throw invalid('Valor NS contiene controles invalidos en ' + name);
  }
  return text || null;
}

function normalizeDate(raw, format) {
  if (raw === null) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number);
    const d = new Date(Date.UTC(year,month-1,day));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) {
      throw invalid('Fecha NS invalida.');
    }
    return `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`;
  }
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (!match) throw invalid('Formato de fecha NetSuite no reconocido: ' + raw, 422, 'NS_PORTAFOLIO_DATE_FORMAT');
  const a=Number(match[1]), b=Number(match[2]), year=Number(match[3]);
  const day=format==='MM/DD/YYYY'?b:a;
  const month=format==='MM/DD/YYYY'?a:b;
  const date=new Date(Date.UTC(year,month-1,day));
  if (date.getUTCFullYear()!==year || date.getUTCMonth()+1!==month || date.getUTCDate()!==day) {
    throw invalid('Fecha NS invalida: ' + raw, 422, 'NS_PORTAFOLIO_DATE_FORMAT');
  }
  return `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`;
}

function convertRow(row, sourceMapping, lengths, dateFormat) {
  if (!row || !Array.isArray(row.valores) || row.valores.length !== sourceMapping.length) {
    throw invalid('Cantidad de valores diferente al numero de columnas de la busqueda.', 422, 'NS_PORTAFOLIO_ROW_WIDTH');
  }
  if (!['DD/MM/YYYY','MM/DD/YYYY'].includes(dateFormat)) {
    throw invalid('Formato de fechas NS no configurado.', 503, 'NS_PORTAFOLIO_DATE_CONFIG');
  }
  const result = Object.create(null);
  for (let i=0;i<sourceMapping.length;i++) {
    const col=sourceMapping[i];
    let value=convertScalar(row.valores[i],col);
    if (DATE_COLUMNS.has(col)) value=normalizeDate(value,dateFormat);
    if (col==='inactivo' && value!==null) {
      const boolean=String(value).trim().toUpperCase();
      if (['1','T','TRUE','SI','SÍ','YES'].includes(boolean)) value='1';
      else if (['0','F','FALSE','NO'].includes(boolean)) value='0';
      else throw invalid('Bandera inactivo de NetSuite invalida.',422,'NS_PORTAFOLIO_BOOL_INVALID');
    }
    const limit=lengths?.get(col);
    if (!Number.isFinite(limit) || limit < 1) throw invalid('Esquema sin longitud verificada: '+col,503,'NS_PORTAFOLIO_SCHEMA_INVALID');
    if (value && [...value].length > limit) {
      throw invalid('Valor NS supera longitud de '+col,422,'NS_PORTAFOLIO_VALUE_TOO_LONG');
    }
    result[col]=value;
  }
  if (result.estatus_servicio?.toLocaleLowerCase('es')==='en servicio' && result.inactivo==='1') {
    throw invalid('Inconsistencia NS: En Servicio con inactivo=1.',422,'NS_PORTAFOLIO_CONFLICT');
  }
  if (!result.numero_equipo || !result.id_equipo_ns) {
    throw invalid('numero_equipo e id_equipo_ns son obligatorios.',422,'NS_PORTAFOLIO_KEY_MISSING');
  }
  // Tabla experimental: no calcular FK de zonas por texto. zona_id permanece en BD.
  return result;
}

module.exports = { FIELD_MAP, COLUMNS, validateColumns, convertRow, invalid };
