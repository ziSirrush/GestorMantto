'use strict';
/* [Aster | 2026-10-13 | ASTER-MG | FASE_2_INSTALACIONES_ADMINISTRACION_EDICION_FANTASMA_V001]
 * Instalador determinista, fail-closed. Comprueba Fase 1 exacta recreando
 * su salida desde el commit oficial local y el aplicador de referencia.
 * NO ejecuta escrituras en GitHub, Aiven, Azure ni Netlify.
 */
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');

const FIX_ROOT=path.resolve(__dirname,'..');
const FASE1=path.join(__dirname,'reference-phase1');
const BASE='c344f4cddb6b7fa4dd7be3eaabb7357edcc2b76e';
const JS='modules/instalaciones-administracion/instalaciones-administracion_cor.js';
const LOADER='core/module-loader.js';
const INDEX='index.html';
const STAGE1_FILES=[JS,LOADER,INDEX,
  'backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js',
  'backend/src/modules/instalaciones-administracion/instalaciones-administracion.tabla-service.js',
  'modules/instalaciones-administracion/instalaciones-administracion-tabla_cor.css'];
const NEW_FILES=[
  'modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js',
  'modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.css'
];
const PHASE1_LOADER="'instalaciones-administracion':{css:['./modules/instalaciones-administracion/instalaciones-administracion_cor.css?v=20261008-instalaciones-administracion-fase3-v001','./modules/instalaciones-administracion/instalaciones-administracion-tabla_cor.css?v=20261012-fase1-v001'],js:['./modules/instalaciones-administracion/instalaciones-administracion_cor.js?v=20261012-fase1-v001']},";
const PHASE2_LOADER="'instalaciones-administracion':{css:['./modules/instalaciones-administracion/instalaciones-administracion_cor.css?v=20261008-instalaciones-administracion-fase3-v001','./modules/instalaciones-administracion/instalaciones-administracion-tabla_cor.css?v=20261012-fase1-v001','./modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.css?v=20261013-fase2-v001'],js:['./modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js?v=20261013-fase2-v001','./modules/instalaciones-administracion/instalaciones-administracion_cor.js?v=20261013-fase2-v001']},";

function fail(s){throw new Error(s);}
function run(command,args,options={}) {
  const r=spawnSync(command,args,{encoding:'utf8',maxBuffer:12*1024*1024,...options});
  if(r.error||r.status!==0)fail(`Comando fallido: ${command} ${args.join(' ')}\n${r.stderr||r.stdout||r.error?.message||''}`);
  return r.stdout;
}
function normalize(b) {return Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n'),'utf8');}
function digest(b) {return crypto.createHash('sha256').update(normalize(b)).digest('hex');}
function gitBlob(b){const v=normalize(b);return crypto.createHash('sha1').update(`blob ${v.length}\0`).update(v).digest('hex');}
function replaceOnce(text,oldPart,newPart,filename) {
  const pos=text.indexOf(oldPart);
  if(pos<0||text.indexOf(oldPart,pos+oldPart.length)>=0)
    fail('Ancla ausente o ambigua ('+filename+'): '+oldPart.slice(0,130));
  return text.slice(0,pos)+newPart+text.slice(pos+oldPart.length);
}
function replaceBetween(text,start,end,replacement,filename){
  const i=text.indexOf(start),j=i<0?-1:text.indexOf(end,i+start.length);
  if(i<0||j<0||text.indexOf(start,i+start.length)>=0||text.indexOf(end,j+end.length)>=0)
    fail('Seccion ausente/ambigua en '+filename+': '+start);
  return text.slice(0,i)+replacement+text.slice(j);
}
function checkJs(text,filename){
  const temporary=path.join(os.tmpdir(),`mg-fase2-check-${process.pid}-${crypto.randomBytes(6).toString('hex')}.js`);
  try{fs.writeFileSync(temporary,text,'utf8');run(process.execPath,['--check',temporary]);}
  finally{try{fs.unlinkSync(temporary);}catch{}}
}
function ghid(repo,relative) {
  const cp=spawnSync('git',['show',`${BASE}:${relative}`],{cwd:repo,encoding:null,maxBuffer:20*1024*1024});
  if(cp.status!==0||cp.error)fail('Falta commit base o archivo git show '+relative+': '+String(cp.stderr||cp.error||''));
  return cp.stdout;
}
function verifyPhase1(repo){
  if(!fs.existsSync(path.join(repo,'.git')))fail('El destino NO es un repositorio Git con carpeta .git.');
  const inside=run('git',['rev-parse','--is-inside-work-tree'],{cwd:repo}).trim();
  if(inside!=='true')fail('Destino fuera del repositorio Git.');
  const baseFiles=STAGE1_FILES.slice(0,4);
  const originalHashes={
    [JS]:'aea7fa4b27baa483ea13626814ebdc77394bc1c7',
    [LOADER]:'727e6fd34ed382c6bfa9a4850b26d854d9191b5a',
    [INDEX]:'887b83e708e8c4984b71e69c501dacc23f5737ec',
    'backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js':'ed71260f2e9537ec1a6acf3c00cb38110d62b489'
  };
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mg-expected-fase1-'));
  try{
    fs.mkdirSync(path.join(temp,'.git'));
    for(const relative of baseFiles) {
      const source=ghid(repo,relative);
      if(gitBlob(source)!==originalHashes[relative])fail('Commit base modificado o incorrecto: '+relative);
      const dest=path.join(temp,relative);
      fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,source);
    }
    run(process.execPath,[path.join(FASE1,'installer/aplicar-fase1.js'),temp,'--apply']);
    const evidence=[];
    for(const relative of STAGE1_FILES){
      const file=path.join(repo,relative),expected=path.join(temp,relative);
      if(!fs.existsSync(file))fail('Falta archivo obligatorio de Fase 1: '+relative);
      const exact=digest(fs.readFileSync(expected));
      const current=digest(fs.readFileSync(file));
      if(current!==exact)fail('FASE 1 NO COINCIDE; abortado SIN ESCRIBIR: '+relative+'\nEsperado SHA256: '+exact+'\nActual SHA256: '+current);
      evidence.push({relative,sha256:exact});
    }
    return evidence;
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}

function transformModule(text){
  const ghostInitialization=`  // [Aster | 2026-10-13 | ASTER-MG | FASE_2_INSTALACIONES_ADMINISTRACION_EDICION_FANTASMA_V001]
  // Inyeccion local: el helper no escribe; toma exclusivamente el contrato de lectura actual.
  const ghost=window.ManttoInstalacionesGhost_cor?.create({
    st,$,view,groups,canEdit,esc,label,meta,display,isoDate,previewNumber,canonicalCompare,
    userOptions,loadUsers,pager:pager_cor,
    isViewingAs:()=>Boolean(window.ManttoAuth?.isViewingAs?.()),
    currentContext:currentContext_cor,
    announce:status
  });
  if(!ghost)throw new Error('Editor fantasma no cargado: revisa core/module-loader.js.');
`;
  text=replaceOnce(text,
    "const VERSION_COR='20261012-admin-tabla-fase1-v001';",
    "const VERSION_COR='20261013-admin-ghost-fase2-v001';",JS);
  text=replaceOnce(text,
    '  // No es un motor de permisos: solo invalida datos ya renderizados cuando',
    ghostInitialization+'  // No es un motor de permisos: solo invalida datos ya renderizados cuando',JS);
  text=replaceOnce(text,
    'st.bulkSelected.clear();st.bulkSnapshots.clear();st.bulkTouched.clear();st.bulkConflict=false;\n    invalidateAutoSave_cor();st.listStale=false;',
    'st.bulkSelected.clear();st.bulkSnapshots.clear();st.bulkTouched.clear();st.bulkConflict=false;\n    ghost.clear(); // revocar borradores al cambiar actor, visor o permisos.\n    invalidateAutoSave_cor();st.listStale=false;',JS);
  text=replaceBetween(text,'  function equipmentRows_cor(){','  async function loadFilterOptions_cor(){',
    '  function equipmentRows_cor(){return ghost.render();}\n',JS);
  text=replaceOnce(text,'    clearBulkSelection_cor();\n    st.selectedProject=project;',
    '    ghost.clear(); // nuevo proyecto: invalidar borradores anteriores.\n    clearBulkSelection_cor();\n    st.selectedProject=project;',JS);
  text=replaceOnce(text,"  function hasUnsaved(){\n    if(st.page==='multiple')",
    "  function hasUnsaved(){\n    if(st.page==='equipos'&&ghost.hasPending())return true;\n    if(st.page==='multiple')",JS);
  text=replaceOnce(text,'    const recordId=st.selectedRecord?.id_ins_fl||options.recordId;\n    invalidateAutoSave_cor();',
    '    const recordId=st.selectedRecord?.id_ins_fl||options.recordId;\n    ghost.clear(); // Actualizar nunca envia ni conserva borradores no confirmados.\n    invalidateAutoSave_cor();',JS);
  text=replaceOnce(text,'  function backToProjects_cor(){\n    clearBulkSelection_cor();',
    '  function backToProjects_cor(){\n    ghost.clear();\n    clearBulkSelection_cor();',JS);
  text=replaceOnce(text,'    if(st.bound)return;st.bound=true;\n    $(\'iadm-cor-search-form\')',
    "    if(st.bound)return;st.bound=true;\n    ghost.bind(view());\n    $('iadm-cor-search-form')",JS);
  text=replaceOnce(text,'if(pager&&!pager.disabled&&confirmLeave()){',
    "if(pager&&!pager.disabled&&(pager.dataset.pageKind==='equipos'?ghost.changeEquipmentPage():confirmLeave())){",JS);
  text=replaceOnce(text,'      st.records=[];st.tableColumns=[];st.projectRecordsTotal=0;equipmentRows_cor();status(e.message,\'error\');',
    "      if([401,403,404].includes(Number(e?.status)))ghost.clear();\n      st.records=[];st.tableColumns=[];st.projectRecordsTotal=0;equipmentRows_cor();status(e.message,'error');",JS);
  text=replaceOnce(text,
    "    if(d.route!=='instalaciones-administracion')return;\n    ensureContext_cor();",
    "    if(d.route!=='instalaciones-administracion'){ghost.clear();return;}\n    ensureContext_cor();",JS);
  if(/ghost\.save\(|ghost\.commit\(|ghost\.patch\(/.test(text))fail('Aparecio una escritura no autorizada en Fase 2');
  return text;
}
function transformLoader(text) {return replaceOnce(text,PHASE1_LOADER,PHASE2_LOADER,LOADER);}
function transformIndex(text){return replaceOnce(text,
  '<script src="./core/module-loader.js?v=20261012-instalaciones-administracion-tabla-fase1-v001"></script>',
  '<script src="./core/module-loader.js?v=20261013-instalaciones-administracion-ghost-fase2-v001"></script>',INDEX);}

function stage(repo){
  const evidence=verifyPhase1(repo);
  const original=new Map(),changed=new Map();
  for(const relative of [JS,LOADER,INDEX]){
    const b=fs.readFileSync(path.join(repo,relative));
    original.set(relative,b);
    const lf=b.toString('utf8').replace(/\r\n/g,'\n');
    const result=relative===JS?transformModule(lf):relative===LOADER?transformLoader(lf):transformIndex(lf);
    if(relative!==INDEX)checkJs(result,relative);
    changed.set(relative,Buffer.from(b.toString('utf8').includes('\r\n')?result.replace(/\n/g,'\r\n'):result,'utf8'));
  }
  for(const relative of NEW_FILES){
    if(fs.existsSync(path.join(repo,relative)))fail('Archivo Fase 2 ya existe (no sobrescribir): '+relative);
    const f=path.join(FIX_ROOT,relative);
    if(!fs.existsSync(f))fail('Archivo faltante en ZIP: '+relative);
    const b=fs.readFileSync(f);
    if(relative.endsWith('.js'))checkJs(b.toString('utf8'),relative);
    changed.set(relative,b);
  }
  // Prohibir alteraciones de ruta backend o de permisos en Fase 2.
  if(changed.has('backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js'))
    fail('No se permiten rutas backend nuevas en Fase 2');
  return {original,changed,evidence};
}
function apply(repo,original,changed){
  const done=[];
  try{
    for(const [relative,data] of changed){
      const filename=path.join(repo,relative);
      fs.mkdirSync(path.dirname(filename),{recursive:true});
      if(original.has(relative)){
        // Registrar ANTES de escribir para poder restaurar si el archivo
        // preexistente fallo a mitad del reemplazo.
        done.push(relative);
        fs.writeFileSync(filename,data,{flag:'w'});
      }else{
        // No borrar un archivo ajeno que haya aparecido por una carrera.
        fs.writeFileSync(filename,data,{flag:'wx'});
        done.push(relative);
      }
    }
  }catch(error){
    for(const relative of done.reverse()){
      const dest=path.join(repo,relative);
      if(original.has(relative))fs.writeFileSync(dest,original.get(relative));
      else {try{fs.unlinkSync(dest);}catch{}}
    }
    throw error;
  }
}
function main(){
  const args=process.argv.slice(2);
  if(args.length!==2 || !['--check','--apply'].includes(args[1]))
    fail('Uso: node installer/aplicar-fase2.js "RUTA_AL_REPO" --check|--apply');
  const repo=path.resolve(args[0]);
  if(!fs.existsSync(repo))fail('La ruta del repositorio no existe.');
  const {original,changed,evidence}=stage(repo);
  if(args[1]==='--check'){
    console.log('PREFLIGHT OK: Fase 1 exacta ('+evidence.length+' archivos), anclas de Fase 2, permisos intactos y sintaxis JS. NO se escribio al repo.');
  }else{
    apply(repo,original,changed);
    console.log('FASE 2 APLICADA EN COPIA LOCAL. No se guardo ninguna operacion en Aiven/GitHub/Azure/Netlify.');
  }
  for(const [relative,data] of changed)console.log('  '+relative+' '+data.length+' bytes');
}
if(require.main===module){
  try{main();}catch(error){console.error('ERROR FASE 2 (abortado, fail-closed): '+error.message);process.exitCode=1;}
}
module.exports={transformModule,transformLoader,transformIndex,replaceOnce,replaceBetween};
