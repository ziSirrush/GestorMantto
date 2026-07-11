(function(){
  const MODULE_VERSION='20260711-v005';
  const API_BASE=(window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  const state={loaded:false,loading:false,allRows:[],rows:[],currentProject:null,currentEquipment:null,equipment:[],logistics:[],scroll:{list:0,project:0}};
  const $=id=>document.getElementById(id);
  const rawText=v=>v===null||v===undefined||String(v).trim()===''?'':String(v).trim();
  const text=v=>rawText(v)||'—';
  const esc=v=>text(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const number=v=>Number.isFinite(Number(v))?Number(v):0;

  function authHeaders(){
    return Object.assign({'Accept':'application/json'},window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{});
  }

  async function fetchJson(path){
    const response=await fetch(API_BASE+path,{headers:authHeaders(),cache:'no-store'});
    const raw=await response.text();
    let json=null;
    try{json=raw?JSON.parse(raw):null;}catch(e){throw new Error('La API respondió contenido no JSON.');}
    if(!response.ok||(json&&json.ok===false))throw new Error((json&&(json.message||json.error))||('Error HTTP '+response.status));
    return json;
  }

  async function loadHtml(){
    const view=$('view-instalaciones-proyectos');
    if(!view||view.dataset.ready==='1')return;
    const response=await fetch('./modules/instalaciones-proyectos/instalaciones-proyectos.html?v='+MODULE_VERSION,{cache:'no-store'});
    if(!response.ok)throw new Error('No se pudo cargar la vista de Proyectos de Instalación.');
    view.innerHTML=await response.text();
    view.dataset.ready='1';
    bind();
  }

  function bind(){
    document.querySelectorAll('[data-insproy-action]').forEach(btn=>btn.addEventListener('click',()=>handleAction(btn.dataset.insproyAction)));
    ['insproy-filter-estado','insproy-filter-supervisor','insproy-filter-asesor','insproy-filter-admin'].forEach(id=>{const el=$(id);if(el)el.addEventListener('change',applyFilters);});
    const search=$('insproy-filter-search');
    if(search)search.addEventListener('input',applyFilters);
    document.querySelectorAll('[data-task-type]').forEach(btn=>btn.addEventListener('click',()=>createTask(btn.dataset.taskType)));
  }

  function handleAction(action){
    if(action==='refresh')refresh();
    if(action==='clear')clearFilters();
    if(action==='back-list')showList();
    if(action==='back-project')showProject();
    if(action==='new-task')$('insproy-task-choice').hidden=false;
    if(action==='close-task-choice')$('insproy-task-choice').hidden=true;
  }

  function setStatus(type,message){
    const el=$('insproy-status');
    if(!el)return;
    el.className='insproy-status '+type;
    el.innerHTML='<span class="insproy-dot"></span><span>'+esc(message)+'</span>';
  }

  function normalize(row){
    return {
      proyecto:text(row.proyecto),
      id_proyecto:text(row.id_proyecto),
      ciudad:text(row.ciudad),
      estado:text(row.estado),
      cliente:text(row.cliente),
      vendedor:text(row.vendedor),
      total_equipos:number(row.total_equipos),
      equipos_activos:number(row.equipos_activos),
      equipos_terminados:number(row.equipos_terminados),
      asesor:text(row.asesor_iniciales||row.asesor||row.id_asesor),
      supervisor:text(row.supervisor_iniciales||row.supervisor||row.id_sup),
      admin:text(row.admin_iniciales||row.aux_administrativo||row.id_admin)
    };
  }

  function fillSelect(id,values){
    const el=$(id);
    if(!el)return;
    const current=el.value;
    const label=el.options[0]?el.options[0].textContent:'Todos';
    el.innerHTML='<option value="">'+esc(label)+'</option>'+values.filter(v=>v&&v!=='—').sort((a,b)=>a.localeCompare(b,'es')).map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
    if(values.includes(current))el.value=current;
  }

  function populateFilters(){
    const unique=key=>[...new Set(state.allRows.map(r=>r[key]))];
    fillSelect('insproy-filter-estado',unique('estado'));
    fillSelect('insproy-filter-supervisor',unique('supervisor'));
    fillSelect('insproy-filter-asesor',unique('asesor'));
    fillSelect('insproy-filter-admin',unique('admin'));
  }

  function applyFilters(){
    const estado=$('insproy-filter-estado')?.value||'';
    const supervisor=$('insproy-filter-supervisor')?.value||'';
    const asesor=$('insproy-filter-asesor')?.value||'';
    const admin=$('insproy-filter-admin')?.value||'';
    const search=($('insproy-filter-search')?.value||'').trim().toLocaleLowerCase('es');
    state.rows=state.allRows.filter(r=>{
      if(estado&&r.estado!==estado)return false;
      if(supervisor&&r.supervisor!==supervisor)return false;
      if(asesor&&r.asesor!==asesor)return false;
      if(admin&&r.admin!==admin)return false;
      if(search){
        const haystack=[r.proyecto,r.id_proyecto,r.ciudad,r.estado,r.cliente,r.asesor,r.supervisor,r.admin].join(' ').toLocaleLowerCase('es');
        if(!haystack.includes(search))return false;
      }
      return true;
    });
    render();
  }

  function clearFilters(){
    ['insproy-filter-estado','insproy-filter-supervisor','insproy-filter-asesor','insproy-filter-admin','insproy-filter-search'].forEach(id=>{const el=$(id);if(el)el.value='';});
    applyFilters();
  }

  function render(){
    const rows=state.rows;
    const body=$('insproy-body');
    const sum=key=>rows.reduce((total,row)=>total+number(row[key]),0);
    if($('insproy-kpi-proyectos'))$('insproy-kpi-proyectos').textContent=rows.length.toLocaleString('es-MX');
    if($('insproy-kpi-equipos'))$('insproy-kpi-equipos').textContent=sum('total_equipos').toLocaleString('es-MX');
    if($('insproy-kpi-activos'))$('insproy-kpi-activos').textContent=sum('equipos_activos').toLocaleString('es-MX');
    if($('insproy-kpi-terminados'))$('insproy-kpi-terminados').textContent=sum('equipos_terminados').toLocaleString('es-MX');
    if($('insproy-count'))$('insproy-count').textContent=rows.length+' proyectos mostrados';
    if(!body)return;
    if(!rows.length){body.innerHTML='<tr><td colspan="10" class="insproy-empty">Sin proyectos para los filtros seleccionados</td></tr>';return;}
    body.innerHTML=rows.map(r=>'<tr><td class="insproy-name">'+esc(r.proyecto)+'</td><td class="insproy-id">'+esc(r.id_proyecto)+'</td><td>'+esc(r.ciudad)+'</td><td>'+esc(r.estado)+'</td><td class="insproy-num">'+r.total_equipos.toLocaleString('es-MX')+'</td><td><span class="insproy-person">'+esc(r.asesor)+'</span></td><td><span class="insproy-person">'+esc(r.supervisor)+'</span></td><td><span class="insproy-person">'+esc(r.admin)+'</span></td><td>'+esc(r.cliente)+'</td><td><button type="button" class="insproy-btn insproy-view-btn" data-project-id="'+esc(r.id_proyecto)+'">Ver</button></td></tr>').join('');
    body.querySelectorAll('[data-project-id]').forEach(btn=>btn.addEventListener('click',()=>openProject(btn.dataset.projectId)));
  }

  function pctValue(value){
    if(value===null||value===undefined||value==='')return 0;
    const cleaned=String(value).replace(/,/g,'').replace(/%/g,'').trim();
    let n=Number(cleaned);
    if(!Number.isFinite(n))return 0;
    if(n>=0&&n<=1)n*=100;
    return Math.max(0,Math.min(100,n));
  }

  function roundUp2(value){
    const n=Number(value);
    if(!Number.isFinite(n))return 0;
    return Math.ceil((n-Number.EPSILON)*100)/100;
  }

  function format2(value){
    return roundUp2(value).toFixed(2);
  }

  function equipmentProgress(row){
    return (pctValue(row.avance_oc)*0.4)+(pctValue(row.avance_mo)*0.4)+(pctValue(row.avance_aj)*0.2);
  }

  function formatDate(value){
    const raw=rawText(value);
    if(!raw)return '—';
    const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return iso?iso[3]+'/'+iso[2]+'/'+iso[1]:raw;
  }

  async function openProject(id){
    state.scroll.list=getScrollTop();
    const project=state.allRows.find(r=>String(r.id_proyecto)===String(id));
    if(!project)return;
    state.currentProject=project;
    state.currentEquipment=null;
    $('insproy-list-view').hidden=true;
    $('insproy-equipment-detail-view').hidden=true;
    $('insproy-detail-view').hidden=false;
    $('insproy-detail-subtitle').textContent=project.proyecto+' · '+project.id_proyecto;
    $('insproy-logistics-ppns').textContent=project.id_proyecto;
    renderGeneral(project);
    $('insproy-equipment-body').innerHTML='<tr><td colspan="10" class="insproy-empty">Cargando equipos...</td></tr>';
    try{
      const json=await fetchJson('/api/ins-fl?id_proyecto='+encodeURIComponent(project.id_proyecto)+'&limit=5000');
      state.equipment=Array.isArray(json)?json:(Array.isArray(json.data)?json.data:[]);
      await loadProjectLogistics(project.id_proyecto);
      renderDetail();
    }catch(error){
      state.equipment=[];
      $('insproy-equipment-body').innerHTML='<tr><td colspan="10" class="insproy-empty">'+esc(error.message)+'</td></tr>';
    }
    scrollTop();
  }

  function renderGeneral(project){
    const fields=[
      ['Proyecto',project.proyecto],['ID Proyecto / PP NS',project.id_proyecto],['Cliente',project.cliente],['Ciudad',project.ciudad],['Estado',project.estado],
      ['Asesor',project.asesor],['Supervisor',project.supervisor],['Aux. administrativo',project.admin],['Número de equipos',project.total_equipos]
    ];
    $('insproy-general-grid').innerHTML=fields.map(([label,value])=>'<article><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></article>').join('');
  }

  async function loadProjectLogistics(idProyecto){
    const body=$('insproy-project-logistics-body');
    if(body)body.innerHTML='<tr><td colspan="7" class="insproy-empty">Consultando Logística...</td></tr>';
    try{
      let rows=[];
      if(window.ManttoLogisticaStore&&Array.isArray(window.ManttoLogisticaStore.rows)){
        rows=window.ManttoLogisticaStore.rows;
      }else{
        const json=await fetchJson('/api/logistica?limit=5000');
        rows=Array.isArray(json)?json:(Array.isArray(json.data)?json.data:[]);
        window.ManttoLogisticaStore={rows,loadedAt:Date.now()};
      }
      const target=String(idProyecto||'').trim().toUpperCase();
      state.logistics=rows.filter(row=>String(row.id_ppns||'').trim().toUpperCase()===target);
      renderProjectLogistics();
    }catch(error){
      state.logistics=[];
      if(body)body.innerHTML='<tr><td colspan="7" class="insproy-empty">'+esc(error.message)+'</td></tr>';
    }
  }

  function renderProjectLogistics(){
    const rows=state.logistics||[];
    const body=$('insproy-project-logistics-body');
    const count=$('insproy-project-logistics-count');
    if(count)count.textContent=rows.length+' registro'+(rows.length===1?'':'s')+' relacionado'+(rows.length===1?'':'s');
    if(!body)return;
    if(!rows.length){body.innerHTML='<tr><td colspan="7" class="insproy-empty">Sin registros relacionados en Logística.</td></tr>';return;}
    body.innerHTML=rows.map(row=>'<tr data-logistics-id="'+esc(row.id_log_ops)+'">'+
      '<td><span class="insproy-logistics-section">'+esc(row.estatus)+'</span></td>'+
      '<td>'+esc(row.no_control)+'</td>'+
      '<td>'+esc(row.marca)+'</td>'+
      '<td class="insproy-num">'+esc(row.cantidad)+'</td>'+
      '<td>'+esc(formatDate(row.fecha_produccion))+'</td>'+
      '<td>'+esc(formatDate(row.fecha_entrega_programada||row.fecha_entrega_real_obra))+'</td>'+
      '<td><button type="button" class="insproy-btn" data-logistics-detail="'+esc(row.id_log_ops)+'">Ver detalle</button></td></tr>').join('');
    body.querySelectorAll('[data-logistics-detail]').forEach(btn=>btn.addEventListener('click',()=>openLogisticsDetail(btn.dataset.logisticsDetail)));
  }

  function openLogisticsDetail(id){
    if(!state.currentProject)return;
    state.scroll.project=getScrollTop();
    window.ManttoRouter?.go('logistica-reporte',{detailId:id,search:state.currentProject.id_proyecto,id_ppns:state.currentProject.id_proyecto});
  }

  function renderDetail(){
    const rows=state.equipment||[];
    const average=rows.length?rows.reduce((sum,row)=>sum+equipmentProgress(row),0)/rows.length:0;
    $('insproy-progress-label').textContent=Math.round(average)+'%';
    $('insproy-progress-bar').style.width=Math.max(0,Math.min(100,average))+'%';
    $('insproy-equipment-count').textContent=rows.length+' equipos relacionados';
    renderChart(rows);
    const body=$('insproy-equipment-body');
    if(!rows.length){body.innerHTML='<tr><td colspan="10" class="insproy-empty">Sin equipos relacionados.</td></tr>';return;}
    body.innerHTML=rows.map((r,index)=>{
      const progress=equipmentProgress(r);
      return '<tr>'+ 
        '<td class="insproy-name">'+esc(r.referencia_sitio||('Equipo '+(index+1)))+'</td>'+ 
        '<td>'+esc(r.estatus_produccion)+'</td>'+ 
        '<td>'+esc(formatDate(r.fecha_descarga))+'</td>'+ 
        '<td>'+esc(r.estatus)+'</td>'+ 
        '<td class="insproy-percent">'+format2(progress)+'%</td>'+ 
        '<td class="insproy-percent">'+format2(pctValue(r.avance_oc))+'%</td>'+ 
        '<td class="insproy-percent">'+format2(pctValue(r.avance_mo))+'%</td>'+ 
        '<td class="insproy-percent">'+format2(pctValue(r.avance_aj))+'%</td>'+ 
        '<td>'+esc(formatDate(r.fecha_entrega_cliente))+'</td>'+ 
        '<td><button type="button" class="insproy-btn" data-equipment-index="'+index+'">Ver</button></td>'+ 
      '</tr>';
    }).join('');
    body.querySelectorAll('[data-equipment-index]').forEach(btn=>btn.addEventListener('click',()=>openEquipment(Number(btn.dataset.equipmentIndex))));
  }

  function renderChart(rows){
    const chart=$('insproy-equipment-chart');
    if(!rows.length){chart.innerHTML='<div class="insproy-empty">Sin datos de avance.</div>';return;}
    const ticks=[0,25,50,75,100];
    chart.innerHTML='<div class="insproy-bar-chart">'+
      '<div class="insproy-chart-axis"><span></span><div>'+ticks.map(t=>'<b style="left:'+t+'%">'+t+'%</b>').join('')+'</div><span></span></div>'+
      rows.map((r,index)=>{
        const progress=equipmentProgress(r);
        const width=Math.max(0,Math.min(100,progress));
        const name=rawText(r.referencia_sitio)||('Equipo '+(index+1));
        return '<div class="insproy-bar-row"><span title="'+esc(name)+'">'+esc(name)+'</span><div class="insproy-bar-plot">'+ticks.map(t=>'<i class="insproy-grid-line" style="left:'+t+'%"></i>').join('')+'<em style="width:'+width+'%"></em></div><b>'+format2(progress)+'%</b></div>';
      }).join('')+
    '</div>';
  }

  function openEquipment(index){
    state.scroll.project=getScrollTop();
    const row=state.equipment[index];
    if(!row)return;
    state.currentEquipment=row;
    $('insproy-detail-view').hidden=true;
    $('insproy-equipment-detail-view').hidden=false;
    $('insproy-equipment-title').textContent=text(row.referencia_sitio||('Equipo '+(index+1)));
    $('insproy-equipment-status').textContent='Estatus: '+text(row.estatus);
    renderEquipmentDetail(row);
    scrollTop();
  }

  function renderEquipmentDetail(row){
    const general=equipmentProgress(row);
    setEquipmentProgress('general',general);
    setEquipmentProgress('oc',pctValue(row.avance_oc));
    setEquipmentProgress('mo',pctValue(row.avance_mo));
    setEquipmentProgress('aj',pctValue(row.avance_aj));

    renderInfoGrid('insproy-equipment-general-grid',[
      ['Pisos',row.numero_pisos],['Puertas',row.numero_puertas],['Desembarques',row.numero_desembarques],
      ['Capacidad',rawText(row.capacidad_kg)?text(row.capacidad_kg)+' kg':'—'],['Velocidad',rawText(row.velocidad_ms)?text(row.velocidad_ms)+' m/s':'—']
    ]);

    renderInfoGrid('insproy-equipment-logistics-grid',[
      ['Fecha de descarga',formatDate(row.fecha_descarga)]
    ]);

    const supervisionBody=$('insproy-supervision-body');
    supervisionBody.innerHTML=[
      ['Carta de primera visita',formatDate(row.fecha_cpvp)],
      ['Fecha de última visita',formatDate(row.fecha_visita)],
      ['Días desde última visita',text(row.dias_sin_visita)],
      ['Último comentario del supervisor',text(row.comentarios_fl)]
    ].map(([label,value])=>'<tr><th>'+esc(label)+'</th><td>'+esc(value)+'</td></tr>').join('');

    renderExpandableDetails(row);
  }

  function setEquipmentProgress(key,value){
    const width=Math.max(0,Math.min(100,value));
    const label=$('insproy-equipment-'+key+'-label');
    const bar=$('insproy-equipment-'+key+'-bar');
    if(label)label.textContent=format2(value)+'%';
    if(bar)bar.style.width=width+'%';
  }

  function renderInfoGrid(id,fields){
    const el=$(id);
    if(!el)return;
    el.innerHTML=fields.map(([label,value])=>'<article><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></article>').join('');
  }

  function renderExpandableDetails(row){
    const groups={
      oc:[['Carta de Cubo No Recibido (CCNR)',formatDate(row.fecha_ccnr)],['Días sin hacer CCNR',text(row.dias_sin_ccnr)]],
      mo:[['Subcontratista',row.subcontratista],['Fin de Montaje Modificado',formatDate(row.fecha_fin_montaje_modificado)],['Revisión de instalación por Supervisor',formatDate(row.fecha_revision_supervisor)],['Minuta Revisión para Ajuste',formatDate(row.fecha_minuta_revision_ajuste)],['Liberado para Ajuste',formatDate(row.fecha_liberacion_ajuste)]],
      aj:[['Ajustador',row.ajustador],['Fin de Ajuste Modificado',formatDate(row.fecha_fin_ajuste_modificado)],['Reporte de Ajuste',formatDate(row.fecha_reporte_ajuste)],['Estatus de Inspección de Calidad',row.estatus_inspeccion_calidad],['Formato CAF-PG',row.formato_caf_pg],['Equipo se queda / Entrega',row.estatus_equipo_entrega]]
    };
    Object.entries(groups).forEach(([key,fields])=>{
      const panel=$('insproy-expand-'+key);
      if(panel)panel.innerHTML=fields.map(([label,value])=>'<article><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></article>').join('');
    });
    document.querySelectorAll('[data-progress-expand]').forEach(btn=>{
      btn.onclick=()=>{
        const key=btn.dataset.progressExpand;
        const panel=$('insproy-expand-'+key);
        if(!panel)return;
        const opening=panel.hidden;
        panel.hidden=!opening;
        btn.setAttribute('aria-expanded',String(opening));
      };
    });
  }

  function getScrollTop(){
    const main=document.querySelector('.main-content');
    return main ? main.scrollTop : (window.scrollY || 0);
  }

  function restoreScroll(value){
    const top=Number(value)||0;
    window.requestAnimationFrame(()=>{
      const main=document.querySelector('.main-content');
      if(main)main.scrollTop=top;
      window.scrollTo?.({top,behavior:'auto'});
    });
  }

  function showProject(){
    $('insproy-equipment-detail-view').hidden=true;
    $('insproy-detail-view').hidden=false;
    state.currentEquipment=null;
    restoreScroll(state.scroll.project);
  }

  function showList(){
    $('insproy-equipment-detail-view').hidden=true;
    $('insproy-detail-view').hidden=true;
    $('insproy-list-view').hidden=false;
    state.currentProject=null;
    state.currentEquipment=null;
    state.equipment=[];
    restoreScroll(state.scroll.list);
  }

  function scrollTop(){
    restoreScroll(0);
  }

  function getCurrentUser(){
    if(window.ManttoAuth&&typeof window.ManttoAuth.getUser==='function')return window.ManttoAuth.getUser()||{};
    for(const key of ['mantto_user','MANTTO_USER','user','auth_user','session_user','mantto_session','MANTTO_SESSION']){
      try{
        const raw=localStorage.getItem(key)||sessionStorage.getItem(key);
        if(raw){const parsed=JSON.parse(raw);return parsed.user||parsed.usuario||parsed||{};}
      }catch(error){}
    }
    return {};
  }

  function ensureSelectValue(select,value,label){
    if(!select||!value)return;
    let option=[...select.options].find(item=>String(item.value)===String(value));
    if(!option){option=new Option(label||value,value,true,true);select.add(option);}
    select.value=String(value);
  }

  function ensureTaskPrefill(detail){
    ensureSelectValue(document.getElementById('task-company'),detail.empresa,detail.empresa);
    ensureSelectValue(document.getElementById('task-project'),detail.proyecto,state.currentProject?.proyecto||detail.proyecto);
  }

  function createTask(type){
    if(!state.currentProject)return;
    $('insproy-task-choice').hidden=true;
    const equipment=state.currentEquipment;
    const equipmentText=equipment?' · Equipo: '+text(equipment.referencia_sitio):'';
    const user=getCurrentUser();
    const detail={tipo_pendiente:type,empresa:user.empresa||'',proyecto:state.currentProject.id_proyecto,descripcion:'Proyecto de instalación: '+state.currentProject.proyecto+' ('+state.currentProject.id_proyecto+')'+equipmentText,area:'Instalaciones'};
    window.ManttoRouter?.go('home');
    window.setTimeout(async()=>{
      if(!window.ManttoHome?.openTaskForm)return;
      await window.ManttoHome.openTaskForm('create',detail);
      ensureTaskPrefill(detail);
    },80);
  }

  async function refresh(){
    if(state.loading)return;
    state.loading=true;
    setStatus('loading','Consultando Aiven...');
    const body=$('insproy-body');
    if(body)body.innerHTML='<tr><td colspan="10" class="insproy-empty">Cargando proyectos...</td></tr>';
    try{
      const json=await fetchJson('/api/ins-fl/proyectos?limit=5000');
      const raw=Array.isArray(json)?json:(Array.isArray(json.data)?json.data:[]);
      state.allRows=raw.map(normalize);
      state.rows=state.allRows.slice();
      state.loaded=true;
      populateFilters();
      applyFilters();
      setStatus('ok','Aiven conectado · '+state.allRows.length+' proyectos');
    }catch(error){
      state.allRows=[];
      state.rows=[];
      render();
      setStatus('error',error.message);
      if(body)body.innerHTML='<tr><td colspan="10" class="insproy-empty">'+esc(error.message)+'</td></tr>';
    }finally{state.loading=false;}
  }

  async function init(){await loadHtml();if(!state.loaded)await refresh();else render();}
  window.ManttoInstalacionesProyectos={init,refresh,version:MODULE_VERSION};
})();
