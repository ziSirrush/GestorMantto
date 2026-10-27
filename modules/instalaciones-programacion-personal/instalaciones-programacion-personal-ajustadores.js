'use strict';

// [BLT NOW | 2026-10-27 | INT9 AJUSTADORES FASE 4]
// Complemento visual acotado para F1/F2/F3. No genera asignaciones al leer.
// Se monta sobre el calendario existente y se carga solo al entrar al modulo.
(function () {
  const ROUTE = 'instalaciones-programacion-personal';
  const ROOT = 'view-instalaciones-programacion-personal';
  const PERMISSION = 'INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO_PROGRAMACION';
  const BASE = '/api/instalaciones/programacion/ajustadores';
  const PAGE_SIZE = 50;
  const model = {epoch:0, items:[], cursor:null, more:false, loading:false, writing:false,
    loaded:false, feedback:'', error:false, observed:null};

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function dateLabel(value) {
    const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    return match ? `${match[3]}/${match[2]}/${match[1]}` : '—';
  }
  function scopePermission(action) {
    const state=window.ManttoPermissions?.state?.(`${PERMISSION}.${action}`);
    return state?.exists===true && state.efectivo===true;
  }
  function readAllowed() { return scopePermission('VER'); }
  function writeAllowed(action) {
    return readAllowed() && scopePermission(action) &&
      window.ManttoAuth?.isViewingAs?.() !== true;
  }
  function operationFor(row) {
    if (row?.estado !== 'VINCULABLE' || !Number.isSafeInteger(Number(row.id_ins_fl)) ||
      Number(row.id_ins_fl)<1) return null;
    if (writeAllowed('CREAR') && writeAllowed('DESACTIVAR')) return 'reconciliar';
    if (writeAllowed('CREAR')) return 'asignar';
    return null;
  }
  const STATES=Object.freeze({
    VINCULABLE:'Coincidencia válida',
    AMBIGUO:'Referencia ambigua',
    SIN_COINCIDENCIA:'No coincide con el catálogo',
    SIN_FECHAS_VALIDAS:'Revisar fechas',
    SIN_REFERENCIA:'Sin referencia'
  });
  function stateLabel(code) { return STATES[code] || 'Requiere revisión'; }
  function resultMessage(result) {
    const status=String(result?.estado || '');
    if (status==='ASIGNADO') return `${result.creadas?.length || 0} asignación(es) creada(s).`;
    if (status==='SINCRONIZADO') return `${Number(result.creadas)||0} creada(s), ${Number(result.retiradas)||0} retirada(s).`;
    if (status==='SIN_CAMBIOS') return 'La programación ya coincide; sin modificaciones.';
    if (status==='CONFLICTO') return 'Conflicto de fechas detectado. No se modificó el equipo.';
    if (status==='REQUIERE_REVISION') return `Revisión requerida (${String(result.motivo || 'referencia/fechas')}). No se modificó el equipo.`;
    return 'Operación respondida; revisa el estado del equipo.';
  }
  function validPage(payload, previousCursor) {
    if (!payload || !Array.isArray(payload.registros) || payload.registros.length>PAGE_SIZE) {
      throw new Error('La respuesta de vinculaciones no tiene el formato esperado.');
    }
    const seen=new Set();
    let last=Number(previousCursor)||0;
    for (const row of payload.registros) {
      const id=Number(row?.id_ins_fl);
      if (!Number.isSafeInteger(id) || id<=last || seen.has(id)) {
        throw new Error('El servidor devolvió referencias repetidas o desordenadas.');
      }
      seen.add(id);last=id;
    }
    const more=payload.hay_mas===true;
    const cursor=more ? Number(payload.siguiente_cursor) : null;
    if (more && (!Number.isSafeInteger(cursor)||cursor!==last)) {
      throw new Error('Cursor de paginación inválido.');
    }
    return {rows:payload.registros,cursor,more};
  }
  function root() { return document.getElementById(ROOT); }
  function panel() { return root()?.querySelector('#ppc-aj-auto') || null; }
  function selected() {
    const app=root();
    return window.ManttoRouter?.getCurrent?.()?.route===ROUTE && readAllowed() &&
      Boolean(app?.querySelector('[data-ppc="tipo"][data-tipo="AJUSTADOR"].active')) &&
      Boolean(app?.querySelector('[data-ppc="seccion"][data-vista="calendario"].active'));
  }
  async function api(path, method='GET', body) {
    const auth=window.ManttoAuth;
    if (typeof auth?.api !== 'function') throw new Error('Se necesita una sesión válida.');
    const response=await auth.api(BASE+path, {
      method,
      ...(body===undefined?{}:{body:JSON.stringify(body)})
    });
    return response?.data;
  }
  function reset(clearDom=true) {
    model.epoch++;model.items=[];model.cursor=null;model.more=false;
    model.loaded=false;model.loading=false;model.writing=false;
    model.feedback='';model.error=false;
    if (clearDom) {
      const box=panel();
      if (box) {
        const results=box.querySelector('[data-aj-results]');
        if (results) results.replaceChildren();
        const footer=box.querySelector('[data-aj-footer]');
        if (footer) footer.replaceChildren();
        const status=box.querySelector('[data-aj-status]');
        if (status) status.textContent='Consulta opcional: no crea asignaciones por sí sola.';
      }
    }
  }
  function ensurePanel() {
    const app=root(),anchor=app?.querySelector('#ppc-calendario');
    if (!anchor) return null;
    let box=panel();
    if (!box) {
      box=document.createElement('section');
      box.id='ppc-aj-auto';
      box.className='ppc-card ppc-aj-auto';
      box.hidden=true;
      box.setAttribute('aria-label','Vinculación automática de ajustadores');
      box.innerHTML=`<details class="ppc-aj-auto-details">
        <summary>Vinculación automática de ajustadores <small>desde ins_fl</small></summary>
        <div class="ppc-aj-auto-content">
          <p class="ppc-cal-note">Revisa las coincidencias entre el reporte de Instalaciones y el catálogo. Las fechas se heredan de ins_fl. No se asigna personal al consultar.</p>
          <div class="ppc-aj-auto-toolbar">
            <button type="button" class="ppc-btn ppc-small" data-aj-action="consultar">Consultar / Actualizar</button>
            <span data-aj-status role="status" aria-live="polite">Consulta opcional: no crea asignaciones por sí sola.</span>
          </div>
          <div class="ppc-aj-auto-results" data-aj-results></div>
          <div class="ppc-aj-auto-footer" data-aj-footer></div>
        </div>
      </details>`;
      anchor.insertAdjacentElement('afterend',box);
    }
    return box;
  }
  function renderRows() {
    const box=panel();if (!box) return;
    const target=box.querySelector('[data-aj-results]');
    const footer=box.querySelector('[data-aj-footer]');
    const status=box.querySelector('[data-aj-status]');
    if (!target||!footer||!status) return;
    status.textContent=model.feedback || (model.loaded
      ? `${model.items.length} equipo(s) consultados. Los resultados no equivalen a asignaciones confirmadas.`
      : 'Consulta opcional: no crea asignaciones por sí sola.');
    status.classList.toggle('ppc-error',model.error);
    box.querySelector('[data-aj-action="consultar"]').disabled=model.loading||model.writing;
    if (!model.loaded && !model.loading) {
      target.replaceChildren();footer.replaceChildren();return;
    }
    const rows=model.items.map(row=>{
      const id=Number(row.id_ins_fl);
      const op=operationFor(row);
      const names=Array.isArray(row.personas)&&row.personas.length
        ? row.personas.map(p=>escapeHtml(p.nombre)).join(', '):'—';
      const statusClass=row.estado==='VINCULABLE'?'ok':'review';
      const date=`${dateLabel(row.inicio)} – ${dateLabel(row.fin)}`;
      return `<tr>
        <td>${escapeHtml(row.proyecto)}<small>${escapeHtml(row.referencia_sitio)}</small></td>
        <td>${escapeHtml(row.ajustador_origen)}<small>${names}</small></td>
        <td>${escapeHtml(date)}</td>
        <td><span class="ppc-aj-status ppc-aj-status-${statusClass}">${escapeHtml(stateLabel(row.estado))}</span></td>
        <td>${op ? `<button type="button" class="ppc-btn ppc-small" data-aj-action="${op}" data-equipo="${id}" ${model.writing?'disabled':''}>${op==='reconciliar'?'Sincronizar':'Asignar'}</button>` : '—'}</td>
      </tr>`;
    }).join('');
    target.innerHTML=model.items.length
      ? `<div class="ppc-table-scroll ppc-aj-auto-scroll"><table class="ppc-table"><thead><tr><th>Equipo</th><th>Ajustador / Catálogo</th><th>Periodo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : (model.loading ? '<p class="ppc-cal-note">Consultando referencias…</p>' : '<p class="ppc-cal-note">No hay referencias de ajustadores en los equipos consultables.</p>');
    footer.innerHTML=model.more && model.loaded
      ? `<button type="button" class="ppc-btn ppc-small" data-aj-action="mas" ${model.loading||model.writing?'disabled':''}>Ver siguientes ${PAGE_SIZE}</button>` : '';
  }
  async function loadPage(next=false) {
    if (!selected()||model.loading||model.writing) return;
    const box=ensurePanel();if(!box)return;
    const epoch=++model.epoch;
    const cursor=next?model.cursor:null;
    if (!next) {model.items=[];model.cursor=null;model.more=false;}
    model.loading=true;model.error=false;
    model.feedback='Consultando coincidencias de ajustadores…';renderRows();
    try {
      const params=new URLSearchParams({limit:String(PAGE_SIZE)});
      if(cursor!=null)params.set('cursor',String(cursor));
      const result=validPage(await api('/vinculaciones?'+params.toString()),cursor);
      if(epoch!==model.epoch||!selected())return;
      model.items=next?[...model.items,...result.rows]:result.rows;
      model.more=result.more;model.cursor=result.cursor;model.loaded=true;
      model.feedback='';
    }catch(error){
      if(epoch!==model.epoch)return;
      model.error=true;model.feedback=error?.message||'No fue posible consultar vinculaciones.';
    }finally{
      if(epoch===model.epoch){model.loading=false;renderRows();}
    }
  }
  async function perform(rowId,action) {
    if(!selected()||model.writing||model.loading)return;
    const row=model.items.find(x=>Number(x.id_ins_fl)===rowId);
    if(!row||operationFor(row)!==action)return;
    const box=panel();if(!box)return;
    // La decisión de crear/retirar se valida exclusivamente en el backend.
    if(action==='reconciliar' && typeof window.confirm==='function' &&
      !window.confirm('Sincronizar este equipo con ins_fl? Solo se retirarán asignaciones automáticas no editadas.'))return;
    model.writing=true;model.feedback='Actualizando programación…';model.error=false;renderRows();
    try {
      const endpoint=action==='reconciliar'?'/reconciliar':'/asignaciones-automaticas';
      const outcome=await api(endpoint,'POST',{id_ins_fl:rowId});
      const detail=resultMessage(outcome);
      // Consistencia tras mutación: actualizar de inmediato el calendario real.
      const app=window.ManttoInstalacionesProgramacionPersonal;
      if(selected() && typeof app?.reload==='function') await app.reload();
      if(!selected()) {reset();return;}
      // La vista previa debe leer nuevamente el estado canónico de Aiven.
      model.writing=false;
      await loadPage(false);
      if(selected()) {model.feedback=detail;model.error=outcome?.estado==='CONFLICTO'||outcome?.estado==='REQUIERE_REVISION';renderRows();}
    }catch(error){
      if(selected()){model.error=true;model.feedback=error?.message||'No fue posible guardar la programación.';}
    }finally{model.writing=false;if(selected())renderRows();}
  }
  function show() {
    const box=ensurePanel();if(!box)return;
    const active=selected();
    if(!active){
      if(!box.hidden)reset();
      box.hidden=true;
    }else{
      box.hidden=false;
      renderRows();
    }
  }
  function handleClick(event) {
    const app=root();if(!app||!app.contains(event.target))return;
    const button=event.target?.closest?.('[data-aj-action]');
    if(button && app.contains(button)) {
      if(button.disabled)return;
      const action=button.dataset.ajAction;
      if(action==='consultar')loadPage(false);
      else if(action==='mas' && model.more && model.cursor!=null)loadPage(true);
      else if(action==='reconciliar'||action==='asignar'){
        const id=Number(button.dataset.equipo);
        if(Number.isSafeInteger(id)&&id>0)perform(id,action);
      }
      return;
    }
    const trigger=event.target?.closest?.('[data-ppc="tipo"],[data-ppc="seccion"],[data-ppc="actualizar"]');
    if(trigger) {
      const refresh=trigger.dataset.ppc==='actualizar';
      queueMicrotask(()=>{
        show();
        if(refresh && selected() && model.loaded)loadPage(false);
      });
    }
  }
  function boot() {
    const app=root();if(!app)return;
    if(model.observed!==app){
      model.observed=app;
      app.addEventListener('click',handleClick);
      if(typeof MutationObserver==='function'){
        const observer=new MutationObserver(show);
        observer.observe(app,{childList:true});
      }
    }
    show();
  }
  function sessionChange(){reset();const box=panel();if(box)box.hidden=true;}
  document.addEventListener('mantto:module-loaded',event=>{
    if(event?.detail?.route===ROUTE)boot();
  });
  document.addEventListener('mantto:navigation',boot);
  document.addEventListener('mantto:auth-ready',()=>{sessionChange();show();});
  document.addEventListener('mantto:session-expired',sessionChange);
  document.addEventListener('mantto:view-user-changed',()=>{sessionChange();show();});
  document.addEventListener('mantto:permissions-updated',()=>{sessionChange();show();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
  window.ManttoInstalacionesAjustadoresUI=Object.freeze({boot,reset});
  if(typeof module==='object' && module.exports) {
    module.exports={_test:{escapeHtml,dateLabel,stateLabel,resultMessage,validPage}};
  }
})();
