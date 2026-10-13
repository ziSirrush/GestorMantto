'use strict';
/* [Aster | 2026-10-13 | ASTER-MG | QA FASE2] Simulado sin API ni Aiven. */
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {create}=require('../modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js');
const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function make(opts={}) {
  const st={page:'equipos',records:[
      {id_ins_fl:15,id_proyecto:'P150',proyecto:'Proyecto A',comentarios_fl:'Normal',created_at:'2026-10-01'},
      {id_ins_fl:16,id_proyecto:'P150',proyecto:'Proyecto A',comentarios_fl:'<script>alert(1)</script>',created_at:'2026-10-02'}
    ],tableColumns:['id_ins_fl','proyecto','comentarios_fl','created_at'],
    selectedProject:{project_key:'P:P150',proyecto:'Proyecto A',id_proyecto:'P150'},
    projectRecordsTotal:2,equipmentOffset:0,users:null,...opts.st};
  const ids=Object.fromEntries(['iadm-cor-equipment-list','iadm-cor-project-title','iadm-cor-project-meta','iadm-cor-bulk-bar'].map(x=>[x,{innerHTML:'',textContent:'',hidden:false}]));
  const entry={value:'',focus(){this.focused=true;}};
  const errorNode={textContent:'',hidden:true};
  const clicks=[];const bindings={};let lastReplaced='';let rowCount=0;
  const root={
    addEventListener(t,fn){bindings[t]=bindings[t]||[];bindings[t].push(fn);},
    contains(){return true;},
    querySelector(s){
      if(s==='[data-iadm-ghost-input]')return entry;
      if(s==='[data-iadm-ghost-error]')return errorNode;
      if(s==='[data-iadm-ghost-count]')return {set textContent(s){clicks.push(s);}};
      if(s==='[data-iadm-ghost-action="discard-all"]')return {disabled:false};
      if(s.startsWith('[data-iadm-ghost-cell='))return {replaceWith(node){lastReplaced=node.html;rowCount++;}};
      return null;
    }
  };
  const oldDocument=global.document,oldWindow=global.window;
  global.document={createElement(){return {
    set innerHTML(s){this.html=s;},querySelector(){return {html:this.html};}
  };}};
  global.window={confirm:()=>true};
  const groups=opts.group??[{key:'proyecto',fields:['proyecto','id_proyecto'],editable_fields:['proyecto','id_proyecto'],permissions:{can_view:true,can_edit:true}},
    {key:'seguimiento',fields:['comentarios_fl'],editable_fields:['comentarios_fl'],permissions:{can_view:true,can_edit:true}}];
  const engine=create({st,$:id=>ids[id],view:()=>root,groups:()=>groups,canEdit:g=>Boolean(g.permissions.can_edit),
    esc,label:f=>f,meta:()=>({kind:'text',max_length:255}),display:(_f,v)=>v==null?'--':String(v),
    isoDate:v=>/^2026-\d\d-\d\d$/.test(String(v))?v:'',previewNumber:v=>String(v??''),
    canonicalCompare:(_f,v)=>v==null||v===''?null:String(v).trim(),
    userOptions:()=>'<option value="">Sin asignar</option>',loadUsers:async()=>[],
    pager:()=>{},isViewingAs:()=>Boolean(opts.viewer),currentContext:()=>opts.context||'actor1',
    announce:(message)=>{clicks.push(message);}, onSave:()=>{clicks.push("SAVE_INVOKED_EXPLICITLY");} });
  engine.bind(root);
  const fire=(type,button)=>{
    const target=button?.dataset?{closest:()=>button}:button;
    for(const listener of bindings[type]||[])listener({target,preventDefault(){},stopImmediatePropagation(){},key:'',ctrlKey:false});
  };
  const action=(kind,id=15,field='comentarios_fl')=>fire('click',{dataset:{iadmGhostAction:kind,iadmGhostId:String(id),iadmGhostField:field}});
  return {st,engine,ids,entry,errorNode,root,action,fire,clicks,
    get lastReplaced(){return lastReplaced;},get rowCount(){return rowCount;},
    cleanup(){global.document=oldDocument;global.window=oldWindow;}}
}

test('Tabla: todas las columnas autorizadas, escapa XSS y solo guarda si se solicita',()=>{
  const t=make();try{
    t.engine.render();const html=t.ids['iadm-cor-equipment-list'].innerHTML;
    assert.match(html,/id_ins_fl/);assert.match(html,/comentarios_fl/);
    assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html,/<script>/);
    assert.match(html,/Editar borrador/);
    assert.match(html,/Guardar cambios/);
    assert.match(html,/guardado manual|Guardado manual/i);
    assert.doesNotMatch(html,/data-record-id=|data-bulk-record-id=|data-field-control=|<form/);
    assert.match(html,/data-iadm-ghost-action="edit"/);
    assert.equal(t.engine.listDrafts().length,0);
    assert.equal(t.ids['iadm-cor-bulk-bar'].hidden,true);
  }finally{t.cleanup();}
});

test('Permisos: campo bloqueado, sistema readonly y visor deshabilitan editar',()=>{
  const t=make({group:[{fields:['proyecto','comentarios_fl'],editable_fields:['comentarios_fl'],permissions:{can_view:true,can_edit:false}}]});
  try{t.engine.render();assert.doesNotMatch(t.ids['iadm-cor-equipment-list'].innerHTML,/data-iadm-ghost-action="edit"/);}finally{t.cleanup();}
  const viewer=make({viewer:true});
  try{viewer.engine.render();assert.doesNotMatch(viewer.ids['iadm-cor-equipment-list'].innerHTML,/data-iadm-ghost-action="edit"/);}finally{viewer.cleanup();}
});

test('Edicion fantasma modifica memoria, preserva original y permite revertir',()=>{
  const t=make();try{
    t.engine.render();t.action('edit');assert.match(t.lastReplaced,/Aplicar borrador/);
    t.entry.value='Borrador sin Aiven';t.fire('input',{matches:()=>true});t.action('apply');
    assert.equal(t.engine.pendingCount(),1);
    assert.deepEqual(t.engine.listDrafts()[0],{
      id_ins_fl:15,field:'comentarios_fl',original:'Normal',value:'Borrador sin Aiven',project_key:'P:P150'
    });
    assert.equal(t.st.records[0].comentarios_fl,'Normal','Nunca mutar la imagen leida desde Aiven');
    assert.match(t.lastReplaced,/Borrador sin Aiven/);
    assert.match(t.lastReplaced,/Original: Normal/);
    assert.equal(t.engine.changeEquipmentPage(),true,'Paginacion conserva borradores');
    assert.equal(t.engine.pendingCount(),1);
    t.action('revert');assert.equal(t.engine.pendingCount(),0);
    assert.equal(t.engine.hasPending(),false);
  }finally{t.cleanup();}
});

test('Concurrencia: muestra advertencia si valor base cambio en memoria por recarga',()=>{
  const t=make();try{
    t.engine.render();t.action('edit');t.entry.value='Pendiente';t.fire('input',{matches:()=>true});t.action('apply');
    t.st.records[0].comentarios_fl='Otro usuario modifico';t.engine.render();
    assert.match(t.ids['iadm-cor-equipment-list'].innerHTML,/El servidor cambio este valor/);
    t.action('edit');t.entry.value='Otro intento';t.fire('input',{matches:()=>true});t.action('apply');
    assert.equal(t.engine.listDrafts()[0].value,'Pendiente','El conflicto no actualiza borrador original');
    assert.match(t.errorNode.textContent,/El valor original cambio/);
  }finally{t.cleanup();}
});

test('Navegacion contextual: limpiar invalida borradores; sin persistencia de navegador',()=>{
  const t=make();try{
    t.engine.render();t.action('edit');t.entry.value='Prueba';t.fire('input',{matches:()=>true});t.action('apply');
    assert.equal(t.engine.hasPending(),true);
    t.engine.clear();assert.equal(t.engine.hasPending(),false);
  }finally{t.cleanup();}
});


test('Fase 3: boton Guardar exige accion explicita, conserva borrador hasta ACK verificado',async()=>{
  const t=make();try{
    t.engine.render();t.action('edit');t.entry.value='Pendiente de guardar';
    t.fire('input',{matches:()=>true});t.action('apply');
    assert.equal(t.engine.pendingCount(),1);
    assert.equal(t.clicks.includes('SAVE_INVOKED_EXPLICITLY'),false);
    t.action('save-all');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(t.clicks.includes('SAVE_INVOKED_EXPLICITLY'),true);
    assert.equal(t.engine.pendingCount(),1,'Guardar no equivale a confirmar por servidor');
    const sent=t.engine.listDrafts();
    t.engine.ackSaved([{...sent[0],value:'No corresponde'}]);
    assert.equal(t.engine.pendingCount(),1,'ACK que no coincide no elimina borrador');
    t.engine.ackSaved(sent);
    assert.equal(t.engine.pendingCount(),0);
  }finally{t.cleanup();}
});
test('Mientras se envia guardado, no permite comenzar otra edicion ni descartar borradores',()=>{
  const t=make();try{
    t.engine.render();t.action('edit');t.entry.value='Cambio en cola';
    t.fire('input',{matches:()=>true});t.action('apply');
    assert.equal(t.engine.pendingCount(),1);
    t.engine.setSaving(true);
    t.action('revert');
    t.action('discard-all');
    t.action('edit',16,'comentarios_fl');
    assert.equal(t.engine.pendingCount(),1);
    assert.match(t.ids['iadm-cor-equipment-list'].innerHTML,/data-iadm-ghost-action="save-all" disabled/);
    t.engine.setSaving(false);
    t.action('revert');
    assert.equal(t.engine.pendingCount(),0);
  }finally{t.cleanup();}
});
