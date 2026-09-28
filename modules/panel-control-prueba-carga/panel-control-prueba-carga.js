(function(){
  'use strict';

  const MODULE_VERSION='20260928-fase5-correcciones-v001';
  const LIVE_REFRESH_MS=2000;
  const state={
    capabilities:null,
    session:null,
    recovered:false,
    busy:false,
    error:'',
    report:'',
    copyStatus:'',
    liveTimer:null
  };

  function esc(value){
    return String(value??'').replace(/[&<>"']/g,char=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[char]));
  }

  function number(value,fallback){
    const parsed=Number(value);
    return Number.isFinite(parsed)?parsed:fallback;
  }

  function api(){return window.ManttoAuth;}

  async function request(path,options){
    if(!api())throw new Error('No se encontró el servicio de autenticación.');
    return api().api(path,options||{method:'GET'});
  }

  function errorStatus(error){
    return Number(error?.status||error?.payload?.status||0);
  }

  function clearLiveTimer(){
    if(state.liveTimer){
      (window.clearTimeout||clearTimeout)(state.liveTimer);
      state.liveTimer=null;
    }
  }

  function clearLocalSession(){
    clearLiveTimer();
    state.session=null;
    state.report='';
    state.copyStatus='';
    state.recovered=false;
    if(state.capabilities&&typeof state.capabilities==='object'){
      state.capabilities={...state.capabilities,active_session:null};
    }
  }

  async function reloadCapabilities(){
    const caps=await request(`/api/panel-control/prueba-carga/capabilities?_=${Date.now()}`,{method:'GET',cache:'no-store'});
    state.capabilities=caps.data||state.capabilities;
    return state.capabilities;
  }

  async function recoverExpiredSession(){
    clearLocalSession();
    try{await reloadCapabilities();}catch(_error){/* La sesión local ya quedó liberada; capacidades se reintentan en la siguiente acción. */}
  }

  function scenarioOptions(capabilities){
    const scenarios=Array.isArray(capabilities?.scenarios)?capabilities.scenarios:[];
    return scenarios.map(item=>{
      const code=typeof item==='string'?item:String(item?.code||'');
      const label=typeof item==='string'?item:String(item?.label||item?.code||'');
      return `<option value="${esc(code)}">${esc(label)}</option>`;
    }).join('');
  }

  function fmtDate(value){
    if(!value)return 'N/D';
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return esc(value);
    return date.toLocaleString('es-MX',{dateStyle:'short',timeStyle:'medium'});
  }

  function fmtMs(value){
    if(value==null||value==='')return 'N/D';
    const parsed=Number(value);
    return Number.isFinite(parsed)?`${parsed.toFixed(parsed>=100?0:2)} ms`:'N/D';
  }

  function fmtNumber(value,digits=0){
    const parsed=Number(value);
    if(!Number.isFinite(parsed))return 'N/D';
    return parsed.toLocaleString('es-MX',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  }

  function sessionTelemetryHtml(session){
    const liveWindow=Number(state.capabilities?.telemetry?.live_window_seconds||10);
    const telemetry=session?.telemetry||{};
    const runner=telemetry.runner||{};
    const runnerLatest=runner.latest||{};
    const http=telemetry.http||{};
    const sql=telemetry.sql||{};
    const system=telemetry.system||{};
    const latest=system.latest||{};
    return `<div class="pclt-telemetry-grid">
      <div><span>VUs objetivo</span><b>${Number(session?.vus||runner.target_vus||0).toLocaleString('es-MX')}</b></div>
      <div><span>VUs activos k6</span><b>${runner.latest?Number(runnerLatest.vus_active||0).toLocaleString('es-MX'):'N/D'}</b></div>
      <div><span>Máx. VUs activos k6</span><b>${Number(runner.max_vus_active||0).toLocaleString('es-MX')}</b></div>
      <div><span>Requests activos backend</span><b>${Number(http.active||0).toLocaleString('es-MX')}</b></div>
      <div><span>RPS backend (${liveWindow} s)</span><b>${fmtNumber(http.rps_backend,2)}</b></div>
      <div><span>p95 backend (${liveWindow} s)</span><b>${fmtMs(http.latency_recent?.p95_ms)}</b></div>
      <div><span>HTTP terminados</span><b>${Number(http.completed||0).toLocaleString('es-MX')}</b></div>
      <div><span>Errores HTTP backend</span><b>${Number(http.errors||0).toLocaleString('es-MX')}</b></div>
      <div><span>Queries</span><b>${Number(sql.completed||0).toLocaleString('es-MX')}</b></div>
      <div><span>Queries lentas</span><b>${Number(sql.slow_queries||0).toLocaleString('es-MX')}</b></div>
      <div><span>CPU Node</span><b>${latest.node?.cpu_percent==null?'N/D':`${esc(latest.node.cpu_percent)} %`}</b></div>
      <div><span>MySQL running</span><b>${latest.mysql?.Threads_running??'N/D'}</b></div>
    </div>`;
  }

  function activeSessionFromCapabilities(capabilities){
    const active=capabilities?.active_session||null;
    if(!active||active.state==='BUSY')return active;
    return active;
  }

  function syncRecoveredSession(capabilities){
    const active=activeSessionFromCapabilities(capabilities);
    if(state.session)return;
    if(active&&active.id){
      state.session=active;
      state.recovered=true;
    }
  }

  function runtimeWarning(runtime){
    if(runtime?.ready)return '';
    const messages=[];
    if(!runtime?.single_instance_confirmed)messages.push('V001 requiere confirmar una sola réplica / un solo proceso backend.');
    if(!runtime?.target_configured)messages.push('Falta configurar el origen autorizado del backend para el runner.');
    return messages.join(' ');
  }

  function runnerCommand(session){
    if(!session?.id)return '';
    return `powershell -ExecutionPolicy Bypass -File .\\scripts\\load-test\\iniciar-mantto-load-test.ps1 -SessionId "${String(session.id).replace(/"/g,'')}"`;
  }

  function isActiveState(session){
    return ['LISTA','EJECUTANDO','FINALIZANDO'].includes(String(session?.state||''));
  }

  function needsPolling(session){
    return isActiveState(session)||String(session?.completion_integrity||'')==='PENDIENTE_RESUMEN';
  }

  function terminalMessage(session){
    const stateName=String(session?.state||'');
    if(stateName==='ABORTADA_MANUAL')return 'El runner confirmó la detención solicitada por el operador.';
    if(stateName==='ABORTADA_AUTOMATICA')return `La protección automática detuvo la ejecución: ${esc(session?.stop_reason||'sin motivo')}.`;
    if(stateName==='ABORTADA_RUNNER')return `El runner abortó la ejecución por seguridad: ${esc(session?.stop_reason||'sin motivo')}.`;
    if(stateName==='ABORTADA_SIN_CONFIRMACION')return 'El runner no confirmó el cierre dentro del plazo. El reporte queda marcado como INCOMPLETO.';
    if(stateName==='FINALIZADA')return session?.completion_integrity==='PENDIENTE_RESUMEN'?'La ejecución terminó. Esperando el resumen final de k6.':'La ejecución terminó y el reporte final está disponible.';
    return '';
  }

  function render(container,capabilities){
    if(!container)return false;
    clearLiveTimer();
    state.capabilities=capabilities||state.capabilities||{};
    syncRecoveredSession(state.capabilities);

    const limits=state.capabilities?.limits||{};
    const telemetry=state.capabilities?.telemetry||{};
    const runtime=state.capabilities?.runner_runtime||{};
    const minVus=Math.max(1,number(limits.min_vus,10));
    const stepVus=Math.max(1,number(limits.step_vus,10));
    const configuredMax=Math.max(minVus,number(limits.max_vus_configured,200));
    const defaultDuration=Math.max(1,number(limits.duration_default_seconds,120));
    const maxDuration=Math.max(defaultDuration,number(limits.duration_max_seconds,300));
    const canExecute=Boolean(state.capabilities?.permissions?.execute&&state.capabilities?.execution_available);
    const canStop=Boolean(state.capabilities?.permissions?.stop&&state.capabilities?.stop_control_available);
    const active=state.capabilities?.active_session;
    const busyByOther=Boolean(active&&active.state==='BUSY');
    const session=state.session;
    const sessionRunning=session?.state==='EJECUTANDO';
    const sessionFinalizing=session?.state==='FINALIZANDO';
    const sessionActive=isActiveState(session);
    const sessionAwaitingSummary=String(session?.completion_integrity||'')==='PENDIENTE_RESUMEN';
    const warning=runtimeWarning(runtime);
    const finalMessage=terminalMessage(session);

    container.innerHTML=`<section class="pclt-page" id="pclt-root" data-module-version="${MODULE_VERSION}">
      <div class="pclt-head">
        <div>
          <span class="pclt-eyebrow">DIAGNÓSTICO · PANEL DE CONTROL</span>
          <h2>Prueba de Carga</h2>
          <p>Prueba temporal de concurrencia contra Mantto Gestor con control real del runner y métricas en vivo separadas por origen.</p>
        </div>
        <span class="pclt-phase">FASE 5 · REPORTE FINAL EFÍMERO</span>
      </div>

      <div class="pclt-notice">
        <b>Escalabilidad abierta</b>
        <span>Máximo operativo actual: ${configuredMax.toLocaleString('es-MX')} VUs. Es configuración del entorno, no un límite duro del código.</span>
      </div>

      ${warning?`<div class="pclt-alert warning"><b>Runner bloqueado por configuración.</b><span>${esc(warning)}</span></div>`:''}
      ${state.error?`<div class="pclt-alert error"><b>No se pudo completar la acción.</b><span>${esc(state.error)}</span></div>`:''}
      ${busyByOther?'<div class="pclt-alert warning"><b>Servidor ocupado</b><span>Otro operador tiene una sesión preparada, ejecutándose o finalizando. V001 permite una sola prueba activa.</span></div>':''}

      <div class="pclt-grid">
        <article class="pclt-card">
          <div class="pclt-card-head"><span>Preparar sesión</span><em>Solo RAM</em></div>
          <label>Escenario<select id="pclt-scenario" ${session||busyByOther?'disabled':''}>${scenarioOptions(state.capabilities)}</select></label>
          <label>Usuarios concurrentes<input id="pclt-vus" type="number" min="${minVus}" max="${configuredMax}" step="${stepVus}" value="${minVus}" ${session||busyByOther?'disabled':''}></label>
          <label>Duración<select id="pclt-duration" ${session||busyByOther?'disabled':''}>
            ${[30,60,120,180,300].filter(v=>v<=maxDuration).map(v=>`<option value="${v}" ${v===defaultDuration?'selected':''}>${v} s</option>`).join('')}
          </select></label>
          <button type="button" class="pclt-btn primary" id="pclt-prepare" ${!canExecute||session||busyByOther||state.busy?'disabled':''}>${state.busy?'Procesando...':'Preparar prueba'}</button>
          <small>La carga funcional sigue siendo exclusivamente GET/HEAD. El token del runner no llega a la pantalla ni se persiste.</small>
        </article>

        <article class="pclt-card">
          <div class="pclt-card-head"><span>Capacidades</span><em>Fase 5</em></div>
          <dl class="pclt-kv">
            <div><dt>Acceso visual</dt><dd>${state.capabilities?.permissions?.access?'AUTORIZADO':'NO'}</dd></div>
            <div><dt>Preparar / ejecutar</dt><dd>${canExecute?'AUTORIZADO':'BLOQUEADO'}</dd></div>
            <div><dt>Detención real k6</dt><dd>${canStop?'DISPONIBLE':'BLOQUEADA'}</dd></div>
            <div><dt>Una sola instancia</dt><dd>${runtime?.single_instance_confirmed?'CONFIRMADA':'NO CONFIRMADA'}</dd></div>
            <div><dt>Target autorizado</dt><dd>${runtime?.target_configured?'CONFIGURADO':'NO CONFIGURADO'}</dd></div>
            <div><dt>Máximo operativo actual</dt><dd>${configuredMax.toLocaleString('es-MX')} VUs</dd></div>
            <div><dt>Límite duro del código</dt><dd>${limits.hard_max_vus==null?'NINGUNO':esc(limits.hard_max_vus)}</dd></div>
            <div><dt>Timeout finalización</dt><dd>${Number(telemetry.finalization_timeout_seconds||20)} s</dd></div>
            <div><dt>Timeout resumen k6</dt><dd>${Number(telemetry.summary_timeout_seconds||15)} s</dd></div>
            <div><dt>Persistencia</dt><dd>NINGUNA</dd></div>
          </dl>
        </article>
      </div>

      ${session?`<article class="pclt-session-card">
        <div class="pclt-session-head">
          <div><span class="pclt-eyebrow">SESIÓN TEMPORAL</span><h3>${esc(session.id)}</h3><p>${esc(session.scenario)} · ${Number(session.vus||0).toLocaleString('es-MX')} VUs objetivo · ${Number(session.duration_seconds||0)} s</p></div>
          <span class="pclt-state ${String(session.state||'').toLowerCase()}">${esc(session.state||'N/D')}</span>
        </div>
        ${state.recovered?'<div class="pclt-alert warning"><b>Sesión recuperada después de recargar.</b><span>La sesión sigue en RAM del backend. El token del runner nunca estuvo en la pantalla.</span></div>':''}
        <div class="pclt-alert ${session.runner_claimed?'ok':'warning'}"><b>Runner claim: ${session.runner_claimed?'CONSUMIDO':'PENDIENTE'}</b><span>${session.runner_claimed?'El claim de un solo uso fue consumido y el backend conserva únicamente el hash del token efímero.':'Ejecuta el launcher externo para consumir el claim de un solo uso.'}</span></div>
        ${session.state==='LISTA'?`<div class="pclt-alert ok"><b>Comando sin secretos</b><span><code>${esc(runnerCommand(session))}</code></span></div>`:''}
        ${sessionFinalizing?'<div class="pclt-alert warning"><b>Detención solicitada</b><span>El backend ordenó al runner abortar. Se esperan las solicitudes ya iniciadas y la confirmación del cierre.</span></div>':''}
        ${finalMessage?`<div class="pclt-alert ${session.state==='FINALIZADA'?'ok':'warning'}"><b>${esc(session.state)}</b><span>${finalMessage}</span></div>`:''}
        <div class="pclt-session-meta"><span>Creada: <b>${fmtDate(session.created_at)}</b></span><span>Inicio: <b>${fmtDate(session.started_at)}</b></span><span>Expira/vence: <b>${fmtDate(session.expires_at)}</b></span></div>
        ${sessionTelemetryHtml(session)}
        ${session.completion_integrity?`<div class="pclt-alert ${session.completion_integrity==='COMPLETO'?'ok':session.completion_integrity==='INCOMPLETO'?'warning':'warning'}"><b>Integridad: ${esc(session.completion_integrity)}</b><span>${session.completion_integrity==='PENDIENTE_RESUMEN'?'Esperando handleSummary() de k6.':session.completion_integrity==='INCOMPLETO'?`Reporte parcial disponible. Motivo: ${esc(session.report_incomplete_reason||session.stop_reason||'resumen k6 no disponible')}.`:'Resumen k6 recibido una sola vez y reporte construido en RAM.'}</span></div>`:''}
        ${state.report?`<div class="pclt-report-wrap"><div class="pclt-card-head"><span>Reporte final</span><em>Texto temporal · no se guarda</em></div><textarea class="pclt-report" id="pclt-report" readonly>${esc(state.report)}</textarea></div>`:''}
        <div class="pclt-actions">
          <button type="button" class="pclt-btn" id="pclt-refresh" ${state.busy?'disabled':''}>Actualizar estado</button>
          ${sessionRunning?`<button type="button" class="pclt-btn danger" id="pclt-stop" ${!canStop||state.busy?'disabled':''}>DETENER PRUEBA</button>`:''}
          ${state.report?`<button type="button" class="pclt-btn primary" id="pclt-copy" ${state.busy?'disabled':''}>Copiar reporte</button>`:''}
          <button type="button" class="pclt-btn ghost" id="pclt-clear" ${sessionActive||sessionAwaitingSummary||!state.capabilities?.permissions?.execute||state.busy?'disabled':''}>Limpiar sesión</button>
        </div>
        ${state.copyStatus?`<div class="pclt-alert ok"><b>${esc(state.copyStatus)}</b></div>`:''}
        ${sessionRunning?'<div class="pclt-footer-note">VUs activos proviene del runner k6. Requests activos, RPS y p95 están calculados por el backend Express; no se presentan como métricas equivalentes.</div>':''}
      </article>`:''}

      <div class="pclt-footer-note">Fase 5 recibe <code>handleSummary()</code> una sola vez, construye el reporte en RAM y permite copiarlo. Si el resumen no llega, el reporte se marca INCOMPLETO. No existe historial ni persistencia.</div>
    </section>`;

    bind(container);
    scheduleLiveRefresh(container);
    return true;
  }

  function rerender(container){render(container,state.capabilities);}

  async function prepare(container){
    const scenario=document.getElementById('pclt-scenario')?.value||'';
    const vus=Number(document.getElementById('pclt-vus')?.value||0);
    const duration=Number(document.getElementById('pclt-duration')?.value||0);
    state.busy=true;state.error='';rerender(container);
    try{
      const response=await request('/api/panel-control/prueba-carga/session',{
        method:'POST',
        body:JSON.stringify({scenario,vus,duration_seconds:duration})
      });
      state.session=response.data?.session||null;
      state.report='';
      state.copyStatus='';
      state.recovered=false;
      await reloadCapabilities();
    }catch(error){
      state.error=error?.message||'No fue posible preparar la sesión temporal.';
    }finally{
      state.busy=false;rerender(container);
    }
  }

  async function fetchReport({silent=false}={}){
    if(!state.session?.id||!state.session?.report_available)return false;
    try{
      const response=await request(`/api/panel-control/prueba-carga/session/${encodeURIComponent(state.session.id)}/report?_=${Date.now()}`,{method:'GET',cache:'no-store'});
      state.report=String(response?.data?.report||'');
      return Boolean(state.report);
    }catch(error){
      if(errorStatus(error)===404){await recoverExpiredSession();return false;}
      if(errorStatus(error)===409)return false;
      if(!silent)state.error=error?.message||'No fue posible obtener el reporte final.';
      return false;
    }
  }

  async function readSession({silent=false}={}){
    if(!state.session?.id)return false;
    try{
      const response=await request(`/api/panel-control/prueba-carga/session/${encodeURIComponent(state.session.id)}?_=${Date.now()}`,{method:'GET',cache:'no-store'});
      state.session=response.data||null;
      if(state.session?.report_available&&!state.report)await fetchReport({silent:true});
      return true;
    }catch(error){
      if(errorStatus(error)===404){
        await recoverExpiredSession();
        return false;
      }
      if(!silent)state.error=error?.message||'No fue posible actualizar la sesión.';
      return false;
    }
  }

  async function refresh(container){
    if(!state.session?.id)return;
    state.busy=true;state.error='';rerender(container);
    await readSession({silent:false});
    state.busy=false;rerender(container);
  }

  async function stop(container){
    if(!state.session?.id||state.session.state!=='EJECUTANDO')return;
    state.busy=true;state.error='';rerender(container);
    try{
      const response=await request(`/api/panel-control/prueba-carga/session/${encodeURIComponent(state.session.id)}/stop`,{
        method:'POST',
        body:JSON.stringify({reason:'UI_MANUAL_STOP'})
      });
      state.session=response.data||state.session;
      await reloadCapabilities();
    }catch(error){
      if(errorStatus(error)===404)await recoverExpiredSession();
      else state.error=error?.message||'No fue posible solicitar la detención real del runner.';
    }finally{
      state.busy=false;rerender(container);
    }
  }

  async function clear(container){
    if(!state.session?.id)return;
    state.busy=true;state.error='';rerender(container);
    try{
      await request(`/api/panel-control/prueba-carga/session/${encodeURIComponent(state.session.id)}`,{method:'DELETE'});
      clearLocalSession();
      try{await reloadCapabilities();}catch(_error){/* La limpieza local queda completada aunque falle este refresco. */}
    }catch(error){
      if(errorStatus(error)===404){
        await recoverExpiredSession();
      }else{
        state.error=error?.message||'No fue posible limpiar la sesión.';
      }
    }
    finally{state.busy=false;rerender(container);}
  }

  function scheduleLiveRefresh(container){
    clearLiveTimer();
    if(!needsPolling(state.session))return;
    state.liveTimer=(window.setTimeout||setTimeout)(async()=>{
      state.liveTimer=null;
      if(!document.getElementById('pclt-root'))return;
      await readSession({silent:true});
      if(document.getElementById('pclt-root'))rerender(container);
    },LIVE_REFRESH_MS);
  }

  async function copyReport(container){
    if(!state.report)return;
    state.copyStatus='';
    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(state.report);
      }else{
        const area=document.getElementById('pclt-report');
        if(!area)throw new Error('No se encontró el reporte.');
        area.focus();area.select();
        if(!document.execCommand('copy'))throw new Error('El navegador no permitió copiar.');
      }
      state.copyStatus='Reporte copiado al portapapeles.';
    }catch(error){
      state.error=error?.message||'No fue posible copiar el reporte.';
    }
    rerender(container);
  }

  function bind(container){
    document.getElementById('pclt-prepare')?.addEventListener('click',()=>prepare(container));
    document.getElementById('pclt-refresh')?.addEventListener('click',()=>refresh(container));
    document.getElementById('pclt-stop')?.addEventListener('click',()=>stop(container));
    document.getElementById('pclt-copy')?.addEventListener('click',()=>copyReport(container));
    document.getElementById('pclt-clear')?.addEventListener('click',()=>clear(container));
  }

  window.ManttoPanelControlPruebaCarga={
    render,
    version:MODULE_VERSION,
    getPreparedSession(){return state.session?{session:{...state.session}}:null;}
  };
})();
