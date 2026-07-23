(function(){
  const API_BASE = (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');

  const state = {
    activeTaskType: 'PERSONAL',
    loading: true,
    apiOk: false,
    user: null,
    tasks: [],
    notifications: [],
    unreadNotifications: [],
    activities: [],
    catalogs: { areas: [], empresas: [], usuarios: [], proyectos: [], equipos: [] },
    selectedTask: null,
    selectedDetail: null,
    formMode: 'create',
    taskContext: null
  };

  function safeText(value, fallback){
    const text = value === null || value === undefined || value === '' ? (fallback || '') : String(value);
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function authHeaders(){
    if(window.ManttoAuth && typeof window.ManttoAuth.authHeaders === 'function'){
      const headers = window.ManttoAuth.authHeaders() || {};
      if(headers.Authorization || headers.authorization) return headers;
    }

    const token =
      localStorage.getItem('mantto_token') ||
      localStorage.getItem('MANTTO_TOKEN') ||
      localStorage.getItem('token') ||
      sessionStorage.getItem('mantto_token') ||
      sessionStorage.getItem('MANTTO_TOKEN') ||
      sessionStorage.getItem('token') ||
      '';

    return token ? { Authorization: 'Bearer ' + token } : {};
  }

  function clearLocalSession(){
    [
      'mantto_token',
      'MANTTO_TOKEN',
      'token',
      'mantto_user',
      'MANTTO_USER',
      'user',
      'auth_user',
      'session_user',
      'mantto_session',
      'MANTTO_SESSION'
    ].forEach(key => {
      try{ localStorage.removeItem(key); }catch(e){}
      try{ sessionStorage.removeItem(key); }catch(e){}
    });
  }

  function handleInvalidSession(message){
    console.warn('Sesión inválida en Home:', message);

    if(window.ManttoAuth && typeof window.ManttoAuth.logout === 'function'){
      try{ window.ManttoAuth.logout(); return; }catch(e){}
    }

    clearLocalSession();
    alert('Tu sesión expiró o pertenece a otro entorno. Inicia sesión nuevamente.');
    window.location.hash = '#/login';
  }

  async function apiRequest(path, options){
    const opts = options || {};
    const headers = Object.assign({ Accept: 'application/json' }, authHeaders(), opts.headers || {});
    if(opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

    const response = await fetch(API_BASE + path, Object.assign({}, opts, { headers }));
    const json = await response.json().catch(() => ({}));

    if(response.status === 401){
      const message = (json && json.message) || 'Sesión inválida';
      handleInvalidSession(message);
      throw new Error(message);
    }

    if(!response.ok || (json && json.ok === false)){
      throw new Error((json && json.message) || ('HTTP ' + response.status + ' en ' + path));
    }

    return json;
  }

  async function apiGet(path){
    const json = await apiRequest(path);
    return Array.isArray(json) ? json : (json.data || []);
  }

  function route(target){ if(window.ManttoRouter) window.ManttoRouter.openTarget(target); }
  function toTargetAttr(target){ return safeText(JSON.stringify(target || {})); }

  function getCurrentUser(){
    if(window.ManttoAuth && window.ManttoAuth.getUser()) return window.ManttoAuth.getUser();
    const candidates = ['mantto_user','MANTTO_USER','user','auth_user','session_user','mantto_session','MANTTO_SESSION'];
    for(const key of candidates){
      try{
        const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
        if(raw){ const parsed = JSON.parse(raw); if(parsed) return parsed.user || parsed.usuario || parsed; }
      }catch(e){}
    }
    return { nombre: 'Usuario' };
  }

  function currentUserInitials(){
    return String(state.user?.iniciales || state.user?.initials || '').trim().toUpperCase();
  }

  function currentUserEmail(){
    return String(state.user?.correo || state.user?.email || '').trim();
  }


  function canSeeTaskForCurrentUser(row){
    const task = row || {};
    const tipo = String(task.tipo_pendiente || task.tipo || 'PERSONAL').trim().toUpperCase();
    const userEmail = currentUserEmail().toLowerCase();
    const userInitials = currentUserInitials();
    const creatorEmail = String(task.creado_por_email || task.created_by_email || '').trim().toLowerCase();
    const responsables = String(task.responsables || '')
      .split(',')
      .map(v => String(v || '').trim().toUpperCase())
      .filter(Boolean);

    if(tipo === 'PERSONAL') return Boolean(userEmail && creatorEmail && creatorEmail === userEmail);
    if(tipo === 'COLABORATIVA'){
      return Boolean(
        (userEmail && creatorEmail && creatorEmail === userEmail) ||
        (userInitials && responsables.includes(userInitials))
      );
    }
    return false;
  }

  function formatDateInput(value){
    if(!value) return '';
    if(/^\d{4}-\d{2}-\d{2}/.test(String(value))) return String(value).slice(0,10);
    const d = new Date(value);
    if(Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0,10);
  }

  function fileToPayload(file){
    return new Promise((resolve, reject)=>{
      if(!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, type: file.type || 'application/octet-stream', size: file.size, data: reader.result });
      reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
      reader.readAsDataURL(file);
    });
  }

  function formatDate(value){
    if(!value) return 'Sin fecha';
    const d = new Date(value);
    if(Number.isNaN(d.getTime())) return safeText(value);
    return d.toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' });
  }

  function formatRelativeDate(value){
    if(!value) return 'Sin fecha';
    const d = new Date(value);
    if(Number.isNaN(d.getTime())) return safeText(value);
    return d.toLocaleString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  }

  function priorityIcon(priority){
    const p = String(priority || '').toUpperCase();
    if(p === 'CRITICA') return '⚠️';
    if(p === 'ALTA') return '🔴';
    if(p === 'MEDIA') return '🟡';
    if(p === 'BAJA') return '🟢';
    return '⚪';
  }

  function normalizeTask(row){
    const tipo = row.tipo_pendiente || row.tipo || 'PERSONAL';
    const id = row.id_pendiente || row.id || null;
    const assigned = tipo === 'COLABORATIVA' ? row.responsables : row.seguimiento;
    return {
      id,
      raw: row,
      tipo,
      titulo: row.pendiente || row.titulo || 'Tarea sin titulo',
      descripcion: row.descripcion || '',
      prioridad: row.prioridad || '',
      estatus: row.estatus || 'Pendiente',
      proyecto: row.proyecto || '',
      equipo: row.equipo || '',
      area: row.area || '',
      due: formatDate(row.due_date || row.fecha_vencimiento),
      dueRaw: formatDateInput(row.due_date || row.fecha_vencimiento),
      subtareas: Number(row.total_subtareas || 0),
      subtareasCerradas: Number(row.subtareas_cerradas || 0),
      comentarios: Number(row.total_comentarios || 0),
      responsables: String(assigned || row.creado_por_iniciales || '').split(',').map(v => v.trim()).filter(Boolean).slice(0, 6),
      route: { module: 'tareas', id }
    };
  }

  function notificationRoute(row, id){
    const ruta = String(row.ruta_destino || '').trim();
    const accion = String(row.accion_notificacion || '').trim().toUpperCase();
    const ref = row.id_referencia || id;
    if(ruta.startsWith('home:tarea:')) return { module:'tareas', id: ruta.split(':').pop(), notificationId:id };
    if(ruta === 'home:tareas' || accion === 'ABRIR_TAREA') return { module:'tareas', id: ref, notificationId:id };
    if(ruta) return { module:ruta, id:ref, notificationId:id };
    return { module:'notifications', id:ref, notificationId:id };
  }

  function normalizeNotification(row){
    const id = row.id_notificacion || row.id || null;
    return {
      id,
      icon: row.icono_notificacion || notificationIcon(row.tipo_notificacion),
      title: row.titulo_notificacion || row.titulo || 'Notificacion',
      text: row.mensaje_notificacion || row.mensaje || '',
      time: formatRelativeDate(row.fecha_lectura || row.fecha_creacion || row.created_at || row.fecha),
      unread: row.leido === 0 || row.leido === false,
      route: notificationRoute(row, id)
    };
  }

  function notificationIcon(type){
    const t = String(type || '').toLowerCase();
    if(t.includes('ticket')) return '🎫';
    if(t.includes('tarea')) return '✅';
    if(t.includes('portafolio') || t.includes('equipo')) return '📦';
    if(t.includes('usuario')) return '👤';
    if(t.includes('alerta') || t.includes('crit')) return '⚠️';
    return '🔔';
  }

  function normalizeActivity(row){
    const id = row.id_actividad || row.id || null;
    return {
      id,
      icon: row.icono || activityIcon(row.modulo || row.tipo_actividad),
      title: row.titulo || row.entidad_nombre || row.modulo || 'Actividad',
      text: row.descripcion || row.accion || row.tipo_actividad || '',
      time: formatRelativeDate(row.fecha_creacion || row.created_at || row.fecha),
      route: { module: row.modulo || 'activity', id: row.id_referencia || id }
    };
  }

  function activityIcon(moduleName){
    const m = String(moduleName || '').toLowerCase();
    if(m.includes('ticket')) return '🎫';
    if(m.includes('portafolio') || m.includes('equipo')) return '📦';
    if(m.includes('proyecto')) return '🏢';
    if(m.includes('usuario')) return '👤';
    if(m.includes('tarea')) return '✅';
    return '🕘';
  }

  function taskRow(t){
    const assignedLabel = t.tipo === 'COLABORATIVA' ? 'Responsables' : 'Seguimiento';
    return `<article class="task-row" data-task-id="${safeText(t.id)}">
      <button class="task-icon task-open" data-task-id="${safeText(t.id)}" title="Ver detalle">${t.tipo==='PERSONAL'?'🧭':'👥'}</button>
      <div>
        <div class="task-title task-open" data-task-id="${safeText(t.id)}">${safeText(t.titulo)}</div>
        <div class="task-description">${safeText(t.descripcion || 'Sin descripcion')}</div>
        <div class="task-meta">
          <span class="badge ${safeText(String(t.prioridad || 'sin-prioridad').toLowerCase())}">${priorityIcon(t.prioridad)} ${safeText(t.prioridad || 'Sin prioridad')}</span>
          <span class="badge estado">${safeText(t.estatus)}</span>
          ${t.area ? `<span>${safeText(t.area)}</span>` : ''}
          ${t.proyecto ? `<button data-target='${toTargetAttr({module:'proyectos',id:t.proyecto})}'>${safeText(t.proyecto)}</button>` : ''}
          ${t.equipo ? `<button data-target='${toTargetAttr({module:'portafolio',id:t.equipo})}'>${safeText(t.equipo)}</button>` : ''}
          <span>${safeText(t.subtareasCerradas + '/' + t.subtareas)} subtareas</span>
          <span>${safeText(t.comentarios)} comentarios</span>
        </div>
      </div>
      <div class="task-actions"><span class="task-date">${safeText(t.due)}</span><span>${safeText(assignedLabel)}: ${safeText((t.responsables||[]).join(' · ') || 'Sin asignar')}</span><button class="mini-action task-open" data-task-id="${safeText(t.id)}">Ver</button></div>
    </article>`;
  }

  function itemRow(i, cls){
    const prefix = cls.split('-')[0];
    const notifAttr = i.id ? ` data-notification-id="${safeText(i.id)}"` : '';
    const markNew = cls === 'notif-item' && i.id && !i.unread ? `<button type="button" class="notif-mark-new" data-mark-new="${safeText(i.id)}">Marcar como nuevo</button>` : '';
    return `<article class="${cls} clickable ${i.unread?'unread':''}" data-target='${toTargetAttr(i.route)}'${notifAttr}>
      <div class="${prefix}-icon">${safeText(i.icon)}</div>
      <div><div class="${prefix}-title">${safeText(i.title)}</div><div class="${prefix}-text">${safeText(i.text)}</div><div class="${prefix}-time">${safeText(i.time)}</div>${markNew}</div>
    </article>`;
  }

  function bindClicks(){
    document.querySelectorAll('[data-mark-new]').forEach(btn=>{
      if(btn.dataset.markBound==='1') return;
      btn.dataset.markBound='1';
      btn.addEventListener('click', async ev=>{
        ev.preventDefault();
        ev.stopPropagation();
        const id = btn.dataset.markNew;
        if(!id) return;
        await apiRequest('/api/notificaciones/' + encodeURIComponent(id) + '/nuevo', { method:'PATCH' }).catch(error=>alert(error.message));
        await loadHomeData();
      });
    });
    document.querySelectorAll('[data-target]').forEach(el=>{
      if(el.dataset.bound==='1') return;
      el.dataset.bound='1';
      el.addEventListener('click', async ev=>{
        ev.stopPropagation();
        try{
          const target = JSON.parse(el.dataset.target);
          const notificationId = el.dataset.notificationId || target.notificationId;
          if(notificationId && el.classList.contains('unread')){
            await apiRequest('/api/notificaciones/' + encodeURIComponent(notificationId) + '/abrir', { method:'PATCH' }).catch(()=>null);
            await loadHomeData();
          }
          route(target);
        }catch(e){}
      });
    });
    document.querySelectorAll('.task-open').forEach(el=>{
      if(el.dataset.openBound==='1') return;
      el.dataset.openBound='1';
      el.addEventListener('click', ev=>{ ev.stopPropagation(); openTaskDetail(el.dataset.taskId); });
    });
  }

  function renderTasks(){
    const list = document.getElementById('home-task-list');
    if(!list) return;
    if(state.loading){ list.innerHTML = '<div class="empty-state">Cargando tareas desde Aiven...</div>'; return; }
    const q = String(document.getElementById('home-task-search')?.value || '').trim().toLowerCase();
    const pri = document.getElementById('home-task-priority')?.value || '';
    const est = document.getElementById('home-task-status')?.value || '';
    let tasks = state.tasks.filter(t=>t.tipo===state.activeTaskType);
    if(state.taskContext && state.activeTaskType === 'COLABORATIVA'){
      const ctx=state.taskContext;
      const selectedInitials=String(ctx.initials||'').trim().toUpperCase();
      const selectedEmail=String(ctx.email||'').trim().toLowerCase();
      const meInitials=currentUserInitials();
      tasks=tasks.filter(t=>{
        const raw=t.raw||{};
        const creatorInitials=String(raw.creado_por_iniciales||'').trim().toUpperCase();
        const creatorEmail=String(raw.creado_por_email||raw.created_by_email||'').trim().toLowerCase();
        const responsables=String(raw.responsables||'').split(',').map(v=>v.trim().toUpperCase()).filter(Boolean);
        if(ctx.mode==='ASSIGNED_BY'){
          const createdBySelected=(selectedInitials && creatorInitials===selectedInitials) || (selectedEmail && creatorEmail===selectedEmail);
          return createdBySelected && Boolean(meInitials && responsables.includes(meInitials));
        }
        if(ctx.mode==='SHARED_RESPONSIBILITY') return Boolean(meInitials && selectedInitials && responsables.includes(meInitials) && responsables.includes(selectedInitials));
        return true;
      });
    }
    if(q) tasks = tasks.filter(t => [t.titulo,t.descripcion,t.proyecto,t.equipo,t.area].join(' ').toLowerCase().includes(q));
    if(pri === '__SIN__') tasks = tasks.filter(t => !t.prioridad);
    else if(pri) tasks = tasks.filter(t => t.prioridad === pri);
    if(est) tasks = tasks.filter(t => t.estatus === est);
    list.innerHTML = tasks.length ? tasks.map(taskRow).join('') : '<div class="empty-state">Sin tareas para mostrar con los filtros actuales.</div>';
    bindClicks();
  }

  function renderCounters(){
    const critical = document.getElementById('home-kpi-critical');
    const unread = document.getElementById('home-kpi-unread');
    if(critical) critical.textContent = state.tasks.filter(t=>t.prioridad==='CRITICA' && t.estatus !== 'Cerrado').length;
    if(unread) unread.textContent = state.unreadNotifications.length;
  }

  function renderRails(){
    const notif = document.getElementById('home-notifications-list');
    const activity = document.getElementById('home-activity-list');
    if(notif){
      notif.innerHTML = state.loading ? '<div class="empty-state">Cargando notificaciones abiertas desde Aiven...</div>' : (state.notifications.length ? state.notifications.map(i=>itemRow(i,'notif-item')).join('') : '<div class="empty-state">Sin notificaciones abiertas.</div>');
    }
    if(activity){
      activity.innerHTML = state.loading ? '<div class="empty-state">Cargando actividad reciente...</div>' : (state.activities.length ? state.activities.slice(0,5).map(i=>itemRow(i,'activity-item')).join('') : '<div class="empty-state">Sin actividad reciente real.</div>');
    }
    bindClicks();
  }

  function renderShell(){
    const root=document.getElementById('view-home');
    if(!root) return;
    const nombre = state.user?.nombre || state.user?.name || 'Usuario';
    root.innerHTML=`<div class="home"><div class="home-main"><section class="card welcome"><div><h1>Bienvenido, ${safeText(nombre)}</h1><p>Centro de operaciones · Home conectado a tareas reales desde Aiven.</p></div><div class="quick-kpis"><button class="kpi-pill"><strong id="home-kpi-critical">0</strong><span>Criticas abiertas</span></button><button class="kpi-pill clickable" data-target='${toTargetAttr({module:'notifications'})}'><strong id="home-kpi-unread">0</strong><span>No leidas</span></button><button class="kpi-pill clickable" data-target='${toTargetAttr({module:'resumen'})}'><strong>Hoy</strong><span>Resumen</span></button></div></section><section class="card task-workspace"><div class="workspace-head"><div class="tabs"><button class="tab-btn active" data-task-tab="PERSONAL">Tareas personales</button><button class="tab-btn" data-task-tab="COLABORATIVA">Tareas colaborativas</button></div><div class="workspace-tools"><input id="home-task-search" placeholder="Buscar tarea..."><select id="home-task-priority"><option value="">Prioridad</option><option value="__SIN__">⚪ Sin prioridad</option><option value="CRITICA">⚠️ Crítica</option><option value="ALTA">🔴 Alta</option><option value="MEDIA">🟡 Media</option><option value="BAJA">🟢 Baja</option></select><select id="home-task-status"><option value="">Estado</option><option>Pendiente</option><option>En proceso</option><option>Cerrado</option></select><button class="new-task" id="home-new-task">+ Nueva tarea</button></div></div><div id="home-task-context"></div><div class="task-list" id="home-task-list"></div></section></div><aside class="home-rail"><section class="card rail-card"><div class="rail-head"><h2>Notificaciones abiertas</h2><button data-target='${toTargetAttr({module:'notifications'})}'>Ver todo</button></div><div class="rail-list" id="home-notifications-list"></div></section><section class="card rail-card"><div class="rail-head"><h2>Ultimas 5 interacciones</h2><button data-target='${toTargetAttr({module:'activity'})}'>Ver todo</button></div><div class="rail-list" id="home-activity-list"></div></section></aside></div><div id="home-task-modal-root"></div>`;
    root.querySelectorAll('[data-task-tab]').forEach(btn=>btn.addEventListener('click',()=>{
      root.querySelectorAll('[data-task-tab]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      state.activeTaskType = btn.dataset.taskTab;
      renderTasks();
    }));
    ['home-task-search','home-task-priority','home-task-status'].forEach(id=>document.getElementById(id)?.addEventListener('input', renderTasks));
    document.getElementById('home-new-task')?.addEventListener('click',()=>openTaskForm('create'));
    renderTaskContext(); renderCounters(); renderTasks(); renderRails(); bindClicks();
  }

  function renderTaskContext(){
    const box=document.getElementById('home-task-context');
    if(!box) return;
    const ctx=state.taskContext;
    if(!ctx){ box.innerHTML=''; return; }
    const label=ctx.mode==='ASSIGNED_BY' ? `Tareas asignadas por ${safeText(ctx.name)}` : `Responsabilidad compartida con ${safeText(ctx.name)}`;
    box.innerHTML=`<div class="task-context-banner"><span><b>Filtro activo:</b> ${label}</span><button type="button" id="home-clear-task-context">Quitar filtro</button></div>`;
    document.getElementById('home-clear-task-context')?.addEventListener('click',()=>{ state.taskContext=null; renderTaskContext(); renderTasks(); });
  }

  function openTaskContext(context){
    state.taskContext=context||null;
    state.activeTaskType='COLABORATIVA';
    renderShell();
    document.querySelectorAll('[data-task-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.taskTab==='COLABORATIVA'));
    renderTaskContext();
    renderTasks();
  }

  async function loadCatalogs(filters){
    const baseCatalogs = { areas: [], empresas: [], usuarios: [], proyectos: [], equipos: [] };
    const f = typeof filters === 'string' ? { proyecto: filters } : (filters || {});
    try{
      const params = new URLSearchParams();
      if(f.empresa) params.set('empresa', f.empresa);
      if(f.proyecto) params.set('proyecto', f.proyecto);
      const qs = params.toString() ? '?' + params.toString() : '';
      const data = await apiGet('/api/pendientes/catalogos' + qs);
      if(data && !Array.isArray(data)) state.catalogs = Object.assign(baseCatalogs, data);
      else state.catalogs = Object.assign(baseCatalogs, state.catalogs || {});
    }catch(error){
      console.warn('No se pudieron cargar catalogos de tareas:', error);
      state.catalogs = Object.assign(baseCatalogs, state.catalogs || {});
    }

    const missingUserCatalogs = !(state.catalogs.areas || []).length || !(state.catalogs.empresas || []).length || !(state.catalogs.usuarios || []).length;
    if(missingUserCatalogs){
      try{
        const usuarios = await apiGet('/api/usuarios');
        const activos = (Array.isArray(usuarios) ? usuarios : []).filter(u => Number(u.estado ?? 1) === 1);
        const empresaFiltro = f.empresa || state.user?.empresa || '';
        const usuariosFiltrados = empresaFiltro ? activos.filter(u => String(u.empresa || '') === String(empresaFiltro)) : activos;
        const uniq = arr => Array.from(new Set(arr.map(v => String(v || '').trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'es'));
        state.catalogs.areas = (state.catalogs.areas || []).length ? state.catalogs.areas : uniq(activos.map(u => u.area));
        state.catalogs.empresas = (state.catalogs.empresas || []).length ? state.catalogs.empresas : uniq(activos.map(u => u.empresa));
        state.catalogs.usuarios = (state.catalogs.usuarios || []).length ? state.catalogs.usuarios : usuariosFiltrados.map(u => ({
          id_SB: u.id_SB,
          nombre: u.nombre,
          iniciales: u.iniciales,
          correo: u.correo,
          area: u.area,
          puesto: u.puesto,
          empresa: u.empresa
        }));
      }catch(error){
        console.warn('No se pudieron cargar usuarios para catalogos de tareas:', error);
      }
    }
  }

  function closeTaskModal(){
    const root = document.getElementById('home-task-modal-root');
    if(root) root.innerHTML = '';
    state.selectedTask = null;
    state.selectedDetail = null;
  }

  function askDeleteConfirmation(taskTitle){
    return new Promise(resolve => {
      const root = document.getElementById('home-task-modal-root');
      if(!root) return resolve(false);
      const confirmId = 'task-delete-confirm';
      root.insertAdjacentHTML('beforeend', `
        <div class="task-confirm-backdrop" id="${confirmId}">
          <section class="task-confirm-box">
            <h3>Eliminar tarea</h3>
            <p>Esta acción eliminará la tarea <strong>${safeText(taskTitle)}</strong> y todo lo relacionado: responsables, seguimiento, subtareas, comentarios, adjuntos y notificaciones.</p>
            <p class="danger-note">Es una acción permanente. Confirma dos veces para continuar.</p>
            <label class="inline-check"><input type="checkbox" id="delete-confirm-1"> Entiendo que se eliminará toda la información relacionada.</label>
            <label class="inline-check"><input type="checkbox" id="delete-confirm-2"> Confirmo definitivamente la eliminación.</label>
            <div class="form-actions">
              <button type="button" class="secondary" id="delete-cancel">Cancelar</button>
              <button type="button" class="danger-action" id="delete-accept" disabled>Eliminar definitivamente</button>
            </div>
          </section>
        </div>`);
      const box = document.getElementById(confirmId);
      const c1 = document.getElementById('delete-confirm-1');
      const c2 = document.getElementById('delete-confirm-2');
      const accept = document.getElementById('delete-accept');
      const update = () => { if(accept) accept.disabled = !(c1?.checked && c2?.checked); };
      c1?.addEventListener('change', update);
      c2?.addEventListener('change', update);
      document.getElementById('delete-cancel')?.addEventListener('click', () => { box?.remove(); resolve(false); });
      accept?.addEventListener('click', () => { box?.remove(); resolve(true); });
    });
  }

  function selectedInitials(detail){
    const usuarios = detail?.usuarios || [];
    return usuarios.map(u => u.iniciales_usuario).filter(Boolean);
  }

  function optionList(values, selected){
    return values.map(v => `<option value="${safeText(v)}" ${String(v)===String(selected||'')?'selected':''}>${safeText(v)}</option>`).join('');
  }

  function projectOptionList(values, selected){
    return (values || []).map(v => {
      const code = typeof v === 'object' ? (v.proyecto_codigo || v.proyecto || v.codigo || '') : v;
      const name = typeof v === 'object' ? (v.proyecto_nombre || v.nombre || code) : v;
      return `<option value="${safeText(code)}" ${String(code)===String(selected||'')?'selected':''}>${safeText(name)}</option>`;
    }).join('');
  }

  function areaOptions(selected){
    return '<option value="">Sin area</option>' + optionList(state.catalogs.areas || [], selected);
  }

  function empresaOptions(selected){
    return '<option value="">Sin filtro de empresa</option>' + optionList(state.catalogs.empresas || [], selected);
  }

  function renderUserPicker(selected){
    const creatorInitials = currentUserInitials();
    const chosen = new Set((selected || []).map(v => String(v || '').trim().toUpperCase()).filter(v => v && v !== creatorInitials));
    const chips = Array.from(chosen).map(iniciales => `<button type="button" class="user-chip" data-remove-user="${safeText(iniciales)}">${safeText(iniciales)} ×</button>`).join('') || '<span class="muted-note">Sin usuarios seleccionados</span>';
    const options = '<option value="">Agregar usuario...</option>' + (state.catalogs.usuarios || [])
      .filter(u => {
        const iniciales = String(u.iniciales || '').trim().toUpperCase();
        return iniciales && iniciales !== creatorInitials && !chosen.has(iniciales);
      })
      .map(u => `<option value="${safeText(String(u.iniciales || '').trim().toUpperCase())}">${safeText(u.iniciales)} · ${safeText(u.nombre)}${u.area ? ' · ' + safeText(u.area) : ''}</option>`).join('');
    return `<div class="task-user-picker"><div class="selected-users" id="task-selected-users">${chips}</div><select id="task-user-select">${options}</select>${Array.from(chosen).map(i => `<input type="hidden" name="usuarios" value="${safeText(i)}">`).join('')}<p class="muted-note">El creador no puede agregarse a sí mismo.</p></div>`;
  }

  function bindUserPicker(selected){
    const creatorInitials = currentUserInitials();
    let chosen = Array.from(new Set((selected || []).map(v => String(v || '').trim().toUpperCase()).filter(v => v && v !== creatorInitials)));
    const refresh = () => {
      const host = document.getElementById('task-users-picker');
      if(!host) return;
      host.innerHTML = renderUserPicker(chosen);
      bindUserPicker(chosen);
    };
    document.getElementById('task-user-select')?.addEventListener('change', ev => {
      const value = String(ev.target.value || '').trim().toUpperCase();
      if(value && value !== creatorInitials && !chosen.includes(value)){ chosen.push(value); refresh(); }
    });
    document.querySelectorAll('[data-remove-user]').forEach(btn => btn.addEventListener('click', () => {
      chosen = chosen.filter(v => v !== btn.dataset.removeUser);
      refresh();
    }));
  }

  async function openTaskForm(mode, detail){
    state.formMode = mode || 'create';
    const row = detail?.pendiente || (mode === 'edit' ? state.selectedTask?.raw : null) || {};
    const initialEmpresa = row.empresa || state.user?.empresa || '';
    await loadCatalogs({ empresa: initialEmpresa, proyecto: row.proyecto || '' });
    const tipo = row.tipo_pendiente || state.activeTaskType || 'PERSONAL';
    const relationLabel = tipo === 'COLABORATIVA' ? 'Responsables' : 'Seguimiento';
    const subtareas = detail?.subtareas || [];
    const root = document.getElementById('home-task-modal-root');
    if(!root) return;
    const existingEvidence = row.photo_url || row.adjunto_url;
    root.innerHTML = `<div class="task-modal-backdrop"><section class="task-modal card"><div class="task-modal-head"><div><p>${mode === 'edit' ? 'Editar tarea' : 'Nueva tarea'}</p><h2>${tipo === 'COLABORATIVA' ? 'Tarea colaborativa' : 'Tarea personal'}</h2></div><button class="modal-close" id="task-modal-close">×</button></div><form id="home-task-form" class="task-form" novalidate><input type="hidden" name="tipo_pendiente" value="${safeText(tipo)}"><input type="hidden" name="photo_url" value="${safeText(row.photo_url || '')}"><input type="hidden" name="adjunto_url" value="${safeText(row.adjunto_url || '')}"><div class="form-grid"><label>Pendiente *<input name="pendiente" required maxlength="255" value="${safeText(row.pendiente || '')}"></label>${tipo === 'PERSONAL' ? `<label>Prioridad *<select name="prioridad" required><option value="CRITICA" ${row.prioridad==='CRITICA'?'selected':''}>⚠️ Crítica</option><option value="ALTA" ${row.prioridad==='ALTA'?'selected':''}>🔴 Alta</option><option value="MEDIA" ${!row.prioridad || row.prioridad==='MEDIA'?'selected':''}>🟡 Media</option><option value="BAJA" ${row.prioridad==='BAJA'?'selected':''}>🟢 Baja</option></select></label>` : `<input type="hidden" name="prioridad" value="${safeText(row.prioridad || '')}"><div class="readonly-field"><strong>Prioridad</strong><span>La definirá el responsable</span></div>`}<label>Fecha compromiso <small>(opcional)</small><input type="date" name="due_date" value="${safeText(formatDateInput(row.due_date))}"></label><label>Área<select name="area" id="task-area">${areaOptions(row.area || '')}</select></label><label>Empresa / razón social<select name="empresa" id="task-company">${empresaOptions(initialEmpresa)}</select></label><label>Proyecto<select name="proyecto" id="task-project"><option value="">Sin proyecto</option>${projectOptionList(state.catalogs.proyectos || [], row.proyecto)}</select></label><label>Equipo<select name="equipo" id="task-equipment"><option value="">Sin equipo</option>${(state.catalogs.equipos || []).map(e => `<option value="${safeText(e.numero_equipo)}" ${String(e.numero_equipo)===String(row.equipo||'')?'selected':''}>${safeText(e.identificacion_sitio || e.numero_equipo)} · ${safeText(e.numero_equipo)}</option>`).join('')}</select></label></div><label>Descripción<textarea name="descripcion" rows="4">${safeText(row.descripcion || '')}</textarea></label><section class="form-block"><div class="block-title"><strong>Evidencia inicial</strong><span>Máximo 1 imagen o 1 archivo directo en la tarea. Los adjuntos de seguimiento van en comentarios.</span></div>${existingEvidence ? `<p class="muted-note">Evidencia actual: <a href="${safeText(existingEvidence)}" target="_blank" rel="noopener">Abrir archivo</a></p>` : ''}<div class="form-grid"><label>Imagen<input type="file" id="task-photo-file" accept="image/*"></label><label>Archivo<input type="file" id="task-attachment-file"></label></div><p class="muted-note">Selecciona solo una opción. Se guardará en <code>photo_url</code> o <code>adjunto_url</code> después de subir el archivo.</p></section><section class="form-block"><div class="block-title"><strong>${safeText(relationLabel)}</strong><span>${tipo === 'COLABORATIVA' ? 'Responsables directos' : 'Usuarios que dan seguimiento'} filtrados por empresa seleccionada</span></div><div id="task-users-picker">${renderUserPicker(selectedInitials(detail))}</div></section><section class="form-block"><label class="inline-check"><input type="checkbox" name="con_subtareas" id="task-has-subtasks" ${row.con_subtareas || subtareas.length ? 'checked' : ''}> Tiene subtareas</label><div id="task-subtasks" class="subtask-editor">${(subtareas.length ? subtareas : [{subtarea:''}]).map(st => `<div class="subtask-edit-row"><input name="subtarea" value="${safeText(st.subtarea || '')}" placeholder="Subtarea"><button type="button" class="remove-subtask">Quitar</button></div>`).join('')}</div><button type="button" class="mini-action" id="add-subtask">+ Agregar subtarea</button></section><div class="form-actions"><button type="button" class="secondary" id="task-cancel">Cancelar</button><button type="submit" class="new-task">Guardar</button></div></form></section></div>`;
    document.getElementById('task-modal-close')?.addEventListener('click', closeTaskModal);
    document.getElementById('task-cancel')?.addEventListener('click', closeTaskModal);
    document.getElementById('add-subtask')?.addEventListener('click',()=>{
      document.getElementById('task-subtasks').insertAdjacentHTML('beforeend','<div class="subtask-edit-row"><input name="subtarea" placeholder="Subtarea"><button type="button" class="remove-subtask">Quitar</button></div>');
      bindSubtaskRemove();
    });
    bindSubtaskRemove();
    bindUserPicker(selectedInitials(detail));

    const photoInput = document.getElementById('task-photo-file');
    const attachmentInput = document.getElementById('task-attachment-file');
    photoInput?.addEventListener('change', () => { if(photoInput.files.length && attachmentInput) attachmentInput.value = ''; });
    attachmentInput?.addEventListener('change', () => { if(attachmentInput.files.length && photoInput) photoInput.value = ''; });

    document.getElementById('task-company')?.addEventListener('change', async ev=>{
      await loadCatalogs({ empresa: ev.target.value });
      const project = document.getElementById('task-project');
      const eq = document.getElementById('task-equipment');
      const picker = document.getElementById('task-users-picker');
      if(project) project.innerHTML = '<option value="">Sin proyecto</option>' + projectOptionList(state.catalogs.proyectos || [], '');
      if(eq) eq.innerHTML = '<option value="">Sin equipo</option>';
      if(picker){ picker.innerHTML = renderUserPicker([]); bindUserPicker([]); }
    });

    document.getElementById('task-project')?.addEventListener('change', async ev=>{
      const empresa = document.getElementById('task-company')?.value || '';
      await loadCatalogs({ empresa, proyecto: ev.target.value });
      const eq = document.getElementById('task-equipment');
      if(eq) eq.innerHTML = '<option value="">Sin equipo</option>' + (state.catalogs.equipos || []).map(e => `<option value="${safeText(e.numero_equipo)}">${safeText(e.identificacion_sitio || e.numero_equipo)} · ${safeText(e.numero_equipo)}</option>`).join('');
    });
    document.getElementById('home-task-form')?.addEventListener('submit', saveTaskForm);
  }

  function bindSubtaskRemove(){
    document.querySelectorAll('.remove-subtask').forEach(btn=>{
      if(btn.dataset.bound==='1') return;
      btn.dataset.bound='1';
      btn.addEventListener('click',()=>btn.closest('.subtask-edit-row')?.remove());
    });
  }

  async function saveTaskForm(ev){
    ev.preventDefault();
    const form = ev.target;
    const fd = new FormData(form);
    const photo = document.getElementById('task-photo-file')?.files?.[0] || null;
    const attachment = document.getElementById('task-attachment-file')?.files?.[0] || null;
    if(photo && attachment){ alert('Selecciona solo 1 imagen o 1 archivo.'); return; }
    let photoPayload = null;
    let attachmentPayload = null;
    try{
      photoPayload = await fileToPayload(photo);
      attachmentPayload = await fileToPayload(attachment);
    }catch(error){ alert(error.message); return; }
    const pendienteValue = String(fd.get('pendiente') || '').trim();
    const tipoValue = String(fd.get('tipo_pendiente') || 'PERSONAL').trim().toUpperCase();
    const prioridadValue = fd.get('prioridad') || '';
    if(!pendienteValue){ alert('El pendiente es obligatorio.'); return; }
    if(tipoValue === 'PERSONAL' && !prioridadValue){ alert('La prioridad es obligatoria para tareas personales.'); return; }
    const body = {
      pendiente: pendienteValue,
      tipo_pendiente: tipoValue,
      prioridad: prioridadValue,
      due_date: fd.get('due_date') || null,
      area: fd.get('area'),
      empresa: fd.get('empresa'),
      proyecto: fd.get('proyecto'),
      equipo: fd.get('equipo'),
      descripcion: fd.get('descripcion'),
      photo_url: fd.get('photo_url'),
      adjunto_url: fd.get('adjunto_url'),
      photo_file: photoPayload,
      adjunto_file: attachmentPayload,
      con_subtareas: fd.get('con_subtareas') === 'on',
      usuarios: fd.getAll('usuarios').map(v=>String(v||'').trim().toUpperCase()).filter(v=>v && v !== currentUserInitials()),
      subtareas: fd.getAll('subtarea').map(v=>String(v||'').trim()).filter(Boolean).map(subtarea=>({ subtarea }))
    };
    const id = state.selectedDetail?.pendiente?.id_pendiente || state.selectedTask?.id;
    const path = state.formMode === 'edit' && id ? '/api/pendientes/' + encodeURIComponent(id) : '/api/pendientes';
    const method = state.formMode === 'edit' && id ? 'PUT' : 'POST';
    try{
      await apiRequest(path, { method, body: JSON.stringify(body) });
      closeTaskModal();
      await loadHomeData();
    }catch(error){ alert(error.message); }
  }

  async function openTaskDetail(id){
    if(!id) return;
    const local = state.tasks.find(t => String(t.id) === String(id));
    state.selectedTask = local || null;
    const root = document.getElementById('home-task-modal-root');
    if(root) root.innerHTML = '<div class="task-modal-backdrop"><section class="task-modal card"><div class="empty-state">Cargando detalle...</div></section></div>';
    try{
      const json = await apiRequest('/api/pendientes/' + encodeURIComponent(id));
      state.selectedDetail = json.data;
      renderTaskDetail(json.data);
    }catch(error){
      if(root) root.innerHTML = `<div class="task-modal-backdrop"><section class="task-modal card"><div class="task-modal-head"><h2>Error</h2><button class="modal-close" id="task-modal-close">×</button></div><div class="empty-state">${safeText(error.message)}</div></section></div>`;
      document.getElementById('task-modal-close')?.addEventListener('click', closeTaskModal);
    }
  }

  function renderTaskDetail(detail){
    const p = detail.pendiente;
    const tipo = p.tipo_pendiente || 'PERSONAL';
    const relationLabel = tipo === 'COLABORATIVA' ? 'Responsables' : 'Seguimiento';
    const users = (detail.usuarios || []).map(u => `${u.iniciales_usuario}${u.nombre ? ' · ' + u.nombre : ''}`).join('<br>') || 'Sin asignar';
    const currentInitials = state.user?.iniciales || '';
    const canEdit = state.user && p.creado_por_email && (state.user.correo === p.creado_por_email || state.user.email === p.creado_por_email);
    const canChangeStatus = canEdit;
    const canSetPriority = tipo === 'COLABORATIVA' && (detail.usuarios || []).some(u => u.tipo_relacion === 'RESPONSABLE' && u.iniciales_usuario === currentInitials);
    const statusControl = canChangeStatus
      ? `<select id="detail-status"><option ${p.estatus==='Pendiente'?'selected':''}>Pendiente</option><option ${p.estatus==='En proceso'?'selected':''}>En proceso</option><option ${p.estatus==='Cerrado'?'selected':''}>Cerrado</option></select>`
      : `<p class="muted-note">${safeText(p.estatus)} · Solo el creador puede cambiar el estatus.</p>`;
    const creatorActions = canEdit ? '<button class="mini-action" id="detail-edit">Editar tarea</button><button class="danger-action" id="detail-delete">Eliminar tarea</button>' : '<p class="muted-note">Solo el creador puede editar o eliminar la tarea.</p>';
    const root = document.getElementById('home-task-modal-root');
    root.innerHTML = `<div class="task-modal-backdrop"><section class="task-modal task-detail card"><div class="task-modal-head"><div><p>Detalle de tarea</p><h2>${safeText(p.pendiente)}</h2></div><button class="modal-close" id="task-modal-close">×</button></div><div class="detail-grid"><section class="detail-card"><h3>Información</h3><p>${safeText(p.descripcion || 'Sin descripción')}</p><div class="detail-tags"><span class="badge ${safeText(String(p.prioridad || 'sin-prioridad').toLowerCase())}">${priorityIcon(p.prioridad)} ${safeText(p.prioridad || 'Sin prioridad')}</span><span class="badge estado">${safeText(p.estatus)}</span><span>${safeText(tipo)}</span><span>Fecha compromiso: ${safeText(formatDate(p.due_date))}</span></div><dl><dt>Área</dt><dd>${safeText(p.area || 'Sin área')}</dd><dt>Proyecto</dt><dd>${safeText(p.proyecto || 'Sin proyecto')}</dd><dt>Equipo</dt><dd>${safeText(p.equipo || 'Sin equipo')}</dd><dt>Evidencia directa</dt><dd>${p.photo_url || p.adjunto_url ? `<a href="${safeText(p.photo_url || p.adjunto_url)}" target="_blank" rel="noopener">Abrir evidencia</a>` : 'Sin evidencia'}</dd><dt>Creador</dt><dd>${safeText(p.creado_por_iniciales)} · ${safeText(p.creado_por_email)}</dd></dl></section><section class="detail-card"><h3>${safeText(relationLabel)}</h3><p>${users}</p><h3>Estado</h3>${statusControl}${canSetPriority ? `<h3>Prioridad del responsable</h3><select id="detail-priority"><option value="">Sin prioridad</option><option value="CRITICA" ${p.prioridad==='CRITICA'?'selected':''}>⚠️ Crítica</option><option value="ALTA" ${p.prioridad==='ALTA'?'selected':''}>🔴 Alta</option><option value="MEDIA" ${p.prioridad==='MEDIA'?'selected':''}>🟡 Media</option><option value="BAJA" ${p.prioridad==='BAJA'?'selected':''}>🟢 Baja</option></select>` : ''}${creatorActions}</section></div><section class="detail-card"><h3>Subtareas</h3><div class="subtask-list">${(detail.subtareas || []).length ? detail.subtareas.map(st => `<label class="subtask-row"><input type="checkbox" data-subtask-id="${safeText(st.id_subtarea)}" ${st.estatus==='Cerrado'?'checked':''}><span>${safeText(st.subtarea)}</span></label>`).join('') : '<div class="empty-state">Sin subtareas.</div>'}</div></section><section class="detail-card"><h3>Comentarios</h3><div class="comments-list">${(detail.comentarios || []).length ? detail.comentarios.map(c => `<article class="comment-item"><strong>${safeText(c.iniciales || c.nombre || 'Usuario')}</strong><span>${safeText(formatRelativeDate(c.fecha))}</span><p>${safeText(c.comentario)}</p>${(c.adjuntos||[]).map(a => `<a href="${safeText(a.archivo_url)}" target="_blank" rel="noopener">${safeText(a.nombre_archivo)}</a>`).join('')}</article>`).join('') : '<div class="empty-state">Sin comentarios.</div>'}</div><form id="comment-form" class="comment-form"><textarea name="comentario" rows="2" placeholder="Agregar comentario..."></textarea><input type="file" id="comment-file"><button class="new-task" type="submit">Comentar</button></form></section><div class="form-actions"><button class="secondary" id="task-detail-close">Cerrar</button></div></section></div>`;
    document.getElementById('task-modal-close')?.addEventListener('click', closeTaskModal);
    document.getElementById('task-detail-close')?.addEventListener('click', closeTaskModal);
    document.getElementById('detail-edit')?.addEventListener('click',()=>openTaskForm('edit', detail));
    document.getElementById('detail-delete')?.addEventListener('click', async ()=>{
      const ok = await askDeleteConfirmation(p.pendiente || 'esta tarea');
      if(!ok) return;
      try{
        await apiRequest('/api/pendientes/' + encodeURIComponent(p.id_pendiente), { method:'DELETE' });
        closeTaskModal();
        await loadHomeData();
        await refreshHeaderNotifications();
      }catch(error){ alert(error.message); }
    });
    document.getElementById('detail-status')?.addEventListener('change', async ev=>{
      try{ await apiRequest('/api/pendientes/' + encodeURIComponent(p.id_pendiente) + '/estatus', { method:'PATCH', body: JSON.stringify({ estatus: ev.target.value }) }); await loadHomeData(); }
      catch(error){ alert(error.message); }
    });
    document.getElementById('detail-priority')?.addEventListener('change', async ev=>{
      try{ await apiRequest('/api/pendientes/' + encodeURIComponent(p.id_pendiente) + '/prioridad', { method:'PATCH', body: JSON.stringify({ prioridad: ev.target.value || null }) }); await openTaskDetail(p.id_pendiente); await loadHomeData(); }
      catch(error){ alert(error.message); }
    });
    document.querySelectorAll('[data-subtask-id]').forEach(chk=>chk.addEventListener('change', async ev=>{
      try{ await apiRequest('/api/pendientes/' + encodeURIComponent(p.id_pendiente) + '/subtareas/' + encodeURIComponent(ev.target.dataset.subtaskId), { method:'PATCH', body: JSON.stringify({ estatus: ev.target.checked ? 'Cerrado' : 'Pendiente' }) }); await loadHomeData(); }
      catch(error){ alert(error.message); }
    }));
    document.getElementById('comment-form')?.addEventListener('submit', async ev=>{
      ev.preventDefault();
      const comentario = new FormData(ev.currentTarget).get('comentario');
      const file = document.getElementById('comment-file')?.files?.[0] || null;
      if(!String(comentario||'').trim()) return;
      let adjunto_file = null;
      try{ adjunto_file = await fileToPayload(file); }catch(error){ alert(error.message); return; }
      try{ await apiRequest('/api/pendientes/' + encodeURIComponent(p.id_pendiente) + '/comentarios', { method:'POST', body: JSON.stringify({ comentario, adjunto_file }) }); await openTaskDetail(p.id_pendiente); await loadHomeData(); }
      catch(error){ alert(error.message); }
    });
  }

  async function loadHomeData(){
    state.loading = true;
    state.user = getCurrentUser();
    renderShell();
    try{
      const boot = await apiRequest('/api/home/bootstrap');
      const data = boot.data || boot || {};
      state.tasks = (data.pendientes || []).filter(canSeeTaskForCurrentUser).map(normalizeTask);
      const visibleTaskIds = new Set(state.tasks.map(t => String(t.id)).filter(Boolean));
      const canShowHomeRelatedItem = item => {
        const route = item && item.route ? item.route : {};
        if(String(route.module || '').toLowerCase() !== 'tareas') return true;
        return Boolean(route.id && visibleTaskIds.has(String(route.id)));
      };
      state.notifications = (data.notificaciones_abiertas || []).map(normalizeNotification).filter(canShowHomeRelatedItem);
      state.unreadNotifications = (data.notificaciones_nuevas || []).map(normalizeNotification).filter(canShowHomeRelatedItem);
      state.activities = (data.actividad_reciente || []).map(normalizeActivity).filter(canShowHomeRelatedItem);
      if(data.catalogos) state.catalogs = Object.assign({ areas: [], empresas: [], usuarios: [], proyectos: [], equipos: [] }, state.catalogs || {}, data.catalogos);
      updateHeaderBadge(state.unreadNotifications.length);
      state.apiOk = true;
    }catch(error){
      console.warn('No se pudo cargar Home desde API:', error);
      state.tasks = []; state.notifications = []; state.unreadNotifications = []; state.activities = []; state.apiOk = false;
      updateHeaderBadge(0);
    }finally{
      state.loading = false;
      renderCounters(); renderTasks(); renderRails();
    }
  }


  function updateHeaderBadge(count){
    const badge = document.getElementById('hdr-notif-count');
    if(!badge) return;
    const n = Number(count || 0);
    badge.textContent = String(n);
    badge.hidden = n <= 0;
  }

  async function refreshHeaderNotifications(){
    try{
      const nuevas = await apiGet('/api/notificaciones?estado=nuevas&limit=30');
      state.unreadNotifications = nuevas.map(normalizeNotification);
      updateHeaderBadge(state.unreadNotifications.length);
      renderCounters();
      return state.unreadNotifications;
    }catch(error){
      updateHeaderBadge(0);
      return [];
    }
  }

  function closeHeaderNotificationDropdown(){
    const pop = document.getElementById('hdr-notif-popover');
    const btn = document.getElementById('hdr-notif-btn');
    if(pop) pop.hidden = true;
    if(btn) btn.setAttribute('aria-expanded', 'false');
  }

  function renderHeaderNotificationDropdown(items){
    const pop = document.getElementById('hdr-notif-popover');
    const btn = document.getElementById('hdr-notif-btn');
    if(!pop) return;
    const rows = items || state.unreadNotifications || [];
    pop.innerHTML = `<div class="hdr-notif-head"><strong>Notificaciones nuevas</strong><button type="button" id="hdr-notif-close">×</button></div>` +
      (rows.length ? `<div class="hdr-notif-list">${rows.map(n => `<button type="button" class="hdr-notif-row" data-header-notification="${safeText(n.id)}" data-target='${toTargetAttr(n.route)}'><span>${safeText(n.icon)}</span><b>${safeText(n.title)}</b><small>${safeText(n.text)}</small><em>${safeText(n.time)}</em></button>`).join('')}</div>` : '<div class="hdr-notif-empty">Sin notificaciones nuevas.</div>');
    pop.hidden = false;
    if(btn) btn.setAttribute('aria-expanded', 'true');
    document.getElementById('hdr-notif-close')?.addEventListener('click', ev=>{ ev.stopPropagation(); closeHeaderNotificationDropdown(); });
    pop.querySelectorAll('[data-header-notification]').forEach(row=>{
      row.addEventListener('click', async ev=>{
        ev.preventDefault();
        ev.stopPropagation();
        const id = row.dataset.headerNotification;
        let target = {};
        try{ target = JSON.parse(row.dataset.target || '{}'); }catch(e){}
        if(id) await apiRequest('/api/notificaciones/' + encodeURIComponent(id) + '/abrir', { method:'PATCH' }).catch(()=>null);
        closeHeaderNotificationDropdown();
        await loadHomeData();
        route(target);
      });
    });
  }

  async function toggleHeaderNotificationDropdown(ev){
    if(ev){ ev.preventDefault(); ev.stopPropagation(); }
    const pop = document.getElementById('hdr-notif-popover');
    if(pop && !pop.hidden){ closeHeaderNotificationDropdown(); return; }
    const items = await refreshHeaderNotifications();
    renderHeaderNotificationDropdown(items);
  }

  function bindHeaderNotifications(){
    const btn = document.getElementById('hdr-notif-btn');
    if(btn && btn.dataset.bound !== '1'){
      btn.dataset.bound = '1';
      btn.addEventListener('click', toggleHeaderNotificationDropdown);
    }
    document.addEventListener('click', ev=>{
      const pop = document.getElementById('hdr-notif-popover');
      const b = document.getElementById('hdr-notif-btn');
      if(pop && !pop.hidden && !pop.contains(ev.target) && ev.target !== b && !b?.contains(ev.target)) closeHeaderNotificationDropdown();
    });
  }

  function init(){ bindHeaderNotifications(); loadHomeData(); }

  window.ManttoHome={init, reload:loadHomeData, refreshHeaderNotifications, openTaskForm, openTaskDetail, openTaskContext};
})();
