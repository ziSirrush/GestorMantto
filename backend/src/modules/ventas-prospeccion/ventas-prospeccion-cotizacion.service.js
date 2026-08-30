'use strict';

const repository = require('./ventas-prospeccion.repository');
const relationRepository = require('./ventas-prospeccion-cotizacion.repository');
const visibilityService = require('../ventas/ventas-visibility.service');

function httpError(statusCode, message, details, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.status = statusCode;
  if (details !== undefined) error.detalles = details;
  if (code) error.code = code;
  return error;
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw httpError(400, `${field} debe ser un entero positivo.`);
  }
  return number;
}

function actorId(actionContext) {
  const user = actionContext?.contextUser || actionContext?.user || null;
  return positiveInteger(user?.id_SB || user?.id || user?.user_id, 'usuario autenticado');
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('es-MX');
}

function isQuotedStatus(value) {
  return normalize(value) === 'cotizado';
}

function isNewOrigin(record) {
  return Number(record?.nuevo || 0) === 1;
}

function nullableId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function assertCompatibleRelation(current, quotation) {
  const currentClient = nullableId(current?.id_cliente);
  const currentContact = nullableId(current?.id_contacto);
  const quoteClient = nullableId(quotation?.id_cliente);
  const quoteContact = nullableId(quotation?.id_contacto);

  if (!quoteClient || !quoteContact) {
    throw httpError(
      409,
      'La cotización seleccionada debe tener cliente y contacto comercial válidos antes de relacionarla con la prospección.',
      { id_cotizacion: quotation?.id_cotizacion || null, id_cliente: quoteClient, id_contacto: quoteContact },
      'PROSPECCION_COTIZACION_INCOMPLETA'
    );
  }

  if (currentClient && currentClient !== quoteClient) {
    throw httpError(
      409,
      'La cotización pertenece a un cliente diferente al relacionado actualmente con la prospección.',
      { id_cliente_prospeccion: currentClient, id_cliente_cotizacion: quoteClient },
      'PROSPECCION_CLIENTE_COTIZACION_NO_COINCIDE'
    );
  }

  if (currentContact && currentContact !== quoteContact) {
    throw httpError(
      409,
      'La cotización pertenece a un contacto diferente al relacionado actualmente con la prospección.',
      { id_contacto_prospeccion: currentContact, id_contacto_cotizacion: quoteContact },
      'PROSPECCION_CONTACTO_COTIZACION_NO_COINCIDE'
    );
  }
}

async function assertStatusTransitionAllowed(rawId, requestedStatus, actionContext) {
  if (!isQuotedStatus(requestedStatus)) return { requires_relation: false };

  const idPros = positiveInteger(rawId, 'id_pros');
  const connection = await repository.getConnection();
  try {
    const scope = await visibilityService.resolveVisibilityScope(connection, actionContext);
    const current = await repository.getProspectionById(connection, idPros, scope);
    if (!current) {
      throw httpError(404, 'Prospección no encontrada o fuera de tu alcance comercial.');
    }

    const hasQuotation = nullableId(current.id_cotizacion) !== null;
    if (isNewOrigin(current) && !hasQuotation) {
      throw httpError(
        409,
        'Antes de marcar esta prospección como Cotizado debes crear o relacionar una cotización.',
        {
          id_pros: idPros,
          requiere_cotizacion: true,
          opciones: ['CREAR', 'RELACIONAR']
        },
        'PROSPECCION_COTIZACION_REQUIRED'
      );
    }

    return { requires_relation: false, prospeccion: current };
  } finally {
    connection.release();
  }
}

async function linkQuotationAndSetQuoted(rawId, payload, actionContext) {
  const idPros = positiveInteger(rawId, 'id_pros');
  const idCotizacion = positiveInteger(payload?.id_cotizacion, 'id_cotizacion');
  const idUsuario = actorId(actionContext);
  const connection = await repository.getConnection();

  try {
    const scope = await visibilityService.resolveVisibilityScope(connection, actionContext);
    const visible = await repository.getProspectionById(connection, idPros, scope);
    if (!visible) {
      throw httpError(404, 'Prospección no encontrada o fuera de tu alcance comercial.');
    }

    await connection.beginTransaction();

    const current = await relationRepository.lockProspection(connection, idPros);
    if (!current) {
      throw httpError(404, 'Prospección no encontrada o inactiva.');
    }

    const currentQuotation = nullableId(current.id_cotizacion);
    if (currentQuotation && currentQuotation !== idCotizacion) {
      throw httpError(
        409,
        'La prospección ya tiene otra cotización relacionada. No se reemplazará automáticamente.',
        { id_cotizacion_actual: currentQuotation, id_cotizacion_solicitada: idCotizacion },
        'PROSPECCION_COTIZACION_YA_RELACIONADA'
      );
    }

    if (!currentQuotation && !isNewOrigin(current)) {
      throw httpError(
        409,
        'Este flujo de relación automática solo aplica a prospecciones cuyo origen fue NUEVO.',
        { id_pros: idPros },
        'PROSPECCION_ORIGEN_NO_NUEVO'
      );
    }

    const quotation = await repository.findQuotation(connection, idCotizacion, scope);
    if (!quotation) {
      throw httpError(404, 'La cotización no existe, está inactiva o queda fuera de tu alcance comercial.');
    }
    quotation.id_cotizacion = idCotizacion;
    assertCompatibleRelation(current, quotation);

    const quotedStatus = await repository.findProspectionStatus(connection, 'Cotizado');
    if (!quotedStatus) {
      throw httpError(409, 'No está disponible el estatus Cotizado en Ventas / Estatus Pros.', null, 'PROSPECCION_ESTATUS_COTIZADO_NO_DISPONIBLE');
    }

    let relationChanged = false;
    let statusChanged = false;

    if (!currentQuotation) {
      const affected = await relationRepository.linkQuotation(connection, idPros, quotation);
      if (affected !== 1) throw httpError(409, 'No fue posible relacionar la cotización con la prospección.');
      relationChanged = true;
      await repository.insertProspectionHistory(connection, {
        id_pros: idPros,
        id_usuario: idUsuario,
        tipo_evento: 'RELACION_COTIZACION',
        campo: 'id_cotizacion',
        valor_anterior: null,
        valor_nuevo: idCotizacion,
        comentario: null,
        ip: actionContext?.ip
      });
    }

    if (!isQuotedStatus(current.estatus)) {
      await repository.updateProspectionStatus(connection, idPros, quotedStatus);
      await repository.insertProspectionHistory(connection, {
        id_pros: idPros,
        id_usuario: idUsuario,
        tipo_evento: 'CAMBIO_ESTATUS',
        campo: 'estatus',
        valor_anterior: current.estatus || null,
        valor_nuevo: quotedStatus.estatus,
        comentario: 'Estatus actualizado al relacionar la cotización.',
        ip: actionContext?.ip
      });
      statusChanged = true;
    }

    await connection.commit();

    const updated = await repository.getProspectionById(connection, idPros, scope);
    return {
      ok: true,
      source: 'aiven',
      message: relationChanged
        ? 'Cotización relacionada y prospección marcada como Cotizado.'
        : 'La prospección ya estaba relacionada con esta cotización.',
      id_pros: idPros,
      id_cotizacion: idCotizacion,
      cotizacion_relacionada: relationChanged,
      estatus_actualizado: statusChanged,
      prospeccion: updated
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  assertStatusTransitionAllowed,
  linkQuotationAndSetQuoted
};
