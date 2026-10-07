'use strict';

// [Aster | 2026-10-07 | ASTER-MG | FASE 1 ENTREGAS V001]
// Adaptacion productiva de LAB INT-7. Aiven es fuente operativa y los archivos
// se almacenan en Azure Blob privado mediante el contrato CFFAA existente.

const db = require('../../config/db');
const azureStorage = require('../../services/storage/azure-storage.service');
const storageContract = require('../../services/storage/storage-contract.service');
const storageAccess = require('../../services/storage/storage-access.service');
const filePolicy = require('../../services/storage/storage-file-policy.service');
const repository = require('./entregas-control.repository');

const TIPOS_RECURRENCIA_GNRAL = Object.freeze(['UNICA', 'SEMANAL', 'QUINCENAL', 'MENSUAL']);
const HORIZONTE_OCURRENCIAS_GNRAL = 12;

const PERMISSIONS_GNRAL = Object.freeze({
  acceso_visual: 'ENTREGAS_CONTROL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  programadas_ver: 'ENTREGAS_CONTROL_PROGRAMADAS_LISTADO.VER',
  programadas_crear: 'ENTREGAS_CONTROL_PROGRAMADAS_LISTADO.CREAR',
  programadas_editar: 'ENTREGAS_CONTROL_PROGRAMADAS_LISTADO.EDITAR',
  programadas_desactivar: 'ENTREGAS_CONTROL_PROGRAMADAS_LISTADO.DESACTIVAR',
  mis_entregas_ver: 'ENTREGAS_CONTROL_MIS_ENTREGAS_LISTADO.VER',
  mis_entregas_adjuntar: 'ENTREGAS_CONTROL_MIS_ENTREGAS_LISTADO.ADJUNTAR_ARCHIVO',
  validacion_ver: 'ENTREGAS_CONTROL_VALIDACION_LISTADO.VER',
  validacion_validar: 'ENTREGAS_CONTROL_VALIDACION_LISTADO.VALIDAR',
  indicadores_ver: 'ENTREGAS_CONTROL_INDICADORES_PANEL.VER'
});

function httpError_gnral(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.statusCode = status;
  error.code = code || 'ENTREGAS_ERROR';
  error.expose = true;
  return error;
}

function positiveId_gnral(value, field = 'id') {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw httpError_gnral(400, `${field} debe ser un entero positivo.`, 'ENTREGAS_INVALID_ID');
  }
  return parsed;
}

function maybePositiveId_gnral(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function text_gnral(value, max = 2000, fallback = null) {
  const normalized = value == null ? '' : String(value).trim();
  return normalized ? normalized.slice(0, max) : fallback;
}

function dateOnly_gnral(value) {
  const normalized = text_gnral(value, 10, null);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) return null;
  return normalized;
}

function mexicoParts_gnral(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: byType.year,
    month: byType.month,
    day: byType.day,
    hour: byType.hour,
    minute: byType.minute,
    second: byType.second
  };
}

function todayMexico_gnral() {
  const p = mexicoParts_gnral();
  return `${p.year}-${p.month}-${p.day}`;
}

function nowMexicoSql_gnral() {
  const p = mexicoParts_gnral();
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function addDays_gnral(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths_gnral(dateStr, months) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(year, (month - 1) + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

function nextOccurrenceDate_gnral(type, baseDate, occurrence) {
  if (occurrence <= 1) return baseDate;
  const steps = occurrence - 1;
  if (type === 'SEMANAL') return addDays_gnral(baseDate, 7 * steps);
  if (type === 'QUINCENAL') return addDays_gnral(baseDate, 15 * steps);
  if (type === 'MENSUAL') return addMonths_gnral(baseDate, steps);
  return baseDate;
}

function deliveryState_gnral(instance, today = todayMexico_gnral()) {
  const deliveredDay = text_gnral(instance && instance.fecha_entrega_dia, 10, null);
  const deadline = text_gnral(instance && instance.fecha_limite, 10, null);
  if (deliveredDay) return deliveredDay <= deadline ? 'A_TIEMPO' : 'TARDE';
  return deadline && deadline < today ? 'NO_ENTREGADO' : 'PENDIENTE';
}

function validationState_gnral(instance) {
  if (Number(instance && instance.validado) === 1) return 'VALIDO';
  if (instance && instance.validado !== null && instance.validado !== undefined && Number(instance.validado) === 0) return 'RECHAZADO';
  return instance && instance.fecha_entrega ? 'SIN_REVISAR' : 'NO_APLICA';
}

function enrichInstance_gnral(instance) {
  return {
    ...(instance || {}),
    estado_entrega: deliveryState_gnral(instance),
    estado_validacion: validationState_gnral(instance)
  };
}

function summarizeInstances_gnral(instances) {
  const enriched = (instances || []).map(enrichInstance_gnral);
  const count = { A_TIEMPO: 0, TARDE: 0, NO_ENTREGADO: 0, PENDIENTE: 0 };
  for (const item of enriched) count[item.estado_entrega] = (count[item.estado_entrega] || 0) + 1;
  const expired = count.A_TIEMPO + count.TARDE + count.NO_ENTREGADO;
  return {
    instancias: enriched,
    total: enriched.length,
    pct_a_tiempo: expired ? Math.round(100 * count.A_TIEMPO / expired) : null,
    pct_general: expired ? Math.round(100 * (count.A_TIEMPO + count.TARDE) / expired) : null,
    pct_no_entregado: expired ? Math.round(100 * count.NO_ENTREGADO / expired) : null,
    conteo: count
  };
}

function assertOwner_gnral(programmed, userId) {
  if (!programmed || Number(programmed.id_responsable) !== Number(userId)) {
    throw httpError_gnral(403, 'Solo quien programó esta entrega puede realizar esta acción.', 'ENTREGAS_OWNER_REQUIRED');
  }
}

function assertCollaborator_gnral(instance, userId) {
  if (!instance || Number(instance.id_colaborador) !== Number(userId)) {
    throw httpError_gnral(403, 'Solo el colaborador asignado puede cargar el archivo de esta entrega.', 'ENTREGAS_COLLABORATOR_REQUIRED');
  }
}

async function opciones_gnral() {
  return {
    usuarios: await repository.listActiveUsers_gnral(db),
    tipos_recurrencia: [...TIPOS_RECURRENCIA_GNRAL]
  };
}

async function detalleProgramadaInternal_gnral(executor, userId, idProgramada) {
  const programmed = await repository.getProgramadaById_gnral(executor, idProgramada);
  if (!programmed) throw httpError_gnral(404, 'Entrega programada no encontrada.', 'ENTREGAS_PROGRAMADA_NOT_FOUND');
  assertOwner_gnral(programmed, userId);
  const instances = await repository.listInstanciasByProgramada_gnral(executor, idProgramada);
  return { programada: programmed, ...summarizeInstances_gnral(instances) };
}

async function crearProgramada_gnral(userId, body = {}) {
  const uid = positiveId_gnral(userId, 'usuario');
  const title = text_gnral(body.titulo, 255, null);
  if (!title) throw httpError_gnral(400, 'El título de la entrega es obligatorio.', 'ENTREGAS_TITULO_REQUIRED');

  const collaboratorId = positiveId_gnral(body.id_colaborador, 'colaborador');
  const recurrence = text_gnral(body.tipo_recurrencia, 20, null);
  if (!TIPOS_RECURRENCIA_GNRAL.includes(recurrence)) {
    throw httpError_gnral(400, 'tipo_recurrencia debe ser UNICA, SEMANAL, QUINCENAL o MENSUAL.', 'ENTREGAS_RECURRENCIA_INVALIDA');
  }
  const startDate = dateOnly_gnral(body.fecha_inicio);
  if (!startDate) throw httpError_gnral(400, 'La fecha inicial es obligatoria y debe usar AAAA-MM-DD.', 'ENTREGAS_FECHA_INVALIDA');
  const description = text_gnral(body.descripcion, 5000, null);

  const conn = await db.getConnection();
  let idProgramada = null;
  try {
    await conn.beginTransaction();
    const collaborator = await repository.getActiveUserById_gnral(conn, collaboratorId);
    if (!collaborator) throw httpError_gnral(404, 'El colaborador no existe o está inactivo.', 'ENTREGAS_COLABORADOR_NOT_FOUND');

    idProgramada = await repository.insertProgramada_gnral(conn, {
      id_responsable: uid,
      id_colaborador: collaboratorId,
      titulo: title,
      descripcion: description,
      tipo_recurrencia: recurrence,
      fecha_inicio: startDate,
      created_by: uid
    });

    const total = recurrence === 'UNICA' ? 1 : HORIZONTE_OCURRENCIAS_GNRAL;
    const instances = [];
    for (let occurrence = 1; occurrence <= total; occurrence += 1) {
      instances.push({
        numero_ocurrencia: occurrence,
        fecha_limite: nextOccurrenceDate_gnral(recurrence, startDate, occurrence)
      });
    }
    await repository.insertInstancias_gnral(conn, idProgramada, instances);
    await conn.commit();
  } catch (error) {
    try { await conn.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    conn.release();
  }

  return detalleProgramadaInternal_gnral(db, uid, idProgramada);
}

async function listarProgramadas_gnral(userId, query = {}) {
  const uid = positiveId_gnral(userId, 'usuario');
  const rows = await repository.listProgramadasByResponsable_gnral(db, uid, {
    includeInactive: String(query.incluir_inactivas || '') === '1',
    idColaborador: maybePositiveId_gnral(query.id_colaborador)
  });

  const output = [];
  for (const programmed of rows) {
    const instances = await repository.listInstanciasByProgramada_gnral(db, programmed.id_entrega_programada);
    const summary = summarizeInstances_gnral(instances);
    output.push({
      ...programmed,
      total_instancias: summary.total,
      pct_a_tiempo: summary.pct_a_tiempo,
      pct_general: summary.pct_general,
      pct_no_entregado: summary.pct_no_entregado,
      conteo: summary.conteo
    });
  }
  return { total: output.length, programadas: output };
}

async function detalleProgramada_gnral(userId, idProgramada) {
  return detalleProgramadaInternal_gnral(db, positiveId_gnral(userId, 'usuario'), positiveId_gnral(idProgramada, 'id_entrega_programada'));
}

async function desactivarProgramada_gnral(userId, idProgramada) {
  const uid = positiveId_gnral(userId, 'usuario');
  const pid = positiveId_gnral(idProgramada, 'id_entrega_programada');
  const programmed = await repository.getProgramadaById_gnral(db, pid);
  if (!programmed) throw httpError_gnral(404, 'Entrega programada no encontrada.', 'ENTREGAS_PROGRAMADA_NOT_FOUND');
  assertOwner_gnral(programmed, uid);
  await repository.deactivateProgramada_gnral(db, pid);
  return { id_entrega_programada: pid, activo: false };
}

async function misEntregas_gnral(userId, query = {}) {
  const uid = positiveId_gnral(userId, 'usuario');
  let rows = (await repository.listMisEntregas_gnral(db, uid)).map(enrichInstance_gnral);
  const state = text_gnral(query.estado_entrega, 30, null);
  if (state) rows = rows.filter(row => row.estado_entrega === state);
  return { total: rows.length, instancias: rows };
}

async function cleanupPreviousBlob_gnral(reference, context) {
  if (!reference || !reference.storage_blob_name) return null;
  try {
    const result = await azureStorage.deleteBlob_gnral(reference.storage_blob_name, {
      containerName: reference.storage_container || undefined,
      queueOnFailure: true,
      queueContext: context
    });
    return { completed: Boolean(result && result.deleted), queued_operation_id: null };
  } catch (error) {
    return {
      completed: false,
      queued_operation_id: error.queue_operation_id || null,
      error: error.message
    };
  }
}

async function subirArchivo_gnral(userId, idInstancia, file) {
  const uid = positiveId_gnral(userId, 'usuario');
  const iid = positiveId_gnral(idInstancia, 'id_instancia');
  if (!file) throw httpError_gnral(400, 'Selecciona un archivo.', 'ENTREGAS_ARCHIVO_REQUIRED');
  filePolicy.validateFile_gnral(file, { policyName: 'GENERAL' });

  const initial = await repository.getInstanciaContext_gnral(db, iid);
  if (!initial) throw httpError_gnral(404, 'Entrega no encontrada.', 'ENTREGAS_INSTANCIA_NOT_FOUND');
  assertCollaborator_gnral(initial, uid);
  if (Number(initial.programada_activa) !== 1) {
    throw httpError_gnral(409, 'La entrega programada está inactiva.', 'ENTREGAS_PROGRAMADA_INACTIVA');
  }

  const result = await storageContract.uploadAndPersist_gnral({
    upload: {
      file,
      empresa: 'BLT',
      modulo: 'entregas',
      entidadTipo: 'instancia',
      entidadId: iid,
      subruta: `programada-${initial.id_entrega_programada}`,
      policyName: 'GENERAL',
      metadata: {
        uploaded_by: uid,
        programada_id: initial.id_entrega_programada,
        instancia_id: iid
      }
    },
    persist: async uploaded => {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const locked = await repository.getInstanciaContext_gnral(conn, iid, { forUpdate: true });
        if (!locked) throw httpError_gnral(404, 'Entrega no encontrada.', 'ENTREGAS_INSTANCIA_NOT_FOUND');
        assertCollaborator_gnral(locked, uid);
        if (Number(locked.programada_activa) !== 1) {
          throw httpError_gnral(409, 'La entrega programada está inactiva.', 'ENTREGAS_PROGRAMADA_INACTIVA');
        }

        const previous = locked.storage_blob_name ? {
          storage_blob_name: locked.storage_blob_name,
          storage_container: locked.storage_container || null
        } : null;

        await repository.updateInstanciaArchivo_gnral(conn, iid, {
          fecha_entrega: nowMexicoSql_gnral(),
          nombre_archivo: uploaded.nombre_original,
          mime_type: uploaded.mime_type,
          tamano_bytes: uploaded.tamano_bytes,
          storage_provider: uploaded.storage_provider,
          storage_container: uploaded.storage_container,
          storage_blob_name: uploaded.storage_blob_name,
          entregado_por: uid
        });
        await conn.commit();
        return { previous };
      } catch (error) {
        try { await conn.rollback(); } catch (_rollbackError) {}
        throw error;
      } finally {
        conn.release();
      }
    },
    cleanupContext: {
      modulo: 'entregas',
      entidadTipo: 'instancia',
      entidadId: iid,
      solicitadoPor: uid,
      motivo: 'Compensación de archivo de Entregas no persistido.'
    }
  });

  const previous = result.persisted && result.persisted.previous;
  const cleanup = previous && previous.storage_blob_name !== result.uploaded.storage_blob_name
    ? await cleanupPreviousBlob_gnral(previous, {
        modulo: 'entregas',
        entidadTipo: 'instancia',
        entidadId: iid,
        solicitadoPor: uid,
        motivo: 'Reemplazo de archivo de Entregas.'
      })
    : null;

  const updated = await repository.getInstanciaContext_gnral(db, iid);
  return { instancia: enrichInstance_gnral(updated), limpieza_anterior: cleanup };
}

async function archivoAcceso_gnral(req, idInstancia) {
  const iid = positiveId_gnral(idInstancia, 'id_instancia');
  const instance = await repository.getInstanciaContext_gnral(db, iid);
  if (!instance) throw httpError_gnral(404, 'Entrega no encontrada.', 'ENTREGAS_INSTANCIA_NOT_FOUND');
  if (!instance.storage_blob_name || String(instance.storage_provider || '').toUpperCase() !== 'AZURE_BLOB') {
    throw httpError_gnral(404, 'Esta entrega todavía no tiene un archivo disponible.', 'ENTREGAS_SIN_ARCHIVO');
  }

  const contextUser = req.contextUser || req.user;
  const currentUserId = positiveId_gnral(contextUser && (contextUser.id_SB || contextUser.id || contextUser.user_id), 'usuario');
  const allowed = currentUserId === Number(instance.id_colaborador) || currentUserId === Number(instance.id_responsable);
  if (!allowed) throw httpError_gnral(403, 'No tienes acceso al archivo de esta entrega.', 'ENTREGAS_ARCHIVO_FORBIDDEN');

  return storageAccess.createReadAccess_gnral({
    actorUser: req.actorUser || req.user,
    contextUser,
    reference: {
      storage_provider: instance.storage_provider,
      storage_container: instance.storage_container,
      storage_blob_name: instance.storage_blob_name,
      nombre_original: instance.nombre_archivo,
      mime_type: instance.mime_type,
      tamano_bytes: instance.tamano_bytes,
      activo: 1
    },
    context: {
      modulo: 'entregas',
      entidadTipo: 'instancia',
      entidadId: iid,
      archivoId: iid
    },
    authorize: async () => ({ allowed: true, metadata: { rol_entrega: currentUserId === Number(instance.id_responsable) ? 'RESPONSABLE' : 'COLABORADOR' } }),
    download: String(req.query && req.query.download || '').toLowerCase() === 'true'
  });
}

async function validacionPendiente_gnral(userId) {
  const uid = positiveId_gnral(userId, 'usuario');
  const rows = (await repository.listValidacionPendiente_gnral(db, uid)).map(enrichInstance_gnral);
  return { total: rows.length, instancias: rows };
}

function parseValidation_gnral(value) {
  if (value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true') return 1;
  if (value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false') return 0;
  throw httpError_gnral(400, 'El campo valido debe indicar true o false.', 'ENTREGAS_VALIDACION_REQUIRED');
}

async function validar_gnral(userId, idInstancia, body = {}) {
  const uid = positiveId_gnral(userId, 'usuario');
  const iid = positiveId_gnral(idInstancia, 'id_instancia');
  const instance = await repository.getInstanciaContext_gnral(db, iid);
  if (!instance) throw httpError_gnral(404, 'Entrega no encontrada.', 'ENTREGAS_INSTANCIA_NOT_FOUND');
  if (Number(instance.id_responsable) !== uid) {
    throw httpError_gnral(403, 'Solo quien programó esta entrega puede validarla.', 'ENTREGAS_VALIDATOR_REQUIRED');
  }
  if (!instance.fecha_entrega || !instance.storage_blob_name) {
    throw httpError_gnral(409, 'La entrega todavía no tiene archivo cargado para validar.', 'ENTREGAS_SIN_ARCHIVO');
  }

  const valid = parseValidation_gnral(body.valido);
  const comment = text_gnral(body.comentario, 2000, null);
  await repository.updateValidacion_gnral(db, iid, {
    validado: valid,
    validado_por: uid,
    fecha_validacion: nowMexicoSql_gnral(),
    comentario_validacion: comment
  });
  return enrichInstance_gnral(await repository.getInstanciaContext_gnral(db, iid));
}

async function indicadores_gnral(userId) {
  const uid = positiveId_gnral(userId, 'usuario');
  const rows = await repository.listIndicadoresRows_gnral(db, uid);
  const general = summarizeInstances_gnral(rows);
  const grouped = new Map();

  for (const row of rows) {
    const key = Number(row.id_colaborador);
    if (!grouped.has(key)) grouped.set(key, { id_colaborador: key, nombre: row.colaborador_nombre, instancias: [] });
    grouped.get(key).instancias.push(row);
  }

  const byCollaborator = [...grouped.values()].map(group => {
    const summary = summarizeInstances_gnral(group.instancias);
    return {
      id_colaborador: group.id_colaborador,
      nombre: group.nombre,
      total: summary.total,
      pct_a_tiempo: summary.pct_a_tiempo,
      pct_general: summary.pct_general,
      pct_no_entregado: summary.pct_no_entregado,
      conteo: summary.conteo
    };
  }).sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));

  return {
    total: general.total,
    pct_a_tiempo: general.pct_a_tiempo,
    pct_general: general.pct_general,
    pct_no_entregado: general.pct_no_entregado,
    conteo: general.conteo,
    por_colaborador: byCollaborator
  };
}

module.exports = Object.freeze({
  PERMISSIONS_GNRAL,
  TIPOS_RECURRENCIA_GNRAL,
  HORIZONTE_OCURRENCIAS_GNRAL,
  todayMexico_gnral,
  nowMexicoSql_gnral,
  nextOccurrenceDate_gnral,
  deliveryState_gnral,
  validationState_gnral,
  summarizeInstances_gnral,
  opciones_gnral,
  crearProgramada_gnral,
  listarProgramadas_gnral,
  detalleProgramada_gnral,
  desactivarProgramada_gnral,
  misEntregas_gnral,
  subirArchivo_gnral,
  archivoAcceso_gnral,
  validacionPendiente_gnral,
  validar_gnral,
  indicadores_gnral
});
