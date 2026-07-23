(function(){
  const API_BASE = (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  const TOKEN_KEY = 'mantto_token';
  const USER_KEY = 'mantto_user';
  const SESSION_KEY = 'mantto_session';
  const VIEW_USER_KEY = 'mantto_view_user';
  const state = { token: null, user: null, viewUser: null, pendingUser: null };

  function $(id){ return document.getElementById(id); }
  function msg(id, text, type){ const el=$(id); if(!el) return; el.textContent=text||''; el.className='auth-msg ' + (type||''); }
  function show(el, yes){ if(!el) return; el.classList.toggle('hidden', !yes); }
  function setForm(name){
    ['login-form','first-login-form','recovery-form'].forEach(id=>show($(id), id===name));
  }
  function getToken(){ return state.token || localStorage.getItem(TOKEN_KEY) || ''; }
  function getActorUser(){ return state.user || safeJson(localStorage.getItem(USER_KEY)); }
  function getViewUser(){ return state.viewUser || safeJson(localStorage.getItem(VIEW_USER_KEY)); }
  function getUser(){ return getViewUser() || getActorUser(); }
  function isViewingAs(){
    const actor=getActorUser(); const viewed=getViewUser();
    return Boolean(actor && viewed && Number(actor.id_SB)!==Number(viewed.id_SB));
  }
  function safeJson(raw){ try{return raw?JSON.parse(raw):null;}catch(e){return null;} }
  async function api(path, options){
    const opts = options || {};
    const headers = Object.assign({ 'Accept':'application/json', 'Content-Type':'application/json' }, opts.headers || {});
    const token = getToken();
    if(token) headers.Authorization = 'Bearer ' + token;
    const viewed=getViewUser();
    if(viewed && viewed.id_SB) headers['X-View-User-ID']=String(viewed.id_SB);
    const res = await fetch(API_BASE + path, Object.assign({}, opts, { headers }));
    const json = await res.json().catch(()=>({ ok:false, message:'Respuesta no JSON' }));
    if(!res.ok || json.ok === false) throw new Error(json.message || ('HTTP ' + res.status));
    return json;
  }
  async function apiGet(path){ return api(path, { method:'GET' }); }
  async function apiPost(path, body){ return api(path, { method:'POST', body: JSON.stringify(body || {}) }); }
  function saveSession(payload){
    state.token = payload.token;
    state.user = payload.user;
    state.viewUser = null;
    localStorage.setItem(TOKEN_KEY, payload.token || '');
    localStorage.setItem(USER_KEY, JSON.stringify(payload.user || {}));
    localStorage.removeItem(VIEW_USER_KEY);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: payload.token, user: payload.user, created_at: new Date().toISOString() }));
  }
  function clearSession(){
    state.token = null; state.user = null; state.viewUser = null; state.pendingUser = null;
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); localStorage.removeItem(VIEW_USER_KEY); localStorage.removeItem(SESSION_KEY);
  }
  function applyUserToHeader(){
    const user = getUser() || {};
    const actor = getActorUser() || user;
    const initials = user.iniciales || String(user.nombre || user.correo || '--').split(/\s+/).map(p=>p[0]).join('').slice(0,2).toUpperCase();
    if($('hdr-user-initials')) $('hdr-user-initials').textContent = initials || '--';
    if($('hdr-user-name')) $('hdr-user-name').textContent = user.nombre || user.correo || 'Usuario';
    if($('hdr-user-company')) $('hdr-user-company').textContent = user.empresa || 'BLT';
    if($('hdr-user-role')) $('hdr-user-role').textContent = user.rol || (user.roles && user.roles[0]) || 'Sin rol';
    document.querySelectorAll('.programmer').forEach(el=>{
      const roles = new Set([actor.rol, ...(actor.roles||[])].filter(Boolean));
      const canManagePanel = roles.has('Programador') || roles.has('Programador United') ||
        roles.has('Programador Corellian') || roles.has('Director General');
      el.style.display = canManagePanel ? '' : 'none';
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
        msg('login-msg','Login correcto.','ok');
        showApp();
      }
    }catch(err){ msg('login-msg', err.message || 'No fue posible iniciar sesión.','error'); }
  }
  async function handleFirstLogin(ev){
    ev.preventDefault(); msg('first-msg','Guardando primer acceso...','info');
    const user = state.pendingUser || getUser() || {};
    try{
      await apiPost('/api/auth/first-login/password', { user_id:user.id_SB, new_password:$('first-new-pass').value });
      await apiPost('/api/auth/first-login/security-question', { user_id:user.id_SB, id_pregunta:$('first-question').value, respuesta:$('first-answer').value });
      msg('first-msg','Primer acceso completado.','ok');
      showApp();
    }catch(err){ msg('first-msg', err.message || 'No fue posible completar el primer acceso.','error'); }
  }
  async function handleRecoveryStart(){
    msg('recovery-msg','Consultando pregunta...','info');
    try{
      const json = await apiPost('/api/auth/recovery/start', { correo:$('recovery-correo').value.trim() });
      if($('recovery-question')) $('recovery-question').value = json.pregunta || '';
      show($('recovery-question-box'), true);
      msg('recovery-msg','Responde la pregunta para actualizar tu contraseña.','info');
    }catch(err){ msg('recovery-msg', err.message || 'No fue posible iniciar recuperación.','error'); }
  }
  async function handleRecovery(ev){
    ev.preventDefault(); msg('recovery-msg','Actualizando contraseña...','info');
    try{
      await apiPost('/api/auth/recovery/reset', { correo:$('recovery-correo').value.trim(), respuesta:$('recovery-answer').value, new_password:$('recovery-new-pass').value });
      msg('login-msg','Contraseña actualizada. Inicia sesión.','ok');
      setForm('login-form');
    }catch(err){ msg('recovery-msg', err.message || 'No fue posible recuperar la contraseña.','error'); }
  }
  async function init(){
    $('login-form')?.addEventListener('submit', handleLogin);
    $('first-login-form')?.addEventListener('submit', handleFirstLogin);
    $('recovery-form')?.addEventListener('submit', handleRecovery);
    $('btn-open-recovery')?.addEventListener('click', ()=>{ setForm('recovery-form'); msg('recovery-msg','',''); });
    $('btn-back-login')?.addEventListener('click', ()=>setForm('login-form'));
    $('btn-cancel-first')?.addEventListener('click', ()=>{ clearSession(); showLogin(); });
    $('btn-recovery-start')?.addEventListener('click', handleRecoveryStart);
    $('hdr-logout-btn')?.addEventListener('click', (ev)=>{ ev.preventDefault(); ev.stopPropagation(); logout(); });
    const savedToken = localStorage.getItem(TOKEN_KEY);
    const savedUser = safeJson(localStorage.getItem(USER_KEY));
    if(!savedToken){ showLogin(); return; }

    state.token=savedToken;
    state.user=savedUser;
    state.viewUser=safeJson(localStorage.getItem(VIEW_USER_KEY));
    try{
      const validation=await apiGet('/api/auth/me');
      const validatedUser=validation?.user || validation?.data || savedUser;
      if(!validatedUser) throw new Error('Sesión sin usuario válido.');
      state.user=validatedUser;
      localStorage.setItem(USER_KEY,JSON.stringify(validatedUser));
      showApp();
    }catch(error){
      clearSession();
      showLogin();
      msg('login-msg','Tu sesión expiró. Inicia sesión nuevamente.','info');
    }
  }
  function setViewUser(user){
    state.viewUser=user||null;
    if(state.viewUser) localStorage.setItem(VIEW_USER_KEY,JSON.stringify(state.viewUser));
    else localStorage.removeItem(VIEW_USER_KEY);
    applyUserToHeader();
    document.dispatchEvent(new CustomEvent('mantto:view-user-changed',{detail:{actor:getActorUser(),user:getUser(),active:isViewingAs()}}));
  }
  function clearViewUser(){ setViewUser(null); }
  function logout(){ clearSession(); showLogin(); }
  window.ManttoAuth = { init, logout, getToken, getUser, getActorUser, getViewUser, setViewUser, clearViewUser, isViewingAs, applyUserToHeader, api, apiGet, apiPost, authHeaders(){ const t=getToken(); const h=t?{Authorization:'Bearer '+t}:{}; const v=getViewUser(); if(v&&v.id_SB) h['X-View-User-ID']=String(v.id_SB); return h; } };
})();
