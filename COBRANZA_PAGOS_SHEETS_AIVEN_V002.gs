/**
 * ==========================================================================
 * MANTTO GESTOR | COBRANZA CORELLIAN | PAGOS
 * Google Sheets (Hoja SB) -> Backend Azure -> Aiven
 * Version: V002
 * Fecha: 2026-10-01
 * ==========================================================================
 *
 * CONTRATO FASE 3
 * - Lee Hoja SB, no PagosNs.
 * - A:U = 21 campos canonicos de cobranza_pagos_cor.
 * - V = id_pago, identidad tecnica de UPSERT.
 * - id_pago se envia al backend y se mapea a id_pago_cor.
 * - key_fields = ["id_pago"].
 * - NO crea ni modifica cobranza_rel_pagos.
 * - NO elimina pagos de Aiven si dejan de aparecer en Hoja SB.
 *
 * IMPORTANTE
 * - id_pago debe ser entero positivo, unico y ESTABLE para el mismo pago.
 * - Este script falla cerrado si falta/duplica id_pago o no_factura.
 * - El checkpoint solo avanza despues de recibir HTTP 2xx del backend.
 */

const COBRANZA_PAGOS_CONFIG = Object.freeze({
  SPREADSHEET_ID: '1yYzfKzFyB9y5Md0azofWpH72RscpHk7dNPzOP0_oeg4',
  SHEET_NAME: 'Hoja SB',

  API_BASE:
    'https://mantto-gestor-api-a4hwfpgvbeb4gmgj.mexicocentral-01.azurewebsites.net',
  API_ENDPOINT:
    '/api/cobranza-cor/carga/pagos',

  INTEGRATION_ID:
    'ventas-appscript',
  INTEGRATION_SECRET_PROPERTY:
    'INTEGRATION_VENTAS_SECRET',

  HEADER_INTEGRATION_ID:
    'X-Integration-Id',
  HEADER_TIMESTAMP:
    'X-Integration-Timestamp',
  HEADER_SIGNATURE:
    'X-Integration-Signature',

  BATCH_SIZE: 300,
  LOCK_WAIT_MS: 30000,

  CHECKPOINT_PROPERTY:
    'COBRANZA_PAGOS_AIVEN_CHECKPOINT_V002',
  LAST_HASH_PROPERTY:
    'COBRANZA_PAGOS_AIVEN_LAST_HASH_V002',
  LAST_SYNC_PROPERTY:
    'COBRANZA_PAGOS_AIVEN_LAST_SYNC_V002',
  LAST_COUNT_PROPERTY:
    'COBRANZA_PAGOS_AIVEN_LAST_COUNT_V002',

  VERSION:
    'COBRANZA_PAGOS_AIVEN_V002',
  TIMEZONE:
    'America/Mexico_City'
});

const COBRANZA_PAGOS_SOURCE_HEADERS = Object.freeze([
  'no_factura',
  'cliente',
  'limite_credito',
  'proyecto',
  'fecha_servicio',
  'estado',
  'facturado',
  'pagado',
  'saldo',
  'dias_retraso',
  'fecha_emision',
  'fecha_vencimiento',
  'terminos',
  'zona_adm',
  'subsidiaria',
  'clase',
  'creado_desde',
  'fecha_creacion_ov',
  'complemento_pago',
  'fecha_complemento_pago',
  'importe_complemento_pago',
  'id_pago'
]);

const COBRANZA_PAGOS_BUSINESS_FIELDS = Object.freeze([
  'no_factura',
  'cliente',
  'limite_credito',
  'proyecto',
  'fecha_servicio',
  'estado',
  'facturado',
  'pagado',
  'saldo',
  'dias_retraso',
  'fecha_emision',
  'fecha_vencimiento',
  'terminos',
  'zona_adm',
  'subsidiaria',
  'clase',
  'creado_desde',
  'fecha_creacion_ov',
  'complemento_pago',
  'fecha_complemento_pago',
  'importe_complemento_pago'
]);

const COBRANZA_PAGOS_NUMERIC_FIELDS = Object.freeze(new Set([
  'limite_credito',
  'facturado',
  'pagado',
  'saldo',
  'importe_complemento_pago'
]));

const COBRANZA_PAGOS_INTEGER_FIELDS = Object.freeze(new Set([
  'dias_retraso'
]));

const COBRANZA_PAGOS_DATE_FIELDS = Object.freeze(new Set([
  'fecha_servicio',
  'fecha_emision',
  'fecha_vencimiento',
  'fecha_complemento_pago'
]));

const COBRANZA_PAGOS_DATETIME_FIELDS = Object.freeze(new Set([
  'fecha_creacion_ov'
]));

/**
 * Funcion principal.
 */
function COBRANZA_PAGOS_EnviarAiven() {
  const lock = LockService.getScriptLock();
  lock.waitLock(COBRANZA_PAGOS_CONFIG.LOCK_WAIT_MS);

  try {
    COBRANZA_PAGOS_Log('INICIO');

    const lectura = COBRANZA_PAGOS_LeerOrigen_();

    if (lectura.registros.length === 0) {
      COBRANZA_PAGOS_Log('Hoja SB no contiene registros para enviar. Aiven no se modifica.');
      return {
        ok: true,
        total: 0,
        enviados: 0
      };
    }

    COBRANZA_PAGOS_ValidarIdsUnicos_(lectura.registros);

    const registrosParaHash = COBRANZA_PAGOS_RegistrosSinMeta_(lectura.registros);
    const snapshotHash = COBRANZA_PAGOS_Hash_(registrosParaHash);
    const props = PropertiesService.getScriptProperties();
    const checkpoint = COBRANZA_PAGOS_LeerCheckpoint_(props, snapshotHash);

    const total = lectura.registros.length;
    const totalBatches = Math.ceil(total / COBRANZA_PAGOS_CONFIG.BATCH_SIZE);
    let offset = checkpoint.offset;

    COBRANZA_PAGOS_Log(
      'Registros=' + total +
      ' | Lotes=' + totalBatches +
      ' | ReanudarOffset=' + offset
    );

    while (offset < total) {
      const fin = Math.min(offset + COBRANZA_PAGOS_CONFIG.BATCH_SIZE, total);
      const lote = lectura.registros.slice(offset, fin);
      const batchIndex = Math.floor(offset / COBRANZA_PAGOS_CONFIG.BATCH_SIZE) + 1;

      const payload = {
        source: 'google_sheets_bg_pagos',
        version: COBRANZA_PAGOS_CONFIG.VERSION,
        sync_mode: 'upsert',
        key_fields: ['id_pago'],
        snapshot_id: snapshotHash,
        batch: {
          index: batchIndex,
          total: totalBatches,
          offset: offset,
          count: lote.length,
          total_records: total,
          is_last: fin >= total
        },
        registros: lote
      };

      COBRANZA_PAGOS_Log(
        'Enviando lote ' + batchIndex + '/' + totalBatches +
        ' | offset=' + offset +
        ' | registros=' + lote.length
      );

      const respuesta = COBRANZA_PAGOS_EnviarAPI_(payload);

      COBRANZA_PAGOS_Log(
        'Respuesta lote ' + batchIndex + '/' + totalBatches +
        ' | HTTP=' + respuesta.httpCode +
        ' | body=' + COBRANZA_PAGOS_Recortar_(respuesta.body, 1500)
      );

      // Solo un 2xx aceptado permite avanzar el checkpoint.
      offset = fin;
      COBRANZA_PAGOS_GuardarCheckpoint_(props, snapshotHash, offset);
    }

    props.deleteProperty(COBRANZA_PAGOS_CONFIG.CHECKPOINT_PROPERTY);
    props.setProperty(COBRANZA_PAGOS_CONFIG.LAST_HASH_PROPERTY, snapshotHash);
    props.setProperty(COBRANZA_PAGOS_CONFIG.LAST_SYNC_PROPERTY, new Date().toISOString());
    props.setProperty(COBRANZA_PAGOS_CONFIG.LAST_COUNT_PROPERTY, String(total));

    COBRANZA_PAGOS_Log('FIN OK | enviados=' + total);

    return {
      ok: true,
      total: total,
      enviados: total,
      snapshotId: snapshotHash
    };
  } finally {
    try {
      lock.releaseLock();
    } catch (error) {
      // No bloquear el resultado principal por releaseLock.
    }
  }
}

/**
 * Lee Hoja SB A:V. A:U son negocio; V es id_pago.
 */
function COBRANZA_PAGOS_LeerOrigen_() {
  const ss = SpreadsheetApp.openById(COBRANZA_PAGOS_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(COBRANZA_PAGOS_CONFIG.SHEET_NAME);

  if (!sheet) {
    throw new Error('No existe la hoja "' + COBRANZA_PAGOS_CONFIG.SHEET_NAME + '".');
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 1) {
    throw new Error('La hoja "' + COBRANZA_PAGOS_CONFIG.SHEET_NAME + '" esta vacia.');
  }

  const headers = sheet
    .getRange(1, 1, 1, COBRANZA_PAGOS_SOURCE_HEADERS.length)
    .getDisplayValues()[0]
    .map(function(value) { return String(value == null ? '' : value).trim(); });

  COBRANZA_PAGOS_ValidarEncabezadosExactos_(headers);

  if (lastRow < 2) {
    return {
      hoja: sheet.getName(),
      registros: []
    };
  }

  const values = sheet
    .getRange(2, 1, lastRow - 1, COBRANZA_PAGOS_SOURCE_HEADERS.length)
    .getValues();

  const registros = [];

  for (let i = 0; i < values.length; i += 1) {
    const row = values[i];
    const filaSheet = i + 2;

    if (COBRANZA_PAGOS_FilaVacia_(row)) continue;

    const record = {};

    for (let c = 0; c < COBRANZA_PAGOS_BUSINESS_FIELDS.length; c += 1) {
      const field = COBRANZA_PAGOS_BUSINESS_FIELDS[c];
      record[field] = COBRANZA_PAGOS_NormalizarValor_(field, row[c]);
    }

    record.id_pago = COBRANZA_PAGOS_NormalizarIdPago_(row[21], filaSheet);

    if (record.no_factura === null || record.no_factura === '') {
      throw new Error(
        'Fila ' + filaSheet + ' invalida: no_factura esta vacio. No se envia ningun lote.'
      );
    }

    record.__source_row = filaSheet;
    registros.push(record);
  }

  COBRANZA_PAGOS_Log(
    'Hoja=' + sheet.getName() +
    ' | registrosValidos=' + registros.length
  );

  return {
    hoja: sheet.getName(),
    registros: registros
  };
}

function COBRANZA_PAGOS_ValidarEncabezadosExactos_(headers) {
  for (let i = 0; i < COBRANZA_PAGOS_SOURCE_HEADERS.length; i += 1) {
    const esperado = COBRANZA_PAGOS_SOURCE_HEADERS[i];
    const recibido = String(headers[i] == null ? '' : headers[i]).trim();

    if (recibido !== esperado) {
      throw new Error(
        'Encabezado diferente en columna ' + (i + 1) +
        '. Esperado="' + esperado + '" | Recibido="' + recibido + '"'
      );
    }
  }
}

function COBRANZA_PAGOS_NormalizarIdPago_(value, filaSheet) {
  let number;

  if (typeof value === 'number') {
    number = value;
  } else {
    const text = String(value == null ? '' : value).trim();
    if (!/^\d+$/.test(text)) {
      throw new Error(
        'Fila ' + filaSheet + ': id_pago debe ser un entero positivo. Recibido="' + text + '"'
      );
    }
    number = Number(text);
  }

  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(
      'Fila ' + filaSheet + ': id_pago debe ser un entero positivo seguro. Recibido=' + value
    );
  }

  return number;
}

function COBRANZA_PAGOS_ValidarIdsUnicos_(registros) {
  const seen = Object.create(null);
  const duplicados = [];

  registros.forEach(function(record) {
    const key = String(record.id_pago);
    if (seen[key] !== undefined) {
      duplicados.push({
        id_pago: record.id_pago,
        fila1: seen[key],
        fila2: record.__source_row
      });
    } else {
      seen[key] = record.__source_row;
    }
  });

  if (duplicados.length > 0) {
    throw new Error(
      'Hoja SB contiene id_pago duplicados. No se envia nada. Muestra: ' +
      JSON.stringify(duplicados.slice(0, 20))
    );
  }
}

function COBRANZA_PAGOS_NormalizarValor_(field, value) {
  if (value === null || value === undefined || value === '') return null;

  if (COBRANZA_PAGOS_DATE_FIELDS.has(field)) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return Utilities.formatDate(
        value,
        COBRANZA_PAGOS_CONFIG.TIMEZONE,
        'yyyy-MM-dd'
      );
    }
    return String(value).trim() || null;
  }

  if (COBRANZA_PAGOS_DATETIME_FIELDS.has(field)) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return Utilities.formatDate(
        value,
        COBRANZA_PAGOS_CONFIG.TIMEZONE,
        'yyyy-MM-dd HH:mm:ss'
      );
    }
    return String(value).trim() || null;
  }

  if (COBRANZA_PAGOS_NUMERIC_FIELDS.has(field)) {
    return COBRANZA_PAGOS_NormalizarNumero_(value, false);
  }

  if (COBRANZA_PAGOS_INTEGER_FIELDS.has(field)) {
    return COBRANZA_PAGOS_NormalizarNumero_(value, true);
  }

  if (typeof value === 'string') {
    const text = value.trim();
    return text === '' ? null : text;
  }

  return value;
}

function COBRANZA_PAGOS_NormalizarNumero_(value, integerOnly) {
  if (typeof value === 'number') {
    if (!isFinite(value)) throw new Error('Valor numerico no finito: ' + value);
    return integerOnly ? Math.trunc(value) : value;
  }

  let text = String(value).trim();
  if (text === '') return null;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }

  text = text
    .replace(/\s/g, '')
    .replace(/[$€£]/g, '')
    .replace(/[^0-9,.-]/g, '');

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    if (/,[0-9]{1,2}$/.test(text)) {
      text = text.replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  }

  const numeric = Number(text);
  if (!isFinite(numeric)) {
    throw new Error('Valor numerico invalido: ' + value);
  }

  const result = negative ? -numeric : numeric;
  return integerOnly ? Math.trunc(result) : result;
}

function COBRANZA_PAGOS_EnviarAPI_(payload) {
  const url = COBRANZA_PAGOS_CONFIG.API_BASE + COBRANZA_PAGOS_CONFIG.API_ENDPOINT;
  const limpio = JSON.parse(JSON.stringify(payload));

  limpio.registros.forEach(function(record) {
    delete record.__source_row;
  });

  const body = JSON.stringify(limpio);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secret = COBRANZA_PAGOS_ObtenerSecret_();
  const signature = COBRANZA_PAGOS_Firmar_(timestamp, body, secret);

  const headers = {};
  headers[COBRANZA_PAGOS_CONFIG.HEADER_INTEGRATION_ID] =
    COBRANZA_PAGOS_CONFIG.INTEGRATION_ID;
  headers[COBRANZA_PAGOS_CONFIG.HEADER_TIMESTAMP] = timestamp;
  headers[COBRANZA_PAGOS_CONFIG.HEADER_SIGNATURE] = signature;

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: body,
    headers: headers,
    muteHttpExceptions: true
  });

  const httpCode = response.getResponseCode();
  const responseBody = response.getContentText();

  if (httpCode < 200 || httpCode >= 300) {
    throw new Error(
      'Backend rechazo lote. HTTP ' + httpCode + ' | ' +
      COBRANZA_PAGOS_Recortar_(responseBody, 2000)
    );
  }

  let parsed = null;
  try {
    parsed = responseBody ? JSON.parse(responseBody) : null;
  } catch (error) {
    // 2xx sin JSON sigue siendo respuesta HTTP valida.
  }

  if (parsed && parsed.ok === false) {
    throw new Error(
      'Backend respondio ok=false: ' +
      COBRANZA_PAGOS_Recortar_(responseBody, 2000)
    );
  }

  return {
    httpCode: httpCode,
    body: responseBody,
    json: parsed
  };
}

function COBRANZA_PAGOS_Firmar_(timestamp, body, secret) {
  const canonical =
    timestamp + '\n' +
    'POST' + '\n' +
    COBRANZA_PAGOS_CONFIG.API_ENDPOINT + '\n' +
    body;

  const bytes = Utilities.computeHmacSha256Signature(
    canonical,
    secret,
    Utilities.Charset.UTF_8
  );

  return bytes.map(function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
}

function COBRANZA_PAGOS_ObtenerSecret_() {
  const secret = PropertiesService
    .getScriptProperties()
    .getProperty(COBRANZA_PAGOS_CONFIG.INTEGRATION_SECRET_PROPERTY);

  if (!secret) {
    throw new Error(
      'Falta la propiedad de script ' +
      COBRANZA_PAGOS_CONFIG.INTEGRATION_SECRET_PROPERTY
    );
  }

  return secret;
}

function COBRANZA_PAGOS_LeerCheckpoint_(props, snapshotHash) {
  const raw = props.getProperty(COBRANZA_PAGOS_CONFIG.CHECKPOINT_PROPERTY);

  if (!raw) return { snapshotHash: snapshotHash, offset: 0 };

  try {
    const parsed = JSON.parse(raw);
    if (parsed.snapshotHash !== snapshotHash) {
      return { snapshotHash: snapshotHash, offset: 0 };
    }
    return {
      snapshotHash: snapshotHash,
      offset: Math.max(0, Number(parsed.offset) || 0)
    };
  } catch (error) {
    return { snapshotHash: snapshotHash, offset: 0 };
  }
}

function COBRANZA_PAGOS_GuardarCheckpoint_(props, snapshotHash, offset) {
  props.setProperty(
    COBRANZA_PAGOS_CONFIG.CHECKPOINT_PROPERTY,
    JSON.stringify({
      snapshotHash: snapshotHash,
      offset: offset,
      updatedAt: new Date().toISOString()
    })
  );
}

function COBRANZA_PAGOS_RegistrosSinMeta_(registros) {
  return registros.map(function(record) {
    const limpio = {};
    Object.keys(record).forEach(function(key) {
      if (key !== '__source_row') limpio[key] = record[key];
    });
    return limpio;
  });
}

function COBRANZA_PAGOS_Hash_(value) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(value),
    Utilities.Charset.UTF_8
  );

  return digest.map(function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
}

function COBRANZA_PAGOS_FilaVacia_(row) {
  for (let i = 0; i < row.length; i += 1) {
    const value = row[i];
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return false;
    }
  }
  return true;
}

function COBRANZA_PAGOS_Recortar_(text, maxLength) {
  const value = String(text == null ? '' : text);
  return value.length > maxLength
    ? value.slice(0, maxLength) + '...'
    : value;
}

function COBRANZA_PAGOS_Log(message) {
  console.log('[COBRANZA_PAGOS] ' + message);
}

/**
 * Diagnostico de solo lectura.
 */
function COBRANZA_PAGOS_Diagnostico() {
  const lectura = COBRANZA_PAGOS_LeerOrigen_();
  COBRANZA_PAGOS_ValidarIdsUnicos_(lectura.registros);

  const ids = lectura.registros.map(function(record) { return record.id_pago; });
  const salida = {
    version: COBRANZA_PAGOS_CONFIG.VERSION,
    spreadsheetId: COBRANZA_PAGOS_CONFIG.SPREADSHEET_ID,
    hoja: lectura.hoja,
    endpoint: COBRANZA_PAGOS_CONFIG.API_ENDPOINT,
    integrationId: COBRANZA_PAGOS_CONFIG.INTEGRATION_ID,
    secretProperty: COBRANZA_PAGOS_CONFIG.INTEGRATION_SECRET_PROPERTY,
    registrosValidos: lectura.registros.length,
    idPagoMin: ids.length ? Math.min.apply(null, ids) : null,
    idPagoMax: ids.length ? Math.max.apply(null, ids) : null,
    idsUnicos: new Set(ids).size,
    hash: COBRANZA_PAGOS_Hash_(COBRANZA_PAGOS_RegistrosSinMeta_(lectura.registros))
  };

  console.log(JSON.stringify(salida, null, 2));
  return salida;
}

/**
 * Limpia solo checkpoint V002. No modifica Sheets ni Aiven.
 */
function COBRANZA_PAGOS_ReiniciarCheckpoint() {
  PropertiesService
    .getScriptProperties()
    .deleteProperty(COBRANZA_PAGOS_CONFIG.CHECKPOINT_PROPERTY);

  COBRANZA_PAGOS_Log('Checkpoint V002 eliminado.');
}

/**
 * Compatibilidad de diagnostico: ahora la unica llave aprobada es id_pago.
 */
function COBRANZA_PAGOS_DiagnosticoClaves() {
  const lectura = COBRANZA_PAGOS_LeerOrigen_();
  const seen = Object.create(null);
  const duplicados = [];

  lectura.registros.forEach(function(record) {
    const key = String(record.id_pago);
    if (seen[key] !== undefined) {
      duplicados.push({
        id_pago: record.id_pago,
        fila1: seen[key],
        fila2: record.__source_row
      });
    } else {
      seen[key] = record.__source_row;
    }
  });

  const salida = {
    hoja: lectura.hoja,
    llave_upsert: 'id_pago',
    registros: lectura.registros.length,
    ids_unicos: Object.keys(seen).length,
    ids_duplicados: duplicados.length,
    muestra_duplicados: duplicados.slice(0, 20)
  };

  console.log(JSON.stringify(salida, null, 2));
  return salida;
}
