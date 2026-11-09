'use strict';
// Regresion para el sidebar universal con roles principales o secundarios.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const code=fs.readFileSync(path.join(root,'core/user-viewer.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const NS='EXPERIMENTAL_NS_RESUMEN_DIA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const ADMIN='COBRANZA_UNI_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
function fixture(user,{ns=true,admin=true,active=true}={}){
  const elements=[];
  const groups=[];
  function item(route,permission,group,code){
    const e={hidden:false,dataset:{route,permission,...(code?{permissionCode:code}:{})},
      closest(selector){return selector==='.side-group'?group:null;},
      matches(selector){return selector==='.side-item[data-permission]';},setAttribute(){}};
    elements.push(e);
    return e;
  }
  function group(key,company){
    const g={dataset:{group:key,...(company?{company}:{})},hidden:false,children:[],
      querySelectorAll(selector){return selector==='.side-item'?this.children:[];}};
    groups.push(g);
    return g;
  }
  const nsGroup=group('experimental-ns','UNITED');
  const adminGroup=group('cobranza-uni','UNITED');
  const supportGroup=group('soporte');
  const nsNode=item('experimental-ns-resumen-dia','experimental_ns_resumen_dia',nsGroup,NS);
  const adminNode=item('cobranza-uni-administracion','cobranza_uni_administracion',adminGroup,ADMIN);
  const supportNode=item('soporte-dashboard','soporte_dashboard',supportGroup);
  nsGroup.children.push(nsNode);adminGroup.children.push(adminNode);supportGroup.children.push(supportNode);
  const home=item('home','home');
  const users=item('usuarios','usuarios');
  const panel=item('panel-control','panel_control');
  const catalog=[
    {id_subelemento_accion:1,agrupacion_codigo:'EXPERIMENTAL_NS',agrupacion_nombre:'Experimental NS',
      agrupacion_empresa:'UNITED',agrupacion_activo:1,modulo_codigo:'EXPERIMENTAL_NS_RESUMEN_DIA',
      modulo_nombre:'Resumen del Dia',modulo_activo:active?1:0,modulo_interno_visual:0,codigo_permiso:NS},
    {id_subelemento_accion:2,agrupacion_codigo:'COBRANZA_UNI',agrupacion_nombre:'Cobranza',
      agrupacion_empresa:'UNITED',agrupacion_activo:1,modulo_codigo:'COBRANZA_UNI_ADMINISTRACION',
      modulo_nombre:'Administracion',modulo_activo:1,modulo_interno_visual:0,codigo_permiso:ADMIN}
  ];
  const document={
    body:{classList:{toggle(){}}},
    getElementById(){return null;},
    querySelector(selector){
      if(!selector.includes('[data-route='))return null;
      return elements.find(e=>selector.includes('data-route="'+e.dataset.route+'"'))||null;
    },
    querySelectorAll(selector){
      if(selector==='.side-item[data-permission]')return elements;
      if(selector==='.side-group')return groups;
      if(selector==='[data-permission-code]')return [nsNode,adminNode];
      return [];
    },
    addEventListener(){},dispatchEvent(){}
  };
  const win={ManttoAuth:{
    getUser:()=>user,getActorUser:()=>user,isViewingAs:()=>false,
    apiGet:async()=>({data:{usuario_id:user.id_SB,catalogo:catalog,permisos:[
      {id_subelemento_accion:1,configurado:true,efectivo:ns},
      {id_subelemento_accion:2,configurado:true,efectivo:admin}
    ]}})
  },ManttoRouter:{getCurrent:()=>({route:'home'}),reset(){}},setTimeout(){}};
  vm.runInNewContext(code,{window:win,document,console,Element:class{},MutationObserver:class{observe(){}},
    CSS:{escape:x=>String(x)},CustomEvent:class{}});
  return {win,nsNode,adminNode,supportNode,home,users,panel,nsGroup,supportGroup,
    init:()=>win.ManttoUserViewer.init()};
}

test('Todos los enlaces del sidebar tienen permiso, salvo ningun acceso grupal',()=>{
  for(const block of html.matchAll(/<section class="side-group[^"]*"[^>]*>[\s\S]*?<\/section>/g)){
    const items=[...block[0].matchAll(/<button\b[^>]*class="[^"]*side-item[^"]*"[^>]*>/g)];
    assert.ok(items.length>0);
    for(const found of items)assert.match(found[0],/data-permission="/,
      'Item sin conexion a Panel de Control: '+found[0]);
  }
  assert.doesNotMatch(html,/<section[^>]*class="side-group programmer"[^>]*data-group="experimental-ns"/);
});

test('Director General sin rol Programador utiliza Experimental NS si el permiso es efectivo',async()=>{
  const f=fixture({id_SB:1,rol:'Director General',roles:['Director General']});
  await f.init();
  assert.equal(f.nsNode.hidden,false);
  assert.equal(f.nsGroup.hidden,false);
  assert.equal(f.win.ManttoPermissions.canNavigate('experimental-ns-resumen-dia'),true);
  assert.equal(f.supportNode.hidden,true);
  assert.equal(f.users.hidden,false);
  assert.equal(f.home.hidden,false);
  assert.equal(f.panel.hidden,false);
});
test('Un rol ajeno tambien usa NS con permiso efectivo',async()=>{
  const f=fixture({id_SB:2,rol:'Supervisor de Instalaciones',roles:['Supervisor de Instalaciones']});
  await f.init();
  assert.equal(f.nsNode.hidden,false);
  assert.equal(f.panel.hidden,true);
});
test('Sin permiso individual o con modulo inactivo se oculta Experimental NS',async()=>{
  for(const options of [{ns:false},{active:false}]){
    const f=fixture({id_SB:3,rol:'Director General',roles:['Director General']},options);
    await f.init();
    assert.equal(f.nsNode.hidden,true);
    assert.equal(f.nsGroup.hidden,true);
    assert.equal(f.win.ManttoPermissions.canNavigate('experimental-ns-resumen-dia'),false);
  }
});
test('Cobranza United Administracion solo visible con permiso visual efectivo',async()=>{
  const granted=fixture({id_SB:4,rol:'Director Finanzas',roles:['Director Finanzas']});
  await granted.init();
  assert.equal(granted.adminNode.hidden,false);
  const denied=fixture({id_SB:5,rol:'Director Finanzas',roles:['Director Finanzas']},{admin:false});
  await denied.init();
  assert.equal(denied.adminNode.hidden,true);
});
test('Soporte: solo rol exacto, sea principal o secundario, independientemente del catalogo',async()=>{
  for(const [roles,expected] of [
    [['Soporte'],true],
    [['Director Ventas','Soporte'],true],
    [['Coordinador de Soporte'],false],
    [['Programador'],false]
  ]){
    const f=fixture({id_SB:9,rol:roles[0],roles});
    await f.init();
    assert.equal(f.supportNode.hidden,!expected);
    assert.equal(f.supportGroup.hidden,!expected);
  }
});
test('Inicio y Usuarios no requieren check del catalogo',async()=>{
  const f=fixture({id_SB:10,rol:'Sin rol',roles:[]},{ns:false,admin:false});
  await f.init();
  assert.equal(f.home.hidden,false);
  assert.equal(f.users.hidden,false);
  assert.equal(f.panel.hidden,true);
});
