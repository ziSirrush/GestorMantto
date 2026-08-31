'use strict';

// [Aster | 2026-08-31 | ASTER-MG | FASE 1 ALMACEN EXCEL ESTRUCTURA OFICIAL V001]
// Parser especializado para el libro operativo de inventarios de Almacen.
// No sustituye el parser generico: solo se activa cuando detecta las hojas
// caracteristicas del formato operativo. Los libros genericos siguen usando
// el validador existente de almacen.service.js.

const PROFILE = 'ALMACEN_INVENTARIOS_OPERATIVO_V1';
const TYPES = Object.freeze({ INVENTORY:'INVENTARIO', LOAN:'PRESTAMO', GUARD:'RESGUARDO' });

const INVENTORY_DETAILS = Object.freeze([
  { sheet:'CORELLIAN DET', company:'Corellian' },
  { sheet:'NUBIAN DET', company:'Nubian' },
  { sheet:'UNITED DET', company:'United' }
]);

const SUMMARY_SHEETS = Object.freeze([
  { sheet:'CORE', company:'Corellian' },
  { sheet:'NUBIAN', company:'Nubian' },
  { sheet:'UNITED', company:'United' }
]);

const LOAN_SHEETS = Object.freeze([
  { sheet:'Desglose Prestamo Corellian', company:'Corellian' },
  { sheet:'Desglose Prestamo United', company:'United' }
]);

const MOVEMENT_SHEETS = Object.freeze([
  { sheet:'CORELLIAN MOVIMEINTOS', company:'Corellian' },
  { sheet:'NUBIAN MOVIMEINTOS', company:'Nubian' },
  { sheet:'UNITED MOVIMEINTOS', company:'United' }
]);

const LEGACY_IGNORED_SHEETS = Object.freeze(['PRESTAMO UNI','PRESTAMO CORE']);

function text(value){ return value == null ? '' : String(value).trim(); }
function normalize(value){
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
}
function numberValue(value){
  if(value == null || value === '') return null;
  if(typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s=String(value).trim();
  if(!s) return null;
  let negative=false;
  if(/^\(.*\)$/.test(s)){negative=true;s=s.slice(1,-1);}
  s=s.replace(/[$€£¥\s]/g,'').replace(/[^0-9,.-]/g,'');
  if(!s) return null;
  const comma=s.lastIndexOf(','), dot=s.lastIndexOf('.');
  if(comma>=0 && dot>=0){
    if(comma>dot) s=s.replace(/\./g,'').replace(',','.');
    else s=s.replace(/,/g,'');
  }else if(comma>=0){
    const decimals=s.length-comma-1;
    s=decimals>0&&decimals<=4?s.replace(',','.'):s.replace(/,/g,'');
  }
  const n=Number(s);
  return Number.isFinite(n)?(negative?-n:n):null;
}
function normalizeDate(value){
  if(value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0,10);
  const raw=Number(value);
  if(Number.isFinite(raw)&&raw>20000&&raw<100000){
    const d=new Date(Date.UTC(1899,11,30)+Math.floor(raw)*86400000);
    return d.toISOString().slice(0,10);
  }
  const s=text(value);
  if(!s) return null;
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return `${m[1]}-${m[2]}-${m[3]}`;
  m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if(m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  return null;
}
function rowObject(headers,row){
  const o={};
  (headers||[]).forEach((h,i)=>{if(text(h))o[text(h)]=row&&row[i]!=null?row[i]:'';});
  return o;
}
function byName(sheets){
  const map=new Map();
  (sheets||[]).forEach(sheet=>map.set(normalize(sheet&&sheet.sheetName),sheet));
  return map;
}
function getSheet(map,name){ return map.get(normalize(name))||null; }
function hasAnyProfileMarker(map){
  const markers=[...INVENTORY_DETAILS.map(x=>x.sheet),...SUMMARY_SHEETS.map(x=>x.sheet),'ARTICULOS','RESGUARDOS',...LOAN_SHEETS.map(x=>x.sheet),...MOVEMENT_SHEETS.map(x=>x.sheet)];
  return markers.some(name=>map.has(normalize(name)));
}
function error422(message,details){
  const e=new Error(message);e.status=422;e.details=details||{};return e;
}
function assertRowLimit(count,maxRows,label){
  if(count>maxRows){const e=new Error(`${label} supera el maximo temporal de ${maxRows} filas normalizadas.`);e.status=413;throw e;}
}
function warehouseType(name){
  const n=normalize(name);
  if(n.includes('PRESTA')) return 'Prestamo';
  if(n.includes('RECUPERA')) return 'Recuperacion';
  if(n.includes('OBSOLETO')) return 'Obsoletos';
  if(n.includes('INSPECCI')) return 'Inspeccion';
  if(n.includes('FUERA')) return 'Fuera';
  if(n.includes('VIRTUAL')) return 'Virtual';
  if(n.includes('HERRAMIEN')) return 'Herramienta';
  return 'General';
}
function findInventoryHeader(rows){
  const limit=Math.min((rows||[]).length,25);
  for(let i=0;i<limit;i+=1){
    const r=Array.isArray(rows[i])?rows[i]:[];
    const first=normalize(r[0]);
    if((first==='ARTICULO DE INVENTARIO'||first==='ARTICULO')&&r.slice(3).some(v=>text(v))) return i;
  }
  return -1;
}
function catalogFromArticles(sheet){
  const map=new Map();
  if(!sheet||!Array.isArray(sheet.rows)) return map;
  // Estructura verificada del prototipo: Articulo en C, Parte en D, Categoria en E.
  for(let i=1;i<sheet.rows.length;i+=1){
    const r=sheet.rows[i]||[];
    const article=text(r[2]);
    if(!article) continue;
    map.set(normalize(article),{part:text(r[3])||null,category:text(r[4])||null,row:i+1});
  }
  return map;
}
function blankOperationalRow(type){
  return {
    tipoRegistro:type,filaOrigen:null,codigo:null,articulo:null,categoria:null,empresa:null,almacen:null,tipoAlmacen:null,
    fisico:null,precioUnitario:null,valor:null,abc:null,criticidad:null,demanda:null,stockSeguridad:null,puntoReorden:null,
    minimo:null,maximo:null,fechaEvento:null,ag:null,responsable:null,sitio:null,cantidad:null,costoUnitario:null,folio:null,
    departamento:null,unidad:null,proyecto:null,equipo:null,entregadoPor:null,salida:null,ubicacion:null,conStock:null,raw:null
  };
}
function parseInventoryDetail(sheet,company,catalog,maxRows){
  const rows=Array.isArray(sheet&&sheet.rows)?sheet.rows:[];
  const headerIndex=findInventoryHeader(rows);
  if(headerIndex<0) throw error422(`La hoja ${sheet.sheetName} no contiene el encabezado esperado de inventario.`,{profile:PROFILE,sheetName:sheet.sheetName,expected:'Articulo de inventario en columna A y almacenes desde columna D'});
  const headers=(rows[headerIndex]||[]).map(v=>text(v));
  const warehouses=[];
  for(let c=3;c<headers.length;c+=1){
    const name=text(headers[c]);
    if(!name||normalize(name)==='TOTAL') continue;
    warehouses.push({index:c,name,type:warehouseType(name)});
  }
  if(!warehouses.length) throw error422(`La hoja ${sheet.sheetName} no contiene columnas de almacenes desde la columna D.`,{profile:PROFILE,sheetName:sheet.sheetName,headerRow:headerIndex+1,headers});

  const normalized=[];
  let sourceArticles=0, skippedEmpty=0, invalidNumbers=0;
  for(let r=headerIndex+1;r<rows.length;r+=1){
    const row=rows[r]||[];
    const article=text(row[0]);
    if(!article){skippedEmpty+=1;continue;}
    const nArticle=normalize(article);
    if(nArticle==='ARTICULO DE INVENTARIO'||nArticle==='ARTICULO'||nArticle.startsWith('TOTAL')) continue;
    sourceArticles+=1;
    const code=text(row[1])||null;
    const unit=numberValue(row[2]);
    const cat=catalog.get(nArticle)||null;
    for(const wh of warehouses){
      const rawQty=row[wh.index];
      if(rawQty==null||text(rawQty)==='') continue;
      const qty=numberValue(rawQty);
      if(qty==null){invalidNumbers+=1;continue;}
      // Mantiene la semantica comprobada del prototipo: no materializar celdas 0
      // de una matriz ancha, evitando miles de renglones artificiales.
      if(qty===0) continue;
      if(wh.index>=1000) throw error422(`La hoja ${sheet.sheetName} excede 999 columnas de almacenes; no se puede construir fila_origen determinista sin cambiar esquema.`,{profile:PROFILE,sheetName:sheet.sheetName,column:wh.index+1});
      const item=blankOperationalRow(TYPES.INVENTORY);
      item.filaOrigen=(r+1)*1000+(wh.index+1);
      item.codigo=code;
      item.articulo=article;
      item.categoria=cat&&cat.category?cat.category:null;
      item.empresa=company;
      item.almacen=wh.name;
      item.tipoAlmacen=wh.type;
      item.fisico=qty;
      item.precioUnitario=unit;
      item.valor=unit==null?null:unit*qty;
      item.raw={...rowObject(headers,row),__perfil:PROFILE,__hoja:sheet.sheetName,__fila_excel:r+1,__columna_almacen:wh.index+1,__almacen:wh.name,__empresa:company,__parte_catalogo:cat&&cat.part?cat.part:null};
      normalized.push(item);
    }
  }
  assertRowLimit(normalized.length,maxRows,`La hoja ${sheet.sheetName}`);
  if(invalidNumbers>0) throw error422(`La hoja ${sheet.sheetName} contiene ${invalidNumbers} existencia(s) no numerica(s) en columnas de almacen.`,{profile:PROFILE,sheetName:sheet.sheetName,headerRow:headerIndex+1,invalidNumbers});
  if(!normalized.length) throw error422(`La hoja ${sheet.sheetName} no genero existencias importables.`,{profile:PROFILE,sheetName:sheet.sheetName,sourceArticles,warehouses:warehouses.map(x=>x.name)});
  return {
    type:TYPES.INVENTORY,sheetName:sheet.sheetName,headerRow:headerIndex+1,headers,
    mapping:{articulo:{header:headers[0]||'Articulo de inventario'},codigo:{header:headers[1]||'Codigo'},precio_unitario:{header:headers[2]||'Costo/Precio'},empresa:{header:`Inferida de ${sheet.sheetName}`},almacen:{header:'Columnas D+'},fisico:{header:'Valor de cada columna de almacen'}},
    rows:normalized,rowCount:normalized.length,quality:{articulosFuente:sourceArticles,almacenes:warehouses.length,filasNormalizadas:normalized.length,filasVaciasOmitidas:skippedEmpty},warnings:[]
  };
}
function parseLoan(sheet,company,maxRows){
  const rows=Array.isArray(sheet&&sheet.rows)?sheet.rows:[];
  const headers=(rows[0]||[]).map(v=>text(v));
  const out=[];let invalid=0;
  for(let i=1;i<rows.length;i+=1){
    const r=rows[i]||[];
    const article=text(r[1]);
    if(!article) continue;
    const qty=numberValue(r[2]);
    if(qty==null){invalid+=1;continue;}
    const item=blankOperationalRow(TYPES.LOAN);
    item.filaOrigen=i+1;item.empresa=company;item.articulo=article;item.cantidad=qty;item.costoUnitario=numberValue(r[3]);
    item.valor=item.costoUnitario==null?null:item.cantidad*item.costoUnitario;
    item.responsable=text(r[4])||'Sin asignar';item.sitio=text(r[5])||null;item.ag=text(r[6])||null;item.fechaEvento=normalizeDate(r[0]);
    item.raw={...rowObject(headers,r),__perfil:PROFILE,__hoja:sheet.sheetName,__empresa:company,__antiguedad_origen:text(r[7])||null};
    out.push(item);
  }
  assertRowLimit(out.length,maxRows,`La hoja ${sheet.sheetName}`);
  if(invalid) throw error422(`La hoja ${sheet.sheetName} contiene ${invalid} cantidad(es) no numerica(s).`,{profile:PROFILE,sheetName:sheet.sheetName,invalidNumbers:invalid});
  return {type:TYPES.LOAN,sheetName:sheet.sheetName,headerRow:1,headers,mapping:{fecha:{header:headers[0]||'Fecha'},articulo:{header:headers[1]||'Articulo'},cantidad:{header:headers[2]||'Cantidad'},costo:{header:headers[3]||'Costo'},responsable:{header:headers[4]||'Responsable'},sitio:{header:headers[5]||'Sitio'},ag:{header:headers[6]||'AG'},empresa:{header:`Inferida de ${sheet.sheetName}`}},rows:out,rowCount:out.length,quality:{filasNormalizadas:out.length},warnings:[]};
}
function parseGuards(sheet,maxRows){
  const rows=Array.isArray(sheet&&sheet.rows)?sheet.rows:[];
  const headers=(rows[0]||[]).map(v=>text(v));
  const out=[];let invalid=0,missingCompany=0;
  for(let i=1;i<rows.length;i+=1){
    const r=rows[i]||[];
    if(!text(r[1])&&!text(r[7])) continue;
    const qty=numberValue(r[5]);
    if(text(r[5])&&qty==null){invalid+=1;continue;}
    const company=text(r[2]);
    if(!company){missingCompany+=1;continue;}
    const item=blankOperationalRow(TYPES.GUARD);
    item.filaOrigen=i+1;item.fechaEvento=normalizeDate(r[0]);item.folio=text(r[1])||null;item.empresa=company;item.departamento=text(r[3])||null;
    item.ag=text(r[4])||null;item.cantidad=qty;item.unidad=text(r[6])||null;item.articulo=text(r[7])||null;item.proyecto=text(r[8])||null;
    item.equipo=text(r[9])||null;item.entregadoPor=text(r[10])||null;item.salida=text(r[11])||null;item.responsable=text(r[14])||null;
    item.ubicacion=text(r[16])||null;item.conStock=text(r[17])||null;item.raw={...rowObject(headers,r),__perfil:PROFILE,__hoja:sheet.sheetName};
    out.push(item);
  }
  assertRowLimit(out.length,maxRows,`La hoja ${sheet.sheetName}`);
  if(invalid||missingCompany) throw error422(`La hoja ${sheet.sheetName} contiene filas invalidas para Resguardos.`,{profile:PROFILE,sheetName:sheet.sheetName,cantidadNoNumerica:invalid,filasSinSubsidiaria:missingCompany});
  return {type:TYPES.GUARD,sheetName:sheet.sheetName,headerRow:1,headers,mapping:{fecha:{header:headers[0]||'Fecha'},folio:{header:headers[1]||'Folio'},empresa:{header:headers[2]||'Subsidiaria'},departamento:{header:headers[3]||'Departamento'},ag:{header:headers[4]||'AG'},cantidad:{header:headers[5]||'Cantidad'},unidad:{header:headers[6]||'Unidad'},descripcion:{header:headers[7]||'Descripcion'},proyecto:{header:headers[8]||'Proyecto'},equipo:{header:headers[9]||'Equipo'},entregado_por:{header:headers[10]||'Entregado por'},salida:{header:headers[11]||'Salida'},responsable:{header:headers[14]||'A cargo de'},ubicacion:{header:headers[16]||'Ubicacion'},con_stock:{header:headers[17]||'Con stock'}},rows:out,rowCount:out.length,quality:{filasNormalizadas:out.length},warnings:[]};
}
function detectSummary(sheet){
  if(!sheet||!Array.isArray(sheet.rows)) return {present:false,rows:0};
  let header=-1;
  for(let i=0;i<Math.min(sheet.rows.length,20);i+=1){if(normalize((sheet.rows[i]||[])[0])==='ARTICULO'){header=i;break;}}
  if(header<0) return {present:true,rows:0,headerRow:null};
  let count=0;
  for(let i=header+1;i<sheet.rows.length;i+=1){const a=text((sheet.rows[i]||[])[0]);if(a&&!normalize(a).startsWith('TOTAL'))count+=1;}
  return {present:true,rows:count,headerRow:header+1};
}
function movementMeta(sheet,company){
  if(!sheet||!Array.isArray(sheet.rows)) return null;
  let header=-1;
  for(let i=0;i<Math.min(sheet.rows.length,8);i+=1){if((sheet.rows[i]||[]).some(v=>normalize(v).includes('TIPO'))){header=i;break;}}
  return {sheetName:sheet.sheetName,company,headerRow:header>=0?header+1:null,rows:Math.max(0,sheet.rows.length-(header>=0?header+1:0))};
}

function analyzeOfficialWorkbook(options){
  const sheets=Array.isArray(options&&options.sheets)?options.sheets:[];
  const maxRows=Math.max(1,Number(options&&options.maxRows)||100000);
  const cutoffDate=normalizeDate(options&&options.requestedCutoffDate)||null;
  const map=byName(sheets);
  if(!hasAnyProfileMarker(map)) return {detected:false};

  const missing=INVENTORY_DETAILS.filter(cfg=>!getSheet(map,cfg.sheet)).map(cfg=>cfg.sheet);
  if(missing.length){
    throw error422('Se detecto la estructura operativa de Almacen, pero faltan hojas obligatorias de desglose de inventario.',{profile:PROFILE,missingSheets:missing,detectedSheets:sheets.map(s=>s.sheetName)});
  }

  const catalog=catalogFromArticles(getSheet(map,'ARTICULOS'));
  const datasets=[];
  for(const cfg of INVENTORY_DETAILS) datasets.push(parseInventoryDetail(getSheet(map,cfg.sheet),cfg.company,catalog,maxRows));

  for(const cfg of LOAN_SHEETS){const sheet=getSheet(map,cfg.sheet);if(sheet){const ds=parseLoan(sheet,cfg.company,maxRows);if(ds.rowCount)datasets.push(ds);}}
  const guardSheet=getSheet(map,'RESGUARDOS');
  if(guardSheet){const ds=parseGuards(guardSheet,maxRows);if(ds.rowCount)datasets.push(ds);}

  const summaries={};
  SUMMARY_SHEETS.forEach(cfg=>{summaries[cfg.company]=detectSummary(getSheet(map,cfg.sheet));});
  const movements=MOVEMENT_SHEETS.map(cfg=>movementMeta(getSheet(map,cfg.sheet),cfg.company)).filter(Boolean);
  const ignoredSheets=LEGACY_IGNORED_SHEETS.filter(name=>Boolean(getSheet(map,name)));
  const inventoryDatasets=datasets.filter(d=>d.type===TYPES.INVENTORY);
  const inventoryRows=inventoryDatasets.reduce((s,d)=>s+d.rowCount,0);
  const loanRows=datasets.filter(d=>d.type===TYPES.LOAN).reduce((s,d)=>s+d.rowCount,0);
  const guardRows=datasets.filter(d=>d.type===TYPES.GUARD).reduce((s,d)=>s+d.rowCount,0);
  const warnings=[];
  if(!getSheet(map,'ARTICULOS')) warnings.push('ARTICULOS: no se encontro el catalogo; Categoria quedara NULL y el inventario seguira usando Codigo/Articulo del desglose.');
  for(const cfg of SUMMARY_SHEETS) if(!getSheet(map,cfg.sheet)) warnings.push(`${cfg.sheet}: no se encontro la hoja resumen; no bloquea el desglose de ${cfg.company}.`);
  for(const cfg of LOAN_SHEETS) if(!getSheet(map,cfg.sheet)) warnings.push(`${cfg.sheet}: no se encontro; ${cfg.company} no tendra prestamos en este cierre.`);
  if(!guardSheet) warnings.push('RESGUARDOS: no se encontro; el modulo Resguardos quedara sin datos para este cierre.');
  if(movements.length) warnings.push(`MOVIMIENTOS: se reconocieron ${movements.length} hoja(s), pero Fase 1 no las persiste ni recalcula Stock; esa integracion corresponde al motor comun posterior.`);
  if(ignoredSheets.length) warnings.push(`IGNORADAS: ${ignoredSheets.join(', ')} se detectaron y no se importan, conforme a la estructura operativa previa.`);
  if(!cutoffDate) warnings.push('CIERRE: no se proporciono Fecha de corte. El lote puede importarse, pero conviene capturarla para identificar historicamente el cierre.');

  const firstInventory=inventoryDatasets[0];
  const normalizedInventoryRows=inventoryDatasets.flatMap(dataset=>dataset.rows);
  const coverage={
    inventario:true,
    fisico:normalizedInventoryRows.some(row=>row.fisico!=null),
    precioUnitario:normalizedInventoryRows.some(row=>row.precioUnitario!=null),
    valor:normalizedInventoryRows.some(row=>row.valor!=null),
    categoria:normalizedInventoryRows.some(row=>Boolean(row.categoria)),
    tipoAlmacen:normalizedInventoryRows.some(row=>Boolean(row.tipoAlmacen)),
    stock:{abc:false,criticidad:false,demanda:false,stockSeguridad:false,puntoReorden:false,minimo:false,maximo:false},
    prestamos:loanRows>0,
    resguardos:guardRows>0
  };
  return {
    detected:true,
    analysis:{
      profile:PROFILE,
      datasets,
      cutoffDate,
      coverage,
      warnings,
      rowCount:datasets.reduce((sum,d)=>sum+d.rowCount,0),
      inventoryRows,loanRows,guardRows,
      sheetName:firstInventory?firstInventory.sheetName:null,
      headerRow:firstInventory?firstInventory.headerRow:null,
      headers:firstInventory?firstInventory.headers:[],
      mapping:firstInventory?firstInventory.mapping:{},
      recognizedSheets:{inventory:INVENTORY_DETAILS.map(x=>x.sheet),summaries,articles:Boolean(getSheet(map,'ARTICULOS')),loans:LOAN_SHEETS.filter(x=>getSheet(map,x.sheet)).map(x=>x.sheet),resguardos:Boolean(guardSheet),movements,ignored:ignoredSheets},
      detectedSheets:sheets.map(s=>s.sheetName)
    }
  };
}

module.exports={PROFILE,analyzeOfficialWorkbook};
