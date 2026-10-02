'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');

test('Fase 4 crea una tabla de Facturas compartida por Hito y Aditiva',()=>{
  const repository=read('backend/src/modules/cobranza-cor/cobranza-cor.repository.js');
  const service=read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  assert.match(repository,/facturas: 'cobranza_facturas_cor'/);
  assert.match(repository,/tipo_concepto = 'HITO'/);
  assert.match(repository,/tipo_concepto = 'ADITIVA'/);
  assert.match(repository,/getHitoFacturable_cor/);
  assert.match(repository,/getAditivaFacturable_cor/);
  assert.match(service,/tipo_concepto: input\.tipo_concepto/);
  assert.match(service,/id_fuente_cor: input\.tipo_concepto === 'HITO'/);
  assert.match(service,/id_aditiva_cor: input\.tipo_concepto === 'ADITIVA'/);
});

test('Detalle lista y permite crear Facturas solo en Estado de Cuenta creado',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta.js');
  const form=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  const routes=read('backend/src/modules/cobranza-cor/cobranza-cor.routes.js');
  assert.match(frontend,/id="ccor-ec-factura-nueva"/);
  assert.match(frontend,/id="ccor-ec-factura-form"/);
  assert.match(frontend,/renderFacturasSection_cor\(detail\)/);
  assert.match(routes,/post\('\/estados-cuenta\/:ppns\/facturas'/);
  assert.doesNotMatch(form,/ccor-ec-factura-nueva|ccor-ec-factura-form/);
});

test('Factura del Hito en Crear Editar se alimenta de relaciones y sigue solo lectura',()=>{
  const service=read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  const form=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  assert.match(service,/attachFacturaRefsToHitos_cor/);
  assert.match(service,/listFacturasEstadoCuenta_cor\(connection, ppns\)/);
  assert.match(form,/factura',row\.factura,'maxlength="150" readonly/);
});

test('Estatus de Factura usa catalogo cerrado y estatus de cobranza queda reservado a Pagos',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta.js');
  const service=read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  assert.match(frontend,/No pagado/);
  assert.match(frontend,/Pagado/);
  assert.match(service,/normalizeEstatusFacturaRegistro_cor/);
  assert.match(service,/estatus_cobranza: null/);
  assert.match(frontend,/El estatus de cobranza no se calcula automáticamente desde las asignaciones de Pagos/);
});

test('Pagos se mantiene separado del CRUD de Facturas',()=>{
  const repository=read('backend/src/modules/cobranza-cor/cobranza-cor.repository.js');
  const service=read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta.js');
  assert.doesNotMatch(repository,/cobranza_pagos_cor/);
  assert.doesNotMatch(service,/cobranza_pagos_cor/);
  assert.match(frontend,/ccor-ec-pagos-table/);
});

test('Cache actualiza Detalle y conserva formulario F3',()=>{
  const loader=read('core/module-loader.js');
  const index=read('index.html');
  assert.match(loader,/cobranza-cor-estados-cuenta\.css\?v=20261001-cobranza-pagos-detalle-v001/);
  assert.match(loader,/cobranza-cor-estados-cuenta\.js\?v=20261002-pagos-idpp-factura-v001/);
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.js\?v=20261002-foco-hitos-v001/);
  assert.match(index,/core\/module-loader\.js\?v=20261002-pagos-idpp-factura-v001/);
});
