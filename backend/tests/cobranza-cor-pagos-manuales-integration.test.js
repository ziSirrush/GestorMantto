'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/modules/cobranza-cor/cobranza-cor-pagos-manuales.integration.js'), 'utf8');
function fixture(env = {}, permission = true, repository = {}, facturaGroups = () => []) {
  const module = { exports: {} }, calls = [];
  const context = { process: { env }, module, require(name) {
    if (name.endsWith('pagos-manuales.service')) return { FLAG:'BLT_COBRANZA_COR_PAGOS_MANUALES_V1', createService_cor: () => ({ crear:async p => ({ok:true,...p}) }) };
    if (name.endsWith('cobranza-cor.repository')) return repository;
    if (name.endsWith('cobranza-cor.service')) return { buildFacturaGroups_cor:facturaGroups };
    if (name.endsWith('effective-permission.service')) return { hasEffectivePermission:async (uid, code) => { calls.push([uid,code]); return permission; } };
    throw Error(name);
  } };
  vm.runInNewContext(source, context);
  return { api:module.exports, calls };
}
const flag = 'BLT_COBRANZA_COR_PAGOS_MANUALES_V1';
const code = 'COBRANZA_ESTADOS_CUENTA_TEST.EDITAR'; // fixture, not a production permission
const context = { dominio:'CORELLIAN', actor_user_id:8, effective_user_id:8, acceso_puerta:true };
test('permiso no inventado: requiere bandera, codigo real configurado y actor efectivo',async()=>{
  for(const env of [{},{[flag]:'1'},{[flag]:'1',BLT_COBRANZA_COR_EDICION_PERMISSION:'COBRANZA_ESTADOS_CUENTA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'}]){
    const f=fixture(env); assert.equal(await f.api.canEdit_cor({actor:8,informationAccess:context}),false); assert.equal(f.calls.length,0);
  }
  const f=fixture({[flag]:'1',BLT_COBRANZA_COR_EDICION_PERMISSION:code});
  assert.equal(await f.api.canEdit_cor({actor:8,informationAccess:context}),true);
  assert.equal(f.calls[0][1],code);
  assert.equal(await f.api.canEdit_cor({actor:8,informationAccess:{...context,effective_user_id:9}}),false);
  const denied=fixture({[flag]:'1',BLT_COBRANZA_COR_EDICION_PERMISSION:code},false);
  assert.equal(await denied.api.canEdit_cor({actor:8,informationAccess:context}),false);
});
test('historial se obtiene por factura sin NS y fechas omiten contramovimientos y originales revertidos',async()=>{
  const f=fixture();
  const movements=await f.api.listMovements_cor({query:async(sql,params)=>{
    assert.match(sql,/JOIN cobranza_facturas_cor/); assert.doesNotMatch(sql,/cobranza_pagos_cor|id_pp/); assert.equal(params[0],'P1');
    return [[{id_rel_pago:1,id_factura_cor:4,importe_aplicado:'10',origen_registro:'MANUAL',estatus_pago:'Pagado',fecha_pago:'2026-11-24'},
      {id_rel_pago:2,id_factura_cor:4,importe_aplicado:'-10',origen_registro:'MANUAL',estatus_pago:'Devuelto',id_rel_pago_origen:1},
      {id_rel_pago:3,id_factura_cor:4,importe_aplicado:'2',origen_registro:'MANUAL',estatus_pago:'Parcial',fecha_pago:'2026-11-26'}]];
  }},'P1');
  assert.equal(movements[0].bloqueado,true); assert.equal(movements[1].bloqueado,true); assert.equal(movements[2].bloqueado,false);
  const refs=f.api.dateReferences_cor(movements);
  assert.equal(refs.payments.length,1); assert.equal(refs.payments[0].id_pago_cor,3);
});
test('selector excluye pagadas, canceladas y duplicados; excedente no cambia saldo',()=>{
  const {api}=fixture();
  const row={total:100,importe_pagado:25,moneda:'USD',duplicados_consolidados:0,estatus_factura:'Parcial',saldo:75};
  assert.equal(api.invoiceFields_cor(row,{}).puede_recibir_pago,true);
  assert.equal(api.invoiceFields_cor(row,{estatus_factura_origen:'Cancelada'}).puede_recibir_pago,false);
  assert.equal(api.invoiceFields_cor({...row,duplicados_consolidados:1},{}).puede_recibir_pago,false);
  const credit=api.invoiceFields_cor({...row,importe_pagado:110,estatus_factura:'Pagado',saldo:0},{});
  assert.equal(credit.saldo_a_favor,10);assert.equal(credit.saldo,0);assert.equal(credit.puede_recibir_pago,false);
});
test('modo deshabilitado conserva ruta legacy; habilitado bloquea mutaciones antiguas',()=>{
  let next=0;
  fixture().api.rejectLegacyIfEnabled_cor({}, {},()=>{next++;});
  assert.equal(next,1);
  let status;fixture({[flag]:'1'}).api.rejectLegacyIfEnabled_cor({}, {status:n=>{status=n;return {json:()=>{}};}},()=>{next++;});
  assert.equal(status,409);assert.equal(next,1);
});

test('conciliacion solo muestra importes internos por PPNS y moneda; BG desconocida no equivale a cero',async()=>{
  const events=[];
  const connection={
    async query(sql){events.push(sql);if(sql.startsWith('SELECT id_factura_cor'))return [[
      {id_factura_cor:1,ppns:'P1',moneda:'USD',pagado:'10.00'},
      {id_factura_cor:2,ppns:'P1',moneda:'MXN',pagado:'20.00'},
      {id_factura_cor:3,ppns:'P2',moneda:'MXN',pagado:'50.00'}]];
      return [[]];},
    async commit(){events.push('commit');},
    async rollback(){events.push('rollback');},
    release(){events.push('release');}
  };
  const repo={getConnection_cor:async()=>connection,listEstadosCuenta_cor:async()=>[{ppns:'P1',proyecto:'Proyecto',cliente:'Cliente'}]};
  const groups=rows=>rows.map(row=>({row,applied:Number(row.pagado),duplicates:0}));
  let result;
  const res={json:value=>{result=value;return value;}};
  await fixture().api.conciliacion_cor({},res,err=>{throw err;});
  assert.equal(result.habilitado,false);assert.equal(events.length,0);
  const f=fixture({[flag]:'1'},true,repo,groups);
  await f.api.conciliacion_cor({informationAccess:{dominio:'CORELLIAN',acceso_dominio_completo:true}},res,err=>{throw err;});
  assert.equal(result.habilitado,true);assert.equal(result.bg_disponible,false);assert.equal(result.data.length,2);
  assert.equal(result.data.find(row=>row.moneda==='USD').aplicado,'10.00');
  assert.equal(result.data.find(row=>row.moneda==='MXN').aplicado,'20.00');
  assert.equal(result.data[0].total_bg,null);assert.equal(result.data[0].diferencia,null);
  assert.equal(events.at(-1),'release');assert.equal(events.at(-2),'commit');
});
