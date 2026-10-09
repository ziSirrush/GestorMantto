'use strict';

// [Aster | 2026-10-08 | ASTER-MG | FASE_5_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001]
// [Aster | 2026-10-09 | ASTER-MG | FIX_1_INSTALACIONES_ADMINISTRACION_EDICION_TOTAL_BACKEND_V001]

const db = require('../../config/db');
const { ALL_OPERATIONAL_FIELDS_COR } = require('./instalaciones-administracion.constants');

const SEARCHABLE_FIELDS_COR = Object.freeze([
  'proyecto', 'id_proyecto', 'referencia_sitio', 'numero_equipo_fabrica', 'cliente'
]);
const SUMMARY_FIELDS_COR = Object.freeze([
  'proyecto', 'id_proyecto', 'referencia_sitio', 'estatus',
  'numero_equipo_fabrica', 'tipo_equipo', 'marca', 'modelo',
  'cliente', 'estado', 'ciudad', 'activo'
]);

function scopeClause_cor(scope, alias = 'f') {
  if (scope && scope.mode === 'ALL') return { sql: '', params: [] };

  const ids = [...new Set(
    (scope && Array.isArray(scope.advisorIds) ? scope.advisorIds : [])
      .map(Number)
      .filter(id => Number.isInteger(id) && id > 0)
  )];

  if (!ids.length) return { sql: ' AND 1 = 0', params: [] };

  const placeholders = ids.map(() => '?').join(', ');
  return {
    sql: ` AND (
      ${alias}.id_asesor IN (${placeholders})
      OR ${alias}.id_sup IN (${placeholders})
      OR ${alias}.id_admin IN (${placeholders})
    )`,
    params: [...ids, ...ids, ...ids]
  };
}

function comparable_cor(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return String(value).trim();
}

function safeOperationalColumns_cor(fields) {
  const allowed = new Set(ALL_OPERATIONAL_FIELDS_COR);
  return [...new Set((fields || []).filter(field => allowed.has(field)))];
}

async function searchRecords_cor({ scope, search, limit = 25, visibleFields = [] }) {
  const allowed = new Set(safeOperationalColumns_cor(visibleFields));
  const columns = SUMMARY_FIELDS_COR.filter(field => allowed.has(field));
  const searchable = SEARCHABLE_FIELDS_COR.filter(field => allowed.has(field));
  const select = [
    'f.id_ins_fl',
    ...columns.map(field => `f.\`${field}\``),
    'f.updated_at'
  ];
  const scoped = scopeClause_cor(scope, 'f');
  const params = [];
  const where = ['1 = 1'];

  if (search) {
    const searchableConditions = searchable.map(field => `f.\`${field}\` LIKE ?`);
    for (const field of searchable) params.push(`%${search}%`);
    const numeric = Number(search);
    if (Number.isSafeInteger(numeric) && numeric > 0) {
      searchableConditions.push('f.id_ins_fl = ?');
      params.push(numeric);
    }
    if (!searchableConditions.length) return [];
    where.push(`(${searchableConditions.join(' OR ')})`);
  }

  params.push(...scoped.params, limit);
  // Un ORDER BY basado en un campo oculto tambien puede revelar datos
  // indirectamente. Nunca ordenar ni filtrar con columnas sin VER/EDITAR.
  const order = allowed.has('proyecto')
    ? `COALESCE(f.proyecto, '') ASC, ${allowed.has('referencia_sitio') ? "COALESCE(f.referencia_sitio, '') ASC, " : ''}f.id_ins_fl ASC`
    : 'f.id_ins_fl DESC';

  const [rows] = await db.query(
    `SELECT ${select.join(', ')}
       FROM ins_fl f
      WHERE ${where.join(' AND ')}
      ${scoped.sql}
      ORDER BY ${order}
      LIMIT ?`,
    params
  );
  return rows;
}

async function getRecordById_cor({ id, scope, connection = db, forUpdate = false }) {
  const scoped = scopeClause_cor(scope, 'f');
  const [rows] = await connection.query(
    `SELECT f.*
       FROM ins_fl f
      WHERE f.id_ins_fl = ?
      ${scoped.sql}
      LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [id, ...scoped.params]
  );
  return rows[0] || null;
}

async function listExistingActiveUsers_cor(ids) {
  const unique = [...new Set((ids || []).map(Number).filter(id => Number.isInteger(id) && id > 0))];
  if (!unique.length) return [];
  const placeholders = unique.map(() => '?').join(', ');
  const [rows] = await db.query(
    `SELECT id_SB
       FROM usuarios
      WHERE estado = 1
        AND id_SB IN (${placeholders})`,
    unique
  );
  return rows.map(row => Number(row.id_SB));
}

async function listActiveUsers_cor() {
  const [rows] = await db.query(
    `SELECT id_SB, nombre, iniciales, puesto, empresa
       FROM usuarios
      WHERE estado = 1
      ORDER BY nombre ASC, id_SB ASC`
  );
  return rows;
}

function mapDatabaseIdentityError_cor(error) {
  // ins_fl tiene UNIQUE (id_proyecto, referencia_sitio) e IDs FK a usuarios.
  // Nunca exponer SQL/valores internos en la respuesta HTTP.
  if (error?.code === 'ER_DUP_ENTRY') {
    const conflict = new Error('La referencia de equipo ya esta registrada para ese proyecto.');
    conflict.statusCode = 409;
    conflict.code = 'INSTALACIONES_ADMINISTRACION_REFERENCIA_DUPLICADA';
    return conflict;
  }
  if (error?.code === 'ER_NO_REFERENCED_ROW_2' || error?.code === 'ER_ROW_IS_REFERENCED_2') {
    const conflict = new Error('La relacion con usuarios no es valida. Actualiza y revisa el registro.');
    conflict.statusCode = 409;
    conflict.code = 'INSTALACIONES_ADMINISTRACION_RELACION_INVALIDA';
    return conflict;
  }
  return error;
}

function concurrencyError_cor(fields) {
  const error = new Error('El registro fue modificado desde tu ultima lectura. Recarga y revisa los valores antes de guardar.');
  error.statusCode = 409;
  error.code = 'INSTALACIONES_ADMINISTRACION_CONFLICTO_CONCURRENCIA';
  error.details = { fields };
  return error;
}

async function updateRecordById_cor({ id, scope, changes, expected, beforeCommit }) {
  const conn = await db.getConnection();
  let transactionStarted = false;

  try {
    await conn.beginTransaction();
    transactionStarted = true;

    const before = await getRecordById_cor({
      id,
      scope,
      connection: conn,
      forUpdate: true
    });

    if (!before) {
      await conn.rollback();
      transactionStarted = false;
      return { found: false };
    }

    // Compare only the fields edited by this user, while holding a row lock.
    // Unrelated changes are not overwritten and do not cause false conflicts.
    const conflicts = Object.keys(changes).filter(field => (
      comparable_cor(before[field]) !== comparable_cor(expected[field])
    ));
    if (conflicts.length) throw concurrencyError_cor(conflicts);

    const actualChanges = {};
    for (const [field, value] of Object.entries(changes)) {
      if (comparable_cor(before[field]) !== comparable_cor(value)) {
        actualChanges[field] = value;
      }
    }

    if (!Object.keys(actualChanges).length) {
      await conn.commit();
      transactionStarted = false;
      return { found: true, changed: false, before, after: before, changes: {} };
    }

    // Column names come exclusively from the group allowlist in validation.
    const assignments = Object.keys(actualChanges).map(field => `\`${field}\` = ?`).join(', ');
    const values = [...Object.values(actualChanges), id];

    try {
      await conn.query(
        `UPDATE ins_fl
            SET ${assignments}
          WHERE id_ins_fl = ?`,
        values
      );
    } catch (error) {
      // Solo traducir un error de UPDATE ins_fl, no un fallo de auditoria.
      throw mapDatabaseIdentityError_cor(error);
    }

    // The update can change id_sup/id_asesor/id_admin and therefore the
    // record scope. Read after-image by locked primary key for audit only.
    const after = await getRecordById_cor({
      id, scope: { mode: 'ALL' }, connection: conn, forUpdate: false
    });
    if (!after) throw new Error('No fue posible obtener la imagen posterior del registro actualizado.');

    if (typeof beforeCommit === 'function') {
      await beforeCommit({ connection: conn, before, after, changes: actualChanges });
    }

    await conn.commit();
    transactionStarted = false;
    return { found: true, changed: true, before, after, changes: actualChanges };
  } catch (error) {
    if (transactionStarted) {
      try { await conn.rollback(); } catch (_rollbackError) {}
    }
    throw error;
  } finally {
    conn.release();
  }
}


// [Aster | 2026-10-08 | ASTER-MG | FIX_1_INSTALACIONES_ADMINISTRACION_REDISENO_V001]
// Navegacion paginada por proyecto. Todas las consultas son SELECT y aplican
// el mismo alcance CORELLIAN y las mismas columnas visibles que el detalle.
const BROWSE_SUMMARY_FIELDS_COR = Object.freeze([
  ...SUMMARY_FIELDS_COR, 'id_sup'
]);
const PROJECT_KEY_SQL_COR = `CASE
    WHEN NULLIF(TRIM(f.id_proyecto), '') IS NOT NULL THEN CONCAT('P:', f.id_proyecto)
    ELSE CONCAT('R:', f.id_ins_fl)
  END`;

function parseProjectKey_cor(value) {
  const key = String(value || '');
  if (key.startsWith('P:') && key.length <= 102 && key.length > 2 && key.slice(2).trim()) {
    return { key, sql: 'f.id_proyecto = ?', params: [key.slice(2)] };
  }
  if (/^R:[1-9]\d{0,14}$/.test(key) && Number.isSafeInteger(Number(key.slice(2)))) {
    return { key, sql: 'f.id_ins_fl = ? AND NULLIF(TRIM(f.id_proyecto), \'\') IS NULL', params: [Number(key.slice(2))] };
  }
  const error = new Error('Identificador de proyecto invalido.');
  error.statusCode = 400;
  error.code = 'INSTALACIONES_ADMINISTRACION_PROYECTO_INVALIDO';
  throw error;
}

function buildBrowseWhere_cor({ scope, search = '', estatus = '', supervisor = '', visibleFields = [], projectKey = null }) {
  const allowed = new Set(safeOperationalColumns_cor(visibleFields));
  const conditions = ['1 = 1'];
  const params = [];
  if (projectKey != null) {
    const project = parseProjectKey_cor(projectKey);
    conditions.push(project.sql);
    params.push(...project.params);
  }
  if (search) {
    const searchFields = SEARCHABLE_FIELDS_COR.filter(field => allowed.has(field));
    const matching = searchFields.map(field => `f.\`${field}\` LIKE ?`);
    params.push(...searchFields.map(() => `%${search}%`));
    if (Number.isSafeInteger(Number(search)) && Number(search) > 0) {
      matching.push('f.id_ins_fl = ?');
      params.push(Number(search));
    }
    conditions.push(matching.length ? `(${matching.join(' OR ')})` : '1 = 0');
  }
  if (estatus) {
    if (!allowed.has('estatus')) throw new Error('Filtro estatus sin permiso.');
    conditions.push('TRIM(f.estatus) = ?');
    params.push(estatus);
  }
  if (supervisor) {
    if (!allowed.has('id_sup')) throw new Error('Filtro supervisor sin permiso.');
    if (supervisor === 'SIN_ASIGNAR') conditions.push('f.id_sup IS NULL');
    else {
      conditions.push('f.id_sup = ?');
      params.push(Number(supervisor));
    }
  }
  const scoped = scopeClause_cor(scope, 'f');
  params.push(...scoped.params);
  return {sql: `WHERE ${conditions.join(' AND ')}${scoped.sql}`, params, allowed};
}

async function listProjects_cor({ scope, search, estatus, supervisor, visibleFields, limit = 20, offset = 0 }) {
  const built = buildBrowseWhere_cor({scope,search,estatus,supervisor,visibleFields});
  const fromWhere = `FROM ins_fl f ${built.sql}`;
  const [totalRows] = await db.query(
    `SELECT COUNT(*) AS total FROM (
       SELECT ${PROJECT_KEY_SQL_COR} AS project_key ${fromWhere}
       GROUP BY project_key
     ) grouped`, built.params
  );
  const [rows] = await db.query(
    `SELECT ${PROJECT_KEY_SQL_COR} AS project_key,
        MAX(f.id_proyecto) AS id_proyecto,
        MIN(NULLIF(TRIM(f.proyecto), '')) AS proyecto,
        COUNT(*) AS equipos
       ${fromWhere}
       GROUP BY project_key
       ORDER BY COALESCE(MIN(NULLIF(TRIM(f.proyecto), '')), '') ASC, project_key ASC
       LIMIT ? OFFSET ?`, [...built.params,limit,offset]
  );
  return {data: rows.map(row => ({
    project_key: row.project_key,
    id_proyecto: row.id_proyecto,
    proyecto: row.proyecto,
    equipos: Number(row.equipos)
  })),total:Number(totalRows[0]?.total||0),limit,offset};
}

async function listProjectEquipments_cor({ scope, projectKey, search, estatus, supervisor,
  visibleFields, limit = 30, offset = 0 }) {
  const built = buildBrowseWhere_cor({scope,projectKey,search,estatus,supervisor,visibleFields});
  const columns = BROWSE_SUMMARY_FIELDS_COR.filter(field => built.allowed.has(field));
  const canSeeSupervisor = built.allowed.has('id_sup');
  const fromWhere = `FROM ins_fl f ${canSeeSupervisor ? 'LEFT JOIN usuarios u ON u.id_SB = f.id_sup' : ''} ${built.sql}`;
  const [totalRows] = await db.query(`SELECT COUNT(*) AS total ${fromWhere}`,built.params);
  // Nunca ordenar por un campo sin permiso de lectura, ni devolverlo oculto.
  const orderBy = built.allowed.has('referencia_sitio')
    ? "COALESCE(f.referencia_sitio,'') ASC, f.id_ins_fl ASC" : 'f.id_ins_fl ASC';
  const select = ['f.id_ins_fl',...columns.map(field => `f.\`${field}\``),
    ...(canSeeSupervisor?['u.nombre AS supervisor_display']:[]),'f.updated_at'];
  const [rows] = await db.query(
    `SELECT ${select.join(', ')} ${fromWhere} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...built.params,limit,offset]
  );
  return {data:rows,total:Number(totalRows[0]?.total||0),limit,offset};
}

async function listBrowseFilters_cor({scope,canViewStatus,canViewSupervisor}) {
  const scoped = scopeClause_cor(scope,'f');
  let estatus = [], supervisores = [];
  let unassigned = false;
  if (canViewStatus) {
    const [rows] = await db.query(
      `SELECT DISTINCT TRIM(f.estatus) AS value FROM ins_fl f
       WHERE NULLIF(TRIM(f.estatus),'') IS NOT NULL ${scoped.sql}
       ORDER BY value ASC LIMIT 251`,scoped.params
    );
    estatus = rows.slice(0,250).map(row => row.value);
  }
  if (canViewSupervisor) {
    const [rows] = await db.query(
      `SELECT f.id_sup AS id, MAX(u.nombre) AS nombre
         FROM ins_fl f LEFT JOIN usuarios u ON u.id_SB = f.id_sup
        WHERE f.id_sup IS NOT NULL ${scoped.sql}
        GROUP BY f.id_sup ORDER BY nombre ASC, id ASC LIMIT 501`,scoped.params
    );
    supervisores = rows.slice(0,500).map(row => ({id:Number(row.id),nombre:row.nombre||`Usuario #${row.id}`}));
    const [missing] = await db.query(
      `SELECT EXISTS(SELECT 1 FROM ins_fl f WHERE f.id_sup IS NULL ${scoped.sql} LIMIT 1) AS hay_sin_asignar`,scoped.params
    );
    unassigned = Number(missing[0]?.hay_sin_asignar||0)===1;
  }
  return {estatus,supervisores,sin_supervisor:unassigned,
    permisos:{estatus:Boolean(canViewStatus),supervisor:Boolean(canViewSupervisor)}};
}


// [Aster | 2026-10-09 | ASTER-MG | FIX_3_INSTALACIONES_ADMINISTRACION_EDICION_MULTIPLE_V001]
// Se bloquean y validan TODOS los equipos autorizados antes del primer UPDATE.
// Una unica transaccion engloba datos + auditorias, o revierte todo.
async function updateProjectBatch_cor({ projectKey, ids, scope, changes, expectedById, beforeCommit }) {
  const project = parseProjectKey_cor(projectKey);
  if (!project.key.startsWith('P:')) {
    const error = new Error('La edicion multiple requiere un proyecto con PP NS valido.');
    error.statusCode = 400;
    error.code = 'INSTALACIONES_ADMINISTRACION_PROYECTO_NO_AGRUPABLE';
    throw error;
  }
  const expectedProjectId = project.params[0];
  const conn = await db.getConnection();
  let started = false;
  try {
    await conn.beginTransaction();
    started = true;
    const originals = new Map();
    const sortedIds = [...ids].sort((a, b) => a - b);

    // Orden total de locks, evita operaciones parciales y reduce deadlocks.
    for (const id of sortedIds) {
      const row = await getRecordById_cor({ id, scope, connection: conn, forUpdate: true });
      if (!row) {
        const error = new Error('Uno o mas equipos ya no estan dentro de tu alcance. Actualiza el proyecto.');
        error.statusCode = 404;
        error.code = 'INSTALACIONES_ADMINISTRACION_EQUIPO_NO_DISPONIBLE';
        throw error;
      }
      // Comparacion estricta por FK logica id_proyecto, NUNCA nombre o etiqueta.
      if (String(row.id_proyecto ?? '') !== expectedProjectId) {
        const error = new Error('La seleccion contiene un equipo de otro proyecto o un PP NS modificado.');
        error.statusCode = 409;
        error.code = 'INSTALACIONES_ADMINISTRACION_PROYECTO_DISTINTO';
        throw error;
      }
      const conflicts = Object.keys(changes).filter(field => (
        comparable_cor(row[field]) !== comparable_cor(expectedById[id][field])
      ));
      if (conflicts.length) throw concurrencyError_cor(conflicts);
      originals.set(id, row);
    }

    const entries = [];
    let modified = 0;
    for (const id of sortedIds) {
      const before = originals.get(id);
      const effective = {};
      for (const [field, value] of Object.entries(changes)) {
        if (comparable_cor(before[field]) !== comparable_cor(value)) effective[field] = value;
      }
      if (!Object.keys(effective).length) {
        entries.push({ id_ins_fl: id, changed: false, changed_fields: [] });
        continue;
      }
      const assignments = Object.keys(effective).map(field => `\`${field}\` = ?`).join(', ');
      try {
        await conn.query(`UPDATE ins_fl SET ${assignments} WHERE id_ins_fl = ?`,
          [...Object.values(effective), id]);
      } catch (error) {
        throw mapDatabaseIdentityError_cor(error);
      }
      // Relectura por PK solo para auditoria, no se envia al frontend.
      const after = await getRecordById_cor({
        id, scope: { mode: 'ALL' }, connection: conn, forUpdate: false
      });
      if (!after) throw new Error('No fue posible verificar el cambio antes de confirmar.');
      if (typeof beforeCommit === 'function') {
        await beforeCommit({ connection: conn, id, before, after, changes: effective });
      }
      modified++;
      entries.push({ id_ins_fl: id, changed: true, changed_fields: Object.keys(effective) });
    }
    await conn.commit();
    started = false;
    return { affected: ids.length, changed: modified, records: entries };
  } catch (error) {
    if (started) { try { await conn.rollback(); } catch (_rollbackError) {} }
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = {
  scopeClause_cor,
  comparable_cor,
  searchRecords_cor,
  getRecordById_cor,
  listExistingActiveUsers_cor,
  listActiveUsers_cor,
  updateRecordById_cor,
  updateProjectBatch_cor,
  parseProjectKey_cor,
  buildBrowseWhere_cor,
  listProjects_cor,
  listProjectEquipments_cor,
  listBrowseFilters_cor
};
