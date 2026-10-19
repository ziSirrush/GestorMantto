'use strict';

// [Aster | 2026-10-19 | ASTER-MG | ALMACEN NS FASE 2 RECEPTOR 230 433 CATALOGO V001]
// Ingreso M2M por paginas con bloqueo transaccional, hash e idempotencia.
// Sin nuevas tablas ni referencias a Excel. Solo el inventario completo
// PUBLICADO y activo alimenta las lecturas de la Fase 1.

const crypto = require('crypto');
const db = require('../../config/db');

const TYPE_BY_ROUTE = Object.freeze({
  'inventario-230': 'INVENTARIO_230',
  'movimientos-433': 'MOVIMIENTOS_433',
  'catalogo-articulos': 'CATALOGO_ARTICULOS'
});
const TABLE_BY_TYPE = Object.freeze({
  INVENTARIO_230: 'almacen_ns_inventario',
  MOVIMIENTOS_433: 'almacen_ns_movimientos',
  CATALOGO_ARTICULOS: 'almacen_ns_catalogo_articulos'
});
const MAX_PAGE_SIZE = 300;
const MAX_PAGES = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/i;
const BIGINT_MAX = 18446744073709551615n;
const PUBLISH_LOCK = 'almacen_ns_230_publish';

// column, JSON property, type, nullable, optional max chars.
const COLS = Object.freeze({
  INVENTARIO_230: Object.freeze([
    ['id_articulo_ns', 'idArticuloNs', 'u64'],
    ['articulo', 'articulo', 'str', false, 500],
    ['descripcion', 'descripcion', 'str', true, 60000],
    ['valor_factura', 'valorFactura', 'dec4', true],
    ['porcentaje_valor_factura', 'porcentajeValorFactura', 'dec8', true],
    ['fisico', 'fisico', 'dec4'],
    ['id_subsidiaria_ns', 'idSubsidiariaNs', 'str', false, 50],
    ['subsidiaria', 'subsidiaria', 'str', true, 255],
    ['id_ubicacion_ns', 'idUbicacionNs', 'str', false, 50],
    ['almacen_ubicacion', 'almacenUbicacion', 'str', true, 255]
  ]),
  MOVIMIENTOS_433: Object.freeze([
    ['id_transaccion_ns', 'idTransaccionNs', 'u64'],
    ['id_linea_ns', 'idLineaNs', 'u64zero'],
    ['fecha_transaccion', 'fechaTransaccion', 'date'],
    ['numero_documento', 'numeroDocumento', 'str', true, 100],
    ['tipo_transaccion', 'tipoTransaccion', 'str', false, 200],
    ['departamento', 'departamento', 'str', true, 255],
    ['id_articulo_ns', 'idArticuloNs', 'u64'],
    ['articulo', 'articulo', 'str', false, 500],
    ['ag', 'ag', 'str', true, 120],
    ['descripcion', 'descripcion', 'str', true, 60000],
    ['cantidad', 'cantidad', 'dec4'],
    ['importe_bruto', 'importeBruto', 'dec4', true],
    ['categoria', 'categoria', 'str', true, 255],
    ['clase', 'clase', 'str', true, 255],
    ['proyecto', 'proyecto', 'str', true, 500],
    ['motivo_salida', 'motivoSalida', 'str', true, 500],
    ['sin_cargo_cliente', 'sinCargoCliente', 'str', true, 100],
    ['id_subsidiaria_ns', 'idSubsidiariaNs', 'str', false, 50],
    ['subsidiaria', 'subsidiaria', 'str', true, 255],
    ['id_ubicacion_ns', 'idUbicacionNs', 'str', false, 50],
    ['almacen_ubicacion', 'almacenUbicacion', 'str', true, 255]
  ]),
  CATALOGO_ARTICULOS: Object.freeze([
    ['fila_origen', 'filaOrigen', 'int'],
    ['id_articulo_ns', 'idArticuloNs', 'u64'],
    ['nombre_articulo', 'nombreArticulo', 'str', false, 500],
    ['numero_parte_fabricante_original', 'numeroParteFabricanteOriginal', 'str', true, 255],
    ['categoria_articulo', 'categoriaArticulo', 'str', true, 255],
    ['cantidad_fisica_total_reportada', 'cantidadFisicaTotalReportada', 'dec4', true],
    ['ubicacion_inventario_texto', 'ubicacionInventarioTexto', 'str', true, 255],
    ['ultimo_precio_compra', 'ultimoPrecioCompra', 'dec6', true]
  ])
});

function err(message, status = 400, code = 'ALMACEN_NS_SYNC_INVALID', details) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  if (details) e.details = details;
  return e;
}
function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}
function toType(route) {
  const type = TYPE_BY_ROUTE[String(route || '')];
  if (!type) throw err('Fuente NetSuite no reconocida.', 404, 'ALMACEN_NS_SOURCE_UNKNOWN');
  return type;
}
function uuid(value) {
  const s = String(value || '').trim().toLowerCase();
  if (!UUID.test(s)) throw err('idLote debe ser un UUID valido.', 422, 'ALMACEN_NS_LOT_ID_INVALID');
  return s;
}
function countValue(value, key, min, max) {
  if (typeof value === 'boolean' || value === null || value === undefined || value === '') {
    throw err(`${key} es obligatorio.`, 422);
  }
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw err(`${key} debe ser un entero entre ${min} y ${max}.`, 422);
  }
  return n;
}
function dateOnly(value, label, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) throw err(`${label} es obligatorio (AAAA-MM-DD).`, 422);
    return null;
  }
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw err(`${label} debe usar AAAA-MM-DD.`, 422);
  const date = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== s) {
    throw err(`${label} no es una fecha valida.`, 422);
  }
  return s;
}
function sqlDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
function numericString(value, precision, scale, key, nullable) {
  if (value === null || value === undefined || value === '') {
    if (nullable) return null;
    throw err(`${key} es obligatorio y debe ser numerico.`, 422);
  }
  if (typeof value === 'boolean' || (typeof value !== 'string' && typeof value !== 'number')) {
    throw err(`${key} debe ser numerico.`, 422);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw err(`${key} debe ser finito.`, 422);
  let raw = String(value).trim();
  if (!raw) {
    if (nullable) return null;
    throw err(`${key} es obligatorio.`, 422);
  }
  // Se admiten decimales JSON y numerales con coma de miles (NO coma decimal).
  const commaPattern = /^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
  if (raw.includes(',')) {
    if (!commaPattern.test(raw)) throw err(`${key} tiene un separador numerico ambiguo.`, 422);
    raw = raw.replace(/,/g, '');
  }
  if (/e/i.test(raw)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw err(`${key} debe usar decimal explicito.`, 422);
    raw = value.toFixed(scale);
    if (Number(raw) !== value) throw err(`${key} excede la escala decimal permitida.`, 422);
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) throw err(`${key} contiene caracteres no numericos.`, 422);
  const unsignedRaw = raw.startsWith('-') ? raw.slice(1) : raw;
  const [integerPart, decimalPart = ''] = unsignedRaw.split('.');
  if (integerPart.replace(/^0+/, '').length > precision - scale || decimalPart.length > scale) {
    throw err(`${key} excede DECIMAL(${precision},${scale}).`, 422);
  }
  return raw === '-0' ? '0' : raw;
}
function positiveBigInt(value, key, allowZero = false) {
  if (value === undefined || value === null || value === '' || typeof value === 'boolean') {
    throw err(`${key} es obligatorio.`, 422);
  }
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw err(`${key} excede la precision numerica segura; envia texto decimal.`, 422);
  }
  const s = String(value).trim();
  if (!/^\d+$/.test(s)) throw err(`${key} debe ser un ID NetSuite numerico sin formato.`, 422);
  const n = BigInt(s);
  if ((!allowZero && n === 0n) || n > BIGINT_MAX) throw err(`${key} esta fuera del rango permitido.`, 422);
  return n.toString();
}
function safeString(value, key, nullable, maxChars) {
  if (value === undefined || value === null || value === '') {
    if (nullable) return null;
    throw err(`${key} es obligatorio.`, 422);
  }
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    throw err(`${key} debe ser texto.`, 422);
  }
  const s = String(value).trim();
  if (!s) {
    if (nullable) return null;
    throw err(`${key} no puede estar vacio.`, 422);
  }
  if ([...s].length > maxChars) throw err(`${key} excede ${maxChars} caracteres.`, 422);
  if (maxChars === 60000 && Buffer.byteLength(s, 'utf8') > 60000) {
    throw err(`${key} supera el limite seguro de bytes para MySQL TEXT.`, 422);
  }
  return s;
}
function normalizeRow(type, row, index) {
  if (!row || Array.isArray(row) || typeof row !== 'object') throw err(`Fila ${index}: formato incorrecto.`, 422);
  const schema = COLS[type];
  const allowed = new Set(schema.map(item => item[1]));
  for (const key of Object.keys(row)) {
    if (!allowed.has(key)) throw err(`Fila ${index}: campo no admitido ${key}.`, 422);
  }
  const normalized = {};
  for (const [column, prop, valueType, nullable = false, maxChars] of schema) {
    const value = row[prop];
    try {
      if (valueType === 'u64' || valueType === 'u64zero') normalized[prop] = positiveBigInt(value, prop, valueType === 'u64zero');
      else if (valueType === 'int') normalized[prop] = countValue(value, prop, 1, 4294967295);
      else if (valueType === 'str') normalized[prop] = safeString(value, prop, nullable, maxChars);
      else if (valueType === 'date') normalized[prop] = dateOnly(value, prop, !nullable);
      else if (valueType.startsWith('dec')) normalized[prop] = numericString(value, 20, Number(valueType.slice(3)), prop, nullable);
      else throw err(`Tipo de dato no soportado para ${column}.`, 500);
    } catch (error) {
      if (error.status === 422) error.message = `Fila ${index}: ${error.message}`;
      throw error;
    }
  }
  return normalized;
}
function rowKey(type, row) {
  if (type === 'INVENTARIO_230') return [row.idArticuloNs, row.idSubsidiariaNs, row.idUbicacionNs].join('|');
  if (type === 'MOVIMIENTOS_433') return [row.idTransaccionNs, row.idLineaNs].join('|');
  return String(row.filaOrigen);
}
function parseMeta(value) {
  let data = value;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (_) { throw err('Metadatos de lote danados.', 500, 'ALMACEN_NS_META_INVALID'); }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.version !== 1 || !data.pages || typeof data.pages !== 'object') {
    throw err('Metadatos de lote incompatibles.', 500, 'ALMACEN_NS_META_INVALID');
  }
  return data;
}
function rowState(lot, includePages = true) {
  const meta = parseMeta(lot.metadata_json);
  return {
    ok:true,
    loteId:lot.id_lote,
    tipoFuente:lot.tipo_fuente,
    modoCarga:lot.modo_carga,
    estado:lot.estado,
    activo:Number(lot.activo) === 1,
    completo:Number(lot.es_completo) === 1,
    fechaCorte:sqlDate(lot.fecha_corte),
    esperadas:Number(lot.filas_esperadas),
    recibidas:Number(lot.filas_recibidas),
    validas:Number(lot.filas_validas),
    paginasEsperadas:Number(lot.paginas_esperadas),
    paginasRecibidas:Number(lot.paginas_recibidas),
    hashCarga:lot.hash_carga,
    paginas:includePages ? Object.keys(meta.pages).map(Number).sort((a,b) => a-b) : undefined
  };
}
async function connectionWork(work, { advisory = false } = {}) {
  const conn = await db.getConnection();
  let began = false;
  let hasLock = false;
  try {
    if (advisory) {
      const [locks] = await conn.query('SELECT GET_LOCK(?, 10) AS locked', [PUBLISH_LOCK]);
      if (Number(locks[0]?.locked) !== 1) throw err('Otra publicacion de inventario esta en curso. Reintenta.', 409, 'ALMACEN_NS_PUBLISH_LOCK');
      hasLock = true;
    }
    await conn.beginTransaction();
    began = true;
    const result = await work(conn);
    await conn.commit();
    began = false;
    return result;
  } catch (error) {
    if (began) try { await conn.rollback(); } catch (_) { /* conservar error original */ }
    if (error.code === 'ER_DUP_ENTRY') {
      throw err('Clave NetSuite duplicada o publicacion concurrente. La operacion se revirtio.', 409, 'ALMACEN_NS_DUPLICATE_DB');
    }
    if (error.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || error.code === 'ER_DATA_TOO_LONG' || error.code === 'ER_WARN_DATA_OUT_OF_RANGE') {
      throw err('Un registro incumple los limites de la tabla NetSuite.', 422, 'ALMACEN_NS_SCHEMA_REJECTED');
    }
    if (error.code === 'ER_LOCK_DEADLOCK' || error.code === 'ER_LOCK_WAIT_TIMEOUT') {
      throw err('La base de datos estaba ocupada. Reintenta el mismo lote/pagina.', 409, 'ALMACEN_NS_LOCK_RETRY');
    }
    throw error;
  } finally {
    if (hasLock) try { await conn.query('SELECT RELEASE_LOCK(?)', [PUBLISH_LOCK]); } catch (_) { /* conexion se libera */ }
    conn.release();
  }
}
async function lockedLot(conn, id) {
  const [rows] = await conn.query('SELECT * FROM almacen_ns_lotes WHERE id_lote=? FOR UPDATE', [id]);
  if (!rows.length) throw err('El lote no existe.', 404, 'ALMACEN_NS_LOT_NOT_FOUND');
  return rows[0];
}
function assertLotType(lot, type) {
  if (lot.tipo_fuente !== type) throw err('El lote pertenece a otra fuente.', 409, 'ALMACEN_NS_LOT_TYPE_MISMATCH');
}
function assertReceiving(lot) {
  if (lot.estado !== 'RECIBIENDO') throw err('El lote ya no acepta paginas.', 409, 'ALMACEN_NS_LOT_NOT_RECEIVING');
}
function parseBegin(type, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw err('Cuerpo de inicio invalido.', 422);
  const loteId = uuid(body.loteId);
  const modoCarga = String(body.modoCarga || '').trim().toUpperCase();
  if (!['COMPLETA','INCREMENTAL'].includes(modoCarga) ||
      (type !== 'MOVIMIENTOS_433' && modoCarga !== 'COMPLETA')) {
    throw err('Modo de carga no permitido para esta fuente.', 422);
  }
  const esperadas = countValue(body.filasEsperadas, 'filasEsperadas', type === 'MOVIMIENTOS_433' ? 0 : 1, MAX_PAGE_SIZE * MAX_PAGES);
  const pageSize = countValue(body.tamanoPagina, 'tamanoPagina', 1, MAX_PAGE_SIZE);
  const paginasEsperadas = Math.ceil(esperadas / pageSize);
  if (paginasEsperadas > MAX_PAGES) throw err('El informe excede el maximo de paginas; divide la carga.', 422);
  const fechaCorte = dateOnly(body.fechaCorte, 'fechaCorte', true);
  const fechaDesde = dateOnly(body.fechaDesde, 'fechaDesde');
  const fechaHasta = dateOnly(body.fechaHasta, 'fechaHasta');
  if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) throw err('fechaDesde es posterior a fechaHasta.', 422);
  const referencia = safeString(body.referenciaEjecucion, 'referenciaEjecucion', true, 160);
  const hashCarga = body.hashCarga == null || body.hashCarga === '' ? null : String(body.hashCarga).toLowerCase();
  if (hashCarga && !HASH.test(hashCarga)) throw err('hashCarga debe ser SHA-256 hexadecimal.', 422);
  return {loteId,modoCarga,esperadas,pageSize,paginasEsperadas,fechaCorte,fechaDesde,fechaHasta,referencia,hashCarga};
}
async function beginLot(type, body) {
  const input = parseBegin(type, body);
  return connectionWork(async conn => {
    const [existing] = await conn.query('SELECT * FROM almacen_ns_lotes WHERE id_lote=? FOR UPDATE', [input.loteId]);
    if (existing.length) {
      const saved = existing[0];
      const meta = parseMeta(saved.metadata_json);
      const same = saved.tipo_fuente === type && saved.modo_carga === input.modoCarga &&
        Number(saved.filas_esperadas) === input.esperadas && Number(saved.paginas_esperadas) === input.paginasEsperadas &&
        Number(meta.pageSize) === input.pageSize && sqlDate(saved.fecha_corte) === input.fechaCorte &&
        sqlDate(saved.fecha_desde) === input.fechaDesde && sqlDate(saved.fecha_hasta) === input.fechaHasta &&
        (saved.hash_carga || null) === input.hashCarga && (saved.referencia_ejecucion || null) === input.referencia;
      if (!same) throw err('El UUID ya existe con otra definicion de carga.', 409, 'ALMACEN_NS_LOT_CONFLICT');
      return {...rowState(saved), idempotente:true};
    }
    const meta = {version:1,pageSize:input.pageSize,pages:{}};
    await conn.query(`INSERT INTO almacen_ns_lotes
      (id_lote,tipo_fuente,modo_carga,estado,activo,es_completo,fecha_corte,fecha_desde,fecha_hasta,
       filas_esperadas,filas_recibidas,filas_validas,paginas_esperadas,paginas_recibidas,
       hash_carga,referencia_ejecucion,metadata_json)
       VALUES (?,?,?,'RECIBIENDO',0,0,?,?,?,?,0,0,?,0,?,?,?)`,
      [input.loteId,type,input.modoCarga,input.fechaCorte,input.fechaDesde,input.fechaHasta,
        input.esperadas,input.paginasEsperadas,input.hashCarga,input.referencia,JSON.stringify(meta)]);
    return {ok:true,loteId:input.loteId,tipoFuente:type,modoCarga:input.modoCarga,
      estado:'RECIBIENDO',esperadas:input.esperadas,recibidas:0,paginasEsperadas:input.paginasEsperadas,
      paginasRecibidas:0,hashCarga:input.hashCarga,paginas:[],idempotente:false};
  });
}
function makeInsert(type, lotId, rows) {
  const schema = COLS[type];
  const baseCols = schema.map(item => item[0]);
  const extraColumns = type === 'MOVIMIENTOS_433'
    ? ['primer_lote_id','ultimo_lote_id','hash_fila','raw_json']
    : ['id_lote','hash_fila','raw_json'];
  const cols = [...baseCols,...extraColumns];
  const recordParams = rows.map(row => {
    const values = schema.map(item => row[item[1]]);
    const json = JSON.stringify(row);
    const hash = sha256(json);
    return [...values,...(type === 'MOVIMIENTOS_433' ? [lotId,lotId,hash,json] : [lotId,hash,json])];
  });
  const placeholders = `(${cols.map(() => '?').join(',')})`;
  let sql = `INSERT INTO ${TABLE_BY_TYPE[type]} (${cols.map(c => '`'+c+'`').join(',')}) VALUES ${rows.map(() => placeholders).join(',')}`;
  if (type === 'MOVIMIENTOS_433') {
    // El primer lote no cambia. La misma transaccion/linea se corrige solo
    // mediante otra carga validada (no se asume ANULADO por ausencia de fila).
    const updates = [...baseCols.filter(col => !['id_transaccion_ns','id_linea_ns'].includes(col)),
      'ultimo_lote_id','hash_fila','raw_json'];
    sql += ' ON DUPLICATE KEY UPDATE ' + updates.map(col => `\`${col}\`=VALUES(\`${col}\`)`).join(',');
  }
  return {sql,params:recordParams.flat()};
}
async function assertNoMovementPageDuplicates(conn, lotId, rows) {
  if (!rows.length) return;
  const pairs = rows.map(() => '(?,?)').join(',');
  const params = rows.flatMap(row => [row.idTransaccionNs,row.idLineaNs]);
  const [found] = await conn.query(`SELECT m.id_transaccion_ns AS tx,m.id_linea_ns AS linea,
      m.ultimo_lote_id AS ultimo, l.estado AS estadoUltimo
      FROM almacen_ns_movimientos m LEFT JOIN almacen_ns_lotes l ON l.id_lote=m.ultimo_lote_id
     WHERE (m.id_transaccion_ns,m.id_linea_ns) IN (${pairs}) FOR UPDATE`, params);
  for (const current of found) {
    if (String(current.ultimo) === lotId) {
      throw err('La transaccion y linea ya fueron recibidas en otra pagina de este lote.', 409, 'ALMACEN_NS_MOVEMENT_DUPLICATE');
    }
    if (current.estadoUltimo === 'RECIBIENDO' || current.estadoUltimo === 'VALIDADO') {
      throw err('Un movimiento esta bloqueado por otro lote aun sin publicar.', 409, 'ALMACEN_NS_MOVEMENT_BUSY');
    }
  }
}
async function uploadPage(type, lotIdInput, body) {
  const lotId = uuid(lotIdInput);
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.filas)) {
    throw err('La pagina debe enviar el arreglo filas.', 422);
  }
  const pagina = countValue(body.pagina, 'pagina', 1, MAX_PAGES);
  if (body.filas.length > MAX_PAGE_SIZE) throw err('La pagina excede el maximo de 300 filas.', 422);
  const rawDigest = sha256(JSON.stringify(body.filas));
  return connectionWork(async conn => {
    const lot = await lockedLot(conn, lotId);
    assertLotType(lot, type);
    const meta = parseMeta(lot.metadata_json);
    if (meta.pages[String(pagina)]) {
      const receipt = meta.pages[String(pagina)];
      if (receipt.hash !== rawDigest || Number(receipt.rows) !== body.filas.length) {
        throw err('La pagina ya fue registrada con contenido distinto.', 409, 'ALMACEN_NS_PAGE_CHANGED');
      }
      return {...rowState(lot),idempotente:true,pagina};
    }
    assertReceiving(lot);
    if (pagina > Number(lot.paginas_esperadas)) throw err('Pagina fuera del rango del lote.', 422);
    const pageSize = Number(meta.pageSize);
    const expected = Math.min(pageSize, Number(lot.filas_esperadas) - (pagina - 1)*pageSize);
    if (body.filas.length !== expected) throw err(`Pagina ${pagina}: se esperaban ${expected} filas y llegaron ${body.filas.length}.`, 422);

    const rows = body.filas.map((row,index) => normalizeRow(type,row,(pagina-1)*pageSize+index+1));
    if (type === 'MOVIMIENTOS_433') {
      const from = sqlDate(lot.fecha_desde);
      const to = sqlDate(lot.fecha_hasta);
      for (const row of rows) {
        if ((from && row.fechaTransaccion < from) || (to && row.fechaTransaccion > to)) {
          throw err('La fecha de un movimiento cae fuera del intervalo declarado.', 422, 'ALMACEN_NS_MOVEMENT_OUTSIDE_RANGE');
        }
      }
    }
    const keys = new Set();
    for (const row of rows) {
      const key = rowKey(type,row);
      if (keys.has(key)) throw err('La pagina repite una clave estructurada NetSuite.', 409, 'ALMACEN_NS_DUPLICATE_KEY');
      keys.add(key);
    }
    if (type === 'MOVIMIENTOS_433') await assertNoMovementPageDuplicates(conn,lotId,rows);
    if (rows.length) {
      const insert = makeInsert(type,lotId,rows);
      await conn.query(insert.sql,insert.params);
    }
    meta.pages[String(pagina)] = {hash:rawDigest,rows:rows.length};
    await conn.query(`UPDATE almacen_ns_lotes SET metadata_json=?,
      paginas_recibidas=paginas_recibidas+1,
      filas_recibidas=filas_recibidas+?,filas_validas=filas_validas+?
      WHERE id_lote=?`,[JSON.stringify(meta),rows.length,rows.length,lotId]);
    return {ok:true,loteId:lotId,tipoFuente:type,estado:'RECIBIENDO',pagina,
      paginasRecibidas:Number(lot.paginas_recibidas)+1,
      paginasEsperadas:Number(lot.paginas_esperadas),recibidas:Number(lot.filas_recibidas)+rows.length,
      esperadas:Number(lot.filas_esperadas),idempotente:false};
  });
}
async function statusLot(type,lotIdInput) {
  const lotId=uuid(lotIdInput);
  const [rows] = await db.query('SELECT * FROM almacen_ns_lotes WHERE id_lote=?',[lotId]);
  if (!rows.length) throw err('El lote no existe.', 404, 'ALMACEN_NS_LOT_NOT_FOUND');
  assertLotType(rows[0],type);
  return rowState(rows[0]);
}
function finalDigest(meta,expectedPages) {
  const parts=[];
  for(let p=1;p<=expectedPages;p+=1) {
    const receipt=meta.pages[String(p)];
    if (!receipt || !HASH.test(receipt.hash)) throw err(`Falta recibir la pagina ${p}.`,409,'ALMACEN_NS_PAGE_MISSING');
    parts.push(receipt.hash);
  }
  return sha256(parts.join('\n'));
}
async function finishLot(type,lotIdInput) {
  const lotId=uuid(lotIdInput);
  return connectionWork(async conn => {
    const lot=await lockedLot(conn,lotId);
    assertLotType(lot,type);
    if (lot.estado==='PUBLICADO') return {...rowState(lot),idempotente:true};
    assertReceiving(lot);
    const expectedRows=Number(lot.filas_esperadas),expectedPages=Number(lot.paginas_esperadas);
    if (Number(lot.filas_recibidas)!==expectedRows || Number(lot.filas_validas)!==expectedRows || Number(lot.paginas_recibidas)!==expectedPages) {
      throw err('El lote esta incompleto. No se publica.',409,'ALMACEN_NS_LOT_INCOMPLETE');
    }
    const meta=parseMeta(lot.metadata_json);
    if (Object.keys(meta.pages).length!==expectedPages) throw err('El numero de paginas no coincide con el manifiesto.',409,'ALMACEN_NS_PAGE_COUNT');
    const actualHash=finalDigest(meta,expectedPages);
    if (lot.hash_carga && lot.hash_carga.toLowerCase()!==actualHash) {
      throw err('El SHA-256 del lote no corresponde al contenido recibido.',409,'ALMACEN_NS_MANIFEST_MISMATCH');
    }
    let actualRows;
    if (type==='MOVIMIENTOS_433') {
      const [counts] = await conn.query('SELECT COUNT(*) AS total FROM almacen_ns_movimientos WHERE ultimo_lote_id=?',[lotId]);
      actualRows=Number(counts[0]?.total||0);
    } else {
      const [counts] = await conn.query(`SELECT COUNT(*) AS total FROM ${TABLE_BY_TYPE[type]} WHERE id_lote=?`,[lotId]);
      actualRows=Number(counts[0]?.total||0);
    }
    if (actualRows!==expectedRows) {
      throw err('Los registros persistidos no coinciden con el manifiesto.',409,'ALMACEN_NS_DB_COUNT_MISMATCH',
        {esperados:expectedRows,persistidos:actualRows});
    }
    if (type==='INVENTARIO_230') {
      const [active] = await conn.query(`SELECT id_lote,DATE_FORMAT(fecha_corte,'%Y-%m-%d') AS fechaCorte
        FROM almacen_ns_lotes WHERE tipo_fuente='INVENTARIO_230' AND activo=1 FOR UPDATE`);
      if (active.length && active[0].fechaCorte>sqlDate(lot.fecha_corte)) {
        throw err('Existe un corte de inventario mas reciente. No se sustituye.',409,'ALMACEN_NS_STALE_SNAPSHOT');
      }
      await conn.query(`UPDATE almacen_ns_lotes SET activo=0
        WHERE tipo_fuente='INVENTARIO_230' AND activo=1 AND id_lote<>?`,[lotId]);
    }
    const published=type==='INVENTARIO_230'?1:0;
    await conn.query(`UPDATE almacen_ns_lotes
      SET hash_carga=?,estado='PUBLICADO',es_completo=1,activo=?,
          validado_en=CURRENT_TIMESTAMP(3),publicado_en=CURRENT_TIMESTAMP(3),error_detalle=NULL
      WHERE id_lote=?`,[actualHash,published,lotId]);
    return {ok:true,loteId:lotId,tipoFuente:type,estado:'PUBLICADO',activo:Boolean(published),
      completo:true,recibidas:expectedRows,esperadas:expectedRows,
      paginasRecibidas:expectedPages,paginasEsperadas:expectedPages,hashCarga:actualHash,idempotente:false};
  },{advisory:type==='INVENTARIO_230'});
}
async function rejectLot(type,lotIdInput,body={}) {
  const lotId=uuid(lotIdInput);
  const reason=safeString(body.motivo,'motivo',false,3000);
  return connectionWork(async conn => {
    const lot=await lockedLot(conn,lotId);
    assertLotType(lot,type);
    if (lot.estado==='PUBLICADO') throw err('No es posible rechazar un lote ya publicado.',409,'ALMACEN_NS_PUBLISHED_IMMUTABLE');
    if (lot.estado==='RECHAZADO') return {...rowState(lot),idempotente:true};
    await conn.query(`UPDATE almacen_ns_lotes SET estado='RECHAZADO',activo=0,error_detalle=? WHERE id_lote=?`,[reason,lotId]);
    return {ok:true,loteId:lotId,estado:'RECHAZADO',idempotente:false};
  });
}

module.exports={
  TYPE_BY_ROUTE,MAX_PAGE_SIZE,COLS,toType,parseBegin,normalizeRow,sha256,finalDigest,
  beginLot,uploadPage,statusLot,finishLot,rejectLot
};
