'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_EXCEL_FASE_6_V001]
// Cierre integral local: auditoria de contrato, estados de edicion y rutas.
// Sin acceso a Aiven, cambios remotos ni escritura de base.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.join(__dirname,'..');
const B='backend/src/modules/cobranza-uni-administracion/';
const FRONT='modules/cobranza-uni/administracion/';
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const constants=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants');
const zone1Fields=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-zona1-validation').INVOICE_FIELDS_MP_UNI;
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function routerHarness(){
  const registered=[];
  const gate={on:true};
  const perm={MAIN_VISUAL:'MAIN',TABLE_PERMISSIONS:{
    gestion_credito:{view:'GC.VER',edit:'GC.EDITAR'},
    pc:{view:'PC.VER',edit:'PC.EDITAR'},
    detalle_mp_2026:{view:'MP.VER',edit:'MP.EDITAR'}},
    ALL_TABLE_PERMISSIONS:['GC.VER','GC.EDITAR','PC.VER','PC.EDITAR','MP.VER','MP.EDITAR']};
  const mocks={
    express:{Router:()=>({get(route,...handlers){registered.push({method:'GET',route,handlers});},post(){},patch(){}})},
    '../../middleware/information-access-gnral.middleware':{humanInformationGuard_gnral:()=>[()=>{}]},
    '../../services/permissions/effective-permission.service':{listEffectivePermissions:async()=>gate.permissions},
    './cobranza-uni-administracion.constants':constants,
    './cobranza-uni-administracion.permissions':perm,
    './cobranza-uni-administracion.gc-service':{listGestionCredito_uni(){}},
    './cobranza-uni-administracion.pc-service':{listVentaAdicionalAdmin_uni(){}},
    './cobranza-uni-administracion.pc-edit-validation':{PHASE3_SAFE_FIELDS_UNI:[]},
    './cobranza-uni-administracion.pc-edit-service':{pcEditFeatureEnabled_uni:()=>false,
      updateSinglePc_uni(){},updateMultiPc_uni(){}},
    './cobranza-uni-administracion.pc-create-service':{createGateEnabled_uni:()=>false,
      preflightCreatePc_uni(){},createPc_uni(){}},
    './cobranza-uni-administracion.gc-edit-service':{updateSingleGc_uni(){},updateMultiGc_uni(){}},
    './cobranza-uni-administracion.mp-edit-service':{mpEditFeatureEnabled_uni:()=>gate.mainOn!==false,
      updateSingleMp_uni(){},updateMultiMp_uni(){}},
    './cobranza-uni-administracion.mp-edit-validation':{PHASE4_SAFE_FIELDS_MP_UNI:[]},
    './cobranza-uni-administracion.mp-zona1-write-service':{
      zone1ExcelWriteEnabled_uni:()=>gate.on,
      zone1WriteEnabled_uni(){throw Error('CONSULTA LEGACY NO AUTORIZADA');}
    },
    './cobranza-uni-administracion.mp-zona1-validation':{INVOICE_FIELDS_MP_UNI:zone1Fields}
  };
  gate.permissions=new Map([['MP.VER',true],['MP.EDITAR',true]]);
  const module={exports:{}};
  vm.runInNewContext(read(B+'cobranza-uni-administracion.routes.js'),{
    module,exports:module.exports,require:name=>{
      if(!Object.hasOwn(mocks,name))throw Error('Dependencia inesperada: '+name);
      return mocks[name];
    }
  });
  function get(route){const item=registered.find(r=>r.method==='GET'&&r.route===route);
    assert.ok(item,route);return item.handlers.at(-1);}
  function res(){return{code:200,body:null,status(code){this.code=code;return this;},
    json(body){this.body=body;return this;}};}
  const req={contextUser:{id_SB:17},viewerContext:{active:false},
    informationAccess:{empresa:'UNITED',acceso_puerta:true,effective_user_id:17},
    params:{tabla:'detalle_mp_2026'}};
  return{gate,req,res,get};
}

test('F6 ruta: /contrato y /acceso comparten la MISMA puerta de Zona1 Excel; nunca legacy',async()=>{
  const h=routerHarness();
  const contract=h.get('/contrato'),access=h.get('/tablas/:tabla/acceso');
  for(const on of [true,false]){
    h.gate.on=on;
    const a=h.res(),c=h.res();
    await access(h.req,a,e=>{throw e;});
    await contract(h.req,c,e=>{throw e;});
    const mp=c.body.tables.find(row=>row.table==='detalle_mp_2026');
    assert.equal(a.code,200);assert.equal(c.code,200);
    assert.equal(a.body.can_write_zone1,on);
    assert.equal(mp.can_write_zone1,on);
    assert.equal(a.body.can_write_zone1,mp.can_write_zone1);
    assert.equal(a.body.zona1_editable_fields.length,on?124:0);
    assert.equal(Object.hasOwn(mp,'can_prepare_zone1'),false);
  }
});

test('F6 permiso: Sin EDITAR, view-as o apagado de MP ninguna respuesta habilita escritura',async()=>{
  const h=routerHarness(),contract=h.get('/contrato'),access=h.get('/tablas/:tabla/acceso');
  const checks=[
    {permissions:new Map([['MP.VER',true],['MP.EDITAR',false]])},
    {permissions:new Map([['MP.VER',true],['MP.EDITAR',true]]),viewerContext:{active:true}},
    {permissions:new Map([['MP.VER',true],['MP.EDITAR',true]]),mainOn:false}
  ];
  for(const cfg of checks){
    h.gate.permissions=cfg.permissions;
    h.gate.mainOn=cfg.mainOn;
    const req={...h.req,viewerContext:cfg.viewerContext||h.req.viewerContext};
    const a=h.res(),c=h.res();
    await access(req,a,e=>{throw e;});await contract(req,c,e=>{throw e;});
    assert.equal(a.body.can_edit,false);assert.equal(a.body.can_write_zone1,false);
    assert.deepEqual(Array.from(a.body.zona1_editable_fields),[]);
    assert.equal(c.body.tables.find(x=>x.table==='detalle_mp_2026').can_write_zone1,false);
  }
});

function vaHarness(){
  const events={},nodes=new Map(),calls=[];
  const names=['ov'];
  const rows=[{id_pc:'51',ov:'A'},{id_pc:'52',ov:'B'}];
  const node=sel=>{if(!nodes.has(sel))nodes.set(sel,{innerHTML:'',textContent:'',value:'',disabled:false,
    dataset:{},hidden:true,scrollLeft:0,scrollTop:0,setAttribute(){},focus(){},reset(){},
    get childElementCount(){return 0;}});return nodes.get(sel);};
  const root={innerHTML:'',querySelector:node,querySelectorAll(){return[];},
    addEventListener(n,h){events[n]=h;},removeEventListener(n){delete events[n];},
    replaceChildren(){this.innerHTML='';},contains(){return true;}};
  const doc={hidden:false,createElement(tag){return{tagName:tag.toUpperCase(),value:'',
    setAttribute(k,v){this[k]=v;},focus(){},select(){}};}};
  const win={ManttoAuth:{isViewingAs(){return false;},apiGet:async url=>{
    calls.push({method:'GET',url});const q=new URLSearchParams(url.split('?')[1]);
    return{ok:true,readonly:true,table:'pc',columns:constants.PC_COLUMNS_UNI,rows,
      page:Number(q.get('page')),page_size:Number(q.get('page_size')),total:2,pages:1};
  },api:async(url,o)=>{calls.push({method:o.method,url});throw Error('Escritura no esperada');}}};
  vm.runInNewContext(read(FRONT+'venta-adicional/venta-adicional.js'),{
    window:win,document:doc,URLSearchParams,Intl,Date});
  const app=win.ManttoCobranzaAdministracionPC_uni.mount(root,{
    canEdit:true,editableFields:names,canPrepareCreate:false,canCreate:false,isCurrent:()=>true
  });
  const cls=new Set(['cua-pc-canedit']);let input;
  const td={dataset:{pcField:'ov'},classList:{contains:k=>cls.has(k),add:k=>cls.add(k),remove:k=>cls.delete(k)},
    closest:k=>k==='tr'?{dataset:{pcRow:'51'}}:null,
    replaceChildren(v){input=v;},querySelector:()=>input,focus(){},innerHTML:''};
  return{app,events,nodes,node,calls,td};
}

test('F6 VA: editar celda bloquea lote y acciones simultaneas; Escape restablece el lote',async()=>{
  const ui=vaHarness();await tick();
  // La seleccion de 2 registros habilita bulk solo antes de editar.
  for(const id of ['51','52'])ui.events.change({target:{matches:s=>s==='[data-pc-select]',
    value:id,checked:true}});
  assert.equal(ui.node('[data-pc-bulk-save]').disabled,false);
  ui.events.dblclick({target:{closest:()=>ui.td}});
  assert.equal(ui.node('[data-pc-bulk-save]').disabled,true);
  const count=ui.calls.length;
  let prevented=false;
  ui.events.submit({target:{matches:s=>s==='[data-pc-bulk-form]'},
    preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(ui.calls.length,count,'No debe mandar PATCH de lote mientras edita una celda.');
  let filterPrevented=false;
  ui.events.submit({target:{matches:s=>s==='[data-pc-form]'},
    preventDefault(){filterPrevented=true;}});
  assert.equal(filterPrevented,true,'El submit del navegador debe permanecer bloqueado.');
  assert.equal(ui.calls.length,count,'No debe consultar mientras hay editor activo.');
  const editor=ui.td.querySelector();
  ui.events.keydown({target:{matches:s=>s==='[data-pc-cell-input]'&&
    Object.hasOwn(editor,'data-pc-cell-input'),tagName:'INPUT'},key:'Escape',preventDefault(){}});
  assert.equal(ui.node('[data-pc-bulk-save]').disabled,false);
  ui.app.destroy();
});

test('F6 integridad: exactamente dos pestañas solo MP, cuatro tablas y 124/128 Zona1',()=>{
  const main=read(FRONT+'main/main.js');
  const mp=read(FRONT+'mantenimiento-preventivo/mantenimiento-preventivo.js');
  const zone=read(FRONT+'mantenimiento-preventivo/mantenimiento-preventivo-zona1.js');
  const va=read(FRONT+'venta-adicional/venta-adicional.js');
  assert.equal(constants.MP_ZONE1_COLUMNS_UNI.length,128);
  assert.equal(zone1Fields.length,124);
  assert.equal((mp.match(/data-mp-tab="/g)||[]).length,2);
  for(const source of [va,zone]){
    assert.match(source,/method:'PATCH'/);assert.match(source,/expected/);
    assert.match(source,/dblclick/);assert.match(source,/data-(?:pc|mpz)-cell-input/);
    assert.doesNotMatch(source,/data-(?:pc|mpz)-edit-form/);
  }
  assert.doesNotMatch(va,/data-pc-group|const GROUPS|showDialog/);
  assert.doesNotMatch(mp,/data-mp-group|data-mp-dialog|visibleColumns/);
  assert.doesNotMatch(zone,/data-mpz-dialog|preflightZone1/);
  assert.doesNotMatch(main,/data-mp-tab/);
});

test('F6 limpieza: no recuperar modal de edicion ni SQL de escritura en los tres frontales',()=>{
  const paths=[
    FRONT+'venta-adicional/venta-adicional.js',
    FRONT+'mantenimiento-preventivo/mantenimiento-preventivo.js',
    FRONT+'mantenimiento-preventivo/mantenimiento-preventivo-zona1.js'
  ];
  for(const file of paths){
    const src=read(file);
    assert.doesNotMatch(src,/\b(?:INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+`(?:pc|detalle_mp_2026|detalle_mp_2026_zona_1)`)/i);
    assert.match(src,/isCurrent|valid/);
  }
  const routes=read(B+'cobranza-uni-administracion.routes.js');
  assert.ok(!routes.includes('can_prepare_zone1'));
  assert.ok(routes.includes('zone1ExcelWriteEnabled_uni()'));
  assert.ok(routes.includes('zone1WriteEnabled_uni')===false);
});

test('F6 consultas: Zona1 usa solo COUNT/SELECT paginados y comparte identidad del bulk',()=>{
  const box={exports:{}};
  vm.runInNewContext(read(B+'cobranza-uni-administracion.mp-zona1-grid.js'),{
    module:box,exports:box.exports,require:name=>{
      if(name==='../../config/db')return {};
      if(name==='../../services/cobranza-uni-scope.service')return {};
      if(name==='./cobranza-uni-administracion.constants')return constants;
      throw Error('Dependencia extra inesperada '+name);
    }
  });
  const grid=box.exports;
  const params=grid.parseGridParams_uni({page:'2',page_size:'25',sort:'id_mp_zona_1'});
  const sql=grid.buildGridSql_uni(params,{territorial:'mp.`zona_adm` = \'CENTRO\'',
    canonical:'mp.`id_proyecto_cobranza`'});
  assert.match(sql.countSql,/^SELECT COUNT\(\*\) AS total FROM `detalle_mp_2026_zona_1`/);
  assert.match(sql.selectSql,/^SELECT /);
  assert.match(sql.selectSql,/INNER JOIN `detalle_mp_2026` mp ON mp.`id_dmp` = z.`id_dmp`/);
  assert.match(sql.selectSql,/LIMIT \? OFFSET \?/);
  assert.deepEqual(Array.from(sql.selectParams.slice(-2)),[25,25]);
  assert.doesNotMatch(sql.countSql+' '+sql.selectSql,/\bUPDATE\b|\bINSERT\b|\bDELETE\b/i);
  const bulk=read(B+'cobranza-uni-administracion.mp-zona1-excel-bulk.js');
  assert.match(bulk,/buildVerifiedZone1Where_uni\(verified\)/);
  assert.match(bulk,/FOR UPDATE/);
});

test('F6 frontend: versiones de VA/MP renovadas y CSS de GC conservado',()=>{
  const main=read(FRONT+'main/main.js');
  for(const tag of ['va-manual-fields-v001','mp-manual-fields-v001','mp-zona1-manual-fields-v001'])
    assert.ok(main.includes(tag),tag);
  assert.match(main,/gestion-credito\.js\?v=20261023-f6-v001/);
  assert.match(main,/gestion-credito\.css\?v=20261023-gc-wide-v002/);
});
