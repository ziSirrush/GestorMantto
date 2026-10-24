'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {propagateZone1ToMp_uni,LOOKUPS}=require(
  '../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-zone1-derived-write');

test('Zona 1: solo las seis columnas BUSCARV documentadas pueden propagar a MP',async()=>{
  assert.equal(LOOKUPS.size,6);
  const conn={query(){throw Error('No debe consultar MP para una factura ordinaria.');}};
  assert.deepEqual(await propagateZone1ToMp_uni(conn,'7','numero_factura_01','F-1'),[]);
});

test('Zona 1: iguala y monto anual se calculan y escriben juntos, en la conexion recibida',async()=>{
  const calls=[];
  const conn={async query(sql,params){
    calls.push({sql,params});
    if(sql.startsWith('SELECT'))return [[{
      original_value:'100.00',factor_monto_anual:6,monto_anual:'600.00'
    }]];
    return [{affectedRows:1}];
  }};
  const changes=await propagateZone1ToMp_uni(conn,'7','iguala','125.50');
  assert.equal(calls.length,2);
  assert.match(calls[0].sql,/FOR UPDATE/);
  assert.match(calls[1].sql,/SET mp.`iguala` = \?, mp.`monto_anual` = \?/);
  assert.deepEqual(calls[1].params,['125.50','753.00','7']);
  assert.deepEqual(changes.map(x=>x.field),['iguala','monto_anual']);
});

test('Zona 1: si MP no confirma el derivado se rechaza, sin aprobar la escritura de origen',async()=>{
  const conn={async query(sql){
    if(sql.startsWith('SELECT'))return [[{
      original_value:'30',factor_monto_anual:null,monto_anual:null
    }]];
    return [{affectedRows:0}];
  }};
  await assert.rejects(propagateZone1ToMp_uni(conn,'7','condiciones_pago','45'),
    error=>error.code==='MP_ZONA1_DERIVADO_NO_CONFIRMADO');
});
