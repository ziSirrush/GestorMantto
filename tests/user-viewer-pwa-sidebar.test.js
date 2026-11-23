'use strict';
// PWA: Visor de usuarios fijo al pie del lateral, basado en permiso efectivo.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('index.html');
const viewer=read('core/user-viewer.js');
const router=read('core/router.js');
const css=read('styles/base.css');
const sw=read('service-worker.js');
test('El acceso PWA esta fuera del scroll de modulos y en el pie del lateral',()=>{
  assert.match(html,/<\/nav>\s*<!-- Visor exclusivo[\s\S]*?<div class="side-viewer-footer" id="user-viewer-sidebar-footer" hidden>/);
  assert.match(html,/data-permission="user_viewer" data-route="visor-usuarios" id="user-viewer-sidebar-trigger"/);
  assert.match(html,/<section aria-label="Visor de usuarios" class="view viewer-mobile-page" data-view="visor-usuarios" id="view-visor-usuarios"/);
  assert.match(css,/@media\(max-width:920px\)[\s\S]*?\.side-viewer-footer\{display:block;flex:0 0 auto/);
  assert.match(css,/\.sidebar \.side-nav\{flex:1 1 auto;min-height:0;height:auto\}/);
  assert.match(css,/\.side-viewer-footer\[hidden\]\{display:none!important\}/);
});
test('Permisos validados antes de navegar, sin nuevos endpoints',()=>{
  assert.match(viewer,/if\(permission==='user_viewer'\)return state\.sessionPermissionsReady && allowed\(\);/);
  assert.match(viewer,/mobileFooter\.hidden=!\(state\.sessionPermissionsReady&&allowed\(\)\)/);
  assert.match(router,/window\.ManttoPermissions\?\.canNavigate\?\.\('visor-usuarios'\)===true/);
  assert.match(router,/window\.ManttoUserViewer\.renderPanel\(view\)/);
  assert.match(viewer,/container\.querySelector\('#user-viewer-panel-search'\)/);
  assert.match(viewer,/container\?\.querySelector\?\.\('#user-viewer-panel-list'\)/);
  assert.match(viewer,/state\.usersLoaded=false/);
  assert.match(sw,/20261117-visor-pwa-sidebar-v001/);
  assert.match(html,/core\/user-viewer\.js\?v=20261117-visor-pwa-sidebar-v001/);
  assert.match(html,/core\/router\.js\?v=20261123-cobranza-cor-placeholder-v001/);
});
async function simulate({permission,viewingAs=false,fail=false}){
  const footer={hidden:true};
  const button={
    dataset:{permission:'user_viewer',route:'visor-usuarios'},hidden:true,
    closest:()=>null,matches:s=>s==='.side-item[data-permission]',setAttribute(){}
  };
  const user={id_SB:501,rol:'Programador United',roles:['Programador United']};
  const document={
    body:{classList:{toggle(){}}},getElementById:id=>id==='user-viewer-sidebar-footer'?footer:null,
    querySelector:()=>null,
    querySelectorAll:selector=>selector==='.side-item[data-permission]'||selector==='[data-permission]'?[button]:[],
    addEventListener(){}
  };
  const window={
    ManttoAuth:{
      getUser:()=>user,getActorUser:()=>user,isViewingAs:()=>viewingAs,
      async apiGet(route){
        if(fail)throw Error('API unavailable');
        if(route.includes('session-permissions'))return {data:{usuario_id:501,catalogo:[],permisos:[],puede_usar_visor:permission}};
        if(route.includes('viewer-users'))return {data:{usuarios:[]}};
        throw Error('Unexpected endpoint '+route);
      }
    },
    ManttoRouter:{getCurrent:()=>({route:'home'}),reset(){}},
    setTimeout(){},addEventListener(){}
  };
  vm.runInNewContext(viewer,{
    window,document,console:{error(){},warn(){}},CSS:{escape:s=>String(s)},
    Element:class Element{},MutationObserver:class MutationObserver{observe(){}},
    CustomEvent:class CustomEvent{}
  },{filename:'core/user-viewer.js'});
  const pending=window.ManttoUserViewer.init();
  const before={footer:footer.hidden,button:button.hidden};
  await pending;
  return {before,after:{footer:footer.hidden,button:button.hidden},allowed:window.ManttoUserViewer.allowed()};
}
test('Autorizado ve visor; sin permiso, modo visor o error API no lo muestran',async()=>{
  const ok=await simulate({permission:true});
  assert.deepEqual(ok.before,{footer:true,button:true});
  assert.deepEqual(ok.after,{footer:false,button:false});
  assert.equal(ok.allowed,true);
  for(const options of [{permission:false},{permission:true,viewingAs:true},{permission:true,fail:true}]){
    const actual=await simulate(options);
    assert.deepEqual(actual.after,{footer:true,button:true});
    assert.equal(actual.allowed,false);
  }
});
