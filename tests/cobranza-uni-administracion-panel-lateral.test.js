'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_NAVEGACION_V001]
// Tests sin Aiven ni archivos SQL; compatibles con .gitignore.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.resolve(__dirname,'..');
const source=p=>fs.readFileSync(path.join(base,p),'utf8');
const html=source('index.html');
const router=source('core/router.js');
const loader=source('core/module-loader.js');
const route='cobranza-uni-administracion';

test('sidebar: Administracion aparece solo en Cobranza UNITED y oculta hasta autorizacion',()=>{
  const group=html.match(/<section class="side-group" data-company="UNITED" data-group="cobranza-uni">([\s\S]*?)<\/section>/);
  assert.ok(group);
  assert.equal((group[1].match(/id="side-cobranza-uni-administracion"/g)||[]).length,1);
  assert.match(group[1],/data-route="cobranza-uni-administracion"/);
  assert.match(group[1],/id="side-cobranza-uni-administracion"[^>]*\bhidden\b[^>]*display:none/);
  assert.doesNotMatch(group[1],/id="side-cobranza-uni-administracion"[^>]*data-permission/);
  for(const r of ['cobranza-uni-dashboard','cobranza-uni-estados-cuenta','cobranza-uni-mp-pro','cobranza-uni-aditivas'])
    assert.match(group[1],new RegExp('data-route="'+r+'"'));
});

test('index: Main tiene vista propia y menu de seguridad previo a inicializar la app',()=>{
  assert.match(html,/data-view="cobranza-uni-administracion" id="view-cobranza-uni-administracion"/);
  const menu=html.indexOf('modules/cobranza-uni/administracion/admin-menu.js');
  const app=html.indexOf('./core/app.js');
  assert.ok(menu>0 && app>menu);
  assert.match(html,/core\/router\.js\?v=20261023-back-history-v001/);
  assert.match(html,/core\/module-loader\.js\?v=20261023-back-history-v001/);
});

test('router: administra independientemente del modulo de consulta legacy',()=>{
  assert.match(router,/'cobranza-uni-administracion':'Administraci.n'/);
  const legacy=router.match(/const COBRANZA_ROUTES_UNI = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(legacy);
  assert.doesNotMatch(legacy[1],/administracion/);
  assert.match(router,/function showCobranzaAdministracion_uni\(\)/);
  assert.match(router,/route==='cobranza-uni-administracion' && showCobranzaAdministracion_uni\(\)/);
  assert.match(router,/window\.ManttoCobranzaAdministracion_uni/);
});

test('router: invoca Main y muestra la vista usando el enrutador oficial',async()=>{
  const start=router.indexOf('  function showCobranzaAdministracion_uni(){');
  const end=router.indexOf('  function showDetalle(payload){',start);
  assert.ok(start>0&&end>start);
  const calls=[];
  const element={id:'view-'+route};
  const context={
    window:{ManttoCobranzaAdministracion_uni:{init(){calls.push('init');return Promise.resolve(true);}}},
    document:{getElementById(id){calls.push(['find',id]);return id===element.id?element:null;}},
    activateViewById(id){calls.push(['view',id]);},
    setActiveSide(r){calls.push(['sidebar',r]);},
    updateContext(r,title){calls.push(['context',r,title]);},
    Promise,console,
  };
  const result=vm.runInNewContext(router.slice(start,end)+'\nshowCobranzaAdministracion_uni();',context);
  assert.equal(result,true);
  assert.ok(calls.some(x=>Array.isArray(x)&&x[0]==='view'&&x[1]===element.id));
  assert.ok(calls.some(x=>Array.isArray(x)&&x[0]==='sidebar'&&x[1]===route));
  assert.ok(calls.includes('init'));
});

test('router: cuando falta el contenedor, no activa la vista ni el Main',()=>{
  const start=router.indexOf('  function showCobranzaAdministracion_uni(){');
  const end=router.indexOf('  function showDetalle(payload){',start);
  const calls=[];
  const context={window:{ManttoCobranzaAdministracion_uni:{init(){calls.push('init');}}},document:{getElementById(){return null;}},activateViewById(){calls.push('view')},setActiveSide(){},updateContext(){},Promise,console};
  const result=vm.runInNewContext(router.slice(start,end)+'\nshowCobranzaAdministracion_uni();',context);
  assert.equal(result,false);
  assert.deepEqual(calls,[]);
});

test('loader: assets administrativos independientes con carga diferida',()=>{
  const found=loader.match(/'cobranza-uni-administracion':\{css:\[([^\]]+)\],js:\[([^\]]+)\]\}/);
  assert.ok(found);
  assert.match(found[1],/administracion\/main\/main\.css/);
  assert.match(found[2],/administracion\/main\/main\.js/);
  assert.match(found[1],/20261023-cua-nav-v001/);
  const persistent=loader.match(/const PERSISTENT_DATA_ROUTES = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(persistent);
  assert.doesNotMatch(persistent[1],/cobranza-uni-administracion/);
});

test('integracion: no cambia ninguna de las cuatro vistas legacy de Cobranza UNITED',()=>{
  for(const r of ['cobranza-uni-dashboard','cobranza-uni-estados-cuenta','cobranza-uni-mp-pro','cobranza-uni-aditivas']){
    assert.match(html,new RegExp('data-view="'+r+'" id="view-'+r+'"'));
    assert.match(loader,new RegExp("'"+r+"':\\{css:"));
    assert.match(router,new RegExp("'"+r+"'"));
  }
});

test('integracion: permisos se consultan en el backend; no se declara rol fijo',()=>{
  const button=html.match(/<button[^>]+id="side-cobranza-uni-administracion"[^>]*>/)?.[0];
  assert.ok(button);
  assert.doesNotMatch(button,/data-permission=/);
  assert.doesNotMatch(button,/role|admin=true|programador/i);
  // La seguridad de lectura/escritura reside en las rutas backend existentes.
  assert.doesNotMatch(router,/fetch\('\/api\/cobranza-uni\/administracion/);
});
