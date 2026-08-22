(function(){
  'use strict';

  const state={
    bootLoading:true,
    panelLoading:false,
    error:'',
    tab:'users',
    roles:[],
    users:[],
    catalog:[],
    totals:{},
    selectedRoleId:null,
    selectedUserId:null,
    query:'',
    company:'',
    permissionQuery:'',
    rolePermissions:new Map(),
    userPermissions:new Map(),
    userRoles:[],
    roleHierarchy:{group:new Map(),module:new Map()},
    userHierarchy:{group:new Map(),module:new Map()},
    hierarchyDirty:new Map(),
    rolePickerOpen:false,
    roleDraft:new Set(),
    principalRoleId:null,
    savingRoles:false,
    savingPermissions:false,
    saveProgress:{visible:false,percent:0,label:'',tone:'working'},
    dirty:new Map(),
    expanded:new Set(),
    adminUserId:null,
    adminRoleId:null,
    adminUserDetail:null,
    adminRoleDetail:null,
    zones:[],
    securityQuestions:[],
    adminLoading:false,
    adminUserQuery:'',
    adminUserCompany:'',
    adminRoleQuery:'',
    adminRoleCompany:'',
    adminRoleStatus:'',
    notificationLoading:false,
    notificationError:'',
    notificationEvents:[],
    notificationRoles:[],
    notificationConfigs:new Map(),
    notificationDirty:new Map(),
    selectedNotificationEvent:'',
    notificationQuery:'',
    notificationQueryDraft:'',
    notificationRoleQuery:'',
    notificationRoleQueryDraft:'',
    notificationCompany:'',
    notificationScope:null,
    savingNotifications:false,
    informationScopeUserId:null,
    informationScopeQuery:'',
    informationScopeCompany:'',
    informationScopeRole:'',
    informationScopeLoading:false,
    informationScopeError:'',
    informationScopeBackendPending:false,
    informationScopeCanManageAdditional:false,
    informationScopeBase:null,
    informationScopeDraft:null,
    informationScopeAdditionalQuery:'',
    informationScopeCandidateId:null,
    informationScopeListScrollTop:0,
    informationScopeBulkOpen:false,
    informationScopeBulkSelected:new Set(),
    informationScopeBulkDraft:{dominios_completos:new Set(),agrupaciones:new Set(),ver_propio:true,ver_reporta_a:false,ver_rel_admin:false},
    savingInformationScope:false,
    savingInformationScopeBulk:false
  };

  const esc=(v)=>String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const api=()=>window.ManttoAuth;
  const RESET_CREDENTIAL_STORAGE_PREFIX='mantto:panel-control:reset-credential:';
  const NOTIFICATION_KEY_SEPARATOR='\u0000';
  let saveStatusTimer=null;
  let resetCredentialStatusTimer=null;

  function consumeSaveMessage(){
    const message=sessionStorage.getItem('mantto:panel-control:save-message');
    if(!message)return;
    sessionStorage.removeItem('mantto:panel-control:save-message');
    window.setTimeout(()=>toast(message),250);
  }

  async function request(path,options){
    if(!api()) throw new Error('No se encontró el servicio de autenticación.');
    return api().api(path,options||{method:'GET'});
  }

  const informationScopePath=(id)=>`/api/panel-control/usuarios/${Number(id)}/alcance-informacion`;
  const informationScopeBulkPath='/api/panel-control/usuarios/alcance-informacion/masivo';

  function emptyInformationScopeBulkDraft(){
    return {dominios_completos:new Set(),agrupaciones:new Set(),ver_propio:true,ver_reporta_a:false,ver_rel_admin:false};
  }

  function informationScopeBulkHasActivation(){
    const draft=state.informationScopeBulkDraft||emptyInformationScopeBulkDraft();
    return draft.dominios_completos.size>0||draft.agrupaciones.size>0||draft.ver_reporta_a||draft.ver_rel_admin;
  }

  function emptyInformationScopeDraft(){
    return {
      dominios_completos:new Set(),
      agrupaciones:new Set(),
      ver_propio:true,
      ver_reporta_a:false,
      ver_rel_admin:false,
      usuarios_adicionales:new Set()
    };
  }

  function cloneInformationScopeDraft(value){
    const source=value||emptyInformationScopeDraft();
    return {
      dominios_completos:new Set(source.dominios_completos||[]),
      agrupaciones:new Set(source.agrupaciones||[]),
      ver_propio:true,
      ver_reporta_a:Boolean(source.ver_reporta_a),
      ver_rel_admin:Boolean(source.ver_rel_admin),
      usuarios_adicionales:new Set(source.usuarios_adicionales||[])
    };
  }

  function normalizeInformationScopeData(data,userId){
    const source=data||{};
    const rawDomains=Array.isArray(source.dominios_completos)
      ?source.dominios_completos
      :Object.entries(source.dominio_completo||{}).filter(([,enabled])=>Boolean(enabled)).map(([domain])=>domain);
    const domains=new Set(rawDomains.map(value=>String(value||'').trim().toUpperCase()).filter(value=>value==='GENERAL'||value==='UNITED'||value==='CORELLIAN'));
    const rawGroupings=Array.isArray(source.agrupaciones)
      ?source.agrupaciones
      :(Array.isArray(source.agrupaciones_acceso)?source.agrupaciones_acceso:[]);
    const groupings=new Set(rawGroupings.map(item=>Number(item&&typeof item==='object'?(item.id_agrupacion??item.id):item)).filter(id=>Number.isInteger(id)&&id>0));
    const additionalRaw=Array.isArray(source.usuarios_adicionales)?source.usuarios_adicionales:[];
    const additional=new Set(additionalRaw.map(item=>Number(item&&typeof item==='object'?(item.id_SB??item.id_usuario??item.id_usuario_visible):item)).filter(id=>Number.isInteger(id)&&id>0&&id!==Number(userId)));
    return {
      dominios_completos:domains,
      agrupaciones:groupings,
      ver_propio:true,
      ver_reporta_a:Boolean(source.ver_reporta_a),
      ver_rel_admin:Boolean(source.ver_rel_admin),
      usuarios_adicionales:additional
    };
  }

  function informationScopePayload(value){
    const source=value||emptyInformationScopeDraft();
    return {
      dominios_completos:[...source.dominios_completos].filter(value=>value==='GENERAL'||value==='UNITED'||value==='CORELLIAN').sort(),
      agrupaciones:[...source.agrupaciones].map(Number).filter(id=>Number.isInteger(id)&&id>0).sort((a,b)=>a-b),
      ver_propio:true,
      ver_reporta_a:Boolean(source.ver_reporta_a),
      ver_rel_admin:Boolean(source.ver_rel_admin),
      usuarios_adicionales:[...source.usuarios_adicionales].map(Number).filter(id=>Number.isInteger(id)&&id>0).sort((a,b)=>a-b)
    };
  }

  function sameInformationScope(left,right){
    return JSON.stringify(informationScopePayload(left))===JSON.stringify(informationScopePayload(right));
  }

  function informationScopeDirty(){
    return Boolean(state.informationScopeUserId&&state.informationScopeBase&&state.informationScopeDraft&&!sameInformationScope(state.informationScopeBase,state.informationScopeDraft));
  }

  function informationScopeGroupingDomain(group){
    const company=normalizeText(group?.company).replace(/[.,]/g,'').replace(/\s+/g,' ');
    if(company==='GENERAL'||company==='BLT')return 'GENERAL';
    if(company==='UNITED'||company==='UNITED ELEVADORES')return 'UNITED';
    if(company==='CORELLIAN'||company==='CORELLIAN SA DE CV')return 'CORELLIAN';
    return '';
  }

  function informationScopeGroupsForDomain(domain){
    const normalized=String(domain||'').trim().toUpperCase();
    return state.catalog
      .filter(group=>group&&group.active!==false&&informationScopeGroupingDomain(group)===normalized)
      .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'es',{sensitivity:'base'}));
  }

  function informationScopeGroupIdsForDomain(domain){
    return new Set(informationScopeGroupsForDomain(domain).map(group=>Number(group.id)).filter(id=>Number.isInteger(id)&&id>0));
  }

  function informationScopeAccessDomainHtml(draft,domain,{bulk=false}={}){
  const groups=informationScopeGroupsForDomain(domain);
  const complete=draft.dominios_completos.has(domain);
  const domainAttribute=bulk?'data-information-scope-bulk-domain':'data-information-scope-domain';
  const groupAttribute=bulk?'data-information-scope-bulk-group':'data-information-scope-group';
  const domainLabel=domain==='GENERAL'?'General':domain==='UNITED'?'United':'Corellian';
  const selectedDoors=groups.filter(group=>draft.agrupaciones.has(Number(group.id))).length;
  const doorSummary=complete
    ?`${groups.length} puerta(s) cubiertas por la llave maestra`
    :`${selectedDoors} de ${groups.length} puerta(s) abiertas`;

  return `<article class="pc-scope-key-card ${domain.toLowerCase()} ${complete?'master-active':''}">
    <div class="pc-scope-key-head">
      <div class="pc-scope-key-title"><span class="pc-scope-key-icon">🔑</span><span><small>EMPRESA</small><b>${esc(domainLabel)}</b><em>${esc(doorSummary)}</em></span></div>
      <label class="pc-scope-master-switch ${complete?'selected':''}"><input type="checkbox" ${domainAttribute}="${domain}" ${complete?'checked':''}><span><b>Llave maestra</b><small>${complete?'Acceso completo activo':'Acceso completo apagado'}</small></span></label>
    </div>
    <div class="pc-scope-doors-head"><span>🚪 Puertas / agrupaciones</span><small>${complete?'La llave maestra cubre todas las puertas; no se guardan duplicadas.':'Abre solamente las áreas de información necesarias.'}</small></div>
    <div class="pc-scope-door-grid">${groups.length?groups.map(group=>{
      const id=Number(group.id);
      const explicit=draft.agrupaciones.has(id);
      const open=complete||explicit;
      return `<label class="pc-scope-door ${open?'open':'closed'} ${complete?'implicit':''}"><input type="checkbox" ${groupAttribute}="${id}" data-information-scope-group-domain="${domain}" ${open?'checked':''} ${complete?'disabled':''}><span class="pc-scope-door-icon">${open?'🔓':'🔒'}</span><span class="pc-scope-door-copy"><b>${esc(group.name||group.code||`Agrupación ${id}`)}</b><small>${esc(group.code||'AGRUPACION')}</small></span><em>${complete?'LLAVE MAESTRA':open?'ABIERTA':'CERRADA'}</em></label>`;
    }).join(''):'<div class="pc-information-scope-no-users">No hay agrupaciones activas de este dominio en el catálogo de permisos.</div>'}</div>
  </article>`;
}

  function informationScopeAccessGeneralHtml(draft,{bulk=false}={}){
  return `<div class="pc-scope-access-grid">${['GENERAL','UNITED','CORELLIAN'].map(domain=>informationScopeAccessDomainHtml(draft,domain,{bulk})).join('')}</div>`;
}

  const FIX_PANEL_ALCANCE_USUARIO_MASIVO_V002=true;

  function resetCredentialStorageKey(userId){
    const actor=api()&&typeof api().getActorUser==='function'?api().getActorUser():null;
    const actorId=Number(actor&&actor.id_SB)||0;
    return RESET_CREDENTIAL_STORAGE_PREFIX+String(actorId)+':'+String(Number(userId)||0);
  }

  function readPendingResetCredential(userId){
    const id=Number(userId);
    if(!Number.isInteger(id)||id<=0)return null;
    try{
      const data=JSON.parse(sessionStorage.getItem(resetCredentialStorageKey(id))||'null');
      if(!data||!String(data.password||'').trim())return null;
      return data;
    }catch(_error){return null;}
  }

  function storePendingResetCredential(userId,password,email){
    const id=Number(userId);
    const value=String(password||'').trim();
    if(!Number.isInteger(id)||id<=0||!value)return;
    sessionStorage.setItem(resetCredentialStorageKey(id),JSON.stringify({
      password:value,
      email:String(email||'').trim(),
      created_at:new Date().toISOString()
    }));
  }

  function clearPendingResetCredential(userId){
    const id=Number(userId);
    if(Number.isInteger(id)&&id>0)sessionStorage.removeItem(resetCredentialStorageKey(id));
  }

  function stopResetCredentialStatusPolling(){
    if(resetCredentialStatusTimer){
      window.clearInterval(resetCredentialStatusTimer);
      resetCredentialStatusTimer=null;
    }
  }

  function startResetCredentialStatusPolling(userId){
    stopResetCredentialStatusPolling();
    const id=Number(userId);
    if(!Number.isInteger(id)||id<=0||!readPendingResetCredential(id))return;
    resetCredentialStatusTimer=window.setInterval(async()=>{
      if(state.tab!=='admin-users'||Number(state.adminUserId)!==id){
        stopResetCredentialStatusPolling();
        return;
      }
      try{
        const response=await request(`/api/usuarios/${id}/detalle`);
        const detail=response.data||null;
        if(!detail)return;
        if(Number(detail.must_change_password)!==1){
          clearPendingResetCredential(id);
          stopResetCredentialStatusPolling();
          state.adminUserDetail=detail;
          renderAdminUsers();
          toast('El usuario completó correctamente su proceso de primer acceso.');
        }
      }catch(_error){
        // Si la comprobación temporal falla, conservar la contraseña visible y reintentar.
      }
    },30000);
  }

  function normalizeCompany(value){
    const v=String(value||'').toUpperCase();
    if(v.includes('UNITED')) return 'UNITED';
    if(v.includes('CORELLIAN')) return 'CORELLIAN';
    if(v.includes('BLT')||v.includes('GENERAL')) return 'GENERAL';
    return String(value||'GENERAL');
  }

  function initials(user){
    if(user.iniciales) return user.iniciales;
    return String(user.nombre||'?').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
  }

  const AREA_ORDER=[
    'DIRECCION','MANTENIMIENTO','FINANZAS','INSTALACIONES','VENTAS','LOGISTICA',
    'COBRANZA','ALMACEN','CUSTOMER EXPERIENCE','CALL CENTER','ATENCION A CLIENTE',
    'LEGAL','RECURSOS HUMANOS','SISTEMAS','TI','CALIDAD','OTROS'
  ];

  function normalizeText(value){
    return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
  }

  function areaLabel(value){
    const raw=String(value||'').trim();
    return raw||'Sin área';
  }

  function areaRank(value){
    const normalized=normalizeText(value);
    const index=AREA_ORDER.findIndex(key=>normalized.includes(key));
    return index===-1?AREA_ORDER.length:index;
  }

  function principalRole(user){
    return (user.roles||[]).find(role=>role.principal)||(user.roles||[])[0]||null;
  }

  function userHierarchyLevel(user){
    const principal=principalRole(user);
    if(principal&&Number.isFinite(Number(principal.nivel))) return Number(principal.nivel);
    const levels=(user.roles||[]).map(role=>Number(role.nivel||0));
    return levels.length?Math.max(...levels):0;
  }

  function groupedUsers(users){
    const groups=new Map();
    users.forEach(user=>{
      const label=areaLabel(user.area);
      const key=normalizeText(label)||'SIN AREA';
      if(!groups.has(key)) groups.set(key,{key,label,users:[]});
      groups.get(key).users.push(user);
    });

    return [...groups.values()]
      .map(group=>({
        ...group,
        maxLevel:Math.max(0,...group.users.map(userHierarchyLevel)),
        users:group.users.sort((a,b)=>
          userHierarchyLevel(b)-userHierarchyLevel(a)||
          String(a.nombre||'').localeCompare(String(b.nombre||''),'es',{sensitivity:'base'})
        )
      }))
      .sort((a,b)=>
        areaRank(a.label)-areaRank(b.label)||
        b.maxLevel-a.maxLevel||
        a.label.localeCompare(b.label,'es',{sensitivity:'base'})
      );
  }

  function buildTree(rows){
    const groups=[];
    const gm=new Map();

    rows.forEach(r=>{
      const groupId=Number(r.id_agrupacion);
      if(!Number.isInteger(groupId)||groupId<=0)return;

      let g=gm.get(groupId);
      if(!g){
        g={id:groupId,code:r.agrupacion_codigo,name:r.agrupacion_nombre,company:r.agrupacion_empresa,active:Number(r.agrupacion_activo)!==0,modules:[],_m:new Map()};
        gm.set(groupId,g);
        groups.push(g);
      }

      const moduleId=Number(r.id_modulo);
      if(!Number.isInteger(moduleId)||moduleId<=0)return;
      let m=g._m.get(moduleId);
      if(!m){
        m={id:moduleId,code:r.modulo_codigo,name:r.modulo_nombre,active:Number(r.modulo_activo)!==0,internalVisual:Number(r.modulo_interno_visual)===1,elements:[],_e:new Map()};
        g._m.set(moduleId,m);
        g.modules.push(m);
      }

      const elementId=Number(r.id_elemento);
      if(!Number.isInteger(elementId)||elementId<=0)return;
      let e=m._e.get(elementId);
      if(!e){
        e={id:elementId,code:r.elemento_codigo,name:r.elemento_nombre,type:r.elemento_tipo,subs:[],_s:new Map()};
        m._e.set(elementId,e);
        m.elements.push(e);
      }

      const subelementId=Number(r.id_subelemento);
      if(!Number.isInteger(subelementId)||subelementId<=0)return;
      let sub=e._s.get(subelementId);
      if(!sub){
        sub={id:subelementId,code:r.subelemento_codigo,name:r.subelemento_nombre,actions:[]};
        e._s.set(subelementId,sub);
        e.subs.push(sub);
      }

      const permissionId=Number(r.id_subelemento_accion);
      if(!Number.isInteger(permissionId)||permissionId<=0)return;
      sub.actions.push({id:permissionId,code:r.accion_codigo,name:r.accion_nombre,description:r.accion_descripcion,sensitive:Number(r.requiere_auditoria)===1});
    });

    groups.forEach(g=>{
      delete g._m;
      g.modules.forEach(m=>{
        delete m._e;
        m.elements.forEach(e=>delete e._s);
      });
    });
    return groups;
  }

  async function loadBootstrap(){
    state.bootLoading=true;
    state.error='';
    render();
    try{
      const json=await request('/api/panel-control/bootstrap');
      const data=json.data||{};
      state.roles=data.roles||[];
      state.users=data.usuarios||[];
      state.catalog=buildTree(data.catalogo||[]);
      state.totals=data.totales||{};
      state.selectedRoleId=state.roles[0]?.id_rol||null;
      state.selectedUserId=null;
      state.userPermissions=new Map();
      state.userRoles=[];
      state.rolePickerOpen=false;
      state.roleDraft=new Set();
      state.principalRoleId=null;
      state.dirty.clear();
      state.hierarchyDirty.clear();
      state.expanded=new Set(state.catalog.slice(0,3).map(g=>nodeKey('group',g.id)));
      state.bootLoading=false;
      render();
      if(state.tab==='roles'&&state.selectedRoleId) await loadRolePermissions(state.selectedRoleId);
      if(state.tab==='admin-users') await loadAdminCatalogs();
      if(state.tab==='notifications') await loadNotificationMatrix();
    }catch(error){
      state.bootLoading=false;
      state.error=error.message||'No se pudo cargar el Panel de Control.';
      render();
    }
  }

  async function loadRolePermissions(id){
    state.panelLoading=true;
    renderPermissionPanel();
    try{
      const json=await request(`/api/panel-control/roles/${id}/permisos`);
      const data=json.data||{};
      const permissions=Array.isArray(data)?data:(data.permisos||[]);
      state.rolePermissions=new Map(permissions.map(x=>[Number(x.id_subelemento_accion),Boolean(x.permitido)]));
      state.roleHierarchy={
        group:new Map((data.jerarquia?.agrupaciones||[]).map(x=>[Number(x.id_agrupacion),Boolean(x.permitido)])),
        module:new Map((data.jerarquia?.modulos||[]).map(x=>[Number(x.id_modulo),Boolean(x.permitido)]))
      };
      state.dirty.clear();
      state.hierarchyDirty.clear();
    }catch(e){toast(e.message||'No se pudieron cargar los permisos del rol.');}
    finally{
      state.panelLoading=false;
      renderPermissionPanel();
      updateSaveButton();
    }
  }

  async function loadUserPermissions(id){
    state.panelLoading=true;
    renderPermissionPanel();
    try{
      const json=await request(`/api/panel-control/usuarios/${id}/permisos`);
      if(Number(state.selectedUserId)!==Number(id)) return;
      state.userRoles=json.data?.roles||[];
      state.roleDraft=new Set(state.userRoles.map(role=>Number(role.id_rol)));
      state.principalRoleId=Number(state.userRoles.find(role=>role.principal)?.id_rol||state.userRoles[0]?.id_rol||0)||null;
      state.rolePickerOpen=false;
      state.userPermissions=new Map((json.data?.permisos||[]).map(x=>[Number(x.id_subelemento_accion),x]));
      state.userHierarchy={
        group:new Map((json.data?.jerarquia?.agrupaciones||[]).map(x=>[Number(x.id_agrupacion),x])),
        module:new Map((json.data?.jerarquia?.modulos||[]).map(x=>[Number(x.id_modulo),x]))
      };
      state.dirty.clear();
      state.hierarchyDirty.clear();
    }catch(e){toast(e.message||'No se pudieron cargar los permisos del usuario.');}
    finally{
      if(Number(state.selectedUserId)===Number(id)){
        state.panelLoading=false;
        renderPermissionPanel();
        renderSelectorList();
        updateSaveButton();
      }
    }
  }

  function notificationKey(codigoEvento,idRol){
    return `${String(codigoEvento||'')}${NOTIFICATION_KEY_SEPARATOR}${Number(idRol)}`;
  }

  function applyNotificationMatrix(data,{clearDirty=true}={}){
    const matrix=data||{};
    state.notificationEvents=Array.isArray(matrix.eventos)?matrix.eventos:[];
    state.notificationRoles=Array.isArray(matrix.roles)?matrix.roles:[];
    state.notificationScope=matrix.alcance||null;
    state.notificationConfigs=new Map((matrix.configuraciones||[]).map(row=>[
      notificationKey(row.codigo_evento,row.id_rol),
      {
        habilitado:Boolean(row.activo),
        politica:row.politica?String(row.politica).toUpperCase():null,
        id_evento_rol:Number(row.id_evento_rol||0)||null
      }
    ]));
    if(clearDirty) state.notificationDirty.clear();
    const selectedExists=state.notificationEvents.some(event=>event.codigo_evento===state.selectedNotificationEvent);
    if(!selectedExists) state.selectedNotificationEvent=state.notificationEvents[0]?.codigo_evento||'';
  }

  async function loadNotificationMatrix(){
    state.notificationLoading=true;
    state.notificationError='';
    if(state.tab==='notifications') renderNotificationPanel();
    updateSaveButton();
    try{
      const json=await request(`/api/panel-control/notificaciones/matriz?_=${Date.now()}`,{method:'GET',cache:'no-store'});
      applyNotificationMatrix(json.data||{});
    }catch(error){
      state.notificationError=error.message||'No se pudo cargar la matriz de notificaciones.';
    }finally{
      state.notificationLoading=false;
      if(state.tab==='notifications') renderNotificationPanel();
      updateSaveButton();
    }
  }

  function notificationBaseValue(codigoEvento,idRol){
    return state.notificationConfigs.get(notificationKey(codigoEvento,idRol))||{habilitado:false,politica:null,id_evento_rol:null};
  }

  function notificationValue(codigoEvento,idRol){
    const key=notificationKey(codigoEvento,idRol);
    return state.notificationDirty.get(key)||notificationBaseValue(codigoEvento,idRol);
  }

  function normalizeNotificationDraft(value){
    const habilitado=Boolean(value?.habilitado);
    return {
      habilitado,
      politica:habilitado&&value?.politica?String(value.politica).toUpperCase():null
    };
  }

  function setNotificationDraft(codigoEvento,idRol,value){
    const key=notificationKey(codigoEvento,idRol);
    const base=normalizeNotificationDraft(notificationBaseValue(codigoEvento,idRol));
    const next=normalizeNotificationDraft(value);
    if(base.habilitado===next.habilitado&&base.politica===next.politica){
      state.notificationDirty.delete(key);
    }else{
      state.notificationDirty.set(key,next);
    }
    updateSaveButton();
  }

  function setNotificationDraftBulk(codigoEvento,roles,transform){
    roles.forEach(role=>{
      const idRol=Number(role.id_rol);
      const key=notificationKey(codigoEvento,idRol);
      const base=normalizeNotificationDraft(notificationBaseValue(codigoEvento,idRol));
      const current=normalizeNotificationDraft(notificationValue(codigoEvento,idRol));
      const next=normalizeNotificationDraft(transform({role,idRol,base,current})||current);
      if(base.habilitado===next.habilitado&&base.politica===next.politica){
        state.notificationDirty.delete(key);
      }else{
        state.notificationDirty.set(key,next);
      }
    });
    updateSaveButton();
  }

  function notificationInvalidDrafts(){
    return [...state.notificationDirty.values()].filter(value=>value.habilitado&&!['OBLIGATORIA','OPCIONAL'].includes(value.politica)).length;
  }

  function notificationEventCounts(codigoEvento){
    let enabled=0;
    let mandatory=0;
    let optional=0;
    state.notificationRoles.forEach(role=>{
      const value=notificationValue(codigoEvento,role.id_rol);
      if(!value.habilitado)return;
      enabled+=1;
      if(value.politica==='OBLIGATORIA') mandatory+=1;
      if(value.politica==='OPCIONAL') optional+=1;
    });
    return {enabled,mandatory,optional};
  }

  function filteredNotificationEvents(){
    const query=state.notificationQuery.trim().toLowerCase();
    return state.notificationEvents.filter(event=>{
      if(!query)return true;
      return [event.nombre_evento,event.codigo_evento,event.agrupacion,event.modulo,event.accion,event.descripcion]
        .join(' ').toLowerCase().includes(query);
    });
  }

  function filteredNotificationRoles(){
    const query=state.notificationRoleQuery.trim().toLowerCase();
    return state.notificationRoles
      .filter(role=>{
        const company=normalizeCompany(role.empresa);
        const text=[role.rol,role.codigo,role.descripcion,role.empresa,notificationRoleArea(role)].join(' ').toLowerCase();
        return (!query||text.includes(query))&&(!state.notificationCompany||company===state.notificationCompany);
      })
      .sort((a,b)=>
        String(a.rol||'').localeCompare(String(b.rol||''),'es',{sensitivity:'base',numeric:true})
        || Number(a.id_rol||0)-Number(b.id_rol||0)
      );
  }

  function notificationRoleArea(role){
    const idRol=Number(role?.id_rol||0);
    if(!Number.isInteger(idRol)||idRol<=0)return 'Sin área asignada';
    const areas=[...new Set(state.users
      .filter(user=>Number(user.estado)!==0)
      .filter(user=>{
        const explicitPrincipal=(user.roles||[]).find(item=>Boolean(item?.principal));
        const principalId=Number(explicitPrincipal?.id_rol||user.rol_id||0);
        return principalId===idRol;
      })
      .map(user=>areaLabel(user.area))
      .filter(Boolean))];
    if(areas.length===1)return areas[0];
    if(areas.length>1)return 'Varias áreas';
    return 'Sin área asignada';
  }

  function groupedNotificationRoles(roles){
    const groups=new Map();
    roles.forEach(role=>{
      const label=notificationRoleArea(role);
      const key=normalizeText(label)||'SIN AREA ASIGNADA';
      if(!groups.has(key))groups.set(key,{key,label,roles:[]});
      groups.get(key).roles.push(role);
    });
    return [...groups.values()]
      .map(group=>({
        ...group,
        roles:group.roles.sort((a,b)=>
          String(a.rol||'').localeCompare(String(b.rol||''),'es',{sensitivity:'base',numeric:true})
          || Number(a.id_rol||0)-Number(b.id_rol||0)
        )
      }))
      .sort((a,b)=>
        areaRank(a.label)-areaRank(b.label)
        || a.label.localeCompare(b.label,'es',{sensitivity:'base'})
      );
  }

  function notificationAreaCounts(group,event){
    const enabled=group.roles.filter(role=>notificationValue(event.codigo_evento,role.id_rol).habilitado).length;
    return {
      enabled,
      total:group.roles.length,
      all:Boolean(group.roles.length)&&enabled===group.roles.length,
      some:enabled>0
    };
  }

  function notificationRoleGroupsHtml(groups,event){
    return groups.map((group,index)=>{
      const counts=notificationAreaCounts(group,event);
      return `<section class="pc-area-group pc-notification-area-group" data-notification-area-group="${index}">
        <div class="pc-area-heading pc-notification-area-heading">
          <span>${esc(group.label)}</span>
          <label class="pc-notification-area-toggle" title="Activa o desactiva todos los roles visibles de ${esc(group.label)}">
            <span class="pc-notification-switch"><input type="checkbox" data-notification-area-select="${index}" ${counts.all?'checked':''}><span aria-hidden="true"></span></span>
            <b>Seleccionar área</b>
            <em>${counts.enabled}/${counts.total}</em>
          </label>
        </div>
        <div class="pc-area-users">${group.roles.map(role=>notificationRoleRow(role,event)).join('')}</div>
      </section>`;
    }).join('');
  }

  function notificationPolicyGroupsHtml(groups,event){
    return groups.map(group=>{
      const counts=notificationAreaCounts(group,event);
      return `<section class="pc-area-group pc-notification-area-group">
        <div class="pc-area-heading pc-notification-area-heading pc-notification-area-heading-policy">
          <span>${esc(group.label)}</span>
          <em>${counts.enabled}/${counts.total} activos</em>
        </div>
        <div class="pc-area-users">${group.roles.map(role=>notificationPolicyRow(role,event)).join('')}</div>
      </section>`;
    }).join('');
  }

  function notificationEventItem(event){
    const selected=event.codigo_evento===state.selectedNotificationEvent;
    const counts=notificationEventCounts(event.codigo_evento);
    return `<button type="button" class="pc-notification-event ${selected?'active':''}" data-notification-event="${esc(event.codigo_evento)}">
      <span class="pc-notification-event-copy"><b>${esc(event.nombre_evento||event.codigo_evento)}</b><small>${esc(event.agrupacion||'General')} · ${esc(event.modulo||'General')}</small></span>
      <span class="pc-notification-event-count">${counts.enabled}</span>
    </button>`;
  }

  function renderNotificationEventList(){
    const list=document.getElementById('pc-notification-events');
    if(!list)return;
    const scrollTop=list.scrollTop;
    const events=filteredNotificationEvents();
    list.innerHTML=events.length?events.map(notificationEventItem).join(''):'<div class="pc-empty">Sin interacciones que coincidan.</div>';
    list.querySelectorAll('[data-notification-event]').forEach(button=>button.addEventListener('click',()=>{
      state.selectedNotificationEvent=button.dataset.notificationEvent||'';
      renderNotificationEventList();
      renderNotificationRoles();
    }));
    list.scrollTop=scrollTop;
  }

  function notificationRoleRow(role,event){
    const value=notificationValue(event.codigo_evento,role.id_rol);
    const key=notificationKey(event.codigo_evento,role.id_rol);
    const changed=state.notificationDirty.has(key);
    const policyMissing=value.habilitado&&!['OBLIGATORIA','OPCIONAL'].includes(value.politica);
    return `<article class="pc-notification-role-row ${value.habilitado?'enabled':'disabled'} ${changed?'changed':''} ${policyMissing?'needs-policy':''}" data-notification-role-row="${role.id_rol}">
      <label class="pc-notification-switch" title="${value.habilitado?'Desactivar':'Activar'} ${esc(role.rol)}">
        <input type="checkbox" data-notification-enable="${role.id_rol}" ${value.habilitado?'checked':''}>
        <span aria-hidden="true"></span>
      </label>
      <div class="pc-notification-role-copy"><b>${esc(role.rol)}</b><small>${esc(normalizeCompany(role.empresa))}${role.codigo?` · ${esc(role.codigo)}`:''}</small></div>
      <span class="pc-notification-role-state">${value.habilitado?'Recibe':'No recibe'}</span>
    </article>`;
  }

  function notificationPolicyRow(role,event){
    const value=notificationValue(event.codigo_evento,role.id_rol);
    const key=notificationKey(event.codigo_evento,role.id_rol);
    const changed=state.notificationDirty.has(key);
    const policyMissing=value.habilitado&&!['OBLIGATORIA','OPCIONAL'].includes(value.politica);
    return `<article class="pc-notification-policy-row ${value.habilitado?'enabled':'disabled'} ${changed?'changed':''} ${policyMissing?'needs-policy':''}" data-notification-policy-row="${role.id_rol}">
      <div class="pc-notification-policy ${value.habilitado?'':'locked'}">
        <button type="button" data-notification-policy="OBLIGATORIA" data-role-id="${role.id_rol}" class="${value.politica==='OBLIGATORIA'?'active mandatory':''}" ${value.habilitado?'':'disabled'}>Obligatoria</button>
        <button type="button" data-notification-policy="OPCIONAL" data-role-id="${role.id_rol}" class="${value.politica==='OPCIONAL'?'active optional':''}" ${value.habilitado?'':'disabled'}>Opcional</button>
      </div>
      <span class="pc-notification-policy-state">${!value.habilitado?'No recibe':policyMissing?'Selecciona política':value.politica==='OBLIGATORIA'?'Campana + Push':'Según preferencias'}</span>
    </article>`;
  }

  function bindNotificationRolePolicyScroll(roleList,policyList){
    if(!roleList||!policyList)return;
    let syncing=false;
    const mirror=(source,target)=>()=>{
      if(syncing)return;
      syncing=true;
      target.scrollTop=source.scrollTop;
      window.requestAnimationFrame(()=>{syncing=false;});
    };
    roleList.addEventListener('scroll',mirror(roleList,policyList),{passive:true});
    policyList.addEventListener('scroll',mirror(policyList,roleList),{passive:true});
  }

  function renderNotificationRoles(){
    const roleBox=document.getElementById('pc-notification-role-panel');
    const policyBox=document.getElementById('pc-notification-policy-panel');
    if(!roleBox||!policyBox)return;
    const roleScrollTop=document.getElementById('pc-notification-role-list')?.scrollTop||0;
    const policyScrollTop=document.getElementById('pc-notification-policy-list')?.scrollTop||roleScrollTop;
    const event=state.notificationEvents.find(item=>item.codigo_evento===state.selectedNotificationEvent);
    if(!event){
      roleBox.innerHTML='<div class="pc-empty large">Selecciona una interacción.</div>';
      policyBox.innerHTML='<div class="pc-empty large">Selecciona una interacción.</div>';
      return;
    }
    const counts=notificationEventCounts(event.codigo_evento);
    const roles=filteredNotificationRoles();
    const groups=groupedNotificationRoles(roles);
    const companies=[...new Set(state.notificationRoles.map(role=>normalizeCompany(role.empresa)))].filter(Boolean).sort();
    const eventName=event.nombre_evento||event.codigo_evento;
    const visibleEnabled=roles.filter(role=>notificationValue(event.codigo_evento,role.id_rol).habilitado).length;
    const allVisibleEnabled=Boolean(roles.length)&&visibleEnabled===roles.length;
    const someVisibleEnabled=visibleEnabled>0;

    roleBox.innerHTML=`<div class="pc-notification-column-head">
      <div><span class="pc-eyebrow">ROL</span><h3>Roles por área</h3><p>${esc(eventName)}</p></div>
      <span class="pc-notification-column-count">${roles.length}</span>
    </div>
    <div class="pc-notification-column-toolbar pc-notification-role-toolbar">
      <div class="pc-notification-role-filters"><form id="pc-notification-role-search-form" class="pc-notification-search-form"><input id="pc-notification-role-search" type="search" value="${esc(state.notificationRoleQueryDraft)}" placeholder="Buscar rol..."><button type="submit">Buscar</button></form><select id="pc-notification-company"><option value="">Todas las empresas</option>${companies.map(company=>`<option value="${esc(company)}" ${state.notificationCompany===company?'selected':''}>${esc(company)}</option>`).join('')}</select></div>
      <label class="pc-notification-bulk-switch ${roles.length?'':'disabled'}" title="Activa o desactiva todos los roles visibles">
        <span class="pc-notification-switch"><input id="pc-notification-select-all" type="checkbox" ${allVisibleEnabled?'checked':''} ${roles.length?'':'disabled'}><span aria-hidden="true"></span></span>
        <span><b>Seleccionar todo</b><small>${visibleEnabled} de ${roles.length} roles visibles activos</small></span>
      </label>
    </div>
    <div class="pc-notification-column-note">Los roles se agrupan por el área real de sus usuarios con ese Rol Principal. La selección por área aplica únicamente a los roles visibles de ese grupo.</div>
    <div class="pc-notification-role-list" id="pc-notification-role-list">${roles.length?notificationRoleGroupsHtml(groups,event):'<div class="pc-empty">Sin roles que coincidan.</div>'}</div>`;

    policyBox.innerHTML=`<div class="pc-notification-column-head">
      <div><span class="pc-eyebrow">POLÍTICA</span><h3>Política</h3><p>${esc(eventName)}</p></div>
      <div class="pc-notification-kpis"><span><b>${counts.enabled}</b> activos</span><span><b>${counts.mandatory}</b> oblig.</span><span><b>${counts.optional}</b> opc.</span></div>
    </div>
    <div class="pc-notification-column-toolbar pc-notification-policy-toolbar">
      <div class="pc-notification-policy-legend"><span><b>Obligatoria</b> Campana + Push</span><span><b>Opcional</b> preferencias del usuario</span></div>
      <div class="pc-notification-bulk-policies">
        <button type="button" id="pc-notification-mandatory-all" ${someVisibleEnabled?'':'disabled'}>Obligatorio todo</button>
        <button type="button" id="pc-notification-optional-all" ${someVisibleEnabled?'':'disabled'}>Opcional todo</button>
      </div>
    </div>
    <div class="pc-notification-column-note">Las acciones masivas de política aplican a los roles visibles que estén activos.</div>
    <div class="pc-notification-policy-list" id="pc-notification-policy-list">${roles.length?notificationPolicyGroupsHtml(groups,event):'<div class="pc-empty">Sin políticas que mostrar.</div>'}</div>`;

    const roleSearch=document.getElementById('pc-notification-role-search');
    roleSearch?.addEventListener('input',eventInput=>{
      state.notificationRoleQueryDraft=eventInput.target.value;
    });
    document.getElementById('pc-notification-role-search-form')?.addEventListener('submit',eventInput=>{
      eventInput.preventDefault();
      state.notificationRoleQuery=state.notificationRoleQueryDraft;
      renderNotificationRoles();
    });
    document.getElementById('pc-notification-company')?.addEventListener('change',eventInput=>{
      state.notificationCompany=eventInput.target.value;
      renderNotificationRoles();
    });

    const selectAll=document.getElementById('pc-notification-select-all');
    if(selectAll){
      selectAll.indeterminate=someVisibleEnabled&&!allVisibleEnabled;
      selectAll.addEventListener('change',()=>{
        const enableAll=Boolean(selectAll.checked);
        setNotificationDraftBulk(event.codigo_evento,roles,({base,current})=>({
          habilitado:enableAll,
          politica:enableAll?(current.politica||base.politica||null):null
        }));
        renderNotificationEventList();
        renderNotificationRoles();
      });
    }

    roleBox.querySelectorAll('[data-notification-area-select]').forEach(input=>{
      const index=Number(input.dataset.notificationAreaSelect);
      const group=groups[index];
      if(!group)return;
      const areaCounts=notificationAreaCounts(group,event);
      input.indeterminate=areaCounts.some&&!areaCounts.all;
      input.addEventListener('change',()=>{
        const enableArea=Boolean(input.checked);
        setNotificationDraftBulk(event.codigo_evento,group.roles,({base,current})=>({
          habilitado:enableArea,
          politica:enableArea?(current.politica||base.politica||null):null
        }));
        renderNotificationEventList();
        renderNotificationRoles();
      });
    });

    document.getElementById('pc-notification-mandatory-all')?.addEventListener('click',()=>{
      setNotificationDraftBulk(event.codigo_evento,roles,({current})=>
        current.habilitado?{habilitado:true,politica:'OBLIGATORIA'}:current
      );
      renderNotificationEventList();
      renderNotificationRoles();
    });

    document.getElementById('pc-notification-optional-all')?.addEventListener('click',()=>{
      setNotificationDraftBulk(event.codigo_evento,roles,({current})=>
        current.habilitado?{habilitado:true,politica:'OPCIONAL'}:current
      );
      renderNotificationEventList();
      renderNotificationRoles();
    });

    roleBox.querySelectorAll('[data-notification-enable]').forEach(input=>input.addEventListener('change',()=>{
      const idRol=Number(input.dataset.notificationEnable);
      const current=notificationValue(event.codigo_evento,idRol);
      const base=notificationBaseValue(event.codigo_evento,idRol);
      const politica=input.checked?(current.politica||base.politica||null):null;
      setNotificationDraft(event.codigo_evento,idRol,{habilitado:input.checked,politica});
      renderNotificationEventList();
      renderNotificationRoles();
    }));
    policyBox.querySelectorAll('[data-notification-policy]').forEach(button=>button.addEventListener('click',()=>{
      const idRol=Number(button.dataset.roleId);
      const current=notificationValue(event.codigo_evento,idRol);
      if(!current.habilitado)return;
      setNotificationDraft(event.codigo_evento,idRol,{habilitado:true,politica:button.dataset.notificationPolicy});
      renderNotificationEventList();
      renderNotificationRoles();
    }));

    const roleList=document.getElementById('pc-notification-role-list');
    const policyList=document.getElementById('pc-notification-policy-list');
    if(roleList)roleList.scrollTop=roleScrollTop;
    if(policyList)policyList.scrollTop=policyScrollTop;
    bindNotificationRolePolicyScroll(roleList,policyList);
  }

  function renderNotificationPanel(){
    const box=document.getElementById('pc-content');
    if(!box||state.tab!=='notifications')return;
    if(state.notificationLoading){
      box.innerHTML='<section class="pc-permissions"><div class="pc-empty large"><span class="pc-spinner"></span>Cargando matriz de notificaciones...</div></section>';
      updateSaveButton();
      return;
    }
    if(state.notificationError){
      box.innerHTML=`<section class="pc-permissions"><div class="pc-empty large"><b>No se pudo cargar la matriz de notificaciones.</b><br>${esc(state.notificationError)}<br><br><button type="button" class="pc-btn primary" id="pc-notification-retry">Reintentar</button></div></section>`;
      document.getElementById('pc-notification-retry')?.addEventListener('click',loadNotificationMatrix);
      updateSaveButton();
      return;
    }
    box.innerHTML=`<section class="pc-notifications">
      <div class="pc-notification-intro"><div><span class="pc-eyebrow">NOTIFICACIONES</span><h2>Matriz de notificaciones</h2><p>Define qué roles principales reciben cada interacción y si su política es obligatoria u opcional.</p></div><div class="pc-notification-scope">${state.notificationScope?.all?'Alcance global':`Alcance: ${esc((state.notificationScope?.companies||[]).join(', ')||'según sesión')}`}</div></div>
      <div class="pc-notification-layout">
        <aside class="pc-notification-events-panel"><div class="pc-notification-events-head"><div><h3>Interacciones</h3><small>Maestro</small></div><span>${state.notificationEvents.length}</span></div><div class="pc-notification-event-search"><form id="pc-notification-event-search-form" class="pc-notification-search-form"><input id="pc-notification-event-search" type="search" value="${esc(state.notificationQueryDraft)}" placeholder="Buscar interacción..."><button type="submit">Buscar</button></form></div><div class="pc-notification-events" id="pc-notification-events"></div></aside>
        <section class="pc-notification-role-panel" id="pc-notification-role-panel"></section>
        <section class="pc-notification-policy-panel" id="pc-notification-policy-panel"></section>
      </div>
    </section>`;
    document.getElementById('pc-notification-event-search')?.addEventListener('input',event=>{
      state.notificationQueryDraft=event.target.value;
    });
    document.getElementById('pc-notification-event-search-form')?.addEventListener('submit',event=>{
      event.preventDefault();
      state.notificationQuery=state.notificationQueryDraft;
      renderNotificationEventList();
    });
    renderNotificationEventList();
    renderNotificationRoles();
    updateSaveButton();
  }

  function captureNotificationViewContext(){
    return {
      windowX:Number(window.scrollX||0),
      windowY:Number(window.scrollY||0),
      eventScroll:Number(document.getElementById('pc-notification-events')?.scrollTop||0),
      roleScroll:Number(document.getElementById('pc-notification-role-list')?.scrollTop||0),
      policyScroll:Number(document.getElementById('pc-notification-policy-list')?.scrollTop||0),
      selectedEvent:state.selectedNotificationEvent
    };
  }

  function restoreNotificationViewContext(context){
    window.requestAnimationFrame(()=>{
      const events=document.getElementById('pc-notification-events');
      const roles=document.getElementById('pc-notification-role-list');
      const policies=document.getElementById('pc-notification-policy-list');
      if(events)events.scrollTop=context.eventScroll;
      if(roles)roles.scrollTop=context.roleScroll;
      if(policies)policies.scrollTop=Number(context.policyScroll??context.roleScroll);
      window.scrollTo(context.windowX,context.windowY);
    });
  }

  function countConfirmedNotificationChanges(changes,matrix){
    const rows=Array.isArray(matrix?.configuraciones)?matrix.configuraciones:[];
    const byKey=new Map(rows.map(row=>[notificationKey(row.codigo_evento,row.id_rol),row]));
    return changes.reduce((total,change)=>{
      const row=byKey.get(notificationKey(change.codigo_evento,change.id_rol));
      if(change.habilitado){
        return total+(row&&Boolean(row.activo)&&String(row.politica||'').toUpperCase()===change.politica?1:0);
      }
      return total+(row&&!Boolean(row.activo)?1:0);
    },0);
  }

  async function saveNotificationChanges(){
    if(state.savingNotifications||!state.notificationDirty.size)return;
    const invalid=notificationInvalidDrafts();
    if(invalid){
      toast(`Selecciona Obligatoria u Opcional en ${invalid} configuración(es) antes de guardar.`);
      return;
    }
    const changes=[...state.notificationDirty.entries()].map(([key,value])=>{
      const [codigoEvento,idRol]=key.split(NOTIFICATION_KEY_SEPARATOR);
      return {
        codigo_evento:codigoEvento,
        id_rol:Number(idRol),
        habilitado:Boolean(value.habilitado),
        ...(value.habilitado?{politica:value.politica}:{})
      };
    });
    const malformed=changes.find(change=>!String(change.codigo_evento||'').trim()||!Number.isInteger(change.id_rol)||change.id_rol<=0);
    if(malformed){
      toast('No fue posible preparar la matriz de notificaciones. Recarga la página antes de guardar.');
      return;
    }
    if(!confirm(`¿Guardar ${changes.length} cambio(s) en la matriz de notificaciones?`))return;
    const context=captureNotificationViewContext();
    state.savingNotifications=true;
    updateSaveButton();
    setSaveStatus(15,`Preparando ${changes.length} cambio(s) de notificación...`);
    try{
      setSaveStatus(45,'Guardando matriz en Aiven...');
      const response=await request('/api/panel-control/notificaciones/matriz',{
        method:'PUT',
        body:JSON.stringify({changes})
      });
      const updated=Number(response.data?.updated||0);
      if(updated!==changes.length){
        throw new Error(`Aiven procesó ${updated} de ${changes.length} cambios de notificación.`);
      }
      const matrix=response.data?.matriz||{};
      setSaveStatus(78,'Verificando configuración guardada...');
      const confirmed=countConfirmedNotificationChanges(changes,matrix);
      if(confirmed!==changes.length){
        throw new Error(`Aiven confirmó ${confirmed} de ${changes.length} cambios de notificación.`);
      }
      const selected=context.selectedEvent;
      applyNotificationMatrix(matrix);
      if(state.notificationEvents.some(event=>event.codigo_evento===selected)) state.selectedNotificationEvent=selected;
      state.savingNotifications=false;
      renderNotificationPanel();
      restoreNotificationViewContext(context);
      setSaveStatus(100,'Matriz de notificaciones guardada y verificada.','success',2600);
      toast('Configuración de notificaciones guardada correctamente.');
    }catch(error){
      state.savingNotifications=false;
      updateSaveButton();
      restoreNotificationViewContext(context);
      setSaveStatus(Number(state.saveProgress.percent||0),error.message||'No fue posible guardar la matriz de notificaciones.','error',5200);
      toast(error.message||'No fue posible guardar la matriz de notificaciones.');
    }
  }

  function shell(){
    return `<div class="pc-page">
      <header class="pc-hero"><div><span class="pc-eyebrow">SEGURIDAD Y ACCESOS</span><h1>Panel de Control</h1><p>Configura permisos base por rol y personaliza el acceso efectivo de cada usuario.</p></div><div class="pc-hero-actions"><button class="pc-btn ghost" id="pc-reload">Recargar datos</button><div class="pc-save-stack"><button class="pc-btn primary" id="pc-save" disabled>Guardar cambios <span id="pc-dirty-count">0</span></button><div class="pc-save-status" id="pc-save-status" hidden aria-live="polite"><div class="pc-save-status-line"><span id="pc-save-status-text">Preparando...</span><strong id="pc-save-status-percent">0%</strong></div><div class="pc-save-progress" id="pc-save-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="pc-save-progress-fill"></span></div></div></div></div></header>
      <section class="pc-summary">
        <article><b>${esc(state.totals.roles_activos||0)}</b><span>Roles activos</span></article>
        <article><b>${esc(state.totals.usuarios_activos||0)}</b><span>Usuarios activos</span></article>
        <article><b>${esc(state.totals.permisos_disponibles||0)}</b><span>Permisos disponibles</span></article>
        <article><b>${esc(state.totals.personalizaciones_activas||0)}</b><span>Personalizaciones activas</span></article>
      </section>
      <nav class="pc-tabs"><button data-tab="users" class="${state.tab==='users'?'active':''}">Permisos por usuario</button><button data-tab="roles" class="${state.tab==='roles'?'active':''}">Roles y permisos</button><button data-tab="admin-users" class="${state.tab==='admin-users'?'active':''}">Usuarios</button><button data-tab="admin-roles" class="${state.tab==='admin-roles'?'active':''}">Roles</button><button data-tab="information-scope" class="${state.tab==='information-scope'?'active':''}">Alcance de información</button><button data-tab="notifications" class="${state.tab==='notifications'?'active':''}">Notificaciones</button>${window.ManttoUserViewer?.allowed?.()?`<button data-tab="viewer" class="${state.tab==='viewer'?'active':''}">Visor de usuarios</button>`:''}<button data-tab="audit" class="${state.tab==='audit'?'active':''}">Auditoría</button></nav>
      <div id="pc-content"></div><div class="pc-toast" id="pc-toast"></div>
    </div>`;
  }

  function render(){
    const view=document.getElementById('view-panel-control');
    if(!view)return;
    view.innerHTML=shell();
    document.getElementById('pc-reload')?.addEventListener('click',async()=>{
      if(state.tab==='notifications'){
        await loadNotificationMatrix();
        return;
      }
      if(state.tab==='information-scope'){
        const selectedId=Number(state.informationScopeUserId)||null;
        await loadBootstrap();
        if(selectedId&&state.users.some(user=>Number(user.id_SB)===selectedId)){
          state.informationScopeUserId=selectedId;
          await loadInformationScope(selectedId);
        }
        return;
      }
      await loadBootstrap();
    });
    document.getElementById('pc-save')?.addEventListener('click',saveChanges);
    renderSaveStatus();
    view.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',async()=>{
      if(state.savingPermissions||state.savingNotifications||state.savingInformationScope||state.savingInformationScopeBulk){toast('Espera a que termine el guardado actual.');return;}
      const nextTab=btn.dataset.tab;
      if(nextTab===state.tab)return;
      const pending=state.tab==='notifications'
        ?state.notificationDirty.size
        :state.tab==='information-scope'
          ?(informationScopeDirty()?1:0)
          :state.dirty.size;
      if(pending&&!confirm('Hay cambios sin guardar. ¿Deseas descartarlos y cambiar de pestaña?'))return;
      if(state.tab==='information-scope'&&state.informationScopeBase){
        state.informationScopeDraft=cloneInformationScopeDraft(state.informationScopeBase);
      }
      state.tab=nextTab;
      state.dirty.clear();
      state.notificationDirty.clear();
      state.permissionQuery='';
      render();
      if(state.tab==='roles'&&state.selectedRoleId) await loadRolePermissions(state.selectedRoleId);
      if(state.tab==='admin-users'){ await loadAdminCatalogs(); renderAdminUsers(); }
      if(state.tab==='notifications') await loadNotificationMatrix();
    }));
    renderMain();
  }

  function renderMain(){
    const box=document.getElementById('pc-content');
    if(!box)return;
    if(state.bootLoading){box.innerHTML='<section class="pc-permissions"><div class="pc-empty large">Cargando información real desde Aiven...</div></section>';return;}
    if(state.error){box.innerHTML=`<section class="pc-permissions"><div class="pc-empty large"><b>No se pudo cargar el Panel de Control.</b><br>${esc(state.error)}</div></section>`;return;}
    if(state.tab==='admin-users'){ renderAdminUsers(); return; }
    if(state.tab==='admin-roles'){ renderAdminRoles(); return; }
    if(state.tab==='information-scope'){ renderInformationScope(); return; }
    if(state.tab==='notifications'){ renderNotificationPanel(); return; }
    if(state.tab==='viewer'){ window.ManttoUserViewer?.renderPanel?.(box); updateSaveButton(); return; }
    if(state.tab==='audit'){
      box.innerHTML='<section class="pc-audit"><div class="pc-audit-head"><div><span class="pc-eyebrow">TRAZABILIDAD</span><h2>Auditoría</h2><p>La auditoría histórica completa se integrará en una tabla dedicada. Los campos created_by, updated_by, created_at y updated_at ya se actualizan al guardar.</p></div></div></section>';
      updateSaveButton();
      return;
    }
    box.innerHTML='<div class="pc-workspace"><aside class="pc-selector"></aside><section class="pc-permissions" id="pc-permission-panel"></section></div>';
    renderSelectorShell();
    renderPermissionPanel();
    updateSaveButton();
  }

  function filteredItems(){
    const q=state.query.trim().toLowerCase();
    const source=state.tab==='users'?state.users:state.roles;
    return source.filter(item=>{
      const text=state.tab==='users'?[item.nombre,item.correo,item.puesto,item.area,item.empresa,...(item.roles||[]).map(r=>r.rol)].join(' '):[item.rol,item.codigo,item.empresa].join(' ');
      const company=normalizeCompany(item.empresa);
      return (!q||text.toLowerCase().includes(q))&&(!state.company||company===state.company);
    });
  }

  function renderSelectorShell(){
    const selector=document.querySelector('.pc-selector');
    if(!selector)return;
    const usersMode=state.tab==='users';
    selector.innerHTML=`<div class="pc-selector-head"><h2>${usersMode?'Usuarios':'Roles'}</h2><p>${usersMode?'Agrupados por área y ordenados por nivel jerárquico.':'Selecciona un rol para configurar su acceso base.'}</p></div>
      <div class="pc-filters"><input id="pc-search" value="${esc(state.query)}" placeholder="Buscar..."><select id="pc-company"><option value="">Todas las empresas</option>${['GENERAL','UNITED','CORELLIAN'].map(c=>`<option value="${c}" ${state.company===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="pc-list" id="pc-selector-list"></div>`;

    const search=document.getElementById('pc-search');
    search?.addEventListener('input',e=>{
      state.query=e.target.value;
      renderSelectorList();
    });
    document.getElementById('pc-company')?.addEventListener('change',e=>{
      state.company=e.target.value;
      renderSelectorList();
    });
    renderSelectorList();
  }

  function renderSelectorList(){
    const list=document.getElementById('pc-selector-list');
    if(!list)return;
    const scrollTop=list.scrollTop;
    const items=filteredItems();
    list.innerHTML=items.length
      ?(state.tab==='users'?usersGroupedHtml(items):items.map(roleItem).join(''))
      :'<div class="pc-empty">Sin resultados.</div>';
    bindSelectorItems();
    list.scrollTop=scrollTop;
  }

  function usersGroupedHtml(users){
    return groupedUsers(users).map(group=>`
      <section class="pc-area-group">
        <div class="pc-area-heading"><span>${esc(group.label)}</span><em>${group.users.length}</em></div>
        <div class="pc-area-users">${group.users.map(userItem).join('')}</div>
      </section>`).join('');
  }

  function userItem(u){
    const active=Number(u.id_SB)===Number(state.selectedUserId);
    const principal=principalRole(u);
    return `<button class="pc-list-item ${active?'active':''}" data-user-id="${u.id_SB}"><span class="pc-list-icon">${esc(initials(u))}</span><span><b>${esc(u.nombre)}</b><small>${esc(principal?.rol||u.puesto||'Sin rol')}</small></span><em>${esc(u.personalizaciones||0)}</em></button>`;
  }

  function roleItem(r){
    const active=Number(r.id_rol)===Number(state.selectedRoleId);
    const pct=Math.round((Number(r.permisos_permitidos||0)/Math.max(Number(state.totals.permisos_disponibles||1),1))*100);
    return `<button class="pc-list-item ${active?'active':''}" data-role-id="${r.id_rol}"><span class="pc-list-icon">◆</span><span><b>${esc(r.rol)}</b><small>${esc(normalizeCompany(r.empresa))} · ${esc(r.codigo||'SIN_CODIGO')}</small></span><em>${pct}%</em></button>`;
  }

  function bindSelectorItems(){
    document.querySelectorAll('[data-user-id]').forEach(btn=>btn.addEventListener('click',async()=>{
      if(state.savingPermissions){toast('Espera a que termine el guardado actual.');return;}
      const id=Number(btn.dataset.userId);
      if(id===Number(state.selectedUserId))return;
      if(state.dirty.size&&!confirm('Hay cambios sin guardar. ¿Deseas descartarlos y seleccionar otro usuario?'))return;
      state.selectedUserId=id;
      state.dirty.clear();
      state.userPermissions=new Map();
      state.userRoles=[];
      state.rolePickerOpen=false;
      state.roleDraft=new Set();
      state.principalRoleId=null;
      renderSelectorList();
      updateSaveButton();
      await loadUserPermissions(id);
    }));
    document.querySelectorAll('[data-role-id]').forEach(btn=>btn.addEventListener('click',async()=>{
      if(state.savingPermissions){toast('Espera a que termine el guardado actual.');return;}
      const id=Number(btn.dataset.roleId);
      if(id===Number(state.selectedRoleId))return;
      if(state.dirty.size&&!confirm('Hay cambios sin guardar. ¿Deseas descartarlos y seleccionar otro rol?'))return;
      state.selectedRoleId=id;
      state.dirty.clear();
      renderSelectorList();
      updateSaveButton();
      await loadRolePermissions(id);
    }));
  }

  function renderPermissionPanel(){
    const panel=document.getElementById('pc-permission-panel');
    if(!panel)return;
    if(state.panelLoading){panel.innerHTML='<div class="pc-empty large"><span class="pc-spinner"></span>Cargando permisos...</div>';return;}
    panel.innerHTML=permissionsHtml();
    bindPermissions();
  }

  function permissionsHtml(){
    const usersMode=state.tab==='users';
    const selected=usersMode
      ?state.users.find(u=>Number(u.id_SB)===Number(state.selectedUserId))
      :state.roles.find(r=>Number(r.id_rol)===Number(state.selectedRoleId));

    if(!selected){
      return `<div class="pc-empty pc-select-user"><div class="pc-select-user-icon">👤</div><h3>Selecciona un usuario</h3><p>Elige un usuario de la lista para consultar sus permisos efectivos y personalizarlos.</p></div>`;
    }

    const title=usersMode?selected.nombre:selected.rol;
    const subtitle=usersMode?`${selected.correo||''} · ${selected.empresa||''}`:`${selected.codigo||''} · ${normalizeCompany(selected.empresa)}`;
    const stats=usersMode
      ?`<span><b>${countUserOverrides()}</b> personalizaciones</span><span><b>${effectivePercent()}%</b> acceso efectivo</span>`
      :`<span><b>${rolePercent()}%</b> permitido</span>`;
    const roleSummary=usersMode&&state.userRoles.length
      ?state.userRoles.map(r=>`<span class="pc-role-summary-item">${esc(r.rol)}${r.principal?' <strong>(Principal)</strong>':''}</span>`).join('')
      :'<span class="pc-role-summary-item muted">Sin roles activos</span>';
    const roleSection=usersMode
      ?`<div class="pc-role-section">
          <div class="pc-role-current"><b>Rol</b><div>${roleSummary}</div></div>
          <button type="button" class="pc-role-trigger" id="pc-role-trigger" aria-expanded="${state.rolePickerOpen?'true':'false'}">
            <span>${state.rolePickerOpen?'Cerrar administración':'Administrar roles'}</span><i aria-hidden="true">${state.rolePickerOpen?'▲':'▼'}</i>
          </button>
          ${state.rolePickerOpen?rolesGridHtml():''}
        </div>`
      :'';

    return `<div class="pc-perm-head"><div class="pc-perm-identity"><span class="pc-status ${Number(selected.estado)===1?'ok':''}">${Number(selected.estado)===1?'Activo':'Inactivo'}</span><h2>${esc(title)}</h2><p>${esc(subtitle)}</p>${roleSection}</div><div class="pc-head-stats">${stats}</div></div>
      <div class="pc-toolbar"><input id="pc-permission-search" value="${esc(state.permissionQuery)}" placeholder="Buscar agrupación, módulo, elemento, subelemento o acción"><button id="pc-expand">Expandir todo</button><button id="pc-collapse">Contraer todo</button></div>
      <div class="pc-tree" id="pc-tree">${treeHtml()}</div>`;
  }


  function normalizedRoleName(role){
    return String(role?.rol||'').trim().toLowerCase();
  }

  function incompatibleRoleIds(selectedId){
    const selected=state.roles.find(role=>Number(role.id_rol)===Number(selectedId));
    const name=normalizedRoleName(selected);
    const master='programador';
    const scoped=new Set(['programador united','programador corellian']);
    if(name===master){
      return state.roles.filter(role=>scoped.has(normalizedRoleName(role))).map(role=>Number(role.id_rol));
    }
    if(scoped.has(name)){
      return state.roles.filter(role=>normalizedRoleName(role)===master).map(role=>Number(role.id_rol));
    }
    return [];
  }

  function roleConflictMessage(selectedId){
    const role=state.roles.find(item=>Number(item.id_rol)===Number(selectedId));
    const conflicts=incompatibleRoleIds(selectedId).filter(id=>state.roleDraft.has(id));
    if(!conflicts.length)return '';
    const names=state.roles.filter(item=>conflicts.includes(Number(item.id_rol))).map(item=>item.rol).join(', ');
    return `${role?.rol||'El rol seleccionado'} es incompatible con ${names}.`;
  }

  function rolesGridHtml(){
    const roles=state.roles.filter(role=>Number(role.estado)===1&&Number(role.id_rol)!==Number(state.principalRoleId));
    const additionalCount=[...state.roleDraft].filter(id=>Number(id)!==Number(state.principalRoleId)).length;
    return `<div class="pc-role-picker">
      <div class="pc-role-picker-head"><div><b>Asignar roles adicionales</b><small>Activa o desactiva los roles adicionales del usuario.</small></div><span>${additionalCount} activo(s)</span></div>
      <div class="pc-role-grid">${roles.map(role=>{
        const id=Number(role.id_rol);
        const checked=state.roleDraft.has(id);
        const blocked=!checked&&incompatibleRoleIds(id).some(conflictId=>state.roleDraft.has(conflictId));
        return `<label class="pc-role-option ${checked?'selected':''} ${blocked?'blocked':''}">
          <span class="pc-role-name">${esc(role.rol)}</span>
          <input type="checkbox" data-role-check="${id}" ${checked?'checked':''} ${blocked?'disabled':''} aria-label="Activar rol ${esc(role.rol)}">
        </label>`;
      }).join('')}</div>
      <div class="pc-role-actions"><button type="button" class="pc-btn ghost" id="pc-role-cancel">Cancelar</button><button type="button" class="pc-btn primary" id="pc-role-save" ${state.savingRoles?'disabled':''}>${state.savingRoles?'Guardando...':'Guardar roles'}</button></div>
    </div>`;
  }

  function bindRolePicker(){
    document.getElementById('pc-role-trigger')?.addEventListener('click',()=>{
      state.rolePickerOpen=!state.rolePickerOpen;
      renderPermissionPanel();
    });
    document.querySelectorAll('[data-role-check]').forEach(input=>input.addEventListener('change',()=>{
      const id=Number(input.dataset.roleCheck);
      if(input.checked){
        const conflict=roleConflictMessage(id);
        if(conflict){
          input.checked=false;
          toast(conflict);
          return;
        }
        state.roleDraft.add(id);
      }else{
        if(Number(state.principalRoleId)===id){
          input.checked=true;
          toast('El rol principal no se modifica desde este administrador.');
          return;
        }
        state.roleDraft.delete(id);
      }
      renderPermissionPanel();
    }));
    document.getElementById('pc-role-cancel')?.addEventListener('click',()=>{
      state.roleDraft=new Set(state.userRoles.map(role=>Number(role.id_rol)));
      state.principalRoleId=Number(state.userRoles.find(role=>role.principal)?.id_rol||state.userRoles[0]?.id_rol||0)||null;
      state.rolePickerOpen=false;
      renderPermissionPanel();
    });
    document.getElementById('pc-role-save')?.addEventListener('click',saveUserRoles);
  }

  async function saveUserRoles(){
    if(!state.selectedUserId||!state.roleDraft.size)return;
    if(!state.principalRoleId||!state.roleDraft.has(Number(state.principalRoleId))){
      toast('Selecciona un rol principal entre los roles activos.');
      return;
    }
    const conflict=[...state.roleDraft].map(roleConflictMessage).find(Boolean);
    if(conflict){
      toast(conflict);
      return;
    }
    const selected=state.users.find(user=>Number(user.id_SB)===Number(state.selectedUserId));
    if(!confirm(`¿Guardar ${state.roleDraft.size} rol(es) para ${selected?.nombre||'el usuario seleccionado'}?`))return;
    state.savingRoles=true;
    renderPermissionPanel();
    try{
      await request(`/api/panel-control/usuarios/${state.selectedUserId}/roles`,{
        method:'PUT',
        body:JSON.stringify({role_ids:[...state.roleDraft],principal_role_id:Number(state.principalRoleId)})
      });
      toast('Roles actualizados correctamente en Aiven.');
      await refreshTotalsOnly();
      await loadUserPermissions(state.selectedUserId);
    }catch(error){
      toast(error.message||'No fue posible actualizar los roles.');
    }finally{
      state.savingRoles=false;
      renderPermissionPanel();
    }
  }

  function visibleGroup(g){
    const q=state.permissionQuery.trim().toLowerCase();
    if(!q)return true;
    return [g.name,g.code,...g.modules.flatMap(m=>[m.name,m.code,...m.elements.flatMap(e=>[e.name,e.code,...e.subs.flatMap(s=>[s.name,s.code,...s.actions.flatMap(a=>[a.name,a.code])])])])].join(' ').toLowerCase().includes(q);
  }

  function treeHtml(){
    const groups=state.catalog.filter(visibleGroup);
    return groups.length?`<div class="pc-tree-table"><div class="pc-tree-header"><span>Permiso</span><span>Tipo</span><span>Activos</span><span>Estado</span><span>Control</span></div>${groups.map(groupHtml).join('')}</div>`:'<div class="pc-empty large">No hay permisos que coincidan con la búsqueda.</div>';
  }

  function actionState(actions){
    const total=actions.length;
    const enabled=actions.filter(action=>state.tab==='roles'?roleValue(action.id):userValue(action.id).efectivo).length;
    return {total,enabled,checked:total>0&&enabled===total,indeterminate:enabled>0&&enabled<total};
  }

  function nodeKey(level,id){return `${level}:${id}`;}

  function nodeOpen(level,id){
    return Boolean(state.permissionQuery.trim())||state.expanded.has(nodeKey(level,id));
  }

  function hierarchyKey(level,id){return `${level}:${id}`;}

  function hierarchyValue(level,id){
    const changed=state.hierarchyDirty.get(hierarchyKey(level,id));
    if(state.tab==='roles'){
      if(changed)return {checked:Boolean(changed.permitido),indeterminate:false};
      return {checked:Boolean(state.roleHierarchy[level]?.get(Number(id))),indeterminate:false};
    }
    const base=state.userHierarchy[level]?.get(Number(id))||{heredado:false,personalizado:null,efectivo:false};
    if(!changed)return {checked:Boolean(base.efectivo),indeterminate:false};
    const checked=changed.mode==='inherit'?Boolean(base.heredado):changed.mode==='allow';
    return {checked,indeterminate:false};
  }

  function hierarchyCheck(level,id,actions,label){
    if(!actions.length){
      return '<span class="pc-node-unavailable" title="El catálogo no contiene un permiso asignable para este contenedor.">—</span>';
    }
    const current=actionState(actions);
    const ids=actions.map(action=>action.id).join(',');
    return `<label class="pc-tree-check ${current.indeterminate?'partial':current.checked?'enabled':'disabled'}" title="${esc(label)}: ${current.enabled} de ${current.total} permisos activos">
      <input type="checkbox" data-bulk-level="${level}" data-bulk-id="${id}" data-action-ids="${ids}" ${current.checked?'checked':''}>
      <span aria-hidden="true"></span>
    </label>`;
  }

  function treeRow({level,id,name,meta,type,actions,hasChildren,open,childrenHtml}){
    const current=actionState(actions);
    const stateText=!actions.length?'Sin permiso asignable':current.indeterminate?'Parcial':current.checked?'Activo':'Inactivo';
    const countText=actions.length?`${current.enabled}/${current.total}`:'—';
    const toggle=hasChildren
      ?`<button type="button" class="pc-tree-toggle ${open?'open':''}" data-tree-level="${level}" data-tree-id="${id}" aria-label="${open?'Contraer':'Expandir'} ${esc(name)}">›</button>`
      :'<span class="pc-tree-spacer"></span>';
    return `<div class="pc-tree-node pc-level-${level} ${open?'open':''}">
      <div class="pc-tree-row ${current.indeterminate?'partial':current.checked?'enabled':'disabled'}">
        <div class="pc-tree-name">${toggle}<span class="pc-tree-branch" aria-hidden="true"></span><span class="pc-tree-label"><b>${esc(name)}</b>${meta?`<small>${esc(meta)}</small>`:''}</span></div>
        <span class="pc-tree-type">${esc(type)}</span>
        <span class="pc-tree-count">${countText}</span>
        <span class="pc-tree-state ${current.indeterminate?'partial':current.checked?'enabled':'disabled'}">${stateText}</span>
        <span class="pc-tree-control">${hierarchyCheck(level,id,actions,`${type} ${name}`)}</span>
      </div>
      ${hasChildren?`<div class="pc-tree-children">${childrenHtml}</div>`:''}
    </div>`;
  }

  function groupHtml(g){
    const actions=allActions(g);
    const open=nodeOpen('group',g.id);
    const visibleModules=g.modules.filter(module=>!module.internalVisual);
    const children=visibleModules.length
      ?visibleModules.map(moduleHtml).join('')
      :'<div class="pc-tree-empty">Sin módulos configurados.</div>';
    return treeRow({level:'group',id:g.id,name:g.name,meta:g.company,type:'Agrupación',actions,hasChildren:true,open,childrenHtml:children});
  }

  function moduleHtml(m){
    const actions=m.elements.flatMap(e=>e.subs.flatMap(s=>s.actions));
    const open=nodeOpen('module',m.id);
    const children=m.elements.length
      ?m.elements.map(elementHtml).join('')
      :'<div class="pc-tree-empty">Módulo sin elementos configurados.</div>';
    return treeRow({level:'module',id:m.id,name:m.name,meta:m.code,type:'Módulo',actions,hasChildren:true,open,childrenHtml:children});
  }

  function elementHtml(e){
    const actions=e.subs.flatMap(s=>s.actions);
    const open=nodeOpen('element',e.id);
    const children=e.subs.length
      ?e.subs.map(subHtml).join('')
      :'<div class="pc-tree-empty">Elemento sin subelementos configurados.</div>';
    return treeRow({level:'element',id:e.id,name:e.name,meta:e.code,type:e.type||'Elemento',actions,hasChildren:true,open,childrenHtml:children});
  }

  function subHtml(s){
    const open=nodeOpen('sub',s.id);
    const children=s.actions.length
      ?s.actions.map(actionRow).join('')
      :'<div class="pc-tree-empty">Subelemento sin acciones configuradas.</div>';
    return treeRow({level:'sub',id:s.id,name:s.name,meta:s.code,type:'Subelemento',actions:s.actions,hasChildren:true,open,childrenHtml:children});
  }

  function actionRow(action){
    return `<div class="pc-tree-node pc-level-action"><div class="pc-tree-row pc-action-row">
      <div class="pc-tree-name"><span class="pc-tree-spacer"></span><span class="pc-tree-branch" aria-hidden="true"></span><span class="pc-tree-label"><b>${esc(action.name)}</b>${action.description?`<small>${esc(action.description)}</small>`:''}</span></div>
      <span class="pc-tree-type">Acción</span>
      <span class="pc-tree-count">1</span>
      <span class="pc-tree-state">${state.tab==='roles'?(roleValue(action.id)?'Activo':'Inactivo'):(userValue(action.id).efectivo?'Activo':'Inactivo')}</span>
      <span class="pc-tree-control">${actionControl(action)}</span>
    </div></div>`;
  }

  function roleValue(id){
    return state.dirty.has(id)?Boolean(state.dirty.get(id).permitido):Boolean(state.rolePermissions.get(id));
  }

  function userValue(id){
    const base=state.userPermissions.get(id)||{heredado:false,personalizado:null,efectivo:false};
    if(!state.dirty.has(id))return base;
    const mode=state.dirty.get(id).mode;
    return {
      ...base,
      personalizado:mode==='inherit'?null:mode==='allow',
      efectivo:mode==='inherit'?base.heredado:mode==='allow'
    };
  }

  function actionControl(action){
    if(state.tab==='roles'){
      return `<label class="pc-check ${state.dirty.has(action.id)?'changed':''} ${action.sensitive?'sensitive':''}" title="${esc(action.description||'')}"><input type="checkbox" data-role-permission="${action.id}" ${roleValue(action.id)?'checked':''}><span>${esc(action.name)}</span></label>`;
    }

    const value=userValue(action.id);
    const personalized=value.personalizado!==null;
    const changed=state.dirty.has(action.id);
    return `<div class="pc-user-check ${personalized?'personalized':'inherited'} ${changed?'changed':''} ${action.sensitive?'sensitive':''}" data-user-permission="${action.id}" title="${esc(action.description||'')}">
      <label><input type="checkbox" data-user-check="${action.id}" ${value.efectivo?'checked':''}><span>${esc(action.name)}</span></label>
      <small>${personalized?'Personalizado':'Por rol'}</small>
      ${personalized?`<button type="button" data-restore="${action.id}" title="Restaurar el valor definido por el rol">↺ Restaurar al rol</button>`:''}
    </div>`;
  }

  function allActions(group){return group.modules.flatMap(m=>m.elements.flatMap(e=>e.subs.flatMap(s=>s.actions)));}
  function groupPercent(g){const acts=allActions(g);const yes=acts.filter(a=>state.tab==='roles'?roleValue(a.id):userValue(a.id).efectivo).length;return Math.round(yes/Math.max(acts.length,1)*100);}
  function rolePercent(){const all=state.catalog.flatMap(allActions);return Math.round(all.filter(a=>roleValue(a.id)).length/Math.max(all.length,1)*100);}
  function effectivePercent(){const all=state.catalog.flatMap(allActions);return Math.round(all.filter(a=>userValue(a.id).efectivo).length/Math.max(all.length,1)*100);}
  function countUserOverrides(){const all=state.catalog.flatMap(allActions);return all.filter(a=>userValue(a.id).personalizado!==null).length;}

  function renderTreeOnly(){
    const tree=document.getElementById('pc-tree');
    if(!tree)return;
    const scrollTop=tree.scrollTop;
    tree.innerHTML=treeHtml();
    bindTreeControls();
    tree.scrollTop=scrollTop;
    updateHeaderStats();
    updateSaveButton();
  }

  function updateHeaderStats(){
    const stats=document.querySelector('.pc-head-stats');
    if(!stats)return;
    stats.innerHTML=state.tab==='users'
      ?`<span><b>${countUserOverrides()}</b> personalizaciones</span><span><b>${effectivePercent()}%</b> acceso efectivo</span>`
      :`<span><b>${rolePercent()}%</b> permitido</span>`;
  }

  function bindPermissions(){
    bindRolePicker();
    const search=document.getElementById('pc-permission-search');
    search?.addEventListener('input',e=>{
      state.permissionQuery=e.target.value;
      renderTreeOnly();
    });
    document.getElementById('pc-expand')?.addEventListener('click',()=>{state.catalog.forEach(g=>{state.expanded.add(nodeKey('group',g.id));g.modules.forEach(m=>{state.expanded.add(nodeKey('module',m.id));m.elements.forEach(e=>{state.expanded.add(nodeKey('element',e.id));e.subs.forEach(sub=>state.expanded.add(nodeKey('sub',sub.id)));});});});renderTreeOnly();});
    document.getElementById('pc-collapse')?.addEventListener('click',()=>{state.expanded.clear();renderTreeOnly();});
    bindTreeControls();
  }

  function applyDesiredValue(id,desired){
    if(state.tab==='roles'){
      const original=Boolean(state.rolePermissions.get(id));
      if(desired===original)state.dirty.delete(id);
      else state.dirty.set(id,{permitido:desired});
      return;
    }
    const base=state.userPermissions.get(id)||{heredado:false,personalizado:null,efectivo:false};
    const mode=desired===Boolean(base.heredado)?'inherit':desired?'allow':'deny';
    const originalMode=base.personalizado===null?'inherit':base.personalizado?'allow':'deny';
    if(mode===originalMode)state.dirty.delete(id);
    else state.dirty.set(id,{mode});
  }

  function syncHierarchyCheckboxes(){
    document.querySelectorAll('[data-action-ids]').forEach(input=>{
      const ids=String(input.dataset.actionIds||'').split(',').map(Number).filter(Number.isInteger);
      const actions=ids.map(id=>({id}));
      const current=actionState(actions);
      input.checked=current.checked;
      input.indeterminate=current.indeterminate;
      input.setAttribute('aria-checked',current.indeterminate?'mixed':String(current.checked));
    });
  }

  function bindTreeControls(){
    document.querySelectorAll('[data-tree-level]').forEach(btn=>btn.addEventListener('click',()=>{
      const key=nodeKey(btn.dataset.treeLevel,btn.dataset.treeId);
      state.expanded.has(key)?state.expanded.delete(key):state.expanded.add(key);
      renderTreeOnly();
    }));

    document.querySelectorAll('[data-bulk-level]').forEach(input=>input.addEventListener('change',event=>{
      event.stopPropagation();
      const ids=String(input.dataset.actionIds||'').split(',').map(Number).filter(Number.isInteger);
      const desired=Boolean(input.checked);
      ids.forEach(id=>applyDesiredValue(id,desired));
      renderTreeOnly();
    }));



    document.querySelectorAll('[data-role-permission]').forEach(input=>input.addEventListener('change',()=>{
      const id=Number(input.dataset.rolePermission);
      const original=Boolean(state.rolePermissions.get(id));
      if(input.checked===original)state.dirty.delete(id);
      else state.dirty.set(id,{permitido:input.checked});
      renderTreeOnly();
    }));

    document.querySelectorAll('[data-user-check]').forEach(input=>input.addEventListener('change',()=>{
      const id=Number(input.dataset.userCheck);
      const base=state.userPermissions.get(id)||{heredado:false,personalizado:null,efectivo:false};
      const desired=Boolean(input.checked);
      const mode=desired===Boolean(base.heredado)?'inherit':desired?'allow':'deny';
      const originalMode=base.personalizado===null?'inherit':base.personalizado?'allow':'deny';
      if(mode===originalMode)state.dirty.delete(id);
      else state.dirty.set(id,{mode});
      renderTreeOnly();
    }));

    document.querySelectorAll('[data-restore]').forEach(btn=>btn.addEventListener('click',()=>{
      const id=Number(btn.dataset.restore);
      const base=state.userPermissions.get(id)||{personalizado:null};
      if(base.personalizado===null)state.dirty.delete(id);
      else state.dirty.set(id,{mode:'inherit'});
      renderTreeOnly();
    }));
    syncHierarchyCheckboxes();
  }

  function updateSaveButton(){
    const btn=document.getElementById('pc-save');
    if(!btn)return;
    if(state.tab==='notifications'){
      const invalid=notificationInvalidDrafts();
      btn.disabled=state.savingNotifications||state.notificationLoading||state.notificationDirty.size===0||invalid>0;
      btn.title=invalid?`Falta seleccionar política en ${invalid} configuración(es).`:'';
      btn.innerHTML=state.savingNotifications
        ?'Guardando notificaciones...'
        :`Guardar cambios <span id="pc-dirty-count">${state.notificationDirty.size}</span>`;
      return;
    }
    if(state.tab==='information-scope'){
      btn.disabled=true;
      btn.title='El alcance de información se guarda desde el editor del usuario seleccionado.';
      btn.innerHTML='Guardar cambios <span id="pc-dirty-count">0</span>';
      return;
    }
    btn.title='';
    const targetMissing=state.tab==='users'?!state.selectedUserId:state.tab==='roles'?!state.selectedRoleId:false;
    btn.disabled=state.savingPermissions||state.dirty.size===0||state.tab==='audit'||targetMissing||state.panelLoading;
    btn.innerHTML=state.savingPermissions
      ?'Guardando y verificando...'
      :`Guardar cambios <span id="pc-dirty-count">${state.dirty.size}</span>`;
  }

  function renderSaveStatus(){
    const box=document.getElementById('pc-save-status');
    const text=document.getElementById('pc-save-status-text');
    const percent=document.getElementById('pc-save-status-percent');
    const progress=document.getElementById('pc-save-progress');
    const fill=document.getElementById('pc-save-progress-fill');
    if(!box||!text||!percent||!progress||!fill)return;

    const value=Math.max(0,Math.min(100,Number(state.saveProgress.percent||0)));
    box.hidden=!state.saveProgress.visible;
    box.dataset.tone=state.saveProgress.tone||'working';
    text.textContent=state.saveProgress.label||'';
    percent.textContent=`${value}%`;
    progress.setAttribute('aria-valuenow',String(value));
    progress.setAttribute('aria-label',state.saveProgress.label||'Estado del guardado');
    fill.style.width=`${value}%`;
  }

  function setSaveStatus(percent,label,tone='working',autoHideMs=0){
    if(saveStatusTimer){
      window.clearTimeout(saveStatusTimer);
      saveStatusTimer=null;
    }
    state.saveProgress={visible:true,percent,label,tone};
    renderSaveStatus();
    if(autoHideMs>0){
      saveStatusTimer=window.setTimeout(()=>{
        state.saveProgress={visible:false,percent:0,label:'',tone:'working'};
        renderSaveStatus();
        saveStatusTimer=null;
      },autoHideMs);
    }
  }

  function normalizeNullableBoolean(value){
    if(value===null||value===undefined)return null;
    if(value===true||value===1||value==='1')return true;
    if(value===false||value===0||value==='0')return false;
    return Boolean(value);
  }

  function permissionRowsFromReadback(readback){
    if(Array.isArray(readback?.data))return readback.data;
    return Array.isArray(readback?.data?.permisos)?readback.data.permisos:[];
  }

  function countConfirmedChanges(isUsers,changes,readback){
    const byId=new Map(permissionRowsFromReadback(readback).map(row=>[
      Number(row.id_subelemento_accion),
      row
    ]));

    return changes.reduce((total,change)=>{
      const row=byId.get(Number(change.id_subelemento_accion));
      if(!row)return total;

      if(isUsers){
        const current=normalizeNullableBoolean(row.personalizado);
        if(change.mode==='inherit'&&current===null)return total+1;
        if(change.mode==='allow'&&current===true)return total+1;
        if(change.mode==='deny'&&current===false)return total+1;
        return total;
      }

      return normalizeNullableBoolean(row.permitido)===Boolean(change.permitido)
        ?total+1
        :total;
    },0);
  }

  function capturePermissionViewContext(){
    const active=document.activeElement;
    const canRestoreSelection=active&&typeof active.selectionStart==='number';
    return {
      windowX:Number(window.scrollX||0),
      windowY:Number(window.scrollY||0),
      selectorScrollTop:Number(document.getElementById('pc-selector-list')?.scrollTop||0),
      panelScrollTop:Number(document.getElementById('pc-permission-panel')?.scrollTop||0),
      treeScrollTop:Number(document.getElementById('pc-tree')?.scrollTop||0),
      treeScrollLeft:Number(document.getElementById('pc-tree')?.scrollLeft||0),
      activeId:active?.id||'',
      selectionStart:canRestoreSelection?active.selectionStart:null,
      selectionEnd:canRestoreSelection?active.selectionEnd:null
    };
  }

  function restorePermissionViewContext(context){
    window.requestAnimationFrame(()=>{
      const selector=document.getElementById('pc-selector-list');
      const panel=document.getElementById('pc-permission-panel');
      const tree=document.getElementById('pc-tree');
      if(selector)selector.scrollTop=context.selectorScrollTop;
      if(panel)panel.scrollTop=context.panelScrollTop;
      if(tree){
        tree.scrollTop=context.treeScrollTop;
        tree.scrollLeft=context.treeScrollLeft;
      }
      window.scrollTo(context.windowX,context.windowY);
      const active=context.activeId?document.getElementById(context.activeId):null;
      if(active){
        active.focus({preventScroll:true});
        if(typeof active.setSelectionRange==='function'&&context.selectionStart!==null){
          active.setSelectionRange(context.selectionStart,context.selectionEnd);
        }
      }
    });
  }

  function renderSummaryCounters(){
    const summary=document.querySelector('.pc-summary');
    if(!summary)return;
    summary.innerHTML=`<article><b>${esc(state.totals.roles_activos||0)}</b><span>Roles activos</span></article><article><b>${esc(state.totals.usuarios_activos||0)}</b><span>Usuarios activos</span></article><article><b>${esc(state.totals.permisos_disponibles||0)}</b><span>Permisos disponibles</span></article><article><b>${esc(state.totals.personalizaciones_activas||0)}</b><span>Personalizaciones activas</span></article>`;
  }

  function applyPermissionReadback(isUsers,readback){
    const data=readback?.data||{};
    const permissions=permissionRowsFromReadback(readback);

    if(isUsers){
      state.userRoles=data.roles||state.userRoles;
      state.roleDraft=new Set(state.userRoles.map(role=>Number(role.id_rol)));
      state.principalRoleId=Number(state.userRoles.find(role=>role.principal)?.id_rol||state.userRoles[0]?.id_rol||0)||null;
      state.userPermissions=new Map(permissions.map(row=>[
        Number(row.id_subelemento_accion),
        row
      ]));
      state.userHierarchy={
        group:new Map((data.jerarquia?.agrupaciones||[]).map(row=>[Number(row.id_agrupacion),row])),
        module:new Map((data.jerarquia?.modulos||[]).map(row=>[Number(row.id_modulo),row]))
      };

      const selected=state.users.find(user=>Number(user.id_SB)===Number(state.selectedUserId));
      if(selected){
        const previous=Number(selected.personalizaciones||0);
        const current=permissions.reduce((total,row)=>
          total+(normalizeNullableBoolean(row.personalizado)===null?0:1),0
        );
        selected.personalizaciones=current;
        state.totals.personalizaciones_activas=Math.max(
          0,
          Number(state.totals.personalizaciones_activas||0)-previous+current
        );
      }
      return;
    }

    state.rolePermissions=new Map(permissions.map(row=>[
      Number(row.id_subelemento_accion),
      Boolean(row.permitido)
    ]));
    state.roleHierarchy={
      group:new Map((data.jerarquia?.agrupaciones||[]).map(row=>[Number(row.id_agrupacion),Boolean(row.permitido)])),
      module:new Map((data.jerarquia?.modulos||[]).map(row=>[Number(row.id_modulo),Boolean(row.permitido)]))
    };

    const selected=state.roles.find(role=>Number(role.id_rol)===Number(state.selectedRoleId));
    if(selected){
      selected.permisos_permitidos=permissions.reduce((total,row)=>
        total+(Boolean(row.permitido)?1:0),0
      );
    }
  }

  async function saveChanges(){
    if(state.tab==='notifications'){
      await saveNotificationChanges();
      return;
    }
    if(state.savingPermissions||!state.dirty.size)return;
    const isUsers=state.tab==='users';
    const selectedId=isUsers?Number(state.selectedUserId):Number(state.selectedRoleId);
    const target=isUsers
      ?state.users.find(user=>Number(user.id_SB)===selectedId)?.nombre
      :state.roles.find(role=>Number(role.id_rol)===selectedId)?.rol;
    const totalChanges=state.dirty.size;
    if(!confirm(`¿Guardar ${totalChanges} cambio(s) para ${target||'el registro seleccionado'}?`))return;

    const changes=[...state.dirty.entries()].map(([id,value])=>({
      id_subelemento_accion:Number(id),
      ...value
    }));
    const path=isUsers
      ?`/api/panel-control/usuarios/${selectedId}/permisos`
      :`/api/panel-control/roles/${selectedId}/permisos`;
    const viewContext=capturePermissionViewContext();

    state.savingPermissions=true;
    updateSaveButton();
    setSaveStatus(10,`Preparando ${changes.length} cambio(s)...`);
    try{
      setSaveStatus(35,'Enviando cambios a Aiven...');
      const response=await request(path,{
        method:'PUT',
        body:JSON.stringify({changes})
      });
      const updated=Number(response.data?.updated||0);
      if(updated!==changes.length){
        throw new Error(`Aiven procesó ${updated} de ${changes.length} permisos. Los cambios pendientes se conservaron.`);
      }

      setSaveStatus(70,`Aiven procesó ${updated} de ${changes.length}. Verificando...`);
      const readback=await request(path);
      const confirmed=countConfirmedChanges(isUsers,changes,readback);
      if(confirmed!==changes.length){
        throw new Error(`Aiven confirmó ${confirmed} de ${changes.length} permisos. Los cambios pendientes se conservaron.`);
      }

      const sameTarget=isUsers
        ?state.tab==='users'&&Number(state.selectedUserId)===selectedId
        :state.tab==='roles'&&Number(state.selectedRoleId)===selectedId;
      if(!sameTarget){
        throw new Error('El registro seleccionado cambió durante el guardado. Vuelve a abrirlo para confirmar su estado.');
      }

      setSaveStatus(90,`Confirmados ${confirmed} de ${changes.length}. Actualizando la vista...`);
      applyPermissionReadback(isUsers,readback);
      state.dirty.clear();
      state.hierarchyDirty.clear();
      state.savingPermissions=false;
      renderPermissionPanel();
      renderSelectorList();
      renderSummaryCounters();
      updateSaveButton();
      restorePermissionViewContext(viewContext);
      setSaveStatus(100,'Permisos guardados y verificados.','success',2600);
      toast('Permisos guardados y usuario o rol actualizado.');
    }catch(error){
      state.savingPermissions=false;
      updateSaveButton();
      restorePermissionViewContext(viewContext);
      setSaveStatus(
        Number(state.saveProgress.percent||0),
        error.message||'No fue posible guardar y verificar los cambios.',
        'error',
        5200
      );
      toast(error.message||'No fue posible guardar y verificar los cambios.');
    }
  }

  async function refreshTotalsOnly(){
    try{
      const json=await request('/api/panel-control/bootstrap');
      const data=json.data||{};
      state.roles=data.roles||state.roles;
      state.users=data.usuarios||state.users;
      state.totals=data.totales||state.totals;
      const summary=document.querySelector('.pc-summary');
      if(summary){
        summary.innerHTML=`<article><b>${esc(state.totals.roles_activos||0)}</b><span>Roles activos</span></article><article><b>${esc(state.totals.usuarios_activos||0)}</b><span>Usuarios activos</span></article><article><b>${esc(state.totals.permisos_disponibles||0)}</b><span>Permisos disponibles</span></article><article><b>${esc(state.totals.personalizaciones_activas||0)}</b><span>Personalizaciones activas</span></article>`;
      }
      renderSelectorList();
    }catch(e){/* La operación principal ya se guardó. */}
  }


  function filteredInformationScopeUsers(){
  const query=state.informationScopeQuery.trim().toLowerCase();
  const roleId=Number(state.informationScopeRole||0);
  return state.users.filter(user=>{
    if(Number(user.estado)===0)return false;
    const text=[user.nombre,user.correo,user.puesto,user.area,user.empresa,...(user.roles||[]).map(role=>role.rol)].join(' ').toLowerCase();
    const company=String(user.empresa||'').trim();
    const hasRole=!roleId
      || Number(user.rol_id)===roleId
      || (user.roles||[]).some(role=>Number(role.id_rol)===roleId);
    return (!query||text.includes(query))
      &&(!state.informationScopeCompany||normalizeText(company)===normalizeText(state.informationScopeCompany))
      &&hasRole;
  });
}

  function captureInformationScopeListScroll(){
    const list=document.getElementById('pc-information-scope-user-items');
    if(list)state.informationScopeListScrollTop=Number(list.scrollTop||0);
  }

  function informationScopeUserItem(user){
    const active=Number(user.id_SB)===Number(state.informationScopeUserId);
    const role=principalRole(user);
    const bulkSelected=state.informationScopeBulkSelected.has(Number(user.id_SB));
    if(state.informationScopeBulkOpen){
      return `<button type="button" class="pc-list-item pc-information-scope-bulk-user ${bulkSelected?'bulk-selected':''}" data-information-scope-bulk-user="${user.id_SB}"><span class="pc-information-scope-bulk-check">${bulkSelected?'✓':''}</span><span class="pc-avatar">${esc(initials(user))}</span><span><b>${esc(user.nombre)}</b><small>${esc(role?.rol||user.puesto||'Sin rol principal')}</small></span><em>${esc(userHierarchyLevel(user))}</em></button>`;
    }
    return `<button type="button" class="pc-list-item ${active?'active':''}" data-information-scope-user="${user.id_SB}"><span class="pc-avatar">${esc(initials(user))}</span><span><b>${esc(user.nombre)}</b><small>${esc(role?.rol||user.puesto||'Sin rol principal')}</small></span><em>${esc(userHierarchyLevel(user))}</em></button>`;
  }

  function renderInformationScopeUserList(){
    const list=document.getElementById('pc-information-scope-user-items');
    if(!list)return;
    const users=filteredInformationScopeUsers();
    list.innerHTML=users.length
      ?groupedUsers(users).map(group=>`<section class="pc-area-group"><div class="pc-area-heading"><span>${esc(group.label)}</span><em>${group.users.length}</em></div><div class="pc-area-users">${group.users.map(informationScopeUserItem).join('')}</div></section>`).join('')
      :'<div class="pc-empty">Sin resultados.</div>';
    list.scrollTop=Number(state.informationScopeListScrollTop||0);
    list.addEventListener('scroll',()=>{state.informationScopeListScrollTop=Number(list.scrollTop||0);},{passive:true});
    list.querySelectorAll('[data-information-scope-user]').forEach(button=>button.addEventListener('click',async()=>{
      captureInformationScopeListScroll();
      if(state.savingInformationScope||state.savingInformationScopeBulk){toast('Espera a que termine el guardado actual.');return;}
      const id=Number(button.dataset.informationScopeUser);
      if(id===Number(state.informationScopeUserId))return;
      if(informationScopeDirty()&&!confirm('Hay cambios de alcance sin guardar. ¿Deseas descartarlos y seleccionar otro usuario?'))return;
      await selectInformationScopeUser(id);
    }));
    list.querySelectorAll('[data-information-scope-bulk-user]').forEach(button=>button.addEventListener('click',()=>{
      captureInformationScopeListScroll();
      const id=Number(button.dataset.informationScopeBulkUser);
      if(!Number.isInteger(id)||id<=0)return;
      state.informationScopeBulkSelected.has(id)
        ?state.informationScopeBulkSelected.delete(id)
        :state.informationScopeBulkSelected.add(id);
      renderInformationScope();
    }));
  }

  async function selectInformationScopeUser(id){
    captureInformationScopeListScroll();
    const userId=Number(id);
    if(!Number.isInteger(userId)||userId<=0)return;
    state.informationScopeUserId=userId;
    state.informationScopeAdditionalQuery='';
    state.informationScopeCandidateId=null;
    state.informationScopeBase=null;
    state.informationScopeDraft=null;
    await loadInformationScope(userId);
  }

  async function loadInformationScope(id){
    const userId=Number(id);
    if(!Number.isInteger(userId)||userId<=0)return;
    state.informationScopeLoading=true;
    state.informationScopeError='';
    state.informationScopeBackendPending=false;
    state.informationScopeCanManageAdditional=false;
    renderInformationScope();
    try{
      const response=await request(`${informationScopePath(userId)}?_=${Date.now()}`,{method:'GET',cache:'no-store'});
      if(Number(state.informationScopeUserId)!==userId)return;
      const data=response.data||{};
      state.informationScopeCanManageAdditional=Boolean(data.capacidades?.puede_gestionar_usuarios_adicionales);
      const normalized=normalizeInformationScopeData(data,userId);
      state.informationScopeBase=cloneInformationScopeDraft(normalized);
      state.informationScopeDraft=cloneInformationScopeDraft(normalized);
    }catch(error){
      if(Number(state.informationScopeUserId)!==userId)return;
      state.informationScopeError=error.message||'No se pudo consultar la backend de Alcance de Información.';
      state.informationScopeBackendPending=true;
      state.informationScopeCanManageAdditional=false;
      const blank=emptyInformationScopeDraft();
      state.informationScopeBase=cloneInformationScopeDraft(blank);
      state.informationScopeDraft=cloneInformationScopeDraft(blank);
    }finally{
      if(Number(state.informationScopeUserId)===userId){
        state.informationScopeLoading=false;
        renderInformationScope();
      }
    }
  }

  function informationScopeAdditionalUsers(){
    if(!state.informationScopeDraft)return [];
    return [...state.informationScopeDraft.usuarios_adicionales]
      .map(id=>state.users.find(user=>Number(user.id_SB)===Number(id)))
      .filter(Boolean)
      .sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es',{sensitivity:'base'}));
  }

  function informationScopeCandidates(){
    if(!state.informationScopeCanManageAdditional)return [];
    const selectedId=Number(state.informationScopeUserId);
    const draft=state.informationScopeDraft||emptyInformationScopeDraft();
    const query=normalizeText(state.informationScopeAdditionalQuery);
    if(!query)return [];
    return state.users
      .filter(user=>Number(user.estado)!==0&&Number(user.id_SB)!==selectedId&&!draft.usuarios_adicionales.has(Number(user.id_SB)))
      .filter(user=>normalizeText([user.nombre,user.iniciales,user.correo,user.puesto,user.area,user.empresa].join(' ')).includes(query))
      .sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es',{sensitivity:'base'}))
      .slice(0,8);
  }

  function informationScopeBulkEditorHtml(){
  const draft=state.informationScopeBulkDraft||emptyInformationScopeBulkDraft();
  const selected=[...state.informationScopeBulkSelected]
    .map(id=>state.users.find(user=>Number(user.id_SB)===Number(id)))
    .filter(Boolean)
    .sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es',{sensitivity:'base'}));

  return `<div class="pc-information-scope-form pc-information-scope-bulk-form">
    <div class="pc-admin-head pc-information-scope-head"><div><span class="pc-eyebrow">ASIGNACIÓN MASIVA · ALCANCE DE INFORMACIÓN</span><h2>Aplicar la misma selección a varios usuarios</h2><p>La selección masiva es una herramienta de captura. La backend procesa cada <b>id_usuario</b> por separado; no crea un alcance global ni una relación grupal.</p></div><span class="pc-status ok">${selected.length} seleccionado(s)</span></div>
    <div class="pc-scope-context-banner bulk"><span>👥</span><div><b>Cada usuario conserva su configuración individual.</b><small>Las opciones marcadas se activan individualmente para cada seleccionado. La operación actual es aditiva: conserva accesos que ya existan y nunca modifica Usuarios adicionales.</small></div></div>
    <section class="pc-admin-section pc-information-scope-section"><div class="pc-information-scope-section-title"><div><h3>1. Usuarios seleccionados</h3><p>Filtra por empresa o rol, marca personas específicas o usa «Seleccionar visibles» para aplicar el mismo alcance a un grupo operativo, por ejemplo todos los Supervisores.</p></div></div><div class="pc-information-scope-bulk-toolbar"><button type="button" class="pc-btn ghost" id="pc-information-scope-bulk-select-visible">Seleccionar visibles</button><button type="button" class="pc-btn ghost" id="pc-information-scope-bulk-clear">Limpiar selección</button><span>${selected.length} usuario(s)</span></div><div class="pc-information-scope-bulk-selected">${selected.length?selected.slice(0,24).map(user=>`<span><b>${esc(user.iniciales||initials(user))}</b>${esc(user.nombre)}</span>`).join(''):'<div class="pc-information-scope-no-users">Sin usuarios seleccionados.</div>'}${selected.length>24?`<em>+${selected.length-24} más</em>`:''}</div></section>
    <section class="pc-admin-section pc-information-scope-section"><div class="pc-information-scope-section-title"><div><h3>2. Llaves y puertas</h3><p>Selecciona la misma llave maestra o las mismas puertas para todos los usuarios marcados. Esto controla información, no permisos funcionales.</p></div></div>${informationScopeAccessGeneralHtml(draft,{bulk:true})}</section>
    <section class="pc-admin-section pc-information-scope-section"><div class="pc-information-scope-section-title"><div><h3>3. Alcance automático</h3><p>Las relaciones se activan individualmente para cada usuario; por eso dos Supervisores pueden tener la misma regla REPORTA_A y aun así ver personas distintas.</p></div></div><div class="pc-information-scope-options">
      <label class="pc-information-scope-option selected locked"><input type="checkbox" checked disabled><span><b>Su propia información</b><small>Siempre incluida para cada usuario.</small></span></label>
      <label class="pc-information-scope-option ${draft.ver_reporta_a?'selected':''}"><input type="checkbox" id="pc-information-scope-bulk-reports" ${draft.ver_reporta_a?'checked':''}><span><b>Personas que le reportan</b><small>Fuente individual: usuarios.reporta_a.</small></span></label>
      <label class="pc-information-scope-option ${draft.ver_rel_admin?'selected':''}"><input type="checkbox" id="pc-information-scope-bulk-rel-admin" ${draft.ver_rel_admin?'checked':''}><span><b>Relaciones administrativas</b><small>Fuente individual: usuarios_rel_admin.</small></span></label>
    </div></section>
    <div class="pc-scope-formula"><span>🔑 Llaves / puertas</span><b>+</b><span>👥 Alcance automático</span><b>→</b><span>💾 Registros individuales por usuario</span></div>
    <div class="pc-admin-actions pc-information-scope-actions"><span class="pc-information-scope-dirty ${informationScopeBulkHasActivation()?'on':''}">${informationScopeBulkHasActivation()?'Configuración lista para aplicar':'Selecciona al menos una llave, puerta o regla automática'}</span><button type="button" class="pc-btn primary" id="pc-information-scope-bulk-apply" ${state.savingInformationScopeBulk||!selected.length||!informationScopeBulkHasActivation()?'disabled':''}>${state.savingInformationScopeBulk?'Aplicando...':`Aplicar a ${selected.length||0} usuario(s)`}</button></div>
  </div>`;
}

  function informationScopeEditorHtml(user){
  if(!user){
    return `<div class="pc-admin-empty pc-information-scope-empty"><span class="pc-avatar big">A</span><h2>Selecciona un usuario</h2><p>La configuración de Alcance de Información es individual. Selecciona una persona para editar únicamente sus llaves, puertas, relaciones automáticas y excepciones.</p></div>`;
  }
  if(state.informationScopeLoading){
    return `<div class="pc-empty large"><span class="pc-spinner"></span>Cargando alcance de ${esc(user.nombre)}...</div>`;
  }
  const draft=state.informationScopeDraft||emptyInformationScopeDraft();
  const additional=informationScopeAdditionalUsers();
  const candidates=informationScopeCandidates();
  const selectedCandidate=state.users.find(item=>Number(item.id_SB)===Number(state.informationScopeCandidateId));
  const role=principalRole(user);
  const backendNote=state.informationScopeBackendPending
    ?`<div class="pc-information-scope-warning"><b>No se pudo consultar Alcance de Información.</b><span>No se permitirá guardar hasta recuperar una lectura válida para evitar sobrescribir configuración real.</span><button type="button" class="pc-btn ghost" id="pc-information-scope-retry">Reintentar conexión</button></div>`
    :'';
  const additionalList=additional.length
    ?additional.map(item=>`<span class="pc-information-scope-chip"><span class="pc-avatar">${esc(initials(item))}</span><span><b>${esc(item.iniciales||initials(item))}</b><small>${esc(item.nombre)}</small></span>${state.informationScopeCanManageAdditional?`<button type="button" data-information-scope-remove="${item.id_SB}" aria-label="Quitar ${esc(item.nombre)}">×</button>`:''}</span>`).join('')
    :'<div class="pc-information-scope-no-users">Sin usuarios adicionales.</div>';
  const additionalEditor=state.informationScopeCanManageAdditional
    ?`<div class="pc-information-scope-add"><div class="pc-information-scope-search"><input id="pc-information-scope-additional-search" autocomplete="off" value="${esc(state.informationScopeAdditionalQuery)}" placeholder="Buscar usuario por nombre, iniciales, correo, puesto o área...">${state.informationScopeAdditionalQuery?`<div class="pc-information-scope-results">${candidates.length?candidates.map(candidate=>`<button type="button" data-information-scope-candidate="${candidate.id_SB}" class="${Number(candidate.id_SB)===Number(state.informationScopeCandidateId)?'active':''}"><span class="pc-avatar">${esc(initials(candidate))}</span><span><b>${esc(candidate.nombre)}</b><small>${esc(candidate.area||candidate.puesto||'Sin área')}</small></span></button>`).join(''):'<div class="pc-empty">Sin coincidencias disponibles.</div>'}</div>`:''}</div><button type="button" class="pc-btn primary" id="pc-information-scope-add" ${selectedCandidate?'':'disabled'}>Agregar</button></div>`
    :`<div class="pc-information-scope-warning"><b>Solo Programador puede editar Usuarios adicionales.</b><span>Esta sección es una excepción individual. Puedes consultar los usuarios ya asignados, pero no modificarlos.</span></div>`;

  return `<div class="pc-information-scope-form">
    <div class="pc-admin-head pc-information-scope-head"><div class="pc-user-head"><span class="pc-avatar big">${esc(initials(user))}</span><div><span class="pc-eyebrow">ALCANCE DE INFORMACIÓN · CONFIGURACIÓN INDIVIDUAL</span><h2>${esc(user.nombre)}</h2><p>${esc(role?.rol||user.puesto||'Sin rol principal')} · ${esc(user.empresa||'Sin empresa')} · ${esc(user.area||'Sin área')} · ID ${esc(user.id_SB)}</p></div></div><span class="pc-status ${Number(user.estado)===1?'ok':''}">${Number(user.estado)===1?'Activo':'Inactivo'}</span></div>
    ${backendNote}
    <div class="pc-scope-context-banner"><span>👤</span><div><b>Este editor modifica únicamente a ${esc(user.nombre)}.</b><small>Los permisos funcionales se administran por rol/usuario en las pestañas de Permisos. Aquí solo definimos qué información puede alcanzar este usuario.</small></div></div>
    <section class="pc-admin-section pc-information-scope-section"><div class="pc-information-scope-section-title"><div><h3>1. Llaves y puertas — Acceso General</h3><p>La llave maestra abre toda la información del dominio. Sin llave maestra, puedes abrir puertas específicas. Ninguna de las dos opciones habilita módulos ni acciones por sí sola.</p></div></div>${informationScopeAccessGeneralHtml(draft)}</section>
    <section class="pc-admin-section pc-information-scope-section"><div class="pc-information-scope-section-title"><div><h3>2. Alcance automático — Personas</h3><p>Una vez abierta una puerta, estas relaciones determinan qué personas/registros entran al filtro normal de este usuario.</p></div></div><div class="pc-information-scope-options">
      <label class="pc-information-scope-option selected locked"><input type="checkbox" checked disabled><span><b>Su propia información</b><small>Siempre incluida.</small></span></label>
      <label class="pc-information-scope-option ${draft.ver_reporta_a?'selected':''}"><input type="checkbox" id="pc-information-scope-reports" ${draft.ver_reporta_a?'checked':''}><span><b>Personas que le reportan</b><small>Fuente: usuarios.reporta_a.</small></span></label>
      <label class="pc-information-scope-option ${draft.ver_rel_admin?'selected':''}"><input type="checkbox" id="pc-information-scope-rel-admin" ${draft.ver_rel_admin?'checked':''}><span><b>Relaciones administrativas</b><small>Fuente: usuarios_rel_admin.</small></span></label>
    </div></section>
    <section class="pc-admin-section pc-information-scope-section"><div class="pc-information-scope-section-title"><div><h3>3. Usuarios adicionales — Excepción individual</h3><p>Amplían las personas visibles de este usuario únicamente dentro de las puertas que ya tenga abiertas. No entregan llaves, puertas, módulos ni acciones.</p></div></div>${additionalEditor}<div class="pc-information-scope-chips">${additionalList}</div></section>
    <div class="pc-scope-formula"><span>🔑 Llave / puerta</span><b>+</b><span>👥 Personas</span><b>+</b><span>⚙ Permiso funcional</span><b>=</b><span>🛡 Información accesible</span></div>
    <div class="pc-admin-actions pc-information-scope-actions"><span class="pc-information-scope-dirty ${informationScopeDirty()?'on':''}">${informationScopeDirty()?'Cambios pendientes para este usuario':'Sin cambios pendientes'}</span><button type="button" class="pc-btn primary" id="pc-information-scope-save" ${state.savingInformationScope||state.informationScopeBackendPending||!informationScopeDirty()?'disabled':''}>${state.savingInformationScope?'Guardando...':'Guardar este usuario'}</button></div>
  </div>`;
}

  function renderInformationScope(){
  const box=document.getElementById('pc-content');
  if(!box||state.tab!=='information-scope')return;
  captureInformationScopeListScroll();
  const selected=state.users.find(user=>Number(user.id_SB)===Number(state.informationScopeUserId))||null;
  const companies=distinctUserValues('empresa');
  const roleOptions=state.roles.filter(role=>Number(role.estado)!==0).sort((a,b)=>String(a.rol||'').localeCompare(String(b.rol||''),'es',{sensitivity:'base'}));
  const editor=state.informationScopeBulkOpen?informationScopeBulkEditorHtml():informationScopeEditorHtml(selected);
  box.innerHTML=`<div class="pc-admin-layout pc-information-scope-layout"><aside class="pc-admin-list pc-admin-user-selector"><div class="pc-selector-head pc-information-scope-selector-head"><div><h2>${state.informationScopeBulkOpen?'Seleccionar usuarios':'Usuarios'}</h2><p>${state.informationScopeBulkOpen?'La selección solo facilita la captura; cada usuario se registra individualmente.':'Selecciona una persona para editar únicamente su alcance.'}</p></div><button type="button" class="pc-btn ${state.informationScopeBulkOpen?'ghost':'primary'} pc-information-scope-bulk-toggle" id="pc-information-scope-bulk-toggle">${state.informationScopeBulkOpen?'Volver a individual':'Asignación masiva'}</button></div><div class="pc-filters pc-information-scope-filters"><input id="pc-information-scope-user-search" value="${esc(state.informationScopeQuery)}" placeholder="Buscar usuario..."><select id="pc-information-scope-company"><option value="">Todas las empresas</option>${companies.map(company=>`<option value="${esc(company)}" ${normalizeText(company)===normalizeText(state.informationScopeCompany)?'selected':''}>${esc(company)}</option>`).join('')}</select><select id="pc-information-scope-role"><option value="">Todos los roles</option>${roleOptions.map(role=>`<option value="${role.id_rol}" ${Number(role.id_rol)===Number(state.informationScopeRole)?'selected':''}>${esc(role.rol)}</option>`).join('')}</select></div><div class="pc-list" id="pc-information-scope-user-items"></div></aside><section class="pc-admin-editor pc-information-scope-editor">${editor}</section></div>`;
  renderInformationScopeUserList();
  bindInformationScopeEvents();
  updateSaveButton();
  requestAnimationFrame(()=>{
    const list=document.getElementById('pc-information-scope-user-items');
    if(list)list.scrollTop=Number(state.informationScopeListScrollTop||0);
  });
}

  function mutateInformationScope(mutator){
    if(!state.informationScopeDraft)return;
    mutator(state.informationScopeDraft);
    renderInformationScope();
  }

  function bindInformationScopeEvents(){
  document.getElementById('pc-information-scope-bulk-toggle')?.addEventListener('click',()=>{
    if(state.savingInformationScope||state.savingInformationScopeBulk)return;
    if(!state.informationScopeBulkOpen&&informationScopeDirty()&&!confirm('Hay cambios individuales sin guardar. ¿Deseas descartarlos y entrar a Asignación masiva?'))return;
    if(!state.informationScopeBulkOpen&&state.informationScopeBase){
      state.informationScopeDraft=cloneInformationScopeDraft(state.informationScopeBase);
    }
    state.informationScopeBulkOpen=!state.informationScopeBulkOpen;
    if(!state.informationScopeBulkOpen){
      state.informationScopeBulkSelected.clear();
      state.informationScopeBulkDraft=emptyInformationScopeBulkDraft();
    }
    renderInformationScope();
  });
  document.getElementById('pc-information-scope-bulk-select-visible')?.addEventListener('click',()=>{
    filteredInformationScopeUsers().forEach(user=>state.informationScopeBulkSelected.add(Number(user.id_SB)));
    renderInformationScope();
  });
  document.getElementById('pc-information-scope-bulk-clear')?.addEventListener('click',()=>{
    state.informationScopeBulkSelected.clear();
    renderInformationScope();
  });
  document.querySelectorAll('[data-information-scope-bulk-domain]').forEach(input=>input.addEventListener('change',()=>{
    const domain=String(input.dataset.informationScopeBulkDomain||'').toUpperCase();
    if(input.checked){
      state.informationScopeBulkDraft.dominios_completos.add(domain);
      const groupIds=informationScopeGroupIdsForDomain(domain);
      groupIds.forEach(id=>state.informationScopeBulkDraft.agrupaciones.delete(id));
    }else{
      state.informationScopeBulkDraft.dominios_completos.delete(domain);
    }
    renderInformationScope();
  }));
  document.querySelectorAll('[data-information-scope-bulk-group]').forEach(input=>input.addEventListener('change',()=>{
    const id=Number(input.dataset.informationScopeBulkGroup);
    if(!Number.isInteger(id)||id<=0)return;
    input.checked?state.informationScopeBulkDraft.agrupaciones.add(id):state.informationScopeBulkDraft.agrupaciones.delete(id);
    renderInformationScope();
  }));
  document.getElementById('pc-information-scope-bulk-reports')?.addEventListener('change',event=>{state.informationScopeBulkDraft.ver_reporta_a=Boolean(event.target.checked);renderInformationScope();});
  document.getElementById('pc-information-scope-bulk-rel-admin')?.addEventListener('change',event=>{state.informationScopeBulkDraft.ver_rel_admin=Boolean(event.target.checked);renderInformationScope();});
  document.getElementById('pc-information-scope-bulk-apply')?.addEventListener('click',saveInformationScopeBulk);
  document.getElementById('pc-information-scope-user-search')?.addEventListener('input',event=>{state.informationScopeQuery=event.target.value;renderInformationScopeUserList();});
  document.getElementById('pc-information-scope-company')?.addEventListener('change',event=>{state.informationScopeCompany=event.target.value;renderInformationScopeUserList();});
  document.getElementById('pc-information-scope-role')?.addEventListener('change',event=>{state.informationScopeRole=event.target.value;renderInformationScopeUserList();});
  document.querySelectorAll('[data-information-scope-domain]').forEach(input=>input.addEventListener('change',()=>mutateInformationScope(draft=>{
    const domain=String(input.dataset.informationScopeDomain||'').toUpperCase();
    if(input.checked){
      draft.dominios_completos.add(domain);
      const groupIds=informationScopeGroupIdsForDomain(domain);
      groupIds.forEach(id=>draft.agrupaciones.delete(id));
    }else{
      draft.dominios_completos.delete(domain);
    }
  })));
  document.querySelectorAll('[data-information-scope-group]').forEach(input=>input.addEventListener('change',()=>mutateInformationScope(draft=>{
    const id=Number(input.dataset.informationScopeGroup);
    if(!Number.isInteger(id)||id<=0)return;
    input.checked?draft.agrupaciones.add(id):draft.agrupaciones.delete(id);
  })));
  document.getElementById('pc-information-scope-reports')?.addEventListener('change',event=>mutateInformationScope(draft=>{draft.ver_reporta_a=Boolean(event.target.checked);}));
  document.getElementById('pc-information-scope-rel-admin')?.addEventListener('change',event=>mutateInformationScope(draft=>{draft.ver_rel_admin=Boolean(event.target.checked);}));
  document.getElementById('pc-information-scope-additional-search')?.addEventListener('input',event=>{
    if(!state.informationScopeCanManageAdditional)return;
    state.informationScopeAdditionalQuery=event.target.value;
    state.informationScopeCandidateId=null;
    renderInformationScope();
    const input=document.getElementById('pc-information-scope-additional-search');
    input?.focus({preventScroll:true});
    if(input&&typeof input.setSelectionRange==='function')input.setSelectionRange(input.value.length,input.value.length);
  });
  document.querySelectorAll('[data-information-scope-candidate]').forEach(button=>button.addEventListener('click',()=>{
    if(!state.informationScopeCanManageAdditional)return;
    state.informationScopeCandidateId=Number(button.dataset.informationScopeCandidate);
    const candidate=state.users.find(user=>Number(user.id_SB)===Number(state.informationScopeCandidateId));
    state.informationScopeAdditionalQuery=candidate?.nombre||state.informationScopeAdditionalQuery;
    renderInformationScope();
  }));
  document.getElementById('pc-information-scope-add')?.addEventListener('click',()=>{
    if(!state.informationScopeCanManageAdditional)return;
    const id=Number(state.informationScopeCandidateId);
    if(!Number.isInteger(id)||id<=0||!state.informationScopeDraft)return;
    state.informationScopeDraft.usuarios_adicionales.add(id);
    state.informationScopeAdditionalQuery='';
    state.informationScopeCandidateId=null;
    renderInformationScope();
  });
  document.querySelectorAll('[data-information-scope-remove]').forEach(button=>button.addEventListener('click',()=>{
    if(!state.informationScopeCanManageAdditional)return;
    const id=Number(button.dataset.informationScopeRemove);
    if(!state.informationScopeDraft)return;
    state.informationScopeDraft.usuarios_adicionales.delete(id);
    renderInformationScope();
  }));
  document.getElementById('pc-information-scope-retry')?.addEventListener('click',()=>loadInformationScope(state.informationScopeUserId));
  document.getElementById('pc-information-scope-save')?.addEventListener('click',saveInformationScope);
}

  async function saveInformationScopeBulk(){
  const ids=[...state.informationScopeBulkSelected].map(Number).filter(id=>Number.isInteger(id)&&id>0);
  if(!ids.length||!informationScopeBulkHasActivation()||state.savingInformationScopeBulk)return;
  const draft=state.informationScopeBulkDraft||emptyInformationScopeBulkDraft();
  const payload={
    usuario_ids:ids,
    activar:{
      dominios_completos:[...draft.dominios_completos].sort(),
      agrupaciones:[...draft.agrupaciones].map(Number).filter(id=>Number.isInteger(id)&&id>0).sort((a,b)=>a-b),
      ver_reporta_a:Boolean(draft.ver_reporta_a),
      ver_rel_admin:Boolean(draft.ver_rel_admin)
    }
  };
  if(!confirm(`¿Aplicar esta selección a ${ids.length} usuario(s)? La backend registrará cada usuario individualmente. La operación es aditiva: no desactiva accesos existentes ni modifica Usuarios adicionales.`))return;
  state.savingInformationScopeBulk=true;
  renderInformationScope();
  try{
    const response=await request(informationScopeBulkPath,{method:'PUT',body:JSON.stringify(payload)});
    const updated=Number(response.data?.usuarios_actualizados||0);
    if(updated!==ids.length)throw new Error(`La backend confirmó ${updated} de ${ids.length} usuarios.`);
    toast(`Alcance aplicado individualmente a ${updated} usuario(s).`);
    const currentId=Number(state.informationScopeUserId);
    const reloadCurrent=ids.includes(currentId);
    state.informationScopeBulkSelected.clear();
    state.informationScopeBulkDraft=emptyInformationScopeBulkDraft();
    state.informationScopeBulkOpen=false;
    if(reloadCurrent&&currentId){
      await loadInformationScope(currentId);
    }else{
      renderInformationScope();
    }
  }catch(error){
    toast(error.message||'No se pudo aplicar la asignación masiva.');
  }finally{
    state.savingInformationScopeBulk=false;
    renderInformationScope();
  }
}

  function informationScopeReadbackMatches(expected,readback,userId){
    const normalized=normalizeInformationScopeData(readback?.data||{},userId);
    return JSON.stringify(informationScopePayload(expected))===JSON.stringify(informationScopePayload(normalized));
  }

  async function saveInformationScope(){
    const userId=Number(state.informationScopeUserId);
    const selected=state.users.find(user=>Number(user.id_SB)===userId);
    if(!Number.isInteger(userId)||userId<=0||!state.informationScopeDraft||!informationScopeDirty())return;
    if(state.informationScopeBackendPending){toast('No hay una lectura válida de Alcance de Información. Reintenta antes de guardar.');return;}
    const payload=informationScopePayload(state.informationScopeDraft);
    if(!confirm(`¿Guardar el alcance de información de ${selected?.nombre||'este usuario'}?`))return;
    state.savingInformationScope=true;
    renderInformationScope();
    try{
      await request(informationScopePath(userId),{method:'PUT',body:JSON.stringify(payload)});
      const readback=await request(`${informationScopePath(userId)}?_=${Date.now()}`,{method:'GET',cache:'no-store'});
      if(!informationScopeReadbackMatches(state.informationScopeDraft,readback,userId)){
        throw new Error('La backend respondió, pero la lectura posterior no coincide con el alcance solicitado.');
      }
      const data=readback.data||{};
      state.informationScopeCanManageAdditional=Boolean(data.capacidades?.puede_gestionar_usuarios_adicionales);
      const normalized=normalizeInformationScopeData(data,userId);
      state.informationScopeBase=cloneInformationScopeDraft(normalized);
      state.informationScopeDraft=cloneInformationScopeDraft(normalized);
      state.informationScopeError='';
      state.informationScopeBackendPending=false;
      toast('Alcance de información guardado y verificado correctamente.');
    }catch(error){
      state.informationScopeError=error.message||'No se pudo guardar el alcance de información.';
      toast(state.informationScopeError);
    }finally{
      state.savingInformationScope=false;
      renderInformationScope();
    }
  }

  async function loadAdminCatalogs(){
    if(state.zones.length&&state.securityQuestions.length)return;
    try{
      const [z,p]=await Promise.all([request('/api/catalogos/zonas'),request('/api/catalogos/preguntas-seguridad')]);
      state.zones=z.data||[]; state.securityQuestions=p.data||[];
    }catch(e){toast(e.message||'No se pudieron cargar los catálogos.');}
  }

  function distinctUserValues(field){
    const values=new Map();
    state.users.forEach(user=>{
      const raw=String(user?.[field]||'').trim();
      if(!raw)return;
      const key=normalizeText(raw);
      if(!values.has(key))values.set(key,raw);
    });
    return [...values.values()].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
  }

  function selectOptions(values,current,placeholder){
    const currentValue=String(current||'').trim();
    const merged=[...values];
    if(currentValue&&!merged.some(value=>normalizeText(value)===normalizeText(currentValue)))merged.push(currentValue);
    return `<option value="">${esc(placeholder)}</option>${merged.map(value=>`<option value="${esc(value)}" ${normalizeText(value)===normalizeText(currentValue)?'selected':''}>${esc(value)}</option>`).join('')}`;
  }

  function adminUserForm(user){
    if(!user&&state.adminUserDetail===null){
      return `<div class="pc-admin-empty"><span class="pc-avatar big">U</span><h2>Selecciona un usuario</h2><p>Elige un usuario de la lista para consultar o editar su información.</p><button type="button" class="pc-btn primary" id="pc-new-user">+ Nuevo usuario</button></div>`;
    }
    const d=state.adminUserDetail||user||{};
    const selectedRoles=new Set((d.roles_detalle||d.roles||[]).map(r=>Number(r.id_rol)));
    const principal=Number(d.rol_id||0);
    const selectedZones=new Set((d.zonas_detalle||[]).map(z=>Number(z.id_zona)));
    const roleOptions=state.roles.filter(r=>Number(r.estado)!==0).map(r=>`<label class="pc-admin-check"><input type="checkbox" name="roles" value="${r.id_rol}" ${selectedRoles.has(Number(r.id_rol))?'checked':''}><span>${esc(r.rol)}</span></label>`).join('');
    const principalOptions=state.roles.filter(r=>selectedRoles.has(Number(r.id_rol))||Number(r.id_rol)===principal).map(r=>`<option value="${r.id_rol}" ${Number(r.id_rol)===principal?'selected':''}>${esc(r.rol)}</option>`).join('');
    const superiorOptions=state.users.filter(u=>Number(u.id_SB)!==Number(d.id_SB)&&Number(u.estado)!==0).map(u=>`<option value="${u.id_SB}" ${Number(u.id_SB)===Number(d.reporta_a)?'selected':''}>${esc(u.nombre)}</option>`).join('');
    const zoneOptions=state.zones.map(z=>`<label class="pc-admin-check"><input type="checkbox" name="zones" value="${z.id_zona}" ${selectedZones.has(Number(z.id_zona))?'checked':''}><span>${esc(z.zona)} · ${esc(z.nombre||'')}</span></label>`).join('');
    const areaOptions=selectOptions(distinctUserValues('area'),d.area,'Selecciona un área');
    const companyOptions=selectOptions(distinctUserValues('empresa'),d.empresa,'Selecciona una empresa');
    const pendingReset=d.id_SB&&Number(d.must_change_password)===1?readPendingResetCredential(d.id_SB):null;
    const pendingResetMarkup=pendingReset?`<div class="pc-reset-password-box" role="status" style="margin-top:12px;padding:12px 14px;border:1px solid #f0b8b8;border-radius:12px;background:#fff8f8;display:grid;gap:7px;max-width:620px"><label for="pc-reset-password-value" style="font-size:12px;font-weight:700">Contraseña temporal activa</label><small>Usuario: ${esc(pendingReset.email||d.correo||'')}</small><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><input id="pc-reset-password-value" type="text" readonly value="${esc(pendingReset.password)}" aria-label="Contraseña temporal activa" style="min-width:260px;max-width:420px;flex:1 1 260px;padding:9px 10px;border:1px solid #d8dee8;border-radius:8px;background:#fff;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;letter-spacing:.3px"><button type="button" class="pc-btn ghost" id="pc-copy-reset-password">Copiar</button></div><small>Este reseteo es independiente de «Guardar usuario». La contraseña permanecerá visible en esta sesión hasta que el usuario complete correctamente su primer acceso.</small></div>`:'';
    return `<form id="pc-admin-user-form" class="pc-admin-form">
      <div class="pc-admin-head"><div><span class="pc-eyebrow">ADMINISTRACIÓN</span><h2>${d.id_SB?'Editar usuario':'Crear usuario'}</h2><p>Las operaciones conservan todos los datos históricos y relaciones operativas.</p></div><button type="button" class="pc-btn primary" id="pc-new-user">+ Nuevo usuario</button></div>
      <div class="pc-admin-grid">
        <label>Nombre<input name="nombre" required value="${esc(d.nombre||'')}"></label>
        <label>Iniciales<input name="iniciales" required maxlength="10" value="${esc(d.iniciales||'')}"></label>
        <label>Correo<input name="correo" type="email" required value="${esc(d.correo||'')}"></label>
        <label>Puesto<input name="puesto" required value="${esc(d.puesto||'')}"></label>
        <label>Área<select name="area" required>${areaOptions}</select></label>
        <label>Empresa<select name="empresa" required>${companyOptions}</select></label>
        <label>Reporta a<select name="reporta_a"><option value="">Sin superior</option>${superiorOptions}</select></label>
        <label>Estado<select name="estado"><option value="1" ${Number(d.estado)!==0?'selected':''}>Activo</option><option value="0" ${Number(d.estado)===0?'selected':''}>Inactivo</option></select></label>
      </div>
      <section class="pc-admin-section"><h3>Roles asociados</h3><div class="pc-admin-check-grid" id="pc-admin-roles">${roleOptions}</div><label class="pc-admin-principal">Rol principal<select name="rol_id" required><option value="">Selecciona</option>${principalOptions}</select></label></section>
      <section class="pc-admin-section"><h3>Zonas operativas</h3><div class="pc-admin-check-grid">${zoneOptions||'<span class="pc-empty">Sin zonas disponibles.</span>'}</div></section>
      ${d.id_SB?`<section class="pc-admin-section security"><h3>Seguridad de acceso</h3><div class="pc-security-status"><span>Último acceso: <b>${esc(d.ultimo_acceso||'Sin registro')}</b></span><span>Intentos fallidos: <b>${esc(d.failed_login_attempts||0)}</b></span><span>Bloqueo: <b>${d.locked_until?esc(d.locked_until):'No'}</b></span></div><button type="button" class="pc-btn danger" id="pc-reset-credentials">Resetear credenciales</button>${pendingResetMarkup}</section>`:''}
      <div class="pc-admin-actions"><button type="button" class="pc-btn ghost" id="pc-cancel-user">Cancelar</button><button class="pc-btn primary" ${state.adminLoading?'disabled':''}>${state.adminLoading?'Guardando...':'Guardar usuario'}</button></div>
    </form>`;
  }

  function filteredAdminUsers(){
    const q=state.adminUserQuery.trim().toLowerCase();
    return state.users.filter(user=>{
      const text=[user.nombre,user.correo,user.puesto,user.area,user.empresa,...(user.roles||[]).map(role=>role.rol)].join(' ').toLowerCase();
      const company=String(user.empresa||'').trim();
      return (!q||text.includes(q))&&(!state.adminUserCompany||normalizeText(company)===normalizeText(state.adminUserCompany));
    });
  }

  function adminUserItem(user){
    const active=Number(user.id_SB)===Number(state.adminUserId);
    const role=principalRole(user);
    return `<button type="button" class="pc-list-item ${active?'active':''}" data-admin-user="${user.id_SB}"><span class="pc-avatar">${esc(initials(user))}</span><span><b>${esc(user.nombre)}</b><small>${esc(role?.rol||user.puesto||'Sin rol principal')}</small></span><em>${esc(userHierarchyLevel(user))}</em></button>`;
  }

  function renderAdminUserList(){
    const list=document.getElementById('pc-admin-user-items');
    if(!list)return;
    const scrollTop=list.scrollTop;
    const users=filteredAdminUsers();
    list.innerHTML=users.length?groupedUsers(users).map(group=>`<section class="pc-area-group"><div class="pc-area-heading"><span>${esc(group.label)}</span><em>${group.users.length}</em></div><div class="pc-area-users">${group.users.map(adminUserItem).join('')}</div></section>`).join(''):'<div class="pc-empty">Sin resultados.</div>';
    list.querySelectorAll('[data-admin-user]').forEach(button=>button.onclick=()=>selectAdminUser(button.dataset.adminUser));
    list.scrollTop=scrollTop;
  }

  function renderAdminUsers(){
    const box=document.getElementById('pc-content'); if(!box)return;
    const selected=state.adminUserId?state.users.find(u=>Number(u.id_SB)===Number(state.adminUserId)):(state.adminUserDetail!==null?{}:null);
    const companies=distinctUserValues('empresa');
    box.innerHTML=`<div class="pc-admin-layout"><aside class="pc-admin-list pc-admin-user-selector"><div class="pc-selector-head"><h2>Usuarios</h2><p>Agrupados por área y ordenados por nivel jerárquico.</p></div><div class="pc-filters"><input id="pc-admin-user-search" value="${esc(state.adminUserQuery)}" placeholder="Buscar..."><select id="pc-admin-user-company"><option value="">Todas las empresas</option>${companies.map(company=>`<option value="${esc(company)}" ${normalizeText(company)===normalizeText(state.adminUserCompany)?'selected':''}>${esc(company)}</option>`).join('')}</select></div><div class="pc-list" id="pc-admin-user-items"></div></aside><section class="pc-admin-editor">${adminUserForm(selected)}</section></div>`;
    renderAdminUserList();
    bindAdminUserEvents();
  }

  async function selectAdminUser(id){
    stopResetCredentialStatusPolling();
    state.adminUserId=Number(id); state.adminLoading=true; renderAdminUsers();
    try{
      const r=await request(`/api/usuarios/${id}/detalle`);
      state.adminUserDetail=r.data||null;
      if(state.adminUserDetail&&Number(state.adminUserDetail.must_change_password)!==1){
        clearPendingResetCredential(id);
      }
    }
    catch(e){toast(e.message||'No se pudo cargar el usuario.');}
    finally{
      state.adminLoading=false;
      renderAdminUsers();
      if(state.adminUserDetail&&Number(state.adminUserDetail.must_change_password)===1&&readPendingResetCredential(id)){
        startResetCredentialStatusPolling(id);
      }
    }
  }

  function bindAdminUserEvents(){
    document.getElementById('pc-admin-user-search')?.addEventListener('input',event=>{state.adminUserQuery=event.target.value;renderAdminUserList();});
    document.getElementById('pc-admin-user-company')?.addEventListener('change',event=>{state.adminUserCompany=event.target.value;renderAdminUserList();});
    document.getElementById('pc-new-user')?.addEventListener('click',()=>{stopResetCredentialStatusPolling();state.adminUserId=null;state.adminUserDetail={};renderAdminUsers();});
    document.getElementById('pc-cancel-user')?.addEventListener('click',()=>{stopResetCredentialStatusPolling();state.adminUserDetail=null;state.adminUserId=null;renderAdminUsers();});
    const rolesBox=document.getElementById('pc-admin-roles');
    rolesBox?.addEventListener('change',()=>{
      const sel=document.querySelector('#pc-admin-user-form select[name="rol_id"]'); const current=sel.value;
      const checked=[...rolesBox.querySelectorAll('input:checked')].map(i=>Number(i.value));
      sel.innerHTML='<option value="">Selecciona</option>'+state.roles.filter(r=>checked.includes(Number(r.id_rol))).map(r=>`<option value="${r.id_rol}" ${String(r.id_rol)===current?'selected':''}>${esc(r.rol)}</option>`).join('');
    });
    document.getElementById('pc-admin-user-form')?.addEventListener('submit',saveAdminUser);
    document.getElementById('pc-reset-credentials')?.addEventListener('click',resetCredentials);
    document.getElementById('pc-copy-reset-password')?.addEventListener('click',async()=>{
      const pending=readPendingResetCredential(state.adminUserId);
      if(!pending?.password)return;
      try{
        await navigator.clipboard.writeText(String(pending.password));
        toast('Contraseña temporal copiada.');
      }catch(_error){
        const value=document.getElementById('pc-reset-password-value');
        if(value&&typeof value.select==='function'){
          value.focus({preventScroll:true});
          value.select();
          value.setSelectionRange?.(0,String(value.value||'').length);
        }
        toast('No fue posible copiar automáticamente. La contraseña quedó seleccionada.');
      }
    });
  }

  async function saveAdminUser(ev){
    ev.preventDefault(); const form=ev.currentTarget; const fd=new FormData(form);
    const roles=[...form.querySelectorAll('input[name="roles"]:checked')].map(i=>Number(i.value));
    const zones=[...form.querySelectorAll('input[name="zones"]:checked')].map(i=>Number(i.value));
    const rolId=Number(fd.get('rol_id')); if(!roles.includes(rolId))roles.unshift(rolId);
    const payload={nombre:fd.get('nombre'),iniciales:fd.get('iniciales'),correo:fd.get('correo'),puesto:fd.get('puesto'),area:fd.get('area'),empresa:fd.get('empresa'),reporta_a:fd.get('reporta_a')||null,estado:Number(fd.get('estado')),rol_id:rolId,roles_asociados:roles,zonas:zones};
    state.adminLoading=true;renderAdminUsers();
    try{const path=state.adminUserId?`/api/usuarios/${state.adminUserId}`:'/api/usuarios';const method=state.adminUserId?'PUT':'POST';const r=await request(path,{method,body:JSON.stringify(payload)});toast(r.message||'Usuario guardado correctamente.');state.adminUserId=Number(r.data?.id_SB||state.adminUserId);state.adminUserDetail=null;await loadBootstrap();state.tab='admin-users';await selectAdminUser(state.adminUserId);}
    catch(e){toast(e.message||'No se pudo guardar el usuario.');state.adminLoading=false;renderAdminUsers();}
  }

  async function resetCredentials(){
    const user=state.adminUserDetail;
    if(!user||!confirm(`¿Resetear únicamente las credenciales de ${user.nombre}?`))return;
    const button=document.getElementById('pc-reset-credentials');
    if(button){button.disabled=true;button.textContent='Reseteando...';}
    try{
      const r=await request(`/api/usuarios/${user.id_SB}/reset-credentials`,{method:'POST',body:'{}'});
      const temporaryPassword=String(r.data?.temporary_password||'').trim();
      const responseUserId=Number(r.data?.user_id);
      if(responseUserId!==Number(user.id_SB))throw new Error('El backend devolvió credenciales para un usuario distinto al seleccionado.');
      if(r.data?.credential_verified!==true)throw new Error('El backend no confirmó que la contraseña temporal coincida con el hash guardado.');
      if(!temporaryPassword)throw new Error('El backend no devolvió la contraseña temporal generada.');
      storePendingResetCredential(user.id_SB,temporaryPassword,r.data?.user_email||user.correo);
      toast(r.message||'Credenciales reseteadas y verificadas correctamente.');
      await selectAdminUser(user.id_SB);
    }
    catch(e){
      if(button){button.disabled=false;button.textContent='Resetear credenciales';}
      toast(e.message||'No se pudieron resetear las credenciales.');
    }
  }

  function roleCompanyLabel(value){
    const raw=String(value||'').trim();
    return raw||'General';
  }

  function groupedRoles(roles){
    const groups=new Map();
    roles.forEach(role=>{
      const label=roleCompanyLabel(role.empresa);
      const key=normalizeText(label)||'GENERAL';
      if(!groups.has(key)) groups.set(key,{key,label,roles:[]});
      groups.get(key).roles.push(role);
    });
    return [...groups.values()]
      .map(group=>({...group,roles:group.roles.sort((a,b)=>Number(b.nivel||0)-Number(a.nivel||0)||String(a.rol||'').localeCompare(String(b.rol||''),'es',{sensitivity:'base'}))}))
      .sort((a,b)=>a.label.localeCompare(b.label,'es',{sensitivity:'base'}));
  }

  function filteredAdminRoles(){
    const query=state.adminRoleQuery.trim().toLowerCase();
    return state.roles.filter(role=>{
      const text=[role.rol,role.codigo,role.descripcion,role.empresa,role.nivel].join(' ').toLowerCase();
      const sameCompany=!state.adminRoleCompany||normalizeText(roleCompanyLabel(role.empresa))===normalizeText(state.adminRoleCompany);
      const active=Number(role.estado)!==0;
      const sameStatus=!state.adminRoleStatus||(state.adminRoleStatus==='active'?active:!active);
      return (!query||text.includes(query))&&sameCompany&&sameStatus;
    });
  }

  function adminRoleItem(role){
    const active=Number(role.id_rol)===Number(state.adminRoleId);
    const enabled=Number(role.estado)!==0;
    return `<button type="button" class="pc-list-item pc-admin-role-item ${active?'active':''}" data-admin-role="${role.id_rol}"><span class="pc-avatar">R</span><span><b>${esc(role.rol)}</b><small>${esc(role.codigo||'Sin código')} · ${enabled?'Activo':'Inactivo'}</small></span><em>${esc(role.nivel||0)}</em></button>`;
  }

  function renderAdminRoleList(){
    const list=document.getElementById('pc-admin-role-items');
    if(!list)return;
    const scrollTop=list.scrollTop;
    const roles=filteredAdminRoles();
    list.innerHTML=roles.length?groupedRoles(roles).map(group=>`<section class="pc-area-group pc-role-company-group"><div class="pc-area-heading"><span>${esc(group.label)}</span><em>${group.roles.length}</em></div><div class="pc-area-users">${group.roles.map(adminRoleItem).join('')}</div></section>`).join(''):'<div class="pc-empty">Sin resultados.</div>';
    list.querySelectorAll('[data-admin-role]').forEach(button=>button.onclick=()=>selectAdminRole(button.dataset.adminRole));
    list.scrollTop=scrollTop;
  }

  function roleForm(role){
    if(!role&&state.adminRoleDetail===null){
      return `<div class="pc-admin-empty"><span class="pc-admin-empty-icon">◆</span><h2>Selecciona un rol</h2><p>Consulta o modifica un rol existente, o crea uno nuevo.</p><button type="button" class="pc-btn primary" id="pc-new-role">+ Nuevo rol</button></div>`;
    }
    const d=state.adminRoleDetail||role||{};
    const companies=[...new Set(state.roles.map(item=>String(item.empresa||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
    const companyOptions=companies.map(company=>`<option value="${esc(company)}" ${normalizeText(company)===normalizeText(d.empresa)?'selected':''}>${esc(company)}</option>`).join('');
    return `<form id="pc-admin-role-form" class="pc-admin-form"><div class="pc-admin-head"><div><span class="pc-eyebrow">CATÁLOGO</span><h2>${d.id_rol?'Editar rol':'Crear rol'}</h2><p>Los roles no se eliminan físicamente; pueden desactivarse.</p></div><button type="button" class="pc-btn primary" id="pc-new-role">+ Nuevo rol</button></div><div class="pc-admin-grid"><label>Nombre<input name="rol" required value="${esc(d.rol||'')}"></label><label>Código<input name="codigo" value="${esc(d.codigo||'')}"></label><label>Empresa<select name="empresa" required><option value="">Selecciona...</option>${companyOptions}</select></label><label>Nivel<input name="nivel" type="number" min="0" value="${d.nivel!==undefined&&d.nivel!==null?esc(d.nivel):''}" placeholder="Nivel jerárquico"></label><label class="wide">Descripción<textarea name="descripcion" rows="4">${esc(d.descripcion||'')}</textarea></label><label>Estado<select name="estado"><option value="1" ${Number(d.estado)!==0?'selected':''}>Activo</option><option value="0" ${Number(d.estado)===0?'selected':''}>Inactivo</option></select></label></div>${d.id_rol?`<section class="pc-admin-section"><h3>Usuarios asignados (${esc(d.usuarios_asignados||0)})</h3><div class="pc-role-users">${(d.usuarios||[]).map(u=>`<span>${esc(u.nombre)}${u.principal?' · Principal':''}</span>`).join('')||'Sin usuarios asignados.'}</div><button type="button" class="pc-btn ghost" id="pc-go-role-permissions">Ir a permisos</button></section>`:''}<div class="pc-admin-actions"><button type="button" class="pc-btn ghost" id="pc-cancel-role">Cancelar</button><button class="pc-btn primary" ${state.adminLoading?'disabled':''}>${state.adminLoading?'Guardando...':'Guardar rol'}</button></div></form>`;
  }

  function renderAdminRoles(){
    const box=document.getElementById('pc-content');if(!box)return;
    const selected=state.adminRoleId?state.roles.find(role=>Number(role.id_rol)===Number(state.adminRoleId)):(state.adminRoleDetail!==null?{}:null);
    const companies=[...new Set(state.roles.map(role=>roleCompanyLabel(role.empresa)))].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
    box.innerHTML=`<div class="pc-admin-layout"><aside class="pc-admin-list pc-admin-role-selector"><div class="pc-selector-head"><h2>Roles</h2><p>Agrupados por empresa y ordenados por nivel jerárquico.</p></div><div class="pc-role-filters"><input id="pc-admin-role-search" value="${esc(state.adminRoleQuery)}" placeholder="Buscar..."><select id="pc-admin-role-company"><option value="">Todas las empresas</option>${companies.map(company=>`<option value="${esc(company)}" ${normalizeText(company)===normalizeText(state.adminRoleCompany)?'selected':''}>${esc(company)}</option>`).join('')}</select><select id="pc-admin-role-status"><option value="">Todos</option><option value="active" ${state.adminRoleStatus==='active'?'selected':''}>Activos</option><option value="inactive" ${state.adminRoleStatus==='inactive'?'selected':''}>Inactivos</option></select></div><div class="pc-list" id="pc-admin-role-items"></div></aside><section class="pc-admin-editor">${roleForm(selected)}</section></div>`;
    renderAdminRoleList();
    bindAdminRoleEvents();
  }

  async function selectAdminRole(id){
    state.adminRoleId=Number(id);state.adminLoading=true;renderAdminRoles();
    try{const response=await request(`/api/panel-control/admin/roles/${id}`);state.adminRoleDetail=response.data||null;}
    catch(error){toast(error.message||'No se pudo cargar el rol.');}
    finally{state.adminLoading=false;renderAdminRoles();}
  }

  function bindAdminRoleEvents(){
    document.getElementById('pc-admin-role-search')?.addEventListener('input',event=>{state.adminRoleQuery=event.target.value;renderAdminRoleList();});
    document.getElementById('pc-admin-role-company')?.addEventListener('change',event=>{state.adminRoleCompany=event.target.value;renderAdminRoleList();});
    document.getElementById('pc-admin-role-status')?.addEventListener('change',event=>{state.adminRoleStatus=event.target.value;renderAdminRoleList();});
    document.getElementById('pc-new-role')?.addEventListener('click',()=>{state.adminRoleId=null;state.adminRoleDetail={};renderAdminRoles();});
    document.getElementById('pc-cancel-role')?.addEventListener('click',()=>{state.adminRoleId=null;state.adminRoleDetail=null;renderAdminRoles();});
    document.getElementById('pc-admin-role-form')?.addEventListener('submit',saveAdminRole);
    document.getElementById('pc-go-role-permissions')?.addEventListener('click',async()=>{state.selectedRoleId=state.adminRoleId;state.tab='roles';render();await loadRolePermissions(state.selectedRoleId);});
  }

  async function saveAdminRole(ev){
    ev.preventDefault();
    const fd=new FormData(ev.currentTarget);
    const payload={rol:fd.get('rol'),codigo:fd.get('codigo'),empresa:fd.get('empresa'),nivel:Number(fd.get('nivel')||0),descripcion:fd.get('descripcion'),estado:Number(fd.get('estado'))};
    state.adminLoading=true;renderAdminRoles();
    try{
      const path=state.adminRoleId?`/api/panel-control/admin/roles/${state.adminRoleId}`:'/api/panel-control/admin/roles';
      const method=state.adminRoleId?'PUT':'POST';
      const response=await request(path,{method,body:JSON.stringify(payload)});
      toast(response.message||'Rol guardado correctamente.');
      state.adminRoleId=Number(response.data?.id_rol||state.adminRoleId);
      state.adminRoleDetail=null;
      await loadBootstrap();
      state.tab='admin-roles';
      await selectAdminRole(state.adminRoleId);
    }catch(error){
      toast(error.message||'No se pudo guardar el rol.');
      state.adminLoading=false;renderAdminRoles();
    }
  }

  function toast(message){
    const t=document.getElementById('pc-toast');
    if(!t)return;
    t.textContent=message;
    t.classList.add('show');
    setTimeout(()=>t.classList.remove('show'),3200);
  }

  function init(){loadBootstrap();}
  window.ManttoPanelControl={init};
  consumeSaveMessage();
})();
