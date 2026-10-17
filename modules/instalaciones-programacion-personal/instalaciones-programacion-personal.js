'use strict';

// [Mantto Gestor | 2026-10-16 | INT9-F1 | CATALOGO UI V001]
// Fase 1: catálogo de personal; Fase 2: calendario y asignaciones.
// Fase 3: historial, disponibilidad, simulación, permisos, menú, router y carga perezosa.
(function () {
  const ROOT_ID = 'view-instalaciones-programacion-personal';
  const BASE = '/api/instalaciones/programacion';
  const CODE = 'INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO_PROGRAMACION';
  const TYPES = Object.freeze({MONTADOR:'Montadores', AJUSTADOR:'Ajustadores'});
  const state = {type:'MONTADOR',view:'calendario',rows:[],options:null,page:1,limit:50,total:0,q:'',ready:false,epoch:0,formId:null,filterTimer:null};
  const root = () => document.getElementById(ROOT_ID);
  const el = id => document.getElementById(id);
  const esc = v => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const permitted = code => Boolean(window.ManttoPermissions?.can?.(`${CODE}.${code}`,{defaultValue:false}))
    && window.ManttoAuth?.isViewingAs?.() !== true;
  const fmt = v => v === null || v === undefined || v === '' ? '—' : esc(v);

  async function api(path, method = 'GET', payload) {
    if (!window.ManttoAuth || typeof window.ManttoAuth.api !== 'function') throw new Error('Sesión de Mantto Gestor requerida.');
    const result = await window.ManttoAuth.api(BASE + path, {
      method,
      ...(payload === undefined ? {} : {body:JSON.stringify(payload)})
    });
    return result?.data;
  }
  function encodeQuery(params) {
    return new URLSearchParams(Object.entries(params).filter(([,v]) => v !== null && v !== undefined && v !== '')).toString();
  }
  function setFeedback(message, isError = false) {
    const target = el('ppc-feedback');
    if (!target) return;
    target.textContent = message || '';
    target.classList.toggle('ppc-error',isError);
  }
  function shell() {
    const parent = root();
    if (!parent) return;
    parent.innerHTML = `
      <div class="ppc-page">
        <header class="ppc-head"><div><h1>Programación de Personal</h1>
          <p>Calendario, asignaciones y catálogo · Instalaciones</p></div>
          <div class="ppc-head-actions"><div class="ppc-tabs" id="ppc-tipos" aria-label="Tipo de personal"></div>
            <button type="button" class="ppc-btn" data-ppc="actualizar">↻ Actualizar</button></div>
        </header>
        <nav class="ppc-nav" id="ppc-nav" role="tablist" aria-label="Secciones de programación">
          <button type="button" class="ppc-tab active" role="tab" data-ppc="seccion" data-vista="calendario" aria-selected="true">Calendario</button>
          <button type="button" class="ppc-tab" role="tab" data-ppc="seccion" data-vista="personal" aria-selected="false">Personal</button>
          <button type="button" class="ppc-tab" role="tab" data-ppc="seccion" data-vista="historial" aria-selected="false">Historial</button>
          <button type="button" class="ppc-tab" role="tab" data-ppc="seccion" data-vista="disponibilidad" aria-selected="false">Disponibilidad y simulación</button>
        </nav>
        <div id="ppc-calendario" role="tabpanel"></div>
        <section class="ppc-card" id="ppc-catalogo" role="tabpanel" hidden>
          <div class="ppc-toolbar"><label class="ppc-search-label">Buscar personal
              <input type="search" id="ppc-query" placeholder="Nombre, contratista, puesto o categoría" autocomplete="off"></label>
            <button type="button" class="ppc-btn ppc-primary" id="ppc-new" data-ppc="nuevo" hidden>+ Agregar persona</button>
          </div>
          <p id="ppc-feedback" role="status" aria-live="polite"></p>
          <div id="ppc-list" class="ppc-table-scroll"></div>
          <div id="ppc-pages" class="ppc-pagination"></div>
        </section>
        <div id="ppc-historial" role="tabpanel" hidden></div>
        <div id="ppc-disponibilidad" role="tabpanel" hidden></div>
        <div id="ppc-overlay" class="ppc-overlay" hidden>
          <section class="ppc-dialog" role="dialog" aria-modal="true" aria-labelledby="ppc-dialog-title">
            <div class="ppc-dialog-header"><h2 id="ppc-dialog-title">Personal</h2>
              <button type="button" class="ppc-icon-btn" data-ppc="cancelar" aria-label="Cerrar">×</button></div>
            <form id="ppc-form" autocomplete="off">
              <div class="ppc-fields" id="ppc-fields"></div>
              <div class="ppc-form-actions"><button type="button" class="ppc-btn" data-ppc="cancelar">Cancelar</button>
                <button type="submit" class="ppc-btn ppc-primary" id="ppc-save">Guardar</button></div>
            </form>
          </section>
        </div>
        <div id="ppc-assignment-overlay" class="ppc-overlay" hidden>
          <section class="ppc-dialog ppc-a-dialog" role="dialog" aria-modal="true" aria-labelledby="ppc-a-title">
            <div class="ppc-dialog-header"><h2 id="ppc-a-title">Asignación</h2>
              <button type="button" class="ppc-icon-btn" data-ppc="cerrar-asignacion" aria-label="Cerrar">×</button></div>
            <form id="ppc-a-form" autocomplete="off">
              <div id="ppc-a-new">
                <label class="ppc-a-label">Buscar equipo <input type="search" id="ppc-a-eq-search" placeholder="Proyecto o referencia" maxlength="120"></label>
                <label class="ppc-a-label">Equipo <select id="ppc-a-equipo" required><option value="">Selecciona equipo</option></select></label>
                <p id="ppc-a-rango" class="ppc-cal-note"></p>
                <label class="ppc-a-label">Buscar personal <input type="search" id="ppc-a-person-search" placeholder="Nombre o puesto"></label>
                <div id="ppc-a-persons" class="ppc-a-persons"></div>
              </div>
              <div id="ppc-a-edit" hidden><p id="ppc-a-edit-info" class="ppc-cal-note"></p></div>
              <div class="ppc-fields ppc-a-dates">
                <label>Desde (manual, opcional)<input type="date" id="ppc-a-desde"></label>
                <label>Hasta (manual, opcional)<input type="date" id="ppc-a-hasta"></label>
              </div>
              <p class="ppc-cal-note">Las fechas vacías se obtienen del reporte de Instalaciones (real → modificado → planeado).</p>
              <label class="ppc-a-label">Notas <textarea id="ppc-a-notas" maxlength="1000" rows="3"></textarea></label>
              <p id="ppc-a-feedback" class="ppc-cal-feedback" role="status" aria-live="polite"></p>
              <div class="ppc-form-actions">
                <button type="button" class="ppc-btn ppc-danger" id="ppc-a-delete" data-ppc="quitar-asignacion" hidden>Quitar</button>
                <button type="button" class="ppc-btn" data-ppc="cerrar-asignacion">Cancelar</button>
                <button type="button" class="ppc-btn ppc-danger" id="ppc-a-force" data-ppc="confirmar-traslape" hidden>Asignar de todos modos</button>
                <button type="submit" class="ppc-btn ppc-primary" id="ppc-a-submit">Guardar asignación</button>
              </div>
            </form>
          </section>
        </div>
      </div>`;
    if(!state.listenersBound){
      parent.addEventListener('click', onClick);
      parent.addEventListener('submit', onSubmit);
      parent.addEventListener('input', onInput);
      parent.addEventListener('change', onChange);
      parent.addEventListener('keydown',onCalendarKeydown);
      document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { if(assignment.mode)closeAssignment();if(state.formId !== null)closeForm(); } });
      state.listenersBound=true;
    }
    state.ready = true;
  }
  function renderTabs() {
    if (!el('ppc-tipos')) return;
    el('ppc-tipos').innerHTML = Object.entries(TYPES).map(([key,label]) =>
      `<button type="button" data-ppc="tipo" data-tipo="${key}" class="ppc-tab${state.type===key?' active':''}" aria-pressed="${state.type===key}">${label}</button>`
    ).join('');
    if (el('ppc-new')) el('ppc-new').hidden = !permitted('CREAR');
  }
  function renderList() {
    const target = el('ppc-list');
    if (!target) return;
    const isMont = state.type === 'MONTADOR';
    const columns = isMont ? ['Nombre','Contratista','Puesto','Categoría'] : ['Nombre','Categoría','Experiencia'];
    const buttons = permitted('EDITAR') || permitted('DESACTIVAR');
    target.innerHTML = `
      <table class="ppc-table"><thead><tr>${columns.map(x=>`<th scope="col">${x}</th>`).join('')}${buttons?'<th scope="col">Acciones</th>':''}</tr></thead>
      <tbody>${state.rows.length ? state.rows.map(person => {
        const id = Number(person.id_personal);
        const values = isMont
          ? [person.nombre,person.contratista,person.puesto,person.categoria]
          : [person.nombre,person.categoria,person.experiencia];
        const actions = !buttons ? '' : `<td class="ppc-actions">
          ${permitted('EDITAR')?`<button type="button" class="ppc-btn ppc-small" data-ppc="editar" data-id="${id}">Editar</button>`:''}
          ${permitted('DESACTIVAR')?`<button type="button" class="ppc-btn ppc-small ppc-danger" data-ppc="baja" data-id="${id}">Desactivar</button>`:''}
        </td>`;
        return `<tr>${values.map(v=>`<td>${fmt(v)}</td>`).join('')}${actions}</tr>`;
      }).join('') : `<tr><td colspan="${columns.length + (buttons?1:0)}" class="ppc-empty">No hay personal registrado para este filtro.</td></tr>`}</tbody></table>`;
    const pages = el('ppc-pages');
    if (pages) {
      const totalPages = Math.max(1,Math.ceil(state.total/state.limit));
      pages.innerHTML = `<span>${state.total} registros · Página ${state.page} de ${totalPages}</span>
        <div><button type="button" class="ppc-btn ppc-small" data-ppc="anterior" ${state.page===1?'disabled':''}>Anterior</button>
        <button type="button" class="ppc-btn ppc-small" data-ppc="siguiente" ${state.page>=totalPages?'disabled':''}>Siguiente</button></div>`;
    }
  }
  async function reload() {
    const epoch = ++state.epoch;
    renderTabs();
    setFeedback('Consultando catálogo…');
    try {
      const result = await api('/personal?' + encodeQuery({tipo:state.type,q:state.q,page:state.page,limit:state.limit}));
      if (epoch !== state.epoch || !root()) return;
      state.rows = Array.isArray(result?.personal)?result.personal:[];
      state.total = Number(result?.total || 0);
      renderList();
      setFeedback('');
    } catch (error) {
      if (epoch !== state.epoch || !root()) return;
      state.rows = [];
      state.total = 0;
      renderList();
      setFeedback(error.message || 'No fue posible consultar el catálogo.',true);
    }
  }
  function closeForm() {
    state.formId = null;
    if (el('ppc-overlay')) el('ppc-overlay').hidden = true;
  }
  function formFields(record) {
    const field = (label,name,value,required=false) => `
      <label>${label}<input name="${name}" maxlength="${name==='nombre'?180:name==='contratista'?160:120}"
        value="${esc(value || '')}" ${required?'required':''}></label>`;
    const isMont = state.type === 'MONTADOR';
    return field('Nombre','nombre',record?.nombre,true)
      + (isMont ? field('Contratista','contratista',record?.contratista,true) : '')
      + (isMont ? `<label>Puesto<select name="puesto" required>
          <option value="">Seleccionar</option>${['Mecánico','Ayudante'].map(v=>`<option value="${v}" ${record?.puesto===v?'selected':''}>${v}</option>`).join('')}
        </select></label>` : '')
      + field('Categoría','categoria',record?.categoria)
      + (!isMont ? field('Experiencia','experiencia',record?.experiencia) : '');
  }
  function openForm(id) {
    const edit = id !== null;
    if (!(edit?permitted('EDITAR'):permitted('CREAR'))) return;
    const record = edit?state.rows.find(p=>p.id_personal===id):null;
    if (edit&&!record) return;
    state.formId = edit?id:0;
    el('ppc-dialog-title').textContent = `${edit?'Editar':'Agregar'} ${state.type==='MONTADOR'?'montador':'ajustador'}`;
    el('ppc-fields').innerHTML = formFields(record);
    el('ppc-overlay').hidden = false;
    el('ppc-fields').querySelector('input')?.focus();
  }
  async function saveForm(form) {
    const edit = state.formId > 0;
    if (!(edit?permitted('EDITAR'):permitted('CREAR'))) throw new Error('Permiso insuficiente.');
    const values = Object.fromEntries(new FormData(form).entries());
    const payload = {...values,tipo:state.type};
    el('ppc-save').disabled = true;
    try {
      if (edit) await api(`/personal/${state.type}/${state.formId}`,'PUT',payload);
      else await api('/personal','POST',payload);
      closeForm();
      state.page = 1;
      await reload();
    } finally { if (el('ppc-save')) el('ppc-save').disabled = false; }
  }
  async function deactivate(id) {
    if (!permitted('DESACTIVAR')) return;
    const record = state.rows.find(p=>p.id_personal===id);
    if (!record || !window.confirm(`¿Desactivar a ${record.nombre}?`)) return;
    try {
      await api(`/personal/${state.type}/${id}`,'DELETE');
      await reload();
    } catch(error) { setFeedback(error.message || 'No fue posible desactivar.',true); }
  }
  // [Mantto Gestor | 2026-10-16 | INT9-F2 | CALENDARIO PERSONAL V001]
  const CELL_WIDTH=30;
  const cal={desde:null,span:31,q:'',epoch:0,personal:[],asignaciones:[],sin_fechas:[],equipos:[],
    todosEquipos:0,masEquipos:false,hoy:null,loading:false,feedback:'',error:false};
  const assignment={mode:null,item:null,equipo:null,equipos:[],searchTimer:null,selectedPerson:null,focusDate:null,epoch:0};
  const MONTHS=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const DAY_NAMES=['D','L','M','M','J','V','S'];
  const pad = n => String(n).padStart(2,'0');
  const dateNum = iso => {const [y,m,d]=String(iso).split('-').map(Number);return Math.floor(Date.UTC(y,m-1,d)/86400000);};
  const offsetDate = (iso,n) => new Date((dateNum(iso)+n)*86400000).toISOString().slice(0,10);
  const weekStart = iso => offsetDate(iso,-((new Date(dateNum(iso)*86400000).getUTCDay()+6)%7));
  function todayMexico(){
    const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }
  const dateLabel = iso => iso?`${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5,7))-1]} ${iso.slice(0,4)}`:'Sin fecha';
  const calRoot=()=>el('ppc-calendario');
  const formatWindow=rec=>rec?.valida?`${dateLabel(rec.inicio)} – ${dateLabel(rec.fin)} (${rec.dias} días)`:'Sin fechas válidas';
  function renderView(){
    const calend=calRoot(),catalog=el('ppc-catalogo'),nav=el('ppc-nav');
    if(!calend||!catalog||!nav)return;
    calend.hidden=state.view!=='calendario';
    catalog.hidden=state.view!=='personal';
    if(histRoot())histRoot().hidden=state.view!=='historial';
    if(dispRoot())dispRoot().hidden=state.view!=='disponibilidad';
    nav.querySelectorAll('[data-ppc="seccion"]').forEach(button=>{
      const active=state.view===button.dataset.vista;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
    });
  }
  function setCalendarFeedback(message,problem=false){
    cal.feedback=message||'';cal.error=Boolean(problem);
    const target=el('ppc-cal-feedback');
    if(target){target.textContent=cal.feedback;target.classList.toggle('ppc-error',cal.error);}
  }
  function calendarControls(){
    const target=calRoot();if(!target)return;
    renderTabs();
    if(!cal.desde)cal.desde=weekStart(todayMexico());
    target.innerHTML=`<div class="ppc-card ppc-cal-shell">
      <div class="ppc-cal-controls">
        <div class="ppc-cal-actions"><button type="button" class="ppc-btn ppc-small" data-ppc="cal-prev" title="Periodo anterior">◀</button>
          <button type="button" class="ppc-btn ppc-small" data-ppc="cal-hoy">Hoy</button>
          <button type="button" class="ppc-btn ppc-small" data-ppc="cal-next" title="Periodo siguiente">▶</button></div>
        <label>Desde <input type="date" id="ppc-cal-desde" value="${esc(cal.desde)}"></label>
        <label>Periodo <select id="ppc-cal-span">${[[14,'2 semanas'],[31,'1 mes'],[62,'2 meses'],[93,'3 meses']].map(([n,t])=>`<option value="${n}" ${cal.span===n?'selected':''}>${t}</option>`).join('')}</select></label>
        <label class="ppc-cal-search">Personal <input type="search" id="ppc-cal-query" maxlength="120" value="${esc(cal.q)}" placeholder="Nombre, contratista, puesto…" autocomplete="off"></label>
        ${permitted('CREAR')?'<button type="button" class="ppc-btn ppc-primary" data-ppc="asignar-nueva">+ Asignar a equipo</button>':''}
      </div>
      <p id="ppc-cal-feedback" class="ppc-cal-feedback" role="status" aria-live="polite"></p>
      <div id="ppc-cal-contenido" class="ppc-cal-contenido"><p class="ppc-cal-note">Consultando calendario…</p></div>
      <div id="ppc-cal-cobertura" class="ppc-cal-cobertura"></div>
    </div>`;
    setCalendarFeedback(cal.feedback,cal.error);
  }
  async function reloadCalendar(){
    if(!calRoot())return;
    const epoch=++cal.epoch;
    if(!cal.desde)cal.desde=weekStart(todayMexico());
    cal.loading=true;
    setCalendarFeedback('Consultando programación…');
    const params={tipo:state.type,desde:cal.desde,hasta:offsetDate(cal.desde,cal.span-1),q:cal.q};
    const [program,uncovered]=await Promise.allSettled([
      api('/calendario?'+encodeQuery(params)),
      api('/equipos?'+encodeQuery({tipo:state.type,desde:params.desde,hasta:params.hasta,solo_sin_personal:1,limit:30}))
    ]);
    if(epoch!==cal.epoch||!calRoot())return;
    cal.loading=false;
    if(program.status!=='fulfilled'){
      cal.personal=[];cal.asignaciones=[];cal.sin_fechas=[];
      setCalendarFeedback(program.reason?.message||'No fue posible consultar calendario.',true);
    }else{
      const result=program.value||{};
      cal.personal=Array.isArray(result.personal)?result.personal:[];
      cal.asignaciones=Array.isArray(result.asignaciones)?result.asignaciones:[];
      cal.sin_fechas=Array.isArray(result.sin_fechas)?result.sin_fechas:[];
      cal.hoy=result.hoy||todayMexico();
      setCalendarFeedback(`${cal.personal.length} personas · ${cal.asignaciones.length} asignaciones en el periodo`);
    }
    cal.equipos=uncovered.status==='fulfilled'?(uncovered.value?.equipos||[]):[];
    cal.todosEquipos=uncovered.status==='fulfilled'?Number(uncovered.value?.total||0):0;
    cal.masEquipos=Boolean(uncovered.status==='fulfilled'&&uncovered.value?.hay_mas);
    renderCalendar();
    if(uncovered.status!=='fulfilled'&&program.status==='fulfilled'){
      const elem=el('ppc-cal-cobertura');
      if(elem)elem.insertAdjacentHTML('beforeend',`<p class="ppc-cal-note">Equipos sin personal: ${esc(uncovered.reason?.message||'no disponible')}</p>`);
    }
  }
  function lanePositions(items){
    const laneEnds=[],result=[];
    for(const item of items){
      const from=Math.max(0,dateNum(item.inicio)-dateNum(cal.desde));
      const through=Math.min(cal.span-1,dateNum(item.fin)-dateNum(cal.desde));
      let lane=laneEnds.findIndex(end=>end<from);
      if(lane<0){lane=laneEnds.length;laneEnds.push(-1);}
      laneEnds[lane]=through;result.push({item,from,through,lane});
    }
    return{rows:result,lanes:Math.max(laneEnds.length,1)};
  }
  function renderCalendar(){
    if(!calRoot()||state.view!=='calendario')return;
    // No reconstruir los controles al cambiar resultados; conserva foco/búsqueda.
    const holder=el('ppc-cal-contenido'),coverage=el('ppc-cal-cobertura');
    if(!holder||!coverage)return;
    const who=new Map(cal.personal.map(p=>[Number(p.id_personal),p]));
    const entries=new Map();
    for(const a of cal.asignaciones){
      const id=Number(a.id_personal);if(!who.has(id)||!a.valida)continue;
      if(!entries.has(id))entries.set(id,[]);
      entries.get(id).push(a);
    }
    const dayCells=Array.from({length:cal.span},(_,i)=>{
      const day=offsetDate(cal.desde,i),utcDow=new Date(dateNum(day)*86400000).getUTCDay();
      return `<span class="ppc-cal-day${day===cal.hoy?' ppc-cal-today':''}" title="${esc(day)}"><b>${day.slice(8)}</b><small>${DAY_NAMES[utcDow]}</small></span>`;
    }).join('');
    const personRows=cal.personal.map(p=>{
      const items=(entries.get(Number(p.id_personal))||[]).sort((a,b)=>a.inicio.localeCompare(b.inicio)||a.fin.localeCompare(b.fin));
      const {rows,lanes}=lanePositions(items);
      const height=Math.max(46,lanes*27+11);
      const bars=rows.map(({item,from,through,lane})=>{
        const color=item.visible?'ppc-cal-bar-active':'ppc-cal-bar-outside';
        const label=item.visible?`${item.proyecto||'Proyecto'} · ${item.equipo||'Equipo'}`:'Ocupado (fuera de tu alcance)';
        const action=item.visible&&permitted('EDITAR')?'data-ppc="editar-asignacion"':'';
        const disabled=item.visible&&permitted('EDITAR')?'': 'disabled';
        return `<button type="button" ${action} data-id="${Number(item.id_asignacion)||0}"
          class="ppc-cal-bar ${color}" ${disabled} title="${esc(label)} · ${esc(formatWindow(item))}"
          style="left:${from*CELL_WIDTH+1}px;top:${7+lane*27}px;width:${Math.max(1,(through-from+1)*CELL_WIDTH-2)}px">${esc(label)}</button>`;
      }).join('');
      const desc=p.tipo_personal==='MONTADOR'?[p.contratista,p.puesto].filter(Boolean).join(' · '):p.categoria||'Ajustador';
      return `<div class="ppc-cal-row" style="min-height:${height}px"><div class="ppc-cal-person" title="${esc(p.nombre)}"><b>${esc(p.nombre)}</b><small>${esc(desc)}</small></div>
        <div class="ppc-cal-track" data-ppc="cal-celda" data-persona="${Number(p.id_personal)}" tabindex="${permitted('CREAR')?'0':'-1'}" aria-label="Asignar a ${esc(p.nombre)} en día disponible" style="width:${cal.span*CELL_WIDTH}px;height:${height}px">${bars}</div></div>`;
    }).join('');
    holder.innerHTML=`<div class="ppc-cal-scroll" tabindex="0">
      <div class="ppc-cal-table" style="width:${245+cal.span*CELL_WIDTH}px">
        <div class="ppc-cal-row ppc-cal-header"><div class="ppc-cal-person"><b>PERSONAL</b><small>Ocupación por día</small></div>
          <div class="ppc-cal-days">${dayCells}</div></div>
        ${personRows||'<p class="ppc-cal-note">No hay personal activo para este filtro.</p>'}
      </div></div>`;
    const pending=cal.equipos.map(e=>`<div class="ppc-cal-uncovered-row"><span><b>${esc(e.proyecto)}</b> · ${esc(e.equipo)}<small>${esc(formatWindow(e))}</small></span>
       ${permitted('CREAR')?`<button type="button" class="ppc-btn ppc-small" data-ppc="asignar-equipo" data-equipo="${Number(e.id_ins_fl)}">Asignar</button>`:''}</div>`).join('');
    const invalid=cal.sin_fechas.map(a=>`<div class="ppc-cal-uncovered-row"><span><b>${esc(who.get(Number(a.id_personal))?.nombre||'Personal')}</b> · ${esc(a.proyecto)} · ${esc(a.equipo)}<small>Sin fechas válidas en el reporte</small></span>
      ${permitted('EDITAR')?`<button type="button" class="ppc-btn ppc-small" data-ppc="editar-asignacion" data-id="${Number(a.id_asignacion)}">Editar fechas</button>`:''}</div>`).join('');
    coverage.innerHTML=`<details class="ppc-cal-extras"><summary>Equipos sin personal (${cal.todosEquipos})${cal.masEquipos?' · primeros 30':''}</summary>
        ${pending||'<p class="ppc-cal-note">Sin equipos pendientes en el periodo.</p>'}</details>
      ${invalid?`<details class="ppc-cal-extras"><summary>Asignaciones sin fechas válidas (${cal.sin_fechas.length})</summary>${invalid}</details>`:''}
      <p class="ppc-cal-note">Barras grises = ocupación fuera de tu alcance, sin detalles. Un traslape se advierte antes de guardar. Las fechas se calculan desde el reporte de Instalaciones.</p>`;
    setCalendarFeedback(cal.feedback,cal.error);
  }
  function assignmentFeedback(message,isError=false){
    const target=el('ppc-a-feedback');if(!target)return;
    target.textContent=message||'';target.classList.toggle('ppc-error',Boolean(isError));
  }
  function closeAssignment(){
    assignment.epoch++;
    assignment.mode=null;assignment.item=null;assignment.equipo=null;assignment.focusDate=null;
    clearTimeout(assignment.searchTimer);
    const overlay=el('ppc-assignment-overlay');if(overlay)overlay.hidden=true;
  }
  function assignmentPersons(preselect){
    const all=cal.personal||[];
    const target=el('ppc-a-persons');if(!target)return;
    target.innerHTML=all.map(p=>`<label class="ppc-a-person" data-name="${esc([p.nombre,p.contratista,p.puesto,p.categoria].filter(Boolean).join(' ').toLowerCase())}">
      <input type="checkbox" name="ppc-persona" value="${Number(p.id_personal)}" ${preselect===Number(p.id_personal)?'checked':''}>
      <span>${esc(p.nombre)} <small>${esc(p.grupo||p.puesto||p.categoria||'')}</small></span></label>`).join('')||'<p class="ppc-cal-note">No hay personas con este filtro. Prueba borrando la búsqueda del calendario.</p>';
  }
  function renderEquipoSelect(){
    const target=el('ppc-a-equipo');if(!target)return;
    const items=assignment.equipos;
    const selected=assignment.equipo;
    target.innerHTML='<option value="">Selecciona equipo</option>'+items.map(e=>`<option value="${Number(e.id_ins_fl)}" ${Number(e.id_ins_fl)===selected?'selected':''}>${esc(e.proyecto)} · ${esc(e.equipo)}</option>`).join('');
    showEquipoRange();
  }
  function showEquipoRange(){
    const id=Number(el('ppc-a-equipo')?.value||0);
    const item=assignment.equipos.find(e=>Number(e.id_ins_fl)===id);
    const target=el('ppc-a-rango');if(target)target.textContent=item?`Según reporte: ${formatWindow(item)}`:'Selecciona un equipo.';
  }
  async function searchEquipos(q=''){
    if(assignment.mode!=='new')return;
    const epoch=assignment.epoch;
    const current=assignment.equipo;
    const query=encodeQuery({tipo:state.type,q,limit:250});
    const response=await api('/equipos?'+query);
    if(assignment.mode!=='new'||assignment.epoch!==epoch)return;
    const loaded=Array.isArray(response?.equipos)?response.equipos:[];
    if(current&&!loaded.some(e=>Number(e.id_ins_fl)===current)){
      const other=await api('/equipos?'+encodeQuery({tipo:state.type,id_ins_fl:current,limit:1}));
      if(other?.equipos?.[0])loaded.unshift(other.equipos[0]);
    }
    if(assignment.mode!=='new'||assignment.epoch!==epoch)return;
    if(assignment.focusDate){
      const day=assignment.focusDate;
      const covers=e=>e.valida&&e.inicio<=day&&e.fin>=day;
      loaded.sort((a,b)=>Number(covers(b))-Number(covers(a)));
    }
    assignment.equipos=loaded;
    renderEquipoSelect();
    assignmentFeedback(response?.hay_mas?`Mostrando ${response.mostrados} de ${response.total} equipos; utiliza la búsqueda.`:'');
  }
  async function openAssignment(options={}){
    if(!permitted('CREAR')||!calRoot())return;
    assignment.epoch++;assignment.mode='new';assignment.item=null;
    assignment.equipo=options.idEquipo||null;
    assignment.selectedPerson=options.idPersona||null;assignment.focusDate=options.fecha||null;
    const overlay=el('ppc-assignment-overlay');if(!overlay)return;
    el('ppc-a-title').textContent='Asignar personal a equipo';
    el('ppc-a-new').hidden=false;el('ppc-a-edit').hidden=true;el('ppc-a-equipo').required=true;
    el('ppc-a-submit').textContent='Guardar asignación';
    el('ppc-a-force').hidden=true;el('ppc-a-delete').hidden=true;
    el('ppc-a-desde').value='';el('ppc-a-hasta').value='';el('ppc-a-notas').value='';
    el('ppc-a-eq-search').value='';el('ppc-a-person-search').value='';
    assignmentPersons(options.idPersona||null);
    overlay.hidden=false;assignmentFeedback('Cargando equipos…');
    try{await searchEquipos(options.idEquipo?String(options.projectQuery||''):'');}
    catch(ex){assignmentFeedback(ex.message||'No fue posible cargar equipos.',true);}
  }
  function openEditAssignment(id){
    if(!permitted('EDITAR'))return;
    const item=[...cal.asignaciones,...cal.sin_fechas].find(x=>Number(x.id_asignacion)===Number(id)&&x.visible);
    if(!item)return;
    assignment.epoch++;assignment.mode='edit';assignment.item=item;
    const overlay=el('ppc-assignment-overlay');if(!overlay)return;
    el('ppc-a-title').textContent='Editar asignación';
    el('ppc-a-new').hidden=true;el('ppc-a-edit').hidden=false;el('ppc-a-equipo').required=false;
    el('ppc-a-edit-info').innerHTML=`<b>${esc(cal.personal.find(p=>Number(p.id_personal)===Number(item.id_personal))?.nombre||'Personal')}</b><br>
      ${esc(item.proyecto)} · ${esc(item.equipo)}<br>${esc(formatWindow(item))}`;
    el('ppc-a-desde').value=item.fecha_desde||'';
    el('ppc-a-hasta').value=item.fecha_hasta||'';
    el('ppc-a-notas').value=item.notas||'';
    el('ppc-a-submit').textContent='Guardar cambios';
    el('ppc-a-delete').hidden=!permitted('DESACTIVAR');
    el('ppc-a-force').hidden=true;
    overlay.hidden=false;assignmentFeedback('');
  }
  function conflictMessage(response){
    const list=Array.isArray(response?.conflictos)?response.conflictos:[];
    return list.map(x=>`${x.nombre||'Personal'}: ${(x.con||[]).map(c=>c.visible?
      `${c.proyecto||'Proyecto'} / ${c.equipo||'Equipo'} (${c.inicio} – ${c.fin})`:
      `ocupado fuera de tu alcance (${c.inicio} – ${c.fin})`).join(' · ')}`).join('\n');
  }
  async function saveAssignment(force=false){
    if(!assignment.mode)return;
    const edit=assignment.mode==='edit',permission=edit?'EDITAR':'CREAR';
    if(!permitted(permission)){assignmentFeedback('No cuentas con permiso para esta operación.',true);return;}
    const form=el('ppc-a-form');
    if(!form?.reportValidity())return;
    const desde=el('ppc-a-desde').value||null,hasta=el('ppc-a-hasta').value||null,
      notas=el('ppc-a-notas').value||null;
    const values={fecha_desde:desde,fecha_hasta:hasta,notas,permitir_traslape:force};
    if(!edit){
      values.tipo=state.type;
      values.id_ins_fl=Number(el('ppc-a-equipo').value);
      values.ids_personal=[...el('ppc-a-persons').querySelectorAll('input:checked')].map(n=>Number(n.value));
      if(!values.ids_personal.length){assignmentFeedback('Selecciona una o más personas.',true);return;}
      if(!values.id_ins_fl){assignmentFeedback('Selecciona un equipo.',true);return;}
    }
    el('ppc-a-submit').disabled=true;
    try{
      const response=edit?await api(`/asignaciones/${assignment.item.id_asignacion}`,'PUT',values)
        :await api('/asignaciones','POST',values);
      if(response.requiere_confirmacion){
        el('ppc-a-force').hidden=false;
        assignmentFeedback('Conflictos detectados. Revisa y confirma solo si corresponde:\n'+conflictMessage(response),true);
        return;
      }
      closeAssignment();await reloadCalendar();
    }catch(ex){assignmentFeedback(ex.message||'Error al guardar asignación.',true);}
    finally{if(el('ppc-a-submit'))el('ppc-a-submit').disabled=false;}
  }
  async function deleteAssignment(){
    if(!assignment.item||!permitted('DESACTIVAR'))return;
    if(!window.confirm('¿Quitar esta asignación? Se desactivará sin borrar su registro.'))return;
    try{
      await api(`/asignaciones/${assignment.item.id_asignacion}`,'DELETE');
      closeAssignment();await reloadCalendar();
    }catch(ex){assignmentFeedback(ex.message||'No fue posible quitar la asignación.',true);}
  }
  function trackClicked(event,node){
    if(!permitted('CREAR'))return;
    const bounds=node.getBoundingClientRect();
    const offset=event?.clientX?event.clientX-bounds.left:0;
    const index=Math.min(cal.span-1,Math.max(0,Math.floor(offset/CELL_WIDTH)));
    openAssignment({idPersona:Number(node.dataset.persona),fecha:offsetDate(cal.desde,index)});
  }

  // [Mantto Gestor | 2026-10-16 | INT9-F3 | HISTORIAL DISPONIBILIDAD Y SIMULACION]
  const hist={epoch:0,page:1,limit:30,total:0,q:'',desde:'',hasta:'',estado:'',res:null};
  const disp={epoch:0,desde:todayMexico(),hasta:null,granularidad:'mes',res:null,
    simEpoch:0,simEquipo:null,simEquipos:[],simQ:'',simRes:null,searchEpoch:0,searchTimer:null};
  const READ_CODE = CODE+'.VER';
  function canRead(){return Boolean(window.ManttoPermissions?.can?.(READ_CODE,{defaultValue:false}));}
  const histRoot=()=>el('ppc-historial');
  const dispRoot=()=>el('ppc-disponibilidad');
  const numberFmt=value=>new Intl.NumberFormat('es-MX').format(Number(value)||0);
  function addMonths(iso,n){
    const date=new Date(`${iso}T00:00:00Z`),day=date.getUTCDate();
    date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+n);
    const endOfMonth=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    date.setUTCDate(Math.min(day,endOfMonth));
    return date.toISOString().slice(0,10);
  }
  function readHistoryFilters(){
    hist.q=el('ppc-h-query')?.value?.trim()||'';
    hist.estado=el('ppc-h-status')?.value||'';
    hist.desde=el('ppc-h-desde')?.value||'';
    hist.hasta=el('ppc-h-hasta')?.value||'';
  }
  function historyControls(){
    const target=histRoot();if(!target)return;
    target.innerHTML=`<section class="ppc-card ppc-analytics-card">
      <div class="ppc-analytics-heading"><div><h2>Historial de programación</h2>
        <p>Asignaciones pasadas, vigentes, futuras y retiradas. Los días transcurridos son programados; <b>no acreditan asistencia ni trabajo ejecutado</b>.</p></div></div>
      <form id="ppc-h-filters" class="ppc-analytics-filters">
        <label>Buscar <input id="ppc-h-query" type="search" maxlength="120" value="${esc(hist.q)}" placeholder="Nombre, proyecto, equipo…"></label>
        <label>Desde <input id="ppc-h-desde" type="date" value="${esc(hist.desde)}"></label>
        <label>Hasta <input id="ppc-h-hasta" type="date" value="${esc(hist.hasta)}"></label>
        <label>Estado <select id="ppc-h-status">${[['','Todos'],['Pasada','Pasada'],['En curso','En curso'],['Futura','Futura'],['Sin fechas','Sin fechas'],['Retirada','Retirada']].map(([v,t])=>`<option value="${v}" ${hist.estado===v?'selected':''}>${t}</option>`).join('')}</select></label>
        <button class="ppc-btn ppc-primary" type="submit">Filtrar</button>
      </form>
      <p class="ppc-analytics-alert">Consulta histórica dinámica: si el reporte cambia sus fechas, los días programados también pueden cambiar. Una asignación retirada se conserva como registro, sin contabilizar días futuros.</p>
      <div id="ppc-h-result" aria-live="polite">Consultando historial…</div>
    </section>`;
  }
  async function loadHistory(){
    if(!histRoot()||!canRead())return;
    const epoch=++hist.epoch;
    const target=el('ppc-h-result');if(target)target.textContent='Consultando historial…';
    const params={tipo:state.type,q:hist.q,desde:hist.desde,hasta:hist.hasta,estado:hist.estado,page:hist.page,limit:hist.limit};
    try{
      const r=await api('/historial?'+encodeQuery(params));
      if(epoch!==hist.epoch||!histRoot())return;
      hist.res=r;hist.total=Number(r.total||0);renderHistory();
    }catch(ex){if(epoch!==hist.epoch)return;hist.res=null;if(target)target.innerHTML=`<p class="ppc-cal-feedback ppc-error">${esc(ex.message||'No fue posible consultar historial.')}</p>`;}
  }
  function renderHistory(){
    const target=el('ppc-h-result');if(!target)return;
    const r=hist.res||{},rows=Array.isArray(r.filas)?r.filas:[],sum=r.resumen||{};
    const badges=[['Asignaciones',sum.total_asignaciones],['Activas',sum.asignaciones_activas],['Retiradas',sum.asignaciones_retiradas],
      ['Días programados transcurridos',sum.dias_programados_transcurridos],['Días programados futuros',sum.dias_programados_futuros]];
    const totalPages=Math.max(1,Math.ceil((r.total||0)/hist.limit));
    target.innerHTML=`<div class="ppc-analytics-kpis">${badges.map(([name,n])=>`<div class="ppc-analytics-kpi"><small>${esc(name)}</small><b>${numberFmt(n)}</b></div>`).join('')}</div>
      <div class="ppc-table-scroll"><table class="ppc-table ppc-h-table"><thead><tr>
        <th>Personal</th><th>Proyecto / equipo</th><th>Fechas programadas</th><th>Días previstos</th><th>Estado</th><th>Fuente fin</th>
      </tr></thead><tbody>${rows.length?rows.map(x=>`<tr>
        <td><b>${esc(x.nombre)}</b><small>${fmt(x.contratista||x.puesto||x.categoria)}</small></td>
        <td>${fmt(x.proyecto)}<small>${fmt(x.equipo)}</small></td>
        <td>${x.inicio?dateLabel(x.inicio):'Sin fecha'} — ${x.fin?dateLabel(x.fin):'Sin fecha'}</td>
        <td><b>${numberFmt(x.dias||0)} planeados</b><small>${numberFmt(x.dias_programados_transcurridos)} transcurridos · ${numberFmt(x.dias_programados_futuros)} futuros</small></td>
        <td><span class="ppc-analytics-state">${esc(x.estado)}</span></td><td>${fmt(x.fuente_fin)}</td>
      </tr>`).join(''):`<tr><td class="ppc-empty" colspan="6">No hay asignaciones con los filtros seleccionados.</td></tr>`}</tbody></table></div>
      <div class="ppc-pagination"><span>${numberFmt(r.total)} registros · Página ${hist.page} de ${totalPages}</span>
        <div><button type="button" class="ppc-btn ppc-small" data-ppc="hist-prev" ${hist.page<=1?'disabled':''}>Anterior</button>
        <button type="button" class="ppc-btn ppc-small" data-ppc="hist-next" ${hist.page>=totalPages?'disabled':''}>Siguiente</button></div></div>`;
  }
  function availabilityControls(){
    const target=dispRoot();if(!target)return;
    if(!disp.hasta)disp.hasta=offsetDate(addMonths(disp.desde,3),-1);
    target.innerHTML=`<div class="ppc-card ppc-analytics-card">
      <div class="ppc-analytics-heading"><div><h2>Disponibilidad y proyección</h2>
        <p>Personal libre, ocupado e indeterminado según las asignaciones registradas. Se contabilizan ocupaciones fuera de tu alcance, sin revelar sus equipos.</p></div></div>
      <div class="ppc-analytics-presets">${[[3,'3 meses'],[12,'12 meses'],[36,'3 años'],[60,'5 años']].map(([n,t])=>`<button type="button" class="ppc-btn ppc-small" data-ppc="disp-preset" data-meses="${n}">${t}</button>`).join('')}</div>
      <form id="ppc-d-form" class="ppc-analytics-filters">
        <label>Desde <input id="ppc-d-desde" type="date" required value="${esc(disp.desde)}"></label>
        <label>Hasta <input id="ppc-d-hasta" type="date" required value="${esc(disp.hasta)}"></label>
        <label>Agrupación <select id="ppc-d-gran">${[['dia','Día'],['semana','Semana'],['mes','Mes']].map(([v,t])=>`<option value="${v}" ${disp.granularidad===v?'selected':''}>${t}</option>`).join('')}</select></label>
        <button type="submit" class="ppc-btn ppc-primary">Calcular disponibilidad</button>
      </form>
      <p class="ppc-analytics-alert">Una asignación sin fechas válidas se clasifica como <b>indeterminada</b>: nunca se asume que la persona está libre.</p>
      <div id="ppc-d-result" aria-live="polite">Consultando disponibilidad…</div>
    </div>
    <div class="ppc-card ppc-analytics-card ppc-sim-card"><div class="ppc-analytics-heading"><div><h2>Simular una nueva asignación</h2><p>Indica personal adicional requerido. No crea, modifica ni reserva asignaciones.</p></div></div>
      <form id="ppc-s-form" class="ppc-analytics-filters">
        <label class="ppc-s-search">Buscar equipo (opcional) <input type="search" id="ppc-s-query" value="${esc(disp.simQ)}" maxlength="120" placeholder="Proyecto o referencia"></label>
        <label class="ppc-s-equipo">Equipo visible <select id="ppc-s-equipo"><option value="">Sin equipo: indicar fechas</option></select></label>
        <label>Inicio <input type="date" id="ppc-s-desde"></label><label>Fin <input type="date" id="ppc-s-hasta"></label>
        ${state.type==='MONTADOR'?`<label>Mecánicos <input type="number" id="ppc-s-mec" min="0" max="60" step="1" value="1"></label><label>Ayudantes <input type="number" id="ppc-s-ayu" min="0" max="60" step="1" value="1"></label>`:
          `<label>Ajustadores <input type="number" id="ppc-s-ajustadores" min="0" max="60" step="1" value="1"></label>`}
        <button type="submit" class="ppc-btn ppc-primary">Simular</button>
      </form><p class="ppc-cal-note" id="ppc-s-equipo-info"></p>
      <div id="ppc-s-result" aria-live="polite">Selecciona un equipo o captura fechas y simula.</div>
    </div>`;
  }
  async function loadAvailability(){
    if(!dispRoot()||!canRead())return;
    const epoch=++disp.epoch;
    const target=el('ppc-d-result');if(target)target.textContent='Calculando disponibilidad…';
    try{
      const r=await api('/disponibilidad?'+encodeQuery({tipo:state.type,desde:disp.desde,hasta:disp.hasta,granularidad:disp.granularidad}));
      if(epoch!==disp.epoch||!dispRoot())return;
      disp.res=r;renderAvailability();
    }catch(ex){if(epoch!==disp.epoch)return;disp.res=null;if(target)target.innerHTML=`<p class="ppc-cal-feedback ppc-error">${esc(ex.message||'No fue posible calcular.')}</p>`;}
  }
  function renderAvailability(){
    const target=el('ppc-d-result');if(!target)return;
    const r=disp.res||{},rows=Array.isArray(r.buckets)?r.buckets:[];
    const total=Math.max(1,Number(r.total_personal)||0);
    target.innerHTML=`<p class="ppc-cal-note">Personal incluido: <b>${numberFmt(r.total_personal)}</b> · ${rows.length} periodos</p>
      <div class="ppc-table-scroll"><table class="ppc-table ppc-d-table"><thead><tr><th>Periodo</th><th>Libres confirmados</th><th>Ocupados</th><th>Indeterminados</th><th>Distribución</th></tr></thead><tbody>
      ${rows.map(b=>`<tr><td>${esc(dateLabel(b.desde))} – ${esc(dateLabel(b.hasta))}</td>
        <td>${numberFmt(b.libres)}</td><td>${numberFmt(b.ocupados)}</td><td>${numberFmt(b.indeterminados)}</td>
        <td><div class="ppc-availability-bar" title="${numberFmt(b.libres)} libres, ${numberFmt(b.ocupados)} ocupados, ${numberFmt(b.indeterminados)} indeterminados">
          <span class="ppc-bar-free" style="width:${Math.min(100,100*(b.libres||0)/total)}%"></span>
          <span class="ppc-bar-busy" style="width:${Math.min(100,100*(b.ocupados||0)/total)}%"></span>
          <span class="ppc-bar-unknown" style="width:${Math.min(100,100*(b.indeterminados||0)/total)}%"></span>
        </div></td></tr>`).join('')||'<tr><td class="ppc-empty" colspan="5">Sin periodos.</td></tr>'}
      </tbody></table></div>
      <p class="ppc-cal-note">Los ocupados son personas con al menos una asignación que coincide con el periodo. Una persona puede tener días libres dentro del mismo periodo y seguir contándose como ocupada.</p>`;
  }
  async function searchSimulationEquipos(q=''){
    const epoch=++disp.searchEpoch;
    const list=el('ppc-s-equipo');if(!list)return;
    try{
      const r=await api('/equipos?'+encodeQuery({tipo:state.type,q,limit:80}));
      if(epoch!==disp.searchEpoch||!el('ppc-s-equipo'))return;
      disp.simEquipos=Array.isArray(r.equipos)?r.equipos:[];
      const selection=disp.simEquipo;
      list.innerHTML='<option value="">Sin equipo: indicar fechas</option>'+disp.simEquipos.map(t=>`<option value="${Number(t.id_ins_fl)}" ${Number(selection)===Number(t.id_ins_fl)?'selected':''}>${esc(t.proyecto)} · ${esc(t.equipo)}${t.valida?' ('+esc(t.inicio)+' → '+esc(t.fin)+')':''}</option>`).join('');
      const hint=el('ppc-s-equipo-info');if(hint)hint.textContent=r.hay_mas?'Hay más equipos; escribe el proyecto para localizarlo.':'';
    }catch(ex){if(epoch!==disp.searchEpoch)return;const hint=el('ppc-s-equipo-info');if(hint)hint.textContent=ex.message||'No se pudieron consultar equipos.';}
  }
  async function simulate(){
    if(!canRead())return;
    const epoch=++disp.simEpoch,target=el('ppc-s-result');
    if(target)target.textContent='Simulando…';
    const query={tipo:state.type,id_ins_fl:el('ppc-s-equipo')?.value||'',
      fecha_inicio:el('ppc-s-desde')?.value||'',fecha_fin:el('ppc-s-hasta')?.value||''};
    if(state.type==='MONTADOR'){query.mecanicos=el('ppc-s-mec')?.value||'0';query.ayudantes=el('ppc-s-ayu')?.value||'0';}
    else query.ajustadores=el('ppc-s-ajustadores')?.value||'0';
    try{
      const r=await api('/simulacion?'+encodeQuery(query));
      if(epoch!==disp.simEpoch||!el('ppc-s-result'))return;
      disp.simRes=r;renderSimulation();
    }catch(ex){if(epoch!==disp.simEpoch)return;disp.simRes=null;if(target)target.innerHTML=`<p class="ppc-cal-feedback ppc-error">${esc(ex.message||'No fue posible simular.')}</p>`;}
  }
  function renderSimulation(){
    const target=el('ppc-s-result');if(!target)return;
    const r=disp.simRes||{},req=Array.isArray(r.resumen)?r.resumen:[];
    const persons=(array,title,kind)=>`<details class="ppc-s-people"><summary>${esc(title)} (${numberFmt(array?.length)})</summary><ul>${(array||[]).slice(0,300).map(p=>`<li><b>${esc(p.nombre)}</b>${p.puesto?' · '+esc(p.puesto):''}${p.contratista?' · '+esc(p.contratista):''}${kind==='busy'&&p.libre_desde?' · Libre desde '+esc(p.libre_desde):''}</li>`).join('')||'<li>Sin registros.</li>'}</ul>${(array||[]).length>300?'<p>Se muestran las primeras 300 personas.</p>':''}</details>`;
    target.innerHTML=`<div class="ppc-s-result-heading ${r.viable?'ppc-s-viable':'ppc-s-inviable'}"><b>${r.viable?'Cobertura teórica suficiente':'Falta personal libre confirmado'}</b>
      <span>${fmt(r.ventana?.inicio)} — ${fmt(r.ventana?.fin)} (${numberFmt(r.ventana?.dias)} días naturales)</span></div>
      <div class="ppc-analytics-kpis">${req.map(x=>`<div class="ppc-analytics-kpi"><small>${esc(x.grupo)} · Requeridos ${numberFmt(x.requeridos)}</small><b>${numberFmt(x.libres)} libres · ${numberFmt(x.faltantes)} faltantes</b></div>`).join('')}</div>
      <p class="ppc-cal-note">${esc(r.advertencia||'Simulación teórica; no modifica la programación.')}</p>
      <div class="ppc-s-people-grid">${persons(r.libres,'Libres confirmados','free')}${persons(r.ocupados,'Ocupados / ya asignados','busy')}${persons(r.indeterminados,'Disponibilidad indeterminada','unknown')}</div>`;
  }
  function loadActiveSection(){
    if(!canRead())return;
    if(state.view==='personal')return reload();
    if(state.view==='historial'){historyControls();return loadHistory();}
    if(state.view==='disponibilidad'){availabilityControls();searchSimulationEquipos('');return loadAvailability();}
    calendarControls();return reloadCalendar();
  }
  function notifyProgrammingMutation(event){
    const path=String(event?.detail?.path||'').toLowerCase();
    if(!path.startsWith('/api/instalaciones/')&&!path.startsWith('/api/ins-fl'))return;
    const sync=window.ManttoDataSync;
    if(sync&&typeof sync.notifyMutation==='function'){
      sync.notifyMutation({route:'instalaciones-programacion-personal'});
    }else if(window.ManttoRouter?.getCurrent?.().route==='instalaciones-programacion-personal'){
      loadActiveSection();
    }
  }
  document.addEventListener('mantto:data-mutated',notifyProgrammingMutation);
  // ManttoDataSync difunde tambien cambios de ins_fl desde otras pestañas.
  // Si la ruta de Programacion no estaba montada en la pestaña emisora,
  // no formaba parte de ROUTE_GROUPS: marcamos nuestra ruta al recibirlos.
  if(typeof BroadcastChannel==='function'){
    const inputChannel=new BroadcastChannel('mantto-data-sync');
    inputChannel.onmessage=event=>{
      if(event.data?.type!=='mutation')return;
      const routes=Array.isArray(event.data.routes)?event.data.routes:[];
      if(routes.includes('instalaciones-programacion-personal'))return;
      if(!routes.some(r=>String(r).startsWith('instalaciones-')))return;
      const sync=window.ManttoDataSync;
      if(typeof sync?.markDirty!=='function')return;
      sync.markDirty('instalaciones-programacion-personal');
      if(window.ManttoRouter?.getCurrent?.().route==='instalaciones-programacion-personal'&&!document.hidden)
        sync.refresh?.('instalaciones-programacion-personal','otra-pestana-inst', {force:true});
    };
  }
  if(window.ManttoDataSync?.register){
    window.ManttoDataSync.register('instalaciones-programacion-personal',{
      backgroundSync:async()=>{
        if(window.ManttoRouter?.getCurrent?.().route!=='instalaciones-programacion-personal')return false;
        await loadActiveSection();return true;
      }
    });
  }

  function onClick(event) {
    const node = event.target.closest('[data-ppc]');
    if (!node || !root()?.contains(node)) return;
    const action = node.dataset.ppc;
    if(action==='seccion') {
      const next=node.dataset.vista;
      if(!['calendario','personal','historial','disponibilidad'].includes(next))return;
      state.view=next;renderView();loadActiveSection();
    } else if (action==='tipo' && TYPES[node.dataset.tipo]) {
      state.type = node.dataset.tipo;state.page=1;state.q='';cal.q='';closeForm();closeAssignment();
      if (el('ppc-query')) el('ppc-query').value='';
      ++hist.epoch;++disp.epoch;++disp.simEpoch;++disp.searchEpoch;
      hist.page=1;hist.res=null;disp.res=null;disp.simRes=null;disp.simEquipo=null;
      loadActiveSection();
    } else if(action==='actualizar'){loadActiveSection();}
    else if(action==='hist-prev'&&hist.page>1){hist.page--;loadHistory();}
    else if(action==='hist-next'&&hist.page*hist.limit<hist.total){hist.page++;loadHistory();}
    else if(action==='disp-preset'){
      const months=Number(node.dataset.meses);
      if(![3,12,36,60].includes(months))return;
      disp.desde=todayMexico();disp.hasta=offsetDate(addMonths(disp.desde,months),-1);
      disp.granularidad=months>=36?'mes':months===12?'mes':'semana';
      availabilityControls();searchSimulationEquipos(disp.simQ);loadAvailability();
    } else if(action==='cal-prev') {cal.desde=offsetDate(cal.desde,-cal.span);calendarControls();reloadCalendar();}
    else if(action==='cal-next') {cal.desde=offsetDate(cal.desde,cal.span);calendarControls();reloadCalendar();}
    else if(action==='cal-hoy') {cal.desde=weekStart(todayMexico());calendarControls();reloadCalendar();}
    else if(action==='asignar-nueva') openAssignment();
    else if(action==='asignar-equipo') openAssignment({idEquipo:Number(node.dataset.equipo)});
    else if(action==='cal-celda') trackClicked(event,node);
    else if(action==='editar-asignacion') openEditAssignment(Number(node.dataset.id));
    else if(action==='cerrar-asignacion') closeAssignment();
    else if(action==='confirmar-traslape') saveAssignment(true);
    else if(action==='quitar-asignacion') deleteAssignment();
    else if (action==='nuevo') openForm(null);
    else if (action==='editar') openForm(Number(node.dataset.id));
    else if (action==='baja') deactivate(Number(node.dataset.id));
    else if (action==='cancelar') closeForm();
    else if (action==='anterior' && state.page>1) { state.page-=1;reload(); }
    else if (action==='siguiente' && state.page*state.limit < state.total) { state.page+=1;reload(); }
  }
  function onInput(event) {
    if(event.target?.id==='ppc-s-query') {
      disp.simQ=String(event.target.value||'').trim();
      clearTimeout(disp.searchTimer);
      disp.searchTimer=setTimeout(()=>searchSimulationEquipos(disp.simQ),350);
      return;
    }
    if(event.target?.id==='ppc-cal-query') {
      const term=event.target.value;
      clearTimeout(state.filterTimer);
      state.filterTimer=setTimeout(()=>{cal.q=term;reloadCalendar();},350);
      return;
    }
    if(event.target?.id==='ppc-a-eq-search') {
      const term=event.target.value;
      clearTimeout(assignment.searchTimer);
      assignment.searchTimer=setTimeout(async()=>{try{await searchEquipos(term);}catch(ex){assignmentFeedback(ex.message,true);}},350);
      return;
    }
    if(event.target?.id==='ppc-a-person-search') {
      const query=String(event.target.value||'').toLowerCase();
      el('ppc-a-persons')?.querySelectorAll('.ppc-a-person').forEach(p=>p.hidden=Boolean(query)&&!p.dataset.name.includes(query));
      return;
    }
    if (event.target?.id !== 'ppc-query') return;
    const newQuery = event.target.value;
    clearTimeout(state.filterTimer);
    state.filterTimer = setTimeout(()=>{state.q=newQuery;state.page=1;reload();},300);
  }
  function onChange(event) {
    const target=event.target;
    if(target?.id==='ppc-cal-desde' && target.value) {cal.desde=target.value;reloadCalendar();}
    else if(target?.id==='ppc-cal-span'){cal.span=Number(target.value)||31;reloadCalendar();}
    else if(target?.id==='ppc-a-equipo'){assignment.equipo=Number(target.value)||null;showEquipoRange();}
    else if(target?.id==='ppc-s-equipo'){
      disp.simEquipo=Number(target.value)||null;
      const team=disp.simEquipos.find(t=>Number(t.id_ins_fl)===disp.simEquipo);
      const hint=el('ppc-s-equipo-info');if(hint)hint.textContent=team?(team.valida?`Fechas del reporte: ${team.inicio} a ${team.fin}. Puedes sustituirlas manualmente.`:'Equipo sin fechas: indica inicio y fin.'):'Indica ambas fechas para simular sin equipo.';
    }
  }
  function onCalendarKeydown(event) {
    if(event.target?.dataset?.ppc==='cal-celda'&&(event.key==='Enter'||event.key===' ')) {
      event.preventDefault();trackClicked(null,event.target);
    }
  }
  async function onSubmit(event) {
    if(event.target?.id==='ppc-h-filters'){
      event.preventDefault();readHistoryFilters();hist.page=1;await loadHistory();return;
    }
    if(event.target?.id==='ppc-d-form'){
      event.preventDefault();disp.desde=el('ppc-d-desde').value;
      disp.hasta=el('ppc-d-hasta').value;disp.granularidad=el('ppc-d-gran').value;
      await loadAvailability();return;
    }
    if(event.target?.id==='ppc-s-form'){event.preventDefault();await simulate();return;}
    if(event.target?.id==='ppc-a-form'){event.preventDefault();await saveAssignment(false);return;}
    if (event.target?.id !== 'ppc-form') return;
    event.preventDefault();
    try { await saveForm(event.target); }
    catch(error) { setFeedback(error.message || 'No fue posible guardar.',true); }
  }
  function clearSensitiveView() {
    ++state.epoch;
    ++cal.epoch;
    ++hist.epoch;++disp.epoch;++disp.simEpoch;++disp.searchEpoch;
    clearTimeout(disp.searchTimer);
    clearTimeout(state.filterTimer);
    hist.res=null;hist.total=0;hist.q='';hist.estado='';hist.desde='';hist.hasta='';hist.page=1;
    disp.res=null;disp.simRes=null;disp.simEquipos=[];disp.simEquipo=null;disp.simQ='';
    closeAssignment();
    cal.personal=[];cal.asignaciones=[];cal.sin_fechas=[];cal.equipos=[];cal.todosEquipos=0;cal.masEquipos=false;cal.feedback='';cal.error=false;
    if(el('ppc-cal-contenido'))el('ppc-cal-contenido').replaceChildren();
    if(el('ppc-cal-cobertura'))el('ppc-cal-cobertura').replaceChildren();
    if(histRoot())histRoot().replaceChildren();
    if(dispRoot())dispRoot().replaceChildren();
    closeForm();
    state.rows = [];
    state.options = null;
    state.total = 0;
    state.page = 1;
    if (root()) { renderList();setFeedback(''); }
  }
  async function init() {
    if (!root()) return;
    if (!state.ready) shell();
    renderView();renderTabs();
    if(!canRead()){
      clearSensitiveView();
      if(root())root().innerHTML='<section class="ppc-card ppc-analytics-card" role="alert">No tienes permiso de lectura para Programación de Personal.</section>';
      state.ready=false;
      return false;
    }
    await loadActiveSection();return true;
  }
  document.addEventListener('mantto:session-expired',clearSensitiveView);
  document.addEventListener('mantto:view-user-changed',()=>{clearSensitiveView();if(window.ManttoRouter?.getCurrent?.().route==='instalaciones-programacion-personal')init();});
  document.addEventListener('mantto:auth-ready',clearSensitiveView);
  document.addEventListener('mantto:permissions-updated',()=>{
    if(!canRead()){clearSensitiveView();if(window.ManttoRouter?.getCurrent?.().route==='instalaciones-programacion-personal')window.ManttoRouter?.reset?.();return;}
    if(!state.ready)return;
    renderTabs();renderList();if(state.view==='calendario'){calendarControls();renderCalendar();}
  });
  window.ManttoInstalacionesProgramacionPersonal = {init,reload:init,dispose:clearSensitiveView};
})();
