'use strict';

// [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 3 V001]
// Pruebas autocontenidas: no requieren Aiven, Azure ni navegador real.
// Ademas se ejecuto QA visual aparte en Chromium headless con API simulada.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const installer = require('../tools/apply-cx-visitas-fase3-v001.cjs');
const assetJsPath = path.join(ROOT, 'modules/customer-experience-visitas/customer-experience-visitas.js');
const assetCssPath = path.join(ROOT, 'modules/customer-experience-visitas/customer-experience-visitas.css');
const jsSource = fs.readFileSync(assetJsPath, 'utf8');
const cssSource = fs.readFileSync(assetCssPath, 'utf8');

function fixtureApp() {
  return `(function(){\n  // [Aster | 2026-10-07 | ASTER-MG | FASE 1 ENTREGAS V001]\n`
    + `  function bindGlobalNavigation(){\n    applyTemporarySidebarPermissions();\n    openSidebarGroup(null);\n  }\n`
    + `  function initAfterAuth(){\n    bindCustomerExperienceEncuestas_cor();\n    bindEntregasControl_gnral();\n    bindGlobalNavigation();\n  }\n})();\n`;
}

function loadUI({ api } = {}) {
  const listeners = new Map();
  const dom = {
    'view-placeholder': {
      isConnected: true,
      innerHTML: '',
      listeners: {},
      eventRegistrationCount: {},
      contains() { return true; },
      addEventListener(name, handler) { this.listeners[name] = handler; this.eventRegistrationCount[name] = (this.eventRegistrationCount[name] || 0) + 1; },
      querySelector(selector) {
        return selector === '#cxv-dialog-overlay'
          ? { addEventListener() {} }
          : null;
      }
    },
    'cxv-page': {},
    'cxv-feedback': { textContent: '', hidden: true, className: '' },
    'cxv-results': { innerHTML: '' },
    'cxv-counter': { textContent: '' },
    'cxv-pager': { innerHTML: '' },
    'cxv-dialog-overlay': {
      hidden: true,
      querySelector: () => ({ focus() {} })
    },
    'cxv-dialog-title': { textContent: '' },
    'cxv-dialog-content': { innerHTML: '' },
    'cxv-save': { disabled: false, textContent: '' },
    'app-context-subtitle': { textContent: '' }
  };
  const mockDocument = {
    getElementById(id) { return dom[id] || null; },
    addEventListener(event, handler) { listeners.set(event, handler); }
  };
  const requests = [];
  const context = {
    console, window: {
      ManttoRouter: { getCurrent: () => ({ route: 'cx-visitas' }) },
      ManttoAuth: {
        isViewingAs: () => false,
        async api(url, options) {
          requests.push({ url, options });
          return (api || (async () => ({ ok: true, visitas: [], total: 0, page: 1, page_size: 25 })))(url, options);
        }
      },
      confirm: () => true
    },
    document: mockDocument,
    Date, Intl, URLSearchParams, Number, String, Object, Array,
    FormData: class FakeFormData {
      constructor(node) { this.data = node.values || {}; }
      *[Symbol.iterator]() { yield* Object.entries(this.data); }
    }
  };
  vm.createContext(context);
  vm.runInContext(jsSource, context, {filename:'customer-experience-visitas.js'});
  return { ui: context.window.ManttoCustomerExperienceVisitas, dom, listeners, requests, context };
}

test('01 - Los scripts JS de instalacion y frontend son sintacticamente validos', () => {
  new vm.Script(jsSource, { filename: 'customer-experience-visitas.js' });
  new vm.Script(fs.readFileSync(path.join(ROOT,'tools/apply-cx-visitas-fase3-v001.cjs'),'utf8'));
});

test('02 - Instalador rechaza un app.js distinto al blob base; sin escritura', () => {
  assert.throws(() => installer.transform(fixtureApp()), /CONFLICTO/);
  assert.equal(installer.BASE_BLOB, '9c857a6fedf488ff5bf6c2f311a6df0fcd4ddd24');
});

test('03 - La insercion conserva el router/modulos existentes y es idempotente', () => {
  const original = fixtureApp();
  const once = installer.transform(original,{verifyBlob:false});
  assert.equal(once.applied, true);
  const result = once.content;
  assert.match(result, /bindCustomerExperienceEncuestas_cor\(\)/);
  assert.match(result, /bindEntregasControl_gnral\(\)/);
  assert.match(result, /ensureCustomerExperienceVisitas_cor/);
  assert.match(result, /bindCustomerExperienceVisitas_cor\(\)/);
  assert.match(result, /bindCxVisitasMenu_cor\(\)/);
  assert.match(result, /cx-visitas/);
  assert.match(result, /CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS\.VER/);
  const twice = installer.transform(result, {verifyBlob:true});
  assert.equal(twice.already, true);
  assert.equal(twice.content, result);
});

test('04 - El instalador no escribe si falta alguno de los archivos requeridos', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blt-cxv-f3-'));
  try {
    const p = path.join(tmp, 'core/app.js');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, fixtureApp());
    assert.throws(() => installer.install(tmp), /Falta archivo requerido/);
    assert.equal(fs.readFileSync(p,'utf8'), fixtureApp());
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});

test('05 - Escape de HTML, IDs y formato de URL sin injection', () => {
  const {ui} = loadUI();
  assert.equal(ui.__test.escapeHtml('<img src=x onerror="x">'), '&lt;img src=x onerror=&quot;x&quot;&gt;');
  assert.equal(ui.__test.safePositiveId('12'), 12);
  for (const invalid of ['0', '-9', '9.2', '9 UNION SELECT', '9999999999999999999']) {
    assert.equal(ui.__test.safePositiveId(invalid), null);
  }
  const path = ui.__test.pathWithQuery({q:'Cliente & Corp', estado:'BORRADOR', desde:'2026-10-15'}, 2);
  assert.equal(path.startsWith('/api/customer-experience/visitas?'), true);
  assert.match(path, /q=Cliente\+%26\+Corp/);
  assert.match(path, /page=2/);
});

test('06 - Fechas CDMX (UTC-06) se convierten a ISO UTC y vuelven correctamente', () => {
  const {ui} = loadUI();
  const utc = ui.__test.mexicoInputToUtc('2026-10-15T12:30');
  assert.equal(utc,'2026-10-15T18:30:00.000Z');
  assert.equal(ui.__test.inputDateMexico(utc),'2026-10-15T12:30:00');
  assert.match(ui.__test.formattedDate('2026-10-15 18:30:00.000'),/CDMX/);
  assert.equal(ui.__test.mexicoInputToUtc(''),null);
});

test('07 - La conversion CDMX reconoce horario historico y rechaza horas invalidas', () => {
  const {ui} = loadUI();
  assert.equal(ui.__test.mexicoInputToUtc('2021-07-15T12:00'), '2021-07-15T17:00:00.000Z');
  assert.throws(()=>ui.__test.mexicoInputToUtc('2026-02-30T10:00'),/no existe/i);
  assert.throws(()=>ui.__test.mexicoInputToUtc('2022-04-03T02:30'),/no existe/i);
});

test('08 - La UI usa solo el contrato de Fase 2 sin inventar estados/columnas', () => {
  assert.match(jsSource, /\/api\/customer-experience\/visitas/);
  assert.match(jsSource, /method: mode === 'edit' \? 'PATCH' : 'POST'/);
  assert.match(jsSource, /method: 'DELETE'/);
  assert.match(jsSource, /BORRADOR/);
  assert.doesNotMatch(jsSource, /\bCOMPLETADA\b|\bREALIZADA\b|\bCANCELADA\b/);
  assert.match(jsSource, /ManttoAuth\.api/);
  assert.doesNotMatch(jsSource, /localStorage\.setItem|indexedDB|MOCK_DATA/);
});

test('09 - Init lista visitas de la API, escapa el contenido y no usa datos falsos', async () => {
  const {ui,dom,requests} = loadUI({ api: async (url) => {
    assert.match(url,/^\/api\/customer-experience\/visitas\?/);
    return {ok:true, source:'aiven', visitas:[{
      id_visita:7,titulo:'<script>alert(1)</script>',proyecto_nombre:'Hospital',
      cliente_nombre:'Cliente Real',referencia_origen:null,referencia_id:null,
      estado:'BORRADOR', id_usuario_responsable:5,
      fecha_programada_utc:'2026-10-15T18:30:00.000Z'
    }],total:1,page:1,page_size:25};
  }});
  assert.equal(await ui.init(), true);
  assert.equal(requests.length, 1);
  assert.match(dom['cxv-results'].innerHTML,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(dom['cxv-results'].innerHTML,/<script>alert/);
  assert.match(dom['cxv-results'].innerHTML,/Cliente Real/);
  assert.equal(dom['cxv-counter'].textContent,'1 registro(s) · pagina 1');
});

test('10 - Si la API no esta habilitada, la interfaz muestra diagnostico y no datos ficticios', async () => {
  const {ui,dom} = loadUI({api: async () => {
    const e=new Error('API no habilitada');e.status=503;e.code='CX_VISITAS_API_NOT_ENABLED';throw e;
  }});
  await ui.init();
  assert.match(dom['cxv-feedback'].textContent,/CX_VISITAS_API_ENABLED=true/);
  assert.match(dom['cxv-results'].innerHTML,/No fue posible consultar/);
  assert.equal(dom['cxv-feedback'].hidden,false);
});

test('11 - El modo Visor impide acciones de escritura en controles de frontend', () => {
  const {ui,context} = loadUI();
  context.window.ManttoAuth.isViewingAs = () => true;
  assert.equal(ui.__test.may('edit'),false);
  assert.equal(ui.__test.may('create'),false);
  assert.equal(ui.__test.may('deactivate'),false);
  assert.equal(ui.__test.may('list'),true);
});

test('12 - Los permisos efectivos conocidos niegan acciones sin confiar en cache ni UI', () => {
  const {ui,context} = loadUI();
  context.window.ManttoPermissions = {state(code){return {exists:true, efectivo:code.endsWith('.VER')};}};
  assert.equal(ui.__test.may('list'),false); // El permiso visual es falso.
  assert.equal(ui.__test.may('create'),false);
  context.window.ManttoPermissions = {state(code){return {exists:true, efectivo:code.endsWith('ACCESO_VISUAL') || code.endsWith('.VER')};}};
  assert.equal(ui.__test.may('list'),true);
  assert.equal(ui.__test.may('edit'),false);
});

test('13 - No se modifican estilos ni flujos de Dashboard y Encuestas', () => {
  assert.match(cssSource,/\.cxv-/);
  assert.doesNotMatch(cssSource,/\.ce-(?:page|row|modal)|\.cxd-(?:page|row|modal)/);
  const injected = installer.transform(fixtureApp(),{verifyBlob:false}).content;
  assert.equal((injected.match(/bindCustomerExperienceEncuestas_cor\(\)/g)||[]).length,1);
  assert.equal((injected.match(/bindEntregasControl_gnral\(\)/g)||[]).length,1);
});

test('14 - El formulario POST envia solo campos de Fase 2 y fecha normalizada UTC', async () => {
  const captured=[];
  const {ui,dom} = loadUI({api:async (url,options)=>{
    captured.push({url,options});
    if(options.method==='POST') return {ok:true,visita:{id_visita:21,estado:'BORRADOR'}};
    return {ok:true,visitas:[],total:0,page:1,page_size:25};
  }});
  await ui.init();
  const root=dom['view-placeholder'];
  root.listeners.click({target:{closest:()=>({dataset:{cxvAction:'new'},disabled:false})}});
  assert.match(dom['cxv-dialog-content'].innerHTML,/name="titulo"/);
  assert.match(dom['cxv-dialog-content'].innerHTML,/name="fecha_programada_local"/);
  let prevented=false;
  root.listeners.submit({
    preventDefault(){prevented=true;},
    target:{id:'cxv-edit-form',dataset:{mode:'create'},values:{
      titulo:'Primera visita',objetivo:'Escuchar al cliente',observaciones:'',
      referencia_origen:'CRM',referencia_id:'LEAD-11',proyecto_nombre:'Proyecto A',
      cliente_nombre:'Cliente B',ubicacion:'CDMX',
      fecha_programada_local:'2026-10-15T12:30',id_usuario_responsable:'11'
    }}
  });
  await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(prevented,true);
  const post=captured.find(x=>x.options.method==='POST');
  assert.ok(post);
  assert.equal(post.url,'/api/customer-experience/visitas');
  const body=JSON.parse(post.options.body);
  assert.equal(body.fecha_programada_utc,'2026-10-15T18:30:00.000Z');
  assert.equal(body.id_usuario_responsable,11);
  assert.equal(body.titulo,'Primera visita');
  for(const forbidden of ['id_visita','id_actor_usuario','inactivo','estado','fecha_realizada_utc','resultado','fecha_programada_local']) {
    assert.equal(Object.hasOwn(body,forbidden),false);
  }
  assert.match(dom['cxv-feedback'].textContent,/Visita registrada/);
});

test('15 - Detalle / historial / edicion utilizan rutas exactas de Fase 2', async () => {
  const requests=[];
  const {ui,dom}=loadUI({api:async(url,opts)=>{
    requests.push({url,method:opts.method,body:opts.body});
    if(url.includes('/7/historial?')) return {ok:true,eventos:[{
      id_evento:1,id_visita:7,id_actor_usuario:11,accion:'CREAR',
      detalle:{campos:['titulo']},created_at:'2026-10-15T18:00:00Z'
    }],total:1,page:1,page_size:25};
    if(url==='/api/customer-experience/visitas/7') return {ok:true,visita:{
      id_visita:7,titulo:'Visita #7',estado:'BORRADOR',id_usuario_creador:11,
      created_at:'2026-10-15T18:00:00Z',updated_at:'2026-10-15T18:00:00Z',
      fecha_programada_utc:'2026-10-15T18:00:00Z'
    }};
    return {ok:true,visitas:[],total:0,page:1,page_size:25};
  }});
  await ui.init();
  const root=dom['view-placeholder'];
  const click=(action,id)=>root.listeners.click({target:{closest:()=>({dataset:{cxvAction:action,id:String(id)},disabled:false})}});
  click('detail',7);
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.match(dom['cxv-dialog-content'].innerHTML,/Visita #7/);
  assert.ok(requests.some(x=>x.url==='/api/customer-experience/visitas/7'));
  click('history',7);
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.match(dom['cxv-dialog-content'].innerHTML,/Campos: titulo/);
  assert.ok(requests.some(x=>x.url==='/api/customer-experience/visitas/7/historial?page=1&page_size=25'));
  click('detail',7);
  await new Promise(resolve=>setTimeout(resolve,5));
  click('edit',7);
  assert.match(dom['cxv-dialog-content'].innerHTML,/data-mode="edit"/);
  root.listeners.submit({preventDefault(){},target:{id:'cxv-edit-form',dataset:{mode:'edit'},values:{
    titulo:'Visita modificada',objetivo:'',observaciones:'',referencia_origen:'',referencia_id:'',
    proyecto_nombre:'',cliente_nombre:'',ubicacion:'',fecha_programada_local:'',id_usuario_responsable:''
  }}});
  await new Promise(resolve=>setTimeout(resolve,20));
  const patch=requests.find(x=>x.method==='PATCH');
  assert.equal(patch?.url,'/api/customer-experience/visitas/7');
  assert.equal(JSON.parse(patch.body).titulo,'Visita modificada');
});

test('16 - Desactivar usa DELETE (baja logica) y confirmacion del usuario', async () => {
  const calls=[];
  const {ui,dom}=loadUI({api:async(url,opts)=>{
    calls.push({url,method:opts.method});
    if(opts.method==='DELETE')return {ok:true,id_visita:7,inactivo:1,desactivada:true};
    return {ok:true,visitas:[],total:0,page:1,page_size:25};
  }});
  await ui.init();
  dom['view-placeholder'].listeners.click({target:{closest:()=>({dataset:{cxvAction:'deactivate',id:'7'},disabled:false})}});
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.ok(calls.some(x=>x.url==='/api/customer-experience/visitas/7'&&x.method==='DELETE'));
  assert.match(dom['cxv-feedback'].textContent,/desactivada/);
});

test('17 - El menu CX Visitas falla cerrado sin API autorizada y aparece tras permiso real', async () => {
  const generated = installer.transform(fixtureApp(), { verifyBlob:false }).content;
  const start = generated.indexOf(installer.MARKER);
  const end = generated.indexOf('  // [Aster | 2026-10-07 | ASTER-MG | FASE 1 ENTREGAS V001]');
  const snippet = generated.slice(start, end);
  const item = {hidden:true,closest(){return group;}};
  const other = {hidden:false};
  const group = {hidden:false,querySelectorAll(){return [item,other];}};
  let apiHandler=async()=>({ok:true,visitas:[]});
  let calls=0;
  const context={
    window:{ManttoAuth:{async api(){calls++;return apiHandler();}}},
    document:{querySelector(query){return query==='[data-permission="cx_visitas"]' ? item : null;}},
    Promise,console
  };
  vm.createContext(context);
  vm.runInContext('(function(){'+snippet+'window.__cxvProbe=refreshCxVisitasMenu_cor;})();',context);
  await context.window.__cxvProbe();
  assert.equal(item.hidden,false);
  apiHandler=async()=>{throw new Error('403');};
  await context.window.__cxvProbe();
  assert.equal(item.hidden,true);
  const previousCalls=calls;
  context.window.ManttoPermissions={state(){return {exists:true,efectivo:false};}};
  await context.window.__cxvProbe();
  assert.equal(item.hidden,true);
  assert.equal(calls,previousCalls);
});

test('18 - El cache-bust del index conserva marca BLT NOW/BLT NOW GH y es idempotente', () => {
  const oldTag='<script src="./core/app.js?v=20261001-cobranza-pagos-detalle-v001"></script>';
  const html='<!doctype html><title>BLT NOW</title><meta content="BLT NOW GH">'+oldTag;
  assert.throws(()=>installer.transformIndex(html),/CONFLICTO/);
  const idempotent=installer.transformIndex('<title>BLT NOW</title><meta content="BLT NOW GH">'+
    '<script src="./core/app.js?v=20261015-cx-visitas-fase3-v001"></script>');
  assert.equal(idempotent.already,true);
  assert.equal(installer.INDEX_BASE_BLOB,'6c71db21ab191ba346d02c6460d0cd8a5fc53043');
});

test('19 - Instalador bloquea si Fase 2 no esta presente antes de escribir el core', () => {
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'blt-cxv-f3-precheck-'));
  try {
    for (const file of [
      'core/app.js','index.html','modules/customer-experience-visitas/customer-experience-visitas.js',
      'modules/customer-experience-visitas/customer-experience-visitas.css',
      'backend/src/modules/customer-experience/customer-experience.routes.js',
      'backend/src/modules/customer-experience/customer-experience-visitas.routes.js'
    ]) {
      const dest=path.join(tmp,file);
      fs.mkdirSync(path.dirname(dest),{recursive:true});
      fs.writeFileSync(dest, file.endsWith('.css')?cssSource:
        file.endsWith('customer-experience-visitas.js')?jsSource:fixtureApp());
    }
    assert.throws(()=>installer.install(tmp,{checkOnly:true}),/Fase 2 no detectada/);
    assert.equal(fs.readFileSync(path.join(tmp,'core/app.js'),'utf8'),fixtureApp());
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});


test('20 - Reabrir Visitas no acumula listeners de click ni submit', async () => {
  const {ui, dom} = loadUI();
  await ui.init();
  await ui.init();
  await ui.init();
  const root = dom['view-placeholder'];
  assert.equal(root.eventRegistrationCount.click, 1);
  assert.equal(root.eventRegistrationCount.submit, 1);
});
