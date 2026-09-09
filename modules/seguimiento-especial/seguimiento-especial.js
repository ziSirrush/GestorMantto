(function(){
  'use strict';

  if(window.ManttoSeguimientoEspecialModulo)return;

  const ROUTE='seguimiento-especial';
  const VISUAL_CODE='SEGUIMIENTO_ESPECIAL';
  const state={search:'',loading:false,bound:false};
  const $=(selector,root=document)=>root.querySelector(selector);
  const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function api(){return window.ManttoSeguimientoEspecial||null;}

  function visualMarkup(extraClass){
    const css=String(extraClass||'').trim();
    return `<span class="estado-visual-gnral${css?' '+esc(css):''}" data-estado-visual="${VISUAL_CODE}"><span data-estado-visual-icon></span></span>`;
  }

  function applyVisuals(root){
    const catalog=window.EstadosVisuales_gnral;
    if(catalog&&typeof catalog.apply==='function')catalog.apply(root||document);
  }

  function fmtDateTime(value){
    if(!value)return '—';
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return esc(value);
    const parts=new Intl.DateTimeFormat('es-MX',{
      day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false
    }).formatToParts(date).reduce((acc,part)=>{acc[part.type]=part.value;return acc;},{});
    return `${parts.day||'--'}/${parts.month||'--'}/${parts.year||'----'} - ${parts.hour||'--'}:${parts.minute||'--'}`;
  }

  function template(){
    return `<div class="se-page" id="se-page">
      <section class="se-head se-card">
        <div>
          <p class="se-eyebrow">Portafolio · Seguimiento personal</p>
          <h1>${visualMarkup('se-visual')} Seguimiento Especial</h1>
          <p>Proyectos y equipos que requieren tu atención. El indicador visual solo corresponde a tu usuario y no amplía tu alcance UNITED.</p>
        </div>
        <button class="se-btn" id="se-refresh" type="button">↻ Actualizar</button>
      </section>

      <section class="se-summary">
        <article class="se-kpi se-card"><span>Proyectos</span><strong id="se-total-projects">0</strong><small>Proyectos marcados de forma completa.</small></article>
        <article class="se-kpi se-card"><span>Equipos</span><strong id="se-total-equipment">0</strong><small>Equipos actualmente activos en tu seguimiento.</small></article>
        <article class="se-help se-card"><strong>${visualMarkup('se-visual')} Indicador personal</strong><span>El indicador identifica estos proyectos/equipos en las vistas de Mantto para tu usuario.</span></article>
      </section>

      <section class="se-toolbar se-card">
        <label class="se-search"><span>Buscar</span><input id="se-search" type="search" autocomplete="off" placeholder="Proyecto, equipo, ciudad, estado, zona..."></label>
        <div class="se-status" id="se-status" aria-live="polite">Listo para consultar.</div>
      </section>

      <section class="se-workspace se-card">
        <div class="se-section-head"><div><h2>Proyectos</h2><p>Un proyecto marcado incluye sus equipos visibles. Un equipo excluido queda como excepción individual.</p></div></div>
        <div class="se-table-wrap"><table class="se-table"><thead><tr><th>Proyecto</th><th>Equipos activos</th><th>Total visibles</th><th>Estado</th><th>Último cambio</th><th>Acciones</th></tr></thead><tbody id="se-projects-body"></tbody></table></div>
      </section>

      <section class="se-workspace se-card">
        <div class="se-section-head"><div><h2>Equipos</h2><p>Incluye equipos agregados desde proyecto completo y equipos seleccionados individualmente.</p></div></div>
        <div class="se-table-wrap"><table class="se-table"><thead><tr><th>Equipo</th><th>Proyecto</th><th>Identificación</th><th>Ubicación</th><th>Origen</th><th>Estatus servicio</th><th>Último cambio</th><th>Acciones</th></tr></thead><tbody id="se-equipment-body"></tbody></table></div>
      </section>
    </div>`;
  }

  function ensureMarkup(){
    const view=$('#view-seguimiento-especial');
    if(!view)return false;
    if(!$('#se-page',view))view.innerHTML=template();
    applyVisuals(view);
    return true;
  }

  function setStatus(text,error=false){
    const el=$('#se-status');
    if(!el)return;
    el.textContent=text;
    el.classList.toggle('error',Boolean(error));
  }

  function normalize(value){return String(value==null?'':value).trim().toLocaleLowerCase('es-MX');}

  function matchesSearch(row){
    const q=normalize(state.search);
    if(!q)return true;
    return Object.values(row||{}).some(value=>normalize(value).includes(q));
  }

  function projectRow(row,manage){
    const project=String(row.proyecto||'').trim();
    const active=Number(row.equipos_activos||0);
    const total=Number(row.total_equipos||0);
    const partial=Boolean(row.parcial)||active<total;
    return `<tr>
      <td><button class="se-link" type="button" data-open-project="${esc(project)}">${visualMarkup('se-visual')} ${esc(project||'—')}</button></td>
      <td>${active.toLocaleString('es-MX')}</td>
      <td>${total.toLocaleString('es-MX')}</td>
      <td><span class="se-pill ${partial?'partial':'active'}">${partial?'Activo · con excepciones':'Activo'}</span></td>
      <td>${fmtDateTime(row.updated_at)}</td>
      <td class="se-actions"><button class="se-open" type="button" data-open-project="${esc(project)}">Abrir</button>${manage?`<button class="se-remove" type="button" data-remove-project="${esc(project)}">Quitar</button>`:''}</td>
    </tr>`;
  }

  function equipmentRow(row,manage){
    const code=String(row.numero_equipo||'').trim();
    const project=String(row.proyecto||'').trim();
    const place=[row.ciudad,row.estado].filter(Boolean).join(' / ')||row.zona_operativa||'—';
    const rawOrigin=String(row.origen||'').toUpperCase();
    const origin=rawOrigin==='PROYECTO'?'Proyecto':(rawOrigin==='PROYECTO_HEREDADO'?'Proyecto · heredado':'Equipo');
    return `<tr>
      <td><button class="se-link" type="button" data-open-equipment="${esc(code)}">${visualMarkup('se-visual')} ${esc(code||'—')}</button></td>
      <td>${project?`<button class="se-link" type="button" data-open-project="${esc(project)}">${esc(project)}</button>`:'—'}</td>
      <td>${esc(row.identificacion_sitio||'—')}</td>
      <td>${esc(place)}</td>
      <td><span class="se-pill origin">${esc(origin)}</span></td>
      <td>${esc(row.estatus_servicio||'—')}</td>
      <td>${fmtDateTime(row.updated_at)}</td>
      <td class="se-actions"><button class="se-open" type="button" data-open-equipment="${esc(code)}">Abrir</button>${manage?`<button class="se-remove" type="button" data-remove-equipment="${esc(code)}">Quitar</button>`:''}</td>
    </tr>`;
  }

  function render(){
    const service=api();
    if(!service)return;
    const snapshot=service.getSnapshot();
    const projects=snapshot.proyectos.filter(matchesSearch);
    const equipment=snapshot.equipos.filter(matchesSearch);
    const manage=service.canManage();

    const totalProjects=$('#se-total-projects');
    const totalEquipment=$('#se-total-equipment');
    if(totalProjects)totalProjects.textContent=Number(snapshot.resumen.proyectos||snapshot.proyectos.length).toLocaleString('es-MX');
    if(totalEquipment)totalEquipment.textContent=Number(snapshot.resumen.equipos||snapshot.equipos.length).toLocaleString('es-MX');

    const pbody=$('#se-projects-body');
    if(pbody)pbody.innerHTML=projects.length
      ?projects.map(row=>projectRow(row,manage)).join('')
      :'<tr class="se-empty"><td colspan="6">No hay proyectos en Seguimiento Especial para esta búsqueda.</td></tr>';

    const ebody=$('#se-equipment-body');
    if(ebody)ebody.innerHTML=equipment.length
      ?equipment.map(row=>equipmentRow(row,manage)).join('')
      :'<tr class="se-empty"><td colspan="8">No hay equipos en Seguimiento Especial para esta búsqueda.</td></tr>';

    applyVisuals($('#view-seguimiento-especial'));
    setStatus(`${snapshot.proyectos.length.toLocaleString('es-MX')} proyecto${snapshot.proyectos.length===1?'':'s'} · ${snapshot.equipos.length.toLocaleString('es-MX')} equipo${snapshot.equipos.length===1?'':'s'}.`);
  }

  function openDetail(type,id){
    const ref=String(id||'').trim();
    if(!ref||!window.ManttoRouter||typeof window.ManttoRouter.go!=='function')return;
    window.ManttoRouter.go('detalle',{type,id:ref,source:'seguimiento-especial'});
  }

  async function removeTarget(type,id,button){
    const service=api();
    if(!service||!service.canManage())return;
    button.disabled=true;
    const previous=button.textContent;
    button.textContent='Quitando...';
    try{
      if(type==='PROYECTO')await service.setProject(id,false);
      else await service.setEquipment(id,false);
      render();
    }catch(error){
      setStatus(error.message||'No fue posible actualizar Seguimiento Especial.',true);
      button.disabled=false;
      button.textContent=previous;
    }
  }

  function bind(){
    if(state.bound)return;
    state.bound=true;
    const view=$('#view-seguimiento-especial');
    if(!view)return;
    view.addEventListener('click',event=>{
      const refresh=event.target.closest('#se-refresh');
      if(refresh){load(true);return;}
      const project=event.target.closest('[data-open-project]');
      if(project){openDetail('proyecto',project.dataset.openProject);return;}
      const equipment=event.target.closest('[data-open-equipment]');
      if(equipment){openDetail('equipo',equipment.dataset.openEquipment);return;}
      const removeProject=event.target.closest('[data-remove-project]');
      if(removeProject){removeTarget('PROYECTO',removeProject.dataset.removeProject,removeProject);return;}
      const removeEquipment=event.target.closest('[data-remove-equipment]');
      if(removeEquipment)removeTarget('EQUIPO',removeEquipment.dataset.removeEquipment,removeEquipment);
    });
    const search=$('#se-search');
    if(search)search.addEventListener('input',()=>{state.search=search.value.trim();render();});
  }

  async function load(force){
    const service=api();
    if(!service||state.loading)return;
    if(!service.canAccess()){
      renderNoAccess();
      return;
    }
    state.loading=true;
    setStatus('Consultando Seguimiento Especial...');
    try{
      await service.refresh(Boolean(force));
      render();
    }catch(error){
      setStatus(error.message||'No se pudo cargar Seguimiento Especial.',true);
    }finally{
      state.loading=false;
    }
  }

  function renderNoAccess(){
    if(!ensureMarkup())return;
    const pbody=$('#se-projects-body');
    const ebody=$('#se-equipment-body');
    if(pbody)pbody.innerHTML='<tr class="se-empty"><td colspan="6">No tienes permiso para consultar Seguimiento Especial.</td></tr>';
    if(ebody)ebody.innerHTML='<tr class="se-empty"><td colspan="8">No tienes permiso para consultar Seguimiento Especial.</td></tr>';
    setStatus('Acceso no autorizado.',true);
  }

  async function init(){
    const service=api();
    if(!service)return;
    service.activateModuleView();
    if(!ensureMarkup())return;
    bind();
    render();
    await load(false);
  }

  document.addEventListener('mantto:navigation',event=>{
    if(event&&event.detail&&event.detail.route===ROUTE)window.setTimeout(()=>init(),0);
  });
  document.addEventListener('mantto:seguimiento-especial-actualizado',()=>{
    const current=window.ManttoRouter&&window.ManttoRouter.getCurrent?window.ManttoRouter.getCurrent():null;
    if(current&&current.route===ROUTE)render();
  });
  document.addEventListener('mantto:seguimiento-especial-refreshed',()=>{
    const current=window.ManttoRouter&&window.ManttoRouter.getCurrent?window.ManttoRouter.getCurrent():null;
    if(current&&current.route===ROUTE)render();
  });

  window.ManttoSeguimientoEspecialModulo=Object.freeze({init,refresh:()=>load(true)});
})();
