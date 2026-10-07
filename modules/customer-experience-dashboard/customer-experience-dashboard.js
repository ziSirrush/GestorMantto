// [Aster | 2026-10-07 | ASTER-MG | FASE 1 CUSTOMER EXPERIENCE DASHBOARD V001]
(function(){
  'use strict';

  if(window.ManttoCustomerExperienceDashboard) return;

  const state = {
    opciones:null,
    area:'ambas',
    filtrosVi:{},
    filtrosMt:{}
  };

  function byId(id){ return document.getElementById(id); }
  function safe(value){
    return String(value === null || value === undefined || value === '' ? '—' : value)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }
  function metric(value){ return value === null || value === undefined ? '—' : safe(value); }
  function percent(part,total){ return total ? Math.round(100 * Number(part || 0) / total) : 0; }

  async function fetchJson(path){
    if(window.ManttoAuth && typeof window.ManttoAuth.api === 'function'){
      return window.ManttoAuth.api(path,{method:'GET'});
    }
    const base=(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
    const headers=Object.assign({'Accept':'application/json'},window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{});
    const response=await fetch(base+path,{headers});
    const data=await response.json().catch(()=>({ok:false,message:'Respuesta invalida del backend'}));
    if(!response.ok||data.ok===false) throw new Error(data.message||data.error||'No fue posible consultar Customer Experience.');
    return data;
  }

  function shellHtml(){
    return '<div class="cxd-page">' +
      '<section class="cxd-card cxd-head">' +
        '<div><p class="cxd-eyebrow">Customer Experience</p><h1>Dashboard CX</h1><p>Indicadores de Venta / Instalaciones y Mantenimiento.</p></div>' +
      '</section>' +
      '<section class="cxd-card cxd-filter-card">' +
        '<div class="cxd-filter-grid">' +
          '<label class="cxd-field"><span>Area</span><select id="cxd-area"><option value="ambas">Ambas areas</option><option value="venta_instalacion">Venta / Instalaciones</option><option value="mantenimiento">Mantenimiento</option></select></label>' +
          '<div id="cxd-vi-filters" class="cxd-filter-group"></div>' +
          '<div id="cxd-mt-filters" class="cxd-filter-group"></div>' +
        '</div>' +
        '<div class="cxd-actions"><button id="cxd-clear" class="cxd-button" type="button">Limpiar filtros</button></div>' +
      '</section>' +
      '<div id="cxd-result"><div class="cxd-status">Cargando datos...</div></div>' +
    '</div>';
  }

  function selectHtml(id,label,options,current){
    const list='<option value="">Todos</option>'+(options||[]).map(value=>{
      const selected=String(value)===String(current||'')?' selected':'';
      return '<option value="'+safe(value)+'"'+selected+'>'+safe(value)+'</option>';
    }).join('');
    return '<label class="cxd-field"><span>'+safe(label)+'</span><select id="'+id+'">'+list+'</select></label>';
  }

  function bindSelect(id,key,bucket){
    const node=byId(id);
    if(!node) return;
    node.addEventListener('change',()=>{
      bucket[key]=node.value;
      loadDashboard();
    });
  }

  function renderSubfilters(){
    const vi=byId('cxd-vi-filters');
    const mt=byId('cxd-mt-filters');
    if(!vi||!mt||!state.opciones) return;

    const showVi=state.area==='ambas'||state.area==='venta_instalacion';
    const showMt=state.area==='ambas'||state.area==='mantenimiento';

    vi.hidden=!showVi;
    mt.hidden=!showMt;

    if(showVi){
      const options=state.opciones.venta_instalacion||{};
      vi.innerHTML=
        selectHtml('cxd-vi-tipo','Tipo de encuesta',options.tipos_encuesta,state.filtrosVi.tipo_encuesta)+
        selectHtml('cxd-vi-vendedor','Vendedor',options.vendedores,state.filtrosVi.vendedor)+
        selectHtml('cxd-vi-supervisor','Supervisor',options.supervisores,state.filtrosVi.supervisor);
      bindSelect('cxd-vi-tipo','tipo_encuesta',state.filtrosVi);
      bindSelect('cxd-vi-vendedor','vendedor',state.filtrosVi);
      bindSelect('cxd-vi-supervisor','supervisor',state.filtrosVi);
    }else{
      vi.innerHTML='';
    }

    if(showMt){
      const options=state.opciones.mantenimiento||{};
      mt.innerHTML=
        selectHtml('cxd-mt-estado','Estado',options.estados,state.filtrosMt.estado)+
        selectHtml('cxd-mt-zona','Zona general',options.zonas_generales,state.filtrosMt.z_general)+
        selectHtml('cxd-mt-superintendente','Superintendente',options.superintendentes,state.filtrosMt.superintendente)+
        selectHtml('cxd-mt-supervisor','Supervisor operativo',options.supervisores_operativos,state.filtrosMt.supervisor_operativo)+
        selectHtml('cxd-mt-categoria','Categoria',options.categorias,state.filtrosMt.categoria)+
        selectHtml('cxd-mt-prioridad','Prioridad',options.prioridades,state.filtrosMt.prioridad);
      bindSelect('cxd-mt-estado','estado',state.filtrosMt);
      bindSelect('cxd-mt-zona','z_general',state.filtrosMt);
      bindSelect('cxd-mt-superintendente','superintendente',state.filtrosMt);
      bindSelect('cxd-mt-supervisor','supervisor_operativo',state.filtrosMt);
      bindSelect('cxd-mt-categoria','categoria',state.filtrosMt);
      bindSelect('cxd-mt-prioridad','prioridad',state.filtrosMt);
    }else{
      mt.innerHTML='';
    }
  }

  function npsBar(classification,total){
    const values=classification||{};
    const promotor=Number(values.PROMOTOR||0);
    const pasivo=Number(values.PASIVO||0);
    const detractor=Number(values.DETRACTOR||0);
    return '<div class="cxd-nps-bar" aria-label="Distribucion NPS">'+
      '<span class="cxd-nps-seg cxd-promotor" style="width:'+percent(promotor,total)+'%" title="Promotor: '+promotor+'"></span>'+
      '<span class="cxd-nps-seg cxd-pasivo" style="width:'+percent(pasivo,total)+'%" title="Pasivo: '+pasivo+'"></span>'+
      '<span class="cxd-nps-seg cxd-detractor" style="width:'+percent(detractor,total)+'%" title="Detractor: '+detractor+'"></span>'+
      '</div>'+
      '<div class="cxd-nps-legend"><span class="cxd-promotor-text">Promotor '+promotor+'</span><span class="cxd-pasivo-text">Pasivo '+pasivo+'</span><span class="cxd-detractor-text">Detractor '+detractor+'</span></div>';
  }

  function tableHtml(headers,rows){
    if(!rows||!rows.length) return '<div class="cxd-empty">Sin datos con estos filtros.</div>';
    return '<div class="cxd-table-wrap"><table class="cxd-table"><thead><tr>'+headers.map(header=>'<th>'+safe(header)+'</th>').join('')+'</tr></thead><tbody>'+
      rows.map(row=>'<tr>'+row.map(cell=>'<td>'+safe(cell)+'</td>').join('')+'</tr>').join('')+
      '</tbody></table></div>';
  }

  function renderVentaInstalacion(data){
    const source=data||{};
    const total=Number(source.total||0);
    const byType=(source.por_tipo_encuesta||[]).map(item=>[item.tipo_encuesta,item.total,metric(item.nps_promedio)]);
    const bySeller=(source.por_vendedor||[]).map(item=>[item.vendedor,item.total,metric(item.nps_promedio)]);
    return '<section class="cxd-area">'+
      '<h2>Venta / Instalaciones</h2>'+
      '<div class="cxd-grid cxd-grid-kpi">'+
        '<article class="cxd-card"><p class="cxd-kpi-label">Encuestas</p><p class="cxd-kpi-value">'+total+'</p></article>'+
        '<article class="cxd-card"><p class="cxd-kpi-label">NPS promedio</p><p class="cxd-kpi-value">'+metric(source.nps_promedio)+'</p></article>'+
        '<article class="cxd-card cxd-span-2"><p class="cxd-kpi-label">Clasificacion NPS</p>'+npsBar(source.clasificacion,total)+'</article>'+
      '</div>'+
      '<div class="cxd-grid">'+
        '<article class="cxd-card"><h3>Por tipo de encuesta</h3>'+tableHtml(['Tipo','Encuestas','NPS prom.'],byType)+'</article>'+
        '<article class="cxd-card"><h3>Por vendedor</h3>'+tableHtml(['Vendedor','Encuestas','NPS prom.'],bySeller)+'</article>'+
      '</div>'+
    '</section>';
  }

  function renderCsat(data){
    const rows=[
      ['Mantenimiento preventivo',data.mantenimiento],
      ['Atencion de fallas',data.atencion_fallas],
      ['Seguimiento de supervisor',data.seguimiento_supervisor],
      ['Cotizaciones / suministros / reparaciones',data.cotizaciones],
      ['Facturacion',data.facturacion],
      ['Atencion al cliente',data.atencion_cliente]
    ];
    return rows.map(([label,value])=>{
      const numeric=Number(value);
      const width=Number.isFinite(numeric)?Math.max(0,Math.min(100,Math.round(numeric*20))):0;
      return '<div class="cxd-bar-row"><div class="cxd-bar-label"><span>'+safe(label)+'</span><b>'+metric(value)+' / 5</b></div><div class="cxd-bar-track"><span class="cxd-bar-fill" style="width:'+width+'%"></span></div></div>';
    }).join('');
  }

  function renderMantenimiento(data){
    const source=data||{};
    const total=Number(source.total||0);
    const csat=source.csat||{};
    const byState=(source.por_estado||[]).map(item=>[item.estado,item.total,metric(item.nps_promedio)]);
    const bySuper=(source.por_superintendente||[]).map(item=>[item.superintendente,item.total,metric(item.nps_promedio)]);
    return '<section class="cxd-area">'+
      '<h2>Mantenimiento</h2>'+
      '<div class="cxd-grid cxd-grid-kpi">'+
        '<article class="cxd-card"><p class="cxd-kpi-label">Encuestas</p><p class="cxd-kpi-value">'+total+'</p></article>'+
        '<article class="cxd-card"><p class="cxd-kpi-label">NPS promedio</p><p class="cxd-kpi-value">'+metric(source.nps_promedio)+'</p></article>'+
        '<article class="cxd-card cxd-span-2"><p class="cxd-kpi-label">Clasificacion NPS</p>'+npsBar(source.clasificacion,total)+'</article>'+
      '</div>'+
      '<div class="cxd-grid cxd-grid-kpi">'+
        '<article class="cxd-card"><p class="cxd-kpi-label">Indice de confianza</p><p class="cxd-kpi-value">'+metric(source.indice_confianza)+' <small>/ 5</small></p></article>'+
        '<article class="cxd-card"><p class="cxd-kpi-label">Percepcion de valor</p><p class="cxd-kpi-value">'+metric(source.percepcion_valor)+' <small>/ 5</small></p></article>'+
        '<article class="cxd-card"><p class="cxd-kpi-label">CSAT general</p><p class="cxd-kpi-value">'+metric(csat.general)+' <small>/ 5</small></p></article>'+
        '<article class="cxd-card"><p class="cxd-kpi-label">Riesgo cambio proveedor</p><p class="cxd-kpi-value">'+metric(source.indice_riesgo_churn)+'</p></article>'+
      '</div>'+
      '<article class="cxd-card"><h3>CSAT por componente del servicio</h3>'+renderCsat(csat)+'</article>'+
      '<div class="cxd-grid">'+
        '<article class="cxd-card"><h3>Por estado</h3>'+tableHtml(['Estado','Encuestas','NPS prom.'],byState)+'</article>'+
        '<article class="cxd-card"><h3>Por superintendente</h3>'+tableHtml(['Superintendente','Encuestas','NPS prom.'],bySuper)+'</article>'+
      '</div>'+
    '</section>';
  }

  function queryString(){
    const params=new URLSearchParams();
    params.set('area',state.area);
    Object.entries(state.filtrosVi).forEach(([key,value])=>{ if(value) params.set(key,value); });
    Object.entries(state.filtrosMt).forEach(([key,value])=>{ if(value) params.set(key,value); });
    return params.toString();
  }

  async function loadDashboard(){
    const result=byId('cxd-result');
    if(!result) return;
    result.innerHTML='<div class="cxd-status">Cargando datos...</div>';
    try{
      const data=await fetchJson('/api/customer-experience/dashboard?'+queryString());
      let html='';
      if(data.venta_instalacion) html+=renderVentaInstalacion(data.venta_instalacion);
      if(data.mantenimiento) html+=renderMantenimiento(data.mantenimiento);
      result.innerHTML=html||'<div class="cxd-status">Sin datos disponibles.</div>';
    }catch(error){
      result.innerHTML='<div class="cxd-status cxd-error"><strong>No fue posible consultar Dashboard CX.</strong><span>'+safe(error&&error.message?error.message:'Error desconocido')+'</span></div>';
    }
  }

  function clearFilters(){
    state.filtrosVi={};
    state.filtrosMt={};
    renderSubfilters();
    loadDashboard();
  }

  async function init(){
    const view=byId('view-placeholder');
    if(!view) return false;
    view.innerHTML=shellHtml();

    const subtitle=byId('app-context-subtitle');
    if(subtitle) subtitle.textContent='Customer Experience · indicadores desde Aiven';

    const area=byId('cxd-area');
    if(area){
      area.value=state.area;
      area.addEventListener('change',()=>{
        state.area=area.value;
        renderSubfilters();
        loadDashboard();
      });
    }
    const clear=byId('cxd-clear');
    if(clear) clear.addEventListener('click',clearFilters);

    try{
      const options=await fetchJson('/api/customer-experience/opciones');
      state.opciones=options.data||{venta_instalacion:{},mantenimiento:{}};
      renderSubfilters();
      await loadDashboard();
      return true;
    }catch(error){
      const result=byId('cxd-result');
      if(result){
        result.innerHTML='<div class="cxd-status cxd-error"><strong>No fue posible cargar Customer Experience.</strong><span>'+safe(error&&error.message?error.message:'Error desconocido')+'</span></div>';
      }
      return false;
    }
  }

  window.ManttoCustomerExperienceDashboard=Object.freeze({init});
})();
