/* BLT NOW | EXPERIMENTAL_NS_F5 | Proyectos de Mantenimiento
 * Replica visual independiente, SIN usar ManttoProyectos, ManttoDetails ni APIs productivas.
 */
(function(){
  'use strict';
  if(window.ManttoProyectosMantenimientoNS)return;
  const ROUTE='experimental-ns-proyectos-mantenimiento';
  const ENDPOINT='/api/experimental-ns/proyectos-mantenimiento';
  const state={ready:false,pending:0,detailPending:0,page:1,pageSize:30,rows:[],total:0,
    filters:{},summary:null,detail:null,detailKey:'',lastQuality:{}};
  const view=()=>document.getElementById('view-'+ROUTE);
  const $=id=>view()?.querySelector('#'+id);
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function num(value){const n=Number(value);return Number.isFinite(n)?n.toLocaleString('es-MX'):'—';}
  function mtbc(value){return value===null||value===undefined||value===''||!Number.isFinite(Number(value))?'—':Number(value).toLocaleString('es-MX',{maximumFractionDigits:3})+' d';}
  function date(value){const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(value||''));return m?m[3]+'/'+m[2]+'/'+m[1]:'—';}
  function qs(obj){const p=new URLSearchParams();Object.entries(obj).forEach(([k,v])=>{if(v!==null&&v!==undefined&&v!=='')p.set(k,String(v));});return p.toString();}
  function setText(id,value){const el=$(id);if(el)el.textContent=String(value);}
  function val(id){return String($(id)?.value||'').trim();}
  function userDefaults(){const u=window.ManttoAuth?.getUser?.()||{};return {
    fallas:Number.isInteger(Number(u.criticos_fallas))&&Number(u.criticos_fallas)>0?Math.min(9999,Number(u.criticos_fallas)):3,
    dias:Number.isInteger(Number(u.criticos_periodo))&&Number(u.criticos_periodo)>0?Math.min(3650,Number(u.criticos_periodo)):35
  };}
  function criteria(){const defaults=userDefaults();return {
    zona:val('proyns-filter-zona'),estado:val('proyns-filter-estado'),
    supervisor:val('proyns-filter-supervisor'),search:val('proyns-filter-search'),
    page:state.page,page_size:state.pageSize,
    min_fallas:defaults.fallas,dias_criticos:defaults.dias
  };}
  function markup(){return `<div class="proy-page proyns-page">
    <section class="proy-card proy-head">
      <div><p class="proy-eyebrow">🧪 Experimental NS · Fase 5 · Solo lectura</p>
        <h1>Proyectos de Mantenimiento</h1>
        <p>Vista agregada de proyectos y equipos, con indicadores de Tickets de prueba. No utiliza datos operativos de producción.</p></div>
      <div class="proy-head-actions"><span class="proy-status loading" id="proyns-status" role="status" aria-live="polite"><span class="proy-dot"></span><span>Preparando muestra NS...</span></span>
        <button type="button" class="proy-btn proy-btn-primary" data-proyns="refresh">↻ Actualizar</button></div>
    </section>
    <div class="proyns-banner" role="note">🧪 ORIGEN EXCLUSIVO: <b>ns_portafolio_pruebas + ns_tickets_pruebas</b> · Consultas solo lectura · Los modulos de produccion no intervienen.</div>
    <section class="proy-card proy-filters" aria-label="Filtros de Proyectos Experimental NS">
      <label>Zona<select id="proyns-filter-zona"><option value="">Todas</option></select></label>
      <label>Estado<select id="proyns-filter-estado"><option value="">Todos</option></select></label>
      <label>Supervisor<select id="proyns-filter-supervisor"><option value="">Todos</option></select></label>
      <label>Buscar<input id="proyns-filter-search" type="search" maxlength="180" placeholder="Proyecto, codigo, ciudad, supervisor..."></label>
      <button type="button" class="proy-btn" data-proyns="clear">Limpiar</button>
      <button type="button" class="proy-btn proy-btn-primary" data-proyns="apply">Aplicar</button>
    </section>
    <section class="proy-grid proy-kpis" aria-label="Indicadores de Proyectos NS">
      <article class="proy-kpi proy-kpi-blue"><span>🏢</span><strong id="proyns-kpi-proyectos">—</strong><b>Proyectos</b><small>con equipos activos</small></article>
      <article class="proy-kpi proy-kpi-indigo"><span>🛠️</span><strong id="proyns-kpi-equipos">—</strong><b>Equipos</b><small>portafolio NS activo</small></article>
      <article class="proy-kpi proy-kpi-red"><span>⛔</span><strong id="proyns-kpi-parados">—</strong><b>Parados</b><small>ultimo ticket no funcionando</small></article>
      <article class="proy-kpi proy-kpi-green"><span>⏱️</span><strong id="proyns-kpi-mtbc">—</strong><b>MTBC U365</b><small>equipos con falla BLT · NS</small></article>
    </section>
    <section class="proy-card"><div class="proy-section-head"><div><h2>Listado de proyectos</h2><p id="proyns-count">Sin cargar</p></div></div>
      <p class="proyns-quality" id="proyns-quality" role="note">Los historicos y las identidades dependen de la integridad de la muestra NS.</p>
      <div class="proy-table-wrap"><table class="proy-table"><thead><tr>
        <th>Proyecto</th><th>Ciudad</th><th>Estado</th><th>Zona</th><th>Supervisor</th><th>Equipos</th><th>Parados</th>
        <th>Llamadas Totales</th><th>Última</th><th>Resp. BLT</th><th>Última BLT</th><th>Resp. Cliente</th><th>Última Cliente</th>
        <th>Tickets 35d</th><th>BLT 365d</th><th>MTBC U365</th><th></th>
      </tr></thead><tbody id="proyns-body"><tr><td colspan="17" class="proy-empty">Sin cargar</td></tr></tbody></table></div>
      <div class="proyns-pagination"><button type="button" class="proy-btn" data-proyns="prev" id="proyns-prev">← Anterior</button>
        <span id="proyns-page">Página —</span><button type="button" class="proy-btn" data-proyns="next" id="proyns-next">Siguiente →</button></div>
    </section>
    <section class="proy-detail" id="proyns-detail-modal" hidden aria-label="Detalle de proyecto Experimental NS">
      <div class="proy-detail-panel"><div class="proy-detail-head">
        <button type="button" class="proyns-close" data-proyns="close-detail" aria-label="Cerrar detalle">×</button>
        <div><h2 id="proyns-detail-title">Detalle NS</h2><p id="proyns-detail-sub">Solo datos de prueba</p></div>
      </div><div class="proy-detail-body" id="proyns-detail-body"></div></div>
    </section>
  </div>`;}
  function setStatus(kind,message){const el=$('proyns-status');if(!el)return;el.className='proy-status '+(kind||'loading');el.innerHTML='<span class="proy-dot"></span><span>'+esc(message)+'</span>';}
  async function api(path){if(!window.ManttoAuth||typeof window.ManttoAuth.apiGet!=='function')throw new Error('Sesion de BLT NOW no disponible.');
    const data=await window.ManttoAuth.apiGet(path);
    if(!data||data.ok!==true||data.source!=='experimental-ns'||data.modo!=='SOLO_LECTURA'||
      !Array.isArray(data.tablas)||data.tablas.length!==2||
      !data.tablas.includes('ns_portafolio_pruebas')||!data.tablas.includes('ns_tickets_pruebas'))
      throw new Error('Contrato experimental invalido: no se usan fuentes alternativas.');
    return data;}
  function fillSelect(id,items){const sel=$(id);if(!sel)return;const previous=sel.value;
    const first=sel.firstElementChild?sel.firstElementChild.outerHTML:'<option value="">Todos</option>';
    const values=(Array.isArray(items)?items:[]).filter(v=>typeof v==='string'&&v);
    sel.innerHTML=first+values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
    sel.value=values.includes(previous)?previous:'';
  }
  function renderTable(rows){const tbody=$('proyns-body');if(!tbody)return;
    tbody.innerHTML=rows.length?rows.map(p=>`<tr><td class="proy-name">
        ${p.identidad==='ZONA_NOMBRE_NO_VERIFICADO'?'<span class="proyns-provisional" title="Proyecto sin identificador canonico verificado">⚠</span> ':''}${esc(p.proyecto_nombre||p.proyecto)}</td>
      <td>${esc(p.ciudad)}</td><td>${esc(p.estado)}</td><td>${esc(p.zona)}</td><td>${esc(p.supervisor)}</td>
      <td class="num">${num(p.equipos)}</td><td class="num">${Number(p.parados)>0?'<span class="proy-badge proy-badge-bad">'+num(p.parados)+'</span>':'<span class="proy-badge proy-badge-ok">0</span>'}</td>
      <td class="num">${num(p.llamadas_total_anio)}</td><td class="date">${date(p.ultima_llamada)}</td>
      <td class="num">${num(p.llamadas_blt_anio)}</td><td class="date">${date(p.ultima_llamada_blt)}</td>
      <td class="num">${num(p.llamadas_cliente_anio)}</td><td class="date">${date(p.ultima_llamada_cliente)}</td>
      <td class="num">${num(p.tickets_35d)}</td><td class="num">${num(p.fallas_blt_365d)}</td>
      <td class="num">${mtbc(p.mtbc_365)}</td>
      <td><button type="button" class="proy-btn" data-proyns="detail" data-key="${esc(p.proyecto_clave)}">Ver</button></td>
    </tr>`).join(''):'<tr><td colspan="17" class="proy-empty">No hay proyectos en la muestra NS para estos filtros.</td></tr>';
  }
  function render(data){state.rows=Array.isArray(data.data)?data.data:[];state.summary=data.summary||null;
    state.total=Number(data.pagination?.total||0);state.lastQuality=data.calidad||{};
    state.page=Number(data.pagination?.page||state.page);
    const summary=state.summary||{};
    setText('proyns-kpi-proyectos',num(summary.proyectos||0));
    setText('proyns-kpi-equipos',num(summary.equipos||0));
    setText('proyns-kpi-parados',num(summary.parados||0));
    setText('proyns-kpi-mtbc',mtbc(summary.mtbc_365));
    setText('proyns-count',num(state.total)+' proyectos · solo NS');
    fillSelect('proyns-filter-zona',data.filtros?.zonas);
    fillSelect('proyns-filter-estado',data.filtros?.estados);
    fillSelect('proyns-filter-supervisor',data.filtros?.supervisores);
    renderTable(state.rows);renderPage();
    const q=state.lastQuality;
    setText('proyns-quality',`Calidad NS · ${num(q.proyectos_identidad_provisional||0)} grupos sin ID canonico (⚠ identidad provisional) · ${num(q.tickets_proyecto_discrepante||0)} tickets con nombre discrepante · ${num(q.tickets_sin_equipo_activo||0)} tickets sin equipo activo vinculado.`);
    setStatus('ok','Proyectos NS consultados · historico sujeto a muestra cargada');
  }
  function renderPage(){const pages=Math.max(1,Math.ceil(state.total/state.pageSize));setText('proyns-page',`Pagina ${state.page} de ${pages} · ${num(state.total)} proyectos`);
    if($('proyns-prev'))$('proyns-prev').disabled=state.page<=1;
    if($('proyns-next'))$('proyns-next').disabled=state.page>=pages;}
  function clearData(){state.rows=[];state.summary=null;state.total=0;state.lastQuality={};
    setText('proyns-kpi-proyectos','—');setText('proyns-kpi-equipos','—');setText('proyns-kpi-parados','—');setText('proyns-kpi-mtbc','—');
    setText('proyns-count','Error de lectura · 0 proyectos');setText('proyns-quality','No hay datos experimentales verificables.');renderTable([]);renderPage();}
  async function refresh(){const sequence=++state.pending;setStatus('loading','Consultando exclusivamente tablas NS...');
    if($('proyns-body'))$('proyns-body').innerHTML='<tr><td colspan="17" class="proy-empty">Cargando muestra NS...</td></tr>';
    try{
      const data=await api(ENDPOINT+'/inicial?'+qs(criteria()));
      if(sequence!==state.pending||window.ManttoRouter?.getCurrent?.()?.route!==ROUTE)return;
      render(data);
    }catch(error){if(sequence!==state.pending||window.ManttoRouter?.getCurrent?.()?.route!==ROUTE)return;
      console.error('[EXPERIMENTAL_NS_F5]',error);
      clearData();setStatus('error','No se pudo consultar Proyectos NS: '+(error.message||'Error desconocido')+'. Sin respaldo a produccion.');
    }
  }
  function closeDetail(){state.detailPending++;const modal=$('proyns-detail-modal');if(modal)modal.hidden=true;state.detailKey='';}
  function info(label,v){return '<div class="proy-info"><label>'+esc(label)+'</label><span>'+esc(v||'—')+'</span></div>';}
  function kpi(label,value,subtitle,cls){return '<article class="proy-kpi '+cls+'"><strong>'+esc(value)+'</strong><b>'+esc(label)+'</b><small>'+esc(subtitle)+'</small></article>';}
  function barChart(title,rows,key){const items=Array.isArray(rows)?rows:[];const max=Math.max(1,...items.map(r=>Number(r.total)||0));
    return `<section class="proy-card"><div class="proy-section-head"><h2>${esc(title)}</h2></div><div class="proyns-chart">
      ${items.length?items.map(r=>`<div class="proy-bar-row"><span>${esc(r[key])}</span><div class="proy-bar-track"><div class="proy-bar-fill" style="width:${Math.round((Number(r.total)||0)/max*100)}%"></div></div><b>${num(r.total)}</b></div>`).join(''):'<div class="proy-empty">Sin datos</div>'}
    </div></section>`;}
  function renderDetail(data){const body=$('proyns-detail-body');if(!body)return;
    const d=data.data||{},p=d.proyecto||{},equipos=Array.isArray(d.equipos)?d.equipos:[],tickets=Array.isArray(d.tickets)?d.tickets:[];
    state.detail=d;
    setText('proyns-detail-title',(p.proyecto_nombre||p.proyecto||'Proyecto')+' · Experimental NS');
    setText('proyns-detail-sub',`${num(d.total?.equipos||0)} equipos · ${num(d.total?.tickets||0)} tickets NS${d.limitado?.tickets?' · detalle acotado':''}`);
    body.innerHTML=`<section class="proy-card"><div class="proy-info-grid">${info('Proyecto',p.proyecto_nombre||p.proyecto)}${info('Codigo proyecto',p.proyecto_codigo)}${info('Ciudad',p.ciudad)}${info('Estado',p.estado)}${info('Zona',p.zona)}${info('Supervisor',p.supervisor)}${info('Identidad',p.identidad==='ZONA_NOMBRE_NO_VERIFICADO'?'Provisional: zona + nombre':'ID de proyecto')}
      </div></section>
      <section class="proy-grid proy-kpis">${kpi('Equipos',num(p.equipos),'Portafolio NS','proy-kpi-indigo')}${kpi('Parados',num(p.parados),'Ultimo estado NS','proy-kpi-red')}${kpi('Tickets 35d',num(p.tickets_35d),'Actividad de prueba','proy-kpi-blue')}${kpi('MTBC U365',mtbc(p.mtbc_365),'Muestra de prueba','proy-kpi-green')}</section>
      <section class="proy-charts">${barChart('Fallas por mes - año actual',d.mensual_actual,'mes')}${barChart('Fallas por mes - año anterior',d.mensual_anterior,'mes')}</section>
      ${barChart('Responsabilidad',d.responsabilidad,'responsabilidad')}
      <section class="proy-card"><div class="proy-section-head"><div><h2>Equipos del proyecto</h2><p>${num(d.total?.equipos||0)} equipos${d.limitado?.equipos?' · solo primeros 500':''}</p></div></div>
        <div class="proy-table-wrap"><table class="proy-table"><thead><tr><th>Código</th><th>Referencia</th><th>Producto</th><th>Póliza</th><th>Operativo</th><th>Días parado</th><th>Último ticket</th></tr></thead><tbody>${equipos.length?equipos.map(e=>`<tr><td class="proy-name">${esc(e.numero_equipo)}</td><td>${esc(e.identificacion_sitio)}</td><td>${esc(e.tipo_equipo)}</td><td>${esc(e.contrato)}</td><td>${esc(e.estado_operativo)}</td><td class="num">${e.dias_parado==null?'—':num(e.dias_parado)}</td><td>${esc(e.ultimo_ticket)}</td></tr>`).join(''):'<tr><td colspan="7" class="proy-empty">Sin equipos</td></tr>'}</tbody></table></div>
      </section>
      <section class="proy-card"><div class="proy-section-head"><div><h2>Tickets recientes</h2><p>${num(d.total?.tickets||0)} registros${d.limitado?.tickets?' · primeros 1,000':''}</p></div></div>
        <div class="proy-table-wrap"><table class="proy-table"><thead><tr><th>Ticket</th><th>Equipo</th><th>Estado</th><th>Reporte</th><th>Cierre</th><th>Responsabilidad</th><th>Causa</th><th>Motivo detalle</th></tr></thead><tbody>${tickets.length?tickets.map(t=>`<tr><td class="proy-name">${esc(t.ticket)}</td><td>${esc(t.codigo_equipo)}</td><td>${esc(t.estado_ticket)}</td><td>${date(t.fecha_reporte)}</td><td>${date(t.fecha_cierre)}</td><td>${esc(t.responsabilidad)}</td><td>${esc(t.causa_falla||t.causa)}</td><td>${esc(t.custeventblt_mot_det)}</td></tr>`).join(''):'<tr><td colspan="8" class="proy-empty">Sin tickets de la muestra NS</td></tr>'}</tbody></table></div>
      </section>`;
  }
  async function openDetail(key){if(!key)return;const seq=++state.detailPending;
    const modal=$('proyns-detail-modal');if(!modal)return;
    modal.hidden=false;state.detail=null;state.detailKey=key;
    setText('proyns-detail-title','Proyecto Experimental NS');setText('proyns-detail-sub','Consultando detalle de prueba...');
    if($('proyns-detail-body'))$('proyns-detail-body').innerHTML='<div class="proy-card proy-empty">Cargando detalle exclusivamente de NS...</div>';
    try{const r=await api(ENDPOINT+'/detalle?'+qs({...criteria(),proyecto_clave:key}));
      if(seq!==state.detailPending||window.ManttoRouter?.getCurrent?.()?.route!==ROUTE)return;
      renderDetail(r);
    }catch(error){if(seq!==state.detailPending)return;console.error('[EXPERIMENTAL_NS_F5_DETAIL]',error);
      setText('proyns-detail-sub','No disponible · sin respaldo a producción');
      if($('proyns-detail-body'))$('proyns-detail-body').innerHTML='<div class="proy-card proy-empty">'+esc(error.message||'Error de consulta')+'</div>';
    }
  }
  function bind(){const root=view();if(!root)return;
    root.addEventListener('click',event=>{
      const action=event.target?.closest?.('[data-proyns]');if(!action||!root.contains(action))return;
      switch(action.dataset.proyns){
        case 'refresh':refresh();break;
        case 'apply':state.page=1;refresh();break;
        case 'clear':for(const id of ['proyns-filter-zona','proyns-filter-estado','proyns-filter-supervisor','proyns-filter-search'])if($(id))$(id).value='';state.page=1;refresh();break;
        case 'prev':if(state.page>1){state.page--;refresh();}break;
        case 'next':if(state.page*state.pageSize<state.total){state.page++;refresh();}break;
        case 'detail':openDetail(action.dataset.key);break;
        case 'close-detail':closeDetail();break;
      }
    });
    root.querySelectorAll('#proyns-filter-zona,#proyns-filter-estado,#proyns-filter-supervisor').forEach(sel=>sel.addEventListener('change',()=>{state.page=1;refresh();}));
    const search=$('proyns-filter-search');if(search)search.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();state.page=1;refresh();}});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!($('proyns-detail-modal')?.hidden))closeDetail();});
  }
  function init(){const root=view();if(!root)return false;
    if(!state.ready){root.innerHTML=markup();state.ready=true;bind();}closeDetail();refresh();return true;
  }
  window.ManttoProyectosMantenimientoNS=Object.freeze({init});
})();
