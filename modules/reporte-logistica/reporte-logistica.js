(function(){
  const PIPELINE=['SIN PRODUCCIÓN / Documentación Pendiente','SIN PRODUCCIÓN / Primera Visita a Obra','SIN PRODUCCIÓN / Pendiente Liberación por Parte del Cliente','SIN PRODUCCIÓN / Programados a Producción','EN PRODUCCIÓN','PARADOS POR CLIENTE','PENDIENTE PAGO LIBERACIÓN','PROGRAMADO','EN TRÁNSITO','PROGRAMA ENTREGA','ALMACENADOS','ENTREGADO'];
  const DATE_FIELDS=new Set(['pago_liberacion','pago_cliente','fecha_exw','fecha_salida_estimada','fecha_salida_real','fecha_llegada_estimada','fecha_llegada_real','fecha_entrega_programada','fecha_entrega_real_obra','fecha_produccion','fecha_estimada_obra','fecha_corte','fecha_corte_anterior','fecha_sync']);
  const state={rows:[],loaded:false,requestedStatus:'',search:'',detailId:''};
  const HTML=`<div class="rl-page">
    <section class="rl-card rl-head rl-list-view">
      <div><p class="rl-eyebrow">Aiven · Logística</p><h1>Reporte de Logística</h1><p>Detalle operativo por etapa del pipeline.</p></div>
      <div class="rl-actions"><span id="rl-status" class="rl-status"><span class="rl-dot"></span><span>Cargando Aiven...</span></span><button id="rl-refresh" class="rl-btn" type="button">↻ Actualizar</button></div>
    </section>
    <section class="rl-card rl-section rl-list-view">
      <div class="rl-section-head"><div><h2>Detalle por estatus</h2><p>Solo una sección puede permanecer abierta. Usa la búsqueda para localizar un proyecto.</p></div><small id="rl-total">—</small></div>
      <div class="rl-search-wrap">
        <span class="rl-search-icon" aria-hidden="true">⌕</span>
        <input id="rl-search" class="rl-search" type="search" placeholder="Buscar proyecto..." autocomplete="off" aria-label="Buscar proyecto">
        <button id="rl-search-clear" class="rl-search-clear" type="button" aria-label="Limpiar búsqueda" hidden>×</button>
      </div>
      <div id="rl-search-summary" class="rl-search-summary" hidden></div>
      <div id="rl-stack" class="rl-stack"></div>
    </section>
    <section id="rl-detail-view" class="rl-detail-view" hidden>
      <section class="rl-card rl-detail-head"><button id="rl-detail-back" class="rl-btn" type="button">← Volver al reporte</button><div><p class="rl-eyebrow">Logística</p><h1 id="rl-detail-title">Detalle</h1><p id="rl-detail-subtitle">—</p></div></section>
      <section class="rl-card rl-section"><div class="rl-section-head"><div><h2>Detalle de Logística</h2><p>Información operativa completa del registro seleccionado.</p></div></div><div id="rl-detail-body" class="rl-fields"></div></section>
    </section>
  </div>`;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v==null||v===''?'—':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v==null?'':v).trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const api=()=>String(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
  const columns=[
    ['id_ppns','PP NS'],['proyecto','Proyecto'],['estatus','Estatus'],['marca','Marca'],['no_control','No. control'],['cantidad','Cantidad'],
    ['supervisor','Supervisor'],['asesor','Asesor'],['ict','ICT'],['incoterm','Incoterm'],['pago_liberacion','Pago liberación'],['pago_cliente','Pago cliente'],
    ['fecha_exw','Fecha EXW'],['puerto_origen','Puerto origen'],['fecha_salida_estimada','Salida estimada'],['fecha_salida_real','Salida real'],
    ['puerto_destino','Puerto destino'],['fecha_llegada_estimada','Llegada estimada'],['fecha_llegada_real','Llegada real'],['lugar_entrega','Lugar entrega'],
    ['fecha_entrega_programada','Entrega programada'],['fecha_entrega_real_obra','Entrega real obra'],['proveedor','Proveedor'],['carpeta','Carpeta'],
    ['pvo','PVO'],['fecha_produccion','Fecha producción'],['fecha_estimada_obra','Fecha estimada obra'],['diferencia_dias','Diferencia días'],
    ['tiempo_total','Tiempo total'],['comentarios','Comentarios'],['ph_ns','PH NS']
  ];
  function setStatus(cls,msg){const e=$('rl-status');if(!e)return;e.className='rl-status '+cls;e.innerHTML='<span class="rl-dot"></span><span>'+esc(msg)+'</span>';}
  function formatDateValue(value){
    if(value===null||value===undefined||value==='')return '—';
    const raw=String(value).trim();
    const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::\d{2})?)?/);
    if(!match)return raw;
    const date=match[3]+'/'+match[2]+'/'+match[1];
    return match[4]&&match[5]?date+' - '+match[4]+':'+match[5]:date;
  }
  function displayValue(row,key){return DATE_FIELDS.has(key)?formatDateValue(row[key]):(row[key]==null||row[key]===''?'—':row[key]);}
  async function fetchRows(){
    if(window.ManttoLogisticaStore&&Array.isArray(window.ManttoLogisticaStore.rows)&&window.ManttoLogisticaStore.rows.length){return window.ManttoLogisticaStore.rows;}
    const headers=Object.assign({'Accept':'application/json'},window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{});
    const r=await fetch(api()+'/api/logistica?limit=5000',{headers,cache:'no-store'});const raw=await r.text();let j;
    try{j=raw?JSON.parse(raw):{};}catch(e){throw new Error('Respuesta no JSON del backend.');}
    if(!r.ok||!j.ok)throw new Error(j.message||j.error||'Error consultando Logística');
    const rows=Array.isArray(j.data)?j.data:[];window.ManttoLogisticaStore={rows,loadedAt:Date.now()};return rows;
  }
  function deliveredYear(r){const m=String(r.fecha_entrega_real_obra||'').match(/^(\d{4})/);return norm(r.estatus)==='ENTREGADO'&&m&&Number(m[1])===new Date().getFullYear();}
  function rowsFor(status){
    const search=norm(state.search);
    return state.rows
      .filter(r=>norm(r.estatus)===norm(status))
      .filter(r=>norm(status)!=='ENTREGADO'||deliveredYear(r))
      .filter(r=>!search||norm(r.proyecto).includes(search)||norm(r.id_ppns).includes(search));
  }
  function table(rows){
    if(!rows.length)return '<div class="rl-empty">Sin registros en esta sección.</div>';
    return `<div class="rl-table-wrap"><table class="rl-table"><thead><tr>${columns.map(c=>'<th>'+esc(c[1])+'</th>').join('')}</tr></thead><tbody>${rows.map(r=>`<tr data-id="${esc(r.id_log_ops)}">${columns.map(c=>'<td>'+esc(displayValue(r,c[0]))+'</td>').join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function closeAllAccordions(except){
    document.querySelectorAll('.rl-accordion.open').forEach(a=>{
      if(a===except)return;
      a.classList.remove('open');
      const button=a.querySelector('.rl-accordion-head');
      if(button)button.setAttribute('aria-expanded','false');
    });
  }
  function render(){
    const extras=[...new Set(state.rows.map(r=>r.estatus).filter(Boolean))].filter(s=>!PIPELINE.some(p=>norm(p)===norm(s)));
    const statuses=PIPELINE.concat(extras);
    const searchActive=Boolean(state.search.trim());
    const statusData=statuses.map(status=>({status,rows:rowsFor(status)}));
    const visibleData=searchActive?statusData.filter(item=>item.rows.length>0):statusData;
    const visibleCount=statusData.reduce((sum,item)=>sum+item.rows.length,0);
    $('rl-total').textContent=searchActive?visibleCount+' coincidencia'+(visibleCount===1?'':'s'):state.rows.length+' registros';
    const summary=$('rl-search-summary');
    if(summary){
      summary.hidden=!searchActive;
      summary.textContent=searchActive?(visibleCount?visibleCount+' proyecto'+(visibleCount===1?'':'s')+' localizado'+(visibleCount===1?'':'s')+'.':'No se encontraron proyectos con ese texto.'):'';
    }
    if(!visibleData.length){$('rl-stack').innerHTML='<div class="rl-empty">No se encontraron proyectos con ese texto.</div>';return;}
    let autoOpenStatus='';
    if(state.requestedStatus&&visibleData.some(item=>norm(item.status)===norm(state.requestedStatus)))autoOpenStatus=state.requestedStatus;
    else if(searchActive)autoOpenStatus=visibleData[0].status;
    $('rl-stack').innerHTML=visibleData.map(item=>{
      const requested=autoOpenStatus&&norm(autoOpenStatus)===norm(item.status);
      return `<article class="rl-accordion ${requested?'open':''}" data-status="${esc(item.status)}"><button class="rl-accordion-head" type="button" aria-expanded="${requested?'true':'false'}"><span class="rl-chevron">›</span><span class="rl-title">${esc(item.status)}${norm(item.status)==='ENTREGADO'?' (año en curso)':''}</span><span class="rl-count">${item.rows.length}</span></button><div class="rl-accordion-body">${table(item.rows)}</div></article>`;
    }).join('');
    document.querySelectorAll('.rl-accordion-head').forEach(btn=>btn.onclick=()=>{
      const accordion=btn.closest('.rl-accordion');
      const shouldOpen=!accordion.classList.contains('open');
      closeAllAccordions(shouldOpen?accordion:null);
      accordion.classList.toggle('open',shouldOpen);
      btn.setAttribute('aria-expanded',shouldOpen?'true':'false');
    });
    document.querySelectorAll('.rl-table [data-id]').forEach(tr=>tr.onclick=()=>openDetail(tr.dataset.id));
    if(autoOpenStatus){window.setTimeout(()=>{const a=[...document.querySelectorAll('.rl-accordion')].find(x=>norm(x.dataset.status)===norm(autoOpenStatus));if(a)a.scrollIntoView({behavior:'smooth',block:'start'});},0);}
    state.requestedStatus='';
  }
  function openDetail(id){
    const r=state.rows.find(x=>String(x.id_log_ops)===String(id));if(!r)return;
    state.detailId=String(id);
    document.querySelectorAll('.rl-list-view').forEach(el=>el.hidden=true);
    const detail=$('rl-detail-view');if(detail)detail.hidden=false;
    $('rl-detail-title').textContent=r.proyecto||'Detalle de Logística';
    $('rl-detail-subtitle').textContent=(r.id_ppns||'—')+' · '+(r.estatus||'Sin estatus');
    $('rl-detail-body').innerHTML=columns.map(c=>`<div class="rl-field"><small>${esc(c[1])}</small><b>${esc(displayValue(r,c[0]))}</b></div>`).join('');
    const main=document.querySelector('.main-content');if(main)main.scrollTop=0;
    window.scrollTo?.({top:0,behavior:'auto'});
  }
  function closeDetail(){
    state.detailId='';
    const detail=$('rl-detail-view');if(detail)detail.hidden=true;
    document.querySelectorAll('.rl-list-view').forEach(el=>el.hidden=false);
    render();
  }
  async function load(){setStatus('','Cargando Aiven...');try{state.rows=await fetchRows();state.loaded=true;render();setStatus('ok','Aiven conectado · '+state.rows.length+' registros');if(state.detailId)openDetail(state.detailId);}catch(e){setStatus('error',e.message);$('rl-stack').innerHTML='<div class="rl-empty">No se pudo cargar Reporte de Logística.</div>';}}
  function init(payload){
    const view=$('view-logistica-reporte');if(!view)return;
    if(!view.querySelector('#rl-refresh')||!view.querySelector('#rl-stack'))view.innerHTML=HTML;
    state.requestedStatus=payload&&payload.estatus?payload.estatus:'';
    state.detailId=payload&&payload.detailId?String(payload.detailId):'';
    if(payload&&(payload.search||payload.id_ppns))state.search=String(payload.search||payload.id_ppns||'');
    const refresh=$('rl-refresh'),back=$('rl-detail-back'),search=$('rl-search'),clear=$('rl-search-clear');
    if(search){
      search.value=state.search;
      search.oninput=()=>{state.search=search.value;clear.hidden=!state.search;render();};
    }
    if(clear){clear.hidden=!state.search;clear.onclick=()=>{state.search='';if(search){search.value='';search.focus();}clear.hidden=true;render();};}
    if(refresh)refresh.onclick=()=>{window.ManttoLogisticaStore=null;load();};
    if(back)back.onclick=closeDetail;
    if(state.loaded){render();if(state.detailId)openDetail(state.detailId);}else load();
  }
  window.ManttoReporteLogistica={init,reload:load};
})();
