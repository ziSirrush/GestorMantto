(function(){
  'use strict';

  if(window.ManttoHttp) return;

  const nativeFetch = window.fetch.bind(window);
  const inflight = new Map();
  const rawInflight = new Map();
  const cache = new Map();
  let lastScope = '';

  const ROUTING_PAYLOAD_KEYS = new Set([
    'id','id_referencia','referenceId','type','module','route','source','template',
    'view','categoria','mode','proyecto','project','codigo','equipo','ticket',
    'notificationId','focus','tab'
  ]);

  function apiBase(){
    return String(window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  }

  function identityValue(user){
    return String(user && (user.id_SB || user.id || user.correo || user.email) || 'anon');
  }

  function scopeKey(){
    const auth = window.ManttoAuth;
    const actor = auth && auth.getActorUser ? auth.getActorUser() : null;
    const effective = auth && auth.getUser ? auth.getUser() : null;
    const viewed = auth && auth.getViewUser ? auth.getViewUser() : null;
    return [identityValue(actor), identityValue(effective), identityValue(viewed)].join(':');
  }

  function requestKey(path, method, customKey){
    return scopeKey() + '|' + method + '|' + String(customKey || path || '');
  }

  function rawRequestKey(url, method){
    return scopeKey() + '|RAW|' + method + '|' + String(url ? url.pathname + url.search : '');
  }

  function clear(){
    cache.clear();
    inflight.clear();
    rawInflight.clear();
  }

  function invalidate(matcher){
    if(!matcher){ clear(); return; }
    const matches = typeof matcher === 'function'
      ? matcher
      : key => matcher instanceof RegExp ? matcher.test(key) : key.includes(String(matcher));
    for(const key of cache.keys()) if(matches(key)) cache.delete(key);
  }

  function cloneRoutingPayload(value){
    if(!value || typeof value !== 'object') return null;
    const safe = {};
    Object.keys(value).forEach(key => {
      if(!ROUTING_PAYLOAD_KEYS.has(key)) return;
      const item = value[key];
      if(item === null || ['string','number','boolean'].includes(typeof item)) safe[key] = item;
    });
    return Object.keys(safe).length ? safe : null;
  }

  function currentNavigationContext(){
    if(!window.ManttoRouter || typeof window.ManttoRouter.getCurrent !== 'function'){
      return { route:'home', payload:null };
    }
    const current = window.ManttoRouter.getCurrent() || {};
    return {
      route:String(current.route || 'home'),
      payload:cloneRoutingPayload(current.payload)
    };
  }

  function toUrl(input){
    try{
      const raw = typeof input === 'string' ? input : input && input.url;
      if(!raw) return null;
      return new URL(raw, window.location.href);
    }catch(_error){
      return null;
    }
  }

  function isGestorApi(url){
    if(!url) return false;
    try{
      const base = new URL(apiBase(), window.location.href);
      return url.origin === base.origin && url.pathname.startsWith('/api/');
    }catch(_error){
      return false;
    }
  }

  function isSystemMutationUrl(url){
    const value = String(url || '').toLowerCase();
    return [
      '/api/auth',
      '/api/push',
      '/api/device-permissions',
      '/api/interacciones',
      '/api/panel-control/viewer',
      '/api/viewer',
      '/api/sync',
      '/api/import'
    ].some(prefix => value.includes(prefix));
  }

  function withContextHeaders(input, init){
    const next = Object.assign({}, init || {});
    const sourceHeaders = (init && init.headers) ||
      (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined);
    const headers = new Headers(sourceHeaders || {});

    // Compatibilidad: cualquier fetch operativo antiguo pasa por el cliente
    // central y recibe Auth/Viewer/Device sin obligar a reescribir todos los
    // módulos en una sola entrega.
    if(window.ManttoAuth && typeof window.ManttoAuth.authHeaders === 'function'){
      const authHeaders = window.ManttoAuth.authHeaders() || {};
      Object.keys(authHeaders).forEach(name => {
        if(!headers.has(name)) headers.set(name, authHeaders[name]);
      });
    }

    const current = currentNavigationContext();
    headers.set('X-Mantto-Route', String(current.route || 'home').slice(0, 500));
    if(current.payload){
      const serialized = JSON.stringify(current.payload);
      if(serialized.length <= 3000) headers.set('X-Mantto-Payload', serialized);
    }
    next.headers = headers;
    return next;
  }

  function cleanInternalOptions(init){
    const next = Object.assign({}, init || {});
    delete next.manttoMutationManaged;
    delete next.manttoSkipMutationEvent;
    delete next.manttoNoDedupe;
    return next;
  }

  function installFetchBridge(){
    if(window.__MANTTO_HTTP_FETCH_BRIDGE__) return;
    window.__MANTTO_HTTP_FETCH_BRIDGE__ = true;

    window.fetch = async function(input, init){
      const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      const url = toUrl(input);
      const apiRequest = isGestorApi(url);
      const managedMutation = Boolean(init && init.manttoMutationManaged);
      const skipMutationEvent = Boolean(init && init.manttoSkipMutationEvent);
      const noDedupe = Boolean(init && init.manttoNoDedupe);

      let nextInit = apiRequest ? withContextHeaders(input, init) : Object.assign({}, init || {});
      nextInit = cleanInternalOptions(nextInit);

      let response;
      if(apiRequest && !noDedupe && (method === 'GET' || method === 'HEAD')){
        const key = rawRequestKey(url, method);
        let task = rawInflight.get(key);
        if(!task){
          task = nativeFetch(input, nextInit);
          rawInflight.set(key, task);
          task.then(
            () => rawInflight.delete(key),
            () => rawInflight.delete(key)
          );
        }
        const shared = await task;
        response = shared.clone();
      }else{
        response = await nativeFetch(input, nextInit);
      }

      if(
        response && response.ok && apiRequest &&
        ['POST','PUT','PATCH','DELETE'].includes(method) &&
        !managedMutation && !skipMutationEvent &&
        !isSystemMutationUrl(url && url.pathname)
      ){
        document.dispatchEvent(new CustomEvent('mantto:data-mutated', {
          detail:{
            path:url ? url.pathname + url.search : '',
            url:url ? url.toString() : '',
            method,
            source:'mantto-http',
            at:Date.now()
          }
        }));
      }

      return response;
    };
  }

  async function fallbackRequest(path, options){
    const cfg = Object.assign({ credentials:'include' }, options || {});
    const headers = Object.assign(
      { Accept:'application/json' },
      window.ManttoAuth && window.ManttoAuth.authHeaders ? window.ManttoAuth.authHeaders() : {},
      cfg.headers || {}
    );
    cfg.headers = headers;
    const response = await fetch(apiBase() + path, cfg);
    const text = await response.text();
    let data = {};
    try{ data = text ? JSON.parse(text) : {}; }
    catch(_error){ throw new Error('Respuesta inválida del backend.'); }
    if(!response.ok || data.ok === false){
      const error = new Error(data.message || data.error || ('HTTP ' + response.status));
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function request(path, options){
    const source = options || {};
    const method = String(source.method || 'GET').toUpperCase();
    const cacheTtlMs = Math.max(0, Number(source.cacheTtlMs || 0));
    const force = source.force === true;
    const dedupe = source.dedupe !== false && (method === 'GET' || method === 'HEAD');
    const key = requestKey(path, method, source.cacheKey);
    const cfg = Object.assign({}, source);
    delete cfg.cacheTtlMs;
    delete cfg.cacheKey;
    delete cfg.dedupe;
    delete cfg.force;

    if(!force && cacheTtlMs > 0){
      const hit = cache.get(key);
      if(hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.value);
      if(hit) cache.delete(key);
    }
    if(dedupe && inflight.has(key)) return inflight.get(key);

    const task = Promise.resolve().then(() => {
      if(window.ManttoAuth && typeof window.ManttoAuth.api === 'function'){
        return window.ManttoAuth.api(path, cfg);
      }
      return fallbackRequest(path, cfg);
    }).then(value => {
      if(cacheTtlMs > 0) cache.set(key, { value, expiresAt:Date.now() + cacheTtlMs });
      return value;
    }).finally(() => inflight.delete(key));

    if(dedupe) inflight.set(key, task);
    return task;
  }

  function get(path, options){
    return request(path, Object.assign({}, options || {}, { method:'GET' }));
  }

  async function template(path, options){
    const response = await fetch(path, Object.assign({ cache:'default' }, options || {}));
    if(!response.ok) throw new Error('No se pudo cargar el recurso ' + path);
    return response.text();
  }

  function fetchRaw(input, init){
    return window.fetch(input, init);
  }

  function refreshScope(){
    const next = scopeKey();
    if(lastScope && next !== lastScope) clear();
    lastScope = next;
  }

  installFetchBridge();
  document.addEventListener('mantto:auth-ready', refreshScope);
  document.addEventListener('mantto:view-user-changed', () => { clear(); refreshScope(); });
  document.addEventListener('mantto:data-mutated', () => cache.clear());
  lastScope = scopeKey();

  window.ManttoHttp = Object.freeze({ request, get, template, fetch:fetchRaw, invalidate, clear, scopeKey });
})();
