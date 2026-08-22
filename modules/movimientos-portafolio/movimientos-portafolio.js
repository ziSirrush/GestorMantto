(function(){
  'use strict';

  const MODULE_VERSION = '20260821-fase09-cuartos-v001';
  const state = {
    loaded:false,
    rows:[],
    alcance:{ zona_ids:[], zonas:[] },
    weeklyCatalog:[],
    weeklyRows:[],
    weeklyCut:null
  };

  function API(){ return (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, ''); }
  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v == null || v === '' ? '—' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function int(v){ const n=Number(v||0); return Number.isFinite(n)?n.toLocaleString('es-MX'):'0'; }
  function val(id){ const el=$(id); return el?el.value.trim():''; }
  function text(id,value){ const el=$(id); if(el) el.textContent=value; }
  function qs(params){ const u=new URLSearchParams(); Object.entries(params||{}).forEach(([k,v])=>{ if(v!==undefined&&v!==null&&String(v).trim()!=='')u.set(k,v); }); return u.toString(); }
  function normTxt(v){ return String(v==null?'':v).trim(); }
  function normStatus(v){ return normTxt(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function isServicio(v){ const s=normStatus(v); return s==='en servicio'||s==='servicio'; }
  function fmtDate(v){
    if(!v)return '—';
    const s=String(v).trim();
    const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m)return m[3]+'/'+m[2]+'/'+m[1];
    const d=new Date(s);
    return Number.isNaN(d.getTime())?s:d.toLocaleDateString('es-MX');
  }
  function fmtProjectName(v){
    const raw=normTxt(v);
    const m=raw.match(/^(\d+)-(\d{2})-(\d{2})(?:T.*)?$/);
    if(!m)return raw;
    const meses={'01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo','06':'Junio','07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre'};
    const numero=String(Number(m[1])||m[1].replace(/^0+/,'')||m[1]);
    return String(Number(m[3])||m[3])+' de '+(meses[m[2]]||m[2])+' #'+numero;
  }
  function first(row,keys){
    for(const key of keys){
      if(row&&row[key]!==undefined&&row[key]!==null&&String(row[key]).trim()!=='')return row[key];
    }
    return null;
  }
  function tipoLabel(type){
    const t=String(type||'').toUpperCase();
    if(t==='DEGRADADO')return 'Salida de servicio';
    if(t==='RECUPERADO')return 'Regreso a servicio';
    return 'Cambio operativo';
  }
  function tagFor(type){
    const t=String(type||'').toUpperCase();
    if(t==='DEGRADADO')return {cls:'red'};
    if(t==='RECUPERADO')return {cls:'green'};
    return {cls:'amber'};
  }
  function statusPill(value){
    return '<span class="mov-status-pill '+(isServicio(value)?'ok':'bad')+'"><i></i>'+esc(value)+'</span>';
  }
  function visualCodes(row){
    const supplied=Array.isArray(row&&row.estados_visuales)?row.estados_visuales.map(x=>typeof x==='string'?x:x.codigo):[];
    if(String(row&&row.tipo_movimiento||row&&row.tipo||'').toUpperCase()==='DEGRADADO')supplied.push('NO_FUNCIONANDO');
    return [...new Set(supplied.filter(Boolean))];
  }
  function visualIdentifier(row,label){
    return window.EstadosVisuales_gnral
      ? window.EstadosVisuales_gnral.renderIdentifier(visualCodes(row),label)
      : esc(label);
  }

  async function fetchJson(path){
    const headers=Object.assign(
      {'Accept':'application/json'},
      window.ManttoAuth&&typeof window.ManttoAuth.authHeaders==='function'
        ? window.ManttoAuth.authHeaders()
        : {}
    );
    const response=await fetch(API()+path,{headers,cache:'no-store'});
    const raw=await response.text();
    let data;
    try{data=raw?JSON.parse(raw):{};}
    catch(error){throw new Error('Respuesta no JSON del backend ('+response.status+'). Ruta: '+path);}
    if(!response.ok||!data.ok)throw new Error(data.message||data.error||'Error consultando backend');
    return data;
  }

  function setStatus(type,message){
    const el=$('mov-status');
    if(!el)return;
    el.className='mov-status '+(type||'loading');
    el.innerHTML='<span class="mov-dot"></span><span>'+esc(message||'Cargando...')+'</span>';
  }

  async function loadHtml(){
    const view=$('view-movimientos');
    if(!view||state.loaded)return;
    const response=await fetch('./modules/movimientos-portafolio/movimientos-portafolio.html?v='+MODULE_VERSION,{cache:'no-store'});
    if(!response.ok)throw new Error('No fue posible cargar la vista de Movimientos de Portafolio.');
    const html=await response.text();
    if(!html.trim())throw new Error('La vista de Movimientos de Portafolio esta vacia.');
    view.innerHTML=html;
    bind();
    state.loaded=true;
  }

  function bind(){
    document.querySelectorAll('[data-mov-action]').forEach(btn=>btn.addEventListener('click',()=>{
      const action=btn.dataset.movAction;
      if(action==='refresh'||action==='apply')refresh();
      if(action==='clear')clearFilters();
    }));
    ['mov-filter-zona','mov-filter-tipo'].forEach(id=>{
      const el=$(id); if(el)el.addEventListener('change',refresh);
    });
    const search=$('mov-filter-search');
    if(search)search.addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();refresh();}
    });
    const close=$('mov-detail-close');
    if(close)close.addEventListener('click',closeDetailModal);
    document.querySelectorAll('[data-mov-detail]').forEach(el=>el.addEventListener('click',()=>openDetail(el.dataset.movDetail)));
    document.querySelectorAll('[data-mov-toggle]').forEach(btn=>btn.addEventListener('click',()=>togglePanel(btn.dataset.movToggle)));
    document.querySelectorAll('[data-mov-week-action]').forEach(btn=>btn.addEventListener('click',()=>{
      if(btn.dataset.movWeekAction==='consult')loadWeekly();
      else clearWeeklyFilters();
    }));
    const year=$('mov-week-year');
    if(year)year.addEventListener('change',()=>fillWeeksForYear(year.value));
    const weekSearch=$('mov-week-search');
    if(weekSearch)weekSearch.addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();loadWeekly();}
    });
  }

  function currentParams(){
    return {zona:val('mov-filter-zona'),tipo:val('mov-filter-tipo'),search:val('mov-filter-search')};
  }

  function clearFilters(){
    ['mov-filter-zona','mov-filter-tipo','mov-filter-search'].forEach(id=>{const el=$(id);if(el)el.value='';});
    refresh();
  }

  function mapMovimiento(row){
    const anterior=first(row,['estatus_anterior','estatus_ul_mes','Estatus UL Mes']);
    const actual=first(row,['estatus_actual','estatus_servicio','Estatus Servicio']);
    return {
      ...row,
      numero_equipo:first(row,['numero_equipo','equipo','codigo_equipo']),
      proyecto:first(row,['proyecto_codigo','proyecto']),
      proyecto_nombre:fmtProjectName(first(row,['proyecto_nombre','proyecto','proyecto_codigo'])),
      zona:first(row,['zona_oficial','zona']),
      zona_oficial:first(row,['zona_oficial','zona']),
      zona_id_oficial:first(row,['zona_id_oficial']),
      supervisor:first(row,['supervisor','supervisor_zona']),
      estatus_anterior:anterior,
      estatus_actual:actual,
      tipo_movimiento:first(row,['tipo_movimiento','tipo'])||'CAMBIO',
      fecha_corte:first(row,['fecha_corte','estatus_ul_mes_fecha'])
    };
  }

  function fillZona(zonas){
    const el=$('mov-filter-zona');
    if(!el)return;
    const selected=el.value;
    const values=[...new Set((zonas||[]).map(normTxt).filter(Boolean))].sort();
    el.innerHTML='<option value="">Todas</option>'+values.map(z=>'<option value="'+esc(z)+'">'+esc(z)+'</option>').join('');
    if(values.includes(selected))el.value=selected;
  }

  async function refresh(){
    setStatus('loading','Consultando movimientos...');
    const body=$('mov-body');
    if(body)body.innerHTML='<tr><td colspan="8" class="mov-empty">Cargando movimientos...</td></tr>';
    try{
      // FASE 9/11: no existe fallback a /api/portafolio. La primera llamada es
      // propia del modulo y llega ya filtrada por la puerta PORTAFOLIO y usuario_zop.
      const data=await fetchJson('/api/portafolio/movimientos/inicial?'+qs(currentParams()));
      state.alcance=data.alcance||{zona_ids:[],zonas:[]};
      state.rows=(data.data||[]).map(mapMovimiento);
      fillZona(data.filters?.zonas||state.alcance.zonas||[]);
      renderMonthly(data);
      setStatus(data.warning?'warn':'ok',data.warning||'Movimientos actualizados');
    }catch(error){
      state.rows=[];
      renderMonthlyError(error.message);
      setStatus('error',error.message);
    }
  }

  function renderMonthly(data){
    const k=data.kpis||{};
    text('mov-kpi-total',int(k.total));
    text('mov-kpi-degradados',int(k.degradados));
    text('mov-kpi-recuperados',int(k.recuperados));
    text('mov-kpi-cambios',int(k.cambios));
    text('mov-count',int(state.rows.length)+' movimientos');
    text('mov-corte','Corte mensual: '+fmtDate(data.corte));
    const body=$('mov-body');
    if(!body)return;
    if(!state.rows.length){
      body.innerHTML='<tr><td colspan="8" class="mov-empty">'+esc(data.warning||'Sin movimientos detectados con los filtros actuales')+'</td></tr>';
      return;
    }
    body.innerHTML=state.rows.map((row,index)=>{
      const tag=tagFor(row.tipo_movimiento);
      return '<tr class="mov-row" data-mov-idx="'+index+'">'
        +'<td><span class="mov-tag '+tag.cls+'"><i></i>'+esc(tipoLabel(row.tipo_movimiento))+'</span></td>'
        +'<td class="mov-code">'+visualIdentifier(row,row.numero_equipo)+'</td>'
        +'<td><button type="button" class="mov-link" data-mov-proyecto="'+esc(row.proyecto)+'">'+visualIdentifier(row,row.proyecto_nombre||row.proyecto)+'</button></td>'
        +'<td>'+esc(row.zona_oficial||row.zona)+'</td>'
        +'<td>'+statusPill(row.estatus_anterior)+'</td>'
        +'<td>'+statusPill(row.estatus_actual)+'</td>'
        +'<td>'+esc(row.supervisor)+'</td>'
        +'<td>'+fmtDate(row.fecha_corte)+'</td>'
        +'</tr>';
    }).join('');
    bindMonthlyRows(body);
  }

  function renderMonthlyError(message){
    ['mov-kpi-total','mov-kpi-degradados','mov-kpi-recuperados','mov-kpi-cambios'].forEach(id=>text(id,'0'));
    text('mov-count','0 movimientos');
    const body=$('mov-body');
    if(body)body.innerHTML='<tr><td colspan="8" class="mov-empty">Error: '+esc(message)+'</td></tr>';
  }

  function bindMonthlyRows(root){
    root.querySelectorAll('tr[data-mov-idx]').forEach(tr=>tr.addEventListener('click',event=>{
      if(event.target.closest('button'))return;
      openRow(state.rows[Number(tr.dataset.movIdx)]);
    }));
    bindProjectLinks(root);
  }

  function bindProjectLinks(root){
    root.querySelectorAll('[data-mov-proyecto]').forEach(btn=>btn.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      const project=btn.getAttribute('data-mov-proyecto');
      if(window.ManttoDetails&&window.ManttoDetails.openProyecto)window.ManttoDetails.openProyecto(project);
    }));
  }

  function filteredByType(type){
    if(type==='degradados')return state.rows.filter(row=>row.tipo_movimiento==='DEGRADADO');
    if(type==='recuperados')return state.rows.filter(row=>row.tipo_movimiento==='RECUPERADO');
    if(type==='cambios')return state.rows.filter(row=>row.tipo_movimiento==='CAMBIO');
    return state.rows;
  }

  function openDetailModal(title,sub,html){
    const modal=$('mov-detail-modal'),body=$('mov-detail-body');
    if(!modal||!body)return;
    text('mov-detail-title',title);
    text('mov-detail-sub',sub);
    body.innerHTML=html||'';
    modal.hidden=false;
  }

  function closeDetailModal(){
    const modal=$('mov-detail-modal');
    if(modal)modal.hidden=true;
  }

  function openDetail(type){
    const rows=filteredByType(type);
    const labels={total:'Todos los movimientos',degradados:'Salidas de servicio',recuperados:'Regresos a servicio',cambios:'Cambios operativos'};
    const html=rows.length
      ? '<div class="mov-table-wrap"><table class="mov-table"><thead><tr><th>Tipo</th><th>Código</th><th>Proyecto</th><th>Zona</th><th>Anterior</th><th>Actual</th><th>Fecha corte</th></tr></thead><tbody>'
        +rows.map(row=>{
          const tag=tagFor(row.tipo_movimiento);
          return '<tr class="mov-row" data-mov-modal-code="'+esc(row.numero_equipo)+'">'
            +'<td><span class="mov-tag '+tag.cls+'"><i></i>'+esc(tipoLabel(row.tipo_movimiento))+'</span></td>'
            +'<td class="mov-code">'+esc(row.numero_equipo)+'</td>'
            +'<td><button type="button" class="mov-link" data-mov-proyecto="'+esc(row.proyecto)+'">'+esc(row.proyecto_nombre||row.proyecto)+'</button></td>'
            +'<td>'+esc(row.zona_oficial||row.zona)+'</td>'
            +'<td>'+statusPill(row.estatus_anterior)+'</td>'
            +'<td>'+statusPill(row.estatus_actual)+'</td>'
            +'<td>'+fmtDate(row.fecha_corte)+'</td>'
            +'</tr>';
        }).join('')+'</tbody></table></div>'
      : '<div class="mov-empty">Sin registros para este detalle</div>';
    openDetailModal(labels[type]||'Movimientos',int(rows.length)+' registros',html);
    const body=$('mov-detail-body');
    if(body){
      body.querySelectorAll('[data-mov-modal-code]').forEach(tr=>tr.addEventListener('click',event=>{
        if(event.target.closest('button'))return;
        const row=rows.find(item=>String(item.numero_equipo)===String(tr.dataset.movModalCode));
        if(row)openRow(row);
      }));
      bindProjectLinks(body);
    }
  }

  function grid(items){
    return '<div class="mov-detail-grid">'+items.map(([key,value])=>'<div class="mov-field"><label>'+esc(key)+'</label><span>'+String(value==null||value===''?'—':value)+'</span></div>').join('')+'</div>';
  }

  function ticketTable(rows){
    if(!rows||!rows.length)return '<div class="mov-empty">Sin tickets relacionados al equipo</div>';
    return '<div class="mov-table-wrap"><table class="mov-table"><thead><tr><th>Ticket</th><th>Fecha</th><th>Estado</th><th>Proyecto</th><th>Equipo</th><th>Responsabilidad</th><th>Causa</th></tr></thead><tbody>'
      +rows.map(ticket=>'<tr>'
        +'<td><button type="button" class="mov-link" data-ticket="'+esc(ticket.ticket||'')+'">'+esc(ticket.ticket)+'</button></td>'
        +'<td>'+fmtDate(ticket.fecha_reporte)+'</td>'
        +'<td>'+esc(ticket.estado_ticket||ticket.estado)+'</td>'
        +'<td><button type="button" class="mov-link" data-mov-proyecto="'+esc(ticket.proyecto||'')+'">'+esc(fmtProjectName(ticket.proyecto))+'</button></td>'
        +'<td><button type="button" class="mov-link" data-equipo="'+esc(ticket.codigo_equipo||'')+'">'+esc(ticket.codigo_equipo)+'</button></td>'
        +'<td>'+esc(ticket.responsabilidad)+'</td>'
        +'<td>'+esc(ticket.causa_falla||ticket.causa)+'</td>'
        +'</tr>').join('')
      +'</tbody></table></div>';
  }

  async function openRow(row){
    if(!row||!row.numero_equipo)return;
    openDetailModal('Movimiento · '+row.numero_equipo,row.proyecto_nombre||row.proyecto||'Movimientos de Portafolio','<div class="mov-empty">Cargando detalle...</div>');
    try{
      const data=await fetchJson('/api/portafolio/movimientos/'+encodeURIComponent(row.numero_equipo)+'/detalle');
      const payload=data.data||{};
      const equipo=payload.equipo||{};
      const proyecto=payload.proyecto||{};
      const tickets=payload.tickets||[];
      const code=equipo.numero_equipo||row.numero_equipo;
      const projectCode=equipo.proyecto_codigo||equipo.proyecto||row.proyecto;
      const projectName=fmtProjectName(equipo.proyecto_nombre||row.proyecto_nombre||projectCode);
      const zone=equipo.zona_oficial||equipo.zona||row.zona_oficial||row.zona;
      const html=''
        +'<section class="mov-detail-section"><h3><span>1</span>Detalle del Proyecto</h3>'+grid([
          ['Proyecto','<button type="button" class="mov-link" data-mov-proyecto="'+esc(projectCode)+'">'+esc(projectName)+'</button>'],
          ['Ciudad',proyecto.ciudad||equipo.ciudad||row.ciudad],
          ['Estado',proyecto.estado||equipo.estado||row.estado],
          ['Zona',proyecto.zona_oficial||proyecto.zona||zone],
          ['Supervisor',proyecto.supervisor||equipo.supervisor||row.supervisor],
          ['Superintendente',proyecto.superintendente||equipo.superintendente||row.superintendente],
          ['Equipos',proyecto.equipos],
          ['En servicio',proyecto.en_servicio],
          ['No en servicio',proyecto.no_en_servicio]
        ])+'</section>'
        +'<section class="mov-detail-section"><h3><span>2</span>Detalle del Equipo</h3>'+grid([
          ['Código','<button type="button" class="mov-link" data-equipo="'+esc(code)+'">'+esc(code)+'</button>'],
          ['ID portafolio',equipo.id_portafolio||row.id_portafolio],
          ['ID Equipo NS',equipo.id_equipo_ns],
          ['Identificación sitio',equipo.identificacion_sitio||row.identificacion_sitio],
          ['Zona',zone],
          ['Estatus anterior',statusPill(equipo.estatus_ul_mes||row.estatus_anterior)],
          ['Estatus actual',statusPill(equipo.estatus_servicio||row.estatus_actual)],
          ['Movimiento','<span class="mov-tag '+tagFor(row.tipo_movimiento).cls+'"><i></i>'+esc(tipoLabel(row.tipo_movimiento))+'</span>'],
          ['Fecha corte',fmtDate(equipo.estatus_ul_mes_fecha||row.fecha_corte)],
          ['Contrato',equipo.contrato],
          ['Operativo',equipo.estado_operativo],
          ['Fecha instalación',fmtDate(equipo.fecha_instalacion)],
          ['Fecha entrega',fmtDate(equipo.fecha_entrega)],
          ['Término garantía',fmtDate(equipo.termino_garantia)],
          ['Dirección',equipo.direccion]
        ])+'</section>'
        +'<section class="mov-detail-section"><h3><span>3</span>Tickets relacionados al equipo</h3>'+ticketTable(tickets)+'</section>';
      openDetailModal('Movimiento · '+code,tickets.length+' tickets relacionados',html);
      bindDetailLinks();
    }catch(error){
      openDetailModal('Movimiento · '+row.numero_equipo,row.proyecto_nombre||row.proyecto||'Movimientos de Portafolio','<div class="mov-empty">Error: '+esc(error.message)+'</div>');
    }
  }

  function bindDetailLinks(){
    const body=$('mov-detail-body');
    if(!body)return;
    bindProjectLinks(body);
    body.querySelectorAll('[data-equipo]').forEach(btn=>btn.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      const code=btn.getAttribute('data-equipo');
      if(window.ManttoDetails&&window.ManttoDetails.openEquipo)window.ManttoDetails.openEquipo(code);
    }));
    body.querySelectorAll('[data-ticket]').forEach(btn=>btn.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      const ticket=btn.getAttribute('data-ticket');
      if(window.ManttoDetails&&window.ManttoDetails.openTicket)window.ManttoDetails.openTicket(ticket);
      else if(window.ManttoResumenDia&&window.ManttoResumenDia.openTicket)window.ManttoResumenDia.openTicket(ticket);
    }));
  }

  function togglePanel(name){
    const panel=document.querySelector('[data-mov-panel="'+name+'"]');
    const content=document.querySelector('[data-mov-content="'+name+'"]');
    const button=document.querySelector('[data-mov-toggle="'+name+'"]');
    if(!panel||!content||!button)return;
    const open=content.hidden;
    content.hidden=!open;
    panel.classList.toggle('is-open',open);
    button.setAttribute('aria-expanded',open?'true':'false');
    if(open&&name==='weekly'&&!state.weeklyCatalog.length)loadWeeklyCatalog();
  }

  async function loadWeeklyCatalog(){
    const year=$('mov-week-year'),week=$('mov-week-number');
    try{
      const data=await fetchJson('/api/portafolio/movimientos-semanales/catalogo');
      state.weeklyCatalog=Array.isArray(data.data)?data.data:[];
      const years=[...new Set(state.weeklyCatalog.map(row=>String(row.anio_iso)))];
      if(year)year.innerHTML='<option value="">Selecciona</option>'+years.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
      if(years.length){year.value=years[0];fillWeeksForYear(years[0]);}
      else if(week)week.innerHTML='<option value="">Sin cortes disponibles</option>';
    }catch(error){
      if(week)week.innerHTML='<option value="">Error al cargar</option>';
      text('mov-week-count',error.message);
    }
  }

  function fillWeeksForYear(value){
    const week=$('mov-week-number');
    if(!week)return;
    const rows=state.weeklyCatalog.filter(row=>String(row.anio_iso)===String(value));
    week.innerHTML='<option value="">Selecciona</option>'+rows.map(row=>'<option value="'+esc(row.semana_iso)+'">Semana '+esc(row.semana_iso)+' · '+fmtDate(row.fecha_inicio)+' al '+fmtDate(row.fecha_fin)+'</option>').join('');
    if(rows.length)week.value=String(rows[0].semana_iso);
  }

  function clearWeeklyFilters(){
    const year=$('mov-week-year'),search=$('mov-week-search'),type=$('mov-week-type');
    if(search)search.value='';
    if(type)type.value='';
    if(year&&state.weeklyCatalog.length){year.value=String(state.weeklyCatalog[0].anio_iso);fillWeeksForYear(year.value);}
    state.weeklyRows=[];
    state.weeklyCut=null;
    renderWeeklyEmpty('Selecciona un año y una semana');
  }

  function renderWeeklyEmpty(message){
    state.weeklyCut=null;
    text('mov-week-title','Semana sin seleccionar');
    text('mov-week-count',message||'Sin información');
    text('mov-week-range','Corte semanal: —');
    ['mov-week-total','mov-week-outs','mov-week-returns','mov-week-changes'].forEach(id=>text(id,'—'));
    const body=$('mov-week-body');
    if(body)body.innerHTML='<tr><td colspan="8" class="mov-empty">'+esc(message||'Sin información')+'</td></tr>';
  }

  async function loadWeekly(){
    const anio=val('mov-week-year'),semana=val('mov-week-number');
    if(!anio||!semana){renderWeeklyEmpty('Selecciona año y semana');return;}
    const body=$('mov-week-body');
    if(body)body.innerHTML='<tr><td colspan="8" class="mov-empty">Consultando corte semanal...</td></tr>';
    try{
      const data=await fetchJson('/api/portafolio/movimientos-semanales?'+qs({anio,semana,search:val('mov-week-search'),tipo:val('mov-week-type')}));
      state.weeklyRows=Array.isArray(data.data)?data.data:[];
      state.weeklyCut=data.corte||{};
      const cut=state.weeklyCut;
      const noMovements=Number(cut.total_movimientos||0)===0;
      text('mov-week-title','Semana '+cut.semana_iso+' de '+cut.anio_iso);
      text('mov-week-count',noMovements?'SIN MOVIMIENTOS ESTA SEMANA':int(data.total_filtrado)+' movimientos mostrados');
      text('mov-week-range','Del '+fmtDate(cut.fecha_inicio)+' al '+fmtDate(cut.fecha_fin)+' · Corte: '+fmtDate(cut.fecha_corte));
      text('mov-week-total',int(cut.total_movimientos));
      text('mov-week-outs',int(cut.total_salidas));
      text('mov-week-returns',int(cut.total_regresos));
      text('mov-week-changes',int(cut.total_cambios));
      renderWeeklyRows();
    }catch(error){
      renderWeeklyEmpty(error.message);
    }
  }

  function renderWeeklyRows(){
    const body=$('mov-week-body');
    if(!body)return;
    if(!state.weeklyRows.length){
      const noMovements=state.weeklyCut&&Number(state.weeklyCut.total_movimientos||0)===0;
      body.innerHTML='<tr><td colspan="8" class="mov-empty">'+esc(noMovements?'SIN MOVIMIENTOS ESTA SEMANA':'Sin movimientos para los filtros seleccionados')+'</td></tr>';
      return;
    }
    body.innerHTML=state.weeklyRows.map(row=>{
      const type=String(row.tipo||row.tipo_movimiento||'CAMBIO').toUpperCase();
      const tag=tagFor(type);
      const code=row.equipo||row.numero_equipo||'';
      return '<tr>'
        +'<td><span class="mov-tag '+tag.cls+'"><i></i>'+esc(tipoLabel(type))+'</span></td>'
        +'<td>'+fmtDate(row.fecha_movimiento||row.fecha_corte)+'</td>'
        +'<td class="mov-code">'+esc(code)+'</td>'
        +'<td><button type="button" class="mov-link" data-mov-proyecto="'+esc(row.proyecto_codigo||row.proyecto||'')+'">'+esc(fmtProjectName(row.proyecto||row.proyecto_codigo))+'</button></td>'
        +'<td>'+esc(row.zona_oficial||row.zona)+'</td>'
        +'<td>'+statusPill(row.estatus_anterior)+'</td>'
        +'<td>'+statusPill(row.estatus_actual)+'</td>'
        +'<td>'+esc(row.supervisor)+'</td>'
        +'</tr>';
    }).join('');
    bindProjectLinks(body);
  }

  async function init(){
    try{
      await loadHtml();
      await refresh();
    }catch(error){
      setStatus('error',error.message);
    }
  }

  window.ManttoMovimientosPortafolio={init,refresh,openRow,version:MODULE_VERSION};
})();
