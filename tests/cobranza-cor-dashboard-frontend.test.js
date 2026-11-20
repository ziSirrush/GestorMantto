'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.resolve(__dirname,'../modules/cobranza-cor/cobranza-cor-dashboard.js'),'utf8');
function createModule(window,document){
  const sandbox={window,document,URLSearchParams,Intl,Number,Map,Set,Date,console};
  vm.runInNewContext(source,sandbox,{filename:'cobranza-cor-dashboard.js'});
  return window.ManttoCobranzaCorDashboard;
}
const aggregate=createModule({}).aggregate;
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
  const ids={AB:11,CD:22,XY:33};
  const multiple=asesor==='AB-CD';
  return {proyecto:{ppns,proyecto:ppns,asesor,id_asesor:multiple?null:(ids[asesor]||null),
    asesores_distintos:multiple?2:(ids[asesor]?1:0)},
    estado_cuenta:rows,facturas:[],pagos:[],relaciones_pagos:[],...extra};
}
function row(id,moneda,total,cobrado,pendiente,extra={}){
  return {id_fuente_cor:id,moneda,total,pago_contabilizado:cobrado,pendiente_calculado:pendiente,
    dias_vencimiento:null,estatus_vencimiento:'CORRIENTE',anio_proyecto:2026,...extra};
}
function one(...ps){return aggregate(ps,{},motor);}

test('no duplica importes por PPNS',()=>{
  const p=project('P100','AB',[row(1,'MXN',100,30,70)]);
  const result=one(p,p);
  assert.equal(result.proyectos,1);
  assert.equal(result.byCurrency.get('MXN').total,100);
  assert.equal(result.byCurrency.get('MXN').pendiente,70);
});

test('las tres monedas permanecen independientes',()=>{
  const result=one(project('P101','AB',[
    row(1,'MXN',100,20,80),row(2,'USD',100,50,50),row(3,'EUR',100,70,30)
  ]));
  assert.equal(result.byCurrency.size,3);
  assert.deepEqual([...result.byCurrency.keys()],['MXN','USD','EUR']);
  assert.equal(result.byAdvisor.size,3);
});

test('toma cobrado y pendiente del motor, no fuerza total menos cobrado',()=>{
  const result=one(project('P102','AB',[row(1,'MXN',100,80,40)]));
  assert.equal(result.byCurrency.get('MXN').pendiente,40);
  assert.equal(result.byCurrency.get('MXN').cobrado,80);
  assert.equal(result.byCurrency.get('MXN').total,100);
});

test('solo el saldo positivo marcado vencido se considera vencido',()=>{
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

test('no atribuye PPNS ambiguo a asesores distintos',()=>{
  const result=one(project('P104','AB-CD',[row(1,'USD',100,50,50)]));
  assert.equal(result.byAdvisor.size,1);
  assert.ok(result.byAdvisor.has('MULTIPLE|USD'));
  assert.equal(result.problems.variosAsesores,1);
});

test('suma varios PPNS con un mismo id_asesor, aunque cambie el supervisor',()=>{
  const result=one(
    project('P201','AB',[row(1,'USD',200,100,100)]),
    project('P202','AB',[row(2,'USD',300,150,150)])
  );
  assert.equal(result.byAdvisor.get('ID:11|USD').proyectos.size,2);
  assert.equal(result.byAdvisor.get('ID:11|USD').total,500);
  assert.equal(result.byAdvisor.get('ID:11|USD').cobrado,250);
});

test('dos IDs distintos con las mismas iniciales nunca se fusionan',()=>{
  const a=project('P201','AB',[row(1,'MXN',200,50,150)]);
  const b=project('P202','AB',[row(2,'MXN',300,70,230)]);
  b.proyecto.id_asesor=99;
  const result=one(a,b);
  assert.equal(result.byAdvisor.size,2);
  assert.equal(result.byAdvisor.get('ID:11|MXN').total,200);
  assert.equal(result.byAdvisor.get('ID:99|MXN').total,300);
});

test('fechas Fuente y complemento siguen siendo series distintas',()=>{
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

test('anio del cobro no excluye el PPNS de un ejercicio anterior',()=>{
  const result=aggregate([project('P106','AB',[
    row(1,'EUR',100,50,50,{anio_proyecto:2025,fecha_pago:'2026-02-01'}),
    row(2,'EUR',200,100,100,{anio_proyecto:2026,fecha_pago:'2026-03-01'})
  ])],{anio_cobro:'2026'},motor);
  assert.equal(result.byCurrency.get('EUR').total,300);
});

test('repetir una relacion no duplica complementos',()=>{
  const record={id_factura_cor:22,id_pago_cor:33,importe_aplicado:80};
  const result=one(project('P107','AB',[row(1,'MXN',100,80,20)],{
    facturas:[{id_factura_cor:22,id_fuente_cor:1,tipo_concepto:'HITO',moneda:'MXN'}],
    pagos:[{id_pago_cor:33,fecha_pago:'2026-11-18'}],
    relaciones_pagos:[record,record]
  }));
  assert.equal(result.byCurrency.get('MXN').pagosAplicados,80);
});

test('matriz fija y diagnostico fuera del dashboard',()=>{
  assert.match(source,/CURRENCY_ORDER=\['USD','EUR','MXN'\]/);
  assert.match(source,/ccor-ds-currencies/);
  assert.match(source,/ccor-ds-dates/);
  assert.match(source,/ccor-ds-ages/);
  assert.doesNotMatch(source,/Cobertura y calidad/);
});

test('consolida todos los PPNS y pagina solo el detalle de vencidos',async()=>{
  const root={dataset:{},innerHTML:'',addEventListener(){}};
  const records=Array.from({length:25},(_,i)=>project('P'+(i+1),'AB',[
    row(i+1,'USD',100,20,80,{estatus_vencimiento:'VENCIDO',dias_vencimiento:60,
      fecha_pago:'2026-04-10'})
  ]));
  const calls=[];
  const fakeWindow={
    ManttoRouter:{getCurrent(){return {route:'cobranza-dashboard'};}},
    ManttoCobranzaCorEstadosCuenta:{motor},
    ManttoHttp:{async get(url){
      const params=new URLSearchParams(url.split('?')[1]);
      assert.equal(params.get('tipo'),'resumen');
      assert.equal(params.get('tamano'),'24');
      const page=Number(params.get('pagina'));
      calls.push(page);
      return {ok:true,tipo:'resumen',scope_aplicado:'USUARIOS_VISIBLES',
        paginacion:{pagina:page,tamano:24,total_proyectos:25,total_paginas:2},
        catalogos:{asesores:[{id:11,iniciales:'AB'}]},
        data:records.slice((page-1)*24,page*24)};
    }}
  };
  const fakeDocument={getElementById(){return root;}};
  const api=createModule(fakeWindow,fakeDocument);
  api.init();
  await api.refresh();
  assert.match(root.innerHTML,/Indicadores completos para 25 PPNS autorizados/);
  assert.match(root.innerHTML,/Desempeño por asesor/);
  assert.match(root.innerHTML,/25<\/td>/);
  assert.match(root.innerHTML,/Página 1 de 4/);
  assert.equal((root.innerHTML.match(/data-ppns=/g)||[]).length,8);
  assert.ok(calls.includes(1)&&calls.includes(2));
  assert.doesNotMatch(root.innerHTML,/Cobertura y calidad/);
});
