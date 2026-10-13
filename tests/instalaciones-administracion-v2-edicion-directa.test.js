'use strict';
// QA aislado: archivo JS REAL empaquetado, API simulada y render sin navegador real.
// No conecta a Aiven, no escribe repositorio ni instancia un servidor Express.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const modulePath = path.join(__dirname,'..','modules','instalaciones-administracion','instalaciones-administracion-ghost_cor.js');
const cssPath = path.join(__dirname,'..','modules','instalaciones-administracion','instalaciones-administracion-ghost_cor.css');
const source = fs.readFileSync(modulePath,'utf8');
const css = fs.readFileSync(cssPath,'utf8');
const {create,helpers:h} = require(modulePath);
const visible = (key,fields,edit = true) => ({key,fields,editable_fields:fields,
  permissions:{can_view:true,can_edit:edit}});
const GROUPS = [
  visible('proyecto',['id_ins_fl','id_proyecto','proyecto','estatus','estatus_completo','activo']),
  visible('seguimiento',['fecha_visita','comentarios_fl','dias_sin_visita','dias_sin_ccnr','dias_restantes','avance_oc']),
  visible('cliente_contrato',['vendedor','recepcion_carpeta','fecha_liberacion_ajuste']),
  visible('responsables',['id_asesor','id_sup','id_admin','supervisor_fl'])
];
const CATALOG = {
  estatus:[{codigo:'01-SUS',nombre:'Suspendidos'},{codigo:'08-T',nombre:'Entregados'}],
  vendedores:[{id_SB:11,iniciales:'VEN'},{id_SB:12,iniciales:'ALE'}],
  supervisores:[{id_SB:13,iniciales:'SUP'}]
};
const identity = (field,value) => value==null||value===''?null:String(value).trim();

for(const [id,fn] of [
  ['01: expone create y helpers verificados',()=>{
    assert.equal(typeof create,'function');assert.equal(typeof h.persistVerified_cor,'function');
    assert.match(source,/Autoguardado/);assert.doesNotMatch(source,/Guardar cambios<\/button>/);
  }],
  ['02: 8 columnas de ID y control se ocultan',()=>{
    const output = h.visibleColumns_cor([...h.HIDDEN_FIELDS,'estatus'],GROUPS);
    assert.deepEqual(output,['estatus']);
  }],
  ['03: derivados y rel_admin siguen visibles',()=>{
    const output = h.visibleColumns_cor(['dias_sin_visita','dias_sin_ccnr','dias_restantes',
      'estatus_completo','rel_admin'],GROUPS);
    assert.deepEqual(output,['dias_sin_visita','dias_sin_ccnr','dias_restantes','estatus_completo','rel_admin']);
  }],
  ['04: rel_admin requiere dos grupos autorizados',()=>{
    assert.deepEqual(h.visibleColumns_cor(['rel_admin'],GROUPS.filter(g=>g.key!=='responsables')),[]);
  }],
  ['05: contrato no puede añadir columnas arbitrarias',()=>{
    assert.deepEqual(h.visibleColumns_cor(['secreto','fecha_visita'],GROUPS),['fecha_visita']);
  }],
  ['06: IDs/derivados nunca son editables aunque contrato lo diga',()=>{
    for(const field of [...h.HIDDEN_FIELDS,...h.DERIVED_FIELDS,'rel_admin'])
      assert.equal(h.editable_cor(field,{id_ins_fl:1,[field]:'x'},GROUPS,false),false,field);
  }],
  ['07: campos normales requieren can_view y can_edit',()=>{
    assert.equal(h.editable_cor('estatus',{id_ins_fl:1,estatus:'01-SUS'},GROUPS,false),true);
    assert.equal(h.editable_cor('estatus',{id_ins_fl:1,estatus:'01-SUS'},GROUPS,true),false);
    assert.equal(h.editable_cor('estatus',{id_ins_fl:1,estatus:'01-SUS'},GROUPS.map(g=>({...g,permissions:{can_view:true,can_edit:false}})),false),false);
  }],
  ['08: campo inexistente en fila y ID invalido se bloquean',()=>{
    assert.equal(h.editable_cor('estatus',{id_ins_fl:0,estatus:'01-SUS'},GROUPS,false),false);
    assert.equal(h.editable_cor('estatus',{id_ins_fl:1},GROUPS,false),false);
  }],
  ['09: fechas validas admiten 29 de febrero bisiesto',()=>{
    assert.equal(h.validCivilDate_cor('2028-02-29'),true);
    assert.equal(h.validCivilDate_cor('2026-02-29'),false);
    assert.equal(h.validCivilDate_cor('13/10/2026'),false);
  }],
  ['10: fecha vacia produce null y no cambios fantasmas',()=>{
    assert.deepEqual(h.validValue_cor('recepcion_carpeta','',{kind:'date'}),{ok:true,value:null});
    assert.deepEqual(h.validValue_cor('recepcion_carpeta','2026-10-13',{kind:'date'}),{ok:true,value:'2026-10-13'});
  }],
  ['11: fecha_liberacion_ajuste permanece TEXTO, admite SI o fecha',()=>{
    assert.deepEqual(h.validValue_cor('fecha_liberacion_ajuste','SI',{kind:'text'}),{ok:true,value:'SI'});
    assert.deepEqual(h.validValue_cor('fecha_liberacion_ajuste','13/10/2026',{kind:'text'}),{ok:true,value:'13/10/2026'});
  }],
  ['12: validacion de porcentajes y rango',()=>{
    assert.deepEqual(h.validValue_cor('avance_oc','35.25',{kind:'percent'}),{ok:true,value:'35.25%'});
    assert.equal(h.validValue_cor('avance_oc','110',{kind:'percent'}).ok,false);
    assert.equal(h.validValue_cor('avance_oc','-1',{kind:'percent'}).ok,false);
  }],
  ['13: validacion monetaria',()=>{
    assert.deepEqual(h.validValue_cor('presupuesto_mantenimiento_cem','120.50',{kind:'money'}),{ok:true,value:'120.50'});
    assert.equal(h.validValue_cor('presupuesto_mantenimiento_cem','120.999',{kind:'money'}).ok,false);
  }],
  ['14: texto multilinea max longitud',()=>{
    assert.deepEqual(h.validValue_cor('comentarios_fl','  ABC  ',{kind:'textarea',max_length:3}),{ok:true,value:'ABC'});
    assert.equal(h.validValue_cor('comentarios_fl','ABCD',{kind:'textarea',max_length:3}).ok,false);
  }],
  ['15: estatus solo valores activos de catalogo oficial',()=>{
    assert.deepEqual(h.validValue_cor('estatus','08-T',{},CATALOG),{ok:true,value:'08-T'});
    assert.equal(h.validValue_cor('estatus','09-T',{},CATALOG).ok,false);
    assert.equal(h.validValue_cor('estatus','08-T',{},null).ok,false);
  }],
  ['16: vendedor y supervisor reciben iniciales del catalogo',()=>{
    assert.deepEqual(h.validValue_cor('vendedor','VEN',{},CATALOG),{ok:true,value:'VEN'});
    assert.deepEqual(h.validValue_cor('supervisor_fl','SUP',{},CATALOG),{ok:true,value:'SUP'});
    assert.equal(h.validValue_cor('vendedor','INV',{},CATALOG).ok,false);
  }],
  ['17: catalogo con iniciales duplicadas bloquea la opcion',()=>{
    const c={...CATALOG,vendedores:[{id_SB:1,iniciales:'DUPE'},{id_SB:2,iniciales:'DUPE'}]};
    assert.equal(h.validValue_cor('vendedor','DUPE',{},c).ok,false);
    assert.deepEqual(h.uniqueInitials_cor(c.vendedores),[]);
  }],
  ['18: se permite limpiar responsables',()=>{
    assert.deepEqual(h.validValue_cor('vendedor','',{},CATALOG),{ok:true,value:null});
    assert.deepEqual(h.validValue_cor('supervisor_fl','',{},CATALOG),{ok:true,value:null});
  }],
  ['19: calculados e IDs no admiten payload manual',()=>{
    for(const field of [...h.HIDDEN_FIELDS,...h.DERIVED_FIELDS])
      assert.throws(()=>h.payload_cor(field,'1','2'),{code:'ADMIN_V2_READONLY_FIELD'});
  }],
  ['20: payload solo incluye un campo y expected original',()=>{
    assert.deepEqual(h.payload_cor('estatus','01-SUS','08-T'),{
      changes:{estatus:'08-T'},expected:{estatus:'01-SUS'}
    });
  }],
  ['21: css limitado a la vista secundaria',()=>{
    assert.match(css,/#iadm-cor-project/);
    assert.doesNotMatch(css,/(?:^|\n)\s*body\s*\{/);
  }],
  ['22: no escribe storage del navegador',()=>{
    assert.doesNotMatch(source,/\blocalStorage\s*\./);
    assert.doesNotMatch(source,/\bsessionStorage\s*\./);
    assert.doesNotMatch(source,/\bindexedDB\s*\./);
  }]
])test(id,fn);

test('23: PATCH individual + GET autorizado, expected exacto, sin otros campos',async()=>{
  const calls=[];
  const api=async (url,options={})=>{
    calls.push({url,options});
    return options.method==='PATCH'?{ok:true,updated:true}:
      {ok:true,data:{id_ins_fl:17,estatus:'08-T'}};
  };
  const result=await h.persistVerified_cor(api,{projectKey:'P:P10152',id:17,
    field:'estatus',original:'01-SUS',value:'08-T',canonicalCompare:identity});
  assert.equal(result.estatus,'08-T');assert.equal(calls.length,2);
  assert.equal(calls[0].options.method,'PATCH');
  assert.equal(calls[0].url,'/api/instalaciones/administracion/proyectos/P%3AP10152/equipos/17/edicion-directa');
  assert.deepEqual(JSON.parse(calls[0].options.body),{changes:{estatus:'08-T'},expected:{estatus:'01-SUS'}});
  assert.equal(calls[1].url,'/api/instalaciones/administracion/registros/17');
});

test('24: respuesta PATCH no confirmada no hace GET',async()=>{
  let calls=0;
  await assert.rejects(h.persistVerified_cor(async()=>{calls++;return{ok:false};},
    {projectKey:'P:P10152',id:17,field:'estatus',original:'01-SUS',value:'08-T',canonicalCompare:identity}),
    {code:'ADMIN_V2_PATCH_NOT_CONFIRMED'});
  assert.equal(calls,1);
});

test('25: relectura divergente aborta confirmacion y no reintenta',async()=>{
  let calls=0;
  await assert.rejects(h.persistVerified_cor(async()=>++calls===1?{ok:true}: 
    {data:{id_ins_fl:17,estatus:'02-OC'}},{projectKey:'P:P10152',id:17,field:'estatus',
    original:'01-SUS',value:'08-T',canonicalCompare:identity}),
    {code:'ADMIN_V2_RECHECK_MISMATCH',committed:true});
  assert.equal(calls,2);
});

test('26: perdida de scope tras PATCH se marca confirmado/no reintentar',async()=>{
  let calls=0;
  await assert.rejects(h.persistVerified_cor(async()=>{
    if(++calls===1)return {ok:true};
    throw Object.assign(new Error('Sin acceso'),{status:404});
  },{projectKey:'P:P10152',id:17,field:'estatus',original:'01-SUS',value:'08-T',canonicalCompare:identity}),
  {status:404,committed:true});
  assert.equal(calls,2);
});

test('27: IDs invalidos bloquean llamadas a backend',async()=>{
  let calls=0;
  await assert.rejects(h.persistVerified_cor(async()=>{calls++;return{};},
    {projectKey:'P:P10152',id:0,field:'estatus',original:null,value:'08-T',canonicalCompare:identity}),
    {code:'ADMIN_V2_INVALID_CONTEXT'});
  assert.equal(calls,0);
});

test('28: render frontend real no expone IDs, control ni borradores',()=>{
  const nodes={};
  nodes['iadm-cor-equipment-list']={innerHTML:'',querySelector:()=>null};
  nodes['iadm-cor-project-title']={textContent:''};
  nodes['iadm-cor-bulk-bar']={hidden:false};
  let pagerCalls=[];
  const state={page:'equipos',records:[{id_ins_fl:17,id_proyecto:'P10152',
    estatus:'01-SUS',estatus_completo:'Equipos Suspendidos',id_sup:55,
    dias_sin_visita:'3',rel_admin:'ABC, DEF'}],
    selectedProject:{project_key:'P:P10152',proyecto:'Obra 1'},
    tableColumns:['id_ins_fl','id_proyecto','estatus','estatus_completo','id_sup','dias_sin_visita','rel_admin'],
    projectRecordsTotal:6,equipmentOffset:0,loading:true,saving:false};
  const widget=create({st:state,$:key=>nodes[key],view:()=>({querySelector:()=>null}),
    groups:()=>GROUPS,canEdit:g=>g.permissions.can_edit,
    esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
    label:s=>s,meta:()=>({kind:'text'}),display:(f,v)=>String(v??''),
    isoDate:s=>s,previewNumber:s=>String(s??''),canonicalCompare:identity,
    pager:(...args)=>pagerCalls.push(args),isViewingAs:()=>false,
    currentContext:()=> 'actor:17',announce:()=>{}});
  widget.render();
  const html=nodes['iadm-cor-equipment-list'].innerHTML;
  assert.match(html,/Edicion directa/);
  assert.match(html,/ABC, DEF/);
  assert.match(html,/estatus_completo/);
  assert.match(html,/Editar estatus/);
  assert.doesNotMatch(html,/<th[^>]*>id_ins_fl<\/th>/);
  assert.doesNotMatch(html,/<th[^>]*>id_proyecto<\/th>/);
  assert.doesNotMatch(html,/Guardar cambios<\/button>/);
  assert.doesNotMatch(html,/Descartar cambios<\/button>/);
  assert.equal(nodes['iadm-cor-bulk-bar'].hidden,true);
  assert.equal(widget.hasPending(),false);
  assert.equal(pagerCalls.length,1);
});

test('29: contrato create exige adaptadores en lugar de defaults inseguros',()=>{
  assert.throws(()=>create({}),/Adaptador de tabla incompleto/);
});

console.log('Pruebas aisladas JS/CSS del ZIP. No son E2E ni pruebas sobre Aiven.');

test('30: timeout del PATCH tiene resultado incierto; no se reintenta',async()=>{
  let calls=0;
  await assert.rejects(h.persistVerified_cor(async()=>{
    calls++;throw Object.assign(new Error('Timeout'),{code:'TIMEOUT'});
  },{projectKey:'P:P10152',id:17,field:'estatus',original:'01-SUS',value:'08-T',canonicalCompare:identity}),
  {uncertain:true});
  assert.equal(calls,1);
});

test('31: conflicto 409 de PATCH no genera reintento ni GET',async()=>{
  let calls=0;
  await assert.rejects(h.persistVerified_cor(async()=>{
    calls++;throw Object.assign(new Error('Conflicto'),{status:409});
  },{projectKey:'P:P10152',id:17,field:'estatus',original:'01-SUS',value:'08-T',canonicalCompare:identity}),
  {status:409,uncertain:false});
  assert.equal(calls,1);
});

test('32: GET devuelve otro equipo, guardado no puede verificarse',async()=>{
  await assert.rejects(h.persistVerified_cor(async(path,config)=>config?.method==='PATCH'?{ok:true}:
    {data:{id_ins_fl:99,estatus:'08-T'}},
  {projectKey:'P:P10152',id:17,field:'estatus',original:'01-SUS',value:'08-T',canonicalCompare:identity}),
  {code:'ADMIN_V2_RECHECK_MISMATCH',committed:true});
});

test('33: fecha invalida/objeto como valor se rechazan sin backend',()=>{
  assert.deepEqual(h.validValue_cor('fecha_visita','2026-02-30',{kind:'date'}).ok,false);
  assert.throws(()=>h.payload_cor('comentarios_fl','ABC',{value:'DEF'}),{code:'ADMIN_V2_INVALID_VALUE'});
});

test('34: no se duplican columnas repetidas del servidor',()=>{
  assert.deepEqual(h.visibleColumns_cor(['estatus','estatus','vendedor'],GROUPS),['estatus','vendedor']);
});

function simulatedBrowser(field) {
  const realDocument=global.document,realWindow=global.window;
  const listeners = new Map(),calls=[];
  const data={id_ins_fl:17,id_proyecto:'P10152',estatus:'01-SUS',
    comentarios_fl:'texto inicial',vendedor:'ALE',estatus_completo:'Equipos Suspendidos'};
  const state={page:'equipos',records:[{...data}],selectedProject:{project_key:'P:P10152',proyecto:'Obra'},
    tableColumns:['id_ins_fl','id_proyecto','estatus','comentarios_fl','vendedor','estatus_completo'],
    projectRecordsTotal:1,equipmentOffset:0,saving:false,loading:false};
  let currentEditedHtml='';let input=null;
  const cell={replaceWith(newer){currentEditedHtml=newer.markup; input={value: data[field],disabled:false,
    matches:s=>s==='[data-iadm-v2-control]',focus() {}};}};
  const root={
    addEventListener(t,cb){if(!listeners.has(t))listeners.set(t,[]);listeners.get(t).push(cb);},
    contains(){return true;},
    querySelector(s){
      if(s.includes('data-iadm-ghost-cell') && s.includes('data-iadm-v2-control'))return input;
      if(s.includes('data-iadm-ghost-cell'))return cell;
      if(s==='[data-iadm-v2-message]')return {textContent:'',dataset:{}};
      if(s==='[data-iadm-v2-error]')return {textContent:'',hidden:true};
      return null;
    }
  };
  const host={innerHTML:'',querySelector:()=>null};
  const nodes={'iadm-cor-equipment-list':host,'iadm-cor-project-title':{},'iadm-cor-bulk-bar':{hidden:false}};
  global.document={createElement(tag){assert.equal(tag,'tbody');return {
    set innerHTML(markup){this.markup=markup;},querySelector(selector){assert.equal(selector,'td');return {markup:this.markup};}
  };}};
  global.window={
    ManttoRouter:{getCurrent:()=>({route:'instalaciones-administracion'})},
    ManttoAuth:{getToken:()=> 'jwt-falso',api:async (url,opts={})=>{
      calls.push({url,opts});
      if(url.endsWith('catalogos-edicion'))return {ok:true,...CATALOG};
      if(opts.method==='PATCH'){
        const payload=JSON.parse(opts.body);
        Object.assign(data,payload.changes);
        return {ok:true};
      }
      if(url.endsWith('registros/17'))return {ok:true,data:{...data}};
      if(url.includes('equipos/tabla?'))return {ok:true,data:[{...data}],columns:state.tableColumns,total:1};
      throw new Error('Ruta inesperada '+url);
    }}
  };
  const fixture=create({st:state,$:key=>nodes[key],view:()=>root,groups:()=>GROUPS,
    canEdit:g=>g.permissions.can_edit,esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
    label:s=>s,meta:()=>({kind:'text'}),display:(f,v)=>String(v??''),
    isoDate:s=>s,previewNumber:s=>String(s??''),canonicalCompare:identity,
    pager:()=>{},isViewingAs:()=>false,currentContext:()=> 'actor:17',announce:()=>{}});
  fixture.render();fixture.bind(root);
  function fire(name,target,extra={}) {
    const event={target,preventDefault(){},stopImmediatePropagation(){},...extra};
    for(const cb of listeners.get(name)||[])cb(event);
  }
  function open(){const button={dataset:{iadmGhostId:'17',iadmGhostField:field}};
    fire('click',{closest:selector=>selector==='[data-iadm-ghost-action="edit"]'?button:null});
  }
  return {fixture,state,data,calls,open,fire,get input(){return input;},
    get currentEditedHtml(){return currentEditedHtml;},
    restore(){global.document=realDocument;global.window=realWindow;}};
}

test('35: flujo integrado simulado click > escribir > salir > PATCH/GET y refresco',async()=>{
  const f=simulatedBrowser('comentarios_fl');
  try {
    f.open();
    assert.match(f.currentEditedHtml,/data-iadm-v2-control/);
    f.input.value='texto nuevo';
    f.fire('input',f.input);
    f.fire('focusout',f.input);
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(f.data.comentarios_fl,'texto nuevo');
    assert.equal(f.state.records[0].comentarios_fl,'texto nuevo');
    assert.equal(f.calls.filter(c=>c.opts.method==='PATCH').length,1);
    assert.equal(f.fixture.hasPending(),false);
    assert.equal(f.state.saving,false);
  }finally{f.restore();}
});

test('36: texto sin tocar no envia solicitudes PATCH',async()=>{
  const f=simulatedBrowser('comentarios_fl');
  try {
    f.open();
    f.fire('focusout',f.input);
    await new Promise(resolve=>setTimeout(resolve,1));
    assert.equal(f.calls.filter(c=>c.opts.method==='PATCH').length,0);
    assert.equal(f.fixture.hasPending(),false);
  }finally{f.restore();}
});

test('37: lista vendedor lee catalogo y autoguarda solo al cambiar seleccion',async()=>{
  const f=simulatedBrowser('vendedor');
  try {
    f.open();
    await new Promise(resolve=>setTimeout(resolve,3));
    assert.match(f.currentEditedHtml,/<select/);
    assert.equal(f.calls.filter(c=>c.opts.method==='PATCH').length,0);
    f.input.value='VEN';
    f.fire('change',f.input);
    await new Promise(resolve=>setTimeout(resolve,8));
    assert.equal(f.data.vendedor,'VEN');
    assert.equal(f.calls.filter(c=>c.opts.method==='PATCH').length,1);
    assert.equal(f.calls.filter(c=>c.url.endsWith('catalogos-edicion')).length,1);
  }finally{f.restore();}
});
