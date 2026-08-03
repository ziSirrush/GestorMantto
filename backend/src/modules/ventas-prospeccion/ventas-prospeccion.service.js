const path = require('path');
const mime = require('mime-types');
const repository = require('./ventas-prospeccion.repository');
const visibilityService = require('../ventas/ventas-visibility.service');
const azureStorage = require('../../services/storage/azure-storage.service');
const storageAdapters = require('../../services/storage/storage-metadata.adapters');

const BATCH_SIZE = 300;

function httpError(statusCode, message, detalles) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.detalles = detalles;
  return error;
}

function readRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.registros)) return payload.registros;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function cleanText(value, maxLength = null) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return maxLength ? text.slice(0, maxLength) : text;
}

function requiredPositiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw httpError(400, `${field} debe ser un entero positivo.`);
  }
  return number;
}

function parseIsoDate(value, field) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw httpError(400, `${field} no contiene una fecha válida.`, { valor: text });
  }
  return date;
}

function parseLocation(value) {
  const text = cleanText(value, 150);
  if (!text) return { ubicacion: null, latitud: null, longitud: null };

  const parts = text.split(',').map((part) => part.trim());
  if (parts.length < 2) return { ubicacion: text, latitud: null, longitud: null };

  const latitud = Number(parts[0]);
  const longitud = Number(parts[1]);
  if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) {
    return { ubicacion: text, latitud: null, longitud: null };
  }
  if (latitud < -90 || latitud > 90 || longitud < -180 || longitud > 180) {
    return { ubicacion: text, latitud: null, longitud: null };
  }

  return { ubicacion: text, latitud, longitud };
}

function buildFile(urlValue, idPros, label, order = 1) {
  const storageUrl = cleanText(urlValue);
  if (!storageUrl) return null;

  let fileName = `prospeccion_${idPros}_${label}`;
  let extension = null;

  try {
    const parsed = new URL(storageUrl);
    const candidate = decodeURIComponent(path.basename(parsed.pathname || ''));
    if (candidate) fileName = candidate.slice(0, 255);
  } catch (_error) {
    // Se conserva el nombre generado; la URL se validará como texto no vacío.
  }

  extension = path.extname(fileName).replace('.', '').toLowerCase() || null;
  const mimeType = extension ? mime.lookup(extension) || null : null;
  const image = Boolean(mimeType && String(mimeType).startsWith('image/'));

  return {
    nombre_archivo: fileName,
    nombre_original: fileName,
    mime_type: mimeType,
    extension,
    storage_url: storageUrl,
    orden: order,
    es_imagen: image ? 1 : 0
  };
}

function normalizeProspection(source) {
  const idPros = requiredPositiveInteger(source.id_pros, 'id_pros');
  const idUsuario = requiredPositiveInteger(source.id_usuario, 'id_usuario');
  const location = parseLocation(source.ubicacion);

  const files = [
    buildFile(source.foto_1, idPros, 'foto_1', 1),
    buildFile(source.foto_2, idPros, 'foto_2', 2),
    buildFile(source.foto_3, idPros, 'foto_3', 3),
    buildFile(source.foto_4, idPros, 'foto_4', 4)
  ].filter(Boolean);

  return {
    id_pros: idPros,
    empresa: cleanText(source.empresa, 255),
    proyecto: cleanText(source.proyecto, 255),
    ...location,
    contacto: cleanText(source.contacto, 255),
    correo: cleanText(source.correo, 255),
    telefono: cleanText(source.telefono, 100),
    comentario: cleanText(source.comenario ?? source.comentario),
    id_usuario: idUsuario,
    ciudad: cleanText(source.ciudad, 150),
    estado: cleanText(source.estado, 150),
    tipo_proyecto: cleanText(source.tipo_proyecto, 150),
    fecha_visita: parseIsoDate(source.fecha_visita, 'fecha_visita'),
    estatus: cleanText(source.estatus, 150),
    fecha_cam_estatus: parseIsoDate(source.fecha_cam_estatus, 'fecha_cam_estatus'),
    files
  };
}

function normalizeComment(source) {
  const idComment = requiredPositiveInteger(source.id_com_pors, 'id_com_pors');
  const idPros = requiredPositiveInteger(source.id_pros, 'id_pros');
  const idUsuario = requiredPositiveInteger(source.id_usuario, 'id_usuario');
  const comentario = source.comentario === undefined || source.comentario === null
    ? ''
    : String(source.comentario).trim();

  const fechaHora = parseIsoDate(source.fecha_hora, 'fecha_hora');
  const file = buildFile(source.adjunto, idPros, `comentario_${idComment}`, 1);

  return {
    id_com_pors: idComment,
    id_pros: idPros,
    id_usuario: idUsuario,
    comentario,
    fecha_hora: fechaHora,
    file
  };
}

async function resolveStatusIds(connection, records) {
  const cache = new Map();
  for (const record of records) {
    if (!record.estatus) {
      record.id_estatus = null;
      continue;
    }
    const key = record.estatus.trim().toUpperCase();
    if (!cache.has(key)) {
      cache.set(key, await repository.findStatusIdByName(connection, record.estatus));
    }
    record.id_estatus = cache.get(key);
  }
}

async function syncProspections(payload) {
  const rawRecords = readRecords(payload);
  if (!rawRecords.length) {
    throw httpError(400, 'No se recibieron registros de prospección. Usa un arreglo o { registros: [...] }.');
  }

  const result = {
    ok: true,
    source: 'aiven',
    received: rawRecords.length,
    processed: 0,
    rejected: 0,
    batch_size: BATCH_SIZE,
    errors: []
  };

  for (let offset = 0; offset < rawRecords.length; offset += BATCH_SIZE) {
    const batch = rawRecords.slice(offset, offset + BATCH_SIZE);
    const connection = await repository.getConnection();

    try {
      const normalized = [];
      for (let index = 0; index < batch.length; index += 1) {
        try {
          normalized.push({ record: normalizeProspection(batch[index]), row: offset + index + 1 });
        } catch (error) {
          result.rejected += 1;
          if (result.errors.length < 100) {
            result.errors.push({ row: offset + index + 1, message: error.message, details: error.detalles });
          }
        }
      }

      await connection.beginTransaction();

      const userIds = normalized.map((item) => item.record.id_usuario);
      const existingUsers = await repository.findExistingUserIds(connection, userIds);
      await resolveStatusIds(connection, normalized.map((item) => item.record));

      for (const item of normalized) {
        const { record, row } = item;
        if (!existingUsers.has(record.id_usuario)) {
          result.rejected += 1;
          if (result.errors.length < 100) {
            result.errors.push({ row, message: `El id_usuario ${record.id_usuario} no existe en usuarios.id_SB.` });
          }
          continue;
        }

        await repository.upsertProspection(connection, record);
        await repository.replaceVisitFiles(connection, record.id_pros, record.files);
        result.processed += 1;
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  result.ok = result.rejected === 0;
  result.message = result.ok
    ? 'Prospecciones cargadas correctamente.'
    : 'La carga terminó con registros rechazados.';
  return result;
}

async function syncComments(payload) {
  const rawRecords = readRecords(payload);
  if (!rawRecords.length) {
    throw httpError(400, 'No se recibieron comentarios. Usa un arreglo o { registros: [...] }.');
  }

  const result = {
    ok: true,
    source: 'aiven',
    received: rawRecords.length,
    processed: 0,
    rejected: 0,
    batch_size: BATCH_SIZE,
    errors: []
  };

  for (let offset = 0; offset < rawRecords.length; offset += BATCH_SIZE) {
    const batch = rawRecords.slice(offset, offset + BATCH_SIZE);
    const connection = await repository.getConnection();

    try {
      const normalized = [];
      for (let index = 0; index < batch.length; index += 1) {
        try {
          normalized.push({ record: normalizeComment(batch[index]), row: offset + index + 1 });
        } catch (error) {
          result.rejected += 1;
          if (result.errors.length < 100) {
            result.errors.push({ row: offset + index + 1, message: error.message, details: error.detalles });
          }
        }
      }

      await connection.beginTransaction();

      const existingUsers = await repository.findExistingUserIds(
        connection,
        normalized.map((item) => item.record.id_usuario)
      );
      const existingProspections = await repository.findExistingProspectionIds(
        connection,
        normalized.map((item) => item.record.id_pros)
      );

      for (const item of normalized) {
        const { record, row } = item;
        if (!existingUsers.has(record.id_usuario)) {
          result.rejected += 1;
          if (result.errors.length < 100) {
            result.errors.push({ row, message: `El id_usuario ${record.id_usuario} no existe en usuarios.id_SB.` });
          }
          continue;
        }
        if (!existingProspections.has(record.id_pros)) {
          result.rejected += 1;
          if (result.errors.length < 100) {
            result.errors.push({ row, message: `La prospección ${record.id_pros} no existe. Carga primero la hoja principal.` });
          }
          continue;
        }

        await repository.upsertComment(connection, record);
        await repository.replaceCommentFile(connection, record);
        result.processed += 1;
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  result.ok = result.rejected === 0;
  result.message = result.ok
    ? 'Comentarios de prospección cargados correctamente.'
    : 'La carga terminó con registros rechazados.';
  return result;
}



function positiveIntegerOr(value, fallback, max = 1000) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function normalizeReadFilters(query = {}) {
  const year = Number(query.anio || query.year);
  return {
    q: cleanText(query.q || query.buscar, 180),
    year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null,
    status: cleanText(query.estatus, 150),
    userId: Number.isInteger(Number(query.id_usuario)) && Number(query.id_usuario) > 0 ? Number(query.id_usuario) : null,
    state: cleanText(query.estado, 150),
    page: positiveIntegerOr(query.page, 1, 1000000),
    pageSize: positiveIntegerOr(query.page_size, 30, 200)
  };
}

async function withScope(actionContext, callback) {
  const connection = await repository.getConnection();
  try {
    const scope = await visibilityService.resolveVisibilityScope(connection, actionContext);
    return await callback(connection, scope);
  } finally {
    connection.release();
  }
}

async function listProspections(query, actionContext) {
  const filters = normalizeReadFilters(query);
  return withScope(actionContext, async (connection, scope) => {
    const result = await repository.listProspections(connection, filters, scope);
    return {
      ok: true,
      source: 'aiven',
      prospecciones: result.rows,
      pagination: {
        page: filters.page,
        page_size: filters.pageSize,
        total: result.total,
        total_pages: Math.max(1, Math.ceil(result.total / filters.pageSize))
      },
      visibility: visibilityService.toClientVisibility(scope)
    };
  });
}

async function getKpis(query, actionContext) {
  const filters = normalizeReadFilters(query);
  return withScope(actionContext, async (connection, scope) => ({
    ok: true,
    source: 'aiven',
    kpis: await repository.getKpis(connection, filters, scope),
    visibility: visibilityService.toClientVisibility(scope)
  }));
}

async function getCatalogs(actionContext) {
  return withScope(actionContext, async (connection, scope) => ({
    ok: true,
    source: 'aiven',
    catalogos: await repository.getCatalogs(connection, scope),
    visibility: visibilityService.toClientVisibility(scope)
  }));
}

async function getMap(query, actionContext) {
  const filters = normalizeReadFilters(query);
  return withScope(actionContext, async (connection, scope) => ({
    ok: true,
    source: 'aiven',
    puntos: await repository.getMap(connection, filters, scope),
    visibility: visibilityService.toClientVisibility(scope)
  }));
}

async function getProspection(id, actionContext) {
  const idPros = requiredPositiveInteger(id, 'id_pros');
  return withScope(actionContext, async (connection, scope) => {
    const prospeccion = await repository.getProspectionById(connection, idPros, scope);
    if (!prospeccion) throw httpError(404, 'Prospección no encontrada o fuera de tu alcance comercial.');
    const [comentarios, archivos] = await Promise.all([
      repository.listCommentsByProspection(connection, idPros),
      repository.listFilesByProspection(connection, idPros)
    ]);
    const archivosConAcceso = await Promise.all(archivos.map(async (archivo) => {
      if (String(archivo.storage_provider || '').toUpperCase() !== azureStorage.PROVIDER || !archivo.storage_blob_name) return archivo;
      try {
        const access = await azureStorage.createReadSas_gnral(archivo.storage_blob_name, { fileName: archivo.nombre_original || archivo.nombre_archivo });
        return { ...archivo, storage_url: access.url, access_expires_at: access.expires_at };
      } catch (_error) {
        return { ...archivo, storage_url: null, storage_access_error: true };
      }
    }));
    return { ok: true, source: 'aiven', prospeccion, comentarios, archivos: archivosConAcceso };
  });
}


function actorId(actionContext) {
  const value = Number(actionContext?.contextUser?.id_SB || actionContext?.user?.id_SB || actionContext?.contextUser?.id || actionContext?.user?.id);
  if (!Number.isInteger(value) || value <= 0) throw httpError(401, 'No fue posible identificar al usuario autenticado.');
  return value;
}

function parseCoordinate(value, min, max, field) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw httpError(400, `${field} no es válida.`);
  return number;
}

function normalizeClassification(value) {
  const type = String(value || 'NUEVO').trim().toUpperCase();
  if (!['NUEVO', 'INSTALACION', 'COTIZADO'].includes(type)) throw httpError(400, 'clasificacion debe ser NUEVO, INSTALACION o COTIZADO.');
  return type;
}

async function searchSources(query, actionContext) {
  const type = String(query.tipo || '').trim().toUpperCase();
  const q = cleanText(query.q, 150) || '';
  const limit = positiveIntegerOr(query.limit, 30, 50);
  const connection = await repository.getConnection();
  try {
    const scope=await visibilityService.resolveVisibilityScope(connection,actionContext);
    if (type === 'INSTALACION') return { ok:true, source:'aiven', resultados:await repository.searchInstallationProjects(connection,q,limit,scope) };
    if (type === 'COTIZADO') return { ok:true, source:'aiven', resultados:await repository.searchQuotations(connection,q,limit,scope) };
    throw httpError(400, 'tipo debe ser INSTALACION o COTIZADO.');
  } finally { connection.release(); }
}

async function getCaptureCatalogs() {
  const connection = await repository.getConnection();
  try { return { ok:true, source:'aiven', catalogos:await repository.getCaptureCatalogs(connection) }; }
  finally { connection.release(); }
}

async function getClientContacts(query) {
  const idCliente = requiredPositiveInteger(query.id_cliente, 'id_cliente');
  const connection = await repository.getConnection();
  try { return { ok:true, source:'aiven', contactos:await repository.listClientContacts(connection,idCliente) }; }
  finally { connection.release(); }
}

async function createVisit(payload, files, actionContext) {
  const idUsuario = actorId(actionContext);
  const classification = normalizeClassification(payload.clasificacion);
  const connection = await repository.getConnection();
  const uploadedBlobs = [];
  try {
    const scope = await visibilityService.resolveVisibilityScope(connection, actionContext);
    let source = null;
    let idProyectoInstalacion = null;
    let idCotizacion = null;

    if (classification === 'INSTALACION') {
      idProyectoInstalacion = cleanText(payload.id_proyecto_instalacion, 100);
      if (!idProyectoInstalacion) throw httpError(400, 'Selecciona un proyecto de Instalaciones.');
      source = await repository.findInstallationProject(connection, idProyectoInstalacion, scope);
      if (!source) throw httpError(404, 'El proyecto de Instalaciones no existe o está inactivo.');
      idCotizacion = source.id_cotizacion ? Number(source.id_cotizacion) : null;
    }

    if (classification === 'COTIZADO') {
      idCotizacion = requiredPositiveInteger(payload.id_cotizacion, 'id_cotizacion');
      source = await repository.findQuotation(connection, idCotizacion, scope);
      if (!source) throw httpError(404, 'La cotización no existe o está inactiva.');
    }

    const idCliente = payload.id_cliente ? requiredPositiveInteger(payload.id_cliente, 'id_cliente') : (source?.id_cliente ? Number(source.id_cliente) : null);
    const contactMode = String(payload.contact_mode || '').trim().toUpperCase();
    const requestedContactId = payload.id_contacto ? requiredPositiveInteger(payload.id_contacto, 'id_contacto') : null;
    let idContacto = requestedContactId;
    let selectedContact = null;
    let newContact = null;

    if (idContacto && idCliente) {
      const contacts = await repository.listClientContacts(connection, idCliente);
      selectedContact = contacts.find((contact) => Number(contact.id_contacto) === idContacto) || null;
      if (!selectedContact) throw httpError(400, 'El contacto seleccionado no pertenece al cliente relacionado.');
    }

    const empresa = cleanText(payload.empresa, 255) || cleanText(source?.empresa, 255);
    const proyecto = cleanText(payload.proyecto, 255) || cleanText(source?.proyecto, 255);
    const comentario = cleanText(payload.comentario);
    if (!empresa) throw httpError(400, 'Empresa es obligatoria.');
    if (!proyecto) throw httpError(400, 'Proyecto es obligatorio.');
    if (!comentario) throw httpError(400, 'Comentario es obligatorio.');

    const manualContactName = cleanText(payload.contacto, 255);
    const manualContactPosition = cleanText(payload.puesto_contacto, 150);
    const manualContactEmail = cleanText(payload.correo, 255);
    const manualContactPhone = cleanText(payload.telefono, 100);

    if (classification !== 'NUEVO' && contactMode === 'NEW') {
      if (!idCliente) throw httpError(400, 'La fuente seleccionada no tiene un cliente relacionado para guardar el nuevo contacto.');
      if (!manualContactName) throw httpError(400, 'Contacto es obligatorio.');
      newContact = { id_cliente: idCliente, nombre_contacto: manualContactName, puesto_contacto: manualContactPosition, email: manualContactEmail, telefono: manualContactPhone, id_usuario: idUsuario };
      selectedContact = null;
      idContacto = null;
    }

    const contacto = manualContactName || cleanText(selectedContact?.contacto, 255) || cleanText(source?.contacto, 255);
    if (!contacto) throw httpError(400, 'Contacto es obligatorio.');
    const puestoContacto = manualContactPosition || cleanText(selectedContact?.puesto_contacto, 150) || cleanText(source?.puesto_contacto, 150);
    const correo = manualContactEmail || cleanText(selectedContact?.correo, 255) || cleanText(source?.correo, 255);
    const telefono = manualContactPhone || cleanText(selectedContact?.telefono, 100) || cleanText(source?.telefono, 100);
    const latitud = parseCoordinate(payload.latitud, -90, 90, 'latitud');
    const longitud = parseCoordinate(payload.longitud, -180, 180, 'longitud');
    if ((latitud === null) !== (longitud === null)) throw httpError(400, 'Latitud y longitud deben enviarse juntas.');
    const ubicacion = latitud === null ? cleanText(payload.ubicacion, 150) : `${latitud}, ${longitud}`;

    await connection.beginTransaction();
    if (newContact) {
      idContacto = await repository.createClientContact(connection, newContact);
      selectedContact = { id_contacto: idContacto, contacto: newContact.nombre_contacto, puesto_contacto: newContact.puesto_contacto, correo: newContact.email, telefono: newContact.telefono };
      if (idCotizacion) await repository.updateQuotationContact(connection, idCotizacion, { id_contacto: idContacto, contacto: newContact.nombre_contacto, correo: newContact.email, telefono: newContact.telefono, id_usuario: idUsuario });
    }

    const record = {
      empresa, proyecto, ubicacion, latitud, longitud,
      contacto: selectedContact?.contacto || contacto,
      puesto_contacto: selectedContact?.puesto_contacto || puestoContacto,
      correo: selectedContact?.correo || correo,
      telefono: selectedContact?.telefono || telefono,
      comentario, id_usuario: idUsuario,
      ciudad: cleanText(payload.ciudad, 150) || cleanText(source?.ciudad, 150),
      estado: cleanText(payload.estado, 150) || cleanText(source?.estado, 150),
      tipo_proyecto: cleanText(payload.tipo_proyecto, 150) || cleanText(source?.tipo_proyecto, 150),
      fecha_visita: new Date(), id_estatus: null, estatus: null, fecha_cam_estatus: null,
      nuevo: classification === 'NUEVO' ? 1 : 0,
      proyecto_activo: classification === 'INSTALACION' ? 1 : 0,
      proyecto_cotizado: classification === 'COTIZADO' ? 1 : 0,
      id_proyecto_instalacion: idProyectoInstalacion, id_cotizacion: idCotizacion, id_cliente: idCliente, id_contacto: idContacto
    };

    const idPros = await repository.createProspection(connection, record);
    const normalizedFiles = [];
    const photoFiles = Array.isArray(files) ? files.slice(0, 4) : [];
    for (let index = 0; index < photoFiles.length; index += 1) {
      const storage = await azureStorage.uploadPrivate_gnral({
        file: photoFiles[index], empresa, modulo: 'ventas', entidadTipo: 'prospeccion', entidadId: idPros, subruta: 'visita',
        metadata: { uploaded_by: idUsuario, relation: 'VISITA' }
      });
      uploadedBlobs.push(storage.storage_blob_name);
      normalizedFiles.push({ ...storageAdapters.forVentasProspeccion_gnral(storage), thumbnail_url: null, orden: index + 1 });
    }
    await repository.insertVisitFiles(connection, idPros, normalizedFiles);
    await repository.insertHistory(connection, { id_pros: idPros, id_usuario: idUsuario, comentario, ip: actionContext?.ip, valor_nuevo: { clasificacion: classification, empresa, proyecto, id_proyecto_instalacion: idProyectoInstalacion, id_cotizacion: idCotizacion, id_cliente: idCliente, id_contacto: idContacto, puesto_contacto: selectedContact?.puesto_contacto || puestoContacto || null, contacto_nuevo: Boolean(newContact) } });
    await connection.commit();
    return { ok: true, source: 'aiven', message: 'Visita creada correctamente.', id_pros: idPros, id_contacto: idContacto, contacto_creado: Boolean(newContact) };
  } catch (error) {
    try { await connection.rollback(); } catch (_error) {}
    for (const blobName of uploadedBlobs) { try { await azureStorage.deleteBlob_gnral(blobName); } catch (_error) {} }
    throw error;
  } finally { connection.release(); }
}

async function getDetailCatalogs(actionContext) {
  return withScope(actionContext, async (connection) => ({
    ok: true,
    source: 'aiven',
    catalogos: { estatus: await repository.listProspectionStatuses(connection) }
  }));
}

async function updateProspectionStatus(id, payload, actionContext) {
  const idPros = requiredPositiveInteger(id, 'id_pros');
  const idUsuario = actorId(actionContext);
  const requested = cleanText(payload?.estatus, 150);
  if (!requested) throw httpError(400, 'Selecciona un estatus.');
  return withScope(actionContext, async (connection, scope) => {
    const current = await repository.getProspectionById(connection, idPros, scope);
    if (!current) throw httpError(404, 'Prospección no encontrada o fuera de tu alcance comercial.');
    const status = await repository.findProspectionStatus(connection, requested);
    if (!status) throw httpError(400, 'El estatus no pertenece al catálogo Ventas / Estatus Pros.');
    if (String(current.estatus || '').trim().toLowerCase() === String(status.estatus).trim().toLowerCase()) {
      throw httpError(400, 'Selecciona un estatus diferente.');
    }
    await connection.beginTransaction();
    try {
      await repository.updateProspectionStatus(connection, idPros, status);
      await repository.insertProspectionHistory(connection, {
        id_pros: idPros, id_usuario: idUsuario, tipo_evento: 'CAMBIO_ESTATUS', campo: 'estatus',
        valor_anterior: current.estatus || null, valor_nuevo: status.estatus,
        comentario: cleanText(payload?.comentario), ip: actionContext?.ip
      });
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    const updated = await repository.getProspectionById(connection, idPros, scope);
    return { ok: true, source: 'aiven', message: 'Estatus actualizado correctamente.', prospeccion: updated };
  });
}

async function createComment(id, payload, files, actionContext) {
  const idPros = requiredPositiveInteger(id, 'id_pros');
  const idUsuario = actorId(actionContext);
  const comentario = cleanText(payload?.comentario, 4000) || '';
  const incoming = Array.isArray(files) ? files.slice(0, 4) : [];
  if (!comentario && !incoming.length) throw httpError(400, 'Escribe un comentario o adjunta al menos un archivo.');
  const connection = await repository.getConnection();
  const uploadedBlobs = [];
  try {
    const scope = await visibilityService.resolveVisibilityScope(connection, actionContext);
    const current = await repository.getProspectionById(connection, idPros, scope);
    if (!current) throw httpError(404, 'Prospección no encontrada o fuera de tu alcance comercial.');
    await connection.beginTransaction();
    const idComment = await repository.createProspectionComment(connection, { id_pros: idPros, id_usuario: idUsuario, comentario });
    const normalizedFiles = [];
    for (let index = 0; index < incoming.length; index += 1) {
      const storage = await azureStorage.uploadPrivate_gnral({
        file: incoming[index], empresa: current.empresa || actionContext?.user?.empresa, modulo: 'ventas', entidadTipo: 'prospeccion', entidadId: idPros, subruta: `comentarios/${idComment}`,
        metadata: { uploaded_by: idUsuario, relation: 'COMENTARIO', comment_id: idComment }
      });
      uploadedBlobs.push(storage.storage_blob_name);
      normalizedFiles.push({ ...storageAdapters.forVentasProspeccion_gnral(storage), thumbnail_url: null, es_imagen: String(storage.mime_type || '').startsWith('image/') });
    }
    await repository.insertCommentFiles(connection, idPros, idComment, normalizedFiles);
    await repository.insertProspectionHistory(connection, { id_pros: idPros, id_usuario: idUsuario, tipo_evento: 'COMENTARIO', campo: null, valor_nuevo: { id_com_pors: idComment, archivos: normalizedFiles.length }, comentario: comentario || (normalizedFiles.length ? 'Archivo adjunto' : null), ip: actionContext?.ip });
    await connection.commit();
    return { ok: true, source: 'aiven', message: 'Seguimiento registrado correctamente.', id_com_pors: idComment };
  } catch (error) {
    try { await connection.rollback(); } catch (_error) {}
    for (const blobName of uploadedBlobs) { try { await azureStorage.deleteBlob_gnral(blobName); } catch (_error) {} }
    throw error;
  } finally { connection.release(); }
}

module.exports = {
  syncProspections,
  syncComments,
  listProspections,
  getKpis,
  getCatalogs,
  getMap,
  getProspection,
  searchSources,
  getCaptureCatalogs,
  getClientContacts,
  createVisit,
  getDetailCatalogs,
  updateProspectionStatus,
  createComment
};
