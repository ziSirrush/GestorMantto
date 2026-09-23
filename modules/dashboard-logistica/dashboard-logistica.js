(function(){
  'use strict';

  // [Aster | 2026-09-23 | ASTER-MG | FASE 3 DASHBOARD LOGISTICA ANALITICA VISUAL V001]
  // Mantiene las graficas de FASE 2 y agrega las tres piezas analiticas acordadas:
  // tabla de salida por puerto, ring de contenedores del anio actual, desglose mensual enero-diciembre en dos tablas 7x3 y tabla de transito por modo.
  // Todo consume el contrato agregado de GET /api/logistica/dashboard creado en FASE 1.
  // [Aster | 2026-09-23 | ASTER-MG | FIX CORTES HISTORICOS LOGISTICA V001]
  // Permite seleccionar y cargar cortes semanales ya guardados en logistica_cortes_semanales.
  // [Aster | 2026-09-23 | ASTER-MG | FIX ORDEN PPNS FINAL V001]
  // Proyectos sin PP NS se mueve al cierre visual del Dashboard.
  // [Aster | 2026-09-23 | ASTER-MG | FIX PROMEDIOS POR ANIO V001]
  // Los promedios cargan por defecto el anio actual y permiten seleccionar todos los anios o un anio registrado.
  // [Aster | 2026-09-23 | ASTER-MG | FIX SELECTOR ESTANDAR PROMEDIOS V002]
  // Reemplaza datalist del navegador por el select estandar usado en filtros del Gestor.

  const state={
    rows:[],
    movements:[],
    cut:null,
    cuts:[],
    selectedCutKey:'',
    cutLoading:false,
    cutError:null,
    cutCatalogError:null,
    analytics:null,
    averageFilterLoading:false,
    averageFilterError:null,
    loaded:false
  };

  const HTML=`<div class="dl-page">
  <section class="dl-card dl-head">
    <div>
      <p class="dl-eyebrow">Aiven · Logística</p>
      <h1>Dashboard Logística</h1>
      <p>Seguimiento ejecutivo de producción, tránsito, almacenamiento y entrega.</p>
    </div>
    <div class="dl-actions">
      <span id="dl-status" class="dl-status"><span class="dl-dot"></span><span>Cargando Aiven...</span></span>
      <button id="dl-refresh" class="dl-btn" type="button">↻ Actualizar</button>
    </div>
  </section>

  <section class="dl-card dl-section">
    <div class="dl-section-head">
      <div>
        <h2>Estado operativo</h2>
        <p>Distribución por etapa y entregas históricas. Selecciona una columna de estatus para abrir el Reporte de Logística.</p>
      </div>
      <small id="dl-charts-updated">—</small>
    </div>

    <div class="dl-charts-grid">
      <article class="dl-chart-card">
        <div class="dl-chart-head">
          <div><h3>Sin Producción</h3><p>Etapas previas al inicio de producción.</p></div>
          <strong id="dl-chart-total-sin">—</strong>
        </div>
        <div class="dl-chart-scroll"><div id="dl-chart-sin-produccion" class="dl-column-chart"></div></div>
      </article>

      <article class="dl-chart-card">
        <div class="dl-chart-head">
          <div><h3>Producción</h3><p>Estado actual de fabricación y liberación.</p></div>
          <strong id="dl-chart-total-prod">—</strong>
        </div>
        <div class="dl-chart-scroll"><div id="dl-chart-produccion" class="dl-column-chart"></div></div>
      </article>

      <article class="dl-chart-card">
        <div class="dl-chart-head">
          <div><h3>Logística</h3><p>Tránsito, programación de entrega y almacén.</p></div>
          <strong id="dl-chart-total-log">—</strong>
        </div>
        <div class="dl-chart-scroll"><div id="dl-chart-logistica" class="dl-column-chart"></div></div>
      </article>

      <article class="dl-chart-card">
        <div class="dl-chart-head">
          <div><h3>Entregados por año</h3><p>Según la fecha real de entrega en obra, del año más antiguo al más reciente.</p></div>
          <strong id="dl-chart-total-ent">—</strong>
        </div>
        <div class="dl-chart-scroll"><div id="dl-chart-entregados" class="dl-column-chart dl-column-chart-years"></div></div>
      </article>
    </div>
  </section>

  <section class="dl-card dl-average-filter-card">
    <div class="dl-average-filter-copy">
      <p class="dl-eyebrow">Promedios logísticos</p>
      <h2>Periodo de análisis</h2>
      <p>El año se determina por la fecha de salida real. Por defecto se muestra el año actual.</p>
    </div>
    <form id="dl-average-filter-form" class="dl-average-filter-form">
      <label for="dl-average-year-select">Buscar periodo</label>
      <div class="dl-average-filter-controls">
        <select id="dl-average-year-select" class="dl-average-year-select" aria-label="Seleccionar periodo de promedios logísticos">
          <option value="">Cargando periodos...</option>
        </select>
        <button id="dl-average-year-apply" class="dl-btn" type="submit">Buscar</button>
      </div>
      <small id="dl-average-year-status">Año actual</small>
    </form>
  </section>

  <section class="dl-grid dl-analytics-top">
    <article class="dl-card dl-section">
      <div class="dl-section-head">
        <div><h2>Promedio de salida por puerto</h2><p>Promedio real desde EXW hasta la salida real, agrupado por puerto de origen.</p></div>
        <small id="dl-departure-count">—</small>
      </div>
      <div class="dl-table-wrap">
        <table class="dl-table dl-analytics-table">
          <thead><tr><th>Puerto origen</th><th>Operaciones</th><th>Promedio días salida</th></tr></thead>
          <tbody id="dl-departure-body"></tbody>
        </table>
      </div>
    </article>

    <article class="dl-card dl-section dl-container-card">
      <div class="dl-section-head">
        <div><h2>Contenedores del año actual</h2><p>Distribución física 20' DC vs 40' HQ según ETD del año actual.</p></div>
        <small id="dl-containers-year">—</small>
      </div>
      <div id="dl-containers-ring-wrap" class="dl-ring-wrap">
        <div id="dl-containers-ring" class="dl-ring" role="img" aria-label="Distribución de contenedores del año actual">
          <div class="dl-ring-center"><strong id="dl-containers-total">—</strong><span>Total</span></div>
        </div>
        <div class="dl-ring-legend">
          <div class="dl-ring-item"><span class="dl-ring-dot dl-ring-dot-20"></span><div><small>20' DC</small><strong id="dl-containers-20">—</strong><span id="dl-containers-20-pct">—</span></div></div>
          <div class="dl-ring-item"><span class="dl-ring-dot dl-ring-dot-40"></span><div><small>40' HQ</small><strong id="dl-containers-40">—</strong><span id="dl-containers-40-pct">—</span></div></div>
        </div>
      </div>
      <p id="dl-containers-note" class="dl-analytics-note">—</p>
      <div class="dl-container-months">
        <div class="dl-container-months-head">
          <strong>Contenedores por mes</strong>
          <small id="dl-containers-months-period">Enero - Diciembre</small>
        </div>
        <div class="dl-container-months-grid">
          <div class="dl-container-months-table-wrap">
            <table class="dl-container-months-table" aria-label="Contenedores de enero a junio">
              <thead><tr><th>Mes</th><th>20' DC</th><th>40' HQ</th></tr></thead>
              <tbody id="dl-containers-months-first"></tbody>
            </table>
          </div>
          <div class="dl-container-months-table-wrap">
            <table class="dl-container-months-table" aria-label="Contenedores de julio a diciembre">
              <thead><tr><th>Mes</th><th>20' DC</th><th>40' HQ</th></tr></thead>
              <tbody id="dl-containers-months-second"></tbody>
            </table>
          </div>
        </div>
      </div>
    </article>
  </section>

  <section class="dl-card dl-section">
    <div class="dl-section-head">
      <div><h2>Promedio de tránsito según modo</h2><p>Promedio real desde salida hasta llegada, por puerto destino y modo ICT.</p></div>
      <small id="dl-transit-count">—</small>
    </div>
    <div class="dl-table-wrap">
      <table class="dl-table dl-analytics-table dl-transit-table">
        <thead><tr><th>Puerto destino</th><th>Modo</th><th>Operaciones</th><th>Promedio días llegada</th></tr></thead>
        <tbody id="dl-transit-body"></tbody>
      </table>
    </div>
  </section>

  <section class="dl-card dl-section">
    <div class="dl-section-head dl-mov-head">
      <div><h2>Movimientos semanales</h2><p id="dl-mov-subtitle">Último corte autónomo cerrado.</p></div>
      <div class="dl-cut-tools">
        <label for="dl-cut-select">Corte guardado</label>
        <select id="dl-cut-select" class="dl-cut-select" aria-label="Seleccionar corte semanal de Logística"><option value="">Cargando cortes...</option></select>
      </div>
    </div>
    <div class="dl-cut-kpis" aria-label="Resumen del corte semanal seleccionado">
      <div class="dl-cut-kpi"><small>Movimientos</small><strong id="dl-mov-count">—</strong></div>
      <div class="dl-cut-kpi"><small>Ingresos</small><strong id="dl-cut-ingresos">—</strong></div>
      <div class="dl-cut-kpi"><small>Cambios estatus</small><strong id="dl-cut-cambios">—</strong></div>
      <div class="dl-cut-kpi"><small>Registros corte</small><strong id="dl-cut-registros">—</strong></div>
    </div>
    <div class="dl-table-wrap"><table class="dl-table"><thead><tr><th>Tipo</th><th>PP NS</th><th>Proyecto</th><th>Estatus</th></tr></thead><tbody id="dl-mov-body"></tbody></table></div>
  </section>

  <section class="dl-card dl-section dl-ppns-final">
    <div class="dl-section-head"><div><h2>Proyectos sin PP NS</h2><p>Registros con SIN PP NS / SIN CARPETA.</p></div><small id="dl-sin-count">—</small></div>
    <div class="dl-table-wrap"><table class="dl-table"><thead><tr><th>Proyecto</th><th>Estatus</th><th>Marca</th></tr></thead><tbody id="dl-sin-body"></tbody></table></div>
  </section>

  <section id="dl-modal" class="dl-modal" hidden>
    <div class="dl-modal-panel">
      <div class="dl-modal-head"><h2 id="dl-modal-title">Detalle</h2><button id="dl-modal-close" class="dl-modal-close" type="button">×</button></div>
      <div id="dl-modal-body" class="dl-modal-body"></div>
    </div>
  </section>
</div>`;

  const $=id=>document.getElementById(id);
  const esc=v=>String(v==null||v===''?'—':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v==null?'':v).trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const num=v=>Number(v||0).toLocaleString('es-MX');
  const text=(id,v)=>{const e=$(id);if(e)e.textContent=v;};
  const api=()=>String(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
  const authHeaders=()=>Object.assign({'Accept':'application/json'},window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{});

  function isSin(r){
    const v=norm(r.id_ppns);
    return ['SIN PP NS','SIN PPNS','SIN CARPETA'].includes(v);
  }

  function setStatus(cls,msg){
    const e=$('dl-status');
    if(!e)return;
    e.className='dl-status '+cls;
    e.innerHTML='<span class="dl-dot"></span><span>'+esc(msg)+'</span>';
  }

  async function fetchJson(url,errorMessage){
    const r=await fetch(url,{headers:authHeaders(),cache:'no-store'});
    const raw=await r.text();
    let j;
    try{j=raw?JSON.parse(raw):{};}catch(e){throw new Error('Respuesta no JSON del backend.');}
    if(!r.ok||!j.ok)throw new Error(j.message||j.error||errorMessage);
    return j;
  }

  async function fetchRows(){
    const j=await fetchJson(api()+'/api/logistica?limit=5000','Error consultando Logística');
    return Array.isArray(j.data)?j.data:[];
  }

  async function fetchAnalytics(averagePeriod){
    let url=api()+'/api/logistica/dashboard';
    if(averagePeriod!==undefined&&averagePeriod!==null&&String(averagePeriod).trim()!==''){
      url+='?anio_promedios='+encodeURIComponent(String(averagePeriod));
    }
    const j=await fetchJson(url,'Error consultando analítica de Logística');
    if(!j.data||typeof j.data!=='object')throw new Error('Analítica de Logística sin payload válido.');
    return j.data;
  }

  async function fetchLatestCut(){
    const j=await fetchJson(api()+'/api/logistica/cortes/semanales/ultimo','Error consultando el corte semanal');
    return j.data||null;
  }

  async function fetchCutCatalog(){
    const j=await fetchJson(api()+'/api/logistica/cortes/semanales','Error consultando el historial de cortes semanales');
    return Array.isArray(j.data)?j.data:[];
  }

  async function fetchCutByWeek(anio,semana){
    const year=encodeURIComponent(String(anio));
    const week=encodeURIComponent(String(semana));
    const j=await fetchJson(api()+'/api/logistica/cortes/semanales/'+year+'/'+week,'Error consultando el corte semanal seleccionado');
    return j.data||null;
  }

  function cutKey(cut){
    if(!cut)return '';
    const year=Number(cut.anio_iso);
    const week=Number(cut.semana_iso);
    return Number.isInteger(year)&&Number.isInteger(week)?year+'|'+week:'';
  }

  function closedCuts(){
    return (Array.isArray(state.cuts)?state.cuts:[]).filter(cut=>norm(cut&&cut.estado)==='CERRADO');
  }

  function totalOf(items){
    return (Array.isArray(items)?items:[]).reduce((sum,item)=>sum+Number(item&&item.total||0),0);
  }

  function chartMinWidth(count){
    return Math.max(360,Math.max(1,count)*96);
  }

  function renderStatusChart(hostId,totalId,items){
    const host=$(hostId);
    if(!host)return;
    const rows=Array.isArray(items)?items:[];
    const max=Math.max(1,...rows.map(item=>Number(item&&item.total||0)));
    host.style.gridTemplateColumns=`repeat(${Math.max(1,rows.length)},minmax(78px,1fr))`;
    host.style.minWidth=chartMinWidth(rows.length)+'px';
    host.innerHTML=rows.length?rows.map(item=>{
      const total=Number(item&&item.total||0);
      const height=total?Math.max(8,Math.round((total/max)*100)):0;
      const status=String(item&&item.estatus||'');
      const label=String(item&&item.etiqueta||status||'Sin estatus');
      return `<button class="dl-column-item dl-column-action" type="button" data-status="${esc(status)}" aria-label="${esc(label)}: ${num(total)} registros">
        <span class="dl-column-value">${num(total)}</span>
        <span class="dl-column-track" aria-hidden="true"><span class="dl-column-fill" style="height:${height}%"></span></span>
        <span class="dl-column-label">${esc(label)}</span>
      </button>`;
    }).join(''):'<div class="dl-chart-empty">Sin datos</div>';
    text(totalId,num(totalOf(rows))+' registros');
  }

  function renderDeliveredChart(items){
    const host=$('dl-chart-entregados');
    if(!host)return;
    const rows=(Array.isArray(items)?items:[])
      .map(item=>({anio:Number(item&&item.anio),total:Number(item&&item.total||0)}))
      .filter(item=>Number.isInteger(item.anio))
      .sort((a,b)=>a.anio-b.anio);
    const max=Math.max(1,...rows.map(item=>item.total));
    host.style.gridTemplateColumns=`repeat(${Math.max(1,rows.length)},minmax(78px,1fr))`;
    host.style.minWidth=chartMinWidth(rows.length)+'px';
    host.innerHTML=rows.length?rows.map(item=>{
      const height=item.total?Math.max(8,Math.round((item.total/max)*100)):0;
      return `<div class="dl-column-item" aria-label="Entregados ${item.anio}: ${num(item.total)} registros">
        <span class="dl-column-value">${num(item.total)}</span>
        <span class="dl-column-track" aria-hidden="true"><span class="dl-column-fill" style="height:${height}%"></span></span>
        <span class="dl-column-label dl-column-year">${item.anio}</span>
      </div>`;
    }).join(''):'<div class="dl-chart-empty">Sin entregas con fecha_entrega_real_obra válida</div>';
    text('dl-chart-total-ent',num(totalOf(rows))+' entregados');
  }

  function renderCharts(){
    const analytics=state.analytics||{};
    const charts=analytics.graficas||{};
    renderStatusChart('dl-chart-sin-produccion','dl-chart-total-sin',charts.sin_produccion);
    renderStatusChart('dl-chart-produccion','dl-chart-total-prod',charts.produccion);
    renderStatusChart('dl-chart-logistica','dl-chart-total-log',charts.logistica);
    renderDeliveredChart(charts.entregados_por_anio);
    text('dl-charts-updated',analytics.anio_actual?'Año actual CDMX: '+analytics.anio_actual:'Datos agregados Aiven');

    document.querySelectorAll('.dl-column-action[data-status]').forEach(element=>{
      element.onclick=()=>{
        if(window.ManttoRouter){
          window.ManttoRouter.go('logistica-reporte',{estatus:element.dataset.status,source:'logistica-dashboard'});
        }
      };
    });
  }

  function renderChartsError(message){
    ['dl-chart-sin-produccion','dl-chart-produccion','dl-chart-logistica','dl-chart-entregados'].forEach(id=>{
      const host=$(id);
      if(host){
        host.style.gridTemplateColumns='1fr';
        host.style.minWidth='0';
        host.innerHTML='<div class="dl-chart-empty">'+esc(message||'No se pudieron cargar las gráficas.')+'</div>';
      }
    });
    ['dl-chart-total-sin','dl-chart-total-prod','dl-chart-total-log','dl-chart-total-ent'].forEach(id=>text(id,'—'));
    text('dl-charts-updated','Analítica no disponible');
  }

  function formatAverageDays(value){
    const n=Number(value);
    if(!Number.isFinite(n))return '—';
    return n.toLocaleString('es-MX',{minimumFractionDigits:1,maximumFractionDigits:1})+' días';
  }

  function averagePeriodMeta(){
    const analytics=state.analytics||{};
    const meta=analytics.promedios||{};
    const currentYear=Number(analytics.anio_actual)||0;
    const available=(Array.isArray(meta.anios_disponibles)?meta.anios_disponibles:[])
      .map(Number)
      .filter(year=>Number.isInteger(year)&&year>=1900&&year<=2200);
    const years=[...new Set([currentYear,...available].filter(Boolean))].sort((a,b)=>b-a);
    const period=meta.periodo==='all'?'all':Number(meta.periodo)||currentYear||'';
    return {meta,currentYear,years,period};
  }

  function averagePeriodLabel(){
    const info=averagePeriodMeta();
    if(info.period==='all')return 'Todos los años';
    if(info.period&&info.period===info.currentYear)return 'Año actual '+info.period;
    return info.period?String(info.period):'Año actual';
  }

  function renderAverageFilter(){
    const select=$('dl-average-year-select');
    const button=$('dl-average-year-apply');
    if(!select)return;

    const info=averagePeriodMeta();
    const selectedValue=info.period==='all'?'all':String(info.period||info.currentYear||'');
    select.innerHTML='<option value="all">Todos los años</option>'+info.years.map(year=>
      '<option value="'+year+'">'+year+'</option>'
    ).join('');
    select.value=selectedValue;
    select.disabled=state.averageFilterLoading;
    if(button)button.disabled=state.averageFilterLoading;

    if(state.averageFilterLoading){
      text('dl-average-year-status','Cargando periodo...');
    }else if(state.averageFilterError){
      text('dl-average-year-status',state.averageFilterError.message||'No fue posible cambiar el periodo.');
    }else{
      const registered=info.meta&&Array.isArray(info.meta.anios_disponibles)?info.meta.anios_disponibles.length:0;
      text('dl-average-year-status',averagePeriodLabel()+' · '+registered+' años registrados');
    }
  }

  function parseAveragePeriodSelection(value){
    const raw=String(value==null?'':value).trim();
    if(raw==='all')return 'all';

    const year=Number(raw);
    if(!Number.isInteger(year)||year<1900||year>2200){
      throw new Error('Selecciona “Todos los años” o un año registrado.');
    }

    const info=averagePeriodMeta();
    if(!info.years.includes(year)){
      throw new Error('El año '+year+' no aparece entre los años registrados.');
    }
    return year;
  }

  async function applyAveragePeriod(){
    if(state.averageFilterLoading)return;
    const select=$('dl-average-year-select');
    if(!select)return;

    let period;
    try{
      period=parseAveragePeriodSelection(select.value);
    }catch(error){
      state.averageFilterError=error;
      renderAverageFilter();
      return;
    }

    const current=averagePeriodMeta().period;
    if(String(period)===String(current)){
      state.averageFilterError=null;
      renderAverageFilter();
      return;
    }

    state.averageFilterLoading=true;
    state.averageFilterError=null;
    renderAverageFilter();

    try{
      state.analytics=await fetchAnalytics(period);
      state.averageFilterError=null;
      renderAnalytics();
      renderAverageFilter();
    }catch(error){
      state.averageFilterError=error;
      renderAverageFilter();
    }finally{
      state.averageFilterLoading=false;
      renderAverageFilter();
    }
  }

  function bindAverageFilter(){
    const form=$('dl-average-filter-form');
    if(!form)return;
    form.onsubmit=event=>{
      event.preventDefault();
      applyAveragePeriod();
    };
  }

  function renderDepartureTable(items){
    const host=$('dl-departure-body');
    if(!host)return;
    const rows=Array.isArray(items)?items:[];
    host.innerHTML=rows.length?rows.map(row=>`<tr>
      <td><strong>${esc(row.puerto)}</strong></td>
      <td>${num(row.operaciones)}</td>
      <td><span class="dl-average-value">${esc(formatAverageDays(row.promedio_dias_salida))}</span></td>
    </tr>`).join(''):'<tr><td colspan="3" class="dl-empty">Sin pares válidos de fecha EXW y salida real</td></tr>';
    text('dl-departure-count',rows.length+' puertos · '+averagePeriodLabel());
  }

  function renderTransitTable(items){
    const host=$('dl-transit-body');
    if(!host)return;
    const rows=Array.isArray(items)?items:[];
    host.innerHTML=rows.length?rows.map(row=>`<tr>
      <td><strong>${esc(row.puerto_destino)}</strong></td>
      <td><span class="dl-chip">${esc(row.modo)}</span></td>
      <td>${num(row.operaciones)}</td>
      <td><span class="dl-average-value">${esc(formatAverageDays(row.promedio_dias_llegada))}</span></td>
    </tr>`).join(''):'<tr><td colspan="4" class="dl-empty">Sin pares válidos de salida real y llegada real</td></tr>';
    text('dl-transit-count',rows.length+' combinaciones · '+averagePeriodLabel());
  }

  function renderContainerMonths(items,year){
    const first=$('dl-containers-months-first');
    const second=$('dl-containers-months-second');
    if(!first||!second)return;
    const fallback=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const source=Array.isArray(items)?items:[];
    const byMonth=new Map(source.map(item=>[Number(item&&item.mes),item]));
    const rows=fallback.map((name,index)=>{
      const month=index+1;
      const item=byMonth.get(month)||{};
      return {
        name:String(item.mes_nombre||name),
        c20:Math.max(0,Number(item.contenedores_20_dc||0)),
        c40:Math.max(0,Number(item.contenedores_40_hq||0))
      };
    });
    const html=group=>group.map(row=>`<tr>
      <td>${esc(row.name)}</td>
      <td>${num(row.c20)}</td>
      <td>${num(row.c40)}</td>
    </tr>`).join('');
    first.innerHTML=html(rows.slice(0,6));
    second.innerHTML=html(rows.slice(6,12));
    text('dl-containers-months-period',year?'ETD '+year:'Año actual');
  }

  function renderContainersRing(data){
    const ring=$('dl-containers-ring');
    if(!ring)return;
    const c20=Math.max(0,Number(data&&data.contenedores_20_dc||0));
    const c40=Math.max(0,Number(data&&data.contenedores_40_hq||0));
    const total=c20+c40;
    const p20=total?(c20/total)*100:0;
    const p40=total?(c40/total)*100:0;
    const year=Number(data&&data.anio)||Number(state.analytics&&state.analytics.anio_actual)||0;
    ring.style.setProperty('--dl-ring-20',p20.toFixed(3)+'%');
    ring.classList.toggle('is-empty',total===0);
    ring.setAttribute('aria-label',total
      ? `Contenedores ${year}: ${num(c20)} de 20 pies DC y ${num(c40)} de 40 pies HQ`
      : `Contenedores ${year||'año actual'}: sin datos`);
    text('dl-containers-total',num(total));
    text('dl-containers-20',num(c20));
    text('dl-containers-40',num(c40));
    text('dl-containers-20-pct',total?p20.toLocaleString('es-MX',{minimumFractionDigits:1,maximumFractionDigits:1})+'%':'0.0%');
    text('dl-containers-40-pct',total?p40.toLocaleString('es-MX',{minimumFractionDigits:1,maximumFractionDigits:1})+'%':'0.0%');
    text('dl-containers-year',year?'ETD '+year:'Año actual');
    const ops=Math.max(0,Number(data&&data.operaciones_con_dato||0));
    text('dl-containers-note',total
      ? num(ops)+' operaciones del año cuentan con dato de contenedores. Conteo físico, no TEU equivalente.'
      : "Sin contenedores registrados para el año actual. Verifica que la sincronización esté poblando 20' DC y 40' HQ.");
    renderContainerMonths(data&&data.meses,year);
  }

  function renderAnalytics(){
    const analytics=state.analytics||{};
    const tables=analytics.tablas||{};
    renderAverageFilter();
    renderDepartureTable(tables.salida_por_puerto);
    renderContainersRing(analytics.contenedores||{});
    renderTransitTable(tables.llegada_por_modo_puerto);
  }

  function renderAnalyticsError(message){
    const msg=esc(message||'Analítica no disponible');
    const departure=$('dl-departure-body');
    const transit=$('dl-transit-body');
    if(departure)departure.innerHTML='<tr><td colspan="3" class="dl-empty">'+msg+'</td></tr>';
    if(transit)transit.innerHTML='<tr><td colspan="4" class="dl-empty">'+msg+'</td></tr>';
    const monthsFirst=$('dl-containers-months-first');
    const monthsSecond=$('dl-containers-months-second');
    if(monthsFirst)monthsFirst.innerHTML='<tr><td colspan="3" class="dl-empty">'+msg+'</td></tr>';
    if(monthsSecond)monthsSecond.innerHTML='<tr><td colspan="3" class="dl-empty">'+msg+'</td></tr>';
    ['dl-departure-count','dl-transit-count','dl-containers-year','dl-containers-total','dl-containers-20','dl-containers-40','dl-containers-20-pct','dl-containers-40-pct','dl-containers-months-period'].forEach(id=>text(id,'—'));
    text('dl-containers-note',message||'Analítica no disponible');
    const ring=$('dl-containers-ring');
    if(ring){ring.classList.add('is-empty');ring.style.setProperty('--dl-ring-20','0%');}
  }

  function renderCutSelector(){
    const select=$('dl-cut-select');
    if(!select)return;
    const cuts=closedCuts();
    const currentKey=state.selectedCutKey||cutKey(state.cut);

    if(!cuts.length){
      if(state.cut){
        const key=cutKey(state.cut);
        select.innerHTML='<option value="'+esc(key)+'">Semana '+esc(state.cut.semana_iso)+' / '+esc(state.cut.anio_iso)+'</option>';
        select.value=key;
        select.disabled=true;
      }else{
        select.innerHTML='<option value="">'+(state.cutCatalogError?'Historial no disponible':'Sin cortes cerrados registrados')+'</option>';
        select.disabled=true;
      }
      return;
    }

    select.innerHTML=cuts.map(cut=>{
      const key=cutKey(cut);
      const movements=Math.max(0,Number(cut&&cut.total_movimientos||0));
      return '<option value="'+esc(key)+'">Semana '+esc(cut.semana_iso)+' / '+esc(cut.anio_iso)+' · '+num(movements)+' mov.</option>';
    }).join('');

    const valid=cuts.some(cut=>cutKey(cut)===currentKey);
    select.value=valid?currentKey:cutKey(cuts[0]);
    select.disabled=state.cutLoading;
  }

  function renderMovements(){
    const host=$('dl-mov-body');
    if(!host)return;
    const mov=Array.isArray(state.movements)?state.movements:[];

    if(state.cutLoading){
      host.innerHTML='<tr><td colspan="4" class="dl-empty">Cargando corte semanal...</td></tr>';
    }else if(mov.length){
      host.innerHTML=mov.map(r=>`<tr data-id="${esc(r.id_log_ops)}"><td><span class="dl-chip">${esc(r.tipo)}</span></td><td>${esc(r.id_ppns)}</td><td><button class="dl-link">${esc(r.proyecto)}</button></td><td><span class="dl-chip" title="Anterior: ${esc(r.estatus_anterior)}">${esc(r.estatus_actual)}</span></td></tr>`).join('');
    }else{
      host.innerHTML='<tr><td colspan="4" class="dl-empty">'+(state.cutError?'No fue posible cargar el corte seleccionado':state.cut?'Sin movimientos en este corte':'Aún no existe un corte cerrado')+'</td></tr>';
    }

    const cut=state.cut;
    text('dl-mov-count',num(cut&&cut.total_movimientos!=null?cut.total_movimientos:mov.length));
    text('dl-cut-ingresos',num(cut&&cut.total_ingresos||0));
    text('dl-cut-cambios',num(cut&&cut.total_cambios_estatus||0));
    text('dl-cut-registros',num(cut&&cut.total_log_ops||0));

    if(state.cutLoading){
      text('dl-mov-subtitle','Cargando el corte seleccionado...');
    }else if(state.cutError&&cut){
      text('dl-mov-subtitle','No fue posible cargar otro corte. Se conserva Semana '+cut.semana_iso+' / '+cut.anio_iso+'.');
    }else if(cut){
      text('dl-mov-subtitle','Semana '+cut.semana_iso+' / '+cut.anio_iso+' · '+String(cut.fecha_corte||'').slice(0,16));
    }else if(state.cutError){
      text('dl-mov-subtitle','No fue posible consultar el corte semanal.');
    }else{
      text('dl-mov-subtitle','Aún no existe un corte autónomo cerrado.');
    }

    renderCutSelector();
  }

  async function loadCutByKey(key){
    if(!key||state.cutLoading||key===state.selectedCutKey)return;
    const parts=String(key).split('|');
    const anio=Number(parts[0]);
    const semana=Number(parts[1]);
    if(!Number.isInteger(anio)||!Number.isInteger(semana))return;

    const previousKey=state.selectedCutKey;
    state.cutLoading=true;
    state.cutError=null;
    renderMovements();

    try{
      const cut=await fetchCutByWeek(anio,semana);
      if(!cut)throw new Error('El corte seleccionado no existe.');
      state.cut=cut;
      state.movements=Array.isArray(cut.movimientos_json)?cut.movimientos_json:[];
      state.selectedCutKey=cutKey(cut);
      state.cutError=null;
    }catch(error){
      state.cutError=error;
      state.selectedCutKey=previousKey;
    }finally{
      state.cutLoading=false;
      renderMovements();
      bindRows();
      const select=$('dl-cut-select');
      if(select)select.value=state.selectedCutKey||cutKey(state.cut);
    }
  }

  function bindCutSelector(){
    const select=$('dl-cut-select');
    if(!select)return;
    select.onchange=()=>loadCutByKey(select.value);
  }

  function render(){
    const rows=state.rows;
    const sin=rows.filter(isSin);

    renderCharts();
    renderAnalytics();
    bindAverageFilter();

    $('dl-sin-body').innerHTML=sin.length?sin.map(r=>`<tr data-id="${r.id_log_ops}"><td><button class="dl-link">${esc(r.proyecto)}</button></td><td><span class="dl-chip">${esc(r.estatus)}</span></td><td>${esc(r.marca)}</td></tr>`).join(''):'<tr><td colspan="3" class="dl-empty">Sin proyectos pendientes de PP NS</td></tr>';
    text('dl-sin-count',sin.length+' registros');

    renderMovements();
    bindCutSelector();
    bindRows();
  }

  function openDetail(id){
    const r=state.rows.find(x=>String(x.id_log_ops)===String(id));
    if(!r)return;
    text('dl-modal-title',(r.proyecto||'Detalle')+' · '+(r.id_ppns||'—'));
    const fields=['estatus','marca','no_control','cantidad','supervisor','asesor','ict','incoterm','pago_liberacion','pago_cliente','fecha_exw','puerto_origen','fecha_salida_estimada','fecha_salida_real','puerto_destino','fecha_llegada_estimada','fecha_llegada_real','lugar_entrega','fecha_entrega_programada','fecha_entrega_real_obra','proveedor','carpeta','pvo','fecha_produccion','fecha_estimada_obra','comentarios'];
    $('dl-modal-body').innerHTML='<div class="dl-fields">'+fields.map(k=>`<div class="dl-field"><small>${esc(k.replaceAll('_',' '))}</small><b>${esc(r[k])}</b></div>`).join('')+'</div>';
    $('dl-modal').hidden=false;
  }

  function bindRows(){
    document.querySelectorAll('[data-id]').forEach(e=>e.onclick=()=>openDetail(e.dataset.id));
  }

  async function load(){
    setStatus('','Cargando Aiven...');
    try{
      const results=await Promise.all([
        fetchRows(),
        fetchLatestCut().then(data=>({data,error:null})).catch(error=>({data:null,error})),
        fetchCutCatalog().then(data=>({data,error:null})).catch(error=>({data:[],error})),
        fetchAnalytics()
      ]);
      state.rows=results[0];
      state.cut=results[1].data;
      state.cutError=results[1].error;
      state.cuts=results[2].data;
      state.cutCatalogError=results[2].error;
      state.analytics=results[3];
      state.averageFilterError=null;

      if(!state.cut){
        const first=closedCuts()[0];
        if(first){
          try{
            state.cut=await fetchCutByWeek(first.anio_iso,first.semana_iso);
            state.cutError=null;
          }catch(error){
            state.cutError=error;
          }
        }
      }

      state.selectedCutKey=cutKey(state.cut);
      state.movements=state.cut&&Array.isArray(state.cut.movimientos_json)?state.cut.movimientos_json:[];
      window.ManttoLogisticaStore={rows:state.rows,loadedAt:Date.now()};
      state.loaded=true;
      render();
      setStatus('ok','Aiven conectado · '+state.rows.length+' registros');
    }catch(e){
      state.analytics=null;
      state.averageFilterError=e;
      setStatus('error',e.message);
      renderChartsError(e.message);
      renderAnalyticsError(e.message);
    }
  }

  function init(){
    const view=$('view-logistica-dashboard');
    if(!view)return;

    // El router coloca una tarjeta temporal de "Cargando módulo".
    // Si todavía no existe la estructura real del dashboard, la sustituimos.
    if(!view.querySelector('#dl-refresh')||!view.querySelector('#dl-modal')||!view.querySelector('#dl-chart-sin-produccion')||!view.querySelector('#dl-average-year-select')||!view.querySelector('#dl-departure-body')||!view.querySelector('#dl-containers-ring')||!view.querySelector('#dl-containers-months-first')||!view.querySelector('#dl-containers-months-second')||!view.querySelector('#dl-transit-body')||!view.querySelector('#dl-cut-select')){
      view.innerHTML=HTML;
    }

    const refresh=$('dl-refresh');
    const modal=$('dl-modal');
    const modalClose=$('dl-modal-close');

    if(refresh)refresh.onclick=load;
    bindAverageFilter();
    if(modalClose&&modal)modalClose.onclick=()=>{modal.hidden=true;};
    if(modal){
      modal.onclick=e=>{if(e.target===modal)modal.hidden=true;};
    }

    state.loaded?render():load();
  }

  window.ManttoDashboardLogistica={init,reload:load};
})();
