(function () {
  'use strict';

  const LEAFLET_VERSION = '1.9.4';
  const LEAFLET_CSS_URL = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSION}/leaflet.css`;
  const LEAFLET_JS_URL = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSION}/leaflet.js`;

  const state = {
    id: null,
    prospection: null,
    comments: [],
    files: [],
    statuses: [],
    busy: false,
    selectedFiles: [],
    map: null,
    leafletPromise: null,
    quoteSearchTimer: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  function fmtDate(value) {
    if (!value) return '—';
    const raw = String(value);
    const date = new Date(raw.length === 10 ? `${raw}T12:00:00` : raw);
    return Number.isNaN(date.getTime())
      ? raw.slice(0, 10)
      : date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function fmtDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleString('es-MX', {
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
  }

  function headers(json = true) {
    return Object.assign(
      json ? { Accept: 'application/json', 'Content-Type': 'application/json' } : { Accept: 'application/json' },
      window.ManttoAuth?.authHeaders?.() || {}
    );
  }

  async function request(path, options = {}) {
    const opts = Object.assign({ cache: 'no-store' }, options);
    const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    opts.headers = Object.assign({}, headers(!isForm && opts.body !== undefined), options.headers || {});
    const base = (window.MANTTO_API_BASE || '').replace(/\/$/, '');
    const response = await fetch(base + path, opts);
    const text = await response.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; }
    catch (_error) { throw new Error('El backend respondió contenido no JSON.'); }
    if (!response.ok || json.ok === false) {
      const error = new Error(json.message || json.error || `HTTP ${response.status}`);
      error.code = json.code || null;
      error.details = json.detalles || null;
      throw error;
    }
    return json;
  }

  const CATALOG_CACHE_MS = 5 * 60 * 1000;
  function catalogRequest(path) {
    return window.ManttoHttp && typeof window.ManttoHttp.get === 'function'
      ? window.ManttoHttp.get(path, { cacheTtlMs: CATALOG_CACHE_MS, cacheKey: `catalog:${path}` })
      : request(path);
  }

  function status(text, error = false) {
    const element = $('#vpd-status');
    if (!element) return;
    element.className = `vpd-status${error ? ' error' : ''}`;
    element.innerHTML = `<i></i><span>${esc(text)}</span>`;
  }

  function toast(text, error = false) {
    const element = $('#vpd-toast');
    if (!element) return;
    element.textContent = text;
    element.className = `vpd-toast show${error ? ' error' : ''}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { element.className = 'vpd-toast'; }, 3200);
  }

  function advisor(prospection) {
    return prospection.usuario_iniciales
      ? `${prospection.usuario_iniciales} · ${prospection.usuario_nombre || prospection.usuario_correo || ''}`
      : (prospection.usuario_nombre || prospection.usuario_correo || `Usuario ${prospection.id_usuario}`);
  }

  function initials(row) {
    const raw = row?.usuario_iniciales || row?.usuario_nombre || 'U';
    return String(raw).trim().split(/\s+/).map((item) => item[0] || '').join('').slice(0, 2).toUpperCase() || 'U';
  }

  function field(label, value, extra = '') {
    return `<div class="vpd-field ${extra}"><span>${esc(label)}</span><strong>${esc(value || '—')}</strong></div>`;
  }

  function section(title, content, extra = '') {
    return `<section class="vpd-section ${extra}"><h2>${esc(title)}</h2>${content}</section>`;
  }

  function fileUrl(file) {
    return file?.thumbnail_url || file?.storage_url || file?.legacy_url || '';
  }

  function fileName(file) {
    return file?.nombre_original || file?.nombre_archivo || `Archivo ${file?.id_archivo || ''}`;
  }

  function isImage(file) {
    const mime = String(file?.mime_type || '').toLowerCase();
    return Number(file?.es_imagen) === 1
      || mime.startsWith('image/')
      || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fileName(file));
  }

  function ensurePhaseStyles() {
    if (document.getElementById('vpd-phase2-styles')) return;
    const style = document.createElement('style');
    style.id = 'vpd-phase2-styles';
    style.textContent = `
      .vpd-inline-map{height:360px;border:1px solid #d8e3f4;border-radius:14px;overflow:hidden;background:#eef3fb;margin-top:12px}
      .vpd-image-button{display:block;width:100%;border:0;padding:0;background:#eef3fb;cursor:zoom-in;text-align:inherit}
      .vpd-image-button img{display:block;width:100%;max-height:300px;object-fit:contain;margin:auto}
      .vpd-lightbox{position:fixed;inset:0;z-index:10050;background:rgba(8,18,38,.92);display:grid;grid-template-rows:auto minmax(0,1fr);padding:16px}
      .vpd-lightbox[hidden]{display:none!important}.vpd-lightbox-head{display:flex;align-items:center;justify-content:space-between;gap:14px;color:#fff;padding:4px 4px 12px}
      .vpd-lightbox-head strong{overflow-wrap:anywhere}.vpd-lightbox-close{border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:8px 12px;font-weight:900;cursor:pointer}
      .vpd-lightbox-body{min-height:0;display:grid;place-items:center}.vpd-lightbox-body img{max-width:96vw;max-height:84vh;object-fit:contain;border-radius:10px;background:#fff}
      .vpd-quote-modal{position:fixed;inset:0;z-index:10040;background:rgba(12,31,62,.62);display:grid;place-items:center;padding:18px}
      .vpd-quote-modal[hidden]{display:none!important}.vpd-quote-panel{width:min(760px,96vw);max-height:90vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 28px 80px rgba(0,0,0,.3);padding:20px;color:#173a72}
      .vpd-quote-panel h2{margin:0;color:#0b3477}.vpd-quote-panel>p{color:#61708a;line-height:1.5}.vpd-quote-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0}
      .vpd-quote-choice{border:1px solid #bfd0ea;background:#f8fbff;border-radius:13px;padding:14px;text-align:left;color:#173a72;cursor:pointer}.vpd-quote-choice strong,.vpd-quote-choice span{display:block}.vpd-quote-choice span{font-size:12px;color:#61708a;margin-top:5px}
      .vpd-quote-existing{border-top:1px solid #e0e9f6;padding-top:14px}.vpd-quote-search{display:flex;gap:8px}.vpd-quote-search input{flex:1;min-width:0;border:1px solid #cbd8eb;border-radius:10px;padding:10px 12px;color:#173a72}
      .vpd-quote-results{display:grid;gap:8px;margin-top:10px}.vpd-quote-result{border:1px solid #d8e3f4;border-radius:11px;background:#fff;padding:11px;text-align:left;cursor:pointer;color:#173a72}.vpd-quote-result:disabled{opacity:.5;cursor:not-allowed}.vpd-quote-result strong,.vpd-quote-result small{display:block}.vpd-quote-result small{color:#61708a;margin-top:4px}
      .vpd-quote-footer{display:flex;justify-content:flex-end;margin-top:16px}.vpd-linked-quote{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.vpd-linked-quote .vpd-btn{padding:6px 9px;font-size:11px}
      @media(max-width:680px){.vpd-quote-actions{grid-template-columns:1fr}.vpd-quote-search{flex-direction:column}.vpd-inline-map{height:300px}}
    `;
    document.head.appendChild(style);
  }

  function ensureLightbox() {
    let box = document.getElementById('vpd-lightbox');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'vpd-lightbox';
    box.className = 'vpd-lightbox';
    box.hidden = true;
    box.innerHTML = '<div class="vpd-lightbox-head"><strong id="vpd-lightbox-title">Imagen</strong><button class="vpd-lightbox-close" type="button">Cerrar</button></div><div class="vpd-lightbox-body"><img id="vpd-lightbox-image" alt="Vista ampliada"></div>';
    document.body.appendChild(box);
    const close = () => { box.hidden = true; $('#vpd-lightbox-image', box).removeAttribute('src'); };
    $('.vpd-lightbox-close', box).onclick = close;
    box.addEventListener('click', (event) => { if (event.target === box) close(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !box.hidden) close(); });
    return box;
  }

  function showLightbox(url, name) {
    if (!url) return;
    const box = ensureLightbox();
    $('#vpd-lightbox-title', box).textContent = name || 'Imagen';
    $('#vpd-lightbox-image', box).src = url;
    box.hidden = false;
  }

  async function resolveProtectedUrl(endpoint) {
    const response = await request(endpoint);
    const url = response?.data?.access_url || response?.data?.url || response?.access_url || response?.url;
    if (!url) throw new Error('El backend no devolvió un vínculo temporal.');
    return url;
  }

  function renderAttachment(file) {
    const url = fileUrl(file);
    const name = fileName(file);
    const type = file?.mime_type || file?.extension || 'Archivo';
    const endpoint = file?.access_endpoint || '';
    const image = isImage(file);
    const content = `<span class="vpd-message-file-icon">📎</span><span class="vpd-message-file-info"><strong>${esc(name)}</strong><small>${esc(type)}</small></span>`;

    if (image) {
      if (endpoint) {
        return `<div class="vpd-attachment-preview vpd-attachment-preview-image"><button class="vpd-image-button" type="button" data-vpd-image-endpoint="${esc(endpoint)}" data-vpd-image-name="${esc(name)}"><span class="vpd-loader">Preparar imagen</span></button><div class="vpd-attachment-meta"><span><strong>${esc(name)}</strong><small>${esc(type)}</small></span><button class="vpd-btn" type="button" data-vpd-image-endpoint="${esc(endpoint)}" data-vpd-image-name="${esc(name)}">Ver imagen</button></div></div>`;
      }
      if (url) {
        return `<div class="vpd-attachment-preview vpd-attachment-preview-image"><button class="vpd-image-button" type="button" data-vpd-image-url="${esc(url)}" data-vpd-image-name="${esc(name)}"><img src="${esc(url)}" alt="${esc(name)}" loading="lazy"></button><div class="vpd-attachment-meta"><span><strong>${esc(name)}</strong><small>${esc(type)}</small></span><button class="vpd-btn" type="button" data-vpd-image-url="${esc(url)}" data-vpd-image-name="${esc(name)}">Ver imagen</button></div></div>`;
      }
    }

    if (endpoint) {
      return `<button class="vpd-message-file vpd-file-access" type="button" data-file-access="${esc(endpoint)}">${content}<span class="vpd-message-file-open">Abrir</span></button>`;
    }
    return url
      ? `<button class="vpd-message-file vpd-file-url" type="button" data-file-url="${esc(url)}">${content}<span class="vpd-message-file-open">Abrir</span></button>`
      : `<div class="vpd-message-file is-disabled">${content}<span class="vpd-message-file-open">Sin vínculo</span></div>`;
  }

  function statusOptions(current) {
    const values = [...new Set([...(state.statuses || []), current].filter(Boolean))];
    return '<option value="">Seleccionar estatus</option>' + values.map((value) =>
      `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(value)}</option>`
    ).join('');
  }

  function renderSummary(prospection) {
    $('#vpd-summary').innerHTML = `<article class="vpd-kpi vpd-kpi-status"><span>Estatus</span><div class="vpd-status-row"><select class="vpd-select" id="vpd-status-select" aria-label="Estatus de la prospección">${statusOptions(prospection.estatus)}</select><button class="vpd-btn vpd-btn-primary" id="vpd-status-save" type="button">Guardar</button></div></article><article class="vpd-kpi"><span>Asesor</span><strong>${esc(advisor(prospection))}</strong></article><article class="vpd-kpi"><span>Fecha de visita</span><strong>${esc(fmtDate(prospection.fecha_visita))}</strong></article>`;
    const button = $('#vpd-status-save');
    if (button) button.onclick = saveStatus;
  }

  function normalizeText(value) {
    return String(value || '').trim().toLocaleLowerCase('es-MX');
  }

  function requiresQuotationFlow(nextStatus) {
    const prospection = state.prospection || {};
    return normalizeText(nextStatus) === 'cotizado'
      && Number(prospection.nuevo || 0) === 1
      && !(Number(prospection.id_cotizacion) > 0);
  }

  async function saveStatus() {
    if (state.busy) return;
    const select = $('#vpd-status-select');
    const next = select?.value || '';
    if (!next) return toast('Selecciona un estatus.', true);
    if (next === state.prospection?.estatus) return toast('Selecciona un estatus diferente.', true);

    if (requiresQuotationFlow(next)) {
      openQuotationModal();
      return;
    }

    state.busy = true;
    const button = $('#vpd-status-save');
    if (button) button.disabled = true;
    status('Actualizando estatus');
    try {
      const json = await request(`/api/ventas/prospeccion/${state.id}/estatus`, {
        method: 'PATCH',
        body: JSON.stringify({ estatus: next })
      });
      state.prospection = json.prospeccion || state.prospection;
      renderAll();
      status('Aiven conectado');
      toast('Estatus actualizado correctamente.');
      emitMutation('estatus', { estatus: next });
    } catch (error) {
      if (error.code === 'PROSPECCION_COTIZACION_REQUIRED') openQuotationModal();
      else {
        status('Error al actualizar', true);
        toast(error.message, true);
      }
    } finally {
      state.busy = false;
      const current = $('#vpd-status-save');
      if (current) current.disabled = false;
    }
  }

  function renderInitialFiles(files) {
    const rows = (files || []).filter((file) => !file.id_com_pors);
    if (!rows.length) return '<div class="vpd-empty">Esta visita no tiene evidencias registradas.</div>';
    return `<div class="vpd-gallery">${rows.map(renderAttachment).join('')}</div>`;
  }

  function renderInteractions(comments, files) {
    const byComment = new Map();
    (files || []).filter((file) => file.id_com_pors).forEach((file) => {
      const key = Number(file.id_com_pors);
      if (!byComment.has(key)) byComment.set(key, []);
      byComment.get(key).push(file);
    });
    if (!(comments || []).length) return '<div class="vpd-empty">Aún no hay seguimientos registrados.</div>';
    return comments.map((comment) => {
      const attachments = byComment.get(Number(comment.id_com_pors)) || [];
      const attachmentsHtml = attachments.length
        ? `<div class="vpd-message-attachments">${attachments.map(renderAttachment).join('')}</div>`
        : '';
      return `<article class="vpd-message"><div class="vpd-avatar">${esc(initials(comment))}</div><div class="vpd-message-body">${attachmentsHtml}<div class="vpd-message-head"><strong>${esc(comment.usuario_nombre || comment.usuario_iniciales || 'Usuario')}</strong><time>${esc(fmtDateTime(comment.fecha_hora || comment.created_at))}</time></div><p>${esc(comment.comentario || '')}</p></div></article>`;
    }).join('');
  }

  function renderSelectedFiles() {
    const box = $('#vpd-selected-files');
    if (!box) return;
    box.innerHTML = state.selectedFiles.map((file, index) => `<span class="vpd-selected-file">📎 ${esc(file.name)}<button type="button" data-remove-file="${index}" aria-label="Quitar archivo">×</button></span>`).join('');
    box.querySelectorAll('[data-remove-file]').forEach((button) => {
      button.onclick = () => {
        state.selectedFiles.splice(Number(button.dataset.removeFile), 1);
        renderSelectedFiles();
      };
    });
  }

  async function openFileAccess(event) {
    const button = event.currentTarget;
    const endpoint = button?.dataset?.fileAccess;
    if (!endpoint) return;
    button.disabled = true;
    try {
      const url = await resolveProtectedUrl(endpoint);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function openProtectedImage(event) {
    const button = event.currentTarget;
    const endpoint = button?.dataset?.vpdImageEndpoint;
    if (!endpoint) return;
    button.disabled = true;
    try {
      const url = await resolveProtectedUrl(endpoint);
      showLightbox(url, button.dataset.vpdImageName || 'Imagen');
      const preview = button.closest('.vpd-attachment-preview-image')?.querySelector('.vpd-image-button');
      if (preview && !preview.querySelector('img')) {
        preview.innerHTML = `<img src="${esc(url)}" alt="${esc(button.dataset.vpdImageName || 'Imagen')}" loading="lazy">`;
      }
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  function bindFileAccess() {
    document.querySelectorAll('#view-ventas-prospeccion-detalle [data-file-access]').forEach((button) => { button.onclick = openFileAccess; });
    document.querySelectorAll('#view-ventas-prospeccion-detalle [data-file-url]').forEach((button) => {
      button.onclick = () => window.open(button.dataset.fileUrl, '_blank', 'noopener,noreferrer');
    });
    document.querySelectorAll('#view-ventas-prospeccion-detalle [data-vpd-image-url]').forEach((button) => {
      button.onclick = () => showLightbox(button.dataset.vpdImageUrl, button.dataset.vpdImageName || 'Imagen');
    });
    document.querySelectorAll('#view-ventas-prospeccion-detalle [data-vpd-image-endpoint]').forEach((button) => { button.onclick = openProtectedImage; });
  }

  function bindChat() {
    const form = $('#vpd-comment-form');
    const input = $('#vpd-file-input');
    if (input) {
      input.onchange = () => {
        const incoming = Array.from(input.files || []);
        state.selectedFiles = [...state.selectedFiles, ...incoming].slice(0, 4);
        input.value = '';
        renderSelectedFiles();
      };
    }
    if (form) form.onsubmit = sendComment;
  }

  async function sendComment(event) {
    event.preventDefault();
    if (state.busy) return;
    const text = $('#vpd-comment-text')?.value.trim() || '';
    if (!text && !state.selectedFiles.length) return toast('Escribe un comentario o adjunta un archivo.', true);
    const formData = new FormData();
    formData.append('comentario', text);
    state.selectedFiles.forEach((file) => formData.append('archivos', file));
    state.busy = true;
    const button = event.currentTarget.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      await request(`/api/ventas/prospeccion/${state.id}/comentarios`, { method: 'POST', body: formData });
      state.selectedFiles = [];
      const area = $('#vpd-comment-text');
      if (area) area.value = '';
      renderSelectedFiles();
      await load();
      toast('Seguimiento registrado.');
      emitMutation('comentario');
    } catch (error) {
      toast(error.message, true);
    } finally {
      state.busy = false;
      if (button) button.disabled = false;
    }
  }

  function appendLeafletCss() {
    if (document.querySelector('link[data-vpd-leaflet="css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS_URL;
    link.crossOrigin = 'anonymous';
    link.referrerPolicy = 'no-referrer';
    link.dataset.vpdLeaflet = 'css';
    document.head.appendChild(link);
  }

  function ensureLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (state.leafletPromise) return state.leafletPromise;
    state.leafletPromise = new Promise((resolve, reject) => {
      appendLeafletCss();
      const existing = document.querySelector('script[data-vpd-leaflet="js"],script[data-vmp-leaflet="js"]');
      const script = existing || document.createElement('script');
      const timeout = setTimeout(() => {
        state.leafletPromise = null;
        reject(new Error('Tiempo de espera agotado al cargar el mapa.'));
      }, 12000);
      const loaded = () => {
        clearTimeout(timeout);
        if (window.L) resolve(window.L);
        else {
          state.leafletPromise = null;
          reject(new Error('El componente geográfico no pudo inicializarse.'));
        }
      };
      const failed = () => {
        clearTimeout(timeout);
        state.leafletPromise = null;
        reject(new Error('No se pudo cargar el componente geográfico.'));
      };
      script.addEventListener('load', loaded, { once: true });
      script.addEventListener('error', failed, { once: true });
      if (!existing) {
        script.src = LEAFLET_JS_URL;
        script.crossOrigin = 'anonymous';
        script.referrerPolicy = 'no-referrer';
        script.dataset.vpdLeaflet = 'js';
        document.head.appendChild(script);
      }
    });
    return state.leafletPromise;
  }

  async function renderInlineMap(prospection) {
    const node = $('#vpd-inline-map');
    if (!node) return;
    const lat = Number(prospection.latitud);
    const lng = Number(prospection.longitud);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    try {
      await ensureLeaflet();
      if (state.map) {
        try { state.map.remove(); } catch (_error) {}
        state.map = null;
      }
      state.map = window.L.map(node, { zoomControl: true }).setView([lat, lng], 16);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(state.map);
      window.L.marker([lat, lng]).addTo(state.map).bindPopup(esc(prospection.proyecto || prospection.empresa || 'Prospección')).openPopup();
      setTimeout(() => state.map?.invalidateSize(), 80);
    } catch (error) {
      node.innerHTML = `<div class="vpd-empty">No fue posible iniciar el mapa: ${esc(error.message)}</div>`;
    }
  }

  function quoteRelationMarkup(prospection) {
    if (!(Number(prospection.id_cotizacion) > 0)) return '—';
    const label = `#${prospection.id_cotizacion}${prospection.cotizacion_proyecto ? ` · ${prospection.cotizacion_proyecto}` : ''}`;
    return `<div class="vpd-linked-quote"><strong>${esc(label)}</strong><button class="vpd-btn" id="vpd-open-quotation" type="button">Ver cotización</button></div>`;
  }

  function renderInformation(prospection, comments, files) {
    const contactRegistered = Boolean(prospection.id_contacto);
    const client = prospection.cliente_nombre || prospection.cotizacion_cliente || prospection.empresa || '—';
    const coords = Number.isFinite(Number(prospection.latitud)) && Number.isFinite(Number(prospection.longitud));
    const projectFields = [
      field('Empresa', prospection.empresa),
      field('Proyecto', prospection.proyecto),
      field('Tipo de proyecto', prospection.tipo_proyecto),
      field('Ciudad', prospection.ciudad),
      field('Estado', prospection.estado),
      field('Ubicación', prospection.ubicacion, 'vpd-span-all')
    ];
    const contactFields = [
      field('Cliente', client),
      field('Contacto', prospection.contacto),
      field('Puesto', prospection.puesto_contacto),
      field('Teléfono', prospection.telefono),
      field('Correo', prospection.correo, 'vpd-span-2')
    ];
    const visitFields = [
      field('Fecha de visita', fmtDate(prospection.fecha_visita)),
      field('Registró', advisor(prospection)),
      field('ID de prospección', prospection.id_pros),
      field('Proyecto de instalación', prospection.id_proyecto_instalacion),
      `<div class="vpd-field"><span>Cotización relacionada</span>${quoteRelationMarkup(prospection)}</div>`,
      field('Creación', fmtDateTime(prospection.created_at)),
      field('Última actualización', fmtDateTime(prospection.updated_at)),
      field('Coordenadas', coords ? `${prospection.latitud}, ${prospection.longitud}` : '—', 'vpd-span-2')
    ];
    const mapBlock = coords
      ? `<div class="vpd-inline-map" id="vpd-inline-map" aria-label="Mapa de la visita"></div><div class="vpd-section-actions"><button class="vpd-btn" id="vpd-open-map" type="button">Abrir Mapa Prospección</button></div>`
      : '<p class="vpd-note">Esta visita no tiene coordenadas válidas para mostrar el mapa.</p>';

    $('#vpd-general').innerHTML =
      section('Cliente y contacto', `<div class="vpd-grid">${contactFields.join('')}</div><p class="vpd-note">${contactRegistered ? 'Contacto registrado en el catálogo comercial.' : 'Contacto capturado únicamente en esta visita.'}</p>`) +
      section('Proyecto', `<div class="vpd-grid">${projectFields.join('')}</div>`) +
      section('Visita y ubicación', `<div class="vpd-grid">${visitFields.join('')}</div>${mapBlock}`) +
      section('Comentario inicial', `<div class="vpd-comment-initial">${esc(prospection.comentario || 'Sin comentario inicial.')}</div>`) +
      section('Evidencias de la visita', renderInitialFiles(files)) +
      `<section class="vpd-section vpd-interactions"><div class="vpd-interactions-head"><h2>Interacciones</h2><p>Comentarios y archivos de seguimiento de la prospección.</p></div><section class="vpd-chat-panel"><div class="vpd-chat-history" id="vpd-comments">${renderInteractions(comments, files)}</div><form class="vpd-chat-form" id="vpd-comment-form"><label>Nuevo comentario<textarea class="vpd-textarea" id="vpd-comment-text" maxlength="4000" placeholder="Escribe un comentario..."></textarea></label><div class="vpd-comment-tools"><label class="vpd-file-picker">Adjuntar archivos<input id="vpd-file-input" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"></label><small>Máximo 4 archivos, 25 MB por archivo. Se almacenan en Azure Blob.</small></div><div class="vpd-selected-files" id="vpd-selected-files"></div><div class="vpd-form-actions"><button class="vpd-btn vpd-btn-primary" type="submit">Enviar comentario</button></div></form></section></section>`;

    const mapButton = $('#vpd-open-map');
    if (mapButton) mapButton.onclick = () => window.ManttoRouter?.go('ventas-mapa-prospeccion', { id_pros: Number(prospection.id_pros), latitud: prospection.latitud, longitud: prospection.longitud });
    const quoteButton = $('#vpd-open-quotation');
    if (quoteButton) quoteButton.onclick = () => window.ManttoRouter?.go('ventas-cotizaciones-detalle', { id: Number(prospection.id_cotizacion) });

    bindChat();
    bindFileAccess();
    renderSelectedFiles();
    const chat = $('#vpd-comments');
    if (chat) chat.scrollTop = chat.scrollHeight;
    if (coords) renderInlineMap(prospection);
  }

  function renderAll() {
    const prospection = state.prospection;
    if (!prospection) return;
    $('#vpd-title').textContent = prospection.proyecto || 'Detalle de visita';
    $('#vpd-subtitle').textContent = `Visita #${prospection.id_pros} · ${prospection.empresa || 'Sin empresa'}`;
    renderSummary(prospection);
    renderInformation(prospection, state.comments, state.files);
  }

  async function loadCatalogs() {
    try {
      const json = await catalogRequest('/api/ventas/prospeccion/detalle/catalogos');
      state.statuses = Array.isArray(json?.catalogos?.estatus) ? json.catalogos.estatus : [];
    } catch (_error) {
      state.statuses = [];
    }
  }

  async function load() {
    if (!state.id) return;
    status('Consultando Aiven');
    const box = $('#vpd-general');
    if (box) box.innerHTML = '<div class="vpd-loader">Consultando detalle de la visita...</div>';
    try {
      const [detail] = await Promise.all([
        request(`/api/ventas/prospeccion/${encodeURIComponent(state.id)}`),
        loadCatalogs()
      ]);
      state.prospection = detail.prospeccion || null;
      state.comments = Array.isArray(detail.comentarios) ? detail.comentarios : [];
      state.files = Array.isArray(detail.archivos) ? detail.archivos : [];
      if (!state.prospection) throw new Error('La visita no fue encontrada.');
      renderAll();
      status('Aiven conectado');
    } catch (error) {
      status('Error al cargar', true);
      if (box) box.innerHTML = `<div class="vpd-empty">${esc(error.message)}</div>`;
      toast(error.message, true);
    }
  }

  function ensureQuotationModal() {
    let modal = document.getElementById('vpd-quote-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'vpd-quote-modal';
    modal.className = 'vpd-quote-modal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="vpd-quote-panel" role="dialog" aria-modal="true" aria-labelledby="vpd-quote-title">
        <h2 id="vpd-quote-title">Relacionar esta prospección con una cotización</h2>
        <p>La visita nació como NUEVO. Para cambiarla a Cotizado primero debe existir una cotización válida relacionada.</p>
        <div class="vpd-quote-actions">
          <button class="vpd-quote-choice" id="vpd-quote-create" type="button"><strong>Crear nueva cotización</strong><span>Abre la captura de Cotizaciones con los datos disponibles de esta visita.</span></button>
          <button class="vpd-quote-choice" id="vpd-quote-existing-toggle" type="button"><strong>Relacionar cotización existente</strong><span>Busca una cotización dentro de tu alcance comercial.</span></button>
        </div>
        <div class="vpd-quote-existing" id="vpd-quote-existing" hidden>
          <div class="vpd-quote-search"><input id="vpd-quote-search" type="search" maxlength="150" placeholder="Buscar proyecto, cliente o MX..."><button class="vpd-btn" id="vpd-quote-search-button" type="button">Buscar</button></div>
          <div class="vpd-quote-results" id="vpd-quote-results"></div>
        </div>
        <div class="vpd-quote-footer"><button class="vpd-btn" id="vpd-quote-cancel" type="button">Cancelar</button></div>
      </div>`;
    document.body.appendChild(modal);

    $('#vpd-quote-cancel', modal).onclick = closeQuotationModal;
    $('#vpd-quote-create', modal).onclick = createQuotationFromProspection;
    $('#vpd-quote-existing-toggle', modal).onclick = () => {
      const sectionNode = $('#vpd-quote-existing', modal);
      sectionNode.hidden = false;
      $('#vpd-quote-search', modal).focus();
      searchExistingQuotations();
    };
    $('#vpd-quote-search-button', modal).onclick = searchExistingQuotations;
    $('#vpd-quote-search', modal).addEventListener('input', () => {
      clearTimeout(state.quoteSearchTimer);
      state.quoteSearchTimer = setTimeout(searchExistingQuotations, 300);
    });
    modal.addEventListener('click', (event) => { if (event.target === modal) closeQuotationModal(); });
    return modal;
  }

  function openQuotationModal() {
    const modal = ensureQuotationModal();
    const search = $('#vpd-quote-search', modal);
    if (search) search.value = state.prospection?.proyecto || state.prospection?.empresa || '';
    const results = $('#vpd-quote-results', modal);
    if (results) results.innerHTML = '';
    const existing = $('#vpd-quote-existing', modal);
    if (existing) existing.hidden = true;
    modal.hidden = false;
  }

  function closeQuotationModal() {
    const modal = document.getElementById('vpd-quote-modal');
    if (modal) modal.hidden = true;
    const select = $('#vpd-status-select');
    if (select) select.value = state.prospection?.estatus || '';
  }

  function createQuotationFromProspection() {
    const prospection = state.prospection || {};
    const originProspection = {
      id_pros: Number(prospection.id_pros),
      empresa: prospection.empresa || null,
      proyecto: prospection.proyecto || null,
      tipo_proyecto: prospection.tipo_proyecto || null,
      ciudad: prospection.ciudad || null,
      estado: prospection.estado || null,
      id_cliente: Number(prospection.id_cliente) || null,
      id_contacto: Number(prospection.id_contacto) || null,
      contacto: prospection.contacto || null,
      puesto_contacto: prospection.puesto_contacto || null,
      correo: prospection.correo || null,
      telefono: prospection.telefono || null,
      comentario: prospection.comentario || null
    };
    const modal = document.getElementById('vpd-quote-modal');
    if (modal) modal.hidden = true;
    window.ManttoRouter?.go('ventas-cotizaciones-nueva', {
      source: 'ventas-prospeccion-detalle',
      returnTo: 'ventas-prospeccion-detalle',
      selectedClientId: originProspection.id_cliente,
      originProspection
    });
  }

  async function searchExistingQuotations() {
    const modal = ensureQuotationModal();
    const results = $('#vpd-quote-results', modal);
    if (!results) return;
    const q = $('#vpd-quote-search', modal)?.value.trim() || '';
    results.innerHTML = '<div class="vpd-empty">Buscando cotizaciones...</div>';
    try {
      const json = await request(`/api/ventas/prospeccion/fuentes?tipo=COTIZADO&q=${encodeURIComponent(q)}&limit=30`);
      const rows = Array.isArray(json.resultados) ? json.resultados : [];
      if (!rows.length) {
        results.innerHTML = '<div class="vpd-empty">No se encontraron cotizaciones dentro de tu alcance.</div>';
        return;
      }
      results.innerHTML = rows.map((row) => {
        const complete = Number(row.id_cliente) > 0 && Number(row.id_contacto) > 0;
        const label = row.proyecto || `Cotización ${row.id_cotizacion}`;
        const meta = [row.empresa, row.mx, row.estatus_proyecto, complete ? null : 'Falta cliente/contacto formal'].filter(Boolean).join(' · ');
        return `<button class="vpd-quote-result" type="button" data-vpd-quote-id="${Number(row.id_cotizacion)}" ${complete ? '' : 'disabled'}><strong>${esc(label)}</strong><small>${esc(meta)}</small></button>`;
      }).join('');
      results.querySelectorAll('[data-vpd-quote-id]').forEach((button) => {
        button.onclick = () => relateExistingQuotation(Number(button.dataset.vpdQuoteId), button);
      });
    } catch (error) {
      results.innerHTML = `<div class="vpd-empty">${esc(error.message)}</div>`;
    }
  }

  async function relateExistingQuotation(idQuotation, button) {
    if (state.busy || !(idQuotation > 0)) return;
    state.busy = true;
    if (button) button.disabled = true;
    status('Relacionando cotización');
    try {
      const json = await request(`/api/ventas/prospeccion/${state.id}/cotizacion`, {
        method: 'PATCH',
        body: JSON.stringify({ id_cotizacion: idQuotation })
      });
      state.prospection = json.prospeccion || state.prospection;
      const modal = document.getElementById('vpd-quote-modal');
      if (modal) modal.hidden = true;
      renderAll();
      status('Aiven conectado');
      toast('Cotización relacionada y prospección marcada como Cotizado.');
      emitMutation('cotizacion', { id_cotizacion: idQuotation, estatus: 'Cotizado' });
    } catch (error) {
      status('Error al relacionar', true);
      toast(error.message, true);
    } finally {
      state.busy = false;
      if (button) button.disabled = false;
    }
  }

  function emitMutation(type, detail = {}) {
    window.dispatchEvent(new CustomEvent('mantto:ventas-prospeccion-actualizada', {
      detail: { id_pros: state.id, tipo: type, ...detail }
    }));
    document.dispatchEvent(new CustomEvent('mantto:data-mutated', {
      detail: { route: 'ventas-prospeccion', path: `/api/ventas/prospeccion/${state.id}`, method: 'PATCH', id: state.id, tipo: type }
    }));
  }

  function bind() {
    const back = $('#vpd-back');
    if (back) back.onclick = () => window.ManttoRouter?.back();
    const refresh = $('#vpd-refresh');
    if (refresh) refresh.onclick = load;
  }

  async function init(payload) {
    ensurePhaseStyles();
    const view = $('#view-ventas-prospeccion-detalle');
    if (!view) return false;
    if (view.dataset.loaded !== '1') {
      const response = await fetch('./modules/ventas-prospeccion-detalle/ventas-prospeccion-detalle.html?v=20260731-fase4-chat-estatus-v003', { cache: 'default' });
      if (!response.ok) throw new Error('No se pudo cargar la vista Detalle de visita.');
      view.innerHTML = await response.text();
      view.dataset.loaded = '1';
      bind();
    }
    state.id = Number(payload?.id_pros || payload?.id);
    if (!Number.isInteger(state.id) || state.id <= 0) {
      status('Visita no identificada', true);
      const box = $('#vpd-general');
      if (box) box.innerHTML = '<div class="vpd-empty">No se recibió un ID de prospección válido.</div>';
      return false;
    }
    state.selectedFiles = [];
    await load();
    return true;
  }

  window.ManttoVentasProspeccionDetalle = { init, reload: load, refresh: load };
})();
