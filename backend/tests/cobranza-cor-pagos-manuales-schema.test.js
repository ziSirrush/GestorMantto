'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/modules/cobranza-cor/cobranza-cor.repository.js'),'utf8');
function fixture(){
  const module={exports:{}};
  vm.runInNewContext(source,{module,require:()=>({})});
  return module.exports;
}
function columns(){
  return ['id_rel_pago','id_factura_cor','id_pago_cor','importe_aplicado','fecha_pago','estatus_pago','moneda','tipo_cambio','importe_mxn','id_rel_pago_origen','origen_registro','created_by','updated_by'].map(name=>({
    column_name:name,is_nullable:['id_pago_cor','id_rel_pago_origen','tipo_cambio','importe_mxn','fecha_pago'].includes(name)?'YES':'NO',
    column_type:name==='importe_aplicado'?'decimal(18,2)':'varchar(100)'
  }));
}
test('deteccion SQL no confunde esquema parcial con migracion terminada',async()=>{
  const api=fixture();
  async function ready(rows){return api.pagosManualesSchemaReady_cor({query:async(sql,args)=>{
    assert.match(sql,/information_schema\.COLUMNS/);
    assert.equal(args[0],'cobranza_rel_pagos');
    return [rows];
  }});}
  assert.equal(await ready([]),false);
  assert.equal(await ready(columns().filter(r=>r.column_name!=='fecha_pago')),false);
  assert.equal(await ready(columns().map(r=>r.column_name==='estatus_pago'?{...r,is_nullable:'YES'}:r)),false);
  assert.equal(await ready(columns().map(r=>r.column_name==='id_pago_cor'?{...r,is_nullable:'NO'}:r)),false);
  assert.equal(await ready(columns().map(r=>r.column_name==='importe_aplicado'?{...r,column_type:'decimal(18,2) unsigned'}:r)),false);
  assert.equal(await ready(columns()),true);
});
