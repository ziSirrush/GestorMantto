/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * BLT NOW - EMISOR UNIVERSAL NS V003 (FIX recuperacion V003.1)
 * Unica responsabilidad: obtener datos de una fuente compatible y transmitir
 * un lote validado por HTTPS/HMAC a Azure. Sin filtros ni campos de negocio.
 * No ejecuta el entry point execute() de otro script; invoca su API de fuente.
 * No carga ni guarda Saved Searches. No modifica registros de NetSuite.
 * El lote se inicia UNA vez en getInputData; cada MAP envia solo su pagina.
 * Summarize cancela lotes fallidos con HMAC, sin eliminar datos en Aiven.
 *
 * Parametros EXISTENTES (sin renombrarlos):
 *   custscript_blt_ns_busqueda          = scriptId de una fuente ScheduledScript
 *   custscript_blt_ns_dataset          = dataset canonico (texto)
 *   custscript_blt_ns_azure_base       = URL https base de Azure
 *   custscript_blt_ns_habilitar_envio  = casilla: FALSE hasta preflight
 *
 * Contrato de un script fuente registrado:
 *   function execute() {}              // unico entry point (NO se llama)
 *   execute.dataset = '...';
 *   execute.createSearch = function () { ... }; // N/search.Search sin save()
 *   execute.serializeRow = function (result, columns) { return [...]; };
 *   return { execute: execute };        // respeta validacion de ScheduledScript
 * El emisor resuelve scriptId -> Script File -> modulo AMD mediante require().
 * El archivo del origen debe residir en el File Cabinet de NetSuite.
 *
 * El receptor Azure decide que datasets se pueden persistir. Un dataset
 * autorizado en NS NO implica que Azure/Aiven permitan su escritura.
 */
define([
  'N/search',
  'N/file',
  'require',
  'N/runtime',
  'N/https',
  'N/crypto',
  'N/encode',
  'N/crypto/random'
], (search, file, loadDependency, runtime, https, crypto, encode, random) => {
  'use strict';

  const INTEGRATION_ID = 'netsuite-bltnow';
  const API_PREFIX = '/api/integraciones/netsuite/v1';
  const SECRET_ID = 'custsecretbltnow_ns_hmac';
  const PAGE_SIZE = 300;
  const MAX_ROWS = 10000; // Limite real del receptor actual.
  const MAX_PAGES = 200;
  const MAX_COLS = 160;
  const MAX_POST_CHARS = 1000000;
  const PARAMS = Object.freeze({
    origin: 'custscript_blt_ns_busqueda',
    dataset: 'custscript_blt_ns_dataset',
    base: 'custscript_blt_ns_azure_base',
    send: 'custscript_blt_ns_habilitar_envio'
  });

  function fail(code, detail) {
    return new Error('BLTNOW_NS_' + code + (detail ? ': ' + detail : ''));
  }

  function param(id) {
    return runtime.getCurrentScript().getParameter({ name: id });
  }

  function config() {
    const sourceId = String(param(PARAMS.origin) || '').trim();
    const dataset = String(param(PARAMS.dataset) || '').trim().toUpperCase();
    const azureBase = String(param(PARAMS.base) || '').trim().replace(/\/+$/, '');
    const rawSend = param(PARAMS.send);
    const sendEnabled = rawSend === true || String(rawSend).toUpperCase() === 'T';

    if (!/^customscript_[a-z0-9_]+$/i.test(sourceId)) {
      throw fail('ID_FUENTE_INVALIDO', 'BUSQUEDA debe contener un scriptId customscript_...');
    }
    if (!/^[A-Z][A-Z0-9_-]{1,59}$/.test(dataset)) {
      throw fail('DATASET_INVALIDO');
    }
    if (sendEnabled && !/^https:\/\/[a-z0-9][a-z0-9.-]*(?::443)?$/i.test(azureBase)) {
      throw fail('AZURE_URL_INVALIDA', 'URL base HTTPS sin ruta, query ni fragmento');
    }
    return { sourceId, dataset, azureBase, sendEnabled };
  }

  function sha256(value) {
    const hash = crypto.createHash({ algorithm: crypto.HashAlg.SHA256 });
    hash.update({ input: String(value), inputEncoding: encode.Encoding.UTF_8 });
    return hash.digest({ outputEncoding: encode.Encoding.HEX }).toLowerCase();
  }

  function signature(timestamp, path, rawBody) {
    const key = crypto.createSecretKey({ secret: SECRET_ID, encoding: encode.Encoding.UTF_8 });
    const hmac = crypto.createHmac({ algorithm: crypto.HashAlg.SHA256, key });
    hmac.update({
      input: timestamp + '\nPOST\n' + path + '\n' + rawBody,
      inputEncoding: encode.Encoding.UTF_8
    });
    return hmac.digest({ outputEncoding: encode.Encoding.HEX }).toLowerCase();
  }

  function errorDetail(raw) {
    let e = raw;
    if (typeof raw === 'string') {
      try { e = JSON.parse(raw); } catch (_) { e = { message: raw }; }
    }
    const name = String(e && (e.name || e.type) || 'ERROR').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80);
    const message = String(e && e.message || 'Sin detalle de error')
      .replace(/[\r\n\t]+/g, ' ').slice(0, 360);
    return { name, message };
  }

  // Nunca registra cuerpos HTTP, firmas ni secretos. Solo codigo de error API.
  function apiErrorCode(response) {
    try {
      const body = JSON.parse(String(response && response.body || ''));
      const code = String(body && body.code || '');
      return /^[A-Z][A-Z0-9_]{2,79}$/.test(code) ? ' ' + code : '';
    } catch (_) { return ''; }
  }

  function requestJson(cfg, relative, data) {
    if (!cfg.sendEnabled) throw fail('ENVIO_DESHABILITADO');
    const path = API_PREFIX + relative;
    const rawBody = JSON.stringify(data);
    if (rawBody.length > MAX_POST_CHARS) throw fail('BODY_MUY_GRANDE');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const response = https.post({
      url: cfg.azureBase + path,
      body: rawBody,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Integration-Id': INTEGRATION_ID,
        'X-Integration-Timestamp': timestamp,
        'X-Integration-Signature': signature(timestamp, path, rawBody)
      }
    });
    const code = Number(response && response.code);
    if (!Number.isFinite(code) || code < 200 || code >= 300) {
      const endpoint = String(relative).split('/').pop();
      const error = fail('HTTP_FALLIDO', 'HTTP ' + (Number.isFinite(code) ? code : 'desconocido') +
        apiErrorCode(response) + ' endpoint=' + endpoint);
      error.httpStatus = code;
      throw error;
    }
    let parsed;
    try { parsed = JSON.parse(String(response.body || '')); }
    catch (_) { throw fail('RESPUESTA_INVALIDA', 'Se esperaba JSON'); }
    if (!parsed || parsed.ok !== true) throw fail('CONFIRMACION_NEGATIVA');
    return parsed;
  }

  function resolveSourcePath(scriptId) {
    // Se busca el REGISTRO de script, no una Saved Search.
    const lookup = search.create({
      type: search.Type.SCHEDULED_SCRIPT,
      filters: [['scriptid', 'is', scriptId], 'AND', ['isinactive', 'is', 'F']],
      columns: ['scriptid', 'scriptfile']
    });
    const records = lookup.run().getRange({ start: 0, end: 2 }) || [];
    if (records.length !== 1) {
      throw fail('FUENTE_NO_UNICA', 'No existe un ScheduledScript activo con ese ID, o es ambiguo');
    }
    const actualId = String(records[0].getValue({ name: 'scriptid' }) || '').trim();
    if (actualId.toLowerCase() !== scriptId.toLowerCase()) throw fail('FUENTE_ID_DIFERENTE');
    const fileId = records[0].getValue({ name: 'scriptfile' });
    if (!fileId) throw fail('FUENTE_SIN_ARCHIVO');
    const scriptFile = file.load({ id: fileId });
    const path = String(scriptFile.path || '').replace(/^\/+/, '');
    if (!/^SuiteScripts\/[\s\S]+\.js$/i.test(path) || path.includes('..') || path.includes('\\')) {
      throw fail('RUTA_FUENTE_INVALIDA', 'Debe ser un .js dentro de SuiteScripts');
    }
    return '/' + path;
  }

  function sourceFor(cfg) {
    const path = resolveSourcePath(cfg.sourceId);
    let moduleExports;
    let loaded = false;
    // require() en SuiteScript servidor es sincronico (AMD documentado).
    loadDependency([path], function (mod) {
      moduleExports = mod;
      loaded = true;
    });
    if (!loaded || !moduleExports || typeof moduleExports.execute !== 'function') {
      throw fail('MODULO_FUENTE_NO_CARGADO');
    }
    // Solo se expone execute como entry point. El contrato del emisor son
    // propiedades de esa funcion; N/task ni execute() se invocan.
    const provider = moduleExports.execute;
    if (typeof provider.createSearch !== 'function' ||
        typeof provider.serializeRow !== 'function') {
      throw fail('FUENTE_CONTRATO_INCOMPATIBLE', 'Faltan createSearch() y serializeRow()');
    }
    if (String(provider.dataset || '').toUpperCase() !== cfg.dataset) {
      throw fail('FUENTE_DATASET_DIFERENTE');
    }
    return provider;
  }

  function createSearch(source) {
    // Los filtros, joins, formulas, etiquetas y serializacion son del origen.
    const query = source.createSearch();
    if (!query || !Array.isArray(query.columns) ||
        query.columns.length < 1 || query.columns.length > MAX_COLS ||
        typeof query.runPaged !== 'function') {
      throw fail('FUENTE_CONSULTA_INVALIDA');
    }
    if (!query.columns.some(c => c && c.sort)) {
      throw fail('FUENTE_SIN_ORDEN', 'Usar una columna de orden estable/unico');
    }
    return query;
  }

  function columnMetadata(columns) {
    return columns.map((c, i) => ({
      indice: i,
      nombre: String(c.name || ''),
      join: c.join ? String(c.join) : null,
      summary: c.summary ? String(c.summary) : null,
      label: c.label ? String(c.label) : null
    }));
  }

  function validValue(v) {
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return true;
    if (typeof v === 'number') return Number.isFinite(v);
    if (Array.isArray(v) && v.length <= 100) {
      return v.every(item => item === null || typeof item === 'boolean' ||
        typeof item === 'string' || (typeof item === 'number' && Number.isFinite(item)));
    }
    return false;
  }

  function extractRows(page, query, source, startIndex) {
    return page.data.map((result, index) => {
      const valores = source.serializeRow(result, query.columns);
      if (!Array.isArray(valores) || valores.length !== query.columns.length ||
          !valores.every(validValue)) {
        throw fail('FUENTE_VALORES_INVALIDOS', 'La fuente debe devolver una lista de valores por columna');
      }
      return {
        posicion: startIndex + index + 1,
        idOrigen: result.id == null ? null : String(result.id),
        tipoOrigen: result.recordType == null ? null : String(result.recordType),
        valores
      };
    });
  }

  function getInputData() {
    const cfg = config();
    const source = sourceFor(cfg);
    const query = createSearch(source);
    const paged = query.runPaged({ pageSize: PAGE_SIZE });
    const count = Number(paged.count || 0);
    const pages = paged.pageRanges.length;
    if (!Number.isSafeInteger(count) || count < 0 || count > MAX_ROWS) {
      throw fail('FILAS_FUERA_DE_LIMITE', 'Maximo actual: 10000');
    }
    if (pages !== Math.ceil(count / PAGE_SIZE) || pages > MAX_PAGES) {
      throw fail('PAGINACION_INVALIDA');
    }
    if (!count) {
      log.audit({ title: 'NS universal: fuente sin registros', details: { dataset: cfg.dataset } });
      return [];
    }

    const loteId = random.generateUUID();
    const metadata = columnMetadata(query.columns);
    const hashSchema = sha256(JSON.stringify(metadata));
    const now = new Date().toISOString();
    log.audit({
      title: 'NS universal: lote preparado',
      details: { loteId, dataset: cfg.dataset, sourceId: cfg.sourceId, filas: count,
        paginas: pages, modo: cfg.sendEnabled ? 'ENVIO' : 'SIMULACION' }
    });

    // Inicio UNICO por ejecucion, antes de distribuir las paginas a Map.
    // Evita 13 POST /lotes simultaneos para Portafolio (y otros datasets).
    if (cfg.sendEnabled) {
      const begin = {
        versionContrato: 1,
        loteId,
        origen: 'NETSUITE',
        dataset: cfg.dataset,
        modoCarga: 'COMPLETA',
        busquedaGuardada: cfg.sourceId, // Campo legado del contrato Azure.
        fechaExtraccionUtc: now,
        filasEsperadas: count,
        paginasEsperadas: pages,
        tamanoPagina: PAGE_SIZE,
        columnas: metadata
      };
      try {
        const startAck = requestJson(cfg, '/lotes', begin);
        if (startAck.loteId && String(startAck.loteId) !== loteId) {
          throw fail('ACK_LOTE_INCORRECTO');
        }
        log.audit({title:'NS universal: lote iniciado en Azure',
          details:{loteId,dataset:cfg.dataset,paginas:pages,filas:count}});
      } catch (error) {
        log.error({title:'NS universal: inicio rechazado por Azure',
          details:{loteId,error:errorDetail(error)}});
        // Los HTTP 4xx/5xx ya confirman rechazo, no volver a solicitar otra
        // operacion. Solo ante respuesta ambigua/transporte/ACK fallido intentar
        // liberar ESTE lote, porque Azure podria haber reservado staging.
        if (!Number.isFinite(error && error.httpStatus)) {
          try {
            requestJson(cfg, '/lotes/' + loteId + '/abortar', {loteId});
          } catch (abortError) {
            log.error({title:'NS universal: cancelacion de inicio no confirmada',
              details:{loteId,error:errorDetail(abortError)}});
          }
        }
        throw error;
      }
    }

    // Registro de control para que Summarize conozca el lote aunque
    // TODAS las paginas fallen y no exista ninguna pagina confirmada.
    const control = {control:true,loteId,dataset:cfg.dataset,sourceId:cfg.sourceId,
      filasEsperadas:count,paginasEsperadas:pages};
    const jobs = paged.pageRanges.map(range => ({
      loteId,
      dataset: cfg.dataset,
      sourceId: cfg.sourceId,
      fechaExtraccionUtc: now,
      filasEsperadas: count,
      paginasEsperadas: pages,
      pagina: range.index + 1,
      hashSchema
    }));
    return [control].concat(jobs);
  }

  function map(context) {
    const cfg = config();
    const job = JSON.parse(context.value);
    if (job.dataset !== cfg.dataset || job.sourceId !== cfg.sourceId) {
      throw fail('CONFIGURACION_CAMBIADA');
    }
    if (job.control === true) {
      context.write({key:'__BLTNOW_LOTE__',value:JSON.stringify(job)});
      return;
    }
    const source = sourceFor(cfg);
    const query = createSearch(source);
    const metadata = columnMetadata(query.columns);
    if (sha256(JSON.stringify(metadata)) !== job.hashSchema) {
      throw fail('COLUMNAS_CAMBIARON_DURANTE_LOTE');
    }
    const paged = query.runPaged({ pageSize: PAGE_SIZE });
    if (Number(paged.count) !== job.filasEsperadas ||
        paged.pageRanges.length !== job.paginasEsperadas) {
      throw fail('ORIGEN_CAMBIO_DURANTE_LOTE');
    }
    const page = paged.fetch({ index: job.pagina - 1 });
    const filas = extractRows(page, query, source, (job.pagina - 1) * PAGE_SIZE);
    const expected = Math.min(PAGE_SIZE, job.filasEsperadas - (job.pagina - 1) * PAGE_SIZE);
    if (filas.length !== expected) throw fail('PAGINA_INCOMPLETA');
    const hashPagina = sha256(JSON.stringify(filas));

    if (cfg.sendEnabled) {
      // El lote ya se inicio UNA vez en getInputData.
      const pageAck = requestJson(cfg, '/lotes/' + job.loteId + '/paginas', {
        pagina: job.pagina, filas, hashPagina
      });
      if (pageAck.loteId && String(pageAck.loteId) !== job.loteId) {
        throw fail('ACK_PAGINA_LOTE_INCORRECTO');
      }
      if (pageAck.pagina != null && Number(pageAck.pagina) !== job.pagina) {
        throw fail('ACK_PAGINA_INCORRECTA');
      }
    }
    context.write({
      key: String(job.pagina),
      value: JSON.stringify({
        loteId: job.loteId,
        dataset: job.dataset,
        pagina: job.pagina,
        paginasEsperadas: job.paginasEsperadas,
        filasEsperadas: job.filasEsperadas,
        filasRecibidas: filas.length,
        hashPagina,
        enviado: cfg.sendEnabled
      })
    });
  }

  function abortLot(cfg, loteId) {
    if (!cfg.sendEnabled || !loteId) return;
    try {
      const ack = requestJson(cfg, '/lotes/' + loteId + '/abortar', {loteId});
      const estado = String(ack.estado || 'SIN_ESTADO');
      if (estado === 'PUBLICADO') {
        log.error({title:'NS universal: Azure indica PUBLICADO; comprobar Aiven',
          details:{loteId,estado}});
      } else {
        log.audit({title:'NS universal: lote abortado en Azure',details:{loteId,estado}});
      }
    } catch (error) {
      log.error({title:'NS universal: cancelacion no confirmada',
        details:{loteId,error:errorDetail(error)}});
    }
  }

  function summarize(summary) {
    const cfg = config();
    let errors = 0;
    if (summary.inputSummary.error) {
      errors++;
      log.error({title:'NS universal: error en getInputData',
        details:errorDetail(summary.inputSummary.error)});
    }
    summary.mapSummary.errors.iterator().each((key, error, executionNo) => {
      errors++;
      log.error({title:'NS universal: pagina fallida',
        details:{pagina:String(key).slice(0,32),ejecucion:executionNo || null,
          error:errorDetail(error)}});
      return true;
    });

    const pageHashes = new Map();
    let loteId = '';
    let dataset = '';
    let expectedRows = 0;
    let expectedPages = 0;
    let total = 0;
    let bad = false;
    let controlFound = false;
    summary.output.iterator().each((key, value) => {
      let record;
      try { record = JSON.parse(value); }
      catch (_) { bad=true; return true; }
      if (record.control === true) {
        if (controlFound || key !== '__BLTNOW_LOTE__') bad=true;
        controlFound=true;
        if (loteId && loteId !== record.loteId) bad=true;
        if (dataset && dataset !== record.dataset) bad=true;
        if (expectedRows && expectedRows !== record.filasEsperadas) bad=true;
        if (expectedPages && expectedPages !== record.paginasEsperadas) bad=true;
        loteId=record.loteId;
        dataset=record.dataset;
        expectedRows=record.filasEsperadas;
        expectedPages=record.paginasEsperadas;
        return true;
      }
      if (loteId && loteId !== record.loteId) bad=true;
      if (dataset && dataset !== record.dataset) bad=true;
      if (expectedRows && expectedRows !== record.filasEsperadas) bad=true;
      if (expectedPages && expectedPages !== record.paginasEsperadas) bad=true;
      if (record.enviado !== cfg.sendEnabled || record.dataset !== cfg.dataset) bad=true;
      if (String(record.pagina) !== String(key) || pageHashes.has(record.pagina)) bad=true;
      loteId = record.loteId;
      dataset = record.dataset;
      expectedRows = record.filasEsperadas;
      expectedPages = record.paginasEsperadas;
      pageHashes.set(record.pagina, record.hashPagina);
      total += record.filasRecibidas;
      return true;
    });

    if (errors) {
      log.error({title:'NS universal: lote no publicado',
        details:{loteId:loteId || null,errores:errors}});
      abortLot(cfg,loteId);
      return;
    }
    if (!loteId) {
      log.audit({title:'NS universal: sin paginas',details:{dataset:cfg.dataset}});
      return;
    }
    if (!controlFound || bad || dataset !== cfg.dataset ||
        pageHashes.size !== expectedPages || total !== expectedRows) {
      log.error({title:'NS universal: manifiesto invalido',
        details:{loteId,control:controlFound,paginas:pageHashes.size,
          esperadas:expectedPages,filas:total,filasEsperadas:expectedRows}});
      abortLot(cfg,loteId);
      return;
    }
    const hashes = [];
    for (let pageNumber = 1; pageNumber <= expectedPages; pageNumber++) {
      if (!pageHashes.has(pageNumber)) {
        log.error({title:'NS universal: pagina faltante',details:{loteId,pagina:pageNumber}});
        abortLot(cfg,loteId);
        return;
      }
      hashes.push(pageHashes.get(pageNumber));
    }
    const hashCarga = sha256(hashes.join('\n'));
    if (!cfg.sendEnabled) {
      log.audit({title:'NS universal: simulacion sin envio',
        details:{loteId,dataset,paginas:expectedPages,filas:total,hashCarga}});
      return;
    }
    try {
      const finalAck = requestJson(cfg, '/lotes/' + loteId + '/finalizar', {
        loteId, hashCarga, filasEsperadas: expectedRows, paginasEsperadas: expectedPages
      });
      if (finalAck.loteId && String(finalAck.loteId) !== loteId) {
        throw fail('ACK_LOTE_FINAL_INCORRECTO');
      }
      if (String(finalAck.estado || '').toUpperCase() !== 'PUBLICADO') {
        throw fail('ACK_NO_PUBLICADO');
      }
      log.audit({title:'NS universal: lote publicado',
        details:{loteId,dataset,paginas:expectedPages,filas:total}});
    } catch (error) {
      log.error({title:'NS universal: finalizacion fallida',
        details:{loteId,error:errorDetail(error)}});
      abortLot(cfg,loteId);
      throw error;
    }
  }

  return { getInputData, map, summarize };
});
