'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_VA_ADMIN_FASE_5_V001]
// Solo SELECT, alcance oficial por tabla y puente de identidad univoco.
// GAS permanece activo. No INSERT/UPDATE/DELETE ni cambios de esquema.
const dbScope=require('../../services/cobranza-uni-scope.service');
const identityFactory=require('../../services/cobranza-uni/identidad-proyecto.service');
const {
  MAX_RELATED_ROWS_UNI,normalText_uni,idText_uni,keyVerified_uni,
  buildPcRelationPreview_uni
}=require('./cobranza-uni-administracion.pc-relations');

const FETCH_SIZE_UNI=500;
const MAX_PAGE_IDENTITIES_UNI=100;
function scopeText_uni(fn,req,alias){
  const sql=fn(req,alias);
  if(typeof sql!=='string'||!sql.trim())throw new Error('Alcance UNITED no disponible.');
  return sql;
}
function uniqueClients_uni(rows){
  const map=new Map();
  for(const row of rows){
    const name=String(row?.cliente??'').trim();
    if(name&&name.length<=255&&!map.has(normalText_uni(name)))
      map.set(normalText_uni(name),name);
  }
  return [...map.values()];
}
async function queryPaged_uni(conn,makeSql,max=MAX_RELATED_ROWS_UNI){
  const all=[];let offset=0;
  // LIMIT/OFFSET: columnas BIGINT no se convierten a Number para cursor.
  while(all.length<=max){
    const {sql,params}=makeSql(offset,FETCH_SIZE_UNI);
    if(!/^\s*SELECT\s/i.test(sql))throw new Error('Consulta de relaciones no es SELECT.');
    const [rows]=await conn.query(sql,params);
    if(!Array.isArray(rows))throw new Error('Respuesta de Aiven invalida.');
    if(rows.length>FETCH_SIZE_UNI)throw new Error('Pagina Aiven excede limite.');
    all.push(...rows);
    if(rows.length<FETCH_SIZE_UNI)break;
    offset+=rows.length;
  }
  if(all.length>max)throw new Error('Limite seguro de registros relacionados alcanzado.');
  return all;
}
function lookupFilters_uni(alias,identities,construct){
  const clauses=[],params=[];
  for(const identity of identities){
    const result=construct(alias,identity);
    if(!result?.protegido||!Array.isArray(result.params))
      throw new Error('Identidad sin filtro autorizado.');
    clauses.push('('+result.sql+')');params.push(...result.params);
  }
  return {clauses,params};
}
function sqlMp_uni({filters,clients,territory,canonical}){
  const groups=[],args=[];
  if(filters.clauses.length){
    groups.push('('+filters.clauses.join(' OR ')+')');args.push(...filters.params);
  }
  if(clients.length){
    // El fallback por CLIENTE aplica solo a TERMINOS y usa exclusivamente MP
    // con identidad verificada y el alcance humano autorizado.
    const clientClause=clients.map(()=>
      'TRIM(mp.`cliente`) COLLATE utf8mb4_0900_as_ci = TRIM(?) COLLATE utf8mb4_0900_as_ci');
    groups.push('((' + clientClause.join(' OR ')+') AND '+canonical+' IS NOT NULL)');
    args.push(...clients);
  }
  if(!groups.length)return null;
  const query='SELECT CAST(mp.`id_dmp` AS CHAR) AS id_dmp, '+
    'CAST(mp.`id_proyecto_cobranza` AS CHAR) AS id_proyecto_cobranza, '+
    'mp.`proyecto`, mp.`cliente`, mp.`condiciones_pago`, mp.`z_oper`, mp.`estado`, mp.`estatus_cartera` '+
    'FROM `detalle_mp_2026` mp WHERE ('+territory+') AND ('+groups.join(' OR ')+') '+
    'ORDER BY mp.`id_dmp` ASC LIMIT ? OFFSET ?';
  return (offset,limit)=>({sql:query,params:[...args,limit,offset]});
}
function sqlPcSiblings_uni({filters,territory}){
  if(!filters.clauses.length)return null;
  const query='SELECT CAST(pc.`id_pc` AS CHAR) AS id_pc, '+
    'CAST(pc.`id_proyecto_cobranza` AS CHAR) AS id_proyecto_cobranza, '+
    'pc.`proyecto`, pc.`cliente`, pc.`estatus_administrativo`, '+
    'pc.`precio_venta`, pc.`tipo_pago`, pc.`fecha_factura`, pc.`terminos` '+
    'FROM `pc` pc WHERE ('+territory+') AND ('+filters.clauses.join(' OR ')+') '+
    'ORDER BY pc.`id_pc` ASC LIMIT ? OFFSET ?';
  return (offset,limit)=>({sql:query,params:[...filters.params,limit,offset]});
}
async function previewPcRelationsFromAiven_uni(req,connection,pageRows,cutoffIso,deps={}){
  if(!Array.isArray(pageRows)||pageRows.length>MAX_PAGE_IDENTITIES_UNI)
    throw new TypeError('Pagina pc fuera de contrato.');
  if(!pageRows.length)return buildPcRelationPreview_uni({pageRows:[],identities:new Map(),
    mpRows:[],siblingRows:[],cutoffIso});
  const scopeBuilder=deps.scopeBuilder||dbScope.buildCobranzaProjectScopeSql_uni;
  const canon=deps.canonicalProjectSql||dbScope.canonicalProjectSql_uni;
  const resolver=deps.identityResolver||identityFactory.crearServicioIdentidadProyectoUni({
    consultar:(sql,params)=>connection.query(sql,params)
  });
  const identities=new Map(),resolved=new Map(),groups=new Map();
  // Varios registros/ventas de una obra solo consultan identidad una vez.
  for(const row of pageRows){
    const project=String(row.proyecto??'').trim();
    const fk=idText_uni(row.id_proyecto_cobranza)||'NULL';
    const lookupKey=normalText_uni(project)+'\u0001'+fk;
    let identity=resolved.get(lookupKey);
    if(!identity){
      identity=await resolver.resolverIdentidadProyecto_uni({
        proyecto:project,idProyectoCobranza:row.id_proyecto_cobranza
      });
      resolved.set(lookupKey,identity);
    }
    identities.set(String(row.id_pc),identity);
    const group=keyVerified_uni(identity);
    if(group&&!groups.has(group))groups.set(group,identity);
  }
  const unique=[...groups.values()];
  const identitiesSql=resolver.construirFiltroIdentidadProyecto_uni ||
    identityFactory.construirFiltroIdentidadProyecto_uni;
  const mpFilters=lookupFilters_uni('mp',unique,identitiesSql);
  const pcFilters=lookupFilters_uni('pc',unique,identitiesSql);
  const clients=uniqueClients_uni(pageRows);
  let mpRows=[];
  if(mpFilters.clauses.length||clients.length){
    const mpScope=scopeText_uni(scopeBuilder,req,'mp');
    const query=sqlMp_uni({filters:mpFilters,clients,territory:mpScope,canonical:canon('mp')});
    if(query)mpRows=await queryPaged_uni(connection,query,deps.maxRelatedRows??MAX_RELATED_ROWS_UNI);
  }
  let siblingRows=[];
  if(pcFilters.clauses.length){
    const pcScope=scopeText_uni(scopeBuilder,req,'pc');
    siblingRows=await queryPaged_uni(connection,
      sqlPcSiblings_uni({filters:pcFilters,territory:pcScope}),
      deps.maxRelatedRows??MAX_RELATED_ROWS_UNI);
  }
  // F6: la simulacion de un alta puede incluir SOLO su registro propuesto
  // en los acumulados; NO INSERT/UPDATE y sin simular registros de terceros.
  const pendingRows=deps.pendingRows;
  if(pendingRows!==undefined){
    if(!Array.isArray(pendingRows)||pendingRows.length!==1||
      pendingRows[0]!==pageRows[0]||pageRows.length!==1){
      throw new TypeError('Registro pendiente no corresponde a la simulacion.');
    }
    if(siblingRows.length>=MAX_RELATED_ROWS_UNI){
      throw new Error('Limite seguro de registros relacionados alcanzado.');
    }
    siblingRows=[...siblingRows,...pendingRows];
  }
  return buildPcRelationPreview_uni({pageRows,identities,mpRows,siblingRows,cutoffIso});
}
module.exports=Object.freeze({
  FETCH_SIZE_UNI,MAX_PAGE_IDENTITIES_UNI,uniqueClients_uni,queryPaged_uni,
  sqlMp_uni,sqlPcSiblings_uni,previewPcRelationsFromAiven_uni
});
