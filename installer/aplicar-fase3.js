'use strict';
/* [Aster | 2026-10-13 | ASTER-MG | FASE_3_INSTALACIONES_ADMINISTRACION_GUARDADO_AUDITORIA_V001]
 * Instalador determinista y fail-closed de Fase 3. REQUIERE Fases 1 y 2
 * exactas sobre main c344f4c. Produce archivos COMPLETOS en el checkout local.
 * --check no escribe al checkout; --apply nunca hace git push, SQL ni deploy.
 */
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const phase2root=path.join(__dirname,'reference-phase2');
const phase2=require(path.join(phase2root,'installer/aplicar-fase2.js'));
const phase1exe=path.join(phase2root,'installer/reference-phase1/installer/aplicar-fase1.js');
const BASE='c344f4cddb6b7fa4dd7be3eaabb7357edcc2b76e';
const JS='modules/instalaciones-administracion/instalaciones-administracion_cor.js';
const LOADER='core/module-loader.js',INDEX='index.html';
const ROUTES='backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js';
const SERVICE='backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js';
const REPO='backend/src/modules/instalaciones-administracion/instalaciones-administracion.repository.js';
const CONTROLLER='backend/src/modules/instalaciones-administracion/instalaciones-administracion.controller.js';
const TABLESERVICE='backend/src/modules/instalaciones-administracion/instalaciones-administracion.tabla-service.js';
const TABLECSS='modules/instalaciones-administracion/instalaciones-administracion-tabla_cor.css';
const GHOST='modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js';
const GHOSTCSS='modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.css';
const SAVE='modules/instalaciones-administracion/instalaciones-administracion-save_cor.js';
const HASHES={
  [JS]:'aea7fa4b27baa483ea13626814ebdc77394bc1c7',
  [LOADER]:'727e6fd34ed382c6bfa9a4850b26d854d9191b5a',
  [INDEX]:'887b83e708e8c4984b71e69c501dacc23f5737ec',
  [ROUTES]:'ed71260f2e9537ec1a6acf3c00cb38110d62b489',
  [SERVICE]:'d3d7cfa948ab866304d9595f0662a249c35afdec',
  [REPO]:'55807779f18d2f899ef449056e5a65df8f97a80e',
  [CONTROLLER]:'1d00d81469e72bd78ae3ecf1f041af8dfaa86b38'
};
const EXPECTED_PHASE2=[JS,LOADER,INDEX,ROUTES,SERVICE,REPO,CONTROLLER,TABLESERVICE,TABLECSS,GHOST,GHOSTCSS];
const MODIFIED=[JS,LOADER,INDEX,ROUTES,SERVICE,REPO,CONTROLLER,GHOST,GHOSTCSS];
const NEW_FILES=[SAVE];
const PHASE2_LOADER="'instalaciones-administracion':{css:['./modules/instalaciones-administracion/instalaciones-administracion_cor.css?v=20261008-instalaciones-administracion-fase3-v001','./modules/instalaciones-administracion/instalaciones-administracion-tabla_cor.css?v=20261012-fase1-v001','./modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.css?v=20261013-fase2-v001'],js:['./modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js?v=20261013-fase2-v001','./modules/instalaciones-administracion/instalaciones-administracion_cor.js?v=20261013-fase2-v001']},";
const PHASE3_LOADER="'instalaciones-administracion':{css:['./modules/instalaciones-administracion/instalaciones-administracion_cor.css?v=20261008-instalaciones-administracion-fase3-v001','./modules/instalaciones-administracion/instalaciones-administracion-tabla_cor.css?v=20261012-fase1-v001','./modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.css?v=20261013-fase3-v001'],js:['./modules/instalaciones-administracion/instalaciones-administracion-save_cor.js?v=20261013-fase3-v001','./modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js?v=20261013-fase3-v001','./modules/instalaciones-administracion/instalaciones-administracion_cor.js?v=20261013-fase3-v001']},";
function fail(m){throw Error(m);}
function norm(x){return Buffer.from(x.toString('utf8').replace(/\r\n/g,'\n'),'utf8');}
function sha(x){return crypto.createHash('sha256').update(norm(x)).digest('hex');}
function gitBlob(x){const b=norm(x);return crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');}
function run(command,args,opts={}){
  const out=spawnSync(command,args,{encoding:'utf8',maxBuffer:20*1024*1024,...opts});
  if(out.status!==0||out.error)fail(`Comando fallido ${command}: ${out.stderr||out.stdout||out.error?.message||''}`);
  return out.stdout;
}
function gitShow(repo,relative){
  const r=spawnSync('git',['show',`${BASE}:${relative}`],{cwd:repo,encoding:null,maxBuffer:20*1024*1024});
  if(r.status!==0||r.error)fail('No existe el commit base o su archivo '+relative+': '+String(r.stderr||r.error||''));
  if(gitBlob(r.stdout)!==HASHES[relative])fail('Git main base no coincide con el blob oficial: '+relative);
  return norm(r.stdout);
}
function replaceOnce(text,oldstr,newstr,relative){
  const a=text.indexOf(oldstr);
  if(a<0||text.indexOf(oldstr,a+oldstr.length)>=0)
    fail('Ancla ambigua o distinta en '+relative+': '+oldstr.slice(0,120));
  return text.slice(0,a)+newstr+text.slice(a+oldstr.length);
}
function syntax(text,relative){
  const temp=path.join(os.tmpdir(),`mg-phase3-${process.pid}-${crypto.randomBytes(6).toString('hex')}.js`);
  try{fs.writeFileSync(temp,text,'utf8');run(process.execPath,['--check',temp]);}
  finally{try{fs.unlinkSync(temp);}catch{}}
}
function transformModule(text){
  text=replaceOnce(text,"const VERSION_COR='20261013-admin-ghost-fase2-v001';",
    "const VERSION_COR='20261013-admin-save-fase3-v001';",JS);
  text=replaceOnce(text,
    "  // [Aster | 2026-10-13 | ASTER-MG | FASE_2_INSTALACIONES_ADMINISTRACION_EDICION_FANTASMA_V001]",
    "  // [Aster | 2026-10-13 | ASTER-MG | FASE_3_INSTALACIONES_ADMINISTRACION_GUARDADO_AUDITORIA_V001]\n  const saveEngine=window.ManttoInstalacionesSave_cor;\n  if(!saveEngine)throw new Error('Motor de guardado de Instalaciones no cargado.');\n  // [Aster | 2026-10-13 | ASTER-MG | FASE_2_INSTALACIONES_ADMINISTRACION_EDICION_FANTASMA_V001]",JS);
  text=replaceOnce(text,'    announce:status\n  });',
    '    announce:status,onSave:saveTableDrafts_cor\n  });',JS);
  const saveMethod=`  // FASE 3: guardado EXPLICITO. Una transaccion por equipo y auditoria atomica.
  // Tras cada PATCH se relee el mismo registro con Guard y scope en backend.
  // Si un equipo falla, los ya confirmados permanecen y los otros NO se envian.
  async function saveTableDrafts_cor(){
    if(st.saving||st.loading||st.page!=='equipos'||!st.selectedProject)return false;
    if(!ghost.readyToSave())return false;
    const epoch=ensureContext_cor(),projectKey=String(st.selectedProject.project_key||'');
    let all;
    try{
      all=saveEngine.buildPlan(ghost.listDrafts(),{
        projectKey,groups:groups(),visibleFields:st.tableColumns,
        canEdit,isViewingAs:Boolean(window.ManttoAuth?.isViewingAs?.())
      });
    }catch(error){status(error.message,'error');alertMessage(error.message);return false;}
    if(!all.length)return false;
    const selected=all.slice(0,saveEngine.MAX_EQUIPMENTS_PER_SAVE);
    const nDrafts=selected.reduce((n,item)=>n+item.drafts.length,0);
    if(!window.confirm('Guardar '+nDrafts+' cambio(s) de '+selected.length+
        ' equipo(s) en el sistema? Se validaran permisos, concurrencia y auditoria. '+
        'Una operacion fallida detendra los siguientes equipos; los anteriores confirmados permaneceran guardados.'))return false;
    const current=()=>isCurrentContext_cor(epoch)&&st.page==='equipos'&&
      st.selectedProject?.project_key===projectKey&&
      window.ManttoRouter?.getCurrent?.()?.route==='instalaciones-administracion';
    st.saving=true;ghost.setSaving(true);busy(true);alertMessage('');
    let confirmed=0;
    try{
      const result=await saveEngine.savePlan(selected,{
        projectKey,api,current,
        canonicalCompare:(field,a,b)=>canonicalCompare(field,a)===canonicalCompare(field,b),
        onProgress:({verified,total})=>{
          if(current()){
            status('Guardando equipo '+(verified+1)+' de '+total+'...','loading');
            ghost.setSaveMessage('Guardando '+(verified+1)+' de '+total+' equipos...');
          }
        },
        onConfirmed:async(record,fresh)=>{
          if(!current())throw new Error('La sesion o el proyecto cambio.');
          // Un equipo se confirma solo despues de GET autorizado y comparacion.
          ghost.ackSaved(record.drafts);
          confirmed++;st.listStale=true;
          const belongs=projectKey.startsWith('P:')
            ?String(fresh.id_proyecto??'')===projectKey.slice(2)
            :Number(fresh.id_ins_fl)===Number(projectKey.slice(2))&&!raw(fresh.id_proyecto);
          if(belongs){
            st.records=st.records.map(row=>Number(row.id_ins_fl)===record.id
              ? {...row,...Object.fromEntries(st.tableColumns
                  .filter(field=>Object.prototype.hasOwnProperty.call(fresh,field))
                  .map(field=>[field,fresh[field]]))} : row);
          }else{
            st.records=st.records.filter(row=>Number(row.id_ins_fl)!==record.id);
          }
          equipmentRows_cor();
          status('Confirmado equipo '+confirmed+' de '+selected.length+'.','ready');
        }
      });
      if(!current())return false;
      const updated=await loadTeams_cor();
      if(!current())return false;
      const rest=ghost.pendingCount();
      if(!updated){
        const note=result.verified+' equipo(s) confirmados, pero no se pudo refrescar la tabla. Usa Actualizar.';
        status(note,'error');alertMessage(note);return false;
      }
      const notice=result.verified+' equipo(s) confirmados y auditados. '+
        (rest?rest+' borrador(es) aun pendientes.':'Sin borradores pendientes.');
      status('Guardado confirmado','ready');alertMessage(notice);
      return true;
    }catch(error){
      if(!current())return false;
      const sent=Number(error.verified??confirmed);
      if([401,403,404].includes(Number(error.status))){
        // Los cambios de responsables pueden revocar alcance inmediatamente.
        // No continuar ni dejar informacion sensible montada.
        ghost.clear();st.records=[];st.tableColumns=[];st.projectRecordsTotal=0;
        st.selectedProject=null;st.equipmentOffset=0;showPage_cor('projects');
        try{await loadProjects_cor();}catch(_reloadError){}
        const note='Se confirmaron '+sent+' equipo(s). El acceso fue revocado o el equipo ya no esta autorizado.'+
          (error.committed?' El ultimo PATCH fue aceptado pero NO se pudo verificar por GET.':'')+
          ' No se enviaron mas cambios. Consulta tus permisos y recarga.';
        status(note,'error');alertMessage(note);return false;
      }
      // Un 409 conserva los borradores; el GET paginado marca los conflictos.
      try{await loadTeams_cor();}catch(_reloadError){}
      if(!current())return false;
      const note='Guardado interrumpido: '+sent+' equipo(s) confirmados, equipo '+
        (error.failedId||'?')+' sin confirmacion. '+
        (error.committed?'El PATCH fue aceptado, pero no pudo verificarse. No se reintentara automaticamente. ': '')+
        (Number(error.status)===409?'Conflicto 409: los valores actuales son distintos. ':'')+
        String(error.message||'Error al guardar.')+' Borradores no confirmados conservados.';
      status('Guardado parcial / revision requerida','error');alertMessage(note);
      return false;
    }finally{
      if(isCurrentContext_cor(epoch)){
        st.saving=false;ghost.setSaveMessage('');ghost.setSaving(false);busy(false);
      }
    }
  }
`;
  text=replaceOnce(text,
    '  function equipmentRows_cor(){return ghost.render();}\n  async function loadFilterOptions_cor(){',
    '  function equipmentRows_cor(){return ghost.render();}\n'+saveMethod+'  async function loadFilterOptions_cor(){',JS);
  return text;
}
function transformLoader(text){return replaceOnce(text,PHASE2_LOADER,PHASE3_LOADER,LOADER);}
function transformIndex(text){return replaceOnce(text,
  '<script src="./core/module-loader.js?v=20261013-instalaciones-administracion-ghost-fase2-v001"></script>',
  '<script src="./core/module-loader.js?v=20261013-instalaciones-administracion-guardado-fase3-v001"></script>',INDEX);}
function transformRoutes(text){
  return replaceOnce(text,
    "router.patch(\n  '/administracion/proyectos/:projectKey/equipos/edicion-multiple',",
    "// [Aster | 2026-10-13 | ASTER-MG | FASE_3_INSTALACIONES_ADMINISTRACION_GUARDADO_AUDITORIA_V001]\n// Un equipo, un proyecto verificado dentro de la transaccion y un Guard CORELLIAN.\nrouter.patch(\n  '/administracion/proyectos/:projectKey/equipos/:id/tabla',\n  ...accessGuard_cor,\n  controller.updateTableEquipment_cor\n);\n\nrouter.patch(\n  '/administracion/proyectos/:projectKey/equipos/edicion-multiple',",ROUTES);
}
function transformController(text){
  text=replaceOnce(text,
    "// [Aster | 2026-10-08 | ASTER-MG | FIX_1_INSTALACIONES_ADMINISTRACION_REDISENO_V001]",
    "// [Aster | 2026-10-13 | ASTER-MG | FASE_3_INSTALACIONES_ADMINISTRACION_GUARDADO_AUDITORIA_V001]\nasync function updateTableEquipment_cor(req,res,next){\n  try {\n    const result=await service.updateDetail_cor(req,req.params.id,req.body||{},\n      {projectKey:req.params.projectKey});\n    return res.json({ok:true,source:'aiven',...result});\n  } catch(error){return sendKnownError_cor(error,res,next);}\n}\n\n// [Aster | 2026-10-08 | ASTER-MG | FIX_1_INSTALACIONES_ADMINISTRACION_REDISENO_V001]",CONTROLLER);
  text=replaceOnce(text,'  updateDetail_cor,\n  updateMulti_cor,',
    '  updateDetail_cor,\n  updateTableEquipment_cor,\n  updateMulti_cor,',CONTROLLER);
  return text;
}
function transformService(text){
  text=replaceOnce(text,'async function updateDetail_cor(req, idValue, body = {}) {',
    'async function updateDetail_cor(req, idValue, body = {}, options = {}) {',SERVICE);
  text=replaceOnce(text,
    '  const groupKeys = Object.keys(payload.selected);\n\n  // El mismo permiso EDITAR gobierna',
    "  const groupKeys = Object.keys(payload.selected);\n  let projectKey=null;\n  if(options && Object.prototype.hasOwnProperty.call(options,'projectKey')){\n    // La tabla requiere permiso de lectura del padre y pertenencia a proyecto.\n    // Esto NO amplia permisos, se mantiene la verificacion posterior de EDITAR.\n    const visible=await resolveGroupPermissions_cor(req);\n    if(!visible?.proyecto?.can_view)throw knownError_cor(403,\n      'INSTALACIONES_ADMINISTRACION_PROYECTOS_DENEGADOS',\n      'No tienes autorizacion para modificar equipos dentro de este proyecto.');\n    projectKey=repository.parseProjectKey_cor(options.projectKey).key;\n  }\n\n  // El mismo permiso EDITAR gobierna",SERVICE);
  text=replaceOnce(text,
    '    id, scope, changes: payload.changes, expected: payload.expected,',
    '    id, scope, projectKey, changes: payload.changes, expected: payload.expected,',SERVICE);
  return text;
}
function transformRepository(text){
  text=replaceOnce(text,
    'async function getRecordById_cor({ id, scope, connection = db, forUpdate = false }) {',
    'async function getRecordById_cor({ id, scope, connection = db, forUpdate = false, projectKey = null }) {',REPO);
  text=replaceOnce(text,
    "  const scoped = scopeClause_cor(scope, 'f');\n  const [rows] = await connection.query(\n    `SELECT f.*\n       FROM ins_fl f\n      WHERE f.id_ins_fl = ?\n      ${scoped.sql}\n      LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,\n    [id, ...scoped.params]\n  );",
    "  const scoped = scopeClause_cor(scope, 'f');\n  const project = projectKey == null ? null : parseProjectKey_cor(projectKey);\n  const [rows] = await connection.query(\n    `SELECT f.*\n       FROM ins_fl f\n      WHERE f.id_ins_fl = ?\n      ${project ? 'AND '+project.sql : ''}\n      ${scoped.sql}\n      LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,\n    [id, ...(project ? project.params : []), ...scoped.params]\n  );",REPO);
  text=replaceOnce(text,
    'async function updateRecordById_cor({ id, scope, changes, expected, beforeCommit }) {',
    'async function updateRecordById_cor({ id, scope, changes, expected, beforeCommit, projectKey = null }) {',REPO);
  text=replaceOnce(text,
    '    const before = await getRecordById_cor({\n      id,\n      scope,\n      connection: conn,\n      forUpdate: true\n    });',
    '    const before = await getRecordById_cor({\n      id,\n      scope,\n      projectKey, // Fase 3: validar pertenencia DENTRO de la fila bloqueada.\n      connection: conn,\n      forUpdate: true\n    });',REPO);
  return text;
}
function expectedPhase2(repo){
  if(!fs.existsSync(path.join(repo,'.git')))
    fail('El destino debe ser un checkout Git real (.git).');
  if(run('git',['rev-parse','--is-inside-work-tree'],{cwd:repo}).trim()!=='true')
    fail('Destino no es un checkout Git valido.');
  const expected=new Map();
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mg-phase3-expected-'));
  try{
    fs.mkdirSync(path.join(temp,'.git'));
    for(const relative of Object.keys(HASHES)) {
      const baseline=gitShow(repo,relative);
      expected.set(relative,baseline);
      if([JS,LOADER,INDEX,ROUTES].includes(relative)){
        const to=path.join(temp,relative);fs.mkdirSync(path.dirname(to),{recursive:true});
        fs.writeFileSync(to,baseline);
      }
    }
    // Reconstruir SIN tocar el repo destino, a partir del instalador oficial F1.
    run(process.execPath,[phase1exe,temp,'--apply']);
    for(const relative of [JS,LOADER,INDEX,ROUTES,TABLESERVICE,TABLECSS])
      expected.set(relative,fs.readFileSync(path.join(temp,relative)));
    expected.set(JS,Buffer.from(phase2.transformModule(norm(expected.get(JS)).toString('utf8'))));
    expected.set(LOADER,Buffer.from(phase2.transformLoader(norm(expected.get(LOADER)).toString('utf8'))));
    expected.set(INDEX,Buffer.from(phase2.transformIndex(norm(expected.get(INDEX)).toString('utf8'))));
    for(const relative of [GHOST,GHOSTCSS])
      expected.set(relative,fs.readFileSync(path.join(phase2root,relative)));
    return expected;
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
function prepare(repo){
  const expected=expectedPhase2(repo),original=new Map(),changed=new Map();
  for(const relative of EXPECTED_PHASE2){
    const file=path.join(repo,relative);
    if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink())
      fail('Falta archivo normal obligatorio de Fase 2: '+relative);
    const actual=fs.readFileSync(file),need=expected.get(relative);
    if(sha(actual)!==sha(need))fail('ABORTADO SIN ESCRIBIR: archivo NO es la Fase 2 exacta: '+relative+
      '\nEsperado SHA256: '+sha(need)+'\nEncontrado SHA256: '+sha(actual));
    if(MODIFIED.includes(relative))original.set(relative,actual);
  }
  for(const relative of NEW_FILES)if(fs.existsSync(path.join(repo,relative)))
    fail('ABORTADO: Archivo de Fase 3 ya existe, no sobrescribir: '+relative);
  const transform={
    [JS]:transformModule,[LOADER]:transformLoader,[INDEX]:transformIndex,
    [ROUTES]:transformRoutes,[CONTROLLER]:transformController,
    [SERVICE]:transformService,[REPO]:transformRepository
  };
  for(const relative of MODIFIED){
    if([GHOST,GHOSTCSS].includes(relative)){
      changed.set(relative,fs.readFileSync(path.join(root,relative)));continue;
    }
    const content=norm(original.get(relative)).toString('utf8');
    const next=transform[relative](content);
    if(relative.endsWith('.js'))syntax(next,relative);
    changed.set(relative,Buffer.from(original.get(relative).toString('utf8').includes('\r\n')
      ?next.replace(/\n/g,'\r\n'):next,'utf8'));
  }
  for(const relative of NEW_FILES){
    const full=path.join(root,relative);
    if(!fs.existsSync(full))fail('Falta archivo en el ZIP: '+relative);
    const buffer=fs.readFileSync(full);
    if(relative.endsWith('.js'))syntax(buffer.toString('utf8'),relative);
    changed.set(relative,buffer);
  }
  syntax(fs.readFileSync(path.join(root,GHOST),'utf8'),GHOST);
  if(sha(changed.get(GHOST))===sha(original.get(GHOST)))fail('El editor de Fase 3 no cambio respecto de Fase 2.');
  return {original,changed};
}
function apply(repo,original,changed){
  const done=[];
  try{
    for(const [relative,data] of changed){
      const filename=path.join(repo,relative);
      fs.mkdirSync(path.dirname(filename),{recursive:true});
      if(original.has(relative)){
        // Confirmar nuevamente que nadie edito este archivo durante preflight.
        if(sha(fs.readFileSync(filename))!==sha(original.get(relative)))
          fail('El archivo cambio durante instalacion: '+relative);
        done.push(relative);fs.writeFileSync(filename,data,{flag:'w'});
      }else{
        fs.writeFileSync(filename,data,{flag:'wx'});done.push(relative);
      }
    }
  }catch(error){
    for(const relative of done.reverse()){
      const filename=path.join(repo,relative);
      if(original.has(relative))fs.writeFileSync(filename,original.get(relative));
      else{try{fs.unlinkSync(filename);}catch{}}
    }
    throw error;
  }
}
function main(){
  const args=process.argv.slice(2);
  if(args.length!==2||!['--check','--apply'].includes(args[1]))
    fail('Uso: node installer/aplicar-fase3.js "RUTA_REPO" --check|--apply');
  const repo=path.resolve(args[0]);
  const {original,changed}=prepare(repo);
  if(args[1]==='--apply')apply(repo,original,changed);
  console.log((args[1]==='--check'?'PRECHECK OK, sin escrituras.':'FASE 3 aplicada SOLO en el checkout local.')+
    ' Base '+BASE.slice(0,9)+'. '+changed.size+' archivos preparados.');
  for(const [relative,b] of changed)console.log('  '+relative+' ('+b.length+' bytes)');
  console.log('Sin git commit, push, SQL ni deploy.');
}
if(require.main===module){
  try{main();}catch(err){console.error('ERROR FASE 3 (fail-closed): '+err.message);process.exitCode=1;}
}
module.exports={transformModule,transformLoader,transformIndex,transformRoutes,
  transformController,transformService,transformRepository,replaceOnce,prepare};
