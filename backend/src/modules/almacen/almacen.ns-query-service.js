'use strict';

// [BLT NOW | 2026-10-19 | ALMACEN NS | FASE 1]
// Solo consultas a las tablas NetSuite aprobadas; no depende del Excel.
// Los parametros del Panel siguen siendo responsabilidad del Guard central.
// Los registros NetSuite carecen de relaciones persona/zona: restringir a un
// dominio entero explicitamente autorizado. Sin identidad estructurada, negar.

const crypto = require('crypto');
const db = require('../../config/db');

const SOURCE_TYPES = Object.freeze({ inventory:'INVENTARIO_230', catalog:'CATALOGO_ARTICULOS' });
const PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH = 120;

function error(message, status = 400, code = 'ALMACEN_NS_ERROR') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function readScope(req) {
  const context = req?.almacenNsScope;
  const subsidiaryIds = Array.isArray(context?.subsidiaryIds)
    ? [...new Set(context.subsidiaryIds.map(String))]
    : [];
  const expectedIds = [
    ...(context?.masterKeys?.corellian === true ? ['2'] : []),
    ...(context?.masterKeys?.corellian === true && context?.masterKeys?.united === true ? ['3'] : []),
    ...(context?.masterKeys?.united === true ? ['5'] : [])
  ];
  if (!context || !subsidiaryIds.length
    || subsidiaryIds.length !== expectedIds.length
    || subsidiaryIds.some((id, index) => id !== expectedIds[index])) {
    throw error('No se puede determinar un alcance completo para estos registros de NetSuite.', 403, 'ALMACEN_NS_SCOPE_UNRESOLVED');
  }
  // Mapeo confirmado: 2=CORELLIAN, 3=NUBIAN y 5=UNITED. El Guard es la unica
  // autoridad que produce esta lista; los parametros del cliente nunca agregan IDs.
  return Object.freeze({
    domains: Object.freeze([...(context.domains || [])]),
    subsidiaries: Object.freeze([...(context.subsidiaries || [])]),
    subsidiaryIds: Object.freeze(subsidiaryIds)
  });
}

function text(value, limit = MAX_SEARCH) {
  return String(value == null ? '' : value).trim().slice(0, limit);
}
function pageValues(query = {}, fixed = false) {
  const n = Number(query.page);
  const page = Number.isInteger(n) && n >= 1 ? Math.min(n, 1000000) : 1;
  const p = Number(query.pageSize);
  const pageSize = fixed ? PAGE_SIZE : (Number.isInteger(p) && p >= 1 ? Math.min(MAX_PAGE_SIZE, p) : PAGE_SIZE);
  return {page, pageSize, offset:(page - 1) * pageSize};
}
function numberFilter(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function warehouseType(name) {
  const n=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  if(n.includes('PRESTA'))return 'Prestamo';
  if(n.includes('RECUPERA'))return 'Recuperacion';
  if(n.includes('OBSOLETO'))return 'Obsoletos';
  if(n.includes('INSPECCI'))return 'Inspeccion';
  if(n.includes('FUERA'))return 'Fuera';
  if(n.includes('VIRTUAL'))return 'Virtual';
  if(n.includes('HERRAMIEN'))return 'Herramienta';
  return 'General';
}
function convert(row) {
  if (!row) return row;
  const output = {...row};
  for (const key of ['fisico','valor','valorTotal','precioUnitario','piezas','referencias','almacenes','total','expected','expectedValue','unitValue']) {
    if (output[key] != null && Number.isFinite(Number(output[key]))) output[key] = Number(output[key]);
  }
  return output;
}
function pagination(total, pageValuesObject) {
  return {page:pageValuesObject.page,pageSize:pageValuesObject.pageSize,total:Number(total || 0),pages:Math.max(1,Math.ceil(Number(total || 0)/pageValuesObject.pageSize))};
}

async function activeSource(scope, conn = db) {
  const [rows] = await conn.query(
    `SELECT id_lote AS loteImportacion,fecha_corte AS fechaCorte,publicado_en AS fechaImportacion
       FROM almacen_ns_lotes
      WHERE tipo_fuente='INVENTARIO_230' AND modo_carga='COMPLETA'
        AND activo=1 AND estado='PUBLICADO' AND es_completo=1
        AND publicado_en IS NOT NULL AND fecha_corte IS NOT NULL
        AND filas_esperadas>0 AND filas_esperadas=filas_recibidas AND filas_validas=filas_recibidas
      ORDER BY publicado_en DESC LIMIT 1`
  );
  if (!rows.length) return null;
  const item = rows[0];
  const [count] = await conn.query(
    'SELECT COUNT(*) AS filas FROM almacen_ns_inventario WHERE id_lote=? AND id_subsidiaria_ns IN (?)',
    [item.loteImportacion,scope.subsidiaryIds]
  );
  // Un lote valido puede no contener filas autorizadas en este dominio.
  const rowsScoped = Number(count[0]?.filas || 0);
  return {
    provider:'NETSUITE_AIVEN',loteImportacion:item.loteImportacion,
    fechaCorte:item.fechaCorte,fechaImportacion:item.fechaImportacion,
    activo:true,loaded:rowsScoped>0,archived:false,reloadable:false,
    archivoOrigen:'NetSuite · Inventario 230',filas:rowsScoped,filasCargadas:rowsScoped,
    datasets:{INVENTARIO:{filas:rowsScoped},PRESTAMO:{filas:0,available:false},RESGUARDO:{filas:0,available:false}},
    scopeDomains:scope.domains
  };
}

async function catalogLot(conn = db) {
  const [rows] = await conn.query(
    `SELECT id_lote AS idLote FROM almacen_ns_lotes
      WHERE tipo_fuente='CATALOGO_ARTICULOS' AND modo_carga='COMPLETA'
        AND estado='PUBLICADO' AND es_completo=1 AND publicado_en IS NOT NULL
        AND filas_esperadas>0 AND filas_esperadas=filas_recibidas AND filas_validas=filas_recibidas
      ORDER BY publicado_en DESC,id_lote DESC LIMIT 1`
  );
  return rows[0]?.idLote || null;
}

async function snapshot(scope) {
  const source = await activeSource(scope);
  return {source, catalog:source ? await catalogLot() : null};
}

function inventorySql(scope, source, publishedCatalog) {
  const catJoin = publishedCatalog ? `LEFT JOIN (
    SELECT id_articulo_ns,
      CASE WHEN COUNT(DISTINCT NULLIF(TRIM(categoria_articulo),''))=1
           THEN MAX(NULLIF(TRIM(categoria_articulo),'')) ELSE NULL END AS categoria,
      CASE WHEN COUNT(DISTINCT NULLIF(TRIM(numero_parte_fabricante_original),''))=1
           THEN MAX(NULLIF(TRIM(numero_parte_fabricante_original),'')) ELSE NULL END AS ag
      FROM almacen_ns_catalogo_articulos WHERE id_lote=? GROUP BY id_articulo_ns
    ) c ON c.id_articulo_ns=i.id_articulo_ns` : '';
  const categorySql = publishedCatalog ? 'c.categoria' : 'NULL';
  const agSql = publishedCatalog ? 'c.ag' : 'NULL';
  const displayCode = publishedCatalog ? "COALESCE(c.ag,CAST(i.id_articulo_ns AS CHAR))" : 'CAST(i.id_articulo_ns AS CHAR)';
  // El precio unitario es VALOR DE FACTURA / FISICO. Nunca se presenta como
  // ultimo precio de compra/costo de reposicion. Con fisico=0 se deja NULL.
  const sql = `SELECT i.id_inventario AS id,i.id_articulo_ns AS idArticuloNs,
      ${displayCode} AS codigo,i.articulo,${categorySql} AS categoria,
      ${agSql} AS ag,
      i.id_subsidiaria_ns AS idSubsidiariaNs,
      COALESCE(NULLIF(TRIM(i.subsidiaria),''),CONCAT('Subsidiaria ',i.id_subsidiaria_ns)) AS empresa,
      i.id_ubicacion_ns AS idUbicacionNs,
      COALESCE(NULLIF(TRIM(i.almacen_ubicacion),''),CONCAT('Ubicacion ',i.id_ubicacion_ns)) AS almacen,
      i.fisico,i.valor_factura AS valor,
      CASE WHEN i.fisico<>0 THEN i.valor_factura/i.fisico ELSE NULL END AS precioUnitario
    FROM almacen_ns_inventario i ${catJoin}
    WHERE i.id_lote=? AND i.id_subsidiaria_ns IN (?)`;
  const params = publishedCatalog
    ? [publishedCatalog,source.loteImportacion,scope.subsidiaryIds]
    : [source.loteImportacion,scope.subsidiaryIds];
  return {sql,params};
}

function filteredRows(base, query = {}, options = {}) {
  const clauses=[];const args=[];
  const q = text(query.q);
  if (q) {
    const like=`%${q}%`;
    clauses.push('(v.articulo LIKE ? OR v.codigo LIKE ? OR v.ag LIKE ?)');
    args.push(like,like,like);
  }
  const company = text(query.company,255);
  if (company && company !== 'todas') {clauses.push('v.empresa=?');args.push(company);}
  const category = text(query.category,255);
  if (category && category !== 'todas') {clauses.push('v.categoria=?');args.push(category);}
  const warehouse = text(query.warehouse,255);
  if (warehouse && warehouse !== 'todos') {clauses.push('v.almacen=?');args.push(warehouse);}
  if (options.positive) clauses.push('v.fisico>0');
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return {sql:`SELECT v.* FROM (${base.sql}) v ${where}`,params:[...base.params,...args]};
}

function groupedRows(raw) {
  return {sql:`SELECT MIN(v.id) AS id,MAX(v.codigo) AS codigo,
       MAX(v.articulo) AS articulo,MAX(v.categoria) AS categoria,MAX(v.ag) AS ag,
       MAX(v.empresa) AS empresa,MAX(v.idSubsidiariaNs) AS idSubsidiariaNs,
       MAX(v.idArticuloNs) AS idArticuloNs,
       COALESCE(SUM(v.fisico),0) AS fisico,
       SUM(v.valor) AS valor,
       CASE WHEN SUM(v.fisico)<>0 AND SUM(v.valor) IS NOT NULL
            THEN SUM(v.valor)/SUM(v.fisico) ELSE NULL END AS precioUnitario,
       COUNT(DISTINCT v.idUbicacionNs) AS almacenes,
       CASE WHEN COUNT(DISTINCT v.idUbicacionNs)=1 THEN MAX(v.almacen)
            ELSE CONCAT(COUNT(DISTINCT v.idUbicacionNs),' almacenes') END AS almacen
    FROM (${raw.sql}) v GROUP BY v.idSubsidiariaNs,v.idArticuloNs`,params:raw.params};
}

async function listSources(scope) {
  const [rows] = await db.query(
    `SELECT l.id_lote AS loteImportacion,l.tipo_fuente AS tipoFuente,l.fecha_corte AS fechaCorte,
            l.publicado_en AS fechaImportacion,l.activo,l.estado,l.es_completo AS esCompleto
       FROM almacen_ns_lotes l
       WHERE l.tipo_fuente='INVENTARIO_230' AND l.estado='PUBLICADO' AND l.es_completo=1
         AND EXISTS (
           SELECT 1 FROM almacen_ns_inventario i
            WHERE i.id_lote=l.id_lote AND i.id_subsidiaria_ns IN (?)
         )
       ORDER BY l.publicado_en DESC LIMIT 100`,[scope.subsidiaryIds]
  );
  const active = await activeSource(scope);
  // Lista global de tipos de lote, sin revelar las cantidades/filas de otras empresas.
  return {ok:true,sources:rows.map(row=>({
    provider:'NETSUITE_AIVEN',loteImportacion:row.loteImportacion,
    tipoFuente:row.tipoFuente,fechaCorte:row.fechaCorte,
    fechaImportacion:row.fechaImportacion,activo:Number(row.activo||0)===1,
    loaded:active?.loteImportacion===row.loteImportacion ? active.loaded:false,
    filasCargadas:active?.loteImportacion===row.loteImportacion ? active.filasCargadas:0,
    archivoOrigen:`NetSuite · ${row.tipoFuente}`,reloadable:false,archived:false,
    datasets:active?.loteImportacion===row.loteImportacion ? active.datasets:{}
  }))};
}

async function getDashboard(scope) {
  const snap=await snapshot(scope);
  if (!snap.source) return {ok:true,source:null,kpis:null,companies:[],warehouses:[],topByVolume:[],topByValue:[],coverage:{valor:false}};
  const base=inventorySql(scope,snap.source,snap.catalog);
  const grouped=groupedRows(base);
  const [k,co,wc,ws,tv,tv2]=await Promise.all([
    db.query(`SELECT COUNT(*) AS referencias,COALESCE(SUM(fisico),0) AS piezas,
      SUM(CASE WHEN fisico<=0 THEN 1 ELSE 0 END) AS sinStock,
      SUM(CASE WHEN valor IS NOT NULL THEN 1 ELSE 0 END) AS filasConValor,
      SUM(valor) AS valorTotal FROM (${grouped.sql}) g`,grouped.params),
    db.query(`SELECT empresa,COUNT(*) AS referencias,COALESCE(SUM(fisico),0) AS piezas,
      SUM(CASE WHEN valor IS NOT NULL THEN 1 ELSE 0 END) AS filasConValor,SUM(valor) AS valorTotal
      FROM (${grouped.sql}) g GROUP BY empresa`,grouped.params),
    db.query(`SELECT COUNT(DISTINCT idUbicacionNs) AS almacenes FROM (${base.sql}) v WHERE fisico>0`,base.params),
    db.query(`SELECT almacen,empresa,COUNT(*) AS referencias,COALESCE(SUM(fisico),0) AS piezas,SUM(valor) AS valorTotal
      FROM (${base.sql}) v WHERE fisico>0 GROUP BY idSubsidiariaNs,idUbicacionNs,almacen,empresa
      ORDER BY valorTotal DESC LIMIT 5`,base.params),
    db.query(`SELECT codigo,articulo,empresa,fisico AS total FROM (${grouped.sql}) g WHERE fisico>0 ORDER BY fisico DESC LIMIT 15`,grouped.params),
    db.query(`SELECT codigo,articulo,empresa,valor AS total FROM (${grouped.sql}) g WHERE fisico>0 AND valor IS NOT NULL ORDER BY valor DESC LIMIT 15`,grouped.params)
  ]);
  const sum=k[0][0]||{};
  return {ok:true,source:snap.source,kpis:{
    referencias:Number(sum.referencias||0),piezas:Number(sum.piezas||0),
    almacenes:Number(wc[0][0]?.almacenes||0),sinStock:Number(sum.sinStock||0),
    valorTotal:Number(sum.filasConValor||0)>0 ? Number(sum.valorTotal||0):null
  },coverage:{valor:Number(sum.filasConValor||0)>0},
  companies:co[0].map(x=>({...convert(x),valorTotal:Number(x.filasConValor||0)>0?Number(x.valorTotal||0):null})),
  warehouses:ws[0].map(x=>({...convert(x),tipo:warehouseType(x.almacen)})),topByVolume:tv[0].map(convert),topByValue:tv2[0].map(convert)};
}

async function getInventory(scope,query={}) {
  const pg=pageValues(query);
  const snap=await snapshot(scope);
  if (!snap.source) return {ok:true,source:null,rows:[],pagination:pagination(0,pg),summary:{registros:0,piezas:0,valorTotal:null}};
  const grouped=groupedRows(filteredRows(inventorySql(scope,snap.source,snap.catalog),query));
  const filter=[];const args=[];
  const min=numberFilter(query.minValue),max=numberFilter(query.maxValue);
  if(min!==null){filter.push('g.valor>=?');args.push(min);}
  if(max!==null){filter.push('g.valor<=?');args.push(max);}
  if(String(query.stockOnly||'').toLowerCase()==='true'||String(query.stockOnly||'')==='1')filter.push('g.fisico>0');
  const where=filter.length?`WHERE ${filter.join(' AND ')}`:'';
  const [result,count,summary]=await Promise.all([
    db.query(`SELECT * FROM (${grouped.sql}) g ${where} ORDER BY articulo,codigo LIMIT ? OFFSET ?`,[...grouped.params,...args,pg.pageSize,pg.offset]),
    db.query(`SELECT COUNT(*) AS total FROM (${grouped.sql}) g ${where}`,[...grouped.params,...args]),
    db.query(`SELECT COUNT(*) AS registros,COALESCE(SUM(fisico),0) AS piezas,
      SUM(CASE WHEN valor IS NOT NULL THEN 1 ELSE 0 END) AS filasConValor,SUM(valor) AS valorTotal
      FROM (${grouped.sql}) g ${where}`,[...grouped.params,...args])
  ]);
  const sm=summary[0][0]||{};
  return {ok:true,source:snap.source,rows:result[0].map(convert),pagination:pagination(count[0][0]?.total,pg),summary:{
    registros:Number(sm.registros||0),piezas:Number(sm.piezas||0),valorTotal:Number(sm.filasConValor||0)>0?Number(sm.valorTotal||0):null
  }};
}

async function getCatalogs(scope) {
  const snap=await snapshot(scope);
  if (!snap.source)return {ok:true,source:null,companies:[],categories:[],warehouses:[]};
  const inv=inventorySql(scope,snap.source,snap.catalog);
  const [co,ca,wh]=await Promise.all([
    db.query(`SELECT DISTINCT empresa AS value FROM (${inv.sql}) v ORDER BY empresa`,inv.params),
    db.query(`SELECT DISTINCT categoria AS value FROM (${inv.sql}) v WHERE categoria IS NOT NULL ORDER BY categoria`,inv.params),
    db.query(`SELECT DISTINCT almacen AS value FROM (${inv.sql}) v ORDER BY almacen`,inv.params)
  ]);
  return {ok:true,source:snap.source,companies:co[0].map(x=>x.value),categories:ca[0].map(x=>x.value),warehouses:wh[0].map(x=>x.value)};
}

async function getCompany(scope,query={}) {
  const company=text(query.company,255);
  if (!company)throw error('Empresa requerida.',400,'ALMACEN_NS_COMPANY_REQUIRED');
  const result=await getInventory(scope,{company,q:query.q,page:query.page,pageSize:30,stockOnly:true});
  const v=result.summary;
  return {ok:true,source:result.source,company,rows:result.rows,
    summary:{piezas:v.piezas,valorTotal:v.valorTotal,precioPromedio:null},pagination:result.pagination};
}

async function getWarehouses(scope,query={}) {
  const snap=await snapshot(scope);
  if (!snap.source)return {ok:true,source:null,rows:[]};
  const inv=filteredRows(inventorySql(scope,snap.source,snap.catalog),{company:query.company},{positive:true});
  const whereWarehouse=text(query.q);
  const extraWhere=whereWarehouse?'WHERE almacen LIKE ?':'';
  const params=whereWarehouse?[...inv.params,`%${whereWarehouse}%`]:inv.params;
  const [rows]=await db.query(`SELECT almacen,'General' AS tipo,empresa,COUNT(*) AS referencias,
      COALESCE(SUM(fisico),0) AS piezas,SUM(valor) AS valorTotal
      FROM (${inv.sql}) v ${extraWhere} GROUP BY idSubsidiariaNs,idUbicacionNs,almacen,empresa
      ORDER BY valorTotal DESC,almacen`,params);
  return {ok:true,source:snap.source,rows:rows.map(x=>({...convert(x),tipo:warehouseType(x.almacen)}))};
}

async function getTop(scope,query={}) {
  const snap=await snapshot(scope);
  const mode=query.mode==='fisico'?'fisico':'valor';
  if (!snap.source)return {ok:true,source:null,mode,rows:[]};
  const grp=groupedRows(filteredRows(inventorySql(scope,snap.source,snap.catalog),query));
  const metric=mode==='fisico'?'fisico':'valor';
  const limit=Math.floor(Math.min(50,Math.max(1,Number(query.limit)||20)));
  const [rows]=await db.query(`SELECT codigo,articulo,categoria,empresa,${metric} AS total
    FROM (${grp.sql}) g WHERE fisico>0${mode==='valor'?' AND valor IS NOT NULL':''}
    ORDER BY ${metric} DESC LIMIT ?`,[...grp.params,limit]);
  return {ok:true,source:snap.source,mode,rows:rows.map(convert)};
}

async function getStock(scope,query={}) {
  const pg=pageValues(query,true);
  const snap=await snapshot(scope);
  const coverage={abc:false,criticidad:false,demanda:false,stockSeguridad:false,puntoReorden:false,minimo:false,maximo:false};
  if(!snap.source)return {ok:true,source:null,coverage,kpis:null,classSummary:[],companies:[],rows:[],pagination:pagination(0,pg)};
  // En F1 no se inventan niveles de seguridad ni demandas a partir de un corte.
  // Los calculos del Informe 433 corresponden a F2.
  const filterABC=text(query.abc).toLowerCase();const filterAlert=text(query.alert).toLowerCase();
  const none=(filterABC&&filterABC!=='todas')||(filterAlert&&filterAlert!=='todas');
  const inv=groupedRows(filteredRows(inventorySql(scope,snap.source,snap.catalog),query));
  const [c,companies,items]=await Promise.all([
    db.query(`SELECT COUNT(*) AS articulos FROM (${inv.sql}) g`,inv.params),
    db.query(`SELECT DISTINCT empresa AS value FROM (${inv.sql}) g ORDER BY empresa`,inv.params),
    none?Promise.resolve([[]]):db.query(`SELECT id,codigo,articulo,empresa,fisico,
      NULL AS abc,NULL AS criticidad,NULL AS demanda,NULL AS stockSeguridad,
      NULL AS puntoReorden,NULL AS minimo,NULL AS maximo,'sin_parametros' AS alerta
      FROM (${inv.sql}) g ORDER BY articulo,codigo LIMIT ? OFFSET ?`,[...inv.params,pg.pageSize,pg.offset])
  ]);
  return {ok:true,source:snap.source,coverage,kpis:{articulos:Number(c[0][0]?.articulos||0),criticos:0,reorden:0,exceso:0},
    classSummary:[],companies:companies[0].map(x=>x.value),rows:items[0].map(convert),
    pagination:pagination(none?0:c[0][0]?.articulos,pg),stockMetricsStatus:'PENDIENTE_FASE_2'};
}

function operationalUnavailable(source,kind) {
  return {ok:true,source,available:false,kind,reason:'Las fuentes NetSuite aprobadas no contienen los campos necesarios para comprobar esta relacion.'};
}
async function getLoanCatalogs(scope) {const s=await activeSource(scope);return {...operationalUnavailable(s,'PRESTAMOS'),companies:[],responsibles:[],ages:[]};}
async function getLoanSummary(scope) {const s=await activeSource(scope);return {...operationalUnavailable(s,'PRESTAMOS'),kpis:{articulos:0,piezas:0,valorTotal:null,responsables:0},ages:[],rows:[]};}
async function getLoans(scope,query={}) {const s=await activeSource(scope);return {...operationalUnavailable(s,'PRESTAMOS'),rows:[],summary:{articulos:0,cantidad:0,valorTotal:null},pagination:pagination(0,pageValues(query,true))};}
async function getGuardCatalogs(scope) {const s=await activeSource(scope);return {...operationalUnavailable(s,'RESGUARDOS'),companies:[],departments:[]};}
async function getGuards(scope,query={}) {const s=await activeSource(scope);return {...operationalUnavailable(s,'RESGUARDOS'),kpis:{total:0,conSalida:0,sinSalida:0,filtrados:0},rows:[],pagination:pagination(0,pageValues(query,true))};}
async function getStockReabasto(scope,query={}) {
  const s=await activeSource(scope);
  return {ok:true,source:s,available:false,rows:[],
    reason:'Las excepciones heredadas fueron retiradas; no existe persistencia de excepciones en F1.',
    operationalKpis:{requierenReabasto:0,excluidosReabasto:0,excepcionesActivas:0,criticosAccionables:0,reordenAccionables:0},
    pagination:pagination(0,pageValues(query,true)),identityVersion:'netsuite-article-subsidiary-v1'};
}

async function getAuditCatalogs(scope) {
  const snap=await snapshot(scope);
  if(!snap.source)return {ok:true,source:null,available:false,warehouses:[]};
  const inv=inventorySql(scope,snap.source,snap.catalog);
  const [rows]=await db.query(`SELECT empresa AS company,almacen AS warehouse,'General' AS type,
    COUNT(*) AS references,COALESCE(SUM(fisico),0) AS pieces,SUM(valor) AS expectedValue
    FROM (${inv.sql}) v WHERE fisico>0 GROUP BY idSubsidiariaNs,idUbicacionNs,empresa,almacen
    ORDER BY empresa,almacen`,inv.params);
  return {ok:true,source:snap.source,available:rows.length>0,warehouses:rows.map(row=>({...row,references:Number(row.references||0),pieces:Number(row.pieces||0),expectedValue:row.expectedValue==null?null:Number(row.expectedValue)}))};
}

function shuffle(list) {
  const output=list.slice();
  for(let i=output.length-1;i>0;i-=1){const j=crypto.randomInt(i+1);[output[i],output[j]]=[output[j],output[i]];}
  return output;
}
async function getAuditSample(scope,query={}) {
  const snap=await snapshot(scope);
  if(!snap.source)return {ok:true,source:null,available:false,sample:null};
  const company=text(query.company||query.empresa,255),warehouse=text(query.warehouse||query.almacen,255);
  if(!company||!warehouse)throw error('Empresa y almacen son requeridos.',400,'ALMACEN_NS_AUDIT_PARAMS');
  // Un folio historico no permite seleccionar cualquier cierre ni dominio:
  // los conteos nuevos se fotografian solo desde el lote publicado activo.
  const requested=text(query.loteImportacion,36);
  if(requested && requested!==snap.source.loteImportacion)throw error('La auditoria debe usar el corte NetSuite publicado activo.',409,'ALMACEN_NS_AUDIT_STALE_LOT');
  const inv=inventorySql(scope,snap.source,snap.catalog);
  const [rows]=await db.query(`SELECT MIN(id) AS sourceId,MAX(codigo) AS code,MAX(articulo) AS article,
      MAX(categoria) AS category,MAX(empresa) AS company,MAX(almacen) AS warehouse,
      SUM(fisico) AS expected,SUM(valor) AS expectedValue
      FROM (${inv.sql}) v WHERE empresa=? AND almacen=? AND fisico>0
      GROUP BY idSubsidiariaNs,idUbicacionNs,idArticuloNs ORDER BY article,code`,[...inv.params,company,warehouse]);
  if(!rows.length)throw error('El almacen no tiene existencias positivas en el corte autorizado.',404,'ALMACEN_NS_AUDIT_EMPTY');
  const normalized=rows.map(x=>({
    sourceId:Number(x.sourceId),code:x.code||'',article:x.article||x.code||'Sin descripcion',
    category:x.category||'',company:x.company,warehouse:x.warehouse,warehouseType:'General',
    expected:Number(x.expected||0),expectedValue:x.expectedValue==null?null:Number(x.expectedValue),
    unitValue:x.expectedValue!=null&&Number(x.expected)>0?Number(x.expectedValue)/Number(x.expected):null
  }));
  const size=Math.min(normalized.length,Math.max(Math.min(3,normalized.length),Math.round(normalized.length*0.05)));
  const valueCount=Math.min(size,Math.round(size*0.70));
  const ranked=normalized.slice().sort((a,b)=>Number(b.expectedValue||0)-Number(a.expectedValue||0));
  const pool=shuffle(ranked.slice(0,Math.min(ranked.length,Math.max(valueCount*2,Math.min(10,ranked.length)))));
  const byValue=pool.slice(0,valueCount);const used=new Set(byValue.map(x=>x.sourceId));
  const random=shuffle(normalized.filter(x=>!used.has(x.sourceId))).slice(0,size-valueCount);
  const items=shuffle([...byValue,...random]);
  return {ok:true,source:snap.source,available:true,sample:{
    sessionId:crypto.randomUUID(),generatedAt:new Date().toISOString(),
    loteImportacion:snap.source.loteImportacion,fechaCorte:snap.source.fechaCorte,
    company,warehouse,warehouseType:'General',totalReferences:normalized.length,
    sampleSize:items.length,methodology:{percentage:5,byValuePercent:70,randomPercent:30,minimum:Math.min(3,normalized.length)},items
  }};
}

module.exports={
  readScope,activeSource,listSources,getDashboard,getInventory,getCatalogs,getCompany,
  getWarehouses,getTop,getStock,getStockReabasto,
  getLoanCatalogs,getLoanSummary,getLoans,getGuardCatalogs,getGuards,
  getAuditCatalogs,getAuditSample
};
