'use strict';
// BLT NOW - empaquetado de frontend. No instala, publica ni consulta servicios.
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const DIRECTORY_ALLOWLIST=['core','modules','styles','assets'];
const FILE_ALLOWLIST=['index.html','manifest.json','manifest-github.json','service-worker.js','_redirects'];
function buildFrontend(output=path.join(ROOT,'dist','web')){
  const dest=path.resolve(output);
  if(dest===ROOT||ROOT.startsWith(dest+path.sep))throw new Error('Destino de build inseguro.');
  if(fs.existsSync(dest))throw new Error('El destino ya existe. Usa un directorio de build nuevo para no sobrescribir archivos.');
  for(const p of [...FILE_ALLOWLIST,...DIRECTORY_ALLOWLIST])if(!fs.existsSync(path.join(ROOT,p)))throw new Error('Falta recurso web: '+p);
  fs.mkdirSync(dest,{recursive:true});let count=0;
  const copy=(relative)=>{
    const src=path.join(ROOT,relative),target=path.join(dest,relative),stat=fs.lstatSync(src);
    if(stat.isSymbolicLink())throw new Error('No se publican enlaces: '+relative);
    if(stat.isDirectory()){fs.mkdirSync(target,{recursive:true});for(const name of fs.readdirSync(src))copy(path.join(relative,name));return;}
    if(!stat.isFile()||/\.(?:sql|ps1|py|gs|patch|zip|csv|md|txt|sha256)$/i.test(relative))throw new Error('Archivo no publicable en directorio web: '+relative);
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(src,target);count++;
  };
  FILE_ALLOWLIST.forEach(copy);DIRECTORY_ALLOWLIST.forEach(copy);
  // Pages cannot reinterpret the static frontend as a Jekyll source site.
  fs.writeFileSync(path.join(dest,'.nojekyll'),'');
  return {output:dest,files:count+1};
}
if(require.main===module){try{console.log(JSON.stringify(buildFrontend(process.argv[2]),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={buildFrontend,FILE_ALLOWLIST,DIRECTORY_ALLOWLIST};
