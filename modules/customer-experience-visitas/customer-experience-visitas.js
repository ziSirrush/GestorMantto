// [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 4 QA V001]
// FIX: historial de baja logica accesible por ID con VER_HISTORIAL.
// Base original de Fase 3 conservada; sin cambios en permisos, API ni esquema.
// [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 3 FRONTEND V001]
// UI incremental contra el contrato REAL de Fase 2. Aiven es la unica fuente.
(function () {
  'use strict';

  if (window.ManttoCustomerExperienceVisitas) return;

  const ROUTE = 'cx-visitas';
  const API = '/api/customer-experience/visitas';
  const MEXICO_ZONE = 'America/Mexico_City';
  const PAGE_SIZE = 25;
  const PERMISSIONS = Object.freeze({
    visual: 'CUSTOMER_EXPERIENCE_VISITAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
    list: 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.VER',
    create: 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.CREAR',
    edit: 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.EDITAR',
    deactivate: 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.DESACTIVAR',
    history: 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.VER_HISTORIAL'
  });

  const FORM_FIELDS = Object.freeze([
    'titulo', 'objetivo', 'observaciones', 'referencia_origen',
    'referencia_id', 'proyecto_nombre', 'cliente_nombre', 'ubicacion',
    'fecha_programada_utc', 'id_usuario_responsable'
  ]);

  const state = {
    root: null,
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    rows: [],
    filters: { q: '', estado: 'BORRADOR', id_usuario_responsable: '', desde: '', hasta: '' },
    selected: null,
    dialog: null,
    listRequest: 0,
    detailRequest: 0,
    busy: false,
    initialized: false
  };

  function byId(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function printable(value) {
    return value === null || value === undefined || value === '' ? '—' : escapeHtml(value);
  }
  function safePositiveId(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) return null;
    return Number(raw);
  }
  function isCurrentRoute() {
    const router = window.ManttoRouter;
    return !router || typeof router.getCurrent !== 'function'
      || String(router.getCurrent()?.route || '') === ROUTE;
  }
  function isActive() {
    return Boolean(state.root && state.root.isConnected !== false
      && byId('cxv-page') && isCurrentRoute());
  }
  function isViewer() {
    return Boolean(window.ManttoAuth && typeof window.ManttoAuth.isViewingAs === 'function'
      && window.ManttoAuth.isViewingAs());
  }
  function clientPermission(code) {
    const permissions = window.ManttoPermissions;
    if (!permissions || typeof permissions.state !== 'function') return null;
    try {
      const result = permissions.state(code);
      // No asumir acceso en una respuesta vacia o desconocida.
      return Boolean(result && result.exists && result.efectivo === true);
    } catch (_) { return false; }
  }
  function may(action) {
    if (isViewer() && ['create', 'edit', 'deactivate'].includes(action)) return false;
    const visual = clientPermission(PERMISSIONS.visual);
    const explicit = clientPermission(PERMISSIONS[action]);
    // Puede no existir ManttoPermissions en determinadas publicaciones. La UI no
    // reemplaza el guard del backend: en ese caso la API valida todos los accesos.
    return visual !== false && explicit !== false;
  }
  function requestApi(path, options) {
    const opts = options || { method: 'GET' };
    if (window.ManttoAuth && typeof window.ManttoAuth.api === 'function') {
      return window.ManttoAuth.api(path, opts);
    }
    const base = String(window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
    const headers = Object.assign({ Accept: 'application/json' },
      window.ManttoAuth?.authHeaders?.() || {}, opts.headers || {});
    if (opts.body && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    return fetch(base + path, { ...opts, headers }).then(async response => {
      const data = await response.json().catch(() => ({ ok: false, message: 'Respuesta JSON invalida.' }));
      if (!response.ok || data.ok === false) {
        const error = new Error(data.message || `Error HTTP ${response.status}`);
        error.status = response.status;
        error.code = data.code || null;
        throw error;
      }
      return data;
    });
  }
  function pathWithQuery(filters, page) {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(PAGE_SIZE));
    ['q', 'estado', 'id_usuario_responsable', 'desde', 'hasta'].forEach(key => {
      if (filters[key]) params.set(key, String(filters[key]));
    });
    return API + '?' + params.toString();
  }
  function makeUtcDate(raw) {
    if (!raw) return null;
    if (raw instanceof Date) return Number.isFinite(raw.getTime()) ? raw : null;
    const text = String(raw).trim();
    // MySQL DATETIME entregado como texto se trata explicitamente como UTC.
    const normalized = /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d{1,3})?$/.test(text)
      ? text.replace(' ', 'T') + 'Z'
      : text;
    const date = new Date(normalized);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  function zonedParts(date) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: MEXICO_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    });
    return Object.fromEntries(fmt.formatToParts(date)
      .filter(item => item.type !== 'literal').map(item => [item.type, item.value]));
  }
  function inputDateMexico(raw) {
    const date = makeUtcDate(raw);
    if (!date) return '';
    const parts = zonedParts(date);
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  }
  function mexicoInputToUtc(raw) {
    const value = String(raw || '').trim();
    if (!value) return null;
    const m = value.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?$/);
    if (!m) throw new Error('La fecha de visita debe incluir fecha y hora validas.');
    const seconds = m[6] || '00';
    const target = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${seconds}`;
    // CDMX puede tener UTC-05 o UTC-06 en el historico. Probar ambos evita
    // forzar la zona del dispositivo y rechaza horas inexistentes por DST.
    for (const offset of ['-06:00', '-05:00']) {
      const candidate = new Date(target + offset);
      if (!Number.isFinite(candidate.getTime())) continue;
      const formatted = zonedParts(candidate);
      const roundtrip = `${formatted.year}-${formatted.month}-${formatted.day}`
        + `T${formatted.hour}:${formatted.minute}:${formatted.second}`;
      if (roundtrip === target) return candidate.toISOString();
    }
    throw new Error('Esa fecha/hora no existe en la zona de Ciudad de Mexico.');
  }
  function formattedDate(raw) {
    const date = makeUtcDate(raw);
    if (!date) return 'Sin programar';
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: MEXICO_ZONE, year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date) + ' CDMX';
  }
  function setMessage(message, kind = '') {
    const node = byId('cxv-feedback');
    if (!node) return;
    node.textContent = message || '';
    node.hidden = !message;
    node.className = 'cxv-feedback' + (kind ? ' cxv-' + kind : '');
  }
  function setDialogError(message) {
    const body = byId('cxv-dialog-content');
    if (!body || typeof body.querySelector !== 'function') return;
    let note = body.querySelector('.cxv-dialog-error');
    if (!note && typeof document.createElement === 'function') {
      note = document.createElement('div');
      note.className = 'cxv-feedback cxv-error cxv-dialog-error';
      note.setAttribute('role', 'alert');
      body.prepend(note);
    }
    if (note) note.textContent = message || '';
  }
  function displayError(error) {
    if (error?.code === 'CX_VISITAS_API_NOT_ENABLED' || error?.status === 503) {
      return 'El backend de Visitas aun no esta disponible. Verifica que Fases 1 y 2 esten aplicadas y CX_VISITAS_API_ENABLED=true.';
    }
    if (error?.status === 403) {
      return 'Tu usuario no tiene permisos o alcance suficientes para esta operacion.';
    }
    return error?.message || 'No fue posible completar la operacion.';
  }

  function shell() {
    return `<div class="cxv-page" id="cxv-page">
      <section class="cxv-card cxv-header">
        <div><p class="cxv-eyebrow">BLT NOW · Customer Experience</p>
          <h1>Visitas</h1>
          <p>Registro y seguimiento de visitas. Los registros nuevos inician como borrador.</p></div>
        <div class="cxv-header-actions">
          ${may('create') ? '<button class="cxv-button cxv-primary" data-cxv-action="new" type="button">+ Nueva visita</button>' : ''}
          <button class="cxv-button cxv-secondary" data-cxv-action="refresh" type="button">↻ Actualizar</button>
        </div>
      </section>
      <div id="cxv-feedback" class="cxv-feedback" role="status" aria-live="polite" hidden></div>
      <section class="cxv-card cxv-filters-card">
        <form id="cxv-filter-form" class="cxv-filters">
          <label class="cxv-field cxv-search-field"><span>Buscar</span>
            <input name="q" type="search" maxlength="100" placeholder="Visita, cliente, proyecto o referencia" value="${escapeHtml(state.filters.q)}"></label>
          <label class="cxv-field"><span>Estado</span>
            <select name="estado"><option value="BORRADOR">Borrador</option><option value="">Todos los estados disponibles</option></select></label>
          <label class="cxv-field"><span>Desde (UTC)</span><input name="desde" type="date" value="${escapeHtml(state.filters.desde)}"></label>
          <label class="cxv-field"><span>Hasta (UTC)</span><input name="hasta" type="date" value="${escapeHtml(state.filters.hasta)}"></label>
          <label class="cxv-field"><span>ID responsable</span><input name="id_usuario_responsable" type="number" min="1" step="1" placeholder="Opcional" value="${escapeHtml(state.filters.id_usuario_responsable)}"></label>
          <div class="cxv-filter-actions"><button class="cxv-button cxv-primary" type="submit">Buscar</button>
            <button class="cxv-button cxv-secondary" data-cxv-action="clear" type="button">Limpiar</button></div>
        </form><p class="cxv-help">Los filtros de fechas corresponden a días UTC del backend; las fechas visibles y la captura de visita se presentan en hora de Ciudad de México.</p>
      </section>
      ${may('history') ? `<section class="cxv-card cxv-history-lookup-card" aria-label="Consultar historial de visita por ID">
        <form id="cxv-history-lookup-form" class="cxv-filters">
          <label class="cxv-field"><span>Historial por ID (tambien visitas desactivadas)</span>
            <input name="id_visita" type="number" min="1" step="1" required placeholder="ID de visita"></label>
          <div class="cxv-filter-actions"><button class="cxv-button cxv-secondary" type="submit">Consultar historial</button></div>
        </form><p class="cxv-help">Solo disponible para usuarios autorizados. Permite consultar el historial de una visita dada de baja logica.</p>
      </section>` : ''}
      <section class="cxv-card cxv-results-card" aria-label="Listado de visitas">
        <div class="cxv-results-head"><div><h2>Visitas registradas</h2><span id="cxv-counter">Consultando Aiven…</span></div>
          <span class="cxv-pill">Aiven · Corellian</span></div>
        <div id="cxv-results" class="cxv-results" aria-live="polite"><div class="cxv-loading">Cargando visitas…</div></div>
        <div id="cxv-pager" class="cxv-pager"></div>
      </section>
      <div id="cxv-dialog-overlay" class="cxv-dialog-overlay" hidden>
        <div class="cxv-dialog" role="dialog" aria-modal="true" aria-labelledby="cxv-dialog-title">
          <header class="cxv-dialog-head"><h2 id="cxv-dialog-title">Visita</h2>
            <button data-cxv-action="close" class="cxv-close" type="button" aria-label="Cerrar">×</button></header>
          <div class="cxv-dialog-content" id="cxv-dialog-content"></div>
        </div>
      </div>
    </div>`;
  }
  function renderResults() {
    if (!isActive()) return;
    const target = byId('cxv-results');
    const counter = byId('cxv-counter');
    const pager = byId('cxv-pager');
    if (!target || !counter || !pager) return;
    counter.textContent = `${state.total} registro(s) · pagina ${state.page}`;
    if (!state.rows.length) {
      target.innerHTML = '<div class="cxv-empty"><strong>Sin visitas para los filtros seleccionados.</strong>'
        + '<span>Prueba con otros filtros o registra una nueva visita si tienes permiso.</span></div>';
    } else {
      target.innerHTML = '<div class="cxv-table-scroll"><table class="cxv-table"><thead><tr>'
        + '<th>ID</th><th>Visita</th><th>Proyecto / Cliente</th><th>Programada</th><th>Responsable</th><th>Estado</th><th></th>'
        + '</tr></thead><tbody>' + state.rows.map(row => `<tr>
          <td><strong>#${printable(row.id_visita)}</strong></td>
          <td><div class="cxv-title-cell"><strong>${printable(row.titulo)}</strong><small>${printable(row.referencia_origen)} · ${printable(row.referencia_id)}</small></div></td>
          <td><div class="cxv-title-cell"><strong>${printable(row.proyecto_nombre)}</strong><small>${printable(row.cliente_nombre)}</small></div></td>
          <td>${escapeHtml(formattedDate(row.fecha_programada_utc))}</td>
          <td>${printable(row.id_usuario_responsable)}</td>
          <td><span class="cxv-state">${printable(row.estado)}</span></td>
          <td><button class="cxv-link" type="button" data-cxv-action="detail" data-id="${escapeHtml(row.id_visita)}">Ver detalle</button></td>
        </tr>`).join('') + '</tbody></table></div>';
    }
    const maxPage = Math.max(1, Math.ceil(state.total / state.pageSize));
    pager.innerHTML = `<span>Pagina ${state.page} de ${maxPage}</span><div>
      <button class="cxv-button cxv-secondary" data-cxv-action="prev" type="button" ${state.page <= 1 ? 'disabled' : ''}>← Anterior</button>
      <button class="cxv-button cxv-secondary" data-cxv-action="next" type="button" ${state.page >= maxPage ? 'disabled' : ''}>Siguiente →</button>
      </div>`;
  }
  async function load() {
    if (!isActive()) return;
    const request = ++state.listRequest;
    const target = byId('cxv-results');
    const pager = byId('cxv-pager');
    if (target) target.innerHTML = '<div class="cxv-loading">Consultando Aiven…</div>';
    if (pager) pager.innerHTML = '';
    setMessage('');
    try {
      const data = await requestApi(pathWithQuery(state.filters, state.page), { method: 'GET' });
      if (request !== state.listRequest || !isActive()) return;
      if (!Array.isArray(data.visitas) || !Number.isFinite(Number(data.total))) {
        throw new Error('La respuesta de Visitas no coincide con el contrato de Fase 2.');
      }
      state.rows = data.visitas;
      state.total = Number(data.total);
      renderResults();
    } catch (error) {
      if (request !== state.listRequest || !isActive()) return;
      state.rows = [];
      state.total = 0;
      if (target) target.innerHTML = '<div class="cxv-empty cxv-error">No fue posible consultar las visitas.</div>';
      const counter = byId('cxv-counter');
      if (counter) counter.textContent = 'Consulta no disponible';
      setMessage(displayError(error), 'error');
    }
  }
  function detailsPair(label, value) {
    return `<div class="cxv-detail-pair"><dt>${escapeHtml(label)}</dt><dd>${printable(value)}</dd></div>`;
  }
  function openDialog(title, content) {
    const overlay = byId('cxv-dialog-overlay');
    const header = byId('cxv-dialog-title');
    const body = byId('cxv-dialog-content');
    if (!overlay || !header || !body) return;
    header.textContent = title;
    body.innerHTML = content;
    overlay.hidden = false;
    state.dialog = true;
    overlay.querySelector('[data-cxv-action="close"]')?.focus();
  }
  function closeDialog() {
    const overlay = byId('cxv-dialog-overlay');
    const body = byId('cxv-dialog-content');
    if (overlay) overlay.hidden = true;
    if (body) body.innerHTML = '';
    state.dialog = false;
    state.selected = null;
    state.detailRequest += 1;
  }
  function formField(name, label, value = '', type = 'text', attrs = '') {
    return `<label class="cxv-field"><span>${escapeHtml(label)}</span>
      <input name="${name}" type="${type}" value="${escapeHtml(value == null ? '' : value)}" ${attrs}></label>`;
  }
  function textArea(name, label, value = '', max = 10000) {
    return `<label class="cxv-field cxv-full"><span>${escapeHtml(label)}</span>
      <textarea name="${name}" maxlength="${max}" rows="3">${escapeHtml(value == null ? '' : value)}</textarea></label>`;
  }
  function formHtml(row) {
    const edit = Boolean(row);
    return `<form id="cxv-edit-form" class="cxv-form" data-mode="${edit ? 'edit' : 'create'}">
      <p class="cxv-form-help">Estado inicial: <strong>BORRADOR</strong>. Las visitas no se marcan como realizadas en esta fase.</p>
      <div class="cxv-form-grid">
      ${formField('titulo', 'Titulo de la visita *', row?.titulo, 'text', 'maxlength="200" required')}
      ${formField('fecha_programada_local', 'Fecha programada · CDMX', inputDateMexico(row?.fecha_programada_utc), 'datetime-local', 'step="1"')}
      ${formField('proyecto_nombre', 'Proyecto', row?.proyecto_nombre, 'text', 'maxlength="200"')}
      ${formField('cliente_nombre', 'Cliente', row?.cliente_nombre, 'text', 'maxlength="200"')}
      ${formField('ubicacion', 'Ubicacion', row?.ubicacion, 'text', 'maxlength="255"')}
      ${formField('id_usuario_responsable', 'ID responsable (Corellian)', row?.id_usuario_responsable, 'number', 'min="1" step="1" placeholder="Opcional"')}
      ${formField('referencia_origen', 'Origen de referencia', row?.referencia_origen, 'text', 'maxlength="40" placeholder="Si aplica"')}
      ${formField('referencia_id', 'ID de referencia', row?.referencia_id, 'text', 'maxlength="120" placeholder="Completar junto con origen"')}
      ${textArea('objetivo', 'Objetivo', row?.objetivo)}
      ${textArea('observaciones', 'Observaciones', row?.observaciones)}
      </div><p class="cxv-help">El ID de responsable debe corresponder a un usuario activo de Corellian dentro de tu alcance. La referencia se captura en pareja (origen + ID).</p>
      <div class="cxv-form-actions"><button class="cxv-button cxv-secondary" data-cxv-action="close" type="button">Cancelar</button>
        <button class="cxv-button cxv-primary" id="cxv-save" type="submit">${edit ? 'Guardar cambios' : 'Registrar visita'}</button></div>
    </form>`;
  }
  function normalizeForm(form) {
    const payload = {};
    const values = Object.fromEntries(new FormData(form));
    for (const key of FORM_FIELDS) {
      if (key === 'fecha_programada_utc') continue;
      const value = String(values[key] || '').trim();
      payload[key] = key === 'id_usuario_responsable'
        ? (value ? safePositiveId(value) : null)
        : value || null;
      if (key === 'id_usuario_responsable' && value && payload[key] === null) {
        throw new Error('El ID responsable debe ser un numero entero positivo.');
      }
    }
    if (!payload.titulo) throw new Error('Es obligatorio capturar el titulo de la visita.');
    if (payload.referencia_origen && !payload.referencia_id || !payload.referencia_origen && payload.referencia_id) {
      throw new Error('Origen e ID de referencia deben capturarse juntos.');
    }
    payload.fecha_programada_utc = mexicoInputToUtc(values.fecha_programada_local || '');
    return payload;
  }
  async function showDetail(rawId) {
    const id = safePositiveId(rawId);
    if (!id || !isActive()) return;
    const request = ++state.detailRequest;
    openDialog('Detalle de visita #' + id, '<div class="cxv-loading">Cargando detalle…</div>');
    try {
      const data = await requestApi(`${API}/${id}`, { method: 'GET' });
      if (request !== state.detailRequest || !isActive() || !state.dialog) return;
      if (!data.visita) throw new Error('No se recibio el detalle de la visita.');
      const row = data.visita;
      state.selected = row;
      const target = byId('cxv-dialog-content');
      if (!target) return;
      target.innerHTML = `<div class="cxv-detail">
        <div class="cxv-detail-title"><strong>${printable(row.titulo)}</strong><span class="cxv-state">${printable(row.estado)}</span></div>
        <dl class="cxv-detail-grid">
          ${detailsPair('ID', row.id_visita)}
          ${detailsPair('Fecha programada', formattedDate(row.fecha_programada_utc))}
          ${detailsPair('Proyecto', row.proyecto_nombre)}
          ${detailsPair('Cliente', row.cliente_nombre)}
          ${detailsPair('Ubicacion', row.ubicacion)}
          ${detailsPair('Responsable · ID', row.id_usuario_responsable)}
          ${detailsPair('Creador · ID', row.id_usuario_creador)}
          ${detailsPair('Origen', row.referencia_origen)}
          ${detailsPair('Referencia ID', row.referencia_id)}
          ${detailsPair('Objetivo', row.objetivo)}
          ${detailsPair('Observaciones', row.observaciones)}
          ${detailsPair('Creada', formattedDate(row.created_at))}
          ${detailsPair('Ultima modificacion', formattedDate(row.updated_at))}
        </dl>
        <p class="cxv-help">Las acciones de escritura dependen de tu permiso y del alcance real del backend.</p>
        <div class="cxv-form-actions">
          ${may('history') ? `<button class="cxv-button cxv-secondary" data-cxv-action="history" data-id="${escapeHtml(id)}" type="button">Ver historial</button>` : ''}
          ${may('edit') ? `<button class="cxv-button cxv-primary" data-cxv-action="edit" data-id="${escapeHtml(id)}" type="button">Editar</button>` : ''}
          ${may('deactivate') ? `<button class="cxv-button cxv-danger" data-cxv-action="deactivate" data-id="${escapeHtml(id)}" type="button">Desactivar</button>` : ''}
        </div></div>`;
    } catch (error) {
      if (request !== state.detailRequest || !isActive()) return;
      openDialog('Detalle no disponible', '<div class="cxv-feedback cxv-error">' + escapeHtml(displayError(error)) + '</div>');
    }
  }
  function openForm(row) {
    if (!may(row ? 'edit' : 'create')) return;
    state.selected = row || null;
    state.detailRequest += 1;
    openDialog(row ? 'Editar visita #' + row.id_visita : 'Nueva visita', formHtml(row));
    byId('cxv-edit-form')?.querySelector('[name="titulo"]')?.focus();
  }
  function detailText(raw) {
    let value = raw;
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch (_) { value = null; }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Sin detalle adicional';
    const fields = Array.isArray(value.campos) ? value.campos.map(String).join(', ') : '';
    const estado = value.estado ? ` · estado ${value.estado}` : '';
    return fields ? `Campos: ${fields}${estado}` : (value.estado_anterior ? `Estado anterior: ${value.estado_anterior}` : 'Evento registrado');
  }
  async function showHistory(rawId, page = 1) {
    if (!may('history')) return;
    const id = safePositiveId(rawId);
    if (!id) return;
    const request = ++state.detailRequest;
    openDialog(`Historial de visita #${id}`, '<div class="cxv-loading">Consultando historial…</div>');
    try {
      const query = new URLSearchParams({ page: String(page), page_size: '25' });
      const data = await requestApi(`${API}/${id}/historial?${query}`, { method: 'GET' });
      if (request !== state.detailRequest || !isActive()) return;
      if (!Array.isArray(data.eventos)) throw new Error('Formato de historial no valido.');
      const body = byId('cxv-dialog-content');
      if (!body) return;
      const totalPages = Math.max(1, Math.ceil(Number(data.total || 0) / 25));
      body.innerHTML = `<div class="cxv-history">
        ${data.eventos.length ? data.eventos.map(item => `<article class="cxv-history-item">
          <div><strong>${printable(item.accion)}</strong><span>${escapeHtml(formattedDate(item.created_at))}</span></div>
          <p>${escapeHtml(detailText(item.detalle))}</p>
          <small>Evento #${printable(item.id_evento)} · actor usuario #${printable(item.id_actor_usuario)}</small>
        </article>`).join('') : '<div class="cxv-empty">No hay eventos registrados.</div>'}
        <div class="cxv-pager"><span>Pagina ${page} de ${totalPages}</span><div>
          <button class="cxv-button cxv-secondary" data-cxv-action="history-page" data-id="${escapeHtml(id)}" data-page="${page - 1}" type="button" ${page <= 1 ? 'disabled' : ''}>← Anterior</button>
          <button class="cxv-button cxv-secondary" data-cxv-action="history-page" data-id="${escapeHtml(id)}" data-page="${page + 1}" type="button" ${page >= totalPages ? 'disabled' : ''}>Siguiente →</button>
        </div></div><div class="cxv-form-actions"><button class="cxv-button cxv-secondary" data-cxv-action="detail" data-id="${escapeHtml(id)}" type="button">Volver al detalle</button></div></div>`;
    } catch (error) {
      if (request !== state.detailRequest || !isActive()) return;
      openDialog('Historial no disponible', '<div class="cxv-feedback cxv-error">' + escapeHtml(displayError(error)) + '</div>');
    }
  }
  async function save(form) {
    if (state.busy) return;
    let payload;
    try { payload = normalizeForm(form); }
    catch (error) { setMessage(error.message, 'error'); setDialogError(error.message); return; }
    const mode = form.dataset.mode;
    const id = state.selected?.id_visita;
    if (mode === 'edit' && (!safePositiveId(id) || !may('edit'))) return;
    if (mode === 'create' && !may('create')) return;
    state.busy = true;
    const button = byId('cxv-save');
    if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
    setMessage('');
    try {
      await requestApi(mode === 'edit' ? `${API}/${id}` : API, {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!isActive()) return;
      closeDialog();
      if (mode === 'create') state.page = 1;
      await load();
      setMessage(mode === 'edit' ? 'Visita actualizada correctamente.' : 'Visita registrada correctamente.', 'success');
    } catch (error) {
      if (isActive()) {
        setMessage(displayError(error), 'error');
        setDialogError(displayError(error));
      }
    } finally {
      state.busy = false;
      const current = byId('cxv-save');
      if (current) { current.disabled = false; current.textContent = mode === 'edit' ? 'Guardar cambios' : 'Registrar visita'; }
    }
  }
  async function deactivate(rawId) {
    const id = safePositiveId(rawId);
    if (!id || !may('deactivate') || state.busy) return;
    if (!window.confirm('¿Desactivar la visita #' + id + '? Esta accion conserva el historial.')) return;
    state.busy = true;
    try {
      await requestApi(`${API}/${id}`, { method: 'DELETE' });
      if (!isActive()) return;
      closeDialog();
      await load();
      setMessage('La visita fue desactivada. Su historial permanece disponible.', 'success');
    } catch (error) { if (isActive()) setMessage(displayError(error), 'error'); }
    finally { state.busy = false; }
  }
  function readFilters(form) {
    const values = Object.fromEntries(new FormData(form));
    const responsable = String(values.id_usuario_responsable || '').trim();
    if (responsable && !safePositiveId(responsable)) {
      throw new Error('ID responsable invalido: debe ser un numero entero positivo.');
    }
    const desde = String(values.desde || '').trim();
    const hasta = String(values.hasta || '').trim();
    if (desde && hasta && desde > hasta) throw new Error('La fecha Desde no puede ser posterior a Hasta.');
    return {
      q: String(values.q || '').trim(),
      estado: String(values.estado || ''),
      id_usuario_responsable: responsable,
      desde, hasta
    };
  }
  function onSubmit(event) {
    if (event.target?.id === 'cxv-history-lookup-form') {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.target));
      const id = safePositiveId(values.id_visita);
      if (!id) {
        setMessage('Captura un ID de visita valido.', 'error');
        return;
      }
      if (!may('history')) {
        setMessage('No tienes permiso para consultar el historial.', 'error');
        return;
      }
      void showHistory(id);
      return;
    }
    if (event.target?.id === 'cxv-filter-form') {
      event.preventDefault();
      try {
        state.filters = readFilters(event.target);
        state.page = 1;
        load();
      } catch (error) { setMessage(error.message, 'error'); }
      return;
    }
    if (event.target?.id === 'cxv-edit-form') {
      event.preventDefault();
      save(event.target);
    }
  }
  function onClick(event) {
    const action = event.target?.closest?.('[data-cxv-action]');
    if (!action || !state.root?.contains(action) || action.disabled) return;
    const type = action.dataset.cxvAction;
    if (type === 'refresh') return void load();
    if (type === 'new') return void openForm(null);
    if (type === 'close') return void closeDialog();
    if (type === 'clear') {
      state.filters = { q: '', estado: 'BORRADOR', id_usuario_responsable: '', desde: '', hasta: '' };
      state.page = 1;
      byId('cxv-filter-form')?.reset();
      return void initFilterValuesAndLoad();
    }
    if (type === 'prev' && state.page > 1) { state.page -= 1; return void load(); }
    if (type === 'next' && state.page * state.pageSize < state.total) { state.page += 1; return void load(); }
    if (type === 'detail') return void showDetail(action.dataset.id);
    if (type === 'history') return void showHistory(action.dataset.id);
    if (type === 'history-page') return void showHistory(action.dataset.id, Number(action.dataset.page));
    if (type === 'edit') return void openForm(state.selected);
    if (type === 'deactivate') return void deactivate(action.dataset.id);
  }
  function initFilterValuesAndLoad() {
    const form = byId('cxv-filter-form');
    if (form) {
      form.elements.q.value = state.filters.q;
      form.elements.estado.value = state.filters.estado;
      form.elements.id_usuario_responsable.value = state.filters.id_usuario_responsable;
      form.elements.desde.value = state.filters.desde;
      form.elements.hasta.value = state.filters.hasta;
    }
    load();
  }
  async function init() {
    const view = byId('view-placeholder');
    if (!view || !isCurrentRoute()) return false;
    state.root = view;
    state.listRequest += 1;
    state.detailRequest += 1;
    state.selected = null;
    state.dialog = false;
    state.busy = false;
    view.innerHTML = shell();
    // El contenedor se reutiliza entre navegaciones: no duplicar listeners.
    // El overlay SI se reemplaza y debe recibir su handler en cada render.
    if (!view.__bltCxVisitasEventsBound) {
      view.__bltCxVisitasEventsBound = true;
      view.addEventListener('submit', onSubmit);
      view.addEventListener('click', onClick);
    }
    view.querySelector('#cxv-dialog-overlay')?.addEventListener('click', event => {
      if (event.target.id === 'cxv-dialog-overlay') closeDialog();
    });
    const subtitle = byId('app-context-subtitle');
    if (subtitle) subtitle.textContent = 'Customer Experience · Visitas · Aiven';
    state.initialized = true;
    await load();
    return true;
  }
  // El evento se instala una sola vez. No se alteran rutas ajenas ni el router.
  if (!window.__BLT_CX_VISITAS_KEYBOARD_BOUND__) {
    window.__BLT_CX_VISITAS_KEYBOARD_BOUND__ = true;
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && state.dialog && isCurrentRoute()) closeDialog();
    });
  }

  window.ManttoCustomerExperienceVisitas = Object.freeze({
    init,
    __test: Object.freeze({
      escapeHtml, safePositiveId, pathWithQuery, mexicoInputToUtc,
      inputDateMexico, formattedDate, detailText, readFilters, may
    })
  });
})();
