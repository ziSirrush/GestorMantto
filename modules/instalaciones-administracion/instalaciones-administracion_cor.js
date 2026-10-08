(function(){
  'use strict';

  const VERSION_COR = '20261008-fase3-v001';
  const API_BASE = (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  const SEARCH_LIMIT_COR = 25;

  const FIELD_LABELS_COR = Object.freeze({
    proyecto:'Proyecto', id_proyecto:'PP NS', referencia_sitio:'Referencia en sitio', nomenclatura:'Nomenclatura', categoria:'Categoría', estatus:'Estatus', estatus_completo:'Estatus completo', activo:'Activo',
    fecha_visita:'Última visita', comentarios_fl:'Comentarios FL', avance_oc:'Avance OC', avance_mo:'Avance MO', avance_aj:'Avance AJ', dias_sin_visita:'Días sin visita', dias_sin_ccnr:'Días sin CCNR',
    cliente:'Cliente', cliente_ns:'Cliente NS', vendedor:'Vendedor', numero_contrato:'No. de contrato', carpeta_fisica:'Carpeta física', recepcion_carpeta:'Recepción de carpeta', ov_ns:'OV NS', ph_ns:'PH NS',
    estado:'Estado / clave', estado_localizacion:'Estado de localización', ciudad:'Ciudad', direccion_proyecto:'Dirección del proyecto', contacto_cliente_sitio:'Contacto del cliente en sitio',
    tipo_equipo:'Tipo de equipo', numero_equipo_fabrica:'No. equipo de fábrica', marca:'Marca', modelo:'Modelo', numero_pisos:'No. pisos', numero_desembarques:'No. desembarques', numero_puertas:'No. puertas', velocidad_ms:'Velocidad [m/s]', capacidad_kg:'Capacidad [kg]', entrepiso_mm:'Entrepiso [mm]', longitud_mm:'Longitud [mm]', ancho_peldano_mm:'Ancho de peldaño [mm]', funcionamiento:'Funcionamiento', equipos_mojados:'Equipos mojados',
    estatus_produccion:'Estatus de producción', fecha_descarga:'Fecha de descarga', fecha_colocacion_esc_ramp:'Colocación ESC/RAMP', fecha_cpvp:'Carta de primera visita (CPVP)', fecha_posible_recepcion_cubo:'Posible recepción de cubo', fecha_ccnr:'Carta cubo no recibido (CCNR)', fecha_ccr:'Carta cubo recibido (CCR)', condiciones_obra:'Condiciones de obra',
    subcontratista:'Subcontratista', semanas_instalacion:'Semanas de instalación', fecha_inicio_montaje:'Inicio de montaje', fecha_fin_montaje_planeado:'Fin de montaje planeado', fecha_fin_montaje_modificado:'Fin de montaje modificado', fecha_fin_montaje_real:'Fin de montaje real', dias_restantes:'Días restantes', fecha_cti:'Carta término instalación (CTI)', fecha_revision_supervisor:'Revisión por supervisor', evaluacion_subcontrato:'Evaluación de subcontrato', minuta_interfon:'Minuta interfon',
    fecha_posible_inicio_ajuste:'Posible inicio de ajuste', fecha_minuta_revision_ajuste:'Minuta revisión por ajuste', fecha_liberacion_ajuste:'Liberado por ajuste', ajustador:'Ajustador', fecha_inicio_ajuste:'Inicio de ajuste', fecha_fin_ajuste_planeado:'Fin de ajuste planeado', fecha_fin_ajuste_modificado:'Fin de ajuste modificado', fecha_fin_ajuste_real:'Fin de ajuste real', fecha_reporte_ajuste:'Reporte de ajuste', fecha_protocolo_aceptacion:'Protocolo de aceptación', estatus_inspeccion_calidad:'Estatus de inspección de calidad', pendientes_calidad:'Pendientes de calidad', certificado_regulador:'Certificado del regulador',
    proyeccion_entrega:'Proyección de entrega', fecha_entrega_cliente:'Entrega al cliente', formato_caf_pg:'Formato CAF-PG', estatus_equipo_entrega:'Estatus de equipo en entrega', anio_termino:'Año de término', meses_mantenimiento_gratuito:'Meses mantenimiento gratuito', meses_garantia_actas:'Meses garantía actas', meses_garantia_sitio:'Meses garantía en sitio', meses_garantia_restantes:'Meses garantía restantes', codigo_mantenimiento:'Código de mantenimiento',
    presupuesto_mantenimiento_cem:'Presupuesto de mantenimiento CEM', costo_mensual_mantenimiento_cem:'Costo mensual de mantenimiento CEM',
    supervisor_fl:'Supervisor FL', supervisor_nombre:'Supervisor', correo_supervisor:'Correo supervisor', sup_1:'Supervisor 1', id_sup:'ID supervisor', id_asesor:'ID asesor', id_admin:'ID administrativo',
    id_ins_fl:'ID ins_fl', created_at:'Creado', updated_at:'Última actualización'
  });

  const state = {
    ready:false,
    bound:false,
    loading:false,
    contract:null,
    records:[],
    selectedSummary:null,
    selectedRecord:null,
    activeGroup:null,
    requestSequence:0
  };

  const $ = id => document.getElementById(id);
  const raw = value => value === null || value === undefined ? '' : String(value).trim();
  const esc = value => String(value === null || value === undefined ? '' : value)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  function getView_cor(){ return $('view-instalaciones-administracion'); }

  function authHeaders_cor(){
    return Object.assign(
      { Accept:'application/json' },
      window.ManttoAuth && window.ManttoAuth.authHeaders
        ? window.ManttoAuth.authHeaders()
        : {}
    );
  }

  async function fetchJson_cor(path){
    const response = await fetch(API_BASE + path, {
      method:'GET',
      headers:authHeaders_cor(),
      cache:'no-store'
    });
    const text = await response.text();
    let json = null;
    try{ json = text ? JSON.parse(text) : null; }
    catch(_error){ throw new Error('El backend respondió contenido no JSON.'); }
    if(!response.ok || (json && json.ok === false)){
      const error = new Error((json && (json.message || json.error)) || ('Error HTTP ' + response.status));
      error.status = response.status;
      error.code = json && json.code;
      throw error;
    }
    return json || {};
  }

  async function loadHtml_cor(){
    const view = getView_cor();
    if(!view) throw new Error('No existe la vista view-instalaciones-administracion.');
    if(view.dataset.iadmCorReady === '1') return view;
    const response = await fetch(
      './modules/instalaciones-administracion/instalaciones-administracion_cor.html?v=' + VERSION_COR,
      { cache:'no-store' }
    );
    if(!response.ok) throw new Error('No se pudo cargar la vista Administración de Instalaciones.');
    view.innerHTML = await response.text();
    view.dataset.iadmCorReady = '1';
    return view;
  }

  function setStatus_cor(message,type){
    const node = $('iadm-cor-status');
    if(!node) return;
    node.textContent = message || '';
    node.dataset.type = type || 'ready';
  }

  function setLoading_cor(loading){
    state.loading = Boolean(loading);
    ['iadm-cor-refresh','iadm-cor-search-btn','iadm-cor-clear','iadm-cor-change-record'].forEach(id => {
      const node = $(id); if(node) node.disabled = state.loading;
    });
  }

  function labelFor_cor(field){ return FIELD_LABELS_COR[field] || field.replace(/_/g,' '); }

  function displayValue_cor(field,value){
    if(value === null || value === undefined || raw(value) === '') return '—';
    if(field === 'activo') return Number(value) === 1 ? 'Activo' : 'Inactivo';
    return String(value);
  }

  function visibleGroups_cor(){
    const groups = Array.isArray(state.contract && state.contract.groups) ? state.contract.groups : [];
    return groups.filter(group => group && group.permissions && group.permissions.can_view === true);
  }

  function pendingFields_cor(){
    return new Set([
      ...((state.contract && state.contract.pending_policy_fields) || []),
      ...((state.contract && state.contract.derived_pending_policy_fields) || [])
    ]);
  }

  function formatSystemValue_cor(field,value){
    const text = displayValue_cor(field,value);
    if(text === '—') return text;
    if((field === 'created_at' || field === 'updated_at') && window.ManttoHumanTime && typeof window.ManttoHumanTime.formatMexicoCityDateTime === 'function'){
      try{ return window.ManttoHumanTime.formatMexicoCityDateTime(value); }catch(_error){}
    }
    return text;
  }

  function renderResults_cor(){
    const host = $('iadm-cor-results');
    const meta = $('iadm-cor-search-meta');
    if(!host) return;
    if(meta) meta.textContent = state.records.length
      ? state.records.length + ' registros encontrados. Selecciona uno para abrirlo.'
      : 'Sin registros para la búsqueda actual.';
    if(!state.records.length){
      host.innerHTML = '<div class="iadm-cor-empty-state">No se encontraron registros visibles dentro de tu alcance.</div>';
      return;
    }
    host.innerHTML = state.records.map(row => {
      const active = Number(row.activo) === 1;
      return '<button class="iadm-cor-result" type="button" data-record-id="' + esc(row.id_ins_fl) + '">' +
        '<span class="iadm-cor-result-main"><small>Proyecto</small><strong>' + esc(row.proyecto || '—') + '</strong><small>' + esc(row.id_proyecto || 'Sin PP NS') + ' · ' + esc(row.referencia_sitio || 'Sin referencia') + '</small></span>' +
        '<span class="iadm-cor-result-cell"><small>Equipo</small>' + esc(row.numero_equipo_fabrica || row.tipo_equipo || '—') + '</span>' +
        '<span class="iadm-cor-result-cell"><small>Cliente</small>' + esc(row.cliente || '—') + '</span>' +
        '<span class="iadm-cor-result-cell"><small>Estatus</small>' + esc(row.estatus || '—') + (active ? '' : ' · Inactivo') + '</span>' +
        '<span class="iadm-cor-result-open">Abrir →</span>' +
      '</button>';
    }).join('');
    host.querySelectorAll('[data-record-id]').forEach(button => {
      button.addEventListener('click', () => openRecord_cor(button.dataset.recordId));
    });
  }

  async function searchRecords_cor(query,options={}){
    const sequence = ++state.requestSequence;
    setLoading_cor(true);
    setStatus_cor('Buscando…','loading');
    const meta = $('iadm-cor-search-meta');
    if(meta) meta.textContent = 'Consultando Aiven…';
    try{
      const params = new URLSearchParams();
      if(raw(query)) params.set('q',raw(query));
      params.set('limit',String(SEARCH_LIMIT_COR));
      const response = await fetchJson_cor('/api/instalaciones/administracion/registros?' + params.toString());
      if(sequence !== state.requestSequence) return;
      state.records = Array.isArray(response.data) ? response.data : [];
      renderResults_cor();
      setStatus_cor('Actualizado','ready');
      if(options.openFirst && state.records.length) await openRecord_cor(state.records[0].id_ins_fl);
    }catch(error){
      if(sequence !== state.requestSequence) return;
      state.records = [];
      if($('iadm-cor-results')) $('iadm-cor-results').innerHTML = '<div class="iadm-cor-empty-state iadm-cor-error">' + esc(error.message) + '</div>';
      if(meta) meta.textContent = 'No fue posible completar la búsqueda.';
      setStatus_cor(error.message,'error');
    }finally{
      if(sequence === state.requestSequence) setLoading_cor(false);
    }
  }

  function selectedSummary_cor(id){
    return state.records.find(row => String(row.id_ins_fl) === String(id)) || state.selectedSummary || {};
  }

  function renderSelectedHeader_cor(){
    const row = Object.assign({}, state.selectedSummary || {}, state.selectedRecord || {});
    const title = $('iadm-cor-record-title');
    const tags = $('iadm-cor-record-tags');
    if(title) title.textContent = row.proyecto || ('Registro #' + (row.id_ins_fl || '—'));
    if(tags){
      const items = [
        row.id_proyecto ? ['PP NS ' + row.id_proyecto,''] : null,
        row.referencia_sitio ? ['Referencia ' + row.referencia_sitio,''] : null,
        row.numero_equipo_fabrica ? ['Fábrica ' + row.numero_equipo_fabrica,''] : null,
        row.estatus ? [row.estatus,'status'] : null,
        Number(row.activo) === 0 ? ['Inactivo','inactive'] : null
      ].filter(Boolean);
      tags.innerHTML = items.map(item => '<span class="iadm-cor-chip"' + (item[1] ? ' data-kind="' + item[1] + '"' : '') + '>' + esc(item[0]) + '</span>').join('');
    }
  }

  function renderSystem_cor(){
    const host = $('iadm-cor-system-grid');
    if(!host) return;
    const fields = (state.contract && state.contract.system_readonly_fields) || ['id_ins_fl','created_at','updated_at'];
    host.innerHTML = fields.map(field => '<div class="iadm-cor-system-item"><small>' + esc(labelFor_cor(field)) + '</small><strong>' + esc(formatSystemValue_cor(field,state.selectedRecord && state.selectedRecord[field])) + '</strong></div>').join('');
  }

  function renderActiveGroup_cor(){
    const host = $('iadm-cor-groups');
    if(!host) return;
    const groups = visibleGroups_cor();
    const group = groups.find(item => item.key === state.activeGroup) || groups[0];
    if(!group){
      host.innerHTML = '<div class="iadm-cor-empty-state">Tu usuario no tiene grupos de información visibles.</div>';
      return;
    }
    state.activeGroup = group.key;
    const pending = pendingFields_cor();
    const edit = Boolean(group.permissions && group.permissions.can_edit);
    const fields = Array.isArray(group.fields) ? group.fields : [];
    host.innerHTML = '<details class="iadm-cor-group" open>' +
      '<summary><span>' + esc(group.label || group.key) + '</span><small class="iadm-cor-group-badge" data-edit="' + (edit ? '1':'0') + '">' + (edit ? 'Edición autorizada · Fase 4' : 'Solo consulta') + '</small></summary>' +
      '<dl class="iadm-cor-field-grid">' + fields.map(field => {
        const policy = pending.has(field);
        return '<div class="iadm-cor-field"' + (policy ? ' data-policy="pending"' : '') + '>' +
          '<dt>' + esc(labelFor_cor(field)) + '</dt>' +
          '<dd>' + esc(displayValue_cor(field,state.selectedRecord && state.selectedRecord[field])) + '</dd>' +
          (policy ? '<span class="iadm-cor-field-note">Política de edición pendiente</span>' : '') +
        '</div>';
      }).join('') + '</dl></details>';
    const picker = $('iadm-cor-group-picker');
    picker?.querySelectorAll('[data-group-key]').forEach(button => {
      button.classList.toggle('active', button.dataset.groupKey === state.activeGroup);
      button.setAttribute('aria-pressed',button.dataset.groupKey === state.activeGroup ? 'true':'false');
    });
  }

  function renderGroupPicker_cor(){
    const host = $('iadm-cor-group-picker');
    if(!host) return;
    const groups = visibleGroups_cor();
    if(!groups.length){ host.innerHTML = '<div class="iadm-cor-empty-state">No hay grupos visibles para tu usuario.</div>'; return; }
    if(!groups.some(group => group.key === state.activeGroup)) state.activeGroup = groups[0].key;
    host.innerHTML = groups.map(group => {
      const edit = Boolean(group.permissions && group.permissions.can_edit);
      return '<button type="button" class="iadm-cor-group-button' + (group.key === state.activeGroup ? ' active':'') + '" data-group-key="' + esc(group.key) + '" aria-pressed="' + (group.key === state.activeGroup ? 'true':'false') + '"><span>' + esc(group.label || group.key) + '</span><small data-edit="' + (edit ? '1':'0') + '">' + (edit ? 'EDITAR':'VER') + '</small></button>';
    }).join('');
    host.querySelectorAll('[data-group-key]').forEach(button => {
      button.addEventListener('click', () => {
        state.activeGroup = button.dataset.groupKey;
        renderActiveGroup_cor();
      });
    });
  }

  function renderRecord_cor(){
    const selected = $('iadm-cor-selected');
    const empty = $('iadm-cor-empty');
    if(selected) selected.hidden = false;
    if(empty) empty.hidden = true;
    renderSelectedHeader_cor();
    renderGroupPicker_cor();
    renderActiveGroup_cor();
    renderSystem_cor();
    if(window.ManttoPermissions && typeof window.ManttoPermissions.apply === 'function'){
      window.ManttoPermissions.apply(getView_cor() || document);
    }
  }

  async function openRecord_cor(id){
    const numeric = Number(id);
    if(!Number.isInteger(numeric) || numeric <= 0) return;
    state.selectedSummary = selectedSummary_cor(numeric);
    setLoading_cor(true);
    setStatus_cor('Cargando registro…','loading');
    try{
      const response = await fetchJson_cor('/api/instalaciones/administracion/registros/' + encodeURIComponent(numeric));
      state.selectedRecord = response.data || {};
      state.selectedSummary = Object.assign({},state.selectedSummary || {},state.selectedRecord || {});
      const allowed = visibleGroups_cor();
      if(!allowed.some(group => group.key === state.activeGroup)) state.activeGroup = allowed[0] ? allowed[0].key : null;
      renderRecord_cor();
      setStatus_cor('Registro cargado','ready');
    }catch(error){
      setStatus_cor(error.message,'error');
    }finally{ setLoading_cor(false); }
  }

  function clearSelection_cor(){
    state.selectedSummary = null;
    state.selectedRecord = null;
    state.activeGroup = null;
    if($('iadm-cor-selected')) $('iadm-cor-selected').hidden = true;
    if($('iadm-cor-empty')) $('iadm-cor-empty').hidden = false;
    $('iadm-cor-search-input')?.focus();
  }

  async function loadContract_cor(){
    const response = await fetchJson_cor('/api/instalaciones/administracion/contrato');
    state.contract = response;
    return response;
  }

  async function refresh_cor(options={}){
    if(state.loading) return;
    setLoading_cor(true);
    setStatus_cor('Actualizando módulo…','loading');
    try{
      await loadContract_cor();
      const currentId = state.selectedRecord && state.selectedRecord.id_ins_fl;
      const query = raw($('iadm-cor-search-input') && $('iadm-cor-search-input').value);
      await searchRecords_cor(query);
      if(currentId) await openRecord_cor(currentId);
      else if(options.recordId) await openRecord_cor(options.recordId);
      setStatus_cor('Actualizado','ready');
    }catch(error){
      setStatus_cor(error.message,'error');
      const meta = $('iadm-cor-search-meta');
      if(meta) meta.textContent = error.message;
    }finally{ setLoading_cor(false); }
  }

  function bind_cor(){
    if(state.bound) return;
    state.bound = true;
    $('iadm-cor-search-form')?.addEventListener('submit', event => {
      event.preventDefault();
      clearSelection_cor();
      searchRecords_cor($('iadm-cor-search-input')?.value || '');
    });
    $('iadm-cor-clear')?.addEventListener('click', () => {
      const input = $('iadm-cor-search-input'); if(input) input.value = '';
      clearSelection_cor();
      searchRecords_cor('');
    });
    $('iadm-cor-refresh')?.addEventListener('click', () => refresh_cor());
    $('iadm-cor-change-record')?.addEventListener('click', clearSelection_cor);
  }

  async function init_cor(payload){
    try{
      await loadHtml_cor();
      bind_cor();
      state.ready = true;
      if(window.ManttoPermissions && typeof window.ManttoPermissions.apply === 'function') window.ManttoPermissions.apply(getView_cor());
      if(!state.contract) await loadContract_cor();
      const recordId = payload && Number(payload.id);
      if(Number.isInteger(recordId) && recordId > 0){
        await openRecord_cor(recordId);
      }else if(!state.records.length){
        await searchRecords_cor('');
      }
    }catch(error){ setStatus_cor(error.message,'error'); }
  }

  document.addEventListener('mantto:navigation', event => {
    const detail = event && event.detail ? event.detail : {};
    if(detail.route !== 'instalaciones-administracion' || detail.type !== 'open') return;
    if(!state.ready) return;
    const id = detail.payload && Number(detail.payload.id);
    if(Number.isInteger(id) && id > 0) openRecord_cor(id).catch(() => {});
  });

  document.addEventListener('mantto:permissions-updated', () => {
    const current = window.ManttoRouter && window.ManttoRouter.getCurrent ? window.ManttoRouter.getCurrent() : null;
    if(current && current.route === 'instalaciones-administracion'){
      state.contract = null;
      refresh_cor({recordId:state.selectedRecord && state.selectedRecord.id_ins_fl}).catch(() => {});
    }
  });

  window.ManttoInstalacionesAdministracion_cor = Object.freeze({
    init:init_cor,
    refresh:refresh_cor
  });
})();
