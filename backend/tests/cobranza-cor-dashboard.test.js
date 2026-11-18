'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {
  listarDashboard_cor,
  normalizeDashboardQuery_cor,
  currencyMatches_cor,
  advisorMatches_cor
}=require('../src/modules/cobranza-cor/cobranza-cor-dashboard.service');

function fixture(records){
  const access={dominio:'CORELLIAN',requiere_filtro_usuario:true,usuarios_visibles:[23]};
  const calls={list:[],detail:[],active:0,max:0};
  const motor={
    async listarEstadosCuenta_cor(filters,ctx){
      assert.equal(ctx,access,'Debe conservarse el contexto CORELLIAN completo');
      calls.list.push(filters);
      return {scope_aplicado:'USUARIOS_VISIBLES',data:records};
    },
    async detalleEstadoCuenta_cor(ppns,ctx){
      assert.equal(ctx,access,'El detalle debe conservar exactamente el alcance original');
      calls.detail.push(ppns);
      calls.active++;calls.max=Math.max(calls.max,calls.active);
      await Promise.resolve();
      await Promise.resolve();
      calls.active--;
      return {proyecto:{ppns},resumen:{monedas:[{moneda:'MXN',total:100,cobrado:40,pendiente:60}]},
        estado_cuenta:[{id_fuente_cor:7,pago_contabilizado:40,pendiente_calculado:60}]};
    }
  };
  return {access,motor,calls};
}

test('limita la paginacion a 8 proyectos por peticion',()=>{
  assert.equal(normalizeDashboardQuery_cor({}).tamano,8);
  for(const value of [0,-1,9,99,'1.2','abc']){
    assert.throws(()=>normalizeDashboardQuery_cor({tamano:value}),e=>e.statusCode===400);
  }
  assert.throws(()=>normalizeDashboardQuery_cor({pagina:'-1'}),e=>e.statusCode===400);
  assert.throws(()=>normalizeDashboardQuery_cor({anio:2199}),e=>e.statusCode===400);
  assert.throws(()=>normalizeDashboardQuery_cor({moneda:'BTC'}),e=>e.statusCode===400);
});

test('filtra por asesor y moneda y no permite PPNS duplicados',async()=>{
  const records=[
    {ppns:'P1',asesor:'AA',monedas:['MXN'],anios:[2025,2026]},
    {ppns:'p1',asesor:'AA',monedas:['MXN'],anios:[2025,2026]},
    {ppns:'P2',asesor:'BB',monedas:['USD'],anios:[2026]},
    {ppns:'P3',asesor:'AA',monedas:['MXN','USD'],anios:[2026]}
  ];
  const f=fixture(records);
  const value=await listarDashboard_cor({asesor:'AA',moneda:'MXN'},f.access,f.motor);
  assert.equal(value.motor,'estados-cuenta');
  assert.equal(value.paginacion.total_proyectos,2);
  assert.deepEqual(value.data.map(x=>x.proyecto.ppns),['P1','P3']);
  assert.deepEqual(f.calls.detail,['P1','P3']);
  assert.equal(value.scope_aplicado,'USUARIOS_VISIBLES');
  assert.equal(value.totales_parciales,true);
});

test('no recalcula saldos: entrega los detalles del motor oficial',async()=>{
  const f=fixture([{ppns:'P1',asesor:'AA',monedas:['MXN'],anios:[2026]}]);
  const value=await listarDashboard_cor({},f.access,f.motor);
  assert.equal(value.data[0].resumen.monedas[0].pendiente,60);
  assert.equal(value.data[0].estado_cuenta[0].pago_contabilizado,40);
  assert.equal(value.data[0].estado_cuenta[0].pendiente_calculado,60);
  assert.deepEqual(f.calls.list,[{q:'',anio:null}]);
});

test('no consulta detalles fuera del catalogo visible',async()=>{
  const f=fixture([]);
  const value=await listarDashboard_cor({},f.access,f.motor);
  assert.equal(value.paginacion.total_proyectos,0);
  assert.deepEqual(value.data,[]);
  assert.deepEqual(f.calls.detail,[]);
});

test('aplica paginas sin cargar 1000 proyectos',async()=>{
  const records=Array.from({length:40},(_,i)=>({
    ppns:'P'+(i+1),asesor:'AA',monedas:['MXN'],anios:[2026]
  }));
  const f=fixture(records);
  const value=await listarDashboard_cor({pagina:3,tamano:8},f.access,f.motor);
  assert.equal(value.paginacion.total_proyectos,40);
  assert.equal(value.paginacion.total_paginas,5);
  assert.deepEqual(f.calls.detail,['P17','P18','P19','P20','P21','P22','P23','P24']);
  assert.ok(f.calls.max<=2,'No mas de dos detalles simultaneos');
});

test('los filtros conservan el anio validado para Estados de Cuenta',async()=>{
  const f=fixture([{ppns:'P1',asesor:'AA',monedas:['MXN'],anios:[2026]}]);
  await listarDashboard_cor({anio:'2026',q:'P1'},f.access,f.motor);
  assert.deepEqual(f.calls.list,[{q:'P1',anio:2026}]);
});

test('fallo de alcance se propaga sin permitir resultados parciales',async()=>{
  const f=fixture([]);
  const unauthorized=Object.assign({},f.motor,{
    async listarEstadosCuenta_cor(){const error=new Error('Fuera de alcance');error.statusCode=403;throw error;}
  });
  await assert.rejects(
    ()=>listarDashboard_cor({},f.access,unauthorized),
    error=>error.statusCode===403
  );
});

test('filtros helper: moneda y asesor no mezclan asignaciones',()=>{
  assert.equal(currencyMatches_cor({monedas:['USD','MXN']},'EUR'),false);
  assert.equal(currencyMatches_cor({monedas:['USD','MXN']},'MXN'),true);
  assert.equal(advisorMatches_cor({asesor:'AA-BB'},'BB'),true);
  assert.equal(advisorMatches_cor({asesor:'AA-BB'},'CC'),false);
});
