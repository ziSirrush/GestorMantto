'use strict';

// [Mantto Gestor | 2026-10-13 | FASE_1_INSTALACIONES_ADMIN_V2_BACKEND_V001]
// [Mantto Gestor | 2026-10-13 | FASE_4_INSTALACIONES_ADMIN_V2_INTEGRACION_QA_V001]
// Endpoint adicional para captura directa. Los endpoints legados permanecen
// operativos para no adelantar cambios del frontend hasta las Fases 2/3.
// Toda operacion humana valida permiso EDITAR, puerta CORELLIAN (routes),
// alcance individual, proyecto, expected y auditoria EN LA MISMA transaccion.

const db = require('../../config/db');
const visibilityService = require('../ventas/ventas-visibility.service');
const service = require('./instalaciones-administracion.service');
const repository = require('./instalaciones-administracion.repository');
const auditService = require('./instalaciones-administracion.audit-service');
const { GROUPS_COR, ALL_OPERATIONAL_FIELDS_COR } =
  require('./instalaciones-administracion.constants');
const { normalizeGroupUpdate_cor, positiveId_cor } =
  require('./instalaciones-administracion.validation');
const { normalizeEditedFields_cor } =
  require('./instalaciones-administracion.field-policy');
const rules = require('./instalaciones-administracion.auto-rules');

const MAX_MULTI_COR = 20;
const ALLOWED_FIELDS_COR = [...ALL_OPERATIONAL_FIELDS_COR];
const GROUP_FOR_FIELD_COR = new Map(
  Object.entries(GROUPS_COR).flatMap(([key, group]) => group.fields.map(f => [f,key]))
);

function plainObject_cor(value) {
  return value !== null && typeof value === 'object' &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function comparable_cor(value) {return repository.comparable_cor(value);}
function changed_cor(before, next) {return comparable_cor(before) !== comparable_cor(next);}

function normalizeSingleCell_cor(body, isBatch) {
  if (!plainObject_cor(body)) throw rules.knownError_cor(400,'INSTALACIONES_ADMINISTRACION_PAYLOAD_INVALIDO',
    'La operacion requiere un objeto JSON.');
  const legal = isBatch ? ['ids','changes','expected'] : ['changes','expected'];
  if (Object.keys(body).some(k => !legal.includes(k)) ||
      !plainObject_cor(body.changes) || !plainObject_cor(body.expected)) {
    throw rules.knownError_cor(400,'INSTALACIONES_ADMINISTRACION_PAYLOAD_INVALIDO',
      'Solo se admiten changes y expected (ademas ids en edicion multiple).');
  }
  const field = rules.assertManualFields_cor(body.changes, ALLOWED_FIELDS_COR);
  const group = GROUP_FOR_FIELD_COR.get(field);
  if (!group) throw rules.knownError_cor(400,'INSTALACIONES_ADMINISTRACION_CAMPO_NO_AUTORIZADO',
    'Campo no agrupado dentro del modulo.');
  const normalized = normalizeEditedFields_cor(normalizeGroupUpdate_cor(group, {
    changes:{[field]:body.changes[field]}
  }));
  return {field, group, value:normalized[field]};
}

function expectedCell_cor(expected, field) {
  if (!plainObject_cor(expected) || Object.keys(expected).length !== 1 ||
      !Object.prototype.hasOwnProperty.call(expected,field)) {
    throw rules.knownError_cor(400,'INSTALACIONES_ADMINISTRACION_EXPECTED_REQUERIDO',
      'expected debe contener unicamente el valor original de la celda seleccionada.');
  }
  const value = expected[field];
  if (value !== null && !['string','number','boolean'].includes(typeof value)) {
    throw rules.knownError_cor(400,'INSTALACIONES_ADMINISTRACION_EXPECTED_INVALIDO',
      'expected no admite objetos ni arreglos.');
  }
  return value;
}

function normalizedIds_cor(body) {
  if (!Array.isArray(body.ids) || body.ids.length < 2 || body.ids.length > MAX_MULTI_COR) {
    throw rules.knownError_cor(400,'INSTALACIONES_ADMINISTRACION_LOTE_INVALIDO',
      `Selecciona de 2 a ${MAX_MULTI_COR} equipos.`);
  }
  const ids = body.ids.map(id => positiveId_cor(id));
  if (new Set(ids).size !== ids.length) {
    throw rules.knownError_cor(400,'INSTALACIONES_ADMINISTRACION_EQUIPOS_DUPLICADOS',
      'Los equipos seleccionados no pueden repetirse.');
  }
  return ids.sort((a,b) => a-b);
}

async function authorizedScope_cor(req) {
  await service.ensureFullEditPermission_cor(req);
  const permissions = await service.resolveGroupPermissions_cor(req);
  if (!permissions?.proyecto?.can_view) {
    throw rules.knownError_cor(403,'INSTALACIONES_ADMINISTRACION_PROYECTOS_DENEGADOS',
      'No hay permiso para consultar los equipos del proyecto.');
  }
  return visibilityService.resolveVisibilityScope(db,req);
}

async function exactUserByInitials_cor(connection, field, initials) {
  if (initials === null) return null;
  const area = field === 'vendedor' ? 'Ventas' : 'Instalaciones';
  const text = String(initials).trim();
  if (!text || text.length > 10) throw rules.knownError_cor(400,
    'INSTALACIONES_ADMINISTRACION_USUARIO_INVALIDO',
    `Selecciona un usuario activo del area ${area}.`);
  const [rows] = await connection.query(
    `SELECT id_SB, iniciales FROM usuarios
       WHERE estado=1 AND area=? AND iniciales=? LIMIT 2`, [area,text]
  );
  if (rows.length !== 1) throw rules.knownError_cor(400,
    'INSTALACIONES_ADMINISTRACION_USUARIO_INVALIDO',
    `No se encontro un usuario activo y unico del area ${area}.`);
  return {id:Number(rows[0].id_SB),initials:rows[0].iniciales};
}

async function adminForSales_cor(connection, idAsesor, previousAdminId) {
  if (!idAsesor) return {idAdmin:null,relAdmin:''};
  const [rows] = await connection.query(
    `SELECT DISTINCT u.id_SB, u.iniciales
       FROM usuarios_rel_admin ura
       INNER JOIN usuarios u ON u.id_SB=ura.id_admin AND u.estado=1
      WHERE ura.id_asesor=?
      ORDER BY u.iniciales ASC, u.id_SB ASC`, [idAsesor]
  );
  if (!rows.length) return {idAdmin:null,relAdmin:''};
  const result = {
    relAdmin:rows.map(r=>r.iniciales).join(', '),
    idAdmin:rows.length === 1 ? Number(rows[0].id_SB) : null
  };
  if (rows.length > 1 && rows.some(r=>Number(r.id_SB)===Number(previousAdminId))) {
    result.idAdmin = Number(previousAdminId);
  }
  // id_admin es FK BIGINT individual, no almacena cadenas 'ID1,ID2'.
  // La presentacion con comas se calcula sobre usuarios_rel_admin.
  return result;
}

async function rowChanges_cor(connection,before,field,value,today) {
  const updates = {[field]:value};
  if (field==='vendedor') {
    const user=await exactUserByInitials_cor(connection,field,value);
    updates.vendedor=user?.initials ?? null;
    updates.id_asesor=user?.id ?? null;
    const admin=await adminForSales_cor(connection,user?.id ?? null,before.id_admin);
    updates.id_admin=admin.idAdmin;
  } else if (field==='supervisor_fl') {
    const user=await exactUserByInitials_cor(connection,field,value);
    updates.supervisor_fl=user?.initials ?? null;
    updates.id_sup=user?.id ?? null;
  }
  const composed={...before,...updates};
  Object.assign(updates,rules.derivedForRow_cor(composed,today));
  return Object.fromEntries(Object.entries(updates).filter(([k,v])=>changed_cor(before[k],v)));
}

function makeGroupsForAudit_cor(changes) {
  const grouped=new Map();
  for (const [field,value] of Object.entries(changes)) {
    const group=GROUP_FOR_FIELD_COR.get(field);
    if (!group) throw new Error(`Campo sin grupo auditado: ${field}.`);
    if (!grouped.has(group)) grouped.set(group,{});
    grouped.get(group)[field]=value;
  }
  return grouped;
}

function sqlError_cor(error) {
  if (error?.code==='ER_DUP_ENTRY') return rules.knownError_cor(409,
    'INSTALACIONES_ADMINISTRACION_REFERENCIA_DUPLICADA',
    'La referencia de equipo ya existe en el proyecto.');
  if (error?.code==='ER_NO_REFERENCED_ROW_2'||error?.code==='ER_ROW_IS_REFERENCED_2') {
    return rules.knownError_cor(409,'INSTALACIONES_ADMINISTRACION_FK_INVALIDA',
      'La relacion de responsables no es valida.');
  }
  return error;
}

async function persistOne_cor(req,connection,id,before,field,value,today) {
  const changes=await rowChanges_cor(connection,before,field,value,today);
  if (!Object.keys(changes).length) return {id_ins_fl:id,changed:false,changed_fields:[]};
  const assignments=Object.keys(changes).map(f=>`\`${f}\`=?`).join(', ');
  try {
    await connection.query(`UPDATE ins_fl SET ${assignments} WHERE id_ins_fl=?`,
      [...Object.values(changes),id]);
  } catch(error) {throw sqlError_cor(error);}
  const after=await repository.getRecordById_cor({
    id,scope:{mode:'ALL'},connection,forUpdate:false
  });
  if (!after) throw new Error('No se pudo verificar el registro antes del COMMIT.');
  for (const [group,groupChanges] of makeGroupsForAudit_cor(changes)) {
    await auditService.recordGroupUpdate_cor(req,{
      executor:connection,id_ins_fl:id,group,before,after,changes:groupChanges
    });
  }
  return {id_ins_fl:id,changed:true,changed_fields:Object.keys(changes)};
}

async function updateDirect_cor(req,projectKey,idRaw,body) {
  const {field,value}=normalizeSingleCell_cor(body,false);
  const expected=expectedCell_cor(body.expected,field);
  const id=positiveId_cor(idRaw);
  const project=repository.parseProjectKey_cor(projectKey);
  const scope=await authorizedScope_cor(req);
  const today=rules.zonedToday_cor();
  const connection=await db.getConnection();
  let started=false;
  try {
    await connection.beginTransaction();started=true;
    const before=await repository.getRecordById_cor({
      id,scope,projectKey:project.key,connection,forUpdate:true
    });
    if (!before) throw rules.knownError_cor(404,'INSTALACIONES_ADMINISTRACION_REGISTRO_NO_ENCONTRADO',
      'Equipo fuera de tu alcance o ya no pertenece al proyecto.');
    if (changed_cor(before[field],expected)) throw rules.knownError_cor(409,
      'INSTALACIONES_ADMINISTRACION_CONFLICTO_CONCURRENCIA',
      'La celda cambio en el servidor. Actualiza la tabla antes de reintentar.');
    const row=await persistOne_cor(req,connection,id,before,field,value,today);
    await connection.commit();started=false;
    // Nunca retornar after ni nuevas FK: puede cambiar alcance tras el PATCH.
    return {updated:row.changed,record:row,audit:row.changed?'ATOMIC_USUARIO_INTERACCIONES':'NO_CHANGE'};
  } catch(error) {
    if(started) {try{await connection.rollback();}catch(_rollbackError){}}
    throw error;
  } finally {connection.release();}
}

async function updateDirectMulti_cor(req,projectKey,body) {
  const {field,value}=normalizeSingleCell_cor(body,true);
  const ids=normalizedIds_cor(body);
  const project=repository.parseProjectKey_cor(projectKey);
  if (!project.key.startsWith('P:')) throw rules.knownError_cor(400,
    'INSTALACIONES_ADMINISTRACION_PROYECTO_NO_AGRUPABLE',
    'La edicion multiple requiere un PP NS definido.');
  const expected=body.expected;
  if (Object.keys(expected).length!==ids.length) throw rules.knownError_cor(400,
    'INSTALACIONES_ADMINISTRACION_EXPECTED_REQUERIDO',
    'Se requiere un valor original para cada equipo seleccionado.');
  const originals=new Map();
  for (const id of ids) originals.set(id,expectedCell_cor(expected[String(id)],field));
  const scope=await authorizedScope_cor(req);
  const today=rules.zonedToday_cor();
  const connection=await db.getConnection();
  let started=false;
  try {
    await connection.beginTransaction();started=true;
    const originalRows=new Map();
    // Bloquear TODOS antes de modificar ninguno (orden total anti-deadlock).
    for (const id of ids) {
      const row=await repository.getRecordById_cor({
        id,scope,projectKey:project.key,connection,forUpdate:true
      });
      if (!row) throw rules.knownError_cor(404,
        'INSTALACIONES_ADMINISTRACION_EQUIPO_NO_DISPONIBLE',
        'Un equipo ya no existe, no es visible o no pertenece al proyecto.');
      if (String(row.id_proyecto??'')!==project.params[0]) throw rules.knownError_cor(409,
        'INSTALACIONES_ADMINISTRACION_PROYECTO_CAMBIADO','Proyecto del equipo modificado.');
      if (changed_cor(row[field],originals.get(id))) throw rules.knownError_cor(409,
        'INSTALACIONES_ADMINISTRACION_CONFLICTO_CONCURRENCIA',
        'La informacion de un equipo cambio. Ningun equipo fue modificado.');
      originalRows.set(id,row);
    }
    const records=[];
    for (const id of ids) {
      records.push(await persistOne_cor(req,connection,id,originalRows.get(id),field,value,today));
    }
    await connection.commit();started=false;
    return {selected:ids.length,updated:records.filter(x=>x.changed).length,
      records,audit:'ATOMIC_USUARIO_INTERACCIONES'};
  } catch(error) {
    if(started){try{await connection.rollback();}catch(_rollbackError){}}
    throw error;
  } finally {connection.release();}
}

async function getEditCatalogs_cor(req) {
  await service.ensureFullEditPermission_cor(req);
  // Usuarios de las areas exactas ya registradas en usuarios.area.
  const [users]=await db.query(
    `SELECT id_SB,iniciales,area
       FROM usuarios
      WHERE estado=1 AND area IN ('Ventas','Instalaciones')
      ORDER BY area ASC,iniciales ASC,id_SB ASC`
  );
  // SEGURIDAD FASE 4: el catalogo de captura no necesita ni debe enviar
  // el mapa global de relaciones asesor/administrativo. Ese mapa no llevaba
  // un filtro de alcance CORELLIAN. La columna virtual `rel_admin` se obtiene
  // exclusivamente mediante projectEquipmentTable_cor, que valida proyecto,
  // permiso y scope por equipo antes de concatenar iniciales.
  const options=area=>users.filter(u=>u.area===area)
    .map(u=>({id_SB:Number(u.id_SB),iniciales:u.iniciales}));
  return {
    estatus: rules.STATUS_CODES_COR.map(codigo=>({codigo,nombre:rules.STATUS_LABELS_COR[codigo]})),
    vendedores:options('Ventas'),supervisores:options('Instalaciones'),
    reglas:{max_equipos_por_lote:MAX_MULTI_COR, solo_una_celda:true,
      requiere_confirmacion_multiple:true, readonly:rules.DIRECT_READONLY_FIELDS_COR}
  };
}

module.exports = {
  MAX_MULTI_COR, normalizeSingleCell_cor, expectedCell_cor,
  exactUserByInitials_cor, adminForSales_cor, rowChanges_cor, sqlError_cor,
  updateDirect_cor, updateDirectMulti_cor, getEditCatalogs_cor
};
