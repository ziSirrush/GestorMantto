(function(){
  'use strict';

  // [Aster | 2026-09-17 | ASTER-MG | COBRANZA COR ESTADO CUENTA CREAR NUEVO V001]
  if(window.ManttoCobranzaCorEstadoCuentaCrearNuevo) return;

  const ROUTE = 'cobranza-estados-cuenta-crear-nuevo';
  const LIST_ROUTE = 'cobranza-estados-cuenta';
  const API_CATALOG = '/api/cobranza-cor/estados-cuenta/crear-nuevo/catalogo';
  const API_SAVE = '/api/cobranza-cor/estados-cuenta';

  const state = {
    root:null,
    proyectos:[],
    seleccion:null,
    equipos:[],
    logOps:[],
    hitos:[],
    saving:false,
    loading:false,
    requestSequence:0,
    boundRoot:null
  };

  function currentNavigation_cor(){
    if(!window.ManttoRouter || typeof window.ManttoRouter.getCurrent!=='function') return {route:'',payload:null};
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
    if(!window.ManttoHttp || typeof window.ManttoHttp.get!=='function') return Promise.reject(new Error('Cliente HTTP central no disponible.'));
    return window.ManttoHttp.get(path,{force:true,cacheTtlMs:0});
  }

  function apiRequest_cor(path,options){
    if(!window.ManttoHttp || typeof window.ManttoHttp.request!=='function') return Promise.reject(new Error('Cliente HTTP central no disponible.'));
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

  function errorMessage_cor(error){
    const status=Number(error&&error.status);
    if(status===401) return 'La sesión ya no está disponible. Vuelve a iniciar sesión.';
    if(status===403) return text_cor(error&&error.message,'No tienes permiso o alcance para crear este Estado de Cuenta.');
    if(status===404) return text_cor(error&&error.message,'El PPNS no existe en Instalaciones o quedó fuera de tu alcance.');
    if(status===409) return text_cor(error&&error.message,'El PPNS ya cuenta con un Estado de Cuenta.');
    return text_cor(error&&error.message,'No fue posible completar la operación.');
  }

  function emptyHito_cor(){
    return {
      condicion:'',porcentaje:'',moneda:'MXN',subtotal:'',iva:'',total:'',
      fecha_programada:'',fecha_notificada:'',estatus_hito:'Pendiente'
    };
  }

  function resetSelection_cor(){
    state.seleccion=null;
    state.equipos=[];
    state.logOps=[];
    state.hitos=[emptyHito_cor()];
  }

  function setContext_cor(){
    const title=document.getElementById('app-context-title');
    const subtitle=document.getElementById('app-context-subtitle');
    if(title) title.textContent='Crear Estado de Cuenta';
    if(subtitle) subtitle.textContent='Cobranza Corellian · Nuevo Estado de Cuenta por PPNS';
  }

  function projectOptions_cor(){
    return ['<option value="">Selecciona PPNS...</option>']
      .concat(state.proyectos.map(row=>{
        const label=[text_cor(row.ppns,''),text_cor(row.proyecto,'')].filter(Boolean).join(' · ');
        return `<option value="${escapeHtml_cor(row.ppns||'')}">${escapeHtml_cor(label)}</option>`;
      })).join('');
  }

  function renderShell_cor(){
    if(!state.root) return;
    const selected=state.seleccion&&state.seleccion.proyecto?state.seleccion.proyecto:{};
    state.root.innerHTML=`
      <div class="ccor-ec-page ccor-ec-create-page">
        <section class="ccor-ec-card ccor-ec-create-hero">
          <div>
            <p class="ccor-ec-eyebrow">Cobranza · Corellian</p>
            <h1>Crear Estado de Cuenta</h1>
            <p>Alta manual por PPNS. Los hitos se guardan en FUENTE y los equipos quedan relacionados con Instalaciones y Logística.</p>
          </div>
          <div class="ccor-ec-create-actions">
            <button type="button" class="ccor-ec-btn ccor-ec-create-cancel" data-ccor-create-cancel>Cancelar</button>
            <button type="button" class="ccor-ec-btn ccor-ec-btn-primary" id="ccor-ec-create-save">Guardar</button>
          </div>
        </section>

        <div id="ccor-ec-create-status" class="ccor-ec-create-status" aria-live="polite"></div>

        <section class="ccor-ec-create-top-grid">
          <article class="ccor-ec-card ccor-ec-create-general-card">
            <div class="ccor-ec-create-section-title"><b>General</b><span>Datos base del PPNS</span></div>
            <div class="ccor-ec-create-fields">
              <label><span>PPNS *</span><select id="ccor-ec-create-ppns">${projectOptions_cor()}</select></label>
              <label><span>Proyecto</span><input id="ccor-ec-create-proyecto" value="${escapeHtml_cor(selected.proyecto||'')}" readonly></label>
              <label><span>Cliente</span><input id="ccor-ec-create-cliente" value="${escapeHtml_cor(selected.cliente||'')}" readonly></label>
              <label><span>Año *</span><input id="ccor-ec-create-anio" type="number" min="1900" max="2500" step="1" placeholder="2026"></label>
              <label><span>Contractual *</span><input id="ccor-ec-create-contractual" maxlength="150" placeholder="Estatus contractual"></label>
              <label><span>Equipos</span><input id="ccor-ec-create-equipos-total" value="${escapeHtml_cor(selected.equipos_total||0)}" readonly></label>
            </div>
            <div class="ccor-ec-create-people">
              <span>Supervisor <b>${escapeHtml_cor(text_cor(selected.supervisor))}</b></span>
              <span>Asesor <b>${escapeHtml_cor(text_cor(selected.asesor))}</b></span>
              <span>Administrativo <b>${escapeHtml_cor(text_cor(selected.administrativo))}</b></span>
            </div>
          </article>

          <aside class="ccor-ec-create-kpis">
            <article class="ccor-ec-card ccor-ec-create-kpi is-mxn">
              <span>Total hitos MXN</span>
              <b id="ccor-ec-create-total-mxn">$0.00 MXN</b>
            </article>
            <article class="ccor-ec-card ccor-ec-create-kpi is-foreign">
              <span>Total hitos Moneda Extranjera</span>
              <div id="ccor-ec-create-total-foreign"><b>Sin hitos</b></div>
            </article>
          </aside>
        </section>

        <section class="ccor-ec-card ccor-ec-create-section">
          <div class="ccor-ec-create-section-title">
            <div><b>Equipos del proyecto</b><span>Relación Cobranza COR ↔ ins_fl / log_ops</span></div>
            <small>Selecciona los equipos que formarán parte del Estado de Cuenta.</small>
          </div>
          <div class="ccor-ec-table-wrap">
            <table class="ccor-ec-table ccor-ec-create-equipment-table">
              <thead><tr><th>Incluir</th><th>Equipo / Referencia</th><th>Capacidad</th><th>Desembarques</th><th>Estatus</th><th>Logística</th><th>Ubicación / Torre</th></tr></thead>
              <tbody id="ccor-ec-create-equipment-body"></tbody>
            </table>
          </div>
        </section>

        <section class="ccor-ec-card ccor-ec-create-section">
          <div class="ccor-ec-create-section-title">
            <div><b>Hitos de cobranza</b><span>Los importes se conservan separados por moneda.</span></div>
            <button type="button" class="ccor-ec-btn ccor-ec-btn-primary" id="ccor-ec-create-add-hito">+ Agregar hito</button>
          </div>
          <div class="ccor-ec-table-wrap">
            <table class="ccor-ec-table ccor-ec-create-hitos-table">
              <thead><tr><th>#</th><th>Hito</th><th>%</th><th>Moneda</th><th>Subtotal</th><th>IVA</th><th>Total</th><th>Fecha programada</th><th>Fecha notificada</th><th>Estatus</th><th>Acciones</th></tr></thead>
              <tbody id="ccor-ec-create-hitos-body"></tbody>
            </table>
          </div>
        </section>
      </div>`;

    const ppnsSelect=document.getElementById('ccor-ec-create-ppns');
    if(ppnsSelect&&selected.ppns) ppnsSelect.value=selected.ppns;
    renderEquipos_cor();
    renderHitos_cor();
    renderTotals_cor();
    setContext_cor();
  }

  function logOpsOptions_cor(selectedId){
    const options=['<option value="">Sin relación logística</option>'];
    state.logOps.forEach(row=>{
      const label=[row.ph_ns,row.no_control,row.marca,row.estatus].map(v=>String(v||'').trim()).filter(Boolean).join(' · ');
      const selected=Number(selectedId)===Number(row.id_log_ops)?' selected':'';
      options.push(`<option value="${escapeHtml_cor(row.id_log_ops)}"${selected}>${escapeHtml_cor(label||('Log '+row.id_log_ops))}</option>`);
    });
    return options.join('');
  }

  function renderEquipos_cor(){
    const body=document.getElementById('ccor-ec-create-equipment-body');
    if(!body) return;
    if(!state.equipos.length){
      body.innerHTML='<tr><td colspan="7" class="ccor-ec-table-empty">Selecciona un PPNS para cargar sus equipos de Instalaciones.</td></tr>';
      return;
    }
    body.innerHTML=state.equipos.map((row,index)=>`
      <tr data-equipo-index="${index}">
        <td><input type="checkbox" data-equipo-include ${row.incluir===false?'':'checked'}></td>
        <td><b>${escapeHtml_cor(text_cor(row.referencia_sitio))}</b></td>
        <td>${escapeHtml_cor(text_cor(row.capacidad_kg))}</td>
        <td>${escapeHtml_cor(text_cor(row.numero_desembarques))}</td>
        <td>${escapeHtml_cor(text_cor(row.estatus_equipo_entrega||row.estatus))}</td>
        <td><select data-equipo-logops>${logOpsOptions_cor(row.id_log_ops)}</select></td>
        <td><input type="text" maxlength="255" data-equipo-ubicacion value="${escapeHtml_cor(row.ubicacion_torre||'')}" placeholder="Ubicación / Torre"></td>
      </tr>`).join('');
  }

  function renderHitos_cor(){
    const body=document.getElementById('ccor-ec-create-hitos-body');
    if(!body) return;
    if(!state.hitos.length){
      body.innerHTML='<tr><td colspan="11" class="ccor-ec-table-empty">Agrega al menos un hito de cobranza.</td></tr>';
      return;
    }
    body.innerHTML=state.hitos.map((row,index)=>`
      <tr data-hito-index="${index}">
        <td class="ccor-ec-create-order">${index+1}</td>
        <td><input type="text" maxlength="500" data-hito-field="condicion" value="${escapeHtml_cor(row.condicion||'')}" placeholder="Condición / Hito"></td>
        <td><input type="number" min="0" max="100" step="0.01" data-hito-field="porcentaje" value="${escapeHtml_cor(row.porcentaje||'')}" placeholder="0"></td>
        <td><input type="text" maxlength="10" data-hito-field="moneda" value="${escapeHtml_cor(row.moneda||'MXN')}" placeholder="MXN"></td>
        <td><input type="number" min="0" step="0.01" data-hito-field="subtotal" value="${escapeHtml_cor(row.subtotal||'')}" placeholder="0.00"></td>
        <td><input type="number" min="0" step="0.01" data-hito-field="iva" value="${escapeHtml_cor(row.iva||'')}" placeholder="0.00"></td>
        <td><input type="number" min="0" step="0.01" data-hito-field="total" value="${escapeHtml_cor(row.total||'')}" readonly></td>
        <td><input type="date" data-hito-field="fecha_programada" value="${escapeHtml_cor(row.fecha_programada||'')}"></td>
        <td><input type="date" data-hito-field="fecha_notificada" value="${escapeHtml_cor(row.fecha_notificada||'')}"></td>
        <td>
          <select data-hito-field="estatus_hito">
            ${['Pendiente','Programado','Notificado','Cerrado'].map(status=>`<option value="${status}"${String(row.estatus_hito||'Pendiente')===status?' selected':''}>${status}</option>`).join('')}
          </select>
        </td>
        <td><button type="button" class="ccor-ec-create-remove" data-hito-remove title="Eliminar hito">×</button></td>
      </tr>`).join('');
    syncHitoTotals_cor();
  }

  function syncHitoTotals_cor(){
    state.hitos.forEach((row,index)=>{
      const subtotal=Number(row.subtotal||0);
      const iva=Number(row.iva||0);
      row.total=Math.round(((Number.isFinite(subtotal)?subtotal:0)+(Number.isFinite(iva)?iva:0)+Number.EPSILON)*100)/100;
      const input=document.querySelector(`[data-hito-index="${index}"] [data-hito-field="total"]`);
      if(input) input.value=Number.isFinite(row.total)?row.total.toFixed(2):'0.00';
    });
  }

  function renderTotals_cor(){
    const totals=new Map();
    state.hitos.forEach(row=>{
      const currency=String(row.moneda||'').trim().toUpperCase();
      if(!currency) return;
      const total=Number(row.total||0);
      totals.set(currency,(totals.get(currency)||0)+(Number.isFinite(total)?total:0));
    });
    const mxn=document.getElementById('ccor-ec-create-total-mxn');
    if(mxn) mxn.textContent=formatMoney_cor(totals.get('MXN')||0,'MXN');
    const foreign=document.getElementById('ccor-ec-create-total-foreign');
    if(foreign){
      const rows=[...totals.entries()].filter(([currency])=>currency!=='MXN').sort((a,b)=>a[0].localeCompare(b[0]));
      foreign.innerHTML=rows.length?rows.map(([currency,total])=>`<div><span>${escapeHtml_cor(currency)}</span><b>${escapeHtml_cor(formatMoney_cor(total,currency))}</b></div>`).join(''):'<b>Sin hitos</b>';
    }
  }

  function setStatus_cor(message,kind){
    const node=document.getElementById('ccor-ec-create-status');
    if(!node) return;
    node.className='ccor-ec-create-status'+(kind?' is-'+kind:'');
    node.textContent=message||'';
  }

  async function loadCatalog_cor(ppns){
    const sequence=++state.requestSequence;
    state.loading=true;
    setStatus_cor(ppns?'Cargando proyecto y equipos...':'Cargando PPNS disponibles...','loading');
    try{
      const path=ppns?API_CATALOG+'?ppns='+encodeURIComponent(ppns):API_CATALOG;
      const response=await apiGet_cor(path);
      if(sequence!==state.requestSequence||!isActive_cor()) return false;
      state.proyectos=Array.isArray(response&&response.proyectos)?response.proyectos:state.proyectos;
      if(ppns){
        state.seleccion=response&&response.seleccion?response.seleccion:null;
        state.equipos=Array.isArray(state.seleccion&&state.seleccion.equipos)?state.seleccion.equipos.map(row=>({...row,incluir:true,id_log_ops:null,ubicacion_torre:''})):[];
        state.logOps=Array.isArray(state.seleccion&&state.seleccion.log_ops)?state.seleccion.log_ops:[];
      }
      renderShell_cor();
      setStatus_cor('','');
      return true;
    }catch(error){
      if(sequence!==state.requestSequence||!isActive_cor()) return false;
      setStatus_cor(errorMessage_cor(error),'error');
      return false;
    }finally{
      if(sequence===state.requestSequence) state.loading=false;
    }
  }

  function updateHitoFromInput_cor(input){
    const row=input.closest('[data-hito-index]');
    if(!row) return;
    const index=Number(row.dataset.hitoIndex);
    if(!Number.isInteger(index)||!state.hitos[index]) return;
    const field=input.dataset.hitoField;
    if(!field) return;
    let value=input.value;
    if(field==='moneda') value=String(value||'').toUpperCase();
    state.hitos[index][field]=value;
    if(field==='subtotal'||field==='iva') syncHitoTotals_cor();
    renderTotals_cor();
  }

  function collectPayload_cor(){
    const ppns=String(document.getElementById('ccor-ec-create-ppns')?.value||'').trim();
    const anio=String(document.getElementById('ccor-ec-create-anio')?.value||'').trim();
    const contractual=String(document.getElementById('ccor-ec-create-contractual')?.value||'').trim();
    const hitos=state.hitos.map((row,index)=>({
      orden_hito:index+1,
      condicion:String(row.condicion||'').trim(),
      porcentaje:String(row.porcentaje||'').trim()===''?null:Number(row.porcentaje)/100,
      moneda:String(row.moneda||'').trim().toUpperCase(),
      subtotal:String(row.subtotal||'').trim()===''?0:Number(row.subtotal),
      iva:String(row.iva||'').trim()===''?0:Number(row.iva),
      total:Number(row.total||0),
      fecha_programada:String(row.fecha_programada||'').trim()||null,
      fecha_notificada:String(row.fecha_notificada||'').trim()||null,
      estatus_hito:String(row.estatus_hito||'').trim()||'Pendiente'
    }));
    const equipos=state.equipos.map((row,index)=>({row,index})).filter(item=>item.row.incluir!==false).map((item,order)=>({
      id_ins_fl:Number(item.row.id_ins_fl),
      id_log_ops:item.row.id_log_ops?Number(item.row.id_log_ops):null,
      orden:order+1,
      ubicacion_torre:String(item.row.ubicacion_torre||'').trim()||null
    }));
    return {ppns,anio_proyecto:anio,contractual,hitos,equipos};
  }

  function validatePayload_cor(payload){
    if(!payload.ppns) return 'Selecciona un PPNS.';
    if(!/^\d{4}$/.test(String(payload.anio_proyecto||''))) return 'Captura el año del proyecto.';
    if(!payload.contractual) return 'Captura el estatus contractual.';
    if(!Array.isArray(payload.hitos)||!payload.hitos.length) return 'Agrega al menos un hito de cobranza.';
    for(let index=0;index<payload.hitos.length;index+=1){
      const row=payload.hitos[index];
      if(!row.condicion) return `Captura el Hito de la fila ${index+1}.`;
      if(row.porcentaje===null||!Number.isFinite(row.porcentaje)||row.porcentaje<0||row.porcentaje>1) return `El porcentaje de la fila ${index+1} debe estar entre 0% y 100%.`;
      if(!row.moneda) return `Captura la moneda de la fila ${index+1}.`;
      if(!Number.isFinite(row.subtotal)||row.subtotal<0||!Number.isFinite(row.iva)||row.iva<0) return `Revisa Subtotal e IVA de la fila ${index+1}.`;
    }
    if(state.equipos.length&&(!Array.isArray(payload.equipos)||!payload.equipos.length)) return 'Selecciona al menos un equipo del proyecto.';
    return '';
  }

  async function save_cor(){
    if(state.saving||state.loading||isViewerReadonly_cor()) return false;
    const payload=collectPayload_cor();
    const validation=validatePayload_cor(payload);
    if(validation){setStatus_cor(validation,'error');return false;}
    state.saving=true;
    const button=document.getElementById('ccor-ec-create-save');
    if(button){button.disabled=true;button.textContent='Guardando...';}
    setStatus_cor('Creando Estado de Cuenta...','loading');
    try{
      const response=await apiRequest_cor(API_SAVE,{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify(payload),
        dedupe:false
      });
      const ppns=String(response&&response.ppns||payload.ppns||'').trim();
      if(!ppns) throw new Error('El backend no devolvió el PPNS creado.');
      if(window.ManttoHttp&&typeof window.ManttoHttp.invalidate==='function'){
        window.ManttoHttp.invalidate('/api/cobranza-cor/estados-cuenta');
      }
      if(window.ManttoRouter&&typeof window.ManttoRouter.go==='function'){
        await window.ManttoRouter.go(LIST_ROUTE,{ppns},{replace:true,skipHistory:true,navigationType:'open'});
        if(window.ManttoCobranzaCorEstadosCuenta&&typeof window.ManttoCobranzaCorEstadosCuenta.init==='function'){
          await window.ManttoCobranzaCorEstadosCuenta.init();
        }
      }
      return true;
    }catch(error){
      setStatus_cor(errorMessage_cor(error),'error');
      return false;
    }finally{
      state.saving=false;
      if(button){button.disabled=false;button.textContent='Guardar';}
    }
  }

  function cancel_cor(){
    if(window.ManttoRouter&&typeof window.ManttoRouter.back==='function'){
      window.ManttoRouter.back();
      return;
    }
    if(window.ManttoRouter&&typeof window.ManttoRouter.go==='function'){
      window.ManttoRouter.go(LIST_ROUTE,null,{navigationType:'back'});
    }
  }

  function bindEvents_cor(){
    if(!state.root||state.boundRoot===state.root) return;
    state.boundRoot=state.root;

    state.root.addEventListener('click',event=>{
      if(event.target.closest('[data-ccor-create-cancel]')){cancel_cor();return;}
      if(event.target.closest('#ccor-ec-create-save')){save_cor();return;}
      if(event.target.closest('#ccor-ec-create-add-hito')){
        state.hitos.push(emptyHito_cor());
        renderHitos_cor();renderTotals_cor();return;
      }
      const remove=event.target.closest('[data-hito-remove]');
      if(remove){
        const row=remove.closest('[data-hito-index]');
        const index=Number(row&&row.dataset.hitoIndex);
        if(Number.isInteger(index)&&index>=0){state.hitos.splice(index,1);renderHitos_cor();renderTotals_cor();}
      }
    });

    state.root.addEventListener('change',event=>{
      if(event.target.id==='ccor-ec-create-ppns'){
        const ppns=String(event.target.value||'').trim();
        resetSelection_cor();
        if(ppns) loadCatalog_cor(ppns); else renderShell_cor();
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
      }
      if(event.target.matches('[data-hito-field]')) updateHitoFromInput_cor(event.target);
    });

    state.root.addEventListener('input',event=>{
      const equipmentRow=event.target.closest('[data-equipo-index]');
      if(equipmentRow&&event.target.matches('[data-equipo-ubicacion]')){
        const index=Number(equipmentRow.dataset.equipoIndex);
        if(state.equipos[index]) state.equipos[index].ubicacion_torre=event.target.value;
      }
      if(event.target.matches('[data-hito-field]')) updateHitoFromInput_cor(event.target);
    });
  }

  async function init_cor(){
    if(!isActive_cor()) return false;
    const root=document.getElementById('view-placeholder');
    if(!root) return false;
    state.root=root;
    bindEvents_cor();
    if(isViewerReadonly_cor()){
      root.innerHTML='<div class="ccor-ec-page"><section class="ccor-ec-card ccor-ec-create-readonly"><h2>Modo solo lectura</h2><p>Sal del Visor de usuario para crear un Estado de Cuenta.</p></section></div>';
      setContext_cor();
      return false;
    }
    resetSelection_cor();
    renderShell_cor();
    await loadCatalog_cor();
    return true;
  }

  window.ManttoCobranzaCorEstadoCuentaCrearNuevo=Object.freeze({init:init_cor});
})();
