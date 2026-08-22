const pendientesRepository = require('./pendientes.repository');
const pendientesAccess = require('./pendientes-access.service');
const pendientesFiles = require('./pendientes-files.service');
const notificationService = require('../../services/notifications/notification.service');

const N6_EVENTO_COMENTARIO = 'COMENTARIO';
const db = pendientesRepository.getExecutor_gnral();

function result(status, body) {
  return { status, body };
}

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.expose = true;
  return error;
}

function positiveInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function likeParam(value) {
  const s = String(value || '').trim();
  return s ? `%${s}%` : null;
}

function currentUserRef(req) {
  const user = req.contextUser || req.user || {};
  return {
    id: user.id_SB || user.id || null,
    correo: user.correo || user.email || null,
    iniciales: user.iniciales || null,
    empresa: user.empresa || null,
    rol: user.rol || user.role || user.puesto || null,
    roles: Array.isArray(user.roles) ? user.roles : [],
    multiempresa: Boolean(
      user.multiempresa ||
      user.multi_empresa ||
      user.doble_empresa ||
      user.ver_dos_empresas ||
      user.todas_empresas ||
      user.is_programador
    )
  };
}

function normalizeTaskType(value) {
  const type = String(value || 'PERSONAL').trim().toUpperCase();
  return type === 'COLABORATIVA' ? 'COLABORATIVA' : 'PERSONAL';
}

function normalizeTaskStatus(value) {
  const status = String(value || 'Pendiente').trim();
  if (status === 'En proceso' || status === 'Cerrado') return status;
  return 'Pendiente';
}

function normalizePriority(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback === undefined ? null : fallback;
  }
  const priority = String(value).trim().toUpperCase();
  if (['BAJA', 'MEDIA', 'ALTA', 'CRITICA'].includes(priority)) return priority;
  return fallback === undefined ? null : fallback;
}

function sanitizeText(value, max) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return max ? text.slice(0, max) : text;
}

function normalizeOptionalDate(value) {
  const raw = sanitizeText(value, 20);
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function normalizeInitials(value) {
  return sanitizeText(value, 20).toUpperCase();
}

function uniqueInitials(values) {
  return Array.from(new Set((values || [])
    .map(value => normalizeInitials(
      typeof value === 'string' ? value : (value?.iniciales_usuario || value?.iniciales)
    ))
    .filter(Boolean)));
}

function normalizeEmpresa(value) {
  return sanitizeText(value, 150) || null;
}

function formatProyectoNombre(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d+)-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!match) return raw;

  const numero = String(Number(match[1]) || match[1].replace(/^0+/, '') || match[1]);
  const meses = {
    '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
    '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
    '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
  };
  const mes = meses[match[2]] || match[2];
  const dia = String(Number(match[3]) || match[3]);
  return `${dia} de ${mes} #${numero}`;
}

function decorateProyectoRow(row) {
  if (!row) return row;
  const codigo = row.proyecto_codigo || row.proyecto;
  const rawNombre = row.nombre_publico || row.proyecto_nombre || row.proyecto_cc_x_port || codigo;
  return {
    ...row,
    proyecto_codigo: codigo,
    proyecto_nombre: row.nombre_publico || formatProyectoNombre(rawNombre || codigo)
  };
}

function userCanSelectMultipleEmpresas(user) {
  const roles = [user.rol]
    .concat(Array.isArray(user.roles) ? user.roles : [])
    .map(role => String(role || '').toLowerCase());
  return Boolean(
    user.multiempresa ||
    roles.some(role => role.includes('director general') || role.includes('programador'))
  );
}

async function resolveAllowedEmpresas(user, executor = null) {
  const all = await pendientesRepository.getAllowedEmpresas_gnral(executor);
  if (!user.empresa || userCanSelectMultipleEmpresas(user)) return all;
  return all.includes(user.empresa) ? [user.empresa] : [user.empresa];
}

async function resolveTaskEmpresa_gnral(user, requestedEmpresa, existingEmpresa = null, executor = null) {
  const allowedEmpresas = await resolveAllowedEmpresas(user, executor);
  let empresa = normalizeEmpresa(requestedEmpresa)
    || normalizeEmpresa(existingEmpresa)
    || normalizeEmpresa(user && user.empresa);

  if (!empresa && allowedEmpresas.length === 1) empresa = allowedEmpresas[0];
  if (!empresa) {
    throw httpError(
      'Selecciona la empresa o razón social de la tarea.',
      400,
      'PENDIENTE_EMPRESA_REQUIRED'
    );
  }

  const allowedMatch = allowedEmpresas.find(value => (
    String(value || '').trim().toLowerCase() === String(empresa).trim().toLowerCase()
  ));
  if (allowedEmpresas.length && !allowedMatch) {
    throw httpError(
      'No tienes autorización para usar la empresa seleccionada.',
      403,
      'PENDIENTE_EMPRESA_FORBIDDEN'
    );
  }
  return allowedMatch || empresa;
}

async function resolveStoredTaskEmpresa_gnral(executor, taskRow) {
  const stored = normalizeEmpresa(taskRow && taskRow.empresa);
  if (stored) return stored;

  const creatorEmail = sanitizeText(taskRow && taskRow.creado_por_email, 255);
  if (creatorEmail) {
    const row = await pendientesRepository.findUserCompanyByEmail_gnral(executor, creatorEmail);
    const resolved = normalizeEmpresa(row && row.empresa);
    if (resolved) return resolved;
  }

  throw httpError(
    'La tarea no tiene una empresa definida. Edítala antes de adjuntar archivos.',
    409,
    'PENDIENTE_EMPRESA_NOT_DEFINED'
  );
}

async function syncPendienteChildren_gnral(executor, idPendiente, body, creator) {
  const tipo = normalizeTaskType(body.tipo_pendiente);
  const relationType = tipo === 'COLABORATIVA' ? 'RESPONSABLE' : 'SEGUIMIENTO';
  const usuarios = Array.isArray(body.usuarios) ? body.usuarios : [];
  const subtareas = Array.isArray(body.subtareas) ? body.subtareas : [];
  const creatorInitials = normalizeInitials(creator?.iniciales);
  const selectedInitials = uniqueInitials(usuarios);
  const filteredInitials = selectedInitials.filter(initials => initials !== creatorInitials);
  const blockedSelfAssignment = Boolean(
    creatorInitials && selectedInitials.includes(creatorInitials)
  );

  await pendientesRepository.replaceTaskUsers_gnral(
    executor,
    idPendiente,
    filteredInitials,
    relationType
  );

  if (body.rewrite_subtareas !== false) {
    let orden = 1;
    const normalizedSubtasks = [];
    for (const st of subtareas) {
      const text = sanitizeText(typeof st === 'string' ? st : (st.subtarea || st.texto), 500);
      if (!text) continue;
      normalizedSubtasks.push({
        subtarea: text,
        estatus: normalizeTaskStatus(st.estatus) === 'Cerrado' ? 'Cerrado' : 'Pendiente',
        orden
      });
      orden += 1;
    }
    await pendientesRepository.replaceSubtasks_gnral(executor, idPendiente, normalizedSubtasks);
  }

  return { blockedSelfAssignment, insertedInitials: filteredInitials };
}

async function createTaskAssignmentNotifications_gnral(
  executor,
  idPendiente,
  body,
  creator,
  skipInitials
) {
  const tipo = normalizeTaskType(body.tipo_pendiente);
  if (tipo !== 'COLABORATIVA') return { inserted: 0, recipients: [] };

  const skip = new Set((skipInitials || [])
    .map(value => String(value || '').trim())
    .filter(Boolean));

  let iniciales = (await pendientesRepository.listTaskResponsibles_gnral(executor, idPendiente))
    .map(row => sanitizeText(row.iniciales_usuario, 20))
    .filter(Boolean);

  if (!iniciales.length) {
    iniciales = (Array.isArray(body.usuarios) ? body.usuarios : [])
      .map(user => sanitizeText(
        typeof user === 'string' ? user : (user.iniciales_usuario || user.iniciales),
        20
      ))
      .filter(Boolean);
  }

  const creatorInitials = normalizeInitials(creator?.iniciales);
  iniciales = Array.from(new Set(iniciales.map(normalizeInitials)))
    .filter(initials => initials && !skip.has(initials) && initials !== creatorInitials);
  if (!iniciales.length) return { inserted: 0, recipients: [] };

  const usuarios = await pendientesRepository.listActiveUsersByInitials_gnral(executor, iniciales);
  const tituloTarea = sanitizeText(body.pendiente, 120) || 'Tarea colaborativa';
  const creador = creator.iniciales || creator.correo || 'Usuario';
  let inserted = 0;
  const recipients = [];

  for (const usuario of usuarios) {
    if (!usuario.id_SB) continue;
    await pendientesRepository.insertTaskAssignmentNotification_gnral(executor, {
      id_usuario: usuario.id_SB,
      tipo_notificacion: 'TAREA_ASIGNADA',
      titulo_notificacion: 'Nueva tarea colaborativa',
      mensaje_notificacion: `${creador} te asigno la tarea: ${tituloTarea}`,
      icono_notificacion: '✅',
      accion_notificacion: 'ABRIR_TAREA',
      id_referencia: idPendiente,
      ruta_destino: `home:tarea:${idPendiente}`
    });
    inserted += 1;
    recipients.push(usuario.iniciales);
  }

  return { inserted, recipients };
}

async function resolveTaskZoneScope_gnral(executor, taskRow) {
  const equipment = String(taskRow && taskRow.equipo || '').trim();
  const project = String(taskRow && taskRow.proyecto || '').trim();
  if (!equipment && !project) return { zonaOperativaNoAplica: true };

  const rows = await pendientesRepository.listTaskPortafolioZones_gnral(executor, {
    equipment,
    project
  });
  for (const row of rows) {
    const zoneId = await pendientesRepository.findActiveZoneId_gnral(executor, row.zona_operativa);
    if (zoneId) return { zonaOperativaId: zoneId };
  }

  return {};
}

async function createPendienteCommentNotifications_gnral(executor, access, actor, interaction) {
  const actorId = Number(actor?.id || 0);
  const actorInitials = String(actor?.iniciales || actor?.correo || 'Usuario').trim();
  const recipientIds = new Set();

  const creatorEmail = String(access?.row?.creado_por_email || '').trim();
  if (creatorEmail) {
    const creator = await pendientesRepository.findActiveUserIdByEmail_gnral(executor, creatorEmail);
    if (creator?.id_SB) recipientIds.add(Number(creator.id_SB));
  }

  const relatedRows = await pendientesRepository.listRelatedActiveUserIds_gnral(
    executor,
    access.row.id_pendiente
  );
  relatedRows.forEach(row => {
    if (row.id_SB) recipientIds.add(Number(row.id_SB));
  });
  if (actorId) recipientIds.delete(actorId);

  const data = interaction && typeof interaction === 'object'
    ? interaction
    : { comentario: interaction };
  const preview = String(data.comentario || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  const fileName = sanitizeText(data.nombre_archivo, 120);
  const actionText = preview
    ? `${actorInitials} comentó: ${preview}`
    : `${actorInitials} adjuntó${fileName ? `: ${fileName}` : ' un archivo'}`;

  if (!preview) {
    for (const idUsuario of recipientIds) {
      await pendientesRepository.insertLegacyCommentNotification_gnral(executor, {
        id_usuario: idUsuario,
        mensaje: actionText,
        id_referencia: access.row.id_pendiente,
        ruta_destino: `home:tarea:${access.row.id_pendiente}`
      });
    }
    return recipientIds.size;
  }

  const zoneScope = await resolveTaskZoneScope_gnral(executor, access.row);
  const notificationResult = await notificationService.emitWithConnection_gnral(executor, {
    codigoEvento: N6_EVENTO_COMENTARIO,
    destinatarios: [...recipientIds],
    actorUserId: actorId || null,
    ...zoneScope,
    requireRoleMatrix: true,
    allowMissingEvent: true,
    titulo: 'Nuevo comentario en tarea',
    mensaje: actionText,
    icono: '💬',
    accion: 'ABRIR_TAREA',
    idReferencia: access.row.id_pendiente,
    ruta: `home:tarea:${access.row.id_pendiente}`
  });
  return Number(notificationResult.created || 0);
}

async function getPendientesCatalogos(req) {
  const user = currentUserRef(req);
  const allowedEmpresas = await resolveAllowedEmpresas(user);
  let empresa = normalizeEmpresa(req.query.empresa);
  if (!empresa && allowedEmpresas.length === 1) empresa = allowedEmpresas[0];
  if (empresa && allowedEmpresas.length && !allowedEmpresas.includes(empresa)) {
    empresa = allowedEmpresas[0] || null;
  }

  const proyectoElegido = sanitizeText(req.query.proyecto, 255);
  const projectSearch = likeParam(req.query.proyecto || req.query.search || '');
  const equipoSearch = likeParam(req.query.equipo || req.query.search || '');

  const areasRows = await pendientesRepository.getCatalogAreas_gnral();
  const usuarios = await pendientesRepository.getCatalogUsers_gnral(null, empresa);
  const proyectos = await pendientesRepository.getCatalogProjects_gnral(null, {
    empresa,
    search: projectSearch
  });
  const equipos = await pendientesRepository.getCatalogEquipment_gnral(null, {
    empresa,
    proyecto: proyectoElegido,
    search: equipoSearch
  });

  return result(200, {
    ok: true,
    source: 'aiven',
    data: {
      areas: areasRows.map(row => row.value).filter(Boolean),
      empresas: allowedEmpresas,
      usuarios,
      proyectos: proyectos
        .map(row => decorateProyectoRow({ proyecto: row.proyecto }))
        .filter(row => row.proyecto_codigo),
      equipos
    }
  });
}

async function getPendientes(req) {
  const user = currentUserRef(req);
  if (!user.correo) throw httpError('Sesión sin usuario válido.', 401);

  const rows = await pendientesRepository.listPendientes_gnral(null, {
    user,
    type: String(req.query.tipo || req.query.tipo_pendiente || '').trim().toUpperCase(),
    status: String(req.query.estatus || '').trim(),
    search: likeParam(req.query.search || req.query.buscar),
    limit: positiveInt(req.query.limit, 80, 1, 200)
  });

  const directRows = await pendientesFiles.repository.getActiveDirectFilesForTasks_gnral(
    db,
    rows.map(row => row.id_pendiente)
  );
  const grouped = pendientesFiles.groupDirectFilesByTask_gnral(directRows);
  const data = rows.map(row => {
    const archivosDirectos = grouped.get(String(row.id_pendiente)) || [];
    return {
      ...pendientesFiles.sanitizePendienteForClient_gnral(row, {
        directCount: archivosDirectos.length
      }),
      archivos_directos: archivosDirectos,
      evidencias_legacy: pendientesFiles.legacyFilesFromTask_gnral(row)
    };
  });

  return result(200, { ok: true, source: 'aiven', data });
}

async function getPendienteDetalle(req) {
  const id = Number.parseInt(req.params.id, 10);
  if (!id) throw httpError('No se recibió id de pendiente.', 400);

  const access = await pendientesAccess.getPendienteAccessContext_gnral(
    db,
    id,
    currentUserRef(req)
  );
  pendientesAccess.assertAccess_gnral(access);

  const subtareas = await pendientesRepository.listSubtasks_gnral(null, id);
  const usuarios = await pendientesRepository.listTaskUsers_gnral(null, id);
  const comentarios = await pendientesRepository.listTaskComments_gnral(null, id);
  const directRows = await pendientesFiles.repository.listDirectFiles_gnral(db, id);
  const commentAttachments = await pendientesFiles.repository.listCommentAttachments_gnral(
    db,
    comentarios.map(comment => comment.id_comentario)
  );
  const commentsWithFiles = pendientesFiles.attachCommentFiles_gnral(
    comentarios,
    commentAttachments,
    id
  );

  return result(200, {
    ok: true,
    source: 'aiven',
    data: {
      pendiente: pendientesFiles.sanitizePendienteForClient_gnral(access.row, {
        directCount: directRows.length
      }),
      subtareas,
      usuarios,
      comentarios: commentsWithFiles,
      archivos_directos: directRows.map(pendientesFiles.toDirectClientFile_gnral),
      evidencias_legacy: pendientesFiles.legacyFilesFromTask_gnral(access.row),
      permisos_contextuales: {
        puede_editar: access.creator,
        puede_eliminar: access.creator,
        puede_comentar: access.allowed,
        relacionado: access.related
      }
    }
  });
}

async function createPendiente(req) {
  const user = currentUserRef(req);
  const body = pendientesFiles.normalizeTaskBody_gnral(req.body || {});
  const pendiente = sanitizeText(body.pendiente, 255);
  const dueDate = normalizeOptionalDate(body.due_date);
  const evidence = req.cffaaTaskEvidence || pendientesFiles.extractTaskEvidence_gnral(req);

  if (!pendiente) throw httpError('El pendiente es obligatorio.', 400);
  if (!user.correo || !user.iniciales || !user.id) {
    throw httpError('Sesión sin usuario válido.', 401);
  }

  const empresa = await resolveTaskEmpresa_gnral(user, body.empresa);
  const conn = await pendientesRepository.getConnection_gnral();
  let uploadedEvidence = null;

  try {
    await conn.beginTransaction();
    const tipo = normalizeTaskType(body.tipo_pendiente);
    const id = await pendientesRepository.insertTask_gnral(conn, {
      pendiente,
      tipo_pendiente: tipo,
      estatus: normalizeTaskStatus(body.estatus),
      area: sanitizeText(body.area, 100) || null,
      empresa,
      descripcion: sanitizeText(body.descripcion) || null,
      creado_por_email: user.correo,
      creado_por_iniciales: user.iniciales,
      due_date: dueDate,
      proyecto: sanitizeText(body.proyecto, 255) || null,
      equipo: sanitizeText(body.equipo, 100) || null,
      con_subtareas: body.con_subtareas ? 1 : 0,
      prioridad: tipo === 'COLABORATIVA'
        ? normalizePriority(body.prioridad, null)
        : normalizePriority(body.prioridad, 'MEDIA')
    });

    const childrenResult = await syncPendienteChildren_gnral(
      conn,
      id,
      { ...body, tipo_pendiente: tipo },
      user
    );
    const notificationResult = await createTaskAssignmentNotifications_gnral(
      conn,
      id,
      { ...body, tipo_pendiente: tipo, pendiente },
      user
    );

    if (evidence) {
      uploadedEvidence = await pendientesFiles.uploadDirectEvidence_gnral({
        connection: conn,
        idPendiente: id,
        empresa,
        userId: user.id,
        evidence
      });
    }

    await conn.commit();
    return result(201, {
      ok: true,
      source: 'aiven',
      message: 'Pendiente creado correctamente.',
      id_pendiente: id,
      id_archivo: uploadedEvidence?.persisted?.id_archivo || null,
      notificaciones_creadas: notificationResult.inserted,
      notificaciones_destinatarios: notificationResult.recipients,
      autoasignacion_bloqueada: childrenResult.blockedSelfAssignment
    });
  } catch (error) {
    try { await conn.rollback(); } catch (_rollbackError) {}
    if (uploadedEvidence && uploadedEvidence.uploaded) {
      await pendientesFiles.cleanupUploaded_gnral(uploadedEvidence.uploaded, {
        entidad_tipo: 'pendiente_evidencia',
        solicitado_por: user.id,
        motivo: 'Rollback al crear una tarea.'
      });
    }
    throw error;
  } finally {
    conn.release();
  }
}

async function updatePendiente(req) {
  const id = Number.parseInt(req.params.id, 10);
  const user = currentUserRef(req);
  const body = pendientesFiles.normalizeTaskBody_gnral(req.body || {});
  const pendiente = sanitizeText(body.pendiente, 255);
  const dueDate = normalizeOptionalDate(body.due_date);
  const evidence = req.cffaaTaskEvidence || pendientesFiles.extractTaskEvidence_gnral(req);

  if (!id) throw httpError('No se recibió id de pendiente.', 400);
  if (!pendiente) throw httpError('El pendiente es obligatorio.', 400);
  if (!user.correo || !user.id) throw httpError('Sesión sin usuario válido.', 401);

  const conn = await pendientesRepository.getConnection_gnral();
  let uploadedEvidence = null;
  let referencesToDelete = [];

  try {
    await conn.beginTransaction();
    const access = await pendientesAccess.getPendienteAccessContext_gnral(
      conn,
      id,
      user,
      { forUpdate: true }
    );
    pendientesAccess.assertCreator_gnral(access, {
      creatorMessage: 'Solo el creador puede editar la configuración general de la tarea.'
    });

    const empresa = await resolveTaskEmpresa_gnral(user, body.empresa, access.row.empresa, conn);
    const oldResponsables = (await pendientesRepository.listTaskResponsibles_gnral(conn, id))
      .map(row => row.iniciales_usuario)
      .filter(Boolean);
    const tipo = normalizeTaskType(body.tipo_pendiente);

    await pendientesRepository.updateTask_gnral(conn, id, {
      pendiente,
      tipo_pendiente: tipo,
      area: sanitizeText(body.area, 100) || null,
      empresa,
      descripcion: sanitizeText(body.descripcion) || null,
      due_date: dueDate,
      proyecto: sanitizeText(body.proyecto, 255) || null,
      equipo: sanitizeText(body.equipo, 100) || null,
      con_subtareas: body.con_subtareas ? 1 : 0,
      prioridad: tipo === 'COLABORATIVA'
        ? normalizePriority(body.prioridad, null)
        : normalizePriority(body.prioridad, 'MEDIA')
    });

    const childrenResult = await syncPendienteChildren_gnral(
      conn,
      id,
      { ...body, tipo_pendiente: tipo },
      user
    );
    const notificationResult = await createTaskAssignmentNotifications_gnral(
      conn,
      id,
      { ...body, tipo_pendiente: tipo, pendiente },
      user,
      oldResponsables
    );

    if (evidence) {
      uploadedEvidence = await pendientesFiles.uploadDirectEvidence_gnral({
        connection: conn,
        idPendiente: id,
        empresa,
        userId: user.id,
        evidence
      });
      referencesToDelete = [
        ...(uploadedEvidence?.persisted?.previous || []),
        ...pendientesFiles.legacyAzureReferences_gnral(access.row)
      ];
      await pendientesRepository.clearLegacyEvidence_gnral(conn, id);
    }

    await conn.commit();
    const cleanup = referencesToDelete.length
      ? await pendientesFiles.deleteReferencesAfterCommit_gnral(referencesToDelete, {
          entidad_tipo: 'pendiente_evidencia',
          entidad_id: id,
          solicitado_por: user.id,
          motivo: 'Sustitución de evidencia directa de una tarea.'
        })
      : null;

    return result(200, {
      ok: true,
      source: 'aiven',
      message: 'Pendiente actualizado correctamente.',
      id_archivo: uploadedEvidence?.persisted?.id_archivo || null,
      limpieza_archivos: cleanup,
      notificaciones_creadas: notificationResult.inserted,
      notificaciones_destinatarios: notificationResult.recipients,
      autoasignacion_bloqueada: childrenResult.blockedSelfAssignment
    });
  } catch (error) {
    try { await conn.rollback(); } catch (_rollbackError) {}
    if (uploadedEvidence && uploadedEvidence.uploaded) {
      await pendientesFiles.cleanupUploaded_gnral(uploadedEvidence.uploaded, {
        entidad_tipo: 'pendiente_evidencia',
        entidad_id: id,
        solicitado_por: user.id,
        motivo: 'Rollback al actualizar una tarea.'
      });
    }
    throw error;
  } finally {
    conn.release();
  }
}

async function updatePendientePrioridad(req) {
  const id = Number.parseInt(req.params.id, 10);
  const user = currentUserRef(req);
  if (!id) throw httpError('No se recibio id de pendiente.', 400);

  const row = await pendientesRepository.getPriorityContext_gnral(null, id, user.iniciales);
  if (!row) throw httpError('Pendiente no encontrado.', 404);

  const isResponsible = Boolean(row.iniciales_usuario);
  const isCreator = user.correo && row.creado_por_email === user.correo;
  if (row.tipo_pendiente === 'COLABORATIVA' && !isResponsible) {
    throw httpError(
      'Solo un responsable puede definir la prioridad de una tarea colaborativa.',
      403
    );
  }
  if (row.tipo_pendiente !== 'COLABORATIVA' && !isCreator) {
    throw httpError('Solo el creador puede cambiar la prioridad de una tarea personal.', 403);
  }

  const prioridad = normalizePriority(req.body?.prioridad, null);
  const updateResult = await pendientesRepository.updatePriority_gnral(null, id, prioridad);
  if (!updateResult.affectedRows) throw httpError('Pendiente no encontrado.', 404);
  return result(200, { ok: true, source: 'aiven', message: 'Prioridad actualizada correctamente.' });
}

async function updatePendienteEstatus(req) {
  const id = Number.parseInt(req.params.id, 10);
  const user = currentUserRef(req);
  if (!id) throw httpError('No se recibio id de pendiente.', 400);
  if (!user.correo) throw httpError('Sesion sin usuario valido.', 401);

  const row = await pendientesRepository.getCreatorEmail_gnral(null, id);
  if (!row) throw httpError('Pendiente no encontrado.', 404);
  if (row.creado_por_email !== user.correo) {
    throw httpError('Solo el creador puede cambiar el estatus de la tarea.', 403);
  }

  const updateResult = await pendientesRepository.updateStatus_gnral(
    null,
    id,
    normalizeTaskStatus(req.body?.estatus)
  );
  if (!updateResult.affectedRows) throw httpError('Pendiente no encontrado.', 404);
  return result(200, { ok: true, source: 'aiven', message: 'Estatus actualizado correctamente.' });
}

async function createPendienteComentario(req) {
  const id = Number.parseInt(req.params.id, 10);
  const user = currentUserRef(req);
  const comentario = sanitizeText(req.body?.comentario);
  const commentFile = pendientesFiles.extractCommentFile_gnral(req);

  if (!id) throw httpError('No se recibió id de pendiente.', 400);
  if (!comentario && !commentFile) {
    throw httpError('Escribe un comentario o selecciona un archivo.', 400);
  }
  if (!user.id) throw httpError('Sesión sin usuario válido.', 401);

  const conn = await pendientesRepository.getConnection_gnral();
  let uploadedAttachment = null;

  try {
    await conn.beginTransaction();
    const access = await pendientesAccess.getPendienteAccessContext_gnral(conn, id, user);
    pendientesAccess.assertAccess_gnral(access, {
      forbiddenMessage: 'No tienes permiso para comentar esta tarea.'
    });

    const taskEmpresa = commentFile
      ? await resolveStoredTaskEmpresa_gnral(conn, access.row)
      : null;
    const idComentario = await pendientesRepository.insertComment_gnral(conn, {
      idPendiente: id,
      idUsuario: user.id,
      comentario: comentario || ''
    });

    if (commentFile) {
      uploadedAttachment = await pendientesFiles.uploadCommentAttachment_gnral({
        connection: conn,
        idPendiente: id,
        idComentario,
        empresa: taskEmpresa,
        userId: user.id,
        file: commentFile
      });
    }

    const notificaciones = await createPendienteCommentNotifications_gnral(conn, access, user, {
      comentario,
      nombre_archivo: commentFile && commentFile.originalname
    });
    await conn.commit();

    return result(201, {
      ok: true,
      source: 'aiven',
      message: commentFile ? 'Interacción agregada correctamente.' : 'Comentario agregado correctamente.',
      id_comentario: idComentario,
      id_adjunto: uploadedAttachment?.persisted?.id_adjunto || null,
      notificaciones
    });
  } catch (error) {
    try { await conn.rollback(); } catch (_rollbackError) {}
    if (uploadedAttachment && uploadedAttachment.uploaded) {
      await pendientesFiles.cleanupUploaded_gnral(uploadedAttachment.uploaded, {
        entidad_tipo: 'pendiente_comentario',
        entidad_id: id,
        solicitado_por: user.id,
        motivo: 'Rollback al crear una interacción de tarea.'
      });
    }
    throw error;
  } finally {
    conn.release();
  }
}

async function updatePendienteSubtarea(req) {
  const id = Number.parseInt(req.params.id, 10);
  const idSubtarea = Number.parseInt(req.params.idSubtarea, 10);
  const user = currentUserRef(req);
  if (!id || !idSubtarea) throw httpError('No se recibió id de subtarea.', 400);

  const access = await pendientesAccess.getPendienteAccessContext_gnral(db, id, user);
  pendientesAccess.assertAccess_gnral(access, {
    forbiddenMessage: 'No tienes permiso para actualizar esta subtarea.'
  });

  const estatus = String(req.body?.estatus || '').trim() === 'Cerrado'
    ? 'Cerrado'
    : 'Pendiente';
  const updateResult = await pendientesRepository.updateSubtaskStatus_gnral(null, {
    idPendiente: id,
    idSubtarea,
    status: estatus
  });
  if (!updateResult.affectedRows) throw httpError('Subtarea no encontrada.', 404);
  return result(200, { ok: true, source: 'aiven', message: 'Subtarea actualizada correctamente.' });
}

async function deletePendiente(req) {
  const id = Number.parseInt(req.params.id, 10);
  const user = currentUserRef(req);
  if (!id) throw httpError('No se recibió id de pendiente.', 400);
  if (!user.correo || !user.id) throw httpError('Sesión sin usuario válido.', 401);

  const conn = await pendientesRepository.getConnection_gnral();
  let references = [];

  try {
    await conn.beginTransaction();
    const access = await pendientesAccess.getPendienteAccessContext_gnral(
      conn,
      id,
      user,
      { forUpdate: true }
    );
    pendientesAccess.assertCreator_gnral(access, {
      creatorMessage: 'Solo el creador puede eliminar la tarea.'
    });

    references = [
      ...(await pendientesFiles.repository.listTaskAzureReferences_gnral(conn, id)),
      ...pendientesFiles.legacyAzureReferences_gnral(access.row)
    ];

    await pendientesRepository.deleteTaskNotifications_gnral(conn, id);
    await pendientesRepository.deleteTask_gnral(conn, id);
    await conn.commit();

    const cleanup = await pendientesFiles.deleteReferencesAfterCommit_gnral(references, {
      entidad_tipo: 'pendiente',
      entidad_id: id,
      solicitado_por: user.id,
      motivo: 'Eliminación completa de una tarea y sus archivos.'
    });

    return result(200, {
      ok: true,
      source: 'aiven',
      message: 'Tarea eliminada correctamente.',
      limpieza_storage: cleanup
    });
  } catch (error) {
    try { await conn.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = {
  getPendientesCatalogos,
  getPendientes,
  getPendienteDetalle,
  createPendiente,
  updatePendiente,
  deletePendiente,
  updatePendienteEstatus,
  updatePendientePrioridad,
  createPendienteComentario,
  updatePendienteSubtarea
};
