'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=p=>fs.readFileSync(path.join(root,p),'utf8');
const base='backend/src/modules/logistica-dashboard/';
function cjs(code,deps){
  const module={exports:{}};
  const requireMock=name=>{assert.ok(Object.prototype.hasOwnProperty.call(deps,name),name);return deps[name];};
  new Function('require','module','exports',code)(requireMock,module,module.exports);
  return module.exports;
}
test('Repositorio solo lee fletes activos CORELLIAN con costo y vigencia',async()=>{
  const calls=[];
  const db={query:async(sql,params)=>{calls.push({sql,params});return [[{id_concepto:1,concepto:'Terrestre',costo_unitario:'2000.00'}]];}};
  const repository=cjs(src(base+'logistica-dashboard.repository.js'),{'../../config/db':db});
  assert.equal((await repository.catalogFletes_cor()).length,1);
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].params,['CORELLIAN','Logística','Fletes','ACTIVO']);
  assert.match(calls[0].sql,/FROM catalogo_conceptos/);
  assert.match(calls[0].sql,/fecha_vigencia/);
  assert.match(calls[0].sql,/fecha_vencimiento/);
  assert.match(calls[0].sql,/costo_unitario IS NOT NULL/);
  assert.doesNotMatch(calls[0].sql,/\b(?:UPDATE|INSERT|DELETE|DROP|ALTER)\b/i);
});
test('Servicio de fletes no expone precio_sugerido',async()=>{
  const service=cjs(src(base+'logistica-dashboard.service.js'),{
    './logistica-dashboard.repository':{catalogFletes_cor:async()=>[{concepto:'Ejemplo',costo_unitario:'100.00',precio_sugerido:'300.00'}]},
    '../../utils/temporal':{mexicoCityYear:()=>2026}
  });
  const rows=await service.catalogFletes_cor();
  assert.equal(rows[0].costo_unitario,'100.00');
  assert.equal('precio_sugerido' in rows[0],false);
});
test('Mismo guard de acceso CORELLIAN del Dashboard',()=>{
  const routes=src(base+'logistica-dashboard.routes.js');
  assert.match(routes,/router\.get\(\s*'\/fletes',\s*\.\.\.analyticsGuard_cor,\s*requireCompleteInformationDomain_gnral\('CORELLIAN'\)/);
  assert.match(routes,/LOGISTICA_DASHBOARD_PIPELINE_POR_ESTATUS_ETAPAS\.VER/);
  assert.match(routes,/groupingCodesAny:\s*\['LOGISTICA'\]/);
  assert.match(src(base+'logistica-dashboard.controller.js'),/catalogFletes_cor/);
});
test('Ticker tiene endpoint autenticado, consulta, filtros y movimiento accesible',()=>{
  const client=src('modules/dashboard-logistica/dashboard-logistica-catalogo-fletes.js');
  const css=src('modules/dashboard-logistica/dashboard-logistica-catalogo-fletes.css');
  const loader=src('core/module-loader.js');
  assert.match(client,/api\/logistica\/dashboard\/fletes/);
  assert.match(client,/ManttoAuth\.authHeaders\(\)/);
  assert.match(client,/cache:'no-store'/);
  assert.match(client,/aria-controls="dl-costs-panel"/);
  assert.match(client,/aria-hidden="true"/);
  assert.match(client,/oninput=renderTable/);
  assert.match(client,/const esc=value/);
  assert.doesNotMatch(client,/\b(?:POST|PUT|PATCH|DELETE)\b/);
  assert.match(css,/@keyframes dl-costs-scroll/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(loader,/dashboard-logistica-catalogo-fletes\.js\?v=20261105-ticker-v001/);
  assert.match(loader,/dashboard-logistica-catalogo-fletes\.css\?v=20261105-ticker-v001/);
});
