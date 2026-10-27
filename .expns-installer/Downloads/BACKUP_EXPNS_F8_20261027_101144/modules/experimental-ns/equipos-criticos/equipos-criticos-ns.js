/* BLT NOW | Experimental NS | F4 Equipos Criticos | Copia visual aislada.
 * Todos los datos proceden de /api/experimental-ns/equipos-criticos/*.
 * No ejecutar ManttoEquiposCriticos productivo, EstadoVisuales corporativo,
 * detalles globales ni endpoints de preferencias de perfil.
 */
(function(){
  'use strict';
  if(window.ManttoEquiposCriticosNS) return;
  const ROUTE = 'experimental-ns-equipos-criticos';
  const ENDPOINT = '/api/experimental-ns/equipos-criticos';
  const state = {
    ready: false, pending: 0,
    equipos: [], proyectos: [], u365: [], u365Total:0, u365Limited:false,
    eqPage:1, proPage:1, pageSize:25,
    eqTotal:0, proTotal:0,
    details:[], detailTitle:'Detalle', detailLimit:false,
    u365Expanded:false,hasData:false,detailParams:null,detailRequestSeq:0,changedFields:0,bound:false
  };
  const view = () => document.getElementById('view-' + ROUTE);
  const $ = id => view()?.querySelector('#' + id);
  function esc(v){return String(v == null || v === '' ? '—' : v).replace(/[&<>"']/g,
    ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function date(v){const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(v||''));return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';}
  function number(v){const n=Number(v);return Number.isFinite(n)?n.toLocaleString('es-MX'):'—';}
  function mtbc(v){return v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? 'N/A' : Number(v).toLocaleString('es-MX',{maximumFractionDigits:3}) + ' d';}
  function qs(input){const q=new URLSearchParams();Object.entries(input).forEach(([key,v])=>{
    if(v!=='' && v!==null && v!==undefined) q.set(key,String(v));
  });return q.toString();}
  function text(id){return String($(id)?.value || '').trim();}
  function intval(id,fallback){const raw=String($(id)?.value||'');return /^\d+$/.test(raw)?Number(raw):fallback;}
  function setText(id,value){const el=$(id);if(!el)return;const live=window.ManttoExperimentalNsLive;
    if(live?.setText){if(live.setText(el,String(value),ROUTE)&&live.isApplying?.(ROUTE))state.changedFields++;}
    else el.textContent=String(value);
  }
  async function apiGet(path){
    if(!window.ManttoAuth || typeof window.ManttoAuth.apiGet !== 'function'){
      throw new Error('No se encuentra disponible la sesion de BLT NOW.');
    }
    return window.ManttoAuth.apiGet(path);
  }
  function userDefaults(){
    const user=window.ManttoAuth?.getUser?.() || {};
    const fallas=Number(user.criticos_fallas)||3;
    const dias=Number(user.criticos_periodo)||35;
    return { fallas:Math.max(1,Math.min(9999,fallas)), dias:Math.max(1,Math.min(3650,dias)) };
  }
  function markup(){
    const defaults=userDefaults();
    return `<div class="ec-page ecns-page">
      <section class="ec-head card ecns-head">
        <div><p class="ec-eyebrow">🧪 Experimental NS · Fase 4 · Solo lectura</p>
          <h1>Equipos Críticos</h1>
          <p>Replica independiente de los criterios de reincidencia y MTBC. Sólo usa los registros de prueba de NetSuite.</p>
        </div><button type="button" class="ec-btn ec-btn-soft" data-ecns="reload">↻ Actualizar todo</button>
      </section>
      <p class="ecns-banner" role="note">🧪 ORIGEN EXCLUSIVO: <b>ns_portafolio_pruebas + ns_tickets_pruebas</b> · Criterios sólo temporales · Sin producción, escritura ni actualización de preferencias.</p>
      <div class="ecns-status" id="ecns-status" role="status" aria-live="polite">Preparando consulta experimental...</div>
      <section class="ec-panel card" aria-label="Equipos criticos NS">
        <div class="ec-panel-head"><div><h2>Equipos Críticos</h2><small id="ecns-eq-count">Sin cargar</small></div>
          <div class="ec-actions"><button type="button" class="ec-btn" data-ecns="reset-equipos">Limpiar filtros</button><button type="button" class="ec-btn ec-btn-danger" data-ecns="pdf-equipos">PDF Equipos (página)</button></div>
        </div>
        <div class="ec-filters">
          <label>Fallas BLT mín.<input type="number" id="ecns-eq-min" min="1" max="9999" value="${defaults.fallas}"></label>
          <label>Días<input type="number" id="ecns-eq-dias" min="1" max="3650" value="${defaults.dias}"></label>
          <label>Zona<input type="text" id="ecns-eq-zona" placeholder="Ej. NOR"></label>
          <label>Proyecto<input type="text" id="ecns-eq-proyecto" placeholder="Proyecto"></label>
          <label>Buscar<input type="search" id="ecns-eq-search" placeholder="Equipo, ticket, referencia"></label>
          <button type="button" class="ec-btn ec-btn-primary" data-ecns="apply-equipos">Aplicar filtros</button>
        </div>
        <div class="ec-note">Criterio de prueba: <b id="ecns-eq-criteria">${defaults.fallas} fallas BLT en ${defaults.dias} días</b>. MTBC equipo: días del período ÷ fallas BLT. Año actual y U365 utilizan ventanas de calendario independientes.</div>
        <div class="ec-table-wrap"><table class="ec-table"><thead><tr>
          <th>Zona</th><th>Proyecto</th><th>Código</th><th>Ref. sitio</th><th>Estatus</th><th>Calls año</th><th>Fallas BLT período</th><th>BLT fuera período</th><th>Último BLT</th><th>Resp. Cliente período</th><th>Cliente fuera período</th><th>Último Cliente</th><th>MTBC Año Actual</th><th>MTBC U365</th><th></th>
        </tr></thead><tbody id="ecns-eq-body"><tr><td colspan="15" class="ec-empty">Sin cargar</td></tr></tbody></table></div>
        <div class="ec-pagination"><button type="button" id="ecns-eq-prev" data-ecns="eq-prev">← Anterior</button><span id="ecns-eq-page">—</span><button type="button" id="ecns-eq-next" data-ecns="eq-next">Siguiente →</button></div>
      </section>
      <section class="ec-panel card ec-collapsible" id="ecns-365-panel" aria-label="Equipos criticos U365 NS">
        <div class="ec-panel-head ec-collapsible-head"><div><h2>Equipos críticos · últimos 365 días</h2><small id="ecns-365-count">Sin cargar</small></div>
          <button type="button" class="ec-btn ec-btn-soft ec-toggle" data-ecns="toggle-u365" id="ecns-365-toggle" aria-expanded="false">▼ Expandir</button></div>
        <div id="ecns-365-content" hidden><div class="ec-note">Criterio corporativo experimental: <b>3 o más fallas BLT en U365</b>. Derivado exclusivamente de tickets y equipos NS.</div>
          <div class="ec-table-wrap"><table class="ec-table"><thead><tr><th>Zona</th><th>Proyecto</th><th>Código</th><th>Ref. sitio</th><th>Estatus</th><th>Llamadas 365d</th><th>Fallas BLT 365d</th><th>Último BLT</th><th>Fallas BLT año</th><th>MTBC Año Actual</th><th>MTBC U365</th></tr></thead><tbody id="ecns-365-body"></tbody></table></div>
        </div>
      </section>
      <section class="ec-panel card" aria-label="Proyectos criticos NS">
        <div class="ec-panel-head"><div><h2>Proyectos Críticos</h2><small id="ecns-pro-count">Sin cargar</small></div>
          <div class="ec-actions"><button type="button" class="ec-btn" data-ecns="reset-proyectos">Limpiar filtros</button><button type="button" class="ec-btn ec-btn-danger" data-ecns="pdf-proyectos">PDF Proyectos (página)</button></div>
        </div>
        <div class="ec-filters">
          <label>Fallas BLT mín.<input type="number" id="ecns-pro-min" min="1" max="9999" value="5"></label>
          <label>Días<input type="number" id="ecns-pro-dias" min="1" max="3650" value="${defaults.dias}"></label>
          <label>Fallas por equipo<input type="number" id="ecns-pro-min-eq" min="1" max="9999" value="${defaults.fallas}"></label>
          <label>Zona<input type="text" id="ecns-pro-zona" placeholder="Ej. NOR"></label>
          <label>Proyecto<input type="text" id="ecns-pro-proyecto" placeholder="Proyecto"></label>
          <button type="button" class="ec-btn ec-btn-primary" data-ecns="apply-proyectos">Aplicar</button>
        </div>
        <div class="ec-note">Criterio: <b id="ecns-pro-criteria">5 fallas BLT</b>. El agrupador utiliza ID de proyecto cuando existe, o nombre y zona NS; cada ticket se vincula únicamente por código de equipo.</div>
        <div class="ec-table-wrap"><table class="ec-table"><thead><tr><th>Zona</th><th>Proyecto</th><th>Ciudad</th><th>Supervisor</th><th>Equipos activos</th><th>Fallas BLT período</th><th>Equipos con falla</th><th>Equipos críticos</th><th>Último BLT</th><th>MTBC Año Actual</th><th>MTBC U365</th><th></th></tr></thead><tbody id="ecns-pro-body"><tr><td colspan="12" class="ec-empty">Sin cargar</td></tr></tbody></table></div>
        <div class="ec-pagination"><button type="button" id="ecns-pro-prev" data-ecns="pro-prev">← Anterior</button><span id="ecns-pro-page">—</span><button type="button" id="ecns-pro-next" data-ecns="pro-next">Siguiente →</button></div>
      </section>
      <section class="ec-detail" id="ecns-detail-modal" aria-label="Detalle de tickets Experimental NS" role="dialog" aria-modal="true" hidden>
        <div class="ec-detail-panel"><div class="ec-detail-head"><button type="button" data-ecns="close-detail" aria-label="Cerrar">×</button>
          <div><h2 id="ecns-detail-title">Detalle · Experimental NS</h2><p id="ecns-detail-sub">Sólo lectura</p></div>
          <button type="button" class="ec-btn ec-btn-danger" data-ecns="pdf-detalle">PDF detalle (máx. 1,000)</button></div>
          <div class="ec-detail-body"><div class="ec-table-wrap"><table class="ec-table"><thead><tr><th>Ticket</th><th>Fecha reporte</th><th>Estado</th><th>Proyecto NS</th><th>Equipo</th><th>Zona</th><th>Responsabilidad</th><th>Causa</th><th>T. llegada</th><th>T. solución</th><th>Motivo detalle</th></tr></thead><tbody id="ecns-detail-body"></tbody></table></div></div></div>
      </section>
    </div>`;
  }
  function criteria(){
    return {
      page_size:state.pageSize, page_equipos:state.eqPage, page_proyectos:state.proPage,
      min_fallas:intval('ecns-eq-min',3),dias:intval('ecns-eq-dias',35),
      zona:text('ecns-eq-zona'), proyecto:text('ecns-eq-proyecto'),search:text('ecns-eq-search'),
      min_fallas_proyecto:intval('ecns-pro-min',5), dias_proyectos:intval('ecns-pro-dias',35),
      min_fallas_equipo:intval('ecns-pro-min-eq',3),zona_proyectos:text('ecns-pro-zona'),
      proyecto_proyectos:text('ecns-pro-proyecto')
    };
  }
  function status(message,failed){const el=$('ecns-status');if(!el)return;el.textContent=message;el.classList.toggle('is-error',!!failed);}
  function pagination(kind,total,page){
    const pages=Math.max(1,Math.ceil(total/state.pageSize));
    setText('ecns-'+kind+'-page','Página '+page+' de '+pages+' · '+number(total)+' registros');
    const prev=$('ecns-'+kind+'-prev'),next=$('ecns-'+kind+'-next');
    if(prev)prev.disabled=page<=1;if(next)next.disabled=page>=pages;
  }
  function eqRows(rows){
    const tbody=$('ecns-eq-body');if(!tbody)return;
    const html=rows.length?rows.map(row=>`<tr data-nsns-key="${esc(encodeURIComponent(row.codigo_equipo))}"><td>${esc(row.zona)}</td><td class="ec-project-cell">${esc(row.proyecto)}</td>
      <td class="ec-code">${esc(row.codigo_equipo)}</td><td>${esc(row.referencia_en_sitio)}</td><td>${esc(row.estatus_servicio)}</td>
      <td class="ec-num">${number(row.calls_anio)}</td><td class="ec-num"><span class="ec-tag">${number(row.fallas_blt_periodo)}</span></td>
      <td class="ec-num">${number(row.fallas_blt_fuera_periodo)}</td><td>${date(row.ultimo_blt)}</td>
      <td class="ec-num">${number(row.resp_cliente_periodo)}</td><td class="ec-num">${number(row.resp_cliente_fuera_periodo)}</td>
      <td>${date(row.ultimo_cliente)}</td><td class="ec-num">${mtbc(row.mtbc_anio)}</td><td class="ec-num">${mtbc(row.mtbc_365)}</td>
      <td><button class="ec-btn" type="button" data-ecns="equipo-detail" data-code="${esc(row.codigo_equipo)}">Tickets</button></td></tr>`).join(''):
      '<tr><td colspan="15" class="ec-empty">No hay equipos críticos en las tablas NS para estos filtros.</td></tr>';
    const live=window.ManttoExperimentalNsLive;
    if(live?.isApplying?.(ROUTE))state.changedFields+=live.patchRows(tbody,html,ROUTE);
    else tbody.innerHTML=html;
  }
  function proRows(rows){
    const tbody=$('ecns-pro-body');if(!tbody)return;
    const html=rows.length?rows.map(row=>`<tr data-nsns-key="${esc(encodeURIComponent(row.proyecto_clave))}"><td>${esc(row.zona)}</td><td class="ec-project-cell">${esc(row.proyecto)}</td>
      <td>${esc(row.ciudad)}</td><td>${esc(row.supervisor)}</td>
      <td class="ec-num">${number(row.equipos_activos)}</td><td class="ec-num"><span class="ec-tag">${number(row.fallas_blt_periodo)}</span></td>
      <td class="ec-num">${number(row.equipos_con_falla)}</td><td class="ec-num">${number(row.equipos_criticos)}</td>
      <td>${date(row.ultimo_blt)}</td><td class="ec-num">${mtbc(row.mtbc_anio)}</td><td class="ec-num">${mtbc(row.mtbc_365)}</td>
      <td><button class="ec-btn" type="button" data-ecns="proyecto-detail" data-project-key="${esc(row.proyecto_clave)}">Tickets</button></td></tr>`).join(''):
      '<tr><td colspan="12" class="ec-empty">No hay proyectos críticos en las tablas NS para estos filtros.</td></tr>';
    const live=window.ManttoExperimentalNsLive;
    if(live?.isApplying?.(ROUTE))state.changedFields+=live.patchRows(tbody,html,ROUTE);
    else tbody.innerHTML=html;
  }
  function u365Rows(rows){
    const tbody=$('ecns-365-body');if(!tbody)return;
    const html=rows.length?rows.map(row=>`<tr data-nsns-key="${esc(encodeURIComponent(row.codigo_equipo))}"><td>${esc(row.zona)}</td><td class="ec-project-cell">${esc(row.proyecto)}</td>
      <td class="ec-code">${esc(row.codigo_equipo)}</td><td>${esc(row.referencia_en_sitio)}</td><td>${esc(row.estatus_servicio)}</td>
      <td class="ec-num">${number(row.llamadas_365)}</td><td class="ec-num">${number(row.fallas_blt_365)}</td>
      <td>${date(row.ultima_falla_blt_365)}</td><td class="ec-num">${number(row.fallas_blt_anio)}</td>
      <td class="ec-num">${mtbc(row.mtbc_anio)}</td><td class="ec-num">${mtbc(row.mtbc_365)}</td></tr>`).join(''):
      '<tr><td colspan="11" class="ec-empty">Sin equipos críticos U365 en la muestra NS.</td></tr>';
    const live=window.ManttoExperimentalNsLive;
    if(live?.isApplying?.(ROUTE))state.changedFields+=live.patchRows(tbody,html,ROUTE);
    else tbody.innerHTML=html;
  }
  function render(data){
    state.equipos=Array.isArray(data.data?.equipos)?data.data.equipos:[];
    state.proyectos=Array.isArray(data.data?.proyectos)?data.data.proyectos:[];
    state.u365=Array.isArray(data.data?.u365?.data)?data.data.u365.data:[];
    state.u365Total=Number(data.data?.u365?.total||0);
    state.u365Limited=data.data?.u365?.limitado===true;
    state.eqTotal=Number(data.pagination?.equipos?.total||0);
    state.proTotal=Number(data.pagination?.proyectos?.total||0);
    state.eqPage=Number(data.pagination?.equipos?.page||state.eqPage);
    state.proPage=Number(data.pagination?.proyectos?.page||state.proPage);
    const c=criteria();
    setText('ecns-eq-criteria',`${c.min_fallas} fallas BLT en ${c.dias} días`);
    setText('ecns-pro-criteria',`${c.min_fallas_proyecto} fallas BLT en ${c.dias_proyectos} días · equipo con ${c.min_fallas_equipo}+ fallas`);
    setText('ecns-eq-count',number(state.eqTotal)+' equipos críticos');
    setText('ecns-pro-count',number(state.proTotal)+' proyectos críticos');
    setText('ecns-365-count',number(state.u365Total)+' equipos U365'+(state.u365Limited?' · mostrando 1,000':''));
    eqRows(state.equipos);proRows(state.proyectos);u365Rows(state.u365);
    pagination('eq',state.eqTotal,state.eqPage);pagination('pro',state.proTotal,state.proPage);
    const q=data.calidad||{};
    if(!window.ManttoExperimentalNsLive?.isApplying?.(ROUTE))
      status(`Solo NS · ${number(q.equipos_visibles||0)} equipos en muestra · ${number(q.tickets_sin_equipo_activo||0)} tickets sin equipo activo visible · ${number(q.tickets_proyecto_discrepante||0)} tickets con proyecto discrepante.`, false);
  }
  async function load(options={}){
    const silent=options.silent===true;
    const sequence=++state.pending;
    if(!silent)status('Consultando equipos y tickets exclusivamente en las tablas NS...');
    try{
      const result=await apiGet(ENDPOINT+'/inicial?'+qs(criteria()));
      if(sequence!==state.pending||window.ManttoRouter?.getCurrent?.()?.route!==ROUTE)return false;
      if(!result||result.ok!==true||result.source!=='experimental-ns')throw new Error('Fuente de datos inesperada.');
      state.changedFields=0;
      const before=JSON.stringify([state.equipos,state.proyectos,state.u365]);
      render(result);
      state.hasData=true;
      const changed=state.changedFields|| (before!==JSON.stringify([state.equipos,state.proyectos,state.u365])?1:0);
      if(silent && state.detailParams && $('ecns-detail-modal')?.hidden===false){
        await detail(state.detailParams.tipo,state.detailParams.valor,{silent:true});
      }
      window.ManttoExperimentalNsLive?.markFetched(ROUTE);
      return {changed};
    }catch(error){
      if(sequence!==state.pending)return false;
      if(silent)throw error;
      console.error('[EXPERIMENTAL_NS_F4]',error);
      status('No fue posible cargar Equipos Críticos NS: '+(error.message||'Error de consulta')+'. No se utilizaron datos productivos.',true);
      state.hasData=false;state.equipos=[];state.proyectos=[];state.u365=[];
      state.eqTotal=0;state.proTotal=0;state.u365Total=0;
      eqRows([]);proRows([]);u365Rows([]);
      setText('ecns-eq-count','Error de carga');setText('ecns-pro-count','Error de carga');setText('ecns-365-count','Error de carga');
      pagination('eq',0,1);pagination('pro',0,1);
      return false;
    }
  }
  async function detail(tipo,valor,options={}){
    const silent=options.silent===true;const seq=++state.detailRequestSeq;
    state.detailParams={tipo,valor};
    const c=criteria();const dias=tipo==='equipo'?c.dias:c.dias_proyectos;
    const modal=$('ecns-detail-modal');if(!modal)return;
    if(!silent)state.details=[];state.detailTitle=tipo==='equipo'?'Equipo '+valor:'Proyecto (identificador NS) '+valor;
    if(!silent){
      setText('ecns-detail-title',state.detailTitle+' · Experimental NS');
      setText('ecns-detail-sub','Consultando tickets BLT de la muestra NS...');
      $('ecns-detail-body').innerHTML='<tr><td colspan="11" class="ec-empty">Cargando...</td></tr>';
      modal.hidden=false;
    }
    try{
      const r=await apiGet(ENDPOINT+'/detalle?'+qs({tipo,valor,dias}));
      if(seq!==state.detailRequestSeq||r.ok!==true||r.source!=='experimental-ns')return false;
      state.details=Array.isArray(r.data)?r.data:[];state.detailLimit=r.limitado===true;
      window.ManttoExperimentalNsProtection?.observe(ROUTE,state.details);
      setText('ecns-detail-sub',`${number(r.total)} tickets BLT · ${dias} días · sólo NS${r.limitado?' · mostrando 1,000':''}`);
      const html=state.details.length?state.details.map(t=>`<tr data-nsns-key="${esc(encodeURIComponent(t.ticket))}"><td class="ec-code"><button type="button" class="ec-link" data-ecns-draft-ticket="${esc(t.ticket)}" title="Abrir borrador local de prueba">${esc(t.ticket)}</button></td><td>${date(t.fecha_reporte)}</td>
        <td>${esc(t.estado_ticket)}</td><td>${esc(t.proyecto)}</td><td>${esc(t.codigo_equipo)}</td><td>${esc(t.zona)}</td>
        <td>${esc(t.responsabilidad)}</td><td>${esc(t.causa_falla||t.causa)}</td><td>${esc(t.tiempo_llegada)}</td><td>${esc(t.tiempo_solucion)}</td><td>${esc(t.custeventblt_mot_det)}</td></tr>`).join(''):
        '<tr><td colspan="11" class="ec-empty">Sin tickets BLT dentro del período seleccionado.</td></tr>';
      const live=window.ManttoExperimentalNsLive;
      if(silent&&live?.patchRows)state.changedFields+=live.patchRows($('ecns-detail-body'),html,ROUTE);
      else $('ecns-detail-body').innerHTML=html;
    }catch(error){
      if(silent)throw error;
      console.error('[EXPERIMENTAL_NS_F4_DETAIL]',error);
      setText('ecns-detail-sub','No fue posible obtener detalle NS; nunca se consulta producción.');
      $('ecns-detail-body').innerHTML='<tr><td colspan="11" class="ec-empty">Consulta no disponible.</td></tr>';
    }
  }
  function pdf(kind){
    if(!window.ManttoPdf_gnral || typeof window.ManttoPdf_gnral.exportTable!=='function'){
      alert('El motor de PDF de BLT NOW no esta disponible.');return;
    }
    const equipos=kind==='equipos',detalle=kind==='detalle';
    const rows=detalle?state.details:equipos?state.equipos:state.proyectos;
    if(!rows.length){alert('No hay datos NS en esta vista para exportar.');return;}
    const columns=detalle?[
      {key:'ticket',label:'Ticket'},{key:'fecha_reporte',label:'F. reporte'},
      {key:'proyecto',label:'Proyecto NS'},{key:'codigo_equipo',label:'Código'},
      {key:'responsabilidad',label:'RESP'},{key:'causa_falla',label:'Causa'},
      {key:'custeventblt_mot_det',label:'Motivo detalle'}
    ]:equipos?[
      {key:'zona',label:'Zona'},{key:'proyecto',label:'Proyecto NS'},{key:'codigo_equipo',label:'Código'},
      {key:'fallas_blt_periodo',label:'Fallas BLT'},{key:'fallas_blt_anio',label:'BLT Año'},
      {key:'fallas_blt_365',label:'BLT U365'},{key:'mtbc_anio',label:'MTBC Año'},
      {key:'mtbc_365',label:'MTBC U365'}
    ]:[
      {key:'zona',label:'Zona'},{key:'proyecto',label:'Proyecto NS'},
      {key:'equipos_activos',label:'Equipos'},{key:'fallas_blt_periodo',label:'Fallas BLT'},
      {key:'equipos_criticos',label:'Críticos'},{key:'mtbc_anio',label:'MTBC Año'},
      {key:'mtbc_365',label:'MTBC U365'}
    ];
    window.ManttoPdf_gnral.exportTable({
      title:'🧪 Experimental NS · '+(detalle?'Detalle de tickets':equipos?'Equipos críticos':'Proyectos críticos')+' · SÓLO PRUEBAS',
      fileName:'EXPERIMENTAL_NS_'+kind.toUpperCase()+'_PAGINA',
      rows,columns,headStyles:{fillColor:[13,46,110]}
    });
  }
  function resetInputs(type){
    const d=userDefaults();
    if(type==='equipos'){
      for(const id of ['ecns-eq-zona','ecns-eq-proyecto','ecns-eq-search'])$(id).value='';
      $('ecns-eq-min').value=d.fallas;$('ecns-eq-dias').value=d.dias;state.eqPage=1;
    }else{
      for(const id of ['ecns-pro-zona','ecns-pro-proyecto'])$(id).value='';
      $('ecns-pro-min').value=5;$('ecns-pro-min-eq').value=d.fallas;$('ecns-pro-dias').value=d.dias;state.proPage=1;
    }
  }
  function toggle365(){
    state.u365Expanded=!state.u365Expanded;
    const panel=$('ecns-365-content'),btn=$('ecns-365-toggle');
    if(panel)panel.hidden=!state.u365Expanded;
    if(btn){btn.setAttribute('aria-expanded',String(state.u365Expanded));btn.textContent=state.u365Expanded?'▲ Contraer':'▼ Expandir';}
  }
  function bind(){
    const root=view();if(!root||state.bound)return;state.bound=true;
    root.addEventListener('click',async function(event){
      const node=event.target.closest('[data-ecns]');
      if(!node||!root.contains(node))return;
      const action=node.dataset.ecns;
      if(action==='reload'){await load();return;}
      if(action==='apply-equipos'){state.eqPage=1;await load();return;}
      if(action==='apply-proyectos'){state.proPage=1;await load();return;}
      if(action==='reset-equipos'){resetInputs('equipos');await load();return;}
      if(action==='reset-proyectos'){resetInputs('proyectos');await load();return;}
      if(action==='eq-prev'&&state.eqPage>1){state.eqPage--;await load();return;}
      if(action==='eq-next'&&state.eqPage<Math.ceil(state.eqTotal/state.pageSize)){state.eqPage++;await load();return;}
      if(action==='pro-prev'&&state.proPage>1){state.proPage--;await load();return;}
      if(action==='pro-next'&&state.proPage<Math.ceil(state.proTotal/state.pageSize)){state.proPage++;await load();return;}
      if(action==='toggle-u365'){toggle365();return;}
      if(action==='equipo-detail'){await detail('equipo',node.dataset.code||'');return;}
      if(action==='proyecto-detail'){await detail('proyecto',node.dataset.projectKey||'');return;}
      if(action==='close-detail'){state.detailRequestSeq++;state.detailParams=null;$('ecns-detail-modal').hidden=true;window.ManttoExperimentalNsProtection?.hide(ROUTE);return;}
      if(action==='pdf-equipos'){pdf('equipos');return;}
      if(action==='pdf-proyectos'){pdf('proyectos');return;}
      if(action==='pdf-detalle'){pdf('detalle');}
    });
    root.addEventListener('click',event=>{
      const link=event.target?.closest?.('[data-ecns-draft-ticket]');
      if(link && $('ecns-detail-modal')?.contains(link)){
        const ticket=state.details.find(row=>String(row.ticket||'')===link.dataset.ecnsDraftTicket);
        if(ticket)window.ManttoExperimentalNsProtection?.openTicket({route:ROUTE,ticket:ticket.ticket,record:ticket,host:$('ecns-detail-modal')?.querySelector('.ec-detail-panel')});
        return;
      }
      if(event.target?.id==='ecns-detail-modal'){state.detailRequestSeq++;state.detailParams=null;$('ecns-detail-modal').hidden=true;window.ManttoExperimentalNsProtection?.hide(ROUTE);}
    });
    root.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&$('ecns-detail-modal')?.hidden===false){state.detailRequestSeq++;state.detailParams=null;$('ecns-detail-modal').hidden=true;window.ManttoExperimentalNsProtection?.hide(ROUTE);event.preventDefault();}
    });
  }
  function reset(){
    state.pending++;state.detailRequestSeq++;
    state.ready=false;state.hasData=false;state.equipos=[];state.proyectos=[];
    state.u365=[];state.detailParams=null;state.details=[];
    state.eqTotal=0;state.proTotal=0;state.u365Total=0;
    const root=view();if(root)root.replaceChildren();
  }
  function init(){
    const root=view();if(!root)return false;
    if(!state.ready){root.innerHTML=markup();bind();state.ready=true;}
    const live=window.ManttoExperimentalNsLive;
    live?.register(ROUTE,{refreshSilent:()=>load({silent:true}),reset});
    if(state.hasData){live?.check(ROUTE,false);return true;}
    load();return true;
  }
  window.ManttoEquiposCriticosNS=Object.freeze({init});
})();
