'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const retired=['experimental-equipos-criticos','experimental-dashboard-call-center','experimental-proyectos-criticos'];
test('Experimental: retirar sólo las tres vistas redundantes y todos sus registros de carga y sincronización',()=>{
  const html=read('index.html'),loader=read('core/module-loader.js'),sync=read('core/data-sync.js'),shell=read('modules/experimental/experimental.js'),router=read('core/router.js');
  const menu=html.match(/<section class="side-group" data-group="experimental">[\s\S]*?<\/section>/);
  assert.ok(menu);
  for(const route of retired){
    for(const content of [html,loader,sync,shell])assert.equal(content.includes(route),false,route);
    for(const ext of ['js','css'])assert.equal(fs.existsSync(path.join(root,'modules',route,route+'.'+ext)),false,route+'.'+ext);
  }
  for(const route of ['experimental-resumen-dia','experimental-entregas-recientes']){
    assert.ok(menu[0].includes('data-route="'+route+'"'));
    assert.ok(html.includes('data-view="'+route+'"'));
    for(const content of [loader,sync,shell])assert.ok(content.includes(route));
  }
  assert.match(html,/data-permission-code="ATENCION_PRIORITARIA_EXP_ACCESO_VISUAL_MODULO\.ACCESO_VISUAL" data-route="experimental-atencion-prioritaria"/);
  for(const route of ['resumen','criticos','callcenter','proyectos','movimientos-criticos','portal-blt-jf-equipos-criticos']){
    assert.ok(html.includes('data-route="'+route+'"'),route);
    assert.ok(html.includes('data-view="'+route+'"'),route);
    assert.ok(loader.includes(route),route);
  }
  // NS cuenta con registro de navegación propio, no con el loader de Experimental.
  for(const route of ['experimental-ns-equipos-criticos','experimental-ns-proyectos-mantenimiento']){
    assert.ok(html.includes('data-route="'+route+'"'),route);
    assert.ok(html.includes('data-view="'+route+'"'),route);
    assert.ok(router.includes(route),route);
  }
});
test('Experimental: el retiro frontend no elimina contratos de API ni motores compartidos',()=>{
  for(const route of retired){
    for(const kind of ['controller','routes','service'])assert.ok(fs.existsSync(path.join(root,'backend','src','modules',route,route+'.'+kind+'.js')),route);
  }
  assert.ok(fs.existsSync(path.join(root,'backend/src/modules/criticos/criticos.service.js')));
});
