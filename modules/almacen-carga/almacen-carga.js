(function(){
  'use strict';

  if(window.ManttoAlmacenCarga) return;

  // [Aster | 2026-09-01 | ASTER-MG | FIX ALMACEN ARCHIVO BLOB + STAGING ACTIVO V001]
  const state={source:null,sources:[],selectedLot:'',validation:null,busy:false,file:null,cutoff:''};

  function escapeHtml(value){
    return String(value==null?'':value).replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function number(value){
    const n=Number(value);
    return Number.isFinite(n)?new Intl.NumberFormat('es-MX',{maximumFractionDigits:0}).format(n):'—';
  }
  function dateText(value){
    if(!value)return '—';
    const raw=String(value).trim();
    const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if(iso){
      const base=`${iso[3]}/${iso[2]}/${iso[1]}`;
      return iso[4]&&iso[5]?`${base} - ${iso[4]}:${iso[5]}`:base;
    }
    return escapeHtml(raw);
  }
  function authApi(path,options){
    if(window.ManttoAuth&&typeof window.ManttoAuth.api==='function') return window.ManttoAuth.api(path,options||{});
    const headers=Object.assign({'Accept':'application/json'},window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{},options&&options.headers||{});
    const opts=Object.assign({credentials:'include'},options||{},{headers:headers});
    return fetch(String(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'')+path,opts).then(async function(response){
      const json=await response.json().catch(function(){return {ok:false,message:'Respuesta no JSON.'};});
      if(!response.ok||json.ok===false){const error=new Error(json.message||('HTTP '+response.status));error.status=response.status;error.payload=json;throw error;}
      return json;
    });
  }

  const ALMACEN_SOURCE_KEY='mantto:almacen:lote-seleccionado';
  function selectLot(lot){
    const value=String(lot||'').trim();
    try{if(value)window.sessionStorage.setItem(ALMACEN_SOURCE_KEY,value);else window.sessionStorage.removeItem(ALMACEN_SOURCE_KEY);}catch(_error){}
    state.selectedLot=value;
    if(window.ManttoHttp&&typeof window.ManttoHttp.invalidate==='function')window.ManttoHttp.invalidate('/api/almacen');
    document.dispatchEvent(new CustomEvent('mantto:almacen-source-changed',{detail:{loteImportacion:value,source:'almacen-carga'}}));
  }
  function syncSelectedLot(){
    // Nuevo contrato: las pantallas siempre consultan el staging ACTIVO.
    const active=state.source&&state.source.loteImportacion?String(state.source.loteImportacion):'';
    state.selectedLot=active;
    selectLot(active);
  }

  function historyHtml(){
    const rows=state.sources||[];
    if(!rows.length)return '<section class="almload-card"><div class="almload-section-head"><div><h2>Histórico de cierres</h2><p>No hay cierres disponibles.</p></div></div></section>';
    return '<section class="almload-card"><div class="almload-section-head"><div><h2>Histórico de cierres</h2><p>Los cierres archivados conservan el Excel original en Azure. Activar uno reprocesa ese Excel y sustituye el staging operativo de Aiven.</p></div><span class="almload-pill neutral">'+number(rows.length)+' cierres</span></div><div class="almload-history-list">'+rows.map(function(row){
      const isActive=Boolean(row.activo);
      const archived=Boolean(row.archived);
      const status=archived?'Azure Blob':(row.loaded?'Legacy en Aiven':'Sin archivo');
      const disabled=isActive||!archived;
      const buttonText=isActive?'Activo':(archived?'Activar cierre':'Pendiente archivar');
      return '<div class="almload-history-row'+(isActive?' is-selected':'')+'"><div><strong>'+escapeHtml(row.archivoOrigen||'Archivo')+'</strong><small>'+escapeHtml(row.loteImportacion||'')+'</small></div><div><strong>'+escapeHtml(row.fechaCorte||'Sin corte')+'</strong><small>'+dateText(row.fechaImportacion)+' · '+escapeHtml(status)+'</small></div><div><strong>'+number(row.datasets&&row.datasets.INVENTARIO?row.datasets.INVENTARIO.filas:0)+'</strong><small>inventario</small></div><button type="button" data-almload-source="'+escapeHtml(row.loteImportacion)+'"'+(disabled?' disabled':'')+'>'+buttonText+'</button></div>';
    }).join('')+'</div></section>';
  }

  function sourceHtml(){
    if(!state.source){
      return '<section class="almload-card almload-source"><div><span class="almload-kicker">Fuente activa</span><h2>Sin lote activo</h2><p>La primera carga guardará el Excel original en Azure Blob y materializará solamente el staging activo en Aiven.</p></div><span class="almload-pill warn">Sin carga</span></section>';
    }
    const s=state.source;
    const rows=s.filas!=null?s.filas:(s.datasets&&s.datasets.INVENTARIO?s.datasets.INVENTARIO.filas:null);
    const archiveText=s.archived?'Excel protegido en Azure Blob':'Legacy: falta archivar Excel original';
    return '<section class="almload-card almload-source"><div><span class="almload-kicker">Fuente activa</span><h2>'+escapeHtml(s.archivoOrigen||'Archivo activo')+'</h2><p>'+escapeHtml(s.hojaOrigen||'Lote de Almacén')+' · '+number(rows)+' filas · Corte '+escapeHtml(s.fechaCorte||'—')+'</p><small>Lote: '+escapeHtml(s.loteImportacion||'—')+' · '+archiveText+'</small></div><span class="almload-pill '+(s.archived?'ok':'warn')+'">'+(s.archived?'Activo + archivado':'Migración requerida')+'</span></section>';
  }

  function messageHtml(text,tone){
    return '<div class="almload-message '+escapeHtml(tone||'')+'" id="almload-message">'+escapeHtml(text||'Selecciona un archivo y valida antes de importar.')+'</div>';
  }
  function validationSummary(data){
    const parts=[];
    if(data&&data.profile)parts.push('Perfil '+String(data.profile));
    if(data&&data.rows!=null)parts.push(number(data.rows)+' filas normalizadas');
    if(Array.isArray(data&&data.datasets)&&data.datasets.length){
      const sets=data.datasets.map(function(ds){return String(ds.type||'CONJUNTO')+' '+String(ds.sheetName||'')+': '+number(ds.rows||0);});
      parts.push('Conjuntos: '+sets.join(' · '));
    }
    if(data&&data.hash)parts.push('Hash '+String(data.hash).slice(0,12));
    if(Array.isArray(data&&data.warnings)&&data.warnings.length)parts.push('Advertencias: '+data.warnings.join(' '));
    return parts.join(' · ')||'Validación correcta.';
  }

  function render(view,message,tone){
    const requiresArchive=Boolean(state.source&&!state.source.archived);
    const migration=requiresArchive
      ? '<div class="almload-message warn"><b>Migración única requerida:</b> selecciona el mismo Excel que generó el cierre activo ('+escapeHtml(state.source.archivoOrigen||'actual')+'), valídalo y pulsa <b>Archivar cierre actual</b>. El backend comprobará su SHA-256 antes de asociarlo.</div>'
      : '';
    const archiveButton=requiresArchive?'<button type="button" class="almload-btn" id="almload-archive" '+(state.validation?'':'disabled')+'>Archivar cierre actual</button>':'';
    view.innerHTML='<div class="almload-shell">'+
      '<section class="almload-card almload-head"><div><span class="almload-eyebrow">⬆️ Gestión de Almacén</span><h1>Carga de Información</h1><p>Excel temporal archivado en Azure Blob privado. Aiven conserva una referencia ligera por cierre y únicamente las filas normalizadas del cierre activo.</p></div><span class="almload-pill restricted">Acceso restringido</span></section>'+
      sourceHtml()+historyHtml()+
      '<section class="almload-card"><div class="almload-section-head"><div><h2>Nueva carga</h2><p>El Excel original se conserva fuera de MySQL. Al activar un cierre, Aiven reemplaza el staging operativo en lugar de acumular snapshots mensuales.</p></div><span class="almload-pill neutral">.xlsx / .csv · 25 MB</span></div>'+migration+
      '<div class="almload-grid"><label><span>Archivo</span><input id="almload-file" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"><small id="almload-file-name">'+escapeHtml(state.file?state.file.name:'Ningún archivo seleccionado')+'</small></label><label><span>Fecha de corte</span><input id="almload-cutoff" type="date" value="'+escapeHtml(state.cutoff)+'"></label></div>'+
      '<div class="almload-actions"><button type="button" class="almload-btn" id="almload-validate">Validar</button>'+archiveButton+'<button type="button" class="almload-btn primary" id="almload-import" '+(state.validation&&!requiresArchive?'':'disabled')+'>Importar y activar</button></div>'+messageHtml(message,tone)+'</section>'+
      '<section class="almload-card almload-rules"><h2>Controles de seguridad</h2><div><span>1</span><p><b>Excel original privado.</b> Cada cierre nuevo se archiva en Azure Blob antes de liberar el staging anterior.</p></div><div><span>2</span><p><b>Aiven solo opera el cierre activo.</b> Los cierres históricos ya no conservan miles de filas normalizadas.</p></div><div><span>3</span><p><b>Reactivación verificable.</b> Un histórico se descarga del Blob, verifica por SHA-256 y se reprocesa antes de volver a ser fuente operativa.</p></div></section></div>';
    bind(view);
  }

  function setMessage(view,text,tone){
    const node=view.querySelector('#almload-message');if(!node)return;
    node.className='almload-message '+String(tone||'');node.textContent=text||'';
  }
  function syncControls(view){
    const requiresArchive=Boolean(state.source&&!state.source.archived);
    const validateBtn=view.querySelector('#almload-validate');
    const archiveBtn=view.querySelector('#almload-archive');
    const importBtn=view.querySelector('#almload-import');
    if(validateBtn)validateBtn.disabled=state.busy;
    if(archiveBtn)archiveBtn.disabled=state.busy||!state.validation||!state.file;
    if(importBtn)importBtn.disabled=state.busy||!state.validation||requiresArchive;
    const fileName=view.querySelector('#almload-file-name');if(fileName)fileName.textContent=state.file?state.file.name:'Ningún archivo seleccionado';
  }
  function fileKey(file){return file?[file.name,file.size,file.lastModified].join('|'):'';}
  function buildForm(){
    if(!state.file)return null;
    const form=new FormData();form.append('archivo',state.file);
    if(state.cutoff)form.append('fechaCorte',state.cutoff);
    return form;
  }

  async function refreshSources(){
    const responses=await Promise.all([
      authApi('/api/almacen/carga/capabilities',{method:'GET'}),
      authApi('/api/almacen/fuentes',{method:'GET'})
    ]);
    state.source=responses[0].source||null;
    state.sources=responses[1].sources||[];
    syncSelectedLot();
  }

  async function loadCapabilities(view){
    view.innerHTML='<div class="almload-shell"><section class="almload-card almload-head"><div><span class="almload-eyebrow">⬆️ Gestión de Almacén</span><h1>Carga de Información</h1><p>Validando permiso, fuente activa e histórico...</p></div></section></div>';
    try{
      await refreshSources();
      state.validation=null;state.file=null;state.cutoff='';
      render(view,state.source&&!state.source.archived?'El cierre activo es legacy. Archívalo una sola vez antes de sustituirlo.':'Selecciona un archivo y valida antes de importar.',state.source&&!state.source.archived?'warn':'');
    }catch(error){
      const denied=Number(error&&error.status)===403;
      view.innerHTML='<div class="almload-shell"><section class="almload-card almload-error"><span>⚠️</span><div><h1>'+(denied?'Acceso no autorizado':'No fue posible abrir Carga de Información')+'</h1><p>'+escapeHtml(error.message||'Error no identificado.')+'</p>'+(denied?'<small>Solicita el permiso ALMACEN_CARGA desde Panel de Control.</small>':'')+'</div></section></div>';
    }
  }

  async function validate(view){
    if(!state.file){setMessage(view,'Selecciona un archivo .xlsx o .csv.','error');return;}
    const form=buildForm();state.validation=null;state.busy=true;syncControls(view);setMessage(view,'Validando encabezados, mapeo y estructura...','working');
    try{
      const data=await authApi('/api/almacen/carga/validar',{method:'POST',body:form});
      state.validation={hash:data.hash||'',fileKey:fileKey(state.file),data:data};
      setMessage(view,validationSummary(data),Array.isArray(data.warnings)&&data.warnings.length?'warn':'ok');
    }catch(error){
      state.validation=null;
      let msg=error.message||'No se pudo validar el archivo.';
      const details=error&&error.payload&&error.payload.details;
      if(details&&Array.isArray(details.headers))msg+=' Encabezados detectados: '+details.headers.join(' | ');
      setMessage(view,msg,'error');
    }finally{state.busy=false;syncControls(view);}
  }

  async function archiveCurrent(view){
    if(!state.source||state.source.archived)return;
    if(!state.file||!state.validation||state.validation.fileKey!==fileKey(state.file)){setMessage(view,'Selecciona y valida el Excel exacto del cierre activo antes de archivarlo.','error');return;}
    if(!window.confirm('Se verificará el hash del Excel contra el cierre activo y, si coincide, se guardará una copia privada en Azure Blob. ¿Continuar?'))return;
    state.busy=true;syncControls(view);setMessage(view,'Archivando Excel activo en Azure Blob y verificando SHA-256...','working');
    try{
      await authApi('/api/almacen/carga/archivar-activo',{method:'POST',body:buildForm()});
      state.validation=null;state.file=null;
      await refreshSources();
      render(view,'Cierre activo archivado correctamente. Ya puedes seleccionar el nuevo Excel e importarlo sin acumular históricos normalizados en Aiven.','ok');
    }catch(error){setMessage(view,error.message||'No se pudo archivar el cierre activo.','error');}
    finally{state.busy=false;syncControls(view);}
  }

  async function runImport(view){
    if(state.source&&!state.source.archived){setMessage(view,'Primero archiva el cierre activo legacy.','error');return;}
    if(!state.file||!state.validation||state.validation.fileKey!==fileKey(state.file)){state.validation=null;syncControls(view);setMessage(view,'El archivo debe validarse nuevamente antes de importar.','error');return;}
    if(!window.confirm('El Excel se guardará en Azure Blob y sustituirá el staging activo de Almacén en Aiven. El cierre anterior conservará solo su referencia histórica. ¿Continuar?'))return;
    const form=buildForm();state.busy=true;syncControls(view);setMessage(view,'Archivando Excel en Azure y reemplazando staging activo en Aiven. No cierres esta vista...','working');
    try{
      const data=await authApi('/api/almacen/carga/importar',{method:'POST',body:form});
      state.validation=null;state.file=null;
      if(window.ManttoHttp&&typeof window.ManttoHttp.invalidate==='function')window.ManttoHttp.invalidate('/api/almacen');
      document.dispatchEvent(new CustomEvent('mantto:data-mutated',{detail:{path:'/api/almacen/carga/importar',method:'POST',source:'almacen-carga'}}));
      await refreshSources();
      selectLot(data.loteImportacion||state.source&&state.source.loteImportacion||'');
      render(view,'Importación completada. Excel protegido en Azure Blob y staging activo actualizado · '+number(data.filas)+' filas operativas.','ok');
    }catch(error){setMessage(view,error.message||'No se pudo completar la importación.','error');}
    finally{state.busy=false;syncControls(view);}
  }

  async function activateSource(view,lot){
    const target=String(lot||'').trim();if(!target||state.busy)return;
    if(!window.confirm('Se descargará el Excel histórico desde Azure, se verificará su hash y reemplazará el staging activo de Almacén. ¿Continuar?'))return;
    state.busy=true;syncControls(view);setMessage(view,'Reactivando cierre histórico desde Azure Blob...','working');
    try{
      const data=await authApi('/api/almacen/carga/fuentes/'+encodeURIComponent(target)+'/activar',{method:'POST'});
      if(window.ManttoHttp&&typeof window.ManttoHttp.invalidate==='function')window.ManttoHttp.invalidate('/api/almacen');
      document.dispatchEvent(new CustomEvent('mantto:data-mutated',{detail:{path:'/api/almacen/carga/fuentes/'+target+'/activar',method:'POST',source:'almacen-carga'}}));
      await refreshSources();selectLot(data.loteImportacion||target);
      render(view,'Cierre histórico reactivado. Sus datos son ahora el staging operativo de Gestión de Almacén.','ok');
    }catch(error){setMessage(view,error.message||'No se pudo reactivar el cierre histórico.','error');}
    finally{state.busy=false;syncControls(view);}
  }

  function bind(view){
    const file=view.querySelector('#almload-file');
    const cutoff=view.querySelector('#almload-cutoff');
    const validateBtn=view.querySelector('#almload-validate');
    const archiveBtn=view.querySelector('#almload-archive');
    const importBtn=view.querySelector('#almload-import');
    if(file)file.addEventListener('change',function(){state.file=file.files&&file.files[0]?file.files[0]:null;state.validation=null;syncControls(view);setMessage(view,state.file?'Archivo seleccionado. Valídalo antes de continuar.':'Selecciona un archivo .xlsx o .csv.','');});
    if(cutoff)cutoff.addEventListener('change',function(){state.cutoff=cutoff.value||'';state.validation=null;syncControls(view);setMessage(view,'Fecha de corte modificada. Vuelve a validar antes de importar.','');});
    if(validateBtn)validateBtn.addEventListener('click',function(){if(!state.busy)validate(view);});
    if(archiveBtn)archiveBtn.addEventListener('click',function(){if(!state.busy)archiveCurrent(view);});
    if(importBtn)importBtn.addEventListener('click',function(){if(!state.busy)runImport(view);});
    view.querySelectorAll('[data-almload-source]').forEach(function(button){button.addEventListener('click',function(){if(!button.disabled)activateSource(view,button.dataset.almloadSource||'');});});
    syncControls(view);
  }

  function init(route){
    if(route!=='almacen-carga')return false;
    const view=document.getElementById('view-almacen-carga');if(!view)return false;
    view.dataset.almacenCargaReady='blob-staging-v001';loadCapabilities(view);return true;
  }

  window.ManttoAlmacenCarga=Object.freeze({init:init});
})();
