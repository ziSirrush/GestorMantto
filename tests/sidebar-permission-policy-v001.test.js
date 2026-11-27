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
const ATP='ATENCION_PRIORITARIA_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
function fixture(user,{ns=true,admin=true,active=true,atp=true,atpActive=true}={}){
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
  const opGroup=group('operacion');
  const atpNode=item('experimental-atencion-prioritaria','atencion_prioritaria_exp',opGroup,ATP);
  opGroup.children.push(atpNode);
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
      modulo_nombre:'Administracion',modulo_activo:1,modulo_interno_visual:0,codigo_permiso:ADMIN},
    {id_subelemento_accion:3,agrupacion_codigo:'EXPERIMENTAL',agrupacion_nombre:'Experimental',
      agrupacion_empresa:'UNITED',agrupacion_activo:1,modulo_codigo:'ATENCION_PRIORITARIA_EXP',
      modulo_nombre:'Atención Prioritaria',modulo_activo:atpActive?1:0,modulo_interno_visual:0,codigo_permiso:ATP}
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
      if(selector==='[data-permission-code]')return [nsNode,adminNode,atpNode];
      return [];
    },
    addEventListener(){},dispatchEvent(){}
  };
  const win={ManttoAuth:{
    getUser:()=>user,getActorUser:()=>user,isViewingAs:()=>false,
    apiGet:async()=>({data:{usuario_id:user.id_SB,catalogo:catalog,permisos:[
      {id_subelemento_accion:1,configurado:true,efectivo:ns},
      {id_subelemento_accion:2,configurado:true,efectivo:admin},
      {id_subelemento_accion:3,configurado:true,efectivo:atp}
    ]}})
  },ManttoRouter:{getCurrent:()=>({route:'home'}),reset(){}},setTimeout(){}};
  vm.runInNewContext(code,{window:win,document,console,Element:class{},MutationObserver:class{observe(){}},
    CSS:{escape:x=>String(x)},CustomEvent:class{}});
  return {win,nsNode,adminNode,supportNode,home,users,panel,nsGroup,supportGroup,opGroup,atpNode,
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

test('Atención Prioritaria se presenta en Operación con su permiso efectivo original',async()=>{
  const op=html.match(/<section class="side-group" data-group="operacion">[\s\S]*?<\/section>/);
  const exp=html.match(/<section class="side-group" data-group="experimental">[\s\S]*?<\/section>/);
  assert.ok(op&&exp);
  assert.match(op[0],/data-permission-code="ATENCION_PRIORITARIA_EXP_ACCESO_VISUAL_MODULO\.ACCESO_VISUAL" data-route="experimental-atencion-prioritaria"/);
  assert.doesNotMatch(exp[0],/data-route="experimental-atencion-prioritaria"/);
  assert.equal((html.match(/data-route="experimental-atencion-prioritaria"/g)||[]).length,1);
  for(const options of [{},{atp:false},{atpActive:false}]){
    const f=fixture({id_SB:11,rol:'Supervisor',roles:['Supervisor']},options);
    await f.init();
    const expected=options.atp!==false&&options.atpActive!==false;
    assert.equal(f.atpNode.hidden,!expected);
    assert.equal(f.opGroup.hidden,!expected);
    assert.equal(f.win.ManttoPermissions.canNavigate('experimental-atencion-prioritaria'),expected);
  }
});
