'use strict';

const repository = require('./cobranza-cor-pagos-modulo.repository');

const ROUTES_PAGOS_COR = Object.freeze({
  listado: '/api/cobranza-cor/pagos',
  proyectos: '/api/cobranza-cor/pagos/proyectos',
  proyecto: '/api/cobranza-cor/pagos/:idPagoCor/proyecto',
  proyectoMasivo: '/api/cobranza-cor/pagos/proyecto/masivo'
});

function httpError(statusCode, message, detalles, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.detalles = detalles;
  if (code) error.code = code;
  return error;
}

function badRequest(message, detalles, code = 'COBRANZA_PAGOS_CONSULTA_INVALIDA') {
  return httpError(400, message, detalles, code);
}

function cleanText_cor(value, maxLength) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object' || typeof value === 'function' || typeof value === 'symbol') {
    throw badRequest('Los valores de Pagos deben ser escalares.');
  }
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > maxLength) throw badRequest(`El valor excede la longitud maxima de ${maxLength}.`);
  return text;
}

function integer_cor(value, fieldName, { min = null, max = null } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) throw badRequest(`${fieldName} debe ser un entero.`, { field: fieldName, recibido: value });
  const number = Number(text);
  if (!Number.isSafeInteger(number)) throw badRequest(`${fieldName} excede el rango seguro.`, { field: fieldName, recibido: value });
  if (min !== null && number < min) throw badRequest(`${fieldName} debe ser mayor o igual a ${min}.`, { field: fieldName, recibido: value });
  if (max !== null && number > max) throw badRequest(`${fieldName} debe ser menor o igual a ${max}.`, { field: fieldName, recibido: value });
  return number;
}

function positiveId_cor(value, fieldName) {
  const id = integer_cor(value, fieldName, { min: 1 });
  if (!id) throw badRequest(`${fieldName} es obligatorio.`, { field: fieldName });
  return id;
}

function positiveIds_cor(value, fieldName = 'ids_pago_cor') {
  if (!Array.isArray(value) || !value.length) {
    throw badRequest(`${fieldName} debe contener al menos un Pago.`, { field: fieldName }, 'COBRANZA_PAGOS_IDS_REQUERIDOS');
  }
  if (value.length > 100) {
    throw badRequest('La asignacion masiva permite un maximo de 100 Pagos por operacion.', { field: fieldName, maximo: 100 }, 'COBRANZA_PAGOS_MASIVO_LIMITE');
  }
  return [...new Set(value.map((id) => positiveId_cor(id, fieldName)))];
}

function numberOrNull_cor(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerOrNull_cor(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function canonicalText_cor(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function assertCompleteCorellianScope_cor(informationAccess) {
  const domain = String(informationAccess?.dominio || informationAccess?.empresa || '').trim().toUpperCase();
  if (domain !== 'CORELLIAN' || informationAccess?.acceso_dominio_completo !== true) {
    throw httpError(
      403,
      'La bandeja general de Pagos requiere alcance completo de CORELLIAN.',
      { dominio: domain || null, acceso_dominio_completo: informationAccess?.acceso_dominio_completo === true },
      'COBRANZA_PAGOS_SCOPE_COMPLETO_REQUERIDO'
    );
  }
}

function normalizePagosFilters_cor(query = {}) {
  const page = integer_cor(query.page ?? query.pagina, 'page', { min: 1 }) || 1;
  const pageSize = integer_cor(query.page_size ?? query.pageSize ?? query.tamano, 'page_size', { min: 1, max: 100 }) || 50;
  const relacionRaw = canonicalText_cor(query.relacion_proyecto ?? query.relacionProyecto);
  let relacionProyecto = null;
  if (relacionRaw) {
    if (['CON PROYECTO', 'CON_PROYECTO'].includes(relacionRaw)) relacionProyecto = 'CON_PROYECTO';
    else if (['SIN PROYECTO', 'SIN_PROYECTO'].includes(relacionRaw)) relacionProyecto = 'SIN_PROYECTO';
    else throw badRequest('relacion_proyecto debe ser CON_PROYECTO o SIN_PROYECTO.');
  }
  return {
    buscar: cleanText_cor(query.q ?? query.buscar, 200),
    estado: cleanText_cor(query.estado, 100),
    zonaAdm: cleanText_cor(query.zona_adm ?? query.zonaAdm, 100),
    relacionProyecto,
    page,
    pageSize
  };
}

function serializePagoModulo_cor(row) {
  return {
    id_pago_cor: integerOrNull_cor(row?.id_pago_cor),
    no_factura: cleanText_cor(row?.no_factura, 150),
    ppns_relacionado: cleanText_cor(row?.ppns_relacionado, 100),
    proyecto_relacionado: cleanText_cor(row?.proyecto_relacionado, 1000),
    cliente_relacionado: cleanText_cor(row?.cliente_relacionado, 1000),
    cliente: cleanText_cor(row?.cliente, 255),
    limite_credito: numberOrNull_cor(row?.limite_credito),
    proyecto: cleanText_cor(row?.proyecto, 255),
    fecha_servicio: cleanText_cor(row?.fecha_servicio, 32),
    estado: cleanText_cor(row?.estado, 100),
    facturado: numberOrNull_cor(row?.facturado),
    pagado: numberOrNull_cor(row?.pagado),
    saldo: numberOrNull_cor(row?.saldo),
    dias_retraso: integerOrNull_cor(row?.dias_retraso),
    fecha_emision: cleanText_cor(row?.fecha_emision, 32),
    fecha_vencimiento: cleanText_cor(row?.fecha_vencimiento, 32),
    terminos: cleanText_cor(row?.terminos, 100),
    zona_adm: cleanText_cor(row?.zona_adm, 100),
    subsidiaria: cleanText_cor(row?.subsidiaria, 255),
    clase: cleanText_cor(row?.clase, 150),
    creado_desde: cleanText_cor(row?.creado_desde, 255),
    fecha_creacion_ov: cleanText_cor(row?.fecha_creacion_ov, 32),
    complemento_pago: cleanText_cor(row?.complemento_pago, 255),
    fecha_complemento_pago: cleanText_cor(row?.fecha_complemento_pago, 32),
    importe_complemento_pago: numberOrNull_cor(row?.importe_complemento_pago),
    relacionado_proyecto: Boolean(cleanText_cor(row?.ppns_relacionado, 100))
  };
}

function serializeProyecto_cor(row) {
  return {
    ppns: cleanText_cor(row?.ppns, 100),
    proyecto: cleanText_cor(row?.proyecto, 1000),
    cliente: cleanText_cor(row?.cliente, 1000)
  };
}

async function listarPagos_cor(query = {}, informationAccess) {
  assertCompleteCorellianScope_cor(informationAccess);
  const filters = normalizePagosFilters_cor(query);
  const connection = await repository.getConnection_cor();
  try {
    const [total, resumen] = await Promise.all([
      repository.countPagosModulo_cor(connection, filters),
      repository.resumenPagosModulo_cor(connection, filters)
    ]);
    const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
    const page = Math.min(filters.page, totalPages);
    const offset = (page - 1) * filters.pageSize;
    const rows = total > 0
      ? await repository.listPagosModulo_cor(connection, filters, { limit: filters.pageSize, offset })
      : [];

    return {
      ok: true,
      source: 'aiven',
      domain: 'CORELLIAN',
      route: ROUTES_PAGOS_COR.listado,
      source_table: repository.TABLE_PAGOS_COR,
      scope_aplicado: 'DOMINIO_COMPLETO',
      relacion_ppns_resuelta: true,
      filtros: { q: filters.buscar, estado: filters.estado, zona_adm: filters.zonaAdm, relacion_proyecto: filters.relacionProyecto },
      resumen,
      paginacion: { pagina: page, tamano: filters.pageSize, total_registros: total, total_paginas: totalPages },
      data: rows.map(serializePagoModulo_cor)
    };
  } finally {
    connection.release();
  }
}

async function listarProyectos_cor(query = {}, informationAccess) {
  assertCompleteCorellianScope_cor(informationAccess);
  const buscar = cleanText_cor(query.q ?? query.buscar, 200);
  const limit = integer_cor(query.limit ?? query.limite, 'limit', { min: 1, max: 2000 }) || 2000;
  const connection = await repository.getConnection_cor();
  try {
    const rows = await repository.listProyectosPagos_cor(connection, buscar, limit);
    return {
      ok: true,
      source: 'aiven',
      source_table: repository.TABLE_FUENTE_COR,
      grouped_by: 'id_proyecto_origen',
      domain: 'CORELLIAN',
      route: ROUTES_PAGOS_COR.proyectos,
      data: rows.map(serializeProyecto_cor)
    };
  } finally {
    connection.release();
  }
}

function relationPpnsSet_cor(relaciones) {
  return [...new Set(
    (Array.isArray(relaciones) ? relaciones : [])
      .map((row) => cleanText_cor(row?.ppns, 100))
      .filter(Boolean)
      .map(canonicalText_cor)
  )];
}

async function validatePagoRelationsForProject_cor(connection, idPagoCor, proyecto) {
  const relaciones = await repository.listRelacionesPagoProyecto_cor(connection, idPagoCor);
  const ppnsRelaciones = relationPpnsSet_cor(relaciones);
  if (ppnsRelaciones.length > 1) {
    throw httpError(
      409,
      'El Pago tiene relaciones con Facturas de mas de un proyecto.',
      { id_pago_cor: idPagoCor, ppns_facturas: ppnsRelaciones },
      'COBRANZA_PAGOS_RELACIONES_INCONSISTENTES'
    );
  }
  if (ppnsRelaciones.length === 1 && ppnsRelaciones[0] !== canonicalText_cor(proyecto.ppns)) {
    throw httpError(
      409,
      'El Pago ya esta relacionado con Facturas de otro proyecto.',
      { id_pago_cor: idPagoCor, ppns_facturas: ppnsRelaciones[0], ppns_solicitado: proyecto.ppns },
      'COBRANZA_PAGOS_PROYECTO_CONFLICTO_FACTURAS'
    );
  }
}

async function asignarProyecto_cor(idPagoCorRaw, body = {}, informationAccess) {
  assertCompleteCorellianScope_cor(informationAccess);
  const idPagoCor = positiveId_cor(idPagoCorRaw, 'idPagoCor');
  const requestedPpns = cleanText_cor(body.ppns, 100);
  if (!requestedPpns) throw badRequest('ppns es obligatorio.', { field: 'ppns' }, 'COBRANZA_PAGOS_PPNS_REQUERIDO');

  const connection = await repository.getConnection_cor();
  try {
    await connection.beginTransaction();
    const pago = await repository.lockPagoProyecto_cor(connection, idPagoCor);
    if (!pago) throw httpError(404, 'El Pago solicitado no existe.', { id_pago_cor: idPagoCor }, 'COBRANZA_PAGO_NO_ENCONTRADO');

    const proyecto = await repository.getProyectoPagoByPpns_cor(connection, requestedPpns);
    if (!proyecto) throw httpError(404, 'El proyecto seleccionado no existe o no esta activo en Fuente.', { ppns: requestedPpns }, 'COBRANZA_PAGOS_PROYECTO_NO_ENCONTRADO');

    await validatePagoRelationsForProject_cor(connection, idPagoCor, proyecto);

    const currentPpns = cleanText_cor(pago.ppns_relacionado, 100);
    let actualizado = false;
    if (canonicalText_cor(currentPpns) !== canonicalText_cor(proyecto.ppns)) {
      await repository.updatePagoProyecto_cor(connection, idPagoCor, proyecto.ppns);
      actualizado = true;
    }

    const row = await repository.getPagoModulo_cor(connection, idPagoCor);
    await connection.commit();
    return {
      ok: true,
      action: actualizado ? 'ASIGNADO' : 'SIN_CAMBIOS',
      proyecto: serializeProyecto_cor(proyecto),
      pago: serializePagoModulo_cor(row)
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    connection.release();
  }
}

async function asignarProyectoMasivo_cor(body = {}, informationAccess) {
  assertCompleteCorellianScope_cor(informationAccess);
  const idsPagoCor = positiveIds_cor(body.ids_pago_cor ?? body.ids, 'ids_pago_cor');
  const requestedPpns = cleanText_cor(body.ppns, 100);
  if (!requestedPpns) throw badRequest('ppns es obligatorio.', { field: 'ppns' }, 'COBRANZA_PAGOS_PPNS_REQUERIDO');

  const connection = await repository.getConnection_cor();
  try {
    await connection.beginTransaction();

    const proyecto = await repository.getProyectoPagoByPpns_cor(connection, requestedPpns);
    if (!proyecto) throw httpError(404, 'El proyecto seleccionado no existe o no esta activo en Fuente.', { ppns: requestedPpns }, 'COBRANZA_PAGOS_PROYECTO_NO_ENCONTRADO');

    const pagos = await repository.lockPagosProyecto_cor(connection, idsPagoCor);
    const existentes = new Set(pagos.map((row) => Number(row.id_pago_cor)));
    const faltantes = idsPagoCor.filter((id) => !existentes.has(id));
    if (faltantes.length) {
      throw httpError(404, 'Uno o mas Pagos seleccionados no existen.', { ids_pago_cor: faltantes }, 'COBRANZA_PAGOS_MASIVO_NO_ENCONTRADOS');
    }

    for (const idPagoCor of idsPagoCor) {
      await validatePagoRelationsForProject_cor(connection, idPagoCor, proyecto);
    }

    const idsCambiar = pagos
      .filter((row) => canonicalText_cor(row.ppns_relacionado) !== canonicalText_cor(proyecto.ppns))
      .map((row) => Number(row.id_pago_cor));

    if (idsCambiar.length) await repository.updatePagosProyecto_cor(connection, idsCambiar, proyecto.ppns);

    await connection.commit();
    return {
      ok: true,
      action: idsCambiar.length ? 'ASIGNACION_MASIVA' : 'SIN_CAMBIOS',
      proyecto: serializeProyecto_cor(proyecto),
      seleccionados: idsPagoCor.length,
      actualizados: idsCambiar.length,
      sin_cambios: idsPagoCor.length - idsCambiar.length
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    connection.release();
  }
}

async function quitarProyecto_cor(idPagoCorRaw, informationAccess) {
  assertCompleteCorellianScope_cor(informationAccess);
  const idPagoCor = positiveId_cor(idPagoCorRaw, 'idPagoCor');
  const connection = await repository.getConnection_cor();
  try {
    await connection.beginTransaction();
    const pago = await repository.lockPagoProyecto_cor(connection, idPagoCor);
    if (!pago) throw httpError(404, 'El Pago solicitado no existe.', { id_pago_cor: idPagoCor }, 'COBRANZA_PAGO_NO_ENCONTRADO');

    const relaciones = await repository.listRelacionesPagoProyecto_cor(connection, idPagoCor);
    if (relaciones.length) {
      throw httpError(
        409,
        'No se puede quitar el proyecto mientras el Pago tenga Facturas relacionadas.',
        { id_pago_cor: idPagoCor, relaciones: relaciones.length },
        'COBRANZA_PAGOS_PROYECTO_CON_FACTURAS'
      );
    }

    const currentPpns = cleanText_cor(pago.ppns_relacionado, 100);
    let actualizado = false;
    if (currentPpns) {
      await repository.updatePagoProyecto_cor(connection, idPagoCor, null);
      actualizado = true;
    }

    const row = await repository.getPagoModulo_cor(connection, idPagoCor);
    await connection.commit();
    return {
      ok: true,
      action: actualizado ? 'DESASIGNADO' : 'SIN_CAMBIOS',
      pago: serializePagoModulo_cor(row)
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  ROUTES_PAGOS_COR,
  normalizePagosFilters_cor,
  serializePagoModulo_cor,
  listarPagos_cor,
  listarProyectos_cor,
  asignarProyecto_cor,
  asignarProyectoMasivo_cor,
  quitarProyecto_cor
};
