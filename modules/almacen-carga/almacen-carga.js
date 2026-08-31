(function(){
  'use strict';

  if(window.ManttoAlmacenCarga) return;

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
  function selectedLot(){try{return String(window.sessionStorage.getItem(ALMACEN_SOURCE_KEY)||'').trim();}catch(_error){return '';}}
  function selectLot(lot){
    const value=String(lot||'').trim();
    try{if(value)window.sessionStorage.setItem(ALMACEN_SOURCE_KEY,value);else window.sessionStorage.removeItem(ALMACEN_SOURCE_KEY);}catch(_error){}
    state.selectedLot=value;
    if(window.ManttoHttp&&typeof window.ManttoHttp.invalidate==='function')window.ManttoHttp.invalidate('/api/almacen');
    document.dispatchEvent(new CustomEvent('mantto:almacen-source-changed',{detail:{loteImportacion:value,source:'almacen-carga'}}));
  }
  function syncSelectedLot(){
    const available=(state.sources||[]).map(function(row){return String(row.loteImportacion||'');});
    let selected=selectedLot();
    if(!selected||available.indexOf(selected)<0){selected=state.source&&state.source.loteImportacion?String(state.source.loteImportacion):'';if(selected)selectLot(selected);}
    state.selectedLot=selected;
  }
  function historyHtml(){
    const rows=state.sources||[];
    if(!rows.length)return '<section class="almload-card"><div class="almload-section-head"><div><h2>Histórico de cierres</h2><p>No hay cierres disponibles.</p></div></div></section>';
    const selected=state.selectedLot||selectedLot();
    const current=rows.find(function(row){return String(row.loteImportacion)===selected;});
    return '<section class="almload-card"><div class="almload-section-head"><div><h2>Histórico de cierres</h2><p>Selecciona qué cierre alimentará Dashboard, Inventario, Stock, Préstamos, Resguardos y Auditoría.</p></div><span class="almload-pill neutral">'+number(rows.length)+' cierres</span></div><div class="almload-current-selection"><b>Cierre consultado:</b> '+escapeHtml(current?(current.archivoOrigen||current.loteImportacion):'Activo por defecto')+' · '+escapeHtml(current&&current.fechaCorte||'—')+'</div><div class="almload-history-list">'+rows.map(function(row){const isSelected=String(row.loteImportacion)===selected;return '<div class="almload-history-row'+(isSelected?' is-selected':'')+'"><div><strong>'+escapeHtml(row.archivoOrigen||'Archivo')+'</strong><small>'+escapeHtml(row.loteImportacion||'')+'</small></div><div><strong>'+escapeHtml(row.fechaCorte||'Sin corte')+'</strong><small>'+dateText(row.fechaImportacion)+'</small></div><div><strong>'+number(row.datasets&&row.datasets.INVENTARIO?row.datasets.INVENTARIO.filas:0)+'</strong><small>inventario</small></div><button type="button" data-almload-source="'+escapeHtml(row.loteImportacion)+'"'+(isSelected?' disabled':'')+'>'+(isSelected?'Seleccionado':'Usar cierre')+'</button></div>';}).join('')+'</div></section>';
  }

  function sourceHtml(){
    if(!state.source){
      return '<section class="almload-card almload-source"><div><span class="almload-kicker">Fuente activa</span><h2>Sin lote activo</h2><p>La carga que realices aquí será la fuente operativa del módulo de Almacén una vez validada e importada.</p></div><span class="almload-pill warn">Sin carga</span></section>';
    }
    const s=state.source;
    const rows=s.filas!=null?s.filas:(s.datasets&&s.datasets.INVENTARIO?s.datasets.INVENTARIO.filas:null);
    return '<section class="almload-card almload-source"><div><span class="almload-kicker">Fuente activa</span><h2>'+escapeHtml(s.archivoOrigen||'Archivo activo')+'</h2><p>'+escapeHtml(s.hojaOrigen||'Lote de Almacén')+' · '+number(rows)+' filas · Corte '+escapeHtml(s.fechaCorte||'—')+'</p><small>Lote: '+escapeHtml(s.loteImportacion||'—')+' · Importado: '+dateText(s.fechaImportacion)+'</small></div><span class="almload-pill ok">Activo</span></section>';
  }
  function messageHtml(text,tone){
    return '<div class="almload-message '+escapeHtml(tone||'')+'" id="almload-message">'+escapeHtml(text||'Selecciona un archivo y valida antes de importar.')+'</div>';
  }
  function validationSummary(data){
    const parts=[];
    if(data&&data.profile)parts.push('Perfil '+String(data.profile));
    if(data&&data.rows!=null)parts.push(number(data.rows)+' filas normalizadas');
    if(Array.isArray(data&&data.datasets)&&data.datasets.length){
      const sets=data.datasets.map(function(ds){
        return String(ds.type||'CONJUNTO')+' '+String(ds.sheetName||'')+': '+number(ds.rows||0);
      });
      parts.push('Conjuntos: '+sets.join(' · '));
    }
    if(data&&data.hash)parts.push('Hash '+String(data.hash).slice(0,12));
    const mapping=data&&data.mapping&&typeof data.mapping==='object'?data.mapping:null;
    if(mapping){
      const mapped=Object.keys(mapping).map(function(key){
        const val=mapping[key];
        return key+' ← '+(val&&val.header?val.header:String(val||''));
      }).filter(Boolean);
      if(mapped.length)parts.push(mapped.join(' · '));
    }
    if(Array.isArray(data&&data.warnings)&&data.warnings.length)parts.push('Advertencias: '+data.warnings.join(' '));
    return parts.join(' · ')||'Validación correcta.';
  }
  function render(view,message,tone){
    view.innerHTML='<div class="almload-shell">'+
      '<section class="almload-card almload-head"><div><span class="almload-eyebrow">⬆️ Gestión de Almacén</span><h1>Carga de Información</h1><p>Fuente temporal mientras la información no exista de forma nativa en Aiven. Cada importación se conserva como cierre histórico.</p></div><span class="almload-pill restricted">Acceso restringido</span></section>'+
      sourceHtml()+historyHtml()+
      '<section class="almload-card"><div class="almload-section-head"><div><h2>Nueva carga</h2><p>La importación crea un nuevo cierre; los anteriores se conservan y pueden volver a seleccionarse sin subir el archivo otra vez.</p></div><span class="almload-pill neutral">.xlsx / .csv · 25 MB</span></div>'+
      '<div class="almload-grid"><label><span>Archivo</span><input id="almload-file" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"><small id="almload-file-name">'+escapeHtml(state.file?state.file.name:'Ningún archivo seleccionado')+'</small></label><label><span>Fecha de corte</span><input id="almload-cutoff" type="date" value="'+escapeHtml(state.cutoff)+'"></label></div>'+
      '<div class="almload-actions"><button type="button" class="almload-btn" id="almload-validate">Validar</button><button type="button" class="almload-btn primary" id="almload-import" '+(state.validation?'':'disabled')+'>Importar y activar</button></div>'+messageHtml(message,tone)+'</section>'+
      '<section class="almload-card almload-rules"><h2>Controles de seguridad</h2><div><span>1</span><p><b>Histórico inmutable.</b> Seleccionar un cierre no modifica sus filas ni reactiva físicamente el lote.</p></div><div><span>2</span><p><b>Validación obligatoria.</b> La estructura debe validarse antes de importar.</p></div><div><span>3</span><p><b>Fuente temporal.</b> Cuando Aiven contenga la información nativa, esta carga podrá retirarse sin reconstruir las pantallas consumidoras.</p></div></section></div>';
    bind(view);
  }

  function setMessage(view,text,tone){
    const node=view.querySelector('#almload-message');if(!node)return;
    node.className='almload-message '+String(tone||'');node.textContent=text||'';
  }
  function syncControls(view){
    const validateBtn=view.querySelector('#almload-validate');
    const importBtn=view.querySelector('#almload-import');
    if(validateBtn)validateBtn.disabled=state.busy;
    if(importBtn)importBtn.disabled=state.busy||!state.validation;
    const fileName=view.querySelector('#almload-file-name');if(fileName)fileName.textContent=state.file?state.file.name:'Ningún archivo seleccionado';
  }
  function fileKey(file){return file?[file.name,file.size,file.lastModified].join('|'):'';}
  function buildForm(){
    if(!state.file)return null;
    const form=new FormData();form.append('archivo',state.file);
    if(state.cutoff)form.append('fechaCorte',state.cutoff);
    return form;
  }
  async function loadCapabilities(view){
    view.innerHTML='<div class="almload-shell"><section class="almload-card almload-head"><div><span class="almload-eyebrow">⬆️ Gestión de Almacén</span><h1>Carga de Información</h1><p>Validando permiso, fuente activa e histórico...</p></div></section></div>';
    try{
      const responses=await Promise.all([
        authApi('/api/almacen/carga/capabilities',{method:'GET'}),
        authApi('/api/almacen/fuentes',{method:'GET'})
      ]);
      const data=responses[0];state.source=data.source||null;state.sources=responses[1].sources||[];syncSelectedLot();state.validation=null;state.file=null;state.cutoff='';render(view,'Selecciona un archivo y valida antes de importar.','');
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
  async function runImport(view){
    if(!state.file||!state.validation||state.validation.fileKey!==fileKey(state.file)){state.validation=null;syncControls(view);setMessage(view,'El archivo debe validarse nuevamente antes de importar.','error');return;}
    if(!window.confirm('Se importará este archivo como nuevo cierre activo de Almacén. Los cierres anteriores se conservarán. ¿Continuar?'))return;
    const form=buildForm();state.busy=true;syncControls(view);setMessage(view,'Importando en Aiven. No cierres esta vista...','working');
    try{
      const data=await authApi('/api/almacen/carga/importar',{method:'POST',body:form});
      state.validation=null;state.file=null;
      if(window.ManttoHttp&&typeof window.ManttoHttp.invalidate==='function')window.ManttoHttp.invalidate('/api/almacen');
      document.dispatchEvent(new CustomEvent('mantto:data-mutated',{detail:{path:'/api/almacen/carga/importar',method:'POST',source:'almacen-carga'}}));
      const responses=await Promise.all([authApi('/api/almacen/carga/capabilities',{method:'GET'}),authApi('/api/almacen/fuentes',{method:'GET'})]);
      state.source=responses[0].source||null;state.sources=responses[1].sources||[];
      selectLot(data.loteImportacion||state.source&&state.source.loteImportacion||'');syncSelectedLot();
      render(view,'Importación completada. El nuevo cierre quedó seleccionado para Gestión de Almacén · '+number(data.filas)+' filas.','ok');
    }catch(error){setMessage(view,error.message||'No se pudo completar la importación.','error');}
    finally{state.busy=false;syncControls(view);}
  }
  function bind(view){
    const file=view.querySelector('#almload-file');
    const cutoff=view.querySelector('#almload-cutoff');
    const validateBtn=view.querySelector('#almload-validate');
    const importBtn=view.querySelector('#almload-import');
    if(file)file.addEventListener('change',function(){state.file=file.files&&file.files[0]?file.files[0]:null;state.validation=null;syncControls(view);setMessage(view,state.file?'Archivo seleccionado. Valídalo antes de importar.':'Selecciona un archivo .xlsx o .csv.','');});
    if(cutoff)cutoff.addEventListener('change',function(){state.cutoff=cutoff.value||'';state.validation=null;syncControls(view);setMessage(view,'Fecha de corte modificada. Vuelve a validar antes de importar.','');});
    if(validateBtn)validateBtn.addEventListener('click',function(){if(!state.busy)validate(view);});
    if(importBtn)importBtn.addEventListener('click',function(){if(!state.busy)runImport(view);});
    view.querySelectorAll('[data-almload-source]').forEach(function(button){button.addEventListener('click',function(){selectLot(button.dataset.almloadSource||'');syncSelectedLot();render(view,'Cierre seleccionado. Las vistas de Gestión de Almacén consultarán este histórico.','ok');});});
    syncControls(view);
  }

  function init(route){
    if(route!=='almacen-carga')return false;
    const view=document.getElementById('view-almacen-carga');if(!view)return false;
    view.dataset.almacenCargaReady='1-v001';loadCapabilities(view);return true;
  }

  window.ManttoAlmacenCarga=Object.freeze({init:init});
})();
