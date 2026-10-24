(function (win, doc) {
  'use strict';
  // [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_EXCEL_FASE_1_V001]
  // Selector de tablas existente; limpieza de etiquetas historicas sin cambiar guards,
  // consultas, rutas ni editores. El backend es autoridad de permisos y alcance.
  const ROOT_ID = 'view-cobranza-uni-administracion';
  const ROUTE = 'cobranza-uni-administracion';
  const ENDPOINT = '/api/cobranza-uni/administracion';
  const TABLES = Object.freeze({
    gestion_credito: Object.freeze({ label:'Gestión de Crédito', icon:'🛡️', description:'Administración de cartera y crédito.' }),
    pc: Object.freeze({ label:'Venta Adicional', icon:'➕', description:'Venta Adicional con vista previa de fórmulas y acumulados.' }),
    detalle_mp_2026: Object.freeze({ label:'Mantenimiento Preventivo', icon:'🛠️', description:'Consulta de mantenimiento preventivo y facturación Zona 1.' })
  });

  let generation=0;
  let rights=[];
  let selectedTable=null;
  let initialized=false;
  let editor=null;
  function stopEditor(){if(editor && typeof editor.destroy==='function')editor.destroy();editor=null;}
  const escapeHtml = value => String(value == null ? '' : value)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const root=()=>doc.getElementById(ROOT_ID);
  const context=()=>{
    const auth=win.ManttoAuth;
    const who=user=>String((user&&(user.id_SB||user.id||user.correo))||'anon');
    return [who(auth?.getActorUser?.()),who(auth?.getUser?.()),who(auth?.getViewUser?.())].join(':');
  };
  function clear(){generation++;stopEditor();rights=[];selectedTable=null;const view=root();if(view)view.replaceChildren();}
  function isCurrent(epoch,key){return epoch===generation&&key===context();}

  function shell(content){
    const view=root(); if(!view)return false;
    view.classList.add('cua-uni-view');
    view.innerHTML='<div class="cua-uni-page" data-cua-uni-root>'+
      '<section class="cua-uni-card cua-uni-head">'+
      '<p class="cua-uni-eyebrow">Cobranza UNITED · Administración</p>'+
      '<h1>Administración de Cobranza UNI</h1>'+
      '<p>Selecciona la tabla que deseas administrar. Los permisos de visualización y edición son independientes.</p>'+
      '</section>'+content+'</div>';
    return true;
  }
  function notice(message,kind){return '<section class="cua-uni-card cua-uni-notice cua-uni-'+escapeHtml(kind||'info')+'" role="status">'+escapeHtml(message)+'</section>';}
  function renderMain(){
    stopEditor();
    selectedTable=null;
    const available=rights.filter(t=>t.can_view===true && Object.prototype.hasOwnProperty.call(TABLES,t.table));
    if(!available.length){return shell(notice('No tienes acceso a ninguna tabla administrativa. Solicita permisos en Panel de Control.','denied'));}
    const cards=available.map(t=>{
      const meta=TABLES[t.table];
      const edit=Boolean(t.can_edit);
      return '<button class="cua-uni-card cua-uni-option" type="button" data-cua-table="'+escapeHtml(t.table)+'">'+
        '<span class="cua-uni-icon" aria-hidden="true">'+meta.icon+'</span>'+
        '<span class="cua-uni-option-text"><strong>'+escapeHtml(t.label||meta.label)+'</strong><small>'+escapeHtml(meta.description)+'</small></span>'+
        '<span class="cua-uni-access">'+(edit?'Permiso EDITAR':'Solo consulta')+'</span>'+
        '<span class="cua-uni-chevron" aria-hidden="true">→</span></button>';
    }).join('');
    shell('<section class="cua-uni-options" aria-label="Tablas administrativas">'+cards+'</section>');
  }
  async function openTable(table){
    if(!Object.prototype.hasOwnProperty.call(TABLES,table))return false;
    if(!rights.some(x=>x.table===table&&x.can_view===true))return false;
    const epoch=++generation,key=context(),meta=TABLES[table];
    stopEditor();
    selectedTable=table;
    shell('<section class="cua-uni-card cua-uni-detail">'+
      '<button class="cua-uni-back" type="button" data-cua-back>← Volver al Main</button>'+
      '<h2>'+escapeHtml(meta.label)+'</h2>'+notice('Verificando acceso a la tabla…','info')+'</section>');
    try{
      const response=await win.ManttoAuth.apiGet(ENDPOINT+'/tablas/'+encodeURIComponent(table)+'/acceso');
      if(!isCurrent(epoch,key)||selectedTable!==table)return false;
      if(response?.ok!==true||response?.can_view!==true||response?.table!==table)throw new Error('Acceso no autorizado.');
      const mode=response.can_edit===true
        ? 'Edición de campos autorizados según permisos y validaciones de esta tabla'
        : 'Acceso únicamente de consulta';
      if(table==='gestion_credito'){
        const loader=win.ManttoModuleLoader;
        if(!loader || typeof loader.loadScript!=='function' || typeof loader.loadStyle!=='function')
          throw new Error('Cargador oficial de módulos no disponible.');
        await loader.loadStyle('./modules/cobranza-uni/administracion/gestion-credito/gestion-credito.css?v=20261023-gc-wide-v002');
        await loader.loadScript('./modules/cobranza-uni/administracion/gestion-credito/gestion-credito.js?v=20261023-f6-v001');
        if(!isCurrent(epoch,key)||selectedTable!==table)return false;
        shell('<section class="cua-uni-card cua-uni-detail">'+
          '<button class="cua-uni-back" type="button" data-cua-back>← Volver al Main</button>'+
          '<h2>'+escapeHtml(meta.label)+' · gestion_credito</h2>'+
          '<p class="cua-uni-mode">'+escapeHtml(mode)+'</p>'+
          '<div id="cua-uni-gc-editor" class="cua-uni-gc-editor"></div>'+
          '</section>');
        const mount=win.ManttoCobranzaAdministracionGC_uni?.mount;
        const container=doc.getElementById('cua-uni-gc-editor');
        if(typeof mount!=='function'||!container)throw new Error('El editor GC no se ha cargado.');
        editor=mount(container,{canEdit:response.can_edit===true,
          isCurrent:()=>isCurrent(epoch,key)&&selectedTable===table&&
          win.ManttoRouter?.getCurrent?.()?.route===ROUTE});
        if(!editor)throw new Error('El editor GC no se pudo inicializar.');
        return true;
      }
      if(table==='pc'){
        const loader=win.ManttoModuleLoader;
        if(!loader || typeof loader.loadScript!=='function' || typeof loader.loadStyle!=='function')
          throw new Error('Cargador oficial de módulos no disponible.');
        await loader.loadStyle('./modules/cobranza-uni/administracion/venta-adicional/venta-adicional.css?v=20261023-va-f6-v001-excel-f2-v001');
        await loader.loadScript('./modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js?v=20261023-va-excel-f6-v001');
        if(!isCurrent(epoch,key)||selectedTable!==table)return false;
        shell('<section class="cua-uni-card cua-uni-detail">'+
          '<button class="cua-uni-back" type="button" data-cua-back>← Volver al Main</button>'+
          '<h2>'+escapeHtml(meta.label)+' · pc</h2>'+
          '<p class="cua-uni-mode">'+escapeHtml(mode)+'</p>'+
          '<div id="cua-uni-pc-list" class="cua-uni-pc-list"></div>'+ 
          '</section>');
        const mount=win.ManttoCobranzaAdministracionPC_uni?.mount;
        const container=doc.getElementById('cua-uni-pc-list');
        if(typeof mount!=='function'||!container)throw new Error('La pantalla pc no se ha cargado.');
        editor=mount(container,{
          canEdit:response.can_edit===true,
          canPrepareCreate:response.can_prepare_create===true,
          canCreate:response.can_create===true,
          editableFields:Array.isArray(response.editable_fields)?response.editable_fields:[],
          isCurrent:()=>isCurrent(epoch,key)&&selectedTable===table&&
            win.ManttoRouter?.getCurrent?.()?.route===ROUTE
        });
        if(!editor)throw new Error('No se pudo inicializar la consulta pc.');
        return true;
      }
      // MP conserva validacion separada de permisos y acceso a Zona 1.
      if(table==='detalle_mp_2026'){
        // Solo el backend puede autorizar editar campos o escribir en Zona 1.
        const canEdit=response.can_edit===true;
        const loader=win.ManttoModuleLoader;
        if(!loader || typeof loader.loadScript!=='function' || typeof loader.loadStyle!=='function')
          throw new Error('Cargador oficial de módulos no disponible.');
        await loader.loadStyle('./modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.css?v=20261023-mp-excel-f4-v001');
        await loader.loadScript('./modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js?v=20261023-mp-excel-f6-v001');
        await loader.loadScript('./modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo-zona1.js?v=20261023-mp-zona1-excel-f6-v001');
        if(!isCurrent(epoch,key)||selectedTable!==table)return false;
        shell('<section class="cua-uni-card cua-uni-detail">'+
          '<button class="cua-uni-back" type="button" data-cua-back>← Volver al Main</button>'+
          '<h2>'+escapeHtml(meta.label)+' · detalle_mp_2026</h2>'+
          '<p class="cua-uni-mode">'+escapeHtml(mode)+'</p>'+
          '<div id="cua-uni-mp-grid" class="cua-uni-mp-grid"></div>'+
          '</section>');
        const mount=win.ManttoCobranzaAdministracionMP_uni?.mount;
        const container=doc.getElementById('cua-uni-mp-grid');
        if(typeof mount!=='function'||!container)throw new Error('La consulta MP no se ha cargado.');
        editor=mount(container,{
          canEdit, editableFields:Array.isArray(response.editable_fields)?response.editable_fields:[],
          canWriteZone1:response.can_write_zone1===true,
          zona1EditableFields:Array.isArray(response.zona1_editable_fields)?response.zona1_editable_fields:[],
          isCurrent:()=>isCurrent(epoch,key)&&selectedTable===table&&
            win.ManttoRouter?.getCurrent?.()?.route===ROUTE
        });
        if(!editor)throw new Error('No se pudo inicializar la consulta MP.');
        return true;
      }
      // Si el catalogo creciera sin un adaptador, no mostrar un modulo ficticio.
      throw new Error('Tabla sin adaptador autorizado.');
    }catch(error){
      if(!isCurrent(epoch,key))return false;
      shell('<section class="cua-uni-card cua-uni-detail">'+
        '<button class="cua-uni-back" type="button" data-cua-back>← Volver al Main</button>'+notice('No se pudo autorizar la tabla.','denied')+'</section>');
      return false;
    }
  }
  async function init(){
    const view=root();if(!view)return false;
    if(!initialized){
      initialized=true;
      view.addEventListener('click',event=>{
        const back=event.target.closest('[data-cua-back]');
        if(back){generation++;renderMain();return;}
        const button=event.target.closest('[data-cua-table]');
        if(button)openTable(button.dataset.cuaTable).catch(()=>{});
      });
    }
    const epoch=++generation,key=context();
    rights=[];selectedTable=null;
    shell(notice('Validando permisos de administración…','info'));
    const auth=win.ManttoAuth;
    if(!auth||typeof auth.apiGet!=='function'||!auth.getToken?.()){
      if(isCurrent(epoch,key))shell(notice('Inicia sesión para consultar Administración.','denied'));
      return false;
    }
    try{
      const response=await auth.apiGet(ENDPOINT+'/contrato');
      if(!isCurrent(epoch,key))return false;
      if(response?.ok!==true||!Array.isArray(response.tables))throw new Error('Contrato inválido.');
      rights=response.tables.filter(item=>item&&typeof item.table==='string');
      renderMain();return true;
    }catch(error){
      if(isCurrent(epoch,key))shell(notice('Acceso no autorizado o servicio temporalmente no disponible.','denied'));
      return false;
    }
  }
  function refreshWhenActive(){
    const active=win.ManttoRouter?.getCurrent?.()?.route===ROUTE;
    clear(); if(active)init().catch(()=>{});
  }
  doc.addEventListener('mantto:auth-ready',refreshWhenActive);
  doc.addEventListener('mantto:view-user-changed',refreshWhenActive);
  doc.addEventListener('mantto:session-expired',clear);
  doc.addEventListener('mantto:permissions-updated',refreshWhenActive);
  doc.addEventListener('mantto:navigation',event=>{
    if(event?.detail?.route!==ROUTE)clear();
  });
  win.ManttoCobranzaAdministracion_uni=Object.freeze({init,clear,openTable});
})(window,document);
