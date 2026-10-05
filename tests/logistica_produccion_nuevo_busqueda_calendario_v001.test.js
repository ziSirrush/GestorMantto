'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'modules/logistica-produccion/logistica-produccion.js'),'utf8');
const css=fs.readFileSync(path.join(root,'modules/logistica-produccion/logistica-produccion.css'),'utf8');
const repo=fs.readFileSync(path.join(root,'backend/src/modules/logistica-produccion/logistica-produccion.repository.js'),'utf8');
const service=fs.readFileSync(path.join(root,'backend/src/modules/logistica-produccion/logistica-produccion.service.js'),'utf8');
const loader=fs.readFileSync(path.join(root,'core/module-loader.js'),'utf8');

test('Crear nuevo cambia Proyecto a buscador con lista filtrable',()=>{
  assert.match(js,/id="lp-manual-project-search" type="search"/);
  assert.match(js,/placeholder="Buscar proyecto o PPNS\.\.\."/);
  assert.match(js,/id="lp-manual-project-list" class="lp-options lp-picker-options lp-project-options"/);
  assert.match(js,/project:\{input:'lp-manual-project-search'/);
  assert.match(js,/\['project','advisor','supervisor'\]\.forEach\(bindManualPicker\)/);
});

test('La busqueda de Proyecto filtra por proyecto o PPNS en backend',()=>{
  assert.match(repo,/l\.proyecto LIKE \? OR l\.id_ppns LIKE \?/);
  assert.match(repo,/params\.push\(like,like\)/);
  assert.match(js,/manual\/proyectos/);
});

test('Proyectos ya registrados se muestran pero no pueden seleccionarse',()=>{
  assert.match(js,/Ya registrado en PVO-Producción/);
  assert.match(js,/disabled aria-disabled="true"/);
  assert.match(js,/kind==='project'&&Number\(row\.ya_registrado\)===1/);
});

test('Fechas capturables en Crear nuevo usan calendario nativo',()=>{
  assert.match(js,/id="lp-pvo-date" type="date"/);
  assert.match(js,/id="lp-visit-date" type="date"/);
  assert.match(js,/id="lp-cubes-date" type="date"/);
  assert.match(js,/id="lp-new-doc-date" type="date"/);
  assert.match(js,/id="lp-new-pay-date" type="date"/);
  assert.match(js,/fecha_pvo:\$\('lp-pvo-date'\)\?\.value\|\|null/);
  assert.match(js,/fecha_pvo_fl:\$\('lp-visit-date'\)\?\.value\|\|null/);
  assert.match(js,/fecha_cubos:\$\('lp-cubes-date'\)\?\.value\|\|null/);
  assert.match(js,/fecha_envio_docs_fabrica:\$\('lp-new-doc-date'\)\?\.value\|\|null/);
  assert.match(js,/fecha_envio_pago_fabrica:\$\('lp-new-pay-date'\)\?\.value\|\|null/);
  assert.match(css,/input\[type="date"\]/);
});

test('Backend valida y guarda las cinco fechas opcionales al crear',()=>{
  assert.match(service,/optionalDate\(input\.fecha_pvo,'fecha_pvo'\)/);
  assert.match(service,/optionalDate\(input\.fecha_pvo_fl,'fecha_pvo_fl'\)/);
  assert.match(service,/optionalDate\(input\.fecha_cubos,'fecha_cubos'\)/);
  assert.match(service,/optionalDate\(input\.fecha_envio_docs_fabrica,'fecha_envio_docs_fabrica'\)/);
  assert.match(service,/optionalDate\(input\.fecha_envio_pago_fabrica,'fecha_envio_pago_fabrica'\)/);
  assert.match(service,/fecha_pvo:fechaPvo/);
  assert.match(service,/fecha_pvo_fl:fechaVisita/);
  assert.match(service,/fecha_cubos:fechaCubos/);
  assert.match(service,/fecha_envio_docs_fabrica:fechaDocs/);
  assert.match(service,/fecha_envio_pago_fabrica:fechaPago/);
});

test('PVO Visita y Cubos dejan de ser solo lectura en Crear nuevo',()=>{
  assert.doesNotMatch(js,/Fecha PVO<input id="lp-manual-pvo" type="text" value="—" readonly>/);
  assert.doesNotMatch(js,/Fecha de Visita<input id="lp-manual-visita" type="text" value="—" readonly>/);
  assert.doesNotMatch(js,/Fecha entrega cubos<input id="lp-manual-cubos" type="text" value="—" readonly>/);
  assert.match(js,/Estatus Logística<input id="lp-manual-log-status" type="text" value="—" readonly>/);
});

test('Cache bust final Fase 4 se actualiza en todas las rutas PVO-Produccion',()=>{
  const matches=loader.match(/20261005-pvo-cierre-fase4-v001/g)||[];
  assert.equal(matches.length,10);
});
