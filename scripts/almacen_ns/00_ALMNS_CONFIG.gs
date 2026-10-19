// [Aster | 2026-10-19 | ASTER-MG | PASO 0 ALMACEN NS CONFIG M2M/HMAC V002]
// [Aster | 2026-10-19 | ASTER-MG | PASO 1 ALMACEN 230 HISTORIAL UPSERT CONFIG V003]
// [Aster | 2026-10-19 | ASTER-MG | PASO 2 ALMACEN 230 RES A SEND CONFIG V004]
// [Aster | 2026-10-19 | ASTER-MG | PASO 3 ALMACEN 230 SEND A AIVEN CONFIG V005]
// [Aster | 2026-10-19 | ASTER-MG | FIX ALMACEN ID M2M SECRET EXISTENTE CONFIG V006]

/**
 * ============================================================================
 * ALMACEN NETSUITE - CONFIG M2M / HMAC
 * ============================================================================
 *
 * Misma estructura del Config aprobado de Ventas/Cobranza COR:
 *   - URL de Azure + PATH firmado por cada fuente.
 *   - Identidad M2M publica y fija: almacen-appscript.
 *   - Secreto existente: INTEGRATION_ALMACEN_SECRET (SOLO Script Properties).
 *   - Firma: timestamp + "\\n" + metodo + "\\n" + path + "\\n" + payloadTexto.
 *
 * Solo el secreto se lee desde Script Properties. En Azure el receptor
 * utiliza INTEGRATION_ALMACEN_SECRET. No se requiere ninguna variable de ID.
 *
 * Esta configuracion no envia informacion ni modifica Google Sheets.
 */

function ALMNS_ObtenerConfig() {
  var apiHost = 'https://mantto-gestor-api-a4hwfpgvbeb4gmgj.mexicocentral-01.azurewebsites.net';
  var apiPath = '/api/almacen/sync';
  return Object.freeze({
    API_BASE_URL: apiHost,
    API_ALMACEN_SYNC_URL: apiHost + apiPath,
    API_ALMACEN_SYNC_PATH: apiPath,

    API_ALMACEN_CONTRATO_URL: apiHost + apiPath + '/contrato',
    API_ALMACEN_CONTRATO_PATH: apiPath + '/contrato',

    API_ALMACEN_INVENTARIO_230_LOTES_URL: apiHost + apiPath + '/inventario-230/lotes',
    API_ALMACEN_INVENTARIO_230_LOTES_PATH: apiPath + '/inventario-230/lotes',

    API_ALMACEN_MOVIMIENTOS_433_LOTES_URL: apiHost + apiPath + '/movimientos-433/lotes',
    API_ALMACEN_MOVIMIENTOS_433_LOTES_PATH: apiPath + '/movimientos-433/lotes',

    API_ALMACEN_CATALOGO_ARTICULOS_LOTES_URL: apiHost + apiPath + '/catalogo-articulos/lotes',
    API_ALMACEN_CATALOGO_ARTICULOS_LOTES_PATH: apiPath + '/catalogo-articulos/lotes',

    INTEGRATION_ID: 'almacen-appscript',
    INTEGRATION_SECRET_PROPERTY: 'INTEGRATION_ALMACEN_SECRET',

    HEADER_INTEGRATION_ID: 'X-Integration-Id',
    HEADER_TIMESTAMP: 'X-Integration-Timestamp',
    HEADER_SIGNATURE: 'X-Integration-Signature'
  });
}

function ALMNS_ObtenerIntegrationId() {
  return ALMNS_ObtenerConfig().INTEGRATION_ID;
}

function ALMNS_ObtenerIntegrationSecret() {
  var config = ALMNS_ObtenerConfig();
  var secret = PropertiesService.getScriptProperties()
    .getProperty(config.INTEGRATION_SECRET_PROPERTY);
  if (!secret) {
    throw new Error('Falta la propiedad de script "' + config.INTEGRATION_SECRET_PROPERTY + '".');
  }
  return secret;
}

/** HMAC-SHA256 en hexadecimal minuscula, igual que Ventas/Cobranza COR. */
function ALMNS_CrearFirmaHmac_(mensaje, secret) {
  var bytes = Utilities.computeHmacSha256Signature(
    mensaje, secret, Utilities.Charset.UTF_8
  );
  return bytes.map(function (byte) {
    return ((byte + 256) % 256).toString(16).padStart(2, '0');
  }).join('');
}

/**
 * Construye encabezados para un cuerpo YA serializado.
 * Por defecto POST, y GET para consultar contrato/estado de lote.
 * Es imprescindible transmitir payloadTexto sin volverlo a serializar.
 */
function ALMNS_ConstruirSolicitudM2M_(apiPath, payloadTexto, metodo) {
  var config = ALMNS_ObtenerConfig();
  var method = String(metodo || 'POST').toUpperCase();
  var body = payloadTexto === undefined || payloadTexto === null
    ? '' : String(payloadTexto);

  if (method !== 'GET' && method !== 'POST') {
    throw new Error('ALMNS: metodo M2M no admitido: ' + method);
  }
  if (method === 'GET' && body) {
    throw new Error('ALMNS: GET no debe llevar cuerpo para el contrato HMAC.');
  }
  ALMNS_ConstruirUrlM2M_(apiPath); // valida la ruta antes de firmar

  var timestamp = String(Math.floor(Date.now() / 1000));
  var stringToSign = timestamp + '\n' + method + '\n' + apiPath + '\n' + body;
  var signature = ALMNS_CrearFirmaHmac_(
    stringToSign, ALMNS_ObtenerIntegrationSecret()
  );
  var headers = {};
  headers[config.HEADER_INTEGRATION_ID] = ALMNS_ObtenerIntegrationId();
  headers[config.HEADER_TIMESTAMP] = timestamp;
  headers[config.HEADER_SIGNATURE] = signature;

  return {headers: headers, timestamp: timestamp};
}

/** Convierte solo paths del receptor autorizado a URL completa de Azure. */
function ALMNS_ConstruirUrlM2M_(apiPath) {
  var config = ALMNS_ObtenerConfig();
  var path = String(apiPath || '');
  var prefix = config.API_ALMACEN_SYNC_PATH + '/';
  if (!path.startsWith(prefix) || /[?#\\\s]/.test(path) || path.includes('//')) {
    throw new Error('ALMNS: ruta fuera del contrato de Almacen NetSuite.');
  }
  return config.API_BASE_URL + path;
}

/**
 * Configuracion operativa compartida con 00_ALMNS_CORE.gs.
 * Se conserva el objeto ALMNS_CONFIG para compatibilidad con los procesos
 * 230, 433 y catalogo que ya se entregaron (no se modifican sus wrappers).
 */
var ALMNS_CONFIG = (function () {
  'use strict';

  var PROPIEDADES = Object.freeze({
    API_SECRET: 'INTEGRATION_ALMACEN_SECRET',
    FECHA_CORTE: 'ALMNS_FECHA_CORTE',
    SPREADSHEET_ID: 'ALMNS_SPREADSHEET_ID',
    TAMANO_PAGINA: 'ALMNS_TAMANO_PAGINA',
    FORMATO_FECHA: 'ALMNS_FORMATO_FECHA_TEXTO',
    MOVIMIENTOS_MODO: 'ALMNS_433_MODO',
    ESTADO_PENDIENTE_PREFIJO: 'ALMNS_PENDIENTE_',
    ESTADO_ULTIMO_OK_PREFIJO: 'ALMNS_ULTIMO_OK_'
  });

  var AJUSTES = Object.freeze({
    TAMANO_PAGINA_PREDETERMINADO: 250,
    TAMANO_PAGINA_MAXIMO: 300,
    PAGINAS_MAXIMAS: 2000,
    BLOQUE_LECTURA: 900,
    LIMITE_TIEMPO_EJECUCION_MS: 240000,
    ESPERA_LOCK_MS: 30000,
    INTENTOS_HTTP: 4,
    REINTENTO_BASE_MS: 800,
    FORMATO_FECHA_PREDETERMINADO: 'DMY',
    ZONA_HORARIA_PREDETERMINADA: 'America/Mexico_City'
  });

  var LIBROS = Object.freeze({
    INVENTARIO_230: 'BG Inventario_230',
    ACTIVIDAD_INVENTARIO: 'Detalle actividad de inventario',
    ALMACEN_PRESTAMOS: 'Detalle almacén prestamos'
  });

  // [Aster | 2026-10-19 | ASTER-MG | PASO 1 ALMACEN 230 HISTORIAL UPSERT V001]
  // Origen A..N -> Res. B..O. Res.!A queda 100% fuera de las escrituras.
  // ID compuesto: NetSuite permite un mismo articulo en varias ubicaciones.
  // Configurar los nombres EXACTOS de las columnas identificadoras si cambian.
  var HISTORIAL_230 = Object.freeze({
    HOJA_ORIGEN: 'Valuacion Inventario',
    HOJA_DESTINO: 'Res.',
    FILA_ENCABEZADO_ORIGEN: 1,
    FILA_ENCABEZADO_DESTINO: 1,
    COLUMNA_A_DESTINO_PROTEGIDA: 1,
    COLUMNA_DESTINO_DESDE: 2,
    MODO_ESCRITURA: 'UPSERT',
    COLUMNA_ORIGEN_DESDE: 1,
    COLUMNAS_ID: Object.freeze(['ID interno', 'ID subsidiaria', 'ID ubicaci\u00f3n']),
    FILAS_MAXIMAS_ORIGEN: 100000,
    COLUMNAS_MAXIMAS_ORIGEN: 80,
    BLOQUE_LECTURA: 800,
    BLOQUE_ESCRITURA: 250
  });

  // [Aster | 2026-10-19 | ASTER-MG | PASO 2 ALMACEN 230 RES A SEND V001]
  // El identificador local procede de Res.!A y es la PK estable
  // id_inventario de Aiven para INSERT/UPDATE (backend FIX V001).
  var SEND_230 = Object.freeze({
    HOJA_ORIGEN: HISTORIAL_230.HOJA_DESTINO,
    HOJA_DESTINO: 'SEND',
    FILA_ENCABEZADOS: 1,
    BLOQUE_ESCRITURA: 250,
    ENCABEZADOS_ORIGEN: Object.freeze([
      'id_inventario', 'ID interno', 'Art\u00edculo', 'Descripci\u00f3n',
      'Valor de factura', '% de Valor de factura', 'F\u00edsico',
      'ID subsidiaria', 'Subsidiaria', 'ID ubicaci\u00f3n', 'Almac\u00e9n / ubicaci\u00f3n'
    ]),
    ENCABEZADOS_DESTINO: Object.freeze([
      'id_inventario', 'id_articulo_ns', 'articulo', 'descripcion',
      'valor_factura', 'porcentaje_valor_factura', 'fisico',
      'id_subsidiaria_ns', 'subsidiaria', 'id_ubicacion_ns', 'almacen_ubicacion'
    ])
  });

  var FUENTES = Object.freeze({
    '230': Object.freeze({
      route: 'inventario-230', type: 'INVENTARIO_230', modo: 'COMPLETA',
      propsId: 'ALMNS_230_SPREADSHEET_ID', propsName: 'ALMNS_230_HOJA',
      defaultName: 'SEND',
      // id_inventario es la PK estable de SEND y Aiven (FIX backend V001).
      // Se incluye en cada fila, sin cambiar las otras diez columnas.
      // Celda vacia en SEND -> JSON null; NO omitir propiedades vacias.
      headers: [
        ['idInventario', 'id_inventario'],
        ['idArticuloNs', 'id_articulo_ns'], ['articulo', 'articulo'],
        ['descripcion', 'descripcion'], ['valorFactura', 'valor_factura'],
        ['porcentajeValorFactura', 'porcentaje_valor_factura'],
        ['fisico', 'fisico'], ['idSubsidiariaNs', 'id_subsidiaria_ns'],
        ['subsidiaria', 'subsidiaria'], ['idUbicacionNs', 'id_ubicacion_ns'],
        ['almacenUbicacion', 'almacen_ubicacion']
      ]
    }),
    '433': Object.freeze({
      route: 'movimientos-433', type: 'MOVIMIENTOS_433', modo: null,
      propsId: 'ALMNS_433_SPREADSHEET_ID', propsName: 'ALMNS_433_HOJA',
      defaultName: 'Movimientos 433',
      headers: [
        ['departamento', 'Departamento'], ['tipoTransaccion', 'Tipo de transacción'],
        ['articulo', 'Artículo'], ['idArticuloNs', 'ID interno'], ['ag', 'AG'],
        ['fechaTransaccion', 'Fecha'], ['numeroDocumento', 'No documento'],
        ['descripcion', 'Descripción'], ['cantidad', 'Cant.'], ['importeBruto', 'Importe (bruto)'],
        ['categoria', 'Categoría'], ['clase', 'Clase'], ['proyecto', 'Proyecto'],
        ['motivoSalida', 'Motivo Salida'], ['sinCargoCliente', 'Sin Cargo a Cliente'],
        ['idSubsidiariaNs', 'ID subsidiaria'], ['subsidiaria', 'Subsidiaria'],
        ['idUbicacionNs', 'ID ubicación'], ['almacenUbicacion', 'Almacén / ubicación'],
        ['idTransaccionNs', 'ID transacción'], ['idLineaNs', 'ID línea']
      ]
    }),
    'CAT': Object.freeze({
      route: 'catalogo-articulos', type: 'CATALOGO_ARTICULOS', modo: 'COMPLETA',
      propsId: 'ALMNS_CAT_SPREADSHEET_ID', propsName: 'ALMNS_CAT_HOJA',
      defaultName: 'Catálogo de artículos',
      headers: [
        ['idArticuloNs', 'ID interno'], ['nombreArticulo', 'Nombre'],
        ['numeroParteFabricanteOriginal', 'Numero de parte fabricante original'],
        ['categoriaArticulo', 'Categoría de Artículo'],
        ['cantidadFisicaTotalReportada', 'Cantidad física total'],
        ['ubicacionInventarioTexto', 'Ubicación del inventario'],
        ['ultimoPrecioCompra', 'Último precio de compra']
      ]
    })
  });

  // Diagnostico SIN imprimir la URL, ID, secreto ni IDs de Sheets.
  function estadoConfig() {
    var props = PropertiesService.getScriptProperties();
    function existe(key) { return Boolean(String(props.getProperty(key) || '').trim()); }
    var info = ALMNS_ObtenerConfig();
    var resultado = {
      ok: false,
      apiUrlDefinida: /^https:\/\//.test(info.API_BASE_URL),
      identidadConfigurada: Boolean(info.INTEGRATION_ID),
      secretoConfigurado: existe(PROPIEDADES.API_SECRET),
      fechaCorteConfigurada: existe(PROPIEDADES.FECHA_CORTE),
      modo433Configurado: existe(PROPIEDADES.MOVIMIENTOS_MODO),
      libro230Configurado: existe('ALMNS_230_SPREADSHEET_ID') || existe(PROPIEDADES.SPREADSHEET_ID),
      libro433Configurado: existe('ALMNS_433_SPREADSHEET_ID') || existe(PROPIEDADES.SPREADSHEET_ID),
      libroCatalogoConfigurado: existe('ALMNS_CAT_SPREADSHEET_ID') || existe(PROPIEDADES.SPREADSHEET_ID),
      historial230: {
        origen: HISTORIAL_230.HOJA_ORIGEN,
        destino: HISTORIAL_230.HOJA_DESTINO,
        columnaAIntocable: true,
        modo: HISTORIAL_230.MODO_ESCRITURA,
        columnasId: HISTORIAL_230.COLUMNAS_ID.slice(),
        reglaCopiadoPendiente: false
      }
    };
    resultado.ok = resultado.apiUrlDefinida && resultado.identidadConfigurada && resultado.secretoConfigurado;
    Logger.log('ALMNS PASO 0 | Estado (sin datos sensibles): ' + JSON.stringify(resultado));
    return resultado;
  }

  return Object.freeze({
    PROPIEDADES: PROPIEDADES,
    AJUSTES: AJUSTES,
    LIBROS: LIBROS,
    HISTORIAL_230: HISTORIAL_230,
    SEND_230: SEND_230,
    FUENTES: FUENTES,
    estadoConfig: estadoConfig
  });
}());

function ALMNS_Paso0_VerificarConfig() {
  return ALMNS_CONFIG.estadoConfig();
}
