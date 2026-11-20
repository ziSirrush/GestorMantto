'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {
  listarDashboard_cor,
  normalizeDashboardQuery_cor,
  currencyMatches_cor,
  advisorMatches_cor,
  assignAdvisor_cor
}=require('../src/modules/cobranza-cor/cobranza-cor-dashboard.service');

function fixture(records,assignments=null){
  const access={dominio:'CORELLIAN',requiere_filtro_usuario:true,usuarios_visibles:[23]};
  const calls={list:[],detail:[],active:0,max:0,advisor:[],released:0};
  const motor={
    async listarEstadosCuenta_cor(filters,ctx){
      assert.equal(ctx,access,'El catalogo debe conservar el contexto CORELLIAN');
      calls.list.push(filters);
      return {scope_aplicado:'USUARIOS_VISIBLES',data:records};
    },
    async detalleEstadoCuenta_cor(ppns,ctx){
      assert.equal(ctx,access,'El detalle conserva exactamente el alcance original');
      calls.detail.push(ppns);
      calls.active++;calls.max=Math.max(calls.max,calls.active);
      await Promise.resolve();await Promise.resolve();
      calls.active--;
      return {proyecto:{ppns},resumen:{monedas:[{moneda:'MXN',total:100,cobrado:40,pendiente:60}]},
        estado_cuenta:[{id_fuente_cor:7,pago_contabilizado:40,pendiente_calculado:60}],
        facturas:[],pagos:[],relaciones_pagos:[]};
    }
  };
  const repo={
    async getConnection_cor(){return {release(){calls.released++;}};},
    async listDashboardAdvisors_cor(_conn,ppns){
      calls.advisor.push([...ppns]);
      if(assignments)return assignments.filter(row=>ppns.some(k=>String(k).toUpperCase()===row.ppns_key));
      return records.filter(row=>ppns.some(k=>String(k).toUpperCase()===String(row.ppns).toUpperCase()))
        .map(row=>({ppns_key:String(row.ppns).toUpperCase(),
          id_asesor:row.asesor==='BB'?22:11,iniciales:row.asesor||'AA'}));
    }
  };
  return {access,motor,repo,calls};
}
function execute(query,f){return listarDashboard_cor(query,f.access,f.motor,f.repo);}

test('limita detalles a 8, resumen a 24 y valida filtros',()=>{
  assert.equal(normalizeDashboardQuery_cor({}).tamano,8);
  assert.equal(normalizeDashboardQuery_cor({tipo:'resumen'}).tamano,24);
  for(const value of [0,-1,9,99,'1.2','abc']){
    assert.throws(()=>normalizeDashboardQuery_cor({tamano:value}),e=>e.statusCode===400);
  }
  assert.throws(()=>normalizeDashboardQuery_cor({tipo:'resumen',tamano:25}),e=>e.statusCode===400);
  assert.throws(()=>normalizeDashboardQuery_cor({pagina:'-1'}),e=>e.statusCode===400);
  assert.throws(()=>normalizeDashboardQuery_cor({anio:2199}),e=>e.statusCode===400);
  assert.throws(()=>normalizeDashboardQuery_cor({anio_cobro:1800}),e=>e.statusCode===400);
  assert.throws(()=>normalizeDashboardQuery_cor({moneda:'BTC'}),e=>e.statusCode===400);
  assert.throws(()=>normalizeDashboardQuery_cor({asesor:'AA'}),e=>e.statusCode===400);
});

test('filtra por ID de asesor y moneda y no repite PPNS',async()=>{
  const records=[
    {ppns:'P1',asesor:'AA',monedas:['MXN'],anios:[2025,2026]},
    {ppns:'p1',asesor:'AA',monedas:['MXN'],anios:[2025,2026]},
    {ppns:'P2',asesor:'BB',monedas:['USD'],anios:[2026]},
    {ppns:'P3',asesor:'AA',monedas:['MXN','USD'],anios:[2026]}
  ];
  const f=fixture(records);
  const value=await execute({asesor:'11',moneda:'MXN'},f);
  assert.equal(value.motor,'estados-cuenta');
  assert.equal(value.paginacion.total_proyectos,2);
  assert.deepEqual(value.data.map(x=>x.proyecto.ppns),['P1','P3']);
  assert.equal(value.data[0].proyecto.id_asesor,11);
  assert.equal(value.catalogos.asesores.find(x=>x.id===11).iniciales,'AA');
  assert.deepEqual(f.calls.detail,['P1','P3']);
  assert.equal(value.scope_aplicado,'USUARIOS_VISIBLES');
  assert.equal(value.totales_parciales,true);
});

test('mantiene importes originales de Estado de Cuenta',async()=>{
  const f=fixture([{ppns:'P1',asesor:'AA',monedas:['MXN'],anios:[2026]}]);
  const value=await execute({},f);
  assert.equal(value.data[0].resumen.monedas[0].pendiente,60);
  assert.equal(value.data[0].estado_cuenta[0].pago_contabilizado,40);
  assert.equal(value.data[0].estado_cuenta[0].pendiente_calculado,60);
  assert.deepEqual(f.calls.list,[{q:'',anio:null}]);
  assert.equal(f.calls.released,1);
});

test('sin PPNS visibles no consulta asignaciones ni detalles',async()=>{
  const f=fixture([]);
  const value=await execute({},f);
  assert.equal(value.paginacion.total_proyectos,0);
  assert.deepEqual(value.data,[]);
  assert.deepEqual(f.calls.detail,[]);
  assert.deepEqual(f.calls.advisor,[]);
});

test('paginas de detalle limitadas y concurrencia maxima dos',async()=>{
  const records=Array.from({length:40},(_,i)=>({
    ppns:'P'+(i+1),asesor:'AA',monedas:['MXN'],anios:[2026]
  }));
  const f=fixture(records);
  const value=await execute({pagina:3,tamano:8},f);
  assert.equal(value.paginacion.total_proyectos,40);
  assert.equal(value.paginacion.total_paginas,5);
  assert.deepEqual(f.calls.detail,['P17','P18','P19','P20','P21','P22','P23','P24']);
  assert.ok(f.calls.max<=2,'Nunca mas de dos conexiones de detalle simultaneas');
});

test('modo resumen consulta hasta 24 y mantiene mismo motor',async()=>{
  const records=Array.from({length:31},(_,i)=>({
    ppns:'P'+(i+1),asesor:'AA',monedas:['USD'],anios:[2025]
  }));
  const f=fixture(records);
  const value=await execute({tipo:'resumen',pagina:2},f);
  assert.equal(value.tipo,'resumen');
  assert.equal(value.paginacion.total_proyectos,31);
  assert.equal(value.paginacion.total_paginas,2);
  assert.equal(value.data.length,7);
  assert.equal(value.data[0].proyecto.ppns,'P25');
  assert.equal(value.data[0].estado_cuenta[0].pendiente_calculado,60);
  assert.equal(value.data[0].resumen,undefined);
  assert.ok(f.calls.max<=2);
});

test('anio de cobro no filtra anio de origen del proyecto',async()=>{
  const f=fixture([{ppns:'P1',asesor:'AA',monedas:['USD'],anios:[2024]}]);
  const value=await execute({anio_cobro:2026,q:'P1'},f);
  assert.deepEqual(f.calls.list,[{q:'P1',anio:null}]);
  assert.equal(value.filtros.anio_cobro,2026);
});

test('filtro original de proyecto sigue admitido para compatibilidad',async()=>{
  const f=fixture([{ppns:'P1',asesor:'AA',monedas:['MXN'],anios:[2026]}]);
  await execute({anio:'2026',q:'P1'},f);
  assert.deepEqual(f.calls.list,[{q:'P1',anio:2026}]);
});

test('varios IDs sobre un PPNS no se atribuyen arbitrariamente',async()=>{
  const f=fixture([{ppns:'P1',asesor:'AA-BB',monedas:['MXN'],anios:[2026]}],[
    {ppns_key:'P1',id_asesor:11,iniciales:'AA'},
    {ppns_key:'P1',id_asesor:22,iniciales:'BB'}
  ]);
  const all=await execute({},f);
  assert.equal(all.data[0].proyecto.id_asesor,null);
  assert.equal(all.data[0].proyecto.asesores_distintos,2);
  const only=await execute({asesor:11},f);
  assert.equal(only.paginacion.total_proyectos,0);
});

test('fallo de alcance se propaga sin generar totales incompletos',async()=>{
  const f=fixture([]);
  const unauthorized=Object.assign({},f.motor,{
    async listarEstadosCuenta_cor(){const error=new Error('Fuera de alcance');error.statusCode=403;throw error;}
  });
  await assert.rejects(
    ()=>listarDashboard_cor({},f.access,unauthorized,f.repo),
    error=>error.statusCode===403
  );
});

test('helpers asignan solo ID estable, no iniciales de nombre',()=>{
  assert.equal(currencyMatches_cor({monedas:['USD','MXN']},'EUR'),false);
  assert.equal(currencyMatches_cor({monedas:['USD','MXN']},'MXN'),true);
  assert.equal(advisorMatches_cor({id_asesor:11,asesor:'AA'},11),true);
  assert.equal(advisorMatches_cor({id_asesor:22,asesor:'AA'},11),false);
  const multiple=assignAdvisor_cor({ppns:'P1'},new Map([['P1',new Map([[11,'AA'],[22,'BB']])]]));
  assert.equal(multiple.id_asesor,null);
  assert.equal(multiple.asesores_distintos,2);
});
