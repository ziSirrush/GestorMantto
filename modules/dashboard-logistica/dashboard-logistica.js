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
  // [BLT NOW | 2026-10-21 | FASE 1 DASHBOARD LOGISTICA V001] Estatus anterior/nuevo y acordeón PP NS.
  // [BLT NOW | 2026-10-21 | FASE 3 DASHBOARD LOGISTICA V001] Tabla unica por ruta y contenedores por periodo.
  // [BLT NOW | 2026-10-21 | FASE 5 DASHBOARD LOGISTICA V001] Formulario y escenarios del simulador de F4.
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
    freightSubmitted:false,
    freightLoading:false,
    freightError:null,
    freightData:null,
    freightRequestId:0,
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
      <p>Promedios según salida real; contenedores según ETD. El período seleccionado se aplica a ambos apartados.</p>
    </div>
    <form id="dl-average-filter-form" class="dl-average-filter-form">
      <label for="dl-average-year-select">Buscar periodo</label>
      <div class="dl-average-filter-controls">
        <select id="dl-average-year-select" class="dl-average-year-select" aria-label="Seleccionar período de análisis de Logística">
          <option value="">Cargando periodos...</option>
        </select>
        <button id="dl-average-year-apply" class="dl-btn" type="submit">Buscar</button>
      </div>
      <small id="dl-average-year-status">Año actual</small>
    </form>
  </section>

  <section class="dl-card dl-section dl-routes-section">
    <div class="dl-section-head">
      <div>
        <h2>Promedios logísticos por ruta</h2>
        <p>Promedios reales por puerto de origen, puerto destino y modo ICT, según el año de zarpe real.</p>
      </div>
      <small id="dl-route-count">—</small>
    </div>
    <div class="dl-table-wrap" role="region" aria-label="Tabla de promedios logísticos por ruta" tabindex="0">
      <table class="dl-table dl-analytics-table dl-route-table" style="min-width:940px">
        <thead><tr>
          <th scope="col">Puerto origen</th>
          <th scope="col">Puerto destino</th>
          <th scope="col">Modo ICT</th>
          <th scope="col">Operaciones</th>
          <th scope="col">EXW → Zarpe</th>
          <th scope="col">Zarpe → Llegada</th>
          <th scope="col">EXW → Llegada</th>
        </tr></thead>
        <tbody id="dl-route-body"></tbody>
      </table>
    </div>
    <p class="dl-analytics-note">Cada tramo indica sus operaciones válidas (n). El total usa solo registros con ambos tramos completos; no suma promedios independientes.</p>
  </section>

  <section class="dl-card dl-section dl-freight-section" id="dl-freight-section" aria-labelledby="dl-freight-title">
    <div class="dl-section-head dl-freight-heading">
      <div>
        <p class="dl-eyebrow">Planeación con datos históricos</p>
        <h2 id="dl-freight-title">Simulador de Fletes</h2>
        <p>Estima EXW o zarpe → llegada a puerto → entrega en obra. Son proyecciones estadísticas, no fechas garantizadas.</p>
      </div>
      <span id="dl-freight-period" class="dl-freight-period">Período de análisis: —</span>
    </div>

    <form id="dl-freight-form" class="dl-freight-form" novalidate>
      <fieldset class="dl-freight-start">
        <legend>Iniciar simulación desde</legend>
        <label for="dl-freight-start-zarpe"><input type="radio" id="dl-freight-start-zarpe" name="dl-freight-start" value="zarpe" checked> Fecha de zarpe</label>
        <label for="dl-freight-start-exw"><input type="radio" id="dl-freight-start-exw" name="dl-freight-start" value="exw"> Fecha EXW</label>
      </fieldset>
      <div class="dl-freight-fields">
        <div class="dl-freight-field">
          <label for="dl-freight-date" id="dl-freight-date-label">Fecha de zarpe</label>
          <input id="dl-freight-date" type="date" required min="1900-01-01" max="2200-12-31">
        </div>
        <div class="dl-freight-field">
          <label for="dl-freight-origin">Puerto de origen</label>
          <input id="dl-freight-origin" type="text" list="dl-freight-origin-options" placeholder="Seleccionar o escribir puerto" maxlength="150" required autocomplete="off">
          <datalist id="dl-freight-origin-options"></datalist>
        </div>
        <div class="dl-freight-field">
          <label for="dl-freight-destination">Puerto de destino</label>
          <input id="dl-freight-destination" type="text" list="dl-freight-destination-options" placeholder="Seleccionar o escribir puerto" maxlength="150" required autocomplete="off">
          <datalist id="dl-freight-destination-options"></datalist>
        </div>
        <div class="dl-freight-field">
          <label for="dl-freight-mode">Modo ICT</label>
          <input id="dl-freight-mode" type="text" list="dl-freight-mode-options" placeholder="Seleccionar o escribir modo" maxlength="100" required autocomplete="off">
          <datalist id="dl-freight-mode-options"></datalist>
        </div>
        <div class="dl-freight-field dl-freight-field-optional">
          <label for="dl-freight-place">Lugar de entrega (opcional)</label>
          <input id="dl-freight-place" type="text" maxlength="150" placeholder="Obra específica; sin dato agrupa los destinos" autocomplete="off">
        </div>
      </div>
      <div class="dl-freight-actions">
        <button id="dl-freight-submit" class="dl-btn dl-freight-primary" type="submit">Calcular simulación</button>
        <button id="dl-freight-clear" class="dl-btn" type="reset">Limpiar</button>
      </div>
    </form>
    <p id="dl-freight-feedback" class="dl-freight-feedback" role="status" aria-live="polite">Selecciona una ruta, una fecha inicial y calcula la estimación.</p>
    <div id="dl-freight-results" hidden>
      <div id="dl-freight-summary" class="dl-freight-summary"></div>
      <div id="dl-freight-scenarios" class="dl-freight-scenarios"></div>
      <div id="dl-freight-warnings" class="dl-freight-warnings"></div>
    </div>
    <p class="dl-analytics-note">La entrega en obra contempla la espera entre llegada real a puerto y entrega real. Los escenarios P25/P75 requieren al menos 10 operaciones completas de la misma ruta y período.</p>
  </section>

  <section class="dl-card dl-section dl-container-card">
    <div class="dl-section-head">
      <div><h2>Contenedores del período</h2><p>Distribución física 20' DC vs 40' HQ según salida estimada (ETD) del período seleccionado.</p></div>
      <small id="dl-containers-year">—</small>
    </div>
    <div id="dl-containers-ring-wrap" class="dl-ring-wrap">
      <div id="dl-containers-ring" class="dl-ring" role="img" aria-label="Distribución de contenedores del período">
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
    <div class="dl-table-wrap"><table class="dl-table"><thead><tr><th>Tipo</th><th>PP NS</th><th>Proyecto</th><th>Estatus anterior</th><th>Estatus nuevo</th></tr></thead><tbody id="dl-mov-body"></tbody></table></div>
  </section>

  <section class="dl-card dl-section dl-ppns-final">
    <div class="dl-section-head">
      <div><h2>Proyectos sin PP NS</h2><p>Registros con SIN PP NS / SIN CARPETA.</p></div>
      <div class="dl-actions">
        <small id="dl-sin-count">—</small>
        <button id="dl-sin-toggle" class="dl-btn" type="button" aria-expanded="false" aria-controls="dl-sin-panel">Mostrar ▼</button>
      </div>
    </div>
    <div id="dl-sin-panel" hidden>
      <div class="dl-table-wrap"><table class="dl-table"><thead><tr><th>Proyecto</th><th>Estatus</th><th>Marca</th></tr></thead><tbody id="dl-sin-body"></tbody></table></div>
    </div>
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
    const data=j.data;
    if(!data.tablas||!Array.isArray(data.tablas.promedios_por_ruta)||!data.contenedores_periodo||!Array.isArray(data.contenedores_periodo.meses)||!data.promedios||String(data.contenedores_periodo.periodo)!==String(data.promedios.periodo)){
      throw new Error('Dashboard: se requiere Backend Fase 2 (rutas y contenedores por período).');
    }
    return data;
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
    // Un NULL sin muestra no representa cero días. Cero real sí es válido.
    if(value===null||value===undefined||value==='')return '—';
    const n=Number(value);
    if(!Number.isFinite(n)||n<0)return '—';
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
    if(state.freightSubmitted)invalidateFreightResult('Actualizando período; se recalculará la estimación...');
    renderAverageFilter();

    try{
      state.analytics=await fetchAnalytics(period);
      state.averageFilterError=null;
      renderAnalytics();
      renderFreightSuggestions();
      if(state.freightSubmitted)void runFreightSimulation();
      renderAverageFilter();
    }catch(error){
      state.averageFilterError=error;
      if(state.freightSubmitted)void runFreightSimulation();
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

  // FASE 5: el frontend solo envia criterios y presenta los escenarios del backend F4.
  // Nunca calcula percentiles ni inventa dias de traslado en el cliente.
  function freightDateDisplay(value){
    const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    return match?match[3]+'/'+match[2]+'/'+match[1]:'—';
  }

  function freightDayDisplay(value){
    if(value===null||value===undefined||value==='')return '—';
    const n=Number(value);
    return Number.isFinite(n)&&n>=0?n.toLocaleString('es-MX',{minimumFractionDigits:1,maximumFractionDigits:1})+' días':'—';
  }

  function freightStartKind(){
    return $('dl-freight-start-exw')&&$('dl-freight-start-exw').checked?'exw':'zarpe';
  }

  function renderFreightStartLabel(){
    text('dl-freight-date-label',freightStartKind()==='exw'?'Fecha EXW':'Fecha de zarpe');
  }

  function freightFields(){
    const value=id=>String($(id)&&$(id).value||'').trim();
    const kind=freightStartKind();
    const data={
      puerto_origen:value('dl-freight-origin'),
      puerto_destino:value('dl-freight-destination'),
      ict:value('dl-freight-mode'),
      lugar_entrega:value('dl-freight-place'),
      fecha_inicial:value('dl-freight-date'),
      tipo:kind
    };
    return data;
  }

  function freightValidInput(fields){
    for(const [key,label,max] of [
      ['puerto_origen','puerto de origen',150],
      ['puerto_destino','puerto de destino',150],
      ['ict','modo ICT',100]
    ]){
      if(!fields[key])throw new Error('Indica '+label+'.');
      if(fields[key].length>max||/[\u0000-\u001f\u007f]/.test(fields[key]))throw new Error('Dato no válido: '+label+'.');
    }
    if(fields.lugar_entrega.length>150||/[\u0000-\u001f\u007f]/.test(fields.lugar_entrega))throw new Error('Lugar de entrega no válido.');
    const date=fields.fecha_inicial;
    const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if(!match)throw new Error('Indica una fecha válida (DD/MM/AAAA).');
    const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
    if(year<1900||year>2200||month<1||month>12||day<1||day>31)throw new Error('La fecha está fuera del rango válido.');
    const actual=new Date(Date.UTC(year,month-1,day));
    if(actual.getUTCFullYear()!==year||actual.getUTCMonth()!==month-1||actual.getUTCDate()!==day)throw new Error('La fecha ingresada no existe.');
    return fields;
  }

  function freightPeriod(){
    const meta=averagePeriodMeta();
    const period=meta.period;
    if(period!=='all'&&(!Number.isInteger(Number(period))||Number(period)<1900))return null;
    return period;
  }

  function renderFreightPeriod(){
    text('dl-freight-period','Histórico de zarpe: '+averagePeriodLabel());
  }

  function freightOptions(values,id){
    const host=$(id);
    if(!host)return;
    const distinct=new Map();
    for(const value of values){
      const str=String(value||'').trim();
      if(str&&!distinct.has(norm(str)))distinct.set(norm(str),str);
    }
    host.innerHTML=[...distinct.values()].sort((a,b)=>a.localeCompare(b,'es')).map(value=>'<option value="'+esc(value)+'"></option>').join('');
  }

  function renderFreightSuggestions(){
    const routes=state.analytics&&state.analytics.tablas&&Array.isArray(state.analytics.tablas.promedios_por_ruta)
      ?state.analytics.tablas.promedios_por_ruta:[];
    const origin=String($('dl-freight-origin')&&$('dl-freight-origin').value||'').trim();
    const destination=String($('dl-freight-destination')&&$('dl-freight-destination').value||'').trim();
    const same=(a,b)=>norm(a)===norm(b);
    freightOptions(routes.map(row=>row.puerto_origen),'dl-freight-origin-options');
    const byOrigin=origin?routes.filter(row=>same(row.puerto_origen,origin)):routes;
    freightOptions(byOrigin.map(row=>row.puerto_destino),'dl-freight-destination-options');
    const byDestination=destination?byOrigin.filter(row=>same(row.puerto_destino,destination)):byOrigin;
    freightOptions(byDestination.map(row=>row.modo),'dl-freight-mode-options');
    renderFreightPeriod();
  }

  function freightScenarioCard(key,scenario,samples,startKind){
    const labels={optimista:['Optimista','P25'],promedio:['Promedio','Media histórica'],conservador:['Conservador','P75']};
    const pair=labels[key];
    if(!scenario){
      const message=samples===0?'Sin operaciones completas':'Requiere al menos 10 operaciones completas';
      return '<article class="dl-freight-scenario dl-freight-unavailable"><div class="dl-freight-scenario-head"><h4>'+pair[0]+'</h4><span>'+pair[1]+'</span></div><p>'+message+'</p></article>';
    }
    const f=scenario.fechas||{};
    const d=scenario.dias_etapas||{};
    const stages=startKind==='exw'
      ?[['EXW',f.exw],['Zarpe',f.zarpe],['Llegada a puerto',f.llegada_puerto],['Entrega en obra',f.llegada_obra]]
      :[['Zarpe',f.zarpe],['Llegada a puerto',f.llegada_puerto],['Entrega en obra',f.llegada_obra]];
    const stageHTML=stages.map((entry,index)=>'<li class="dl-freight-stage"><small>Paso '+(index+1)+' · '+esc(entry[0])+'</small><strong>'+esc(freightDateDisplay(entry[1]))+'</strong></li>').join('');
    const durations=(startKind==='exw'?[['EXW → Zarpe',d.exw_zarpe]]:[]).concat([
      ['Zarpe → Puerto',d.zarpe_puerto],['Puerto → Obra',d.puerto_obra],['Total desde inicio',d.total]
    ]);
    const durationHTML=durations.map(row=>'<span><small>'+esc(row[0])+'</small> <strong>'+esc(freightDayDisplay(row[1]))+'</strong></span>').join('');
    return '<article class="dl-freight-scenario"><div class="dl-freight-scenario-head"><h4>'+pair[0]+'</h4><span>'+esc(scenario.metodo||pair[1])+'</span></div>'+
      '<p class="dl-freight-delivery">Obra estimada: <strong>'+esc(freightDateDisplay(f.llegada_obra))+'</strong></p>'+
      '<ol class="dl-freight-timeline">'+stageHTML+'</ol>'+
      '<div class="dl-freight-durations">'+durationHTML+'</div></article>';
  }

  function renderFreightResult(){
    const panel=$('dl-freight-results');
    const summary=$('dl-freight-summary');
    const scenarios=$('dl-freight-scenarios');
    const warnings=$('dl-freight-warnings');
    if(!panel||!summary||!scenarios||!warnings)return;
    const data=state.freightData;
    panel.hidden=!data||!!state.freightError;
    if(!data){summary.innerHTML='';scenarios.innerHTML='';warnings.innerHTML='';return;}
    const sample=Math.max(0,Number(data.muestra&&data.muestra.operaciones_completas)||0);
    const route=data.ruta||{};
    const place=route.lugar_entrega?' · Obra: '+route.lugar_entrega:'';
    const label=data.periodo==='all'?'Todos los años':String(data.periodo);
    summary.innerHTML='<strong>'+esc(route.puerto_origen)+' → '+esc(route.puerto_destino)+'</strong>'+
      '<span>ICT: '+esc(route.ict)+esc(place)+' · Histórico de zarpe: '+esc(label)+'</span>'+
      '<span>'+num(sample)+' operaciones completas para estimar</span>';
    if(data.estado==='sin_datos'){
      scenarios.innerHTML='<p class="dl-freight-no-data">No hay operaciones históricas completas para esta ruta y período. No se calcularon fechas estimadas.</p>';
    }else{
      const startKind=data.inicio&&data.inicio.tipo==='EXW'?'exw':'zarpe';
      scenarios.innerHTML=['optimista','promedio','conservador'].map(key=>freightScenarioCard(key,data.escenarios&&data.escenarios[key],sample,startKind)).join('');
    }
    const notes=Array.isArray(data.advertencias)?data.advertencias:[];
    warnings.innerHTML=notes.length?'<h4>Consideraciones del cálculo</h4><ul>'+notes.map(note=>'<li>'+esc(note)+'</li>').join('')+'</ul>':'';
  }

  function invalidateFreightResult(message){
    state.freightRequestId+=1;
    state.freightLoading=false;
    state.freightError=null;
    state.freightData=null;
    const button=$('dl-freight-submit');
    if(button)button.disabled=false;
    const node=$('dl-freight-feedback');
    if(node){node.textContent=message||'Pulsa Calcular simulación para obtener nuevas fechas.';node.className='dl-freight-feedback';}
    renderFreightResult();
  }

  function freightPayload(fields,period){
    const pairs=[['puerto_origen',fields.puerto_origen],['puerto_destino',fields.puerto_destino],['ict',fields.ict],
      [fields.tipo==='exw'?'fecha_exw':'fecha_zarpe',fields.fecha_inicial],['anio_promedios',String(period)]];
    if(fields.lugar_entrega)pairs.push(['lugar_entrega',fields.lugar_entrega]);
    return pairs.map(([key,value])=>encodeURIComponent(key)+'='+encodeURIComponent(value)).join('&');
  }

  async function fetchFreightSimulation(fields,period){
    const url=api()+'/api/logistica/dashboard/simulacion?'+freightPayload(fields,period);
    const response=await fetch(url,{headers:authHeaders(),cache:'no-store'});
    const raw=await response.text();
    let json=null;
    try{json=raw?JSON.parse(raw):null;}catch(_error){/* old backend or HTML error */}
    if(response.status===404||response.status===405){throw new Error('Simulador no disponible: requiere Backend Fase 4.');}
    if(!response.ok||!json||json.ok!==true){throw new Error(json&&String(json.message||json.error||'')||'No fue posible consultar el simulador.');}
    const data=json.data;
    if(!data||!data.ruta||!data.muestra||!data.escenarios||!data.inicio||!['estimacion','sin_datos'].includes(data.estado)){
      throw new Error('Contrato de simulación no disponible: se requiere Backend Fase 4.');
    }
    if(String(data.periodo)!==String(period))throw new Error('El resultado no coincide con el período de análisis seleccionado.');
    return data;
  }

  async function runFreightSimulation(){
    const run=++state.freightRequestId;
    let fields,period;
    try{
      fields=freightValidInput(freightFields());
      period=freightPeriod();
      if(period===null)throw new Error('Selecciona primero un período de análisis válido.');
    }catch(error){
      state.freightLoading=false;
      state.freightError=error;
      state.freightData=null;
      const node=$('dl-freight-feedback');
      if(node){node.textContent=error.message;node.className='dl-freight-feedback is-error';}
      renderFreightResult();
      return;
    }
    state.freightSubmitted=true;
    state.freightLoading=true;
    state.freightData=null;
    state.freightError=null;
    const node=$('dl-freight-feedback');
    const button=$('dl-freight-submit');
    if(node){node.textContent='Calculando con las operaciones de '+(period==='all'?'todos los años':period)+'...';node.className='dl-freight-feedback';}
    if(button)button.disabled=true;
    renderFreightResult();
    try{
      const data=await fetchFreightSimulation(fields,period);
      if(run!==state.freightRequestId||String(freightPeriod())!==String(period))return;
      state.freightData=data;
      state.freightError=null;
      if(node){node.textContent=data.estado==='sin_datos'?'Sin datos históricos completos para este criterio.':'Estimación calculada con '+num(data.muestra.operaciones_completas)+' operaciones completas.';node.className='dl-freight-feedback'+(data.estado==='sin_datos'?' is-warn':' is-ok');}
      renderFreightResult();
    }catch(error){
      if(run!==state.freightRequestId)return;
      state.freightError=error;
      state.freightData=null;
      if(node){node.textContent=error.message;node.className='dl-freight-feedback is-error';}
      renderFreightResult();
    }finally{
      if(run===state.freightRequestId){state.freightLoading=false;if(button)button.disabled=false;}
    }
  }

  function bindFreightSimulator(){
    const form=$('dl-freight-form');
    if(!form)return;
    form.onsubmit=event=>{event.preventDefault();void runFreightSimulation();};
    form.onreset=()=>{
      // El navegador restablece el formulario después del evento reset.
      state.freightSubmitted=false;
      invalidateFreightResult('Formulario limpio. Introduce los datos para simular.');
      // El restablecimiento nativo sucede despues del evento reset.
      // Actualiza sugerencias cuando los campos ya recuperaron su valor inicial.
      Promise.resolve().then(()=>{
        renderFreightStartLabel();
        renderFreightSuggestions();
      });
    };
    for(const id of ['dl-freight-date','dl-freight-origin','dl-freight-destination','dl-freight-mode','dl-freight-place']){
      const item=$(id);
      if(!item)continue;
      item.oninput=()=>{
        state.freightSubmitted=false;
        invalidateFreightResult('Datos modificados. Pulsa Calcular simulación para actualizar.');
        if(id==='dl-freight-origin'||id==='dl-freight-destination')renderFreightSuggestions();
      };
    }
    for(const id of ['dl-freight-start-zarpe','dl-freight-start-exw']){
      const radio=$(id);
      if(!radio)continue;
      radio.onchange=()=>{
        renderFreightStartLabel();
        state.freightSubmitted=false;
        invalidateFreightResult('Fecha inicial modificada. Calcula de nuevo.');
      };
    }
    renderFreightStartLabel();
    renderFreightSuggestions();
  }

  function renderRouteAverageCell(value,sample){
    const count=Math.max(0,Number(sample)||0);
    const formatted=count>0?formatAverageDays(value):'—';
    return '<span class="dl-average-value">'+esc(formatted)+'</span><br><small>n='+num(count)+'</small>';
  }

  function renderRouteTable(items){
    const host=$('dl-route-body');
    if(!host)return;
    const rows=Array.isArray(items)?items:[];
    host.innerHTML=rows.length?rows.map(row=>`<tr>
      <td><strong>${esc(row.puerto_origen)}</strong></td>
      <td>${esc(row.puerto_destino)}</td>
      <td><span class="dl-chip">${esc(row.modo)}</span></td>
      <td>${num(row.operaciones)}</td>
      <td>${renderRouteAverageCell(row.promedio_dias_salida,row.operaciones_salida)}</td>
      <td>${renderRouteAverageCell(row.promedio_dias_llegada,row.operaciones_transito)}</td>
      <td>${renderRouteAverageCell(row.promedio_dias_total,row.operaciones_completas)}</td>
    </tr>`).join(''):'<tr><td colspan="7" class="dl-empty">Sin rutas con operaciones válidas en este período</td></tr>';
    text('dl-route-count',rows.length+' rutas · '+averagePeriodLabel());
  }

  function renderContainerMonths(items,periodLabel){
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
    text('dl-containers-months-period',periodLabel||'ETD del período');
  }

  function renderContainersRing(data){
    const ring=$('dl-containers-ring');
    if(!ring)return;
    const c20=Math.max(0,Number(data&&data.contenedores_20_dc||0));
    const c40=Math.max(0,Number(data&&data.contenedores_40_hq||0));
    const total=c20+c40;
    const p20=total?(c20/total)*100:0;
    const p40=total?(c40/total)*100:0;
    const period=data&&data.periodo==='all'?'all':Number(data&&data.periodo)||Number(state.analytics&&state.analytics.anio_actual)||0;
    const label=data&&data.etiqueta?String(data.etiqueta):(period==='all'?'Todos los años (ETD)':'ETD '+period);
    ring.style.setProperty('--dl-ring-20',p20.toFixed(3)+'%');
    ring.classList.toggle('is-empty',total===0);
    ring.setAttribute('aria-label',total
      ? `Contenedores ${label}: ${num(c20)} de 20 pies DC y ${num(c40)} de 40 pies HQ`
      : `Contenedores ${label}: sin datos`);
    text('dl-containers-total',num(total));
    text('dl-containers-20',num(c20));
    text('dl-containers-40',num(c40));
    text('dl-containers-20-pct',total?p20.toLocaleString('es-MX',{minimumFractionDigits:1,maximumFractionDigits:1})+'%':'0.0%');
    text('dl-containers-40-pct',total?p40.toLocaleString('es-MX',{minimumFractionDigits:1,maximumFractionDigits:1})+'%':'0.0%');
    text('dl-containers-year',label);
    const ops=Math.max(0,Number(data&&data.operaciones_con_dato||0));
    text('dl-containers-note',total
      ? num(ops)+' operaciones del período cuentan con dato de contenedores. Conteo físico, no TEU equivalente.'
      : 'Sin contenedores registrados para '+label+'. Verifica los datos de ETD y contenedores.');
    renderContainerMonths(data&&data.meses,label);
  }

  function renderAnalytics(){
    const analytics=state.analytics||{};
    const tables=analytics.tablas||{};
    renderAverageFilter();
    renderRouteTable(tables.promedios_por_ruta);
    renderContainersRing(analytics.contenedores_periodo||{});
    renderFreightSuggestions();
  }

  function renderAnalyticsError(message){
    const msg=esc(message||'Analítica no disponible');
    const routes=$('dl-route-body');
    if(routes)routes.innerHTML='<tr><td colspan="7" class="dl-empty">'+msg+'</td></tr>';
    const monthsFirst=$('dl-containers-months-first');
    const monthsSecond=$('dl-containers-months-second');
    if(monthsFirst)monthsFirst.innerHTML='<tr><td colspan="3" class="dl-empty">'+msg+'</td></tr>';
    if(monthsSecond)monthsSecond.innerHTML='<tr><td colspan="3" class="dl-empty">'+msg+'</td></tr>';
    ['dl-route-count','dl-containers-year','dl-containers-total','dl-containers-20','dl-containers-40','dl-containers-20-pct','dl-containers-40-pct','dl-containers-months-period'].forEach(id=>text(id,'—'));
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
      host.innerHTML='<tr><td colspan="5" class="dl-empty">Cargando corte semanal...</td></tr>';
    }else if(mov.length){
      host.innerHTML=mov.map(r=>`<tr data-id="${esc(r.id_log_ops)}"><td><span class="dl-chip">${esc(r.tipo)}</span></td><td>${esc(r.id_ppns)}</td><td><button class="dl-link">${esc(r.proyecto)}</button></td><td><span class="dl-chip">${esc(r.estatus_anterior)}</span></td><td><span class="dl-chip">${esc(r.estatus_actual)}</span></td></tr>`).join('');
    }else{
      host.innerHTML='<tr><td colspan="5" class="dl-empty">'+(state.cutError?'No fue posible cargar el corte seleccionado':state.cut?'Sin movimientos en este corte':'Aún no existe un corte cerrado')+'</td></tr>';
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

  // FASE 1: panel plegable; no altera la consulta ni el conteo de PP NS.
  function bindSinAccordion(){
    const toggle=$('dl-sin-toggle');
    const panel=$('dl-sin-panel');
    if(!toggle||!panel)return;
    const setOpen=open=>{
      panel.hidden=!open;
      toggle.setAttribute('aria-expanded',String(open));
      toggle.textContent=open?'Ocultar ▲':'Mostrar ▼';
    };
    toggle.onclick=()=>setOpen(panel.hidden);
    const header=toggle.closest('.dl-section-head');
    if(header){
      header.style.cursor='pointer';
      header.onclick=event=>{
        if(event.target.closest('button'))return;
        toggle.click();
      };
    }
    setOpen(!panel.hidden);
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
    if(state.freightSubmitted)invalidateFreightResult('Actualizando datos; se recalculará la simulación...');
    setStatus('','Cargando Aiven...');
    try{
      const results=await Promise.all([
        fetchRows(),
        fetchLatestCut().then(data=>({data,error:null})).catch(error=>({data:null,error})),
        fetchCutCatalog().then(data=>({data,error:null})).catch(error=>({data:[],error})),
        fetchAnalytics(state.analytics&&state.analytics.promedios?state.analytics.promedios.periodo:undefined)
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
      if(state.freightSubmitted)void runFreightSimulation();
      setStatus('ok','Aiven conectado · '+state.rows.length+' registros');
    }catch(e){
      state.analytics=null;
      state.averageFilterError=e;
      setStatus('error',e.message);
      renderChartsError(e.message);
      renderAnalyticsError(e.message);
      if(state.freightSubmitted)invalidateFreightResult('No fue posible actualizar los promedios. Reintenta al actualizar el Dashboard.');
    }
  }

  function init(){
    const view=$('view-logistica-dashboard');
    if(!view)return;

    // El router coloca una tarjeta temporal de "Cargando módulo".
    // Si todavía no existe la estructura real del dashboard, la sustituimos.
    if(!view.querySelector('#dl-refresh')||!view.querySelector('#dl-modal')||!view.querySelector('#dl-chart-sin-produccion')||!view.querySelector('#dl-average-year-select')||!view.querySelector('#dl-route-body')||!view.querySelector('#dl-containers-ring')||!view.querySelector('#dl-containers-months-first')||!view.querySelector('#dl-containers-months-second')||!view.querySelector('#dl-cut-select')||!view.querySelector('#dl-sin-toggle')||!view.querySelector('#dl-sin-panel')||!view.querySelector('#dl-freight-form')||!view.querySelector('#dl-freight-results')){
      view.innerHTML=HTML;
    }

    const refresh=$('dl-refresh');
    const modal=$('dl-modal');
    const modalClose=$('dl-modal-close');

    if(refresh)refresh.onclick=load;
    bindAverageFilter();
    bindSinAccordion();
    bindFreightSimulator();
    if(modalClose&&modal)modalClose.onclick=()=>{modal.hidden=true;};
    if(modal){
      modal.onclick=e=>{if(e.target===modal)modal.hidden=true;};
    }

    state.loaded?render():load();
  }

  window.ManttoDashboardLogistica={init,reload:load};
})();
