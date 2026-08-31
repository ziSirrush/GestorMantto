'use strict';

const crypto = require('crypto');
const db = require('../../config/db');
const { parseXlsxSheets, parseCsv } = require('./xlsx-lite');
const { analyzeOfficialWorkbook } = require('./almacen.official-workbook');
const queryService = require('./almacen.query-service');
const auditService = require('./almacen.audit-service');
const sourceEngine = require('./almacen.source-engine');

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

  // Primero intenta el perfil operativo verificado para Gestión de Almacén.
  // Si no hay ninguna hoja característica, conserva íntegro el validador genérico anterior.
  const official = analyzeOfficialWorkbook({ sheets, requestedCutoffDate, maxRows:MAX_ROWS });
  if (official && official.detected) {
    return {
      ...official.analysis,
      fileHash:crypto.createHash('sha256').update(file.buffer).digest('hex')
    };
  }

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
    profile:'GENERIC_ALIASES',
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
  return sourceEngine.activeSource(conn);
}

async function validateImport(file, cutoffDate) {
  const analysis = analyzeSpreadsheet(file, cutoffDate);
  const inventoryDataset = analysis.datasets.find(dataset => dataset.type === RECORD_TYPES.INVENTORY);
  return {
    ok:true,
    valid:true,
    profile:analysis.profile || 'GENERIC_ALIASES',
    recognizedSheets:analysis.recognizedSheets || null,
    detectedSheets:analysis.detectedSheets || null,
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
      profile:analysis.profile || 'GENERIC_ALIASES',
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

// [Aster | 2026-08-31 | ASTER-MG | FASE 2 ALMACEN MOTOR FUENTE/CIERRE V001]
// Lecturas desacopladas: todas resuelven primero el lote/cierre mediante queryService.
async function resolveSource(query = {}, conn = db) { return sourceEngine.resolveSource(query, conn); }
async function listSources(query = {}) { return queryService.listSources(query); }
async function getDashboard(query = {}) { return queryService.getDashboard(query); }
async function getInventory(query = {}) { return queryService.getInventory(query); }
async function getCatalogs(query = {}) { return queryService.getCatalogs(query); }
async function getCompany(query = {}) { return queryService.getCompany(query); }
async function getWarehouses(query = {}) { return queryService.getWarehouses(query); }
async function getTop(query = {}) { return queryService.getTop(query); }
async function getStock(query = {}) { return queryService.getStock(query); }
async function getLoanCatalogs(query = {}) { return queryService.getLoanCatalogs(query); }
async function getLoanSummary(query = {}) { return queryService.getLoanSummary(query); }
async function getLoans(query = {}) { return queryService.getLoans(query); }
async function getGuardCatalogs(query = {}) { return queryService.getGuardCatalogs(query); }
async function getGuards(query = {}) { return queryService.getGuards(query); }
async function getAuditCatalogs(query = {}) { return queryService.getAuditCatalogs(query); }
async function getAuditSample(query = {}) { return queryService.getAuditSample(query); }

// [Aster | 2026-08-31 | ASTER-MG | FASE 3 ALMACEN CIERRES/AUDITORIA PERSISTENTE V001]
async function listAudits(query = {}) { return auditService.listAudits(query); }
async function getAudit(folio) { return auditService.getAudit(folio); }
async function createAudit(input = {}, userId) { return auditService.createAudit(input, userId); }
async function updateAuditItem(folio, id, input = {}, userId) { return auditService.updateAuditItem(folio, id, input, userId); }
async function closeAudit(folio, userId) { return auditService.closeAudit(folio, userId); }

module.exports = {
  INVENTORY_ALIASES,
  LOAN_ALIASES,
  GUARD_ALIASES,
  RECORD_TYPES,
  canImport,
  activeSource,
  resolveSource,
  listSources,
  closeAudit,
  updateAuditItem,
  createAudit,
  getAudit,
  listAudits,
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
