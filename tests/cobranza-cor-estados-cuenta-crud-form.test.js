'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');

const ROOT=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(ROOT,relative),'utf8');

test('Estados de Cuenta agrega Crear nuevo al Main y Editar al detalle',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta.js');
  assert.match(frontend,/id="ccor-ec-create-new"/);
  assert.match(frontend,/id="ccor-ec-edit"/);
  assert.match(frontend,/\{mode:'create'\}/);
  assert.match(frontend,/\{mode:'edit',ppns:normalizedPpns\}/);
});

test('Formulario Crear Editar permanece dentro del mismo modulo de Estados de Cuenta',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  assert.match(frontend,/const ROUTE='cobranza-estados-cuenta'/);
  assert.match(frontend,/state\.mode==='edit'/);
  assert.match(frontend,/\/formulario'/);
  assert.match(frontend,/method:editing\?'PUT':'POST'/);
  assert.doesNotMatch(frontend,/cobranza-estados-cuenta-crear-nuevo/);
});

test('Editar precarga todos los campos financieros actuales de FUENTE',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  const required=[
    'condicion','porcentaje','anio_proyecto','moneda','subtotal','iva','total','factura','pago_total',
    'estatus_factura','fecha_pago','fecha_vencimiento','dias_vencimiento','estimado_pago','estatus_vencimiento',
    'fecha_programada','fecha_notificada','estatus_hito'
  ];
  required.forEach(field=>{
    assert.ok(
      frontend.includes(`'${field}'`) || frontend.includes(`"${field}"`),
      `Falta campo ${field}`
    );
  });
});

test('Backend expone alta, formulario de edicion y PUT por PPNS',()=>{
  const routes=read('backend/src/modules/cobranza-cor/cobranza-cor.routes.js');
  const service=read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  const repository=read('backend/src/modules/cobranza-cor/cobranza-cor.repository.js');
  assert.match(routes,/get\('\/estados-cuenta\/crear-nuevo\/catalogo'/);
  assert.match(routes,/post\('\/estados-cuenta'/);
  assert.match(routes,/get\('\/estados-cuenta\/:ppns\/formulario'/);
  assert.match(routes,/put\('\/estados-cuenta\/:ppns'/);
  assert.match(service,/async function formularioEstadoCuenta_cor/);
  assert.match(service,/async function crearEstadoCuenta_cor/);
  assert.match(service,/async function actualizarEstadoCuenta_cor/);
  assert.match(repository,/equipos: 'cobranza_equipos_cor'/);
  assert.match(repository,/updateFuenteEstadoCuenta_cor/);
  assert.match(repository,/updateEquipoEstadoCuenta_cor/);
});

test('Hitos y equipos se relacionan por PPNS sin reintroducir Indice',()=>{
  const files=[
    read('backend/src/modules/cobranza-cor/cobranza-cor.repository.js'),
    read('backend/src/modules/cobranza-cor/cobranza-cor.service.js'),
    read('modules/cobranza-cor/cobranza-cor-estados-cuenta.js'),
    read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js')
  ].join('\n');
  assert.match(files,/FROM ins_fl fl/);
  assert.match(files,/FROM log_ops lo/);
  assert.match(files,/cobranza_equipos_cor/);
  assert.doesNotMatch(files,/cobranza_indice_cor|id_indice_cor|idIndiceCor/);
});

test('Cache bust carga Estados de Cuenta y su formulario CRUD',()=>{
  const loader=read('core/module-loader.js');
  const index=read('index.html');
  assert.match(loader,/cobranza-cor-estados-cuenta\.js\?v=[A-Za-z0-9._-]+/);
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.js\?v=[A-Za-z0-9._-]+/);
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.css\?v=[A-Za-z0-9._-]+/);
  assert.match(index,/core\/module-loader\.js\?v=[A-Za-z0-9._-]+/);
});


test('Fondo de garantia vive en General y aplica una sola configuracion a todos los hitos',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  const service=read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  const repository=read('backend/src/modules/cobranza-cor/cobranza-cor.repository.js');
  assert.match(frontend,/id=\"ccor-ec-form-fondo-garantia\"/);
  assert.match(frontend,/id=\"ccor-ec-form-porcentaje-fondo-garantia\"/);
  assert.match(frontend,/Aplica por igual a todos los hitos activos/);
  assert.doesNotMatch(frontend,/data-hito-field=\"fondo_garantia\"/);
  assert.doesNotMatch(frontend,/data-hito-field=\"porcentaje_fondo_garantia\"/);
  assert.match(frontend,/fondo_garantia:fondoGarantia/);
  assert.match(frontend,/porcentaje_fondo_garantia:porcentajeFondoGarantia/);
  assert.match(frontend,/supera el tope de 10%/);
  assert.match(service,/FONDO_GARANTIA_AUTORIZACION_REQUERIDA/);
  assert.match(service,/porcentajeFondoGarantia > 0\.10/);
  assert.match(service,/fondo_garantia: input\.fondo_garantia/);
  assert.match(service,/porcentaje_fondo_garantia: input\.porcentaje_fondo_garantia/);
  assert.match(repository,/'fondo_garantia'/);
  assert.match(repository,/'porcentaje_fondo_garantia'/);
});
