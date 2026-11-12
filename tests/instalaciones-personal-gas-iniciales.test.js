'use strict';
// QA GAS sin Google Sheets ni red. Valida contrato de 8 columnas.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'../scripts/INT9_PERSONAL_ENVIO_INICIALES_V004.gs'),'utf8');
const headers=['tipo_personal','nombre','contratista','puesto','categoria','experiencia','iniciales','activo'];
function prepare(rows,customHeaders=headers){
  const sheet={
    getName(){return 'personal';},
    getLastRow(){return rows.length+1;},
    getRange(row,column,rowCount,columnCount){
      assert.equal(columnCount,8);
      return {getDisplayValues(){return row===1?[customHeaders]:rows;}};
    }
  };
  const ctx={SpreadsheetApp:{getActiveSpreadsheet(){return {getSheetByName(name){assert.equal(name,'personal');return sheet;}};}},Logger:{log(){}}};
  vm.createContext(ctx);
  vm.runInContext(code,ctx);
  return ctx.INT9_PERSONAL_Preparar_();
}
test('GAS: G son iniciales, H es activo, todos los encabezados exactos',()=>{
  const r=prepare([
    ['MONTADOR','Montador QA','AL CA','Mecánico','','','MC','1'],
    ['AJUSTADOR','Ajustador QA','','','ELE-MONT','3 años','AJ','1'],
    ['MONTADOR','Inactivo QA','AL CA','Ayudante','','','IN','0']
  ]);
  assert.equal(r.registros.length,3);
  assert.equal(r.registros[2].payload.activo,0);
  assert.equal(r.registros[0].payload.activo,1);
  assert.equal(r.inactivos,1);
  assert.equal(r.registros[0].payload.iniciales,'MC');
  assert.equal(r.registros[1].payload.iniciales,'AJ');
  assert.equal(r.registros[1].payload.experiencia,'3 años');
});
test('GAS: no corrige ni inventa iniciales; vacio equivale a null',()=>{
  const r=prepare([['MONTADOR','Montador QA','AL CA','Mecánico','','',' a.B ','1'],
    ['AJUSTADOR','Ajustador QA','','','','','','1']]);
  assert.equal(r.registros[0].payload.iniciales,'a.B');
  assert.equal(r.registros[1].payload.iniciales,null);
});
test('GAS: encabezado antiguo A:G es rechazado antes de enviar',()=>{
  assert.throws(()=>prepare([['MONTADOR','QA','AL CA','Mecánico','','','AB','1']],
    ['tipo_personal','nombre','contratista','puesto','categoria','experiencia','activo','']),/Encabezado incorrecto/);
});
test('GAS: iniciales con mas de 30 caracteres detienen la hoja completa',()=>{
  assert.throws(()=>prepare([['MONTADOR','QA','AL CA','Mecánico','','','X'.repeat(31),'1']]),/maximo 30 caracteres/);
});

test('GAS V004: prepara 149 personas, incluyendo 49 inactivas, con limite de 200',()=>{
  const source=Array.from({length:149},(_,i)=>[
    'MONTADOR','Montador QA '+i,'CONS QA','Mecánico','','','QA'+i,i<49?'0':'1'
  ]);
  const r=prepare(source);
  assert.equal(r.registros.length,149);
  assert.equal(r.inactivos,49);
  assert.equal(r.registros.filter(x=>x.payload.activo===0).length,49);
  assert.equal(r.registros.filter(x=>x.payload.activo===1).length,100);
});
