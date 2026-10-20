'use strict';

/**
 * BLT NOW - Offline, nueva implementacion Fase 2.
 * Exportador paginado del dataset certificado RESUMEN DEL DIA (UNITED).
 * Cada request pasa los Guards oficiales de Modo Offline y OPERACION/UNITED.
 * Un modulo sin exportador certificado NUNCA puede descargar tablas arbitrarias.
 */
const {scopeFingerprint} = require('./offline-pilot.catalog');

const DATASET = 'operacion-resumen-dia';
const CORELLIAN_DATASET = 'instalaciones-proyectos';
const KINDS = Object.freeze(['tickets', 'portafolio']);
const CORELLIAN_KINDS = Object.freeze(['proyectos']);
function datasetOf(req) {
  const key=String(req?.offlineExportDataset || DATASET);
  if(key!==DATASET&&key!==CORELLIAN_DATASET)throw badRequest('Exportador no registrado.');
  return key;
}
function kindsOf(dataset){return dataset===CORELLIAN_DATASET?CORELLIAN_KINDS:KINDS;}
const PAGE_LIMIT = 300;
const MAX_PAGE_LIMIT = 500;

function badRequest(message) {
  const e = new Error(message);
  e.status = 400;
  e.code = 'OFFLINE_EXPORT_BAD_REQUEST';
  return e;
}

function asId(value, label, {allowZero = false} = {}) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || (allowZero ? n < 0 : n <= 0)) throw badRequest(`Parametro invalido: ${label}.`);
  return n;
}

function asRows(result) {
  const rows = result?.[0];
  if (!Array.isArray(rows)) throw new Error('La consulta de respaldo no devolvio filas validas.');
  return rows;
}

function effectiveScope(req) {
  const dataset=datasetOf(req);
  const domain=dataset===CORELLIAN_DATASET?'CORELLIAN':'UNITED';
  const access=req?.informationAccess, scope=access?.alcance;
  if(!access||access.dominio!==domain||access.acceso_puerta!==true||
     !scope||scope.empresa!==domain||!scope.motor){
    const e=new Error('Alcance de empresa no autorizado para el exportador.');
    e.status=403;e.code='OFFLINE_EXPORT_SCOPE_DENIED';throw e;
  }
  const master=scope.llave_maestra===true;
  if(domain==='UNITED'){
    if(!master&&(access.requiere_filtro_zona!==true||!Array.isArray(access.zona_ids)||!access.zona_ids.length)){
      const e=new Error('Sin zonas autorizadas para el respaldo.');e.status=403;e.code='OFFLINE_EXPORT_NO_ZONES';throw e;
    }
    const zoneIds=master?null:[...new Set(access.zona_ids.map(Number).filter(x=>Number.isSafeInteger(x)&&x>0))].sort((a,b)=>a-b);
    const zones=master?null:[...new Set((access.zona_codigos||[]).map(x=>String(x||'').trim().toUpperCase()).filter(Boolean))].sort();
    if(zoneIds!==null&&!zoneIds.length)throw badRequest('Alcance territorial vacio.');
    return {dataset,domain,master_key:master,scope_signature:scopeFingerprint(domain,master,zoneIds),
      alcance:{zona_ids:zoneIds,zonas:zones}};
  }
  if(!master&&(access.requiere_filtro_usuario!==true||!Array.isArray(access.usuarios_visibles)||!access.usuarios_visibles.length)){
    const e=new Error('Sin personas autorizadas para el respaldo CORELLIAN.');e.status=403;e.code='OFFLINE_EXPORT_NO_USERS';throw e;
  }
  const ids=master?null:[...new Set(access.usuarios_visibles.map(Number).filter(x=>Number.isSafeInteger(x)&&x>0))].sort((a,b)=>a-b);
  if(ids!==null&&!ids.length)throw badRequest('Alcance de personas vacio.');
  return {dataset,domain,master_key:master,scope_signature:scopeFingerprint(domain,master,ids),
    alcance:{visible_user_count:ids===null?null:ids.length,master_key:master}};
}

function scopeBuilders(req, injected = {}) {
  const deps = injected.scope || require('../../services/information-record-scope-gnral.service');
  if(datasetOf(req)===CORELLIAN_DATASET)return {proyectos:deps.buildInsFlScopeSql_gnral(req,'f')};
  return {portafolio:deps.buildPortafolioScopeSql_gnral(req,'p'),tickets:deps.buildTicketScopeSql_gnral(req,'t')};
}

function countQuery(kind, scope) {
  if(kind==='proyectos')return {sql:`SELECT COUNT(*) AS total, COALESCE(MAX(f.id_ins_fl),0) AS max_id, MAX(f.updated_at) AS max_updated FROM ins_fl f WHERE (${scope.sql})`,params:scope.params||[]};
  if (kind === 'tickets') {
    return {sql: `SELECT COUNT(*) AS total, COALESCE(MAX(t.id),0) AS max_id,
             MAX(t.actualizado_en) AS max_updated
             FROM tickets t WHERE (${scope.sql})`, params: scope.params || []};
  }
  return {sql: `SELECT COUNT(*) AS total, COALESCE(MAX(p.id_portafolio),0) AS max_id,
            MAX(p.updated_at) AS max_updated
            FROM portafolio p INNER JOIN z_op z_rd
              ON z_rd.id_zona = p.zona_id AND z_rd.estado = 1
            WHERE (${scope.sql})`, params: scope.params || []};
}

function isoOrNull(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
}

async function getManifest(req, injected = {}) {
  const authorized = effectiveScope(req);
  const db = injected.connection || require('../../config/db');
  const scopes = scopeBuilders(req, injected);
  const entries = await Promise.all(kindsOf(authorized.dataset).map(async kind => {
    const query = countQuery(kind, scopes[kind]);
    const rows = asRows(await db.query(query.sql, query.params));
    if (rows.length !== 1) throw new Error('No fue posible determinar la integridad del universo offline.');
    const count = asId(rows[0].total, 'total', {allowZero: true});
    const maxId = asId(rows[0].max_id, 'max_id', {allowZero: true});
    if (count > 0 && maxId === 0) throw new Error('Manifest de respaldo inconsistente.');
    return [kind, {count, max_id: maxId, max_updated: isoOrNull(rows[0].max_updated)}];
  }));
  return {
    ok: true,
    dataset: authorized.dataset,
    domain: authorized.domain,
    scope_signature: authorized.scope_signature,
    alcance: authorized.alcance,
    kinds: Object.fromEntries(entries),
    page_limit: PAGE_LIMIT,
    excludes_binary_attachments: true
  };
}

function queryOptions(req) {
  const kind = String(req?.query?.kind || '');
  if (!kindsOf(datasetOf(req)).includes(kind)) throw badRequest('Conjunto de datos no autorizado.');
  const after = asId(req?.query?.after_id ?? 0, 'after_id', {allowZero: true});
  const high = asId(req?.query?.upper_id ?? 0, 'upper_id', {allowZero: true});
  const limit = asId(req?.query?.limit ?? PAGE_LIMIT, 'limit');
  if (limit > MAX_PAGE_LIMIT || after > high) throw badRequest('Cursor o limite fuera de rango.');
  return {kind, after, high, limit};
}

async function getPage(req, injected = {}) {
  const authorized = effectiveScope(req);
  const {kind, after, high, limit} = queryOptions(req);
  const db = injected.connection || require('../../config/db');
  const scopes = scopeBuilders(req, injected);
  const scope = scopes[kind];
  const extra = [after, high, limit + 1];
  let sql, params, key;
  if(kind==='proyectos'){
    key='id_ins_fl';
    sql=`SELECT f.* FROM ins_fl f WHERE (${scope.sql}) AND f.id_ins_fl > ? AND f.id_ins_fl <= ? ORDER BY f.id_ins_fl ASC LIMIT ?`;
  } else if (kind === 'tickets') {
    const repo = injected.resumenRepository || require('../resumen-dia/resumen-dia.repository');
    key = 'id';
    sql = `SELECT t.*,
         CASE WHEN NULLIF(TRIM(COALESCE(t.codigo_equipo, '')), '') IS NOT NULL
              THEN z_equipo_rd.zona ELSE ${repo.officialProjectZoneSql('t')} END AS zona_oficial,
         CASE WHEN NULLIF(TRIM(COALESCE(t.codigo_equipo, '')), '') IS NOT NULL
              THEN p_equipo_rd.zona_id ELSE ${repo.officialProjectZoneIdSql('t')} END AS zona_id_oficial
         FROM tickets t
         LEFT JOIN portafolio p_equipo_rd ON p_equipo_rd.estado_registro = 1
           AND TRIM(COALESCE(p_equipo_rd.numero_equipo,'')) = TRIM(COALESCE(t.codigo_equipo,''))
         LEFT JOIN z_op z_equipo_rd ON z_equipo_rd.id_zona = p_equipo_rd.zona_id AND z_equipo_rd.estado = 1
         WHERE (${scope.sql}) AND t.id > ? AND t.id <= ?
         ORDER BY t.id ASC LIMIT ?`;
  } else {
    key = 'id_portafolio';
    sql = `SELECT p.*, z_rd.zona AS zona_oficial, z_rd.nombre AS zona_nombre_oficial
         FROM portafolio p INNER JOIN z_op z_rd
           ON z_rd.id_zona = p.zona_id AND z_rd.estado = 1
         WHERE (${scope.sql}) AND p.id_portafolio > ? AND p.id_portafolio <= ?
         ORDER BY p.id_portafolio ASC LIMIT ?`;
  }
  params = [...(scope.params || []), ...extra];
  const all = asRows(await db.query(sql, params));
  const hasMore = all.length > limit;
  const records = (hasMore ? all.slice(0, limit) : all).map(row => {
    if(kind==='proyectos')return {...row};
    if (kind === 'tickets') return {...row, zona: row.zona_oficial || null};
    return {...row, zona: row.zona_oficial || null, zona_operativa: row.zona_oficial || null};
  });
  let cursor = after;
  for (const row of records) {
    const id = asId(row[key], key);
    if (id <= cursor || id > high) throw new Error('La pagina no respeta el cursor del respaldo.');
    cursor = id;
  }
  if (hasMore && cursor === after) throw new Error('El exportador no avanzo el cursor.');
  return {
    ok: true,
    dataset: authorized.dataset,
    kind,
    domain: authorized.domain,
    scope_signature: authorized.scope_signature,
    alcance: authorized.alcance,
    rows: records,
    next_cursor: cursor,
    has_more: hasMore
  };
}

module.exports = {DATASET, CORELLIAN_DATASET, KINDS, CORELLIAN_KINDS, PAGE_LIMIT, MAX_PAGE_LIMIT, effectiveScope, queryOptions, getManifest, getPage};
