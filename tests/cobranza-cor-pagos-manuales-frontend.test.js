'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../modules/cobranza-cor/cobranza-cor-estados-cuenta.js'),'utf8');
const actions=fs.readFileSync(path.resolve(__dirname,'../modules/cobranza-cor/cobranza-cor-estados-cuenta-acciones.js'),'utf8');
const general=fs.readFileSync(path.resolve(__dirname,'../modules/cobranza-cor/cobranza-cor-pagos.js'),'utf8');
function fixture(){
  const form={dataset:{},hidden:true,innerHTML:'',querySelector:()=>null};
  const window={}, document={getElementById:id=>id==='ccor-ec-manual-form'?form:null};
  const anchor='  window.ManttoCobranzaCorEstadosCuenta=Object.freeze({init:init_cor,refresh:refresh_cor});';
  assert.ok(source.includes(anchor));
  vm.runInNewContext(source.replace(anchor,'  window.__test={renderPagosSection_cor,renderFacturasSection_cor,openManualForm_cor,state};\n'+anchor),{window,document});
  const ui=window.__test;
  const detail={proyecto:{ppns:'P1'},facturas:[
    {id_factura_cor:1,factura:'F-1',moneda:'USD',saldo:25,puede_recibir_pago:true},
    {id_factura_cor:2,factura:'F-2',moneda:'MXN',saldo:0,saldo_a_favor:5,puede_recibir_pago:false}],
    pagos_manuales:{habilitado:true,puede_editar:true,movimientos:[
      {id_rel_pago:5,id_factura_cor:1,factura:'F-1',moneda:'USD',importe_aplicado:10,fecha_pago:'2026-11-26',estatus_pago:'Parcial',bloqueado:false},
      {id_rel_pago:6,id_factura_cor:1,factura:'F-1',moneda:'USD',importe_aplicado:-10,estatus_pago:'Devuelto',bloqueado:true}
    ]}};
  ui.state.detail=detail;
  return {ui,detail,form};
}
test('Pagos manuales muestran historial, excedente y acciones solo en registros editables',()=>{
  const {ui,detail}=fixture();
  const html=ui.renderPagosSection_cor(detail);
  assert.match(html,/Saldo a favor/);
  assert.match(html,/data-ccor-manual-edit="5"/);
  assert.doesNotMatch(html,/data-ccor-manual-edit="6"/);
  assert.match(html,/-10\.00/);
  const readonly=ui.renderPagosSection_cor({...detail,pagos_manuales:{...detail.pagos_manuales,puede_editar:false}});
  assert.doesNotMatch(readonly,/data-ccor-manual-edit|data-ccor-manual-open/);
});
test('Crear nuevo solo permite facturas pendientes; editar conserva la factura y revertir exige motivo',()=>{
  const {ui,form}=fixture();
  ui.openManualForm_cor();
  assert.match(form.innerHTML,/F-1/);assert.doesNotMatch(form.innerHTML,/F-2/);
  assert.match(form.innerHTML,/Fecha de Pago/);assert.match(form.innerHTML,/TDC/);
  ui.openManualForm_cor({pagoId:5});
  assert.match(form.innerHTML,/select name="factura" required disabled/);
  ui.openManualForm_cor({pagoId:5,reverse:true});
  assert.match(form.innerHTML,/Cancelado/);assert.match(form.innerHTML,/Devuelto/);
  assert.match(form.innerHTML,/-\$10\.00|-\s*US\$10\.00|10\.00/);
  assert.doesNotMatch(form.innerHTML,/name="importe_aplicado"/);
});
test('Facturas y Pagos usan el mismo flujo, con conciliacion separada y BG no inventada',()=>{
  const {ui,detail}=fixture();
  const html=ui.renderFacturasSection_cor(detail);
  assert.match(html,/data-ccor-manual-mode="1"/);
  assert.match(html,/data-ccor-manual-eligible="1"/);
  assert.match(html,/A favor/);
  assert.match(actions,/data-ccor-manual-open/);
  assert.match(general,/API_PATH\+'\/conciliacion'/);
  assert.match(general,/BG pendiente de integrar/);
});
