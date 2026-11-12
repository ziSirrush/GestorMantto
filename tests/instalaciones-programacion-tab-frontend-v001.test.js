'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../modules/instalaciones-programacion-personal/instalaciones-programacion-personal.js'),'utf8');
test('pestañas de INT9 controladas exclusivamente por permiso efectivo servidor',()=>{
 assert.match(src,/api\('\/accesos'\)/);
 assert.match(src,/tabRights=\{MONTADOR:data\?\.montadores===true,AJUSTADOR:data\?\.ajustadores===true\}/);
 assert.match(src,/Object\.entries\(TYPES\)\.filter\(\(\[type\]\)=>tabAllowed\(type\)\)/);
 assert.match(src,/TYPES\[node\.dataset\.tipo\] && tabAllowed\(node\.dataset\.tipo\)/);
});
test('falla cerrada al consultar permisos o al revocar durante sesion',()=>{
 assert.match(src,/Sin acceso a Montadores o Ajustadores/);
 assert.match(src,/No fue posible verificar permisos de pestañas/);
 assert.match(src,/state\.tabRights=null/);
 assert.match(src,/clearSensitiveView\(\);state\.ready=false;void init\(\)/);
});
