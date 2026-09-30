(function(){
  'use strict';

  // [Aster | 2026-09-25 | ASTER-MG | COBRANZA COR EQUIPOS PHNS ALINEACION V001]
  if(window.ManttoCobranzaCorEstadoCuentaForm) return;

  const ROUTE='cobranza-estados-cuenta';
  const API_BASE='/api/cobranza-cor/estados-cuenta';
  const API_CREATE_CATALOG=API_BASE+'/crear-nuevo/catalogo';
  const EQUIPMENT_ALIGNMENT_REFRESH_MS=60000;

  const state={
    root:null,
    mode:'create',
    ppns:'',
    proyectos:[],
    proyecto:null,
    equipos:[],
    relaciones:[],
    insFlCatalog:[],
    logOps:[],
    alignmentTimer:null,
    alignmentInFlight:false,
    alignmentLastCheck:null,
    alignmentError:'',
    hitos:[],
    deletedHitos:[],
    partidas:[],
    deletedPartidas:[],
    ivaGeneralPct:'',
    ivaGeneralMixed:false,
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
      orden_hito:'',condicion:'',porcentaje:'',anio_proyecto:'',moneda:'',
      subtotal:'',iva:'',total:'',factura:'',
      fecha_vencimiento:'',dias_vencimiento:'',estimado_pago:'',
      fecha_programada:'',fecha_notificada:''
    };
  }

  function emptyPartida_cor(){
    return {id_partida_cor:null,moneda:'MXN',monto_base:''};
  }

  function normalizePartidaFromApi_cor(row){
    return {
      id_partida_cor:Number(row&&row.id_partida_cor)||null,
      orden:Number(row&&row.orden)||null,
      moneda:String(row&&row.moneda||'').trim().toUpperCase(),
      monto_base:row&&row.monto_base!==null&&row.monto_base!==undefined?String(row.monto_base):''
    };
  }

  function ivaGeneralValue_cor(value){
    const parsed=number_cor(value);
    if(parsed===null) return '';
    const allowed=[0,0.08,0.16];
    const matched=allowed.find(candidate=>Math.abs(candidate-parsed)<0.0000005);
    return matched===undefined?'':String(matched);
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
      orden_hito:row&&row.orden_hito!==null&&row.orden_hito!==undefined?String(row.orden_hito):'',
      condicion:String(row&&row.condicion||''),
      porcentaje:percentDisplay_cor(row&&row.porcentaje),
      anio_proyecto:row&&row.anio_proyecto!==null&&row.anio_proyecto!==undefined?String(row.anio_proyecto):'',
      moneda:String(row&&row.moneda||'').toUpperCase(),
      subtotal:row&&row.subtotal!==null&&row.subtotal!==undefined?String(row.subtotal):'',
      iva:row&&row.iva!==null&&row.iva!==undefined?String(row.iva):'',
      total:row&&row.total!==null&&row.total!==undefined?String(row.total):'',
      factura:String(row&&row.factura||''),
      fecha_vencimiento:String(row&&row.fecha_vencimiento||''),
      dias_vencimiento:row&&row.dias_vencimiento!==null&&row.dias_vencimiento!==undefined?String(row.dias_vencimiento):'',
      estimado_pago:String(row&&row.estimado_pago||''),
      fecha_programada:String(row&&row.fecha_programada||''),
      fecha_notificada:String(row&&row.fecha_notificada||'')
    };
  }

  function resetState_cor(mode,ppns){
    stopEquipmentAlignmentPolling_cor();
    state.mode=mode==='edit'?'edit':'create';
    state.ppns=String(ppns||'').trim();
    state.proyectos=[];
    state.proyecto=null;
    state.equipos=[];
    state.relaciones=[];
    state.insFlCatalog=[];
    state.logOps=[];
    state.alignmentInFlight=false;
    state.alignmentLastCheck=null;
    state.alignmentError='';
    state.hitos=state.mode==='create'?[emptyHito_cor()]:[];
    state.deletedHitos=[];
    state.partidas=[];
    state.deletedPartidas=[];
    state.ivaGeneralPct='';
    state.ivaGeneralMixed=false;
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

  function normalizePhns_cor(value){
    return String(value===null||value===undefined?'':value).trim().toUpperCase();
  }

  function splitLogOpsPhns_cor(value){
    const seen=new Set();
    return String(value===null||value===undefined?'':value)
      .split(',')
      .map(normalizePhns_cor)
      .filter(token=>token&&!seen.has(token)&&seen.add(token));
  }

  function insFlById_cor(id){
    const numeric=Number(id);
    if(!Number.isInteger(numeric)||numeric<=0) return null;
    return state.insFlCatalog.find(row=>Number(row&&row.id_ins_fl)===numeric)||null;
  }

  function logOpsById_cor(id){
    const numeric=Number(id);
    if(!Number.isInteger(numeric)||numeric<=0) return null;
    return state.logOps.find(row=>Number(row&&row.id_log_ops)===numeric)||null;
  }

  function exactLogOpsIdForPhns_cor(phns){
    const normalized=normalizePhns_cor(phns);
    if(!normalized) return null;
    const matches=state.logOps.filter(row=>splitLogOpsPhns_cor(row&&row.ph_ns).includes(normalized));
    return matches.length===1?Number(matches[0].id_log_ops)||null:null;
  }

  function equipmentSourceFields_cor(row){
    const source=insFlById_cor(row&&row.id_ins_fl);
    return source||row||{};
  }

  function equipmentAlignment_cor(row){
    if(row&&row.incluir===false) return {code:'excluded',label:'No incluido',detail:'No participa en la alineación.',className:'is-phns-excluded'};
    const ins=insFlById_cor(row&&row.id_ins_fl);
    if(!ins){
      return {code:'missing-ins',label:'Falta Instalaciones',detail:'Selecciona un PHNS vigente de ins_fl.',className:'is-phns-incomplete'};
    }
    const phnsIns=normalizePhns_cor(ins.referencia_sitio);
    if(!phnsIns){
      return {code:'empty-ins',label:'Sin PHNS Instalaciones',detail:'ins_fl no tiene referencia_sitio para este equipo.',className:'is-phns-incomplete'};
    }
    const log=logOpsById_cor(row&&row.id_log_ops);
    if(!log){
      return {code:'missing-log',label:'Selecciona Logística',detail:'Relaciona el equipo con el registro de log_ops que contiene su PHNS.',className:'is-phns-incomplete'};
    }
    const phnsLog=splitLogOpsPhns_cor(log.ph_ns);
    if(!phnsLog.length){
      return {code:'empty-log',label:'Sin PHNS Logística',detail:'log_ops.ph_ns está vacío.',className:'is-phns-incomplete'};
    }
    if(phnsLog.includes(phnsIns)){
      return {code:'aligned',label:'Alineado',detail:phnsIns+' existe en ambas fuentes.',className:'is-phns-aligned'};
    }
    return {code:'mismatch',label:'Revisar PHNS',detail:phnsIns+' no aparece dentro de '+phnsLog.join(', ')+'.',className:'is-phns-mismatch'};
  }

  function sourceAlignment_cor(){
    const insSet=new Set(state.insFlCatalog.map(row=>normalizePhns_cor(row&&row.referencia_sitio)).filter(Boolean));
    const logSet=new Set(state.logOps.flatMap(row=>splitLogOpsPhns_cor(row&&row.ph_ns)));
    const missingInIns=[...logSet].filter(phns=>!insSet.has(phns)).sort((a,b)=>a.localeCompare(b,'es',{numeric:true,sensitivity:'base'}));
    const onlyInIns=[...insSet].filter(phns=>!logSet.has(phns)).sort((a,b)=>a.localeCompare(b,'es',{numeric:true,sensitivity:'base'}));
    const rowIssues=state.equipos.filter(row=>row&&row.incluir!==false&&equipmentAlignment_cor(row).code!=='aligned').length;
    return {
      ins:[...insSet],
      log:[...logSet],
      missingInIns,
      onlyInIns,
      rowIssues,
      aligned:missingInIns.length===0&&onlyInIns.length===0&&rowIssues===0
    };
  }

  function stopEquipmentAlignmentPolling_cor(){
    if(state.alignmentTimer){window.clearInterval(state.alignmentTimer);state.alignmentTimer=null;}
  }

  function formatAlignmentCheckTime_cor(){
    if(!(state.alignmentLastCheck instanceof Date)||Number.isNaN(state.alignmentLastCheck.getTime())) return 'sin revisión todavía';
    return state.alignmentLastCheck.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
  }

  function relationByInsFl_cor(){
    const map=new Map();
    state.relaciones.forEach(row=>{
      const id=Number(row&&row.id_ins_fl);
      if(Number.isInteger(id)&&id>0&&!map.has(id)) map.set(id,row);
    });
    return map;
  }

  function mergeEquipos_cor(baseRows,preserveSelections=false){
    const sourceRows=Array.isArray(baseRows)?baseRows:[];
    state.insFlCatalog=sourceRows.map(row=>({...row}));
    const relationMap=relationByInsFl_cor();
    const previous=preserveSelections?state.equipos.slice():[];
    const previousByIns=new Map();
    previous.forEach(row=>{
      const id=Number(row&&row.id_ins_fl);
      if(Number.isInteger(id)&&id>0&&!previousByIns.has(id)) previousByIns.set(id,row);
    });
    const sourceIds=new Set();
    const result=sourceRows.map((row,index)=>{
      const id=Number(row.id_ins_fl);
      if(Number.isInteger(id)&&id>0) sourceIds.add(id);
      const relation=relationMap.get(id)||null;
      const current=previousByIns.get(id)||null;
      const suggestedLogOps=exactLogOpsIdForPhns_cor(row.referencia_sitio);
      return {
        ...row,
        id_equipo_cor:current?.id_equipo_cor||(relation?Number(relation.id_equipo_cor)||null:null),
        incluir:current?current.incluir:(state.mode==='create'?true:Boolean(relation&&Number(relation.activo)!==0)),
        id_log_ops:current&&current.id_log_ops!==undefined
          ? current.id_log_ops
          : (relation&&relation.id_log_ops?Number(relation.id_log_ops):(suggestedLogOps||null)),
        ubicacion_torre:current&&current.ubicacion_torre!==undefined
          ? String(current.ubicacion_torre||'')
          : (relation&&relation.ubicacion_torre?String(relation.ubicacion_torre):''),
        orden:current&&current.orden?Number(current.orden):(relation&&relation.orden?Number(relation.orden):index+1),
        source_missing:false
      };
    });

    previous.forEach(row=>{
      const id=Number(row&&row.id_ins_fl);
      if(Number.isInteger(id)&&id>0&&sourceIds.has(id)) return;
      if(!row.id_equipo_cor&&row.incluir===false) return;
      result.push({...row,source_missing:true});
    });

    state.relaciones.forEach(relation=>{
      const id=Number(relation&&relation.id_ins_fl);
      if(!Number.isInteger(id)||id<=0||sourceIds.has(id)||result.some(row=>Number(row.id_ins_fl)===id)) return;
      result.push({
        id_equipo_cor:Number(relation.id_equipo_cor)||null,
        id_ins_fl:id,
        id_log_ops:relation.id_log_ops?Number(relation.id_log_ops):null,
        referencia_sitio:String(relation.referencia_sitio||''),
        capacidad_kg:String(relation.capacidad_kg||''),
        numero_desembarques:String(relation.numero_desembarques||''),
        estatus_equipo_entrega:String(relation.estatus||''),
        incluir:Number(relation.activo)!==0,
        ubicacion_torre:String(relation.ubicacion_torre||''),
        orden:Number(relation.orden)||result.length+1,
        source_missing:true
      });
    });
    return result;
  }

  function ensureEquiposValidationStyles_cor(){
    if(document.getElementById('ccor-ec-equipos-validation-v001-style')) return;
    const style=document.createElement('style');
    style.id='ccor-ec-equipos-validation-v001-style';
    style.textContent=`
      .ccor-ec-form-equipment-manual{display:grid;grid-template-columns:minmax(240px,1.2fr) minmax(220px,1fr) auto;gap:10px;align-items:end;margin:12px 0;padding:12px;border:1px solid #d9e5f2;border-radius:10px;background:#f8fbff}
      .ccor-ec-form-equipment-manual label{display:flex;flex-direction:column;gap:5px;font-size:10px;font-weight:800;color:#27476b}
      .ccor-ec-form-equipment-manual input,.ccor-ec-form-equipment-manual select{width:100%;min-height:36px;border:1px solid #bfd0e2;border-radius:8px;background:#fff;padding:6px 9px;color:#14304e}
      .ccor-ec-form-equipment-table{min-width:760px!important}
      .ccor-ec-form-equipment-table td{vertical-align:middle}
      .ccor-ec-form-equipment-ref b{display:block;color:#173e68;font-size:11px}
      .ccor-ec-form-equipment-ref small{display:block;margin-top:2px;color:#718093;font-size:9px}
      .ccor-ec-form-percentage-validation{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0 0;padding:10px 12px;border:1px solid #d9e5f2;border-radius:10px;background:#f8fbff}
      .ccor-ec-form-percentage-validation>strong{font-size:10px;color:#27476b;margin-right:2px}
      .ccor-ec-form-pct-badge{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:999px;font-size:10px;font-weight:850;background:#eef2f6;color:#5f6f80;border:1px solid #d7e0e8}
      .ccor-ec-form-pct-badge.is-ok{background:#e7f7ed;color:#1c7b42;border-color:#b7e1c5}
      .ccor-ec-form-pct-badge.is-error{background:#ffe9e7;color:#a62d24;border-color:#f1bbb5}
      .ccor-ec-form-pct-note{width:100%;font-size:9.5px;color:#687b8e}
      @media(max-width:760px){.ccor-ec-form-equipment-manual{grid-template-columns:1fr}.ccor-ec-form-equipment-manual .ccor-ec-btn{min-height:44px}.ccor-ec-form-equipment-table{min-width:760px!important}}
    `;
    document.head.appendChild(style);
  }

  function renderShell_cor(){
    if(!state.root) return;
    const editing=state.mode==='edit';
    const project=state.proyecto||{};
    const ppnsValue=editing?state.ppns:String(project.ppns||state.ppns||'');
    /* Fase 3: Proyecto, Cliente y Contractual son datos funcionales editables; PPNS conserva la identidad. */

    state.root.innerHTML=`
      <div class="ccor-ec-page ccor-ec-form-page">
        <section class="ccor-ec-card ccor-ec-form-hero">
          <div>
            <p class="ccor-ec-eyebrow">Cobranza · Corellian</p>
            <h1>${editing?'Editar':'Crear'} Estado de Cuenta</h1>
            <p>${editing?'Actualiza General, Partidas y Hitos del Estado de Cuenta. Facturación y pagos se administrarán desde el Detalle.':'Alta por PPNS. General, Partidas y Hitos forman la base del Estado de Cuenta; Facturación y pagos se gestionarán después desde el Detalle.'}</p>
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
              <label><span>Proyecto</span><input id="ccor-ec-form-proyecto" maxlength="255" value="${escapeHtml_cor(project.proyecto||'')}"></label>
              <label><span>Cliente</span><input id="ccor-ec-form-cliente" maxlength="500" value="${escapeHtml_cor(project.cliente||'')}"></label>
              <label><span>Contractual</span><input id="ccor-ec-form-contractual" maxlength="150" value="${escapeHtml_cor(project.contractual||'')}" placeholder="Estatus contractual"></label>
              <label><span>IVA general</span><select id="ccor-ec-form-iva-general"${state.ivaGeneralMixed?' aria-invalid="true"':''}>
                <option value=""${state.ivaGeneralPct===''?' selected':''}>Sin definir</option>
                <option value="0"${state.ivaGeneralPct==='0'?' selected':''}>0%</option>
                <option value="0.08"${state.ivaGeneralPct==='0.08'?' selected':''}>8%</option>
                <option value="0.16"${state.ivaGeneralPct==='0.16'?' selected':''}>16%</option>
              </select></label>
              <label class="ccor-ec-form-fondo-general"><span>Fondo de Garantía</span><span class="ccor-ec-form-fondo-general-control"><input id="ccor-ec-form-fondo-garantia" type="checkbox"${state.fondoGarantia?' checked':''}><b id="ccor-ec-form-fondo-estado">${state.fondoGarantia?'Activado':'Desactivado'}</b></span></label>
              <label class="ccor-ec-form-fondo-porcentaje"><span>% Fondo de Garantía</span><input id="ccor-ec-form-porcentaje-fondo-garantia" type="number" min="0" max="10" step="0.01" value="${escapeHtml_cor(state.fondoGarantia?state.porcentajeFondoGarantia:'0')}"${state.fondoGarantia?'':' disabled'}><small>Aplica por igual a todos los hitos activos.</small></label>
              <label><span>Equipos relacionados</span><input id="ccor-ec-form-equipos-total" value="${escapeHtml_cor(state.equipos.filter(row=>row.incluir!==false).length)}" readonly></label>
              <label><span>Hitos activos</span><input id="ccor-ec-form-hitos-total" value="${escapeHtml_cor(state.hitos.length)}" readonly></label>
            </div>
            <div class="ccor-ec-form-partidas-block">
              <div class="ccor-ec-form-partidas-head">
                <div><b>Partidas monetarias</b><span>Cada importe es base antes de IVA. Varias partidas de la misma moneda se suman para formar su 100%.</span></div>
                <button type="button" class="ccor-ec-btn ccor-ec-btn-primary" id="ccor-ec-form-add-partida">+ Agregar partida</button>
              </div>
              <div id="ccor-ec-form-iva-warning" class="ccor-ec-form-fondo-warning"${state.ivaGeneralMixed?'':' hidden'}>${state.ivaGeneralMixed?'Los hitos existentes tienen valores distintos de IVA general. Selecciona 0%, 8% o 16% para unificarlos al guardar.':''}</div>
              <div class="ccor-ec-table-wrap ccor-ec-form-partidas-wrap">
                <table class="ccor-ec-table ccor-ec-form-partidas-table">
                  <thead><tr><th>#</th><th>Moneda</th><th>Monto base (100% antes de IVA)</th><th>Acciones</th></tr></thead>
                  <tbody id="ccor-ec-form-partidas-body"></tbody>
                </table>
              </div>
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
              <span>Base 100% MXN</span><b id="ccor-ec-form-total-mxn">$0.00 MXN</b>
            </article>
            <article class="ccor-ec-card ccor-ec-form-kpi is-foreign">
              <span>Base 100% Moneda Extranjera</span><div id="ccor-ec-form-total-foreign"><b>Sin partidas</b></div>
            </article>
          </aside>
        </section>

        <section class="ccor-ec-card ccor-ec-form-section">
          <div class="ccor-ec-form-section-title">
            <div><b>Equipos del proyecto</b><span>Los equipos se leen de ins_fl. A cada referencia puedes relacionarle el PHNS disponible en log_ops.ph_ns.</span></div>
          </div>
          <div class="ccor-ec-form-equipment-manual">
            <label><span>Ref en sitio / identificador</span><input id="ccor-ec-form-manual-ref" list="ccor-ec-form-manual-ref-list" placeholder="Referencia o id_ins_fl"><datalist id="ccor-ec-form-manual-ref-list">${manualEquipmentReferenceOptions_cor()}</datalist></label>
            <label><span>PHNS</span><select id="ccor-ec-form-manual-phns">${logOpsOptions_cor(null,'Selecciona PHNS...')}</select></label>
            <button type="button" class="ccor-ec-btn ccor-ec-btn-primary" id="ccor-ec-form-manual-apply">Aplicar relación</button>
          </div>
          <div id="ccor-ec-form-equipment-status" class="ccor-ec-form-phns-status" aria-live="polite"></div>
          <div class="ccor-ec-table-wrap">
            <table class="ccor-ec-table ccor-ec-form-equipment-table">
              <thead><tr><th>Incluir</th><th>Ref en sitio / identificador</th><th>PHNS</th><th>Origen</th></tr></thead>
              <tbody id="ccor-ec-form-equipment-body"></tbody>
            </table>
          </div>
        </section>

        <section class="ccor-ec-card ccor-ec-form-section">
          <div class="ccor-ec-form-section-title">
            <div><b>Hitos de cobranza</b><span>Captura del Hito. Facturación, pagos y sus estatus quedan fuera de Crear/Editar.</span></div>
            <button type="button" class="ccor-ec-btn ccor-ec-btn-primary" id="ccor-ec-form-add-hito">+ Agregar hito</button>
          </div>
          <div id="ccor-ec-form-percentage-validation" class="ccor-ec-form-percentage-validation" aria-live="polite"></div>
          <div class="ccor-ec-table-wrap">
            <table class="ccor-ec-table ccor-ec-form-hitos-table">
              <thead><tr>
                <th>#</th><th>Hito / Condición</th><th>%</th><th>Año</th><th>Moneda</th><th>Subtotal</th><th>IVA</th><th>Total</th>
                <th>Factura</th><th>Fecha venc.</th><th>Días venc.</th><th>Estimado pago</th><th>Fecha programada</th><th>Fecha notificada</th><th>Base General</th><th>Acciones</th>
              </tr></thead>
              <tbody id="ccor-ec-form-hitos-body"></tbody>
            </table>
          </div>
        </section>
      </div>`;

    const ppnsSelect=document.getElementById('ccor-ec-form-ppns');
    if(!editing&&ppnsSelect&&ppnsValue) ppnsSelect.value=ppnsValue;
    renderEquipos_cor();
    renderPartidas_cor();
    renderHitos_cor();
    renderTotals_cor();
    renderCurrencyValidation_cor();
    syncFondoGarantiaControls_cor();
    setContext_cor();
  }

  function partidaCurrencyOptions_cor(selected){
    const value=String(selected||'').toUpperCase();
    return ['MXN','USD','EUR'].map(currency=>`<option value="${currency}"${value===currency?' selected':''}>${currency}</option>`).join('');
  }

  function renderPartidas_cor(){
    const body=document.getElementById('ccor-ec-form-partidas-body');
    if(!body) return;
    if(!state.partidas.length){
      body.innerHTML='<tr><td colspan="4" class="ccor-ec-table-empty">Sin partidas monetarias. Puedes agregar MXN, USD o EUR; se permiten varias filas de la misma moneda.</td></tr>';
      return;
    }
    body.innerHTML=state.partidas.map((row,index)=>`
      <tr data-partida-index="${index}">
        <td class="ccor-ec-form-order">${index+1}${row.id_partida_cor?`<small class="ccor-ec-form-id">#${escapeHtml_cor(row.id_partida_cor)}</small>`:''}</td>
        <td><select data-partida-field="moneda">${partidaCurrencyOptions_cor(row.moneda)}</select></td>
        <td><input type="number" min="0" step="0.01" data-partida-field="monto_base" value="${escapeHtml_cor(row.monto_base)}" placeholder="0.00"></td>
        <td><button type="button" class="ccor-ec-form-remove" data-partida-remove title="Quitar partida">×</button></td>
      </tr>`).join('');
  }

  function insFlOptions_cor(selectedId){
    const options=['<option value="">Selecciona PHNS de Instalaciones</option>'];
    let found=false;
    state.insFlCatalog.forEach(row=>{
      const selected=Number(selectedId)===Number(row.id_ins_fl);
      if(selected) found=true;
      const label=[row.referencia_sitio,row.capacidad_kg?row.capacidad_kg+' kg':'',row.estatus_equipo_entrega||row.estatus]
        .map(v=>String(v||'').trim()).filter(Boolean).join(' · ');
      options.push(`<option value="${escapeHtml_cor(row.id_ins_fl)}"${selected?' selected':''}>${escapeHtml_cor(label||('Instalaciones '+row.id_ins_fl))}</option>`);
    });
    if(selectedId&&!found) options.push(`<option value="${escapeHtml_cor(selectedId)}" selected>PHNS anterior no disponible · ins_fl #${escapeHtml_cor(selectedId)}</option>`);
    return options.join('');
  }

  function normalizedLogOpsPhns_cor(row){
    const seen=new Set();
    return splitLogOpsPhns_cor(row&&row.ph_ns)
      .filter(id=>/^P\d+$/.test(id)&&!seen.has(id)&&seen.add(id));
  }

  function logOpsEquipmentIds_cor(){
    const ids=[];
    const seen=new Set();
    (Array.isArray(state.logOps)?state.logOps:[]).forEach(row=>{
      normalizedLogOpsPhns_cor(row).forEach(id=>{
        if(seen.has(id)) return;
        seen.add(id);
        ids.push(id);
      });
    });
    return ids;
  }

  function logOpsOptions_cor(selectedId,emptyLabel='Sin PHNS relacionado'){
    const options=[`<option value="">${escapeHtml_cor(emptyLabel)}</option>`];
    const seenLabels=new Set();
    let selectedFound=false;
    (Array.isArray(state.logOps)?state.logOps:[]).forEach(row=>{
      const ids=normalizedLogOpsPhns_cor(row);
      if(!ids.length) return;
      const label=ids.join(', ');
      const canonical=label.toUpperCase();
      const id=Number(row&&row.id_log_ops);
      if(!Number.isInteger(id)||id<=0) return;
      if(seenLabels.has(canonical)&&Number(selectedId)!==id) return;
      seenLabels.add(canonical);
      const selected=Number(selectedId)===id;
      if(selected) selectedFound=true;
      options.push(`<option value="${escapeHtml_cor(id)}"${selected?' selected':''}>${escapeHtml_cor(label)}</option>`);
    });
    if(selectedId&&!selectedFound){
      const previous=logOpsById_cor(selectedId);
      const ids=normalizedLogOpsPhns_cor(previous);
      options.push(`<option value="${escapeHtml_cor(selectedId)}" selected>${escapeHtml_cor(ids.length?ids.join(', '):('log_ops #'+selectedId+' · PHNS no disponible'))}</option>`);
    }
    return options.join('');
  }

  function equipmentReference_cor(row){
    const ref=String(row&&row.referencia_sitio||'').trim();
    if(ref) return ref;
    const id=Number(row&&row.id_ins_fl);
    return Number.isInteger(id)&&id>0?'ins_fl #'+id:'Sin referencia';
  }

  function manualEquipmentReferenceOptions_cor(){
    return (Array.isArray(state.insFlCatalog)?state.insFlCatalog:[]).map(row=>{
      const id=Number(row&&row.id_ins_fl);
      const ref=String(row&&row.referencia_sitio||'').trim();
      const value=ref||String(id||'');
      const label=ref&&id?`${ref} · ins_fl #${id}`:(ref||(`ins_fl #${id}`));
      return `<option value="${escapeHtml_cor(value)}">${escapeHtml_cor(label)}</option>`;
    }).join('');
  }

  function findEquipmentIndexByReference_cor(value){
    const raw=String(value||'').trim();
    if(!raw) return -1;
    const numeric=Number(raw.replace(/^#?/,''));
    const normalized=normalizePhns_cor(raw);
    return state.equipos.findIndex(row=>{
      const id=Number(row&&row.id_ins_fl);
      const ref=normalizePhns_cor(row&&row.referencia_sitio);
      if(Number.isInteger(numeric)&&numeric>0&&id===numeric) return true;
      if(normalized===normalizePhns_cor('ins_fl #'+id)) return true;
      return Boolean(ref&&ref===normalized);
    });
  }

  function applyManualEquipmentRelation_cor(){
    const refInput=document.getElementById('ccor-ec-form-manual-ref');
    const phnsSelect=document.getElementById('ccor-ec-form-manual-phns');
    const reference=String(refInput&&refInput.value||'').trim();
    const idLogOps=Number(phnsSelect&&phnsSelect.value||0);
    if(!reference){setStatus_cor('Captura la Ref en sitio o identificador del equipo.','error');return false;}
    const index=findEquipmentIndexByReference_cor(reference);
    if(index<0){
      setStatus_cor('La referencia manual debe corresponder a un equipo existente en ins_fl para este PPNS. No se crean equipos fuera de Instalaciones.','error');
      return false;
    }
    if(!Number.isInteger(idLogOps)||idLogOps<=0){setStatus_cor('Selecciona el PHNS que se relacionará con el equipo.','error');return false;}
    const duplicate=state.equipos.findIndex((row,rowIndex)=>rowIndex!==index&&row.incluir!==false&&Number(row.id_log_ops)===idLogOps);
    if(duplicate>=0){
      setStatus_cor('Ese registro PHNS ya está relacionado con otro equipo incluido. Revisa la relación antes de continuar.','error');
      return false;
    }
    state.equipos[index].incluir=true;
    state.equipos[index].id_log_ops=idLogOps;
    if(refInput) refInput.value='';
    if(phnsSelect) phnsSelect.value='';
    renderEquipos_cor();
    renderTotals_cor();
    setStatus_cor('Relación manual aplicada. Se guardará junto con el Estado de Cuenta.','');
    return true;
  }

  function renderEquipos_cor(){
    const body=document.getElementById('ccor-ec-form-equipment-body');
    const status=document.getElementById('ccor-ec-form-equipment-status');
    if(!body) return;
    if(!state.equipos.length){
      body.innerHTML='<tr><td colspan="4" class="ccor-ec-table-empty">No hay equipos activos registrados en ins_fl para este PPNS.</td></tr>';
      if(status){status.className='ccor-ec-form-phns-status is-warning';status.textContent='No se recibieron equipos desde ins_fl.';}
      return;
    }
    const availableLogOps=(Array.isArray(state.logOps)?state.logOps:[]).filter(row=>normalizedLogOpsPhns_cor(row).length);
    body.innerHTML=state.equipos.map((row,index)=>`
      <tr data-equipo-index="${index}">
        <td><input type="checkbox" data-equipo-include ${row.incluir===false?'':'checked'}></td>
        <td class="ccor-ec-form-equipment-ref"><b>${escapeHtml_cor(equipmentReference_cor(row))}</b><small>id_ins_fl: ${escapeHtml_cor(row.id_ins_fl||'—')}</small></td>
        <td><select data-equipo-logops>${logOpsOptions_cor(row.id_log_ops)}</select></td>
        <td>${escapeHtml_cor(row.source_missing?'Relación histórica':'Instalaciones')}</td>
      </tr>`).join('');
    if(status){
      status.className='ccor-ec-form-phns-status'+(availableLogOps.length?' is-ok':' is-warning');
      status.textContent=availableLogOps.length
        ? `${state.equipos.length} equipo(s) de ins_fl cargados · ${logOpsEquipmentIds_cor().length} PHNS únicos disponibles en log_ops.ph_ns.`
        : `${state.equipos.length} equipo(s) de ins_fl cargados · sin PHNS Pxxxxx disponibles en log_ops.ph_ns.`;
    }
  }

  async function refreshEquipmentSources_cor(options={}){
    const ppns=String(state.ppns||document.getElementById('ccor-ec-form-ppns')?.value||'').trim();
    if(!ppns||state.alignmentInFlight||state.loading||state.saving) return false;
    state.alignmentInFlight=true;
    if(!options.silent) setStatus_cor('Revisando PHNS contra Instalaciones y Logística...','loading');
    try{
      const path=state.mode==='edit'
        ? API_BASE+'/'+encodeURIComponent(ppns)+'/formulario'
        : API_CREATE_CATALOG+'?ppns='+encodeURIComponent(ppns);
      const response=await apiGet_cor(path);
      if(!isActive_cor()) return false;
      const source=state.mode==='edit'?response:(response&&response.seleccion?response.seleccion:{});
      const equipmentRows=state.mode==='edit'
        ? (Array.isArray(response&&response.equipos_disponibles)?response.equipos_disponibles:[])
        : (Array.isArray(source&&source.equipos)?source.equipos:[]);
      const logOpsRows=Array.isArray(source&&source.log_ops)?source.log_ops:[];
      state.logOps=logOpsRows;
      state.equipos=mergeEquipos_cor(equipmentRows,true);
      state.alignmentLastCheck=new Date();
      state.alignmentError='';
      renderEquipos_cor();
      renderTotals_cor();
      if(!options.silent) setStatus_cor('','');
      return true;
    }catch(error){
      state.alignmentError=errorMessage_cor(error,'load');
      renderEquipos_cor();
      if(!options.silent) setStatus_cor(state.alignmentError,'error');
      return false;
    }finally{
      state.alignmentInFlight=false;
    }
  }

  function startEquipmentAlignmentPolling_cor(){
    stopEquipmentAlignmentPolling_cor();
  }

  function activeGeneralCurrencies_cor(){
    const seen=new Set();
    const result=[];
    state.partidas.forEach(row=>{
      const currency=String(row&&row.moneda||'').trim().toUpperCase();
      if(!['MXN','USD','EUR'].includes(currency)||seen.has(currency)) return;
      seen.add(currency);result.push(currency);
    });
    return result;
  }

  function generalBaseByCurrency_cor(currency){
    const target=String(currency||'').trim().toUpperCase();
    return Math.round((state.partidas.reduce((sum,row)=>{
      if(String(row&&row.moneda||'').trim().toUpperCase()!==target) return sum;
      const amount=Number(row&&row.monto_base);
      return sum+(Number.isFinite(amount)?amount:0);
    },0)+Number.EPSILON)*100)/100;
  }

  function hitoCurrencyOptions_cor(selected){
    const value=String(selected||'').trim().toUpperCase();
    const currencies=activeGeneralCurrencies_cor();
    const options=['<option value="">Sin moneda</option>'];
    if(value&&!currencies.includes(value)) options.push(`<option value="${escapeHtml_cor(value)}" selected>${escapeHtml_cor(value)} · sin partida en General</option>`);
    currencies.forEach(currency=>options.push(`<option value="${currency}"${currency===value?' selected':''}>${currency}</option>`));
    return options.join('');
  }

  function recalculateHitoFinancials_cor(row){
    if(!row) return;
    const currency=String(row.moneda||'').trim().toUpperCase();
    const pctRaw=String(row.porcentaje??'').trim();
    const pct=Number(pctRaw);
    if(!currency||pctRaw===''||!Number.isFinite(pct)||pct<0){
      row.subtotal='';row.iva='';row.total='';return;
    }
    const base=generalBaseByCurrency_cor(currency);
    const subtotal=Math.round((base*(pct/100)+Number.EPSILON)*100)/100;
    row.subtotal=subtotal.toFixed(2);
    const ivaPct=state.ivaGeneralPct===''?null:Number(state.ivaGeneralPct);
    if(ivaPct===null||!Number.isFinite(ivaPct)){
      row.iva='';row.total='';return;
    }
    const iva=Math.round((subtotal*ivaPct+Number.EPSILON)*100)/100;
    row.iva=iva.toFixed(2);
    row.total=(Math.round((subtotal+iva+Number.EPSILON)*100)/100).toFixed(2);
  }

  function recalculateAllHitos_cor(){ state.hitos.forEach(recalculateHitoFinancials_cor); }


  function hitoInput_cor(type,field,value,extra){
    return `<input type="${type}" data-hito-field="${field}" value="${escapeHtml_cor(value===null||value===undefined?'':value)}" ${extra||''}>`;
  }

  function renderHitos_cor(){
    const body=document.getElementById('ccor-ec-form-hitos-body');
    if(!body) return;
    if(!state.hitos.length){
      body.innerHTML='<tr><td colspan="16" class="ccor-ec-table-empty">Sin hitos de cobranza. Agrega los que correspondan.</td></tr>';
      return;
    }
    recalculateAllHitos_cor();
    body.innerHTML=state.hitos.map((row,index)=>`
      <tr data-hito-index="${index}">
        <td>${hitoInput_cor('number','orden_hito',row.orden_hito,'min="1" step="1" placeholder="Orden"')}${row.id_fuente_cor?`<small class="ccor-ec-form-id">#${escapeHtml_cor(row.id_fuente_cor)}</small>`:''}</td>
        <td>${hitoInput_cor('text','condicion',row.condicion,'maxlength="500" placeholder="Condición / Hito"')}</td>
        <td>${hitoInput_cor('number','porcentaje',row.porcentaje,'min="0" max="100" step="0.01"')}</td>
        <td>${hitoInput_cor('number','anio_proyecto',row.anio_proyecto,'min="1900" max="2500" step="1"')}</td>
        <td><select data-hito-field="moneda">${hitoCurrencyOptions_cor(row.moneda)}</select></td>
        <td>${hitoInput_cor('number','subtotal',row.subtotal,'step="0.01" readonly tabindex="-1"')}</td>
        <td>${hitoInput_cor('number','iva',row.iva,'step="0.01" readonly tabindex="-1"')}</td>
        <td>${hitoInput_cor('number','total',row.total,'step="0.01" readonly tabindex="-1"')}</td>
        <td>${hitoInput_cor('text','factura',row.factura,'maxlength="150" readonly tabindex="-1" placeholder="Se llenará desde Facturas relacionadas"')}</td>
        <td>${hitoInput_cor('date','fecha_vencimiento',row.fecha_vencimiento,'')}</td>
        <td>${hitoInput_cor('number','dias_vencimiento',row.dias_vencimiento,'step="1"')}</td>
        <td>${hitoInput_cor('text','estimado_pago',row.estimado_pago,'maxlength="100"')}</td>
        <td>${hitoInput_cor('date','fecha_programada',row.fecha_programada,'')}</td>
        <td>${hitoInput_cor('date','fecha_notificada',row.fecha_notificada,'')}</td>
        <td class="ccor-ec-form-hito-source"><small>Base ${escapeHtml_cor(String(row.moneda||'').toUpperCase()||'—')}: ${escapeHtml_cor(formatAmount_cor(generalBaseByCurrency_cor(row.moneda)))}</small></td>
        <td><button type="button" class="ccor-ec-form-remove" data-hito-remove title="Quitar hito">×</button></td>
      </tr>`).join('');
  }

  function syncTotalFromAmounts_cor(index){
    const row=state.hitos[index];
    if(!row) return;
    recalculateHitoFinancials_cor(row);
  }

  function currencyCoverage_cor(){
    const currencies=activeGeneralCurrencies_cor();
    const result=new Map(currencies.map(currency=>[currency,0]));
    state.hitos.forEach(row=>{
      const currency=String(row&&row.moneda||'').trim().toUpperCase();
      const raw=String((row&&row.porcentaje)??'').trim();
      const value=Number(raw);
      if(!result.has(currency)||raw===''||!Number.isFinite(value)) return;
      result.set(currency,(result.get(currency)||0)+value);
    });
    return result;
  }

  function currencyValidationOk_cor(){
    const coverage=currencyCoverage_cor();
    if(!coverage.size) return true;
    return [...coverage.values()].every(value=>Math.abs(value-100)<=0.0001);
  }

  function renderCurrencyValidation_cor(){
    const host=document.getElementById('ccor-ec-form-percentage-validation');
    const button=document.getElementById('ccor-ec-form-save');
    const coverage=currencyCoverage_cor();
    const allOk=currencyValidationOk_cor();
    if(host){
      if(!coverage.size){
        host.innerHTML='<strong>Validación 100% por moneda</strong><span class="ccor-ec-form-pct-badge">Sin monedas en General</span><span class="ccor-ec-form-pct-note">Al agregar partidas, cada moneda deberá distribuirse exactamente al 100% entre sus Hitos.</span>';
      }else{
        const badges=[...coverage.entries()].map(([currency,value])=>{
          const rounded=Math.round((value+Number.EPSILON)*100)/100;
          const ok=Math.abs(value-100)<=0.0001;
          const delta=Math.round((100-value+Number.EPSILON)*100)/100;
          const detail=ok?'Correcto':(delta>0?`Falta ${delta}%`:`Excede ${Math.abs(delta)}%`);
          return `<span class="ccor-ec-form-pct-badge ${ok?'is-ok':'is-error'}">${escapeHtml_cor(currency)} ${escapeHtml_cor(rounded)}% / 100% · ${escapeHtml_cor(detail)}</span>`;
        }).join('');
        host.innerHTML=`<strong>Validación 100% por moneda</strong>${badges}<span class="ccor-ec-form-pct-note">No se permite guardar mientras alguna moneda de General sea distinta de 100%.</span>`;
      }
    }
    if(button) button.disabled=Boolean(state.saving)||!allOk;
    return allOk;
  }

  function renderTotals_cor(){
    const totals=new Map();
    state.partidas.forEach(row=>{
      const currency=String(row.moneda||'').trim().toUpperCase();
      const amount=Number(row.monto_base||0);
      if(!currency||!Number.isFinite(amount)) return;
      totals.set(currency,(totals.get(currency)||0)+amount);
    });
    const mxn=document.getElementById('ccor-ec-form-total-mxn');
    if(mxn) mxn.textContent=formatMoney_cor(totals.get('MXN')||0,'MXN');
    const foreign=document.getElementById('ccor-ec-form-total-foreign');
    if(foreign){
      const rows=[...totals.entries()].filter(([currency])=>currency!=='MXN').sort((a,b)=>a[0].localeCompare(b[0]));
      foreign.innerHTML=rows.length
        ? rows.map(([currency,total])=>`<div><span>${escapeHtml_cor(currency)}</span><b>${escapeHtml_cor(formatMoney_cor(total,currency))}</b></div>`).join('')
        : '<b>Sin partidas</b>';
    }
    const hitosTotal=document.getElementById('ccor-ec-form-hitos-total');
    if(hitosTotal) hitosTotal.value=String(state.hitos.length);
    const equiposTotal=document.getElementById('ccor-ec-form-equipos-total');
    if(equiposTotal) equiposTotal.value=String(state.equipos.filter(row=>row.incluir!==false).length);
    renderCurrencyValidation_cor();
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
        state.alignmentLastCheck=new Date();
        state.alignmentError='';
      }
      renderShell_cor();
      if(ppns) startEquipmentAlignmentPolling_cor();
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
      state.alignmentLastCheck=new Date();
      state.alignmentError='';
      const rawHitos=Array.isArray(response&&response.hitos)?response.hitos:[];
      applyFondoGarantiaFromRows_cor(rawHitos);
      state.hitos=rawHitos.map(normalizeHitoFromApi_cor);
      state.deletedHitos=[];
      state.partidas=Array.isArray(response&&response.partidas)?response.partidas.map(normalizePartidaFromApi_cor):[];
      state.deletedPartidas=[];
      state.ivaGeneralPct=ivaGeneralValue_cor(response&&response.iva_general_pct);
      state.ivaGeneralMixed=Boolean(response&&response.iva_general_mixed);
      recalculateAllHitos_cor();
      renderShell_cor();
      startEquipmentAlignmentPolling_cor();
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
    if(field==='porcentaje'||field==='moneda'){
      recalculateHitoFinancials_cor(state.hitos[index]);
      renderHitos_cor();
    }
    renderTotals_cor();
    renderCurrencyValidation_cor();
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
    const ivaGeneralPct=state.ivaGeneralPct===''?null:Number(state.ivaGeneralPct);
    const porcentajeFondoGarantia=fondoGarantia
      ? (String(state.porcentajeFondoGarantia??'').trim()===''?0:Number(state.porcentajeFondoGarantia)/100)
      : 0;

    const partidas=state.partidas.map((row,index)=>({
      id_partida_cor:row.id_partida_cor||null,
      orden:index+1,
      moneda:String(row.moneda||'').trim().toUpperCase()||null,
      monto_base:nullableNumber_cor(row.monto_base)
    })).concat(state.deletedPartidas.map(row=>({id_partida_cor:Number(row.id_partida_cor),eliminar:true})));

    recalculateAllHitos_cor();
    const hitos=state.hitos.map((row,index)=>({
      id_fuente_cor:row.id_fuente_cor||null,
      orden_hito:String(row.orden_hito??'').trim()===''?null:Number(row.orden_hito),
      condicion:String(row.condicion||'').trim()||null,
      porcentaje:String(row.porcentaje??'').trim()===''?null:Number(row.porcentaje)/100,
      anio_proyecto:String(row.anio_proyecto??'').trim()===''?null:Number(row.anio_proyecto),
      moneda:String(row.moneda||'').trim().toUpperCase()||null,
      subtotal:nullableNumber_cor(row.subtotal),
      iva:nullableNumber_cor(row.iva),
      total:nullableNumber_cor(row.total),
      fecha_vencimiento:String(row.fecha_vencimiento||'').trim()||null,
      dias_vencimiento:String(row.dias_vencimiento??'').trim()===''?null:Number(row.dias_vencimiento),
      estimado_pago:String(row.estimado_pago||'').trim()||null,
      fecha_programada:String(row.fecha_programada||'').trim()||null,
      fecha_notificada:String(row.fecha_notificada||'').trim()||null
    })).concat(state.deletedHitos.map(row=>({id_fuente_cor:Number(row.id_fuente_cor),eliminar:true})));

    const equipos=[];
    state.equipos.forEach((row,index)=>{
      if(!row.id_equipo_cor&&row.incluir===false) return;
      equipos.push({
        id_equipo_cor:row.id_equipo_cor||null,
        id_ins_fl:Number(row.id_ins_fl)||null,
        id_log_ops:row.id_log_ops?Number(row.id_log_ops):null,
        orden:index+1,
        ubicacion_torre:null,
        activo:row.incluir!==false
      });
    });

    return {
      ppns,proyecto,cliente,contractual,
      fondo_garantia:fondoGarantia,
      porcentaje_fondo_garantia:porcentajeFondoGarantia,
      iva_general_pct:ivaGeneralPct,
      partidas,hitos,equipos
    };
  }

  function validatePayload_cor(payload){
    if(!payload.ppns) return 'Selecciona un PPNS.';
    const fondoError=validateFondoGarantiaGeneral_cor();
    if(fondoError) return fondoError;
    if(state.ivaGeneralMixed) return 'Selecciona un IVA general de 0%, 8% o 16% para unificar los datos existentes.';
    if(payload.iva_general_pct!==null&&![0,0.08,0.16].some(value=>Math.abs(value-payload.iva_general_pct)<0.0000005)) return 'El IVA general debe ser 0%, 8% o 16%.';
    if(payload.fondo_garantia===true){
      if(payload.porcentaje_fondo_garantia===null||!Number.isFinite(payload.porcentaje_fondo_garantia)||payload.porcentaje_fondo_garantia<0) return 'Revisa el porcentaje de Fondo de Garantía.';
      if(payload.porcentaje_fondo_garantia>0.10) return 'El Fondo de Garantía supera el tope de 10%. Requiere autorización antes de guardar.';
    }

    const activePartidas=(payload.partidas||[]).filter(row=>row.eliminar!==true);
    const currencies=[];
    const currencySet=new Set();
    for(let index=0;index<activePartidas.length;index+=1){
      const row=activePartidas[index];
      const currency=String(row.moneda||'').toUpperCase();
      if(!['MXN','USD','EUR'].includes(currency)) return `Revisa la moneda de la partida ${index+1}.`;
      if(row.monto_base===null||!Number.isFinite(row.monto_base)||row.monto_base<0) return `Revisa el monto base de la partida ${index+1}.`;
      if(!currencySet.has(currency)){currencySet.add(currency);currencies.push(currency);}
    }

    const activeHitos=(payload.hitos||[]).filter(row=>row.eliminar!==true);
    if(!activeHitos.length) return 'El Estado de Cuenta debe conservar al menos un hito.';
    const pctByCurrency=new Map(currencies.map(currency=>[currency,0]));
    for(let index=0;index<activeHitos.length;index+=1){
      const row=activeHitos[index];
      if(row.orden_hito!==null&&(!Number.isInteger(row.orden_hito)||row.orden_hito<1)) return `Revisa el orden del hito de la fila ${index+1}.`;
      if(row.porcentaje!==null&&(!Number.isFinite(row.porcentaje)||row.porcentaje<0||row.porcentaje>1)) return `El porcentaje de la fila ${index+1} debe estar entre 0% y 100%.`;
      if(row.anio_proyecto!==null&&(!Number.isInteger(row.anio_proyecto)||row.anio_proyecto<1900||row.anio_proyecto>2500)) return `Revisa el año de la fila ${index+1}.`;
      if(row.moneda&&!currencySet.has(row.moneda)) return `La moneda ${row.moneda} de la fila ${index+1} no existe en General.`;
      if(row.porcentaje!==null&&!row.moneda) return `Selecciona la moneda de la fila ${index+1} para aplicar su porcentaje.`;
      if(row.moneda&&row.porcentaje!==null) pctByCurrency.set(row.moneda,(pctByCurrency.get(row.moneda)||0)+row.porcentaje);
      if(row.dias_vencimiento!==null&&!Number.isInteger(row.dias_vencimiento)) return `Días de vencimiento de la fila ${index+1} debe ser entero.`;
    }
    for(const currency of currencies){
      const pct=pctByCurrency.get(currency)||0;
      if(Math.abs(pct-1)>0.000001){
        const display=Math.round(pct*1000000)/10000;
        return `Los porcentajes de ${currency} deben sumar exactamente 100%. Actualmente suman ${display}%.`;
      }
    }
    const activeEquipos=(payload.equipos||[]).filter(row=>row.activo!==false);
    const usedInsFl=new Set();
    for(let index=0;index<activeEquipos.length;index+=1){
      const row=activeEquipos[index];
      if(!row.id_ins_fl) return `El equipo ${index+1} no tiene un id_ins_fl válido.`;
      if(usedInsFl.has(row.id_ins_fl)) return `El equipo ins_fl #${row.id_ins_fl} está repetido.`;
      usedInsFl.add(row.id_ins_fl);
    }
    return '';
  }

  async function save_cor(){
    if(state.saving||state.loading||isViewerReadonly_cor()) return false;
    if(!renderCurrencyValidation_cor()){setStatus_cor('No puedes guardar: cada moneda de General debe sumar exactamente 100% entre sus Hitos.','error');return false;}
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
      if(event.target.closest('#ccor-ec-form-manual-apply')){applyManualEquipmentRelation_cor();return;}
      if(event.target.closest('#ccor-ec-form-refresh-phns')){refreshEquipmentSources_cor({silent:false});return;}
      if(event.target.closest('#ccor-ec-form-add-partida')){
        state.partidas.push(emptyPartida_cor());
        renderPartidas_cor();renderTotals_cor();return;
      }
      const removePartida=event.target.closest('[data-partida-remove]');
      if(removePartida){
        const tr=removePartida.closest('[data-partida-index]');
        const index=Number(tr&&tr.dataset.partidaIndex);
        if(Number.isInteger(index)&&index>=0&&state.partidas[index]){
          const current=state.partidas[index];
          if(current.id_partida_cor) state.deletedPartidas.push({id_partida_cor:current.id_partida_cor});
          state.partidas.splice(index,1);
          renderPartidas_cor();renderTotals_cor();
        }
        return;
      }
      if(event.target.closest('#ccor-ec-form-add-hito')){
        const row=emptyHito_cor();
        row.orden_hito=String(state.hitos.length+1);
        state.hitos.push(row);
        renderHitos_cor();renderTotals_cor();renderCurrencyValidation_cor();return;
      }
      const remove=event.target.closest('[data-hito-remove]');
      if(remove){
        const tr=remove.closest('[data-hito-index]');
        const index=Number(tr&&tr.dataset.hitoIndex);
        if(Number.isInteger(index)&&index>=0&&state.hitos[index]){
          const current=state.hitos[index];
          if(current.id_fuente_cor) state.deletedHitos.push({id_fuente_cor:current.id_fuente_cor});
          state.hitos.splice(index,1);
          renderHitos_cor();renderTotals_cor();renderCurrencyValidation_cor();
        }
      }
    });

    state.root.addEventListener('change',event=>{
      if(event.target.id==='ccor-ec-form-iva-general'){
        state.ivaGeneralPct=String(event.target.value||'');
        state.ivaGeneralMixed=false;
        const warning=document.getElementById('ccor-ec-form-iva-warning');
        if(warning){warning.hidden=true;warning.textContent='';}
        event.target.removeAttribute('aria-invalid');
        recalculateAllHitos_cor();renderHitos_cor();
        return;
      }
      if(event.target.matches('[data-partida-field]')){
        const tr=event.target.closest('[data-partida-index]');
        const index=Number(tr&&tr.dataset.partidaIndex);
        if(Number.isInteger(index)&&state.partidas[index]){
          state.partidas[index][event.target.dataset.partidaField]=event.target.dataset.partidaField==='moneda'
            ? String(event.target.value||'').toUpperCase()
            : event.target.value;
          recalculateAllHitos_cor();renderHitos_cor();renderTotals_cor();
        }
        return;
      }
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
        stopEquipmentAlignmentPolling_cor();
        state.ppns=ppns;
        state.proyecto=null;state.equipos=[];state.relaciones=[];state.insFlCatalog=[];state.logOps=[];
        state.alignmentLastCheck=null;state.alignmentError='';
        state.partidas=[];state.deletedPartidas=[];state.ivaGeneralPct='';state.ivaGeneralMixed=false;
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
        if(event.target.matches('[data-equipo-logops]')){
          equipment.id_log_ops=event.target.value?Number(event.target.value):null;
          if(equipment.id_log_ops) equipment.incluir=true;
        }
        renderEquipos_cor();
        renderTotals_cor();
      }
      if(event.target.matches('[data-hito-field]')) updateHitoFromInput_cor(event.target);
    });

    state.root.addEventListener('input',event=>{
      if(event.target.matches('[data-partida-field="monto_base"]')){
        const tr=event.target.closest('[data-partida-index]');
        const index=Number(tr&&tr.dataset.partidaIndex);
        if(Number.isInteger(index)&&state.partidas[index]){
          state.partidas[index].monto_base=event.target.value;
          recalculateAllHitos_cor();renderHitos_cor();renderTotals_cor();
        }
        return;
      }
      if(event.target.id==='ccor-ec-form-porcentaje-fondo-garantia'){
        state.porcentajeFondoGarantia=event.target.value;
        const error=validateFondoGarantiaGeneral_cor();
        event.target.setAttribute('aria-invalid',error?'true':'false');
        setStatus_cor(error,error?'error':'');
        return;
      }
      if(event.target.matches('[data-hito-field]')) updateHitoFromInput_cor(event.target);
    });
  }

  async function init_cor(options){
    if(!isActive_cor()) return false;
    const root=document.getElementById('view-placeholder');
    if(!root) return false;
    state.root=root;
    ensureEquiposValidationStyles_cor();
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


/* [Aster | 2026-09-30 | ASTER-MG | COBRANZA COR FASE 3 CONSOLIDACION CREAR EDITAR V001] */
