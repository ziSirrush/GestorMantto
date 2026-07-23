(function () {
  'use strict';

  const SS_STATE = {
    root: null,
    rows: [],
    filteredRows: [],
    initialized: false,
    loading: false,
    currentTicket: null,
    supportUsers: [],
    saving: false,
    mode: 'support',
    backRoute: 'soporte-solicitudes'
  };

  function ssById(id) {
    return SS_STATE.root ? SS_STATE.root.querySelector('#' + id) : null;
  }

  function ssApiBase() {
    return String(window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  }

  function ssAuthHeaders(json) {
    const base = Object.assign(
      { Accept: 'application/json' },
      window.ManttoAuth && typeof window.ManttoAuth.authHeaders === 'function'
        ? window.ManttoAuth.authHeaders()
        : {}
    );
    if (json) base['Content-Type'] = 'application/json';
    return base;
  }

  function ssEscape(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ssNormalize(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  function ssFirst(source, keys, fallback) {
    for (const key of keys) {
      if (source && source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
    }
    return fallback === undefined ? null : fallback;
  }

  function ssFormatDateTime(value) {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const parts = new Intl.DateTimeFormat('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).formatToParts(date).reduce(function (acc, part) {
      acc[part.type] = part.value;
      return acc;
    }, {});
    return parts.day + '/' + parts.month + '/' + parts.year +
      ' - ' + parts.hour + ':' + parts.minute + ':' + parts.second + ' hrs';
  }

  function ssUnique(values) {
    return Array.from(new Set(values.filter(Boolean))).sort(function (a, b) {
      return a.localeCompare(b, 'es', { sensitivity: 'base' });
    });
  }

  function ssFillSelect(select, values) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Todos</option>' + values.map(function (value) {
      return '<option value="' + ssEscape(value) + '">' + ssEscape(value) + '</option>';
    }).join('');
    select.value = values.includes(current) ? current : '';
  }

  function ssSetStatus(text, mode) {
    const status = ssById('ss-status');
    if (!status) return;
    status.className = 'ss-status ' + (mode ? 'is-' + mode : 'is-ready');
    const label = status.querySelector('span:last-child');
    if (label) label.textContent = text;
  }

  function ssNormalizeRow(row) {
    return Object.assign({}, row, {
      id_solicitud: ssFirst(row, ['id_solicitud', 'id_ticket', 'id_sup_ticket', 'id']),
      numero_solicitud: ssFirst(row, ['numero_solicitud', 'folio', 'ticket', 'numero_ticket'], '—'),
      asunto: ssFirst(row, ['asunto', 'asunto_ticket', 'titulo', 'subject'], '—'),
      modulo: ssFirst(row, ['modulo', 'modulo_ticket', 'modulo_afectado', 'categoria'], '—'),
      estado: ssFirst(row, ['estado', 'estado_ticket', 'status'], '—'),
      fecha_incidente: ssFirst(row, ['fecha_incidente', 'incident_at', 'fecha_creacion', 'created_at']),
      fecha_ultimo_mensaje: ssFirst(row, ['fecha_ultimo_mensaje', 'fecha_ultima_respuesta', 'fecha_actualizacion', 'updated_at', 'fecha_creacion', 'created_at'])
    });
  }

  function ssRenderFilters() {
    ssFillSelect(ssById('ss-filter-status'), ssUnique(SS_STATE.rows.map(function (row) { return row.estado || ''; })));
    ssFillSelect(ssById('ss-filter-module'), ssUnique(SS_STATE.rows.map(function (row) { return row.modulo || ''; })));
  }

  function ssApplyFilters() {
    const query = ssNormalize(ssById('ss-search') ? ssById('ss-search').value : '');
    const status = ssById('ss-filter-status') ? ssById('ss-filter-status').value : '';
    const moduleName = ssById('ss-filter-module') ? ssById('ss-filter-module').value : '';
    SS_STATE.filteredRows = SS_STATE.rows.filter(function (row) {
      const haystack = ssNormalize([row.numero_solicitud, row.asunto, row.modulo, row.estado].join(' '));
      return (!query || haystack.includes(query)) &&
        (!status || row.estado === status) &&
        (!moduleName || row.modulo === moduleName);
    });
    ssRenderTable();
  }

  function ssRenderTable() {
    const body = ssById('ss-table-body');
    const count = ssById('ss-count');
    if (!body) return;
    const total = SS_STATE.filteredRows.length;
    if (count) count.textContent = total + (total === 1 ? ' solicitud' : ' solicitudes');
    if (!total) {
      body.innerHTML = '<tr><td colspan="8" class="ss-empty">No hay solicitudes de soporte para los filtros seleccionados.</td></tr>';
      return;
    }
    body.innerHTML = SS_STATE.filteredRows.map(function (row) {
      const id = ssEscape(row.id_solicitud || row.numero_solicitud || '');
      const state = ssNormalize(row.estado);
      return '<tr>' +
        '<td class="ss-col-action"><button type="button" class="ss-action-btn" data-ss-action="edit" data-ss-id="' + id + '" title="Editar solicitud">✏️</button></td>' +
        '<td class="ss-col-action"><button type="button" class="ss-action-btn" data-ss-action="view" data-ss-id="' + id + '" title="Ver solicitud">👁️</button></td>' +
        '<td><span class="ss-request-number">' + ssEscape(row.numero_solicitud || '—') + '</span></td>' +
        '<td class="ss-subject">' + ssEscape(row.asunto || '—') + '</td>' +
        '<td>' + ssEscape(row.modulo || '—') + '</td>' +
        '<td><span class="ss-state" data-state="' + ssEscape(state) + '">' + ssEscape(row.estado || '—') + '</span></td>' +
        '<td class="ss-date">' + ssEscape(ssFormatDateTime(row.fecha_incidente)) + '</td>' +
        '<td class="ss-date">' + ssEscape(ssFormatDateTime(row.fecha_ultimo_mensaje)) + '</td>' +
      '</tr>';
    }).join('');
  }

  async function ssFetchJson(url, options) {
    const config = Object.assign({}, options || {});
    config.headers = Object.assign({}, ssAuthHeaders(Boolean(config.body)), config.headers || {});
    const response = await fetch(url, config);
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) throw new Error(data && data.message ? data.message : 'Respuesta inválida del servidor.');
    return data;
  }

  async function ssLoad() {
    if (SS_STATE.loading) return;
    SS_STATE.loading = true;
    ssSetStatus('Cargando solicitudes...', 'loading');
    try {
      const endpoint = SS_STATE.mode === 'requester' ? '/api/support/tickets/mias' : '/api/support/tickets';
      const json = await ssFetchJson(ssApiBase() + endpoint);
      setData(Array.isArray(json) ? json : (json.data || []));
      ssSetStatus('Datos actualizados', 'ready');
    } catch (error) {
      setData([]);
      ssSetStatus(error.message || 'No se pudieron cargar las solicitudes', 'error');
    } finally {
      SS_STATE.loading = false;
    }
  }

  function ssSetText(id, value) {
    const el = ssById(id);
    if (el) el.textContent = value === undefined || value === null || value === '' ? '—' : String(value);
  }

  function ssParseJson(value, fallback) {
    if (Array.isArray(value) || (value && typeof value === 'object')) return value;
    try { return value ? JSON.parse(value) : fallback; } catch (error) { return fallback; }
  }

  function ssInitials(name) {
    return String(name || 'S').split(/\s+/).filter(Boolean).slice(0, 2)
      .map(function (part) { return part.charAt(0).toUpperCase(); }).join('') || 'S';
  }

  function ssFileUrl(file) {
    const raw = ssFirst(file, ['url', 'ruta_archivo', 'ruta', 'path', 'href']);
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return ssApiBase() + (String(raw).charAt(0) === '/' ? raw : '/' + raw);
  }

  function ssRenderChat(ticket) {
    const container = ssById('ss-chat-history');
    if (!container) return;
    let interactions = ssParseJson(ssFirst(ticket, ['historial', 'interacciones', 'mensajes', 'history', 'bitacora'], []), []);
    if (!Array.isArray(interactions)) interactions = [];
    const comments = interactions.filter(function (item) {
      return ssNormalize(ssFirst(item, ['accion', 'tipo'], '')) === 'comentario' ||
        Boolean(ssFirst(item, ['mensaje', 'comentario', 'texto']));
    });
    if (!comments.length) {
      container.innerHTML = '<div class="ss-empty">No hay comentarios registrados.</div>';
      return;
    }
    container.innerHTML = comments.map(function (item) {
      const user = ssFirst(item, ['usuario', 'nombre_usuario', 'autor', 'created_by'], 'Sistema');
      const text = ssFirst(item, ['mensaje', 'comentario', 'texto', 'descripcion'], 'Comentario registrado');
      const date = ssFirst(item, ['fecha', 'fecha_creacion', 'created_at', 'timestamp']);
      return '<article class="ss-chat-message">' +
        '<div class="ss-chat-avatar">' + ssEscape(ssInitials(user)) + '</div>' +
        '<div class="ss-chat-bubble"><div class="ss-chat-meta"><strong>' + ssEscape(user) + '</strong><time>' + ssEscape(ssFormatDateTime(date)) + '</time></div>' +
        '<p>' + ssEscape(text) + '</p></div></article>';
    }).join('');
    container.scrollTop = container.scrollHeight;
  }

  function ssRenderFiles(ticket) {
    const container = ssById('ss-files-list');
    if (!container) return;
    let files = ssParseJson(ssFirst(ticket, ['adjuntos', 'archivos', 'files'], []), []);
    if (!Array.isArray(files)) files = [];
    if (!files.length) {
      container.innerHTML = '<div class="ss-empty">No hay archivos adjuntos.</div>';
      return;
    }
    container.innerHTML = files.map(function (file) {
      const name = ssFirst(file, ['nombre_original', 'nombre', 'name', 'filename', 'archivo'], 'Archivo');
      const type = ssFirst(file, ['mime_type', 'tipo_archivo', 'type'], 'Archivo');
      const size = Number(ssFirst(file, ['peso_archivo', 'size'], 0));
      const sizeText = size > 0 ? (size / 1024 / 1024).toFixed(2) + ' MB' : '';
      const url = ssFileUrl(file);
      return '<article class="ss-file-item"><div class="ss-file-icon">📎</div><div><strong>' + ssEscape(name) + '</strong><span>' + ssEscape([type, sizeText].filter(Boolean).join(' · ')) + '</span></div>' +
        (url ? '<a href="' + ssEscape(url) + '" target="_blank" rel="noopener noreferrer">Abrir</a>' : '') + '</article>';
    }).join('');
  }

  function ssFillSupportUsers(selectedId) {
    const select = ssById('ss-edit-assigned');
    if (!select) return;
    select.innerHTML = '<option value="">Sin asignar</option>' + SS_STATE.supportUsers.map(function (user) {
      const id = ssFirst(user, ['id_usuario', 'id_SB', 'id']);
      const name = ssFirst(user, ['nombre', 'usuario_nombre'], 'Usuario');
      return '<option value="' + ssEscape(id) + '">' + ssEscape(name) + '</option>';
    }).join('');
    select.value = selectedId == null ? '' : String(selectedId);
  }

  function ssRenderDetail(ticket) {
    SS_STATE.currentTicket = ticket;
    const number = ssFirst(ticket, ['numero_solicitud', 'folio', 'ticket', 'numero_ticket'], 'Solicitud');
    const state = ssFirst(ticket, ['estado', 'estado_ticket', 'status'], '—');
    const priority = ssFirst(ticket, ['prioridad', 'prioridad_ticket', 'priority'], 'Media');
    const assignedId = ssFirst(ticket, ['id_soporte', 'soporte_id', 'asignado_a']);
    const assignedName = ssFirst(ticket, ['soporte_nombre', 'asignado_a_nombre', 'nombre_asignado'], 'Sin asignar');

    const subject = ssFirst(ticket, ['asunto', 'asunto_ticket', 'titulo', 'subject'], 'Solicitud de soporte');
    ssSetText('ss-detail-title', subject);
    ssSetText('ss-detail-subtitle', number);
    ssSetText('ss-detail-state', state);
    const stateChip = ssById('ss-detail-state');
    if (stateChip) stateChip.dataset.state = ssNormalize(state);

    ssSetText('ss-d-number', number);
    ssSetText('ss-d-priority', priority);
    ssSetText('ss-d-module', ssFirst(ticket, ['modulo', 'modulo_ticket', 'modulo_afectado', 'categoria']));
    ssSetText('ss-d-subject', ssFirst(ticket, ['asunto', 'asunto_ticket', 'titulo', 'subject']));
    ssSetText('ss-d-status', state);
    ssSetText('ss-d-assigned', assignedName);
    ssSetText('ss-d-user', ssFirst(ticket, ['usuario_nombre', 'nombre_usuario', 'usuario', 'solicitante']));
    ssSetText('ss-d-email', ssFirst(ticket, ['usuario_correo', 'correo_usuario', 'correo', 'email']));
    ssSetText('ss-d-company', ssFirst(ticket, ['usuario_empresa', 'empresa_usuario', 'empresa']));
    ssSetText('ss-d-created', ssFormatDateTime(ssFirst(ticket, ['fecha_creacion', 'created_at'])));
    ssSetText('ss-d-estimated', ssFormatDateTime(ssFirst(ticket, ['fecha_estimada_solucion', 'fecha_compromiso', 'estimated_resolution_at'])));
    ssSetText('ss-d-technical-close', ssFormatDateTime(ssFirst(ticket, ['fecha_cierre_tecnico', 'technical_closed_at', 'fecha_cierre'])));
    ssSetText('ss-d-incident', ssFormatDateTime(ssFirst(ticket, ['fecha_incidente', 'incident_at', 'fecha_creacion', 'created_at'])));

    const editor = SS_STATE.root.querySelector('.ss-ticket-editor');
    if (editor) editor.hidden = SS_STATE.mode === 'requester';
    const prioritySelect = ssById('ss-edit-priority');
    const statusSelect = ssById('ss-edit-status');
    if (prioritySelect) prioritySelect.value = String(priority || 'Media');
    if (statusSelect) statusSelect.value = String(state || 'Abierto');
    ssFillSupportUsers(assignedId);
    ssRenderChat(ticket);
    ssRenderFiles(ticket);
  }

  async function ssLoadCatalogs() {
    try {
      const json = await ssFetchJson(ssApiBase() + '/api/support/tickets/catalogos');
      SS_STATE.supportUsers = (json.data && json.data.usuarios_soporte) || [];
    } catch (error) {
      SS_STATE.supportUsers = [];
    }
  }

  function ssEnsureContextSaveButton() {
    let button = document.getElementById('ss-context-save');
    if (button) return button;
    const host = document.querySelector('#app-context-nav .app-context-inner');
    if (!host) return null;
    button = document.createElement('button');
    button.id = 'ss-context-save';
    button.type = 'button';
    button.className = 'ss-context-save';
    button.textContent = 'Guardar cambios';
    button.hidden = true;
    button.addEventListener('click', ssSaveTicket);
    host.appendChild(button);
    return button;
  }

  function ssSetContextDetail(active) {
    const button = ssEnsureContextSaveButton();
    if (button) button.hidden = !active;
  }

  function ssIsDetailVisible() {
    const detail = ssById('ss-detail-view');
    return Boolean(detail && !detail.hidden);
  }

  function ssShowDetail() {
    const list = ssById('ss-list-view');
    const detail = ssById('ss-detail-view');
    if (list) list.hidden = true;
    if (detail) detail.hidden = false;
    ssSetContextDetail(SS_STATE.mode !== 'requester');
    SS_STATE.root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function ssShowList() {
    const list = ssById('ss-list-view');
    const detail = ssById('ss-detail-view');
    if (detail) detail.hidden = true;
    if (list) list.hidden = false;
    ssSetContextDetail(false);
    SS_STATE.currentTicket = null;
  }

  async function ssOpenDetail(id) {
    ssShowDetail();
    ssSetText('ss-detail-title', 'Cargando solicitud...');
    ssSetText('ss-detail-subtitle', 'Consultando información actualizada.');
    try {
      if (SS_STATE.mode !== 'requester') await ssLoadCatalogs();
      const endpoint = SS_STATE.mode === 'requester' ? '/api/support/tickets/mias/' : '/api/support/tickets/';
      const json = await ssFetchJson(ssApiBase() + endpoint + encodeURIComponent(id));
      ssRenderDetail(json.data || json);
      await ssLoad();
    } catch (error) {
      ssSetText('ss-detail-title', 'No se pudo abrir la solicitud');
      ssSetText('ss-detail-subtitle', error.message || 'Error consultando el detalle.');
    }
  }

  async function ssSaveTicket() {
    if (SS_STATE.mode === 'requester' || !SS_STATE.currentTicket || SS_STATE.saving) return;
    const id = ssFirst(SS_STATE.currentTicket, ['id_ticket', 'id_solicitud', 'id']);
    const payload = {
      prioridad_ticket: ssById('ss-edit-priority') ? ssById('ss-edit-priority').value : '',
      estado_ticket: ssById('ss-edit-status') ? ssById('ss-edit-status').value : '',
      id_soporte: ssById('ss-edit-assigned') ? ssById('ss-edit-assigned').value : ''
    };
    SS_STATE.saving = true;
    try {
      await ssFetchJson(ssApiBase() + '/api/support/tickets/' + encodeURIComponent(id), {
        method: 'PATCH', body: JSON.stringify(payload)
      });
      const detailEndpoint = SS_STATE.mode === 'requester' ? '/api/support/tickets/mias/' : '/api/support/tickets/';
      const refreshed = await ssFetchJson(ssApiBase() + detailEndpoint + encodeURIComponent(id));
      ssRenderDetail(refreshed.data || refreshed);
      await ssLoad();
      alert('Solicitud actualizada correctamente.');
    } catch (error) {
      alert(error.message || 'No se pudo actualizar la solicitud.');
    } finally {
      SS_STATE.saving = false;
    }
  }

  async function ssSendComment(event) {
    event.preventDefault();
    if (!SS_STATE.currentTicket) return;
    const textarea = ssById('ss-comment-text');
    const message = textarea ? textarea.value.trim() : '';
    if (!message) return;
    const id = ssFirst(SS_STATE.currentTicket, ['id_ticket', 'id_solicitud', 'id']);
    try {
      await ssFetchJson(ssApiBase() + '/api/support/tickets/' + encodeURIComponent(id) + '/comentarios', {
        method: 'POST', body: JSON.stringify({ comentario: message })
      });
      textarea.value = '';
      const detailEndpoint = SS_STATE.mode === 'requester' ? '/api/support/tickets/mias/' : '/api/support/tickets/';
      const refreshed = await ssFetchJson(ssApiBase() + detailEndpoint + encodeURIComponent(id));
      ssRenderDetail(refreshed.data || refreshed);
      await ssLoad();
    } catch (error) {
      alert(error.message || 'No se pudo enviar el comentario.');
    }
  }

  function ssReadFile(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('No se pudo leer el archivo.')); };
      reader.readAsDataURL(file);
    });
  }

  async function ssUploadFile() {
    if (!SS_STATE.currentTicket) return;
    const input = ssById('ss-file-input');
    const file = input && input.files ? input.files[0] : null;
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert('El archivo excede el límite de 8 MB.');
      return;
    }
    const id = ssFirst(SS_STATE.currentTicket, ['id_ticket', 'id_solicitud', 'id']);
    try {
      const data = await ssReadFile(file);
      await ssFetchJson(ssApiBase() + '/api/support/tickets/' + encodeURIComponent(id) + '/adjuntos', {
        method: 'POST',
        body: JSON.stringify({ archivo: { name: file.name, type: file.type, size: file.size, data: data } })
      });
      input.value = '';
      const detailEndpoint = SS_STATE.mode === 'requester' ? '/api/support/tickets/mias/' : '/api/support/tickets/';
      const refreshed = await ssFetchJson(ssApiBase() + detailEndpoint + encodeURIComponent(id));
      ssRenderDetail(refreshed.data || refreshed);
      await ssLoad();
    } catch (error) {
      alert(error.message || 'No se pudo subir el archivo.');
    }
  }

  function ssHandleTableClick(event) {
    const button = event.target.closest('[data-ss-action]');
    if (!button || !SS_STATE.root.contains(button)) return;
    ssOpenDetail(button.dataset.ssId);
  }

  function ssBindAccordionEvents() {
    SS_STATE.root.querySelectorAll('[data-ss-accordion] .ss-accordion-head').forEach(function (button) {
      button.addEventListener('click', function () {
        const accordion = button.closest('[data-ss-accordion]');
        const open = !accordion.classList.contains('is-open');
        accordion.classList.toggle('is-open', open);
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
  }

  function ssBindEvents() {
    const search = ssById('ss-search');
    const status = ssById('ss-filter-status');
    const moduleName = ssById('ss-filter-module');
    const clear = ssById('ss-clear');
    const refresh = ssById('ss-refresh');
    const body = ssById('ss-table-body');
    const commentForm = ssById('ss-comment-form');
    const upload = ssById('ss-file-upload');

    if (search) search.addEventListener('input', ssApplyFilters);
    if (status) status.addEventListener('change', ssApplyFilters);
    if (moduleName) moduleName.addEventListener('change', ssApplyFilters);
    if (body) body.addEventListener('click', ssHandleTableClick);
    if (commentForm) commentForm.addEventListener('submit', ssSendComment);
    if (upload) upload.addEventListener('click', ssUploadFile);
    if (clear) clear.addEventListener('click', function () {
      if (search) search.value = '';
      if (status) status.value = '';
      if (moduleName) moduleName.value = '';
      ssApplyFilters();
    });
    if (refresh) refresh.addEventListener('click', ssLoad);
    if (!document.documentElement.dataset.ssContextBound) {
      document.documentElement.dataset.ssContextBound = '1';
      const contextBack = document.getElementById('app-back-btn');
      if (contextBack) {
        contextBack.addEventListener('click', function (event) {
          if (!ssIsDetailVisible()) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          if (SS_STATE.mode === 'requester' && window.ManttoRouter) window.ManttoRouter.go(SS_STATE.backRoute || 'help', { section: 'my-requests' });
          else ssShowList();
        }, true);
      }
      document.addEventListener('mantto:navigation', function (event) {
        const route = event && event.detail ? event.detail.route : '';
        if (route !== 'soporte-solicitudes') ssSetContextDetail(false);
      });
    }
    ssEnsureContextSaveButton();
    ssBindAccordionEvents();
  }

  function init(root, options) {
    options = options || {};
    SS_STATE.mode = options.mode === 'requester' ? 'requester' : 'support';
    SS_STATE.backRoute = options.backRoute || (SS_STATE.mode === 'requester' ? 'help' : 'soporte-solicitudes');
    const target = typeof root === 'string' ? document.querySelector(root) : root;
    if (!target) return false;
    if (SS_STATE.initialized && SS_STATE.root === target) {
      if (SS_STATE.mode === 'support') ssShowList();
      ssLoad();
      return true;
    }
    SS_STATE.root = target;
    SS_STATE.initialized = true;
    ssSetContextDetail(false);
    const list = ssById('ss-list-view');
    if (list) list.hidden = SS_STATE.mode === 'requester';
    ssBindEvents();
    ssRenderFilters();
    ssApplyFilters();
    ssSetStatus('Vista preparada', 'ready');
    ssLoad();
    return true;
  }

  function setData(rows) {
    SS_STATE.rows = (Array.isArray(rows) ? rows : []).map(ssNormalizeRow);
    SS_STATE.filteredRows = SS_STATE.rows.slice();
    if (SS_STATE.initialized) {
      ssRenderFilters();
      ssApplyFilters();
    }
  }

  window.ManttoSoporteSolicitudes = {
    init: init,
    load: ssLoad,
    setData: setData,
    setStatus: ssSetStatus,
    openDetail: ssOpenDetail,
    openRequesterDetail: function (id) { SS_STATE.mode = 'requester'; SS_STATE.backRoute = 'help'; return ssOpenDetail(id); },
    formatDateTime: ssFormatDateTime
  };
}());
