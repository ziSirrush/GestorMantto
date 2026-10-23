'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_2_V001]
// Pruebas sin conexión a Aiven. Ningún permiso concede escritura por sí mismo.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.resolve(__dirname,'..');
const p=rel=>fs.readFileSync(path.join(base,rel),'utf8');
const contract=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants');
const perm=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.permissions');

test('F2: los siete permisos son distintos, y no reutilizan visual de módulos de consulta',()=>{
  const codes=[perm.MAIN_VISUAL,...perm.ALL_TABLE_PERMISSIONS];
  assert.equal(codes.length,7);
  assert.equal(new Set(codes).size,7);
  assert.deepEqual(Object.keys(perm.TABLE_PERMISSIONS),Object.keys(contract.TABLES_UNI));
  assert.ok(codes.every(v=>v.startsWith('COBRANZA_UNI_ADMINISTRACION_')));
  assert.ok(codes.filter(x=>x.endsWith('.EDITAR')).length===3);
});
test('F2: rutas administrativas GET protegidas por Guard UNITED',()=>{
  const routes=p('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js');
  assert.match(routes,/humanInformationGuard_gnral/);
  assert.match(routes,/groupingCode:\s*'COBRANZA_UNI'/);
  assert.match(routes,/domain:\s*'UNITED'/);
  assert.match(routes,/listEffectivePermissions/);
  assert.match(routes,/viewerContext\?\.active/);
  assert.match(routes,/router\.get\('\/contrato'/);
  assert.match(routes,/router\.get\('\/tablas\/:tabla\/acceso'/);
  // La ruta incorpora los PATCH de F4; los GET de F2 deben permanecer intactos.
  assert.match(routes,/router\.patch\('\/tablas\/gestion_credito\/registros/);
  const previous=p('backend/src/routes/cobranza-uni.routes.js');
  assert.match(previous,/router\.post\('\/sync', requireCobranzaUniIntegration/);
  assert.match(previous,/router\.use\('\/administracion', administracionUniRoutes\)/);
});
test('F2: politica de entrega protege el catalogo de permisos sin exigir archivos SQL ignorados',()=>{
  // BLT NOW excluye *.sql y validate-clean-tree rechaza esos archivos versionados.
  // Se verifica la seguridad del contrato JavaScript presente en un checkout limpio.
  assert.match(p('.gitignore'), /^\*\.sql\s*$/m);
  const routes=p('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js');
  const permissionSource=p('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.permissions.js');
  assert.match(permissionSource,/COBRANZA_UNI_ADMINISTRACION_ACCESO_VISUAL_MODULO/);
  assert.doesNotMatch(routes,/\bINSERT\s+INTO\s+(?:rol_permisos|usuario_permisos)\b/i);
  assert.doesNotMatch(routes,/\b(?:UPDATE|DELETE FROM)\s+(?:gestion_credito|detalle_mp_2026|pc)\b/i);
});
test('F2: selector mantiene el nombre y ruta de tablas reales, sin mutaciones en la interfaz',()=>{
  const js=p('modules/cobranza-uni/administracion/main/main.js');
  for(const table of Object.keys(contract.TABLES_UNI))assert.match(js,new RegExp(table));
  assert.match(js,/apiGet/);
  assert.doesNotMatch(js,/\bapiPost\b|\.patch\(|\bfetch\(/);
  assert.match(js,/can_view===true/);
  assert.match(js,/can_edit/);
  assert.match(js,/getViewUser/);
});
test('F2: el menu se oculta por defecto y requiere respuesta afirmativa del backend',()=>{
  const menu=p('modules/cobranza-uni/administracion/admin-menu.js');
  assert.match(menu,/visible\(false\)/);
  assert.match(menu,/result\?\.ok===true/);
  assert.match(menu,/some\(t=>t\?\.can_view===true\)/);
  assert.match(menu,/mantto:permissions-updated/);
});
