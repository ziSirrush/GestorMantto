'use strict';
// BLT NOW - empaquetado de frontend. No instala, publica ni consulta servicios.
const fs=require('node:fs');
const path=require('node:path');
const {generate:generateBuildInfo}=require('./generate-build-info');
const {generate:generateChangeAudit}=require('./generate-change-audit');
const ROOT=path.resolve(__dirname,'..');
const DIRECTORY_ALLOWLIST=['core','modules','styles','assets'];
const FILE_ALLOWLIST=['index.html','manifest.json','manifest-github.json','service-worker.js','_redirects'];
const GENERATED_FILES=new Set(['core/build-info.generated.js','core/change-audit.generated.js']);
function buildFrontend(output=path.join(ROOT,'dist','web'),metadata={}){
  const dest=path.resolve(output);
  if(dest===ROOT||ROOT.startsWith(dest+path.sep))throw new Error('Destino de build inseguro.');
  if(fs.existsSync(dest))throw new Error('El destino ya existe. Usa un directorio de build nuevo para no sobrescribir archivos.');
  for(const p of [...FILE_ALLOWLIST,...DIRECTORY_ALLOWLIST])if(!fs.existsSync(path.join(ROOT,p)))throw new Error('Falta recurso web: '+p);
  fs.mkdirSync(dest,{recursive:true});let count=0;
  const copy=(relative)=>{
    const normalized=relative.replace(/\\/g,'/');
    if(GENERATED_FILES.has(normalized))return;
    const src=path.join(ROOT,relative),target=path.join(dest,relative),stat=fs.lstatSync(src);
    if(stat.isSymbolicLink())throw new Error('No se publican enlaces: '+relative);
    if(stat.isDirectory()){fs.mkdirSync(target,{recursive:true});for(const name of fs.readdirSync(src))copy(path.join(relative,name));return;}
    if(!stat.isFile()||/\.(?:sql|ps1|py|gs|patch|zip|csv|md|txt|sha256)$/i.test(relative))throw new Error('Archivo no publicable en directorio web: '+relative);
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(src,target);count++;
  };
  FILE_ALLOWLIST.forEach(copy);DIRECTORY_ALLOWLIST.forEach(copy);
  const generatedAt=metadata.generatedAt||new Date().toISOString();
  const buildInfo=generateBuildInfo({
    output:path.join(dest,'core','build-info.generated.js'),
    commit:metadata.commit,generatedAt,message:metadata.message,provider:metadata.provider
  });
  generateChangeAudit({
    output:path.join(dest,'core','change-audit.generated.js'),
    indexPath:path.join(dest,'index.html'),commit:buildInfo.commit,generatedAt
  });
  count+=2;
  // Pages cannot reinterpret the static frontend as a Jekyll source site.
  fs.writeFileSync(path.join(dest,'.nojekyll'),'');
  return {output:dest,files:count+1,commit:buildInfo.commit};
}
if(require.main===module){try{console.log(JSON.stringify(buildFrontend(process.argv[2]),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={buildFrontend,FILE_ALLOWLIST,DIRECTORY_ALLOWLIST,GENERATED_FILES};
