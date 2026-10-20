(function(){
  'use strict';

  if(window.ManttoOfflineCatalog)return;

  const STORAGE_PREFIX='mantto:offline-selection:f1:';
  let catalog=[];
  let availableDatasets=[];
  let effectiveUserId=null;
  let actorUserId=null;
  let viewer=false;
  let excluded=new Set();

  function positiveId(value){
    const id=Number(value);
    return Number.isSafeInteger(id)&&id>0?id:null;
  }
  function identity(user){return positiveId(user?.id_SB||user?.id||user?.user_id);}
  function storageKey(){
    if(!actorUserId||!effectiveUserId)return null;
    return `${STORAGE_PREFIX}${actorUserId}:${effectiveUserId}`;
  }
  function readExcluded(){
    const key=storageKey();
    if(!key)return new Set();
    try{
      const saved=JSON.parse(localStorage.getItem(key)||'null');
      return new Set(Array.isArray(saved?.excluded_codes)
        ?saved.excluded_codes.filter(s=>typeof s==='string'):[]);
    }catch(_error){return new Set();}
  }
  function saveExcluded(){
    const key=storageKey();
    if(!key)throw new Error('No se pudo asociar la seleccion con el usuario efectivo.');
    localStorage.setItem(key,JSON.stringify({
      excluded_codes:[...excluded].sort(),
      updated_at:new Date().toISOString()
    }));
  }
  function isSelected(code){
    return catalog.some(module=>module.code===code)&&!excluded.has(code);
  }
  function canDownload(datasetKey){
    return catalog.some(module=>isSelected(module.code)&&
      Array.isArray(module.datasets)&&module.datasets.includes(datasetKey));
  }
  function describeScope(module){
    const scope=module?.scope||{};
    if(scope.mode==='DOMINIO_COMPLETO'&&scope.master_key===true)return `${module.domain} · llave maestra · dominio completo`;
    if(module.domain==='UNITED'&&scope.mode==='ZONAS'){
      const count=Array.isArray(scope.zone_ids)?scope.zone_ids.length:0;
      const labels=Array.isArray(scope.zones)?scope.zones.join(', '):'';
      return `UNITED · ${count} zonas autorizadas${labels?' ('+labels+')':''}`;
    }
    if(module.domain==='CORELLIAN'&&scope.mode==='USUARIOS'){
      return `CORELLIAN · ${Number(scope.visible_user_count||0)} usuarios en alcance`;
    }
    if(module.domain==='GENERAL'&&scope.mode==='RELACION_DIRECTA')return 'GENERAL · relacion directa autorizada';
    return 'Alcance no disponible';
  }
  function statusLabel(module){
    return module.backup_status==='EXPORTADOR_EXISTENTE'
      ?'Exportador existente' : 'Exportador pendiente (Fase 2)';
  }
  function el(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=String(text);
    return node;
  }
  function renderCounter(){
    const node=document.getElementById('off-catalog-count');
    if(node)node.textContent=`${catalog.filter(module=>isSelected(module.code)).length} de ${catalog.length} seleccionados`;
    const all=document.getElementById('off-catalog-all');
    if(all)all.checked=catalog.length>0&&catalog.every(module=>isSelected(module.code));
  }
  function renderSelector(){
    const grid=document.querySelector('#view-offline-configuracion .off-grid');
    if(!grid)return;
    document.getElementById('off-catalog-card')?.remove();
    const card=el('section','off-card off-scope');
    card.id='off-catalog-card';
    card.style.gridColumn='1/-1';
    const heading=el('div','off-card-title');
    const headingContent=el('div');
    headingContent.append(el('h2','', 'Modulos que deseo respaldar'),
      el('p','', 'Todos los modulos de lectura autorizados estan marcados por defecto. Una seleccion no concede permisos nuevos.'));
    heading.append(el('span','', '☑'),headingContent);
    card.append(heading);
    if(!catalog.length){
      card.append(el('p','off-muted','No hay modulos de datos disponibles dentro de tus permisos y alcance efectivos.'));
    }else{
      const top=el('div','off-switch-row');
      const selectAll=el('input');
      selectAll.type='checkbox';
      selectAll.id='off-catalog-all';
      selectAll.disabled=viewer;
      selectAll.addEventListener('change',()=>{
        if(viewer)return;
        excluded=selectAll.checked?new Set():new Set(catalog.map(m=>m.code));
        try{saveExcluded();renderSelector();renderSavedModules();}
        catch(error){alertLocal(error.message);}
      });
      const text=el('label','', 'Seleccionar todos');
      text.htmlFor=selectAll.id;
      top.append(selectAll,text,el('span','off-muted','')); // Contador en un nodo independiente.
      top.lastChild.id='off-catalog-count';
      card.append(top);

      const groups=new Map();
      for(const module of catalog){
        const group=`${module.domain} · ${module.grouping_name||module.grouping_code||'Sin agrupacion'}`;
        if(!groups.has(group))groups.set(group,[]);
        groups.get(group).push(module);
      }
      for(const [name,modules] of groups){
        card.append(el('h3','',name));
        for(const module of modules){
          const label=el('label','off-switch-row');
          label.style.display='flex';
          label.style.alignItems='start';
          label.style.gap='12px';
          label.style.marginBottom='9px';
          const check=el('input');
          check.type='checkbox';
          check.checked=isSelected(module.code);
          check.disabled=viewer;
          check.setAttribute('data-offline-module',module.code);
          check.addEventListener('change',()=>{
            if(viewer)return;
            if(check.checked)excluded.delete(module.code);else excluded.add(module.code);
            try{saveExcluded();renderCounter();renderSavedModules();}
            catch(error){check.checked=!check.checked;alertLocal(error.message);}
          });
          const info=el('div');
          info.style.flex='1';
          info.append(el('strong','',module.name),el('p','off-muted',describeScope(module)),
            el('p','off-muted',statusLabel(module)));
          label.append(check,info);
          card.append(label);
        }
      }
    }
    const message=el('p','off-message');
    message.id='off-catalog-message';
    message.setAttribute('aria-live','polite');
    card.append(message);
    // No insertamos el catalogo dentro de la seccion que debe contener solo copias existentes.
    grid.append(card);
    renderCounter();
  }
  function alertLocal(message){
    const node=document.getElementById('off-catalog-message');
    if(node)node.textContent=message;
  }
  function shortDate(value){
    const parsed=new Date(value||0);
    if(!Number.isFinite(parsed.getTime()))return 'Fecha no disponible';
    return new Intl.DateTimeFormat('es-MX',{dateStyle:'short',timeStyle:'short'}).format(parsed);
  }
  function formatSize(value){
    const bytes=Number(value)||0;
    if(bytes<1024)return `${bytes} B`;
    if(bytes<1024*1024)return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/1024/1024).toFixed(1)} MB`;
  }
  async function renderSavedModules(){
    const target=document.getElementById('off-local-results');
    if(!target)return;
    target.replaceChildren();
    const storage=window.ManttoOfflineStorage;
    if(!storage||!actorUserId||!effectiveUserId){
      target.append(el('p','off-muted','El almacenamiento local no esta disponible.'));
      return;
    }
    try{
      const rows=await storage.listSnapshots({
        actor_user_id:actorUserId,effective_user_id:effectiveUserId
      });
      const allowedDatasets=new Map();
      for(const module of catalog){
        if(!isSelected(module.code))continue;
        for(const dataset of (module.datasets||[])){
          if(availableDatasets.includes(dataset))allowedDatasets.set(String(dataset).toUpperCase(),module);
        }
      }
      const existing=rows.filter(row=>row&&allowedDatasets.has(row.dataset));
      if(!existing.length){
        target.append(el('p','off-muted','Aun no hay modulos seleccionados con respaldos operativos guardados.'));
        return;
      }
      for(const row of existing){
        const module=allowedDatasets.get(row.dataset);
        if(module.domain!==row.domain)continue;
        const item=el('div','off-card');
        item.append(el('strong','',`${module.domain} · ${module.name}`),
          el('p','off-muted',`Registros: ${Number(row.record_count||0).toLocaleString('es-MX')} · ${formatSize(row.byte_size)} · ${shortDate(row.downloaded_at)}`),
          el('p','off-muted',describeScope(module)));
        target.append(item);
      }
    }catch(error){
      target.replaceChildren(el('p','off-muted',error?.message||'No se pudo leer el inventario local.'));
    }
  }
  async function init(capabilities){
    actorUserId=identity(window.ManttoAuth?.getActorUser?.());
    effectiveUserId=positiveId(capabilities?.effective_user_id);
    viewer=capabilities?.viewer_read_only===true||window.ManttoAuth?.isViewingAs?.()===true;
    catalog=Array.isArray(capabilities?.catalog_modules)
      ?capabilities.catalog_modules.filter(item=>item&&item.code&&item.domain&&item.scope):[];
    availableDatasets=Array.isArray(capabilities?.datasets)
      ?capabilities.datasets.map(item=>String(item?.key||'').toUpperCase()).filter(Boolean):[];
    const legacyBackupCard=document.querySelector('#view-offline-configuracion .off-card-backup');
    if(legacyBackupCard)legacyBackupCard.hidden=availableDatasets.length===0;
    excluded=readExcluded();
    // Sin una lista validada por el backend, el frontend nunca inventa modulos.
    renderSelector();
    await renderSavedModules();
  }
  window.ManttoOfflineCatalog={init,isSelected,canDownload,renderSavedModules,describeScope};
})();
