// [Aster | 2026-10-07 | ASTER-MG | FASE 1 ENTREGAS V001]
(function(){
  'use strict';

  const P=Object.freeze({
    programadas_ver:'ENTREGAS_CONTROL_PROGRAMADAS_LISTADO.VER',
    programadas_crear:'ENTREGAS_CONTROL_PROGRAMADAS_LISTADO.CREAR',
    programadas_desactivar:'ENTREGAS_CONTROL_PROGRAMADAS_LISTADO.DESACTIVAR',
    mis_entregas_ver:'ENTREGAS_CONTROL_MIS_ENTREGAS_LISTADO.VER',
    mis_entregas_adjuntar:'ENTREGAS_CONTROL_MIS_ENTREGAS_LISTADO.ADJUNTAR_ARCHIVO',
    validacion_ver:'ENTREGAS_CONTROL_VALIDACION_LISTADO.VER',
    validacion_validar:'ENTREGAS_CONTROL_VALIDACION_LISTADO.VALIDAR',
    indicadores_ver:'ENTREGAS_CONTROL_INDICADORES_PANEL.VER'
  });

  const state={
    tab:'programadas',
    opciones:{usuarios:[],tipos_recurrencia:[]},
    opcionesLoaded:false,
    programadas:[],
    misEntregas:[],
    validacion:[],
    indicadores:null
  };

  function byId(id){return document.getElementById(id);}
  function safe(value){return String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function pct(value){return value==null?'—':`${Number(value)}%`;}
  function canPermission(code){
    if(!window.ManttoPermissions||typeof window.ManttoPermissions.can!=='function')return true;
    return window.ManttoPermissions.can(code,{defaultValue:true});
  }
  function applyPermissions(root){
    if(window.ManttoPermissions&&typeof window.ManttoPermissions.apply==='function')window.ManttoPermissions.apply(root||document);
  }
  function firstAllowedTab(){
    const candidates=[['programadas',P.programadas_ver],['mis-entregas',P.mis_entregas_ver],['validacion',P.validacion_ver],['indicadores',P.indicadores_ver]];
    const found=candidates.find(([,code])=>canPermission(code));
    return found?found[0]:null;
  }
  function formatDate(value){
    const raw=String(value||'').slice(0,10);
    const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m?`${m[3]}/${m[2]}/${m[1]}`:'—';
  }
  function formatDateTime(value){
    const raw=String(value||'').trim();
    const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?/);
    return m?`${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`:(raw||'—');
  }

  async function fetchJson(path,options){
    if(window.ManttoAuth&&typeof window.ManttoAuth.api==='function') return window.ManttoAuth.api(path,options||{method:'GET'});
    const base=(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
    const opts=options||{method:'GET'};
    const headers=Object.assign({'Accept':'application/json'},opts.headers||{});
    if(!(opts.body instanceof FormData)&&!headers['Content-Type']) headers['Content-Type']='application/json';
    const response=await fetch(base+path,Object.assign({credentials:'include'},opts,{headers}));
    const json=await response.json().catch(()=>({ok:false,message:'Respuesta no JSON'}));
    if(!response.ok||json.ok===false) throw new Error(json.message||json.error||`HTTP ${response.status}`);
    return json;
  }

  function shellHtml(){
    return '<div class="ec-page">'+
      '<section class="ec-card ec-head"><div><h1>Control de Entregas</h1><p>Programa, entrega, valida y mide el cumplimiento de reportes e información.</p></div><div id="ec-head-actions"></div></section>'+
      '<div class="ec-tabs" role="tablist">'+
        '<button class="ec-tab active" data-tab="programadas" data-permission-code="'+P.programadas_ver+'" type="button">Programadas</button>'+
        '<button class="ec-tab" data-tab="mis-entregas" data-permission-code="'+P.mis_entregas_ver+'" type="button">Mis Entregas</button>'+
        '<button class="ec-tab" data-tab="validacion" data-permission-code="'+P.validacion_ver+'" type="button">Validación</button>'+
        '<button class="ec-tab" data-tab="indicadores" data-permission-code="'+P.indicadores_ver+'" type="button">Indicadores</button>'+
      '</div>'+
      '<div id="ec-resultado"><div class="ec-status">Cargando...</div></div>'+
      '<div class="ec-modal-overlay" id="ec-form-overlay" hidden><div class="ec-modal" role="dialog" aria-modal="true">'+
        '<div class="ec-modal-head"><h2>Nueva entrega programada</h2><button class="ec-modal-close" id="ec-form-cerrar" type="button">✕</button></div>'+
        '<div class="ec-modal-body"><form id="ec-form">'+
          '<label>Colaborador<select id="ec-form-colaborador" required></select></label>'+
          '<label>Título<input id="ec-form-titulo" maxlength="255" required placeholder="Ej. Reporte semanal de cobranza"></label>'+
          '<label>Descripción<textarea id="ec-form-descripcion" rows="4" maxlength="5000" placeholder="Qué información o documento debe entregar"></textarea></label>'+
          '<label>Recurrencia<select id="ec-form-recurrencia" required></select></label>'+
          '<label>Primera fecha límite<input id="ec-form-fecha" type="date" required></label>'+
          '<div id="ec-form-error" class="ec-form-error" hidden></div>'+
          '<div class="ec-form-actions"><button class="ec-btn ec-btn-primary" id="ec-form-guardar" type="submit">Guardar</button><button class="ec-btn ec-btn-soft" id="ec-form-cancelar" type="button">Cancelar</button></div>'+
        '</form></div></div></div>'+
      '<div class="ec-modal-overlay" id="ec-detalle-overlay" hidden><div class="ec-modal ec-modal-wide" role="dialog" aria-modal="true">'+
        '<div class="ec-modal-head"><h2 id="ec-detalle-titulo">Detalle</h2><button class="ec-modal-close" id="ec-detalle-cerrar" type="button">✕</button></div>'+
        '<div class="ec-modal-body" id="ec-detalle-body"></div></div></div>'+
    '</div>';
  }

  function statusBadge(stateValue){
    const value=String(stateValue||'').toUpperCase();
    const cls=value==='A_TIEMPO'?'ec-badge-ok':value==='TARDE'?'ec-badge-warn':value==='NO_ENTREGADO'?'ec-badge-danger':'ec-badge-neutral';
    const label={A_TIEMPO:'A tiempo',TARDE:'Tarde',NO_ENTREGADO:'No entregado',PENDIENTE:'Pendiente'}[value]||value||'—';
    return `<span class="ec-badge ${cls}">${safe(label)}</span>`;
  }

  function validationBadge(value){
    const v=String(value||'').toUpperCase();
    const cls=v==='VALIDO'?'ec-badge-ok':v==='RECHAZADO'?'ec-badge-danger':v==='SIN_REVISAR'?'ec-badge-warn':'ec-badge-neutral';
    const label={VALIDO:'Válido',RECHAZADO:'Rechazado',SIN_REVISAR:'Sin revisar',NO_APLICA:'Sin archivo'}[v]||v||'—';
    return `<span class="ec-badge ${cls}">${safe(label)}</span>`;
  }

  function renderHeaderAction(){
    const host=byId('ec-head-actions');
    if(!host)return;
    host.innerHTML=state.tab==='programadas'&&canPermission(P.programadas_crear)?'<button class="ec-btn ec-btn-primary" id="ec-nuevo-btn" data-permission-code="'+P.programadas_crear+'" type="button">+ Nueva entrega programada</button>':'';
    applyPermissions(host);
    const btn=byId('ec-nuevo-btn');
    if(btn)btn.addEventListener('click',()=>openForm());
  }

  async function openForm(){
    try{
      if(!state.opcionesLoaded){
        const json=await fetchJson('/api/entregas/opciones');
        state.opciones=json.data||{usuarios:[],tipos_recurrencia:[]};
        state.opcionesLoaded=true;
      }
    }catch(error){window.alert(error.message||'No fue posible cargar las opciones de Entregas.');return;}
    const userSelect=byId('ec-form-colaborador');
    userSelect.innerHTML='<option value="">Selecciona colaborador</option>'+state.opciones.usuarios.map(u=>`<option value="${Number(u.id_SB)}">${safe(u.nombre)}${u.puesto?' · '+safe(u.puesto):''}</option>`).join('');
    const recurrence=byId('ec-form-recurrencia');
    const labels={UNICA:'Única',SEMANAL:'Semanal',QUINCENAL:'Quincenal (+15 días)',MENSUAL:'Mensual'};
    recurrence.innerHTML=state.opciones.tipos_recurrencia.map(v=>`<option value="${safe(v)}">${safe(labels[v]||v)}</option>`).join('');
    byId('ec-form').reset();
    recurrence.value='UNICA';
    byId('ec-form-error').hidden=true;
    byId('ec-form-overlay').hidden=false;
  }

  function closeForm(){const overlay=byId('ec-form-overlay');if(overlay)overlay.hidden=true;}
  function closeDetail(){const overlay=byId('ec-detalle-overlay');if(overlay)overlay.hidden=true;}

  async function saveForm(event){
    event.preventDefault();
    const errorHost=byId('ec-form-error');
    const save=byId('ec-form-guardar');
    errorHost.hidden=true;
    save.disabled=true;
    try{
      const body={
        id_colaborador:Number(byId('ec-form-colaborador').value),
        titulo:byId('ec-form-titulo').value.trim(),
        descripcion:byId('ec-form-descripcion').value.trim(),
        tipo_recurrencia:byId('ec-form-recurrencia').value,
        fecha_inicio:byId('ec-form-fecha').value
      };
      await fetchJson('/api/entregas/programadas',{method:'POST',body:JSON.stringify(body)});
      closeForm();
      await loadProgramadas();
    }catch(error){
      errorHost.textContent=error&&error.message?error.message:'No fue posible crear la entrega.';
      errorHost.hidden=false;
    }finally{save.disabled=false;}
  }

  function programadaCard(p){
    return '<article class="ec-card ec-prog-card">'+
      '<div class="ec-prog-head"><div><strong>'+safe(p.titulo)+'</strong><span class="ec-row-sub">'+safe(p.colaborador_nombre)+' · '+safe(p.tipo_recurrencia)+' · inicia '+formatDate(p.fecha_inicio)+'</span></div>'+
      '<div class="ec-prog-actions"><button class="ec-btn ec-btn-soft ec-btn-sm" data-detail="'+Number(p.id_entrega_programada)+'" type="button">Ver detalle</button>'+(canPermission(P.programadas_desactivar)?'<button class="ec-btn ec-btn-danger ec-btn-sm" data-disable="'+Number(p.id_entrega_programada)+'" data-permission-code="'+P.programadas_desactivar+'" type="button">Desactivar</button>':'')+'</div></div>'+
      '<div class="ec-prog-kpis"><span>A tiempo <b>'+pct(p.pct_a_tiempo)+'</b></span><span>General <b>'+pct(p.pct_general)+'</b></span><span>No entregado <b>'+pct(p.pct_no_entregado)+'</b></span><span>Ocurrencias <b>'+Number(p.total_instancias||0)+'</b></span></div>'+
    '</article>';
  }

  async function loadProgramadas(){
    renderHeaderAction();
    const host=byId('ec-resultado');host.innerHTML='<div class="ec-status">Cargando...</div>';
    try{
      const json=await fetchJson('/api/entregas/programadas');
      state.programadas=(json.data&&json.data.programadas)||[];
      if(!state.programadas.length){host.innerHTML='<div class="ec-card ec-status">No tienes entregas programadas activas.</div>';return;}
      host.innerHTML='<div class="ec-list-stack">'+state.programadas.map(programadaCard).join('')+'</div>';
      applyPermissions(host);
      host.querySelectorAll('[data-detail]').forEach(btn=>btn.addEventListener('click',()=>openProgramadaDetail(Number(btn.dataset.detail))));
      host.querySelectorAll('[data-disable]').forEach(btn=>btn.addEventListener('click',()=>disableProgramada(Number(btn.dataset.disable),btn)));
    }catch(error){host.innerHTML='<div class="ec-card ec-status ec-error">'+safe(error.message)+'</div>';}
  }

  async function disableProgramada(id,button){
    if(!window.confirm('¿Desactivar esta entrega programada? Las ocurrencias existentes conservarán su historial.'))return;
    button.disabled=true;
    try{await fetchJson('/api/entregas/programadas/'+encodeURIComponent(id),{method:'DELETE'});await loadProgramadas();}
    catch(error){window.alert(error.message||'No fue posible desactivar la entrega.');button.disabled=false;}
  }

  function fileButton(instance){
    if(!instance.storage_blob_name)return '<span class="ec-muted">—</span>';
    return '<button class="ec-link-btn" data-file="'+Number(instance.id_instancia)+'" type="button">'+safe(instance.nombre_archivo||'Ver archivo')+'</button>';
  }

  async function openProgramadaDetail(id){
    const overlay=byId('ec-detalle-overlay');
    byId('ec-detalle-titulo').textContent='Detalle de entrega programada';
    byId('ec-detalle-body').innerHTML='<div class="ec-status">Cargando...</div>';
    overlay.hidden=false;
    try{
      const json=await fetchJson('/api/entregas/programadas/'+encodeURIComponent(id));
      const d=json.data||{};const p=d.programada||{};const instances=d.instancias||[];
      byId('ec-detalle-titulo').textContent=p.titulo||'Detalle';
      const rows=instances.map(i=>'<tr><td>'+Number(i.numero_ocurrencia||0)+'</td><td>'+formatDate(i.fecha_limite)+'</td><td>'+statusBadge(i.estado_entrega)+'</td><td>'+validationBadge(i.estado_validacion)+'</td><td>'+formatDateTime(i.fecha_entrega_texto)+'</td><td>'+fileButton(i)+'</td></tr>').join('');
      byId('ec-detalle-body').innerHTML='<div class="ec-detail-summary"><strong>'+safe(p.colaborador_nombre)+'</strong><span>'+safe(p.descripcion||'Sin descripción')+'</span><span>'+safe(p.tipo_recurrencia)+' · primera fecha '+formatDate(p.fecha_inicio)+'</span></div>'+
        '<div class="ec-prog-kpis ec-detail-kpis"><span>A tiempo <b>'+pct(d.pct_a_tiempo)+'</b></span><span>General <b>'+pct(d.pct_general)+'</b></span><span>No entregado <b>'+pct(d.pct_no_entregado)+'</b></span></div>'+
        '<div class="ec-table-wrap"><table class="ec-table"><thead><tr><th>#</th><th>Fecha límite</th><th>Entrega</th><th>Validación</th><th>Fecha carga</th><th>Archivo</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
      byId('ec-detalle-body').querySelectorAll('[data-file]').forEach(btn=>btn.addEventListener('click',()=>viewFile(Number(btn.dataset.file))));
    }catch(error){byId('ec-detalle-body').innerHTML='<div class="ec-status ec-error">'+safe(error.message)+'</div>';}
  }

  function uploadBlock(i){
    const rejected=String(i.estado_validacion||'')==='RECHAZADO';
    const controls=canPermission(P.mis_entregas_adjuntar)?'<div class="ec-upload-inline" data-permission-code="'+P.mis_entregas_adjuntar+'"><input type="file" data-upload-input="'+Number(i.id_instancia)+'"><button class="ec-btn ec-btn-primary ec-btn-sm" data-upload="'+Number(i.id_instancia)+'" type="button">'+(i.storage_blob_name?'Reemplazar':'Entregar')+'</button></div>':'';
    return controls+(rejected?'<div class="ec-rechazo"><b>Rechazada:</b> '+safe(i.comentario_validacion||'Sin comentario')+'</div>':'');
  }

  async function loadMisEntregas(){
    renderHeaderAction();
    const host=byId('ec-resultado');host.innerHTML='<div class="ec-status">Cargando...</div>';
    try{
      const json=await fetchJson('/api/entregas/mis-entregas');
      state.misEntregas=(json.data&&json.data.instancias)||[];
      if(!state.misEntregas.length){host.innerHTML='<div class="ec-card ec-status">No tienes entregas asignadas.</div>';return;}
      host.innerHTML='<div class="ec-list-stack">'+state.misEntregas.map(i=>'<article class="ec-card ec-mi-entrega-card"><div class="ec-prog-head"><div><strong>'+safe(i.titulo)+'</strong><span class="ec-row-sub">Responsable: '+safe(i.responsable_nombre)+' · vence '+formatDate(i.fecha_limite)+'</span></div><div class="ec-row-meta">'+statusBadge(i.estado_entrega)+' '+validationBadge(i.estado_validacion)+'</div></div><div class="ec-mi-entrega-body">'+(i.storage_blob_name?'<button class="ec-link-btn" data-file="'+Number(i.id_instancia)+'" type="button">📎 '+safe(i.nombre_archivo||'Ver archivo')+'</button>':'<span class="ec-muted">Sin archivo cargado</span>')+uploadBlock(i)+'</div></article>').join('')+'</div>';
      applyPermissions(host);
      host.querySelectorAll('[data-file]').forEach(btn=>btn.addEventListener('click',()=>viewFile(Number(btn.dataset.file))));
      applyPermissions(host);
      host.querySelectorAll('[data-upload]').forEach(btn=>btn.addEventListener('click',()=>uploadInstance(Number(btn.dataset.upload),btn)));
    }catch(error){host.innerHTML='<div class="ec-card ec-status ec-error">'+safe(error.message)+'</div>';}
  }

  async function uploadInstance(id,button){
    const input=document.querySelector('[data-upload-input="'+id+'"]');
    const file=input&&input.files&&input.files[0];
    if(!file){window.alert('Selecciona un archivo.');return;}
    const form=new FormData();form.append('archivo',file,file.name);
    button.disabled=true;
    try{await fetchJson('/api/entregas/instancias/'+encodeURIComponent(id)+'/archivo',{method:'POST',body:form});await loadMisEntregas();}
    catch(error){window.alert(error.message||'No fue posible cargar el archivo.');button.disabled=false;}
  }

  async function viewFile(id){
    try{
      const json=await fetchJson('/api/entregas/instancias/'+encodeURIComponent(id)+'/archivo/acceso');
      const access=json.data||{};
      if(!access.access_url)throw new Error('El backend no devolvió acceso al archivo.');
      const opened=window.open(access.access_url,'_blank','noopener');
      if(!opened) window.location.href=access.access_url;
    }catch(error){window.alert(error.message||'No fue posible abrir el archivo.');}
  }

  async function loadValidation(){
    renderHeaderAction();
    const host=byId('ec-resultado');host.innerHTML='<div class="ec-status">Cargando...</div>';
    try{
      const json=await fetchJson('/api/entregas/validacion');
      state.validacion=(json.data&&json.data.instancias)||[];
      if(!state.validacion.length){host.innerHTML='<div class="ec-card ec-status">No tienes entregas pendientes de validación.</div>';return;}
      host.innerHTML='<div class="ec-list-stack">'+state.validacion.map(i=>'<article class="ec-card ec-validar-card"><div class="ec-prog-head"><div><strong>'+safe(i.titulo)+'</strong><span class="ec-row-sub">'+safe(i.colaborador_nombre)+' · límite '+formatDate(i.fecha_limite)+' · cargado '+formatDateTime(i.fecha_entrega_texto)+'</span></div>'+statusBadge(i.estado_entrega)+'</div><div class="ec-validar-body"><button class="ec-link-btn" data-file="'+Number(i.id_instancia)+'" type="button">📎 '+safe(i.nombre_archivo||'Ver archivo')+'</button><textarea class="ec-comentario" data-comment="'+Number(i.id_instancia)+'" maxlength="2000" placeholder="Comentario de validación (opcional)"></textarea><div class="ec-validar-botones">'+(canPermission(P.validacion_validar)?'<button class="ec-btn ec-btn-ok ec-btn-sm" data-validate="'+Number(i.id_instancia)+'" data-valid="1" data-permission-code="'+P.validacion_validar+'" type="button">✓ Válido</button><button class="ec-btn ec-btn-danger ec-btn-sm" data-validate="'+Number(i.id_instancia)+'" data-valid="0" data-permission-code="'+P.validacion_validar+'" type="button">✗ Rechazar</button>':'')+'</div></div></article>').join('')+'</div>';
      host.querySelectorAll('[data-file]').forEach(btn=>btn.addEventListener('click',()=>viewFile(Number(btn.dataset.file))));
      applyPermissions(host);
      host.querySelectorAll('[data-validate]').forEach(btn=>btn.addEventListener('click',()=>validateInstance(Number(btn.dataset.validate),btn.dataset.valid==='1',btn)));
    }catch(error){host.innerHTML='<div class="ec-card ec-status ec-error">'+safe(error.message)+'</div>';}
  }

  async function validateInstance(id,valid,button){
    const textarea=document.querySelector('[data-comment="'+id+'"]');
    button.disabled=true;
    try{
      await fetchJson('/api/entregas/instancias/'+encodeURIComponent(id)+'/validar',{method:'POST',body:JSON.stringify({valido:valid,comentario:textarea?textarea.value.trim():''})});
      await loadValidation();
    }catch(error){window.alert(error.message||'No fue posible validar la entrega.');button.disabled=false;}
  }

  async function loadIndicators(){
    renderHeaderAction();
    const host=byId('ec-resultado');host.innerHTML='<div class="ec-status">Cargando...</div>';
    try{
      const json=await fetchJson('/api/entregas/indicadores');
      const d=json.data||{};state.indicadores=d;
      const rows=(d.por_colaborador||[]).map(c=>'<tr><td>'+safe(c.nombre)+'</td><td>'+Number(c.total||0)+'</td><td>'+pct(c.pct_a_tiempo)+'</td><td>'+pct(c.pct_general)+'</td><td>'+pct(c.pct_no_entregado)+'</td></tr>').join('');
      const expired=(d.conteo?Number(d.conteo.A_TIEMPO||0)+Number(d.conteo.TARDE||0)+Number(d.conteo.NO_ENTREGADO||0):0);
      host.innerHTML='<div class="ec-grid"><div class="ec-card"><p class="ec-metric-label">Entregas vencidas</p><p class="ec-metric-value">'+expired+'</p></div><div class="ec-card"><p class="ec-metric-label">% a tiempo</p><p class="ec-metric-value ec-ok">'+pct(d.pct_a_tiempo)+'</p></div><div class="ec-card"><p class="ec-metric-label">% general</p><p class="ec-metric-value">'+pct(d.pct_general)+'</p></div><div class="ec-card"><p class="ec-metric-label">% no entregado</p><p class="ec-metric-value ec-danger">'+pct(d.pct_no_entregado)+'</p></div></div><div class="ec-card"><h2 class="ec-section-title">Por colaborador</h2>'+(rows?'<div class="ec-table-wrap"><table class="ec-table"><thead><tr><th>Colaborador</th><th>Total</th><th>A tiempo</th><th>General</th><th>No entregado</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<div class="ec-status">Sin datos.</div>')+'</div>';
    }catch(error){host.innerHTML='<div class="ec-card ec-status ec-error">'+safe(error.message)+'</div>';}
  }

  async function changeTab(tab){
    const permissionByTab={programadas:P.programadas_ver,'mis-entregas':P.mis_entregas_ver,validacion:P.validacion_ver,indicadores:P.indicadores_ver};
    if(!permissionByTab[tab]||!canPermission(permissionByTab[tab])){
      const fallback=firstAllowedTab();
      if(!fallback){byId('ec-resultado').innerHTML='<div class="ec-card ec-status">No tienes secciones autorizadas en Control de Entregas.</div>';return false;}
      tab=fallback;
    }
    state.tab=tab;
    document.querySelectorAll('.ec-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.tab===tab));
    if(tab==='programadas')return loadProgramadas();
    if(tab==='mis-entregas')return loadMisEntregas();
    if(tab==='validacion')return loadValidation();
    return loadIndicators();
  }

  async function init(){
    const view=byId('view-placeholder');
    if(!view)return false;
    view.innerHTML=shellHtml();
    const subtitle=byId('app-context-subtitle');
    if(subtitle)subtitle.textContent='Entregas · control operativo desde Aiven y Azure Blob';

    applyPermissions(view);
    document.querySelectorAll('.ec-tab').forEach(btn=>btn.addEventListener('click',()=>changeTab(btn.dataset.tab)));
    byId('ec-form-cerrar').addEventListener('click',closeForm);
    byId('ec-form-cancelar').addEventListener('click',closeForm);
    byId('ec-form-overlay').addEventListener('click',event=>{if(event.target===event.currentTarget)closeForm();});
    byId('ec-detalle-cerrar').addEventListener('click',closeDetail);
    byId('ec-detalle-overlay').addEventListener('click',event=>{if(event.target===event.currentTarget)closeDetail();});
    byId('ec-form').addEventListener('submit',saveForm);

    try{
      const initial=firstAllowedTab();
      if(!initial){
        byId('ec-resultado').innerHTML='<div class="ec-card ec-status">No tienes secciones autorizadas en Control de Entregas.</div>';
        return false;
      }
      await changeTab(initial);
      return true;
    }catch(error){
      byId('ec-resultado').innerHTML='<div class="ec-card ec-status ec-error"><strong>No fue posible cargar Entregas.</strong><span>'+safe(error.message||'Error desconocido')+'</span></div>';
      return false;
    }
  }

  if(!window.__MANTTO_ENTREGAS_ESCAPE_BOUND__){
    window.__MANTTO_ENTREGAS_ESCAPE_BOUND__=true;
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeForm();closeDetail();}});
  }

  window.ManttoEntregasControl=Object.freeze({init});
})();
