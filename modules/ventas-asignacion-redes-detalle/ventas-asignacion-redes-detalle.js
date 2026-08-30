(function () {
  'use strict';

  const API = (window.MANTTO_API_BASE || '').replace(/\/$/, '');
  const state = { canManage: false, id: null, record: null, catalogs: null, quotations: [], busy: false };
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function headers(json = true) {
    return Object.assign(
      json ? { Accept: 'application/json', 'Content-Type': 'application/json' } : { Accept: 'application/json' },
      window.ManttoAuth?.authHeaders?.() || {}
    );
  }

  async function req(path, options = {}) {
    const opts = Object.assign({ cache: 'no-store' }, options);
    const form = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    opts.headers = Object.assign({}, headers(opts.body !== undefined && !form), options.headers || {});
    const response = await fetch(API + path, opts);
    const text = await response.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; }
    catch (_error) { throw new Error('El backend respondió contenido no JSON.'); }
    if (!response.ok || json.ok === false) throw new Error(json.message || `Error HTTP ${response.status}`);
    return json;
  }

  function status(text, error = false) {
    const element = $('#vard-status');
    if (!element) return;
    element.className = `vard-status${error ? ' error' : ' ok'}`;
    element.querySelector('span').textContent = text;
  }

  function toast(text, error = false) {
    const element = $('#vard-toast');
    if (!element) return;
    element.textContent = text;
    element.className = `vard-toast show${error ? ' error' : ''}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { element.className = 'vard-toast'; }, 3200);
  }

  function fmt(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function initials(row) {
    const raw = row?.usuario_iniciales || row?.iniciales || row?.usuario_nombre || 'U';
    return String(raw).trim().split(/\s+/).map((item) => item[0] || '').join('').slice(0, 2).toUpperCase() || 'U';
  }

  function field(label, value, wide = false) {
    return `<div class="vard-field${wide ? ' wide' : ''}"><span>${esc(label)}</span><strong>${esc(value || '—')}</strong></div>`;
  }

  function title(record) {
    return [record.nombre_contacto, record.nombre_proyecto, record.nombre_empresa].filter(Boolean).join(' · ') || 'Detalle de Asignación a Redes';
  }

  function rId(value) {
    return value == null ? '' : String(value);
  }

  function ensurePhaseStyles() {
    if (document.getElementById('vard-phase2-styles')) return;
    const style = document.createElement('style');
    style.id = 'vard-phase2-styles';
    style.textContent = `
      .vard-image-preview{cursor:zoom-in}.vard-lightbox{position:fixed;inset:0;z-index:10050;background:rgba(8,18,38,.92);display:grid;grid-template-rows:auto minmax(0,1fr);padding:16px}
      .vard-lightbox[hidden]{display:none!important}.vard-lightbox-head{display:flex;align-items:center;justify-content:space-between;gap:14px;color:#fff;padding:4px 4px 12px}.vard-lightbox-close{border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:8px 12px;font-weight:900;cursor:pointer}
      .vard-lightbox-body{min-height:0;display:grid;place-items:center}.vard-lightbox-body img{max-width:96vw;max-height:84vh;object-fit:contain;border-radius:10px;background:#fff}
      .vard-history-event .vard-avatar{background:#dbeafe;color:#1d4ed8}.vard-history-event .vard-message-body{border-color:#93b4e8;background:#f5f9ff}.vard-history-event-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.vard-history-event-title b{color:#0f4ccf}.vard-history-arrow{font-weight:900;color:#64748b}.vard-history-event small{display:block;color:#64748b;margin-top:5px}
    `;
    document.head.appendChild(style);
  }

  function ensureLightbox() {
    let box = document.getElementById('vard-lightbox');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'vard-lightbox';
    box.className = 'vard-lightbox';
    box.hidden = true;
    box.innerHTML = '<div class="vard-lightbox-head"><strong id="vard-lightbox-title">Imagen</strong><button class="vard-lightbox-close" type="button">Cerrar</button></div><div class="vard-lightbox-body"><img id="vard-lightbox-image" alt="Vista ampliada"></div>';
    document.body.appendChild(box);
    const close = () => {
      box.hidden = true;
      $('#vard-lightbox-image', box).removeAttribute('src');
    };
    $('.vard-lightbox-close', box).onclick = close;
    box.addEventListener('click', (event) => { if (event.target === box) close(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !box.hidden) close(); });
    return box;
  }

  function showLightbox(url, name) {
    if (!url) return;
    const box = ensureLightbox();
    $('#vard-lightbox-title', box).textContent = name || 'Imagen';
    $('#vard-lightbox-image', box).src = url;
    box.hidden = false;
  }

  function isImage(file) {
    const mime = String(file?.mime_type || '').toLowerCase();
    const name = String(file?.nombre_original || file?.nombre_archivo || '');
    return mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
  }

  function renderHeader() {
    const record = state.record || {};
    $('#vard-title').textContent = title(record);
    $('#vard-emphasis').textContent = `Asignado a ${record.usuario_asignado_nombre || record.usuario_asignado_iniciales || 'Sin asignar'} · Ciudad ${record.ciudad || '—'} · Estado ${record.estado || '—'}`;
    $('#vard-subtitle').textContent = `Solicitud: ${record.solicitud || '—'}`;
  }

  function renderStatus() {
    const rows = state.catalogs?.estatus || [];
    const select = $('#vard-status-select');
    select.innerHTML = '<option value="">Sin estatus</option>' + rows.map((row) => `<option value="${row.id_catalogo}">${esc(row.articulo)}</option>`).join('');
    select.value = rId(state.record?.id_estatus);
  }

  function renderFields() {
    const record = state.record || {};
    $('#vard-fields').innerHTML = [
      field('Nombre del Contacto', record.nombre_contacto),
      field('Teléfono', record.telefono),
      field('Email', record.email),
      field('Asignado a', record.usuario_asignado_nombre || record.usuario_asignado_iniciales),
      field('Nombre del Proyecto', record.nombre_proyecto),
      field('Ciudad', record.ciudad),
      field('Estado', record.estado),
      field('Información que envía', record.informacion_enviada, true),
      field('Solicitud', record.solicitud),
      field('Contacto vía', record.contacto_via),
      field('Estatus', record.estatus),
      field('Creado', fmt(record.created_at))
    ].join('');
  }

  async function resolveAccess(file) {
    if (file?.legacy_url) return file.legacy_url;
    if (!file?.access_endpoint) return '';
    const json = await req(file.access_endpoint);
    return json?.data?.access_url || json?.data?.url || json?.access_url || json?.url || '';
  }

  function imageCard(order) {
    const file = (state.record?.archivos || []).find((item) => Number(item.orden_archivo) === order);
    if (!file) {
      return `<article class="vard-image-card"><div class="vard-image-placeholder">Sin Imagen ${order}</div><div class="vard-image-meta"><strong>Imagen ${order}</strong><span>No registrada</span></div></article>`;
    }
    return `<article class="vard-image-card" data-image-order="${order}"><button class="vard-image-preview" type="button" data-image-open><span>Preparar vista previa</span></button><div class="vard-image-meta"><strong>${esc(file.descripcion || `Imagen ${order}`)}</strong><span>${esc(file.nombre_original || file.nombre_archivo || 'Archivo')}</span></div></article>`;
  }

  function renderImages() {
    const root = $('#vard-images');
    root.innerHTML = imageCard(1) + imageCard(2);
    root.querySelectorAll('[data-image-order]').forEach((card) => {
      const order = Number(card.dataset.imageOrder);
      const file = (state.record?.archivos || []).find((item) => Number(item.orden_archivo) === order);
      const button = card.querySelector('[data-image-open]');
      button.onclick = async () => {
        button.disabled = true;
        try {
          const url = await resolveAccess(file);
          if (!url) throw new Error('La imagen no tiene acceso disponible.');
          if (!button.querySelector('img')) {
            button.innerHTML = `<img src="${esc(url)}" alt="Imagen ${order}"><span>Ver imagen</span>`;
          }
          showLightbox(url, file?.descripcion || file?.nombre_original || `Imagen ${order}`);
        } catch (error) {
          button.innerHTML = '<span>No fue posible mostrar la imagen</span>';
          toast(error.message, true);
        } finally {
          button.disabled = false;
        }
      };
      // Mantiene la vista previa inmediata, pero el clic ya no navega fuera.
      (async () => {
        try {
          const url = await resolveAccess(file);
          if (url) button.innerHTML = `<img src="${esc(url)}" alt="Imagen ${order}"><span>Ver imagen</span>`;
        } catch (_error) {}
      })();
    });
  }

  function attachmentButton(file) {
    const endpoint = file?.access_endpoint || '';
    const legacy = file?.legacy_url || '';
    const name = file?.nombre_original || file?.nombre_archivo || 'Archivo adjunto';
    return `<button class="vard-message-file" type="button" data-file-open data-endpoint="${esc(endpoint)}" data-legacy="${esc(legacy)}" data-image="${isImage(file) ? '1' : '0'}" data-name="${esc(name)}"><span>📎</span><span><strong>${esc(name)}</strong><small>${esc(file?.mime_type || file?.tipo_archivo || 'Archivo')}</small></span><b>${isImage(file) ? 'Ver imagen' : 'Abrir'}</b></button>`;
  }

  async function openAttachment(button) {
    let url = button.dataset.legacy || '';
    try {
      if (!url) {
        const json = await req(button.dataset.endpoint);
        url = json?.data?.access_url || json?.data?.url || json?.access_url || json?.url || '';
      }
      if (!url) throw new Error('El archivo no tiene acceso disponible.');
      if (button.dataset.image === '1') showLightbox(url, button.dataset.name || 'Imagen');
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast(error.message, true);
    }
  }

  function isHistoryEvent(comment) {
    return String(comment?.tipo_evento || 'COMENTARIO').trim().toUpperCase() === 'CAMBIO_ESTATUS';
  }

  function renderHistoryEvent(comment) {
    const before = comment.valor_anterior || 'Sin estatus';
    const after = comment.valor_nuevo || 'Sin estatus';
    return `<article class="vard-message vard-history-event"><div class="vard-avatar">↻</div><div class="vard-message-body"><div class="vard-message-head"><strong>${esc(comment.usuario_nombre || comment.usuario_iniciales || 'Sistema')}</strong><time>${esc(fmt(comment.fecha_hora || comment.created_at))}</time></div><div class="vard-history-event-title"><b>Estatus</b><span>${esc(before)}</span><span class="vard-history-arrow">→</span><span>${esc(after)}</span></div><small>Movimiento registrado automáticamente en el historial de Redes.</small></div></article>`;
  }

  async function loadComments() {
    const box = $('#vard-comments');
    box.innerHTML = '<div class="vard-empty">Cargando interacciones…</div>';
    try {
      const json = await req(`/api/ventas/redes/${state.id}/comentarios?page_size=200`);
      const rows = Array.isArray(json.comentarios) ? json.comentarios : [];
      box.innerHTML = rows.length
        ? rows.map((comment) => {
            if (isHistoryEvent(comment)) return renderHistoryEvent(comment);
            const files = Array.isArray(comment.adjuntos) ? comment.adjuntos : [];
            return `<article class="vard-message"><div class="vard-avatar">${esc(initials(comment))}</div><div class="vard-message-body"><div class="vard-message-head"><strong>${esc(comment.usuario_nombre || comment.usuario_iniciales || 'Usuario')}</strong><time>${esc(fmt(comment.fecha_hora || comment.created_at))}</time></div>${comment.comentario ? `<p>${esc(comment.comentario)}</p>` : ''}${files.length ? `<div class="vard-message-files">${files.map(attachmentButton).join('')}</div>` : ''}</div></article>`;
          }).join('')
        : '<div class="vard-empty">Aún no hay interacciones.</div>';
      box.querySelectorAll('[data-file-open]').forEach((button) => { button.onclick = () => openAttachment(button); });
      box.scrollTop = box.scrollHeight;
    } catch (error) {
      box.innerHTML = `<div class="vard-empty">No se pudieron cargar las interacciones: ${esc(error.message)}</div>`;
    }
  }

  function renderSelectedFiles() {
    const input = $('#vard-file-input');
    const box = $('#vard-selected-files');
    const files = Array.from(input?.files || []);
    box.innerHTML = files.map((file) => `<span>${esc(file.name)}</span>`).join('');
  }

  async function sendComment(event) {
    event.preventDefault();
    if (state.busy) return;
    const text = $('#vard-comment-text').value.trim();
    const files = Array.from($('#vard-file-input').files || []);
    if (!text && !files.length) return toast('Escribe un comentario o adjunta un archivo.', true);
    if (files.length > 4) return toast('Solo se permiten hasta 4 archivos.', true);
    if (files.some((file) => file.size > 25 * 1024 * 1024)) return toast('Cada archivo debe ser menor a 25 MB.', true);

    state.busy = true;
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const form = new FormData();
      if (text) form.append('comentario', text);
      files.forEach((file) => form.append('archivos', file, file.name));
      await req(`/api/ventas/redes/${state.id}/comentarios`, { method: 'POST', body: form });
      $('#vard-comment-text').value = '';
      $('#vard-file-input').value = '';
      renderSelectedFiles();
      await loadComments();
      emitMutation('comentario');
      toast('Interacción registrada.');
    } catch (error) {
      toast(error.message, true);
    } finally {
      state.busy = false;
      button.disabled = false;
    }
  }

  function renderQuotations() {
    const select = $('#vard-quotation-select');
    const current = rId(state.record?.id_cotizacion);
    select.innerHTML = '<option value="">Sin cotización</option>' + state.quotations.map((quotation) => `<option value="${quotation.id_cotizacion}">${esc(quotation.etiqueta || quotation.nombre_proyecto || `Cotización ${quotation.id_cotizacion}`)}</option>`).join('');
    select.value = current;
    const quotation = state.quotations.find((item) => String(item.id_cotizacion) === current);
    $('#vard-linked-quotation').innerHTML = quotation
      ? `<article><div><strong>${esc(quotation.nombre_proyecto || quotation.etiqueta)}</strong><span>${esc(quotation.cliente || 'Sin cliente')} · ${esc(quotation.estatus_proyecto || 'Sin estatus')}</span></div><button class="vard-btn" id="vard-open-quotation" type="button">Ver cotización</button></article>`
      : '<div class="vard-empty small">Este contacto aún no tiene cotización relacionada.</div>';
    const open = $('#vard-open-quotation');
    if (open) open.onclick = () => window.ManttoRouter?.go('ventas-cotizaciones-detalle', { id: quotation.id_cotizacion });
  }

  async function saveStatus() {
    if (state.busy) return;
    const next = $('#vard-status-select').value;
    if (next === rId(state.record?.id_estatus)) return toast('Selecciona un estatus diferente.', true);
    state.busy = true;
    $('#vard-status-save').disabled = true;
    try {
      await req(`/api/ventas/redes/${state.id}/estatus`, { method: 'PATCH', body: JSON.stringify({ id_estatus: next || null }) });
      await load();
      emitMutation('estatus');
      toast('Estatus actualizado correctamente.');
    } catch (error) {
      toast(error.message, true);
    } finally {
      state.busy = false;
      $('#vard-status-save').disabled = false;
    }
  }

  async function saveQuotation() {
    if (state.busy) return;
    const next = $('#vard-quotation-select').value;
    state.busy = true;
    $('#vard-quotation-save').disabled = true;
    try {
      await req(`/api/ventas/redes/${state.id}/cotizacion`, { method: 'PATCH', body: JSON.stringify({ id_cotizacion: next || null }) });
      await load();
      emitMutation('cotizacion');
      toast('Cotización relacionada correctamente.');
    } catch (error) {
      toast(error.message, true);
    } finally {
      state.busy = false;
      $('#vard-quotation-save').disabled = false;
    }
  }

  function emitMutation(type) {
    document.dispatchEvent(new CustomEvent('mantto:data-mutated', {
      detail: { route: 'ventas-asignacion-redes', path: `/api/ventas/redes/${state.id}`, method: 'PATCH', id: state.id, tipo: type }
    }));
  }

  function renderAll() {
    renderHeader();
    renderStatus();
    renderFields();
    renderImages();
    renderQuotations();
  }

  async function load() {
    status('Consultando Aiven');
    try {
      const [detail, catalogs, quotations] = await Promise.all([
        req(`/api/ventas/redes/${state.id}`),
        req('/api/ventas/redes/catalogos'),
        req('/api/ventas/redes/cotizaciones-activas?limit=300')
      ]);
      state.record = detail.registro || {};
      state.catalogs = catalogs.catalogos || {};
      state.canManage = Boolean(catalogs.puede_asignar);
      $('#vard-edit').hidden = !state.canManage;
      state.quotations = quotations.cotizaciones || [];
      renderAll();
      await loadComments();
      status('Aiven conectado');
    } catch (error) {
      status('Error al cargar', true);
      toast(error.message, true);
    }
  }

  function bind() {
    $('#vard-refresh').onclick = load;
    $('#vard-edit').onclick = () => window.ManttoRouter?.go('ventas-asignacion-redes-formulario', { mode: 'edit', id: state.id });
    $('#vard-status-save').onclick = saveStatus;
    $('#vard-quotation-save').onclick = saveQuotation;
    $('#vard-comment-form').onsubmit = sendComment;
    $('#vard-file-input').onchange = renderSelectedFiles;
  }

  async function init(payload) {
    ensurePhaseStyles();
    state.id = Number(payload?.id || payload?.id_redes);
    if (!state.id) return false;
    const view = $('#view-ventas-asignacion-redes-detalle');
    if (!view) return false;
    if (view.dataset.loaded !== '1') {
      const response = await fetch('./modules/ventas-asignacion-redes-detalle/ventas-asignacion-redes-detalle.html?v=20260804-v001', { cache: 'default' });
      if (!response.ok) throw new Error('No se pudo cargar el detalle de Asignación a Redes.');
      view.innerHTML = await response.text();
      view.dataset.loaded = '1';
      bind();
    }
    await load();
    return true;
  }

  window.ManttoVentasAsignacionRedesDetalle = { init, reload: load };
})();
