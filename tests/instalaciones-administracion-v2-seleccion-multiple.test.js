'use strict';
// QA aislado: usa archivos REALES del FIX y simula navegador/API. No hace
// consultas a Aiven, no modifica GitHub ni ejecuta Express/Azure.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const relative='../modules/instalaciones-administracion/';
const source=fs.readFileSync(path.join(__dirname,relative,'instalaciones-administracion-ghost_cor.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,relative,'instalaciones-administracion-ghost_cor.css'),'utf8');
const {create,helpers:h}=require(path.join(__dirname,relative,'instalaciones-administracion-ghost_cor.js'));
const groups=[
  {key:'proyecto',fields:['id_ins_fl','id_proyecto','proyecto','estatus','estatus_completo'],editable_fields:['estatus'],permissions:{can_view:true,can_edit:true}},
  {key:'seguimiento',fields:['comentarios_fl','fecha_visita','dias_sin_visita'],editable_fields:['comentarios_fl','fecha_visita'],permissions:{can_view:true,can_edit:true}},
  {key:'cliente_contrato',fields:['vendedor','fecha_liberacion_ajuste'],editable_fields:['vendedor','fecha_liberacion_ajuste'],permissions:{can_view:true,can_edit:true}},
  {key:'responsables',fields:['supervisor_fl','id_sup','id_asesor','id_admin'],editable_fields:['supervisor_fl'],permissions:{can_view:true,can_edit:true}}
];
const CATALOG={estatus:[{codigo:'01-SUS',nombre:'Suspendido'},{codigo:'08-T',nombre:'Terminado'}],
  vendedores:[{id_SB:10,iniciales:'V1'}],supervisores:[{id_SB:20,iniciales:'S1'}]};
const fieldColumns=['id_ins_fl','id_proyecto','estatus','estatus_completo','comentarios_fl',
  'fecha_visita','dias_sin_visita','vendedor','supervisor_fl','id_sup','fecha_liberacion_ajuste'];
const rows=id=>({id_ins_fl:id,id_proyecto:'P10152',referencia_sitio:'R'+id,
  estatus:id===1?'01-SUS':'08-T',estatus_completo:'Estado',comentarios_fl:'Original '+id,
  fecha_visita:'2026-10-12',dias_sin_visita:'1',vendedor:'V1',supervisor_fl:'S1',
  id_sup:20,fecha_liberacion_ajuste:'SI'});
const comparable=(_field,value)=>value==null||value===''?null:String(value).trim();
const escape=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');

for(const [name,fn] of [
  ['01 helper disponible y limites 2-20',()=>{
    assert.equal(h.MAX_MULTI,20);
    assert.equal(typeof h.buildMultiPayload_cor,'function');
    assert.equal(typeof h.persistVerifiedMulti_cor,'function');
  }],
  ['02 columnas IDs siguen sin mostrarse, calculados visibles',()=>{
    assert.deepEqual(h.visibleColumns_cor(fieldColumns,groups).filter(f=>f.startsWith('id_')),[]);
    assert.ok(h.visibleColumns_cor(fieldColumns,groups).includes('dias_sin_visita'));
    assert.ok(h.visibleColumns_cor(fieldColumns,groups).includes('estatus_completo'));
  }],
  ['03 transaccion: expected de cada equipo, una columna',()=>{
    assert.deepEqual(h.buildMultiPayload_cor('P:P10152',[rows(2),rows(1)],'estatus','08-T'),{
      ids:[1,2],changes:{estatus:'08-T'},expected:{'1':{estatus:'01-SUS'},'2':{estatus:'08-T'}}
    });
  }],
  ['04 lote de 1 prohibido',()=>{
    assert.throws(()=>h.buildMultiPayload_cor('P:P10152',[rows(1)],'estatus','08-T'),{code:'ADMIN_V3_INVALID_BATCH'});
  }],
  ['05 lote 20 permitido',()=>{
    const payload=h.buildMultiPayload_cor('P:P10152',Array.from({length:20},(_,i)=>rows(i+1)),
      'comentarios_fl','X');
    assert.equal(payload.ids.length,20);
  }],
  ['06 lote 21 prohibido',()=>{
    assert.throws(()=>h.buildMultiPayload_cor('P:P10152',Array.from({length:21},(_,i)=>rows(i+1)),
      'comentarios_fl','X'),{code:'ADMIN_V3_INVALID_BATCH'});
  }],
  ['07 IDs duplicados prohibidos',()=>{
    assert.throws(()=>h.buildMultiPayload_cor('P:P10152',[rows(1),rows(1)],'estatus','08-T'),
      {code:'ADMIN_V3_INVALID_BATCH_ROW'});
  }],
  ['08 no mezclar proyectos',()=>{
    assert.throws(()=>h.buildMultiPayload_cor('P:P10152',[rows(1),{...rows(2),id_proyecto:'OTRO'}],
      'estatus','08-T'),{code:'ADMIN_V3_INVALID_BATCH_ROW'});
  }],
  ['09 proyecto sin PP NS no permite lote',()=>{
    assert.throws(()=>h.buildMultiPayload_cor('R:55',[rows(1),rows(2)],'estatus','08-T'),
      {code:'ADMIN_V3_INVALID_BATCH'});
  }],
  ['10 derivados e identificadores protegidos',()=>{
    for(const f of [...h.HIDDEN_FIELDS,...h.DERIVED_FIELDS,'rel_admin'])
      assert.throws(()=>h.buildMultiPayload_cor('P:P10152',[rows(1),rows(2)],f,'X'));
  }],
  ['11 valor no escalar denegado',()=>{
    assert.throws(()=>h.buildMultiPayload_cor('P:P10152',[rows(1),rows(2)],'estatus',{mal:'x'}),
      {code:'ADMIN_V3_INVALID_BATCH'});
  }],
  ['12 equipo sin valor original falla cerrado',()=>{
    const original=rows(2);delete original.estatus;
    assert.throws(()=>h.buildMultiPayload_cor('P:P10152',[rows(1),original],
      'estatus','08-T'),{code:'ADMIN_V3_INVALID_BATCH_ROW'});
  }],
  ['13 mantener null original de la celda',()=>{
    const r1=rows(1);r1.comentarios_fl=null;
    const payload=h.buildMultiPayload_cor('P:P10152',[r1,rows(2)],'comentarios_fl','Nuevo');
    assert.deepEqual(payload.expected['1'],{comentarios_fl:null});
  }],
  ['14 fecha_liberacion_ajuste sigue siendo texto',()=>{
    assert.deepEqual(h.validValue_cor('fecha_liberacion_ajuste','13/10/2026',{kind:'text'}),{ok:true,value:'13/10/2026'});
  }],
  ['15 CSS barra sticky y boton fuera de scroll horizontal',()=>{
    assert.match(css,/\.iadm-cor-v3-toolbar\s*\{\s*position:sticky/);
    assert.match(css,/\.iadm-cor-matrix \[data-iadm-v3-select-column\]\s*\{[\s\S]*?position:sticky;left:0/);
    assert.doesNotMatch(css,/(?:^|\n)\s*body\s*\{/);
  }],
  ['16 no usa storage ni permisos locales',()=>{
    assert.doesNotMatch(source,/\blocalStorage\s*\./);
    assert.doesNotMatch(source,/\bsessionStorage\s*\./);
    assert.match(source,/canEditCell/);
  }]
])test(name,fn);

const makeMultiApi = ({status=0,readErrorId=0,failResponse=false,readMismatchId=0}={})=>{
  const calls=[];const records=new Map([rows(1),rows(2),rows(3)].map(row=>[row.id_ins_fl,row]));
  const api=async (url,config={})=>{
    calls.push({url,config});
    if(config.method==='PATCH'){
      if(status)throw Object.assign(new Error('Operacion rechazada'),{status});
      const body=JSON.parse(config.body);
      if(failResponse)return {ok:true,selected:body.ids.length,records:[]};
      for(const id of body.ids){const before=records.get(id);
        for(const [field,old] of Object.entries(body.expected[String(id)])){
          if(comparable(field,before[field])!==comparable(field,old))throw Object.assign(new Error('Conflicto'),{status:409});
        }
      }
      for(const id of body.ids)Object.assign(records.get(id),body.changes);
      return {ok:true,selected:body.ids.length,updated:body.ids.length,
        records:body.ids.map(id=>({id_ins_fl:id,changed:true}))};
    }
    const match=url.match(/\/registros\/(\d+)$/);
    if(match){const id=Number(match[1]);
      if(id===readErrorId)throw Object.assign(new Error('Scope perdido'),{status:404});
      const row={...records.get(id)};
      if(id===readMismatchId)row.estatus='01-SUS';
      return {ok:true,data:row};
    }
    throw new Error('GET inesperado '+url);
  };
  return {api,calls,records};
};

for(const [name,fn] of [
  ['17 PATCH lote una vez y 2 GET; expected de ambas filas',async()=>{
    const fake=makeMultiApi();
    const result=await h.persistVerifiedMulti_cor(fake.api,{projectKey:'P:P10152',selectedRows:[rows(2),rows(1)],
      field:'estatus',value:'08-T',canonicalCompare:comparable});
    assert.equal(result.verified.size,2);
    assert.equal(fake.calls.filter(x=>x.config.method==='PATCH').length,1);
    assert.equal(fake.calls.filter(x=>x.url.includes('/registros/')).length,2);
    assert.match(fake.calls[0].url,/equipos\/edicion-multiple-directa$/);
    const sent=JSON.parse(fake.calls[0].config.body);
    assert.deepEqual(sent.expected,{'1':{estatus:'01-SUS'},'2':{estatus:'08-T'}});
  }],
  ['18 conflicto 409 no hace GET ni reintento',async()=>{
    const fake=makeMultiApi({status:409});
    await assert.rejects(h.persistVerifiedMulti_cor(fake.api,{projectKey:'P:P10152',selectedRows:[rows(1),rows(2)],
      field:'estatus',value:'08-T',canonicalCompare:comparable}),{status:409,uncertain:false});
    assert.equal(fake.calls.length,1);
  }],
  ['19 timeout deja resultado incierto sin reintentar',async()=>{
    let calls=0;
    await assert.rejects(h.persistVerifiedMulti_cor(async()=>{calls++;throw new Error('Timeout');},
      {projectKey:'P:P10152',selectedRows:[rows(1),rows(2)],field:'estatus',value:'08-T',canonicalCompare:comparable}),
      {uncertain:true});
    assert.equal(calls,1);
  }],
  ['20 respuesta incompleta bloquea GET/reintento',async()=>{
    const fake=makeMultiApi({failResponse:true});
    await assert.rejects(h.persistVerifiedMulti_cor(fake.api,{projectKey:'P:P10152',selectedRows:[rows(1),rows(2)],
      field:'estatus',value:'08-T',canonicalCompare:comparable}),
      {code:'ADMIN_V3_PATCH_NOT_CONFIRMED',uncertain:true});
    assert.equal(fake.calls.length,1);
  }],
  ['21 GET con scope perdido no reintenta PATCH',async()=>{
    const fake=makeMultiApi({readErrorId:2});
    await assert.rejects(h.persistVerifiedMulti_cor(fake.api,{projectKey:'P:P10152',selectedRows:[rows(1),rows(2)],
      field:'estatus',value:'08-T',canonicalCompare:comparable}),{committed:true,status:404});
    assert.equal(fake.calls.filter(x=>x.config.method==='PATCH').length,1);
  }],
  ['22 GET divergente despues del PATCH requiere revision',async()=>{
    const fake=makeMultiApi({readMismatchId:2});
    await assert.rejects(h.persistVerifiedMulti_cor(fake.api,{projectKey:'P:P10152',selectedRows:[rows(1),rows(2)],
      field:'estatus',value:'08-T',canonicalCompare:comparable}),
      {code:'ADMIN_V3_RECHECK_MISMATCH',committed:true});
  }],
  ['23 GET en lotes de cuatro, comprueba los 20',async()=>{
    const fake=makeMultiApi();
    for(let i=4;i<=20;i++)fake.records.set(i,rows(i));
    const result=await h.persistVerifiedMulti_cor(fake.api,{projectKey:'P:P10152',
      selectedRows:Array.from({length:20},(_,i)=>rows(i+1)),field:'comentarios_fl',value:'Lote',canonicalCompare:comparable});
    assert.equal(result.verified.size,20);
    assert.equal(fake.calls.length,21);
  }]
])test(name,fn);

// Navegador DOM minimo: prueba el flujo de eventos del helper real. Sin jsdom.
function fixture({permission=true,rowsVisible=[1,2,3],projectKey='P:P10152',confirmResult=true}={}) {
  const oldWindow=global.window,oldDocument=global.document;
  const listeners=new Map(),calls=[],database=new Map([rows(1),rows(2),rows(3),rows(4)].map(r=>[r.id_ins_fl,r]));
  let input=null,editMarkup='',confirmCalls=0,blockPatch=false,readForbidden=false;
  let holdPatch=false,releasePendingPatch=null;
  const state={page:'equipos',records:rowsVisible.map(id=>({...database.get(id)})),
    selectedProject:{project_key:projectKey,proyecto:'Obra'},projectRecordsTotal:4,
    tableColumns:fieldColumns,equipmentOffset:0,loading:false,saving:false};
  const host={innerHTML:'',querySelector:()=>null};
  const nodes={'iadm-cor-equipment-list':host,'iadm-cor-project-title':{textContent:''},
    'iadm-cor-bulk-bar':{hidden:false}};
  const cell={replaceWith(newTd){
    editMarkup=newTd.markup;
    if(editMarkup.includes('data-iadm-v2-control'))input={value:'',disabled:false,
      matches:selector=>selector==='[data-iadm-v2-control]',focus(){},dataset:{}};
    else input=null;
  }};
  const clear={disabled:false,setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];}};
  const root={
    addEventListener(type,handler){const list=listeners.get(type)||[];list.push(handler);listeners.set(type,list);},
    contains(){return true;},
    querySelector(selector){
      if(selector==='[data-iadm-v2-message]')return {textContent:'',dataset:{}};
      if(selector==='[data-iadm-v2-error]')return {textContent:'',hidden:true};
      if(selector==='[data-iadm-v3-clear]')return clear;
      if(selector.includes('data-iadm-v2-control'))return input;
      if(selector.includes('data-iadm-ghost-cell'))return cell;
      return null;
    }
  };
  global.document={createElement(tag){assert.equal(tag,'tbody');return {
    set innerHTML(value){this.markup=value;},querySelector(sel){assert.equal(sel,'td');return {markup:this.markup};}
  };}};
  global.window={
    confirm(){confirmCalls++;return confirmResult;},
    ManttoRouter:{getCurrent:()=>({route:'instalaciones-administracion'})},
    ManttoAuth:{getToken:()=> 'jwt-simulado',api:async (url,options={})=>{
      calls.push({url,options});
      if(url.endsWith('catalogos-edicion'))return {ok:true,...CATALOG};
      if(options.method==='PATCH'){
        if(holdPatch)await new Promise(resolve=>{releasePendingPatch=resolve;});
        if(blockPatch)throw Object.assign(new Error('Conflicto'),{status:409});
        const payload=JSON.parse(options.body);
        const ids=payload.ids || [Number(url.match(/equipos\/(\d+)\/edicion-directa/)[1])];
        for(const id of ids)Object.assign(database.get(id),payload.changes);
        return {ok:true,selected:ids.length,updated:ids.length,
          records:ids.map(id=>({id_ins_fl:id,changed:true}))};
      }
      const get=url.match(/\/registros\/(\d+)$/);
      if(get){if(readForbidden)throw Object.assign(new Error('Scope perdido'),{status:404});
        return {ok:true,data:{...database.get(Number(get[1]))}};
      }
      if(url.includes('/equipos/tabla?')){
        return {ok:true,data:state.records.map(row=>({...database.get(Number(row.id_ins_fl))})),
          total:4,columns:fieldColumns};
      }
      throw new Error('Ruta no simulada '+url);
    }}
  };
  const realGroups=groups.map(g=>({...g,permissions:{can_view:true,can_edit:permission}}));
  const helper=create({st:state,$:key=>nodes[key],view:()=>root,groups:()=>realGroups,
    canEdit:g=>g.permissions.can_edit,esc:escape,label:s=>s,
    meta:field=>({kind:field==='fecha_visita'?'date':'text'}),
    display:(_f,v)=>String(v??''),isoDate:s=>String(s??''),
    previewNumber:s=>String(s??''),canonicalCompare:comparable,
    pager:()=>{},isViewingAs:()=>false,currentContext:()=> 'actor:18',announce:()=>{}});
  helper.bind(root);helper.render();
  function fire(type,target,extra={}){
    const event={target,preventDefault(){this.defaultPrevented=true;},
      stopImmediatePropagation(){this.stopped=true;},...extra};
    for(const listener of listeners.get(type)||[])listener(event);
    return event;
  }
  function check(id,checked=true){
    const target={checked,dataset:{iadmV3SelectId:String(id)},
      matches:s=>s==='[data-iadm-v3-select]',closest:()=>null};
    fire('change',target);return target;
  }
  function open(id,field){
    const button={dataset:{iadmGhostId:String(id),iadmGhostField:field}};
    fire('click',{closest:s=>s==='[data-iadm-ghost-action="edit"]'?button:null});
  }
  function deselect(){
    const button={closest:s=>s==='[data-iadm-v3-clear]'?{}:null};
    fire('click',button);
  }
  function write(value){if(!input)throw new Error('No hay editor abierto');
    input.value=value;fire('input',input);
  }
  function enter(){if(!input)throw new Error('No hay editor abierto');fire('keydown',input,{key:'Enter'});}
  function escapeEdit(){if(!input)throw new Error('No hay editor abierto');fire('keydown',input,{key:'Escape'});}
  const wait=()=>new Promise(r=>setTimeout(r,20));
  function restore(){global.window=oldWindow;global.document=oldDocument;}
  return {helper,state,host,calls,database,check,open,deselect,write,enter,escapeEdit,wait,restore,
    get input(){return input;},get editMarkup(){return editMarkup;},
    get confirmCalls(){return confirmCalls;},
    set blockPatch(v){blockPatch=v;},set readForbidden(v){readForbidden=v;},
    set holdPatch(v){holdPatch=v;},releasePatch(){if(releasePendingPatch){
      const release=releasePendingPatch;releasePendingPatch=null;release();}},
    fire};
}

test('24: casilla como primera columna, boton en zona derecha antigua, visible fuera de scroll',()=>{
  const f=fixture();
  try{
    const html=f.host.innerHTML;
    assert.match(html,/<div class="iadm-cor-ghost-toolbar[\s\S]+?data-iadm-v3-clear="1"/);
    const clearAt=html.indexOf('data-iadm-v3-clear="1"');
    const scrollAt=html.indexOf('class="iadm-cor-matrix-scroll"');
    assert.ok(clearAt>=0&&clearAt<scrollAt);
    assert.ok(html.indexOf('data-iadm-v3-select-column="1"')<html.indexOf('<th scope="col" title="estatus"'));
    assert.match(html,/Deseleccionar todo/);assert.doesNotMatch(html,/Descartar cambios/);
    assert.match(html,/0 de 4 equipos seleccionados/);
  }finally{f.restore();}
});

test('25: dos checks activan lote, 1 confirmacion, 1 PATCH, GET y recarga',async()=>{
  const f=fixture();
  try{
    f.check(1);f.check(2);
    assert.match(f.host.innerHTML,/2 de 4 equipos seleccionados/);
    f.open(1,'comentarios_fl');f.write('Nuevo valor en lote');f.enter();await f.wait();
    const patches=f.calls.filter(x=>x.options.method==='PATCH');
    assert.equal(f.confirmCalls,1);assert.equal(patches.length,1);
    const body=JSON.parse(patches[0].options.body);
    assert.deepEqual(body.ids,[1,2]);
    assert.equal(body.expected['1'].comentarios_fl,'Original 1');
    assert.equal(body.expected['2'].comentarios_fl,'Original 2');
    assert.equal(f.database.get(1).comentarios_fl,'Nuevo valor en lote');
    assert.equal(f.database.get(2).comentarios_fl,'Nuevo valor en lote');
    assert.ok(f.calls.filter(x=>x.url.includes('/registros/')).length>=2);
    assert.ok(f.calls.some(x=>x.url.includes('/equipos/tabla?')));
    assert.match(f.host.innerHTML,/2 de 4 equipos seleccionados/);
  }finally{f.restore();}
});

test('26: cancelacion del confirm no genera PATCH ni escribe datos',async()=>{
  const f=fixture({confirmResult:false});
  try{
    f.check(1);f.check(2);f.open(1,'comentarios_fl');f.write('NO');f.enter();await f.wait();
    assert.equal(f.confirmCalls,1);
    assert.equal(f.calls.filter(x=>x.options.method==='PATCH').length,0);
    assert.equal(f.database.get(1).comentarios_fl,'Original 1');
    assert.match(f.host.innerHTML,/2 de 4 equipos seleccionados/);
  }finally{f.restore();}
});

test('27: la lista con dos valores diferentes inicia en blanco, no sobreescribe al entrar',async()=>{
  const f=fixture();
  try{
    f.check(1);f.check(2);f.open(1,'estatus');await f.wait();
    assert.match(f.editMarkup,/Los equipos tienen valores distintos/);
    assert.match(f.editMarkup,/Editar 2 equipos/);
    assert.equal(f.calls.filter(x=>x.options.method==='PATCH').length,0);
  }finally{f.restore();}
});

test('28: deseleccionar no hace PATCH; conserva el boton y elimina marcas',()=>{
  const f=fixture();
  try{
    f.check(1);f.check(2);f.deselect();
    assert.match(f.host.innerHTML,/0 de 4 equipos seleccionados/);
    assert.doesNotMatch(f.host.innerHTML,/data-iadm-v3-selected="1"/);
    assert.equal(f.calls.filter(x=>x.options.method==='PATCH').length,0);
    assert.match(f.host.innerHTML,/Deseleccionar todo/);
  }finally{f.restore();}
});

test('29: deseleccionar con celda sin enviar cancela el valor local y no guarda',async()=>{
  const f=fixture();
  try{
    f.check(1);f.check(2);f.open(1,'comentarios_fl');f.write('Descartar local');f.deselect();await f.wait();
    assert.equal(f.calls.filter(x=>x.options.method==='PATCH').length,0);
    assert.equal(f.database.get(1).comentarios_fl,'Original 1');
    assert.equal(f.helper.hasPending(),false);
    assert.match(f.host.innerHTML,/0 de 4 equipos seleccionados/);
  }finally{f.restore();}
});

test('30: un solo check conserva el autoguardado INDIVIDUAL sin confirmacion',async()=>{
  const f=fixture();
  try{
    f.check(1);f.open(1,'comentarios_fl');f.write('Solo equipo uno');f.enter();await f.wait();
    const patches=f.calls.filter(x=>x.options.method==='PATCH');
    assert.equal(f.confirmCalls,0);assert.equal(patches.length,1);
    assert.match(patches[0].url,/equipos\/1\/edicion-directa$/);
    assert.equal(f.database.get(2).comentarios_fl,'Original 2');
  }finally{f.restore();}
});

test('31: con lote activo celda NO seleccionada carece de boton Editar',()=>{
  const f=fixture();
  try{
    f.check(1);f.check(2);
    const row3=f.host.innerHTML.match(/<tr data-equipment-id="3"[\s\S]*?<\/tr>/)?.[0];
    assert.ok(row3);assert.doesNotMatch(row3,/data-iadm-ghost-action="edit"/);
    assert.match(f.host.innerHTML,/2 de 4 equipos seleccionados/);
  }finally{f.restore();}
});

test('32: seleccion conserva equipos al cambiar de pagina y usa expected del snapshot',async()=>{
  const f=fixture({rowsVisible:[1,2]});
  try{
    f.check(1);
    // La pagina se mueve sin abandonar el proyecto; el helper retiene el ID y valor original.
    f.state.records=[{...f.database.get(3)},{...f.database.get(4)}];
    f.state.equipmentOffset=30;f.helper.render();
    f.check(3);
    assert.match(f.host.innerHTML,/2 de 4 equipos seleccionados/);
    f.open(3,'comentarios_fl');f.write('Diferentes paginas');f.enter();await f.wait();
    const patches=f.calls.filter(x=>x.options.method==='PATCH');
    assert.equal(patches.length,1);
    assert.deepEqual(JSON.parse(patches[0].options.body).ids,[1,3]);
  }finally{f.restore();}
});

test('33: 20 seleccionados bloquean casillas adicionales y el boton sigue visible',()=>{
  const f=fixture();
  try{
    f.state.projectRecordsTotal=21;
    f.state.records=Array.from({length:21},(_,i)=>rows(i+1));
    f.helper.render();
    for(let id=1;id<=20;id++)f.check(id);
    assert.match(f.host.innerHTML,/20 de 21 equipos seleccionados/);
    const row21=f.host.innerHTML.match(/<tr data-equipment-id="21"[\s\S]*?<\/tr>/)?.[0];
    assert.match(row21,/data-iadm-v3-select-id="21"[^>]* disabled/);
    f.check(21);assert.match(f.host.innerHTML,/20 de 21 equipos seleccionados/);
  }finally{f.restore();}
});

test('34: sin permiso EDITAR checkboxes estan deshabilitados',()=>{
  const f=fixture({permission:false});
  try{
    const match=f.host.innerHTML.match(/data-iadm-v3-select-id="1"[^>]* disabled/);
    assert.ok(match);
    assert.equal(f.host.innerHTML.includes('data-iadm-ghost-action="edit"'),false);
  }finally{f.restore();}
});

test('35: seleccion no funciona en proyecto R: y no envia PATCH',()=>{
  const f=fixture({projectKey:'R:5'});
  try{
    assert.match(f.host.innerHTML,/data-iadm-v3-select-id="1"[^>]* disabled/);
    f.check(1);f.check(2);assert.match(f.host.innerHTML,/0 de 4 equipos seleccionados/);
  }finally{f.restore();}
});

test('36: conflicto 409 en lote impide volver a enviar sin Actualizar',async()=>{
  const f=fixture();
  try{
    f.check(1);f.check(2);f.blockPatch=true;
    f.open(1,'comentarios_fl');f.write('Falla');f.enter();await f.wait();
    assert.equal(f.calls.filter(x=>x.options.method==='PATCH').length,1);
    f.enter();await f.wait();
    assert.equal(f.calls.filter(x=>x.options.method==='PATCH').length,1);
    assert.match(f.host.innerHTML,/2 de 4 equipos seleccionados/);
  }finally{f.restore();}
});

test('37: clear() revoca la seleccion al cambiar identidad/proyecto',()=>{
  const f=fixture();
  try{
    f.check(1);f.check(2);f.helper.clear();f.helper.render();
    assert.match(f.host.innerHTML,/0 de 4 equipos seleccionados/);
  }finally{f.restore();}
});

test('38: selecciones no son cambios pendientes que requieran confirmacion al navegar',()=>{
  const f=fixture();
  try{
    f.check(1);f.check(2);
    assert.equal(f.helper.hasPending(),false);
    assert.equal(f.helper.changeEquipmentPage(),true);
    assert.match(f.host.innerHTML,/2 de 4 equipos seleccionados/);
  }finally{f.restore();}
});

test('39: backend F1 ruta de lote y regla 2-20 coinciden con el helper (archivo instalado)',()=>{
  // Esta prueba solo valida contrato de constantes en JS, la transaccion SQL
  // se prueba en los unitarios propios del FIX Fase 1, no en el navegador.
  assert.match(source,/edicion-multiple-directa/);
  assert.match(source,/MAX_MULTI = 20/);
  assert.match(source,/Confirmar cambio multiple/);
  assert.match(source,/persistVerifiedMulti_cor/);
});


test('40: cambio de lista en lote pide confirmacion antes de escribir',async()=>{
  const f=fixture();
  try{
    f.check(1);f.check(2);f.open(1,'estatus');await f.wait();
    f.input.value='08-T';f.fire('change',f.input);await f.wait();
    assert.equal(f.confirmCalls,1);
    assert.equal(f.calls.filter(x=>x.options.method==='PATCH').length,1);
    assert.equal(f.database.get(1).estatus,'08-T');
  }finally{f.restore();}
});

test('41: texto al perder foco en lote pide confirmacion, no guarda por tecla',async()=>{
  const f=fixture();
  try{
    f.check(1);f.check(2);f.open(1,'comentarios_fl');f.write('Texto final');
    assert.equal(f.calls.filter(x=>x.options.method==='PATCH').length,0);
    f.fire('focusout',f.input);await f.wait();
    assert.equal(f.confirmCalls,1);
    assert.equal(f.calls.filter(x=>x.options.method==='PATCH').length,1);
  }finally{f.restore();}
});

test('42: Escape en editor de lote no guarda ni muestra confirmacion',async()=>{
  const f=fixture();
  try{
    f.check(1);f.check(2);f.open(1,'comentarios_fl');f.write('NO');f.escapeEdit();await f.wait();
    assert.equal(f.confirmCalls,0);assert.equal(f.calls.filter(x=>x.options.method==='PATCH').length,0);
  }finally{f.restore();}
});

test('43: Deseleccionar no cancela una transaccion ya enviada',async()=>{
  const f=fixture();
  try{
    f.check(1);f.check(2);f.holdPatch=true;
    f.open(1,'comentarios_fl');f.write('Esperar commit');f.enter();
    await new Promise(resolve=>setTimeout(resolve,2));
    assert.equal(f.state.saving,true);
    f.deselect();
    assert.match(f.host.innerHTML,/2 de 4 equipos seleccionados/);
    f.releasePatch();await f.wait();
    assert.equal(f.state.saving,false);
    assert.equal(f.database.get(2).comentarios_fl,'Esperar commit');
    f.deselect();assert.match(f.host.innerHTML,/0 de 4 equipos seleccionados/);
  }finally{f.restore();}
});

test('44: acceso revocado tras confirmacion borra fila y seleccion de la vista',async()=>{
  const f=fixture();
  try{
    f.check(1);f.check(2);f.readForbidden=true;
    f.open(1,'comentarios_fl');f.write('Cambiado');f.enter();await f.wait();
    assert.equal(f.calls.filter(x=>x.options.method==='PATCH').length,1);
    assert.equal(f.state.records.length,0);
    assert.match(f.host.innerHTML,/0 de 4 equipos seleccionados/);
    assert.equal(f.database.get(1).comentarios_fl,'Cambiado');
  }finally{f.restore();}
});

test('45: tras guardar se vuelven a habilitar checks inmediatamente',async()=>{
  const f=fixture();
  try{
    f.check(1);f.check(2);f.open(1,'comentarios_fl');f.write('Guardado');f.enter();await f.wait();
    const row3=f.host.innerHTML.match(/<tr data-equipment-id="3"[\s\S]*?<\/tr>/)?.[0];
    assert.match(row3,/data-iadm-v3-select-id="3"/);
    assert.doesNotMatch(row3,/data-iadm-v3-select-id="3"[^>]* disabled/);
  }finally{f.restore();}
});
