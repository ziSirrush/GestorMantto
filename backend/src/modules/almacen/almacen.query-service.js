'use strict';

// [Aster | 2026-08-31 | ASTER-MG | FASE 2 ALMACEN MOTOR FUENTE/CIERRE V001]
// Todas las lecturas del módulo pasan por sourceEngine.resolveSource().

const crypto = require('crypto');
const db = require('../../config/db');
const sourceEngine = require('./almacen.source-engine');

const TABLE = sourceEngine.TABLE;
const RECORD_TYPES = sourceEngine.RECORD_TYPES;

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function valueExpression(alias = '') {
  const prefix = alias ? `${alias}.` : '';
  return `COALESCE(${prefix}valor, CASE WHEN ${prefix}fisico IS NOT NULL AND ${prefix}precio_unitario IS NOT NULL THEN ${prefix}fisico * ${prefix}precio_unitario ELSE NULL END)`;
}

function filterFor(source, type) {
  return sourceEngine.buildDatasetFilter(source, type);
}

async function listSources(query = {}) {
  return { ok:true, sources:await sourceEngine.listSources(query) };
}

async function getDashboard(query = {}) {
  const source = await sourceEngine.resolveSource(query);
  if (!source) return { ok:true, source:null, kpis:null, companies:[], warehouses:[], topByVolume:[], topByValue:[], coverage:{} };

  const valueExpr = valueExpression();
  const base = filterFor(source, RECORD_TYPES.INVENTORY);
  const [[kpiRows],[companies],[warehouses],[topByVolume],[topByValue]] = await Promise.all([
    db.query(`SELECT COUNT(*) AS referencias, COALESCE(SUM(COALESCE(fisico,0)),0) AS piezas,
      COUNT(DISTINCT NULLIF(TRIM(almacen),'')) AS almacenes,
      SUM(CASE WHEN fisico IS NOT NULL AND fisico<=0 THEN 1 ELSE 0 END) AS sinStock,
      SUM(CASE WHEN ${valueExpr} IS NOT NULL THEN 1 ELSE 0 END) AS filasConValor,
      SUM(${valueExpr}) AS valorTotal FROM ${TABLE} WHERE ${base.sql}`, base.params),
    db.query(`SELECT COALESCE(NULLIF(TRIM(empresa),''),'Sin empresa') AS empresa, COUNT(*) AS referencias,
      COALESCE(SUM(COALESCE(fisico,0)),0) AS piezas,
      SUM(CASE WHEN ${valueExpr} IS NOT NULL THEN 1 ELSE 0 END) AS filasConValor,
      SUM(${valueExpr}) AS valorTotal FROM ${TABLE} WHERE ${base.sql} GROUP BY empresa ORDER BY valorTotal DESC, empresa`, base.params),
    db.query(`SELECT COALESCE(NULLIF(TRIM(almacen),''),'Sin almacén') AS almacen, MAX(empresa) AS empresa,
      COUNT(*) AS referencias, COALESCE(SUM(COALESCE(fisico,0)),0) AS piezas,
      SUM(${valueExpr}) AS valorTotal FROM ${TABLE} WHERE ${base.sql} GROUP BY almacen ORDER BY valorTotal DESC LIMIT 5`, base.params),
    db.query(`SELECT MAX(codigo) AS codigo, MAX(articulo) AS articulo, MAX(empresa) AS empresa,
      COALESCE(SUM(COALESCE(fisico,0)),0) AS total FROM ${TABLE} WHERE ${base.sql}
      GROUP BY COALESCE(NULLIF(TRIM(codigo),''),NULLIF(TRIM(articulo),''),CONCAT('Fila ',fila_origen)) ORDER BY total DESC LIMIT 15`, base.params),
    db.query(`SELECT MAX(codigo) AS codigo, MAX(articulo) AS articulo, MAX(empresa) AS empresa,
      SUM(${valueExpr}) AS total FROM ${TABLE} WHERE ${base.sql} AND ${valueExpr} IS NOT NULL
      GROUP BY COALESCE(NULLIF(TRIM(codigo),''),NULLIF(TRIM(articulo),''),CONCAT('Fila ',fila_origen)) ORDER BY total DESC LIMIT 15`, base.params)
  ]);

  const kpi = kpiRows[0] || {};
  return {
    ok:true,
    source,
    kpis:{
      referencias:Number(kpi.referencias || 0),
      piezas:Number(kpi.piezas || 0),
      almacenes:Number(kpi.almacenes || 0),
      sinStock:Number(kpi.sinStock || 0),
      valorTotal:Number(kpi.filasConValor || 0) > 0 ? Number(kpi.valorTotal || 0) : null
    },
    coverage:{valor:Number(kpi.filasConValor || 0) > 0},
    companies:companies.map(row => ({...row, referencias:Number(row.referencias || 0), piezas:Number(row.piezas || 0), valorTotal:Number(row.filasConValor || 0) > 0 ? Number(row.valorTotal || 0) : null})),
    warehouses:warehouses.map(row => ({...row, referencias:Number(row.referencias || 0), piezas:Number(row.piezas || 0), valorTotal:row.valorTotal == null ? null : Number(row.valorTotal)})),
    topByVolume:topByVolume.map(row => ({...row,total:Number(row.total || 0)})),
    topByValue:topByValue.map(row => ({...row,total:row.total == null ? null : Number(row.total)}))
  };
}

function buildInventoryWhere(query, source) {
  const base = filterFor(source, RECORD_TYPES.INVENTORY);
  const where = [base.sql];
  const params = [...base.params];
  const q = String(query.q || '').trim();
  if (q) { const like=`%${q}%`; where.push('(codigo LIKE ? OR articulo LIKE ?)'); params.push(like,like); }
  const company = String(query.company || '').trim();
  if (company && company !== 'todas') { where.push('empresa=?'); params.push(company); }
  const category = String(query.category || '').trim();
  if (category && category !== 'todas') { where.push('categoria=?'); params.push(category); }
  const warehouse = String(query.warehouse || '').trim();
  if (warehouse && warehouse !== 'todos') { where.push('almacen=?'); params.push(warehouse); }
  const minValue = parseNumber(query.minValue);
  if (minValue != null) { where.push(`${valueExpression()}>=?`); params.push(minValue); }
  const maxValue = parseNumber(query.maxValue);
  if (maxValue != null) { where.push(`${valueExpression()}<=?`); params.push(maxValue); }
  if (String(query.stockOnly || '').toLowerCase() === 'true' || String(query.stockOnly) === '1') where.push('COALESCE(fisico,0)>0');
  return {sql:where.join(' AND '), params};
}

async function getInventory(query = {}) {
  const source = await sourceEngine.resolveSource(query);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 30)));
  const page = Math.max(1, Number(query.page || 1));
  if (!source) return {ok:true,source:null,rows:[],pagination:{page,pageSize,total:0,pages:1},summary:{registros:0,piezas:0,valorTotal:null}};

  const offset = (page - 1) * pageSize;
  const where = buildInventoryWhere(query, source);
  const valueExpr = valueExpression();
  const [[rows],[countRows],[summaryRows]] = await Promise.all([
    db.query(`SELECT id,codigo,articulo,categoria,empresa,almacen,tipo_almacen AS tipoAlmacen,fisico,precio_unitario AS precioUnitario,${valueExpr} AS valor FROM ${TABLE} WHERE ${where.sql} ORDER BY COALESCE(NULLIF(TRIM(articulo),''),codigo,CONCAT('Fila ',fila_origen)) LIMIT ? OFFSET ?`, [...where.params,pageSize,offset]),
    db.query(`SELECT COUNT(*) AS total FROM ${TABLE} WHERE ${where.sql}`, where.params),
    db.query(`SELECT COUNT(*) AS registros,COALESCE(SUM(COALESCE(fisico,0)),0) AS piezas,SUM(CASE WHEN ${valueExpr} IS NOT NULL THEN 1 ELSE 0 END) AS filasConValor,SUM(${valueExpr}) AS valorTotal FROM ${TABLE} WHERE ${where.sql}`, where.params)
  ]);
  const total = Number(countRows[0]?.total || 0);
  const summary = summaryRows[0] || {};
  return {
    ok:true, source,
    rows:rows.map(row => ({...row,fisico:row.fisico==null?null:Number(row.fisico),precioUnitario:row.precioUnitario==null?null:Number(row.precioUnitario),valor:row.valor==null?null:Number(row.valor)})),
    pagination:{page,pageSize,total,pages:Math.max(1,Math.ceil(total/pageSize))},
    summary:{registros:Number(summary.registros||0),piezas:Number(summary.piezas||0),valorTotal:Number(summary.filasConValor||0)>0?Number(summary.valorTotal||0):null}
  };
}

async function getCatalogs(query = {}) {
  const source = await sourceEngine.resolveSource(query);
  if (!source) return {ok:true,source:null,companies:[],categories:[],warehouses:[]};
  const base = filterFor(source, RECORD_TYPES.INVENTORY);
  const [[companies],[categories],[warehouses]] = await Promise.all([
    db.query(`SELECT DISTINCT empresa AS value FROM ${TABLE} WHERE ${base.sql} AND NULLIF(TRIM(empresa),'') IS NOT NULL ORDER BY empresa`, base.params),
    db.query(`SELECT DISTINCT categoria AS value FROM ${TABLE} WHERE ${base.sql} AND NULLIF(TRIM(categoria),'') IS NOT NULL ORDER BY categoria`, base.params),
    db.query(`SELECT DISTINCT almacen AS value FROM ${TABLE} WHERE ${base.sql} AND NULLIF(TRIM(almacen),'') IS NOT NULL ORDER BY almacen`, base.params)
  ]);
  return {ok:true,source,companies:companies.map(x=>x.value),categories:categories.map(x=>x.value),warehouses:warehouses.map(x=>x.value)};
}

async function getCompany(query = {}) {
  const company = String(query.company || '').trim();
  if (!company) throw Object.assign(new Error('Empresa requerida.'), {status:400});
  const source = await sourceEngine.resolveSource(query);
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = 30;
  if (!source) return {ok:true,source:null,company,rows:[],summary:{piezas:0,valorTotal:null,precioPromedio:null},pagination:{page,pageSize,total:0,pages:1}};

  const offset = (page - 1) * pageSize;
  const base = filterFor(source, RECORD_TYPES.INVENTORY);
  const q = String(query.q || '').trim();
  const params = [...base.params, company];
  let extra = '';
  if (q) { extra=' AND (codigo LIKE ? OR articulo LIKE ?)'; params.push(`%${q}%`,`%${q}%`); }
  const valueExpr = valueExpression();
  const [[rows],[countRows],[summaryRows]] = await Promise.all([
    db.query(`SELECT MAX(codigo) AS codigo,MAX(articulo) AS articulo,MAX(categoria) AS categoria,empresa,COALESCE(SUM(COALESCE(fisico,0)),0) AS fisico,CASE WHEN SUM(CASE WHEN precio_unitario IS NOT NULL THEN 1 ELSE 0 END)>0 THEN AVG(precio_unitario) ELSE NULL END AS precioUnitario,SUM(${valueExpr}) AS valor,COUNT(DISTINCT almacen) AS almacenes FROM ${TABLE} WHERE ${base.sql} AND empresa=? ${extra} GROUP BY empresa,COALESCE(NULLIF(TRIM(codigo),''),NULLIF(TRIM(articulo),''),CONCAT('Fila ',fila_origen)) ORDER BY valor DESC,articulo LIMIT ? OFFSET ?`, [...params,pageSize,offset]),
    db.query(`SELECT COUNT(*) AS total FROM (SELECT 1 FROM ${TABLE} WHERE ${base.sql} AND empresa=? ${extra} GROUP BY COALESCE(NULLIF(TRIM(codigo),''),NULLIF(TRIM(articulo),''),CONCAT('Fila ',fila_origen))) x`, params),
    db.query(`SELECT COALESCE(SUM(COALESCE(fisico,0)),0) AS piezas,SUM(${valueExpr}) AS valorTotal,SUM(CASE WHEN ${valueExpr} IS NOT NULL THEN 1 ELSE 0 END) AS filasConValor,AVG(precio_unitario) AS precioPromedio FROM ${TABLE} WHERE ${base.sql} AND empresa=?`, [...base.params,company])
  ]);
  const total = Number(countRows[0]?.total || 0);
  const summary = summaryRows[0] || {};
  return {
    ok:true, source, company,
    rows:rows.map(row=>({...row,fisico:Number(row.fisico||0),precioUnitario:row.precioUnitario==null?null:Number(row.precioUnitario),valor:row.valor==null?null:Number(row.valor),almacenes:Number(row.almacenes||0)})),
    summary:{piezas:Number(summary.piezas||0),valorTotal:Number(summary.filasConValor||0)>0?Number(summary.valorTotal||0):null,precioPromedio:summary.precioPromedio==null?null:Number(summary.precioPromedio)},
    pagination:{page,pageSize,total,pages:Math.max(1,Math.ceil(total/pageSize))}
  };
}

async function getWarehouses(query = {}) {
  const source = await sourceEngine.resolveSource(query);
  if (!source) return {ok:true,source:null,rows:[]};
  const base = filterFor(source, RECORD_TYPES.INVENTORY);
  const params = [...base.params];
  const where = [base.sql];
  const company=String(query.company||'').trim();
  if(company&&company!=='todas'){where.push('empresa=?');params.push(company);}
  const q=String(query.q||'').trim();
  if(q){where.push('almacen LIKE ?');params.push(`%${q}%`);}
  const valueExpr=valueExpression();
  const [rows]=await db.query(`SELECT COALESCE(NULLIF(TRIM(almacen),''),'Sin almacén') AS almacen,COALESCE(NULLIF(TRIM(tipo_almacen),''),'—') AS tipo,COALESCE(NULLIF(TRIM(empresa),''),'Sin empresa') AS empresa,COUNT(*) AS referencias,COALESCE(SUM(COALESCE(fisico,0)),0) AS piezas,SUM(${valueExpr}) AS valorTotal FROM ${TABLE} WHERE ${where.join(' AND ')} GROUP BY almacen,tipo,empresa ORDER BY valorTotal DESC,almacen`,params);
  return {ok:true,source,rows:rows.map(row=>({...row,referencias:Number(row.referencias||0),piezas:Number(row.piezas||0),valorTotal:row.valorTotal==null?null:Number(row.valorTotal)}))};
}

async function getTop(query = {}) {
  const source = await sourceEngine.resolveSource(query);
  const mode=String(query.mode||'valor')==='fisico'?'fisico':'valor';
  if (!source) return {ok:true,source:null,mode,rows:[]};
  const limit=Math.min(50,Math.max(1,Number(query.limit||20)));
  const base = filterFor(source, RECORD_TYPES.INVENTORY);
  const params=[...base.params];
  const where=[base.sql];
  const company=String(query.company||'').trim();
  if(company&&company!=='todas'){where.push('empresa=?');params.push(company);}
  const metric=mode==='fisico'?'COALESCE(SUM(COALESCE(fisico,0)),0)':`SUM(${valueExpression()})`;
  if(mode==='valor')where.push(`${valueExpression()} IS NOT NULL`);
  const [rows]=await db.query(`SELECT MAX(codigo) AS codigo,MAX(articulo) AS articulo,MAX(categoria) AS categoria,MAX(empresa) AS empresa,${metric} AS total FROM ${TABLE} WHERE ${where.join(' AND ')} GROUP BY COALESCE(NULLIF(TRIM(codigo),''),NULLIF(TRIM(articulo),''),CONCAT('Fila ',fila_origen)) ORDER BY total DESC LIMIT ?`,[...params,limit]);
  return {ok:true,source,mode,rows:rows.map(row=>({...row,total:row.total==null?null:Number(row.total)}))};
}

function stockAlertSql() {
  return `CASE
    WHEN stock_seguridad IS NOT NULL AND fisico IS NOT NULL AND fisico < stock_seguridad THEN 'critico'
    WHEN punto_reorden IS NOT NULL AND fisico IS NOT NULL AND fisico <= punto_reorden THEN 'reorden'
    WHEN maximo IS NOT NULL AND fisico IS NOT NULL AND fisico > maximo THEN 'exceso'
    ELSE 'ok' END`;
}

async function getStock(query = {}) {
  const source=await sourceEngine.resolveSource(query);
  if(!source)return {ok:true,source:null,coverage:{},kpis:null,classSummary:[],rows:[],pagination:{page:1,pageSize:30,total:0,pages:1}};
  const page=Math.max(1,Number(query.page||1));
  const pageSize=30;
  const offset=(page-1)*pageSize;
  const base=filterFor(source, RECORD_TYPES.INVENTORY);
  const params=[...base.params];
  const where=[base.sql];
  const q=String(query.q||'').trim(); if(q){where.push('(codigo LIKE ? OR articulo LIKE ?)');params.push(`%${q}%`,`%${q}%`);}
  const company=String(query.company||'').trim(); if(company&&company!=='todas'){where.push('empresa=?');params.push(company);}
  const abc=String(query.abc||'').trim(); if(abc&&abc!=='todas'){where.push('UPPER(TRIM(abc))=?');params.push(abc.toUpperCase());}
  const alert=String(query.alert||'').trim(); if(alert&&alert!=='todas'){where.push(`(${stockAlertSql()})=?`);params.push(alert);}
  const alertSql=stockAlertSql();
  const [[rows],[countRows],[kpiRows],[classRows],[companyRows]]=await Promise.all([
    db.query(`SELECT id,codigo,articulo,empresa,UPPER(NULLIF(TRIM(abc),'')) AS abc,criticidad,demanda,fisico,stock_seguridad AS stockSeguridad,punto_reorden AS puntoReorden,minimo,maximo,${alertSql} AS alerta FROM ${TABLE} WHERE ${where.join(' AND ')} ORDER BY COALESCE(NULLIF(TRIM(articulo),''),codigo) LIMIT ? OFFSET ?`,[...params,pageSize,offset]),
    db.query(`SELECT COUNT(*) AS total FROM ${TABLE} WHERE ${where.join(' AND ')}`,params),
    db.query(`SELECT COUNT(*) AS articulos,SUM(CASE WHEN ${alertSql}='critico' THEN 1 ELSE 0 END) AS criticos,SUM(CASE WHEN ${alertSql}='reorden' THEN 1 ELSE 0 END) AS reorden,SUM(CASE WHEN ${alertSql}='exceso' THEN 1 ELSE 0 END) AS exceso FROM ${TABLE} WHERE ${base.sql}`,base.params),
    db.query(`SELECT UPPER(NULLIF(TRIM(abc),'')) AS abc,COUNT(*) AS total FROM ${TABLE} WHERE ${base.sql} AND NULLIF(TRIM(abc),'') IS NOT NULL GROUP BY UPPER(TRIM(abc)) ORDER BY abc`,base.params),
    db.query(`SELECT DISTINCT empresa AS value FROM ${TABLE} WHERE ${base.sql} AND NULLIF(TRIM(empresa),'') IS NOT NULL ORDER BY empresa`,base.params)
  ]);
  const mapping=source.datasets?.[RECORD_TYPES.INVENTORY]?.mapeo||{};
  const k=kpiRows[0]||{};
  const total=Number(countRows[0]?.total||0);
  return {ok:true,source,companies:companyRows.map(row=>row.value),coverage:{abc:Boolean(mapping.abc),criticidad:Boolean(mapping.criticidad),demanda:Boolean(mapping.demanda),stockSeguridad:Boolean(mapping.stock_seguridad),puntoReorden:Boolean(mapping.punto_reorden),minimo:Boolean(mapping.minimo),maximo:Boolean(mapping.maximo)},kpis:{articulos:Number(k.articulos||0),criticos:Number(k.criticos||0),reorden:Number(k.reorden||0),exceso:Number(k.exceso||0)},classSummary:classRows.map(row=>({abc:row.abc,total:Number(row.total||0)})),rows:rows.map(row=>({...row,demanda:row.demanda==null?null:Number(row.demanda),fisico:row.fisico==null?null:Number(row.fisico),stockSeguridad:row.stockSeguridad==null?null:Number(row.stockSeguridad),puntoReorden:row.puntoReorden==null?null:Number(row.puntoReorden),minimo:row.minimo==null?null:Number(row.minimo),maximo:row.maximo==null?null:Number(row.maximo)})),pagination:{page,pageSize,total,pages:Math.max(1,Math.ceil(total/pageSize))}};
}

function loanAgeBucketSql() {
  return `CASE WHEN fecha_evento IS NULL THEN 'SIN FECHA' WHEN DATEDIFF(CURDATE(),fecha_evento)<=180 THEN '1-6 MESES' WHEN DATEDIFF(CURDATE(),fecha_evento)<=450 THEN '6-15 MESES' ELSE 'MAYOR A 15 MESES' END`;
}

async function getLoanCatalogs(query = {}) {
  const source=await sourceEngine.resolveSource(query);
  if(!source)return {ok:true,source:null,available:false,companies:[],responsibles:[]};
  const base=filterFor(source, RECORD_TYPES.LOAN);
  const [[companies],[responsibles]]=await Promise.all([
    db.query(`SELECT DISTINCT empresa AS value FROM ${TABLE} WHERE ${base.sql} AND NULLIF(TRIM(empresa),'') IS NOT NULL ORDER BY empresa`,base.params),
    db.query(`SELECT DISTINCT responsable AS value FROM ${TABLE} WHERE ${base.sql} AND NULLIF(TRIM(responsable),'') IS NOT NULL ORDER BY responsable`,base.params)
  ]);
  return {ok:true,source,available:Boolean(source?.datasets?.[RECORD_TYPES.LOAN]?.filas),companies:companies.map(x=>x.value),responsibles:responsibles.map(x=>x.value)};
}

async function getLoanSummary(query = {}) {
  const source=await sourceEngine.resolveSource(query);
  if(!source)return {ok:true,source:null,kpis:{articulos:0,piezas:0,valorTotal:null,responsables:0},ages:[],rows:[]};
  const base=filterFor(source, RECORD_TYPES.LOAN);
  const params=[...base.params];
  const where=[base.sql];
  const company=String(query.company||'').trim(); if(company&&company!=='todas'){where.push('empresa=?');params.push(company);}
  const ageSql=loanAgeBucketSql();
  const [[kpiRows],[ageRows],[responsibleRows]]=await Promise.all([
    db.query(`SELECT COUNT(*) AS articulos,COALESCE(SUM(COALESCE(cantidad,0)),0) AS piezas,SUM(valor) AS valorTotal,COUNT(DISTINCT NULLIF(TRIM(responsable),'')) AS responsables FROM ${TABLE} WHERE ${where.join(' AND ')}`,params),
    db.query(`SELECT ${ageSql} AS antiguedad,COUNT(*) AS articulos,COALESCE(SUM(COALESCE(cantidad,0)),0) AS piezas,SUM(valor) AS valorTotal FROM ${TABLE} WHERE ${where.join(' AND ')} GROUP BY antiguedad ORDER BY MIN(fecha_evento) DESC`,params),
    db.query(`SELECT responsable,COUNT(*) AS articulos,COALESCE(SUM(COALESCE(cantidad,0)),0) AS cantidad,SUM(valor) AS valorTotal,MAX(DATEDIFF(CURDATE(),fecha_evento)) AS diasPrestamo,MIN(fecha_evento) AS desde,COUNT(DISTINCT NULLIF(TRIM(sitio),'')) AS sitios FROM ${TABLE} WHERE ${where.join(' AND ')} GROUP BY responsable ORDER BY valorTotal DESC,cantidad DESC,responsable`,params)
  ]);
  const k=kpiRows[0]||{};
  const totalValue=k.valorTotal==null?null:Number(k.valorTotal);
  return {ok:true,source,kpis:{articulos:Number(k.articulos||0),piezas:Number(k.piezas||0),valorTotal:totalValue,responsables:Number(k.responsables||0)},ages:ageRows.map(row=>({...row,articulos:Number(row.articulos||0),piezas:Number(row.piezas||0),valorTotal:row.valorTotal==null?null:Number(row.valorTotal)})),rows:responsibleRows.map(row=>({...row,articulos:Number(row.articulos||0),cantidad:Number(row.cantidad||0),valorTotal:row.valorTotal==null?null:Number(row.valorTotal),porcentaje:totalValue&&row.valorTotal!=null?Number(row.valorTotal)*100/totalValue:null,diasPrestamo:row.diasPrestamo==null?null:Number(row.diasPrestamo),sitios:Number(row.sitios||0)}))};
}

async function getLoans(query = {}) {
  const source=await sourceEngine.resolveSource(query);
  const page=Math.max(1,Number(query.page||1));
  const pageSize=30;
  if(!source)return {ok:true,source:null,rows:[],summary:{articulos:0,cantidad:0,valorTotal:null},pagination:{page,pageSize,total:0,pages:1}};
  const offset=(page-1)*pageSize;
  const base=filterFor(source, RECORD_TYPES.LOAN);
  const params=[...base.params];
  const where=[base.sql];
  const company=String(query.company||'').trim(); if(company&&company!=='todas'){where.push('empresa=?');params.push(company);}
  const responsible=String(query.responsible||'').trim(); if(responsible&&responsible!=='todos'){where.push('responsable=?');params.push(responsible);}
  const age=String(query.age||'').trim(); if(age&&age!=='todas'){where.push(`(${loanAgeBucketSql()})=?`);params.push(age);}
  const q=String(query.q||'').trim(); if(q){const like=`%${q}%`;where.push('(articulo LIKE ? OR sitio LIKE ? OR ag LIKE ? OR codigo LIKE ?)');params.push(like,like,like,like);}
  const ageSql=loanAgeBucketSql();
  const [[rows],[countRows],[summaryRows]]=await Promise.all([
    db.query(`SELECT id,fecha_evento AS fecha,codigo,articulo,empresa,ag,responsable,sitio,cantidad,costo_unitario AS costo,valor,DATEDIFF(CURDATE(),fecha_evento) AS dias,${ageSql} AS antiguedad FROM ${TABLE} WHERE ${where.join(' AND ')} ORDER BY fecha_evento ASC,responsable,articulo LIMIT ? OFFSET ?`,[...params,pageSize,offset]),
    db.query(`SELECT COUNT(*) AS total FROM ${TABLE} WHERE ${where.join(' AND ')}`,params),
    db.query(`SELECT COUNT(*) AS articulos,COALESCE(SUM(COALESCE(cantidad,0)),0) AS cantidad,SUM(valor) AS valorTotal FROM ${TABLE} WHERE ${where.join(' AND ')}`,params)
  ]);
  const total=Number(countRows[0]?.total||0);
  const s=summaryRows[0]||{};
  return {ok:true,source,rows:rows.map(row=>({...row,cantidad:row.cantidad==null?null:Number(row.cantidad),costo:row.costo==null?null:Number(row.costo),valor:row.valor==null?null:Number(row.valor),dias:row.dias==null?null:Number(row.dias)})),summary:{articulos:Number(s.articulos||0),cantidad:Number(s.cantidad||0),valorTotal:s.valorTotal==null?null:Number(s.valorTotal)},pagination:{page,pageSize,total,pages:Math.max(1,Math.ceil(total/pageSize))}};
}

async function getGuardCatalogs(query = {}) {
  const source=await sourceEngine.resolveSource(query);
  if(!source)return {ok:true,source:null,available:false,companies:[],departments:[]};
  const base=filterFor(source, RECORD_TYPES.GUARD);
  const [[companies],[departments]]=await Promise.all([
    db.query(`SELECT DISTINCT empresa AS value FROM ${TABLE} WHERE ${base.sql} AND NULLIF(TRIM(empresa),'') IS NOT NULL ORDER BY empresa`,base.params),
    db.query(`SELECT DISTINCT departamento AS value FROM ${TABLE} WHERE ${base.sql} AND NULLIF(TRIM(departamento),'') IS NOT NULL ORDER BY departamento`,base.params)
  ]);
  return {ok:true,source,available:Boolean(source?.datasets?.[RECORD_TYPES.GUARD]?.filas),companies:companies.map(x=>x.value),departments:departments.map(x=>x.value)};
}

async function getGuards(query = {}) {
  const source=await sourceEngine.resolveSource(query);
  const page=Math.max(1,Number(query.page||1));
  const pageSize=30;
  if(!source)return {ok:true,source:null,kpis:{total:0,conSalida:0,sinSalida:0,filtrados:0},rows:[],pagination:{page,pageSize,total:0,pages:1}};
  const offset=(page-1)*pageSize;
  const base=filterFor(source, RECORD_TYPES.GUARD);
  const params=[...base.params];
  const where=[base.sql];
  const q=String(query.q||'').trim(); if(q){const like=`%${q}%`;where.push('(articulo LIKE ? OR proyecto LIKE ? OR ag LIKE ? OR folio LIKE ?)');params.push(like,like,like,like);}
  const company=String(query.company||'').trim(); if(company&&company!=='todas'){where.push('empresa=?');params.push(company);}
  const department=String(query.department||'').trim(); if(department&&department!=='todos'){where.push('departamento=?');params.push(department);}
  const exitStatus=String(query.exitStatus||'').trim(); if(exitStatus==='con')where.push("NULLIF(TRIM(salida),'') IS NOT NULL"); else if(exitStatus==='sin')where.push("NULLIF(TRIM(salida),'') IS NULL");
  const [[rows],[countRows],[kpiRows]]=await Promise.all([
    db.query(`SELECT id,fecha_evento AS fecha,folio,empresa AS subsidiaria,departamento,ag,cantidad,unidad,articulo AS descripcion,proyecto,equipo,entregado_por AS entregadoPor,salida,responsable AS aCargoDe,ubicacion,con_stock AS conStock FROM ${TABLE} WHERE ${where.join(' AND ')} ORDER BY COALESCE(fecha_evento,'1900-01-01') DESC,folio DESC LIMIT ? OFFSET ?`,[...params,pageSize,offset]),
    db.query(`SELECT COUNT(*) AS total FROM ${TABLE} WHERE ${where.join(' AND ')}`,params),
    db.query(`SELECT COUNT(*) AS total,SUM(CASE WHEN NULLIF(TRIM(salida),'') IS NOT NULL THEN 1 ELSE 0 END) AS conSalida,SUM(CASE WHEN NULLIF(TRIM(salida),'') IS NULL THEN 1 ELSE 0 END) AS sinSalida FROM ${TABLE} WHERE ${base.sql}`,base.params)
  ]);
  const total=Number(countRows[0]?.total||0);
  const k=kpiRows[0]||{};
  return {ok:true,source,kpis:{total:Number(k.total||0),conSalida:Number(k.conSalida||0),sinSalida:Number(k.sinSalida||0),filtrados:total},rows:rows.map(row=>({...row,cantidad:row.cantidad==null?null:Number(row.cantidad)})),pagination:{page,pageSize,total,pages:Math.max(1,Math.ceil(total/pageSize))}};
}

function shuffleCopy(list) {
  const copy=list.slice();
  for(let index=copy.length-1; index>0; index-=1){
    const swap=Math.floor(Math.random()*(index+1));
    [copy[index],copy[swap]]=[copy[swap],copy[index]];
  }
  return copy;
}

async function getAuditCatalogs(query = {}) {
  const source=await sourceEngine.resolveSource(query);
  if(!source)return {ok:true,source:null,available:false,warehouses:[]};
  const base=filterFor(source, RECORD_TYPES.INVENTORY);
  const valueExpr=valueExpression();
  const [rows]=await db.query(
    `SELECT empresa,
            almacen,
            COALESCE(NULLIF(TRIM(MAX(tipo_almacen)),''),'—') AS tipo,
            COUNT(*) AS referencias,
            COALESCE(SUM(COALESCE(fisico,0)),0) AS piezas,
            SUM(${valueExpr}) AS valorEsperado
       FROM ${TABLE}
      WHERE ${base.sql}
        AND NULLIF(TRIM(empresa),'') IS NOT NULL
        AND NULLIF(TRIM(almacen),'') IS NOT NULL
        AND COALESCE(fisico,0) > 0
      GROUP BY empresa, almacen
      ORDER BY empresa, almacen`,
    base.params
  );
  return {ok:true,source,available:rows.length>0,warehouses:rows.map(row=>({company:row.empresa,warehouse:row.almacen,type:row.tipo,references:Number(row.referencias||0),pieces:Number(row.piezas||0),expectedValue:row.valorEsperado==null?null:Number(row.valorEsperado)}))};
}

async function getAuditSample(query = {}) {
  const source=await sourceEngine.resolveSource(query);
  if(!source)return {ok:true,source:null,available:false,sample:null};
  const company=String(query.company||'').trim();
  const warehouse=String(query.warehouse||'').trim();
  if(!company||!warehouse)throw Object.assign(new Error('Empresa y almacén son requeridos para generar la muestra.'),{status:400});

  const base=filterFor(source, RECORD_TYPES.INVENTORY);
  const valueExpr=valueExpression();
  const [rows]=await db.query(
    `SELECT MAX(id) AS sourceId,
            MAX(codigo) AS codigo,
            MAX(articulo) AS articulo,
            MAX(categoria) AS categoria,
            MAX(tipo_almacen) AS tipoAlmacen,
            empresa,
            almacen,
            COALESCE(SUM(COALESCE(fisico,0)),0) AS esperado,
            SUM(${valueExpr}) AS valorEsperado
       FROM ${TABLE}
      WHERE ${base.sql}
        AND empresa=?
        AND almacen=?
        AND COALESCE(fisico,0) > 0
      GROUP BY empresa, almacen,
               COALESCE(NULLIF(TRIM(codigo),''),NULLIF(TRIM(articulo),''),CONCAT('Fila ',fila_origen))
      ORDER BY MAX(articulo), MAX(codigo)`,
    [...base.params,company,warehouse]
  );

  if(!rows.length)throw Object.assign(new Error('El almacén seleccionado no tiene artículos con existencia positiva en el cierre seleccionado.'),{status:404});

  const normalized=rows.map(row=>{
    const expected=Number(row.esperado||0);
    const expectedValue=row.valorEsperado==null?null:Number(row.valorEsperado);
    const impliedUnitValue=expected>0&&expectedValue!=null?expectedValue/expected:null;
    return {sourceId:Number(row.sourceId),code:row.codigo||'',article:row.articulo||row.codigo||'Sin descripción',category:row.categoria||'',company:row.empresa,warehouse:row.almacen,warehouseType:row.tipoAlmacen||'',expected,expectedValue,unitValue:impliedUnitValue};
  });

  const totalReferences=normalized.length;
  const requested=Math.max(1,Math.round(totalReferences*0.05));
  const sampleSize=Math.min(totalReferences,Math.max(Math.min(3,totalReferences),requested));
  const valueCount=Math.min(sampleSize,Math.round(sampleSize*0.70));
  const randomCount=sampleSize-valueCount;
  const ranked=normalized.slice().sort((a,b)=>Number(b.expectedValue||0)-Number(a.expectedValue||0));
  const poolSize=Math.min(ranked.length,Math.max(valueCount*2,Math.min(10,ranked.length)));
  const valuePool=shuffleCopy(ranked.slice(0,poolSize));
  const byValue=valuePool.slice(0,valueCount);
  const selectedIds=new Set(byValue.map(item=>item.sourceId));
  const remaining=shuffleCopy(normalized.filter(item=>!selectedIds.has(item.sourceId)));
  const randomItems=remaining.slice(0,randomCount);
  const items=shuffleCopy(byValue.concat(randomItems));

  return {ok:true,source,available:true,sample:{sessionId:crypto.randomUUID(),generatedAt:new Date().toISOString(),loteImportacion:source.loteImportacion,fechaCorte:source.fechaCorte,company,warehouse,warehouseType:items[0]?.warehouseType||'',totalReferences,sampleSize:items.length,methodology:{percentage:5,byValuePercent:70,randomPercent:30,minimum:Math.min(3,totalReferences)},items}};
}

module.exports = {
  listSources,
  getDashboard,
  getInventory,
  getCatalogs,
  getCompany,
  getWarehouses,
  getTop,
  getStock,
  getLoanCatalogs,
  getLoanSummary,
  getLoans,
  getGuardCatalogs,
  getGuards,
  getAuditCatalogs,
  getAuditSample
};
