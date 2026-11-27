'use strict';
// Portal BLT JF: menu lateral con codigos y rutas independientes.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('index.html');
const router=read('core/router.js');
const sidebar=read('core/user-viewer.js');
const sw=read('service-worker.js');
const EXPECTED=[
  ['MOVIMIENTOS_PORTAFOLIO','movimientos-portafolio','Movimientos Portafolio'],
  ['PORTAFOLIO_TOTAL','portafolio-total','Portafolio Total'],
  ['EQUIPOS_CRITICOS','equipos-criticos','Equipos Críticos'],
  ['EQUIPOS_PARADOS','equipos-parados','Equipos Parados'],
  ['INFOGRAFIAS','infografias','Infografías'],
  ['USO_APP','uso-app','Uso de la APP'],
  ['TIPOS_PRECALCULO','tipos-precalculo','Tiempos Precalculo'],
  ['ENCUESTAS_SATISFACCION','encuestas-satisfaccion','Encuestas de satisfacción'],
  ['KPIS','kpis','KPIS']
];
test('Portal BLT es una agrupacion UNITED independiente con nueve entradas JF',()=>{
  const start='<section class="side-group" data-company="UNITED" data-group="portal-blt-jf">';
  assert.equal(html.split(start).length,2);
  const group=html.split(start)[1].split('</section>')[0];
  assert.match(group,/<b>Portal BLT<\/b>/);
  assert.match(group,/id="side-group-portal-blt-jf"/);
  assert.equal((group.match(/class="side-item"/g)||[]).length,9);
  const routes=new Set(),permissions=new Set();
  for(const [code,route,label] of EXPECTED){
    const fullRoute='portal-blt-jf-'+route;
    const fullPermission='PORTAL_BLT_JF_'+code+'_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
    const button=group.split('\n').find(line=>line.includes('data-route="'+fullRoute+'"'));
    assert.ok(button,'Falta la ruta '+fullRoute);
    assert.ok(button.includes('data-permission-code="'+fullPermission+'"'),fullPermission);
    assert.ok(button.includes('<b>'+label+' (JF)</b>'));
    assert.ok(button.includes('data-permission="portal_blt_jf_'));
    assert.ok(router.includes("'"+fullRoute+"':'"+label+" (JF)'"),'Falta nombre de ruta JF');
    routes.add(fullRoute);permissions.add(fullPermission);
  }
  assert.equal(routes.size,9);
  assert.equal(permissions.size,9);
  assert.match(html,/id="view-portal-blt-jf-encuestas-satisfaccion"/);
  assert.match(read('modules/portal-blt-jf/portal-blt-jf.js'),/pending:true/);
  assert.match(router,/const PORTAL_BLT_JF_ROUTES = new Set/);
  assert.match(router,/PORTAL_BLT_JF_ROUTES\.has\(route\) && window\.ManttoPermissions\?\.canNavigate\?\.\(route\)!==true/);
  assert.match(sidebar,/if\(exactPermissionCode\)\{/);
  assert.match(sidebar,/rows\.length>0&&exact\.exists===true&&exact\.efectivo===true/);
});
test('Los permisos JF no se confunden con modulos de otras agrupaciones',()=>{
  const newCodes=EXPECTED.map(x=>'PORTAL_BLT_JF_'+x[0]+'_ACCESO_VISUAL_MODULO.ACCESO_VISUAL');
  for(const code of newCodes){
    assert.notEqual(code,'EXPERIMENTAL_PORTAL_BLT_MOVIMIENTOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL');
    assert.ok(!code.startsWith('OPERACION_')&&!code.startsWith('PORTAFOLIO_'));
  }
  assert.match(html,/data-route="movimientos"/);
  assert.match(html,/data-route="criticos"/);
  assert.match(sw,/20261117-portal-blt-jf-sidebar-v001/);
  assert.match(sw,/'core\/router\.js'/);
  // El comportamiento del router se verifica arriba; la etiqueta de caché cambia con cada publicación.
  assert.match(html,/<script src="\.\/core\/router\.js\?v=[0-9A-Za-z._-]+"><\/script>/);
});
