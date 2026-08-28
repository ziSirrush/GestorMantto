(function(){
  const API_BASE = (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  const AUTH_API_BASE = (window.MANTTO_SESSION_API_BASE || API_BASE).replace(/\/$/, '');
  const TOKEN_KEY = 'mantto_token';
  const USER_KEY = 'mantto_user';
  const SESSION_KEY = 'mantto_session';
  const SESSION_CSRF_KEY = 'mantto_session_csrf';
  const VIEW_USER_KEY = 'mantto_view_user';
  const VIEWER_TOKEN_KEY = 'mantto_viewer_token';
  const VIEWER_LAUNCH_PREFIX = 'mantto:viewer:launch:';
  const VIEWER_LAUNCH_PARAM = 'viewer_launch';
  const VIEWER_LAUNCH_TTL_MS = 60000;
  const ACCESS_TOKEN_LIFETIME_MS = 12 * 60 * 60 * 1000;
  const ACCESS_TOKEN_REFRESH_LEEWAY_MS = 5 * 60 * 1000;
  const SESSION_REFRESH_RETRY_MS = 60 * 1000;
  const state = { token: null, user: null, viewUser: null, pendingUser: null, recoveryToken: null, expiringSession: false, lastSessionRefreshAt: 0 };
  let refreshPromise = null;
  let refreshTimer = null;

  function $(id){ return document.getElementById(id); }
  function msg(id, text, type){ const el=$(id); if(!el) return; el.textContent=text||''; el.className='auth-msg ' + (type||''); }
  function show(el, yes){ if(!el) return; el.classList.toggle('hidden', !yes); }
  function setForm(name){
    ['login-form','first-login-form','recovery-form'].forEach(id=>show($(id), id===name));
  }
  function getToken(){ return state.token || sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''; }
  function getActorUser(){ return state.user || safeJson(sessionStorage.getItem(USER_KEY)) || safeJson(localStorage.getItem(USER_KEY)); }
  function jwtPayload(token){
    try{
      const payloadPart=String(token||'').split('.')[1]||'';
      if(!payloadPart) return null;
      const normalized=payloadPart.replace(/-/g,'+').replace(/_/g,'/');
      const padded=normalized+'='.repeat((4-normalized.length%4)%4);
      return JSON.parse(window.atob(padded));
    }catch(_error){ return null; }
  }
  function jwtExpiryMs(token){
    return Number(jwtPayload(token)?.exp||0)*1000;
  }
  function jwtIssuedAtMs(token){
    return Number(jwtPayload(token)?.iat||0)*1000;
  }
  function jwtAbsoluteExpiryMs(token){
    return Number(jwtPayload(token)?.session_absolute_expires_at||0)*1000;
  }
  function tokenRefreshDueAt(token){
    const expiresAt=jwtExpiryMs(token);
    const absoluteExpiresAt=jwtAbsoluteExpiryMs(token);
    if(expiresAt){
      // El último JWT queda limitado por el vencimiento absoluto. En ese caso
      // no se intenta extenderlo: al llegar a los 90 días el refresh debe fallar
      // y solicitar un inicio de sesión nuevo.
      if(absoluteExpiresAt && expiresAt>=absoluteExpiresAt-1000) return expiresAt+250;
      return expiresAt-ACCESS_TOKEN_REFRESH_LEEWAY_MS;
    }
    const issuedAt=jwtIssuedAtMs(token);
    return (issuedAt||Date.now())+ACCESS_TOKEN_LIFETIME_MS-ACCESS_TOKEN_REFRESH_LEEWAY_MS;
  }
  function clearRefreshTimer(){
    if(refreshTimer!==null) window.clearTimeout(refreshTimer);
    refreshTimer=null;
  }
  function scheduleSessionRefresh(token, delayOverride){
    clearRefreshTimer();
    const cleanToken=String(token||'').trim();
    if(!cleanToken) return;
    const delay=delayOverride===undefined
      ? Math.max(0,tokenRefreshDueAt(cleanToken)-Date.now())
      : Math.max(0,Number(delayOverride)||0);
    refreshTimer=window.setTimeout(runScheduledSessionRefresh,delay);
  }
  function persistActorSession(token,user,marker){
    const cleanToken=String(token||'').trim();
    if(!cleanToken) return;
    const sessionUser=user||null;
    const expiresAt=jwtExpiryMs(cleanToken);
    localStorage.setItem(TOKEN_KEY,cleanToken);
    if(sessionUser) localStorage.setItem(USER_KEY,JSON.stringify(sessionUser));
    localStorage.setItem(SESSION_KEY,JSON.stringify({
      token:cleanToken,
      user:sessionUser,
      persisted_at:new Date().toISOString(),
      expires_at:expiresAt||null,
      session_absolute_expires_at:jwtAbsoluteExpiryMs(cleanToken)||null,
      marker:marker||'persisted'
    }));
  }
  function readPersistedActorSession(){
    const token=String(localStorage.getItem(TOKEN_KEY)||'').trim();
    const user=safeJson(localStorage.getItem(USER_KEY));
    const expiresAt=jwtExpiryMs(token);
    const absoluteExpiresAt=jwtAbsoluteExpiryMs(token);

    if(!token){
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    // El vencimiento del JWT de acceso (12 h) no equivale al vencimiento de la
    // sesión renovable. Se conserva token + usuario para poder intentar refresh
    // y para no convertir un fallo temporal de red/Azure en un cierre de sesión.
    if(absoluteExpiresAt && absoluteExpiresAt<=Date.now()){
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_CSRF_KEY);
      return null;
    }

    return {
      token,
      user,
      expiresAt,
      absoluteExpiresAt,
      accessExpired:Boolean(expiresAt && expiresAt<=Date.now())
    };
  }
  function getViewUser(){ return state.viewUser || safeJson(sessionStorage.getItem(VIEW_USER_KEY)); }
  function getUser(){ return getViewUser() || getActorUser(); }
  function storeViewUser(user){
    state.viewUser=user||null;
    if(state.viewUser) sessionStorage.setItem(VIEW_USER_KEY,JSON.stringify(state.viewUser));
    else {
      sessionStorage.removeItem(VIEW_USER_KEY);
      sessionStorage.removeItem(VIEWER_TOKEN_KEY);
    }
    return state.viewUser;
  }
  function isViewingAs(){
    const actor=getActorUser(); const viewed=getViewUser();
    return Boolean(actor && viewed && Number(actor.id_SB)!==Number(viewed.id_SB));
  }
  function safeJson(raw){ try{return raw?JSON.parse(raw):null;}catch(e){return null;} }
  function cleanupViewerLaunches(){
    const now=Date.now();
    for(let index=localStorage.length-1;index>=0;index-=1){
      const key=localStorage.key(index);
      if(!key || !key.startsWith(VIEWER_LAUNCH_PREFIX)) continue;
      const launch=safeJson(localStorage.getItem(key));
      if(!launch || Number(launch.expires_at||0)<now) localStorage.removeItem(key);
    }
  }
  function createViewerLaunch(context){
    const user=context?.user;
    const viewerToken=String(context?.viewer_token||'').trim();
    if(!user || !user.id_SB || !viewerToken) throw new Error('Contexto inválido para abrir el visor.');
    cleanupViewerLaunches();
    const launchId=(window.crypto&&typeof window.crypto.randomUUID==='function')
      ? window.crypto.randomUUID()
      : 'viewer-'+Date.now()+'-'+Math.random().toString(16).slice(2);
    localStorage.setItem(VIEWER_LAUNCH_PREFIX+launchId,JSON.stringify({
      user,
      viewer_token:viewerToken,
      read_only:true,
      expires_at:Date.now()+VIEWER_LAUNCH_TTL_MS
    }));
    const url=new URL(window.location.href);
    url.searchParams.set(VIEWER_LAUNCH_PARAM,launchId);
    url.hash='#/home';
    return url.toString();
  }
  function consumeViewerLaunch(){
    const url=new URL(window.location.href);
    const launchId=url.searchParams.get(VIEWER_LAUNCH_PARAM);
    if(!launchId) return null;

    const storageKey=VIEWER_LAUNCH_PREFIX+launchId;
    const launch=safeJson(localStorage.getItem(storageKey));
    localStorage.removeItem(storageKey);
    url.searchParams.delete(VIEWER_LAUNCH_PARAM);
    window.history.replaceState(window.history.state,document.title,url.pathname+(url.searchParams.toString()?'?'+url.searchParams.toString():'')+url.hash);

    if(!launch || Number(launch.expires_at||0)<Date.now() || !launch.user?.id_SB || !launch.viewer_token){
      sessionStorage.removeItem(VIEW_USER_KEY);
      sessionStorage.removeItem(VIEWER_TOKEN_KEY);
      return null;
    }

    sessionStorage.setItem(VIEW_USER_KEY,JSON.stringify(launch.user));
    sessionStorage.setItem(VIEWER_TOKEN_KEY,String(launch.viewer_token));
    return launch.user;
  }
  function isAuthPath(path){
    return String(path||'').split('?')[0].startsWith('/api/auth/');
  }
  function requestBase(path){
    return isAuthPath(path) ? AUTH_API_BASE : API_BASE;
  }
  function isPublicAuthPath(path){
    const cleanPath=String(path||'').split('?')[0];
    return cleanPath==='/api/auth/login' ||
      cleanPath==='/api/auth/refresh' ||
      cleanPath==='/api/auth/logout' ||
      cleanPath==='/api/auth/security-questions' ||
      cleanPath==='/api/auth/recovery/start' ||
      cleanPath==='/api/auth/recovery/reset';
  }
  function buildApiError(res, json){
    const error=new Error(json?.message || ('HTTP ' + res.status));
    error.name='ManttoApiError';
    error.status=res.status;
    error.code=json?.code || null;
    error.payload=json || null;
    return error;
  }
  function isTransientSessionError(error){
    const status=Number(error?.status||0);
    return Boolean(
      error?.name==='TypeError' ||
      error?.name==='AbortError' ||
      status===408 ||
      status===429 ||
      status>=500
    );
  }
  function expireSession(message){
    if(state.expiringSession) return;
    state.expiringSession=true;
    clearSession();
    showLogin();
    msg('login-msg', message || 'Tu sesión expiró. Inicia sesión nuevamente.','info');
    document.dispatchEvent(new CustomEvent('mantto:session-expired', {
      detail:{ message:message || 'Tu sesión expiró. Inicia sesión nuevamente.' }
    }));
    window.setTimeout(()=>{ state.expiringSession=false; },0);
  }
  function preserveDeferredSession(token,user,marker,error){
    const cleanToken=String(token||'').trim();
    if(!cleanToken || !user) return false;

    const absoluteExpiresAt=jwtAbsoluteExpiryMs(cleanToken);
    if(absoluteExpiresAt && absoluteExpiresAt<=Date.now()) return false;

    state.token=cleanToken;
    state.user=user;
    sessionStorage.setItem(TOKEN_KEY,cleanToken);
    sessionStorage.setItem(USER_KEY,JSON.stringify(user));
    sessionStorage.setItem(SESSION_KEY,JSON.stringify({
      token:cleanToken,
      user,
      restored_at:new Date().toISOString(),
      validation_deferred:true,
      marker:marker||'deferred'
    }));
    persistActorSession(cleanToken,user,marker||'deferred');
    state.lastSessionRefreshAt=jwtIssuedAtMs(cleanToken)||0;
    scheduleSessionRefresh(cleanToken,SESSION_REFRESH_RETRY_MS);
    console.warn('[AUTH] Renovación/validación temporalmente no disponible; la sesión local se conserva.',error);
    showApp();
    return true;
  }
  function applyRefreshedSession(payload){
    state.token=String(payload?.token||'');
    state.user=payload?.user||state.user||null;
    sessionStorage.setItem(TOKEN_KEY,state.token);
    if(state.user) sessionStorage.setItem(USER_KEY,JSON.stringify(state.user));
    if(payload?.session_csrf_token) localStorage.setItem(SESSION_CSRF_KEY,String(payload.session_csrf_token));
    sessionStorage.setItem(SESSION_KEY,JSON.stringify({token:state.token,user:state.user,refreshed_at:new Date().toISOString()}));
    persistActorSession(state.token,state.user,'refresh');
    state.lastSessionRefreshAt=Date.now();
    scheduleSessionRefresh(state.token);
    return payload;
  }
  async function requestSessionRefresh(){
    for(let attempt=0;attempt<2;attempt+=1){
      const res=await fetch(AUTH_API_BASE+'/api/auth/refresh',{
        method:'POST',
        credentials:'include',
        headers:{'Accept':'application/json','X-Session-CSRF':String(localStorage.getItem(SESSION_CSRF_KEY)||'')}
      });
      const json=await res.json().catch(()=>({ok:false,message:'No fue posible renovar la sesión.'}));
      if((!res.ok || json.ok===false) && json?.code==='SESSION_REFRESH_REPLAYED' && attempt===0) continue;
      if(!res.ok || json.ok===false) throw buildApiError(res,json);
      return applyRefreshedSession(json);
    }
    throw new Error('No fue posible renovar la sesión.');
  }
  async function refreshAccessToken(){
    if(refreshPromise) return refreshPromise;
    const requestedToken=getToken();
    refreshPromise=(async()=>{
      if(window.navigator?.locks?.request){
        return window.navigator.locks.request('mantto-session-refresh',{mode:'exclusive'},()=>{
          const sharedToken=String(localStorage.getItem(TOKEN_KEY)||'').trim();
          if(sharedToken && sharedToken!==requestedToken && jwtExpiryMs(sharedToken)>Date.now()){
            state.token=sharedToken;
            state.user=safeJson(localStorage.getItem(USER_KEY))||state.user;
            sessionStorage.setItem(TOKEN_KEY,sharedToken);
            if(state.user) sessionStorage.setItem(USER_KEY,JSON.stringify(state.user));
            state.lastSessionRefreshAt=jwtIssuedAtMs(sharedToken)||Date.now();
            scheduleSessionRefresh(sharedToken);
            return {ok:true,token:sharedToken,user:state.user,shared:true};
          }
          return requestSessionRefresh();
        });
      }
      return requestSessionRefresh();
    })();
    try{return await refreshPromise;}finally{refreshPromise=null;}
  }
  function isTerminalRefreshError(error){
    return Number(error?.status||0)===401 || Number(error?.status||0)===403;
  }
  async function runScheduledSessionRefresh(){
    refreshTimer=null;
    const token=getToken();
    if(!token) return;
    const dueAt=tokenRefreshDueAt(token);
    if(dueAt>Date.now()+1000){
      scheduleSessionRefresh(token);
      return;
    }
    try{
      await refreshAccessToken();
    }catch(error){
      const expiresAt=jwtExpiryMs(token);
      if(isTerminalRefreshError(error) && (!expiresAt || expiresAt<=Date.now())){
        expireSession('Tu sesión alcanzó su vencimiento. Inicia sesión nuevamente.');
        return;
      }
      if(isTerminalRefreshError(error) && expiresAt>Date.now()){
        scheduleSessionRefresh(token,expiresAt-Date.now()+250);
        return;
      }
      scheduleSessionRefresh(token,SESSION_REFRESH_RETRY_MS);
    }
  }
  function touchSessionFromActivity(){
    const token=getToken();
    if(!token) return;
    if(tokenRefreshDueAt(token)>Date.now()){
      if(refreshTimer===null) scheduleSessionRefresh(token);
      return;
    }
    runScheduledSessionRefresh();
  }
  async function api(path, options){
    const opts = options || {};
    const isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    const headers = Object.assign({ 'Accept':'application/json' }, opts.headers || {});
    if(isFormData){
      delete headers['Content-Type'];
      delete headers['content-type'];
    }else if(!headers['Content-Type'] && !headers['content-type']){
      headers['Content-Type']='application/json';
    }
    const token = getToken();
    if(token) headers.Authorization = 'Bearer ' + token;
    const deviceToken=window.ManttoDevicePermissions&&window.ManttoDevicePermissions.getDeviceToken
      ? window.ManttoDevicePermissions.getDeviceToken()
      : localStorage.getItem('mantto_device_token');
    if(deviceToken) headers['X-Device-Token']=String(deviceToken);
    const viewed=getViewUser();
    const viewerToken=String(sessionStorage.getItem(VIEWER_TOKEN_KEY)||'').trim();
    if(viewerToken) headers['X-Viewer-Token']=viewerToken;
    else if(viewed && viewed.id_SB) headers['X-View-User-ID']=String(viewed.id_SB);
    const fetchOptions = Object.assign({ credentials:'include' }, opts, { headers, manttoMutationManaged:true });
    delete fetchOptions.skipMutationEvent;
    delete fetchOptions.skipAuthRefresh;
    const res = await fetch(requestBase(path) + path, fetchOptions);
    const json = await res.json().catch(()=>({ ok:false, message:'Respuesta no JSON' }));
    if(!res.ok || json.ok === false){
      const error=buildApiError(res,json);
      if(res.status===401 && !isPublicAuthPath(path)){
        if(!opts.skipAuthRefresh){
          try{
            await refreshAccessToken();
            return api(path,Object.assign({},opts,{skipAuthRefresh:true}));
          }catch(refreshError){
            if(isTerminalRefreshError(refreshError)){
              const sessionMessage=json?.message==='Sesión inválida o usuario inactivo.'
                ? 'La sesión ya no es válida o el usuario fue desactivado. Inicia sesión nuevamente.'
                : 'Tu sesión expiró. Inicia sesión nuevamente.';
              expireSession(sessionMessage);
              throw refreshError;
            }

            if(isTransientSessionError(refreshError)){
              const currentToken=getToken();
              if(currentToken) scheduleSessionRefresh(currentToken,SESSION_REFRESH_RETRY_MS);
              console.warn('[AUTH] Refresh temporalmente no disponible; la sesión local se conserva.',refreshError);
              throw refreshError;
            }

            // Un error de refresh no terminal y no transitorio no debe borrar
            // automáticamente una sesión persistida. Se propaga para diagnóstico.
            throw refreshError;
          }
        }
        const sessionMessage=json?.message==='Sesión inválida o usuario inactivo.'
          ? 'La sesión ya no es válida o el usuario fue desactivado. Inicia sesión nuevamente.'
          : 'Tu sesión expiró. Inicia sesión nuevamente.';
        expireSession(sessionMessage);
      }
      throw error;
    }
    if(json.token){
      state.token=String(json.token);
      state.user=json.user||state.user||getActorUser();
      sessionStorage.setItem(TOKEN_KEY,state.token);
      if(state.user) sessionStorage.setItem(USER_KEY,JSON.stringify(state.user));
      if(json.session_csrf_token) localStorage.setItem(SESSION_CSRF_KEY,String(json.session_csrf_token));
      sessionStorage.setItem(SESSION_KEY,JSON.stringify({token:state.token,user:state.user,refreshed_at:new Date().toISOString()}));
      persistActorSession(state.token,state.user,'api-token');
      state.lastSessionRefreshAt=jwtIssuedAtMs(state.token)||Date.now();
      scheduleSessionRefresh(state.token);
    }
    if(token && !isPublicAuthPath(path)){
      touchSessionFromActivity();
    }
    const method=String(opts.method||'GET').toUpperCase();
    if(['POST','PUT','PATCH','DELETE'].includes(method)&&opts.skipMutationEvent!==true){
      document.dispatchEvent(new CustomEvent('mantto:data-mutated',{
        detail:{ path, method, response:json, at:Date.now() }
      }));
    }
    return json;
  }
  async function apiGet(path){ return api(path, { method:'GET' }); }
  async function apiPost(path, body){ return api(path, { method:'POST', body: JSON.stringify(body || {}) }); }
  async function hydrateViewerUser(){
    const expected=getViewUser();
    if(!expected?.id_SB) return null;
    const response=await apiGet('/api/panel-control/viewer-bootstrap');
    const effective=response?.data?.usuario;
    if(!effective?.id_SB || Number(effective.id_SB)!==Number(expected.id_SB)){
      throw new Error('El backend no devolvió la identidad efectiva esperada para el visor.');
    }
    storeViewUser(effective);
    return effective;
  }
  function saveSession(payload){
    state.token = payload.token;
    state.user = payload.user;
    state.viewUser = null;
    sessionStorage.setItem(TOKEN_KEY, payload.token || '');
    sessionStorage.setItem(USER_KEY, JSON.stringify(payload.user || {}));
    persistActorSession(payload.token,payload.user,'login');
    if(payload.session_csrf_token) localStorage.setItem(SESSION_CSRF_KEY,String(payload.session_csrf_token));
    sessionStorage.removeItem(VIEW_USER_KEY);
    sessionStorage.removeItem(VIEWER_TOKEN_KEY);
    localStorage.removeItem(VIEW_USER_KEY);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: payload.token, user: payload.user, created_at: new Date().toISOString() }));
    state.lastSessionRefreshAt=jwtIssuedAtMs(state.token)||Date.now();
    scheduleSessionRefresh(state.token);
  }
  function clearSession(){
    clearRefreshTimer();
    state.token = null; state.user = null; state.viewUser = null; state.pendingUser = null;
    state.lastSessionRefreshAt = 0;
    sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY); sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); localStorage.removeItem(VIEW_USER_KEY); localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_CSRF_KEY);
    sessionStorage.removeItem(VIEW_USER_KEY);
    sessionStorage.removeItem(VIEWER_TOKEN_KEY);
  }
  function applyUserToHeader(){
    const user = getUser() || {};
    const initials = user.iniciales || String(user.nombre || user.correo || '--').split(/\s+/).map(p=>p[0]).join('').slice(0,2).toUpperCase();
    if($('hdr-user-initials')) $('hdr-user-initials').textContent = initials || '--';
    if($('hdr-user-name')) $('hdr-user-name').textContent = user.nombre || user.correo || 'Usuario';
    if($('hdr-user-company')) $('hdr-user-company').textContent = user.empresa || 'BLT';
    if($('hdr-user-role')) $('hdr-user-role').textContent = user.rol || (user.roles && user.roles[0]) || 'Sin rol';
    document.querySelectorAll('.programmer').forEach(el=>{
      const roles = new Set([user.rol, ...(user.roles||[])].filter(Boolean));
      const isProgrammer = roles.has('Programador') || roles.has('Programador United') ||
        roles.has('Programador Corellian');
      el.style.display = isProgrammer ? '' : 'none';
    });
  }
  function hideBootstrap(){ const el=$('auth-bootstrap-screen'); if(el) el.classList.add('hidden'); }
  function showApp(){
    hideBootstrap();
    const auth=$('auth-screen'), app=$('app');
    if(auth) auth.classList.add('hidden');
    if(app) app.classList.remove('auth-hidden');
    applyUserToHeader();
    document.dispatchEvent(new CustomEvent('mantto:auth-ready', { detail:{ user:getUser(), token:getToken() } }));
  }
  async function completeAuthenticatedAccess(){
    if(!window.ManttoDevicePermissions || !window.ManttoDevicePermissions.requireForSession){
      throw new Error('El validador de permisos del dispositivo no esta disponible.');
    }

    // La pantalla bootstrap tiene un z-index superior al modal de permisos.
    // Debe ocultarse antes de iniciar la validacion para no dejar al usuario
    // atrapado visualmente en "Validando sesion".
    hideBootstrap();

    const allowed = await window.ManttoDevicePermissions.requireForSession();
    if(allowed) showApp();
    return allowed;
  }
  function showLogin(){
    hideBootstrap();
    const auth=$('auth-screen'), app=$('app');
    if(auth) auth.classList.remove('hidden');
    if(app) app.classList.add('auth-hidden');
    setForm('login-form');
  }
  async function loadQuestions(selectId){
    const sel=$(selectId); if(!sel) return;
    sel.innerHTML='<option value="">Cargando...</option>';
    const json = await apiGet('/api/auth/security-questions');
    const rows = json.data || [];
    sel.innerHTML = '<option value="">Selecciona una pregunta</option>' + rows.map(q=>`<option value="${q.id_pregunta}">${q.pregunta}</option>`).join('');
  }
  async function handleLogin(ev){
    ev.preventDefault(); msg('login-msg','Validando credenciales en Aiven...','info');
    try{
      const payload = await apiPost('/api/auth/login', { correo:$('login-correo').value.trim(), pass:$('login-pass').value });
      saveSession(payload);
      if(payload.must_change_password){
        state.pendingUser = payload.user;
        await loadQuestions('first-question');
        setForm('first-login-form');
        msg('first-msg','Configura tu primer acceso para continuar.','info');
      } else {
        msg('login-msg','Login correcto. Validando permisos del dispositivo...','info');
        await completeAuthenticatedAccess();
      }
    }catch(err){ msg('login-msg', err.message || 'No fue posible iniciar sesión.','error'); }
  }
  async function handleFirstLogin(ev){
    ev.preventDefault(); msg('first-msg','Guardando primer acceso...','info');
    try{
      await apiPost('/api/auth/first-login/security-question', { id_pregunta:$('first-question').value, respuesta:$('first-answer').value });
      await apiPost('/api/auth/first-login/password', { new_password:$('first-new-pass').value });
      msg('first-msg','Primer acceso completado. Validando permisos del dispositivo...','info');
      await completeAuthenticatedAccess();
    }catch(err){ msg('first-msg', err.message || 'No fue posible completar el primer acceso.','error'); }
  }
  async function handleRecoveryStart(){
    msg('recovery-msg','Consultando pregunta...','info');
    try{
      const json = await apiPost('/api/auth/recovery/start', { correo:$('recovery-correo').value.trim() });
      state.recoveryToken = String(json.recovery_token || '');
      if($('recovery-question')) $('recovery-question').value = json.pregunta || '';
      show($('recovery-question-box'), true);
      msg('recovery-msg','Responde la pregunta para actualizar tu contraseña.','info');
    }catch(err){ msg('recovery-msg', err.message || 'No fue posible iniciar recuperación.','error'); }
  }
  async function handleRecovery(ev){
    ev.preventDefault(); msg('recovery-msg','Actualizando contraseña...','info');
    try{
      await apiPost('/api/auth/recovery/reset', { correo:$('recovery-correo').value.trim(), recovery_token:state.recoveryToken, respuesta:$('recovery-answer').value, new_password:$('recovery-new-pass').value });
      state.recoveryToken = null;
      msg('login-msg','Contraseña actualizada. Inicia sesión.','ok');
      setForm('login-form');
    }catch(err){ msg('recovery-msg', err.message || 'No fue posible recuperar la contraseña.','error'); }
  }
  async function init(){
    ['pointerdown','keydown','touchstart'].forEach(eventName=>{
      window.addEventListener?.(eventName,touchSessionFromActivity,{passive:true});
    });
    document.addEventListener?.('visibilitychange',()=>{
      if(!document.hidden) touchSessionFromActivity();
    });
    window.addEventListener?.('storage',event=>{
      if(event.key!==TOKEN_KEY || !event.newValue) return;
      const sharedToken=String(event.newValue||'').trim();
      if(!sharedToken || sharedToken===state.token || jwtExpiryMs(sharedToken)<=Date.now()) return;
      state.token=sharedToken;
      state.user=safeJson(localStorage.getItem(USER_KEY))||state.user;
      sessionStorage.setItem(TOKEN_KEY,sharedToken);
      if(state.user) sessionStorage.setItem(USER_KEY,JSON.stringify(state.user));
      state.lastSessionRefreshAt=jwtIssuedAtMs(sharedToken)||Date.now();
      scheduleSessionRefresh(sharedToken);
    });
    $('login-form')?.addEventListener('submit', handleLogin);
    $('first-login-form')?.addEventListener('submit', handleFirstLogin);
    $('recovery-form')?.addEventListener('submit', handleRecovery);
    $('btn-open-recovery')?.addEventListener('click', ()=>{ state.recoveryToken=null; setForm('recovery-form'); msg('recovery-msg','',''); });
    $('btn-back-login')?.addEventListener('click', ()=>setForm('login-form'));
    $('btn-cancel-first')?.addEventListener('click', ()=>{ logout(); });
    $('btn-recovery-start')?.addEventListener('click', handleRecoveryStart);
    $('hdr-logout-btn')?.addEventListener('click', (ev)=>{ ev.preventDefault(); ev.stopPropagation(); logout(); });
    $('sidebar-logout-btn')?.addEventListener('click', (ev)=>{ ev.preventDefault(); ev.stopPropagation(); logout(); });
    const launchedViewUser=consumeViewerLaunch();
    const persistedSession=readPersistedActorSession();
    let savedToken = sessionStorage.getItem(TOKEN_KEY) || persistedSession?.token || '';
    let savedUser = safeJson(sessionStorage.getItem(USER_KEY)) || persistedSession?.user || null;
    if(savedToken && !sessionStorage.getItem(TOKEN_KEY)){
      sessionStorage.setItem(TOKEN_KEY,savedToken);
      if(savedUser) sessionStorage.setItem(USER_KEY,JSON.stringify(savedUser));
      sessionStorage.setItem(SESSION_KEY,JSON.stringify({token:savedToken,user:savedUser,restored_at:new Date().toISOString()}));
    }

    const savedTokenExpiresAt=jwtExpiryMs(savedToken);
    const savedTokenExpired=Boolean(savedToken && savedTokenExpiresAt && savedTokenExpiresAt<=Date.now());

    // Sin JWT o con JWT de acceso vencido, primero se intenta recuperar la
    // sesión renovable. Un error temporal no debe borrar el estado persistido.
    if(!savedToken || savedTokenExpired){
      try{
        const refreshed=await refreshAccessToken();
        savedToken=refreshed.token;
        savedUser=refreshed.user;
      }catch(error){
        if(launchedViewUser){ sessionStorage.removeItem(VIEW_USER_KEY); sessionStorage.removeItem(VIEWER_TOKEN_KEY); }

        if(savedToken && savedUser && isTransientSessionError(error)){
          if(preserveDeferredSession(savedToken,savedUser,'refresh-deferred',error)) return;
        }

        if(isTerminalRefreshError(error)){
          clearSession();
          showLogin();
          msg('login-msg','Tu sesión renovable ya no es válida. Inicia sesión nuevamente.','info');
          return;
        }

        // Si no hay identidad local suficiente para restaurar de forma segura,
        // no se destruye ninguna cookie de servidor; solo se muestra el acceso.
        showLogin();
        if(error?.message) msg('login-msg',error.message,'error');
        return;
      }
    }

    state.token=savedToken;
    state.user=savedUser;
    state.lastSessionRefreshAt=jwtIssuedAtMs(savedToken)||Date.now();
    scheduleSessionRefresh(savedToken);
    state.viewUser=launchedViewUser || safeJson(sessionStorage.getItem(VIEW_USER_KEY));
    try{
      const validation=await apiGet('/api/auth/me');
      const validatedUser=validation?.user || validation?.data || savedUser;
      if(!validatedUser) throw new Error('Sesión sin usuario válido.');
      state.user=validatedUser;
      sessionStorage.setItem(USER_KEY,JSON.stringify(validatedUser));
      persistActorSession(state.token,validatedUser,'validated');
      if(state.viewUser) await hydrateViewerUser();
      await completeAuthenticatedAccess();
    }catch(error){
      if(state.viewUser){
        const viewerMessage=error.message||'No fue posible iniciar el Visor de usuarios.';
        state.viewUser=null;
        sessionStorage.removeItem(VIEW_USER_KEY);
        sessionStorage.removeItem(VIEWER_TOKEN_KEY);
        window.alert(viewerMessage);
        window.close();
        window.setTimeout(()=>{
          if(window.closed)return;
          state.user=savedUser;
          applyUserToHeader();
          showApp();
        },120);
        return;
      }

      const status=Number(error&&error.status||0);
      const transientFailure=isTransientSessionError(error);

      if(status===401){
        clearSession();
        showLogin();
        msg('login-msg','Tu sesión expiró. Inicia sesión nuevamente.','info');
        return;
      }

      // Un fallo temporal de red/Aiven/Proxy no equivale a una sesión expirada.
      // Conservamos la sesión local y reintentamos el refresh en segundo plano.
      if(transientFailure && savedToken && savedUser){
        if(preserveDeferredSession(savedToken,savedUser,'validation-deferred',error)) return;
      }

      // Errores de acceso distintos de 401 no deben destruir una sesión
      // persistida. Se conserva para permitir una nueva validación en F5.
      showLogin();
      msg('login-msg',error&&error.message ? error.message : 'No fue posible validar el acceso. Intenta nuevamente.','error');
    }
  }
  function setViewUser(user){
    localStorage.removeItem(VIEW_USER_KEY);
    storeViewUser(user);
    applyUserToHeader();
    document.dispatchEvent(new CustomEvent('mantto:view-user-changed',{detail:{actor:getActorUser(),user:getUser(),active:isViewingAs()}}));
  }
  function clearViewUser(){ setViewUser(null); }
  async function logout(){
    const csrfToken=String(localStorage.getItem(SESSION_CSRF_KEY)||'');
    const revokeRequest=fetch(AUTH_API_BASE+'/api/auth/logout',{method:'POST',credentials:'include',headers:{'Accept':'application/json','X-Session-CSRF':csrfToken}});
    clearSession();
    showLogin();
    try{
      await revokeRequest;
    }catch(_error){
      // El cierre local siempre se completa aunque no haya conexión.
    }
  }
  window.ManttoAuth = { init, logout, getToken, getUser, getActorUser, getViewUser, setViewUser, clearViewUser, isViewingAs, createViewerLaunch, hydrateViewerUser, applyUserToHeader, api, apiGet, apiPost, authHeaders(){ const t=getToken(); const h=t?{Authorization:'Bearer '+t}:{}; const d=window.ManttoDevicePermissions&&window.ManttoDevicePermissions.getDeviceToken?window.ManttoDevicePermissions.getDeviceToken():localStorage.getItem('mantto_device_token'); if(d) h['X-Device-Token']=String(d); const viewerToken=String(sessionStorage.getItem(VIEWER_TOKEN_KEY)||'').trim(); const v=getViewUser(); if(viewerToken) h['X-Viewer-Token']=viewerToken; else if(v&&v.id_SB) h['X-View-User-ID']=String(v.id_SB); return h; } };
})();
