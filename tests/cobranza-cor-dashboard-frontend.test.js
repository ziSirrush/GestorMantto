'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.resolve(__dirname,'../modules/cobranza-cor/cobranza-cor-dashboard.js'),'utf8');
const sandbox={window:{},Intl,Number,Map,Set,Date};
vm.runInNewContext(source,sandbox,{filename:'cobranza-cor-dashboard.js'});
const aggregate=sandbox.window.ManttoCobranzaCorDashboard.aggregate;
const motor={
  calcularFilas(detail){return detail.estado_cuenta;},
  resumirFilas(rows){
    const buckets=new Map();
    for(const r of rows){
      const name=r.moneda||'SIN_MONEDA';
      if(!buckets.has(name))buckets.set(name,{moneda:name,registros:0,total:0,cobrado:0,pendiente:0});
      const b=buckets.get(name);
      b.registros++;b.total+=r.total||0;b.cobrado+=r.pago_contabilizado||0;b.pendiente+=r.pendiente_calculado||0;
    }
    return [...buckets.values()];
  }
};
function project(ppns,asesor,rows,extra={}){
  return {proyecto:{ppns,proyecto:ppns,asesor},estado_cuenta:rows,facturas:[],pagos:[],relaciones_pagos:[],...extra};
}
function row(id,moneda,total,cobrado,pendiente,extra={}){
  return {id_fuente_cor:id,moneda,total,pago_contabilizado:cobrado,pendiente_calculado:pendiente,
    dias_vencimiento:null,estatus_vencimiento:'CORRIENTE',anio_proyecto:2026,...extra};
}
function one(...ps){return aggregate(ps,{},motor);}

test('agrega el importe solo una vez por PPNS',()=>{
  const p=project('P100','AB',[row(1,'MXN',100,30,70)]);
  const result=one(p,p);
  assert.equal(result.proyectos,1);
  assert.equal(result.byCurrency.get('MXN').total,100);
  assert.equal(result.byCurrency.get('MXN').pendiente,70);
});

test('mantiene MXN, USD y EUR en grupos monetarios separados',()=>{
  const result=one(project('P101','AB',[
    row(1,'MXN',100,20,80),row(2,'USD',100,50,50),row(3,'EUR',100,70,30)
  ]));
  assert.equal(result.byCurrency.size,3);
  assert.deepEqual([...result.byCurrency.keys()],['MXN','USD','EUR']);
  assert.equal(result.byAdvisor.size,3);
});

test('reproduce saldos del motor sin forzar total menos cobrado',()=>{
  const result=one(project('P102','AB',[row(1,'MXN',100,80,40)]));
  assert.equal(result.byCurrency.get('MXN').pendiente,40);
  assert.equal(result.byCurrency.get('MXN').cobrado,80);
  assert.equal(result.byCurrency.get('MXN').total,100);
});

test('solo suma como vencido saldo positivo con estatus VENCIDO',()=>{
  const result=one(project('P103','AB',[
    row(1,'MXN',100,30,70,{estatus_vencimiento:'VENCIDO',dias_vencimiento:45}),
    row(2,'MXN',100,30,70,{estatus_vencimiento:'CORRIENTE',dias_vencimiento:10}),
    row(3,'MXN',100,100,0,{estatus_vencimiento:'VENCIDO',dias_vencimiento:200})
  ]));
  assert.equal(result.byCurrency.get('MXN').vencido,70);
  assert.equal(result.byCurrency.get('MXN').hitosVencidos,1);
  assert.equal(result.byCurrency.get('MXN').antiguedad['31-60'],70);
  assert.equal(result.riesgos.length,1);
});

test('no atribuye un proyecto a dos asesores distintos',()=>{
  const result=one(project('P104','AB-CD',[row(1,'USD',100,50,50)]));
  assert.equal(result.byAdvisor.size,1);
  assert.ok(result.byAdvisor.has('Varios asesores (revisar)|USD'));
  assert.equal(result.problems.variosAsesores,1);
});

test('fecha Fuente y fecha Complemento no se suman en una misma serie',()=>{
  const result=one(project('P105','AB',[row(10,'USD',200,120,80,{fecha_pago:'2026-09-08'})],{
    facturas:[{id_factura_cor:23,ids_factura_cor:[23],id_fuente_cor:10,tipo_concepto:'HITO',moneda:'USD',fecha_factura:'2026-08-01'}],
    pagos:[{id_pago_cor:44,fecha_pago:'2026-09-10'}],
    relaciones_pagos:[{id_factura_cor:23,id_pago_cor:44,importe_aplicado:75}]
  }));
  const bucket=result.byCurrency.get('USD');
  assert.equal(bucket.fechasFuente.get('2026-09'),120);
  assert.equal(bucket.fechasComplemento.get('2026-09'),75);
  assert.equal(bucket.comprobantes,1);
  assert.equal(bucket.pagosAplicados,75);
  assert.equal(bucket.diasCobroN,1);
});

test('respeta filtro por anio del proyecto',()=>{
  const result=aggregate([project('P106','AB',[
    row(1,'EUR',100,50,50,{anio_proyecto:2025}),
    row(2,'EUR',200,100,100,{anio_proyecto:2026})
  ])],{anio:'2026'},motor);
  assert.equal(result.byCurrency.get('EUR').total,200);
});

test('repite una relacion no afecta el total de complementos',()=>{
  const record={id_factura_cor:22,id_pago_cor:33,importe_aplicado:80};
  const result=one(project('P107','AB',[row(1,'MXN',100,80,20)],{
    facturas:[{id_factura_cor:22,id_fuente_cor:1,tipo_concepto:'HITO',moneda:'MXN'}],
    pagos:[{id_pago_cor:33,fecha_pago:'2026-11-18'}],
    relaciones_pagos:[record,record]
  }));
  assert.equal(result.byCurrency.get('MXN').pagosAplicados,80);
});
