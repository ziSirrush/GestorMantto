'use strict';
// [Aster | 2026-10-09 | ASTER-MG | FIX_3_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_AUTOGUARDADO_V001]
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const qa=require('../validation/instalaciones-administracion-fix3-autoguardado-readonly.js');
const ROOT=path.resolve(__dirname,'..');
function mockFetch_cor(){
  const calls=[],groups=[
    {key:'proyecto',fields:['proyecto','id_proyecto','referencia_sitio'],editable_fields:['proyecto','id_proyecto','referencia_sitio']},
    ...Array.from({length:10},(_,i)=>({key:'g'+i,fields:Array.from({length:9},(_,j)=>'campo'+i+'_'+j),
      editable_fields:Array.from({length:9},(_,j)=>'campo'+i+'_'+j)}))
  ]; // 3 + 90 = 93
  const contract={ok:true,access_permission:'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
    full_edit_permission:'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.EDITAR',
    system_readonly_fields:['id_ins_fl','created_at','updated_at'],groups};
  async function fetcher(url,opts){
    calls.push({url,opts});assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');
    const auth=opts.headers.Authorization||'';
    let status=200,data={ok:true};
    if(!auth){status=401;data={ok:false};}
    else if(auth==='Bearer denegado'){status=403;data={ok:false};}
    else if(url.endsWith('/contrato'))data={...contract,groups:contract.groups.map(g=>({
      ...g,permissions:{can_view:true,can_edit:auth==='Bearer owner'}
    }))};
    else if(url.endsWith('/registros/1'))data={ok:true,data:{id_ins_fl:1,proyecto:'Prueba',id_proyecto:'P100'}};
    else if(url.endsWith('/registros/99')){status=404;data={ok:false};}
    else throw Error('Endpoint inesperado '+url);
    return {status,json:async()=>data};
  }
  return {fetcher,calls};
}
test('FIX3: smoke remoto requiere --readonly y HTTPS',()=>{
  assert.throws(()=>qa.parseArgs_cor(['--base-url','https://qa.example/']),/--readonly/);
  assert.throws(()=>qa.parseArgs_cor(['--readonly','--base-url','http://qa.example/']),/HTTPS/);
  assert.throws(()=>qa.parseArgs_cor(['--readonly','--base-url','https://a:pw@qa.example/']),/URL|HTTPS/);
  assert.throws(()=>qa.parseArgs_cor(['--readonly','--base-url','https://qa.example/subpath']),/URL|HTTPS/);
  assert.throws(()=>qa.parseArgs_cor(['--readonly','--base-url','https://qa.example/','--record-id','0']),/positivo/);
  assert.equal(qa.parseArgs_cor(['--readonly','--base-url','https://qa.example/']).baseUrl,'https://qa.example');
});
test('FIX3: smoke GET de permisos, 93 campos, visor y alcance',async()=>{
  const {fetcher,calls}=mockFetch_cor();
  const result=await qa.smoke_cor({baseUrl:'https://qa.example',recordId:1,deniedRecordId:99},{
    fetch:fetcher,token:'owner',viewerToken:'lectura',deniedToken:'denegado'
  });
  assert.equal(result.skipped.length,0);
  assert.ok(result.checked.length>=9);
  assert.ok(calls.every(c=>c.opts.method==='GET'));
  assert.ok(calls.every(c=>!c.url.includes('Bearer')&&!c.url.includes('owner')));
});
test('FIX3: smoke bloquea fuga de columnas no autorizadas',()=>{
  const contract={groups:[{fields:['proyecto'],permissions:{can_view:true}}]};
  assert.throws(()=>qa.checkRecord_cor({id_ins_fl:5,proyecto:'A',secreto:'NO'},contract),/no autorizada/);
});
test('FIX3: SQL de verificacion es exclusivamente SELECT',()=>{
  const file=fs.readFileSync(path.join(ROOT,'database/QA_FIX_3_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_SOLO_LECTURA_V001.sql'),'utf8');
  const statements=file.replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean);
  assert.ok(statements.length>=3);
  for(const statement of statements)assert.match(statement,/^SELECT\b/i,'sentencia no SELECT');
  assert.doesNotMatch(file,/\b(CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE|REPLACE|GRANT|REVOKE|COMMIT|ROLLBACK)\s+(TABLE|INTO|FROM|\w+)/i);
});
