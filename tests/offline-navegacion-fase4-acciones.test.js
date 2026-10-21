'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const SRC=fs.readFileSync(path.join(ROOT,'core','offline-native-actions.js'),'utf8');
const sigU='a'.repeat(64),sigC='f'.repeat(64);
const tk=[{id:71,ticket:'TK-71',proyecto:'PROYECTO A',codigo_equipo:'11-MEX-ELE-BLT'},
  {id:72,ticket:'TK-72',proyecto:'PROYECTO B'}];
const cor=[{id_ins_fl:101,id_proyecto:'P-9',proyecto:'OBRA ALFA',referencia_sitio:'A1'},
  {id_ins_fl:102,id_proyecto:'P-9',proyecto:'OBRA ALFA',referencia_sitio:'A2'},
  {id_ins_fl:103,id_proyecto:'P-10',proyecto:'OBRA BETA',referencia_sitio:'B1'}];
function fakeElement(id=''){
  const children=[],listeners={};const el={id,dataset:{},style:{},textContent:'',innerHTML:'',
    hidden:false,disabled:false,children,className:'',value:'',
    addEventListener(type,fn){listeners[type]=fn;},
    append(...items){children.push(...items);},appendChild(item){children.push(item);},
    remove(){el.removed=true;},
    querySelector(){return null;},getElementById(){return null;}
  };
  return el;
}
function createFixture(opts={}){
  let offline=opts.offline!==false,actor=5,effective=8,viewer=opts.viewer||false,grant=opts.grant!==false;
  let route=opts.route||'detalle';let screen=opts.screen||'ticket';
  let payload=screen==='ticket'?{type:'ticket',id:'TK-71',source:'resumen-dia'}:
    {type:'proyecto',id:'P-9',projectName:'OBRA ALFA',source:'instalaciones-proyectos'};
  if(opts.payload)payload=opts.payload;
  const logs=[],events={},windowEvents={},nodes=new Map();
  const makeAccess=()=>({permission_code:'GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
    actor_user_id:actor,effective_user_id:effective,viewer_read_only:viewer,
    catalog_modules:[{code:'OPERACION_RESUMEN_DEL_DIA',domain:'UNITED',datasets:['operacion-resumen-dia'],
      backup_status:'EXPORTADOR_COMPLETO',scope:{scope_signature:sigU}},
      {code:'INSTALACIONES_PROYECTOS',domain:'CORELLIAN',datasets:['instalaciones-proyectos'],
        backup_status:'EXPORTADOR_COMPLETO',scope:{scope_signature:sigC}}]});
  const storage={
    readCachedAccess:()=>grant?makeAccess():null,
    async verifiedSnapshot(ctx,sig){
      if(opts.switchIdentity)effective=199;
      return {schema_version:2,read_only:true,actor_user_id:actor,effective_user_id:opts.switchIdentity?8:effective,
        domain:ctx.domain,dataset:ctx.dataset,scope_signature:sig,run_id:'run:fake:v1',
        kind_counts:ctx.domain==='UNITED'?{tickets:tk.length,portafolio:0}:{proyectos:cor.length}};
    },
    async enqueueOfflineAction(ctx,input){
      logs.push({ctx,input});
      if(opts.enqueueError)throw new Error('Copia renovada');
      return {id:'00000000-0000-4000-8000-000000000001',status:'PENDIENTE_SINCRONIZACION'};
    },
    async listPendingActions(){return []}
  };
  const auth={getActorUser:()=>({id_SB:actor}),getUser:()=>({id_SB:effective}),
    isViewingAs:()=>viewer};
  const nav={isOffline:()=>offline,canOpenRouteOffline:r=>!opts.denyRoute&&(
    r==='resumen'&&screen==='ticket'||r==='instalaciones-proyectos'&&screen==='project')};
  const readerU={routeAllowed:()=>!opts.denyReader,readCompleteCopy:async()=>({tickets:opts.ticketRows||tk,portafolio:[]})};
  const readerC={routeAllowed:()=>!opts.denyReader,readCompleteCopy:async()=>opts.projectRows||cor};
  const router={getCurrent:()=>({route,payload}),getHistory:()=>opts.badHistory?[]:[{route:'resumen'}]};
  const body=fakeElement('mg-detail-body');
  const projectHolder=fakeElement('mg-corellian-content');
  body.querySelector=selector=>{
    if(screen==='ticket'&&selector.includes('#mg-ticket-chat-form'))return opts.noNativeForm?null:fakeElement('mg-ticket-chat-form');
    if(screen==='project'&&selector.includes('.mg-corellian-content'))return projectHolder;
    return null;
  };
  const doc={readyState:'loading',head:fakeElement('head'),body:fakeElement('body'),
    createElement:fakeElement,getElementById:id=>nodes.get(id)||null,
    addEventListener(name,fn){events[name]=fn;},dispatchEvent(){}
  };
  nodes.set('mg-detail-body',body);
  const win={ManttoAuth:auth,ManttoRouter:router,ManttoOfflineNavigation:nav,
    ManttoOfflineStorage:storage,ManttoOfflineResumenDia:readerU,
    ManttoOfflineInstalacionesProyectos:readerC,
    addEventListener(type,fn,options){windowEvents[type]={fn,options};}};
  vm.runInNewContext(SRC,{window:win,document:doc,MutationObserver:undefined,
    CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts?.detail;}},
    console,Promise,Number,String,Set,WeakSet,Object,Array,Error});
  return {api:win.ManttoOfflineNativeActions,window:win,document:doc,events,windowEvents,
    logs,storage,mode:v=>{offline=v;},user:v=>{effective=v;},grant:v=>{grant=v;},
    viewer:v=>{viewer=v;},navigate:(name,obj)=>{route=name;payload=obj;},body,projectHolder};
}
function submitEvent(form){
  const state={prevented:false,stopped:false};
  return {target:form,state,preventDefault(){state.prevented=true;},
    stopImmediatePropagation(){state.stopped=true;}};
}
function nativeForm(value){
  const input={value},button={disabled:false,textContent:'Enviar'},notes=[];
  return {id:'mg-ticket-chat-form',dataset:{},appendChild(x){notes.push(x);},
    querySelector(selector){if(selector.includes('textarea')||selector.includes('#mg-ticket-chat-input'))return input;
      if(selector.includes('button'))return button;return null;},notes,input,button};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('F4: comentario en detalle nativo Ticket queda en outbox, nunca dispara POST',async()=>{
  const f=createFixture();f.events.DOMContentLoaded();
  assert.equal(f.windowEvents.submit.options,true,'intercepta en window-capture antes de document');
  const form=nativeForm('  Comentario desde ticket  '),event=submitEvent(form);
  f.windowEvents.submit.fn(event);await tick();await tick();
  assert.equal(event.state.prevented,true);assert.equal(event.state.stopped,true);
  assert.equal(f.logs.length,1);assert.equal(f.logs[0].input.action,'TICKET_COMMENT');
  assert.equal(f.logs[0].input.record_id,71);assert.equal(f.logs[0].input.text,'  Comentario desde ticket  ');
  assert.equal(f.logs[0].ctx.domain,'UNITED');assert.equal(f.logs[0].input.scope_signature,sigU);
  assert.equal(form.input.value,'');assert.equal(form.button.disabled,false);
  assert.match(form.notes[0].textContent,/Pendiente de sincronizar.*no confirmado en Aiven/);
});

test('F4: online conserva el formulario nativo sin ninguna interceptacion',async()=>{
  const f=createFixture({offline:false});const event=submitEvent(nativeForm('Hola'));
  f.api.onSubmitCapture(event);await tick();assert.equal(event.state.prevented,false);
  assert.equal(f.logs.length,0);assert.equal(f.api.enabledScreen(),null);
});

test('F4: comentario de proyecto usa id_ins_fl valido y el alcance CORELLIAN',async()=>{
  const f=createFixture({screen:'project'});
  const op=await f.api.enqueue('PROJECT_COMMENT','Pendiente interno');
  assert.equal(op.status,'PENDIENTE_SINCRONIZACION');
  assert.equal(f.logs.length,1);assert.equal(f.logs[0].input.action,'PROJECT_COMMENT');
  assert.equal(f.logs[0].input.record_id,101);assert.equal(f.logs[0].ctx.dataset,'instalaciones-proyectos');
  assert.equal(f.logs[0].input.scope_signature,sigC);
});

test('F4: movimiento de proyecto/ticket se registra como descriptivo, no VoBo',async()=>{
  for(const [screen,action,record] of [['project','PROJECT_MOVEMENT',101],['ticket','TICKET_MOVEMENT',71]]){
    const f=createFixture({screen});await f.api.enqueue(action,'Seguimiento descriptivo');
    assert.equal(f.logs[0].input.action,action);assert.equal(f.logs[0].input.record_id,record);
  }
});

test('F4: rechazo de acción cruzada, de VoBo y de firma no autorizada',async()=>{
  const f=createFixture();
  await assert.rejects(f.api.enqueue('PROJECT_COMMENT','Intento'),/pantalla/);
  await assert.rejects(f.api.enqueue('SAVE_VOBO','Intento'),/no certificada/);
  const p=createFixture({screen:'project'});
  await assert.rejects(p.api.enqueue('TICKET_MOVEMENT','Intento'),/pantalla/);
  assert.equal(f.logs.length,0);assert.equal(p.logs.length,0);
});

test('F4: requiere lectura certificada, respaldo vigente y usuario efectivo',async()=>{
  const f=createFixture({denyReader:true});
  await assert.rejects(f.api.enqueue('TICKET_COMMENT','Hola'),/Lector/);
  f.user(77);f.grant(false);
  await assert.rejects(f.api.enqueue('TICKET_COMMENT','Hola'),/pantalla/);
  assert.equal(f.logs.length,0);
});

test('F4: modo Visor y acceso revocado no permiten capturas',async()=>{
  const f=createFixture({viewer:true});assert.equal(f.api.enabledScreen(),null);
  await assert.rejects(f.api.enqueue('TICKET_COMMENT','Texto'),/pantalla/);
  f.viewer(false);f.grant(false);assert.equal(f.api.enabledScreen(),null);
  assert.equal(f.logs.length,0);
});

test('F4: cambiar la identidad mientras se valida el manifiesto aborta la cola',async()=>{
  const f=createFixture({switchIdentity:true});
  await assert.rejects(f.api.enqueue('TICKET_MOVEMENT','Seguimiento'),/sesión|sesion|cambió|cambio/i);
  assert.equal(f.logs.length,0);
});

test('F4: referencia desconocida, duplicada o proyecto ambiguo no crea una operación',async()=>{
  const f=createFixture({payload:{type:'ticket',id:'TK-404',source:'resumen-dia'}});
  await assert.rejects(f.api.enqueue('TICKET_COMMENT','Hola'),/no existe/);
  const g=createFixture({screen:'ticket',ticketRows:[...tk,{...tk[0],id:99}]});
  // El manifiesto del fixture debe reflejar el universo antes de verificar ambiguedad.
  await assert.rejects(g.api.enqueue('TICKET_COMMENT','Hola'),/manifiesto|único/);
  const p=createFixture({screen:'project',payload:{type:'proyecto',id:'OBRA',source:'instalaciones-proyectos'}});
  await assert.rejects(p.api.enqueue('PROJECT_MOVEMENT','Hola'),/no existe/);
  assert.equal(f.logs.length,0);assert.equal(p.logs.length,0);
});

test('F4: nunca borra el texto si la captura falla',async()=>{
  const f=createFixture({enqueueError:true});const form=nativeForm('No perder este texto');
  f.api.onSubmitCapture(submitEvent(form));await tick();await tick();
  assert.equal(f.logs.length,1);assert.equal(form.input.value,'No perder este texto');
  assert.match(form.notes[0].textContent,/Copia renovada/);
});

test('F4: prohibe textos vacios y mayores de 2000 caracteres',async()=>{
  const f=createFixture();
  await assert.rejects(f.api.enqueue('TICKET_COMMENT',' '),/1 y 2000/);
  await assert.rejects(f.api.enqueue('TICKET_COMMENT','x'.repeat(2001)),/1 y 2000/);
  assert.equal(f.logs.length,0);
});

test('F4: la nueva ruta se precachea y la version PWA cambia',()=>{
  const nav=fs.readFileSync(path.join(ROOT,'core/offline-navigation.js'),'utf8');
  const sw=fs.readFileSync(path.join(ROOT,'service-worker.js'),'utf8');
  assert.match(nav,/installNativeActionsBridge\(\)/);
  assert.match(nav,/core\/offline-native-actions\.js/);
  assert.match(sw,/20261020-navegacion-offline-f5-v001/);
  assert.match(sw,/REQUIRED_OFFLINE_COR_ASSETS = \[[\s\S]*core\/offline-native-actions\.js/);
  assert.match(sw,/core\/offline-resumen-dia\.js/);
  assert.match(sw,/core\/offline-instalaciones-proyectos\.js/);
  assert.match(SRC,/window\.addEventListener\('submit',onSubmitCapture,true\)/);
});

test('F4: el formulario descriptivo se inserta en la ficha CORELLIAN original sin reemplazarla',()=>{
  const f=createFixture({screen:'project'});
  f.body.innerHTML='Expediente nativo, gráfico y equipos';
  f.api.placePanel(f.api.enabledScreen());
  assert.equal(f.body.innerHTML,'Expediente nativo, gráfico y equipos');
  assert.equal(f.projectHolder.children.length,1);
  const panel=f.projectHolder.children[0];
  assert.equal(panel.id,'bltnow-native-offline-actions');
  assert.deepEqual(Array.from(panel.children).filter(c=>c.dataset?.bltnowOfflineAction).map(c=>c.dataset.bltnowOfflineAction),
    ['PROJECT_COMMENT','PROJECT_MOVEMENT']);
});

test('F4: el detalle Ticket conserva el formulario original y anexa sólo seguimiento descriptivo',()=>{
  const f=createFixture();f.body.innerHTML='Detalle nativo del ticket';
  f.api.placePanel(f.api.enabledScreen());
  assert.equal(f.body.innerHTML,'Detalle nativo del ticket');
  const panel=f.body.children.find(c=>c.id==='bltnow-native-offline-actions');
  assert.ok(panel);
  assert.deepEqual(Array.from(panel.children).filter(c=>c.dataset?.bltnowOfflineAction).map(c=>c.dataset.bltnowOfflineAction),
    ['TICKET_MOVEMENT']);
});

test('F5 seguridad: el chat nativo no escapa al bloqueo si caducan permisos offline',async()=>{
  const f=createFixture({grant:false});const form=nativeForm('No enviar a Aiven');
  const event=submitEvent(form);f.api.onSubmitCapture(event);await tick();
  assert.equal(event.state.prevented,true);
  assert.equal(event.state.stopped,true);
  assert.equal(f.logs.length,0);
  assert.equal(form.input.value,'No enviar a Aiven');
  assert.match(form.notes[0].textContent,/Copia o autorizaci/);
});

test('F5 seguridad: visor offline bloquea un comentario pero preserva el borrador',async()=>{
  const f=createFixture({viewer:true});const form=nativeForm('Mensaje del visor');
  const event=submitEvent(form);f.api.onSubmitCapture(event);await tick();
  assert.equal(event.state.prevented,true);
  assert.equal(f.logs.length,0);
  assert.equal(form.input.value,'Mensaje del visor');
});

test('F5 seguridad: un chat nativo ajeno al alcance certificado nunca escribe offline',async()=>{
  const f=createFixture({badHistory:true});const form=nativeForm('Fuera del alcance');
  const event=submitEvent(form);f.api.onSubmitCapture(event);await tick();
  assert.equal(event.state.prevented,true);
  assert.equal(f.logs.length,0);
});

test('F5 integridad PWA: requiere assets de ambos modulos antes de activar worker',()=>{
  const worker=fs.readFileSync(path.join(ROOT,'service-worker.js'),'utf8');
  assert.match(worker,/REQUIRED_OFFLINE_UNITED_ASSETS = \[[\s\S]*modules\/resumen-dia\/resumen-dia\.js/);
  assert.match(worker,/REQUIRED_OFFLINE_COR_ASSETS = \[[\s\S]*modules\/instalaciones-proyectos\/instalaciones-proyectos\.html/);
  assert.match(worker,/Promise\.all\(REQUIRED_OFFLINE_ASSETS\.map\(asset => cache\.add\(asset\)\)\)/);
  assert.match(worker,/caches\.delete\(SHELL_CACHE\)/);
  assert.match(worker,/if \(url\.pathname\.includes\('\/api\/'\)\) return false/);
});

test('F5 privacidad: ACK local tardio de otra identidad no limpia mensaje actual',async()=>{
  const f=createFixture();const form=nativeForm('Conservar mensaje');
  const original=f.storage.enqueueOfflineAction;
  f.storage.enqueueOfflineAction=async(...args)=>{
    const result=await original(...args);
    f.user(500);
    return result;
  };
  const event=submitEvent(form);f.api.onSubmitCapture(event);
  await tick();await tick();
  assert.equal(event.state.prevented,true);
  assert.equal(f.logs.length,1);
  assert.equal(form.input.value,'Conservar mensaje');
  assert.equal(form.notes.length,0);
});
