// [Aster | 2026-10-07 | ASTER-MG | FASE 2 CUSTOMER EXPERIENCE ENCUESTAS V001]
(function(){
  'use strict';

  if(window.ManttoCustomerExperienceEncuestas) return;

  const VI_COMUNES=[["proyecto_padre","Proyecto Padre"],["cliente","Cliente"],["sitio","Sitio"],["vendedor","Vendedor"],["modalidad","Modalidad"],["semana","Semana"],["supervisor","Supervisor"],["calificacion_nps","Calificación NPS"],["nps","NPS"]];
  const VI_GRUPOS={
    "VENTA CONCRETADA":[["vc_1_sat_proc_asec_vent","1 SAT PROC ASEC VENT"],["vc_2_amabilidad","2(AMABILIDAD)"],["vc_3_claridad","3 CLARIDAD"],["vc_4_asesor","4 (ASESOR)"],["vc_5_vendedor","5 VENDEDOR"],["vc_6_tiempo_ase_com","6 TIEMPO ASE COM"],["vc_7_tiempo_pres","7 TIEMPO PRES"],["vc_8_tiem_contrato","8 TIEM CONTRATO"],["vc_9_agilidad_comp_y_cont","9 AGILIDAD COMP Y CONT"],["vc_10_prod_nec","10 PROD NEC"],["vc_comentarios","COMENTARIOS"],["vc_11_consid_opc","11 CONSID OPC"],["vc_12_pq_eligio","12 PQ ELIGIO"],["vc_comentarios_1","COMENTARIOS.1"],["vc_13_exp_com_gen","13 EXP COM GEN"],["vc_comentarios_2","COMENTARIOS.2"],["vc_resultados","RESULTADOS"]],
    "VENTA NO CONCRETADA":[["vnc_csc","CSC"],["vnc_1_exp_vent_pro_gen","1 (EXP VENT PRO GEN)"],["vnc_2_amab_ase","2 AMAB ASE"],["vnc_3_clar_ase_prop_y_prod","3 (CLAR ASE PROP Y PROD)"],["vnc_4_ase_exp_y_nec","4 (ASE EXP Y NEC)"],["vnc_5_vent_asp_pos_y_ao","5 (VENT ASP POS Y AO)"],["vnc_6_tiem_ate_ase","6 TIEM ATE ASE"],["vnc_7_con_q_empr","7 CON Q EMPR"],["vnc_8_tiem_ate_ase","8 TIEM ATE ASE"],["vnc_9_tiem_pre_presu","9 TIEM PRE PRESU"],["vnc_10_pord_porp","10 PORD PORP"],["vnc_comentarios_3","COMENTARIOS.3"],["vnc_resultados_1","RESULTADOS.1"],["vnc_csc_1","CSC.1"]],
    "INSTALACION":[["ins_1_sat_pro_oc","1 SAT PRO OC"],["ins_2_sat_pro_supr","2 SAT PRO SUPR"],["ins_3_calif_com_y_ate","3 CALIF COM Y ATE"],["ins_4_disp_sup_inst","4 DISP SUP INST"],["ins_comentarios_4","COMENTARIOS.4"],["ins_5_pt_pro_y_con","5 PT PRO Y CON"],["ins_6_cla_inf_tec","6 CLA INF TEC"],["ins_7_res_incide","7 RES INCIDE"],["ins_8_pod_mej","8 POD MEJ"],["ins_comentarios_5","COMENTARIOS.5"],["ins_9_aspec_sup_ob_civ","9 ASPEC SUP OB CIV"],["ins_comentarios_6","COMENTARIOS.6"],["ins_resultados_2","RESULTADOS.2"],["ins_csc_2","CSC.2"]],
    "AJUSTE":[["aj_1_sat_pro_ajus","1 SAT PRO AJUS"],["aj_2_calif_com_y_ate","2 CALIF COM Y ATE"],["aj_3_disp_sup_ajus","3 DISP SUP AJUS"],["aj_comentarios_7","COMENTARIOS.7"],["aj_4_calif_pro_entre","4 CALIF PRO ENTRE"],["aj_5_pt_prof_y_con","5 PT PROF Y CON"],["aj_6_cla_inf_tec_1","6 CLA INF TEC.1"],["aj_7_res_inc","7 RES INC"],["aj_8_pod_mejor","8 POD MEJOR"],["aj_comentarios_8","COMENTARIOS.8"],["aj_9_asp_pro_dest","9 ASP PRO DEST"],["aj_comentarios_9","COMENTARIOS.9"],["aj_resultado","Resultado"],["aj_csc_3","CSC.3"]],
    "ENCUESTA DE CIERRE":[["ci_1_sat_pro_grl","1 SAT PRO GRL"],["ci_2_pv_res_prob","2 PV RES PROB"],["ci_3_sat_aten_com","3 SAT ATEN COM"],["ci_4_com_eq_vent_y_ope","4 COM EQ VENT Y OPE"],["ci_5_calif_des_eq_vent","5 CALIF DES EQ VENT"],["ci_6_calif_des_eq_inst","6 CALIF DES EQ INST"],["ci_7_cal_des_eq_aj","7 CAL DES EQ AJ"],["ci_8_cal_cal_ele_esc","8 CAL CAL ELE/ESC"],["ci_9_prob_rec","9 PROB REC"],["ci_10_pro_vol_cont","10 PRO VOL CONT"],["ci_11_fac_trab_blt","11 FAC TRAB BLT"],["ci_12_punt_des_blt","12 PUNT DES BLT"],["ci_13_asp_mej_blt","13 ASP MEJ BLT"],["ci_14_va","14 VA"],["ci_comentarios_10","COMENTARIOS.10"],["ci_resultado","RESULTADO"],["ci_csc_4","CSC.4"],["ci_aspectos_destacables","ASPECTOS DESTACABLES"],["ci_clasificacion_de_areas_de_oportunida","CLASIFICACION DE AREAS DE OPORTUNIDAD"],["ci_areas_de_oportunidad","AREAS DE OPORTUNIDAD"],["ci_valor_agregado","VALOR AGREGADO"]]
  };
  const MT_GRUPOS={
    "Identificación":[["marca_temporal","Marca temporal"],["proyecto_sitio_del_servicio","Proyecto (sitio del servicio)"],["nombre","Nombre"],["cargo","Cargo"],["correo_electronico","Correo electrónico"],["telefono","Teléfono"],["medio_de_encuesta","Medio de encuesta"],["encuestador","Encuestador"],["id_de_encuesta","ID de encuesta"]],
    "NPS y confianza":[["indice_de_recomendacion","Índice de recomendación (NPS)"],["tipo_de_cliente","Clasificación NPS"],["indice_de_confianza","Índice de Confianza"],["percepcion_de_valor","Percepción de Valor"],["indice_de_riesgo_churn","Índice de riesgo / churn"]],
    "CSAT por componente":[["csat_mantenimiento","CSAT Mantenimiento preventivo"],["csat_atencion_de_fallas","CSAT Atención de fallas"],["csat_seguimiento_de_supervisor","CSAT Seguimiento de supervisor"],["csat_cotizaciones_suministros_y_reparaci","CSAT Cotizaciones/suministros/reparaciones"],["csat_facturacion","CSAT Facturación"],["csat_atencion_al_cliente","CSAT Atención al cliente"],["csat_general","CSAT General"],["2_1_cual_es_el_nombre_de_su_supervisor_o","Nombre del supervisor/contacto operativo"]],
    "Oportunidades de mejora":[["3_1_mantenimiento_preventivo_oportunidad","Mantenimiento preventivo: oportunidad"],["3_2_atencion_de_fallas_oportunidad_de_me","Atención de fallas: oportunidad"],["3_3_seguimiento_de_supervisor_oportunida","Seguimiento de supervisor: oportunidad"],["3_4_cotizaciones_suministros_y_reparacio","Cotizaciones/suministros/reparaciones: oportunidad"],["3_5_facturacion_oportunidad_de_mejora","Facturación: oportunidad"],["3_6_atencion_al_cliente_oportunidad_de_m","Atención al cliente: oportunidad"]],
    "Comentarios y clasificación":[["cuentanos_mas_sobre_tu_experiencia_algo_","Comentario libre"],["aspectos_destacables","Aspectos destacables"],["areas_de_oportunidad","Áreas de oportunidad"],["temas_operativos","Temas operativos"],["temas_administrativos","Temas administrativos"],["valor_agregado","Valor agregado"],["tickets_generados","Tickets generados"]],
    "Zonas y responsables":[["z_general","Zona general"],["z_operativa","Zona operativa"],["z_administrativa","Zona administrativa"],["c_administrativo","Contacto administrativo"],["z_ventas","Zona ventas"],["c_ventas","Contacto ventas"],["z_contratos","Zona contratos"],["c_contratos","Contacto contratos"],["superintendente","Superintendente"],["supervisor_operativo","Supervisor operativo"],["categoria","Categoría"],["prioridad","Prioridad"],["estado","Estado"]]
  };

  const state={
    tab:'venta_instalacion',
    opciones:null,
    filtrosVi:{},
    filtrosMt:{},
    encuestasVi:[],
    encuestasMt:[],
    analisisAbierto:false
  };

  function byId(id){ return document.getElementById(id); }
  function safe(value){
    return String(value===null||value===undefined||value===''?'—':value)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function sameId(a,b){ return String(a===null||a===undefined?'':a)===String(b===null||b===undefined?'':b); }

  async function fetchJson(path){
    if(window.ManttoAuth&&typeof window.ManttoAuth.api==='function') return window.ManttoAuth.api(path,{method:'GET'});
    const base=(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
    const headers=Object.assign({'Accept':'application/json'},window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{});
    const response=await fetch(base+path,{headers});
    const data=await response.json().catch(()=>({ok:false,message:'Respuesta invalida del backend'}));
    if(!response.ok||data.ok===false) throw new Error(data.message||data.error||'No fue posible consultar Customer Experience.');
    return data;
  }

  function shellHtml(){
    return '<div class="ce-page">'+
      '<section class="ce-card ce-head"><div><p class="ce-eyebrow">Customer Experience</p><h1>Encuestas</h1><p>Detalle individual por área y análisis de Mantenimiento.</p></div></section>'+
      '<div class="ce-tabs" role="tablist">'+
        '<button type="button" class="ce-tab'+(state.tab==='venta_instalacion'?' active':'')+'" data-tab="venta_instalacion">Venta / Instalaciones</button>'+
        '<button type="button" class="ce-tab'+(state.tab==='mantenimiento'?' active':'')+'" data-tab="mantenimiento">Mantenimiento</button>'+
      '</div>'+
      '<section class="ce-card"><div class="ce-filters" id="ce-filtros"></div></section>'+
      '<div id="ce-analisis"></div>'+
      '<div id="ce-resultado"><div class="ce-status">Cargando...</div></div>'+
      '<div class="ce-modal-overlay" id="ce-detalle-overlay" hidden>'+
        '<div class="ce-modal" role="dialog" aria-modal="true" aria-labelledby="ce-detalle-titulo">'+
          '<div class="ce-modal-head"><h2 id="ce-detalle-titulo">Detalle</h2><button type="button" class="ce-modal-close" id="ce-detalle-cerrar" aria-label="Cerrar">✕</button></div>'+
          '<div class="ce-modal-body" id="ce-detalle-body"></div>'+
        '</div>'+
      '</div>'+
    '</div>';
  }

  function selectHtml(id,label,options,current){
    const list='<option value="">Todos</option>'+(options||[]).map(value=>'<option value="'+safe(value)+'"'+(String(value)===String(current||'')?' selected':'')+'>'+safe(value)+'</option>').join('');
    return '<label><span>'+safe(label)+'</span><select id="'+id+'">'+list+'</select></label>';
  }

  function bindFilter(id,key,bucket,analysis){
    const node=byId(id);
    if(!node) return;
    node.addEventListener('change',async()=>{
      bucket[key]=node.value;
      await loadCurrentTab();
      if(analysis&&state.analisisAbierto) await loadAnalysisBody();
    });
  }

  function renderFilters(){
    const host=byId('ce-filtros');
    if(!host||!state.opciones) return;
    if(state.tab==='venta_instalacion'){
      const options=state.opciones.venta_instalacion||{};
      host.innerHTML=selectHtml('ce-vi-tipo','Tipo de encuesta',options.tipos_encuesta,state.filtrosVi.tipo_encuesta)+
        selectHtml('ce-vi-vendedor','Vendedor',options.vendedores,state.filtrosVi.vendedor)+
        selectHtml('ce-vi-supervisor','Supervisor',options.supervisores,state.filtrosVi.supervisor);
      bindFilter('ce-vi-tipo','tipo_encuesta',state.filtrosVi,false);
      bindFilter('ce-vi-vendedor','vendedor',state.filtrosVi,false);
      bindFilter('ce-vi-supervisor','supervisor',state.filtrosVi,false);
      return;
    }
    const options=state.opciones.mantenimiento||{};
    host.innerHTML=selectHtml('ce-mt-estado','Estado',options.estados,state.filtrosMt.estado)+
      selectHtml('ce-mt-superintendente','Superintendente',options.superintendentes,state.filtrosMt.superintendente)+
      selectHtml('ce-mt-categoria','Categoría',options.categorias,state.filtrosMt.categoria);
    bindFilter('ce-mt-estado','estado',state.filtrosMt,true);
    bindFilter('ce-mt-superintendente','superintendente',state.filtrosMt,true);
    bindFilter('ce-mt-categoria','categoria',state.filtrosMt,true);
  }

  function npsClass(value){
    const number=Number(value);
    if(!Number.isFinite(number)) return '';
    return number>=9?'promotor':(number>=7?'pasivo':'detractor');
  }

  function renderVentaList(){
    const result=byId('ce-resultado');
    const rows=state.encuestasVi||[];
    if(!rows.length){ result.innerHTML='<div class="ce-status">Sin encuestas con estos filtros.</div>'; return; }
    result.innerHTML='<div class="ce-list">'+rows.map(row=>
      '<button type="button" class="ce-row" data-id="'+safe(row.id)+'">'+
        '<div class="ce-row-main"><strong>'+safe(row.proyecto_padre)+'</strong><span class="ce-row-sub">'+safe(row.cliente)+' · '+safe(row.sitio)+'</span></div>'+
        '<div class="ce-row-meta"><span class="ce-chip">'+safe(row.tipo_encuesta)+'</span><span class="ce-chip">'+safe(row.vendedor)+'</span><span class="ce-nps-badge '+npsClass(row.nps)+'">NPS '+safe(row.nps)+'</span></div>'+
      '</button>').join('')+'</div>';
    result.querySelectorAll('.ce-row').forEach(button=>button.addEventListener('click',()=>{
      const row=rows.find(item=>sameId(item.id,button.dataset.id));
      if(row) openVentaDetail(row);
    }));
  }

  function renderMantenimientoList(){
    const result=byId('ce-resultado');
    const rows=state.encuestasMt||[];
    if(!rows.length){ result.innerHTML='<div class="ce-status">Sin encuestas con estos filtros.</div>'; return; }
    result.innerHTML='<div class="ce-list">'+rows.map(row=>
      '<button type="button" class="ce-row" data-id="'+safe(row.id)+'">'+
        '<div class="ce-row-main"><strong>'+safe(row.proyecto_sitio_del_servicio)+'</strong><span class="ce-row-sub">'+safe(row.nombre)+' · '+safe(row.cargo)+'</span></div>'+
        '<div class="ce-row-meta"><span class="ce-chip">'+safe(row.estado)+'</span><span class="ce-chip">'+safe(row.superintendente)+'</span><span class="ce-nps-badge '+npsClass(row.indice_de_recomendacion)+'">NPS '+safe(row.indice_de_recomendacion)+'</span></div>'+
      '</button>').join('')+'</div>';
    result.querySelectorAll('.ce-row').forEach(button=>button.addEventListener('click',()=>{
      const row=rows.find(item=>sameId(item.id,button.dataset.id));
      if(row) openMantenimientoDetail(row);
    }));
  }

  function sectionHtml(title,fields,row){
    const body=(fields||[]).filter(([key])=>row[key]!=null&&String(row[key]).trim()!=='').map(([key,label])=>
      '<div class="ce-detail-row"><span class="ce-detail-label">'+safe(label)+'</span><span class="ce-detail-value">'+safe(row[key])+'</span></div>'
    ).join('');
    return body?'<section class="ce-detail-section"><h3>'+safe(title)+'</h3>'+body+'</section>':'';
  }

  function groupedDetails(row,groups){
    return Object.entries(groups||{}).map(([title,fields])=>sectionHtml(title,fields,row)).join('');
  }

  function showModal(title,html){
    const overlay=byId('ce-detalle-overlay');
    const heading=byId('ce-detalle-titulo');
    const body=byId('ce-detalle-body');
    if(!overlay||!heading||!body) return;
    heading.textContent=title||'Detalle';
    body.innerHTML=html||'<div class="ce-status">Sin información.</div>';
    overlay.hidden=false;
  }

  function closeModal(){ const overlay=byId('ce-detalle-overlay'); if(overlay) overlay.hidden=true; }

  function openVentaDetail(row){
    const type=Object.keys(VI_GRUPOS).find(item=>item.trim()===String(row.tipo_encuesta||'').trim());
    const common=sectionHtml('Datos generales',VI_COMUNES,row);
    const detail=type?sectionHtml(type,VI_GRUPOS[type],row):'<div class="ce-status">Tipo de encuesta sin grupo de campos definido.</div>';
    showModal(String(row.proyecto_padre||'Encuesta')+' · '+String(row.tipo_encuesta||''),common+detail);
  }

  function openMantenimientoDetail(row){
    showModal(String(row.proyecto_sitio_del_servicio||'Encuesta')+' · '+String(row.nombre||''),groupedDetails(row,MT_GRUPOS));
  }

  function queryString(filters,extra){
    const params=new URLSearchParams();
    Object.entries(filters||{}).forEach(([key,value])=>{ if(value) params.set(key,value); });
    Object.entries(extra||{}).forEach(([key,value])=>{ if(value!==null&&value!==undefined&&value!=='') params.set(key,value); });
    return params.toString();
  }

  async function loadCurrentTab(){
    const result=byId('ce-resultado');
    if(!result) return;
    result.innerHTML='<div class="ce-status">Cargando...</div>';
    try{
      if(state.tab==='venta_instalacion'){
        const data=await fetchJson('/api/customer-experience/venta-instalacion/encuestas?'+queryString(state.filtrosVi));
        state.encuestasVi=data.encuestas||[];
        renderVentaList();
      }else{
        const data=await fetchJson('/api/customer-experience/mantenimiento/encuestas?'+queryString(state.filtrosMt));
        state.encuestasMt=data.encuestas||[];
        renderMantenimientoList();
      }
    }catch(error){
      result.innerHTML='<div class="ce-status ce-error"><strong>No fue posible consultar Encuestas.</strong><span>'+safe(error&&error.message?error.message:'Error desconocido')+'</span></div>';
    }
  }

  function renderClosedAnalysis(data){
    const questions=(data&&data.preguntas)||[];
    return '<div class="ce-analisis-grid">'+questions.map(question=>{
      const options=(question.opciones||[]).map(option=>
        '<button type="button" class="ce-bar-row ce-drill" data-type="question" data-field="'+safe(question.campo)+'" data-value="'+safe(option.valor)+'" data-label="'+safe(question.etiqueta+' · '+option.valor)+'">'+
          '<div class="ce-bar-labels"><span>'+safe(option.valor)+'</span><span>'+safe(option.cantidad)+' · '+safe(option.porcentaje)+'%</span></div>'+
          '<div class="ce-bar-track"><span class="ce-bar-fill" style="width:'+Math.max(0,Math.min(100,Number(option.porcentaje)||0))+'%"></span></div>'+
        '</button>'
      ).join('');
      return '<article class="ce-analisis-bloque"><h4>'+safe(question.etiqueta)+(question.multi?' <span class="ce-multi-tag">selección múltiple</span>':'')+'</h4><p class="ce-analisis-sub">'+safe(question.total_respuestas)+' encuesta(s) respondieron</p>'+options+'</article>';
    }).join('')+'</div>';
  }

  function renderThemeAnalysis(data){
    const fields=(data&&data.campos)||[];
    return '<div class="ce-analisis-grid">'+fields.map(field=>{
      const words=field.palabras||[];
      const body=words.length?'<div class="ce-tema-chips">'+words.map(word=>
        '<button type="button" class="ce-tema-chip ce-drill" data-type="theme" data-field="'+safe(field.campo)+'" data-value="'+safe(word.palabra)+'" data-label="'+safe(field.etiqueta+' · “'+word.palabra+'”')+'">'+safe(word.palabra)+' <span>'+safe(word.menciones)+'</span></button>'
      ).join('')+'</div>':'<p class="ce-analisis-sub">Sin palabras recurrentes.</p>';
      return '<article class="ce-analisis-bloque"><h4>'+safe(field.etiqueta)+'</h4><p class="ce-analisis-sub">'+safe(field.total_comentarios)+' comentario(s) · mínimo 2 encuestas</p>'+body+'</article>';
    }).join('')+'</div>';
  }

  async function renderAnalysisShell(){
    const host=byId('ce-analisis');
    if(!host) return;
    if(state.tab!=='mantenimiento'){ host.innerHTML=''; return; }
    host.innerHTML='<section class="ce-card"><button type="button" class="ce-analisis-toggle" id="ce-analisis-toggle">'+(state.analisisAbierto?'▾':'▸')+' Análisis de preguntas cerradas y comentarios</button><div id="ce-analisis-body"'+(state.analisisAbierto?'':' hidden')+'></div></section>';
    const toggle=byId('ce-analisis-toggle');
    if(toggle) toggle.addEventListener('click',async()=>{
      state.analisisAbierto=!state.analisisAbierto;
      toggle.textContent=(state.analisisAbierto?'▾':'▸')+' Análisis de preguntas cerradas y comentarios';
      const body=byId('ce-analisis-body');
      if(body) body.hidden=!state.analisisAbierto;
      if(state.analisisAbierto) await loadAnalysisBody();
    });
    if(state.analisisAbierto) await loadAnalysisBody();
  }

  async function loadAnalysisBody(){
    const body=byId('ce-analisis-body');
    if(!body) return;
    body.innerHTML='<div class="ce-status">Cargando análisis...</div>';
    try{
      const query=queryString(state.filtrosMt);
      const [questions,themes]=await Promise.all([
        fetchJson('/api/customer-experience/mantenimiento/analisis-preguntas?'+query),
        fetchJson('/api/customer-experience/mantenimiento/analisis-temas?'+query)
      ]);
      body.innerHTML='<h3 class="ce-analisis-titulo">Preguntas cerradas</h3>'+renderClosedAnalysis(questions)+'<h3 class="ce-analisis-titulo">Temas en comentarios abiertos</h3>'+renderThemeAnalysis(themes);
      body.querySelectorAll('.ce-drill').forEach(button=>button.addEventListener('click',()=>openAnalysisDrilldown(button.dataset)));
    }catch(error){
      body.innerHTML='<div class="ce-status ce-error">Error cargando análisis: '+safe(error&&error.message?error.message:'Error desconocido')+'</div>';
    }
  }

  async function openAnalysisDrilldown(dataset){
    showModal(dataset.label||'Detalle','<div class="ce-status">Cargando...</div>');
    try{
      const isQuestion=dataset.type==='question';
      const path=isQuestion?'/api/customer-experience/mantenimiento/analisis-preguntas/detalle':'/api/customer-experience/mantenimiento/analisis-temas/detalle';
      const extra={campo:dataset.field};
      extra[isQuestion?'valor':'palabra']=dataset.value;
      const data=await fetchJson(path+'?'+queryString(state.filtrosMt,extra));
      const rows=data.encuestas||[];
      const body=byId('ce-detalle-body');
      if(!body) return;
      if(!rows.length){ body.innerHTML='<div class="ce-status">Sin encuestas encontradas.</div>'; return; }
      body.innerHTML='<p class="ce-analisis-sub">'+safe(data.total)+' encuesta(s). Selecciona una para ver el detalle completo.</p><div class="ce-list">'+rows.map(row=>
        '<button type="button" class="ce-row ce-row-compact" data-id="'+safe(row.id)+'"><div class="ce-row-main"><strong>'+safe(row.proyecto_sitio_del_servicio)+'</strong><span class="ce-row-sub">'+safe(row.nombre)+'</span></div><span class="ce-nps-badge '+npsClass(row.indice_de_recomendacion)+'">NPS '+safe(row.indice_de_recomendacion)+'</span></button>'
      ).join('')+'</div>';
      body.querySelectorAll('.ce-row').forEach(button=>button.addEventListener('click',()=>{
        const row=rows.find(item=>sameId(item.id,button.dataset.id));
        if(row) openMantenimientoDetail(row);
      }));
    }catch(error){
      const body=byId('ce-detalle-body');
      if(body) body.innerHTML='<div class="ce-status ce-error">'+safe(error&&error.message?error.message:'No fue posible consultar el detalle.')+'</div>';
    }
  }

  async function changeTab(tab){
    state.tab=tab==='mantenimiento'?'mantenimiento':'venta_instalacion';
    document.querySelectorAll('.ce-tab').forEach(button=>button.classList.toggle('active',button.dataset.tab===state.tab));
    renderFilters();
    await renderAnalysisShell();
    await loadCurrentTab();
  }

  async function init(){
    const view=byId('view-placeholder');
    if(!view) return false;
    view.innerHTML=shellHtml();
    const subtitle=byId('app-context-subtitle');
    if(subtitle) subtitle.textContent='Customer Experience · detalle y análisis de encuestas desde Aiven';

    document.querySelectorAll('.ce-tab').forEach(button=>button.addEventListener('click',()=>changeTab(button.dataset.tab)));
    const close=byId('ce-detalle-cerrar');
    if(close) close.addEventListener('click',closeModal);
    const overlay=byId('ce-detalle-overlay');
    if(overlay) overlay.addEventListener('click',event=>{ if(event.target===overlay) closeModal(); });

    try{
      const options=await fetchJson('/api/customer-experience/opciones');
      state.opciones=options.data||{venta_instalacion:{},mantenimiento:{}};
      renderFilters();
      await renderAnalysisShell();
      await loadCurrentTab();
      return true;
    }catch(error){
      const result=byId('ce-resultado');
      if(result) result.innerHTML='<div class="ce-status ce-error"><strong>No fue posible cargar Customer Experience · Encuestas.</strong><span>'+safe(error&&error.message?error.message:'Error desconocido')+'</span></div>';
      return false;
    }
  }

  if(!window.__MANTTO_CX_ENCUESTAS_ESCAPE_BOUND__){
    window.__MANTTO_CX_ENCUESTAS_ESCAPE_BOUND__=true;
    document.addEventListener('keydown',event=>{ if(event.key==='Escape'){ const overlay=byId('ce-detalle-overlay'); if(overlay&&!overlay.hidden) closeModal(); } });
  }

  window.ManttoCustomerExperienceEncuestas=Object.freeze({init});
})();
