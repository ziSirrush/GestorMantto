'use strict';
// Revisa archivos; nunca ejecuta SQL ni abre conexiones.
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
const IGNORED=new Set(['.git','node_modules','.netlify','dist']);
function auditTree(root=ROOT){
  const errors=[];
  function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    if(IGNORED.has(e.name))continue;
    const p=path.join(dir,e.name),rel=path.relative(root,p).replace(/\\/g,'/');
    if(e.isSymbolicLink()){errors.push('Enlace no auditado: '+rel);continue;}
    if(e.isDirectory()){
      walk(p);continue;
    }
    if(rel.split('/').some(part=>/^installers?$/i.test(part)))errors.push('Instalador no permitido: '+rel);
    if(/\.sql$/i.test(e.name))errors.push('SQL archivado no permitido: '+rel);
    if(/^(?:aplicar[_-]|apply[_-]|instalar[_-]|installer)/i.test(e.name)&&/\.(?:js|cjs|ps1|py)$/i.test(e.name))errors.push('Aplicador historico no permitido: '+rel);
    if(/usuarios?_password.*\.csv$/i.test(e.name))errors.push('CSV de credenciales no permitido: '+rel);
  }}
  walk(root);return errors;
}
if(require.main===module){const errors=auditTree();if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Arbol sin SQL archivados, instaladores ni CSV de credenciales.');}
module.exports={auditTree};
