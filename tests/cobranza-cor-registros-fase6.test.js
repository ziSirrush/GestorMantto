'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');

function loadService(overrides={}){
  const calls=[];
  const connection={
    beginTransaction:async()=>calls.push('begin'),
    commit:async()=>calls.push('commit'),
    rollback:async()=>calls.push('rollback'),
    release:()=>calls.push('release')
  };
  const estadoCuentaService={
    detalleEstadoCuenta_cor:async(ppns,scope)=>{
      calls.push(['scope',ppns,scope]);
      return {proyecto:{ppns:'P100'}};
    }
  };
  const repository={
    getConnection_cor:async()=>connection,
    getHitoFacturable_cor:async(_connection,ppns,id)=>({id_fuente_cor:id,ppns,moneda:'MXN'}),
    getAditivaFacturable_cor:async(_connection,ppns,id)=>({id_aditiva_cor:id,ppns,moneda:'USD'}),
    ...(overrides.repository||{})
  };
  const registrosRepository={
    lockFactura_cor:async()=>({id_factura_cor:10,total:116}),
    updateFactura_cor:async(_connection,ppns,id,record)=>calls.push(['updateFactura',ppns,id,record]),
    recalcFacturaEstatus_cor:async(_connection,id)=>{calls.push(['recalc',id]);return 'No pagado';},
    deleteFacturaRelations_cor:async(_connection,id)=>{calls.push(['deleteFacturaRelations',id]);return 2;},
    deleteFactura_cor:async(_connection,ppns,id)=>{calls.push(['deleteFactura',ppns,id]);return 1;},
    lockPago_cor:async()=>({id_pago_cor:20,no_factura:'CFV-1',complemento_pago:'CP-1',fecha_complemento_pago:'2026-10-01',importe_complemento_pago:-100}),
    sumPagoAplicado_cor:async()=>50,
    updatePago_cor:async(_connection,id,record)=>calls.push(['updatePago',id,record]),
    listPagoFacturasForUpdate_cor:async()=>[{id_factura_cor:10,total:60},{id_factura_cor:11,total:40}],
    deletePagoRelations_cor:async(_connection,id)=>{calls.push(['deletePagoRelations',id]);return 2;},
    deletePago_cor:async(_connection,id)=>{calls.push(['deletePago',id]);return 1;},
    ...(overrides.registrosRepository||{})
  };
  const module={exports:{}};
  vm.runInNewContext(read('backend/src/modules/cobranza-cor/cobranza-cor-registros.service.js'),{
    module,
    require:(name)=>{
      if(name.endsWith('cobranza-cor.service')) return estadoCuentaService;
      if(name.endsWith('cobranza-cor.repository')) return repository;
      if(name.endsWith('cobranza-cor-registros.repository')) return registrosRepository;
      throw new Error('Unexpected require '+name);
    },
    Date,Number,String,Array,Object,Math,Map,Set,Error
  });
  return {service:module.exports,calls,connection,repository,registrosRepository};
}

test('editar Factura valida PPNS/concepto, recalcula estatus y confirma en una transaccion',async()=>{
  const {service,calls}=loadService();
  const result=await service.actualizarFactura_cor(' p100 ',10,{
    tipo_concepto:'HITO',id_concepto:5,factura:'CFV-10',fecha_factura:'2026-10-01',subtotal:'100',iva:'16',fecha_vencimiento:'2026-10-31'
  },{dominio:'CORELLIAN'},77);
  assert.equal(result.ok,true);
  assert.equal(result.ppns,'P100');
  const update=calls.find(item=>Array.isArray(item)&&item[0]==='updateFactura');
  assert.ok(update);
  assert.equal(update[3].total,116);
  assert.equal(update[3].id_fuente_cor,5);
  assert.equal(update[3].id_aditiva_cor,null);
  assert.equal(update[3].updated_by,77);
  const updateIndex=calls.indexOf(update);
  const recalcIndex=calls.findIndex(item=>Array.isArray(item)&&item[0]==='recalc');
  const commitIndex=calls.indexOf('commit');
  assert.ok(updateIndex<recalcIndex&&recalcIndex<commitIndex);
  assert.equal(calls.includes('rollback'),false);
});

test('eliminar Factura limpia primero relaciones y luego elimina solo el registro solicitado',async()=>{
  const {service,calls}=loadService();
  const result=await service.eliminarFactura_cor('P100',10,{dominio:'CORELLIAN'});
  assert.equal(result.ok,true);
  assert.equal(result.relaciones_eliminadas,2);
  const relIndex=calls.findIndex(item=>Array.isArray(item)&&item[0]==='deleteFacturaRelations');
  const facturaIndex=calls.findIndex(item=>Array.isArray(item)&&item[0]==='deleteFactura');
  const commitIndex=calls.indexOf('commit');
  assert.ok(relIndex<facturaIndex&&facturaIndex<commitIndex);
});

test('editar Pago falla cerrado si el nuevo importe es menor a lo ya aplicado',async()=>{
  const {service,calls}=loadService({registrosRepository:{sumPagoAplicado_cor:async()=>80}});
  await assert.rejects(
    service.actualizarPago_cor('P100',20,{importe_complemento_pago:'-70'},{dominio:'CORELLIAN'}),
    error=>Number(error.statusCode)===400
  );
  assert.equal(calls.includes('rollback'),true);
  assert.equal(calls.some(item=>Array.isArray(item)&&item[0]==='updatePago'),false);
});

test('eliminar Pago limpia relaciones y recalcula Facturas antes de commit',async()=>{
  const {service,calls}=loadService();
  const result=await service.eliminarPago_cor('P100',20,{dominio:'CORELLIAN'});
  assert.equal(result.ok,true);
  assert.equal(result.relaciones_eliminadas,2);
  assert.match(result.sincronizacion_fuente,/Hoja SB/);
  const relIndex=calls.findIndex(item=>Array.isArray(item)&&item[0]==='deletePagoRelations');
  const pagoIndex=calls.findIndex(item=>Array.isArray(item)&&item[0]==='deletePago');
  const recalcIndexes=calls.flatMap((item,index)=>Array.isArray(item)&&item[0]==='recalc'?[index]:[]);
  const commitIndex=calls.indexOf('commit');
  assert.equal(recalcIndexes.length,2);
  assert.ok(relIndex<pagoIndex&&pagoIndex<recalcIndexes[0]&&recalcIndexes[1]<commitIndex);
});

test('rutas CRUD usan guardas existentes y se montan sin reemplazar el router Cobranza actual',()=>{
  const routes=read('backend/src/modules/cobranza-cor/cobranza-cor-registros.routes.js');
  for(const expected of [
    "router.put('/estados-cuenta/:ppns/facturas/:idFacturaCor'",
    "router.delete('/estados-cuenta/:ppns/facturas/:idFacturaCor'",
    "router.put('/estados-cuenta/:ppns/pagos/:idPagoCor'",
    "router.delete('/estados-cuenta/:ppns/pagos/:idPagoCor'"
  ]) assert.ok(routes.includes(expected));
  assert.match(routes,/\.\.\.requireEstadosCuentaCor, rejectViewerMutation_cor, controller/);
  const index=read('backend/src/routes/index.js');
  assert.match(index,/const cobranzaCorRoutes = require\('\.\.\/modules\/cobranza-cor\/cobranza-cor\.routes'\);/);
  assert.match(index,/const cobranzaCorRegistrosRoutes = require\('\.\.\/modules\/cobranza-cor\/cobranza-cor-registros\.routes'\);/);
  assert.match(index,/router\.use\('\/cobranza-cor', cobranzaCorRoutes\);[\s\S]*router\.use\('\/cobranza-cor', cobranzaCorRegistrosRoutes\);/);
});

test('frontend Fase 6 usa edicion y confirmacion inline sin modal ni cambio de ruta',()=>{
  const source=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-acciones.js');
  assert.match(source,/data-f6-edit/);
  assert.match(source,/data-f6-delete-confirm/);
  assert.match(source,/Confirmar eliminación/);
  assert.match(source,/data-f6-save/);
  assert.doesNotMatch(source,/window\.confirm/);
  assert.doesNotMatch(source,/<dialog|showModal\(|\bmodal\b/i);
  assert.doesNotMatch(source,/ManttoRouter\.go/);
  assert.match(source,/method:'PUT'/);
  assert.match(source,/method:'DELETE'/);
});

test('module-loader carga las acciones Fase 6 y conserva el modulo Pagos de Fase 3',()=>{
  const loader=read('core/module-loader.js');
  assert.match(loader,/cobranza-cor-estados-cuenta-acciones\.css\?v=20261002-cobranza-fase6-acciones-v001/);
  assert.match(loader,/cobranza-cor-estados-cuenta-acciones\.js\?v=20261002-cobranza-fase6-acciones-v001/);
  assert.match(loader,/'cobranza-pagos':\{css:/);
});
