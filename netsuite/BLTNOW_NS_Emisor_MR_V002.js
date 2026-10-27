/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * BLT NOW / NS Integration - Emisor NetSuite V002 (PORTAFOLIO EXPERIMENTAL)
 *
 * Flujo unilateral: NetSuite -> Azure -> Aiven MySQL.
 * Solo CONSULTA una busqueda guardada de NetSuite; nunca escribe en NetSuite.
 *
 * IMPORTANTE:
 *   - Requiere F9A en Azure; los POST fallan cerrado si la escritura esta pausada.
 *   - Este script NO envia solicitudes salvo que custscript_blt_ns_habilitar_envio
 *     sea true y exista una URL valida.
 *   - NO habilitar envio hasta verificar DDL en Aiven y permisos del receptor.
 *   - Configurar concurrencia 1 en el deployment de MapReduce; envios sin borrar.
 *   - El secreto custsecretbltnow_ns_hmac debe existir en NetSuite y estar
 *     restringido a este script y al dominio del receptor.
 *
 * Parametros de script por deployment (crear al registrar el script):
 *   custscript_blt_ns_busqueda             texto: ID de Saved Search
 *   custscript_blt_ns_dataset             texto: dataset canonico (p.ej. PRUEBA)
 *   custscript_blt_ns_azure_base          texto: https://HOST, sin ruta final
 *   custscript_blt_ns_habilitar_envio     casilla: por defecto desmarcada
 *
 * Contrato API V1 implementado en F9A (solo PORTAFOLIO):
 *   POST /api/integraciones/netsuite/v1/lotes
 *   POST /api/integraciones/netsuite/v1/lotes/:loteId/paginas
 *   POST /api/integraciones/netsuite/v1/lotes/:loteId/finalizar
 *
 * Firma HMAC-SHA256 identica al middleware M2M existente de BLT NOW:
 *   timestamp + "\\n" + "POST" + "\\n" + req.originalUrl + "\\n" + rawJSON
 */

define([
  'N/search',
  'N/runtime',
  'N/https',
  'N/crypto',
  'N/encode',
  'N/crypto/random'
], (search, runtime, https, crypto, encode, random) => {
  'use strict';

  const INTEGRATION_ID = 'netsuite-bltnow';
  const API_PREFIX = '/api/integraciones/netsuite/v1';
  const SECRET_ID = 'custsecretbltnow_ns_hmac'; // Confirmar ID real al guardar secreto.
  const PAGE_SIZE = 300;
  const MAX_ROWS = 10000; // Evita saturacion de memoria del receptor F9A.
  const MAX_PAGES = 200;      // Seguridad inicial: hasta 60 000 filas/ejecucion.
  const MAX_PAGE_CHARS = 1000000; // Tope conservador antes del limite del receptor.
  const PARAMETERS = Object.freeze({
    searchId: 'custscript_blt_ns_busqueda',
    dataset: 'custscript_blt_ns_dataset',
    azureBase: 'custscript_blt_ns_azure_base',
    sendEnabled: 'custscript_blt_ns_habilitar_envio'
  });

  function fail(code, detail) {
    return new Error(`BLTNOW_NS_${code}${detail ? ': ' + detail : ''}`);
  }

  function parameter(name) {
    return runtime.getCurrentScript().getParameter({ name });
  }

  function config() {
    const searchId = String(parameter(PARAMETERS.searchId) || '').trim();
    const dataset = String(parameter(PARAMETERS.dataset) || '').trim().toUpperCase();
    const sendRaw = parameter(PARAMETERS.sendEnabled);
    const sendEnabled = sendRaw === true || String(sendRaw).toUpperCase() === 'T';
    const azureBase = String(parameter(PARAMETERS.azureBase) || '').trim().replace(/\/+$/, '');

    if (!searchId) throw fail('BUSQUEDA_NO_CONFIGURADA');
    if (dataset !== 'PORTAFOLIO') throw fail('SOLO_PORTAFOLIO', 'Dataset obligatorio: PORTAFOLIO');
    if (!/^[A-Z][A-Z0-9_-]{1,59}$/.test(dataset)) {
      throw fail('DATASET_INVALIDO', 'Usa letras mayusculas, numeros, guion o guion bajo.');
    }
    if (sendEnabled && !/^https:\/\/[a-z0-9][a-z0-9.-]*(?::443)?$/i.test(azureBase)) {
      throw fail('AZURE_URL_INVALIDA', 'Se requiere URL HTTPS base sin path, query ni fragment.');
    }

    return { searchId, dataset, azureBase, sendEnabled };
  }

  function sha256(value) {
    const hash = crypto.createHash({ algorithm: crypto.HashAlg.SHA256 });
    hash.update({ input: String(value), inputEncoding: encode.Encoding.UTF_8 });
    return hash.digest({ outputEncoding: encode.Encoding.HEX }).toLowerCase();
  }

  function sign(timestamp, path, rawBody) {
    // El secreto nunca se convierte en texto ni se registra en logs.
    const key = crypto.createSecretKey({ secret: SECRET_ID, encoding: encode.Encoding.UTF_8 });
    const hmac = crypto.createHmac({ algorithm: crypto.HashAlg.SHA256, key });
    const canonical = `${timestamp}\nPOST\n${path}\n${rawBody}`;
    hmac.update({ input: canonical, inputEncoding: encode.Encoding.UTF_8 });
    return hmac.digest({ outputEncoding: encode.Encoding.HEX }).toLowerCase();
  }

  function requestJson(cfg, relativePath, payload) {
    if (!cfg.sendEnabled) throw fail('ENVIO_DESHABILITADO');
    const path = `${API_PREFIX}${relativePath}`;
    const rawBody = JSON.stringify(payload);
    if (rawBody.length > MAX_PAGE_CHARS) throw fail('BODY_MUY_GRANDE');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const response = https.post({
      url: `${cfg.azureBase}${path}`,
      body: rawBody,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Integration-Id': INTEGRATION_ID,
        'X-Integration-Timestamp': timestamp,
        'X-Integration-Signature': sign(timestamp, path, rawBody)
      }
    });

    const status = Number(response && response.code);
    if (status < 200 || status >= 300) {
      // No registrar cuerpo completo: podria contener datos de negocio.
      throw fail('HTTP_FALLIDO', `HTTP ${Number.isFinite(status) ? status : 'desconocido'}`);
    }

    let parsed;
    try { parsed = JSON.parse(String(response.body || '')); }
    catch (_) { throw fail('RESPUESTA_INVALIDA', 'Se esperaba JSON'); }
    if (!parsed || parsed.ok !== true) throw fail('CONFIRMACION_NEGATIVA');
    return parsed;
  }

  function requiredSortedSearch(searchObj) {
    // runPaged requiere orden unico/estable para no duplicar u omitir filas.
    // La unicidad efectiva debe evaluarse al seleccionar la busqueda.
    const hasStableSort = (searchObj.columns || []).some(c =>
      keyOf(c) === 'formulatext|' && !!c.sort);
    if (!hasStableSort) {
      throw fail('BUSQUEDA_SIN_ORDEN_UNICO',
        'Ordena la columna formulatext (numero_equipo), que debe ser unica.');
    }
    return searchObj;
  }


  // Mapeo cerrado, 53 campos conocidos; un ajuste a Saved Search requiere nueva revision.
  const APPROVED_FIELDS = new Set([
    "entityid|",
    "formulatext|",
    "companyname|",
    "custentity_blt_proyecto_padre|",
    "customer|",
    "subsidiarynohierarchy|",
    "custentity_blt_region|",
    "custentity_blt_estado_proyecto|",
    "custentity_blt_ciudad_proyecto|",
    "custentity_blt_calle_prpyecto|",
    "custentity1|",
    "custentity2|",
    "custentity_blt_categoria_proyecto|",
    "custentity_blt_prioridad_proyecto|",
    "isinactive|",
    "custentity7|",
    "pricelevel|customer",
    "terms|customer",
    "custentity_blt_project_status_service|",
    "custentity_blt_causa_no_servicio|",
    "custentity_blt_project_det_no_serv|",
    "custentity_blt_frec_meses|",
    "custentity_blt_status_cobranza|",
    "custentity_blt_val_unit_precio|",
    "custentity_blt_estado_poliza|",
    "jobbillingtype|",
    "custentity_blt_project_susp_temp|",
    "custentity_blt_proj_causa_susp_temp|",
    "custrecord_blt_numero_contrato_fabricant|custentity_blt_codigo_equipo",
    "custrecord_blt_producto|custentity_blt_codigo_equipo",
    "custrecord_blt_marca|custentity_blt_codigo_equipo",
    "custrecord_blt_modelo|custentity_blt_codigo_equipo",
    "custrecord_blt_paradas|custentity_blt_codigo_equipo",
    "custrecord_blt_pisos|custentity_blt_codigo_equipo",
    "custrecord_blt_velocidad|custentity_blt_codigo_equipo",
    "custrecord_blt_capacidad|custentity_blt_codigo_equipo",
    "custrecord_blt_desnivel|custentity_blt_codigo_equipo",
    "custrecord_blt_longitud|custentity_blt_codigo_equipo",
    "custrecord_blt_ancho_peldano|custentity_blt_codigo_equipo",
    "custrecord_blt_inclinacion|custentity_blt_codigo_equipo",
    "custrecord_blt_tiempo_mp|custentity_blt_codigo_equipo",
    "custrecord_blt_no_gratuitos|custentity_blt_codigo_equipo",
    "custrecord_blt_no_garantia|custentity_blt_codigo_equipo",
    "custrecord_blt_fecha_instalacion|custentity_blt_codigo_equipo",
    "custrecord_blt_fecha_entrega|custentity_blt_codigo_equipo",
    "custrecord_blt_termino_garantia|custentity_blt_codigo_equipo",
    "custrecord_blt_fecha_recepcion_mtto|custentity_blt_codigo_equipo",
    "custrecord_blt_mes_inicio_gratuitos|custentity_blt_codigo_equipo",
    "custrecord_blt_mes_termino_gratuitos|custentity_blt_codigo_equipo",
    "custrecord_blt_mes_obj_inicio_cobranza|custentity_blt_codigo_equipo",
    "custentity_blt_fecha_ingreso_portafolio|",
    "custrecord18|custentity1",
    "custrecord_blt_supervisor_zona|custentity1",
  ]);
  // Campos select/lista: se envia etiqueta, NO ID numerico interno de NetSuite.
  const LABEL_FIELDS = new Set([
    "custentity_blt_proyecto_padre|",
    "customer|",
    "subsidiarynohierarchy|",
    "custentity_blt_region|",
    "custentity_blt_estado_proyecto|",
    "custentity_blt_ciudad_proyecto|",
    "custentity1|",
    "custentity2|",
    "custentity_blt_categoria_proyecto|",
    "custentity_blt_prioridad_proyecto|",
    "pricelevel|customer",
    "terms|customer",
    "custentity_blt_project_status_service|",
    "custentity_blt_causa_no_servicio|",
    "custentity_blt_frec_meses|",
    "custentity_blt_status_cobranza|",
    "custentity_blt_estado_poliza|",
    "jobbillingtype|",
    "custentity_blt_proj_causa_susp_temp|",
    "custrecord_blt_producto|custentity_blt_codigo_equipo",
    "custrecord_blt_marca|custentity_blt_codigo_equipo",
    "custrecord_blt_modelo|custentity_blt_codigo_equipo",
    "custrecord18|custentity1",
    "custrecord_blt_supervisor_zona|custentity1",
  ]);
  function keyOf(col) {
    return String(col.name || '').toLowerCase() + '|' + String(col.join || '').toLowerCase();
  }
  function checkColumns(columns) {
    const cols = columns || [];
    if (cols.length !== APPROVED_FIELDS.size) throw fail('COLUMNAS_DISTINTAS', 'Se requieren 53 campos.');
    const seen = new Set();
    cols.forEach(col => {
      const key = keyOf(col);
      if (!APPROVED_FIELDS.has(key) || seen.has(key)) throw fail('CAMBIO_BUSQUEDA', key);
      seen.add(key);
    });
  }
  function safeValue(result, col) {
    const value = result.getValue(col);
    if (value === undefined || value === null || value === '') return null;
    if (!LABEL_FIELDS.has(keyOf(col))) return value;
    // Un getValue() numerico de un campo select no representa el texto comercial.
    let label;
    try { label = result.getText(col); }
    catch (_) { throw fail('GETTEXT_REQUERIDO', keyOf(col)); }
    if (typeof label === 'string' && label.trim()) return label.trim();
    // Algunos campos ya son texto directo; nunca aceptar el ID numerico como etiqueta.
    if (typeof value === 'string' && value.trim() && !/^\d+$/.test(value.trim())) return value.trim();
    throw fail('ETIQUETA_NO_RESUELTA', keyOf(col));
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

  function extractRows(page, columns, startIndex) {
    checkColumns(columns);
    return page.data.map((result, index) => ({
      posicion: startIndex + index + 1,
      idOrigen: result.id == null ? null : String(result.id),
      tipoOrigen: result.recordType == null ? null : String(result.recordType),
      valores: columns.map(column => safeValue(result, column))
    }));
  }

  function getInputData() {
    const cfg = config();
    const loaded = requiredSortedSearch(search.load({ id: cfg.searchId }));
    const paged = loaded.runPaged({ pageSize: PAGE_SIZE });
    const count = Number(paged.count || 0);
    const pageCount = paged.pageRanges.length;
    checkColumns(loaded.columns || []);
    if (count > MAX_ROWS) throw fail('MAX_FILAS', 'F9A admite 10000 filas por carga completa.');

    if (pageCount > MAX_PAGES) throw fail('MAX_PAGINAS', `Maximo: ${MAX_PAGES}`);
    if (!count) {
      log.audit({ title: 'NS Integration: sin filas', details: { dataset: cfg.dataset } });
      return [];
    }

    const loteId = random.generateUUID();
    const fechaExtraccionUtc = new Date().toISOString();
    log.audit({
      title: 'NS Integration: preparado',
      details: { dataset: cfg.dataset, loteId, filas: count, paginas: pageCount,
        modo: cfg.sendEnabled ? 'ENVIO' : 'SIMULACION' }
    });

    return paged.pageRanges.map(range => ({
      loteId,
      fechaExtraccionUtc,
      pagina: range.index + 1,
      paginasEsperadas: pageCount,
      filasEsperadas: count,
      busqueda: cfg.searchId,
      dataset: cfg.dataset
    }));
  }

  function map(context) {
    const cfg = config();
    const job = JSON.parse(context.value);
    if (job.busqueda !== cfg.searchId || job.dataset !== cfg.dataset) {
      throw fail('CONFIGURACION_CAMBIADA');
    }

    const loaded = requiredSortedSearch(search.load({ id: job.busqueda }));
    const paged = loaded.runPaged({ pageSize: PAGE_SIZE });
    if (Number(paged.count) !== job.filasEsperadas ||
        paged.pageRanges.length !== job.paginasEsperadas) {
      throw fail('BUSQUEDA_CAMBIO_DURANTE_ENVIO', 'Se cancela para evitar publicar un lote incompleto.');
    }

    const page = paged.fetch({ index: job.pagina - 1 });
    const cols = loaded.columns || [];
    checkColumns(cols);
    const filas = extractRows(page, cols, (job.pagina - 1) * PAGE_SIZE);
    const esperadas = Math.min(PAGE_SIZE, job.filasEsperadas - (job.pagina - 1) * PAGE_SIZE);
    if (filas.length !== esperadas) throw fail('PAGINA_INCOMPLETA');

    const hashPagina = sha256(JSON.stringify(filas));

    if (cfg.sendEnabled) {
      const begin = {
        versionContrato: 1,
        loteId: job.loteId,
        origen: 'NETSUITE',
        dataset: job.dataset,
        modoCarga: 'COMPLETA',
        busquedaGuardada: job.busqueda,
        fechaExtraccionUtc: job.fechaExtraccionUtc,
        filasEsperadas: job.filasEsperadas,
        paginasEsperadas: job.paginasEsperadas,
        tamanoPagina: PAGE_SIZE,
        columnas: columnMetadata(cols)
      };
      const startResponse = requestJson(cfg, '/lotes', begin);
      if (startResponse.loteId && String(startResponse.loteId) !== job.loteId) {
        throw fail('ACK_LOTE_INCORRECTO');
      }

      const uploadResponse = requestJson(cfg,
        `/lotes/${job.loteId}/paginas`, { pagina: job.pagina, filas, hashPagina });
      if (uploadResponse.loteId && String(uploadResponse.loteId) !== job.loteId) {
        throw fail('ACK_PAGINA_LOTE_INCORRECTO');
      }
      if (uploadResponse.pagina != null && Number(uploadResponse.pagina) !== job.pagina) {
        throw fail('ACK_PAGINA_INCORRECTO');
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

  function summarize(summary) {
    const cfg = config();
    let errors = 0;
    if (summary.inputSummary.error) {
      errors++;
      log.error({ title: 'NS Integration: error de lectura', details: 'La etapa de origen fallo.' });
    }
    summary.mapSummary.errors.iterator().each((key) => {
      errors++;
      log.error({ title: 'NS Integration: pagina fallida', details: String(key).slice(0, 80) });
      return true;
    });
    if (errors) {
      log.error({ title: 'NS Integration: lote NO publicado', details: { errores: errors } });
      return;
    }

    const byPage = new Map();
    let loteId = '';
    let paginasEsperadas = 0;
    let filasEsperadas = 0;
    let total = 0;
    let incompatible = false;

    summary.output.iterator().each((key, value) => {
      const row = JSON.parse(value);
      if (loteId && loteId !== row.loteId) incompatible = true;
      if (paginasEsperadas && paginasEsperadas !== row.paginasEsperadas) incompatible = true;
      if (filasEsperadas && filasEsperadas !== row.filasEsperadas) incompatible = true;
      if (row.enviado !== cfg.sendEnabled || row.dataset !== cfg.dataset) incompatible = true;
      loteId = row.loteId;
      paginasEsperadas = row.paginasEsperadas;
      filasEsperadas = row.filasEsperadas;
      if (String(row.pagina) !== String(key)) incompatible = true;
      if (byPage.has(row.pagina)) incompatible = true;
      byPage.set(row.pagina, row.hashPagina);
      total += row.filasRecibidas;
      return true;
    });

    if (!loteId) {
      log.audit({ title: 'NS Integration: no hay paginas', details: { dataset: cfg.dataset } });
      return;
    }
    if (incompatible || byPage.size !== paginasEsperadas || total !== filasEsperadas) {
      log.error({ title: 'NS Integration: manifiesto invalido', details: {
        loteId, paginasEsperadas, paginasConfirmadas: byPage.size, filasEsperadas, filasProcesadas: total
      } });
      return;
    }

    const hashes = [];
    for (let page = 1; page <= paginasEsperadas; page++) {
      if (!byPage.has(page)) {
        log.error({ title: 'NS Integration: pagina ausente', details: { loteId, pagina: page } });
        return;
      }
      hashes.push(byPage.get(page));
    }
    const hashCarga = sha256(hashes.join('\n'));

    if (!cfg.sendEnabled) {
      log.audit({ title: 'NS Integration: simulacion completa, SIN envio',
        details: { dataset: cfg.dataset, loteId, filas: total, paginas: paginasEsperadas, hashCarga } });
      return;
    }

    const response = requestJson(cfg, `/lotes/${loteId}/finalizar`, {
      loteId,
      hashCarga,
      filasEsperadas,
      paginasEsperadas
    });
    if (response.loteId && String(response.loteId) !== loteId) {
      throw fail('ACK_FINAL_LOTE_INCORRECTO');
    }
    if (String(response.estado || '').toUpperCase() !== 'PUBLICADO') {
      throw fail('ACK_NO_PUBLICADO', 'El servidor no confirmo publicacion.');
    }
    log.audit({ title: 'NS Integration: lote publicado',
      details: { loteId, dataset: cfg.dataset, filas: total, paginas: paginasEsperadas } });
  }

  return { getInputData, map, summarize };
});
