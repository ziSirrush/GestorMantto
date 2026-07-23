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
    adminRoleStatus:''
  };

  const esc=(v)=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const api=()=>window.ManttoAuth;

  async function request(path,options){
    if(!api()) throw new Error('No se encontró el servicio de autenticación.');
    return api().api(path,options||{method:'GET'});
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

  function shell(){
    return `<div class="pc-page">
      <header class="pc-hero"><div><span class="pc-eyebrow">SEGURIDAD Y ACCESOS</span><h1>Panel de Control</h1><p>Configura permisos base por rol y personaliza el acceso efectivo de cada usuario.</p></div><div class="pc-hero-actions"><button class="pc-btn ghost" id="pc-reload">Recargar datos</button><button class="pc-btn primary" id="pc-save" disabled>Guardar cambios <span id="pc-dirty-count">0</span></button></div></header>
      <section class="pc-summary">
        <article><b>${esc(state.totals.roles_activos||0)}</b><span>Roles activos</span></article>
        <article><b>${esc(state.totals.usuarios_activos||0)}</b><span>Usuarios activos</span></article>
        <article><b>${esc(state.totals.permisos_disponibles||0)}</b><span>Permisos disponibles</span></article>
        <article><b>${esc(state.totals.personalizaciones_activas||0)}</b><span>Personalizaciones activas</span></article>
      </section>
      <nav class="pc-tabs"><button data-tab="users" class="${state.tab==='users'?'active':''}">Permisos por usuario</button><button data-tab="roles" class="${state.tab==='roles'?'active':''}">Roles y permisos</button><button data-tab="admin-users" class="${state.tab==='admin-users'?'active':''}">Usuarios</button><button data-tab="admin-roles" class="${state.tab==='admin-roles'?'active':''}">Roles</button><button data-tab="audit" class="${state.tab==='audit'?'active':''}">Auditoría</button></nav>
      <div id="pc-content"></div><div class="pc-toast" id="pc-toast"></div>
    </div>`;
  }

  function render(){
    const view=document.getElementById('view-panel-control');
    if(!view)return;
    view.innerHTML=shell();
    document.getElementById('pc-reload')?.addEventListener('click',loadBootstrap);
    document.getElementById('pc-save')?.addEventListener('click',saveChanges);
    view.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',async()=>{
      const nextTab=btn.dataset.tab;
      if(nextTab===state.tab)return;
      if(state.dirty.size&&!confirm('Hay cambios sin guardar. ¿Deseas descartarlos y cambiar de pestaña?'))return;
      state.tab=nextTab;
      state.dirty.clear();
      state.permissionQuery='';
      render();
      if(state.tab==='roles'&&state.selectedRoleId) await loadRolePermissions(state.selectedRoleId);
      if(state.tab==='admin-users'){ await loadAdminCatalogs(); renderAdminUsers(); }
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
    const count=document.getElementById('pc-dirty-count');
    if(!btn||!count)return;
    count.textContent=state.dirty.size;
    const targetMissing=state.tab==='users'?!state.selectedUserId:state.tab==='roles'?!state.selectedRoleId:false;
    btn.disabled=state.dirty.size===0||state.tab==='audit'||targetMissing||state.panelLoading;
  }

  async function saveChanges(){
    if(!state.dirty.size)return;
    const isUsers=state.tab==='users';
    const target=isUsers
      ?state.users.find(u=>Number(u.id_SB)===Number(state.selectedUserId))?.nombre
      :state.roles.find(r=>Number(r.id_rol)===Number(state.selectedRoleId))?.rol;
    const totalChanges=state.dirty.size;
    if(!confirm(`¿Guardar ${totalChanges} cambio(s) para ${target||'el registro seleccionado'}?`))return;

    try{
      const changes=[...state.dirty.entries()].map(([id,value])=>({id_subelemento_accion:id,...value}));
      const path=isUsers
        ?`/api/panel-control/usuarios/${state.selectedUserId}/permisos`
        :`/api/panel-control/roles/${state.selectedRoleId}/permisos`;
      await request(path,{method:'PUT',body:JSON.stringify({changes})});
      toast('Cambios guardados correctamente en Aiven.');
      state.dirty.clear();
      state.hierarchyDirty.clear();
      if(isUsers)await loadUserPermissions(state.selectedUserId);
      else await loadRolePermissions(state.selectedRoleId);
      await refreshTotalsOnly();
    }catch(e){toast(e.message||'No fue posible guardar los cambios.');}
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
      ${d.id_SB?`<section class="pc-admin-section security"><h3>Seguridad de acceso</h3><div class="pc-security-status"><span>Último acceso: <b>${esc(d.ultimo_acceso||'Sin registro')}</b></span><span>Intentos fallidos: <b>${esc(d.failed_login_attempts||0)}</b></span><span>Bloqueo: <b>${d.locked_until?esc(d.locked_until):'No'}</b></span></div><button type="button" class="pc-btn danger" id="pc-reset-credentials">Resetear credenciales</button></section>`:''}
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
    state.adminUserId=Number(id); state.adminLoading=true; renderAdminUsers();
    try{ const r=await request(`/api/usuarios/${id}/detalle`); state.adminUserDetail=r.data||null; }
    catch(e){toast(e.message||'No se pudo cargar el usuario.');}
    finally{state.adminLoading=false;renderAdminUsers();}
  }

  function bindAdminUserEvents(){
    document.getElementById('pc-admin-user-search')?.addEventListener('input',event=>{state.adminUserQuery=event.target.value;renderAdminUserList();});
    document.getElementById('pc-admin-user-company')?.addEventListener('change',event=>{state.adminUserCompany=event.target.value;renderAdminUserList();});
    document.getElementById('pc-new-user')?.addEventListener('click',()=>{state.adminUserId=null;state.adminUserDetail={};renderAdminUsers();});
    document.getElementById('pc-cancel-user')?.addEventListener('click',()=>{state.adminUserDetail=null;state.adminUserId=null;renderAdminUsers();});
    const rolesBox=document.getElementById('pc-admin-roles');
    rolesBox?.addEventListener('change',()=>{
      const sel=document.querySelector('#pc-admin-user-form select[name="rol_id"]'); const current=sel.value;
      const checked=[...rolesBox.querySelectorAll('input:checked')].map(i=>Number(i.value));
      sel.innerHTML='<option value="">Selecciona</option>'+state.roles.filter(r=>checked.includes(Number(r.id_rol))).map(r=>`<option value="${r.id_rol}" ${String(r.id_rol)===current?'selected':''}>${esc(r.rol)}</option>`).join('');
    });
    document.getElementById('pc-admin-user-form')?.addEventListener('submit',saveAdminUser);
    document.getElementById('pc-reset-credentials')?.addEventListener('click',resetCredentials);
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
    const user=state.adminUserDetail;if(!user||!confirm(`¿Resetear únicamente las credenciales de ${user.nombre}?`))return;
    try{const r=await request(`/api/usuarios/${user.id_SB}/reset-credentials`,{method:'POST',body:'{}'});alert(`Contraseña temporal: ${r.data?.temporary_password||'Generada'}
Se mostrará una sola vez.`);await selectAdminUser(user.id_SB);}
    catch(e){toast(e.message||'No se pudieron resetear las credenciales.');}
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
})();
