'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(ROOT,relative),'utf8');

const routes=read('backend/src/modules/logistica-produccion/logistica-produccion.routes.js');
const controller=read('backend/src/modules/logistica-produccion/logistica-produccion.controller.js');
const service=read('backend/src/modules/logistica-produccion/logistica-produccion.service.js');
const repository=read('backend/src/modules/logistica-produccion/logistica-produccion.repository.js');

test('expone endpoint GET exacto por proyecto antes de /:id',()=>{
  const exact="router.get('/proyecto/:idProyecto/resumen',controller.projectSummary);";
  assert.ok(routes.includes(exact));
  assert.ok(routes.indexOf(exact)<routes.indexOf("router.get('/:id',controller.detail);"));
});

test('el endpoint nuevo queda protegido por requireAuth y no agrega mutaciones',()=>{
  assert.ok(routes.indexOf('router.use(requireAuth);')<routes.indexOf("router.get('/proyecto/:idProyecto/resumen'"));
  assert.equal(routes.includes("router.post('/proyecto/:idProyecto/resumen'"),false);
  assert.equal(routes.includes("router.patch('/proyecto/:idProyecto/resumen'"),false);
  assert.equal(routes.includes("router.delete('/proyecto/:idProyecto/resumen'"),false);
});

test('controller delega a projectSummary por idProyecto',()=>{
  assert.ok(controller.includes('projectSummary:wrap(req=>service.projectSummary(req.params.idProyecto))'));
});

test('repository relaciona exactamente PPNS y conserva una fila por id_log_ops',()=>{
  assert.ok(repository.includes('async function byPpnsExact(ppns)'));
  assert.ok(repository.includes('AND p.id_log_ops IS NOT NULL'));
  assert.ok(repository.includes('AND TRIM(l.id_ppns)=TRIM(?)'));
  assert.ok(repository.includes('ORDER BY l.id_log_ops ASC,p.id_produccion ASC'));
});

test('respuesta del detalle contiene solamente fechas, identificadores, etiqueta y archivos',()=>{
  assert.ok(service.includes('id_log_ops:Number(row.id_log_ops)'));
  assert.ok(service.includes('proyecto:decorated.proyecto'));
  assert.ok(service.includes('fecha_pvo:decorated.fecha_pvo'));
  assert.ok(service.includes('fechas_visita:decorated.instalaciones.fechas_visita'));
  assert.ok(service.includes('fechas_cubos:decorated.instalaciones.fechas_cubos'));
  assert.ok(service.includes('fecha_envio_docs_fabrica:row.fecha_envio_docs_fabrica||null'));
  assert.ok(service.includes('fecha_envio_pago_fabrica:row.fecha_envio_pago_fabrica||null'));
});

test('documentos del endpoint nuevo son de solo lectura',()=>{
  const start=service.indexOf('async function listReadOnlyFiles');
  const end=service.indexOf('async function projectSummary',start);
  const block=service.slice(start,end);
  assert.ok(block.includes('url_acceso'));
  assert.equal(block.includes('url_descarga'),false);
  assert.equal(block.includes('uploadPrivate_gnral'),false);
  assert.equal(block.includes('deleteBlob_gnral'),false);
});

test('no introduce SQL estructural ni tablas nuevas',()=>{
  const all=routes+controller+service+repository;
  assert.equal(/CREATE\s+TABLE/i.test(all),false);
  assert.equal(/ALTER\s+TABLE/i.test(all),false);
  assert.equal(/DROP\s+TABLE/i.test(all),false);
});
