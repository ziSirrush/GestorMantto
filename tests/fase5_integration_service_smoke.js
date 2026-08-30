'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const repo = path.resolve(process.argv[2] || '.');
const servicePath = path.join(repo, 'backend', 'src', 'modules', 'almacen', 'almacen.service.js');
const seen = [];

function rowsFor(sql, params){
  const text = String(sql).replace(/\s+/g, ' ').trim();
  seen.push({ text, params:params || [] });

  if(/SELECT lote_importacion AS loteImportacion/.test(text)) {
    return [[{ loteImportacion:'lot-active', archivoOrigen:'qa.xlsx', fechaCorte:'2026-08-30', fechaImportacion:'2026-08-30 12:00:00', hashArchivo:'abc', filas:7 }]];
  }
  if(/SELECT tipo_registro AS tipoRegistro/.test(text)) {
    return [[
      { tipoRegistro:'INVENTARIO', hojaOrigen:'Inventario', filas:3, encabezadosJson:'[]', mapeoJson:'{"abc":{"header":"ABC"},"stock_seguridad":{"header":"Stock Seguridad"}}' },
      { tipoRegistro:'PRESTAMO', hojaOrigen:'Prestamos', filas:2, encabezadosJson:'[]', mapeoJson:'{}' },
      { tipoRegistro:'RESGUARDO', hojaOrigen:'Resguardos', filas:2, encabezadosJson:'[]', mapeoJson:'{}' }
    ]];
  }
  if(/COUNT\(DISTINCT NULLIF\(TRIM\(almacen\)/.test(text)) return [[{ referencias:3,piezas:19,almacenes:2,sinStock:0,filasConValor:3,valorTotal:2100 }]];
  if(/GROUP BY empresa ORDER BY valorTotal DESC/.test(text)) return [[{ empresa:'Corellian',referencias:2,piezas:15,filasConValor:2,valorTotal:1800 }]];
  if(/GROUP BY almacen ORDER BY valorTotal DESC LIMIT 5/.test(text)) return [[{ almacen:'CENTRAL',empresa:'Corellian',referencias:2,piezas:15,valorTotal:1800 }]];
  if(/ORDER BY total DESC LIMIT 15/.test(text)) return [[{ codigo:'A-1',articulo:'Motor',empresa:'Corellian',total:10 }]];

  if(/SELECT id,codigo,articulo,categoria,empresa,almacen/.test(text)) return [[{ id:1,codigo:'A-1',articulo:'Motor',categoria:'MEC',empresa:'Corellian',almacen:'CENTRAL',tipoAlmacen:'Central',fisico:10,precioUnitario:100,valor:1000 }]];
  if(/SELECT COUNT\(\*\) AS registros/.test(text)) return [[{ registros:1,piezas:10,filasConValor:1,valorTotal:1000 }]];
  if(/SELECT COUNT\(\*\) AS total FROM almacen_fuente_excel/.test(text)) return [[{ total:1 }]];

  if(/SELECT DISTINCT empresa AS value/.test(text)) return [[{ value:'Corellian' }]];
  if(/SELECT DISTINCT categoria AS value/.test(text)) return [[{ value:'MEC' }]];
  if(/SELECT DISTINCT almacen AS value/.test(text)) return [[{ value:'CENTRAL' }]];
  if(/SELECT DISTINCT responsable AS value/.test(text)) return [[{ value:'Ana' }]];
  if(/SELECT DISTINCT departamento AS value/.test(text)) return [[{ value:'Operaciones' }]];

  if(/SELECT id,codigo,articulo,empresa,UPPER/.test(text)) return [[{ id:1,codigo:'A-1',articulo:'Motor',empresa:'Corellian',abc:'A',criticidad:'Alta',demanda:5,fisico:10,stockSeguridad:3,puntoReorden:6,minimo:2,maximo:15,alerta:'ok' }]];
  if(/SELECT UPPER\(NULLIF\(TRIM\(abc\)/.test(text)) return [[{ abc:'A',total:1 }]];
  if(/SUM\(CASE WHEN stock_seguridad/.test(text)) return [[{ articulos:1,criticos:0,reorden:0,exceso:0 }]];

  if(/SELECT id,fecha_evento AS fecha,codigo,articulo,empresa,ag,responsable/.test(text)) return [[{ id:1,fecha:'2026-01-10',codigo:'P-1',articulo:'Taladro',empresa:'Corellian',ag:'AG-1',responsable:'Ana',sitio:'Sitio',cantidad:2,costo:100,valor:200,dias:20,antiguedad:'1-6 MESES' }]];
  if(/SELECT COUNT\(\*\) AS articulos,COALESCE\(SUM\(COALESCE\(cantidad/.test(text)) return [[{ articulos:1,cantidad:2,valorTotal:200 }]];
  if(/COUNT\(DISTINCT NULLIF\(TRIM\(responsable/.test(text)) return [[{ articulos:1,piezas:2,valorTotal:200,responsables:1 }]];
  if(/GROUP BY antiguedad/.test(text)) return [[{ antiguedad:'1-6 MESES',articulos:1,piezas:2,valorTotal:200 }]];
  if(/GROUP BY responsable ORDER BY/.test(text)) return [[{ responsable:'Ana',articulos:1,cantidad:2,valorTotal:200,diasPrestamo:20,desde:'2026-01-10',sitios:1 }]];

  if(/SELECT id,fecha_evento AS fecha,folio,empresa AS subsidiaria/.test(text)) return [[{ id:1,fecha:'2026-03-01',folio:'R-1',subsidiaria:'Corellian',departamento:'Operaciones',ag:'AG-2',cantidad:1,unidad:'PZ',descripcion:'Laptop',proyecto:'P-1',equipo:'EQ-1',entregadoPor:'Almacen',salida:null,aCargoDe:'Maria',ubicacion:'Oficina',conStock:'Si' }]];
  if(/SUM\(CASE WHEN NULLIF\(TRIM\(salida\)/.test(text)) return [[{ total:1,conSalida:0,sinSalida:1 }]];

  if(/COUNT\(\*\) AS referencias/.test(text) && /GROUP BY empresa, almacen/.test(text)) return [[{ empresa:'Corellian',almacen:'CENTRAL',tipo:'Central',referencias:3,piezas:15,valorEsperado:1800 }]];
  if(/MAX\(id\) AS sourceId/.test(text)) return [[
    { sourceId:1,codigo:'A-1',articulo:'Motor',categoria:'MEC',tipoAlmacen:'Central',empresa:'Corellian',almacen:'CENTRAL',esperado:10,valorEsperado:1000 },
    { sourceId:2,codigo:'A-2',articulo:'Sensor',categoria:'ELEC',tipoAlmacen:'Central',empresa:'Corellian',almacen:'CENTRAL',esperado:4,valorEsperado:500 },
    { sourceId:3,codigo:'A-3',articulo:'Tarjeta',categoria:'ELEC',tipoAlmacen:'Central',empresa:'Corellian',almacen:'CENTRAL',esperado:1,valorEsperado:300 }
  ]];

  return [[]];
}

const fakeDb = { async query(sql, params){ return rowsFor(sql, params); } };
const originalLoad = Module._load;
Module._load = function(request, parent, isMain){
  if(request === '../../config/db') return fakeDb;
  if(request === './xlsx-lite') return { parseXlsxSheets(){return[];}, parseCsv(){return{sheetName:'CSV',rows:[]};} };
  return originalLoad.call(this, request, parent, isMain);
};

(async function(){
  delete require.cache[require.resolve(servicePath)];
  const service = require(servicePath);

  const source = await service.activeSource();
  assert.strictEqual(source.loteImportacion, 'lot-active');
  assert.strictEqual(source.datasets.INVENTARIO.filas, 3);

  const dashboard = await service.getDashboard();
  assert.strictEqual(dashboard.ok, true);
  assert.strictEqual(dashboard.source.loteImportacion, 'lot-active');

  const inventory = await service.getInventory({ page:1, pageSize:30, stockOnly:true });
  assert.strictEqual(inventory.pagination.pageSize, 30);
  assert.strictEqual(inventory.rows.length, 1);

  const stock = await service.getStock({ page:1 });
  assert.strictEqual(stock.pagination.pageSize, 30);

  const loans = await service.getLoans({ page:1 });
  assert.strictEqual(loans.pagination.pageSize, 30);

  const guards = await service.getGuards({ page:1 });
  assert.strictEqual(guards.pagination.pageSize, 30);

  const auditCatalogs = await service.getAuditCatalogs();
  assert.strictEqual(auditCatalogs.ok, true);
  assert.strictEqual(auditCatalogs.available, true);

  const sample = await service.getAuditSample({ company:'Corellian', warehouse:'CENTRAL' });
  assert.strictEqual(sample.sample.totalReferences, 3);
  assert.strictEqual(sample.sample.sampleSize, 3);
  assert.ok(sample.sample.items.every(item => item.expected > 0));

  const writes = seen.filter(item => /\b(INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|DROP|ALTER|CREATE)\b/i.test(item.text));
  assert.deepStrictEqual(writes, [], 'Lecturas de modulos no deben escribir en DB');

  console.log('PASS fase5_integration_service_smoke');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  Module._load = originalLoad;
});
