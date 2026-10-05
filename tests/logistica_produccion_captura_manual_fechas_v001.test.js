'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

Object.assign(process.env,{
  DB_HOST:'127.0.0.1',DB_PORT:'3306',DB_USER:'unit',DB_PASSWORD:'unit',DB_NAME:'unit',DB_SSL:'false'
});

const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const frontend=read('modules/logistica-produccion/logistica-produccion.js');
const repository=read('backend/src/modules/logistica-produccion/logistica-produccion.repository.js');
const serviceSource=read('backend/src/modules/logistica-produccion/logistica-produccion.service.js');
const syncSource=read('backend/src/modules/logistica-produccion/logistica-produccion-sync.service.js');
const loader=read('core/module-loader.js');
const migration=read('sql/20261005_LOGISTICA_PRODUCCION_CAPTURA_MANUAL_FECHAS_V001.sql');
const {decorate,compareCapturedDate}=require('../backend/src/modules/logistica-produccion/logistica-produccion.service');

test('alta y detalle capturan las cinco fechas mediante calendarios',()=>{
  for(const id of ['lp-pvo-date','lp-visit-date','lp-cubes-date','lp-new-doc-date','lp-new-pay-date']){
    assert.match(frontend,new RegExp(`id="${id}" type="date"`));
  }
  assert.match(frontend,/fecha_pvo:\$\('lp-pvo-date'\)\?\.value\|\|null/);
  assert.match(frontend,/fecha_pvo_fl:\$\('lp-visit-date'\)\?\.value\|\|null/);
  assert.match(frontend,/fecha_cubos:\$\('lp-cubes-date'\)\?\.value\|\|null/);
});

test('backend persiste y permite editar las tres fechas operativas manuales',()=>{
  assert.match(serviceSource,/optionalDate\(input\.fecha_pvo,'fecha_pvo'\)/);
  assert.match(serviceSource,/optionalDate\(input\.fecha_pvo_fl,'fecha_pvo_fl'\)/);
  assert.match(serviceSource,/optionalDate\(input\.fecha_cubos,'fecha_cubos'\)/);
  assert.match(serviceSource,/const allowed=\[[^\]]*'fecha_pvo'[^\]]*'fecha_pvo_fl'[^\]]*'fecha_cubos'/);
  assert.equal(serviceSource.includes("const MODES=Object.freeze(['SEMI_AUTOMATICO','MANUAL'])"),false);
  assert.equal(syncSource.includes("new Set(['SEMI_AUTOMATICO', 'MANUAL'])"),false);
});

test('listado y filtros usan las fechas capturadas, no sustituciones desde las fuentes',()=>{
  assert.match(repository,/const pvoExpr='p\.fecha_pvo'/);
  assert.match(repository,/COALESCE\(p\.fecha_pvo_fl,''\)/);
  assert.match(repository,/COALESCE\(p\.fecha_cubos,''\)/);
  assert.equal(frontend.includes('value="fechas_desactualizadas"'),false);
  assert.equal(frontend.includes('FECHAS_FUENTE_DIFERENTES'),false);
});

test('la comparacion conserva la captura y solo clasifica la referencia actual',()=>{
  assert.equal(compareCapturedDate('2026-10-05','2026-10-05','log_ops.pvo').estado,'COINCIDE');
  assert.equal(compareCapturedDate('2026-10-05','2026-10-06','log_ops.pvo').estado,'DIFERENTE');
  assert.equal(compareCapturedDate('2026-10-05','2026-10-05, 2026-10-06','ins_fl.fecha_visita').estado,'FUENTE_MULTIPLE');

  const row=decorate({
    id_log_ops:9,ppns:'PP-1',ppns_logistica:'PP-1',proyecto_logistica:'Proyecto',
    fecha_pvo:'2026-10-05',fecha_pvo_logistica:'2026-10-06',
    fecha_pvo_fl:'2026-10-07',fechas_visita:'2026-10-07',
    fecha_cubos:'2026-10-08',fechas_cubos_fuente:'2026-10-09',
    cpvo_count:1,archivos_count:1,visita_count:1,cubos_count:1
  });
  assert.equal(row.fecha_pvo,'2026-10-05');
  assert.equal(row.comparacion_fechas.fecha_pvo.estado,'DIFERENTE');
  assert.equal(row.comparacion_fechas.fecha_visita.estado,'COINCIDE');
  assert.equal(row.comparacion_fechas.fecha_cubos.estado,'DIFERENTE');
  assert.equal(row.indicadores.some(item=>item.codigo==='FECHAS_FUENTE_DIFERENTES'),false);
});

test('comparacion se presenta en Detalle y no en Main ni en alta',()=>{
  assert.match(frontend,/function detailSummaryTable\(p,fl\)/);
  assert.match(frontend,/comparisonLabel\('fecha_pvo'\)/);
  assert.match(frontend,/const row=state\.manual\.selected\.project\|\|fallback\|\|null,isDetail=Boolean\(\$\('lp-edit-form'\)\)/);
  assert.match(frontend,/Captura manual\. Todas las fechas se seleccionan desde calendario\./);
  assert.equal(frontend.includes('Fechas distintas de las fuentes'),false);
});

test('Estatus Produccion se obtiene y valida en catalogo_general con el contrato solicitado',()=>{
  assert.match(repository,/area:'Logistica',elemento:'Estatus Produccion'/);
  assert.match(repository,/FROM catalogo_general\s+WHERE activo=1 AND area=\? AND elemento=\?/);
  assert.match(repository,/WHERE id_catalogo=\? AND activo=1 AND area=\? AND elemento=\?/);
  assert.match(frontend,/data\.estatus_produccion/);
});

test('migracion conserva fechas univocas y retira el enum semiautomatico',()=>{
  assert.match(migration,/p\.fecha_pvo=COALESCE/);
  assert.match(migration,/COUNT\(DISTINCT STR_TO_DATE/);
  assert.match(migration,/p\.modo_registro='MANUAL'/);
  assert.match(migration,/ENUM\('MANUAL'\)/);
  assert.match(migration,/sin modificar log_ops ni ins_fl/i);
});

test('cache bust se actualiza para las cinco rutas del modulo',()=>{
  assert.equal((loader.match(/20261005-pvo-captura-manual-fechas-v001/g)||[]).length,10);
});
