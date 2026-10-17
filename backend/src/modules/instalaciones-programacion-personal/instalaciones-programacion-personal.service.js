'use strict';

// [Mantto Gestor | 2026-10-16 | INT9-F1 | CATALOGO PERSONAL MYSQL V001]
// Catalogo global de personas NO autenticables. Aiven MySQL es la fuente de verdad.
// La autorizacion se impone en routes mediante el Guard nativo + permisos.
const db = require('../../config/db');
const asignaciones = require('./instalaciones-programacion-personal.asignaciones.service');

const TIPOS = Object.freeze(['MONTADOR', 'AJUSTADOR']);
const PUESTOS = Object.freeze(['Mecánico', 'Ayudante']);

function knownError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function tipoPersonal(value) {
  const valueUpper = String(value || '').trim().toUpperCase();
  if (valueUpper === 'MONTADOR' || valueUpper === 'MONTADORES') return 'MONTADOR';
  if (valueUpper === 'AJUSTADOR' || valueUpper === 'AJUSTADORES') return 'AJUSTADOR';
  throw knownError(400, 'INT9_TIPO_INVALIDO', 'Selecciona MONTADOR o AJUSTADOR.');
}

function stringValue(value, field, maxLength, required = false) {
  const result = value == null ? '' : String(value).trim();
  if (result.length > maxLength) {
    throw knownError(400, 'INT9_LONGITUD_INVALIDA', `${field} permite máximo ${maxLength} caracteres.`);
  }
  if (required && !result) {
    throw knownError(400, 'INT9_DATO_OBLIGATORIO', `${field} es obligatorio.`);
  }
  return result || null;
}

function personId(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) {
    throw knownError(400, 'INT9_PERSONAL_ID_INVALIDO', 'Identificador de personal inválido.');
  }
  return n;
}

function actorId(req) {
  // Nunca tomar el id del cuerpo o una identidad manipulable del navegador.
  const n = Number(req?.user?.id_SB || req?.user?.id || 0);
  if (!Number.isSafeInteger(n) || n < 1) {
    throw knownError(401, 'INT9_IDENTIDAD_REQUERIDA', 'Sesión autenticada requerida.');
  }
  return n;
}

function validatedPayload(tipo, input = {}) {
  const type = tipoPersonal(tipo);
  const nombre = stringValue(input.nombre, 'Nombre', 180, true);
  const categoria = stringValue(input.categoria, 'Categoría', 120);
  let contratista = null;
  let puesto = null;
  let experiencia = null;
  if (type === 'MONTADOR') {
    contratista = stringValue(input.contratista, 'Contratista', 160, true);
    puesto = stringValue(input.puesto, 'Puesto', 50, true);
    if (!PUESTOS.includes(puesto)) {
      throw knownError(400, 'INT9_PUESTO_INVALIDO', 'El puesto debe ser Mecánico o Ayudante.');
    }
  } else {
    experiencia = stringValue(input.experiencia, 'Experiencia', 120);
  }
  return { tipo_personal: type, nombre, contratista, puesto, categoria, experiencia };
}

function sqlKnownError(error) {
  if (error?.code === 'ER_DUP_ENTRY') {
    throw knownError(409, 'INT9_PERSONA_DUPLICADA',
      'Ya existe una persona activa con ese nombre y contratista (o ajustador con ese nombre).');
  }
  if (error?.code === 'ER_NO_SUCH_TABLE' || error?.code === 'ER_BAD_FIELD_ERROR') {
    throw knownError(503, 'INT9_SQL_NO_APLICADO',
      'El catálogo de personal aún no está disponible en Aiven.');
  }
  throw error;
}

function readRecord(row) {
  if (!row) return null;
  const tipo = String(row.tipo_personal || '');
  return {
    id_personal: Number(row.id_personal),
    tipo,
    tipo_personal: tipo,
    nombre: row.nombre,
    contratista: tipo === 'MONTADOR' ? row.contratista : null,
    puesto: tipo === 'MONTADOR' ? row.puesto : null,
    categoria: row.categoria || null,
    experiencia: tipo === 'AJUSTADOR' ? (row.experiencia || null) : null,
    grupo: tipo === 'MONTADOR' ? row.puesto : (row.categoria || 'Sin categoría'),
    activo: Number(row.activo) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function getById(tipo, id, connection = db) {
  const type = tipoPersonal(tipo);
  const person = personId(id);
  const [rows] = await connection.execute(
    `SELECT id_personal,tipo_personal,nombre,contratista,puesto,categoria,experiencia,
            activo,created_at,updated_at
     FROM instalaciones_personal
     WHERE id_personal=? AND tipo_personal=? AND activo=1 LIMIT 1`,
    [person, type]
  );
  if (!rows.length) throw knownError(404, 'INT9_PERSONA_NO_ENCONTRADA', 'Persona no encontrada.');
  return readRecord(rows[0]);
}

async function opciones() {
  const [rows] = await db.query(
    `SELECT tipo_personal,contratista,categoria FROM instalaciones_personal
     WHERE activo=1 ORDER BY tipo_personal,contratista,categoria LIMIT 20000`
  );
  const uniques = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const montadores = rows.filter(p => p.tipo_personal === 'MONTADOR');
  const ajustadores = rows.filter(p => p.tipo_personal === 'AJUSTADOR');
  return {
    tipos: [...TIPOS], puestos: [...PUESTOS],
    montadores: { contratistas: uniques(montadores.map(p => p.contratista)), categorias: uniques(montadores.map(p => p.categoria)) },
    ajustadores: { categorias: uniques(ajustadores.map(p => p.categoria)) }
  };
}

async function listar(query = {}) {
  const type = tipoPersonal(query.tipo);
  const q = stringValue(query.q ?? query.search ?? '', 'Búsqueda', 120);
  const rawPage = Number(query.page || 1);
  if (!Number.isSafeInteger(rawPage) || rawPage < 1 || rawPage > 100000) {
    throw knownError(400, 'INT9_PAGINA_INVALIDA', 'Página inválida.');
  }
  const pageSize = Math.max(1, Math.min(200, Math.trunc(Number(query.limit) || 50)));
  const skip = (rawPage - 1) * pageSize;
  const conditions = ['tipo_personal=?', 'activo=1'];
  const values = [type];
  if (q) {
    conditions.push('(nombre LIKE ? OR COALESCE(contratista,\'\') LIKE ? OR COALESCE(puesto,\'\') LIKE ? OR COALESCE(categoria,\'\') LIKE ? OR COALESCE(experiencia,\'\') LIKE ?)');
    for (let i = 0; i < 5; i += 1) values.push(`%${q}%`);
  }
  const where = conditions.join(' AND ');
  const [totalRows] = await db.execute(
    `SELECT COUNT(*) AS total FROM instalaciones_personal WHERE ${where}`, values
  );
  // LIMIT/OFFSET se validan y se interpolan exclusivamente como enteros.
  const [rows] = await db.execute(
    `SELECT id_personal,tipo_personal,nombre,contratista,puesto,categoria,experiencia,
            activo,created_at,updated_at
     FROM instalaciones_personal WHERE ${where}
     ORDER BY nombre ASC,id_personal ASC LIMIT ${pageSize} OFFSET ${skip}`,
    values
  );
  const personal = rows.map(readRecord);
  return { tipo: type, personal, data: personal, total: Number(totalRows[0]?.total || 0), page: rawPage, limit: pageSize };
}

async function crear(req) {
  const type = tipoPersonal(req.body?.tipo);
  const payload = validatedPayload(type, req.body);
  const userId = actorId(req);
  let result;
  try {
    [result] = await db.execute(
      `INSERT INTO instalaciones_personal
        (tipo_personal,nombre,contratista,puesto,categoria,experiencia,activo,created_by,updated_by)
       VALUES (?,?,?,?,?,?,1,?,?)`,
      [payload.tipo_personal,payload.nombre,payload.contratista,payload.puesto,
        payload.categoria,payload.experiencia,userId,userId]
    );
  } catch (error) { sqlKnownError(error); }
  return getById(type, result.insertId);
}

async function editar(req) {
  const type = tipoPersonal(req.params.tipo);
  const id = personId(req.params.id);
  if (req.body?.tipo != null && tipoPersonal(req.body.tipo) !== type) {
    throw knownError(400, 'INT9_CAMBIO_TIPO_PROHIBIDO', 'No puedes cambiar el tipo de personal.');
  }
  const previous = await getById(type, id);
  const payload = validatedPayload(type, { ...previous, ...req.body });
  const userId = actorId(req);
  let result;
  try {
    [result] = await db.execute(
      `UPDATE instalaciones_personal
       SET nombre=?,contratista=?,puesto=?,categoria=?,experiencia=?,updated_by=?
       WHERE id_personal=? AND tipo_personal=? AND activo=1`,
      [payload.nombre,payload.contratista,payload.puesto,payload.categoria,
        payload.experiencia,userId,id,type]
    );
  } catch (error) { sqlKnownError(error); }
  if (!result.affectedRows) {
    throw knownError(404, 'INT9_PERSONA_NO_ENCONTRADA', 'Persona no encontrada.');
  }
  return getById(type, id);
}

async function desactivar(req) {
  const type = tipoPersonal(req.params.tipo);
  const id = personId(req.params.id);
  const userId = actorId(req);
  // Fase 2: proteger historial y asignaciones actuales/futuras. Alta/edicion
  // de asignaciones tambien bloquean primero el registro del personal.
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id_personal FROM instalaciones_personal
       WHERE id_personal=? AND tipo_personal=? AND activo=1 FOR UPDATE`,[id,type]);
    if (!rows.length) throw knownError(404,'INT9_PERSONA_NO_ENCONTRADA','Persona no encontrada.');
    const activos = await asignaciones.tieneAsignacionesVigentes(connection,id);
    if (activos) throw knownError(409,'INT9_PERSONA_TIENE_ASIGNACIONES',
      'Esta persona tiene asignaciones vigentes, futuras o sin fechas; quítalas antes de desactivarla.');
    await connection.execute(`UPDATE instalaciones_personal SET activo=0,updated_by=?
      WHERE id_personal=? AND tipo_personal=? AND activo=1`,[userId,id,type]);
    await connection.commit();
    return {id_personal:id,tipo:type,activo:false};
  } catch(ex) {
    await connection.rollback().catch(()=>{});
    if (ex?.code === 'ER_NO_SUCH_TABLE' || ex?.code === 'ER_BAD_FIELD_ERROR') {
      throw knownError(503,'INT9_SQL_FASE_2_NO_APLICADO','No está disponible la estructura de asignaciones.');
    }
    throw ex;
  } finally { connection.release(); }
}

module.exports = {
  TIPOS, PUESTOS, opciones, listar, crear, editar, desactivar,
  _test: { tipoPersonal, validatedPayload, readRecord, personId }
};
