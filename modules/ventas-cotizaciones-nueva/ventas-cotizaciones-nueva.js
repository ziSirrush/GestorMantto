(function () {
  'use strict';

  const API = (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  const NEW_CLIENT_DRAFT_KEY = 'mantto:ventas-cotizaciones-nueva:draft';
  const state = {
    clients: [],
    filtered: [],
    selectedClient: null,
    contacts: [],
    catalogs: {},
    statuses: [],
    routePayload: null,
    equipmentTypes: [],
    equipmentRows: [{ cantidad: 0, tipo_equipo: '' }],
    editId: null,
    editRecord: null,
    legacyEquipmentFallback: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function headers(json = false) {
    return Object.assign(
      { Accept: 'application/json' },
      json ? { 'Content-Type': 'application/json' } : {},
      window.ManttoAuth?.authHeaders ? window.ManttoAuth.authHeaders() : {}
    );
  }

  async function request(path, options = {}) {
    const response = await fetch(API + path, {
      ...options,
      cache: 'no-store',
      headers: { ...headers(Boolean(options.body)), ...(options.headers || {}) }
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; }
    catch (_error) { throw new Error('La API respondió contenido no JSON.'); }
    if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `Error HTTP ${response.status}`);
    return data;
  }

  const CATALOG_CACHE_MS = 5 * 60 * 1000;
  function catalogRequest(path) {
    return window.ManttoHttp && typeof window.ManttoHttp.get === 'function'
      ? window.ManttoHttp.get(path, { cacheTtlMs: CATALOG_CACHE_MS, cacheKey: `catalog:${path}` })
      : request(path);
  }

  function toast(message, error = false) {
    const element = $('#vcn-toast');
    if (!element) return;
    element.textContent = message;
    element.className = `vcn-toast show${error ? ' error' : ''}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { element.className = 'vcn-toast'; }, 3000);
  }

  function goBack() {
    window.ManttoRouter?.back?.();
  }

  function setModeCopy() {
    const title = $('.vcn-head h1');
    const description = $('.vcn-head h1 + p');
    const save = $('#vcn-save');
    if (state.editId) {
      if (title) title.textContent = 'Editar cotización';
      if (description) description.textContent = 'Actualiza la información comercial usando la misma plantilla de alta.';
      if (save) save.textContent = 'Guardar cambios';
      return;
    }
    if (title) title.textContent = 'Nueva cotización';
    if (description) {
      description.textContent = state.routePayload?.originProspection
        ? 'Nueva cotización originada desde una visita de Prospección. Completa los datos faltantes para relacionarla.'
        : 'Registra la solicitud, el cliente, el contacto y la información técnica inicial.';
    }
    if (save) save.textContent = 'Guardar cotización';
  }

  function normalizeEquipmentCatalog(rows) {
    const allowed = ['Elevador', 'Montacargas', 'Escalera', 'Rampa', 'Plataformas/Otros'];
    const available = (Array.isArray(rows) ? rows : [])
      .map((row) => String(row?.articulo ?? row ?? '').trim())
      .filter(Boolean);
    return allowed.filter((type) => available.some((item) => item.toLowerCase() === type.toLowerCase()));
  }

  function equipmentTotal() {
    return state.equipmentRows.reduce((sum, row) => sum + (Number(row.cantidad) || 0), 0);
  }

  function markEquipmentEdited() {
    if (state.legacyEquipmentFallback) state.legacyEquipmentFallback.dirty = true;
  }

  function renderEquipmentRows() {
    const list = $('#vcn-equipment-list');
    if (!list) return;
    if (!state.equipmentRows.length) state.equipmentRows = [{ cantidad: 0, tipo_equipo: '' }];
    const selected = state.equipmentRows.map((row) => row.tipo_equipo).filter(Boolean);
    list.innerHTML = state.equipmentRows.map((row, index) => {
      const options = state.equipmentTypes.filter((type) => type === row.tipo_equipo || !selected.includes(type));
      return `<div class="vcn-equipment-row" data-equipment-index="${index}"><label><span>Número de equipos</span><input class="vcn-equipment-qty" min="0" step="1" inputmode="numeric" type="number" value="${esc(row.cantidad ?? 0)}"></label><label><span>Tipo de equipos</span><select class="vcn-equipment-type"><option value="">Selecciona...</option>${options.map((type) => `<option value="${esc(type)}"${type === row.tipo_equipo ? ' selected' : ''}>${esc(type)}</option>`).join('')}</select></label>${state.equipmentRows.length > 1 ? '<button class="vcn-remove-equipment" type="button" aria-label="Eliminar tipo de equipo" title="Eliminar tipo de equipo">×</button>' : ''}</div>`;
    }).join('');

    list.querySelectorAll('.vcn-equipment-row').forEach((rowElement) => {
      const index = Number(rowElement.dataset.equipmentIndex);
      rowElement.querySelector('.vcn-equipment-qty').addEventListener('input', (event) => {
        markEquipmentEdited();
        const value = Number(event.target.value || 0);
        state.equipmentRows[index].cantidad = Number.isFinite(value) ? value : 0;
        updateEquipmentFooter();
      });
      rowElement.querySelector('.vcn-equipment-type').addEventListener('change', (event) => {
        markEquipmentEdited();
        state.equipmentRows[index].tipo_equipo = event.target.value;
        renderEquipmentRows();
      });
      rowElement.querySelector('.vcn-remove-equipment')?.addEventListener('click', () => {
        markEquipmentEdited();
        state.equipmentRows.splice(index, 1);
        renderEquipmentRows();
      });
    });
    updateEquipmentFooter();
  }

  function updateEquipmentFooter() {
    const total = $('#vcn-equipment-total');
    const add = $('#vcn-add-equipment');
    if (total) {
      const legacy = state.legacyEquipmentFallback;
      total.textContent = legacy && !legacy.dirty
        ? `Dato histórico sin desglose: ${legacy.total || 0} equipo(s) · ${legacy.types || 'Sin tipo'}. Se conservará mientras no modifiques el desglose.`
        : `Total de equipos: ${equipmentTotal()}`;
    }
    if (add) {
      const used = new Set(state.equipmentRows.map((row) => row.tipo_equipo).filter(Boolean));
      add.disabled = state.equipmentRows.length >= state.equipmentTypes.length || used.size >= state.equipmentTypes.length;
    }
  }

  function addEquipmentRow() {
    if (state.equipmentRows.length >= state.equipmentTypes.length) return;
    markEquipmentEdited();
    state.equipmentRows.push({ cantidad: 0, tipo_equipo: '' });
    renderEquipmentRows();
  }

  function equipmentPayload() {
    if (state.editId && state.legacyEquipmentFallback && !state.legacyEquipmentFallback.dirty) return null;
    const rows = [];
    const used = new Set();
    for (let index = 0; index < state.equipmentRows.length; index += 1) {
      const row = state.equipmentRows[index];
      const cantidad = Number(row.cantidad || 0);
      const tipo = String(row.tipo_equipo || '').trim();
      if (!tipo && cantidad === 0) continue;
      if (!tipo) throw new Error(`Selecciona el tipo de equipo en la fila ${index + 1}.`);
      if (!Number.isInteger(cantidad) || cantidad <= 0) throw new Error(`La cantidad de ${tipo} debe ser un entero mayor a cero.`);
      if (used.has(tipo)) throw new Error(`El tipo de equipo ${tipo} está repetido.`);
      used.add(tipo);
      rows.push({ tipo_equipo: tipo, cantidad, orden: rows.length + 1 });
    }
    return rows;
  }

  function saveDraftBeforeNewClient() {
    const form = $('#vcn-form');
    if (!form) return;
    const draft = {
      mode: state.editId ? 'edit' : 'create',
      editId: state.editId,
      originProspection: state.routePayload?.originProspection || null
    };
    new FormData(form).forEach((value, key) => {
      if (['id_cliente', 'telefono', 'correo'].includes(key)) return;
      draft[key] = String(value ?? '');
    });
    draft.equipos = state.equipmentRows.map((row) => ({ cantidad: Number(row.cantidad) || 0, tipo_equipo: String(row.tipo_equipo || '') }));
    try { sessionStorage.setItem(NEW_CLIENT_DRAFT_KEY, JSON.stringify(draft)); } catch (_error) {}
  }

  function restoreDraftAfterNewClient() {
    let draft = null;
    try { draft = JSON.parse(sessionStorage.getItem(NEW_CLIENT_DRAFT_KEY) || 'null'); }
    catch (_error) { draft = null; }
    if (!draft || typeof draft !== 'object') return null;
    state.editId = Number(draft.editId) || state.editId || null;
    if (draft.originProspection) {
      state.routePayload = { ...(state.routePayload || {}), originProspection: draft.originProspection };
    }
    const form = $('#vcn-form');
    if (!form) return draft;
    Object.entries(draft).forEach(([name, value]) => {
      if (['equipos', 'mode', 'editId', 'originProspection'].includes(name)) return;
      const field = form.elements.namedItem(name);
      if (!field) return;
      if (typeof RadioNodeList !== 'undefined' && field instanceof RadioNodeList) field.value = value;
      else if (field.type === 'checkbox') field.checked = value === 'true' || value === '1';
      else field.value = value;
    });
    if (Array.isArray(draft.equipos) && draft.equipos.length) {
      state.equipmentRows = draft.equipos.map((row) => ({ cantidad: Number(row.cantidad) || 0, tipo_equipo: String(row.tipo_equipo || '') }));
      renderEquipmentRows();
    }
    try { sessionStorage.removeItem(NEW_CLIENT_DRAFT_KEY); } catch (_error) {}
    return draft;
  }

  function openNewClient() {
    saveDraftBeforeNewClient();
    window.ManttoRouter?.go?.('ventas-clientes-nuevo', { returnTo: 'ventas-cotizaciones-nueva', source: 'ventas-cotizaciones-nueva' });
  }

  function renderClientOptions() {
    const box = $('#vcn-client-options');
    if (!box) return;
    const rows = state.filtered;
    box.innerHTML = rows.length
      ? rows.map((client) => `<button class="vcn-option" type="button" data-id="${client.id_cliente}"><strong>${esc(client.nombre_empresa)}</strong><small>${esc([client.ciudad, client.estado, client.iniciales].filter(Boolean).join(' · ') || 'Sin datos adicionales')}</small></button>`).join('')
      : '<div class="vcn-option"><small>No se encontraron clientes.</small></div>';
    box.hidden = false;
    box.querySelectorAll('[data-id]').forEach((button) => { button.onclick = () => selectClient(Number(button.dataset.id)); });
  }

  function filterClients() {
    const q = $('#vcn-client-search').value.trim().toLowerCase();
    state.filtered = state.clients.filter((client) => [client.nombre_empresa, client.razon_social, client.ciudad, client.estado, client.iniciales]
      .some((value) => String(value || '').toLowerCase().includes(q)));
    renderClientOptions();
  }

  async function selectClient(id, preferredContactId = null) {
    const client = state.clients.find((item) => Number(item.id_cliente) === Number(id));
    if (!client) return;
    state.selectedClient = client;
    $('#vcn-id-cliente').value = String(client.id_cliente);
    $('#vcn-client-search').value = client.nombre_empresa;
    $('#vcn-client-options').hidden = true;
    $('#vcn-ciudad').value = client.ciudad || '';
    if (client.estado) $('#vcn-estado').value = client.estado;
    $('#vcn-add-contact').disabled = false;
    await loadContacts(client.id_cliente, preferredContactId);
  }

  async function loadClients() {
    const data = await request('/api/ventas/clientes?page=1&page_size=5000&sort_by=nombre_empresa&sort_direction=asc');
    state.clients = Array.isArray(data.clientes) ? data.clientes : (Array.isArray(data.data) ? data.data : []);
    state.filtered = state.clients.slice();
  }

  async function loadContacts(idCliente, preferredContactId = null) {
    const select = $('#vcn-contacto');
    select.disabled = true;
    select.innerHTML = '<option value="">Cargando...</option>';
    state.contacts = [];
    applyContact(null);
    try {
      const response = await request(`/api/ventas/clientes/${idCliente}/contactos`);
      state.contacts = Array.isArray(response.contactos) ? response.contactos : (Array.isArray(response.data) ? response.data : []);
      select.innerHTML = '<option value="">Selecciona...</option>' + state.contacts.map((contact) => `<option value="${contact.id_contacto}">${esc(contact.nombre_contacto)}${contact.puesto_contacto ? ` · ${esc(contact.puesto_contacto)}` : ''}${Number(contact.contacto_principal) === 1 ? ' · Principal' : ''}</option>`).join('');
      select.disabled = false;
      const preferred = state.contacts.find((contact) => Number(contact.id_contacto) === Number(preferredContactId));
      const principal = preferred || state.contacts.find((contact) => Number(contact.contacto_principal) === 1) || state.contacts[0];
      if (principal) {
        select.value = String(principal.id_contacto);
        applyContact(principal.id_contacto);
      } else {
        select.innerHTML = '<option value="">Sin contactos registrados</option>';
        toast('El cliente no tiene contactos registrados. Usa “Crear contacto”.', true);
      }
    } catch (error) {
      select.disabled = false;
      select.innerHTML = '<option value="">No se pudieron cargar los contactos</option>';
      toast(error.message || 'No se pudieron cargar los contactos del cliente.', true);
    }
  }

  function applyContact(id) {
    const contact = state.contacts.find((item) => Number(item.id_contacto) === Number(id));
    $('#vcn-puesto-contacto').value = contact?.puesto_contacto || '';
    $('#vcn-telefono').value = contact?.telefono || '';
    $('#vcn-correo').value = contact?.email || '';
  }

  function fillSelect(id, rows) {
    const element = $(id);
    element.innerHTML = '<option value="">Selecciona...</option>' + rows.map((row) => `<option value="${esc(row.articulo ?? row)}">${esc(row.articulo ?? row)}</option>`).join('');
  }

  async function loadCatalogs() {
    const [general, quotations] = await Promise.all([
      catalogRequest('/api/catalogo-general?area=Ventas'),
      catalogRequest('/api/ventas/cotizaciones/catalogos')
    ]);
    const rows = Array.isArray(general.articulos) ? general.articulos : [];
    state.catalogs = rows.reduce((accumulator, row) => {
      const key = String(row.elemento || '');
      (accumulator[key] || (accumulator[key] = [])).push(row);
      return accumulator;
    }, {});
    fillSelect('#vcn-tipo-proyecto', state.catalogs['Tipo de Proyecto'] || []);
    state.equipmentTypes = normalizeEquipmentCatalog(state.catalogs['Tipo de Equipo'] || []);
    if (!state.equipmentTypes.length) state.equipmentTypes = ['Elevador', 'Montacargas', 'Escalera', 'Rampa', 'Plataformas/Otros'];
    renderEquipmentRows();
    const estados = (await catalogRequest('/api/catalogo-general?elemento=Estado')).articulos || [];
    fillSelect('#vcn-estado', estados);
    state.statuses = quotations.catalogos?.estatus_proyecto || [];
    fillSelect('#vcn-estatus', state.statuses);
    $('#vcn-estatus').value = 'Contacto';
  }

  function openContact() {
    if (!state.selectedClient) return toast('Selecciona primero un cliente.', true);
    window.ManttoVentasContactoForm?.open({
      container: '#vcn-contact-editor',
      clientId: state.selectedClient.id_cliente,
      onSaved: async (saved) => {
        await loadContacts(state.selectedClient.id_cliente);
        const id = Number(saved?.id_contacto || 0);
        if (id) {
          $('#vcn-contacto').value = String(id);
          applyContact(id);
        }
        toast('Contacto creado y seleccionado.');
      }
    });
  }

  function setField(name, value) {
    const element = $('#vcn-form')?.elements?.namedItem(name);
    if (element && value != null) element.value = String(value);
  }

  function setSelectIfAvailable(selector, value) {
    const element = $(selector);
    if (!element || value == null || value === '') return;
    const text = String(value);
    if ([...element.options].some((option) => option.value === text)) element.value = text;
  }

  async function applyProspectionPrefill() {
    const origin = state.routePayload?.originProspection;
    if (!origin || !(Number(origin.id_pros) > 0)) return;

    setField('nombre_proyecto', origin.proyecto);
    setSelectIfAvailable('#vcn-tipo-proyecto', origin.tipo_proyecto);
    setField('ciudad', origin.ciudad);
    setSelectIfAvailable('#vcn-estado', origin.estado);
    setField('telefono', origin.telefono);
    setField('correo', origin.correo);
    setField('comentario', origin.comentario);

    const selectedFromReturn = Number(state.routePayload?.selectedClientId) || null;
    const originClient = Number(origin.id_cliente) || null;
    const clientId = selectedFromReturn || originClient;
    if (clientId && state.clients.some((client) => Number(client.id_cliente) === clientId)) {
      const preferredContact = clientId === originClient ? Number(origin.id_contacto) || null : null;
      await selectClient(clientId, preferredContact);
      if (origin.ciudad) setField('ciudad', origin.ciudad);
      if (origin.estado) setSelectIfAvailable('#vcn-estado', origin.estado);
      return;
    }

    // Si la prospección nació sin cliente formal, solo precargamos el texto para
    // ayudar a buscar. El usuario todavía debe seleccionar/crear un cliente real.
    if (origin.empresa) {
      $('#vcn-client-search').value = origin.empresa;
      $('#vcn-id-cliente').value = '';
      state.selectedClient = null;
      state.filtered = state.clients.filter((client) => String(client.nombre_empresa || '').toLowerCase().includes(String(origin.empresa).toLowerCase()));
    }
  }

  async function loadEditRecord(id) {
    const data = await request(`/api/ventas/cotizaciones/${id}`);
    const quotation = data.cotizacion || data.data;
    if (!quotation) throw new Error('La cotización no fue encontrada.');
    state.editRecord = quotation;
    state.editId = Number(quotation.id_cotizacion) || Number(id);
    state.legacyEquipmentFallback = null;
    setModeCopy();
    if (quotation.id_cliente) await selectClient(quotation.id_cliente, quotation.id_contacto);
    setField('nombre_proyecto', quotation.nombre_proyecto);
    setField('tipo_proyecto', quotation.tipo_proyecto);
    setField('estatus_proyecto', quotation.estatus_proyecto);
    setField('informacion_envia', quotation.informacion_envia);
    setField('comentario', quotation.comentario);
    setField('telefono', quotation.telefono);
    setField('correo', quotation.correo);
    setField('ciudad', quotation.ciudad);
    setField('estado', quotation.estado);
    if (Array.isArray(quotation.equipos) && quotation.equipos.length) {
      state.equipmentRows = quotation.equipos.map((row) => ({ cantidad: Number(row.cantidad) || 0, tipo_equipo: String(row.tipo_equipo || '') }));
    } else if (String(quotation.tipo_equipos || '').trim() || Number(quotation.numero_equipos) > 0) {
      const legacyTypes = String(quotation.tipo_equipos || '').trim();
      const legacyTotal = Number(quotation.numero_equipos) || 0;
      state.legacyEquipmentFallback = { types: legacyTypes, total: legacyTotal, dirty: false };
      const exactType = state.equipmentTypes.find((type) => type.toLowerCase() === legacyTypes.toLowerCase());
      state.equipmentRows = exactType && legacyTotal > 0 ? [{ cantidad: legacyTotal, tipo_equipo: exactType }] : [{ cantidad: 0, tipo_equipo: '' }];
    } else {
      state.equipmentRows = [{ cantidad: 0, tipo_equipo: '' }];
    }
    renderEquipmentRows();
  }

  async function relateCreatedQuotationToProspection(savedId) {
    const origin = state.routePayload?.originProspection;
    if (!origin || !(Number(origin.id_pros) > 0)) return null;
    return request(`/api/ventas/prospeccion/${Number(origin.id_pros)}/cotizacion`, {
      method: 'PATCH',
      body: JSON.stringify({ id_cotizacion: savedId })
    });
  }

  async function saveQuotation(event) {
    event.preventDefault();
    const form = $('#vcn-form');
    if (!form.reportValidity()) return;
    if (!state.selectedClient || !$('#vcn-id-cliente').value) return toast('Selecciona un cliente válido de la lista.', true);
    const idContacto = Number($('#vcn-contacto').value);
    const contacto = state.contacts.find((contact) => Number(contact.id_contacto) === idContacto);
    if (!contacto) return toast('Selecciona un contacto válido.', true);

    let equipos;
    try { equipos = equipmentPayload(); }
    catch (error) { return toast(error.message, true); }

    const formData = new FormData(form);
    const payload = {
      nombre_proyecto: String(formData.get('nombre_proyecto') || '').trim(),
      id_cliente: Number(formData.get('id_cliente')),
      id_contacto: idContacto,
      cliente: state.selectedClient.nombre_empresa,
      contacto: contacto.nombre_contacto,
      telefono: String(formData.get('telefono') || '').trim() || null,
      correo: String(formData.get('correo') || '').trim(),
      ciudad: String(formData.get('ciudad') || '').trim() || null,
      estado: formData.get('estado') || null,
      tipo_proyecto: formData.get('tipo_proyecto') || null,
      informacion_envia: String(formData.get('informacion_envia') || '').trim() || null,
      estatus_proyecto: formData.get('estatus_proyecto'),
      comentario: String(formData.get('comentario') || '').trim() || null,
      id_asesor: state.editRecord?.id_asesor || state.selectedClient.id_asesor || null,
      asesor: state.editRecord?.asesor || state.selectedClient.iniciales || null
    };
    if (equipos === null && state.legacyEquipmentFallback) {
      payload.numero_equipos = state.legacyEquipmentFallback.total || 0;
      payload.tipo_equipos = state.legacyEquipmentFallback.types || null;
    } else {
      payload.equipos = equipos;
      payload.numero_equipos = equipos.reduce((sum, row) => sum + row.cantidad, 0);
      payload.tipo_equipos = equipos.map((row) => row.tipo_equipo).join(', ') || null;
    }
    payload.fecha_solicitud = state.editId ? state.editRecord?.fecha_solicitud || null : new Date().toISOString();

    const button = $('#vcn-save');
    button.disabled = true;
    button.textContent = state.editId ? 'Guardando cambios...' : 'Guardando...';
    let createdId = null;
    try {
      const path = '/api/ventas/cotizaciones';
      const data = await request(path, { method: 'POST', body: JSON.stringify(payload) });
      createdId = Number(data.cotizacion?.id_cotizacion || 0);
      if (!(createdId > 0)) throw new Error('La cotización se guardó, pero la API no devolvió un ID válido.');

      document.dispatchEvent(new CustomEvent('mantto:data-mutated', {
        detail: { route: 'ventas-cotizaciones', path, method: 'POST', id: createdId }
      }));

      const origin = state.routePayload?.originProspection;
      if (origin && Number(origin.id_pros) > 0) {
        try {
          await relateCreatedQuotationToProspection(createdId);
          document.dispatchEvent(new CustomEvent('mantto:data-mutated', {
            detail: { route: 'ventas-prospeccion', path: `/api/ventas/prospeccion/${origin.id_pros}/cotizacion`, method: 'PATCH', id: Number(origin.id_pros) }
          }));
          toast('Cotización creada, relacionada y prospección marcada como Cotizado.');
          setTimeout(() => window.ManttoRouter?.go?.('ventas-prospeccion-detalle', { id_pros: Number(origin.id_pros) }), 450);
        } catch (relationError) {
          toast(`Cotización #${createdId} creada, pero no se pudo relacionar: ${relationError.message}`, true);
          setTimeout(() => window.ManttoRouter?.go?.('ventas-prospeccion-detalle', { id_pros: Number(origin.id_pros) }), 1400);
        }
        return;
      }

      toast('Cotización creada correctamente.');
      setTimeout(() => window.ManttoRouter?.go?.('ventas-cotizaciones-detalle', { id: createdId }), 350);
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
      setModeCopy();
    }
  }

  function bind() {
    const search = $('#vcn-client-search');
    search.addEventListener('input', () => {
      $('#vcn-id-cliente').value = '';
      state.selectedClient = null;
      filterClients();
    });
    search.addEventListener('focus', filterClients);
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.vcn-combobox')) $('#vcn-client-options').hidden = true;
    });
    $('#vcn-contacto').onchange = (event) => applyContact(event.target.value);
    $('#vcn-add-contact').onclick = openContact;
    $('#vcn-form').onsubmit = saveQuotation;
    $('#vcn-back').onclick = goBack;
    $('#vcn-cancel').onclick = goBack;
    $('#vcn-add-client').onclick = openNewClient;
    $('#vcn-add-equipment').onclick = addEquipmentRow;
  }

  async function mount(payload) {
    state.routePayload = payload || null;
    const editMode = String(payload?.mode || '').toLowerCase() === 'edit';
    const requestedEditId = Number(payload?.id || payload?.id_cotizacion) || null;
    if (editMode) {
      if (!requestedEditId) throw new Error('No se recibió una cotización válida para editar.');
      if (!window.ManttoRouter?.go) throw new Error('No está disponible la navegación de Editar cotización.');
      window.ManttoRouter.go('ventas-cotizaciones-editar', {
        id: requestedEditId,
        record: payload?.record || payload?.cotizacion || null
      }, { replace: true, skipHistory: true, navigationType: 'redirect' });
      return true;
    }

    state.editId = null;
    state.editRecord = null;
    state.legacyEquipmentFallback = null;
    state.selectedClient = null;
    state.contacts = [];
    state.equipmentRows = [{ cantidad: 0, tipo_equipo: '' }];

    const view = $('#view-ventas-cotizaciones-nueva');
    if (!view) return false;
    if (view.dataset.ready !== '1' || view.dataset.cotizacionFormMode !== 'new') {
      const response = await fetch('./modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.html?v=20260805-equipos-multiples-v001', { cache: 'default' });
      if (!response.ok) throw new Error('No se pudo cargar la plantilla de cotización.');
      view.innerHTML = await response.text();
      view.dataset.ready = '1';
      view.dataset.cotizacionFormMode = 'new';
      bind();
    }

    try {
      await Promise.all([loadClients(), loadCatalogs()]);
      if (state.routePayload?.createdClient) restoreDraftAfterNewClient();
      await applyProspectionPrefill();
      const selected = Number(state.routePayload?.selectedClientId);
      if (!state.routePayload?.originProspection && selected && state.clients.some((client) => Number(client.id_cliente) === selected)) {
        await selectClient(selected);
      }
      setModeCopy();
    } catch (error) {
      toast(error.message, true);
    }
    return true;
  }

  window.ManttoVentasCotizacionesNueva = { init: mount };
})();
