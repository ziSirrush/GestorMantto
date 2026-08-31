'use strict';

// [Aster | 2026-08-31 | ASTER-MG | FIX ALMACEN EXCEL OFICIAL ALINEACION TOTAL V002]
// Perfil especializado para INVENTARIOS JULIO 26.xlsx.
// La estructura del Excel oficial es la autoridad de mapeo de esta carga temporal.
// Desarrollo Almacen se usa como referencia funcional para Stock/Prestamos/Resguardos.

const PROFILE = 'ALMACEN_INVENTARIOS_JULIO_26_OFICIAL_V2';
const TYPES = Object.freeze({ INVENTORY:'INVENTARIO', LOAN:'PRESTAMO', GUARD:'RESGUARDO' });

const INVENTORY_CONFIG = Object.freeze([
  { detail:'CORELLIAN DET', summary:'CORE', company:'Corellian' },
  { detail:'NUBIAN DET', summary:'NUBIAN', company:'Nubian' },
  { detail:'UNITED DET', summary:'UNITED', company:'United' }
]);

const REQUIRED_SHEETS = Object.freeze([
  'CORELLIAN DET','CORE',
  'NUBIAN DET','NUBIAN',
  'UNITED DET','UNITED',
  'ARTICULOS','RESGUARDOS'
]);

const LOAN_CONFIG = Object.freeze([
  {
    company:'United',
    aliases:['DETALLLE PRESTAMO UNI','DETALLE PRESTAMO UNI','Desglose Prestamo United']
  },
  {
    company:'Corellian',
    aliases:['DETALLE PRESTAMO CORE','Desglose Prestamo Corellian']
  }
]);

const MOVEMENT_CONFIG = Object.freeze([
  { sheet:'CORELLIAN MOVIMEINTOS', company:'Corellian' },
  { sheet:'NUBIAN MOVIMEINTOS', company:'Nubian' },
  { sheet:'UNITED MOVIMEINTOS', company:'United' }
]);

const LEGACY_IGNORED_SHEETS = Object.freeze(['PRESTAMO UNI','PRESTAMO CORE']);
const Z_95 = 1.645;
const DEFAULT_LEAD_TIME_MONTHS = 1;
const DEFAULT_CRITICALITY = 'Media';
const OUTPUT_STOCK_PRECISION = 1;

function text(value){ return value == null ? '' : String(value).trim(); }
function normalize(value){
  return text(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/\s+/g,' ').trim();
}
function normalizeCompact(value){ return normalize(value).replace(/[^A-Z0-9]/g,''); }
function isExcelError(value){ return /^#(?:N\/A|VALUE!|REF!|DIV\/0!|NAME\?|NUM!|NULL!)$/i.test(text(value)); }
function validCode(value){ const v=text(value); return v && !isExcelError(v) ? v : ''; }
function numberValue(value){
  if(value == null || value === '') return null;
  if(typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s=String(value).trim();
  if(!s || isExcelError(s)) return null;
  let negative=false;
  if(/^\(.*\)$/.test(s)){negative=true;s=s.slice(1,-1);}
  s=s.replace(/[$€£¥\s]/g,'').replace(/[^0-9,.-]/g,'');
  if(!s || s==='-' || s==='.' || s===',') return null;
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
function round(value, decimals){
  if(value==null || !Number.isFinite(Number(value))) return null;
  const factor=10**decimals;
  return Math.round(Number(value)*factor)/factor;
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
  const d=new Date(s);
  return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);
}
function monthKey(value){ const d=normalizeDate(value); return d?d.slice(0,7):null; }
function sourceDateOrRaw(value){
  const s=text(value);
  if(!s)return null;
  // xlsx-lite entrega fechas reales de Excel como seriales desde <v>. Esos sí se
  // normalizan. Textos operativos compuestos/malformados de FECHA2 se conservan
  // exactamente y no se fuerzan a una fecha inventada.
  if(/^\d+(?:\.\d+)?$/.test(s)){
    const n=Number(s);
    const d=Number.isFinite(n)&&n>20000&&n<100000?normalizeDate(n):null;
    return d||s;
  }
  const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if(iso)return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return s;
}
function error422(message,details){ const e=new Error(message);e.status=422;e.details=details||{};return e; }
function assertRowLimit(count,maxRows,label){
  if(count>maxRows){const e=new Error(`${label} supera el maximo temporal de ${maxRows} filas normalizadas.`);e.status=413;throw e;}
}
function byName(sheets){
  const map=new Map();
  (sheets||[]).forEach(sheet=>map.set(normalize(sheet&&sheet.sheetName),sheet));
  return map;
}
function getSheet(map,name){ return map.get(normalize(name))||null; }
function getFirstAlias(map,aliases){
  for(const alias of aliases){const sheet=getSheet(map,alias);if(sheet)return sheet;}
  return null;
}
function hasOfficialMarker(map){ return INVENTORY_CONFIG.some(cfg=>map.has(normalize(cfg.detail))); }
function rowObject(headers,row){
  const out={};
  (headers||[]).forEach((header,index)=>{if(text(header))out[text(header)]=row&&row[index]!=null?row[index]:'';});
  return out;
}
function colLettersToIndex(letters){
  let result=0;
  for(const ch of String(letters||'').toUpperCase()) result=result*26+(ch.charCodeAt(0)-64);
  return result-1;
}
function resolvedCell(rows,rowIndex,colIndex,depth=0){
  const row=Array.isArray(rows&&rows[rowIndex])?rows[rowIndex]:[];
  const value=row[colIndex];
  if(depth>4 || typeof value!=='string' || value.charAt(0)!=='=') return value;
  const match=value.trim().match(/^=\$?([A-Z]{1,3})\$?(\d+)$/i);
  if(!match) return value;
  const targetRow=Number(match[2])-1;
  const targetCol=colLettersToIndex(match[1]);
  if(targetRow<0||targetCol<0||targetRow>=(rows||[]).length) return value;
  return resolvedCell(rows,targetRow,targetCol,depth+1);
}
function canonicalCompany(value, fallback=''){
  const n=normalize(value);
  if(n.includes('CORELLIAN')) return 'Corellian';
  if(n.includes('NUBIAN')) return 'Nubian';
  if(n.includes('UNITED')) return 'United';
  return text(value)||fallback;
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
function blankOperationalRow(type){
  return {
    tipoRegistro:type,filaOrigen:null,codigo:null,articulo:null,categoria:null,empresa:null,almacen:null,tipoAlmacen:null,
    fisico:null,precioUnitario:null,valor:null,abc:null,criticidad:null,demanda:null,stockSeguridad:null,puntoReorden:null,
    minimo:null,maximo:null,fechaEvento:null,ag:null,responsable:null,sitio:null,cantidad:null,costoUnitario:null,folio:null,
    departamento:null,unidad:null,proyecto:null,equipo:null,entregadoPor:null,salida:null,ubicacion:null,conStock:null,raw:null
  };
}
function findHeaderRow(rows,predicate,maxSearch=40){
  for(let index=0;index<Math.min((rows||[]).length,maxSearch);index+=1){
    const row=Array.isArray(rows[index])?rows[index]:[];
    if(predicate(row,index))return index;
  }
  return -1;
}
function headerMap(headers){
  const map=new Map();
  (headers||[]).forEach((header,index)=>{
    const key=normalizeCompact(header);
    if(key && !map.has(key))map.set(key,index);
  });
  return map;
}
function headerIndex(map,aliases){
  for(const alias of aliases){const idx=map.get(normalizeCompact(alias));if(idx!=null)return idx;}
  return -1;
}

function buildArticleCatalog(sheet){
  const result=new Map();
  const normalizedMap=new Map();
  const ambiguousNormalized=new Set();
  const warnings=[];
  const rows=Array.isArray(sheet&&sheet.rows)?sheet.rows:[];
  const h=findHeaderRow(rows,row=>row.some(v=>normalize(v)==='NOMBRE')&&row.some(v=>normalize(v).includes('CATEGORIA DE ARTICULO')),10);
  if(h<0) throw error422('La hoja ARTICULOS no contiene el encabezado oficial esperado.',{profile:PROFILE,sheetName:sheet&&sheet.sheetName});
  const headers=(rows[h]||[]).map(text);
  const hm=headerMap(headers);
  const nameIdx=headerIndex(hm,['Nombre']);
  const partIdx=headerIndex(hm,['Numero de parte fabricante original','Número de parte fabricante original']);
  const categoryIdx=headerIndex(hm,['Categoría de Artículo','Categoria de Articulo']);
  const internalIdx=headerIndex(hm,['ID interno']);
  const lastPriceIdx=headerIndex(hm,['Último precio de compra','Ultimo precio de compra']);
  if(nameIdx<0||partIdx<0||categoryIdx<0)throw error422('ARTICULOS no contiene Nombre, Numero de parte fabricante original y Categoria de Articulo.',{profile:PROFILE,headers});
  let duplicates=0,conflicts=0;
  for(let r=h+1;r<rows.length;r+=1){
    const name=text(resolvedCell(rows,r,nameIdx));
    if(!name)continue;
    const entry={
      name,
      part:validCode(resolvedCell(rows,r,partIdx))||null,
      category:text(resolvedCell(rows,r,categoryIdx))||null,
      internalId:internalIdx>=0?text(resolvedCell(rows,r,internalIdx))||null:null,
      lastPurchase:lastPriceIdx>=0?numberValue(resolvedCell(rows,r,lastPriceIdx)):null,
      row:r+1
    };
    if(result.has(name)){
      duplicates+=1;
      const old=result.get(name);
      if((old.part||'')!==(entry.part||'') || (old.category||'')!==(entry.category||''))conflicts+=1;
      if(!old.part&&entry.part)old.part=entry.part;
      if(!old.category&&entry.category)old.category=entry.category;
      if(old.lastPurchase==null&&entry.lastPurchase!=null)old.lastPurchase=entry.lastPurchase;
    }else{
      result.set(name,entry);
    }
    const nk=normalize(name);
    if(!ambiguousNormalized.has(nk)){
      const existing=normalizedMap.get(nk);
      if(existing&&existing.name!==name){normalizedMap.delete(nk);ambiguousNormalized.add(nk);}
      else if(!existing)normalizedMap.set(nk,result.get(name));
    }
  }
  if(conflicts)warnings.push(`ARTICULOS: ${conflicts} nombre(s) exactos presentan conflicto de Parte/Categoria entre ubicaciones; se conserva el primer valor no vacio y el origen queda en raw_json.`);
  if(ambiguousNormalized.size)warnings.push(`ARTICULOS: ${ambiguousNormalized.size} nombre(s) solo coinciden al normalizar acentos/mayusculas; no se fusionan para evitar mezclar articulos distintos del Excel oficial.`);
  return {map:result,normalizedMap,ambiguousNormalized,warnings,headers,headerRow:h+1,duplicates,conflicts};
}

function buildSummary(sheet,company){
  const rows=Array.isArray(sheet&&sheet.rows)?sheet.rows:[];
  const h=findHeaderRow(rows,row=>normalize(row[0])==='ARTICULO'&&row.some(v=>normalize(v)==='VALOR DE FACTURA')&&row.some(v=>normalize(v)==='FISICO'),25);
  if(h<0)throw error422(`La hoja ${sheet.sheetName} no contiene el encabezado oficial Articulo / Valor de factura / Fisico.`,{profile:PROFILE,sheetName:sheet.sheetName});
  const headers=(rows[h]||[]).map(text);
  const hm=headerMap(headers);
  const articleIdx=headerIndex(hm,['Artículo','Articulo']);
  const valueIdx=headerIndex(hm,['Valor de factura']);
  const physicalIdx=headerIndex(hm,['Físico','Fisico']);
  const unitIdx=headerIndex(hm,['unitario','Unitario']);
  const agIdx=headerIndex(hm,['ag','AG']);
  if(articleIdx<0||valueIdx<0||physicalIdx<0||unitIdx<0)throw error422(`La hoja ${sheet.sheetName} carece de columnas oficiales para valor/fisico/unitario.`,{profile:PROFILE,headers});
  const map=new Map();
  const normalizedMap=new Map();
  const ambiguousNormalized=new Set();
  for(let r=h+1;r<rows.length;r+=1){
    const article=text(resolvedCell(rows,r,articleIdx));
    const n=normalize(article);
    if(!article||n==='ARTICULO DE INVENTARIO'||n.startsWith('TOTAL'))continue;
    const entry={
      article,
      value:numberValue(resolvedCell(rows,r,valueIdx)),
      physical:numberValue(resolvedCell(rows,r,physicalIdx)),
      unit:numberValue(resolvedCell(rows,r,unitIdx)),
      ag:agIdx>=0?validCode(resolvedCell(rows,r,agIdx))||null:null,
      row:r+1,
      company
    };
    // Igual que Desarrollo Almacen: la llave primaria es el texto exacto del Articulo.
    // Si el mismo texto exacto reaparece, la ultima fila del resumen gana.
    map.set(article,entry);
    if(!ambiguousNormalized.has(n)){
      const existing=normalizedMap.get(n);
      if(existing&&existing.article!==article){normalizedMap.delete(n);ambiguousNormalized.add(n);}
      else normalizedMap.set(n,entry);
    }
  }
  return {map,normalizedMap,ambiguousNormalized,headers,headerRow:h+1};
}

function lookupArticle(info,article){
  if(!info)return null;
  if(info.map&&info.map.has(article))return info.map.get(article);
  const n=normalize(article);
  if(info.ambiguousNormalized&&info.ambiguousNormalized.has(n))return null;
  return info.normalizedMap?info.normalizedMap.get(n)||null:null;
}

function findInventoryDetailHeader(rows){
  return findHeaderRow(rows,row=>normalize(row[0])==='ARTICULO'&&row.slice(3).some(v=>text(v)),30);
}
function inventoryIdentity(summary,catalog){
  const summaryCode=summary&&validCode(summary.ag);
  const catalogCode=catalog&&validCode(catalog.part);
  return summaryCode||catalogCode||null;
}
function inventoryUnit(summary){
  if(summary&&summary.unit!=null)return summary.unit;
  if(summary&&summary.value!=null&&summary.physical!=null&&summary.physical!==0)return summary.value/summary.physical;
  return null;
}
function allocatedValue(summary,qty,unit){
  if(summary&&summary.value!=null&&summary.physical!=null&&summary.physical!==0)return summary.value*(qty/summary.physical);
  return unit==null?null:qty*unit;
}

function parseInventoryDetail(sheet,company,summaryInfo,catalogInfo,maxRows){
  const rows=Array.isArray(sheet&&sheet.rows)?sheet.rows:[];
  const h=findInventoryDetailHeader(rows);
  if(h<0)throw error422(`La hoja ${sheet.sheetName} no contiene el encabezado oficial de detalle de inventario.`,{profile:PROFILE,sheetName:sheet.sheetName,expected:'Articulo | Descripcion | Proveedor preferido | almacenes... | total'});
  const headers=(rows[h]||[]).map(text);
  const warehouses=[];
  for(let c=3;c<headers.length;c+=1){
    const name=text(headers[c]);
    if(!name||normalize(name)==='TOTAL')continue;
    warehouses.push({index:c,name,type:warehouseType(name)});
  }
  if(!warehouses.length)throw error422(`La hoja ${sheet.sheetName} no contiene columnas de almacenes desde la columna D.`,{profile:PROFILE,sheetName:sheet.sheetName,headerRow:h+1,headers});

  const normalizedRows=[];
  const warnings=[];
  let sourceArticles=0,zeroStockArticles=0,nonNumericMarkers=0,summaryMissing=0,summaryPhysicalMismatch=0,codeConflicts=0;
  const mismatchExamples=[];
  const codeConflictExamples=[];

  for(let r=h+1;r<rows.length;r+=1){
    const article=text(resolvedCell(rows,r,0));
    const nArticle=normalize(article);
    if(!article||nArticle==='ARTICULO DE INVENTARIO'||nArticle==='ARTICULO'||nArticle.startsWith('TOTAL'))continue;
    sourceArticles+=1;
    const summary=lookupArticle(summaryInfo,article);
    const catalog=lookupArticle(catalogInfo,article);
    if(!summary)summaryMissing+=1;
    if(summary&&summary.ag&&catalog&&catalog.part&&normalize(summary.ag)!==normalize(catalog.part)){
      codeConflicts+=1;
      if(codeConflictExamples.length<5)codeConflictExamples.push({article,agResumen:summary.ag,parteCatalogo:catalog.part});
    }
    const code=inventoryIdentity(summary,catalog);
    const unit=inventoryUnit(summary);
    const category=catalog&&catalog.category?catalog.category:null;
    const physicalByWarehouse=[];
    let detailTotal=0;

    for(const wh of warehouses){
      const rawQty=resolvedCell(rows,r,wh.index);
      if(rawQty==null||text(rawQty)==='')continue;
      const qty=numberValue(rawQty);
      if(qty==null){nonNumericMarkers+=1;continue;}
      detailTotal+=qty;
      if(qty===0)continue;
      physicalByWarehouse.push({wh,qty});
    }

    if(summary&&summary.physical!=null&&Math.abs(detailTotal-summary.physical)>0.0001){
      summaryPhysicalMismatch+=1;
      if(mismatchExamples.length<5)mismatchExamples.push({article,detalle:detailTotal,resumen:summary.physical});
    }

    if(!physicalByWarehouse.length){
      zeroStockArticles+=1;
      const item=blankOperationalRow(TYPES.INVENTORY);
      item.filaOrigen=(r+1)*1000;
      item.codigo=code;
      item.articulo=article;
      item.categoria=category;
      item.empresa=company;
      item.almacen='';
      item.tipoAlmacen=null;
      item.fisico=0;
      item.precioUnitario=unit;
      item.valor=summary&&summary.value!=null?summary.value:(unit==null?null:0);
      item.raw={
        ...rowObject(headers,rows[r]||[]),__perfil:PROFILE,__hoja:sheet.sheetName,__fila_excel:r+1,__empresa:company,
        __sin_stock:true,__descripcion_detalle:text(resolvedCell(rows,r,1))||null,__proveedor_preferido:text(resolvedCell(rows,r,2))||null,
        __resumen_valor:summary&&summary.value!=null?summary.value:null,__resumen_fisico:summary&&summary.physical!=null?summary.physical:null,
        __resumen_unitario:summary&&summary.unit!=null?summary.unit:null,__resumen_ag:summary&&summary.ag?summary.ag:null,
        __catalogo_parte:catalog&&catalog.part?catalog.part:null,__catalogo_categoria:catalog&&catalog.category?catalog.category:null,
        __catalogo_ultimo_precio:catalog&&catalog.lastPurchase!=null?catalog.lastPurchase:null
      };
      normalizedRows.push(item);
      continue;
    }

    for(const {wh,qty} of physicalByWarehouse){
      if(wh.index>=1000)throw error422(`La hoja ${sheet.sheetName} excede 999 columnas de almacenes; no se puede construir fila_origen determinista sin cambiar esquema.`,{profile:PROFILE,sheetName:sheet.sheetName,column:wh.index+1});
      const item=blankOperationalRow(TYPES.INVENTORY);
      item.filaOrigen=(r+1)*1000+(wh.index+1);
      item.codigo=code;
      item.articulo=article;
      item.categoria=category;
      item.empresa=company;
      item.almacen=wh.name;
      item.tipoAlmacen=wh.type;
      item.fisico=qty;
      item.precioUnitario=unit;
      item.valor=allocatedValue(summary,qty,unit);
      item.raw={
        ...rowObject(headers,rows[r]||[]),__perfil:PROFILE,__hoja:sheet.sheetName,__fila_excel:r+1,__columna_almacen:wh.index+1,
        __almacen:wh.name,__empresa:company,__descripcion_detalle:text(resolvedCell(rows,r,1))||null,__proveedor_preferido:text(resolvedCell(rows,r,2))||null,
        __resumen_valor:summary&&summary.value!=null?summary.value:null,__resumen_fisico:summary&&summary.physical!=null?summary.physical:null,
        __resumen_unitario:summary&&summary.unit!=null?summary.unit:null,__resumen_ag:summary&&summary.ag?summary.ag:null,
        __catalogo_parte:catalog&&catalog.part?catalog.part:null,__catalogo_categoria:catalog&&catalog.category?catalog.category:null,
        __catalogo_ultimo_precio:catalog&&catalog.lastPurchase!=null?catalog.lastPurchase:null
      };
      normalizedRows.push(item);
    }
  }

  assertRowLimit(normalizedRows.length,maxRows,`La hoja ${sheet.sheetName}`);
  if(!normalizedRows.length)throw error422(`La hoja ${sheet.sheetName} no genero registros importables.`,{profile:PROFILE,sheetName:sheet.sheetName,sourceArticles});
  if(nonNumericMarkers)warnings.push(`${sheet.sheetName}: ${nonNumericMarkers} celda(s) no numerica(s) en almacenes se trataron como 0/omitidas, igual que Desarrollo Almacen.`);
  if(summaryMissing)warnings.push(`${sheet.sheetName}: ${summaryMissing} articulo(s) no se encontraron en ${summaryInfo.sheetName}; conservan existencia del detalle pero valor/unitario pueden quedar NULL.`);
  if(summaryPhysicalMismatch)warnings.push(`${sheet.sheetName}: ${summaryPhysicalMismatch} articulo(s) no cuadran entre suma de almacenes y Fisico del resumen. Ejemplos: ${JSON.stringify(mismatchExamples)}.`);
  if(codeConflicts)warnings.push(`${sheet.sheetName}: ${codeConflicts} articulo(s) tienen AG del resumen diferente a Numero de parte de ARTICULOS. Se conserva AG del resumen como codigo operativo y ambos valores quedan en raw_json. Ejemplos: ${JSON.stringify(codeConflictExamples)}.`);

  return {
    type:TYPES.INVENTORY,
    sheetName:sheet.sheetName,
    headerRow:h+1,
    headers,
    mapping:{
      articulo:{header:`${sheet.sheetName}!Articulo`},
      codigo:{header:`${summaryInfo.sheetName}!ag; fallback ARTICULOS!Numero de parte fabricante original`},
      categoria:{header:'ARTICULOS!Categoria de Articulo'},
      empresa:{header:`Inferida de ${sheet.sheetName}`},
      almacen:{header:`${sheet.sheetName}!columnas D+`},
      fisico:{header:`${sheet.sheetName}!Fisico por almacen`},
      precio_unitario:{header:`${summaryInfo.sheetName}!unitario`},
      valor:{header:`${summaryInfo.sheetName}!Valor de factura prorrateado por fisico`}
    },
    rows:normalizedRows,
    rowCount:normalizedRows.length,
    quality:{articulosFuente:sourceArticles,articulosSinStock:zeroStockArticles,almacenes:warehouses.length,filasNormalizadas:normalizedRows.length,marcadoresNoNumericosOmitidos:nonNumericMarkers},
    warnings
  };
}

function parseLoan(sheet,company,maxRows){
  const rows=Array.isArray(sheet&&sheet.rows)?sheet.rows:[];
  const h=findHeaderRow(rows,row=>{
    const keys=row.map(normalizeCompact);
    return keys.includes('ARTICULO')&&keys.includes('CANTIDAD')&&keys.includes('COSTO')&&keys.includes('RESPONSABLE');
  },12);
  if(h<0)throw error422(`La hoja ${sheet.sheetName} no contiene el encabezado oficial de Prestamos.`,{profile:PROFILE,sheetName:sheet.sheetName});
  const headers=(rows[h]||[]).map(text);
  const hm=headerMap(headers);
  const idx={
    fecha:headerIndex(hm,['Fecha']), articulo:headerIndex(hm,['Artículo','Articulo']), cantidad:headerIndex(hm,['Cantidad']), costo:headerIndex(hm,['Costo']),
    responsable:headerIndex(hm,['Responsable']), sitio:headerIndex(hm,['Sitio','AD']), ag:headerIndex(hm,['AG']), antiguedad:headerIndex(hm,['Antigüedad','Antiguedad','Antguedad'])
  };
  if(idx.articulo<0||idx.cantidad<0||idx.costo<0||idx.responsable<0)throw error422(`La hoja ${sheet.sheetName} no contiene Articulo/Cantidad/Costo/Responsable.`,{profile:PROFILE,headers});
  const out=[];
  const warnings=[];
  let invalidQty=0,invalidCost=0;
  for(let r=h+1;r<rows.length;r+=1){
    const article=text(resolvedCell(rows,r,idx.articulo));
    if(!article)continue;
    let qty=numberValue(resolvedCell(rows,r,idx.cantidad));
    // Desarrollo Almacen aplica toF(): una cantidad vacia/marcador se conserva como 0.
    // No se descarta el prestamo completo por una celda aislada.
    if(qty==null){qty=0;invalidQty+=1;}
    const costTotal=numberValue(resolvedCell(rows,r,idx.costo));
    if(resolvedCell(rows,r,idx.costo)!=null&&text(resolvedCell(rows,r,idx.costo))!==''&&costTotal==null)invalidCost+=1;
    const item=blankOperationalRow(TYPES.LOAN);
    item.filaOrigen=r+1;
    item.empresa=company;
    item.fechaEvento=idx.fecha>=0?normalizeDate(resolvedCell(rows,r,idx.fecha)):null;
    item.articulo=article;
    item.cantidad=qty;
    // En el Excel oficial COSTO es el importe total del renglón, no costo unitario.
    item.valor=costTotal;
    item.costoUnitario=costTotal==null||qty===0?null:costTotal/qty;
    item.responsable=idx.responsable>=0?(text(resolvedCell(rows,r,idx.responsable))||'Sin asignar'):'Sin asignar';
    item.sitio=idx.sitio>=0?text(resolvedCell(rows,r,idx.sitio))||null:null;
    item.ag=idx.ag>=0?text(resolvedCell(rows,r,idx.ag))||null:null;
    item.raw={
      ...rowObject(headers,rows[r]||[]),__perfil:PROFILE,__hoja:sheet.sheetName,__empresa:company,
      __costo_total_fuente:costTotal,__antiguedad:idx.antiguedad>=0?text(resolvedCell(rows,r,idx.antiguedad))||null:null
    };
    out.push(item);
  }
  assertRowLimit(out.length,maxRows,`La hoja ${sheet.sheetName}`);
  if(invalidQty)warnings.push(`${sheet.sheetName}: ${invalidQty} fila(s) con Cantidad vacia/no interpretable se conservaron con Cantidad=0, igual que Desarrollo Almacen.`);
  if(invalidCost)warnings.push(`${sheet.sheetName}: ${invalidCost} fila(s) tienen Costo no interpretable; se conservan con valor NULL.`);
  return {
    type:TYPES.LOAN,sheetName:sheet.sheetName,headerRow:h+1,headers,
    mapping:{fecha:{header:headers[idx.fecha]||'Fecha'},articulo:{header:headers[idx.articulo]||'Articulo'},cantidad:{header:headers[idx.cantidad]||'Cantidad'},valor:{header:headers[idx.costo]||'Costo total'},responsable:{header:headers[idx.responsable]||'Responsable'},sitio:{header:idx.sitio>=0?headers[idx.sitio]:'Sitio/AD'},ag:{header:idx.ag>=0?headers[idx.ag]:'AG'},antiguedad:{header:idx.antiguedad>=0?headers[idx.antiguedad]:'Antiguedad'},empresa:{header:`Inferida de ${sheet.sheetName}`}},
    rows:out,rowCount:out.length,quality:{filasNormalizadas:out.length},warnings
  };
}

function parseGuards(sheet,maxRows){
  const rows=Array.isArray(sheet&&sheet.rows)?sheet.rows:[];
  const h=findHeaderRow(rows,row=>{
    const keys=row.map(normalizeCompact);
    return keys.includes('FOLIOENTRADA')&&keys.includes('SUBSIDIARIA')&&keys.includes('CANTIDAD')&&keys.includes('DESCRIPCION');
  },10);
  if(h<0)throw error422('La hoja RESGUARDOS no contiene el encabezado oficial esperado.',{profile:PROFILE,sheetName:sheet&&sheet.sheetName});
  const headers=(rows[h]||[]).map(text);
  const hm=headerMap(headers);
  const idx={
    fecha:headerIndex(hm,['FECHA']),folioEntrada:headerIndex(hm,['FOLIO ENTRADA']),empresa:headerIndex(hm,['SUBSIDIARIA']),departamento:headerIndex(hm,['DEPARTAMENTO']),ag:headerIndex(hm,['AG´S','AGS','AG']),
    cantidad:headerIndex(hm,['CANTIDAD']),unidad:headerIndex(hm,['UNIDAD']),descripcion:headerIndex(hm,['DESCRIPCIÓN','DESCRIPCION']),proyecto:headerIndex(hm,['PROYECTO']),equipo:headerIndex(hm,['NO. DE EQUIPO','NO DE EQUIPO']),
    entregadoPor:headerIndex(hm,['ENTREGADO POR:','ENTREGADO POR']),salida:headerIndex(hm,['SALIDA']),folioSalida:headerIndex(hm,['FOLIO']),fecha2:headerIndex(hm,['FECHA2']),responsable:headerIndex(hm,['A CARGO DE:','A CARGO DE']),
    total:headerIndex(hm,['TOTAL']),ubicacion:headerIndex(hm,['ubicacion','UBICACION']),conStock:headerIndex(hm,['CON STOCK'])
  };
  const required=['folioEntrada','empresa','cantidad','descripcion'];
  const missing=required.filter(key=>idx[key]<0);
  if(missing.length)throw error422(`RESGUARDOS no contiene columnas oficiales requeridas: ${missing.join(', ')}.`,{profile:PROFILE,headers});

  const out=[];
  const warnings=[];
  let qtyCoerced=0,missingCompany=0,missingDescription=0;
  for(let r=h+1;r<rows.length;r+=1){
    const folio=text(resolvedCell(rows,r,idx.folioEntrada));
    const description=text(resolvedCell(rows,r,idx.descripcion));
    if(!folio&&!description)continue;
    const company=canonicalCompany(resolvedCell(rows,r,idx.empresa));
    if(!company){missingCompany+=1;continue;}
    if(!description){missingDescription+=1;continue;}
    const rawQty=resolvedCell(rows,r,idx.cantidad);
    let qty=numberValue(rawQty);
    // Desarrollo Almacen convierte marcadores/no-numéricos a 0. El Excel oficial
    // además contiene formulas con valor cacheado; resolvedCell cubre referencias simples.
    if(qty==null){qty=0;qtyCoerced+=1;}
    const salidaValue=idx.salida>=0?resolvedCell(rows,r,idx.salida):null;
    const salidaNumber=numberValue(salidaValue);
    const totalValue=idx.total>=0?numberValue(resolvedCell(rows,r,idx.total)):null;
    const item=blankOperationalRow(TYPES.GUARD);
    item.filaOrigen=r+1;
    item.fechaEvento=idx.fecha>=0?normalizeDate(resolvedCell(rows,r,idx.fecha)):null;
    item.folio=folio||null;
    item.empresa=company;
    item.departamento=idx.departamento>=0?text(resolvedCell(rows,r,idx.departamento))||null:null;
    item.ag=idx.ag>=0?text(resolvedCell(rows,r,idx.ag))||null:null;
    item.cantidad=qty;
    item.unidad=idx.unidad>=0?text(resolvedCell(rows,r,idx.unidad))||null:null;
    item.articulo=description;
    item.proyecto=idx.proyecto>=0?text(resolvedCell(rows,r,idx.proyecto))||null:null;
    item.equipo=idx.equipo>=0?text(resolvedCell(rows,r,idx.equipo))||null:null;
    item.entregadoPor=idx.entregadoPor>=0?text(resolvedCell(rows,r,idx.entregadoPor))||null:null;
    // SALIDA en el Excel oficial es cantidad de salida, no fecha.
    // Se conserva en raw_json para no depender del tipo legacy de la columna `salida`
    // de almacen_fuente_excel. La consulta oficial la recupera desde __salida_cantidad.
    item.salida=null;
    item.responsable=idx.responsable>=0?text(resolvedCell(rows,r,idx.responsable))||null:null;
    item.ubicacion=idx.ubicacion>=0?text(resolvedCell(rows,r,idx.ubicacion))||null:null;
    item.conStock=idx.conStock>=0?text(resolvedCell(rows,r,idx.conStock))||null:null;
    item.raw={
      ...rowObject(headers,rows[r]||[]),__perfil:PROFILE,__hoja:sheet.sheetName,
      __folio_salida:idx.folioSalida>=0?text(resolvedCell(rows,r,idx.folioSalida))||null:null,
      __fecha_salida:idx.fecha2>=0?sourceDateOrRaw(resolvedCell(rows,r,idx.fecha2)):null,
      __total_pendiente:totalValue,
      __salida_cantidad:salidaNumber,
      __salida_raw:text(salidaValue)||null
    };
    out.push(item);
  }
  assertRowLimit(out.length,maxRows,`La hoja ${sheet.sheetName}`);
  if(qtyCoerced)warnings.push(`RESGUARDOS: ${qtyCoerced} cantidad(es) vacia(s)/no interpretable(s) se conservaron como 0 conforme a Desarrollo Almacen; la importacion no se bloquea por una celda aislada.`);
  if(missingCompany)warnings.push(`RESGUARDOS: ${missingCompany} fila(s) sin Subsidiaria fueron omitidas.`);
  if(missingDescription)warnings.push(`RESGUARDOS: ${missingDescription} fila(s) sin Descripcion fueron omitidas.`);
  return {
    type:TYPES.GUARD,sheetName:sheet.sheetName,headerRow:h+1,headers,
    mapping:{fecha:{header:headers[idx.fecha]||'FECHA'},folio:{header:headers[idx.folioEntrada]||'FOLIO ENTRADA'},empresa:{header:headers[idx.empresa]||'SUBSIDIARIA'},departamento:{header:headers[idx.departamento]||'DEPARTAMENTO'},ag:{header:headers[idx.ag]||'AG´S'},cantidad:{header:headers[idx.cantidad]||'CANTIDAD'},unidad:{header:headers[idx.unidad]||'UNIDAD'},descripcion:{header:headers[idx.descripcion]||'DESCRIPCION'},proyecto:{header:headers[idx.proyecto]||'PROYECTO'},equipo:{header:headers[idx.equipo]||'NO. DE EQUIPO'},entregado_por:{header:headers[idx.entregadoPor]||'ENTREGADO POR:'},salida:{header:headers[idx.salida]||'SALIDA (cantidad)'},folio_salida:{header:headers[idx.folioSalida]||'FOLIO'},fecha_salida:{header:headers[idx.fecha2]||'FECHA2'},responsable:{header:headers[idx.responsable]||'A CARGO DE:'},total:{header:headers[idx.total]||'TOTAL'},ubicacion:{header:headers[idx.ubicacion]||'ubicacion'},con_stock:{header:headers[idx.conStock]||'CON STOCK'}},
    rows:out,rowCount:out.length,quality:{filasNormalizadas:out.length,cantidadesConvertidasACero:qtyCoerced},warnings
  };
}

function movementHeader(sheet){
  const rows=Array.isArray(sheet&&sheet.rows)?sheet.rows:[];
  const h=findHeaderRow(rows,row=>{
    const keys=row.map(normalizeCompact);
    return keys.includes('TIPODETRANSACCION')&&keys.includes('ARTICULO')&&keys.includes('FECHA')&&keys.some(k=>k==='CANT'||k==='CANTIDAD');
  },12);
  if(h<0)return null;
  const headers=(rows[h]||[]).map(text);
  const hm=headerMap(headers);
  return {
    headerRow:h,
    headers,
    tipo:headerIndex(hm,['Tipo de transacción','Tipo de transaccion']),
    articulo:headerIndex(hm,['Artículo','Articulo']),
    fecha:headerIndex(hm,['Fecha']),
    cantidad:headerIndex(hm,['Cant.','Cant','Cantidad']),
    movimiento:headerIndex(hm,['MOVIMIENTO','MOVIMEINTO'])
  };
}
function movementConsumption(tipo,movimiento,qty){
  const m=normalize(movimiento);
  if(m==='SALIDA')return Math.abs(qty||0);
  if(m==='ENTRADA')return 0;
  if(qty<0)return Math.abs(qty);
  const t=normalize(tipo);
  if(t==='EJECUCION DE PEDIDO DE ARTICULO'||t==='FACTURA DE VENTA')return Math.abs(qty||0);
  return 0;
}
function parseMovementDemand(map){
  const monthly=new Map();
  const meta=[];
  const warnings=[];
  for(const cfg of MOVEMENT_CONFIG){
    const sheet=getSheet(map,cfg.sheet);
    if(!sheet)continue;
    const info=movementHeader(sheet);
    if(!info){warnings.push(`${cfg.sheet}: no se reconocio encabezado de movimientos; Stock no usa esta hoja.`);continue;}
    const rows=Array.isArray(sheet.rows)?sheet.rows:[];
    let used=0,invalidQty=0,invalidDate=0;
    for(let r=info.headerRow+1;r<rows.length;r+=1){
      const article=text(resolvedCell(rows,r,info.articulo));
      if(!article)continue;
      const rawQty=resolvedCell(rows,r,info.cantidad);
      if(rawQty==null||text(rawQty)==='')continue;
      const qty=numberValue(rawQty);
      if(qty==null){invalidQty+=1;continue;}
      const movement=info.movimiento>=0?resolvedCell(rows,r,info.movimiento):null;
      const type=info.tipo>=0?resolvedCell(rows,r,info.tipo):null;
      const consumption=movementConsumption(type,movement,qty);
      if(!consumption)continue;
      const month=monthKey(resolvedCell(rows,r,info.fecha));
      if(!month){invalidDate+=1;continue;}
      const key=`${cfg.company}::${article}`;
      if(!monthly.has(key))monthly.set(key,{company:cfg.company,article,months:new Map()});
      const entry=monthly.get(key);
      entry.months.set(month,(entry.months.get(month)||0)+consumption);
      used+=1;
    }
    meta.push({sheetName:sheet.sheetName,company:cfg.company,headerRow:info.headerRow+1,rows:Math.max(0,rows.length-info.headerRow-1),salidasUsadas:used});
    if(invalidQty)warnings.push(`${cfg.sheet}: ${invalidQty} movimiento(s) con Cantidad no numerica fueron omitidos; las cantidades vacias se ignoran sin marcar error.`);
    if(invalidDate)warnings.push(`${cfg.sheet}: ${invalidDate} salida(s) sin Fecha interpretable fueron omitidas.`);
  }
  return {monthly,meta,warnings};
}
function sampleStd(values,mean){
  if(values.length<2)return 0;
  return Math.sqrt(values.reduce((sum,value)=>sum+((value-mean)**2),0)/(values.length-1));
}
function stockMetricsFromMovements(monthly,inventoryRows){
  const inventoryByKey=new Map();
  for(const row of inventoryRows){
    const key=`${row.empresa}::${text(row.articulo)}`;
    if(!inventoryByKey.has(key))inventoryByKey.set(key,{unit:row.precioUnitario,physical:0});
    const inv=inventoryByKey.get(key);
    if(inv.unit==null&&row.precioUnitario!=null)inv.unit=row.precioUnitario;
    inv.physical+=Number(row.fisico||0);
  }

  const raw=[];
  for(const [key,entry] of monthly.entries()){
    const values=Array.from(entry.months.values()).map(Number).filter(Number.isFinite);
    if(values.length<2)continue;
    const total=values.reduce((a,b)=>a+b,0);
    const mean=total/values.length;
    const std=sampleStd(values,mean);
    const cv=mean>0?std/mean:0;
    const annual=mean*12;
    const inv=inventoryByKey.get(key)||{unit:0,physical:null};
    const unit=Number(inv.unit||0);
    const criticality=DEFAULT_CRITICALITY;
    const criticalWeight=criticality==='Alta'?3:criticality==='Media'?2:1;
    const abcScore=annual*unit*criticalWeight;
    const ss=round(Z_95*std*Math.sqrt(DEFAULT_LEAD_TIME_MONTHS),OUTPUT_STOCK_PRECISION);
    const rop=round(mean*DEFAULT_LEAD_TIME_MONTHS+ss,OUTPUT_STOCK_PRECISION);
    const maximo=round(rop+mean*2,OUTPUT_STOCK_PRECISION);
    const minimo=ss;
    raw.push({
      key,company:entry.company,article:entry.article,months:values.length,total,mean:round(mean,2),std:round(std,2),cv:round(cv,3),annual,
      unit,criticality,abcScore,ss,rop,minimo,maximo,demandType:cv<=0.2?'Estable':cv<=0.5?'Variable':'Irregular',physical:inv.physical
    });
  }

  const sorted=raw.slice().sort((a,b)=>b.abcScore-a.abcScore);
  const totalScore=sorted.reduce((sum,row)=>sum+row.abcScore,0);
  let cumulative=0;
  for(const row of sorted){
    cumulative+=row.abcScore;
    if(totalScore<=0)row.abc='C';
    else if(cumulative<=totalScore*0.80)row.abc='A';
    else if(cumulative<=totalScore*0.95)row.abc='B';
    else row.abc='C';
  }
  return new Map(sorted.map(row=>[row.key,row]));
}
function applyStockMetrics(inventoryDatasets,metrics){
  let decorated=0;
  for(const dataset of inventoryDatasets){
    let datasetDecorated=0;
    for(const row of dataset.rows){
      const metric=metrics.get(`${row.empresa}::${text(row.articulo)}`);
      if(!metric)continue;
      row.abc=metric.abc;
      row.criticidad=metric.criticality;
      row.demanda=metric.mean;
      row.stockSeguridad=metric.ss;
      row.puntoReorden=metric.rop;
      row.minimo=metric.minimo;
      row.maximo=metric.maximo;
      row.raw={...(row.raw||{}),__stock_calculado:true,__stock_meses:metric.months,__consumo_total:metric.total,__demanda_promedio:metric.mean,__demanda_desv:metric.std,__cv:metric.cv,__demanda_tipo:metric.demandType,__abc_score:metric.abcScore,__stock_formula:'SS=1.645*sigmaD*sqrt(1); ROP=Dprom*1+SS; MIN=SS; MAX=ROP+2*Dprom',__criticidad_origen:'DEFAULT_DESARROLLO_ALMACEN_MEDIA'};
      decorated+=1;
      datasetDecorated+=1;
    }
    if(datasetDecorated){
      dataset.mapping.abc={header:'Calculado con MOVIMIENTOS: ABC = Volumen anual x Unitario x Criticidad'};
      dataset.mapping.criticidad={header:'Default Desarrollo Almacen: Media'};
      dataset.mapping.demanda={header:'Calculada desde MOVIMIENTOS: promedio mensual de salidas'};
      dataset.mapping.stock_seguridad={header:'Calculado: Z95 x desviacion demanda x sqrt(LT=1 mes)'};
      dataset.mapping.punto_reorden={header:'Calculado: demanda promedio x LT + Stock seguridad'};
      dataset.mapping.minimo={header:'Calculado: Stock seguridad'};
      dataset.mapping.maximo={header:'Calculado: ROP + 2 x demanda promedio'};
    }
  }
  return decorated;
}

function analyzeOfficialWorkbook(options){
  const sheets=Array.isArray(options&&options.sheets)?options.sheets:[];
  const maxRows=Math.max(1,Number(options&&options.maxRows)||100000);
  const cutoffDate=normalizeDate(options&&options.requestedCutoffDate)||null;
  const map=byName(sheets);
  if(!hasOfficialMarker(map))return {detected:false};

  const missing=REQUIRED_SHEETS.filter(name=>!getSheet(map,name));
  if(missing.length)throw error422('Se detecto el Excel oficial de Almacen, pero faltan hojas obligatorias.',{profile:PROFILE,missingSheets:missing,detectedSheets:sheets.map(s=>s.sheetName)});

  const catalog=buildArticleCatalog(getSheet(map,'ARTICULOS'));
  const datasets=[];
  const warnings=[...catalog.warnings];
  const inventoryDatasets=[];
  const summaries={};

  for(const cfg of INVENTORY_CONFIG){
    const summary=buildSummary(getSheet(map,cfg.summary),cfg.company);
    summary.sheetName=cfg.summary;
    summaries[cfg.company]={sheetName:cfg.summary,rows:summary.map.size,headerRow:summary.headerRow};
    const dataset=parseInventoryDetail(getSheet(map,cfg.detail),cfg.company,summary,catalog,maxRows);
    datasets.push(dataset);inventoryDatasets.push(dataset);warnings.push(...dataset.warnings);
  }

  for(const cfg of LOAN_CONFIG){
    const sheet=getFirstAlias(map,cfg.aliases);
    if(!sheet){warnings.push(`PRESTAMOS ${cfg.company}: no se encontro una hoja compatible (${cfg.aliases.join(' / ')}).`);continue;}
    const dataset=parseLoan(sheet,cfg.company,maxRows);
    if(dataset.rowCount){datasets.push(dataset);warnings.push(...dataset.warnings);}
  }

  const guard=parseGuards(getSheet(map,'RESGUARDOS'),maxRows);
  datasets.push(guard);warnings.push(...guard.warnings);

  const movement=parseMovementDemand(map);
  warnings.push(...movement.warnings);
  const allInventoryRows=inventoryDatasets.flatMap(dataset=>dataset.rows);
  const stockMetrics=stockMetricsFromMovements(movement.monthly,allInventoryRows);
  const stockRows=applyStockMetrics(inventoryDatasets,stockMetrics);
  if(movement.meta.length){
    warnings.push(`STOCK: ${movement.meta.length} hoja(s) MOVIMIENTOS reconocidas; ${stockMetrics.size} articulo(s) tienen al menos 2 meses de salidas y parametros calculados con las formulas de Desarrollo Almacen (SL=95%, LT=1 mes, Criticidad default=Media).`);
  }

  const ignoredSheets=LEGACY_IGNORED_SHEETS.filter(name=>Boolean(getSheet(map,name)));
  if(ignoredSheets.length)warnings.push(`IGNORADAS: ${ignoredSheets.join(', ')} se detectaron y no se importan.`);
  if(!cutoffDate)warnings.push('CIERRE: no se proporciono Fecha de corte. El lote puede importarse, pero la fecha de corte es recomendable para trazabilidad historica.');

  const inventoryRows=inventoryDatasets.reduce((sum,dataset)=>sum+dataset.rowCount,0);
  const loanRows=datasets.filter(dataset=>dataset.type===TYPES.LOAN).reduce((sum,dataset)=>sum+dataset.rowCount,0);
  const guardRows=guard.rowCount;
  const firstInventory=inventoryDatasets[0]||null;
  const coverage={
    inventario:true,
    fisico:allInventoryRows.some(row=>row.fisico!=null),
    precioUnitario:allInventoryRows.some(row=>row.precioUnitario!=null),
    valor:allInventoryRows.some(row=>row.valor!=null),
    categoria:allInventoryRows.some(row=>Boolean(row.categoria)),
    tipoAlmacen:allInventoryRows.some(row=>Boolean(row.tipoAlmacen)),
    stock:{abc:stockRows>0,criticidad:stockRows>0,demanda:stockRows>0,stockSeguridad:stockRows>0,puntoReorden:stockRows>0,minimo:stockRows>0,maximo:stockRows>0},
    prestamos:loanRows>0,
    resguardos:guardRows>0
  };

  return {
    detected:true,
    analysis:{
      profile:PROFILE,datasets,cutoffDate,coverage,warnings,
      rowCount:datasets.reduce((sum,dataset)=>sum+dataset.rowCount,0),
      inventoryRows,loanRows,guardRows,stockMetrics:stockMetrics.size,
      sheetName:firstInventory?firstInventory.sheetName:null,
      headerRow:firstInventory?firstInventory.headerRow:null,
      headers:firstInventory?firstInventory.headers:[],
      mapping:firstInventory?firstInventory.mapping:{},
      recognizedSheets:{
        inventory:INVENTORY_CONFIG.map(cfg=>({detail:cfg.detail,summary:cfg.summary,company:cfg.company})),
        summaries,
        articles:{sheetName:'ARTICULOS',rows:catalog.map.size,headerRow:catalog.headerRow},
        loans:LOAN_CONFIG.map(cfg=>{const sheet=getFirstAlias(map,cfg.aliases);return sheet?{company:cfg.company,sheetName:sheet.sheetName}:null;}).filter(Boolean),
        resguardos:{sheetName:'RESGUARDOS',rows:guardRows},
        movements:movement.meta,
        ignored:ignoredSheets
      },
      detectedSheets:sheets.map(sheet=>sheet.sheetName)
    }
  };
}

module.exports={PROFILE,analyzeOfficialWorkbook};
