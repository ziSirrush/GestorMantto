'use strict';

// [ChatGPT | 2026-10-15 | BLT NOW | FASE4 HTTP QA V001]
// Opt-in external staging smoke. Read-only by default. NO background jobs.
// Does not print JWT/device token, personal data or response bodies.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const flags = new Set(process.argv.slice(2));
const canary = flags.has('--write-canary');
const disabledExpected = flags.has('--expect-disabled');
const base = String(process.env.BLT_CX_VISITAS_API_BASE || '').trim().replace(/\/+$/, '');
const token = String(process.env.BLT_CX_VISITAS_TEST_TOKEN || '').trim();
const deniedToken = String(process.env.BLT_CX_VISITAS_DENIED_TOKEN || '').trim();
const deviceToken = String(process.env.BLT_CX_VISITAS_DEVICE_TOKEN || '').trim();
const frontend = String(process.env.BLT_CX_VISITAS_FRONTEND_URL || '').trim();
const results=[];
function fail(message) {throw new Error(message);}
function validateBase(value,label) {
  let url;
  try {url=new URL(value);} catch(_) {fail(`${label}: URL invalida.`);}
  if(url.username||url.password||url.search||url.hash) fail(`${label}: URL con credenciales, query o hash no permitida.`);
  const local = url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.protocol!=='https:'&&!local) fail(`${label}: solo HTTPS o http://localhost.`);
  return url;
}
async function request(url, {method='GET',jwt='',body=null,expected=null}={}) {
  const headers={Accept:'application/json'};
  if(jwt)headers.Authorization=`Bearer ${jwt}`;
  if(deviceToken)headers['X-Device-Token']=deviceToken;
  if(body!=null)headers['Content-Type']='application/json';
  const response=await fetch(url,{method,headers,body:body==null?undefined:JSON.stringify(body),
    redirect:'error',signal:AbortSignal.timeout(12000),cache:'no-store'});
  const data=await response.json().catch(()=>null);
  if(expected && !expected.includes(response.status)) {
    fail(`HTTP inesperado para ${method} ${new URL(url).pathname}: ${response.status}, esperado ${expected.join('/')}.`);
  }
  return {status:response.status,data};
}
async function qa(name,fn) {
  await fn();results.push(name);console.log(`[PASS] ${name}`);
}
function apiUrl(path) {return base+path;}
async function staticChecks(url) {
  const root=new URL(url.href.endsWith('/')?url.href:url.href+'/');
  async function asset(rel) {
    const target=new URL(rel,root);
    if(target.origin!==root.origin)fail('Los assets deben usar el mismo origen.');
    const res=await fetch(target,{redirect:'error',signal:AbortSignal.timeout(12000),cache:'no-store'});
    if(!res.ok)fail(`No se publico asset ${rel}: HTTP ${res.status}`);
    return res.text();
  }
  await qa('Frontend BLT NOW / index publicado',async()=>{
    const html=await asset('index.html');
    assert.match(html,/<title>BLT NOW<\/title>/);
    assert.match(html,/data-route="cx-visitas"/);
    assert.match(html,/core\/app\.js\?v=20261015-cx-visitas-fase4-v001/);
  });
  await qa('JS/CSS Visitas publicados',async()=>{
    const [js,css]=await Promise.all([
      asset('modules/customer-experience-visitas/customer-experience-visitas.js'),
      asset('modules/customer-experience-visitas/customer-experience-visitas.css')
    ]);
    assert.match(js,/cxv-history-lookup-form/);
    assert.match(js,/void showHistory\(id\)/);
    assert.match(css,/\.cxv-page/);
  });
  await qa('Marca PWA publicada segun host',async()=>{
    const github=/(^|\.)github\.io$/i.test(root.hostname);
    const manifest=JSON.parse(await asset(github?'manifest-github.json':'manifest.json'));
    assert.equal(manifest.name,github?'BLT NOW GH':'BLT NOW');
  });
}
async function run() {
  validateBase(base,'BLT_CX_VISITAS_API_BASE');
  if(frontend)validateBase(frontend,'BLT_CX_VISITAS_FRONTEND_URL');
  if(disabledExpected&&canary)fail('No se pueden mezclar --expect-disabled y --write-canary.');
  if(!disabledExpected&&!token)fail('Falta BLT_CX_VISITAS_TEST_TOKEN en el entorno.');
  if(canary&&!(process.env.BLT_CX_VISITAS_DEPLOY_ENV==='STAGING'
        &&process.env.BLT_CX_VISITAS_CANARY_WRITE_CONFIRM==='CONFIRMO_STAGING_Y_BAJA_LOGICA')) {
    fail('CANARY BLOQUEADO: requiere DEPLOY_ENV=STAGING y confirmacion explicita.');
  }
  const list=apiUrl('/api/customer-experience/visitas?page=1&page_size=1');
  if(disabledExpected){
    await qa('Feature flag apagado: acceso devuelve 503',async()=>{
      const r=await request(list,{expected:[503]});
      assert.equal(r.data?.code,'CX_VISITAS_API_NOT_ENABLED');
    });
    return;
  }
  await qa('Acceso anonimo bloqueado',async()=>{
    await request(list,{expected:[401,403]});
  });
  await qa('Lectura Aiven autenticada (sin imprimir PII)',async()=>{
    const r=await request(list,{jwt:token,expected:[200]});
    assert.equal(r.data?.ok,true);
    assert.equal(r.data?.source,'aiven');
    assert.equal(r.data?.page,1);
    assert.equal(r.data?.page_size,1);
    assert.ok(Number.isSafeInteger(Number(r.data?.total)));
    assert.ok(Array.isArray(r.data?.visitas));
    const item=r.data.visitas[0];
    if(item){
      const id=Number(item.id_visita);
      assert.ok(Number.isSafeInteger(id)&&id>0);
      const detail=await request(apiUrl(`/api/customer-experience/visitas/${id}`),{jwt:token,expected:[200]});
      assert.equal(Number(detail.data?.visita?.id_visita),id);
      const history=await request(apiUrl(`/api/customer-experience/visitas/${id}/historial?page=1&page_size=1`),{jwt:token,expected:[200]});
      assert.ok(Array.isArray(history.data?.eventos));
    }
  });
  await qa('Validacion HTTP 400 para paginacion invalida',async()=>{
    const r=await request(apiUrl('/api/customer-experience/visitas?page=abc'),{jwt:token,expected:[400]});
    assert.equal(r.data?.code,'CX_VISITAS_ID_INVALIDO');
  });
  if(deniedToken)await qa('Usuario sin permiso: acceso denegado',async()=>{
    await request(list,{jwt:deniedToken,expected:[403]});
  });
  if(frontend)await staticChecks(validateBase(frontend,'Frontend'));
  if(canary)await writeCanary();
}
async function writeCanary(){
  let created=null,disabled=false;
  const uid=crypto.randomUUID().slice(0,8);
  const visits=apiUrl('/api/customer-experience/visitas');
  const title=`QA CX VISITAS F4 ${uid}`;
  console.log('[CANARY] Escribe una visita de prueba con baja logica; quedara historial persistente.');
  try {
    await qa('CANARY crear visita (201)',async()=>{
      const r=await request(visits,{method:'POST',jwt:token,body:{titulo:title,observaciones:'Prueba funcional STAGING'},expected:[201]});
      created=Number(r.data?.visita?.id_visita);
      assert.ok(Number.isSafeInteger(created)&&created>0);
    });
    await qa('CANARY editar visita (200)',async()=>{
      const r=await request(`${visits}/${created}`,{method:'PATCH',jwt:token,body:{titulo:title+' QA'},expected:[200]});
      assert.equal(r.data?.visita?.titulo,title+' QA');
    });
    await qa('CANARY historial de CREAR y EDITAR',async()=>{
      const r=await request(`${visits}/${created}/historial?page=1&page_size=25`,{jwt:token,expected:[200]});
      const events=(r.data?.eventos||[]).map(item=>String(item.accion));
      assert.ok(events.includes('CREAR')&&events.includes('EDITAR'));
    });
    await qa('CANARY desactivar sin borrar fisicamente (200)',async()=>{
      const r=await request(`${visits}/${created}`,{method:'DELETE',jwt:token,expected:[200]});
      assert.equal(r.data?.inactivo,1);disabled=true;
    });
    await qa('CANARY despues de baja: 404 en detalle, historial disponible',async()=>{
      await request(`${visits}/${created}`,{jwt:token,expected:[404]});
      const r=await request(`${visits}/${created}/historial`,{jwt:token,expected:[200]});
      assert.ok((r.data?.eventos||[]).some(item=>item.accion==='DESACTIVAR'));
    });
  } finally {
    if(created&&!disabled){
      try {
        const cleanup=await request(`${visits}/${created}`,{method:'DELETE',jwt:token});
        disabled=cleanup.status===200;
      }catch(_) { /* report status, no auto-repeat */ }
    }
    if(created)console.log(`[CANARY] registro de prueba ID=${created}; baja_logica_confirmada=${disabled}`);
    if(created&&!disabled)process.exitCode=1;
  }
}
run().then(()=>console.log(`[CX_VISITAS_FASE4_HTTP] ${results.length} verificaciones PASS`))
  .catch(error=>{console.error('[CX_VISITAS_FASE4_HTTP] BLOCKED:',error.message);process.exitCode=1;});
