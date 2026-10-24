'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_EXCEL_FASE_4_V001]
// Lista de Zona 1: SELECT paginado, identidad por id_dmp, alcance oficial UNITED.
// Ninguna consulta global a Zona 1, escritura, atajo de permiso ni JOIN por nombre.
const db=require('../../config/db');
const scope=require('../../services/cobranza-uni-scope.service');
const {MP_ZONE1_COLUMNS_UNI}=require('./cobranza-uni-administracion.constants');
const FIELDS=new Set(MP_ZONE1_COLUMNS_UNI.map(c=>c.name));
const SEARCH_FIELDS=Object.freeze(['id_mp_zona_1','id_dmp','proyecto','idns','cliente']);
const PAGE_SIZES=Object.freeze([15,25,50]);
const MAX_PAGE=100000;
function fail_uni(statusCode,code,message){
  const err=new Error(message);err.statusCode=statusCode;err.code=code;return err;
}
function string_uni(raw,name,max=120){
  if(raw===undefined||raw===null)return '';
  if(typeof raw!=='string'||raw.length>max||/[\x00-\x1f\x7f]/.test(raw))
    throw fail_uni(400,'MP_ZONA1_GRID_QUERY_INVALIDA','Parametro invalido: '+name);
  return raw.trim();
}
function parseGridParams_uni(query={}){
  if(!query||typeof query!=='object'||Array.isArray(query)||
    Object.keys(query).some(k=>!['page','page_size','search','filter_column','filter_value','sort','order'].includes(k)))
    throw fail_uni(400,'MP_ZONA1_GRID_QUERY_INVALIDA','Parametros de consulta no permitidos.');
  const positive=(raw,fallback,max,key)=>{
    if(raw===undefined||raw===null||raw==='')return fallback;
    if((typeof raw!=='string'&&typeof raw!=='number')||!/^[1-9]\d{0,5}$/.test(String(raw)))
      throw fail_uni(400,'MP_ZONA1_GRID_QUERY_INVALIDA','Parametro invalido: '+key);
    const n=Number(raw);
    if(!Number.isSafeInteger(n)||n>max)throw fail_uni(400,'MP_ZONA1_GRID_QUERY_INVALIDA','Parametro fuera de rango: '+key);
    return n;
  };
  const page=positive(query.page,1,MAX_PAGE,'page');
  const pageSize=positive(query.page_size,25,50,'page_size');
  if(!PAGE_SIZES.includes(pageSize))throw fail_uni(400,'MP_ZONA1_GRID_QUERY_INVALIDA','Tamano de pagina no autorizado.');
  const search=string_uni(query.search,'search');
  const filterColumn=string_uni(query.filter_column,'filter_column',80);
  const filterValue=string_uni(query.filter_value,'filter_value');
  const sort=string_uni(query.sort,'sort',80)||'id_mp_zona_1';
  const order=(string_uni(query.order,'order',4)||'asc').toLowerCase();
  if(!FIELDS.has(sort)||(filterColumn&&!FIELDS.has(filterColumn))||
    (filterValue&&!filterColumn)||!['asc','desc'].includes(order))
    throw fail_uni(400,'MP_ZONA1_GRID_QUERY_INVALIDA','Columna, orden o filtro no permitido.');
  return Object.freeze({page,pageSize,search,filterColumn,filterValue,sort,order});
}
function like_uni(value){return '%'+value.replace(/[!%_]/g,char=>'!'+char)+'%';}
function verifyScope_uni(req,deps={}){
  if(!req||req.informationAccess?.empresa!=='UNITED'||req.informationAccess?.acceso_puerta!==true)
    throw fail_uni(403,'MP_ZONA1_GRID_ACCESO_DENEGADO','Puerta UNITED cerrada.');
  const trusted=deps.scopeService||scope;
  const territorial=(deps.scopeBuilder||trusted.buildCobranzaProjectScopeSql_uni)(req,'mp');
  const canonical=trusted.canonicalProjectSql_uni('mp');
  if(typeof territorial!=='string'||!territorial.trim()||
    typeof canonical!=='string'||!canonical.trim())
    throw fail_uni(403,'MP_ZONA1_GRID_ALCANCE_NO_VERIFICADO','Alcance/identidad oficial no disponibles.');
  return {territorial,canonical};
}
function buildVerifiedZone1Where_uni(verified){
  if(!verified?.territorial||!verified?.canonical)
    throw fail_uni(403,'MP_ZONA1_GRID_ALCANCE_NO_VERIFICADO','Alcance obligatorio.');
  const norm=(alias,field)=>`UPPER(TRIM(${alias}.\`${field}\`)) COLLATE utf8mb4_0900_bin`;
  const pair=field=>`${norm('mp',field)} = ${norm('z',field)}`;
  const present=(alias,field)=>`NULLIF(TRIM(${alias}.\`${field}\`), '') IS NOT NULL`;
  const missing=(alias,field)=>`NULLIF(TRIM(${alias}.\`${field}\`), '') IS NULL`;
  const optional=field=>`(${missing('mp',field)} OR ${missing('z',field)} OR (${pair(field)}))`;
  return [
    `(${verified.territorial})`, `(${verified.canonical}) IS NOT NULL`,
    'z.`id_dmp` IS NOT NULL',
    present('mp','proyecto'),present('z','proyecto'),`(${pair('proyecto')})`,
    present('mp','idns'),present('z','idns'),`(${pair('idns')})`,optional('cliente')
  ].join(' AND ');
}
function buildScopedZone1Where_uni(verified){
  if(!verified?.territorial||!verified?.canonical)
    throw fail_uni(403,'MP_ZONA1_GRID_ALCANCE_NO_VERIFICADO','Alcance obligatorio.');
  return `(${verified.territorial}) AND (${verified.canonical}) IS NOT NULL `+
    'AND z.`id_dmp` IS NOT NULL';
}
function buildGridSql_uni(params,verified,repairMode=false){
  if(!params||!verified?.territorial||!verified?.canonical)
    throw fail_uni(403,'MP_ZONA1_GRID_ALCANCE_NO_VERIFICADO','Alcance obligatorio.');
  const where=[repairMode?buildScopedZone1Where_uni(verified):
    buildVerifiedZone1Where_uni(verified)];
  const vals=[];
  if(params.search){
    where.push('('+SEARCH_FIELDS.map(name=>
      `CAST(z.\`${name}\` AS CHAR) LIKE ? ESCAPE '!'`).join(' OR ')+')');
    for(const name of SEARCH_FIELDS)vals.push(like_uni(params.search));
  }
  if(params.filterColumn&&params.filterValue){
    where.push(`CAST(z.\`${params.filterColumn}\` AS CHAR) LIKE ? ESCAPE '!'`);
    vals.push(like_uni(params.filterValue));
  }
  const from=`FROM \`detalle_mp_2026_zona_1\` z `+
    `INNER JOIN \`detalle_mp_2026\` mp ON mp.\`id_dmp\` = z.\`id_dmp\` `+
    'WHERE '+where.join(' AND ');
  // CAST DATE a AAAA-MM-DD: evita diferencias de UTC/DST en edicion Excel.
  const select=MP_ZONE1_COLUMNS_UNI.map(({name,sqlType})=>
    ['id_dmp','id_mp_zona_1'].includes(name)||sqlType==='date'
      ? `CAST(z.\`${name}\` AS CHAR) AS \`${name}\`` : `z.\`${name}\``).join(', ');
  const order=`ORDER BY z.\`${params.sort}\` ${params.order.toUpperCase()}`+
    (params.sort==='id_mp_zona_1'?'':', z.`id_mp_zona_1` ASC');
  const identityFlag=repairMode?', CASE WHEN ('+buildVerifiedZone1Where_uni(verified)+
    ') THEN 1 ELSE 0 END AS identity_match':'';
  return Object.freeze({countSql:`SELECT COUNT(*) AS total ${from}`,
    selectSql:`SELECT ${select}${identityFlag} ${from} ${order} LIMIT ? OFFSET ?`,
    countParams:vals,selectParams:[...vals,params.pageSize,(params.page-1)*params.pageSize]});
}
function count_uni(row){
  const raw=String(row?.total??'');
  if(!/^\d+$/.test(raw)||BigInt(raw)>BigInt(Number.MAX_SAFE_INTEGER))
    throw fail_uni(409,'MP_ZONA1_GRID_CONTEO_INVALIDO','Conteo de filas no confiable.');
  return Number(raw);
}
async function listMpZona1Grid_uni(req,deps={}){
  const params=parseGridParams_uni(req?.query||{});
  const verified=verifyScope_uni(req,deps);
  const repairMode=deps.repairMode===true;
  const sql=buildGridSql_uni(params,verified,repairMode);
  const conn=deps.connection||await db.getConnection();
  try{
    const [countRows]=await conn.query(sql.countSql,sql.countParams);
    if(!Array.isArray(countRows)||countRows.length!==1)
      throw fail_uni(409,'MP_ZONA1_GRID_CONTEO_INVALIDO','Consulta de conteo no confiable.');
    const total=count_uni(countRows[0]);
    const offset=(params.page-1)*params.pageSize;
    const [rows]=total>offset?await conn.query(sql.selectSql,sql.selectParams):[[]];
    if(!Array.isArray(rows)||rows.length>params.pageSize)
      throw fail_uni(409,'MP_ZONA1_GRID_FILAS_INVALIDAS','Consulta de Zona 1 inconsistente.');
    const seen=new Set();
    for(const row of rows){
      const id=String(row?.id_mp_zona_1??''),mp=String(row?.id_dmp??'');
      if(!/^[1-9]\d*$/.test(id)||!/^[1-9]\d*$/.test(mp)||seen.has(id)||
        MP_ZONE1_COLUMNS_UNI.some(c=>!Object.hasOwn(row,c.name)))
        throw fail_uni(409,'MP_ZONA1_GRID_FILAS_INVALIDAS','Fila Zona 1 no confiable.');
      if(repairMode){
        if(![0,1,'0','1'].includes(row.identity_match))
          throw fail_uni(409,'MP_ZONA1_GRID_FILAS_INVALIDAS','Identidad de fila no confiable.');
        row.repair_only=Number(row.identity_match)===0;
        delete row.identity_match;
      }
      seen.add(id);
    }
    return {ok:true,table:'detalle_mp_2026_zona_1',source:'aiven',readonly:true,
      identity_verified:!repairMode||rows.every(row=>!row.repair_only),
      scope_verified:true,repair_mode:repairMode,
      relation:'id_dmp',primary_key:'id_mp_zona_1',
      columns:MP_ZONE1_COLUMNS_UNI,rows,total,
      page:params.page,page_size:params.pageSize,pages:Math.ceil(total/params.pageSize),
      sort:params.sort,order:params.order};
  }finally{if(!deps.connection)conn.release();}
}
module.exports=Object.freeze({listMpZona1Grid_uni,parseGridParams_uni,buildGridSql_uni,
  buildVerifiedZone1Where_uni,buildScopedZone1Where_uni,verifyScope_uni});
