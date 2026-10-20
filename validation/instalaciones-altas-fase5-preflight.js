'use strict';
/* BLT NOW | 2026-10-20 | ALTAS FASE 5 V001
 * QA estructural de solo lectura para ejecutar DESPUES de aplicar F1-F5 en local.
 * No requiere BD, no toca red, no instala nada y no modifica archivos.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const needed=[
  'backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js',
  'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas.service.js',
  'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-origin.js',
  'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-sync-guard.js',
  'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-formula-guard.js',
  'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-formulas.js',
  'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-persist.js',
  'modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js',
  'modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.css',
  'modules/instalaciones-administracion/instalaciones-administracion-altas-formulas_cor.js',
  'backend/src/routes/ins-fl.routes.js',
  'backend/src/jobs/instalacionesAdministracionCalculados.job.js',
  'core/module-loader.js','service-worker.js'
];
for(const file of needed)assert.ok(fs.existsSync(path.join(base,file)),`Falta componente F1-F5: ${file}`);
const admin=read(needed[0]),sync=read(needed[10]);
assert.match(admin,/router\.post\('\/administracion\/altas', \.+accessGuard_cor/);
assert.equal((admin.match(/protectHumanFormulasLegacyCor,/g)||[]).length,4);
assert.match(sync,/requireInsFlIntegration, protectManualAltasCor, syncWithHeldAltasLockCor/);
assert.match(sync,/bltnowInsFlGuardReleaseCor/);
const f3Backend=read(needed[5]),f3Frontend=read(needed[9]);
assert.equal(f3Backend,f3Frontend,'Las formulas F3 del navegador y backend deben ser la misma implementacion.');
const loader=read('core/module-loader.js');
const css='instalaciones-administracion-altas-captura_cor.css?v=20261020-altas-f4-v001';
const js='instalaciones-administracion-altas-captura_cor.js?v=20261020-altas-f4-v001';
const formula='instalaciones-administracion-altas-formulas_cor.js?v=20261020-altas-f3-v001';
for(const value of [css,js,formula]) {
  const occurrences=loader.split(value).length-1;
  assert.equal(occurrences,1,`Carga de recursos inexistente o duplicada: ${value}`);
}
assert.match(read('service-worker.js'),/const SERVICE_WORKER_VERSION = '20261020-instalaciones-altas-f4-v001';/);
const constants=require(path.join(base,'backend/src/modules/instalaciones-administracion/instalaciones-administracion.constants.js'));
assert.equal(constants.ALL_OPERATIONAL_FIELDS_COR.length,93);
console.log('OK: F1-F5 enlazadas, 93 campos, formularios Ghost, formulas con paridad, Guard y sincronizacion.');
console.log('SOLO LECTURA: falta validacion presencial E2E en BD restaurada y promocion autorizada.');
