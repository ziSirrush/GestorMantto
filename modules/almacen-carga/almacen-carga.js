(function(){
  'use strict';

  if(window.ManttoAlmacenCarga) return;

  const state={source:null,validation:null,busy:false,file:null,cutoff:''};

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
    const d=new Date(value);
    if(Number.isNaN(d.getTime())) return escapeHtml(String(value));
    return new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(d);
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
    if(data&&data.rows!=null)parts.push(number(data.rows)+' filas');
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
      '<section class="almload-card almload-head"><div><span class="almload-eyebrow">⬆️ Gestión de Almacén</span><h1>Carga de Información</h1><p>Módulo independiente para validar e importar la fuente Excel/CSV hacia Aiven. Su acceso depende exclusivamente del permiso de este módulo.</p></div><span class="almload-pill restricted">Acceso restringido</span></section>'+
      sourceHtml()+
      '<section class="almload-card"><div class="almload-section-head"><div><h2>Nueva carga</h2><p>El archivo anterior no se sustituye como lote activo hasta completar correctamente la importación.</p></div><span class="almload-pill neutral">.xlsx / .csv · 25 MB</span></div>'+
      '<div class="almload-grid"><label><span>Archivo</span><input id="almload-file" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"><small id="almload-file-name">'+escapeHtml(state.file?state.file.name:'Ningún archivo seleccionado')+'</small></label><label><span>Fecha de corte</span><input id="almload-cutoff" type="date" value="'+escapeHtml(state.cutoff)+'"></label></div>'+
      '<div class="almload-actions"><button type="button" class="almload-btn" id="almload-validate">Validar</button><button type="button" class="almload-btn primary" id="almload-import" '+(state.validation?'':'disabled')+'>Importar y activar</button></div>'+
      messageHtml(message,tone)+'</section>'+
      '<section class="almload-card almload-rules"><h2>Controles de seguridad</h2><div><span>1</span><p><b>Permiso independiente.</b> Ver Inventario no concede capacidad de carga.</p></div><div><span>2</span><p><b>Validación obligatoria.</b> El botón de importación solo se habilita después de validar el archivo actual.</p></div><div><span>3</span><p><b>Lote transaccional.</b> La fuente anterior permanece disponible hasta que la nueva importación finaliza.</p></div></section>'+
      '</div>';
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
    view.innerHTML='<div class="almload-shell"><section class="almload-card almload-head"><div><span class="almload-eyebrow">⬆️ Gestión de Almacén</span><h1>Carga de Información</h1><p>Validando permiso y fuente activa...</p></div></section></div>';
    try{
      const data=await authApi('/api/almacen/carga/capabilities',{method:'GET'});
      state.source=data.source||null;state.validation=null;state.file=null;state.cutoff='';render(view,'Selecciona un archivo y valida antes de importar.','');
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
    if(!window.confirm('Se importará este archivo como nuevo lote activo de Almacén. El lote anterior se conservará desactivado. ¿Continuar?'))return;
    const form=buildForm();state.busy=true;syncControls(view);setMessage(view,'Importando en Aiven. No cierres esta vista...','working');
    try{
      const data=await authApi('/api/almacen/carga/importar',{method:'POST',body:form});
      state.validation=null;state.file=null;
      if(window.ManttoHttp&&typeof window.ManttoHttp.invalidate==='function')window.ManttoHttp.invalidate('/api/almacen');
      document.dispatchEvent(new CustomEvent('mantto:data-mutated',{detail:{path:'/api/almacen/carga/importar',method:'POST',source:'almacen-carga'}}));
      const caps=await authApi('/api/almacen/carga/capabilities',{method:'GET'});
      state.source=caps.source||null;
      render(view,'Importación completada. Lote activo: '+(data.loteImportacion||state.source&&state.source.loteImportacion||'confirmado')+' · '+number(data.filas)+' filas.','ok');
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
    syncControls(view);
  }
  function init(route){
    if(route!=='almacen-carga')return false;
    const view=document.getElementById('view-almacen-carga');if(!view)return false;
    view.dataset.almacenCargaReady='1-v001';loadCapabilities(view);return true;
  }

  window.ManttoAlmacenCarga=Object.freeze({init:init});
})();
