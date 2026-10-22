'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const source=read('modules/almacen-carga/almacen-carga.js');
function fixture(result,fail){
 const requests=[],button={disabled:false,onclick:null};
 const view={innerHTML:'',dataset:{},querySelector:()=>button};
 const window={ManttoAuth:{async api(url,opts){requests.push({url,opts});if(fail)throw fail;return url.endsWith('capabilities')?{ok:true,source:result?.source||null}:{ok:true,sources:result?.sources||[]};}}};
 vm.runInNewContext(source,{window,document:{getElementById:()=>view},console,Promise,Number,String,Array,Object});
 return{window,view,requests,button};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('Limpieza V003: el arbol no contiene SQL, instaladores, credenciales ni artefactos obsoletos',()=>{
 const {auditTree}=require('../backend/scripts/validate-clean-tree');assert.deepEqual(auditTree(),[]);
 for(const rel of [
  'docs/BACKEND_ARQUITECTURA',
  'docs/Fixeos/PROJECT_CONSTITUTION_REFERENCIA.md',
  'docs/README.md',
  'backend/docs/README.md',
  'backend/scripts/QA_SIMULAR_ACTUALIZACION_TICKET_254540_V001.js',
  'backend/scripts/QA_TICKET_254013_SEGUIMIENTO_ESPECIAL_V002.js',
  'backend/scripts/validate-architecture.js',
  'backend/scripts/test-fase-2-portafolio-cuartos-uni.js',
  'backend/scripts/test-fase-3-tickets-cuartos-uni.js',
  'backend/scripts/test-fase-4-cobertura-total-uni.js'
 ])assert.equal(fs.existsSync(path.join(ROOT,rel)),false,rel+' no debe volver al arbol');
});
test('clean-tree usa Git como autoridad e ignora residuos locales ignorados',()=>{
 const {auditTree}=require('../backend/scripts/validate-clean-tree');const repo=fs.mkdtempSync(path.join(os.tmpdir(),'bltnow-clean-git-'));
 try{
  execFileSync('git',['init','--quiet'],{cwd:repo});
  fs.writeFileSync(path.join(repo,'.gitignore'),'*.sql\n');fs.writeFileSync(path.join(repo,'vigente.js'),'module.exports=true;\n');fs.writeFileSync(path.join(repo,'local.sql'),'SELECT 1;\n');
  execFileSync('git',['add','.gitignore','vigente.js'],{cwd:repo});assert.deepEqual(auditTree(repo),[]);
  execFileSync('git',['add','-f','local.sql'],{cwd:repo});assert.match(auditTree(repo).join('\n'),/local\.sql/);
 }finally{fs.rmSync(repo,{recursive:true,force:true});}
});
test('el monitor NetSuite solo lee capacidades y fuentes',async()=>{
 const f=fixture({source:{loteImportacion:'lote-1',archivoOrigen:'NetSuite',fechaCorte:'2026-10-21'},sources:[{loteImportacion:'lote-1',tipoFuente:'INVENTARIO_230',fechaCorte:'2026-10-21',activo:true}]});
 assert.equal(f.window.ManttoAlmacenCarga.init('otra-ruta'),false);assert.equal(f.requests.length,0);
 assert.equal(f.window.ManttoAlmacenCarga.init('almacen-carga'),true);await flush();
 assert.equal(f.requests.length,2);assert.ok(f.requests.every(q=>q.opts.method==='GET'));
 assert.match(f.view.innerHTML,/lote-1/);assert.match(f.view.innerHTML,/21\/10\/2026/);assert.doesNotMatch(f.view.innerHTML,/type="file"|Importar y activar/);
});
test('fuentes escapa los datos de backend y conserva el estado sin datos',async()=>{
 const f=fixture({sources:[{loteImportacion:'<script>alert(1)</script>'}]});f.window.ManttoAlmacenCarga.init('almacen-carga');await flush();
 assert.match(f.view.innerHTML,/&lt;script&gt;/);assert.doesNotMatch(f.view.innerHTML,/<script>/);assert.match(f.view.innerHTML,/No hay un lote/);
});
test('sin permiso no ofrece mutaciones ni representa datos reales',async()=>{
 const e=new Error('Denegado');e.status=403;const f=fixture(null,e);f.window.ManttoAlmacenCarga.init('almacen-carga');await flush();assert.match(f.view.innerHTML,/No tienes permiso/);assert.doesNotMatch(f.view.innerHTML,/type="file"/);
});
test('abrir dos veces mientras carga no duplica las peticiones',async()=>{
 const f=fixture();f.window.ManttoAlmacenCarga.init('almacen-carga');f.window.ManttoAlmacenCarga.init('almacen-carga');await flush();assert.equal(f.requests.length,2);
});
test('Almacen conserva NetSuite y auditoria, no las seis mutaciones Excel',()=>{
 const routes=read('backend/src/modules/almacen/almacen.routes.js');assert.match(routes,/nsSyncRoutes/);assert.match(routes,/almacen\.ns-access-guard/);assert.match(routes,/router\.post\('\/auditoria'/);
 for(const p of ['/carga/validar','/carga/archivar-activo','/carga/archivar','/carga/importar','/carga/fuentes/:lote/activar'])assert.ok(!routes.includes("router.post('"+p+"'"));
 assert.ok(!routes.includes("router.patch('/stock/reabasto'"));assert.ok(routes.includes("router.get('/stock/reabasto'"));
});
test('inventario y stock no emiten escrituras retiradas',()=>{
 const inv=read('modules/almacen/almacen.js'),stock=read('modules/almacen/almacen-stock-reabasto.js');
 assert.doesNotMatch(inv,/importaciones\/validar|bindImport|alm-import-file/);assert.doesNotMatch(stock,/method:'PATCH'|askReason|alm-reabasto-modal/);
 assert.match(inv,/\/api\/almacen\/auditoria/);
});
test('frontend publicado excluye backend, tests, docs y scripts operativos',()=>{
 const {buildFrontend}=require('../tools/build-frontend');const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bltnow-clean-web-'));const out=path.join(tmp,'web');
 const tracked=['index.html','core/build-info.generated.js','core/change-audit.generated.js'];const before=new Map(tracked.map(name=>[name,read(name)]));
 try{const result=buildFrontend(out);assert.ok(result.files>100);for(const name of ['backend','tests','docs','scripts','installer','sql'])assert.equal(fs.existsSync(path.join(out,name)),false);
 for(const name of ['index.html','service-worker.js','manifest.json','core/module-loader.js','modules/dashboard-logistica/dashboard-logistica.js'])assert.ok(fs.existsSync(path.join(out,name)));
 const builtIndex=fs.readFileSync(path.join(out,'index.html'),'utf8');assert.match(builtIndex,new RegExp(`build-info\\.generated\\.js\\?v=${result.commit}`));assert.match(builtIndex,new RegExp(`change-audit\\.generated\\.js\\?v=${result.commit}`));
 assert.match(fs.readFileSync(path.join(out,'core','build-info.generated.js'),'utf8'),new RegExp(result.commit));assert.match(fs.readFileSync(path.join(out,'core','change-audit.generated.js'),'utf8'),new RegExp(result.commit));
 for(const [name,content] of before)assert.equal(read(name),content,name+' fuente no debe cambiar durante build');
 assert.throws(()=>buildFrontend(out),/ya existe/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('las publicaciones usan el paquete web y mantienen el contrato de la API',()=>{
 assert.match(read('.github/workflows/pages.yml'),/path: 'dist\/web'/);assert.match(read('netlify.toml'),/publish = "dist\/web"/);
 const flow=read('.github/workflows/main_mantto-gestor-api.yml');assert.match(flow,/\.\/backend\/src/);assert.match(flow,/\.\/backend\/node_modules/);assert.doesNotMatch(flow,/path: \.\/backend\s*$/m);
});
test('no se retiro el monolito legacy usado por sincronizadores',()=>{
 assert.match(read('backend/src/controllers/data.controller.js'),/require\('\.\/data\.controller\.legacy'\)/);
 assert.match(read('backend/src/controllers/data.controller.legacy.js'),/syncTickets/);
});
test('permisos, almacenamiento y fechas siguen teniendo contratos vigentes',()=>{
 assert.ok(fs.existsSync(path.join(ROOT,'backend/src/middleware/information-access-gnral.middleware.js')));
 assert.match(read('backend/src/config/db.js'),/charset: 'utf8mb4'/);assert.match(read('backend/src/config/db.js'),/timezone: 'Z'/);
 assert.match(read('service-worker.js'),/limpieza-v002/);
});

test('todos los require relativos del backend activo resuelven archivos existentes',()=>{
 const {createRequire}=require('node:module');const pending=[path.join(ROOT,'backend','server.js')];
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile()&&p.endsWith('.js'))pending.push(p);}}
 walk(path.join(ROOT,'backend','src'));
 for(const file of pending){const code=fs.readFileSync(file,'utf8');for(const m of code.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g))assert.doesNotThrow(()=>createRequire(file).resolve(m[1]),path.relative(ROOT,file)+' -> '+m[1]);}
});
function resetServiceFixture(fail){
 const calls=[],connection={
  async beginTransaction(){calls.push('begin');},async commit(){calls.push('commit');},async rollback(){calls.push('rollback');},release(){calls.push('release');},
  async query(sql){calls.push(sql);
   if(sql.includes('SELECT id_SB'))return[[{id_SB:5,nombre:'Prueba',correo:'test@example.invalid'}]];
   if(sql.includes('UPDATE usuarios')){if(fail)throw new Error('fallo simulado');return[{affectedRows:1}];}
   if(sql.includes('SELECT pass'))return[[{pass:'hash-test',must_change_password:1,password_changed_at:'2026-10-21'}]];
   if(sql.includes('UPDATE auth_sessions'))return[{affectedRows:2}];
   if(sql.includes('INSERT INTO auth_audit'))return[{affectedRows:1}];
   throw new Error('Consulta inesperada');
  }
 };
 const mod={exports:{}};const deps={crypto:{randomInt:()=>0},bcrypt:{hash:async()=> 'hash-test',compare:async()=>true},'../config/db':{getConnection:async()=>connection}};
 vm.runInNewContext(read('backend/src/services/user-credential-reset.service.js'),{module:mod,exports:mod.exports,require(id){assert.ok(Object.hasOwn(deps,id),'Dependencia inesperada '+id);return deps[id];}});
 return {service:mod.exports,calls};
}
test('Usuarios conserva reset de credenciales sin ejecutar CLI ni escribir CSV',async()=>{
 assert.match(read('backend/src/controllers/usuarios.controller.js'),/user-credential-reset\.service/);
 const text=read('backend/src/services/user-credential-reset.service.js');assert.doesNotMatch(text,/writeFile|require\.main|\.csv|require\(['"]fs/);
 const f=resetServiceFixture(false),result=await f.service.resetUserPasswordById(5,{actorId:1});
 assert.equal(result.credentialVerified,true);assert.equal(result.sessionsRevoked,2);assert.ok(f.calls.includes('commit'));assert.equal(f.calls.at(-1),'release');
});
test('reset conserva rollback y liberacion de conexion si falla',async()=>{
 const f=resetServiceFixture(true);await assert.rejects(f.service.resetUserPasswordById(5),/fallo simulado/);
 assert.ok(f.calls.includes('rollback'));assert.ok(!f.calls.includes('commit'));assert.equal(f.calls.at(-1),'release');
});
