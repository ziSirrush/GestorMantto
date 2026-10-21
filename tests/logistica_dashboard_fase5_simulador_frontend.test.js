'use strict';

// FASE 5: UI probada contra respuestas de FASE 4 simuladas; sin Aiven/Azure.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'modules/dashboard-logistica/dashboard-logistica.js'),'utf8');
const css=fs.readFileSync(path.join(root,'modules/dashboard-logistica/dashboard-logistica-simulador.css'),'utf8');
const loader=fs.readFileSync(path.join(root,'core/module-loader.js'),'utf8');

function node(value=''){
  const props={},classes=new Set(),attributes={};
  return {
    innerHTML:'',textContent:'',value,disabled:false,hidden:false,checked:false,
    style:{props,setProperty(k,v){props[k]=v;}},
    classList:{toggle(k,active){if(active)classes.add(k);else classes.delete(k);},add(k){classes.add(k);},contains(k){return classes.has(k);}},
    setAttribute(k,v){attributes[k]=v;},getAttribute(k){return attributes[k];},
    onclick:null,oninput:null,onchange:null,onsubmit:null,onreset:null
  };
}

function analytics(period=2026){
  return {
    anio_actual:2026,
    promedios:{periodo:period,anios_disponibles:[2024,2025,2026],criterio_anio:'fecha_salida_real'},
    tablas:{promedios_por_ruta:[
      {puerto_origen:'Shanghai',puerto_destino:'Manzanillo',modo:'Marítimo',operaciones:12,operaciones_salida:12,promedio_dias_salida:13,operaciones_transito:12,promedio_dias_llegada:21,operaciones_completas:12,promedio_dias_total:34},
      {puerto_origen:'Ningbo',puerto_destino:'Lázaro Cárdenas',modo:'FCL',operaciones:9,operaciones_salida:9,promedio_dias_salida:11,operaciones_transito:9,promedio_dias_llegada:20,operaciones_completas:9,promedio_dias_total:31}
    ]},
    contenedores_periodo:{periodo:period,etiqueta:period==='all'?'Todos los años (ETD)':'ETD '+period,contenedores_20_dc:3,contenedores_40_hq:5,operaciones_con_dato:5,meses:[{mes:1,contenedores_20_dc:1,contenedores_40_hq:2}]}
  };
}

function simulation(period=2026,{kind='ZARPE',complete=14,place=null}={}){
  const date=kind==='EXW'?'2026-11-12':'2026-11-01';
  const scenario=(p,delta)=>({
    metodo:p==='promedio'?'Media aritmetica':(p==='optimista'?'Percentil 25':'Percentil 75'),
    fechas:{exw:kind==='EXW'?'2026-11-01':null,zarpe:date,llegada_puerto:'2026-12-02',llegada_obra:'2026-12-10'},
    dias_etapas:{exw_zarpe:kind==='EXW'?11:null,zarpe_puerto:20+delta,puerto_obra:8+delta,total:28+delta}
  });
  const enough=complete>=10;
  return {
    estado:complete?'estimacion':'sin_datos',periodo:period,criterio_anio:'fecha_salida_real',
    ruta:{puerto_origen:'Shanghai',puerto_destino:'Manzanillo',ict:'Marítimo',lugar_entrega:place},
    inicio:{tipo:kind,fecha:kind==='EXW'?'2026-11-01':'2026-11-01'},
    muestra:{registros_consultados:complete+2,operaciones_completas:complete,registros_descartados:2,minimo_para_escenarios:10},
    escenarios:{optimista:enough?scenario('optimista',-3):null,promedio:complete?scenario('promedio',0):null,conservador:enough?scenario('conservador',4):null},
    advertencias:['La entrega en obra incluye esperas de aduana y almacén.']
  };
}

function harness(fetchHandler){
  const hook='window.ManttoDashboardLogistica={init,reload:load};';
  assert.equal(js.split(hook).length,2);
  const injected=js.replace(hook,`window.__F5__={HTML,state,freightDateDisplay,freightDayDisplay,freightStartKind,renderFreightStartLabel,freightFields,freightValidInput,freightPeriod,renderFreightPeriod,renderFreightSuggestions,freightScenarioCard,renderFreightResult,freightPayload,fetchFreightSimulation,invalidateFreightResult,runFreightSimulation,bindFreightSimulator,applyAveragePeriod,renderAnalytics,load,init};\n ${hook}`);
  const nodes=new Map();
  for(const id of [
    'dl-freight-form','dl-freight-results','dl-freight-origin','dl-freight-destination','dl-freight-mode','dl-freight-place',
    'dl-freight-date','dl-freight-start-exw','dl-freight-start-zarpe','dl-freight-date-label',
    'dl-freight-feedback','dl-freight-submit','dl-freight-clear','dl-freight-summary','dl-freight-scenarios',
    'dl-freight-warnings','dl-freight-period','dl-freight-origin-options','dl-freight-destination-options',
    'dl-freight-mode-options','dl-route-body','dl-route-count','dl-average-year-select','dl-average-year-apply',
    'dl-average-year-status','dl-containers-ring','dl-containers-year','dl-containers-total','dl-containers-20',
    'dl-containers-40','dl-containers-20-pct','dl-containers-40-pct','dl-containers-note',
    'dl-containers-months-period','dl-containers-months-first','dl-containers-months-second',
    'dl-status','dl-sin-body','dl-sin-count','dl-mov-body','dl-mov-subtitle','dl-mov-count',
    'dl-cut-ingresos','dl-cut-cambios','dl-cut-registros','dl-cut-select'
  ])nodes.set(id,node());
  nodes.get('dl-freight-results').hidden=true;
  nodes.get('dl-freight-start-zarpe').checked=true;
  const requests=[];
  const window={MANTTO_API_BASE:'https://api.example.test',ManttoAuth:{authHeaders:()=>({'Authorization':'Bearer fixture'})}};
  const document={getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[]};
  const fetch=async (url,options)=>{
    requests.push({url,options});
    const response=fetchHandler?await fetchHandler(url,options,requests):{ok:true,data:simulation(2026)};
    if(response&&typeof response.text==='function')return response;
    return {ok:true,status:200,async text(){return JSON.stringify(response);}};
  };
  vm.runInNewContext(injected,{window,document,fetch,console,Date,URL,encodeURIComponent,Intl,setTimeout,clearTimeout},{timeout:2000});
  const api=window.__F5__;
  api.state.analytics=analytics(2026);
  const get=id=>nodes.get(id);
  const preset=()=>{
    get('dl-freight-origin').value='Shanghai';
    get('dl-freight-destination').value='Manzanillo';
    get('dl-freight-mode').value='Marítimo';
    get('dl-freight-date').value='2026-11-01';
  };
  api.bindFreightSimulator();
  return {api,nodes,get,requests,preset};
}

test('Fase 5 añade formulario y resultados sin eliminar F1/F3 ni select anual',()=>{
  const r=harness();
  const html=r.api.HTML;
  for(const id of ['dl-freight-form','dl-freight-start-zarpe','dl-freight-start-exw','dl-freight-date','dl-freight-origin','dl-freight-destination','dl-freight-mode','dl-freight-place','dl-freight-results']){
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(html,/Simulador de Fletes/);
  assert.match(html,/type="date" required/);
  assert.match(html,/Promedios logísticos por ruta/);
  assert.match(html,/<th>Estatus anterior<\/th><th>Estatus nuevo<\/th>/);
  assert.match(html,/dl-sin-panel/);
  assert.match(html,/dl-containers-months-second/);
  assert.match(html,/dl-average-filter-form/);
});

test('loader carga CSS modular y version F5 sin modificar la hoja original',()=>{
  assert.match(loader,/dashboard-logistica\.css\?v=20260923-dashboard-ppns-final-v001/);
  assert.match(loader,/dashboard-logistica-simulador\.css\?v=20261021-dashboard-fase5-v001/);
  assert.match(loader,/dashboard-logistica\.js\?v=20261021-dashboard-fase5-v001/);
  assert.match(css,/\.dl-freight-scenarios/);
  assert.match(css,/@media\(max-width:520px\)/);
  assert.doesNotMatch(css,/position:fixed/);
  assert.match(css,/\[hidden\]\{display:none!important\}/);
  assert.match(loader,/logistica-produccion\.js\?v=/);
});

test('sugerencias de ruta provienen de promedios agregados por año; se escapan',()=>{
  const r=harness();
  r.api.state.analytics.tablas.promedios_por_ruta.push({puerto_origen:'<svg onload=alert(1)>',puerto_destino:'Otro',modo:'Otro'});
  r.api.renderFreightSuggestions();
  assert.match(r.get('dl-freight-origin-options').innerHTML,/Shanghai/);
  assert.match(r.get('dl-freight-origin-options').innerHTML,/Ningbo/);
  assert.match(r.get('dl-freight-origin-options').innerHTML,/&lt;svg/);
  assert.doesNotMatch(r.get('dl-freight-origin-options').innerHTML,/<svg/);
  r.get('dl-freight-origin').value='Ningbo';
  r.api.renderFreightSuggestions();
  assert.match(r.get('dl-freight-destination-options').innerHTML,/Lázaro Cárdenas/);
  assert.doesNotMatch(r.get('dl-freight-destination-options').innerHTML,/Manzanillo/);
  assert.match(r.get('dl-freight-period').textContent,/2026/);
});

test('zarpe manda criterios URL encoded, auth y muestra tres escenarios en DD/MM/AAAA',async()=>{
  const r=harness(async(url)=>{
    const u=new URL(url);
    assert.equal(u.pathname,'/api/logistica/dashboard/simulacion');
    assert.equal(u.searchParams.get('anio_promedios'),'2026');
    return {ok:true,data:simulation(2026)};
  });
  r.preset();
  await r.api.runFreightSimulation();
  assert.equal(r.requests.length,1);
  assert.match(r.requests[0].url,/ict=Mar%C3%ADtimo/);
  assert.match(r.requests[0].url,/fecha_zarpe=2026-11-01/);
  assert.doesNotMatch(r.requests[0].url,/fecha_exw=/);
  assert.equal(r.requests[0].options.headers.Authorization,'Bearer fixture');
  assert.equal(r.requests[0].options.cache,'no-store');
  assert.equal(r.get('dl-freight-results').hidden,false);
  assert.match(r.get('dl-freight-scenarios').innerHTML,/Optimista/);
  assert.match(r.get('dl-freight-scenarios').innerHTML,/Promedio/);
  assert.match(r.get('dl-freight-scenarios').innerHTML,/Conservador/);
  assert.match(r.get('dl-freight-scenarios').innerHTML,/10\/12\/2026/);
  assert.match(r.get('dl-freight-scenarios').innerHTML,/Paso 3/);
  assert.doesNotMatch(r.get('dl-freight-scenarios').innerHTML,/Paso 4/);
  assert.match(r.get('dl-freight-summary').innerHTML,/14 operaciones completas/);
  assert.match(r.get('dl-freight-warnings').innerHTML,/aduana/);
  assert.match(r.get('dl-freight-feedback').textContent,/14 operaciones completas/);
});

test('EXW envia un solo tipo de fecha y cronologia con cuatro pasos',async()=>{
  const r=harness(async()=>({ok:true,data:simulation(2026,{kind:'EXW'})}));
  r.preset();
  r.get('dl-freight-start-exw').checked=true;
  r.get('dl-freight-start-zarpe').checked=false;
  r.api.renderFreightStartLabel();
  await r.api.runFreightSimulation();
  assert.match(r.get('dl-freight-date-label').textContent,/EXW/);
  assert.match(r.requests[0].url,/fecha_exw=2026-11-01/);
  assert.doesNotMatch(r.requests[0].url,/fecha_zarpe=/);
  assert.match(r.get('dl-freight-scenarios').innerHTML,/Paso 4/);
  assert.match(r.get('dl-freight-scenarios').innerHTML,/EXW → Zarpe/);
});

test('falta dato, fecha inexistente o campo inválido: no consulta al backend',async()=>{
  const r=harness();
  await r.api.runFreightSimulation();
  assert.equal(r.requests.length,0);
  assert.match(r.get('dl-freight-feedback').textContent,/puerto de origen/);
  r.preset();
  r.get('dl-freight-date').value='2026-02-30';
  await r.api.runFreightSimulation();
  assert.equal(r.requests.length,0);
  assert.match(r.get('dl-freight-feedback').textContent,/no existe/);
  r.get('dl-freight-date').value='2026-11-01';
  r.get('dl-freight-origin').value='x'.repeat(151);
  await r.api.runFreightSimulation();
  assert.equal(r.requests.length,0);
  assert.match(r.get('dl-freight-feedback').textContent,/no válido/);
});

test('menos de 10 operaciones ofrece solo promedio; no inventa P25/P75',async()=>{
  const r=harness(async()=>({ok:true,data:simulation(2026,{complete:4})}));
  r.preset();
  await r.api.runFreightSimulation();
  const html=r.get('dl-freight-scenarios').innerHTML;
  assert.match(html,/Optimista/);
  assert.match(html,/Conservador/);
  assert.equal((html.match(/Requiere al menos 10 operaciones completas/g)||[]).length,2);
  assert.match(html,/Promedio/);
  assert.doesNotMatch(html,/NaN|undefined/);
});

test('sin muestra no genera fechas ni falsa duracion',async()=>{
  const r=harness(async()=>({ok:true,data:simulation(2026,{complete:0})}));
  r.preset();
  await r.api.runFreightSimulation();
  assert.match(r.get('dl-freight-scenarios').innerHTML,/No hay operaciones históricas completas/);
  assert.doesNotMatch(r.get('dl-freight-scenarios').innerHTML,/Obra estimada/);
  assert.equal(r.get('dl-freight-results').hidden,false);
  assert.match(r.get('dl-freight-feedback').textContent,/Sin datos/);
});

test('historico se aplica al simulador y recalcula automaticamente sin borrar entradas',async()=>{
  const r=harness(async url=>{
    const u=new URL(url),raw=u.searchParams.get('anio_promedios')||'2026';
    const period=raw==='all'?'all':Number(raw);
    return {ok:true,data:u.pathname.endsWith('/simulacion')?simulation(period):analytics(period)};
  });
  r.preset();
  r.get('dl-freight-place').value='Obra ABC';
  await r.api.runFreightSimulation();
  assert.match(r.get('dl-freight-summary').innerHTML,/2026/);
  r.get('dl-average-year-select').value='2025';
  await r.api.applyAveragePeriod();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(r.api.state.analytics.promedios.periodo,2025);
  assert.match(r.get('dl-freight-summary').innerHTML,/2025/);
  assert.equal(r.get('dl-freight-date').value,'2026-11-01');
  assert.equal(r.get('dl-freight-place').value,'Obra ABC');
  assert(r.requests.some(x=>x.url.includes('simulacion?')&&x.url.includes('anio_promedios=2025')));
  r.get('dl-average-year-select').value='all';
  await r.api.applyAveragePeriod();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(r.api.state.analytics.promedios.periodo,'all');
  assert.match(r.get('dl-freight-summary').innerHTML,/Todos los años/);
  assert.match(r.get('dl-freight-period').textContent,/Todos los años/);
});

test('respuesta simulacion de un año distinto falla cerrado, sin mostrar fechas equivocadas',async()=>{
  const r=harness(async()=>({ok:true,data:simulation(2025)}));
  r.preset();
  await r.api.runFreightSimulation();
  assert.equal(r.get('dl-freight-results').hidden,true);
  assert.match(r.get('dl-freight-feedback').textContent,/no coincide/);
});

test('Backend F4 ausente muestra error localizado; dashboard original sigue operando',async()=>{
  const r=harness(async()=>({ok:false,status:404,async text(){return '<html>Not Found</html>';}}));
  r.preset();
  await r.api.runFreightSimulation();
  assert.match(r.get('dl-freight-feedback').textContent,/Backend Fase 4/);
  assert.equal(r.get('dl-freight-results').hidden,true);
  assert.equal(r.get('dl-freight-submit').disabled,false);
});

test('HTML externo se escapa en simulacion, advertencias y lugar de entrega',async()=>{
  const r=harness(async()=>{
    const data=simulation(2026,{place:'<img src=x onerror=alert(1)>'});
    data.advertencias=['<script>alert(1)</script>'];
    return {ok:true,data};
  });
  r.preset();
  r.get('dl-freight-place').value='<img src=x onerror=alert(1)>';
  await r.api.runFreightSimulation();
  assert.doesNotMatch(r.get('dl-freight-summary').innerHTML,/<img/);
  assert.match(r.get('dl-freight-summary').innerHTML,/&lt;img/);
  assert.doesNotMatch(r.get('dl-freight-warnings').innerHTML,/<script>/);
  assert.match(r.get('dl-freight-warnings').innerHTML,/&lt;script&gt;/);
  assert.match(r.requests[0].url,/lugar_entrega=%3Cimg/);
});

test('edicion de formulario invalida respuesta asincrona anterior',async()=>{
  let finish;
  const r=harness(async()=>new Promise(resolve=>{finish=resolve;}));
  r.preset();
  const task=r.api.runFreightSimulation();
  await Promise.resolve();
  r.get('dl-freight-date').value='2026-12-11';
  r.get('dl-freight-date').oninput();
  finish({ok:true,data:simulation(2026)});
  await task;
  assert.equal(r.api.state.freightData,null);
  assert.equal(r.get('dl-freight-results').hidden,true);
  assert.match(r.get('dl-freight-feedback').textContent,/Datos modificados/);
});

test('una respuesta tardia de otro periodo no reemplaza simulacion del ano vigente',async()=>{
  let finishOld;
  const r=harness(async url=>{
    const u=new URL(url),p=u.searchParams.get('anio_promedios')||'2026';
    if(u.pathname.endsWith('/simulacion')&&p==='2026')return new Promise(resolve=>{finishOld=resolve;});
    if(u.pathname.endsWith('/simulacion'))return {ok:true,data:simulation(2025)};
    return {ok:true,data:analytics(2025)};
  });
  r.preset();
  const old=r.api.runFreightSimulation();
  await Promise.resolve();
  r.get('dl-average-year-select').value='2025';
  await r.api.applyAveragePeriod();
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(r.get('dl-freight-summary').innerHTML,/2025/);
  finishOld({ok:true,data:simulation(2026)});
  await old;
  assert.match(r.get('dl-freight-summary').innerHTML,/2025/);
  assert.equal(r.api.state.freightData.periodo,2025);
});

test('reset borra resultado y no dispara consultas externas',async()=>{
  const r=harness(async()=>({ok:true,data:simulation(2026)}));
  r.preset();
  await r.api.runFreightSimulation();
  assert.equal(r.requests.length,1);
  r.get('dl-freight-form').onreset();
  assert.equal(r.api.state.freightSubmitted,false);
  assert.equal(r.get('dl-freight-results').hidden,true);
  assert.equal(r.requests.length,1);
});

test('integracion offline: UI consume contrato calculado por el servicio REAL de F4',async()=>{
  const serviceText=fs.readFileSync(path.join(root,'backend/src/modules/logistica-dashboard/logistica-dashboard.service.js'),'utf8');
  const dbRows=[];
  for(let i=0;i<12;i++){
    const iso=days=>new Date(Date.UTC(2025,0,1+days)).toISOString().slice(0,10);
    dbRows.push({id_log_ops:i+1,fecha_exw:iso(0),fecha_salida_real:iso(10+i),fecha_llegada_real:iso(30+i),fecha_entrega_real_obra:iso(38+i)});
  }
  const mod={exports:{}};
  const requireMock=id=>{
    if(id==='./logistica-dashboard.repository')return {freightSimulationSamples_cor:async()=>dbRows};
    if(id==='../../utils/temporal')return {mexicoCityYear:()=>2026};
    throw new Error('Unexpected dependency: '+id);
  };
  new Function('require','module','exports',serviceText)(requireMock,mod,mod.exports);
  const out=await mod.exports.freightSimulation_cor({
    puerto_origen:'Shanghai',puerto_destino:'Manzanillo',ict:'Marítimo',
    fecha_zarpe:'2026-11-01',anio_promedios:'2025'
  });
  assert.equal(out.muestra.operaciones_completas,12);
  assert.equal(out.estado,'estimacion');
  const r=harness(async(url)=>{
    if(url.includes('simulacion?'))return {ok:true,data:out};
    return {ok:true,data:analytics(2025)};
  });
  r.preset();
  r.api.state.analytics=analytics(2025);
  await r.api.runFreightSimulation();
  assert.equal(r.get('dl-freight-results').hidden,false);
  assert.match(r.get('dl-freight-scenarios').innerHTML,/Optimista/);
  assert.match(r.get('dl-freight-scenarios').innerHTML,/Conservador/);
  assert.match(r.get('dl-freight-scenarios').innerHTML,/Obra estimada/);
  assert.match(r.get('dl-freight-summary').innerHTML,/2025/);
});
