(function(){
  'use strict';
  // [Aster | 2026-10-08 | ASTER-MG | FASE_4_INSTALACIONES_ADMINISTRACION_FORMULARIOS_GUARDADO_V001]
  // [Aster | 2026-10-08 | ASTER-MG | FASE_5_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001]
  // [Aster | 2026-10-08 | ASTER-MG | FASE_6_INSTALACIONES_ADMINISTRACION_AISLAMIENTO_SESION_V001]
  // [Aster | 2026-10-08 | ASTER-MG | FIX_1_INSTALACIONES_ADMINISTRACION_REDISENO_V001]
  // [Aster | 2026-10-08 | ASTER-MG | FIX_2_INSTALACIONES_ADMINISTRACION_DETALLE_EQUIPO_V001]
  // [Aster | 2026-10-09 | ASTER-MG | FIX_3_INSTALACIONES_ADMINISTRACION_EDICION_MULTIPLE_V001]
  const VERSION_COR='20261009-fix3-v001';
  const ROOT='/api/instalaciones/administracion';
  const USER_IDS=new Set(['id_sup','id_asesor','id_admin']);
  const LABELS={
    proyecto:'Proyecto',id_proyecto:'PP NS',referencia_sitio:'Referencia en sitio',
    fecha_visita:'Ultima visita',comentarios_fl:'Comentarios FL',avance_oc:'Avance OC',avance_mo:'Avance MO',avance_aj:'Avance AJ',
    id_sup:'Supervisor (usuario)',id_asesor:'Asesor (usuario)',id_admin:'Administrativo (usuario)',
    numero_equipo_fabrica:'No. equipo fabrica',numero_contrato:'No. contrato',ov_ns:'OV NS',ph_ns:'PH NS',
    velocidad_ms:'Velocidad [m/s]',capacidad_kg:'Capacidad [kg]',entrepiso_mm:'Entrepiso [mm]',longitud_mm:'Longitud [mm]',
    ancho_peldano_mm:'Ancho de peldano [mm]',numero_pisos:'No. pisos',numero_desembarques:'No. desembarques',numero_puertas:'No. puertas',
    fecha_cpvp:'Carta de primera visita (CPVP)',fecha_ccnr:'Carta cubo no recibido (CCNR)',fecha_ccr:'Carta cubo recibido (CCR)',
    fecha_cti:'Carta termino instalacion (CTI)',formato_caf_pg:'Formato CAF-PG',
    presupuesto_mantenimiento_cem:'Presupuesto mantenimiento CEM',costo_mensual_mantenimiento_cem:'Costo mensual mantenimiento CEM',
    created_at:'Creado',updated_at:'Ultima actualizacion',id_ins_fl:'ID ins_fl'
  };
  const st={ready:false,bound:false,loading:false,saving:false,contract:null,records:[],projects:[],
    selectedProject:null,projectsTotal:0,projectRecordsTotal:0,projectsOffset:0,equipmentOffset:0,
    filtersLoaded:false,filterOptions:null,projectsSeq:0,equipmentSeq:0,page:'projects',
    selectedRecord:null,selectedSummary:null,activeGroup:null,editingGroup:null,editingDetail:false,touched:new Set(),users:null,
    seq:0,detailSeq:0,conflict:false,contextEpoch:0,contextKey:null,
    bulkSelected:new Map(),bulkSnapshots:new Map(),bulkTouched:new Set(),bulkSeq:0,bulkConflict:false};
  const $=id=>document.getElementById(id);
  const raw=value=>value==null?'':String(value).trim();
  const esc=value=>String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const has=(x,k)=>Object.prototype.hasOwnProperty.call(x||{},k);
  const view=()=>$('view-instalaciones-administracion');
  const label=f=>LABELS[f]||f.replace(/_/g,' ').replace(/^./,s=>s.toUpperCase());
  const meta=f=>st.contract?.field_meta?.[f]||{kind:'text',max_length:20000};
  const groups=()=>Array.isArray(st.contract?.groups)?st.contract.groups.filter(g=>g?.permissions?.can_view===true):[];
  const canEdit=g=>Boolean(g?.permissions?.can_edit)&&!Boolean(window.ManttoAuth?.isViewingAs?.());
  const pending=()=>new Set([...(st.contract?.pending_policy_fields||[]),...(st.contract?.derived_pending_policy_fields||[])]);
  // No es un motor de permisos: solo invalida datos ya renderizados cuando
  // cambia la identidad. El backend sigue siendo autoridad de acceso.
  function identity_cor(user){return String(user&&(user.id_SB||user.id||user.correo||user.email)||'anon');}
  function currentContext_cor(){
    const auth=window.ManttoAuth;
    if(!auth?.getToken?.())return 'NO_SESSION';
    return [identity_cor(auth.getActorUser?.()),identity_cor(auth.getUser?.()),
      identity_cor(auth.getViewUser?.())].join(':');
  }
  function isCurrentContext_cor(epoch){
    return epoch===st.contextEpoch&&currentContext_cor()===st.contextKey;
  }
  function resetSensitiveState_cor(){
    st.contextEpoch++;
    st.seq++;
    st.detailSeq++;
    st.projectsSeq++;
    st.equipmentSeq++;
    st.bulkSeq++;
    st.bulkSelected.clear();st.bulkSnapshots.clear();st.bulkTouched.clear();st.bulkConflict=false;
    st.contextKey=currentContext_cor();
    st.contract=null;st.records=[];st.projects=[];st.projectsTotal=0;st.projectRecordsTotal=0;
    st.selectedProject=null;st.projectsOffset=0;st.equipmentOffset=0;st.page='projects';
    st.filterOptions=null;st.filtersLoaded=false;st.selectedRecord=null;st.selectedSummary=null;
    st.activeGroup=null;st.editingGroup=null;st.editingDetail=false;st.users=null;st.touched.clear();st.conflict=false;
    st.loading=false;st.saving=false;
    // Mantener el esqueleto HTML y los listeners delegados ya registrados.
    // Vaciar solo nodos que pudieron contener informacion de otro contexto.
    if(view()?.dataset?.iadmCorReady==='1'){
      for(const id of ['iadm-cor-results','iadm-cor-project-pagination','iadm-cor-project-title',
        'iadm-cor-project-meta','iadm-cor-equipment-list','iadm-cor-equipment-pagination',
        'iadm-cor-group-picker','iadm-cor-groups','iadm-cor-record-title',
        'iadm-cor-record-tags','iadm-cor-system-grid','iadm-cor-search-meta',
        'iadm-cor-bulk-editor','iadm-cor-bulk-summary','iadm-cor-bulk-count']){
        const el=$(id);if(el){el.textContent='';el.innerHTML='';}
      }
      const input=$('iadm-cor-search-input');if(input)input.value='';
      for(const id of ['iadm-cor-filter-status','iadm-cor-filter-supervisor']){
        const select=$(id);if(select){select.value='';select.innerHTML='';select.disabled=false;}
      }
      if($('iadm-cor-project'))$('iadm-cor-project').hidden=true;
      if($('iadm-cor-projects'))$('iadm-cor-projects').hidden=false;
      if($('iadm-cor-bulk'))$('iadm-cor-bulk').hidden=true;
      const selected=$('iadm-cor-selected');if(selected)selected.hidden=true;
      const empty=$('iadm-cor-empty');if(empty)empty.hidden=false;
    }
    alertMessage('');status('','ready');busy(false);
  }
  function ensureContext_cor(){
    if(st.contextKey!==currentContext_cor())resetSensitiveState_cor();
    return st.contextEpoch;
  }
  function contextChangedError_cor(){
    const error=new Error('El contexto de sesion cambio; vuelve a consultar.');
    error.code='INSTALACIONES_ADMINISTRACION_CONTEXTO_CAMBIADO';
    return error;
  }
  function status(message,type){const n=$('iadm-cor-status');if(n){n.textContent=message||'';n.dataset.type=type||'ready';}}
  function alertMessage(message){const n=$('iadm-cor-alert');if(n){n.textContent=message||'';n.hidden=!message;}}
  function busy(flag){st.loading=Boolean(flag);for(const id of [
    'iadm-cor-refresh','iadm-cor-search-btn','iadm-cor-clear','iadm-cor-change-record',
    'iadm-cor-back-projects','iadm-cor-detail-edit-btn',
    'iadm-cor-bulk-open','iadm-cor-bulk-clear','iadm-cor-bulk-back','iadm-cor-bulk-save']){const n=$(id);if(n)n.disabled=st.loading||st.saving;}}
  async function api(path,opt={}){
    if(!window.ManttoAuth?.api)throw new Error('La sesion autenticada no esta disponible.');
    const epoch=ensureContext_cor();
    const data=await window.ManttoAuth.api(path,Object.assign({method:'GET',cache:'no-store'},opt));
    if(!isCurrentContext_cor(epoch))throw contextChangedError_cor();
    return data;
  }
  async function loadHtml(){
    const el=view();if(!el)throw new Error('Falta la vista Instalaciones - Administracion.');
    if(el.dataset.iadmCorReady==='1' && $('iadm-cor-projects') && $('iadm-cor-project'))return;
    const res=await fetch('./modules/instalaciones-administracion/instalaciones-administracion_cor.html?v='+VERSION_COR,{cache:'no-store'});
    if(!res.ok)throw new Error('No fue posible abrir Administracion de Instalaciones.');
    el.innerHTML=await res.text();el.dataset.iadmCorReady='1';
  }
  function isoDate(value){
    const v=raw(value);let y,m,d,r;
    if((r=/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(v))){y=+r[1];m=+r[2];d=+r[3];}
    else if((r=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v))){d=+r[1];m=+r[2];y=+r[3];}
    else return '';
    if(y<1900||y>2100||m<1||m>12||d<1||d>31)return '';
    const chk=new Date(Date.UTC(y,m-1,d));
    if(chk.getUTCFullYear()!==y||chk.getUTCMonth()!==m-1||chk.getUTCDate()!==d)return '';
    return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  }
  function display(f,v){
    if(v==null||raw(v)==='')return '--';
    if(f==='activo')return Number(v)===1?'Activo':'Inactivo';
    if(meta(f).kind==='date'){
      const iso=isoDate(v);if(iso)return iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);
    }
    return String(v);
  }
  // FIX 1: la consulta y filtrado se realiza en backend con permisos + scope.
  const PROJECTS_PAGE_SIZE_COR=20;
  const EQUIPMENTS_PAGE_SIZE_COR=30;
  function canBrowseProjects_cor(){return Boolean(groups().find(g=>g.key==='proyecto'));}
  function queryFilters_cor(offset,limit){
    const q=raw($('iadm-cor-search-input')?.value);
    const statusSelect=$('iadm-cor-filter-status');
    const supervisorSelect=$('iadm-cor-filter-supervisor');
    const estatus=statusSelect&&!statusSelect.disabled?raw(statusSelect.value):'';
    const supervisor=supervisorSelect&&!supervisorSelect.disabled?raw(supervisorSelect.value):'';
    const query=new URLSearchParams({limit:String(limit),offset:String(offset)});
    if(q)query.set('q',q);
    if(estatus)query.set('estatus',estatus);
    if(supervisor)query.set('supervisor',supervisor);
    return query.toString();
  }
  function showPage_cor(page){
    st.page=page;
    if($('iadm-cor-projects'))$('iadm-cor-projects').hidden=page!=='projects';
    if($('iadm-cor-project'))$('iadm-cor-project').hidden=page!=='equipos';
    if($('iadm-cor-selected'))$('iadm-cor-selected').hidden=page!=='detalle';
    if($('iadm-cor-bulk'))$('iadm-cor-bulk').hidden=page!=='multiple';
    if($('iadm-cor-empty'))$('iadm-cor-empty').hidden=true;
  }
  function pager_cor(hostId,offset,limit,total,kind){
    const host=$(hostId);if(!host)return;
    const start=total?offset+1:0,end=Math.min(total,offset+limit);
    host.innerHTML='<button type="button" class="iadm-cor-btn" data-page-kind="'+kind+'" data-page-direction="prev"'+(offset<=0?' disabled':'')+'>Anterior</button>'+
      '<span class="iadm-cor-page-caption">'+start+'-'+end+' de '+total+'</span>'+
      '<button type="button" class="iadm-cor-btn" data-page-kind="'+kind+'" data-page-direction="next"'+(offset+limit>=total?' disabled':'')+'>Siguiente</button>';
  }
  function projectRows_cor(){
    const host=$('iadm-cor-results'),info=$('iadm-cor-search-meta');if(!host)return;
    if(info)info.textContent=st.projectsTotal+' proyecto(s) dentro de tus filtros y alcance.';
    host.innerHTML=st.projects.length?st.projects.map(project=>
      '<button type="button" class="iadm-cor-project-card" data-project-key="'+esc(project.project_key)+'">'+
      '<span class="iadm-cor-project-main"><strong>'+esc(project.proyecto||'Proyecto sin nombre')+'</strong>'+
      '<small>'+(project.id_proyecto?'PP NS: '+esc(project.id_proyecto):'Sin PP NS · registro independiente')+'</small></span>'+
      '<span class="iadm-cor-project-count">'+Number(project.equipos||0)+' equipo(s) <span aria-hidden="true">&rarr;</span></span></button>'
    ).join(''):'<div class="iadm-cor-empty-state">No hay proyectos que coincidan con estos filtros.</div>';
    pager_cor('iadm-cor-project-pagination',st.projectsOffset,PROJECTS_PAGE_SIZE_COR,st.projectsTotal,'projects');
  }
  function equipmentRows_cor(){
    const host=$('iadm-cor-equipment-list');if(!host)return;
    if($('iadm-cor-project-title'))$('iadm-cor-project-title').textContent=st.selectedProject?.proyecto||'Proyecto sin nombre';
    if($('iadm-cor-project-meta'))$('iadm-cor-project-meta').textContent=
      (st.selectedProject?.id_proyecto?'PP NS '+st.selectedProject.id_proyecto+' · ':'')+
      st.projectRecordsTotal+' equipo(s) coincidentes. Selecciona uno para abrir su detalle.';
    const multiple=canMultiSelect_cor();
    host.innerHTML=st.records.length?st.records.map(r=>
      '<article class="iadm-cor-equipment-row" data-team-row="'+esc(r.id_ins_fl)+'"'+
      (multiple?' data-multi="true"':'')+'>'+
      (multiple?'<label class="iadm-cor-equipment-check" title="Seleccionar equipo para edicion multiple">'+
        '<input type="checkbox" data-bulk-record-id="'+esc(r.id_ins_fl)+'"'+
        (st.bulkSelected.has(Number(r.id_ins_fl))?' checked':'')+' aria-label="Seleccionar equipo '+esc(r.numero_equipo_fabrica||r.referencia_sitio||r.id_ins_fl)+'">'+
        '</label>':'')+
      '<div class="iadm-cor-equipment-main"><small>Equipo / referencia</small><strong>'+esc(r.numero_equipo_fabrica||r.referencia_sitio||'Equipo #'+r.id_ins_fl)+'</strong>'+
      '<small>'+(r.referencia_sitio?'Referencia: '+esc(r.referencia_sitio):'Registro #'+esc(r.id_ins_fl))+'</small></div>'+
      '<div class="iadm-cor-equipment-meta"><small>Tipo de equipo</small>'+esc(r.tipo_equipo||'--')+'</div>'+
      '<div class="iadm-cor-equipment-meta"><small>Estatus'+(has(r,'supervisor_display')?' / supervisor':'')+'</small>'+esc(r.estatus||'--')+
      (has(r,'supervisor_display')?'<br>'+esc(r.supervisor_display||(r.id_sup?'Usuario #'+r.id_sup:'Sin asignar')):'')+'</div>'+
      '<button type="button" class="iadm-cor-btn iadm-cor-btn-primary" data-record-id="'+esc(r.id_ins_fl)+'">Abrir detalle</button></article>'
    ).join(''):'<div class="iadm-cor-empty-state">Este proyecto no tiene equipos coincidentes con los filtros seleccionados.</div>';
    pager_cor('iadm-cor-equipment-pagination',st.equipmentOffset,EQUIPMENTS_PAGE_SIZE_COR,st.projectRecordsTotal,'equipos');
    updateBulkSelectionUi_cor();
  }
  async function loadFilterOptions_cor(){
    const epoch=ensureContext_cor();
    if(!canBrowseProjects_cor())return false;
    const data=await api(ROOT+'/filtros');
    if(!isCurrentContext_cor(epoch))return false;
    const statusNode=$('iadm-cor-filter-status');
    const supervisorNode=$('iadm-cor-filter-supervisor');
    const priorStatus=raw(statusNode?.value),priorSupervisor=raw(supervisorNode?.value);
    const statuses=Array.isArray(data.estatus)?data.estatus:[];
    const supervisors=Array.isArray(data.supervisores)?data.supervisores:[];
    st.filterOptions=data;
    if(statusNode){
      const allowed=data.permisos?.estatus===true;
      statusNode.innerHTML='<option value="">Todos los estatus</option>'+
        (allowed?statuses.map(value=>'<option value="'+esc(value)+'">'+esc(value)+'</option>').join(''):'');
      statusNode.disabled=!allowed;statusNode.value=allowed&&statuses.includes(priorStatus)?priorStatus:'';
    }
    if(supervisorNode){
      const allowed=data.permisos?.supervisor===true;
      supervisorNode.innerHTML='<option value="">Todos los supervisores</option>'+
        (allowed?supervisors.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.nombre)+'</option>').join(''):'')+
        (allowed&&data.sin_supervisor?'<option value="SIN_ASIGNAR">Sin supervisor asignado</option>':'');
      const choices=supervisors.map(u=>String(u.id));
      if(data.sin_supervisor)choices.push('SIN_ASIGNAR');
      supervisorNode.disabled=!allowed;supervisorNode.value=allowed&&choices.includes(priorSupervisor)?priorSupervisor:'';
    }
    st.filtersLoaded=true;
    return true;
  }
  async function loadProjects_cor(){
    const epoch=ensureContext_cor(),seq=++st.projectsSeq;
    if(!canBrowseProjects_cor()){
      st.projects=[];st.projectsTotal=0;
      const info=$('iadm-cor-search-meta');if(info)info.textContent='No tienes permiso para consultar Proyecto e identificacion.';
      const host=$('iadm-cor-results');if(host)host.innerHTML='';
      const pager=$('iadm-cor-project-pagination');if(pager)pager.innerHTML='';
      return false;
    }
    busy(true);status('Buscando proyectos...','loading');alertMessage('');
    try{
      const data=await api(ROOT+'/proyectos?'+queryFilters_cor(st.projectsOffset,PROJECTS_PAGE_SIZE_COR));
      if(!isCurrentContext_cor(epoch)||seq!==st.projectsSeq)return false;
      st.projects=Array.isArray(data.data)?data.data:[];
      st.projectsTotal=Number(data.total||0);projectRows_cor();status('Proyectos actualizados','ready');
      return true;
    }catch(e){
      if(!isCurrentContext_cor(epoch)||seq!==st.projectsSeq)return false;
      st.projects=[];st.projectsTotal=0;projectRows_cor();status(e.message,'error');alertMessage(e.message);return false;
    }finally{if(isCurrentContext_cor(epoch)&&seq===st.projectsSeq)busy(false);}
  }
  async function loadTeams_cor(){
    if(!st.selectedProject)return false;
    const epoch=ensureContext_cor(),seq=++st.equipmentSeq,key=st.selectedProject.project_key;
    busy(true);status('Cargando equipos...','loading');alertMessage('');
    try{
      const data=await api(ROOT+'/proyectos/'+encodeURIComponent(key)+'/equipos?'+
        queryFilters_cor(st.equipmentOffset,EQUIPMENTS_PAGE_SIZE_COR));
      if(!isCurrentContext_cor(epoch)||seq!==st.equipmentSeq||st.selectedProject?.project_key!==key)return false;
      st.records=Array.isArray(data.data)?data.data:[];
      st.projectRecordsTotal=Number(data.total||0);equipmentRows_cor();status('Equipos actualizados','ready');
      return true;
    }catch(e){
      if(!isCurrentContext_cor(epoch)||seq!==st.equipmentSeq)return false;
      st.records=[];st.projectRecordsTotal=0;equipmentRows_cor();status(e.message,'error');alertMessage(e.message);return false;
    }finally{if(isCurrentContext_cor(epoch)&&seq===st.equipmentSeq)busy(false);}
  }
  async function openProject_cor(key){
    const project=st.projects.find(item=>item.project_key===key);if(!project)return false;
    clearBulkSelection_cor();
    st.selectedProject=project;st.equipmentOffset=0;
    st.detailSeq++;st.selectedRecord=null;st.selectedSummary=null;st.editingGroup=null;st.editingDetail=false;st.touched.clear();
    showPage_cor('equipos');return loadTeams_cor();
  }
  // Compatibilidad: tras PATCH se siguen recargando inmediatamente los datos
  // afectados; ahora son dos niveles (lista de proyectos + equipos del proyecto).
  async function search(q){
    const input=$('iadm-cor-search-input');if(input&&q!==undefined)input.value=q;
    const projectsLoaded=await loadProjects_cor();
    if(!projectsLoaded)return false;
    if(st.selectedProject)return loadTeams_cor();
    return true;
  }
  function header(){
    const r=Object.assign({},st.selectedSummary||{},st.selectedRecord||{});
    if($('iadm-cor-record-title'))$('iadm-cor-record-title').textContent='Equipo '+(r.numero_equipo_fabrica||r.referencia_sitio||'#'+r.id_ins_fl);
    const tags=$('iadm-cor-record-tags');if(!tags)return;
    const values=[r.proyecto||null,r.id_proyecto?'PP NS '+r.id_proyecto:null,r.referencia_sitio?'Referencia '+r.referencia_sitio:null,
      r.numero_equipo_fabrica?'Fabrica '+r.numero_equipo_fabrica:null,r.estatus||null,
      has(r,'activo')&&Number(r.activo)===0?'Inactivo':null].filter(Boolean);
    tags.innerHTML=values.map(v=>'<span class="iadm-cor-chip">'+esc(v)+'</span>').join('');
  }
  function systemFields(){
    const host=$('iadm-cor-system-grid');if(!host)return;
    host.innerHTML=(st.contract?.system_readonly_fields||['id_ins_fl','created_at','updated_at']).map(f=>{
      let val=display(f,st.selectedRecord?.[f]);
      if((f==='created_at'||f==='updated_at')&&raw(st.selectedRecord?.[f])&&window.ManttoHumanTime?.formatMexicoCityDateTime){
        try{val=window.ManttoHumanTime.formatMexicoCityDateTime(st.selectedRecord[f]);}catch(_e){}
      }
      return '<div class="iadm-cor-system-item"><small>'+esc(label(f))+'</small><strong>'+esc(val)+'</strong></div>';
    }).join('');
  }
  function staticFields(g){
    const blocked=pending();
    return '<dl class="iadm-cor-field-grid">'+(g.fields||[]).map(f=>'<div class="iadm-cor-field"'+(blocked.has(f)?' data-policy="pending"':'')+'><dt>'+esc(label(f))+'</dt><dd>'+esc(display(f,st.selectedRecord?.[f]))+'</dd>'+
      (blocked.has(f)?'<span class="iadm-cor-field-note">Politica de edicion pendiente</span>':'')+'</div>').join('')+'</dl>';
  }
  function previewNumber(v,kind){
    const value=raw(v),text=kind==='percent'?value.replace(/%$/,'').trim():value;
    if(!/^\d+(?:\.\d{1,2})?$/.test(text))return '';
    const n=Number(text),max=kind==='percent'?100:9999999999.99;
    return Number.isFinite(n)&&n>=0&&n<=max?text:'';
  }
  function userOptions(current){
    const id=raw(current),list=Array.isArray(st.users)?st.users:[];
    const exists=list.some(u=>String(u.id_SB)===id);
    return '<option value="">Sin asignar</option>'+
      (id&&!exists?'<option value="'+esc(id)+'" selected>Usuario actual ID '+esc(id)+' (no disponible)</option>':'')+
      list.map(u=>'<option value="'+esc(u.id_SB)+'"'+(String(u.id_SB)===id?' selected':'')+'>'+esc([u.nombre,u.iniciales?'('+u.iniciales+')':'',u.puesto].filter(Boolean).join(' '))+'</option>').join('');
  }
  function formField(f,editable){
    const m=meta(f),kind=m.kind||'text',original=st.selectedRecord?.[f],val=raw(original);
    if(!editable)return '<div class="iadm-cor-form-field" data-locked="true"><label>'+esc(label(f))+'</label><span class="iadm-cor-static">'+esc(display(f,original))+'</span><small class="iadm-cor-help">Campo bloqueado por politica.</small></div>';
    const id='iadm-cor-input-'+f,attr=' id="'+id+'" name="'+esc(f)+'" data-field-control="'+esc(f)+'"';
    let control='',help='',legacy='';
    if(kind==='user')control='<select'+attr+'>'+userOptions(original)+'</select>';
    else if(kind==='boolean')control='<select'+attr+'><option value="1"'+(Number(original)!==0?' selected':'')+'>Activo</option><option value="0"'+(Number(original)===0?' selected':'')+'>Inactivo</option></select>';
    else if(kind==='date'){
      const iso=isoDate(original);
      control='<input type="date"'+attr+' value="'+esc(iso)+'" min="1900-01-01" max="2100-12-31">';
      help='Fecha visible DD/MM/AAAA; almacenamiento AAAA-MM-DD.';
      if(val&&!iso)legacy=val;
    }else if(kind==='percent'||kind==='money'){
      const n=previewNumber(original,kind);
      control='<input type="number"'+attr+' min="0" max="'+(kind==='percent'?'100':'9999999999.99')+'" step="0.01" inputmode="decimal" value="'+esc(n)+'">';
      help=kind==='percent'?'Porcentaje 0-100 (2 decimales).':'Monto sin simbolo de moneda (2 decimales).';
      if(val&&!n)legacy=val;
    }else if(kind==='textarea'){
      control='<textarea'+attr+' rows="3" maxlength="'+Number(m.max_length||20000)+'">'+esc(original??'')+'</textarea>';
    }else{
      control='<input type="text"'+attr+' maxlength="'+Number(m.max_length||20000)+'" value="'+esc(original??'')+'">';
    }
    return '<div class="iadm-cor-form-field" data-field-wrap="'+esc(f)+'" data-changed="false">'+
      '<label for="'+id+'">'+esc(label(f))+'</label>'+control+
      (help?'<small class="iadm-cor-help">'+esc(help)+'</small>':'')+
      (legacy?'<small class="iadm-cor-help iadm-cor-legacy">Valor legado: '+esc(legacy)+'</small>':'')+
      (kind!=='boolean'?'<span class="iadm-cor-inline-actions"><button type="button" class="iadm-cor-btn iadm-cor-btn-compact" data-clear-field="'+esc(f)+'">Vaciar campo</button></span>':'')+
      '<small class="iadm-cor-help" data-field-error="'+esc(f)+'" data-error="true" hidden></small></div>';
  }
  // FIX 2: detalle por equipo con secciones y un unico formulario para
  // todos los grupos EDITAR autorizados (un solo registro ins_fl).
  function detailGroup_cor(g,first){
    const editable=st.editingDetail&&canEdit(g);
    const allowed=new Set(g.editable_fields||[]);
    const content=editable
      ? '<div class="iadm-cor-form-fields">'+(g.fields||[]).map(f=>formField(f,allowed.has(f))).join('')+'</div>'
      : staticFields(g);
    const mode=canEdit(g)?(st.editingDetail?'Editable':'Edicion autorizada'):'Solo lectura';
    return '<details class="iadm-cor-group iadm-cor-detail-section" data-detail-group="'+esc(g.key)+'"'+(first?' open':'')+'>'+
      '<summary><span>'+esc(g.label||g.key)+'</span>'+
      '<small class="iadm-cor-group-badge" data-edit="'+(canEdit(g)?'1':'0')+'">'+mode+'</small>'+
      '<small class="iadm-cor-changes-badge" data-group-dirty="'+esc(g.key)+'" hidden></small></summary>'+
      '<div class="iadm-cor-detail-group-description">'+
        (editable?'Puedes modificar varios campos de esta seccion; se guardaran junto con los de otras secciones.':
          (st.editingDetail?'Esta seccion permanece de solo lectura.':'Datos autorizados del equipo.'))+
      '</div>'+content+'</details>';
  }
  function groupPicker(){
    const host=$('iadm-cor-group-picker');if(!host)return;
    const visible=groups();
    if(!visible.length){host.innerHTML='<div class="iadm-cor-empty-state">No hay secciones autorizadas.</div>';return;}
    if(!visible.some(g=>g.key===st.activeGroup))st.activeGroup=visible[0].key;
    host.innerHTML=visible.map(g=>'<button type="button" class="iadm-cor-group-button'+
      (g.key===st.activeGroup?' active':'')+'" data-group-key="'+esc(g.key)+'" aria-pressed="'+
      (g.key===st.activeGroup?'true':'false')+'"><span>'+esc(g.label||g.key)+'</span>'+
      '<small data-edit="'+(canEdit(g)?'1':'0')+'">'+(canEdit(g)?'EDITAR':'VER')+'</small></button>').join('');
  }
  function renderGroups_cor(){
    const host=$('iadm-cor-groups');if(!host)return;
    const visible=groups();
    if(!visible.length){host.innerHTML='<div class="iadm-cor-empty-state">Tu usuario no tiene secciones visibles.</div>';return;}
    const sections=visible.map((g,index)=>detailGroup_cor(g,index===0)).join('');
    if(!st.editingDetail){host.innerHTML='<div class="iadm-cor-detail-groups">'+sections+'</div>';return;}
    host.innerHTML='<form id="iadm-cor-edit-form" class="iadm-cor-form iadm-cor-detail-form" novalidate>'+
      '<div id="iadm-cor-conflict" class="iadm-cor-form-hint"'+(st.conflict?'':' hidden')+'>'+
      (st.conflict?'Otro proceso modifico el equipo. Actualiza antes de volver a guardar.':'')+'</div>'+
      '<div class="iadm-cor-detail-groups">'+sections+'</div>'+
      '<div class="iadm-cor-form-footer iadm-cor-detail-footer">'+
      '<span class="iadm-cor-form-count" id="iadm-cor-form-count">Sin cambios pendientes</span>'+
      '<div class="iadm-cor-form-actions">'+
      '<button class="iadm-cor-btn" type="button" data-action="cancel-edit">Cancelar edicion</button>'+
      '<button class="iadm-cor-btn iadm-cor-btn-primary" id="iadm-cor-save-btn" type="submit" disabled>Guardar cambios del equipo</button>'+
      '</div></div></form>';
    updateDirtyUi();
  }
  function renderRecord(){
    showPage_cor('detalle');
    header();groupPicker();renderGroups_cor();systemFields();
    const action=$('iadm-cor-detail-edit-btn');
    if(action){
      action.hidden=st.editingDetail||!groups().some(g=>canEdit(g));
      action.disabled=st.loading||st.saving;
    }
    const hint=$('iadm-cor-detail-hint');
    if(hint)hint.textContent=st.editingDetail
      ? 'Editando un solo equipo. Los cambios de todas las secciones se guardan juntos.'
      : 'Abre las secciones para consultar los datos; selecciona Editar ficha para modificar varios campos a la vez.';
    if(window.ManttoPermissions?.apply)window.ManttoPermissions.apply(view()||document);
  }
  function readControl(f,inputPrefix='iadm-cor-input-'){
    const input=$(inputPrefix+f);if(!input)return {ok:false,error:'Falta el campo.'};
    const kind=meta(f).kind||'text',v=raw(input.value);
    if(kind==='boolean')return ['0','1'].includes(v)?{ok:true,value:Number(v)}:{ok:false,error:'Selecciona un valor valido.'};
    if(kind==='user'){
      if(!v)return {ok:true,value:null};
      return /^\d+$/.test(v)&&Number.isSafeInteger(+v)&&+v>0?{ok:true,value:+v}:{ok:false,error:'Selecciona un usuario valido.'};
    }
    if(!v)return {ok:true,value:null};
    if(kind==='date')return isoDate(v)===v?{ok:true,value:v}:{ok:false,error:'Fecha invalida (1900-2100).'};
    if(kind==='percent'||kind==='money'){
      const max=kind==='percent'?100:9999999999.99;
      if(!/^\d{1,12}(?:\.\d{1,2})?$/.test(v)||+v>max)return {ok:false,error:'Numero no valido o fuera de rango (2 decimales).'};
      return {ok:true,value:kind==='percent'?v+'%':v};
    }
    if(v.length>Number(meta(f).max_length||20000))return {ok:false,error:'Texto demasiado largo.'};
    return {ok:true,value:v};
  }
  function comparable(v){return v===null||v===undefined||v===''?null:String(v).trim();}
  function canonicalCompare(f,value){
    const kind=meta(f).kind;
    if(kind==='date')return isoDate(value)||comparable(value);
    if(kind==='percent'){
      const v=previewNumber(value,kind);return v!==''?String(Number(v))+'%':comparable(value);
    }
    if(kind==='money'){
      const v=previewNumber(value,kind);return v!==''?String(Number(v)):comparable(value);
    }
    return comparable(value);
  }
  function changedPayload(){
    const groupPayload={},errors={};
    if(!st.editingDetail||!st.selectedRecord)return {groups:groupPayload,errors};
    for(const g of groups()){
      if(!canEdit(g))continue;
      const allowed=new Set(g.editable_fields||[]),changes={},expected={};
      for(const f of st.touched){
        if(!allowed.has(f))continue;
        const result=readControl(f);
        if(!result.ok){errors[f]=result.error;continue;}
        const before=has(st.selectedRecord,f)?st.selectedRecord[f]:null;
        if(canonicalCompare(f,before)===canonicalCompare(f,result.value))continue;
        changes[f]=result.value;expected[f]=before;
      }
      if(Object.keys(changes).length)groupPayload[g.key]={changes,expected};
    }
    return {groups:groupPayload,errors};
  }
  function updateDirtyUi(){
    if(!st.editingDetail)return;
    const payload=changedPayload(),invalid=Object.keys(payload.errors);
    const edits=Object.values(payload.groups).reduce((n,g)=>n+Object.keys(g.changes).length,0);
    const count=$('iadm-cor-form-count');
    if(count)count.textContent=invalid.length?invalid.length+' campo(s) con error':
      edits?edits+' campo(s) en '+Object.keys(payload.groups).length+' seccion(es)':'Sin cambios pendientes';
    const save=$('iadm-cor-save-btn');
    if(save)save.disabled=Boolean(!edits||invalid.length||st.loading||st.saving||st.conflict);
    for(const g of groups()){
      const changed=payload.groups[g.key]?.changes||{};
      const badge=view()?.querySelector('[data-group-dirty="'+g.key+'"]');
      if(badge){const total=Object.keys(changed).length;badge.textContent=total+' cambio(s)';badge.hidden=!total;}
      for(const f of g.fields||[]){
        const wrap=view()?.querySelector('[data-field-wrap="'+f+'"]');
        if(wrap){wrap.dataset.changed=has(changed,f)?'true':'false';wrap.dataset.invalid=has(payload.errors,f)?'true':'false';}
        const err=view()?.querySelector('[data-field-error="'+f+'"]');
        if(err){err.textContent=payload.errors[f]||'';err.hidden=!has(payload.errors,f);}
      }
    }
  }
  function hasUnsaved(){
    const p=changedPayload();
    return Object.keys(p.groups).length>0||Object.keys(p.errors).length>0||
      (st.page==='multiple'&&st.bulkTouched.size>0);
  }
  function confirmLeave(){return !st.saving&&(!hasUnsaved()||window.confirm('Hay cambios sin guardar. Deseas descartarlos?'));}
  function clearSelection(){
    // Invalida GET anteriores y descarta cualquier formulario parcial.
    st.detailSeq++;
    st.editingGroup=null;st.editingDetail=false;st.touched.clear();st.conflict=false;
    st.selectedRecord=null;st.selectedSummary=null;st.activeGroup=null;
    showPage_cor(st.selectedProject?'equipos':'projects');
  }
  async function openRecord(id){
    const numeric=Number(id);if(!Number.isSafeInteger(numeric)||numeric<=0)return;
    const epoch=ensureContext_cor(),seq=++st.detailSeq;
    st.selectedSummary=st.records.find(r=>Number(r.id_ins_fl)===numeric)||{};
    busy(true);status('Cargando registro...','loading');alertMessage('');
    try{
      const response=await api(ROOT+'/registros/'+encodeURIComponent(numeric));
      if(!isCurrentContext_cor(epoch)||seq!==st.detailSeq)return false;
      st.selectedRecord=response.data||{};
      st.selectedSummary=Object.assign({},st.selectedSummary,st.selectedRecord);
      st.editingGroup=null;st.editingDetail=false;st.touched.clear();st.conflict=false;
      if(!groups().some(g=>g.key===st.activeGroup))st.activeGroup=groups()[0]?.key||null;
      renderRecord();status('Registro cargado','ready');
      return true;
    }catch(e){if(isCurrentContext_cor(epoch)&&seq===st.detailSeq){status(e.message,'error');alertMessage(e.message);}return false;}
    finally{if(isCurrentContext_cor(epoch)&&seq===st.detailSeq)busy(false);}
  }
  async function loadContract(){const epoch=ensureContext_cor();const contract=await api(ROOT+'/contrato');if(!isCurrentContext_cor(epoch))return false;st.contract=contract;return true;}
  async function loadUsers(){
    if(Array.isArray(st.users))return st.users;
    const epoch=ensureContext_cor(),response=await api(ROOT+'/usuarios');
    if(!isCurrentContext_cor(epoch))throw contextChangedError_cor();
    st.users=Array.isArray(response.data)?response.data:[];
    return st.users;
  }
  async function startEdit(){
    const epoch=ensureContext_cor();
    if(st.saving||st.loading||!st.selectedRecord||st.editingDetail)return;
    const id=Number(st.selectedRecord.id_ins_fl);
    const editable=groups().filter(g=>canEdit(g));
    if(!editable.length)return;
    status('Preparando ficha...','loading');
    try{
      if(editable.some(g=>(g.editable_fields||[]).some(f=>USER_IDS.has(f))))await loadUsers();
      if(!isCurrentContext_cor(epoch)||Number(st.selectedRecord?.id_ins_fl)!==id)return;
      st.editingDetail=true;st.editingGroup=null;st.touched.clear();st.conflict=false;
      alertMessage('');renderRecord();status('Editando ficha de equipo','ready');
    }catch(e){if(isCurrentContext_cor(epoch)){status(e.message,'error');alertMessage(e.message);}}
  }
  async function save(){
    const epoch=ensureContext_cor();
    if(!st.editingDetail||!st.selectedRecord||st.saving)return;
    const id=Number(st.selectedRecord.id_ins_fl),p=changedPayload();
    if(!Object.keys(p.groups).length||Object.keys(p.errors).length||st.conflict){updateDirtyUi();return;}
    st.saving=true;busy(true);status('Guardando equipo...','loading');alertMessage('');updateDirtyUi();
    let committed=false;
    try{
      // UNA solicitud a UN registro; todos los grupos se verifican y se
      // auditan en UNA transaccion backend. No es un guardado masivo.
      const response=await api(ROOT+'/registros/'+encodeURIComponent(id)+'/detalle',{
        method:'PATCH',body:JSON.stringify({groups:p.groups})
      });
      if(!isCurrentContext_cor(epoch))return;
      committed=true;
      clearBulkSelection_cor();
      st.editingDetail=false;st.editingGroup=null;st.touched.clear();st.conflict=false;
      let detailReloaded=true;
      try{
        const fresh=await api(ROOT+'/registros/'+encodeURIComponent(id));
        if(!isCurrentContext_cor(epoch))return;
        st.selectedRecord=fresh.data||{};
        st.selectedSummary={...st.selectedRecord};
        renderRecord();
      }catch(e){
        if(!isCurrentContext_cor(epoch))return;
        detailReloaded=false;clearSelection();
        alertMessage('Guardado confirmado, pero no fue posible recargar el equipo. Vuelve a buscarlo. '+e.message);
      }
      await loadFilterOptions_cor();
      if(!isCurrentContext_cor(epoch))return;
      const listReloaded=await search(raw($('iadm-cor-search-input')?.value));
      if(!isCurrentContext_cor(epoch))return;
      if(!detailReloaded||!listReloaded){
        status('Guardado confirmado; recarga pendiente','error');
        if(detailReloaded)alertMessage('Los datos se guardaron, pero la lista no se pudo actualizar. Intenta Actualizar.');
        return;
      }
      status(response.changed?'Equipo guardado y auditado':'Sin diferencias nuevas','ready');
    }catch(e){
      if(!isCurrentContext_cor(epoch))return;
      if(committed){status('Guardado; consulta pendiente','ready');return;}
      if(e.status===409&&e.code==='INSTALACIONES_ADMINISTRACION_CONFLICTO_CONCURRENCIA'){
        st.conflict=true;
        const msg=$('iadm-cor-conflict');
        if(msg){msg.hidden=false;msg.textContent=e.message+' Usa Actualizar para recuperar el equipo.';}
      }
      if(e.status===404)clearSelection();
      status(e.message,'error');alertMessage(e.message);
    }finally{if(isCurrentContext_cor(epoch)){st.saving=false;busy(false);updateDirtyUi();}}
  }
  async function refresh(options={}){
    const epoch=ensureContext_cor();
    if(st.saving||st.loading)return;
    if(!options.force&&!confirmLeave())return;
    const recordId=st.selectedRecord?.id_ins_fl||options.recordId;
    st.editingGroup=null;st.editingDetail=false;st.touched.clear();st.conflict=false;
    clearBulkSelection_cor();
    busy(true);status('Actualizando...','loading');alertMessage('');
    try{
      await loadContract();
      if(!isCurrentContext_cor(epoch))return;
      await loadFilterOptions_cor();
      if(!isCurrentContext_cor(epoch))return;
      const listReloaded=await search(raw($('iadm-cor-search-input')?.value));
      if(!isCurrentContext_cor(epoch))return;
      if(!listReloaded)return;
      if(recordId){
        const detailReloaded=await openRecord(recordId);
        if(!isCurrentContext_cor(epoch)||!detailReloaded)return;
      }
      status('Actualizado','ready');
    }catch(e){if(isCurrentContext_cor(epoch)){status(e.message,'error');alertMessage(e.message);}}
    finally{if(isCurrentContext_cor(epoch))busy(false);}
  }
  function backToProjects_cor(){
    clearBulkSelection_cor();
    st.selectedProject=null;st.records=[];st.projectRecordsTotal=0;st.equipmentOffset=0;
    st.equipmentSeq++;clearSelection();showPage_cor('projects');
  }
  function applyFilters_cor(){
    if(!confirmLeave())return;
    st.projectsOffset=0;backToProjects_cor();search(raw($('iadm-cor-search-input')?.value));
  }

  // FIX 3: seleccion persistente solamente mientras permanece el mismo proyecto.
  // Se invalidan snapshots al cambiar permisos/identidad/proyecto, sin almacenar
  // informacion operativa en almacenamiento persistente del dispositivo.
  const MAX_BULK_COR=20;
  function canMultiSelect_cor(){
    return Boolean(st.selectedProject?.project_key?.startsWith('P:'))&&
      groups().some(g=>canEdit(g)&&(g.editable_fields||[]).length>0)&&
      !Boolean(window.ManttoAuth?.isViewingAs?.());
  }
  function clearBulkSelection_cor(){
    st.bulkSeq++;
    st.bulkSelected.clear();st.bulkSnapshots.clear();st.bulkTouched.clear();st.bulkConflict=false;
    for(const id of ['iadm-cor-bulk-editor','iadm-cor-bulk-summary']){const n=$(id);if(n)n.textContent='';}
    updateBulkSelectionUi_cor();
  }
  function updateBulkSelectionUi_cor(){
    const bar=$('iadm-cor-bulk-bar'),count=$('iadm-cor-bulk-count'),button=$('iadm-cor-bulk-open');
    const allow=canMultiSelect_cor();
    if(bar)bar.hidden=!allow;
    if(count)count.textContent=st.bulkSelected.size+' de '+MAX_BULK_COR+' equipos seleccionados (solo este proyecto).';
    if(button)button.disabled=!allow||st.bulkSelected.size<2||st.loading||st.saving;
  }
  function toggleBulkSelection_cor(id,checked){
    if(!canMultiSelect_cor()||st.saving||st.loading||st.page!=='equipos')return false;
    const record=st.records.find(r=>Number(r.id_ins_fl)===Number(id));
    if(!record||!Number.isSafeInteger(Number(id))||Number(id)<=0)return false;
    if(String(record.id_proyecto??'')!==String(st.selectedProject?.id_proyecto??''))return false;
    if(checked&&st.bulkSelected.size>=MAX_BULK_COR&&!st.bulkSelected.has(Number(id))){
      alertMessage('Maximo '+MAX_BULK_COR+' equipos por operacion. Puedes realizar otros lotes despues.');return false;
    }
    if(checked)st.bulkSelected.set(Number(id),{...record});
    else st.bulkSelected.delete(Number(id));
    alertMessage('');updateBulkSelectionUi_cor();return true;
  }
  function editableBulkGroups_cor(){
    return groups().filter(g=>canEdit(g)&&(g.editable_fields||[]).length>0);
  }
  function bulkField_cor(f){
    const m=meta(f),kind=m.kind||'text',id='iadm-cor-bulk-input-'+f;
    const attr=' id="'+id+'" data-bulk-control="'+esc(f)+'" disabled';
    let control='',help='Dejar vacio y marcar aplicar eliminara el valor de este campo.';
    if(kind==='user')control='<select'+attr+'>'+userOptions(null)+'</select>';
    else if(kind==='boolean')control='<select'+attr+'><option value="">Selecciona un valor</option><option value="1">Activo</option><option value="0">Inactivo</option></select>';
    else if(kind==='date'){
      control='<input type="date"'+attr+' min="1900-01-01" max="2100-12-31">';
      help='Fecha: DD/MM/AAAA en pantalla; valor guardado AAAA-MM-DD. Vaciar = eliminar.';
    }else if(kind==='percent'||kind==='money'){
      control='<input type="number"'+attr+' min="0" max="'+(kind==='percent'?'100':'9999999999.99')+'" step="0.01" inputmode="decimal">';
      help=kind==='percent'?'Porcentaje 0-100.':'Monto no negativo con maximo 2 decimales.';
    }else if(kind==='textarea')control='<textarea'+attr+' rows="3" maxlength="'+Number(m.max_length||20000)+'"></textarea>';
    else control='<input type="text"'+attr+' maxlength="'+Number(m.max_length||20000)+'">';
    return '<div class="iadm-cor-form-field iadm-cor-bulk-field" data-bulk-field-wrap="'+esc(f)+'" data-changed="false">'+
      '<label class="iadm-cor-bulk-apply"><input type="checkbox" data-bulk-apply-field="'+esc(f)+'">'+
      '<span>Aplicar a todos: '+esc(label(f))+'</span></label>'+control+
      '<small class="iadm-cor-help">'+esc(help)+'</small>'+ 
      '<small class="iadm-cor-help" data-bulk-error="'+esc(f)+'" data-error="true" hidden></small></div>';
  }
  function renderBulkEditor_cor(){
    const summary=$('iadm-cor-bulk-summary'),host=$('iadm-cor-bulk-editor');
    if(summary){
      const selected=[...st.bulkSelected.values()];
      summary.innerHTML='<strong>'+selected.length+' equipos del proyecto '+esc(st.selectedProject?.proyecto||st.selectedProject?.id_proyecto||'')+'</strong>'+ 
        '<p>Solo los campos marcados se aplicaran a todos los equipos; se respeta la informacion original no seleccionada.</p>'+ 
        '<ul class="iadm-cor-bulk-picks">'+selected.map(r=>'<li>'+esc(r.numero_equipo_fabrica||r.referencia_sitio||'#'+r.id_ins_fl)+'</li>').join('')+'</ul>';
    }
    if(!host)return;
    const editable=editableBulkGroups_cor();
    host.innerHTML='<form id="iadm-cor-bulk-form" class="iadm-cor-form" novalidate>'+ 
      (st.bulkConflict?'<div class="iadm-cor-form-hint">Conflicto detectado. Cancela y vuelve a abrir para obtener datos actuales; no se reintenta automaticamente.</div>':'')+
      editable.map((g,index)=>'<details class="iadm-cor-group iadm-cor-detail-section"'+(index===0?' open':'')+'>'+ 
        '<summary>'+esc(g.label||g.key)+'</summary>'+ 
        '<div class="iadm-cor-form-fields">'+(g.editable_fields||[]).map(bulkField_cor).join('')+'</div></details>').join('')+
      '<div class="iadm-cor-form-footer iadm-cor-detail-footer"><span class="iadm-cor-form-count" id="iadm-cor-bulk-form-count">Marca los campos a modificar</span>'+ 
      '<div class="iadm-cor-form-actions"><button class="iadm-cor-btn" type="button" data-bulk-action="cancel">Cancelar</button>'+ 
      '<button class="iadm-cor-btn iadm-cor-btn-primary" type="submit" id="iadm-cor-bulk-save" disabled>Revisar y guardar lote</button></div></div></form>';
    updateBulkDirtyUi_cor();
    if(window.ManttoPermissions?.apply)window.ManttoPermissions.apply(view()||document);
  }
  function bulkPayload_cor(){
    const errors={},groupsPayload={},expected={};
    if(st.page!=='multiple')return {groups:groupsPayload,expected,errors};
    const groupsWritable=editableBulkGroups_cor();
    for(const group of groupsWritable){
      const changes={};
      for(const f of group.editable_fields||[]){
        if(!st.bulkTouched.has(f))continue;
        const result=readControl(f,'iadm-cor-bulk-input-');
        if(!result.ok){errors[f]=result.error;continue;}
        changes[f]=result.value;
      }
      if(Object.keys(changes).length)groupsPayload[group.key]={changes};
    }
    if(st.bulkTouched.size&&!Object.keys(groupsPayload).length&&!Object.keys(errors).length)errors.selection='No hay campos editables autorizados.';
    if(st.bulkSelected.size<2||st.bulkSelected.size>MAX_BULK_COR)errors.selection='Seleccion de equipos invalida.';
    if(st.bulkSnapshots.size!==st.bulkSelected.size)errors.selection='Falta informacion original. Vuelve a abrir la edicion.';
    const allFields=Object.values(groupsPayload).flatMap(g=>Object.keys(g.changes));
    if(allFields.length>40)errors.selection='Maximo 40 campos por lote.';
    for(const id of st.bulkSelected.keys()){
      const row=st.bulkSnapshots.get(id);
      if(!row){errors.selection='Falta consultar uno de los equipos.';continue;}
      const originals={};
      for(const field of allFields){
        if(!has(row,field)){errors.selection='Falta la lectura autorizada de '+label(field);continue;}
        originals[field]=row[field];
      }
      expected[id]=originals;
    }
    return {groups:groupsPayload,expected,errors};
  }
  function updateBulkDirtyUi_cor(){
    if(st.page!=='multiple')return;
    const payload=bulkPayload_cor();
    const changes=Object.values(payload.groups).reduce((n,g)=>n+Object.keys(g.changes).length,0);
    const errors=Object.keys(payload.errors),count=$('iadm-cor-bulk-form-count'),saveBtn=$('iadm-cor-bulk-save');
    if(count)count.textContent=errors.length?errors.length+' error(es) pendientes':
      changes?changes+' campo(s) para '+st.bulkSelected.size+' equipos':'Selecciona los campos que deseas aplicar';
    if(saveBtn)saveBtn.disabled=!changes||Boolean(errors.length)||st.loading||st.saving||st.bulkConflict;
    for(const g of editableBulkGroups_cor()){
      for(const f of g.editable_fields||[]){
        const apply=st.bulkTouched.has(f),input=$('iadm-cor-bulk-input-'+f);
        if(input)input.disabled=!apply||st.loading||st.saving;
        const wrap=view()?.querySelector('[data-bulk-field-wrap="'+f+'"]');
        if(wrap){wrap.dataset.changed=apply?'true':'false';wrap.dataset.invalid=has(payload.errors,f)?'true':'false';}
        const error=view()?.querySelector('[data-bulk-error="'+f+'"]');
        if(error){error.textContent=payload.errors[f]||'';error.hidden=!has(payload.errors,f);}
      }
    }
  }
  async function openBulk_cor(){
    const epoch=ensureContext_cor(),seq=++st.bulkSeq;
    if(st.loading||st.saving||!canMultiSelect_cor()||st.bulkSelected.size<2||st.bulkSelected.size>MAX_BULK_COR||st.page!=='equipos')return false;
    const key=st.selectedProject.project_key,ids=[...st.bulkSelected.keys()];
    busy(true);status('Preparando equipos seleccionados...','loading');alertMessage('');
    try{
      const snapshots=new Map();
      // Se leen nuevamente desde backend con permiso de cada grupo.
      // Concurrencia de red acotada: como maximo cuatro GET simultaneos.
      // Nunca se usa el resumen del listado como expected para guardar.
      for(let start=0;start<ids.length;start+=4){
        const chunk=ids.slice(start,start+4);
        const responses=await Promise.all(chunk.map(id=>api(ROOT+'/registros/'+encodeURIComponent(id))));
        if(!isCurrentContext_cor(epoch)||seq!==st.bulkSeq||key!==st.selectedProject?.project_key)return false;
        for(let pos=0;pos<chunk.length;pos++){
          const id=chunk[pos],row=responses[pos]?.data;
          if(!row||Number(row.id_ins_fl)!==id||String(row.id_proyecto??'')!==key.slice(2))
            throw new Error('Un equipo ya no pertenece al proyecto seleccionado. Actualiza la lista.');
          snapshots.set(id,{...row});
        }
      }
      if(editableBulkGroups_cor().some(g=>(g.editable_fields||[]).some(f=>USER_IDS.has(f))))await loadUsers();
      if(!isCurrentContext_cor(epoch)||seq!==st.bulkSeq||key!==st.selectedProject?.project_key)return false;
      st.bulkSnapshots=snapshots;st.bulkTouched.clear();st.bulkConflict=false;
      showPage_cor('multiple');renderBulkEditor_cor();status('Edicion multiple preparada','ready');
      return true;
    }catch(e){
      if(isCurrentContext_cor(epoch)&&seq===st.bulkSeq){status(e.message,'error');alertMessage(e.message);}
      return false;
    }finally{
      if(isCurrentContext_cor(epoch)&&seq===st.bulkSeq){busy(false);updateBulkDirtyUi_cor();}
    }
  }
  async function saveBulk_cor(){
    const epoch=ensureContext_cor();
    if(st.page!=='multiple'||st.saving||st.loading||st.bulkConflict||!canMultiSelect_cor())return;
    const payload=bulkPayload_cor();
    if(!Object.keys(payload.groups).length||Object.keys(payload.errors).length){updateBulkDirtyUi_cor();return;}
    const key=st.selectedProject.project_key,ids=[...st.bulkSelected.keys()];
    const names=Object.values(payload.groups).flatMap(g=>Object.keys(g.changes)).map(label);
    const preview='Aplicar '+names.join(', ')+' a '+ids.length+' equipos del mismo proyecto?'+
      '\nEsta operacion tiene auditoria por equipo. Solo se guardan los campos marcados.';
    if(!window.confirm(preview))return;
    st.saving=true;busy(true);status('Guardando equipos seleccionados...','loading');alertMessage('');updateBulkDirtyUi_cor();
    let committed=false;
    try{
      const result=await api(ROOT+'/proyectos/'+encodeURIComponent(key)+'/equipos/edicion-multiple',{
        method:'PATCH',body:JSON.stringify({ids,groups:payload.groups,expected:payload.expected})
      });
      if(!isCurrentContext_cor(epoch))return;
      committed=true;
      clearBulkSelection_cor();
      // El PATCH puede modificar el alcance: cerrar datos anteriores antes de cualquier GET.
      st.records=[];st.projectRecordsTotal=0;showPage_cor('equipos');equipmentRows_cor();
      const listOk=await loadTeams_cor();
      if(!isCurrentContext_cor(epoch))return;
      if(!listOk){
        status('Guardado confirmado; lista pendiente','error');
        alertMessage('Los cambios se guardaron y auditaron, pero no se pudo recargar la lista. Pulsa Actualizar.');
        return;
      }
      // Refresco selectivo inmediato: filtros y proyectos afectados.
      const filterOk=await loadFilterOptions_cor();
      if(!isCurrentContext_cor(epoch))return;
      const projectsOk=await loadProjects_cor();
      if(!isCurrentContext_cor(epoch))return;
      if(!filterOk||!projectsOk){
        status('Guardado confirmado; refresco parcial pendiente','error');
        alertMessage('Cambios confirmados. Los filtros o proyectos requieren Actualizar.');
      }else status(result.updated?result.updated+' de '+result.selected+' equipo(s) actualizados y auditados':'Sin diferencias nuevas','ready');
    }catch(e){
      if(!isCurrentContext_cor(epoch))return;
      if(committed){status('Guardado confirmado; refresco pendiente','error');alertMessage('Cambios confirmados; pulsa Actualizar para refrescar la vista.');return;}
      if(e.status===409){st.bulkConflict=true;updateBulkDirtyUi_cor();}
      status(e.message,'error');alertMessage(e.message);
    }finally{if(isCurrentContext_cor(epoch)){st.saving=false;busy(false);updateBulkDirtyUi_cor();}}
  }

  function bind(){
    if(st.bound)return;st.bound=true;
    $('iadm-cor-search-form')?.addEventListener('submit',e=>{e.preventDefault();applyFilters_cor();});
    for(const id of ['iadm-cor-filter-status','iadm-cor-filter-supervisor']){
      $(id)?.addEventListener('change',()=>applyFilters_cor());
    }
    $('iadm-cor-clear')?.addEventListener('click',()=>{
      if(!confirmLeave())return;
      const input=$('iadm-cor-search-input');if(input)input.value='';
      for(const id of ['iadm-cor-filter-status','iadm-cor-filter-supervisor']){
        const n=$(id);if(n)n.value='';
      }
      st.projectsOffset=0;backToProjects_cor();search('');
    });
    $('iadm-cor-refresh')?.addEventListener('click',()=>refresh());
    $('iadm-cor-back-projects')?.addEventListener('click',()=>{if(confirmLeave())backToProjects_cor();});
    $('iadm-cor-bulk-open')?.addEventListener('click',()=>{openBulk_cor().catch(()=>{});});
    $('iadm-cor-bulk-clear')?.addEventListener('click',()=>{clearBulkSelection_cor();equipmentRows_cor();});
    $('iadm-cor-bulk-back')?.addEventListener('click',()=>{if(confirmLeave()){st.bulkSeq++;st.bulkSnapshots.clear();st.bulkTouched.clear();st.bulkConflict=false;
        for(const id of ['iadm-cor-bulk-editor','iadm-cor-bulk-summary']){const n=$(id);if(n)n.textContent='';}
        showPage_cor('equipos');equipmentRows_cor();}});
    $('iadm-cor-change-record')?.addEventListener('click',()=>{if(confirmLeave())clearSelection();});
    view()?.addEventListener('click',e=>{
      const bulkAction=e.target.closest('[data-bulk-action]')?.dataset?.bulkAction;
      if(bulkAction==='cancel'&&confirmLeave()){st.bulkSeq++;st.bulkSnapshots.clear();st.bulkTouched.clear();st.bulkConflict=false;
        for(const id of ['iadm-cor-bulk-editor','iadm-cor-bulk-summary']){const n=$(id);if(n)n.textContent='';}
        showPage_cor('equipos');equipmentRows_cor();return;}
      const record=e.target.closest('[data-record-id]');
      if(record){if(confirmLeave())openRecord(record.dataset.recordId);return;}
      const project=e.target.closest('[data-project-key]');
      if(project){if(confirmLeave())openProject_cor(project.dataset.projectKey);return;}
      const pager=e.target.closest('[data-page-kind][data-page-direction]');
      if(pager&&!pager.disabled&&confirmLeave()){
        const dir=pager.dataset.pageDirection==='next'?1:-1;
        if(pager.dataset.pageKind==='projects'){
          st.projectsOffset=Math.max(0,st.projectsOffset+dir*PROJECTS_PAGE_SIZE_COR);
          loadProjects_cor();
        }else if(st.selectedProject){
          st.equipmentOffset=Math.max(0,st.equipmentOffset+dir*EQUIPMENTS_PAGE_SIZE_COR);
          loadTeams_cor();
        }
        return;
      }
      const grp=e.target.closest('[data-group-key]');
      if(grp){
        const key=grp.dataset.groupKey;
        if(!groups().some(g=>g.key===key))return;
        st.activeGroup=key;
        $('iadm-cor-group-picker')?.querySelectorAll('[data-group-key]')?.forEach(b=>{
          const active=b.dataset.groupKey===key;
          b.classList.toggle('active',active);b.setAttribute('aria-pressed',active?'true':'false');
        });
        const section=view()?.querySelector('[data-detail-group="'+key+'"]');
        if(section){section.open=true;section.scrollIntoView?.({behavior:'smooth',block:'start'});}
        return;
      }
      const clear=e.target.closest('[data-clear-field]');
      if(clear){
        const field=clear.dataset.clearField,input=$('iadm-cor-input-'+field);
        if(input&&st.editingDetail){input.value='';st.touched.add(field);updateDirtyUi();}return;
      }
      const action=e.target.closest('[data-action]')?.dataset.action;
      if(action==='start-edit')startEdit();
      if(action==='cancel-edit'&&confirmLeave()){
        st.editingDetail=false;st.touched.clear();st.conflict=false;
        renderRecord();status('Edicion cancelada','ready');
      }
    });
    for(const type of ['input','change'])view()?.addEventListener(type,e=>{
      const field=e.target?.dataset?.fieldControl;
      if(field&&st.editingDetail){st.touched.add(field);updateDirtyUi();}
      if(type==='change'&&e.target?.dataset?.bulkRecordId){
        const id=e.target.dataset.bulkRecordId;
        if(!toggleBulkSelection_cor(id,Boolean(e.target.checked)))e.target.checked=st.bulkSelected.has(Number(id));
      }
      if(type==='change'&&e.target?.dataset?.bulkApplyField&&st.page==='multiple'){
        const f=e.target.dataset.bulkApplyField;
        if(!editableBulkGroups_cor().some(g=>(g.editable_fields||[]).includes(f)))return;
        if(e.target.checked)st.bulkTouched.add(f);else st.bulkTouched.delete(f);
        updateBulkDirtyUi_cor();
      }
      if(e.target?.dataset?.bulkControl&&st.page==='multiple')updateBulkDirtyUi_cor();
    });
    view()?.addEventListener('submit',e=>{
      if(e.target?.id==='iadm-cor-edit-form'){e.preventDefault();save();}
      if(e.target?.id==='iadm-cor-bulk-form'){e.preventDefault();saveBulk_cor();}
    });
  }
  async function init(payload){
    const epoch=ensureContext_cor();
    try{
      await loadHtml();if(!isCurrentContext_cor(epoch))return;
      bind();st.ready=true;
      if(window.ManttoPermissions?.apply)window.ManttoPermissions.apply(view());
      if(!st.contract)await loadContract();
      if(!isCurrentContext_cor(epoch))return;
      if(!st.filtersLoaded)await loadFilterOptions_cor();
      if(!isCurrentContext_cor(epoch))return;
      const id=Number(payload?.id);
      if(Number.isSafeInteger(id)&&id>0){if(confirmLeave())await openRecord(id);}
      else if(!st.projects.length)await search(raw($('iadm-cor-search-input')?.value));
    }catch(e){if(isCurrentContext_cor(epoch)){status(e.message,'error');alertMessage(e.message);}}
  }
  function refreshAfterContextSwitch_cor(options={}){
    const active=window.ManttoRouter?.getCurrent?.()?.route==='instalaciones-administracion';
    resetSensitiveState_cor();
    if(active&&st.ready&&currentContext_cor()!=='NO_SESSION')
      Promise.resolve().then(()=>refresh({...options,force:true})).catch(()=>{});
  }
  document.addEventListener('mantto:navigation',e=>{
    const d=e?.detail||{};
    if(d.route!=='instalaciones-administracion')return;
    ensureContext_cor();
    if(!st.ready)return;
    const id=Number(d.payload?.id);
    if(!st.contract){
      refresh({force:true,recordId:Number.isSafeInteger(id)&&id>0?id:null}).catch(()=>{});
      return;
    }
    if(d.type==='open'&&Number.isSafeInteger(id)&&id>0&&confirmLeave())openRecord(id).catch(()=>{});
  });
  document.addEventListener('mantto:auth-ready',()=>refreshAfterContextSwitch_cor());
  document.addEventListener('mantto:view-user-changed',()=>refreshAfterContextSwitch_cor());
  document.addEventListener('mantto:session-expired',()=>resetSensitiveState_cor());
  document.addEventListener('mantto:permissions-updated',()=>{
    const id=st.selectedRecord?.id_ins_fl;
    refreshAfterContextSwitch_cor({recordId:id});
  });
  window.ManttoInstalacionesAdministracion_cor=Object.freeze({init,refresh});
})();
