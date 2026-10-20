'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const ROOT=path.resolve(__dirname,'..');
const UPDATE_SOURCE=fs.readFileSync(path.join(ROOT,'core','app-update.js'),'utf8');

function buildSource(commit,message='Versión nueva'){
  return `window.MANTTO_BUILD_INFO = Object.freeze(${JSON.stringify({
    environment:'DEPLOY',provider:'NETLIFY',message,commit,commitShort:commit.slice(0,7),generatedAt:'2026-10-15T12:00:00.000Z'
  })});`;
}

function loadUpdateModule(options={}){
  const elements=options.elements||{};
  const fetchCalls=[];
  const location={
    href:'https://example.netlify.app/index.html',
    origin:'https://example.netlify.app',
    hostname:'example.netlify.app',
    replace:options.replace||(()=>{})
  };
  const window={
    location,
    MANTTO_BUILD_INFO:options.current||{
      environment:'DEPLOY',provider:'NETLIFY',message:'Versión actual',commit:'a'.repeat(40),commitShort:'aaaaaaa',generatedAt:'2026-10-14T12:00:00.000Z'
    },
    setTimeout:()=>0,
    setInterval:()=>0,
    addEventListener:()=>{},
    performance:{getEntriesByType:()=>[]},
    caches:options.caches
  };
  const document={
    readyState:'loading',
    visibilityState:'visible',
    addEventListener:()=>{},
    dispatchEvent:()=>{},
    getElementById:id=>elements[id]||null,
    querySelectorAll:()=>[]
  };
  const context={
    window,document,URL,Date,Promise,console,
    navigator:options.navigator||{},
    fetch:async(url,requestOptions)=>{
      fetchCalls.push({url:String(url),options:requestOptions});
      if(String(url).includes('build-info.generated.js')){
        return {ok:true,text:async()=>options.remoteSource||buildSource('b'.repeat(40))};
      }
      return {ok:true,text:async()=>''};
    }
  };
  vm.runInNewContext(UPDATE_SOURCE,context);
  return {api:window.ManttoAppUpdate,window,document,fetchCalls};
}

function profileElements(){
  return {
    'usr-app-update':{hidden:true},
    'usr-app-update-button':{disabled:false,textContent:'',dataset:{},addEventListener(){}},
    'usr-app-update-status':{textContent:'',classList:{toggle(){}}}
  };
}

test('compara la versión cargada contra la metadata publicada sin caché',async()=>{
  const elements=profileElements();
  const loaded=loadUpdateModule({elements});
  const result=await loaded.api.checkForUpdate();

  assert.equal(result.available,true);
  assert.equal(elements['usr-app-update'].hidden,false);
  assert.equal(elements['usr-app-update-button'].textContent,'Descargar actualización');
  assert.match(elements['usr-app-update-status'].textContent,/Tu PWA tiene Versión actual\. Está disponible Versión nueva\./);
  assert.equal(loaded.fetchCalls[0].options.cache,'no-store');
  assert.match(loaded.fetchCalls[0].url,/build-info\.generated\.js\?update_check=\d+/);
});

test('no ofrece actualización si el commit publicado coincide con el cargado',async()=>{
  const commit='a'.repeat(40);
  const elements=profileElements();
  const loaded=loadUpdateModule({elements,remoteSource:buildSource(commit)});
  const result=await loaded.api.checkForUpdate();

  assert.equal(result.available,false);
  assert.equal(elements['usr-app-update'].hidden,true);
});

test('descargar actualización renueva worker, cachés BLT y recarga con cache bust',async()=>{
  const removed=[];
  const workerMessages=[];
  let workerUpdated=false;
  let replaced='';
  const elements=profileElements();
  const loaded=loadUpdateModule({
    elements,
    replace:value=>{replaced=value;},
    caches:{keys:async()=>['mantto-shell-v1','blt-now-assets-v2','unrelated-cache'],delete:async key=>{removed.push(key);return true;}},
    navigator:{serviceWorker:{getRegistration:async()=>({
      update:async()=>{workerUpdated=true;},
      waiting:{postMessage:message=>workerMessages.push(message)}
    })}}
  });
  await loaded.api.checkForUpdate();
  await loaded.api.applyUpdate();

  assert.equal(workerUpdated,true);
  assert.equal(workerMessages.length,1);
  assert.equal(workerMessages[0].type,'SKIP_WAITING');
  assert.deepEqual(removed.sort(),['blt-now-assets-v2','mantto-shell-v1']);
  assert.match(replaced,/blt_update=b{40}/);
  assert.ok(loaded.fetchCalls.some(call=>call.options.cache==='reload'));
});

test('el botón vive debajo de la versión del perfil y el worker acepta activación inmediata',()=>{
  const users=fs.readFileSync(path.join(ROOT,'modules','usuarios','usuarios.js'),'utf8');
  const index=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const worker=fs.readFileSync(path.join(ROOT,'service-worker.js'),'utf8');
  const versionPosition=users.indexOf('id="usr-app-version"');
  const updatePosition=users.indexOf('id="usr-app-update"');

  assert.ok(versionPosition>=0&&updatePosition>versionPosition);
  assert.match(users,/id="usr-app-update" hidden/);
  assert.match(users,/Descargar actualización/);
  assert.ok(index.indexOf('core/app-update.js')>index.indexOf('core/build-info.js'));
  assert.match(worker,/event\.data\.type === 'SKIP_WAITING'/);
  assert.match(worker,/self\.skipWaiting\(\)/);
  assert.match(worker,/BLT_VERSION_PROBE/);
  assert.match(worker,/client\.navigate\(target\.href\)/);
});

test('el administrador actual responde al worker para evitar recargas automáticas posteriores',()=>{
  let messageHandler=null;
  const replies=[];
  const navigator={serviceWorker:{addEventListener:(type,handler)=>{if(type==='message')messageHandler=handler;}}};
  const loaded=loadUpdateModule({navigator});

  assert.equal(typeof messageHandler,'function');
  messageHandler({
    data:{type:'BLT_VERSION_PROBE'},
    ports:[{postMessage:value=>replies.push(value)}]
  });
  assert.equal(replies.length,1);
  assert.equal(replies[0].type,'BLT_VERSION_RESPONSE');
  assert.equal(replies[0].managedUpdate,true);
  assert.equal(replies[0].build,'a'.repeat(40));
  assert.equal(loaded.api.getState().available,false);
});

test('el worker puente recarga clientes antiguos y respeta clientes con actualizador',async()=>{
  class TestMessageChannel{
    constructor(){
      this.port1={onmessage:null};
      this.port2={reply:data=>this.port1.onmessage&&this.port1.onmessage({data})};
    }
  }
  const self={addEventListener(){},clients:{claim:async()=>{},matchAll:async()=>[]}};
  const context={
    self,clients:self.clients,MessageChannel:TestMessageChannel,URL,URLSearchParams,Promise,Date,
    setTimeout:callback=>{Promise.resolve().then(callback);return 1;},clearTimeout:()=>{}
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT,'service-worker.js'),'utf8'),context);

  let managedNavigation='';
  await context.refreshLegacyClient({
    url:'https://example.test/index.html',
    postMessage:(_message,ports)=>ports[0].reply({type:'BLT_VERSION_RESPONSE',managedUpdate:true}),
    navigate:async url=>{managedNavigation=url;}
  });
  assert.equal(managedNavigation,'');

  let legacyNavigation='';
  await context.refreshLegacyClient({
    url:'https://example.test/index.html',
    postMessage:()=>{},
    navigate:async url=>{legacyNavigation=url;}
  });
  assert.match(legacyNavigation,/blt_sw_update=20261020-offline-progreso-global-v001/);
});

test('GitHub Pages y Netlify generan metadata nueva en cada despliegue',()=>{
  const github=fs.readFileSync(path.join(ROOT,'.github','workflows','pages.yml'),'utf8');
  const netlify=fs.readFileSync(path.join(ROOT,'netlify.toml'),'utf8');

  assert.match(github,/node tools\/generate-build-info\.js/);
  assert.match(netlify,/command\s*=\s*"node tools\/generate-build-info\.js && node tools\/generate-change-audit\.js"/);
  assert.match(netlify,/build-info\.generated\.js[\s\S]*Cache-Control\s*=\s*"no-store, no-cache, must-revalidate"/);
});
