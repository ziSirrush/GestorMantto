'use strict';

// [BLT NOW | 2026-10-20 | INSTALACIONES ADMINISTRACION ALTAS FASE 1 V001]
// Alta humana, individual (1) o multiple (hasta 20), atomica y auditada.
// Reutiliza ins_fl, Guard CORELLIAN, permisos y motor de alcance existentes.
// Fases 2-4: interfaz, formulas nuevas e integracion con GAS.

const db = require('../../config/db');
const visibilityService = require('../ventas/ventas-visibility.service');
const service = require('./instalaciones-administracion.service');
const autoService = require('./instalaciones-administracion.auto-service');
const auditService = require('./instalaciones-administracion.audit-service');
const interactionsService = require('../../services/interactions/interactions.service');
const { GROUPS_COR, ALL_OPERATIONAL_FIELDS_COR } =
  require('./instalaciones-administracion.constants');
const { knownError_cor, normalizeGroupUpdate_cor } =
  require('./instalaciones-administracion.validation');
const { normalizeEditedFields_cor } =
  require('./instalaciones-administracion.field-policy');
const rules = require('./instalaciones-administracion.auto-rules');
const persisted = require('./instalaciones-administracion-altas-persist');
const origin = require('./instalaciones-administracion-altas-origin');

const MAX_ROWS_COR = 20;
const REQUIRED_COR = Object.freeze(['proyecto', 'id_proyecto', 'referencia_sitio']);
const FIELD_GROUP_COR = new Map(Object.entries(GROUPS_COR).flatMap(
  ([group, definition]) => definition.fields.map(field => [field, group])
));
const VALID_FIELDS_COR = new Set(ALL_OPERATIONAL_FIELDS_COR);
const DEFERRED_FORMULAS_COR = Object.freeze([
  'meses_garantia_restantes',
  'fecha_fin_montaje_real',
  'fecha_fin_ajuste_real',
  'anio_termino',
  'costo_mensual_mantenimiento_cem'
]);
const NOT_INPUT_COR = new Set([
  // id_proyecto es inmutable al editar, pero obligatorio al dar de alta.
  ...rules.DIRECT_READONLY_FIELDS_COR.filter(field => field !== 'id_proyecto'),
  ...DEFERRED_FORMULAS_COR
]);

function objectCor(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function errorCor(status, code, message, details) {
  return knownError_cor(status, code, message, details);
}

function canonicalCor(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').toLocaleUpperCase('es-MX');
}

function requiredTextCor(row, field, index) {
  const text = String(row[field] == null ? '' : row[field]).trim();
  if (!text || ['-', 'NULL', 'N/A', 'N/D', 'SIN PP NS'].includes(canonicalCor(text))) {
    throw errorCor(400, 'INSTALACIONES_ADMIN_ALTA_IDENTIDAD_REQUERIDA',
      `Fila ${index + 1}: proyecto, PP NS y referencia en sitio son obligatorios.`, {index, field});
  }
  return text;
}

function normalizeRowCor(raw, index) {
  if (!objectCor(raw)) {
    throw errorCor(400, 'INSTALACIONES_ADMIN_ALTA_FILA_INVALIDA',
      `Fila ${index + 1}: se requiere un objeto de campos.`, {index});
  }
  const received = Object.keys(raw);
  if (received.length > ALL_OPERATIONAL_FIELDS_COR.length) {
    throw errorCor(400, 'INSTALACIONES_ADMIN_ALTA_CAMPOS_INVALIDOS',
      `Fila ${index + 1}: demasiadas columnas.`, {index});
  }
  const grouped = new Map();
  for (const field of received) {
    if (!VALID_FIELDS_COR.has(field)) {
      throw errorCor(400, 'INSTALACIONES_ADMIN_ALTA_CAMPO_INVALIDO',
        `Fila ${index + 1}: campo no permitido.`, {index, field});
    }
    if (NOT_INPUT_COR.has(field)) {
      throw errorCor(400, 'INSTALACIONES_ADMIN_ALTA_CAMPO_RESERVADO',
        `Fila ${index + 1}: campo tecnico, calculado o pendiente de Fase 3.`, {index, field});
    }
    const group = FIELD_GROUP_COR.get(field);
    if (!group) throw errorCor(400, 'INSTALACIONES_ADMIN_ALTA_CAMPO_INVALIDO',
      `Fila ${index + 1}: campo sin grupo autorizado.`, {index, field});
    if (!grouped.has(group)) grouped.set(group, {});
    grouped.get(group)[field] = raw[field];
  }
  for (const field of REQUIRED_COR) {
    if (!Object.prototype.hasOwnProperty.call(raw, field)) {
      throw errorCor(400, 'INSTALACIONES_ADMIN_ALTA_IDENTIDAD_REQUERIDA',
        `Fila ${index + 1}: falta el identificador de proyecto/equipo.`, {index, field});
    }
    requiredTextCor(raw, field, index);
  }
  const normalized = {};
  for (const [group, changes] of grouped) {
    Object.assign(normalized, normalizeEditedFields_cor(
      normalizeGroupUpdate_cor(group, {changes})
    ));
  }
  for (const field of REQUIRED_COR) {
    if (normalized[field] === null || typeof normalized[field] !== 'string' || !normalized[field].trim()) {
      throw errorCor(400, 'INSTALACIONES_ADMIN_ALTA_IDENTIDAD_REQUERIDA',
        `Fila ${index + 1}: identificador vacio.`, {index, field});
    }
  }
  if (normalized.estatus !== undefined && normalized.estatus !== null &&
      !rules.STATUS_CODES_COR.includes(normalized.estatus)) {
    throw errorCor(400, 'INSTALACIONES_ADMIN_ALTA_ESTATUS_INVALIDO',
      `Fila ${index + 1}: estatus fuera de los ocho valores autorizados.`, {index, field:'estatus'});
  }
  // El dato tecnico no depende de una columna enviada por el navegador.
  normalized.activo = 1;
  return normalized;
}

function normalizeRowsCor(body) {
  if (!objectCor(body) || Object.keys(body).some(key => key !== 'rows') ||
      !Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > MAX_ROWS_COR) {
    throw errorCor(400, 'INSTALACIONES_ADMIN_ALTA_LOTE_INVALIDO',
      `Se requiere rows con 1 a ${MAX_ROWS_COR} equipos.`);
  }
  const rows = body.rows.map(normalizeRowCor);
  const projectNames = new Map();
  const identities = new Set();
  rows.forEach((row, index) => {
    const project = canonicalCor(row.id_proyecto);
    const name = canonicalCor(row.proyecto);
    const reference = canonicalCor(row.referencia_sitio);
    const key = JSON.stringify([project, reference]);
    if (identities.has(key)) throw errorCor(409,
      'INSTALACIONES_ADMIN_ALTA_DUPLICADO_LOTE',
      `Fila ${index + 1}: la referencia esta repetida dentro del mismo PP NS.`, {index});
    identities.add(key);
    if (projectNames.has(project) && projectNames.get(project) !== name) {
      throw errorCor(409, 'INSTALACIONES_ADMIN_ALTA_PROYECTO_AMBIGUO',
        `Fila ${index + 1}: un PP NS no puede representar proyectos distintos dentro del lote.`, {index});
    }
    projectNames.set(project, name);
  });
  return rows;
}

function assertScopeCor(scope, row) {
  if (scope && scope.mode === 'ALL') return;
  if (!scope || scope.mode !== 'LIMITED') {
    throw errorCor(403, 'INSTALACIONES_ADMIN_ALTA_ALCANCE_INVALIDO',
      'No se pudo comprobar el alcance CORELLIAN de alta.');
  }
  const allowed = new Set((Array.isArray(scope.advisorIds) ? scope.advisorIds : [])
    .map(Number).filter(id => Number.isSafeInteger(id) && id > 0));
  if (!allowed.size || !['id_sup', 'id_asesor', 'id_admin']
    .some(field => Number.isSafeInteger(Number(row[field])) && allowed.has(Number(row[field])))) {
    throw errorCor(403, 'INSTALACIONES_ADMIN_ALTA_FUERA_DE_ALCANCE',
      'El equipo no quedaria dentro de tu alcance CORELLIAN. Asigna un responsable autorizado.');
  }
}

async function prepareUsersCor(connection, row) {
  // No aceptar FK tecnicas del navegador: se deducen de iniciales unicas
  // con los mismos servicios usados por la edicion existente.
  const prepared = {...row};
  if (Object.prototype.hasOwnProperty.call(row, 'vendedor')) {
    const sales = await autoService.exactUserByInitials_cor(connection, 'vendedor', row.vendedor);
    prepared.vendedor = sales?.initials ?? null;
    prepared.id_asesor = sales?.id ?? null;
    const admin = await autoService.adminForSales_cor(connection, sales?.id ?? null, null);
    prepared.id_admin = admin.idAdmin;
  }
  if (Object.prototype.hasOwnProperty.call(row, 'supervisor_fl')) {
    const supervisor = await autoService.exactUserByInitials_cor(connection, 'supervisor_fl', row.supervisor_fl);
    prepared.supervisor_fl = supervisor?.initials ?? null;
    prepared.id_sup = supervisor?.id ?? null;
  }
  return prepared;
}

function derivedCreateCor(row, today) {
  // Solo altas humanas: formulas Excel validadas en F3 + derivados existentes.
  // Fechas AR/BB son sugeridas y NUNCA se escriben en campos *_real.
  return {...row, ...persisted.persistedForRowCor(row, today)};
}

function sqlErrorCor(error) {
  if (error?.code === 'ER_DUP_ENTRY') return errorCor(409,
    'INSTALACIONES_ADMIN_ALTA_DUPLICADO_BD',
    'La referencia en sitio ya existe para el mismo PP NS. No se creo el lote.');
  if (error?.code === 'ER_NO_REFERENCED_ROW_2' || error?.code === 'ER_ROW_IS_REFERENCED_2') {
    return errorCor(409, 'INSTALACIONES_ADMIN_ALTA_FK_INVALIDA',
      'Una relacion de responsable dejo de ser valida. No se creo el lote.');
  }
  if (error?.code === 'ER_LOCK_DEADLOCK' || error?.code === 'ER_LOCK_WAIT_TIMEOUT') {
    return errorCor(409, 'INSTALACIONES_ADMIN_ALTA_CONCURRENCIA',
      'El proyecto cambio durante el alta. Comprueba los registros antes de reintentar.');
  }
  return error;
}

async function validateExistingCor(connection, rows) {
  // Bloquear por PP NS dentro de la misma transaccion, sin exponer datos de
  // equipos fuera del scope a los clientes. La llave unica de MySQL es el
  // segundo control contra concurrencia y referencias repetidas.
  const projects = [...new Map(rows.map(row => [canonicalCor(row.id_proyecto), row])).values()]
    .sort((a, b) => a.id_proyecto.localeCompare(b.id_proyecto));
  for (const project of projects) {
    const [existing] = await connection.query(
      'SELECT id_ins_fl, proyecto, referencia_sitio FROM ins_fl WHERE id_proyecto = ? ORDER BY id_ins_fl FOR UPDATE',
      [project.id_proyecto]
    );
    const referenceSet = new Set();
    const projectName = canonicalCor(project.proyecto);
    for (const record of existing) {
      const other = canonicalCor(record.proyecto);
      if (other && other !== projectName) {
        throw errorCor(409, 'INSTALACIONES_ADMIN_ALTA_PROYECTO_AMBIGUO',
          'El PP NS esta asociado a otro nombre de proyecto en Instalaciones. Se requiere conciliacion.');
      }
      if (record.referencia_sitio != null) referenceSet.add(canonicalCor(record.referencia_sitio));
    }
    for (const row of rows.filter(item => canonicalCor(item.id_proyecto) === canonicalCor(project.id_proyecto))) {
      if (referenceSet.has(canonicalCor(row.referencia_sitio))) {
        throw errorCor(409, 'INSTALACIONES_ADMIN_ALTA_DUPLICADO_BD',
          'La referencia en sitio ya existe para el mismo PP NS. No se creo el lote.');
      }
    }
  }
}

async function auditCreateCor(req, connection, id, row) {
  const fields = Object.keys(row);
  const after = Object.fromEntries(fields.map(field => [field, row[field] ?? null]));
  const detail = {source:'instalaciones-administracion', audit:{
    accion:'CREAR', id_ins_fl:id, id_proyecto:row.id_proyecto,
    referencia_sitio:row.referencia_sitio, campos:fields, after
  }};
  auditService.assertSerializableAudit_cor(detail);
  const result = await interactionsService.recordFromRequest_gnral(req, {
    tipo_interaccion:'CREAR', modulo:'instalaciones-administracion',
    entidad:'proyecto_instalaciones', id_referencia:String(row.id_proyecto),
    titulo:'Nuevo equipo de instalaciones',
    descripcion:`Alta de equipo ${row.referencia_sitio} en ${row.id_proyecto}`,
    ruta_destino:'instalaciones-administracion',
    payload_json:{type:'equipo',id_ins_fl:id,id_proyecto:row.id_proyecto,
      referencia_sitio:row.referencia_sitio},
    detalle_json:detail, metodo_http:'POST',
    endpoint:String(req?.originalUrl || req?.url || '').split('?')[0].slice(0,500)
  }, {executor:connection});
  if (!Number.isSafeInteger(Number(result?.id_interaccion)) || Number(result.id_interaccion) < 1) {
    throw errorCor(500, 'INSTALACIONES_ADMIN_ALTA_AUDITORIA_FALLIDA',
      'No se confirmo la auditoria de alta. Se revierte el lote completo.');
  }
}

async function createRowsCor(req, body = {}) {
  const rows = normalizeRowsCor(body);
  await service.ensureFullEditPermission_cor(req);
  const permissions = await service.resolveGroupPermissions_cor(req);
  if (!permissions?.proyecto?.can_view || !permissions.proyecto.can_edit) {
    throw errorCor(403, 'INSTALACIONES_ADMIN_ALTA_PERMISO_DENEGADO',
      'Se requiere permiso de Administracion para crear equipos.');
  }
  const scope = await visibilityService.resolveVisibilityScope(db, req);
  if (!scope || !['ALL','LIMITED'].includes(scope.mode)) {
    throw errorCor(403, 'INSTALACIONES_ADMIN_ALTA_ALCANCE_INVALIDO',
      'No se pudo comprobar el alcance de los equipos nuevos.');
  }
  const connection = await db.getConnection();
  let transaction = false;
  let locked = false;
  try {
    // Misma seccion critica usada por /api/ins-fl/sync para prevenir
    // reescrituras externas mientras se confirma la nueva identidad humana.
    locked = await origin.acquireCor(connection);
    if (!locked) throw errorCor(409, 'INSTALACIONES_ADMIN_ALTA_SYNC_OCUPADA',
      'La sincronizacion de Instalaciones esta ocupada; vuelve a comprobar antes de continuar.');
    await connection.beginTransaction();
    transaction = true;
    await validateExistingCor(connection, rows);
    const created = [];
    const today = rules.zonedToday_cor();
    for (const original of rows) {
      const normalized = await prepareUsersCor(connection, original);
      assertScopeCor(scope, normalized);
      const row = derivedCreateCor(normalized, today);
      const columns = Object.keys(row);
      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO ins_fl (${columns.map(field => `\`${field}\``).join(', ')}) VALUES (${placeholders})`;
      const [inserted] = await connection.query(sql, columns.map(field => row[field]));
      const id = Number(inserted?.insertId);
      if (!Number.isSafeInteger(id) || id <= 0 || Number(inserted?.affectedRows) !== 1) {
        throw errorCor(500, 'INSTALACIONES_ADMIN_ALTA_SIN_IDENTIDAD',
          'MySQL no confirmo la identidad del nuevo equipo. Se revierte el lote.');
      }
      const [checks] = await connection.query(
        'SELECT id_ins_fl, id_proyecto, referencia_sitio, proyecto FROM ins_fl WHERE id_ins_fl = ? LIMIT 1', [id]
      );
      if (checks.length !== 1 || canonicalCor(checks[0].id_proyecto) !== canonicalCor(row.id_proyecto) ||
          canonicalCor(checks[0].referencia_sitio) !== canonicalCor(row.referencia_sitio) ||
          canonicalCor(checks[0].proyecto) !== canonicalCor(row.proyecto)) {
        throw errorCor(500, 'INSTALACIONES_ADMIN_ALTA_VERIFICACION_FALLIDA',
          'La relectura del equipo no coincide. Se revierte el lote.');
      }
      await auditCreateCor(req, connection, id, row);
      created.push({id_ins_fl:id});
    }
    await connection.commit();
    transaction = false;
    // El navegador debe volver a consultar con Guard/scope; no se devuelve
    // la ficha entera desde una mutacion, ni se presupone acceso posterior.
    return {created:created.length, records:created, audit:'ATOMIC_USUARIO_INTERACCIONES'};
  } catch (error) {
    if (transaction) {try {await connection.rollback();} catch (_ignored) {}}
    throw sqlErrorCor(error);
  } finally {
    try {if (locked) await origin.releaseCor(connection);}
    finally {connection.release();}
  }
}

module.exports = Object.freeze({
  MAX_ROWS_COR, REQUIRED_COR, DEFERRED_FORMULAS_COR, NOT_INPUT_COR,
  normalizeRowCor, normalizeRowsCor, assertScopeCor, derivedCreateCor,
  validateExistingCor, createRowsCor
});
