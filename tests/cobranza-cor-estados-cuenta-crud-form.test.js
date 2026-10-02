
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const ROOT=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(ROOT,relative),'utf8');
const slice=(text,a,b)=>text.slice(text.indexOf(a),text.indexOf(b,text.indexOf(a)));

test('Estados de Cuenta agrega Crear nuevo al Main y Editar al detalle',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta.js');
  assert.match(frontend,/id="ccor-ec-create-new"/);assert.match(frontend,/id="ccor-ec-edit"/);
  assert.match(frontend,/\{mode:'create'\}/);assert.match(frontend,/\{mode:'edit',ppns:normalizedPpns\}/);
});

test('Formulario Crear Editar permanece dentro del mismo modulo de Estados de Cuenta',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  assert.match(frontend,/const ROUTE='cobranza-estados-cuenta'/);assert.match(frontend,/state\.mode==='edit'/);
  assert.match(frontend,/\/formulario/);assert.match(frontend,/method:editing\?'PUT':'POST'/);
  assert.doesNotMatch(frontend,/cobranza-estados-cuenta-crear-nuevo/);
});

test('Plantilla final mantiene campos propios del Hito y separa Facturas Pagos',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  const render=slice(frontend,'function renderHitos_cor','function syncTotalFromAmounts_cor');
  for(const field of ['condicion','porcentaje','anio_proyecto','moneda','subtotal','iva','total','factura','fecha_vencimiento','dias_vencimiento','estimado_pago','fecha_programada','fecha_notificada']) assert.match(render,new RegExp(field));
  for(const field of ['pago_total','estatus_factura','fecha_pago','estatus_vencimiento','estatus_hito']) assert.doesNotMatch(render,new RegExp(field));
});

test('Backend expone alta formulario edicion y PUT por PPNS',()=>{
  const routes=read('backend/src/modules/cobranza-cor/cobranza-cor.routes.js');
  const service=read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  const repository=read('backend/src/modules/cobranza-cor/cobranza-cor.repository.js');
  assert.match(routes,/get\('\/estados-cuenta\/crear-nuevo\/catalogo'/);assert.match(routes,/post\('\/estados-cuenta'/);
  assert.match(routes,/get\('\/estados-cuenta\/:ppns\/formulario'/);assert.match(routes,/put\('\/estados-cuenta\/:ppns'/);
  assert.match(service,/async function formularioEstadoCuenta_cor/);assert.match(service,/async function crearEstadoCuenta_cor/);assert.match(service,/async function actualizarEstadoCuenta_cor/);
  assert.match(repository,/equipos: 'cobranza_equipos_cor'/);assert.match(repository,/partidas: 'cobranza_partidas_cor'/);
});

test('Hitos y equipos se relacionan por PPNS sin reintroducir Indice',()=>{
  const files=[read('backend/src/modules/cobranza-cor/cobranza-cor.repository.js'),read('backend/src/modules/cobranza-cor/cobranza-cor.service.js'),read('modules/cobranza-cor/cobranza-cor-estados-cuenta.js'),read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js')].join('\n');
  assert.match(files,/FROM ins_fl fl/);assert.match(files,/FROM log_ops lo/);assert.match(files,/cobranza_equipos_cor/);
  assert.doesNotMatch(files,/cobranza_indice_cor|id_indice_cor|idIndiceCor/);
});

test('Cache bust carga Estados de Cuenta y formulario consolidado F3',()=>{
  const loader=read('core/module-loader.js');const index=read('index.html');
  assert.match(loader,/cobranza-cor-estados-cuenta\.js\?v=[A-Za-z0-9._-]+/);
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.js\?v=20261002-foco-hitos-v001/);
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.css\?v=20260930-cobranza-consolidacion-f3-v001/);
  assert.match(index,/core\/module-loader\.js\?v=20261002-foco-hitos-v001/);
});

test('Fondo de garantia vive en General y aplica una sola configuracion a todos los hitos',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  const service=read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  assert.match(frontend,/id="ccor-ec-form-fondo-garantia"/);assert.match(frontend,/id="ccor-ec-form-porcentaje-fondo-garantia"/);
  assert.match(service,/FONDO_GARANTIA_AUTORIZACION_REQUERIDA/);assert.match(service,/porcentajeFondoGarantia > 0\.10/);
});
