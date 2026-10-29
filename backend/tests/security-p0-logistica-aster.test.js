'use strict';
// [Aster | 2026-10-29 | ASTER-MG | QA P0 LOGISTICA ACCESO V001]
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('P0: rutas Logistica exigen guard CORELLIAN y scope total antes del controlador',()=>{
  const routes=[],guards=[],calls=[];
  const deps={
    express:{Router(){return {post(uri,...handlers){routes.push({method:'POST',uri,handlers});},get(uri,...handlers){routes.push({method:'GET',uri,handlers});}};}},
    '../controllers/logistica.controller':{syncLogOps(){calls.push('sync');},getLogOps(){calls.push('list');},getLogOpsById(){calls.push('detail');}},
    '../middleware/integration-auth.middleware':{requireIntegrationAuthFor(id){assert.equal(id,'INTEGRATION_LOGISTICA_ID');return function m2m(req,res,next){next();};}},
    '../middleware/information-access-gnral.middleware':{
      humanInformationGuard_gnral(cfg){guards.push(cfg);return [
        function session(req,res,next){if(!req.actor)return res.status(401).json({code:'SESSION_REQUIRED'});next();},
        function permissions(req,res,next){if(!req.permission||req.company!=='CORELLIAN')return res.status(403).json({code:'ACCESS_DENIED'});next();}
      ];},
      requireCompleteInformationDomain_gnral(domain){assert.equal(domain,'CORELLIAN');return function scope(req,res,next){if(!req.fullScope)return res.status(403).json({code:'INFORMATION_COMPLETE_DOMAIN_REQUIRED'});next();};}
    }
  };
  const file=path.resolve(__dirname,'../src/routes/logistica.routes.js');
  const source=fs.readFileSync(file,'utf8');
  vm.runInNewContext(source,{module:{exports:{}},require(name){assert.ok(Object.hasOwn(deps,name));return deps[name];}});
  assert.equal(guards.length,2);
  for(const cfg of guards){assert.equal(cfg.domain,'CORELLIAN');assert.equal(Array.from(cfg.groupingCodesAny).join(','),'LOGISTICA');assert.ok(cfg.permissionCodesAny.every(x=>x.startsWith('LOGISTICA_')));}
  assert.ok(guards[0].permissionCodesAny.includes('LOGISTICA_DASHBOARD_PIPELINE_POR_ESTATUS_ETAPAS.VER'));
  assert.ok(guards[0].permissionCodesAny.includes('LOGISTICA_REPORTE_DETALLE_POR_ESTATUS_TABLA.VER'));
  const invoke=(route,req)=>{const res={statusCode:200,body:null,status(x){this.statusCode=x;return this;},json(x){this.body=x;return this;}};let i=0;const next=()=>{const f=route.handlers[i++];if(f)f(req,res,next);};next();return res;};
  for(const route of routes.filter(r=>r.method==='GET')){
    const initial=calls.length;
    assert.equal(invoke(route,{actor:false,company:'CORELLIAN',permission:true,fullScope:true}).statusCode,401);
    assert.equal(invoke(route,{actor:true,company:'UNITED',permission:true,fullScope:true}).statusCode,403);
    assert.equal(invoke(route,{actor:true,company:'CORELLIAN',permission:false,fullScope:true}).statusCode,403);
    assert.equal(invoke(route,{actor:true,company:'CORELLIAN',permission:true,fullScope:false}).body.code,'INFORMATION_COMPLETE_DOMAIN_REQUIRED');
    assert.equal(calls.length,initial);
    assert.equal(invoke(route,{actor:true,company:'CORELLIAN',permission:true,fullScope:true}).statusCode,200);
    assert.equal(calls.length,initial+1);
  }
  const sync=routes.find(r=>r.method==='POST'&&r.uri==='/sync');
  assert.equal(sync.handlers.length,2);
  invoke(sync,{});
  assert.equal(calls.at(-1),'sync');
});
