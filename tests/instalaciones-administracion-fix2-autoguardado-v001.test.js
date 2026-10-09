'use strict';
// [Aster | 2026-10-09 | ASTER-MG | FIX_2_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_V001]
// Offline. DOM/API simulados; no envia escrituras a Azure ni Aiven.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname,'..');
const read = p => fs.readFileSync(path.join(ROOT,p),'utf8');
const src = read('modules/instalaciones-administracion/instalaciones-administracion_cor.js');
const html = read('modules/instalaciones-administracion/instalaciones-administracion_cor.html');
const css = read('modules/instalaciones-administracion/instalaciones-administracion-form_cor.css');

function later(){ let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; }
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const flush=async()=>{await tick();await tick();await tick();};
function element(id){
  const handlers={};
  return {id,dataset:{},hidden:false,disabled:false,value:'',textContent:'',innerHTML:'',handlers,
    addEventListener(type,fn){(handlers[type]??=[]).push(fn);},
    emit(type,event){for(const fn of handlers[type]||[])fn(event||{});},
    classList:{toggle(){}},querySelector(){return null;},querySelectorAll(){return [];},
    removeAttribute(){},setAttribute(){},blur(){},focus(){}};
}
function harness({edit=true,viewer=false,patchHold=null,getAfterCommitError=null,patchFailure=null}={}){
  const names=['view-instalaciones-administracion','iadm-cor-status','iadm-cor-alert',
    'iadm-cor-refresh','iadm-cor-search-btn','iadm-cor-clear','iadm-cor-change-record',
    'iadm-cor-search-input','iadm-cor-search-form','iadm-cor-results','iadm-cor-search-meta',
    'iadm-cor-projects','iadm-cor-project','iadm-cor-selected','iadm-cor-empty',
    'iadm-cor-filter-status','iadm-cor-filter-supervisor','iadm-cor-project-title',
    'iadm-cor-project-meta','iadm-cor-project-pagination','iadm-cor-equipment-list',
    'iadm-cor-equipment-pagination','iadm-cor-group-picker','iadm-cor-groups',
    'iadm-cor-system-grid','iadm-cor-record-title','iadm-cor-record-tags','iadm-cor-form-count',
    'iadm-cor-detail-hint','iadm-cor-back-projects'];
  const nodes=Object.fromEntries(names.map(n=>[n,element(n)]));
  const badges=new Map();
  const view=nodes['view-instalaciones-administracion'];
  view.querySelector=sel=>{
    const m=/^\[data-(field-wrap|autosave-state|autosave-retry|user-hint|field-error|group-dirty)="([^"]+)"\]$/.exec(sel);
    if(!m)return null;
    const key=m[1]+':'+m[2];
    if(!badges.has(key)){const node=element(key);node.hidden=true;badges.set(key,node);}
    return badges.get(key);
  };
  const dListeners={};
  const doc={getElementById(id){
    if(!nodes[id]&&id.startsWith('iadm-cor-input-'))nodes[id]=element(id);
    return nodes[id]||null;
  },addEventListener(type,fn){(dListeners[type]??=[]).push(fn);},
  dispatch(type){for(const fn of dListeners[type]||[])fn({type});}};
  const contract={groups:[
    {key:'proyecto',label:'Proyecto',fields:['proyecto','id_proyecto','estatus','activo'],editable_fields:['proyecto','id_proyecto','estatus','activo'],permissions:{can_view:true,can_edit:edit}},
    {key:'seguimiento',label:'Seguimiento',fields:['comentarios_fl','fecha_visita'],editable_fields:['comentarios_fl','fecha_visita'],permissions:{can_view:true,can_edit:edit}},
    {key:'responsables',label:'Responsables',fields:['id_sup'],editable_fields:['id_sup'],permissions:{can_view:true,can_edit:edit}},
    {key:'costos',label:'Costos',fields:['presupuesto_mantenimiento_cem'],editable_fields:['presupuesto_mantenimiento_cem'],permissions:{can_view:true,can_edit:false}}
  ],field_meta:{proyecto:{kind:'text'},id_proyecto:{kind:'text'},estatus:{kind:'text'},activo:{kind:'boolean'},
    comentarios_fl:{kind:'textarea'},fecha_visita:{kind:'date'},id_sup:{kind:'user'},presupuesto_mantenimiento_cem:{kind:'money'}},
    system_readonly_fields:['id_ins_fl','created_at','updated_at']};
  let row={id_ins_fl:7,proyecto:'P200',id_proyecto:'P200',estatus:'En proceso',activo:1,
    comentarios_fl:'Antes',fecha_visita:'2026-10-01',id_sup:5,presupuesto_mantenimiento_cem:'55'};
  let session='qa-token', committed=0, patchCounter=0;
  const calls=[];
  const auth={getToken:()=>session,getActorUser:()=>({id_SB:100}),getUser:()=>({id_SB:100}),
    getViewUser:()=>viewer?({id_SB:2}):null,isViewingAs:()=>viewer,
    async api(url,opt={}){
      calls.push({url,opt});
      if(url.endsWith('/contrato'))return contract;
      if(url.endsWith('/filtros'))return {permisos:{estatus:true,supervisor:true},estatus:['En proceso','Terminado'],supervisores:[]};
      if(url.includes('/proyectos?'))return {data:[],total:0};
      if(url.endsWith('/usuarios'))return {data:[{id_SB:5,nombre:'Cinco'},{id_SB:6,nombre:'Seis'}]};
      if(url.endsWith('/registros/7')){
        if(committed&&getAfterCommitError){throw getAfterCommitError;}
        return {ok:true,data:{...row}};
      }
      const match=/\/registros\/7\/grupos\/([^/?]+)$/.exec(url);
      if(match){
        patchCounter++;
        const payload=JSON.parse(opt.body);
        assert.equal(opt.method,'PATCH');
        assert.equal(Object.keys(payload.changes).length,1,'un campo por PATCH');
        assert.equal(Object.keys(payload.expected).length,1,'expected del mismo campo');
        if(patchFailure){const error=await patchFailure({number:patchCounter,payload});if(error)throw error;}
        if(patchHold)await patchHold.promise;
        for(const [key,value] of Object.entries(payload.changes)){
          const stored=row[key]==null?null:String(row[key]);
          const exp=payload.expected[key]==null?null:String(payload.expected[key]);
          assert.equal(stored,exp,'expected debe corresponder al ultimo estado');
          row[key]=value;
        }
        committed++;
        return {ok:true,changed:true,audit:'RECORDED_ATOMICALLY'};
      }
      throw Error('Endpoint desconocido: '+url);
    }};
  const win={ManttoAuth:auth,ManttoPermissions:{apply(){}},
    ManttoRouter:{getCurrent:()=>({route:'instalaciones-administracion'})},confirm(){return true;}};
  const context=vm.createContext({window:win,document:doc,Promise,Date,Number,String,Boolean,Object,Array,
    URLSearchParams,Map,Set,fetch:async()=>({ok:true,text:async()=>'<div>UI</div>'})});
  vm.runInContext(src,context);
  const field=(name,value,event='input')=>{
    const node=doc.getElementById('iadm-cor-input-'+name);node.value=value;
    view.emit(event,{target:node});
    // Programmatic elements start with empty dataset; bind the field identity.
  };
  const put=(name,value,event='input')=>{
    const node=doc.getElementById('iadm-cor-input-'+name);node.value=value;node.dataset.fieldControl=name;
    view.emit(event,{target:node});return node;
  };
  const blur=name=>view.emit('focusout',{target:doc.getElementById('iadm-cor-input-'+name)});
  const change=(name,value)=>put(name,value,'change');
  const retry=name=>view.emit('click',{target:{closest(selector){
    return selector==='[data-autosave-retry]'?{dataset:{autosaveRetry:name}}:null;
  }}});
  const badge=(kind,name)=>view.querySelector(`[data-${kind}="${name}"]`);
  const form=()=>view.emit('submit',{target:{id:'iadm-cor-edit-form'},preventDefault(){}});
  return {view,nodes,badge,auth,calls,doc,put,blur,change,retry,form,
    get row(){return row;},get committed(){return committed;},get patchCounter(){return patchCounter;},
    expire(){session=null;doc.dispatch('mantto:session-expired');},
    async init(){await win.ManttoInstalacionesAdministracion_cor.init({id:7});},
    reload:()=>win.ManttoInstalacionesAdministracion_cor.refresh({force:true})};
}
function patches(h){return h.calls.filter(x=>x.opt.method==='PATCH');}
function error(status,message='error') {return Object.assign(new Error(message),{status,code:status===409?'INSTALACIONES_ADMINISTRACION_CONFLICTO_CONCURRENCIA':'ERROR_QA'});}

test('FIX2: formulario fantasma no requiere Editar ni ofrece Guardar individual',async()=>{
  const h=harness();await h.init();
  const body=h.nodes['iadm-cor-groups'].innerHTML;
  assert.match(body,/iadm-cor-ghost-detail iadm-cor-autosave/);
  assert.match(body,/data-field-control="estatus"/);
  assert.match(body,/data-field-control="id_proyecto"/);
  assert.match(body,/data-autosave-state="estatus"/);
  assert.doesNotMatch(body,/Guardar cambios del equipo|id="iadm-cor-save-btn"|data-action="start-edit"/);
  assert.match(html,/20261009-autoguardado-fix2-v001/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.equal(patches(h).length,0);
});

test('FIX2: texto no guarda por tecla ni submit; blur genera un PATCH + GET inmediato',async()=>{
  const h=harness();await h.init();
  h.put('estatus','Terminado');h.form();await flush();
  assert.equal(patches(h).length,0);
  h.blur('estatus');await flush();
  assert.equal(patches(h).length,1);
  const payload=JSON.parse(patches(h)[0].opt.body);
  assert.deepEqual(payload,{changes:{estatus:'Terminado'},expected:{estatus:'En proceso'}});
  assert.match(patches(h)[0].url,/\/registros\/7\/grupos\/proyecto$/);
  assert.equal(h.row.estatus,'Terminado');
  const calls=h.calls.map(x=>x.url);
  assert.equal(calls.filter(x=>x.endsWith('/registros/7')).length,2,'GET inicial y GET posterior');
  assert.ok(calls.lastIndexOf('/api/instalaciones/administracion/registros/7')>calls.indexOf(patches(h)[0].url));
  assert.equal(h.badge('autosave-state','estatus').textContent,'Guardado');
});

test('FIX2: salir sin diferencias o con el mismo valor no envia PATCH',async()=>{
  const h=harness();await h.init();
  h.put('estatus','En proceso');h.blur('estatus');await flush();
  assert.equal(patches(h).length,0);
  assert.equal(h.committed,0);
});

test('FIX2: selector e input de fecha guardan en change, no cada input',async()=>{
  const h=harness();await h.init();
  h.change('activo','0');await flush();
  h.change('fecha_visita','2026-10-03');await flush();
  assert.equal(patches(h).length,2);
  assert.deepEqual(JSON.parse(patches(h)[0].opt.body),{changes:{activo:0},expected:{activo:1}});
  assert.deepEqual(JSON.parse(patches(h)[1].opt.body),{changes:{fecha_visita:'2026-10-03'},expected:{fecha_visita:'2026-10-01'}});
  assert.equal(h.row.fecha_visita,'2026-10-03');
});

test('FIX2: serializa PATCH concurrentes, no pierde otros borradores',async()=>{
  const held=later();const h=harness({patchHold:held});await h.init();
  h.put('estatus','Terminado');h.blur('estatus');
  await tick();
  h.put('comentarios_fl','Nuevo comentario');h.blur('comentarios_fl');
  await tick();
  assert.equal(patches(h).length,1,'el segundo PATCH espera el primero');
  assert.equal(h.nodes['iadm-cor-input-comentarios_fl'].value,'Nuevo comentario');
  held.resolve();await flush();
  assert.equal(patches(h).length,2);
  assert.equal(h.row.estatus,'Terminado');
  assert.equal(h.row.comentarios_fl,'Nuevo comentario');
});

test('FIX2: cambios consecutivos del mismo campo usan expected confirmado mas reciente',async()=>{
  const held=later();const h=harness({patchHold:held});await h.init();
  h.put('estatus','Terminado');h.blur('estatus');await tick();
  h.put('estatus','Reprogramado');h.blur('estatus');await tick();
  assert.equal(patches(h).length,1);
  held.resolve();await flush();
  assert.equal(patches(h).length,2);
  assert.deepEqual(JSON.parse(patches(h)[1].opt.body),{changes:{estatus:'Reprogramado'},expected:{estatus:'Terminado'}});
  assert.equal(h.row.estatus,'Reprogramado');
});

test('FIX2: validacion local no envia fechas invalidas ni campos sin EDITAR',async()=>{
  const h=harness();await h.init();
  h.put('fecha_visita','2026-02-30');h.blur('fecha_visita');
  h.put('presupuesto_mantenimiento_cem','800');h.blur('presupuesto_mantenimiento_cem');await flush();
  assert.equal(patches(h).length,0);
  assert.match(h.badge('autosave-state','fecha_visita').textContent,/Fecha invalida/);
});

test('FIX2: sin permiso de editar y modo Visor, no genera PATCH',async()=>{
  for(const options of [{edit:false},{viewer:true}]){
    const h=harness(options);await h.init();
    assert.doesNotMatch(h.nodes['iadm-cor-groups'].innerHTML,/id="iadm-cor-edit-form"/);
    h.put('estatus','Terminado');h.blur('estatus');await flush();
    assert.equal(patches(h).length,0);
  }
});

test('FIX2: 409 no hace reintentos silenciosos ni manda cambios posteriores',async()=>{
  const h=harness({patchFailure:async()=>error(409,'Actualizacion externa')});await h.init();
  h.put('estatus','Terminado');h.blur('estatus');await flush();
  h.put('comentarios_fl','Nuevo');h.blur('comentarios_fl');await flush();
  assert.equal(patches(h).length,1);
  assert.match(h.nodes['iadm-cor-status'].textContent,/Conflicto/);
  assert.equal(h.badge('autosave-retry','estatus').hidden,true);
});

test('FIX2: error de validacion permite reintento explicito conservando captura',async()=>{
  const h=harness({patchFailure:async({number})=>number===1?error(400,'Valor no valido'):null});await h.init();
  h.put('estatus','Propuesta');h.blur('estatus');await flush();
  assert.equal(h.nodes['iadm-cor-input-estatus'].value,'Propuesta');
  assert.match(h.badge('autosave-state','estatus').textContent,/Valor no valido/);
  assert.equal(h.badge('autosave-retry','estatus').hidden,false);
  await flush();assert.equal(patches(h).length,1);
  h.retry('estatus');await flush();
  assert.equal(patches(h).length,2);
  assert.equal(h.row.estatus,'Propuesta');
  assert.equal(h.badge('autosave-state','estatus').textContent,'Guardado');
});

test('FIX2: PATCH confirmado pero GET falla: no presenta Guardado ni reintenta a ciegas',async()=>{
  const h=harness({getAfterCommitError:error(502,'Error en relectura')});await h.init();
  h.put('estatus','Terminado');h.blur('estatus');await flush();
  assert.equal(h.committed,1);
  assert.match(h.badge('autosave-state','estatus').textContent,/no se pudo comprobar/);
  h.blur('estatus');await flush();
  assert.equal(patches(h).length,1);
});

test('FIX2: alcance revocado despues del PATCH purga ficha sensible y recupera proyectos',async()=>{
  const h=harness({getAfterCommitError:error(404,'Alcance revocado')});await h.init();
  h.put('id_proyecto','Otro');h.blur('id_proyecto');await flush();
  assert.equal(h.committed,1);
  assert.equal(h.nodes['iadm-cor-selected'].hidden,true);
  assert.equal(h.nodes['iadm-cor-groups'].innerHTML,'');
  assert.match(h.nodes['iadm-cor-alert'].textContent,/ya no esta disponible/);
  assert.equal(patches(h).length,1);
});

test('FIX2: al caducar sesion durante guardado no renderiza datos obsoletos',async()=>{
  const hold=later();const h=harness({patchHold:hold});await h.init();
  h.put('estatus','Terminado');h.blur('estatus');await tick();
  h.expire();hold.resolve();await flush();
  assert.equal(h.nodes['iadm-cor-groups'].innerHTML,'');
  assert.equal(h.nodes['iadm-cor-selected'].hidden,true);
  assert.equal(patches(h).length,1);
});

test('FIX2: persistencia local prohibida, PWA responsive y lote permanece manual',()=>{
  assert.doesNotMatch(src,/localStorage|sessionStorage/);
  assert.match(src,/equipos\/edicion-multiple/);
  assert.match(src,/saveBulk_cor\(\)/);
  assert.match(css,/\.iadm-cor-autosave/);
  assert.match(css,/@media\(max-width:760px\)/);
});
