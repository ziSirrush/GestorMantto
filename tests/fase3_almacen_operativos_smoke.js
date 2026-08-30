'use strict';

const assert = require('assert');
const path = require('path');
const Module = require('module');

const sheets = [
  {
    sheetName:'Inventario',
    rows:[
      ['Código','Artículo','Empresa','Almacén','Físico','Precio Unitario','ABC','Criticidad','Demanda','Stock Seguridad','Punto de Reorden','Mínimo','Máximo'],
      ['A-1','Motor','Corellian','General',10,100,'A','Alta',5,3,6,2,15],
      ['A-2','Sensor','United','Herramienta',4,50,'B','Media',2,2,3,1,8]
    ]
  },
  {
    sheetName:'Prestamos',
    rows:[
      ['Fecha','Artículo','Empresa','AG','Responsable','Sitio','Cantidad','Costo'],
      ['2026-01-10','Taladro','United','AG-01','Juan','Obra Norte',2,1200],
      ['2026-02-15','Escalera','Corellian','AG-02','Ana','Obra Sur',1,500]
    ]
  },
  {
    sheetName:'Resguardos',
    rows:[
      ['Fecha','Folio','Subsidiaria','Departamento','AG','Cantidad','Unidad','Descripción','Proyecto','Equipo','Entregado por','Salida','A cargo de','Ubicación','Con stock'],
      ['2026-03-01','R-1','Corellian','Operaciones','AG-10',1,'PZ','Laptop','P-1','EQ-1','Almacén','', 'María','Oficina','Sí']
    ]
  }
];

const insertCalls=[];
const conn={
  beginTransaction:async()=>{},
  commit:async()=>{},
  rollback:async()=>{},
  release:()=>{},
  query:async(sql,params)=>{ if(/^INSERT INTO/.test(String(sql).trim())) insertCalls.push({sql,params}); return [[],[]]; }
};
const db={getConnection:async()=>conn,query:async()=>[[]]};

const originalLoad=Module._load;
Module._load=function(request,parent,isMain){
  if(request==='../../config/db') return db;
  if(request==='./xlsx-lite') return {parseXlsxSheets:()=>sheets,parseCsv:()=>({sheetName:'CSV',rows:[]})};
  return originalLoad.call(this,request,parent,isMain);
};

const service=require(path.resolve(__dirname,'../backend/src/modules/almacen/almacen.service.js'));
Module._load=originalLoad;

const file={originalname:'almacen.xlsx',buffer:Buffer.from('fixture')};
const analysis=service.analyzeSpreadsheet(file,'2026-08-30');
assert.strictEqual(analysis.inventoryRows,2);
assert.strictEqual(analysis.loanRows,2);
assert.strictEqual(analysis.guardRows,1);
assert.strictEqual(analysis.rowCount,5);
assert.strictEqual(analysis.coverage.stock.abc,true);
assert.strictEqual(analysis.coverage.stock.stockSeguridad,true);
assert.strictEqual(analysis.coverage.prestamos,true);
assert.strictEqual(analysis.coverage.resguardos,true);
assert.deepStrictEqual(analysis.datasets.map(x=>x.type),['INVENTARIO','PRESTAMO','RESGUARDO']);

(async()=>{
  const result=await service.importSpreadsheet(file,'2026-08-30',123);
  assert.strictEqual(result.inventoryRows,2);
  assert.strictEqual(result.loanRows,2);
  assert.strictEqual(result.guardRows,1);
  assert.strictEqual(insertCalls.length,3);
  for(const call of insertCalls){
    const placeholders=(call.sql.match(/\?/g)||[]).length;
    assert.strictEqual(placeholders,call.params.length,'placeholders y parámetros deben coincidir');
  }
  console.log('OK fase3_almacen_operativos_smoke');
})().catch(error=>{console.error(error);process.exit(1);});
