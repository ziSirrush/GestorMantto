'use strict';

// FASE 3: pruebas offline de UI contra el contrato de backend Fase 2.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'modules/dashboard-logistica/dashboard-logistica.js'),'utf8');
const loader=fs.readFileSync(path.join(root,'core/module-loader.js'),'utf8');

function element() {
  const attrs={};
  const props={};
  const classes=new Set();
  return {
    innerHTML:'', textContent:'', disabled:false, value:'',
    style:{setProperty(name,value){props[name]=value;},props},
    classList:{toggle(name,active){if(active)classes.add(name);else classes.delete(name);},add(name){classes.add(name);},contains(name){return classes.has(name);}},
    setAttribute(name,value){attrs[name]=value;},
    getAttribute(name){return attrs[name];},
    attrs
  };
}

function setup(backend){
  const hook='window.ManttoDashboardLogistica={init,reload:load};';
  assert.equal(js.split(hook).length,2,'El punto de prueba debe ser único');
  const harness=js.replace(hook,`window.__TEST__={HTML,state,renderRouteTable,formatAverageDays,renderContainersRing,renderAnalytics,renderAnalyticsError,renderAverageFilter,fetchAnalytics,applyAveragePeriod,load,bindSinAccordion};\n  ${hook}`);
  const nodes=new Map();
  const requests=[];
  const window={ MANTTO_API_BASE:'https://example.invalid', ManttoAuth:{authHeaders(){return {Authorization:'Bearer unit-test'};}} };
  const fetch=async (url,options)=>{
    requests.push({url,options});
    const response=backend?await backend(url):{ok:true,data:apiPayload(2026)};
    return {ok:true,async text(){return JSON.stringify(response);}};
  };
  vm.runInNewContext(harness,{window, document:{getElementById:id=>nodes.get(id)||null}, fetch,console,URL,encodeURIComponent}, {timeout:1000});
  const api=window.__TEST__;
  for(const id of [
    'dl-route-body','dl-route-count','dl-average-year-select','dl-average-year-apply','dl-average-year-status',
    'dl-containers-ring','dl-containers-year','dl-containers-total','dl-containers-20','dl-containers-40',
    'dl-containers-20-pct','dl-containers-40-pct','dl-containers-note','dl-containers-months-period',
    'dl-containers-months-first','dl-containers-months-second'
  ])nodes.set(id,element());
  return {api,nodes,requests};
}

function apiPayload(period){
  const all=period==='all';
  const year=all?'all':Number(period);
  const label=all?'Todos los años (ETD)':'ETD '+year;
  return {
    anio_actual:2026,
    promedios:{periodo:period,anios_disponibles:[2026,2025,2024],criterio_anio:'fecha_salida_real'},
    tablas:{
      promedios_por_ruta:[{
        puerto_origen:year===2025?'Ningbo':'Shanghai',puerto_destino:'Manzanillo',modo:'Marítimo',
        operaciones:4,operaciones_salida:3,promedio_dias_salida:13.5,
        operaciones_transito:2,promedio_dias_llegada:21,
        operaciones_completas:1,promedio_dias_total:41
      }]
    },
    contenedores:{anio:2026,contenedores_20_dc:999,contenedores_40_hq:999},
    contenedores_periodo:{
      periodo:period,etiqueta:label,anio:period,contenedores_20_dc:year===2025?1:7,
      contenedores_40_hq:year===2025?2:9,operaciones_con_dato:year===2025?2:8,
      meses:[{mes:1,contenedores_20_dc:1,contenedores_40_hq:2}]
    }
  };
}

const $=(r,id)=>r.nodes.get(id);

test('una tabla por ruta, contenedores y bloques anteriores preservados',()=>{
  const {api}=setup();
  const html=api.HTML;
  assert.match(html,/Promedios logísticos por ruta/);
  assert.match(html,/<tbody id="dl-route-body"><\/tbody>/);
  assert.match(html,/<th scope="col">Puerto origen<\/th>/);
  assert.match(html,/<th scope="col">Puerto destino<\/th>/);
  assert.match(html,/<th scope="col">Modo ICT<\/th>/);
  assert.equal((html.match(/<th scope="col">EXW → Zarpe<\/th>/g)||[]).length,1);
  assert.equal((html.match(/<th scope="col">Zarpe → Llegada<\/th>/g)||[]).length,1);
  assert.equal((html.match(/<th scope="col">EXW → Llegada<\/th>/g)||[]).length,1);
  assert.doesNotMatch(html,/dl-departure-body|dl-transit-body/);
  assert.match(html,/dl-containers-months-first/);
  assert.match(html,/dl-containers-months-second/);
  assert.match(html,/dl-cut-select/);
  assert.match(html,/<th>Estatus anterior<\/th><th>Estatus nuevo<\/th>/);
  assert.match(html,/id="dl-sin-toggle"/);
  assert.match(html,/<div id="dl-sin-panel" hidden>/);
  assert.match(html,/dl-chart-entregados/);
});

test('promedios por ruta muestran conteos distintos; total usa backend y no suma medias',()=>{
  const r=setup();
  r.api.state.analytics=apiPayload(2026);
  r.api.renderRouteTable(r.api.state.analytics.tablas.promedios_por_ruta);
  const html=$(r,'dl-route-body').innerHTML;
  assert.match(html,/Shanghai/);
  assert.match(html,/Manzanillo/);
  assert.match(html,/Marítimo/);
  assert.match(html,/13[.,]5 días/);
  assert.match(html,/21[.,]0 días/);
  assert.match(html,/41[.,]0 días/);
  assert.doesNotMatch(html,/34[.,]5 días/);
  assert.match(html,/n=3/);
  assert.match(html,/n=2/);
  assert.match(html,/n=1/);
  assert.match($(r,'dl-route-count').textContent,/2026/);
});

test('tramos sin muestra aparecen como raya, pero media válida de cero días se conserva',()=>{
  const r=setup();
  r.api.state.analytics=apiPayload(2026);
  r.api.renderRouteTable([{puerto_origen:'A',puerto_destino:'B',modo:'C',operaciones:1,operaciones_salida:1,promedio_dias_salida:0,operaciones_transito:0,promedio_dias_llegada:null,operaciones_completas:0,promedio_dias_total:null}]);
  const html=$(r,'dl-route-body').innerHTML;
  assert.match(html,/0[.,]0 días/);
  assert.match(html,/n=0/);
  assert.match(html,/>—<\/span>/);
  assert.equal(r.api.formatAverageDays(null),'—');
  assert.equal(r.api.formatAverageDays(undefined),'—');
  assert.match(r.api.formatAverageDays(0),/^0[.,]0 días$/);
});

test('rutas vacías y textos externos hostiles son escapados',()=>{
  const r=setup();
  r.api.state.analytics=apiPayload(2026);
  r.api.renderRouteTable([]);
  assert.match($(r,'dl-route-body').innerHTML,/colspan="7"/);
  r.api.renderRouteTable([{puerto_origen:'<img src=x onerror=alert(1)>',puerto_destino:'<script>x()</script>',modo:'<b>A</b>',operaciones:1,operaciones_salida:1,promedio_dias_salida:1,operaciones_transito:0,operaciones_completas:0}]);
  const html=$(r,'dl-route-body').innerHTML;
  assert.doesNotMatch(html,/<img|<script>|<b>A<\/b>/);
  assert.match(html,/&lt;img/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/&lt;b&gt;/);
});

test('ring y dos tablas mensuales usan contenedores_periodo, no legacy',()=>{
  const r=setup();
  r.api.state.analytics=apiPayload(2025);
  r.api.renderAnalytics();
  assert.equal($(r,'dl-containers-total').textContent,'3');
  assert.equal($(r,'dl-containers-20').textContent,'1');
  assert.equal($(r,'dl-containers-40').textContent,'2');
  assert.equal($(r,'dl-containers-year').textContent,'ETD 2025');
  assert.equal($(r,'dl-containers-months-period').textContent,'ETD 2025');
  assert.match($(r,'dl-containers-months-first').innerHTML,/Enero/);
  assert.match($(r,'dl-containers-months-second').innerHTML,/Diciembre/);
  assert.equal(($(r,'dl-containers-months-first').innerHTML.match(/<tr>/g)||[]).length,6);
  assert.equal(($(r,'dl-containers-months-second').innerHTML.match(/<tr>/g)||[]).length,6);
  assert.match($(r,'dl-route-count').textContent,/2025/);
});

test('Todos los años conserva la etiqueta y totales consolidados, sin falso 2026',()=>{
  const r=setup();
  r.api.state.analytics=apiPayload('all');
  r.api.renderAnalytics();
  assert.equal($(r,'dl-containers-year').textContent,'Todos los años (ETD)');
  assert.equal($(r,'dl-containers-months-period').textContent,'Todos los años (ETD)');
  assert.match($(r,'dl-containers-ring').getAttribute('aria-label'),/Todos los años/);
  assert.equal($(r,'dl-containers-total').textContent,'16');
  assert.match($(r,'dl-route-count').textContent,/Todos los años/);
});

test('selector cambia ambos apartados de forma conjunta para año y all',async()=>{
  const r=setup(async url=>{
    const raw=new URL(url);
    const period=raw.searchParams.get('anio_promedios')||'2026';
    return {ok:true,data:apiPayload(period==='all'?'all':Number(period))};
  });
  r.api.state.analytics=apiPayload(2026);
  r.api.renderAnalytics();
  $(r,'dl-average-year-select').value='2025';
  await r.api.applyAveragePeriod();
  assert.equal(r.api.state.analytics.promedios.periodo,2025);
  assert.equal($(r,'dl-containers-year').textContent,'ETD 2025');
  assert.match($(r,'dl-route-body').innerHTML,/Ningbo/);
  assert(r.requests.at(-1).url.endsWith('anio_promedios=2025'));
  $(r,'dl-average-year-select').value='all';
  await r.api.applyAveragePeriod();
  assert.equal(r.api.state.analytics.promedios.periodo,'all');
  assert.equal($(r,'dl-containers-year').textContent,'Todos los años (ETD)');
  assert.match($(r,'dl-route-body').innerHTML,/Shanghai/);
  assert(r.requests.at(-1).url.endsWith('anio_promedios=all'));
  assert.equal($(r,'dl-average-year-select').disabled,false);
});

test('backend previo a Fase 2 se rechaza; no se muestran falsos promedios',async()=>{
  const oldBackend={ok:true,data:{anio_actual:2026,promedios:{periodo:2026},tablas:{salida_por_puerto:[],llegada_por_modo_puerto:[]},contenedores:{anio:2026,total:2}}};
  const r=setup(async()=>oldBackend);
  await assert.rejects(r.api.fetchAnalytics(2026),/se requiere Backend Fase 2/);
  assert.equal(r.api.state.analytics,null);
});

test('contrato inconsistente entre promedio y contenedores falla cerrado',async()=>{
  const r=setup(async()=>({ok:true,data:{...apiPayload(2025),contenedores_periodo:apiPayload(2026).contenedores_periodo}}));
  await assert.rejects(r.api.fetchAnalytics(2025),/se requiere Backend Fase 2/);
});

test('refresco conserva el período elegido en vez de reiniciarlo a año actual',()=>{
  assert.match(js,/fetchAnalytics\(state\.analytics&&state\.analytics\.promedios\?state\.analytics\.promedios\.periodo:undefined\)/);
});

test('solo cache-bust JS nuevo; no cambia CSS ni dependencias de PVO',()=>{
  assert.match(loader,/dashboard-logistica\.js\?v=20261021-dashboard-fase5-v001/);
  assert.match(loader,/dashboard-logistica\.css\?v=20260923-dashboard-ppns-final-v001/);
  assert.match(loader,/logistica-produccion\.js\?v=/);
});
