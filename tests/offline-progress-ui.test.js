'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

function makeDom(){
  const nodes=new Map(),handlers=new Map();
  function element(tag='div'){
    const node={tag,hidden:false,checked:false,value:'',disabled:false,children:[],style:{},textContent:'',
      append(...items){this.children.push(...items);},replaceChildren(...items){this.children=[...items];},
      remove(){this.removed=true;},setAttribute(key,val){this[key]=val;},
      addEventListener(key,cb){this['on'+key]=cb;}};
    Object.defineProperty(node,'innerHTML',{get(){return this._html||'';},set(markup){
      this._html=String(markup);this.children=[];
      for(const match of this._html.matchAll(/id="([^"]+)"/g)){
        const child=element();
        if(/id="off-backup-progress" hidden/.test(this._html)&&match[1]==='off-backup-progress')child.hidden=true;
        nodes.set(match[1],child);
      }
    }});
    return node;
  }
  const view=element('section');
  const doc={getElementById:id=>id==='view-offline-configuracion'?view:(nodes.get(id)||null),
    createElement:element,addEventListener(name,fn){handlers.set(name,fn);},dispatchEvent(){}};
  return {doc,nodes,view,emit(name,detail){const cb=handlers.get(`mantto:offline-backup-${name}`);assert.ok(cb,'Falta evento '+name);return cb({detail});}};
}

async function mounted(){
  const dom=makeDom();
  const scope='a'.repeat(64),catalog=[{code:'OPERACION_RESUMEN_DEL_DIA',name:'Resumen del Día',
    domain:'UNITED',scope:{scope_signature:scope,mode:'ZONAS',zone_ids:[1]},datasets:['operacion-resumen-dia'],backup_status:'EXPORTADOR_COMPLETO'}];
  const caps={permission_code:'GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',effective_user_id:20,
    catalog_modules:catalog,datasets:[{key:'operacion-resumen-dia',domain:'UNITED'}]};
  const mem=new Map();
  const sandbox={window:{
      ManttoPermissions:{state:()=>({exists:true,efectivo:true})},
      ManttoAuth:{getActorUser:()=>({id_SB:20}),getUser:()=>({id_SB:20}),apiGet:async()=>({data:caps})},
      ManttoOfflineScheduler:{evaluate:()=>({due:false})},
      ManttoOfflineStorage:{listSnapshots:async()=>[],outboxStatus:async()=>({count:0}),listPendingActions:async()=>[]},
      indexedDB:{},addEventListener(){}},
    document:dom.doc,navigator:{onLine:true,storage:{estimate:async()=>({usage:1,quota:1000}),persisted:async()=>true}},
    localStorage:{getItem:key=>mem.get(key)||null,setItem:(key,val)=>mem.set(key,String(val)),removeItem:key=>mem.delete(key)},
    Date,Intl,console};
  vm.runInNewContext(read('modules/offline-pilot/offline-pilot.js'),sandbox);
  assert.equal(await sandbox.window.ManttoOfflinePilot.init(),true);
  return dom;
}

test('barra muestra módulo y progreso 0/100, porcentaje global; oculta conteos por tabla',async()=>{
  const dom=await mounted();
  assert.equal(dom.nodes.get('off-backup-progress').hidden,true);
  dom.emit('start',{total_modules:2,overall_percent:0});
  assert.equal(dom.nodes.get('off-backup-progress').hidden,false);
  assert.equal(dom.nodes.get('off-progress-percent').textContent,'0%');
  dom.emit('module-start',{module:'Home',module_percent:0,overall_percent:0,total_modules:2});
  assert.equal(dom.nodes.get('off-progress-module').textContent,'Home 0/100');
  dom.emit('progress',{module:'Home',kind:'portafolio',count:900,total:3714,module_percent:24,overall_percent:12});
  assert.equal(dom.nodes.get('off-progress-module').textContent,'Home 24/100');
  assert.equal(dom.nodes.get('off-progress-percent').textContent,'12%');
  assert.equal(dom.nodes.get('off-progress-fill').style.width,'12%');
  assert.equal(dom.nodes.get('off-progress-track')['aria-valuenow'],'12');
  assert.doesNotMatch(dom.nodes.get('off-progress-module').textContent,/portafolio|900|3714/i);
  assert.doesNotMatch(dom.nodes.get('off-backup-message').textContent,/portafolio|900|3714/i);
});

test('resumen sin número 71 y sin alerta técnica si respaldos disponibles terminaron',async()=>{
  const dom=await mounted();
  dom.emit('start',{total_modules:2,overall_percent:0});
  dom.emit('completed',{module:'Proyectos',module_percent:100,overall_percent:100});
  await dom.emit('summary',{status:'PASS',total_modules:2,completed:[{dataset:'operacion-resumen-dia'},{dataset:'instalaciones-proyectos'}],failed:[],unsupported:Array(71).fill('NO_EXPORTABLE')});
  const msg=dom.nodes.get('off-backup-message').textContent;
  assert.match(msg,/2 módulos disponibles/);
  assert.doesNotMatch(msg,/71|exportador|parcial/i);
  assert.equal(dom.nodes.get('off-progress-percent').textContent,'100%');
});

test('error parcial se informa y barra no miente sobre 100%',async()=>{
  const dom=await mounted();
  dom.emit('start',{total_modules:2,overall_percent:0});
  dom.emit('error',{module:'Proyectos',overall_percent:50,module_percent:0});
  await dom.emit('summary',{status:'FAIL',total_modules:2,completed:[{dataset:'operacion-resumen-dia'}],failed:[{dataset:'instalaciones-proyectos',error:'Fallo conexión'}],unsupported:[]});
  assert.equal(dom.nodes.get('off-progress-percent').textContent,'50%');
  assert.match(dom.nodes.get('off-backup-message').textContent,/incompleto/i);
});

test('módulos sin respaldo habilitado se excluyen del cálculo; sin porcentaje fingido',async()=>{
  const dom=await mounted();
  dom.emit('start',{total_modules:0,overall_percent:0});
  await dom.emit('summary',{status:'NO_AVAILABLE',total_modules:0,completed:[],failed:[],unsupported:Array(71).fill('NO_EXPORTABLE')});
  assert.equal(dom.nodes.get('off-backup-progress').hidden,true);
  assert.match(dom.nodes.get('off-backup-message').textContent,/No hay módulos seleccionados/);
});
