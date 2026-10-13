'use strict';
/* [Aster | 2026-10-12 | ASTER-MG | FASE_1_INSTALACIONES_ADMINISTRACION_TABLA_V001]
 * Aplicador reproducible y fail-closed: toma archivos COMPLETOS del repo local
 * anclado en el blob SHA de main c344f4c y genera archivos completos modificados.
 * No git add, git commit, git push, API, Aiven, Azure ni Netlify.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const {spawnSync} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TARGET_SHA = 'c344f4cddb6b7fa4dd7be3eaabb7357edcc2b76e';
const MODULE = 'modules/instalaciones-administracion/instalaciones-administracion_cor.js';
const ROUTES = 'backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js';
const LOADER = 'core/module-loader.js';
const INDEX = 'index.html';
const NEW_FILES = [
  'backend/src/modules/instalaciones-administracion/instalaciones-administracion.tabla-service.js',
  'modules/instalaciones-administracion/instalaciones-administracion-tabla_cor.css'
];
const EXPECTED = {
  [MODULE]: 'aea7fa4b27baa483ea13626814ebdc77394bc1c7',
  [ROUTES]: 'ed71260f2e9537ec1a6acf3c00cb38110d62b489',
  [LOADER]: '727e6fd34ed382c6bfa9a4850b26d854d9191b5a',
  [INDEX]: '887b83e708e8c4984b71e69c501dacc23f5737ec'
};

function die(text) {throw Error(text);}
function gitBlobSha(buffer) {
  return crypto.createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
}
function replaceOnce(text, oldPart, newPart, target) {
  const first=text.indexOf(oldPart);
  if(first<0||text.indexOf(oldPart,first+oldPart.length)>=0)
    die(`No se encontro un unico ancla valida en ${target}: ${oldPart.slice(0,100)}`);
  return text.slice(0,first)+newPart+text.slice(first+oldPart.length);
}
function replaceBetween(text, start, end, replacement, target) {
  const a=text.indexOf(start),b=text.indexOf(end,a+start.length);
  if(a<0||b<0||text.indexOf(start,a+start.length)>=0||text.indexOf(end,b+end.length)>=0)
    die(`Bloque de funcion no es unico o no coincide: ${target}`);
  return text.slice(0,a)+replacement+text.slice(b);
}
function checkSyntax(source,filename) {
  const tmp=path.join(os.tmpdir(),`mg-phase1-${process.pid}-${Math.random().toString(36).slice(2)}.js`);
  try{
    fs.writeFileSync(tmp,source,'utf8');
    const proc=spawnSync(process.execPath,['--check',tmp],{encoding:'utf8'});
    if(proc.status!==0)die(`Error sintaxis ${filename}: ${proc.stderr||proc.stdout}`);
  }finally{try{fs.unlinkSync(tmp);}catch{}}
}
function stage(repo) {
  const original=new Map(),changed=new Map();
  for(const [relative,sha] of Object.entries(EXPECTED)) {
    const filename=path.join(repo,relative);
    if(!fs.existsSync(filename))die(`Falta archivo base: ${relative}`);
    const buffer=fs.readFileSync(filename);
    const normalized=Buffer.from(buffer.toString('utf8').replace(/\r\n/g,'\n'),'utf8');
    const actual=gitBlobSha(normalized);
    if(actual!==sha)die(`VERSION DIFERENTE / ABORTADO: ${relative}\nEsperado (Git blob main ${TARGET_SHA}): ${sha}\nEncontrado: ${actual}\nPrimero actualiza main o prepara rebase; NO se sobreescribio nada.`);
    original.set(relative,buffer);
  }
  for(const relative of NEW_FILES) {
    if(fs.existsSync(path.join(repo,relative)))die(`Archivo nuevo ya existe; no sobrescribir: ${relative}`);
    const pathInZip=path.join(ROOT,relative);
    if(!fs.existsSync(pathInZip))die(`Archivo fuente faltante en FIX: ${relative}`);
    changed.set(relative,fs.readFileSync(pathInZip));
  }

  // La copia de Windows puede usar CRLF; las anclas siguen el blob canonico LF.
  const canonical=relative=>original.get(relative).toString('utf8').replace(/\r\n/g,'\n');
  const encodeForWorkingTree=(relative,source)=>Buffer.from(
    original.get(relative).toString('utf8').includes('\r\n')
      ? source.replace(/\n/g,'\r\n') : source,'utf8');
  let code=canonical(MODULE);
  code=replaceOnce(code,
    "const VERSION_COR='20261009-autoguardado-fix3-qa-v001';",
    "const VERSION_COR='20261012-admin-tabla-fase1-v001';",MODULE);
  code=replaceOnce(code,
    'selectedProject:null,projectsTotal:0,projectRecordsTotal:0,projectsOffset:0,equipmentOffset:0,',
    'selectedProject:null,projectsTotal:0,projectRecordsTotal:0,projectsOffset:0,equipmentOffset:0,tableColumns:[],',MODULE);
  code=replaceOnce(code,
    "st.selectedProject=null;st.projectsOffset=0;st.equipmentOffset=0;st.page='projects';",
    "st.selectedProject=null;st.projectsOffset=0;st.equipmentOffset=0;st.page='projects';st.tableColumns=[];",MODULE);
  const newRows=fs.readFileSync(path.join(__dirname,'replacements/equipmentRows_cor.txt'),'utf8');
  code=replaceBetween(code,'  function equipmentRows_cor(){','  async function loadFilterOptions_cor(){',newRows,MODULE);
  code=replaceOnce(code,
    "const data=await api(ROOT+'/proyectos/'+encodeURIComponent(key)+'/equipos?'+\n        queryFilters_cor(st.equipmentOffset,EQUIPMENTS_PAGE_SIZE_COR));",
    "const matrixQuery=new URLSearchParams({limit:String(EQUIPMENTS_PAGE_SIZE_COR),offset:String(st.equipmentOffset)});\n      const data=await api(ROOT+'/proyectos/'+encodeURIComponent(key)+'/equipos/tabla?'+matrixQuery.toString());",MODULE);
  code=replaceOnce(code,
    "st.records=Array.isArray(data.data)?data.data:[];\n      st.projectRecordsTotal=Number(data.total||0);equipmentRows_cor();status('Equipos actualizados','ready');",
    "st.records=Array.isArray(data.data)?data.data:[];\n      st.tableColumns=Array.isArray(data.columns)?data.columns:[];\n      st.projectRecordsTotal=Number(data.total||0);equipmentRows_cor();status('Equipos actualizados','ready');",MODULE);
  code=replaceOnce(code,
    "st.records=[];st.projectRecordsTotal=0;equipmentRows_cor();status(e.message,'error');alertMessage(e.message);return false;",
    "st.records=[];st.tableColumns=[];st.projectRecordsTotal=0;equipmentRows_cor();status(e.message,'error');alertMessage(e.message);return false;",MODULE);
  code=replaceOnce(code,
    'if(bar)bar.hidden=!allow;',
    'if(bar)bar.hidden=true; // FASE 1: sin edicion multiple en la tabla.',MODULE);
  code=replaceOnce(code,
    "st.selectedProject=null;st.records=[];st.projectRecordsTotal=0;st.equipmentOffset=0;",
    "st.selectedProject=null;st.records=[];st.tableColumns=[];st.projectRecordsTotal=0;st.equipmentOffset=0;",MODULE);
  // No cambiamos el Main: solo el comportamiento de la pantalla secundaria.
  if(/data-record-id|data-bulk-record-id|data-field-control/.test(newRows))die('La nueva tabla incluye controles de edicion (no permitido en Fase 1).');
  checkSyntax(code,MODULE);changed.set(MODULE,encodeForWorkingTree(MODULE,code));

  let routes=canonical(ROUTES);
  routes=replaceOnce(routes,
    "const controller = require('./instalaciones-administracion.controller');",
    "const controller = require('./instalaciones-administracion.controller');\nconst tableService = require('./instalaciones-administracion.tabla-service');",ROUTES);
  routes=replaceOnce(routes,
    "router.get('/administracion/proyectos/:projectKey/equipos',...accessGuard_cor,controller.projectEquipments_cor);",
    "router.get('/administracion/proyectos/:projectKey/equipos',...accessGuard_cor,controller.projectEquipments_cor);\n\n// [Aster | 2026-10-12 | ASTER-MG | FASE_1_INSTALACIONES_ADMINISTRACION_TABLA_V001]\nrouter.get('/administracion/proyectos/:projectKey/equipos/tabla',...accessGuard_cor,async(req,res,next)=>{\n  try {\n    const result=await tableService.projectEquipmentTable_cor(req,req.params.projectKey,req.query||{});\n    return res.json({ok:true,source:'aiven',...result});\n  } catch(error) {\n    if(error?.statusCode)return res.status(error.statusCode).json({\n      ok:false,code:error.code||'INSTALACIONES_ADMINISTRACION_TABLA_ERROR',message:error.message\n    });\n    return next(error);\n  }\n});",ROUTES);
  checkSyntax(routes,ROUTES);changed.set(ROUTES,encodeForWorkingTree(ROUTES,routes));

  let loader=canonical(LOADER);
  loader=replaceOnce(loader,
    "'instalaciones-administracion':{css:['./modules/instalaciones-administracion/instalaciones-administracion_cor.css?v=20261008-instalaciones-administracion-fase3-v001'],js:['./modules/instalaciones-administracion/instalaciones-administracion_cor.js?v=20261008-instalaciones-administracion-fase3-v001']},",
    "'instalaciones-administracion':{css:['./modules/instalaciones-administracion/instalaciones-administracion_cor.css?v=20261008-instalaciones-administracion-fase3-v001','./modules/instalaciones-administracion/instalaciones-administracion-tabla_cor.css?v=20261012-fase1-v001'],js:['./modules/instalaciones-administracion/instalaciones-administracion_cor.js?v=20261012-fase1-v001']},",LOADER);
  checkSyntax(loader,LOADER);changed.set(LOADER,encodeForWorkingTree(LOADER,loader));

  let index=canonical(INDEX);
  index=replaceOnce(index,
    '<script src="./core/module-loader.js?v=20261008-instalaciones-administracion-fase3-v001"></script>',
    '<script src="./core/module-loader.js?v=20261012-instalaciones-administracion-tabla-fase1-v001"></script>',INDEX);
  changed.set(INDEX,encodeForWorkingTree(INDEX,index));
  for(const relative of NEW_FILES.filter(x=>x.endsWith('.js')))
    checkSyntax(changed.get(relative).toString('utf8'),relative);
  return {original,changed};
}
function install(repo,original,changed){
  const attempted=[];
  try {
    for(const [relative,contents] of changed) {
      const dest=path.join(repo,relative);
      fs.mkdirSync(path.dirname(dest),{recursive:true});
      attempted.push(relative);
      fs.writeFileSync(dest,contents,original.has(relative)?{flag:'w'}:{flag:'wx'});
    }
  }catch(e){
    for(const relative of attempted.reverse()){
      const file=path.join(repo,relative);
      if(original.has(relative))fs.writeFileSync(file,original.get(relative));
      else{try{fs.unlinkSync(file);}catch{}}
    }
    throw e;
  }
}
function main(){
  const args=process.argv.slice(2);
  if(args.length!==2||!['--check','--apply'].includes(args[1]))
    die('Uso: node installer/aplicar-fase1.js "RUTA_AL_REPO" --check|--apply');
  const repo=path.resolve(args[0]);
  if(!fs.existsSync(path.join(repo,'.git')))die('La ruta no corresponde a un repositorio Git (falta .git).');
  const {original,changed}=stage(repo);
  if(args[1]==='--check'){
    console.log('OK: base main, anclas, 6 archivos, sintaxis JS y ausencia de edicion verificadas. Sin escrituras.');
    for(const [relative,c] of changed)console.log('  -> '+relative+' ('+c.length+' bytes)');
    return;
  }
  install(repo,original,changed);
  console.log('FASE 1 APLICADA LOCALMENTE (sin commit ni despliegue). Archivos:');
  for(const relative of changed.keys())console.log('  '+relative);
}
try{main();}catch(error){console.error('ERROR FASE 1 (fail-closed): '+error.message);process.exitCode=1;}
