'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_EXCEL_FASE_3_V001]
// Pruebas aisladas del editor MP. Sin API real, conexiones Aiven, GAS, ni deploy.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const JS = 'modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js';
const CSS = 'modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.css';
const MAIN = 'modules/cobranza-uni/administracion/main/main.js';
const C = require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants');
const F = require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-formulas');
const API = '/api/cobranza-uni/administracion/tablas/detalle_mp_2026/registros';
const allowedFields = ['zona_adm','periodicidad','momento_facturacion','forma_pago','factor_monto_anual'];
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function createHarness({canEdit=true,viewer=false,editableFields=allowedFields,failPatch=false}={}) {
  const events=new Map(),nodes=new Map(),requests=[];
  const rows=[
    {id_dmp:'41',zona_adm:'ORIGEN',proyecto:'<script>mal</script>',periodicidad:'Mensual',factor_monto_anual:12,
      iguala:'100.00',monto_anual:'1200.00'},
    {id_dmp:'42',zona_adm:'SUR',proyecto:'B',periodicidad:'Bimestral',factor_monto_anual:6,
      iguala:'100.00',monto_anual:'600.00'}
  ];
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{
      textContent:'',innerHTML:'',value:'',dataset:{},disabled:false,hidden:true,
      scrollLeft:0,scrollTop:0,reset(){},setAttribute(k,v){this[k]=v;},focus(){},select(){}
    });
    return nodes.get(selector);
  };
  const root={
    innerHTML:'',
    addEventListener(name,fn){events.set(name,fn);},
    removeEventListener(name){events.delete(name);},
    replaceChildren(){this.innerHTML='';},
    querySelector:node,
    querySelectorAll(){return [];},
    contains(){return true;}
  };
  const doc={createElement(tag){return {
    tagName:String(tag).toUpperCase(),attributes:{},value:'',className:'',
    setAttribute(k,v){this.attributes[k]=v;},
    matches(sel){return sel==='[data-mp-cell-input]'&&Object.hasOwn(this.attributes,'data-mp-cell-input');},
    focus(){this.focused=true;},select(){this.selected=true;}
  };}};
  const win={
    confirm(){return true;},
    ManttoAuth:{
      isViewingAs(){return viewer;},
      async apiGet(url){
        requests.push({method:'GET',url});
        if(url.includes('/conciliacion'))throw Error('No consultar diagnóstico en prueba');
        return {ok:true,table:'detalle_mp_2026',readonly:true,
          columns:C.MP_COLUMNS_UNI,rows:rows.map(row=>({...row})),total:rows.length,pages:1,
          formula_preview:F.buildMpFormulaPreview_uni(rows)};
      },
      async api(url,options){
        const body=JSON.parse(options.body);
        requests.push({method:options.method,url,body});
        if(options.method!=='PATCH'||failPatch)throw Error('PATCH rechazado en simulación');
        const [field,value]=Object.entries(body.changes)[0];
        if(url===API+'/edicion-multiple'){
          assert.equal(body.ids.length,2);
          for(const id of body.ids){
            const row=rows.find(x=>x.id_dmp===id);
            assert.equal(row[field]??null,body.expected[id][field]);
            row[field]=value;
          }
          return {ok:true,table:'detalle_mp_2026',field,total:body.ids.length,changed:2};
        }
        const id=url.slice(API.length+1),row=rows.find(r=>r.id_dmp===id);
        if(!row)throw Error('Id erróneo');
        assert.equal(row[field]??null,body.expected[field], 'El valor anterior corresponde a ese registro');
        row[field]=value;
        return {ok:true,table:'detalle_mp_2026',field,total:1,changed:1};
      }
    }
  };
  vm.runInNewContext(read(JS),{window:win,document:doc,URLSearchParams});
  const app=win.ManttoCobranzaAdministracionMP_uni.mount(root,{
    canEdit,editableFields,canPrepareZone1:false,canWriteZone1:false,isCurrent:()=>true
  });
  function td(field,id='41',enabled=true){
    const classes=new Set(enabled?['cua-mp-canedit']:[]);
    let currentInput;
    return {
      dataset:{mpField:field},
      classList:{contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c)},
      closest(sel){return sel==='tr'?{dataset:{mpId:id}}:null;},
      matches(sel){return sel==='td.cua-mp-canedit';},
      replaceChildren(input){currentInput=input;},
      querySelector(sel){return sel==='[data-mp-cell-input]'?currentInput:null;},
      focus(){this.focused=true;},innerHTML:'',
      get input(){return currentInput;}
    };
  }
  return {app,root,events,nodes,rows,requests,node,td};
}

function dbl(ui,cell){ui.events.get('dblclick')({target:{closest:sel=>sel==='td.cua-mp-canedit'?cell:null}});}
function key(ui,target,name){ui.events.get('keydown')({target,key:name,preventDefault(){this.defaultPrevented=true;}});}

test('MP F3: muestra las 20 columnas en UNA tabla Excel, sin modal ni grupos; Zona 1 disponible solo por pestaña',async()=>{
  const ui=createHarness();await tick();
  assert.equal(C.MP_COLUMNS_UNI.length,20);
  assert.match(ui.root.innerHTML,/<table class="cua-mp-table"/);
  assert.match(ui.root.innerHTML,/data-mp-tab="zona1"/,'Zona 1 tiene pestaña propia');
  assert.doesNotMatch(ui.root.innerHTML,/data-mp-zona1-dialog|data-mp-zona1-preflight/);
  assert.match(ui.root.innerHTML,/data-mp-reconcile/);
  assert.doesNotMatch(ui.root.innerHTML,/data-mp-group|data-mp-dialog|data-mp-edit-form/);
  assert.equal((ui.node('[data-mp-head]').innerHTML.match(/<th\b/g)||[]).length,20);
  assert.doesNotMatch(ui.node('[data-mp-body]').innerHTML,/data-mp-zona1="41"/);
  assert.match(ui.node('[data-mp-body]').innerHTML,/cua-mp-canedit/);
  assert.match(ui.node('[data-mp-body]').innerHTML,/&lt;script&gt;mal&lt;\/script&gt;/);
  ui.app.destroy();
});

test('MP F3: doble clic edita en la celda, Enter hace PATCH con expected y recarga tabla',async()=>{
  const ui=createHarness();await tick();const cell=ui.td('zona_adm');
  dbl(ui,cell);assert.equal(cell.input?.value,'ORIGEN');assert.equal(cell.input?.focused,true);
  cell.input.value='NORTE';key(ui,cell.input,'Enter');await tick();
  const writes=ui.requests.filter(x=>x.method==='PATCH');
  assert.equal(writes.length,1);
  assert.equal(writes[0].url,API+'/41');
  assert.equal(writes[0].body.changes.zona_adm,'NORTE');
  assert.equal(writes[0].body.expected.zona_adm,'ORIGEN');
  assert.equal(ui.rows[0].zona_adm,'NORTE');
  assert.equal(ui.requests.filter(x=>x.method==='GET').length,2);
  ui.app.destroy();
});

test('MP F3: Enter con td enfocado abre input, Escape cancela sin PATCH',async()=>{
  const ui=createHarness();await tick();const cell=ui.td('zona_adm');
  key(ui,cell,'Enter');assert.equal(cell.input.value,'ORIGEN');
  cell.input.value='NO PERSISTIR';key(ui,cell.input,'Escape');await tick();
  assert.equal(ui.requests.filter(x=>x.method==='PATCH').length,0);
  assert.equal(ui.rows[0].zona_adm,'ORIGEN');
  assert.match(cell.innerHTML,/ORIGEN/);
  ui.app.destroy();
});

test('MP F3: blur guarda una sola vez aun si Enter ya inició PATCH',async()=>{
  const ui=createHarness();await tick();const cell=ui.td('zona_adm');
  dbl(ui,cell);const input=cell.input;input.value='CENTRO';
  key(ui,input,'Enter');ui.events.get('focusout')({target:input});await tick();
  assert.equal(ui.requests.filter(x=>x.method==='PATCH').length,1);
  assert.equal(ui.rows[0].zona_adm,'CENTRO');ui.app.destroy();
});

test('MP F3: lector/visor nunca abre edición, aunque haya marcas de celda simuladas',async()=>{
  for(const opts of [{canEdit:false},{viewer:true}]){
    const ui=createHarness(opts);await tick();const cell=ui.td('zona_adm');
    dbl(ui,cell);assert.equal(cell.input,undefined);
    assert.doesNotMatch(ui.root.innerHTML,/data-mp-bulk-form/);
    assert.equal(ui.requests.filter(x=>x.method==='PATCH').length,0);
    ui.app.destroy();
  }
});

test('MP F3: no permite editar PK, identidad, cálculo ni campos fuera de whitelist',async()=>{
  const ui=createHarness();await tick();
  for(const name of ['id_dmp','id_proyecto_cobranza','proyecto','cliente','iguala','monto_anual','pendiente']){
    const cell=ui.td(name);dbl(ui,cell);assert.equal(cell.input,undefined,name);
  }
  const limited=createHarness({editableFields:['zona_adm']});await tick();
  const cell=limited.td('periodicidad');dbl(limited,cell);assert.equal(cell.input,undefined);
  ui.app.destroy();limited.app.destroy();
});

test('MP F3: edición múltiple 2 registros conserva expected independiente, un solo PATCH',async()=>{
  const ui=createHarness();await tick();
  const bulkField=ui.node('[data-mp-bulk-field]');bulkField.value='zona_adm';
  ui.node('[data-mp-bulk-value]').value='CENTRO';
  const onChange=ui.events.get('change');
  onChange({target:{matches:sel=>sel==='[data-mp-select]',value:'41',checked:true}});
  onChange({target:{matches:sel=>sel==='[data-mp-select]',value:'42',checked:true}});
  let prevented=false;
  ui.events.get('submit')({target:{matches:sel=>sel==='[data-mp-bulk-form]'},preventDefault(){prevented=true;}});
  await tick();assert.equal(prevented,true);
  const writes=ui.requests.filter(x=>x.method==='PATCH');
  assert.equal(writes.length,1);
  assert.equal(writes[0].url,API+'/edicion-multiple');
  assert.equal(writes[0].body.expected['41'].zona_adm,'ORIGEN');
  assert.equal(writes[0].body.expected['42'].zona_adm,'SUR');
  assert.deepEqual(ui.rows.map(x=>x.zona_adm),['CENTRO','CENTRO']);
  ui.app.destroy();
});

test('MP F3: PATCH rechazado no muestra éxito ni cambia fila, y consulta la fuente oficial',async()=>{
  const ui=createHarness({failPatch:true});await tick();const cell=ui.td('zona_adm');
  dbl(ui,cell);cell.input.value='OTRO';key(ui,cell.input,'Enter');await tick();
  assert.equal(ui.rows[0].zona_adm,'ORIGEN');
  assert.equal(ui.requests.filter(x=>x.method==='PATCH').length,1);
  assert.equal(ui.requests.filter(x=>x.method==='GET').length,2);
  assert.match(ui.node('[data-mp-status]').textContent,/No se guardó MP/);
  ui.app.destroy();
});

test('MP F3: limpieza de grupos y editor modal sin retirar consultas, filtros, cálculos ni Zona 1',()=>{
  const code=read(JS),css=read(CSS),main=read(MAIN);
  for(const token of ['data-mp-search','data-mp-estatus','data-mp-pendientes','data-mp-filter-column',
    'data-mp-filter-value','data-mp-page-size','data-mp-sort','data-mp-prev','data-mp-next',
    'data-mp-bulk-form','data-mp-tab','data-mp-reconcile','formula_preview',
    'data-mp-cell-input','cua-mp-canedit',"method:'PATCH'",'expected'])assert.ok(code.includes(token),token);
  for(const token of ['const GROUPS','data-mp-group','data-mp-dialog','data-mp-edit-form','closeDialog',
    'cua-mp-cell-edit'])assert.equal(code.includes(token),false,'Huérfano: '+token);
  assert.match(css,/\.cua-mp-cell\.cua-mp-canedit\{/);
  assert.match(css,/\.cua-mp-cell\.cua-mp-editing\{/);
  assert.match(css,/\.cua-mp-edit-input\{/);
  assert.doesNotMatch(css,/\.cua-mp-(?:group|dialog|cell-edit)(?:\s|\{|:)/);
  assert.match(css,/\.cua-mp-tabs\{/);
  assert.doesNotMatch(css,/\.cua-mp-zona1-dialog|\.cua-mp-zona1-backdrop/);
  assert.match(main,/20261023-mp-manual-fields-v001/);
  assert.match(main,/20261023-va-manual-fields-v001/);
  assert.doesNotMatch(code,/\b(?:INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+`detalle_mp_2026`)\b/i);
});
