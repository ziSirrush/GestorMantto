(function(){
  'use strict';

  if(window.ManttoSeguimientoEspecial) return;

  const API=(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
  const ACCESS_PERMISSION='PORTAFOLIO_SEGUIMIENTO_ESPECIAL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
  const MANAGE_PERMISSION='PORTAFOLIO_SEGUIMIENTO_ESPECIAL_SEGUIMIENTO_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO';
  const ROUTE='seguimiento-especial';
  const STAR_CODE='SEGUIMIENTO_ESPECIAL';
  const STAR={codigo:STAR_CODE,nombre:'Seguimiento Especial',emoji:'⭐',icono:'ti ti-star-filled',prioridad:0.5};
  const SIDEBAR_ID='side-seguimiento-especial';
  const VIEW_ID='view-seguimiento-especial';
  const DETAIL_CONTROL_ID='mg-seguimiento-especial-control';

  let trackedProjects=new Set();
  let trackedEquipment=new Set();
  let lastData={proyectos:[],equipos:[],resumen:{proyectos:0,equipos:0}};
  let refreshPromise=null;
  let scanTimer=null;
  let observer=null;
  let detailMountTimer=null;
  let backendAccessConfirmed=null;

  function normalize(value){
    return String(value==null?'':value).trim().replace(/\s+/g,' ').toLocaleLowerCase('es-MX');
  }

  function escapeHtml(value){
    return String(value==null?'':value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  function authHeaders(){
    return Object.assign({'Accept':'application/json'},window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{});
  }

  function isViewingAs(){
    return Boolean(window.ManttoAuth&&typeof window.ManttoAuth.isViewingAs==='function'&&window.ManttoAuth.isViewingAs());
  }

  function authenticated(){
    return Boolean(window.ManttoAuth&&typeof window.ManttoAuth.getUser==='function'&&window.ManttoAuth.getUser());
  }

  function permissionEffective(code){
    if(!window.ManttoPermissions||typeof window.ManttoPermissions.state!=='function')return false;
    const state=window.ManttoPermissions.state(code);
    return Boolean(state&&state.exists&&state.efectivo===true);
  }

  function localAccessState(){
    if(!window.ManttoPermissions||typeof window.ManttoPermissions.state!=='function')return null;
    const access=window.ManttoPermissions.state(ACCESS_PERMISSION);
    const manage=window.ManttoPermissions.state(MANAGE_PERMISSION);
    if((access&&access.exists&&access.efectivo===true)||(manage&&manage.exists&&manage.efectivo===true))return true;
    // Si ambas facultades ya existen en el catálogo efectivo y ninguna está
    // concedida, la respuesta local es definitiva. Si todavía no existen en
    // el snapshot del frontend, se considera estado desconocido y se permite
    // que el backend confirme la lectura del módulo.
    if(access&&access.exists===true&&manage&&manage.exists===true)return false;
    return null;
  }

  function canAccess(){
    if(isViewingAs())return false;
    const local=localAccessState();
    return local===true||backendAccessConfirmed===true;
  }

  function canManage(){
    if(isViewingAs())return false;
    return permissionEffective(MANAGE_PERMISSION);
  }

  async function request(path,options={}){
    const headers=Object.assign({},authHeaders(),options.headers||{});
    const response=await fetch(API+path,Object.assign({cache:'no-store'},options,{headers}));
    const raw=await response.text();
    let json={};
    try{json=raw?JSON.parse(raw):{};}catch(_error){throw new Error('El backend respondió contenido no JSON.');}
    if(!response.ok||json.ok===false){
      const error=new Error(json.message||json.error||('Error HTTP '+response.status));
      error.status=response.status;
      error.code=json.code||null;
      throw error;
    }
    return json;
  }

  function putJson(path,body){
    return request(path,{
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body||{})
    });
  }

  function ensureStyles(){
    if(document.getElementById('mg-seguimiento-especial-global-styles'))return;
    const style=document.createElement('style');
    style.id='mg-seguimiento-especial-global-styles';
    style.textContent=`
      .mg-se-star-generated,.mg-se-star{display:inline-block;line-height:1;vertical-align:middle;margin-right:.22rem;background:transparent!important;border:0!important;box-shadow:none!important;color:inherit!important}
      .mg-detail-head{flex-wrap:wrap}
      .mg-se-detail-card{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-left:auto;min-width:270px;max-width:370px;background:#fff;border:1px solid rgba(255,255,255,.72);border-radius:10px;padding:8px 10px;box-shadow:0 5px 14px rgba(0,0,0,.16);color:#0D2E6E;flex:0 0 auto}
      .mg-se-detail-copy{min-width:0}.mg-se-detail-copy strong{display:block;color:#0D2E6E;font-size:12px;line-height:1.15}.mg-se-detail-copy span{display:block;margin-top:2px;color:#64748B;font-size:9px;line-height:1.25;max-width:230px}
      .mg-se-detail-toggle{display:inline-flex;align-items:center;gap:6px;color:#0D2E6E;font-size:10px;font-weight:850;white-space:nowrap;cursor:pointer}.mg-se-detail-toggle input{width:17px;height:17px;accent-color:#1455d9;cursor:pointer}.mg-se-detail-toggle input:disabled{cursor:wait;opacity:.65}
      .mg-se-detail-card.error{border-color:#fecaca}.mg-se-detail-card.error .mg-se-detail-copy span{color:#991b1b}
      @media(max-width:820px){.mg-se-detail-card{width:100%;max-width:none;margin-left:0}.mg-se-detail-copy span{max-width:none}}
      @media(max-width:520px){.mg-se-detail-card{align-items:flex-start;flex-direction:column}.mg-se-detail-toggle{width:100%;justify-content:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function ensureSidebar(){
    const group=document.querySelector('.side-group[data-group="portafolio"] .side-group-items');
    if(!group)return null;
    let button=document.getElementById(SIDEBAR_ID);
    if(button)return button;
    button=document.createElement('button');
    button.id=SIDEBAR_ID;
    button.className='side-item';
    button.type='button';
    button.dataset.route=ROUTE;
    button.setAttribute('aria-label','Seguimiento Especial');
    button.title='Seguimiento Especial';
    button.innerHTML='<span>⭐</span><b>Seguimiento Especial</b>';
    button.addEventListener('click',event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      if(!canAccess())return;
      if(window.ManttoRouter&&typeof window.ManttoRouter.go==='function'){
        window.ManttoRouter.go(ROUTE,null,{navigationType:'open'});
      }
      const sidebar=document.getElementById('sidebar');
      if(sidebar){
        if(window.innerWidth<=920)sidebar.classList.remove('open');
        else sidebar.classList.add('collapsed');
      }
    });
    const anchor=group.querySelector('.side-item[data-route="proyectos"]');
    if(anchor&&anchor.parentElement===group)anchor.insertAdjacentElement('afterend',button);
    else group.appendChild(button);
    return button;
  }

  function ensureView(){
    let view=document.getElementById(VIEW_ID);
    if(view)return view;
    const main=document.querySelector('.main-content');
    if(!main)return null;
    view=document.createElement('section');
    view.id=VIEW_ID;
    view.className='view';
    view.dataset.view=ROUTE;
    view.setAttribute('aria-label','Seguimiento Especial');
    view.style.display='none';
    view.setAttribute('aria-hidden','true');
    main.appendChild(view);
    return view;
  }

  function ensureShell(){
    ensureStyles();
    ensureSidebar();
    ensureView();
  }

  function syncPermissionUi(){
    ensureShell();
    const button=document.getElementById(SIDEBAR_ID);
    if(!button)return;
    button.hidden=!canAccess();
    const group=button.closest('.side-group');
    if(group){
      const hasVisibleItem=Array.from(group.querySelectorAll('.side-item')).some(item=>!item.hidden);
      group.hidden=!hasVisibleItem;
    }
  }

  function activateModuleView(){
    const view=ensureView();
    if(!view)return null;
    document.querySelectorAll('.view').forEach(node=>{
      const active=node===view;
      node.classList.toggle('active',active);
      if(active){
        node.removeAttribute('aria-hidden');
        node.style.display='block';
      }else{
        node.setAttribute('aria-hidden','true');
        node.style.display='none';
      }
    });
    document.querySelectorAll('.side-item').forEach(node=>node.classList.toggle('active',node.id===SIDEBAR_ID));
    const button=document.getElementById(SIDEBAR_ID);
    const group=button?button.closest('.side-group'):null;
    document.querySelectorAll('.side-group').forEach(node=>{
      const active=node===group;
      node.classList.toggle('active',active);
      const sidebar=document.getElementById('sidebar');
      const open=active&&sidebar&&!sidebar.classList.contains('collapsed');
      node.classList.toggle('open',Boolean(open));
      const toggle=node.querySelector('.side-group-toggle');
      if(toggle){
        toggle.setAttribute('aria-expanded',open?'true':'false');
        toggle.setAttribute('aria-current',active?'true':'false');
      }
    });
    const title=document.getElementById('app-context-title');
    const subtitle=document.getElementById('app-context-subtitle');
    if(title)title.textContent='Seguimiento Especial';
    if(subtitle)subtitle.textContent='Portafolio · proyectos y equipos que requieren tu seguimiento personal';
    return view;
  }

  function projectReference(row){
    return row&&(row.proyecto||row.proyecto_nombre||row.nombre_proyecto||row.proyecto_padre)||'';
  }

  function equipmentReference(row){
    return row&&(row.numero_equipo||row.codigo_equipo||row.equipo||row.identificacion_sitio)||'';
  }

  function isProjectTracked(value){return trackedProjects.has(normalize(value));}
  function isEquipmentTracked(value){return trackedEquipment.has(normalize(value));}
  function isReferenceTracked(value){const key=normalize(value);return trackedProjects.has(key)||trackedEquipment.has(key);}

  function isManttoView(){
    const current=window.ManttoRouter&&typeof window.ManttoRouter.getCurrent==='function'?window.ManttoRouter.getCurrent():null;
    const route=String(current&&current.route||'home').toLowerCase();
    if(route==='detalle'){
      const payload=current&&current.payload||{};
      const marker=[payload.source,payload.template,payload.origen].filter(Boolean).join(' ').toLowerCase();
      if(marker.includes('instalacion')||marker.includes('corellian')||marker.includes('cliente-unificado'))return false;
      return ['proyecto','equipo','ticket'].includes(String(payload.type||'').toLowerCase());
    }
    return route==='home'||route==='tickets'||route==='resumen'||route==='criticos'||route==='callcenter'||
      route==='operativo'||route==='portafolio'||route==='proyectos'||route==='movimientos'||route===ROUTE||
      route.startsWith('experimental-')||route.startsWith('cobranza-uni-');
  }

  function removeGeneratedStars(){
    document.querySelectorAll('.mg-se-star-generated,[data-estado-codigo="SEGUIMIENTO_ESPECIAL"]').forEach(node=>node.remove());
  }

  function shouldSkipTextNode(node){
    const parent=node&&node.parentElement;
    if(!parent)return true;
    if(parent.closest('#'+VIEW_ID))return true;
    if(parent.closest('script,style,textarea,select,option,input,[contenteditable="true"],[data-no-seguimiento-star]'))return true;
    if(parent.closest('.mg-se-star-generated,.mg-se-star'))return true;
    const identifier=parent.closest('.estado-identificador-gnral');
    if(identifier&&identifier.querySelector('[data-estado-codigo="SEGUIMIENTO_ESPECIAL"]'))return true;
    const previous=node.previousSibling;
    if(previous&&previous.nodeType===1&&previous.classList&&previous.classList.contains('mg-se-star-generated'))return true;
    return false;
  }

  function decorateTextNodes(root){
    if(isViewingAs()||!isManttoView()||(!trackedProjects.size&&!trackedEquipment.size))return;
    const base=root&&root.nodeType===1?root:document.querySelector('.main-content');
    if(!base)return;
    const walker=document.createTreeWalker(base,NodeFilter.SHOW_TEXT,{
      acceptNode(node){
        if(shouldSkipTextNode(node))return NodeFilter.FILTER_REJECT;
        const text=String(node.nodeValue||'').trim();
        if(text.length<3||text.length>255)return NodeFilter.FILTER_REJECT;
        return isReferenceTracked(text)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;
      }
    });
    const nodes=[];
    let node;
    while((node=walker.nextNode()))nodes.push(node);
    nodes.forEach(textNode=>{
      if(shouldSkipTextNode(textNode))return;
      const star=document.createElement('span');
      star.className='mg-se-star-generated';
      star.title='Seguimiento Especial';
      star.setAttribute('aria-label','Seguimiento Especial');
      star.textContent='⭐';
      textNode.parentNode.insertBefore(star,textNode);
    });
  }

  function decorateCurrentDetail(){
    const current=window.ManttoRouter&&typeof window.ManttoRouter.getCurrent==='function'?window.ManttoRouter.getCurrent():null;
    if(!current||current.route!=='detalle'||!current.payload)return;
    const type=String(current.payload.type||'').toLowerCase();
    const id=String(current.payload.id||'').trim();
    const tracked=type==='proyecto'?isProjectTracked(id):(type==='equipo'?isEquipmentTracked(id):false);
    const head=document.querySelector('#view-detalle .mg-detail-head h2');
    if(!head)return;
    const old=head.querySelector('.mg-se-star-generated');
    if(old)old.remove();
    if(!tracked||isViewingAs()||!isManttoView())return;
    const star=document.createElement('span');
    star.className='mg-se-star-generated';
    star.title='Seguimiento Especial';
    star.textContent='⭐';
    head.insertBefore(star,head.firstChild||null);
  }

  function decorateAll(){
    removeGeneratedStars();
    if(isViewingAs())return;
    decorateCurrentDetail();
    decorateTextNodes(document.querySelector('.main-content'));
  }

  function scheduleDecorate(){
    if(scanTimer!==null)window.clearTimeout(scanTimer);
    scanTimer=window.setTimeout(()=>{
      scanTimer=null;
      patchVisualCatalog();
      decorateAll();
    },30);
  }

  function patchVisualCatalog(){
    const visual=window.EstadosVisuales_gnral;
    if(!visual||visual.__seguimientoEspecialV002===true)return Boolean(visual);

    const originalGet=typeof visual.get==='function'?visual.get.bind(visual):()=>null;
    const originalGetMany=typeof visual.getMany==='function'?visual.getMany.bind(visual):()=>[];
    const originalEmoji=typeof visual.emoji==='function'?visual.emoji.bind(visual):()=>'';
    const originalRenderMany=typeof visual.renderMany==='function'?visual.renderMany.bind(visual):()=>'';
    const originalCodesEquipo=typeof visual.codesForEquipo==='function'?visual.codesForEquipo.bind(visual):()=>[];
    const originalCodesProyecto=typeof visual.codesForProyecto==='function'?visual.codesForProyecto.bind(visual):()=>[];

    visual.get=function(code){
      return String(code||'').trim().toUpperCase()===STAR_CODE?Object.assign({},STAR):originalGet(code);
    };
    visual.getMany=function(codes,options){
      const source=Array.isArray(codes)?codes:[codes];
      const hasStar=source.some(code=>String(code||'').trim().toUpperCase()===STAR_CODE);
      const excluded=new Set((options&&Array.isArray(options.excludeCodes)?options.excludeCodes:[]).map(code=>String(code||'').trim().toUpperCase()));
      const other=source.filter(code=>String(code||'').trim().toUpperCase()!==STAR_CODE);
      const rows=originalGetMany(other,options)||[];
      return hasStar&&!excluded.has(STAR_CODE)?[Object.assign({},STAR),...rows]:rows;
    };
    visual.emoji=function(code,fallback){
      return String(code||'').trim().toUpperCase()===STAR_CODE?'⭐':originalEmoji(code,fallback);
    };
    visual.renderMany=function(codes,options){
      const opts=options||{};
      const source=Array.isArray(codes)?codes:[codes];
      const hasStar=source.some(code=>String(code||'').trim().toUpperCase()===STAR_CODE);
      const excluded=new Set((Array.isArray(opts.excludeCodes)?opts.excludeCodes:[]).map(code=>String(code||'').trim().toUpperCase()));
      const others=source.filter(code=>String(code||'').trim().toUpperCase()!==STAR_CODE);
      const pieces=[];
      if(hasStar&&!excluded.has(STAR_CODE))pieces.push('<span class="estado-visual-gnral mg-se-star" data-estado-codigo="SEGUIMIENTO_ESPECIAL" title="Seguimiento Especial">⭐</span>');
      const rest=originalRenderMany(others,Object.assign({},opts,{empty:''}));
      if(rest)pieces.push(rest);
      return pieces.length?pieces.join(opts.separator==null?' ':opts.separator):(opts.empty==null?'':String(opts.empty));
    };
    visual.renderIdentifier=function(codes,text,options){
      const opts=options||{};
      const source=Array.isArray(codes)?codes.slice():[codes];
      if(isManttoView()&&isReferenceTracked(text)&&!source.some(code=>String(code||'').trim().toUpperCase()===STAR_CODE))source.unshift(STAR_CODE);
      const icons=visual.renderMany(source,{empty:'',separator:opts.separator==null?' ':opts.separator,excludeCodes:opts.excludeCodes||[]});
      const label=opts.escape===false?String(text==null?'—':text):escapeHtml(text==null||text===''?'—':text);
      return '<span class="estado-identificador-gnral">'+(icons?icons+' ':'')+'<span class="estado-identificador-texto-gnral">'+label+'</span></span>';
    };
    visual.codesForEquipo=function(row,tickets,options){
      const codes=originalCodesEquipo(row,tickets,options)||[];
      if(isManttoView()&&isEquipmentTracked(equipmentReference(row))&&!codes.includes(STAR_CODE))return [STAR_CODE,...codes];
      return codes;
    };
    visual.codesForProyecto=function(row,equipos,tickets,options){
      const codes=originalCodesProyecto(row,equipos,tickets,options)||[];
      if(isManttoView()&&isProjectTracked(projectReference(row))&&!codes.includes(STAR_CODE))return [STAR_CODE,...codes];
      return codes;
    };
    try{Object.defineProperty(visual,'__seguimientoEspecialV002',{value:true,configurable:false,enumerable:false});}
    catch(_error){visual.__seguimientoEspecialV002=true;}
    return true;
  }

  function applySnapshot(data){
    const payload=data&&typeof data==='object'?data:{};
    const projects=Array.isArray(payload.proyectos)?payload.proyectos:[];
    const equipments=Array.isArray(payload.equipos)?payload.equipos:[];
    trackedProjects=new Set(projects.map(row=>normalize(row.proyecto)).filter(Boolean));
    trackedEquipment=new Set(equipments.flatMap(row=>[normalize(row.numero_equipo),normalize(row.identificacion_sitio)]).filter(Boolean));
    lastData={
      proyectos:projects.map(row=>Object.assign({},row)),
      equipos:equipments.map(row=>Object.assign({},row)),
      resumen:Object.assign({proyectos:projects.length,equipos:equipments.length},payload.resumen||{})
    };
    patchVisualCatalog();
    scheduleDecorate();
  }

  function clearSnapshot(){
    trackedProjects=new Set();
    trackedEquipment=new Set();
    lastData={proyectos:[],equipos:[],resumen:{proyectos:0,equipos:0}};
    decorateAll();
  }

  async function refresh(force){
    syncPermissionUi();
    if(isViewingAs()||!authenticated()){
      backendAccessConfirmed=null;
      clearSnapshot();
      return getSnapshot();
    }

    const local=localAccessState();
    if(local===false){
      backendAccessConfirmed=false;
      syncPermissionUi();
      clearSnapshot();
      return getSnapshot();
    }

    if(refreshPromise&&!force)return refreshPromise;
    const task=(async()=>{
      try{
        // El GET del módulo es la validación autoritativa de acceso cuando el
        // snapshot de permisos todavía no terminó de cargar en frontend.
        const json=await request('/api/portafolio/seguimiento-especial');
        backendAccessConfirmed=true;
        syncPermissionUi();
        applySnapshot(json.data||{});
        document.dispatchEvent(new CustomEvent('mantto:seguimiento-especial-refreshed',{detail:getSnapshot()}));
        return getSnapshot();
      }catch(error){
        if(error.status===401||error.status===403){
          backendAccessConfirmed=false;
          syncPermissionUi();
          clearSnapshot();
          return getSnapshot();
        }
        console.error('[SEGUIMIENTO_ESPECIAL_REFRESH]',error);
        throw error;
      }
    })();
    refreshPromise=task;
    try{return await task;}finally{if(refreshPromise===task)refreshPromise=null;}
  }

  function getSnapshot(){
    return {
      proyectos:lastData.proyectos.map(row=>Object.assign({},row)),
      equipos:lastData.equipos.map(row=>Object.assign({},row)),
      resumen:Object.assign({},lastData.resumen),
      proyectosSet:new Set(trackedProjects),
      equiposSet:new Set(trackedEquipment)
    };
  }

  async function setProject(project,active){
    if(!canManage())throw new Error('No tienes permiso para gestionar Seguimiento Especial.');
    const ref=String(project||'').trim();
    if(!ref)throw new Error('Proyecto requerido.');
    const json=await putJson('/api/proyectos/'+encodeURIComponent(ref)+'/seguimiento-especial',{activo:Boolean(active)});
    await refresh(true);
    document.dispatchEvent(new CustomEvent('mantto:seguimiento-especial-actualizado',{detail:{tipo:'PROYECTO',referencia:ref,activo:Boolean(json.data&&json.data.activo),data:json.data||{}}}));
    return json.data||{};
  }

  async function setEquipment(code,active){
    if(!canManage())throw new Error('No tienes permiso para gestionar Seguimiento Especial.');
    const ref=String(code||'').trim();
    if(!ref)throw new Error('Equipo requerido.');
    const json=await putJson('/api/equipos/'+encodeURIComponent(ref)+'/seguimiento-especial',{activo:Boolean(active)});
    await refresh(true);
    document.dispatchEvent(new CustomEvent('mantto:seguimiento-especial-actualizado',{detail:{tipo:'EQUIPO',referencia:ref,activo:Boolean(json.data&&json.data.activo),data:json.data||{}}}));
    return json.data||{};
  }

  function isManttoTarget(payload){
    const source=payload&&typeof payload==='object'?payload:{};
    const type=String(source.type||'').trim().toLowerCase();
    const id=String(source.id||'').trim();
    if(!['proyecto','equipo'].includes(type)||!id||id.includes('|||'))return false;
    const marker=[source.source,source.template,source.origen].filter(Boolean).join(' ').toLowerCase();
    return !marker.includes('instalacion')&&!marker.includes('corellian')&&!marker.includes('cliente-unificado');
  }

  function detailEndpoint(payload){
    const type=String(payload&&payload.type||'').toLowerCase();
    const id=String(payload&&payload.id||'').trim();
    if(type==='proyecto')return '/api/proyectos/'+encodeURIComponent(id)+'/seguimiento-especial';
    if(type==='equipo')return '/api/equipos/'+encodeURIComponent(id)+'/seguimiento-especial';
    return null;
  }

  function clearDetailControl(){
    const current=document.getElementById(DETAIL_CONTROL_ID);
    if(current)current.remove();
  }

  function detailCopy(payload,data){
    const type=String(payload&&payload.type||'').toLowerCase();
    if(type==='proyecto'){
      const total=Number(data&&data.total_equipos||0);
      const active=Number(data&&data.equipos_activos||0);
      return data&&data.parcial
        ? `${active} de ${total} equipos permanecen en tu Seguimiento Especial.`
        : data&&data.activo
          ? `Los ${total} equipos visibles del proyecto están en tu Seguimiento Especial.`
          : `Actívalo para incluir los ${total} equipos visibles del proyecto.`;
    }
    return data&&data.activo
      ? 'Este equipo está en tu Seguimiento Especial y mostrará la estrella ⭐.'
      : 'Actívalo para seguir únicamente este equipo y recibir sus notificaciones.';
  }

  function scheduleDetailMount(payload,delay){
    if(detailMountTimer!==null)window.clearTimeout(detailMountTimer);
    detailMountTimer=window.setTimeout(()=>{
      detailMountTimer=null;
      const current=window.ManttoRouter&&typeof window.ManttoRouter.getCurrent==='function'?window.ManttoRouter.getCurrent():null;
      const effective=current&&current.route==='detalle'&&current.payload?current.payload:payload;
      if(effective)mountDetailControl(effective);
    },Math.max(0,Number(delay)||0));
  }

  async function mountDetailControl(payload){
    clearDetailControl();
    if(!canManage()||!isManttoTarget(payload))return;
    const endpoint=detailEndpoint(payload);
    if(!endpoint)return;
    try{
      const json=await request(endpoint);
      let data=json.data||{};
      const head=document.querySelector('#view-detalle .mg-detail-head')||document.querySelector('.mg-detail-head');
      if(!head){
        scheduleDetailMount(payload,90);
        return;
      }

      const root=document.createElement('div');
      root.id=DETAIL_CONTROL_ID;
      root.className='mg-se-detail-card';
      const copy=document.createElement('div');
      copy.className='mg-se-detail-copy';
      const strong=document.createElement('strong');
      strong.textContent='⭐ Seguimiento Especial';
      const description=document.createElement('span');
      description.textContent=detailCopy(payload,data);
      copy.append(strong,description);

      const label=document.createElement('label');
      label.className='mg-se-detail-toggle';
      const checkbox=document.createElement('input');
      checkbox.type='checkbox';
      checkbox.checked=Boolean(data.activo);
      checkbox.indeterminate=Boolean(data.parcial);
      checkbox.setAttribute('aria-label','Seguimiento Especial');
      const state=document.createElement('span');
      state.textContent=data.parcial?'Activo · con excepciones':(data.activo?'Activo':'Inactivo');
      label.append(checkbox,state);
      root.append(copy,label);

      checkbox.addEventListener('change',async()=>{
        const requested=checkbox.checked;
        const previous={checked:!requested,indeterminate:Boolean(data.parcial)};
        checkbox.indeterminate=false;
        checkbox.disabled=true;
        state.textContent='Guardando...';
        try{
          const next=String(payload.type||'').toLowerCase()==='proyecto'
            ? await setProject(payload.id,requested)
            : await setEquipment(payload.id,requested);
          data=next||{};
          checkbox.checked=Boolean(data.activo);
          checkbox.indeterminate=Boolean(data.parcial);
          description.textContent=detailCopy(payload,data);
          state.textContent=data.parcial?'Activo · con excepciones':(data.activo?'Activo':'Inactivo');
          root.classList.remove('error');
        }catch(error){
          checkbox.checked=previous.checked;
          checkbox.indeterminate=previous.indeterminate;
          state.textContent=previous.indeterminate?'Activo · con excepciones':(previous.checked?'Activo':'Inactivo');
          root.classList.add('error');
          description.textContent=error.message||'No fue posible actualizar Seguimiento Especial.';
        }finally{
          checkbox.disabled=false;
        }
      });

      head.appendChild(root);
    }catch(error){
      if(error.status===403||error.status===404)return;
      console.error('[SEGUIMIENTO_ESPECIAL_DETALLE]',error);
    }
  }

  function bindObserver(){
    if(observer||typeof MutationObserver!=='function')return;
    const root=document.querySelector('.main-content')||document.body;
    observer=new MutationObserver(mutations=>{
      const hasAdded=mutations.some(mutation=>Array.from(mutation.addedNodes||[]).some(node=>node&&node.nodeType===1&&!node.classList?.contains('mg-se-star-generated')));
      if(!hasAdded)return;

      const current=window.ManttoRouter&&typeof window.ManttoRouter.getCurrent==='function'?window.ManttoRouter.getCurrent():null;
      if(current&&current.route==='detalle'&&current.payload&&canManage()&&isManttoTarget(current.payload)){
        const head=document.querySelector('#view-detalle .mg-detail-head');
        if(head&&!document.getElementById(DETAIL_CONTROL_ID))scheduleDetailMount(current.payload,40);
      }

      if(trackedProjects.size||trackedEquipment.size)scheduleDecorate();
    });
    observer.observe(root,{childList:true,subtree:true});
  }

  function handleNavigation(event){
    const detail=event&&event.detail||{};
    if(detail.route==='detalle'){
      window.setTimeout(()=>{
        scheduleDetailMount(detail.payload||{},40);
        if(String(detail.payload&&detail.payload.source||'').toLowerCase()===ROUTE){
          const backLabel=document.getElementById('app-back-label');
          if(backLabel)backLabel.textContent='Seguimiento Especial';
        }
      },0);
    }else clearDetailControl();
    scheduleDecorate();
  }

  function initialize(){
    ensureShell();
    patchVisualCatalog();
    syncPermissionUi();
    bindObserver();
    document.addEventListener('mantto:auth-ready',()=>{
      backendAccessConfirmed=null;
      syncPermissionUi();
      refresh(true).catch(()=>{});
    });
    document.addEventListener('mantto:permissions-updated',()=>{
      backendAccessConfirmed=null;
      syncPermissionUi();
      refresh(true).catch(()=>{});
      const current=window.ManttoRouter&&window.ManttoRouter.getCurrent?window.ManttoRouter.getCurrent():null;
      if(current&&current.route==='detalle')scheduleDetailMount(current.payload||{},40);
    });
    document.addEventListener('mantto:view-user-changed',()=>{
      backendAccessConfirmed=null;
      syncPermissionUi();
      if(isViewingAs())clearSnapshot();else refresh(true).catch(()=>{});
    });
    document.addEventListener('mantto:session-expired',()=>{
      backendAccessConfirmed=null;
      clearSnapshot();
      syncPermissionUi();
    });
    document.addEventListener('mantto:navigation',handleNavigation);
    document.addEventListener('mantto:module-loaded',()=>{patchVisualCatalog();scheduleDecorate();});

    const current=window.ManttoRouter&&window.ManttoRouter.getCurrent?window.ManttoRouter.getCurrent():null;
    if(current&&current.route==='detalle')scheduleDetailMount(current.payload||{},40);
    // No depender de que el evento de permisos haya ocurrido antes de cargar
    // este script. Si el snapshot aún no está listo, el backend confirma acceso.
    if(authenticated())refresh(true).catch(()=>{});
  }

  window.ManttoSeguimientoEspecial=Object.freeze({
    refresh,
    setProject,
    setEquipment,
    getSnapshot,
    isProjectTracked,
    isEquipmentTracked,
    canAccess,
    canManage,
    activateModuleView,
    mountDetailControl,
    star:()=>Object.assign({},STAR)
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});
  else initialize();
})();
