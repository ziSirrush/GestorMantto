'use strict';

const crypto = require('crypto');
const db = require('../../config/db');
const { parseXlsxSheets, parseCsv } = require('./xlsx-lite');

const TABLE = 'almacen_fuente_excel';
const MAX_ROWS = 100000;
const RECORD_TYPES = Object.freeze({
  INVENTORY: 'INVENTARIO',
  LOAN: 'PRESTAMO',
  GUARD: 'RESGUARDO'
});

const INVENTORY_ALIASES = Object.freeze({
  codigo: [
    'codigo', 'codigo articulo', 'codigo de articulo', 'codigo item', 'sku', 'item id',
    'id articulo', 'numero articulo', 'numero de articulo', 'no articulo', 'no de articulo'
  ],
  articulo: [
    'articulo', 'nombre articulo', 'nombre de articulo', 'descripcion', 'descripcion articulo',
    'descripcion de articulo', 'item description', 'display name', 'nombre'
  ],
  categoria: ['categoria', 'categoria articulo', 'tipo articulo', 'tipo de articulo', 'familia', 'clase'],
  empresa: ['empresa', 'subsidiaria', 'company', 'compania'],
  almacen: ['almacen', 'bodega', 'ubicacion', 'location', 'warehouse'],
  tipo_almacen: ['tipo almacen', 'tipo de almacen', 'clasificacion almacen', 'clasificacion de almacen'],
  fisico: [
    'fisico', 'existencia', 'existencia fisica', 'cantidad fisica', 'stock', 'cantidad',
    'on hand', 'quantity on hand', 'existencia actual'
  ],
  precio_unitario: [
    'precio unitario', 'p unit', 'p. unit', 'costo unitario', 'valor unitario',
    'unit cost', 'average cost', 'costo promedio', 'precio promedio'
  ],
  valor: [
    'valor', 'valor inventario', 'valor de inventario', 'valor total', 'importe',
    'total value', 'inventory value'
  ],
  fecha_corte: ['fecha corte', 'fecha de corte', 'corte', 'fecha inventario'],
  abc: ['abc', 'clase abc', 'clasificacion abc'],
  criticidad: ['criticidad', 'nivel criticidad', 'nivel de criticidad', 'critico'],
  demanda: ['demanda', 'demanda promedio', 'consumo promedio', 'demanda mensual', 'consumo mensual'],
  stock_seguridad: ['stock seguridad', 'stock de seguridad', 'safety stock', 'ss'],
  punto_reorden: ['punto reorden', 'punto de reorden', 'reorder point', 'rop'],
  minimo: ['minimo', 'stock minimo', 'min'],
  maximo: ['maximo', 'stock maximo', 'max']
});

const LOAN_ALIASES = Object.freeze({
  fecha: ['fecha', 'fecha prestamo', 'fecha de prestamo', 'fecha salida', 'fecha de salida'],
  articulo: ['articulo', 'descripcion', 'descripcion articulo', 'material', 'item'],
  codigo: ['codigo', 'sku', 'codigo articulo', 'item id'],
  empresa: ['empresa', 'subsidiaria', 'company', 'compania'],
  ag: ['ag', 'a g', 'activo general', 'activo', 'asset'],
  responsable: ['responsable', 'a cargo de', 'acargo de', 'custodio', 'responsable prestamo', 'nombre responsable'],
  sitio: ['sitio', 'obra', 'proyecto sitio', 'lugar', 'ubicacion sitio'],
  cantidad: ['cantidad', 'cant', 'piezas', 'pz', 'unidades'],
  costo: ['costo', 'costo unitario', 'precio unitario', 'valor unitario', 'importe unitario'],
  valor: ['valor', 'valor total', 'importe', 'monto']
});

const GUARD_ALIASES = Object.freeze({
  fecha: ['fecha', 'fecha resguardo', 'fecha de resguardo'],
  folio: ['folio', 'folio resguardo', 'numero folio', 'no folio'],
  empresa: ['subsidiaria', 'empresa', 'company', 'compania'],
  departamento: ['departamento', 'depto', 'area', 'departamento responsable'],
  ag: ['ag', 'a g', 'activo general', 'activo'],
  cantidad: ['cantidad', 'cant', 'piezas', 'pz', 'unidades'],
  unidad: ['unidad', 'unidad medida', 'unidad de medida', 'uom'],
  descripcion: ['descripcion', 'articulo', 'material', 'descripcion articulo'],
  proyecto: ['proyecto', 'project'],
  equipo: ['equipo', 'numero equipo', 'no equipo'],
  entregado_por: ['entregado por', 'entrega por', 'responsable entrega'],
  salida: ['salida', 'fecha salida', 'fecha de salida', 'salida registrada'],
  responsable: ['a cargo de', 'acargo de', 'responsable', 'custodio'],
  ubicacion: ['ubicacion', 'location', 'sitio'],
  con_stock: ['con stock', 'stock', 'tiene stock', 'en stock']
});

function normalizeHeader(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_\-\/\.]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedAliases(source) {
  return Object.fromEntries(Object.entries(source).map(([key, values]) => [key, new Set(values.map(normalizeHeader))]));
}

const INVENTORY_ALIAS_SETS = Object.freeze(normalizedAliases(INVENTORY_ALIASES));
const LOAN_ALIAS_SETS = Object.freeze(normalizedAliases(LOAN_ALIASES));
const GUARD_ALIAS_SETS = Object.freeze(normalizedAliases(GUARD_ALIASES));

function cellText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let text = String(value).trim();
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) { negative = true; text = text.slice(1, -1); }
  text = text.replace(/[$€£¥\s]/g, '').replace(/[^0-9,.-]/g, '');
  if (!text) return null;
  const comma = text.lastIndexOf(',');
  const dot = text.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    if (comma > dot) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
  } else if (comma >= 0) {
    const decimals = text.length - comma - 1;
    text = decimals > 0 && decimals <= 4 ? text.replace(',', '.') : text.replace(/,/g, '');
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

function canonicalCompany(value) {
  const text = cellText(value);
  const normalized = normalizeHeader(text);
  if (normalized.includes('corellian')) return 'Corellian';
  if (normalized.includes('nubian')) return 'Nubian';
  if (normalized.includes('united')) return 'United';
  return text;
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const rawNumber = Number(value);
  if (Number.isFinite(rawNumber) && rawNumber > 20000 && rawNumber < 100000) {
    const epoch = Date.UTC(1899, 11, 30);
    const date = new Date(epoch + Math.floor(rawNumber) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const text = cellText(value);
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const mx = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (mx) return `${mx[3]}-${String(mx[2]).padStart(2, '0')}-${String(mx[1]).padStart(2, '0')}`;
  return null;
}

function rowObject(headers, row) {
  const output = {};
  headers.forEach((header, index) => {
    if (!header) return;
    output[header] = row[index] == null ? '' : row[index];
  });
  return output;
}

function buildMapping(headers, aliasSets) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const mapping = {};
  for (const [field, aliases] of Object.entries(aliasSets)) {
    const index = normalizedHeaders.findIndex(value => aliases.has(value));
    if (index >= 0) mapping[field] = { index, header: headers[index] };
  }
  return mapping;
}

function scoreHeaderRow(row, aliasSets) {
  const mapping = buildMapping(row.map((value, index) => cellText(value) || `Columna ${index + 1}`), aliasSets);
  return Object.keys(mapping).length;
}

function findHeaderRow(rows, aliasSets) {
  let best = { index: -1, score: -1 };
  const limit = Math.min(rows.length, 20);
  for (let index = 0; index < limit; index += 1) {
    const row = Array.isArray(rows[index]) ? rows[index] : [];
    if (row.filter(value => cellText(value)).length < 2) continue;
    const score = scoreHeaderRow(row, aliasSets);
    if (score > best.score) best = { index, score };
  }
  return best.index >= 0 ? best : null;
}

function mappedValue(row, mapping, field) {
  const item = mapping[field];
  return item ? row[item.index] : null;
}

function parseSpreadsheet(file) {
  const name = String(file?.originalname || '').trim();
  const lower = name.toLowerCase();
  if (!file?.buffer || !file.buffer.length) throw Object.assign(new Error('El archivo está vacío.'), { status: 400 });
  if (lower.endsWith('.xlsx')) return { sheets: parseXlsxSheets(file.buffer) };
  if (lower.endsWith('.csv')) return { sheets: [parseCsv(file.buffer)] };
  throw Object.assign(new Error('Formato no soportado. Usa .xlsx o .csv.'), { status: 415 });
}

function sheetCandidate(sheet, aliasSets) {
  if (!Array.isArray(sheet?.rows) || !sheet.rows.length) return null;
  const headerCandidate = findHeaderRow(sheet.rows, aliasSets);
  if (!headerCandidate) return null;
  const headerRow = sheet.rows[headerCandidate.index] || [];
  const headers = headerRow.map((value, index) => cellText(value) || `Columna ${index + 1}`);
  const mapping = buildMapping(headers, aliasSets);
  const dataRows = sheet.rows
    .map((row, index) => ({ row, index }))
    .slice(headerCandidate.index + 1)
    .filter(item => Array.isArray(item.row) && item.row.some(value => cellText(value)));
  return { sheet, headerCandidate, headers, mapping, dataRows, score: Object.keys(mapping).length };
}

function inventoryMappingValid(mapping) {
  return Boolean(mapping.empresa && mapping.almacen && mapping.fisico && (mapping.articulo || mapping.codigo));
}

function loanMappingValid(mapping) {
  return Boolean(mapping.empresa && mapping.articulo && mapping.responsable && mapping.cantidad && mapping.fecha && (mapping.ag || mapping.sitio));
}

function guardMappingValid(mapping) {
  const unique = mapping.folio || mapping.departamento || mapping.entregado_por || mapping.responsable || mapping.proyecto || mapping.equipo;
  return Boolean(mapping.empresa && mapping.descripcion && mapping.cantidad && unique);
}

function chooseBestCandidate(sheets, aliasSets, validator, minimumScore) {
  let best = null;
  for (const sheet of sheets) {
    const candidate = sheetCandidate(sheet, aliasSets);
    if (!candidate || candidate.score < minimumScore || !validator(candidate.mapping)) continue;
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}

function validateRowLimit(count) {
  if (count > MAX_ROWS) throw Object.assign(new Error(`El archivo supera el máximo temporal de ${MAX_ROWS} filas por conjunto de datos.`), { status: 413 });
}

function inventoryRows(candidate, requestedCutoffDate) {
  validateRowLimit(candidate.dataRows.length);
  const mapping = candidate.mapping;
  const cutoffFromFile = mapping.fecha_corte && candidate.dataRows.length
    ? normalizeDate(mappedValue(candidate.dataRows[0].row, mapping, 'fecha_corte'))
    : null;
  const cutoffDate = normalizeDate(requestedCutoffDate) || cutoffFromFile || null;
  const quality = {
    filasSinEmpresa: 0,
    filasSinAlmacen: 0,
    filasSinIdentificador: 0,
    fisicoNoNumerico: 0,
    precioNoNumerico: 0,
    valorNoNumerico: 0
  };
  const rows = candidate.dataRows.map(item => {
    const row = item.row;
    const fisicoRaw = mappedValue(row, mapping, 'fisico');
    const priceRaw = mappedValue(row, mapping, 'precio_unitario');
    const valueRaw = mappedValue(row, mapping, 'valor');
    const fisico = parseNumber(fisicoRaw);
    const precioUnitario = parseNumber(priceRaw);
    const directValue = parseNumber(valueRaw);
    const codigo = cellText(mappedValue(row, mapping, 'codigo')) || null;
    const articulo = cellText(mappedValue(row, mapping, 'articulo')) || null;
    const empresa = canonicalCompany(mappedValue(row, mapping, 'empresa')) || null;
    const almacen = cellText(mappedValue(row, mapping, 'almacen')) || null;
    if (!empresa) quality.filasSinEmpresa += 1;
    if (!almacen) quality.filasSinAlmacen += 1;
    if (!codigo && !articulo) quality.filasSinIdentificador += 1;
    if (cellText(fisicoRaw) && fisico == null) quality.fisicoNoNumerico += 1;
    if (mapping.precio_unitario && cellText(priceRaw) && precioUnitario == null) quality.precioNoNumerico += 1;
    if (mapping.valor && cellText(valueRaw) && directValue == null) quality.valorNoNumerico += 1;
    return {
      tipoRegistro: RECORD_TYPES.INVENTORY,
      filaOrigen: item.index + 1,
      codigo,
      articulo,
      categoria: cellText(mappedValue(row, mapping, 'categoria')) || null,
      empresa,
      almacen,
      tipoAlmacen: cellText(mappedValue(row, mapping, 'tipo_almacen')) || null,
      fisico,
      precioUnitario,
      valor: directValue != null ? directValue : (fisico != null && precioUnitario != null ? fisico * precioUnitario : null),
      abc: cellText(mappedValue(row, mapping, 'abc')).toUpperCase() || null,
      criticidad: cellText(mappedValue(row, mapping, 'criticidad')) || null,
      demanda: parseNumber(mappedValue(row, mapping, 'demanda')),
      stockSeguridad: parseNumber(mappedValue(row, mapping, 'stock_seguridad')),
      puntoReorden: parseNumber(mappedValue(row, mapping, 'punto_reorden')),
      minimo: parseNumber(mappedValue(row, mapping, 'minimo')),
      maximo: parseNumber(mappedValue(row, mapping, 'maximo')),
      fechaEvento: null,
      ag: null,
      responsable: null,
      sitio: null,
      cantidad: null,
      costoUnitario: null,
      folio: null,
      departamento: null,
      unidad: null,
      proyecto: null,
      equipo: null,
      entregadoPor: null,
      salida: null,
      ubicacion: null,
      conStock: null,
      raw: rowObject(candidate.headers, row)
    };
  }).filter(row => row.codigo || row.articulo || row.almacen || row.empresa || row.fisico != null);

  if (!rows.length) throw Object.assign(new Error('La hoja de inventario no contiene registros importables.'), { status: 422 });
  const blocking = quality.filasSinEmpresa + quality.filasSinAlmacen + quality.filasSinIdentificador + quality.fisicoNoNumerico;
  if (blocking > 0) {
    const error = new Error('La importación se detuvo porque el inventario contiene filas incompletas o existencias físicas no numéricas.');
    error.status = 422;
    error.details = { headers:candidate.headers, mapping, quality, headerRow:candidate.headerCandidate.index + 1, sheetName:candidate.sheet.sheetName };
    throw error;
  }
  const warnings = [];
  if (quality.precioNoNumerico) warnings.push(`${quality.precioNoNumerico} precio(s) unitario(s) no numéricos quedarán como NULL.`);
  if (quality.valorNoNumerico) warnings.push(`${quality.valorNoNumerico} valor(es) de inventario no numéricos quedarán como NULL.`);
  return { rows, quality, warnings, cutoffDate };
}

function loanRows(candidate) {
  validateRowLimit(candidate.dataRows.length);
  const mapping = candidate.mapping;
  const quality = { filasSinEmpresa:0, filasSinArticulo:0, filasSinResponsable:0, filasSinFecha:0, cantidadNoNumerica:0, costoNoNumerico:0 };
  const rows = candidate.dataRows.map(item => {
    const row = item.row;
    const cantidadRaw = mappedValue(row, mapping, 'cantidad');
    const costoRaw = mappedValue(row, mapping, 'costo');
    const cantidad = parseNumber(cantidadRaw);
    const costoUnitario = parseNumber(costoRaw);
    const directValue = parseNumber(mappedValue(row, mapping, 'valor'));
    const empresa = canonicalCompany(mappedValue(row, mapping, 'empresa')) || null;
    const articulo = cellText(mappedValue(row, mapping, 'articulo')) || null;
    const responsable = cellText(mappedValue(row, mapping, 'responsable')) || null;
    const fechaEvento = normalizeDate(mappedValue(row, mapping, 'fecha'));
    if (!empresa) quality.filasSinEmpresa += 1;
    if (!articulo) quality.filasSinArticulo += 1;
    if (!responsable) quality.filasSinResponsable += 1;
    if (!fechaEvento) quality.filasSinFecha += 1;
    if (cellText(cantidadRaw) && cantidad == null) quality.cantidadNoNumerica += 1;
    if (mapping.costo && cellText(costoRaw) && costoUnitario == null) quality.costoNoNumerico += 1;
    return {
      tipoRegistro: RECORD_TYPES.LOAN,
      filaOrigen:item.index + 1,
      codigo:cellText(mappedValue(row,mapping,'codigo')) || null,
      articulo,
      categoria:null,
      empresa,
      almacen:null,
      tipoAlmacen:null,
      fisico:null,
      precioUnitario:null,
      valor:directValue != null ? directValue : (cantidad != null && costoUnitario != null ? cantidad * costoUnitario : null),
      abc:null, criticidad:null, demanda:null, stockSeguridad:null, puntoReorden:null, minimo:null, maximo:null,
      fechaEvento,
      ag:cellText(mappedValue(row,mapping,'ag')) || null,
      responsable,
      sitio:cellText(mappedValue(row,mapping,'sitio')) || null,
      cantidad,
      costoUnitario,
      folio:null, departamento:null, unidad:null, proyecto:null, equipo:null, entregadoPor:null, salida:null, ubicacion:null, conStock:null,
      raw:rowObject(candidate.headers,row)
    };
  }).filter(row => row.empresa || row.articulo || row.responsable || row.cantidad != null || row.fechaEvento);

  const blocking = quality.filasSinEmpresa + quality.filasSinArticulo + quality.filasSinResponsable + quality.filasSinFecha + quality.cantidadNoNumerica;
  if (rows.length && blocking > 0) {
    const error = new Error('La hoja de Préstamos fue detectada, pero contiene filas incompletas o cantidades no numéricas.');
    error.status = 422;
    error.details = { dataset:'PRESTAMO', headers:candidate.headers, mapping, quality, sheetName:candidate.sheet.sheetName };
    throw error;
  }
  const warnings = [];
  if (quality.costoNoNumerico) warnings.push(`${quality.costoNoNumerico} costo(s) de préstamo no numéricos quedarán como NULL.`);
  return { rows, quality, warnings };
}

function guardRows(candidate) {
  validateRowLimit(candidate.dataRows.length);
  const mapping = candidate.mapping;
  const quality = { filasSinEmpresa:0, filasSinDescripcion:0, cantidadNoNumerica:0 };
  const rows = candidate.dataRows.map(item => {
    const row = item.row;
    const cantidadRaw = mappedValue(row,mapping,'cantidad');
    const cantidad = parseNumber(cantidadRaw);
    const empresa = canonicalCompany(mappedValue(row,mapping,'empresa')) || null;
    const articulo = cellText(mappedValue(row,mapping,'descripcion')) || null;
    if(!empresa) quality.filasSinEmpresa += 1;
    if(!articulo) quality.filasSinDescripcion += 1;
    if(cellText(cantidadRaw) && cantidad == null) quality.cantidadNoNumerica += 1;
    return {
      tipoRegistro: RECORD_TYPES.GUARD,
      filaOrigen:item.index + 1,
      codigo:null,
      articulo,
      categoria:null,
      empresa,
      almacen:null,
      tipoAlmacen:null,
      fisico:null,
      precioUnitario:null,
      valor:null,
      abc:null, criticidad:null, demanda:null, stockSeguridad:null, puntoReorden:null, minimo:null, maximo:null,
      fechaEvento:normalizeDate(mappedValue(row,mapping,'fecha')),
      ag:cellText(mappedValue(row,mapping,'ag')) || null,
      responsable:cellText(mappedValue(row,mapping,'responsable')) || null,
      sitio:null,
      cantidad,
      costoUnitario:null,
      folio:cellText(mappedValue(row,mapping,'folio')) || null,
      departamento:cellText(mappedValue(row,mapping,'departamento')) || null,
      unidad:cellText(mappedValue(row,mapping,'unidad')) || null,
      proyecto:cellText(mappedValue(row,mapping,'proyecto')) || null,
      equipo:cellText(mappedValue(row,mapping,'equipo')) || null,
      entregadoPor:cellText(mappedValue(row,mapping,'entregado_por')) || null,
      salida:cellText(mappedValue(row,mapping,'salida')) || null,
      ubicacion:cellText(mappedValue(row,mapping,'ubicacion')) || null,
      conStock:cellText(mappedValue(row,mapping,'con_stock')) || null,
      raw:rowObject(candidate.headers,row)
    };
  }).filter(row => row.empresa || row.articulo || row.cantidad != null || row.folio || row.ag);
  const blocking = quality.filasSinEmpresa + quality.filasSinDescripcion + quality.cantidadNoNumerica;
  if(rows.length && blocking > 0){
    const error = new Error('La hoja de Resguardos fue detectada, pero contiene filas incompletas o cantidades no numéricas.');
    error.status = 422;
    error.details = { dataset:'RESGUARDO', headers:candidate.headers, mapping, quality, sheetName:candidate.sheet.sheetName };
    throw error;
  }
  return { rows, quality, warnings:[] };
}

function datasetMeta(type, candidate, result) {
  if (!candidate || !result) return null;
  return {
    type,
    sheetName:candidate.sheet.sheetName || 'Hoja1',
    headerRow:candidate.headerCandidate.index + 1,
    headers:candidate.headers,
    mapping:candidate.mapping,
    rows:result.rows,
    rowCount:result.rows.length,
    quality:result.quality,
    warnings:result.warnings || []
  };
}

function analyzeSpreadsheet(file, requestedCutoffDate) {
  const parsed = parseSpreadsheet(file);
  const sheets = Array.isArray(parsed.sheets) ? parsed.sheets : [];
  if (!sheets.length) throw Object.assign(new Error('El archivo no contiene hojas utilizables.'), { status:422 });

  const inventoryCandidate = chooseBestCandidate(sheets, INVENTORY_ALIAS_SETS, inventoryMappingValid, 4);
  if (!inventoryCandidate) {
    const error = new Error('No puedo confirmar una hoja de Inventario. Se requieren Empresa, Almacén, Físico y Artículo o Código.');
    error.status = 422;
    error.details = { sheets:sheets.map(sheet => sheet.sheetName || 'Hoja') };
    throw error;
  }
  const inventoryResult = inventoryRows(inventoryCandidate, requestedCutoffDate);
  const loanCandidate = chooseBestCandidate(sheets, LOAN_ALIAS_SETS, loanMappingValid, 5);
  const guardCandidate = chooseBestCandidate(sheets, GUARD_ALIAS_SETS, guardMappingValid, 5);
  const loanResult = loanCandidate ? loanRows(loanCandidate) : null;
  const guardResult = guardCandidate ? guardRows(guardCandidate) : null;

  const datasets = [
    datasetMeta(RECORD_TYPES.INVENTORY, inventoryCandidate, inventoryResult),
    datasetMeta(RECORD_TYPES.LOAN, loanCandidate, loanResult),
    datasetMeta(RECORD_TYPES.GUARD, guardCandidate, guardResult)
  ].filter(Boolean);
  const warnings = datasets.flatMap(dataset => dataset.warnings.map(warning => `${dataset.type}: ${warning}`));
  if (!loanCandidate) warnings.push('PRESTAMO: no se detectó un conjunto compatible; el módulo permanecerá sin datos.');
  if (!guardCandidate) warnings.push('RESGUARDO: no se detectó un conjunto compatible; el módulo permanecerá sin datos.');

  const inventoryMapping = inventoryCandidate.mapping;
  const coverage = {
    inventario:true,
    fisico:true,
    precioUnitario:Boolean(inventoryMapping.precio_unitario),
    valor:Boolean(inventoryMapping.valor || inventoryMapping.precio_unitario),
    categoria:Boolean(inventoryMapping.categoria),
    tipoAlmacen:Boolean(inventoryMapping.tipo_almacen),
    stock:{
      abc:Boolean(inventoryMapping.abc),
      criticidad:Boolean(inventoryMapping.criticidad),
      demanda:Boolean(inventoryMapping.demanda),
      stockSeguridad:Boolean(inventoryMapping.stock_seguridad),
      puntoReorden:Boolean(inventoryMapping.punto_reorden),
      minimo:Boolean(inventoryMapping.minimo),
      maximo:Boolean(inventoryMapping.maximo)
    },
    prestamos:Boolean(loanCandidate && loanResult && loanResult.rows.length),
    resguardos:Boolean(guardCandidate && guardResult && guardResult.rows.length)
  };
  return {
    datasets,
    fileHash:crypto.createHash('sha256').update(file.buffer).digest('hex'),
    cutoffDate:inventoryResult.cutoffDate,
    coverage,
    warnings,
    rowCount:datasets.reduce((sum,dataset)=>sum+dataset.rowCount,0),
    inventoryRows:inventoryResult.rows.length,
    loanRows:loanResult ? loanResult.rows.length : 0,
    guardRows:guardResult ? guardResult.rows.length : 0
  };
}

async function canImport(userId, conn = db) {
  const normalizedUserId = Number(userId);
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) return false;
  const [rows] = await conn.query(
    `SELECT EXISTS(
       SELECT 1
       FROM (
         SELECT r.codigo
           FROM usuario_roles ur
           INNER JOIN roles r ON r.id_rol = ur.id_rol AND r.estado = 1
          WHERE ur.id_usuario = ? AND ur.activo = 1
         UNION ALL
         SELECT r.codigo
           FROM usuarios u
           INNER JOIN roles r ON r.id_rol = u.rol_id AND r.estado = 1
          WHERE u.id_SB = ? AND u.estado = 1
       ) roles_usuario
       WHERE roles_usuario.codigo IN ('PROGRAMADOR','PROGRAMADOR_CORELLIAN')
     ) AS allowed`,
    [normalizedUserId, normalizedUserId]
  );
  return Number(rows?.[0]?.allowed || 0) === 1;
}

function safeJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_error) { return fallback; }
}

async function activeSource(conn = db) {
  const [lots] = await conn.query(
    `SELECT lote_importacion AS loteImportacion,
            MAX(archivo_origen) AS archivoOrigen,
            MAX(fecha_corte) AS fechaCorte,
            MAX(fecha_importacion) AS fechaImportacion,
            MAX(hash_archivo) AS hashArchivo,
            COUNT(*) AS filas
       FROM ${TABLE}
      WHERE activo=1
      GROUP BY lote_importacion
      ORDER BY MAX(fecha_importacion) DESC
      LIMIT 1`
  );
  if (!lots.length) return null;
  const lot = lots[0];
  const [types] = await conn.query(
    `SELECT tipo_registro AS tipoRegistro, MAX(hoja_origen) AS hojaOrigen, COUNT(*) AS filas,
            ANY_VALUE(encabezados_json) AS encabezadosJson, ANY_VALUE(mapeo_json) AS mapeoJson
       FROM ${TABLE}
      WHERE activo=1 AND lote_importacion=?
      GROUP BY tipo_registro`, [lot.loteImportacion]
  );
  const datasets = {};
  for (const row of types) {
    datasets[row.tipoRegistro] = {
      hojaOrigen:row.hojaOrigen,
      filas:Number(row.filas || 0),
      encabezados:safeJson(row.encabezadosJson,[]),
      mapeo:safeJson(row.mapeoJson,{})
    };
  }
  return {
    loteImportacion:lot.loteImportacion,
    archivoOrigen:lot.archivoOrigen,
    fechaCorte:lot.fechaCorte,
    fechaImportacion:lot.fechaImportacion,
    hashArchivo:lot.hashArchivo,
    filas:Number(lot.filas || 0),
    datasets,
    hojaOrigen:datasets[RECORD_TYPES.INVENTORY]?.hojaOrigen || null,
    encabezados:datasets[RECORD_TYPES.INVENTORY]?.encabezados || [],
    mapeo:datasets[RECORD_TYPES.INVENTORY]?.mapeo || {}
  };
}

async function validateImport(file, cutoffDate) {
  const analysis = analyzeSpreadsheet(file, cutoffDate);
  const inventoryDataset = analysis.datasets.find(dataset => dataset.type === RECORD_TYPES.INVENTORY);
  return {
    ok:true,
    valid:true,
    fileName:file.originalname,
    sheetName:inventoryDataset?.sheetName || null,
    headerRow:inventoryDataset?.headerRow || null,
    headers:inventoryDataset?.headers || [],
    mapping:inventoryDataset?.mapping || {},
    rows:analysis.rowCount,
    inventoryRows:analysis.inventoryRows,
    loanRows:analysis.loanRows,
    guardRows:analysis.guardRows,
    cutoffDate:analysis.cutoffDate,
    coverage:analysis.coverage,
    warnings:analysis.warnings,
    hash:analysis.fileHash,
    datasets:analysis.datasets.map(dataset => ({
      type:dataset.type,
      sheetName:dataset.sheetName,
      headerRow:dataset.headerRow,
      rows:dataset.rowCount,
      headers:dataset.headers,
      mapping:dataset.mapping,
      quality:dataset.quality
    }))
  };
}

function rowParams(lotId, fileName, fileHash, cutoffDate, userId, dataset, row) {
  const rawJson = JSON.stringify(row.raw);
  const rowHash = crypto.createHash('sha256').update(`${dataset.type}|${dataset.sheetName}|${rawJson}`).digest('hex');
  return [
    lotId, fileName, dataset.sheetName, row.filaOrigen, cutoffDate,
    fileHash, rowHash, JSON.stringify(dataset.headers), JSON.stringify(dataset.mapping), dataset.type,
    row.codigo, row.articulo, row.categoria, row.empresa, row.almacen, row.tipoAlmacen,
    row.fisico, row.precioUnitario, row.valor,
    row.abc, row.criticidad, row.demanda, row.stockSeguridad, row.puntoReorden, row.minimo, row.maximo,
    row.fechaEvento, row.ag, row.responsable, row.sitio, row.cantidad, row.costoUnitario,
    row.folio, row.departamento, row.unidad, row.proyecto, row.equipo, row.entregadoPor,
    row.salida, row.ubicacion, row.conStock,
    rawJson, Number(userId)
  ];
}

async function importSpreadsheet(file, cutoffDate, userId) {
  const analysis = analyzeSpreadsheet(file, cutoffDate);
  const conn = await db.getConnection();
  const lotId = crypto.randomUUID();
  try {
    await conn.beginTransaction();
    const columns = `(lote_importacion, archivo_origen, hoja_origen, fila_origen, fecha_corte,
      hash_archivo, hash_fila, encabezados_json, mapeo_json, tipo_registro,
      codigo, articulo, categoria, empresa, almacen, tipo_almacen,
      fisico, precio_unitario, valor,
      abc, criticidad, demanda, stock_seguridad, punto_reorden, minimo, maximo,
      fecha_evento, ag, responsable, sitio, cantidad, costo_unitario,
      folio, departamento, unidad, proyecto, equipo, entregado_por,
      salida, ubicacion, con_stock,
      raw_json, creado_por)`;
    const chunkSize = 250;
    for (const dataset of analysis.datasets) {
      for (let offset=0; offset<dataset.rows.length; offset += chunkSize) {
        const chunk = dataset.rows.slice(offset, offset + chunkSize);
        const params = chunk.flatMap(row => rowParams(lotId,file.originalname,analysis.fileHash,analysis.cutoffDate,userId,dataset,row));
        const placeholders = chunk.map(()=>`(${Array(43).fill('?').join(',')})`).join(',');
        await conn.query(`INSERT INTO ${TABLE} ${columns} VALUES ${placeholders}`, params);
      }
    }
    await conn.query(`UPDATE ${TABLE} SET activo=0 WHERE activo=1 AND lote_importacion<>?`, [lotId]);
    await conn.query(`UPDATE ${TABLE} SET activo=1 WHERE lote_importacion=?`, [lotId]);
    await conn.commit();
    return {
      ok:true,
      loteImportacion:lotId,
      archivoOrigen:file.originalname,
      hojaOrigen:analysis.datasets.find(dataset => dataset.type === RECORD_TYPES.INVENTORY)?.sheetName || null,
      fechaCorte:analysis.cutoffDate,
      filas:analysis.rowCount,
      inventoryRows:analysis.inventoryRows,
      loanRows:analysis.loanRows,
      guardRows:analysis.guardRows,
      coverage:analysis.coverage,
      warnings:analysis.warnings,
      hashArchivo:analysis.fileHash,
      datasets:analysis.datasets.map(dataset=>({type:dataset.type,sheetName:dataset.sheetName,rows:dataset.rowCount,mapping:dataset.mapping}))
    };
  } catch (error) {
    try { await conn.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    conn.release();
  }
}

function valueExpression(alias='') {
  const prefix = alias ? `${alias}.` : '';
  return `COALESCE(${prefix}valor, CASE WHEN ${prefix}fisico IS NOT NULL AND ${prefix}precio_unitario IS NOT NULL THEN ${prefix}fisico * ${prefix}precio_unitario ELSE NULL END)`;
}

function inventoryWhere() { return `activo=1 AND tipo_registro='${RECORD_TYPES.INVENTORY}'`; }

async function getDashboard() {
  const source = await activeSource();
  if (!source) return { ok:true, source:null, kpis:null, companies:[], warehouses:[], topByVolume:[], topByValue:[], coverage:{} };
  const valueExpr = valueExpression();
  const base = inventoryWhere();
  const [[kpiRows],[companies],[warehouses],[topByVolume],[topByValue]] = await Promise.all([
    db.query(`SELECT COUNT(*) AS referencias, COALESCE(SUM(COALESCE(fisico,0)),0) AS piezas,
      COUNT(DISTINCT NULLIF(TRIM(almacen),'')) AS almacenes,
      SUM(CASE WHEN fisico IS NOT NULL AND fisico<=0 THEN 1 ELSE 0 END) AS sinStock,
      SUM(CASE WHEN ${valueExpr} IS NOT NULL THEN 1 ELSE 0 END) AS filasConValor,
      SUM(${valueExpr}) AS valorTotal FROM ${TABLE} WHERE ${base}`),
    db.query(`SELECT COALESCE(NULLIF(TRIM(empresa),''),'Sin empresa') AS empresa, COUNT(*) AS referencias,
      COALESCE(SUM(COALESCE(fisico,0)),0) AS piezas,
      SUM(CASE WHEN ${valueExpr} IS NOT NULL THEN 1 ELSE 0 END) AS filasConValor,
      SUM(${valueExpr}) AS valorTotal FROM ${TABLE} WHERE ${base} GROUP BY empresa ORDER BY valorTotal DESC, empresa`),
    db.query(`SELECT COALESCE(NULLIF(TRIM(almacen),''),'Sin almacén') AS almacen, MAX(empresa) AS empresa,
      COUNT(*) AS referencias, COALESCE(SUM(COALESCE(fisico,0)),0) AS piezas,
      SUM(${valueExpr}) AS valorTotal FROM ${TABLE} WHERE ${base} GROUP BY almacen ORDER BY valorTotal DESC LIMIT 5`),
    db.query(`SELECT MAX(codigo) AS codigo, MAX(articulo) AS articulo, MAX(empresa) AS empresa,
      COALESCE(SUM(COALESCE(fisico,0)),0) AS total FROM ${TABLE} WHERE ${base}
      GROUP BY COALESCE(NULLIF(TRIM(codigo),''),NULLIF(TRIM(articulo),''),CONCAT('Fila ',fila_origen)) ORDER BY total DESC LIMIT 15`),
    db.query(`SELECT MAX(codigo) AS codigo, MAX(articulo) AS articulo, MAX(empresa) AS empresa,
      SUM(${valueExpr}) AS total FROM ${TABLE} WHERE ${base} AND ${valueExpr} IS NOT NULL
      GROUP BY COALESCE(NULLIF(TRIM(codigo),''),NULLIF(TRIM(articulo),''),CONCAT('Fila ',fila_origen)) ORDER BY total DESC LIMIT 15`)
  ]);
  const kpi = kpiRows[0] || {};
  return {
    ok:true, source,
    kpis:{referencias:Number(kpi.referencias||0),piezas:Number(kpi.piezas||0),almacenes:Number(kpi.almacenes||0),sinStock:Number(kpi.sinStock||0),valorTotal:Number(kpi.filasConValor||0)>0?Number(kpi.valorTotal||0):null},
    coverage:{valor:Number(kpi.filasConValor||0)>0},
    companies:companies.map(row=>({...row,referencias:Number(row.referencias||0),piezas:Number(row.piezas||0),valorTotal:Number(row.filasConValor||0)>0?Number(row.valorTotal||0):null})),
    warehouses:warehouses.map(row=>({...row,referencias:Number(row.referencias||0),piezas:Number(row.piezas||0),valorTotal:row.valorTotal==null?null:Number(row.valorTotal)})),
    topByVolume:topByVolume.map(row=>({...row,total:Number(row.total||0)})),
    topByValue:topByValue.map(row=>({...row,total:row.total==null?null:Number(row.total)}))
  };
}

function buildInventoryWhere(query) {
  const where = ["activo=1", `tipo_registro='${RECORD_TYPES.INVENTORY}'`];
  const params=[];
  const q=String(query.q||'').trim();
  if(q){const like=`%${q}%`;where.push('(codigo LIKE ? OR articulo LIKE ?)');params.push(like,like);}
  const company=String(query.company||'').trim(); if(company&&company!=='todas'){where.push('empresa=?');params.push(company);}
  const category=String(query.category||'').trim(); if(category&&category!=='todas'){where.push('categoria=?');params.push(category);}
  const warehouse=String(query.warehouse||'').trim(); if(warehouse&&warehouse!=='todos'){where.push('almacen=?');params.push(warehouse);}
  const minValue=parseNumber(query.minValue); if(minValue!=null){where.push(`${valueExpression()}>=?`);params.push(minValue);}
  const maxValue=parseNumber(query.maxValue); if(maxValue!=null){where.push(`${valueExpression()}<=?`);params.push(maxValue);}
  if(String(query.stockOnly||'').toLowerCase()==='true'||String(query.stockOnly)==='1')where.push('COALESCE(fisico,0)>0');
  return {sql:where.join(' AND '),params};
}

async function getInventory(query) {
  const pageSize=Math.min(100,Math.max(1,Number(query.pageSize||30))); const page=Math.max(1,Number(query.page||1)); const offset=(page-1)*pageSize;
  const where=buildInventoryWhere(query); const valueExpr=valueExpression();
  const [[rows],[countRows],[summaryRows]]=await Promise.all([
    db.query(`SELECT id,codigo,articulo,categoria,empresa,almacen,tipo_almacen AS tipoAlmacen,fisico,precio_unitario AS precioUnitario,${valueExpr} AS valor FROM ${TABLE} WHERE ${where.sql} ORDER BY COALESCE(NULLIF(TRIM(articulo),''),codigo,CONCAT('Fila ',fila_origen)) LIMIT ? OFFSET ?`,[...where.params,pageSize,offset]),
    db.query(`SELECT COUNT(*) AS total FROM ${TABLE} WHERE ${where.sql}`,where.params),
    db.query(`SELECT COUNT(*) AS registros,COALESCE(SUM(COALESCE(fisico,0)),0) AS piezas,SUM(CASE WHEN ${valueExpr} IS NOT NULL THEN 1 ELSE 0 END) AS filasConValor,SUM(${valueExpr}) AS valorTotal FROM ${TABLE} WHERE ${where.sql}`,where.params)
  ]);
  const total=Number(countRows[0]?.total||0); const summary=summaryRows[0]||{};
  return {ok:true,rows:rows.map(row=>({...row,fisico:row.fisico==null?null:Number(row.fisico),precioUnitario:row.precioUnitario==null?null:Number(row.precioUnitario),valor:row.valor==null?null:Number(row.valor)})),pagination:{page,pageSize,total,pages:Math.max(1,Math.ceil(total/pageSize))},summary:{registros:Number(summary.registros||0),piezas:Number(summary.piezas||0),valorTotal:Number(summary.filasConValor||0)>0?Number(summary.valorTotal||0):null}};
}

async function getCatalogs() {
  const base=inventoryWhere();
  const [[companies],[categories],[warehouses]]=await Promise.all([
    db.query(`SELECT DISTINCT empresa AS value FROM ${TABLE} WHERE ${base} AND NULLIF(TRIM(empresa),'') IS NOT NULL ORDER BY empresa`),
    db.query(`SELECT DISTINCT categoria AS value FROM ${TABLE} WHERE ${base} AND NULLIF(TRIM(categoria),'') IS NOT NULL ORDER BY categoria`),
    db.query(`SELECT DISTINCT almacen AS value FROM ${TABLE} WHERE ${base} AND NULLIF(TRIM(almacen),'') IS NOT NULL ORDER BY almacen`)
  ]);
  return {ok:true,companies:companies.map(x=>x.value),categories:categories.map(x=>x.value),warehouses:warehouses.map(x=>x.value)};
}

async function getCompany(query) {
  const company=String(query.company||'').trim(); if(!company)throw Object.assign(new Error('Empresa requerida.'),{status:400});
  const q=String(query.q||'').trim(); const page=Math.max(1,Number(query.page||1)); const pageSize=30; const offset=(page-1)*pageSize; const params=[company]; let extra='';
  if(q){extra=' AND (codigo LIKE ? OR articulo LIKE ?)';params.push(`%${q}%`,`%${q}%`);} const valueExpr=valueExpression(); const base=inventoryWhere();
  const [[rows],[countRows],[summaryRows]]=await Promise.all([
    db.query(`SELECT MAX(codigo) AS codigo,MAX(articulo) AS articulo,MAX(categoria) AS categoria,empresa,COALESCE(SUM(COALESCE(fisico,0)),0) AS fisico,CASE WHEN SUM(CASE WHEN precio_unitario IS NOT NULL THEN 1 ELSE 0 END)>0 THEN AVG(precio_unitario) ELSE NULL END AS precioUnitario,SUM(${valueExpr}) AS valor,COUNT(DISTINCT almacen) AS almacenes FROM ${TABLE} WHERE ${base} AND empresa=? ${extra} GROUP BY empresa,COALESCE(NULLIF(TRIM(codigo),''),NULLIF(TRIM(articulo),''),CONCAT('Fila ',fila_origen)) ORDER BY valor DESC,articulo LIMIT ? OFFSET ?`,[...params,pageSize,offset]),
    db.query(`SELECT COUNT(*) AS total FROM (SELECT 1 FROM ${TABLE} WHERE ${base} AND empresa=? ${extra} GROUP BY COALESCE(NULLIF(TRIM(codigo),''),NULLIF(TRIM(articulo),''),CONCAT('Fila ',fila_origen))) x`,params),
    db.query(`SELECT COALESCE(SUM(COALESCE(fisico,0)),0) AS piezas,SUM(${valueExpr}) AS valorTotal,SUM(CASE WHEN ${valueExpr} IS NOT NULL THEN 1 ELSE 0 END) AS filasConValor,AVG(precio_unitario) AS precioPromedio FROM ${TABLE} WHERE ${base} AND empresa=?`,[company])
  ]);
  const total=Number(countRows[0]?.total||0); const summary=summaryRows[0]||{};
  return {ok:true,company,rows:rows.map(row=>({...row,fisico:Number(row.fisico||0),precioUnitario:row.precioUnitario==null?null:Number(row.precioUnitario),valor:row.valor==null?null:Number(row.valor),almacenes:Number(row.almacenes||0)})),summary:{piezas:Number(summary.piezas||0),valorTotal:Number(summary.filasConValor||0)>0?Number(summary.valorTotal||0):null,precioPromedio:summary.precioPromedio==null?null:Number(summary.precioPromedio)},pagination:{page,pageSize,total,pages:Math.max(1,Math.ceil(total/pageSize))}};
}

async function getWarehouses(query) {
  const company=String(query.company||'').trim(); const q=String(query.q||'').trim(); const params=[]; const where=["activo=1",`tipo_registro='${RECORD_TYPES.INVENTORY}'`];
  if(company&&company!=='todas'){where.push('empresa=?');params.push(company);} if(q){where.push('almacen LIKE ?');params.push(`%${q}%`);} const valueExpr=valueExpression();
  const [rows]=await db.query(`SELECT COALESCE(NULLIF(TRIM(almacen),''),'Sin almacén') AS almacen,COALESCE(NULLIF(TRIM(tipo_almacen),''),'—') AS tipo,COALESCE(NULLIF(TRIM(empresa),''),'Sin empresa') AS empresa,COUNT(*) AS referencias,COALESCE(SUM(COALESCE(fisico,0)),0) AS piezas,SUM(${valueExpr}) AS valorTotal FROM ${TABLE} WHERE ${where.join(' AND ')} GROUP BY almacen,tipo,empresa ORDER BY valorTotal DESC,almacen`,params);
  return {ok:true,rows:rows.map(row=>({...row,referencias:Number(row.referencias||0),piezas:Number(row.piezas||0),valorTotal:row.valorTotal==null?null:Number(row.valorTotal)}))};
}

async function getTop(query) {
  const mode=String(query.mode||'valor')==='fisico'?'fisico':'valor'; const limit=Math.min(50,Math.max(1,Number(query.limit||20))); const company=String(query.company||'').trim(); const params=[]; const where=["activo=1",`tipo_registro='${RECORD_TYPES.INVENTORY}'`];
  if(company&&company!=='todas'){where.push('empresa=?');params.push(company);} const metric=mode==='fisico'?'COALESCE(SUM(COALESCE(fisico,0)),0)':`SUM(${valueExpression()})`; if(mode==='valor')where.push(`${valueExpression()} IS NOT NULL`);
  const [rows]=await db.query(`SELECT MAX(codigo) AS codigo,MAX(articulo) AS articulo,MAX(categoria) AS categoria,MAX(empresa) AS empresa,${metric} AS total FROM ${TABLE} WHERE ${where.join(' AND ')} GROUP BY COALESCE(NULLIF(TRIM(codigo),''),NULLIF(TRIM(articulo),''),CONCAT('Fila ',fila_origen)) ORDER BY total DESC LIMIT ?`,[...params,limit]);
  return {ok:true,mode,rows:rows.map(row=>({...row,total:row.total==null?null:Number(row.total)}))};
}

function stockAlertSql() {
  return `CASE
    WHEN stock_seguridad IS NOT NULL AND fisico IS NOT NULL AND fisico < stock_seguridad THEN 'critico'
    WHEN punto_reorden IS NOT NULL AND fisico IS NOT NULL AND fisico <= punto_reorden THEN 'reorden'
    WHEN maximo IS NOT NULL AND fisico IS NOT NULL AND fisico > maximo THEN 'exceso'
    ELSE 'ok' END`;
}

async function getStock(query) {
  const source=await activeSource();
  if(!source)return {ok:true,source:null,coverage:{},kpis:null,classSummary:[],rows:[],pagination:{page:1,pageSize:30,total:0,pages:1}};
  const page=Math.max(1,Number(query.page||1)); const pageSize=30; const offset=(page-1)*pageSize; const params=[]; const where=["activo=1",`tipo_registro='${RECORD_TYPES.INVENTORY}'`];
  const q=String(query.q||'').trim(); if(q){where.push('(codigo LIKE ? OR articulo LIKE ?)');params.push(`%${q}%`,`%${q}%`);} const company=String(query.company||'').trim(); if(company&&company!=='todas'){where.push('empresa=?');params.push(company);} const abc=String(query.abc||'').trim(); if(abc&&abc!=='todas'){where.push('UPPER(TRIM(abc))=?');params.push(abc.toUpperCase());}
  const alert=String(query.alert||'').trim(); if(alert&&alert!=='todas'){where.push(`(${stockAlertSql()})=?`);params.push(alert);}
  const alertSql=stockAlertSql();
  const [[rows],[countRows],[kpiRows],[classRows],[companyRows]]=await Promise.all([
    db.query(`SELECT id,codigo,articulo,empresa,UPPER(NULLIF(TRIM(abc),'')) AS abc,criticidad,demanda,fisico,stock_seguridad AS stockSeguridad,punto_reorden AS puntoReorden,minimo,maximo,${alertSql} AS alerta FROM ${TABLE} WHERE ${where.join(' AND ')} ORDER BY COALESCE(NULLIF(TRIM(articulo),''),codigo) LIMIT ? OFFSET ?`,[...params,pageSize,offset]),
    db.query(`SELECT COUNT(*) AS total FROM ${TABLE} WHERE ${where.join(' AND ')}`,params),
    db.query(`SELECT COUNT(*) AS articulos,SUM(CASE WHEN ${alertSql}='critico' THEN 1 ELSE 0 END) AS criticos,SUM(CASE WHEN ${alertSql}='reorden' THEN 1 ELSE 0 END) AS reorden,SUM(CASE WHEN ${alertSql}='exceso' THEN 1 ELSE 0 END) AS exceso FROM ${TABLE} WHERE activo=1 AND tipo_registro='${RECORD_TYPES.INVENTORY}'`),
    db.query(`SELECT UPPER(NULLIF(TRIM(abc),'')) AS abc,COUNT(*) AS total FROM ${TABLE} WHERE activo=1 AND tipo_registro='${RECORD_TYPES.INVENTORY}' AND NULLIF(TRIM(abc),'') IS NOT NULL GROUP BY UPPER(TRIM(abc)) ORDER BY abc`),
    db.query(`SELECT DISTINCT empresa AS value FROM ${TABLE} WHERE activo=1 AND tipo_registro='${RECORD_TYPES.INVENTORY}' AND NULLIF(TRIM(empresa),'') IS NOT NULL ORDER BY empresa`)
  ]);
  const mapping=source.datasets?.[RECORD_TYPES.INVENTORY]?.mapeo||{}; const k=kpiRows[0]||{}; const total=Number(countRows[0]?.total||0);
  return {ok:true,source,companies:companyRows.map(row=>row.value),coverage:{abc:Boolean(mapping.abc),criticidad:Boolean(mapping.criticidad),demanda:Boolean(mapping.demanda),stockSeguridad:Boolean(mapping.stock_seguridad),puntoReorden:Boolean(mapping.punto_reorden),minimo:Boolean(mapping.minimo),maximo:Boolean(mapping.maximo)},kpis:{articulos:Number(k.articulos||0),criticos:Number(k.criticos||0),reorden:Number(k.reorden||0),exceso:Number(k.exceso||0)},classSummary:classRows.map(row=>({abc:row.abc,total:Number(row.total||0)})),rows:rows.map(row=>({...row,demanda:row.demanda==null?null:Number(row.demanda),fisico:row.fisico==null?null:Number(row.fisico),stockSeguridad:row.stockSeguridad==null?null:Number(row.stockSeguridad),puntoReorden:row.puntoReorden==null?null:Number(row.puntoReorden),minimo:row.minimo==null?null:Number(row.minimo),maximo:row.maximo==null?null:Number(row.maximo)})),pagination:{page,pageSize,total,pages:Math.max(1,Math.ceil(total/pageSize))}};
}

function loanAgeBucketSql() {
  return `CASE WHEN fecha_evento IS NULL THEN 'SIN FECHA' WHEN DATEDIFF(CURDATE(),fecha_evento)<=180 THEN '1-6 MESES' WHEN DATEDIFF(CURDATE(),fecha_evento)<=450 THEN '6-15 MESES' ELSE 'MAYOR A 15 MESES' END`;
}

async function getLoanCatalogs() {
  const source=await activeSource();
  const base=`activo=1 AND tipo_registro='${RECORD_TYPES.LOAN}'`;
  const [[companies],[responsibles]]=await Promise.all([
    db.query(`SELECT DISTINCT empresa AS value FROM ${TABLE} WHERE ${base} AND NULLIF(TRIM(empresa),'') IS NOT NULL ORDER BY empresa`),
    db.query(`SELECT DISTINCT responsable AS value FROM ${TABLE} WHERE ${base} AND NULLIF(TRIM(responsable),'') IS NOT NULL ORDER BY responsable`)
  ]);
  return {ok:true,source,available:Boolean(source?.datasets?.[RECORD_TYPES.LOAN]?.filas),companies:companies.map(x=>x.value),responsibles:responsibles.map(x=>x.value)};
}

async function getLoanSummary(query) {
  const company=String(query.company||'').trim(); const params=[]; const where=["activo=1",`tipo_registro='${RECORD_TYPES.LOAN}'`]; if(company&&company!=='todas'){where.push('empresa=?');params.push(company);} const ageSql=loanAgeBucketSql();
  const [[kpiRows],[ageRows],[responsibleRows]]=await Promise.all([
    db.query(`SELECT COUNT(*) AS articulos,COALESCE(SUM(COALESCE(cantidad,0)),0) AS piezas,SUM(valor) AS valorTotal,COUNT(DISTINCT NULLIF(TRIM(responsable),'')) AS responsables FROM ${TABLE} WHERE ${where.join(' AND ')}`,params),
    db.query(`SELECT ${ageSql} AS antiguedad,COUNT(*) AS articulos,COALESCE(SUM(COALESCE(cantidad,0)),0) AS piezas,SUM(valor) AS valorTotal FROM ${TABLE} WHERE ${where.join(' AND ')} GROUP BY antiguedad ORDER BY MIN(fecha_evento) DESC`,params),
    db.query(`SELECT responsable,COUNT(*) AS articulos,COALESCE(SUM(COALESCE(cantidad,0)),0) AS cantidad,SUM(valor) AS valorTotal,MAX(DATEDIFF(CURDATE(),fecha_evento)) AS diasPrestamo,MIN(fecha_evento) AS desde,COUNT(DISTINCT NULLIF(TRIM(sitio),'')) AS sitios FROM ${TABLE} WHERE ${where.join(' AND ')} GROUP BY responsable ORDER BY valorTotal DESC,cantidad DESC,responsable`,params)
  ]);
  const k=kpiRows[0]||{}; const totalValue=k.valorTotal==null?null:Number(k.valorTotal);
  return {ok:true,kpis:{articulos:Number(k.articulos||0),piezas:Number(k.piezas||0),valorTotal:totalValue,responsables:Number(k.responsables||0)},ages:ageRows.map(row=>({...row,articulos:Number(row.articulos||0),piezas:Number(row.piezas||0),valorTotal:row.valorTotal==null?null:Number(row.valorTotal)})),rows:responsibleRows.map(row=>({...row,articulos:Number(row.articulos||0),cantidad:Number(row.cantidad||0),valorTotal:row.valorTotal==null?null:Number(row.valorTotal),porcentaje:totalValue&&row.valorTotal!=null?Number(row.valorTotal)*100/totalValue:null,diasPrestamo:row.diasPrestamo==null?null:Number(row.diasPrestamo),sitios:Number(row.sitios||0)}))};
}

async function getLoans(query) {
  const page=Math.max(1,Number(query.page||1)); const pageSize=30; const offset=(page-1)*pageSize; const params=[]; const where=["activo=1",`tipo_registro='${RECORD_TYPES.LOAN}'`];
  const company=String(query.company||'').trim(); if(company&&company!=='todas'){where.push('empresa=?');params.push(company);} const responsible=String(query.responsible||'').trim(); if(responsible&&responsible!=='todos'){where.push('responsable=?');params.push(responsible);} const age=String(query.age||'').trim(); if(age&&age!=='todas'){where.push(`(${loanAgeBucketSql()})=?`);params.push(age);} const q=String(query.q||'').trim(); if(q){const like=`%${q}%`;where.push('(articulo LIKE ? OR sitio LIKE ? OR ag LIKE ? OR codigo LIKE ?)');params.push(like,like,like,like);}
  const ageSql=loanAgeBucketSql(); const [[rows],[countRows],[summaryRows]]=await Promise.all([
    db.query(`SELECT id,fecha_evento AS fecha,codigo,articulo,empresa,ag,responsable,sitio,cantidad,costo_unitario AS costo,valor,DATEDIFF(CURDATE(),fecha_evento) AS dias,${ageSql} AS antiguedad FROM ${TABLE} WHERE ${where.join(' AND ')} ORDER BY fecha_evento ASC,responsable,articulo LIMIT ? OFFSET ?`,[...params,pageSize,offset]),
    db.query(`SELECT COUNT(*) AS total FROM ${TABLE} WHERE ${where.join(' AND ')}`,params),
    db.query(`SELECT COUNT(*) AS articulos,COALESCE(SUM(COALESCE(cantidad,0)),0) AS cantidad,SUM(valor) AS valorTotal FROM ${TABLE} WHERE ${where.join(' AND ')}`,params)
  ]);
  const total=Number(countRows[0]?.total||0); const s=summaryRows[0]||{};
  return {ok:true,rows:rows.map(row=>({...row,cantidad:row.cantidad==null?null:Number(row.cantidad),costo:row.costo==null?null:Number(row.costo),valor:row.valor==null?null:Number(row.valor),dias:row.dias==null?null:Number(row.dias)})),summary:{articulos:Number(s.articulos||0),cantidad:Number(s.cantidad||0),valorTotal:s.valorTotal==null?null:Number(s.valorTotal)},pagination:{page,pageSize,total,pages:Math.max(1,Math.ceil(total/pageSize))}};
}

async function getGuardCatalogs() {
  const source=await activeSource();
  const base=`activo=1 AND tipo_registro='${RECORD_TYPES.GUARD}'`;
  const [[companies],[departments]]=await Promise.all([
    db.query(`SELECT DISTINCT empresa AS value FROM ${TABLE} WHERE ${base} AND NULLIF(TRIM(empresa),'') IS NOT NULL ORDER BY empresa`),
    db.query(`SELECT DISTINCT departamento AS value FROM ${TABLE} WHERE ${base} AND NULLIF(TRIM(departamento),'') IS NOT NULL ORDER BY departamento`)
  ]);
  return {ok:true,source,available:Boolean(source?.datasets?.[RECORD_TYPES.GUARD]?.filas),companies:companies.map(x=>x.value),departments:departments.map(x=>x.value)};
}

async function getGuards(query) {
  const page=Math.max(1,Number(query.page||1)); const pageSize=30; const offset=(page-1)*pageSize; const params=[]; const where=["activo=1",`tipo_registro='${RECORD_TYPES.GUARD}'`];
  const q=String(query.q||'').trim(); if(q){const like=`%${q}%`;where.push('(articulo LIKE ? OR proyecto LIKE ? OR ag LIKE ? OR folio LIKE ?)');params.push(like,like,like,like);} const company=String(query.company||'').trim(); if(company&&company!=='todas'){where.push('empresa=?');params.push(company);} const department=String(query.department||'').trim(); if(department&&department!=='todos'){where.push('departamento=?');params.push(department);} const exitStatus=String(query.exitStatus||'').trim(); if(exitStatus==='con')where.push("NULLIF(TRIM(salida),'') IS NOT NULL"); else if(exitStatus==='sin')where.push("NULLIF(TRIM(salida),'') IS NULL");
  const [[rows],[countRows],[kpiRows]]=await Promise.all([
    db.query(`SELECT id,fecha_evento AS fecha,folio,empresa AS subsidiaria,departamento,ag,cantidad,unidad,articulo AS descripcion,proyecto,equipo,entregado_por AS entregadoPor,salida,responsable AS aCargoDe,ubicacion,con_stock AS conStock FROM ${TABLE} WHERE ${where.join(' AND ')} ORDER BY COALESCE(fecha_evento,'1900-01-01') DESC,folio DESC LIMIT ? OFFSET ?`,[...params,pageSize,offset]),
    db.query(`SELECT COUNT(*) AS total FROM ${TABLE} WHERE ${where.join(' AND ')}`,params),
    db.query(`SELECT COUNT(*) AS total,SUM(CASE WHEN NULLIF(TRIM(salida),'') IS NOT NULL THEN 1 ELSE 0 END) AS conSalida,SUM(CASE WHEN NULLIF(TRIM(salida),'') IS NULL THEN 1 ELSE 0 END) AS sinSalida FROM ${TABLE} WHERE activo=1 AND tipo_registro='${RECORD_TYPES.GUARD}'`)
  ]);
  const total=Number(countRows[0]?.total||0); const k=kpiRows[0]||{};
  return {ok:true,kpis:{total:Number(k.total||0),conSalida:Number(k.conSalida||0),sinSalida:Number(k.sinSalida||0),filtrados:total},rows:rows.map(row=>({...row,cantidad:row.cantidad==null?null:Number(row.cantidad)})),pagination:{page,pageSize,total,pages:Math.max(1,Math.ceil(total/pageSize))}};
}


// [Aster | 2026-08-30 | ALMACEN-AUDITORIA-AIVEN-V002]
// Auditoría F4 V002 es de solo lectura/contraste. No persiste resultados ni reutiliza
// almacen_fuente_excel como histórico de auditorías.
function shuffleCopy(list) {
  const copy = list.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

async function getAuditCatalogs() {
  const source = await activeSource();
  if (!source) return { ok:true, source:null, available:false, warehouses:[] };
  const valueExpr = valueExpression();
  const [rows] = await db.query(
    `SELECT empresa,
            almacen,
            COALESCE(NULLIF(TRIM(MAX(tipo_almacen)),''),'—') AS tipo,
            COUNT(*) AS referencias,
            COALESCE(SUM(COALESCE(fisico,0)),0) AS piezas,
            SUM(${valueExpr}) AS valorEsperado
       FROM ${TABLE}
      WHERE activo=1
        AND tipo_registro='${RECORD_TYPES.INVENTORY}'
        AND NULLIF(TRIM(empresa),'') IS NOT NULL
        AND NULLIF(TRIM(almacen),'') IS NOT NULL
        AND COALESCE(fisico,0) > 0
      GROUP BY empresa, almacen
      ORDER BY empresa, almacen`
  );
  return {
    ok:true,
    source,
    available:rows.length > 0,
    warehouses:rows.map(row => ({
      company:row.empresa,
      warehouse:row.almacen,
      type:row.tipo,
      references:Number(row.referencias || 0),
      pieces:Number(row.piezas || 0),
      expectedValue:row.valorEsperado == null ? null : Number(row.valorEsperado)
    }))
  };
}

async function getAuditSample(query) {
  const source = await activeSource();
  if (!source) return { ok:true, source:null, available:false, sample:null };
  const company = String(query.company || '').trim();
  const warehouse = String(query.warehouse || '').trim();
  if (!company || !warehouse) throw Object.assign(new Error('Empresa y almacén son requeridos para generar la muestra.'), { status:400 });

  const valueExpr = valueExpression();
  const [rows] = await db.query(
    `SELECT MAX(id) AS sourceId,
            MAX(codigo) AS codigo,
            MAX(articulo) AS articulo,
            MAX(categoria) AS categoria,
            MAX(tipo_almacen) AS tipoAlmacen,
            empresa,
            almacen,
            COALESCE(SUM(COALESCE(fisico,0)),0) AS esperado,
            SUM(${valueExpr}) AS valorEsperado
       FROM ${TABLE}
      WHERE activo=1
        AND tipo_registro='${RECORD_TYPES.INVENTORY}'
        AND empresa=?
        AND almacen=?
        AND COALESCE(fisico,0) > 0
      GROUP BY empresa, almacen,
               COALESCE(NULLIF(TRIM(codigo),''),NULLIF(TRIM(articulo),''),CONCAT('Fila ',fila_origen))
      ORDER BY MAX(articulo), MAX(codigo)`,
    [company, warehouse]
  );

  if (!rows.length) throw Object.assign(new Error('El almacén seleccionado no tiene artículos con existencia positiva en el lote activo.'), { status:404 });

  const normalized = rows.map(row => {
    const expected = Number(row.esperado || 0);
    const expectedValue = row.valorEsperado == null ? null : Number(row.valorEsperado);
    const impliedUnitValue = expected > 0 && expectedValue != null ? expectedValue / expected : null;
    return {
      sourceId:Number(row.sourceId),
      code:row.codigo || '',
      article:row.articulo || row.codigo || 'Sin descripción',
      category:row.categoria || '',
      company:row.empresa,
      warehouse:row.almacen,
      warehouseType:row.tipoAlmacen || '',
      expected,
      expectedValue,
      unitValue:impliedUnitValue
    };
  });

  const totalReferences = normalized.length;
  const requested = Math.max(1, Math.round(totalReferences * 0.05));
  const sampleSize = Math.min(totalReferences, Math.max(Math.min(3,totalReferences), requested));
  const valueCount = Math.min(sampleSize, Math.round(sampleSize * 0.70));
  const randomCount = sampleSize - valueCount;

  const ranked = normalized.slice().sort((a,b) => Number(b.expectedValue || 0) - Number(a.expectedValue || 0));
  const poolSize = Math.min(ranked.length, Math.max(valueCount * 2, Math.min(10, ranked.length)));
  const valuePool = shuffleCopy(ranked.slice(0, poolSize));
  const byValue = valuePool.slice(0, valueCount);
  const selectedIds = new Set(byValue.map(item => item.sourceId));
  const remaining = shuffleCopy(normalized.filter(item => !selectedIds.has(item.sourceId)));
  const randomItems = remaining.slice(0, randomCount);
  const items = shuffleCopy(byValue.concat(randomItems));

  return {
    ok:true,
    source,
    available:true,
    sample:{
      sessionId:crypto.randomUUID(),
      generatedAt:new Date().toISOString(),
      company,
      warehouse,
      warehouseType:items[0]?.warehouseType || '',
      totalReferences,
      sampleSize:items.length,
      methodology:{ percentage:5, byValuePercent:70, randomPercent:30, minimum:Math.min(3,totalReferences) },
      items
    }
  };
}

module.exports = {
  INVENTORY_ALIASES,
  LOAN_ALIASES,
  GUARD_ALIASES,
  RECORD_TYPES,
  canImport,
  activeSource,
  validateImport,
  importSpreadsheet,
  getDashboard,
  getInventory,
  getCatalogs,
  getCompany,
  getWarehouses,
  getTop,
  getStock,
  getLoanCatalogs,
  getLoanSummary,
  getLoans,
  getGuardCatalogs,
  getGuards,
  getAuditCatalogs,
  getAuditSample,
  analyzeSpreadsheet
};
