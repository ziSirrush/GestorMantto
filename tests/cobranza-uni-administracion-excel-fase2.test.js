'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_EXCEL_FASE_2_V001]
// Regresion aislada; no conexiones a Aiven, Azure, GAS ni GitHub.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const JS = 'modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js';
const CSS = 'modules/cobranza-uni/administracion/venta-adicional/venta-adicional.css';
const MAIN = 'modules/cobranza-uni/administracion/main/main.js';
const contract = require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants');
const inputCols = contract.PC_COLUMNS_UNI;
const editableNames = ['ov', 'fecha_pago', 'comentarios_cobranza'];

function makeUi({canEdit=true, editableFields=editableNames, responseOverrides={}}={}) {
  const events = {}, fields = new Map(), requests = [];
  const row = {id_pc:'2041',ov:'OV-1',fecha_pago:'2026-10-01',comentarios_cobranza:'INICIAL'};
  function node(selector) {
    if (!fields.has(selector)) fields.set(selector, {
      innerHTML:'',textContent:'',value:'',hidden:true,disabled:false,
      dataset:{}, scrollLeft:0,scrollTop:0,
      setAttribute(name,value){this[name]=value;},
      focus(){},select(){},reset(){this.resetCalled=true;},
      scrollTo(){},
      get childElementCount(){return 0;}
    });
    return fields.get(selector);
  }
  const root = {
    innerHTML:'',
    addEventListener(name,listener){events[name]=listener;},
    removeEventListener(name){delete events[name];},
    replaceChildren(){this.innerHTML='';},
    contains(){return true;},
    querySelector:node,
    querySelectorAll(){return [];}
  };
  const dom = {
    hidden:false,
    createElement(name){return {
      tagName:name.toUpperCase(), value:'',className:'',
      setAttribute(k,v){this[k]=v;},focus(){this.focused=true;},select(){this.selected=true;},
      matches(selector){return selector==='[data-pc-cell-input]' && this['data-pc-cell-input']==='';}
    };}
  };
  const win = {
    ManttoAuth: {
      apiGet:async url=>{
        requests.push({method:'GET',url});
        const query = new URLSearchParams(url.split('?')[1]);
        return {
          ok:true, table:'pc',readonly:true,columns:inputCols,
          rows:[{...row}],page:Number(query.get('page')),page_size:Number(query.get('page_size')),
          total:1,pages:1,
          ...responseOverrides
        };
      },
      api:async (url, opts)=>{
        const parsed = JSON.parse(opts.body);
        requests.push({method:opts.method,url,body:parsed});
        if (opts.method==='PATCH' && url.endsWith('/2041')) {
          const [field,value] = Object.entries(parsed.changes)[0];
          const expected = parsed.expected[field];
          if (row[field] !== expected) throw Error('STORED_EXPECTED_DIFFERENT');
          row[field] = value;
          return {ok:true,table:'pc',field,total:1,changed:1};
        }
        return {ok:true,table:'pc',total:2,changed:2};
      }
    }
  };
  vm.runInNewContext(read(JS),{window:win,document:dom,URLSearchParams,Intl,Date});
  const app=win.ManttoCobranzaAdministracionPC_uni.mount(root,{
    canEdit, editableFields, canPrepareCreate:true,canCreate:false,isCurrent:()=>true
  });
  function td(field,enabled=true){
    const classes=new Set(enabled?['cua-pc-canedit']:[]);
    let active=null;
    return {
      dataset:{pcField:field},classList:{
        contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c)
      },
      closest(selector){return selector==='tr'?{dataset:{pcRow:'2041'}}:null;},
      querySelector(selector){return selector==='[data-pc-cell-input]'?active:null;},
      replaceChildren(el){active=el;this.active=el;},
      focus(){this.focused=true;},innerHTML:'',
      get activeInput(){return active;}
    };
  }
  return {app,events,root,row,fields,requests,td};
}
async function flush() {await new Promise(resolve=>setImmediate(resolve));}

test('VA F2 Excel: el grid muestra las 31 columnas, sin tabs ni edición modal', async()=>{
  assert.equal(inputCols.length,31);
  const ui=makeUi();await flush();
  assert.match(ui.root.innerHTML,/data-cua-pc-grid/);
  assert.match(ui.root.innerHTML,/<table class="cua-pc-grid"/);
  assert.doesNotMatch(ui.root.innerHTML,/data-pc-group|data-pc-dialog=/);
  assert.match(ui.root.innerHTML,/data-pc-create-dialog/,'la alta se conserva');
  assert.match(ui.fields.get('[data-pc-head]').innerHTML,/data-pc-sort="ov"/);
  assert.equal((ui.fields.get('[data-pc-head]').innerHTML.match(/<th\b/g)||[]).length,31);
  assert.match(ui.fields.get('[data-pc-body]').innerHTML,/cua-pc-canedit/);
  ui.app.destroy();
});

test('VA F2 Excel: doble clic abre input en celda y Enter persiste changes+expected',async()=>{
  const ui=makeUi();await flush();const cell=ui.td('ov');
  ui.events.dblclick({target:{closest:selector=>selector==='td.cua-pc-canedit'?cell:null}});
  assert.equal(cell.activeInput?.tagName,'INPUT');
  assert.equal(cell.activeInput?.value,'OV-1');
  assert.equal(cell.activeInput?.focused,true);
  cell.activeInput.value='OV-2';
  ui.events.keydown({target:cell.activeInput,key:'Enter',preventDefault(){}});
  await flush();
  const updates=ui.requests.filter(e=>e.method==='PATCH');
  assert.equal(updates.length,1);
  assert.equal(updates[0].url,'/api/cobranza-uni/administracion/tablas/pc/registros/2041');
  assert.equal(updates[0].body.changes.ov,'OV-2');
  assert.equal(updates[0].body.expected.ov,'OV-1');
  assert.equal(ui.row.ov,'OV-2');
  assert.ok(ui.requests.filter(e=>e.method==='GET').length>=2);
  ui.app.destroy();
});

test('VA F2 Excel: Escape cancela sin enviar PATCH',async()=>{
  const ui=makeUi();await flush();const cell=ui.td('ov');
  ui.events.dblclick({target:{closest:()=>cell}});
  cell.activeInput.value='NO GUARDAR';
  ui.events.keydown({target:cell.activeInput,key:'Escape',preventDefault(){}});
  await flush();
  assert.equal(ui.row.ov,'OV-1');
  assert.equal(ui.requests.filter(e=>e.method==='PATCH').length,0);
  assert.match(cell.innerHTML,/OV-1/);
  ui.app.destroy();
});

test('VA F2 Excel: blur guarda y no duplica PATCH tras Enter',async()=>{
  const ui=makeUi();await flush();const cell=ui.td('ov');
  ui.events.dblclick({target:{closest:()=>cell}});const input=cell.activeInput;
  input.value='OV-BLUR';
  ui.events.keydown({target:input,key:'Enter',preventDefault(){}});
  ui.events.focusout({target:input});
  await flush();
  assert.equal(ui.requests.filter(e=>e.method==='PATCH').length,1);
  assert.equal(ui.row.ov,'OV-BLUR');ui.app.destroy();
});

test('VA F2 Excel: modo lector no permite edición ni revela editor',async()=>{
  const ui=makeUi({canEdit:false});await flush();const cell=ui.td('ov');
  ui.events.dblclick({target:{closest:()=>cell}});
  assert.equal(cell.activeInput,null);
  assert.doesNotMatch(ui.root.innerHTML,/data-pc-bulk-form/);
  assert.equal(ui.requests.filter(x=>x.method==='PATCH').length,0);
  ui.app.destroy();
});

test('VA F2 Excel: solo whitelist, sin editar PK, derivados ni otra celda',async()=>{
  const ui=makeUi();await flush();
  for(const name of ['id_pc','adeudo','precio_venta','proyecto']){
    const cell=ui.td(name);
    ui.events.dblclick({target:{closest:()=>cell}});
    assert.equal(cell.activeInput,null,name);
  }
  const other=makeUi({editableFields:['comentarios_cobranza']});await flush();
  const blocked=other.td('ov');other.events.dblclick({target:{closest:()=>blocked}});
  assert.equal(blocked.activeInput,null);
  assert.equal(other.requests.filter(x=>x.method==='PATCH').length,0);
  ui.app.destroy();other.app.destroy();
});

test('VA F2 Excel: comentarios se editan en textarea y Ctrl+Enter guarda',async()=>{
  const ui=makeUi();await flush();const cell=ui.td('comentarios_cobranza');
  ui.events.dblclick({target:{closest:()=>cell}});
  const input=cell.activeInput;
  assert.equal(input.tagName,'TEXTAREA');
  input.value='Nuevo comentario';
  ui.events.keydown({target:input,key:'Enter',ctrlKey:false,preventDefault(){}});
  assert.equal(ui.requests.filter(x=>x.method==='PATCH').length,0);
  ui.events.keydown({target:input,key:'Enter',ctrlKey:true,preventDefault(){}});
  await flush();
  assert.equal(ui.row.comentarios_cobranza,'Nuevo comentario');
  assert.equal(ui.requests.filter(x=>x.method==='PATCH').length,1);
  ui.app.destroy();
});

test('VA F2 Excel: conserva batch, filtros, orden, previews y creación en flujo independiente',()=>{
  const src=read(JS);
  for(const token of ["method:'PATCH'","'/edicion-multiple'",'data-pc-search','data-pc-filter-column',
    'data-pc-sort','data-pc-prev','data-pc-next','data-pc-bulk-form','data-pc-create-open',
    'data-pc-create-form','data-pc-create-dialog','data-pc-relations','formula_preview','relation_preview',
    "method:'POST'",'data-pc-page-size'])assert.ok(src.includes(token),token);
  for(const token of ['GROUPS','data-pc-group','showDialog','closeDialog','data-pc-edit-form',
    'data-pc-dialog hidden','data-pc-edit-field'])assert.ok(!src.includes(token),token);
  assert.doesNotMatch(src,/\b(?:INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+`pc`)\b/i);
});

test('VA F2 Excel: estilos de celda y solo panel de alta; carga con cache-bust V001',()=>{
  const css=read(CSS),main=read(MAIN);
  assert.match(css,/\.cua-pc-cell\.cua-pc-canedit\{/);
  assert.match(css,/\.cua-pc-cell\.cua-pc-editing\{/);
  assert.match(css,/\.cua-pc-edit-input\{/);
  assert.match(css,/\.cua-pc-create-panel\{/);
  assert.doesNotMatch(css,/\.cua-pc-group(?:\s|\{|:)/);
  assert.doesNotMatch(css,/\.cua-pc-cell-edit(?:\s|\{|:)/);
  assert.match(main,/20261023-va-manual-fields-v001/);
});
