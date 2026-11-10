'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const html=read('index.html');
const router=read('core/router.js');
const shell=read('modules/experimental-ns/experimental-ns.js');
const front=read('modules/experimental-ns/equipos-parados/equipos-parados-ns.js');
const ROUTE='experimental-ns-equipos-parados';
const PERM='EXPERIMENTAL_NS_EQUIPOS_PARADOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

test('EP Experimental NS queda registrado en menu, vista y router',()=>{
  assert.match(html,new RegExp('data-route="'+ROUTE+'"'));
  assert.match(html,new RegExp('id="view-'+ROUTE+'"'));
  assert.ok(router.includes("'"+ROUTE+"'"));
  assert.ok(shell.includes("'"+ROUTE+"'"));
  assert.ok(html.includes(PERM));
});

test('EP frontend consume solo la API Experimental NS',()=>{
  assert.match(front,/\/api\/experimental-ns\/equipos-parados\/inicial/);
  assert.doesNotMatch(front,/\/api\/ns\/equipos-parados/);
  assert.doesNotMatch(front,/datos\.json/);
  assert.match(front,/Imprimir \/ PDF/);
});

test('EP shell carga recursos aislados y no usa JS productivo',()=>{
  assert.match(shell,/equipos-parados\/equipos-parados-ns\.css/);
  assert.match(shell,/equipos-parados\/equipos-parados-ns\.js/);
  assert.doesNotMatch(shell,/loadScript\([^\n]*equipos-parados\.js/);
});
