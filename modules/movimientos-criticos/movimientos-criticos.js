(function(){
  'use strict';

  const MODULE_VERSION = '20261003-fase3-v001';
  const CRITICAL_THRESHOLD = 3;
  const state = {
    htmlLoaded:false,
    bound:false,
    catalog:[],
    movements:[],
    snapshot:[],
    cut:null,
    loading:false
  };

  function API(){ return (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, ''); }
  function $(id){ return document.getElementById(id); }
  function esc(value){
    return String(value == null || value === '' ? '—' : value).replace(/[&<>"']/g, function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }
  function text(id,value){ const el=$(id); if(el) el.textContent=value; }
  function val(id){ const el=$(id); return el ? String(el.value || '').trim() : ''; }
  function num(value){ const parsed=Number(value); return Number.isFinite(parsed) ? parsed : 0; }
  function int(value){ return num(value).toLocaleString('es-MX'); }
  function norm(value){ return String(value == null ? '' : value).trim(); }
  function normLower(value){ return norm(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function qs(params){
    const search=new URLSearchParams();
    Object.entries(params || {}).forEach(function(entry){
      const key=entry[0], value=entry[1];
      if(value !== undefined && value !== null && String(value).trim() !== '') search.set(key, value);
    });
    return search.toString();
  }

  function fmtDate(value){
    if(!value) return '—';
    const raw=String(value).trim();
    const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(match) return match[3]+'/'+match[2]+'/'+match[1];
    const date=new Date(raw);
    return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString('es-MX',{timeZone:'America/Mexico_City'});
  }

  function fmtDateTime(value){
    if(!value) return '—';
    const raw=String(value).trim();
    const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
    if(match) return match[3]+'/'+match[2]+'/'+match[1]+(match[4] ? ' '+match[4]+':'+match[5] : '');
    const date=new Date(raw);
    if(Number.isNaN(date.getTime())) return raw;
    return date.toLocaleString('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  }

  function fmtProject(value){
    if(window.ManttoProyectos && typeof window.ManttoProyectos.formatProyectoName === 'function'){
      try{return window.ManttoProyectos.formatProyectoName(value);}catch(_error){}
    }
    if(typeof window.formatProyectoName === 'function'){
      try{return window.formatProyectoName(value);}catch(_error){}
    }
    return norm(value) || '—';
  }

  async function requestJson(path,options){
    const opts=Object.assign({method:'GET'}, options || {});
    if(window.ManttoAuth && typeof window.ManttoAuth.api === 'function'){
      return window.ManttoAuth.api(path, opts);
    }

    const headers=Object.assign({'Accept':'application/json'}, opts.headers || {});
    if(opts.body != null && !headers['Content-Type']) headers['Content-Type']='application/json';
    if(window.ManttoAuth && typeof window.ManttoAuth.authHeaders === 'function') Object.assign(headers, window.ManttoAuth.authHeaders());
    const response=await fetch(API()+path, Object.assign({}, opts, {headers:headers, cache:'no-store'}));
    const raw=await response.text();
    let data={};
    try{ data=raw ? JSON.parse(raw) : {}; }
    catch(_error){ throw new Error('Respuesta no JSON del backend ('+response.status+').'); }
    if(!response.ok || data.ok === false) throw new Error(data.message || data.error || 'Error consultando backend');
    return data;
  }

  function setStatus(type,message){
    const el=$('mc-status');
    if(!el) return;
    el.className='mc-status '+(type || 'loading');
    el.innerHTML='<span class="mc-dot"></span><span>'+esc(message || 'Cargando...')+'</span>';
  }

  function isProgrammer(){
    if(window.ManttoAuth && typeof window.ManttoAuth.isViewingAs === 'function' && window.ManttoAuth.isViewingAs()) return false;
    const user=window.ManttoAuth && typeof window.ManttoAuth.getUser === 'function' ? window.ManttoAuth.getUser() : null;
    const roles=[];
    if(user && user.rol) roles.push(user.rol);
    if(user && Array.isArray(user.roles)) roles.push.apply(roles,user.roles);
    return roles.some(function(role){ return norm(role).toLowerCase().startsWith('programador'); });
  }

  async function loadHtml(){
    if(state.htmlLoaded) return;
    const view=$('view-movimientos-criticos') || document.querySelector('[data-view="movimientos-criticos"]');
    if(!view) throw new Error('No existe el contenedor de Movimientos Críticos. La integración de ruta corresponde a Fase 4.');

    const response=await fetch('./modules/movimientos-criticos/movimientos-criticos.html?v='+MODULE_VERSION,{cache:'no-store'});
    if(!response.ok) throw new Error('No fue posible cargar la vista de Movimientos Críticos.');
    const html=await response.text();
    if(!html.trim()) throw new Error('La vista de Movimientos Críticos está vacía.');
    view.innerHTML=html;
    state.htmlLoaded=true;
    bind();
  }

  function bind(){
    if(state.bound) return;
    state.bound=true;

    document.querySelectorAll('[data-mc-action]').forEach(function(button){
      button.addEventListener('click',function(){
        const action=button.dataset.mcAction;
        if(action === 'refresh') refresh();
        else if(action === 'apply') applyFilters();
        else if(action === 'clear') clearFilters();
        else if(action === 'cut') runManualCut();
      });
    });

    const year=$('mc-year');
    const week=$('mc-week');
    const search=$('mc-search');
    const type=$('mc-type');
    const zone=$('mc-zone');

    if(year) year.addEventListener('change',function(){ fillWeeks(year.value,''); clearCutView('Selecciona una semana'); });
    if(week) week.addEventListener('change',function(){ loadSelectedCut(); });
    if(type) type.addEventListener('change',applyFilters);
    if(zone) zone.addEventListener('change',applyFilters);
    if(search) search.addEventListener('keydown',function(event){ if(event.key === 'Enter'){ event.preventDefault(); applyFilters(); } });

    const manual=$('mc-manual-cut');
    if(manual) manual.hidden=!isProgrammer();
  }

  function catalogRow(anio,semana){
    return state.catalog.find(function(row){
      return String(row.anio_iso) === String(anio) && String(row.semana_iso) === String(semana);
    }) || null;
  }

  function fillYears(selected){
    const el=$('mc-year');
    if(!el) return;
    const years=[...new Set(state.catalog.map(function(row){ return String(row.anio_iso); }))];
    el.innerHTML=years.length
      ? '<option value="">Selecciona</option>'+years.map(function(year){ return '<option value="'+esc(year)+'">'+esc(year)+'</option>'; }).join('')
      : '<option value="">Sin cortes disponibles</option>';
    if(selected && years.includes(String(selected))) el.value=String(selected);
  }

  function fillWeeks(year,selected){
    const el=$('mc-week');
    if(!el) return;
    if(!year){ el.innerHTML='<option value="">Selecciona un año</option>'; return; }
    const rows=state.catalog.filter(function(row){ return String(row.anio_iso) === String(year); });
    el.innerHTML=rows.length
      ? '<option value="">Selecciona</option>'+rows.map(function(row){
          const label='Semana '+row.semana_iso+' · '+fmtDate(row.fecha_inicio)+' al '+fmtDate(row.fecha_fin);
          return '<option value="'+esc(row.semana_iso)+'">'+esc(label)+'</option>';
        }).join('')
      : '<option value="">Sin semanas disponibles</option>';
    if(selected && rows.some(function(row){ return String(row.semana_iso) === String(selected); })) el.value=String(selected);
  }

  async function loadCatalog(options){
    const opts=options || {};
    const previousYear=val('mc-year');
    const previousWeek=val('mc-week');
    const data=await requestJson('/api/movimientos-criticos/semanas');
    state.catalog=Array.isArray(data.data) ? data.data : [];

    let targetYear=opts.anio || (opts.preserveSelection ? previousYear : '');
    let targetWeek=opts.semana || (opts.preserveSelection ? previousWeek : '');
    if((!targetYear || !targetWeek) && state.catalog.length){
      targetYear=String(state.catalog[0].anio_iso);
      targetWeek=String(state.catalog[0].semana_iso);
    }

    fillYears(targetYear);
    fillWeeks(targetYear,targetWeek);
    if($('mc-year')) $('mc-year').value=targetYear || '';
    if($('mc-week')) $('mc-week').value=targetWeek || '';
    return {anio:targetYear,semana:targetWeek};
  }

  function fillZones(){
    const el=$('mc-zone');
    if(!el) return;
    const selected=val('mc-zone');
    const map=new Map();
    state.snapshot.forEach(function(row){
      const id=num(row.zona_id);
      const name=norm(row.zona);
      if(id > 0 && !map.has(id)) map.set(id,name || ('Zona '+id));
    });
    const rows=[...map.entries()].sort(function(a,b){ return String(a[1]).localeCompare(String(b[1]),'es'); });
    el.innerHTML='<option value="">Todas</option>'+rows.map(function(row){ return '<option value="'+row[0]+'">'+esc(row[1])+'</option>'; }).join('');
    if(selected && rows.some(function(row){ return String(row[0]) === String(selected); })) el.value=selected;
  }

  function typeLabel(type){
    return String(type || '').toUpperCase() === 'ENTRA_CRITICO' ? 'Entra a crítico' : 'Sale de crítico';
  }

  function typeTag(type){
    const inside=String(type || '').toUpperCase() === 'ENTRA_CRITICO';
    return '<span class="mc-tag '+(inside ? 'in' : 'out')+'"><i></i>'+esc(typeLabel(type))+'</span>';
  }

  function countPill(value){
    const amount=num(value);
    return '<span class="mc-count-pill '+(amount >= CRITICAL_THRESHOLD ? 'critical' : '')+'">'+esc(amount)+'</span>';
  }

  function movementMatches(row){
    const type=val('mc-type');
    const zone=val('mc-zone');
    const search=normLower(val('mc-search'));
    if(type && String(row.tipo || '').toUpperCase() !== type) return false;
    if(zone && String(num(row.zona_id)) !== String(num(zone))) return false;
    if(search){
      const haystack=[row.equipo,row.proyecto,row.referencia_en_sitio,row.zona,row.supervisor,row.tipo]
        .map(normLower).join(' | ');
      if(!haystack.includes(search)) return false;
    }
    return true;
  }

  function visibleSnapshot(){
    const zone=val('mc-zone');
    if(!zone) return state.snapshot.slice();
    return state.snapshot.filter(function(row){ return String(num(row.zona_id)) === String(num(zone)); });
  }

  function renderKpis(filtered){
    const entradas=filtered.filter(function(row){ return String(row.tipo || '').toUpperCase() === 'ENTRA_CRITICO'; }).length;
    const salidas=filtered.filter(function(row){ return String(row.tipo || '').toUpperCase() === 'SALE_CRITICO'; }).length;
    const snapshot=visibleSnapshot();
    const critical=snapshot.filter(function(row){ return row.es_critico === true || num(row.fallas_blt_u35) >= CRITICAL_THRESHOLD; }).length;
    text('mc-kpi-total',int(filtered.length));
    text('mc-kpi-in',int(entradas));
    text('mc-kpi-out',int(salidas));
    text('mc-kpi-critical',int(critical));
    text('mc-kpi-evaluated',int(snapshot.length));
  }

  function bindRowLinks(root){
    root.querySelectorAll('[data-mc-equipo]').forEach(function(button){
      button.addEventListener('click',function(event){
        event.preventDefault();event.stopPropagation();
        const code=button.getAttribute('data-mc-equipo');
        if(window.ManttoDetails && typeof window.ManttoDetails.openEquipo === 'function') window.ManttoDetails.openEquipo(code);
      });
    });
    root.querySelectorAll('[data-mc-proyecto]').forEach(function(button){
      button.addEventListener('click',function(event){
        event.preventDefault();event.stopPropagation();
        const project=button.getAttribute('data-mc-proyecto');
        if(window.ManttoDetails && typeof window.ManttoDetails.openProyecto === 'function') window.ManttoDetails.openProyecto(project);
      });
    });
  }

  function renderRows(filtered){
    const body=$('mc-body');
    if(!body) return;
    const lineBase=Boolean(state.cut && state.cut.linea_base);
    if(!filtered.length){
      let message='Sin movimientos para los filtros seleccionados';
      if(lineBase && state.movements.length === 0) message='CORTE BASE · SIN MOVIMIENTOS COMPARABLES';
      else if(state.movements.length === 0) message='SIN MOVIMIENTOS ESTA SEMANA';
      body.innerHTML='<tr><td colspan="8" class="mc-empty">'+esc(message)+'</td></tr>';
      text('mc-count',message);
      return;
    }

    text('mc-count',int(filtered.length)+' movimientos mostrados');
    body.innerHTML=filtered.map(function(row){
      return '<tr>'
        +'<td>'+typeTag(row.tipo)+'</td>'
        +'<td>'+fmtDateTime(row.fecha_movimiento)+'</td>'
        +'<td class="mc-code"><button type="button" class="mc-link" data-mc-equipo="'+esc(row.equipo)+'">'+esc(row.equipo)+'</button></td>'
        +'<td><button type="button" class="mc-link" data-mc-proyecto="'+esc(row.proyecto)+'">'+esc(fmtProject(row.proyecto))+'</button></td>'
        +'<td>'+esc(row.zona)+'</td>'
        +'<td>'+countPill(row.fallas_anterior)+'</td>'
        +'<td>'+countPill(row.fallas_actual)+'</td>'
        +'<td>'+esc(row.supervisor)+'</td>'
        +'</tr>';
    }).join('');
    bindRowLinks(body);
  }

  function renderCutHeader(){
    const cut=state.cut || {};
    if(!cut.anio_iso || !cut.semana_iso){
      text('mc-title','Semana sin seleccionar');
      text('mc-range','Período: —');
      text('mc-cut-date','Corte: —');
      const baseline=$('mc-baseline'); if(baseline) baseline.hidden=true;
      return;
    }
    text('mc-title','Semana '+cut.semana_iso+' de '+cut.anio_iso);
    text('mc-range','Período: '+fmtDate(cut.fecha_inicio)+' al '+fmtDate(cut.fecha_fin));
    text('mc-cut-date','Corte: '+fmtDateTime(cut.fecha_corte));
    const baseline=$('mc-baseline'); if(baseline) baseline.hidden=!cut.linea_base;
  }

  function applyFilters(){
    const filtered=state.movements.filter(movementMatches);
    renderKpis(filtered);
    renderRows(filtered);
  }

  function clearFilters(){
    if($('mc-zone')) $('mc-zone').value='';
    if($('mc-type')) $('mc-type').value='';
    if($('mc-search')) $('mc-search').value='';
    applyFilters();
  }

  function clearCutView(message){
    state.movements=[];
    state.snapshot=[];
    state.cut=null;
    fillZones();
    ['mc-kpi-total','mc-kpi-in','mc-kpi-out','mc-kpi-critical','mc-kpi-evaluated'].forEach(function(id){ text(id,'—'); });
    renderCutHeader();
    text('mc-count',message || 'Selecciona un corte semanal');
    const body=$('mc-body');
    if(body) body.innerHTML='<tr><td colspan="8" class="mc-empty">'+esc(message || 'Selecciona un corte semanal')+'</td></tr>';
  }

  async function loadSelectedCut(){
    const anio=val('mc-year');
    const semana=val('mc-week');
    if(!anio || !semana){ clearCutView('Selecciona un año y una semana'); return; }
    if(state.loading) return;
    state.loading=true;
    setStatus('loading','Consultando corte semanal...');
    const body=$('mc-body');
    if(body) body.innerHTML='<tr><td colspan="8" class="mc-empty">Consultando corte semanal...</td></tr>';
    try{
      const query=qs({anio:anio,semana:semana});
      const results=await Promise.all([
        requestJson('/api/movimientos-criticos?'+query),
        requestJson('/api/movimientos-criticos/snapshot?'+query)
      ]);
      const movementData=results[0] || {};
      const snapshotData=results[1] || {};
      state.movements=Array.isArray(movementData.data) ? movementData.data : [];
      state.snapshot=Array.isArray(snapshotData.data) ? snapshotData.data : [];
      state.cut=movementData.corte || snapshotData.corte || catalogRow(anio,semana) || null;
      fillZones();
      renderCutHeader();
      applyFilters();
      const lineBase=Boolean(state.cut && state.cut.linea_base);
      setStatus(lineBase ? 'warn' : 'ok', lineBase ? 'Corte base cargado' : 'Corte semanal actualizado');
    }catch(error){
      state.movements=[];state.snapshot=[];state.cut=null;
      renderKpis([]);
      renderCutHeader();
      if(body) body.innerHTML='<tr><td colspan="8" class="mc-empty">Error: '+esc(error.message)+'</td></tr>';
      text('mc-count','No fue posible cargar el corte');
      setStatus('error',error.message);
    }finally{
      state.loading=false;
    }
  }

  async function refresh(){
    if(state.loading) return;
    try{
      setStatus('loading','Actualizando catálogo...');
      const selection=await loadCatalog({preserveSelection:true});
      if(selection.anio && selection.semana) await loadSelectedCut();
      else{
        clearCutView('No hay cortes semanales disponibles');
        setStatus('warn','Sin cortes disponibles');
      }
    }catch(error){
      setStatus('error',error.message);
      clearCutView(error.message);
    }
  }

  async function runManualCut(){
    const button=$('mc-manual-cut');
    if(!button || button.disabled || !isProgrammer()) return;
    if(!window.confirm('Se ejecutará el último corte semanal pendiente de Movimientos Críticos. ¿Deseas continuar?')) return;
    button.disabled=true;
    setStatus('loading','Generando corte semanal...');
    try{
      const result=await requestJson('/api/movimientos-criticos/corte',{method:'POST',body:'{}'});
      const target={
        anio:result && (result.anio_iso || result.anio),
        semana:result && (result.semana_iso || result.semana)
      };
      const selection=await loadCatalog(target.anio && target.semana ? target : {});
      if(selection.anio && selection.semana) await loadSelectedCut();
      setStatus('ok',result && result.skipped ? 'El corte semanal ya estaba cerrado' : 'Corte semanal generado correctamente');
    }catch(error){
      setStatus('error',error.message);
    }finally{
      button.disabled=false;
    }
  }

  async function init(){
    try{
      await loadHtml();
      const selection=await loadCatalog({preserveSelection:true});
      if(selection.anio && selection.semana) await loadSelectedCut();
      else{
        clearCutView('No hay cortes semanales disponibles');
        setStatus('warn','Sin cortes disponibles');
      }
    }catch(error){
      setStatus('error',error.message);
      throw error;
    }
  }

  async function backgroundSync(){
    return refresh();
  }

  window.ManttoMovimientosCriticos={
    init:init,
    refresh:refresh,
    backgroundSync:backgroundSync,
    version:MODULE_VERSION
  };
})();
