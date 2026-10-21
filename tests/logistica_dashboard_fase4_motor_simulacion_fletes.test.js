'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const backend = 'backend/src/modules/logistica-dashboard';
const source = file => fs.readFileSync(path.join(root, backend, file), 'utf8');
const repoSource = source('logistica-dashboard.repository.js');
const serviceSource = source('logistica-dashboard.service.js');
const controllerSource = source('logistica-dashboard.controller.js');
const routesSource = source('logistica-dashboard.routes.js');

function loadCommonJs(text, deps) {
  const mod = { exports: {} };
  const req = name => {
    assert.ok(Object.hasOwn(deps, name), 'Dependencia inesperada: ' + name);
    return deps[name];
  };
  new Function('require', 'module', 'exports', text)(req, mod, mod.exports);
  return mod.exports;
}

const q = Object.freeze({
  puerto_origen: 'Shanghai',
  puerto_destino: 'Manzanillo',
  ict: 'Marítimo',
  fecha_exw: '2026-11-01',
  anio_promedios: '2025'
});

function sample(i, { exw='2025-01-01', departure='2025-01-11', arrival='2025-02-01', delivered='2025-02-06' }={}) {
  return { id_log_ops: i, fecha_exw:exw, fecha_salida_real:departure, fecha_llegada_real:arrival, fecha_entrega_real_obra:delivered };
}

function fakeRows(n=12) {
  const values = [];
  for (let i=0;i<n;i++) {
    const exw = new Date(Date.UTC(2025,0,1));
    const departure = new Date(Date.UTC(2025,0,11+i));
    const arrival = new Date(Date.UTC(2025,0,31+i*2));
    const delivered = new Date(Date.UTC(2025,1,5+i*3));
    const iso = d => d.toISOString().slice(0,10);
    values.push(sample(i,{ exw:iso(exw),departure:iso(departure),arrival:iso(arrival),delivered:iso(delivered) }));
  }
  return values;
}

function makeRepo(rows=[]) {
  const calls=[];
  const db={ async query(sql,params){calls.push({sql,params});return [rows];} };
  return {calls,repo:loadCommonJs(repoSource,{'../../config/db':db})};
}
function makeService(rows=[]) {
  const queries=[];
  const dataRepo = { async freightSimulationSamples_cor(args){queries.push(args);return rows;} };
  return {queries,service:loadCommonJs(serviceSource,{
    './logistica-dashboard.repository':dataRepo,
    '../../utils/temporal':{mexicoCityYear:()=>2026}
  })};
}

function ms(diff) { return Date.parse(diff+'T00:00:00.000Z') / 86400000; }

test('SQL solo SELECT de log_ops, sin escritura/DDL y parametros de identidad completa',async()=>{
  const {calls,repo}=makeRepo([]);
  assert.equal(typeof repo.freightSimulationSamples_cor,'function');
  await repo.freightSimulationSamples_cor({year:2025, puerto_origen:q.puerto_origen,puerto_destino:q.puerto_destino,ict:q.ict});
  assert.equal(calls.length,1);
  const {sql,params}=calls[0];
  assert.match(sql,/SELECT id_log_ops, fecha_exw, fecha_salida_real, fecha_llegada_real,/);
  assert.match(sql,/FROM log_ops/);
  assert.match(sql,/UPPER\(TRIM\(puerto_origen\)\) = UPPER\(TRIM\(\?\)\)/);
  assert.match(sql,/UPPER\(TRIM\(puerto_destino\)\) = UPPER\(TRIM\(\?\)\)/);
  assert.match(sql,/UPPER\(TRIM\(ict\)\) = UPPER\(TRIM\(\?\)\)/);
  assert.match(sql,/fecha_salida_real\), 4\) AS UNSIGNED\) = \?/);
  assert.match(sql,/LIMIT 2001/);
  assert.doesNotMatch(sql,/\b(?:INSERT INTO|UPDATE log_ops|DELETE FROM|DROP TABLE|ALTER TABLE|CREATE TABLE)\b/i);
  assert.deepEqual(params,['Shanghai','Manzanillo','Marítimo','^[0-9]{4}-[0-9]{2}-[0-9]{2}',2025]);
});

test('Historico all consulta muestras reales sin condicion anual',async()=>{
  const {calls,repo}=makeRepo([]);
  await repo.freightSimulationSamples_cor({year:null,puerto_origen:'A',puerto_destino:'B',ict:'C'});
  assert.equal(calls[0].params.length,4);
  assert.doesNotMatch(calls[0].sql,/fecha_salida_real\), 4\) AS UNSIGNED\) = \?/);
  assert.match(calls[0].sql,/BETWEEN 1900 AND 2200/);
});

test('Lugar entrega especificado filtra igual a esa obra sin LIKE ni fallback',async()=>{
  const {calls,repo}=makeRepo([]);
  await repo.freightSimulationSamples_cor({year:2026,puerto_origen:'A',puerto_destino:'B',ict:'C',lugar_entrega:'Obra XYZ'});
  assert.match(calls[0].sql,/UPPER\(TRIM\(lugar_entrega\)\) = UPPER\(TRIM\(\?\)\)/);
  assert.equal(calls[0].params.at(-1),'Obra XYZ');
  assert.doesNotMatch(calls[0].sql,/\bLIKE\b/);
});

test('EXW genera fechas cronologicas y todos los tramos con cohorte completa',async()=>{
  const {service,queries}=makeService(fakeRows(12));
  const result=await service.freightSimulation_cor(q);
  assert.equal(result.estado,'estimacion');
  assert.equal(result.periodo,2025);
  assert.equal(result.inicio.tipo,'EXW');
  assert.equal(result.muestra.operaciones_completas,12);
  assert.equal(result.muestra.registros_descartados,0);
  assert.equal(queries[0].year,2025);
  assert.equal(queries[0].puerto_origen,'Shanghai');
  assert.equal(result.escenarios.optimista.metodo,'Percentil 25');
  assert.equal(result.escenarios.promedio.metodo,'Media aritmetica');
  assert.equal(result.escenarios.conservador.metodo,'Percentil 75');
  for (const name of ['optimista','promedio','conservador']) {
    const item=result.escenarios[name];
    assert.equal(item.fechas.exw,'2026-11-01');
    assert.ok(ms(item.fechas.zarpe)>=ms(item.fechas.exw));
    assert.ok(ms(item.fechas.llegada_puerto)>=ms(item.fechas.zarpe));
    assert.ok(ms(item.fechas.llegada_obra)>=ms(item.fechas.llegada_puerto));
    assert.ok(item.dias_etapas.total>=item.dias_etapas.exw_zarpe);
  }
  assert.ok(ms(result.escenarios.optimista.fechas.llegada_obra)<=ms(result.escenarios.promedio.fechas.llegada_obra));
  assert.ok(ms(result.escenarios.promedio.fechas.llegada_obra)<=ms(result.escenarios.conservador.fechas.llegada_obra));
});

test('Zarpe no requiere EXW historico y calcula puerto/obra relativos al zarpe',async()=>{
  const rows=fakeRows(12).map(x=>({...x,fecha_exw:null}));
  const {service}=makeService(rows);
  const result=await service.freightSimulation_cor({
    puerto_origen:'Shanghai',puerto_destino:'Manzanillo',ict:'MARÍTIMO',
    fecha_zarpe:'2026-01-31',anio_promedios:'all'
  });
  assert.equal(result.muestra.operaciones_completas,12);
  assert.equal(result.periodo,'all');
  assert.equal(result.inicio.tipo,'ZARPE');
  assert.equal(result.escenarios.promedio.fechas.zarpe,'2026-01-31');
  assert.equal(result.escenarios.promedio.fechas.exw,null);
  assert.equal(result.escenarios.promedio.dias_etapas.exw_zarpe,null);
  assert.ok(result.escenarios.promedio.dias_etapas.puerto_obra>=0);
});

test('Media sobre los mismos registros: etapas y total conservan una cohorte',async()=>{
  const rows=[
    sample(1,{exw:'2025-01-01',departure:'2025-01-11',arrival:'2025-01-21',delivered:'2025-01-26'}),
    sample(2,{exw:'2025-01-01',departure:'2025-01-21',arrival:'2025-01-31',delivered:'2025-02-10'})
  ];
  const out=await makeService(rows).service.freightSimulation_cor(q);
  const v=out.escenarios.promedio;
  assert.equal(v.dias_etapas.exw_zarpe,15);
  assert.equal(v.dias_etapas.zarpe_puerto,10);
  assert.equal(v.dias_etapas.puerto_obra,7.5);
  assert.equal(v.dias_etapas.total,32.5);
  assert.equal(v.fechas.zarpe,'2026-11-16');
  assert.equal(out.escenarios.optimista,null);
  assert.equal(out.escenarios.conservador,null);
});

test('Muestra pequeña solo media; no simula percentiles sobre muestras insuficientes',async()=>{
  const out=await makeService(fakeRows(9)).service.freightSimulation_cor(q);
  assert.equal(out.muestra.minimo_para_escenarios,10);
  assert.ok(out.escenarios.promedio);
  assert.equal(out.escenarios.optimista,null);
  assert.equal(out.escenarios.conservador,null);
  assert.match(out.advertencias.join(' '),/menor a 10/);
});

test('Muestras sin entregas reales devuelven sin_datos, no fechas ni ceros inventados',async()=>{
  const rows=[sample(1,{delivered:null}),sample(2,{arrival:null}),sample(3,{delivered:'2025-01-01'})];
  const out=await makeService(rows).service.freightSimulation_cor(q);
  assert.equal(out.estado,'sin_datos');
  assert.equal(out.muestra.registros_consultados,3);
  assert.equal(out.muestra.operaciones_completas,0);
  assert.equal(out.muestra.registros_descartados,3);
  assert.deepEqual(out.escenarios,{optimista:null,promedio:null,conservador:null});
});

test('Fecha EXW faltante excluye solo modalidad EXW, sin contaminar zarpe',async()=>{
  const rows=[sample(1,{exw:'fecha mala'}),sample(2,{exw:null})];
  const service=makeService(rows).service;
  const out1=await service.freightSimulation_cor(q);
  assert.equal(out1.muestra.operaciones_completas,0);
  const out2=await service.freightSimulation_cor({puerto_origen:'A',puerto_destino:'B',ict:'MARÍTIMO',fecha_zarpe:'2026-10-01'});
  assert.equal(out2.muestra.operaciones_completas,2);
});

test('Descarta fecha de llegada anterior a zarpe y obra anterior al puerto',async()=>{
  const rows=[
    sample(1,{departure:'2025-03-20',arrival:'2025-03-19',delivered:'2025-03-21'}),
    sample(2,{departure:'2025-03-05',arrival:'2025-03-20',delivered:'2025-03-19'}),
    sample(3,{departure:'2025-01-20',arrival:'2025-02-01',delivered:'2025-02-15'})
  ];
  const res=await makeService(rows).service.freightSimulation_cor({puerto_origen:'A',puerto_destino:'B',ict:'C',fecha_zarpe:'2026-10-01'});
  assert.equal(res.muestra.operaciones_completas,1);
  assert.equal(res.muestra.registros_descartados,2);
});

test('Rechaza fechas historicas imposibles sin reemplazarlas por hoy ni estimaciones',async()=>{
  const rows=[sample(1,{exw:'2025-02-30'}),sample(2,{delivered:'2025-02-29'}),sample(3,{arrival:'2025-13-01'})];
  const res=await makeService(rows).service.freightSimulation_cor(q);
  assert.equal(res.estado,'sin_datos');
});

test('Fecha inicial bisiesta y redondeo por calendario UTC no desfasan dia',async()=>{
  const rows=[sample(1,{exw:'2024-01-01',departure:'2024-01-02',arrival:'2024-01-03',delivered:'2024-01-04'})];
  const res=await makeService(rows).service.freightSimulation_cor({...q,fecha_exw:'2028-02-29'});
  assert.equal(res.escenarios.promedio.fechas.exw,'2028-02-29');
  assert.equal(res.escenarios.promedio.fechas.zarpe,'2028-03-01');
  assert.equal(res.escenarios.promedio.fechas.llegada_puerto,'2028-03-02');
  assert.equal(res.escenarios.promedio.fechas.llegada_obra,'2028-03-03');
});

test('Sin filtro el año actual proviene de CDMX, no del calendario del cliente',async()=>{
  const {service,queries}=makeService(fakeRows(10));
  const res=await service.freightSimulation_cor({...q,anio_promedios:undefined});
  assert.equal(res.periodo,2026);
  assert.equal(queries[0].year,2026);
});

test('Criterio anual es zarpe real, y lugar exacto permanece como filtro estricto',async()=>{
  const {service,queries}=makeService([]);
  const res=await service.freightSimulation_cor({...q,lugar_entrega:'Obra Zona Norte'});
  assert.equal(queries[0].lugar_entrega,'Obra Zona Norte');
  assert.equal(res.ruta.lugar_entrega,'Obra Zona Norte');
  assert.equal(res.criterio_anio,'fecha_salida_real');
  assert.equal(res.estado,'sin_datos');
  assert.doesNotMatch(res.advertencias.join(' '),/Sin lugar de entrega especifico/);
});

test('Sin lugar de entrega declara limites de alcance del ultimo tramo',async()=>{
  const res=await makeService(fakeRows(10)).service.freightSimulation_cor(q);
  assert.equal(res.ruta.lugar_entrega,null);
  assert.match(res.advertencias.join(' '),/combina destinos finales/);
  assert.match(res.advertencias.join(' '),/aduana|espera/);
});

test('Muestras superiores a 2000 fallan en 422; jamás se calcula con lista truncada',async()=>{
  const rows=Array(2001).fill(sample(1));
  await assert.rejects(makeService(rows).service.freightSimulation_cor(q),e=>e.status===422&&/2000/.test(e.message));
});

test('Entradas invalidas devuelven 400 antes de consultar la base de datos',async()=>{
  const {service,queries}=makeService([]);
  const cases=[
    {...q,puerto_origen:''}, {...q,puerto_destino:'\u0000'}, {...q,ict:42},
    {...q,fecha_zarpe:'2026-01-01'},
    {...q,fecha_exw:undefined,fecha_zarpe:undefined},
    {...q,fecha_exw:'2026-02-30'}, {...q,fecha_exw:'2025-02-29'},
    {...q,fecha_exw:'2026-01-01T23:00:00'}, {...q,fecha_exw:'01/01/2026'},
    {...q,anio_promedios:'2025 OR 1=1'}, {...q,anio_promedios:'1899'},
    {...q,lugar_entrega:'x'.repeat(151)},
    {...q,puerto_origen:'a'.repeat(151)}
  ];
  for (const value of cases) await assert.rejects(service.freightSimulation_cor(value),e=>e.status===400);
  assert.equal(queries.length,0);
});

test('Año all no se interpreta como ETD: se filtra zarpe real solo en caso anual',async()=>{
  const {service,queries}=makeService(fakeRows(10));
  await service.freightSimulation_cor({...q,anio_promedios:'all'});
  assert.equal(queries[0].year,null);
  assert.match(repoSource,/averageYearFilter_cor\(year\)/);
  assert.match(repoSource,/freightSimulationSamples_cor/);
  assert.match(serviceSource,/resolveAverageFilter_cor\(query.anio_promedios, currentYear\)/);
});

test('Controller entrega JSON agregado y propaga errores sin encubrir permisos',async()=>{
  const calls=[];
  const controller=loadCommonJs(controllerSource,{'./logistica-dashboard.service':{
    freightSimulation_cor:async query=>{calls.push(query);return {estado:'sin_datos'};}
  }});
  assert.equal(typeof controller.analytics_cor,'function');
  let res=null;
  await controller.freightSimulation_cor({query:q},{json:r=>{res=r;return r;}},e=>{throw e;});
  assert.deepEqual(calls,[q]);
  assert.equal(res.ok,true);
  assert.equal(res.source,'aiven');
  assert.equal(res.data.estado,'sin_datos');
  const rejected=loadCommonJs(controllerSource,{'./logistica-dashboard.service':{
    freightSimulation_cor:async()=>{const e=new Error('Error autorizado');e.status=403;throw e;}
  }});
  let error;
  await rejected.freightSimulation_cor({query:{}},{json:()=>{throw new Error('Nunca deberia responder 200');}},e=>{error=e;});
  assert.equal(error.status,403);
});

test('Nueva ruta conserva Guard General y alcance completo CORELLIAN',()=>{
  const records=[];
  const guardCalls=[];
  const route=loadCommonJs(routesSource,{
    express:{Router(){return {get(route,...handlers){records.push({route,handlers});}};}},
    './logistica-dashboard.controller':{analytics_cor(){},freightSimulation_cor(){}},
    '../../middleware/information-access-gnral.middleware':{
      humanInformationGuard_gnral(settings){guardCalls.push(settings);return [function sessionAndPermissions(){}];},
      requireCompleteInformationDomain_gnral(domain){assert.equal(domain,'CORELLIAN');return function completeScope(){};}
    }
  });
  assert.ok(route);
  assert.deepEqual(records.map(r=>r.route),['/simulacion','/']);
  assert.equal(records[0].handlers.length,3);
  assert.equal(records[1].handlers.length,3);
  assert.deepEqual(guardCalls,[{
    permissionCodesAny:['LOGISTICA_DASHBOARD_PIPELINE_POR_ESTATUS_ETAPAS.VER'],
    domain:'CORELLIAN',groupingCodesAny:['LOGISTICA']
  }]);
  assert.match(routesSource,/requireCompleteInformationDomain_gnral\('CORELLIAN'\)/);
});

test('La Fase 4 no cambia estructura de log_ops ni contratos existentes',()=>{
  assert.match(serviceSource,/async function analytics_cor\(/);
  assert.match(serviceSource,/promedios_por_ruta/);
  assert.match(serviceSource,/contenedores_periodo/);
  assert.match(repoSource,/async function averageByRoute_cor/);
  assert.match(repoSource,/async function periodContainers_cor/);
  assert.doesNotMatch(repoSource,/\b(?:INSERT INTO|UPDATE log_ops|DELETE FROM|ALTER TABLE|CREATE TABLE|DROP TABLE)\b/i);
});
