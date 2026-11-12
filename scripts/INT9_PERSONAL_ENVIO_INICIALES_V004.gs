// [Aster | 2026-10-20 | ASTER-MG | INT9 PERSONAL GAS M2M/HMAC V004 - INICIALES Y ACTIVO 0/1]
// Google Sheets (A:H) -> API Azure -> instalaciones_personal (Aiven).
// Usa las funciones M2M compartidas de la plantilla VENTAS, sin copiar secretos.
// NO inserta lotes: el endpoint INT-9 admite una persona por POST.
// Registra altas con activo=0/1. NO actualiza ni desactiva registros existentes.

var INT9_PERSONAL_ENVIO_CONFIG = Object.freeze({
  HOJA_ORIGEN: 'personal', // Nombre de la pestana del Google Sheets.
  MAX_PERSONAS_POR_EJECUCION: 200, // Hoja con ~149 filas: se mantienen POST individuales y prevalidacion completa.

  // Ambos valores deben permanecer false hasta que se apruebe el cambio
  // de significado de los datos. El esquema actual solo admite Mecánico
  // y Ayudante, y NO permite experiencia para un MONTADOR.
  AUTORIZAR_MAESTRO_COMO_MECANICO: false,
  AUTORIZAR_EXPERIENCIA_MONTADOR_COMO_CATEGORIA: false
});

/**
 * Prevalidacion SIN conexiones ni escrituras. Ejecutar primero.
 * Nunca expone el secreto ni modifica celdas.
 */
function INT9_PERSONAL_ValidarHoja() {
  var lectura = INT9_PERSONAL_Preparar_();
  Logger.log('INT9 | Validacion correcta: ' + lectura.registros.length +
    ' registros preparados (' + lectura.inactivos + ' inactivos), ' +
    lectura.vacias + ' filas vacias.');
  if (lectura.avisos.length) Logger.log('INT9 | Avisos: ' + lectura.avisos.join(' | '));
  return {
    ok: true,
    hoja: lectura.hoja,
    leidas: lectura.leidas,
    preparados: lectura.registros.length,
    inactivos: lectura.inactivos,
    vacias: lectura.vacias,
    avisos: lectura.avisos
  };
}

/**
 * ENVIO REAL. Cada persona se firma con HMAC y se envia individualmente.
 * Los 409 se informan como duplicados, NO equivalen a una actualizacion.
 * Ante error de transporte o rechazo distinto de duplicado, se detiene;
 * no hay reintentos automaticos de inserciones potencialmente ambiguas.
 */
function INT9_PERSONAL_EnviarAiven() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error('INT9 | Ya hay una carga ejecutandose; no se permiten cargas simultaneas.');
  }

  try {
    // Prevalidar la hoja COMPLETA antes del primer POST: sin cargas parciales
    // por datos mal formados o cambios semanticos no autorizados.
    var lectura = INT9_PERSONAL_Preparar_();
    var endpoint = INT9_PERSONAL_ObtenerEndpoint_();

    if (!lectura.registros.length) {
      Logger.log('INT9 | Sin personal para enviar.');
      return { ok: true, creados: 0, duplicados: 0, inactivos: lectura.inactivos, enviados: 0 };
    }
    if (lectura.registros.length > INT9_PERSONAL_ENVIO_CONFIG.MAX_PERSONAS_POR_EJECUCION) {
      throw new Error('INT9 | Se prepararon ' + lectura.registros.length +
        ' personas; limite de seguridad por ejecucion: ' +
        INT9_PERSONAL_ENVIO_CONFIG.MAX_PERSONAS_POR_EJECUCION +
        '. Divide la carga en hojas controladas; no se envio ninguna fila.');
    }

    // Comprobacion temprana: sin incluir el valor en los logs.
    if (typeof VENTAS_ObtenerIntegrationSecret !== 'function' ||
        !VENTAS_ObtenerIntegrationSecret()) {
      throw new Error('INT9 | Falta la configuracion de secreto M2M de Ventas.');
    }

    var creados = 0;
    var duplicados = 0;
    var creadosInactivos = 0;
    var detalle = [];

    lectura.registros.forEach(function(item) {
      var payloadTexto = JSON.stringify(item.payload);
      var solicitud = VENTAS_ConstruirSolicitudM2M_(endpoint.path, payloadTexto);

      var respuesta;
      try {
        respuesta = UrlFetchApp.fetch(endpoint.url, {
          method: 'post',
          contentType: 'application/json; charset=utf-8',
          headers: solicitud.headers,
          payload: payloadTexto, // EXACTAMENTE los bytes firmados.
          muteHttpExceptions: true,
          followRedirects: false
        });
      } catch (error) {
        throw new Error('INT9 | Fila ' + item.fila +
          ': fallo de red. La escritura es INDETERMINADA; verifica Aiven ' +
          'antes de reintentar. Detalle: ' + error.message);
      }

      var status = respuesta.getResponseCode();
      var body = respuesta.getContentText();
      var json;
      try {
        json = JSON.parse(body);
      } catch (error) {
        throw new Error('INT9 | Fila ' + item.fila + ' | HTTP ' + status +
          ': respuesta no JSON. Comprobar el registro en Aiven antes de reintentar.');
      }

      if (status === 409 && json && json.code === 'INT9_PERSONA_DUPLICADA') {
        duplicados += 1;
        detalle.push({ fila: item.fila, estado: 'DUPLICADO_NO_ACTUALIZADO', http: 409 });
        Logger.log('INT9 | Fila ' + item.fila + ' | 409 duplicado; no se actualizo.');
        return;
      }

      if (status !== 201 || !json || json.ok !== true || !json.data ||
          !Number.isSafeInteger(Number(json.data.id_personal)) ||
          Number(json.data.id_personal) < 1) {
        var codigo = json && json.code ? String(json.code) : 'RESPUESTA_INESPERADA';
        throw new Error('INT9 | Fila ' + item.fila + ' | HTTP ' + status +
          ' | ' + codigo + '. Proceso detenido. Verifica Aiven antes de reintentar.');
      }

      // Evita declarar exitoso un POST servido por un backend antiguo que forzaba activo=1.
      // Requisito previo: desplegar el backend compatible antes de ejecutar este GAS.
      if (Number(json.data.activo) !== item.payload.activo) {
        throw new Error('INT9 | Fila ' + item.fila +
          ': backend devolvio un estado distinto del solicitado. Detenido; revisar Aiven.');
      }
      creados += 1;
      if (item.payload.activo === 0) creadosInactivos += 1;
      detalle.push({
        fila: item.fila,
        estado: item.payload.activo === 0 ? 'CREADO_INACTIVO' : 'CREADO_ACTIVO',
        activo: item.payload.activo,
        http: status,
        id_personal: Number(json.data.id_personal)
      });
      Logger.log('INT9 | Fila ' + item.fila + ' | 201 creado activo=' +
        item.payload.activo + ' ID ' + json.data.id_personal + '.');
    });

    var resultado = {
      ok: duplicados === 0,
      hoja: lectura.hoja,
      leidas: lectura.leidas,
      preparados: lectura.registros.length,
      enviados: creados + duplicados,
      creados: creados,
      creadosInactivos: creadosInactivos,
      duplicados: duplicados,
      inactivos: lectura.inactivos,
      vacias: lectura.vacias,
      avisos: lectura.avisos,
      detalle: detalle
    };
    Logger.log('INT9 | Resultado: ' + JSON.stringify(resultado));
    return resultado;
  } finally {
    lock.releaseLock();
  }
}

/** Lectura y validacion previa: encabezados EXACTOS A:H, fila 1. */
function INT9_PERSONAL_Preparar_() {
  var opciones = INT9_PERSONAL_ENVIO_CONFIG;
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  if (!libro) throw new Error('INT9 | Abre el script desde el Google Sheets de personal.');
  var hoja = libro.getSheetByName(opciones.HOJA_ORIGEN);
  if (!hoja) throw new Error('INT9 | No existe la pestana "' + opciones.HOJA_ORIGEN + '".');

  var esperados = [
    'tipo_personal', 'nombre', 'contratista', 'puesto',
    'categoria', 'experiencia', 'iniciales', 'activo'
  ];
  var encabezados = hoja.getRange(1, 1, 1, 8).getDisplayValues()[0];
  esperados.forEach(function(esperado, indice) {
    if (String(encabezados[indice] || '').trim() !== esperado) {
      throw new Error('INT9 | Encabezado incorrecto en ' +
        String.fromCharCode(65 + indice) + '1: esperado "' + esperado +
        '", recibido "' + String(encabezados[indice] || '') + '".');
    }
  });

  var lastRow = hoja.getLastRow();
  if (lastRow < 2) {
    return { hoja: hoja.getName(), leidas: 0, registros: [],
      inactivos: 0, vacias: 0, avisos: [] };
  }

  var data = hoja.getRange(2, 1, lastRow - 1, 8);
  var mostrado = data.getDisplayValues();
  var registros = [];
  var inactivos = 0;
  var vacias = 0;
  var avisos = [];
  var claves = Object.create(null);
  var errores = [];

  mostrado.forEach(function(row, indice) {
    var fila = indice + 2;
    if (row.every(function(valor) { return INT9_PERSONAL_Texto_(valor) === ''; })) {
      vacias += 1;
      return;
    }

    var activo = INT9_PERSONAL_Texto_(row[7]);
    if (activo !== '1' && activo !== '0') {
      errores.push('fila ' + fila + ': activo debe ser 1 o 0.');
      return;
    }
    if (activo === '0') inactivos += 1; // Se prepara igual; conserva activo=0.

    try {
      var tipo = INT9_PERSONAL_Clave_(row[0]);
      var nombre = INT9_PERSONAL_Texto_(row[1]);
      var contratista = INT9_PERSONAL_Texto_(row[2]);
      var puesto = INT9_PERSONAL_Texto_(row[3]);
      var categoria = INT9_PERSONAL_Texto_(row[4]);
      var experiencia = INT9_PERSONAL_Texto_(row[5]);
      var iniciales = INT9_PERSONAL_Texto_(row[6]); // Preserva el valor sin generar ni convertir.
      var payload;

      if (tipo !== 'MONTADOR' && tipo !== 'AJUSTADOR') {
        throw new Error('tipo_personal debe ser Montador o Ajustador.');
      }
      if (!nombre || nombre.length > 180) {
        throw new Error('nombre es obligatorio y admite maximo 180 caracteres.');
      }
      if (categoria.length > 120 || experiencia.length > 120) {
        throw new Error('categoria y experiencia admiten maximo 120 caracteres.');
      }
      if (iniciales.length > 30) {
        throw new Error('iniciales admite maximo 30 caracteres.');
      }

      if (tipo === 'MONTADOR') {
        var conflictos = [];
        if (!contratista || contratista.length > 160) {
          throw new Error('contratista es obligatorio (maximo 160 caracteres) para Montador.');
        }
        var clavePuesto = INT9_PERSONAL_Clave_(puesto);
        if (clavePuesto === 'MAESTRO') {
          if (!opciones.AUTORIZAR_MAESTRO_COMO_MECANICO) {
            conflictos.push('puesto "Maestro" no existe en el enum Aiven; ' +
              'autoriza Maestro -> Mecanico o cambia el esquema.');
          }
          puesto = 'Mecánico';
          avisos.push('Fila ' + fila + ': puesto Maestro -> Mecánico (mapeo autorizado).');
        } else if (clavePuesto === 'MECANICO') {
          puesto = 'Mecánico';
        } else if (clavePuesto === 'AYUDANTE') {
          puesto = 'Ayudante';
        } else {
          throw new Error('puesto no admitido: "' + puesto + '". Aiven admite Mecánico o Ayudante.');
        }

        if (experiencia) {
          if (!opciones.AUTORIZAR_EXPERIENCIA_MONTADOR_COMO_CATEGORIA) {
            conflictos.push('experiencia="' + experiencia + '" no es almacenable ' +
              'para Montador; autoriza su mapeo a categoria o cambia el esquema.');
          } else {
            if (categoria && categoria !== experiencia) {
              throw new Error('categoria ya contiene otro valor; no se sobrescribe con experiencia.');
            }
            categoria = experiencia;
            avisos.push('Fila ' + fila + ': experiencia Montador -> categoria (mapeo autorizado).');
          }
        }
        if (conflictos.length) throw new Error(conflictos.join(' '));
        payload = { tipo: 'MONTADOR', nombre: nombre, contratista: contratista,
          puesto: puesto, categoria: categoria || null, iniciales: iniciales || null };
      } else {
        if (contratista || puesto) {
          throw new Error('Ajustador no admite contratista ni puesto en el esquema actual.');
        }
        payload = { tipo: 'AJUSTADOR', nombre: nombre,
          categoria: categoria || null, experiencia: experiencia || null, iniciales: iniciales || null };
      }

      // El POST solo realiza altas; no cambia estatus de existentes.
      payload.activo = Number(activo);
      // Coincide con la clave de unicidad del catalogo de personal activo.
      var clave = tipo + '|' + INT9_PERSONAL_Clave_(nombre) + '|' +
        (tipo === 'MONTADOR' ? INT9_PERSONAL_Clave_(contratista) : '');
      if (claves[clave]) {
        throw new Error('posible duplicado en la hoja con la fila ' + claves[clave] + '.');
      }
      claves[clave] = fila;
      registros.push({ fila: fila, payload: payload });
    } catch (error) {
      errores.push('fila ' + fila + ': ' + error.message);
    }
  });

  if (errores.length) {
    throw new Error('INT9 | Validacion detenida. NO se envio ninguna fila.\n- ' +
      errores.slice(0, 30).join('\n- ') +
      (errores.length > 30 ? '\n- ... ' + (errores.length - 30) + ' errores adicionales.' : ''));
  }

  return {
    hoja: hoja.getName(), leidas: mostrado.length, registros: registros,
    inactivos: inactivos, vacias: vacias, avisos: avisos
  };
}

function INT9_PERSONAL_ObtenerEndpoint_() {
  if (typeof VENTAS_ObtenerConfig !== 'function' ||
      typeof VENTAS_ConstruirSolicitudM2M_ !== 'function') {
    throw new Error('INT9 | Falta el CONFIG compartido VENTAS M2M/HMAC en Apps Script.');
  }
  var config = VENTAS_ObtenerConfig();
  var url = String(config.API_INSTALACIONES_PROGRAMACION_PERSONAL_URL || '');
  var path = String(config.API_INSTALACIONES_PROGRAMACION_PERSONAL_PATH || '');
  var esperado = '/api/instalaciones/programacion/personal';
  var origenAutorizado = 'https://mantto-gestor-api-a4hwfpgvbeb4gmgj.mexicocentral-01.azurewebsites.net';
  // Evita enviar la firma M2M a hosts no autorizados o redirecciones.
  // Si cambia el host oficial de Azure, revisar explicitamente este valor.
  if (path !== esperado || url !== origenAutorizado + esperado) {
    throw new Error('INT9 | URL/PATH de Programacion Personal invalidos en VENTAS_ObtenerConfig().');
  }
  return { url: url, path: path };
}

function INT9_PERSONAL_Texto_(valor) {
  return valor === undefined || valor === null ? '' : String(valor).trim();
}

function INT9_PERSONAL_Clave_(valor) {
  return INT9_PERSONAL_Texto_(valor).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toUpperCase();
}
