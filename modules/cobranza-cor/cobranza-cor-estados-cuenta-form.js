(function(){
  'use strict';

  // [Aster | 2026-09-24 | ASTER-MG | COBRANZA COR FONDO GARANTIA GENERAL V002]
  if(window.ManttoCobranzaCorEstadoCuentaForm) return;

  const ROUTE='cobranza-estados-cuenta';
  const API_BASE='/api/cobranza-cor/estados-cuenta';
  const API_CREATE_CATALOG=API_BASE+'/crear-nuevo/catalogo';

  const state={
    root:null,
    mode:'create',
    ppns:'',
    proyectos:[],
    proyecto:null,
    equipos:[],
    relaciones:[],
    logOps:[],
    hitos:[],
    deletedHitos:[],
    fondoGarantia:false,
    porcentajeFondoGarantia:'0',
    fondoGarantiaMixed:false,
    loading:false,
    saving:false,
    requestSequence:0,
    boundRoot:null
  };

  function currentNavigation_cor(){
    if(!window.ManttoRouter||typeof window.ManttoRouter.getCurrent!=='function') return {route:'',payload:null};
    const current=window.ManttoRouter.getCurrent()||{};
    return {route:String(current.route||''),payload:current.payload||null};
  }

  function isActive_cor(){ return currentNavigation_cor().route===ROUTE; }

  function escapeHtml_cor(value){
    return String(value===null||value===undefined?'':value)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function text_cor(value,fallback='—'){
    if(value===null||value===undefined) return fallback;
    const normalized=String(value).trim();
    return normalized||fallback;
  }

  function number_cor(value){
    if(value===null||value===undefined||value==='') return null;
    const parsed=Number(value);
    return Number.isFinite(parsed)?parsed:null;
  }

  function formatAmount_cor(value){
    const parsed=number_cor(value);
    return parsed===null?'0.00':new Intl.NumberFormat('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2}).format(parsed);
  }

  function formatMoney_cor(value,currency){
    const parsed=number_cor(value)||0;
    const code=String(currency||'').trim().toUpperCase();
    if(/^[A-Z]{3}$/.test(code)){
      try{return new Intl.NumberFormat('es-MX',{style:'currency',currency:code,minimumFractionDigits:2,maximumFractionDigits:2}).format(parsed);}catch(_error){}
    }
    return formatAmount_cor(parsed)+(code?' '+code:'');
  }

  function apiGet_cor(path){
    if(!window.ManttoHttp||typeof window.ManttoHttp.get!=='function') return Promise.reject(new Error('Cliente HTTP central no disponible.'));
    return window.ManttoHttp.get(path,{force:true,cacheTtlMs:0});
  }

  function apiRequest_cor(path,options){
    if(!window.ManttoHttp||typeof window.ManttoHttp.request!=='function') return Promise.reject(new Error('Cliente HTTP central no disponible.'));
    return window.ManttoHttp.request(path,options||{});
  }

  function isViewerReadonly_cor(){
    const auth=window.ManttoAuth;
    if(auth&&typeof auth.getViewUser==='function'){
      try{return Boolean(auth.getViewUser());}catch(_error){}
    }
    const banner=document.getElementById('user-viewer-banner');
    return Boolean(banner&&!banner.hidden);
  }

  function errorMessage_cor(error,context){
    const status=Number(error&&error.status);
    if(status===401) return 'La sesión ya no está disponible. Vuelve a iniciar sesión.';
    if(status===403) return text_cor(error&&error.message,'No tienes permiso o alcance para modificar este Estado de Cuenta.');
    if(status===404) return text_cor(error&&error.message,'El PPNS no existe o quedó fuera de tu alcance autorizado.');
    if(status===409) return text_cor(error&&error.message,'El PPNS ya cuenta con un Estado de Cuenta activo.');
    return text_cor(error&&error.message,context==='save'?'No fue posible guardar el Estado de Cuenta.':'No fue posible cargar el formulario.');
  }

  function emptyHito_cor(){
    return {
      id_fuente_cor:null,
      condicion:'',porcentaje:'',anio_proyecto:'',moneda:'MXN',
      subtotal:'',iva:'',total:'',factura:'',pago_total:'',estatus_factura:'',
      fecha_pago:'',fecha_vencimiento:'',dias_vencimiento:'',estimado_pago:'',estatus_vencimiento:'',
      fecha_programada:'',fecha_notificada:'',estatus_hito:'Pendiente'
    };
  }

  function percentDisplay_cor(value){
    const parsed=number_cor(value);
    if(parsed===null) return '';
    return String(Math.round(parsed*1000000)/10000);
  }

  function applyFondoGarantiaFromRows_cor(rows){
    const source=Array.isArray(rows)?rows:[];
    if(!source.length){
      state.fondoGarantia=false;
      state.porcentajeFondoGarantia='0';
      state.fondoGarantiaMixed=false;
      return;
    }
    const configs=source.map(row=>{
      const activo=Boolean(row&&row.fondo_garantia);
      const porcentaje=activo?(number_cor(row&&row.porcentaje_fondo_garantia)||0):0;
      return {activo,porcentaje};
    });
    const first=configs[0];
    state.fondoGarantia=first.activo;
    state.porcentajeFondoGarantia=percentDisplay_cor(first.porcentaje)||'0';
    state.fondoGarantiaMixed=configs.some(row=>
      row.activo!==first.activo || Math.abs(row.porcentaje-first.porcentaje)>0.0000005
    );
  }

  function validateFondoGarantiaGeneral_cor(){
    if(state.fondoGarantiaMixed){
      return 'Los hitos actuales tienen configuraciones distintas de Fondo de Garantía. Selecciona una configuración general para unificarlos.';
    }
    if(!state.fondoGarantia) return '';
    const porcentaje=Number(state.porcentajeFondoGarantia);
    if(!Number.isFinite(porcentaje)||porcentaje<0){
      return 'Revisa el porcentaje de Fondo de Garantía.';
    }
    if(porcentaje>10){
      return 'El Fondo de Garantía supera el tope de 10%. Requiere autorización antes de guardar.';
    }
    return '';
  }

  function syncFondoGarantiaControls_cor(){
    const checkbox=document.getElementById('ccor-ec-form-fondo-garantia');
    const input=document.getElementById('ccor-ec-form-porcentaje-fondo-garantia');
    const estado=document.getElementById('ccor-ec-form-fondo-estado');
    const warning=document.getElementById('ccor-ec-form-fondo-warning');
    if(checkbox){
      checkbox.checked=Boolean(state.fondoGarantia);
      checkbox.indeterminate=Boolean(state.fondoGarantiaMixed);
      checkbox.setAttribute('aria-checked',state.fondoGarantiaMixed?'mixed':(state.fondoGarantia?'true':'false'));
    }
    if(input){
      input.disabled=!state.fondoGarantia||state.fondoGarantiaMixed;
      input.value=state.fondoGarantia?String(state.porcentajeFondoGarantia||'0'):'0';
      const error=validateFondoGarantiaGeneral_cor();
      input.setAttribute('aria-invalid',error&&state.fondoGarantia?'true':'false');
    }
    if(estado) estado.textContent=state.fondoGarantiaMixed?'Definir':(state.fondoGarantia?'Activado':'Desactivado');
    if(warning){
      warning.hidden=!state.fondoGarantiaMixed;
      warning.textContent=state.fondoGarantiaMixed
        ? 'Los hitos existentes tienen valores distintos. Define aquí una sola configuración; al guardar se aplicará por igual a todos los hitos activos.'
        : '';
    }
  }

  function normalizeHitoFromApi_cor(row){
    return {
      id_fuente_cor:Number(row&&row.id_fuente_cor)||null,
      condicion:String(row&&row.condicion||''),
      porcentaje:percentDisplay_cor(row&&row.porcentaje),
      anio_proyecto:row&&row.anio_proyecto!==null&&row.anio_proyecto!==undefined?String(row.anio_proyecto):'',
      moneda:String(row&&row.moneda||'').toUpperCase(),
      subtotal:row&&row.subtotal!==null&&row.subtotal!==undefined?String(row.subtotal):'',
      iva:row&&row.iva!==null&&row.iva!==undefined?String(row.iva):'',
      total:row&&row.total!==null&&row.total!==undefined?String(row.total):'',
      factura:String(row&&row.factura||''),
      pago_total:row&&row.pago_total!==null&&row.pago_total!==undefined?String(row.pago_total):'',
      estatus_factura:String(row&&row.estatus_factura||''),
      fecha_pago:String(row&&row.fecha_pago||''),
      fecha_vencimiento:String(row&&row.fecha_vencimiento||''),
      dias_vencimiento:row&&row.dias_vencimiento!==null&&row.dias_vencimiento!==undefined?String(row.dias_vencimiento):'',
      estimado_pago:String(row&&row.estimado_pago||''),
      estatus_vencimiento:String(row&&row.estatus_vencimiento||''),
      fecha_programada:String(row&&row.fecha_programada||''),
      fecha_notificada:String(row&&row.fecha_notificada||''),
      estatus_hito:String(row&&row.estatus_hito||'Pendiente')
    };
  }

  function resetState_cor(mode,ppns){
    state.mode=mode==='edit'?'edit':'create';
    state.ppns=String(ppns||'').trim();
    state.proyectos=[];
    state.proyecto=null;
    state.equipos=[];
    state.relaciones=[];
    state.logOps=[];
    state.hitos=state.mode==='create'?[emptyHito_cor()]:[];
    state.deletedHitos=[];
    state.fondoGarantia=false;
    state.porcentajeFondoGarantia='0';
    state.fondoGarantiaMixed=false;
  }

  function setContext_cor(){
    const editing=state.mode==='edit';
    const title=document.getElementById('app-context-title');
    const subtitle=document.getElementById('app-context-subtitle');
    if(title) title.textContent=editing?'Editar Estado de Cuenta':'Crear Estado de Cuenta';
    if(subtitle) subtitle.textContent=editing
      ? 'Cobranza Corellian · Editar '+text_cor(state.ppns,'PPNS')
      : 'Cobranza Corellian · Nuevo Estado de Cuenta por PPNS';
  }

  function projectOptions_cor(){
    return ['<option value="">Selecciona PPNS...</option>']
      .concat(state.proyectos.map(row=>{
        const label=[text_cor(row.ppns,''),text_cor(row.proyecto,'')].filter(Boolean).join(' · ');
        return `<option value="${escapeHtml_cor(row.ppns||'')}">${escapeHtml_cor(label)}</option>`;
      })).join('');
  }

  function relationByInsFl_cor(){
    const map=new Map();
    state.relaciones.forEach(row=>{
      const id=Number(row&&row.id_ins_fl);
      if(Number.isInteger(id)&&id>0&&!map.has(id)) map.set(id,row);
    });
    return map;
  }

  function mergeEquipos_cor(baseRows){
    const relationMap=relationByInsFl_cor();
    return (Array.isArray(baseRows)?baseRows:[]).map((row,index)=>{
      const relation=relationMap.get(Number(row.id_ins_fl))||null;
      return {
        ...row,
        id_equipo_cor:relation?Number(relation.id_equipo_cor)||null:null,
        incluir:state.mode==='create'?true:Boolean(relation&&Number(relation.activo)!==0),
        id_log_ops:relation&&relation.id_log_ops?Number(relation.id_log_ops):null,
        ubicacion_torre:relation&&relation.ubicacion_torre?String(relation.ubicacion_torre):'',
        orden:relation&&relation.orden?Number(relation.orden):index+1
      };
    });
  }

  function renderShell_cor(){
    if(!state.root) return;
    const editing=state.mode==='edit';
    const project=state.proyecto||{};
    const ppnsValue=editing?state.ppns:String(project.ppns||state.ppns||'');
    const readonlyProject=editing?'':' readonly';
    const readonlyClient=editing?'':' readonly';

    state.root.innerHTML=`
      <div class="ccor-ec-page ccor-ec-form-page">
        <section class="ccor-ec-card ccor-ec-form-hero">
          <div>
            <p class="ccor-ec-eyebrow">Cobranza · Corellian</p>
            <h1>${editing?'Editar':'Crear'} Estado de Cuenta</h1>
            <p>${editing?'Se cargó la información actual del PPNS. Los cambios se guardan sobre FUENTE y la relación de equipos de Cobranza COR.':'Alta manual por PPNS. Los hitos se guardan en FUENTE y los equipos quedan relacionados con Instalaciones y Logística.'}</p>
          </div>
          <div class="ccor-ec-form-actions">
            <button type="button" class="ccor-ec-btn ccor-ec-form-cancel" data-ccor-form-cancel>Cancelar</button>
            <button type="button" class="ccor-ec-btn ccor-ec-btn-primary" id="ccor-ec-form-save">${editing?'Guardar cambios':'Crear Estado de Cuenta'}</button>
          </div>
        </section>

        <div id="ccor-ec-form-status" class="ccor-ec-form-status" aria-live="polite"></div>

        <section class="ccor-ec-form-top-grid">
          <article class="ccor-ec-card ccor-ec-form-general-card">
            <div class="ccor-ec-form-section-title"><b>General</b><span>Datos del Estado de Cuenta</span></div>
            <div class="ccor-ec-form-fields">
              ${editing
                ? `<label><span>PPNS</span><input id="ccor-ec-form-ppns" value="${escapeHtml_cor(ppnsValue)}" readonly></label>`
                : `<label><span>PPNS *</span><select id="ccor-ec-form-ppns">${projectOptions_cor()}</select></label>`}
              <label><span>Proyecto *</span><input id="ccor-ec-form-proyecto" maxlength="255" value="${escapeHtml_cor(project.proyecto||'')}"${readonlyProject}></label>
              <label><span>Cliente</span><input id="ccor-ec-form-cliente" maxlength="500" value="${escapeHtml_cor(project.cliente||'')}"${readonlyClient}></label>
              <label><span>Contractual</span><input id="ccor-ec-form-contractual" maxlength="150" value="${escapeHtml_cor(project.contractual||'')}" placeholder="Estatus contractual"></label>
              <label class="ccor-ec-form-fondo-general"><span>Fondo de Garantía</span><span class="ccor-ec-form-fondo-general-control"><input id="ccor-ec-form-fondo-garantia" type="checkbox"${state.fondoGarantia?' checked':''}><b id="ccor-ec-form-fondo-estado">${state.fondoGarantia?'Activado':'Desactivado'}</b></span></label>
              <label class="ccor-ec-form-fondo-porcentaje"><span>% Fondo de Garantía</span><input id="ccor-ec-form-porcentaje-fondo-garantia" type="number" min="0" max="10" step="0.01" value="${escapeHtml_cor(state.fondoGarantia?state.porcentajeFondoGarantia:'0')}"${state.fondoGarantia?'':' disabled'}><small>Aplica por igual a todos los hitos activos.</small></label>
              <label><span>Equipos relacionados</span><input id="ccor-ec-form-equipos-total" value="${escapeHtml_cor(state.equipos.filter(row=>row.incluir!==false).length)}" readonly></label>
              <label><span>Hitos activos</span><input id="ccor-ec-form-hitos-total" value="${escapeHtml_cor(state.hitos.length)}" readonly></label>
            </div>
            <div id="ccor-ec-form-fondo-warning" class="ccor-ec-form-fondo-warning" hidden></div>
            <div class="ccor-ec-form-people">
              <span>Supervisor <b>${escapeHtml_cor(text_cor(project.supervisor))}</b></span>
              <span>Asesor <b>${escapeHtml_cor(text_cor(project.asesor))}</b></span>
              <span>Administrativo <b>${escapeHtml_cor(text_cor(project.administrativo))}</b></span>
            </div>
          </article>

          <aside class="ccor-ec-form-kpis">
            <article class="ccor-ec-card ccor-ec-form-kpi is-mxn">
              <span>Total MXN</span><b id="ccor-ec-form-total-mxn">$0.00 MXN</b>
            </article>
            <article class="ccor-ec-card ccor-ec-form-kpi is-foreign">
              <span>Total Moneda Extranjera</span><div id="ccor-ec-form-total-foreign"><b>Sin hitos</b></div>
            </article>
          </aside>
        </section>

        <section class="ccor-ec-card ccor-ec-form-section">
          <div class="ccor-ec-form-section-title">
            <div><b>Equipos del proyecto</b><span>Relación Cobranza COR ↔ ins_fl / log_ops</span></div>
            <small>${editing?'Activa o desactiva relaciones sin borrar historial.':'Selecciona los equipos que formarán parte del Estado de Cuenta.'}</small>
          </div>
          <div class="ccor-ec-table-wrap">
            <table class="ccor-ec-table ccor-ec-form-equipment-table">
              <thead><tr><th>Incluir</th><th>Equipo / Referencia</th><th>Capacidad</th><th>Desembarques</th><th>Estatus</th><th>Logística</th><th>Ubicación / Torre</th></tr></thead>
              <tbody id="ccor-ec-form-equipment-body"></tbody>
            </table>
          </div>
        </section>

        <section class="ccor-ec-card ccor-ec-form-section">
          <div class="ccor-ec-form-section-title">
            <div><b>Hitos de cobranza</b><span>Edición completa de la información almacenada en FUENTE.</span></div>
            <button type="button" class="ccor-ec-btn ccor-ec-btn-primary" id="ccor-ec-form-add-hito">+ Agregar hito</button>
          </div>
          <div class="ccor-ec-table-wrap">
            <table class="ccor-ec-table ccor-ec-form-hitos-table">
              <thead><tr>
                <th>#</th><th>Hito</th><th>%</th><th>Año</th><th>Moneda</th><th>Subtotal</th><th>IVA</th><th>Total</th>
                <th>Factura</th><th>Pago total</th><th>Estatus factura</th><th>Fecha pago</th><th>Fecha venc.</th><th>Días venc.</th>
                <th>Estimado pago</th><th>Estatus venc.</th><th>Fecha programada</th><th>Fecha notificada</th><th>Estatus hito</th><th>Acciones</th>
              </tr></thead>
              <tbody id="ccor-ec-form-hitos-body"></tbody>
            </table>
          </div>
        </section>
      </div>`;

    const ppnsSelect=document.getElementById('ccor-ec-form-ppns');
    if(!editing&&ppnsSelect&&ppnsValue) ppnsSelect.value=ppnsValue;
    renderEquipos_cor();
    renderHitos_cor();
    renderTotals_cor();
    syncFondoGarantiaControls_cor();
    setContext_cor();
  }

  function logOpsOptions_cor(selectedId){
    const options=['<option value="">Sin relación logística</option>'];
    let found=false;
    state.logOps.forEach(row=>{
      const selected=Number(selectedId)===Number(row.id_log_ops);
      if(selected) found=true;
      const label=[row.ph_ns,row.no_control,row.marca,row.estatus].map(v=>String(v||'').trim()).filter(Boolean).join(' · ');
      options.push(`<option value="${escapeHtml_cor(row.id_log_ops)}"${selected?' selected':''}>${escapeHtml_cor(label||('Log '+row.id_log_ops))}</option>`);
    });
    if(selectedId&&!found) options.push(`<option value="${escapeHtml_cor(selectedId)}" selected>Relación logística #${escapeHtml_cor(selectedId)}</option>`);
    return options.join('');
  }

  function renderEquipos_cor(){
    const body=document.getElementById('ccor-ec-form-equipment-body');
    if(!body) return;
    if(!state.equipos.length){
      body.innerHTML='<tr><td colspan="7" class="ccor-ec-table-empty">No hay equipos activos de ins_fl para este PPNS.</td></tr>';
      return;
    }
    body.innerHTML=state.equipos.map((row,index)=>`
      <tr data-equipo-index="${index}">
        <td><input type="checkbox" data-equipo-include ${row.incluir===false?'':'checked'}></td>
        <td><b>${escapeHtml_cor(text_cor(row.referencia_sitio))}</b>${row.id_equipo_cor?`<small class="ccor-ec-form-id">Relación #${escapeHtml_cor(row.id_equipo_cor)}</small>`:''}</td>
        <td>${escapeHtml_cor(text_cor(row.capacidad_kg))}</td>
        <td>${escapeHtml_cor(text_cor(row.numero_desembarques))}</td>
        <td>${escapeHtml_cor(text_cor(row.estatus_equipo_entrega||row.estatus))}</td>
        <td><select data-equipo-logops>${logOpsOptions_cor(row.id_log_ops)}</select></td>
        <td><input type="text" maxlength="255" data-equipo-ubicacion value="${escapeHtml_cor(row.ubicacion_torre||'')}" placeholder="Ubicación / Torre"></td>
      </tr>`).join('');
  }

  function hitoInput_cor(type,field,value,extra){
    return `<input type="${type}" data-hito-field="${field}" value="${escapeHtml_cor(value===null||value===undefined?'':value)}" ${extra||''}>`;
  }

  function renderHitos_cor(){
    const body=document.getElementById('ccor-ec-form-hitos-body');
    if(!body) return;
    if(!state.hitos.length){
      body.innerHTML='<tr><td colspan="20" class="ccor-ec-table-empty">Agrega al menos un hito de cobranza.</td></tr>';
      return;
    }
    body.innerHTML=state.hitos.map((row,index)=>`
      <tr data-hito-index="${index}">
        <td class="ccor-ec-form-order">${index+1}${row.id_fuente_cor?`<small class="ccor-ec-form-id">#${escapeHtml_cor(row.id_fuente_cor)}</small>`:''}</td>
        <td>${hitoInput_cor('text','condicion',row.condicion,'maxlength="500" placeholder="Condición / Hito"')}</td>
        <td>${hitoInput_cor('number','porcentaje',row.porcentaje,'min="0" max="100" step="0.01"')}</td>
        <td>${hitoInput_cor('number','anio_proyecto',row.anio_proyecto,'min="1900" max="2500" step="1"')}</td>
        <td>${hitoInput_cor('text','moneda',row.moneda,'maxlength="10" placeholder="MXN"')}</td>
        <td>${hitoInput_cor('number','subtotal',row.subtotal,'step="0.01"')}</td>
        <td>${hitoInput_cor('number','iva',row.iva,'step="0.01"')}</td>
        <td>${hitoInput_cor('number','total',row.total,'step="0.01"')}</td>
        <td>${hitoInput_cor('text','factura',row.factura,'maxlength="150"')}</td>
        <td>${hitoInput_cor('number','pago_total',row.pago_total,'step="0.01"')}</td>
        <td>${hitoInput_cor('text','estatus_factura',row.estatus_factura,'maxlength="100"')}</td>
        <td>${hitoInput_cor('date','fecha_pago',row.fecha_pago,'')}</td>
        <td>${hitoInput_cor('date','fecha_vencimiento',row.fecha_vencimiento,'')}</td>
        <td>${hitoInput_cor('number','dias_vencimiento',row.dias_vencimiento,'step="1"')}</td>
        <td>${hitoInput_cor('text','estimado_pago',row.estimado_pago,'maxlength="100"')}</td>
        <td>${hitoInput_cor('text','estatus_vencimiento',row.estatus_vencimiento,'maxlength="100"')}</td>
        <td>${hitoInput_cor('date','fecha_programada',row.fecha_programada,'')}</td>
        <td>${hitoInput_cor('date','fecha_notificada',row.fecha_notificada,'')}</td>
        <td><select data-hito-field="estatus_hito">
          <option value=""${row.estatus_hito?'':' selected'}>Sin estatus</option>
          ${['Pendiente','Programado','Notificado','Cerrado'].map(status=>`<option value="${status}"${String(row.estatus_hito||'')===status?' selected':''}>${status}</option>`).join('')}
        </select></td>
        <td><button type="button" class="ccor-ec-form-remove" data-hito-remove title="Quitar hito">×</button></td>
      </tr>`).join('');
  }

  function syncTotalFromAmounts_cor(index){
    const row=state.hitos[index];
    if(!row) return;
    const hasSubtotal=String(row.subtotal??'').trim()!=='';
    const hasIva=String(row.iva??'').trim()!=='';
    if(!hasSubtotal&&!hasIva) return;
    const subtotal=Number(row.subtotal||0);
    const iva=Number(row.iva||0);
    if(!Number.isFinite(subtotal)||!Number.isFinite(iva)) return;
    row.total=Math.round((subtotal+iva+Number.EPSILON)*100)/100;
    const input=document.querySelector(`[data-hito-index="${index}"] [data-hito-field="total"]`);
    if(input) input.value=row.total.toFixed(2);
  }

  function renderTotals_cor(){
    const totals=new Map();
    state.hitos.forEach(row=>{
      const currency=String(row.moneda||'').trim().toUpperCase();
      const total=Number(row.total||0);
      if(!currency||!Number.isFinite(total)) return;
      totals.set(currency,(totals.get(currency)||0)+total);
    });
    const mxn=document.getElementById('ccor-ec-form-total-mxn');
    if(mxn) mxn.textContent=formatMoney_cor(totals.get('MXN')||0,'MXN');
    const foreign=document.getElementById('ccor-ec-form-total-foreign');
    if(foreign){
      const rows=[...totals.entries()].filter(([currency])=>currency!=='MXN').sort((a,b)=>a[0].localeCompare(b[0]));
      foreign.innerHTML=rows.length
        ? rows.map(([currency,total])=>`<div><span>${escapeHtml_cor(currency)}</span><b>${escapeHtml_cor(formatMoney_cor(total,currency))}</b></div>`).join('')
        : '<b>Sin hitos</b>';
    }
    const hitosTotal=document.getElementById('ccor-ec-form-hitos-total');
    if(hitosTotal) hitosTotal.value=String(state.hitos.length);
    const equiposTotal=document.getElementById('ccor-ec-form-equipos-total');
    if(equiposTotal) equiposTotal.value=String(state.equipos.filter(row=>row.incluir!==false).length);
  }

  function setStatus_cor(message,kind){
    const node=document.getElementById('ccor-ec-form-status');
    if(!node) return;
    node.className='ccor-ec-form-status'+(kind?' is-'+kind:'');
    node.textContent=message||'';
  }

  async function loadCreateCatalog_cor(ppns){
    const sequence=++state.requestSequence;
    state.loading=true;
    setStatus_cor(ppns?'Cargando proyecto y equipos...':'Cargando PPNS disponibles...','loading');
    try{
      const path=ppns?API_CREATE_CATALOG+'?ppns='+encodeURIComponent(ppns):API_CREATE_CATALOG;
      const response=await apiGet_cor(path);
      if(sequence!==state.requestSequence||!isActive_cor()) return false;
      state.proyectos=Array.isArray(response&&response.proyectos)?response.proyectos:state.proyectos;
      if(ppns){
        const selection=response&&response.seleccion?response.seleccion:null;
        state.proyecto=selection&&selection.proyecto?selection.proyecto:null;
        state.ppns=String(state.proyecto&&state.proyecto.ppns||ppns);
        state.relaciones=[];
        state.logOps=Array.isArray(selection&&selection.log_ops)?selection.log_ops:[];
        state.equipos=mergeEquipos_cor(Array.isArray(selection&&selection.equipos)?selection.equipos:[]);
      }
      renderShell_cor();
      setStatus_cor('','');
      return true;
    }catch(error){
      if(sequence!==state.requestSequence||!isActive_cor()) return false;
      setStatus_cor(errorMessage_cor(error,'load'),'error');
      return false;
    }finally{
      if(sequence===state.requestSequence) state.loading=false;
    }
  }

  async function loadEdit_cor(ppns){
    const sequence=++state.requestSequence;
    state.loading=true;
    setStatus_cor('Cargando toda la información del Estado de Cuenta...','loading');
    try{
      const response=await apiGet_cor(API_BASE+'/'+encodeURIComponent(ppns)+'/formulario');
      if(sequence!==state.requestSequence||!isActive_cor()) return false;
      state.ppns=String(response&&response.ppns||ppns||'').trim();
      state.proyecto=response&&response.proyecto?response.proyecto:null;
      state.logOps=Array.isArray(response&&response.log_ops)?response.log_ops:[];
      state.relaciones=Array.isArray(response&&response.equipos_relacionados)?response.equipos_relacionados:[];
      state.equipos=mergeEquipos_cor(Array.isArray(response&&response.equipos_disponibles)?response.equipos_disponibles:[]);
      const rawHitos=Array.isArray(response&&response.hitos)?response.hitos:[];
      applyFondoGarantiaFromRows_cor(rawHitos);
      state.hitos=rawHitos.map(normalizeHitoFromApi_cor);
      state.deletedHitos=[];
      renderShell_cor();
      setStatus_cor('','');
      return true;
    }catch(error){
      if(sequence!==state.requestSequence||!isActive_cor()) return false;
      setStatus_cor(errorMessage_cor(error,'load'),'error');
      return false;
    }finally{
      if(sequence===state.requestSequence) state.loading=false;
    }
  }

  function updateHitoFromInput_cor(input){
    const tr=input.closest('[data-hito-index]');
    if(!tr) return;
    const index=Number(tr.dataset.hitoIndex);
    if(!Number.isInteger(index)||!state.hitos[index]) return;
    const field=input.dataset.hitoField;
    if(!field) return;
    let value=input.value;
    if(field==='moneda') value=String(value||'').toUpperCase();
    state.hitos[index][field]=value;
    if(field==='subtotal'||field==='iva') syncTotalFromAmounts_cor(index);
    renderTotals_cor();
  }

  function nullableNumber_cor(value){
    const raw=String(value===null||value===undefined?'':value).trim();
    if(raw==='') return null;
    const parsed=Number(raw);
    return Number.isFinite(parsed)?parsed:null;
  }

  function collectPayload_cor(){
    const ppns=state.mode==='edit'
      ? state.ppns
      : String(document.getElementById('ccor-ec-form-ppns')?.value||'').trim();
    const proyecto=String(document.getElementById('ccor-ec-form-proyecto')?.value||'').trim();
    const cliente=String(document.getElementById('ccor-ec-form-cliente')?.value||'').trim();
    const contractual=String(document.getElementById('ccor-ec-form-contractual')?.value||'').trim();
    const fondoGarantia=Boolean(state.fondoGarantia);
    const porcentajeFondoGarantia=fondoGarantia
      ? (String(state.porcentajeFondoGarantia??'').trim()===''?0:Number(state.porcentajeFondoGarantia)/100)
      : 0;

    const hitos=state.hitos.map((row,index)=>({
      id_fuente_cor:row.id_fuente_cor||null,
      orden_hito:index+1,
      condicion:String(row.condicion||'').trim()||null,
      porcentaje:String(row.porcentaje??'').trim()===''?null:Number(row.porcentaje)/100,
      anio_proyecto:String(row.anio_proyecto??'').trim()===''?null:Number(row.anio_proyecto),
      moneda:String(row.moneda||'').trim().toUpperCase()||null,
      subtotal:nullableNumber_cor(row.subtotal),
      iva:nullableNumber_cor(row.iva),
      total:nullableNumber_cor(row.total),
      factura:String(row.factura||'').trim()||null,
      pago_total:nullableNumber_cor(row.pago_total),
      estatus_factura:String(row.estatus_factura||'').trim()||null,
      fecha_pago:String(row.fecha_pago||'').trim()||null,
      fecha_vencimiento:String(row.fecha_vencimiento||'').trim()||null,
      dias_vencimiento:String(row.dias_vencimiento??'').trim()===''?null:Number(row.dias_vencimiento),
      estimado_pago:String(row.estimado_pago||'').trim()||null,
      estatus_vencimiento:String(row.estatus_vencimiento||'').trim()||null,
      fecha_programada:String(row.fecha_programada||'').trim()||null,
      fecha_notificada:String(row.fecha_notificada||'').trim()||null,
      estatus_hito:String(row.estatus_hito||'').trim()||null
    })).concat(state.deletedHitos.map(row=>({id_fuente_cor:Number(row.id_fuente_cor),eliminar:true})));

    const equipos=[];
    state.equipos.forEach((row,index)=>{
      if(!row.id_equipo_cor&&row.incluir===false) return;
      equipos.push({
        id_equipo_cor:row.id_equipo_cor||null,
        id_ins_fl:Number(row.id_ins_fl)||null,
        id_log_ops:row.id_log_ops?Number(row.id_log_ops):null,
        orden:index+1,
        ubicacion_torre:String(row.ubicacion_torre||'').trim()||null,
        activo:row.incluir!==false
      });
    });

    return {
      ppns,proyecto,cliente,contractual,
      fondo_garantia:fondoGarantia,
      porcentaje_fondo_garantia:porcentajeFondoGarantia,
      hitos,equipos
    };
  }

  function validatePayload_cor(payload){
    if(!payload.ppns) return 'Selecciona un PPNS.';
    if(!payload.proyecto) return 'El Proyecto es obligatorio.';
    const fondoError=validateFondoGarantiaGeneral_cor();
    if(fondoError) return fondoError;
    if(payload.fondo_garantia===true){
      if(payload.porcentaje_fondo_garantia===null||!Number.isFinite(payload.porcentaje_fondo_garantia)||payload.porcentaje_fondo_garantia<0){
        return 'Revisa el porcentaje de Fondo de Garantía.';
      }
      if(payload.porcentaje_fondo_garantia>0.10){
        return 'El Fondo de Garantía supera el tope de 10%. Requiere autorización antes de guardar.';
      }
    }
    const activeHitos=(payload.hitos||[]).filter(row=>row.eliminar!==true);
    if(!activeHitos.length) return 'El Estado de Cuenta debe conservar al menos un hito.';
    for(let index=0;index<activeHitos.length;index+=1){
      const row=activeHitos[index];
      if(!row.id_fuente_cor&&!row.condicion) return `Captura el Hito de la fila ${index+1}.`;
      if(row.porcentaje!==null&&(!Number.isFinite(row.porcentaje)||row.porcentaje<0||row.porcentaje>1)) return `El porcentaje de la fila ${index+1} debe estar entre 0% y 100%.`;
      if(row.anio_proyecto!==null&&(!Number.isInteger(row.anio_proyecto)||row.anio_proyecto<1900||row.anio_proyecto>2500)) return `Revisa el año de la fila ${index+1}.`;
      for(const field of ['subtotal','iva','total','pago_total']){
        if(row[field]!==null&&!Number.isFinite(row[field])) return `Revisa ${field} de la fila ${index+1}.`;
      }
      if(row.dias_vencimiento!==null&&!Number.isInteger(row.dias_vencimiento)) return `Días de vencimiento de la fila ${index+1} debe ser entero.`;
      if((row.subtotal!==null||row.iva!==null||row.total!==null)&&!row.moneda) return `Captura la moneda de la fila ${index+1}.`;
    }
    if(state.mode==='create'&&state.equipos.length&&!(payload.equipos||[]).some(row=>row.activo!==false)) return 'Selecciona al menos un equipo del proyecto.';
    return '';
  }

  async function save_cor(){
    if(state.saving||state.loading||isViewerReadonly_cor()) return false;
    const payload=collectPayload_cor();
    const validation=validatePayload_cor(payload);
    if(validation){setStatus_cor(validation,'error');return false;}

    state.saving=true;
    const button=document.getElementById('ccor-ec-form-save');
    if(button){button.disabled=true;button.textContent='Guardando...';}
    setStatus_cor(state.mode==='edit'?'Guardando cambios...':'Creando Estado de Cuenta...','loading');
    try{
      const editing=state.mode==='edit';
      const path=editing?API_BASE+'/'+encodeURIComponent(state.ppns):API_BASE;
      const response=await apiRequest_cor(path,{
        method:editing?'PUT':'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify(payload),
        dedupe:false
      });
      const ppns=String(response&&response.ppns||state.ppns||payload.ppns||'').trim();
      if(!ppns) throw new Error('El backend no devolvió el PPNS guardado.');
      if(window.ManttoHttp&&typeof window.ManttoHttp.invalidate==='function') window.ManttoHttp.invalidate(API_BASE);
      if(window.ManttoRouter&&typeof window.ManttoRouter.go==='function'){
        await window.ManttoRouter.go(ROUTE,{ppns},{replace:true,skipHistory:true,navigationType:'open'});
        if(window.ManttoCobranzaCorEstadosCuenta&&typeof window.ManttoCobranzaCorEstadosCuenta.init==='function'){
          await window.ManttoCobranzaCorEstadosCuenta.init();
        }
      }
      return true;
    }catch(error){
      setStatus_cor(errorMessage_cor(error,'save'),'error');
      return false;
    }finally{
      state.saving=false;
      if(button) button.disabled=false;
      if(button) button.textContent=state.mode==='edit'?'Guardar cambios':'Crear Estado de Cuenta';
    }
  }

  function cancel_cor(){
    if(window.ManttoRouter&&typeof window.ManttoRouter.back==='function'){
      window.ManttoRouter.back();
      return;
    }
    if(window.ManttoRouter&&typeof window.ManttoRouter.go==='function'){
      window.ManttoRouter.go(ROUTE,state.mode==='edit'?{ppns:state.ppns}:null,{navigationType:'back'});
    }
  }

  function bindEvents_cor(){
    if(!state.root||state.boundRoot===state.root) return;
    state.boundRoot=state.root;

    state.root.addEventListener('click',event=>{
      if(event.target.closest('[data-ccor-form-cancel]')){cancel_cor();return;}
      if(event.target.closest('#ccor-ec-form-save')){save_cor();return;}
      if(event.target.closest('#ccor-ec-form-add-hito')){
        state.hitos.push(emptyHito_cor());
        renderHitos_cor();renderTotals_cor();return;
      }
      const remove=event.target.closest('[data-hito-remove]');
      if(remove){
        const tr=remove.closest('[data-hito-index]');
        const index=Number(tr&&tr.dataset.hitoIndex);
        if(Number.isInteger(index)&&index>=0&&state.hitos[index]){
          const current=state.hitos[index];
          if(current.id_fuente_cor) state.deletedHitos.push({id_fuente_cor:current.id_fuente_cor});
          state.hitos.splice(index,1);
          renderHitos_cor();renderTotals_cor();
        }
      }
    });

    state.root.addEventListener('change',event=>{
      if(event.target.id==='ccor-ec-form-fondo-garantia'){
        state.fondoGarantia=Boolean(event.target.checked);
        state.fondoGarantiaMixed=false;
        if(!state.fondoGarantia) state.porcentajeFondoGarantia='0';
        syncFondoGarantiaControls_cor();
        const error=validateFondoGarantiaGeneral_cor();
        setStatus_cor(error,error?'error':'');
        return;
      }
      if(event.target.id==='ccor-ec-form-porcentaje-fondo-garantia'){
        state.porcentajeFondoGarantia=event.target.value;
        syncFondoGarantiaControls_cor();
        const error=validateFondoGarantiaGeneral_cor();
        setStatus_cor(error,error?'error':'');
        return;
      }
      if(event.target.id==='ccor-ec-form-ppns'&&state.mode==='create'){
        const ppns=String(event.target.value||'').trim();
        state.ppns=ppns;
        state.proyecto=null;state.equipos=[];state.relaciones=[];state.logOps=[];
        state.fondoGarantia=false;state.porcentajeFondoGarantia='0';state.fondoGarantiaMixed=false;
        if(ppns) loadCreateCatalog_cor(ppns); else renderShell_cor();
        return;
      }
      const equipmentRow=event.target.closest('[data-equipo-index]');
      if(equipmentRow){
        const index=Number(equipmentRow.dataset.equipoIndex);
        const equipment=state.equipos[index];
        if(!equipment) return;
        if(event.target.matches('[data-equipo-include]')) equipment.incluir=Boolean(event.target.checked);
        if(event.target.matches('[data-equipo-logops]')) equipment.id_log_ops=event.target.value?Number(event.target.value):null;
        if(event.target.matches('[data-equipo-ubicacion]')) equipment.ubicacion_torre=event.target.value;
        renderTotals_cor();
      }
      if(event.target.matches('[data-hito-field]')) updateHitoFromInput_cor(event.target);
    });

    state.root.addEventListener('input',event=>{
      if(event.target.id==='ccor-ec-form-porcentaje-fondo-garantia'){
        state.porcentajeFondoGarantia=event.target.value;
        const error=validateFondoGarantiaGeneral_cor();
        event.target.setAttribute('aria-invalid',error?'true':'false');
        setStatus_cor(error,error?'error':'');
        return;
      }
      const equipmentRow=event.target.closest('[data-equipo-index]');
      if(equipmentRow&&event.target.matches('[data-equipo-ubicacion]')){
        const index=Number(equipmentRow.dataset.equipoIndex);
        if(state.equipos[index]) state.equipos[index].ubicacion_torre=event.target.value;
      }
      if(event.target.matches('[data-hito-field]')) updateHitoFromInput_cor(event.target);
    });
  }

  async function init_cor(options){
    if(!isActive_cor()) return false;
    const root=document.getElementById('view-placeholder');
    if(!root) return false;
    state.root=root;
    bindEvents_cor();

    if(isViewerReadonly_cor()){
      root.innerHTML='<div class="ccor-ec-page"><section class="ccor-ec-card ccor-ec-form-readonly"><h2>Modo solo lectura</h2><p>Sal del Visor de usuario para crear o editar Estados de Cuenta.</p></section></div>';
      setContext_cor();
      return false;
    }

    const payload=currentNavigation_cor().payload||{};
    const requestedMode=String(options&&options.mode||payload.mode||'create').toLowerCase();
    const requestedPpns=String(options&&options.ppns||payload.ppns||'').trim();
    resetState_cor(requestedMode,requestedPpns);
    renderShell_cor();

    if(state.mode==='edit'){
      if(!state.ppns){setStatus_cor('No fue posible identificar el PPNS a editar.','error');return false;}
      await loadEdit_cor(state.ppns);
      return true;
    }

    await loadCreateCatalog_cor(state.ppns||null);
    return true;
  }

  window.ManttoCobranzaCorEstadoCuentaForm=Object.freeze({init:init_cor});
})();
