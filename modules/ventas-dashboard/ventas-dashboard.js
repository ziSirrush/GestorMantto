(function () {
  'use strict';

  // [Aster | 2026-08-31 | ASTER-MG | FIX DASHBOARD VENTAS CACHE/REINGRESO/ACTUALIZAR V001]
  // Regla: primera carga completa; conservar datos al navegar; refrescar solo por cambio
  // real, cambio de filtro de datos o solicitud manual del usuario.
  const TEMPLATE_VERSION = '20260831-anio-seccion-v003';
  const TEMPLATE_URL = `./modules/ventas-dashboard/ventas-dashboard.html?v=${TEMPLATE_VERSION}`;
  const STORAGE_KEY = 'mantto:ventas-dashboard:fase1-reacomodo-v001';
  const TABLE_PAGE_SIZE = 30;
  const ALL_USERS_VALUE = 'todos';

  let initialized = false;
  let loadingPromise = null;
  let users = [];
  let requestId = 0;
  let tableData = {};
  let availableTableKeys = null;
  let pdfCapabilities = { general: false, individual: false };
  let pdfPreparing = false;
  let dataLoaded = false;
  let usersLoaded = false;
  let pdfCapabilitiesLoaded = false;
  let cachedKpis = null;
  let cachedYears = [];
  let sectionYears = { ventas: new Date().getFullYear(), perdido: new Date().getFullYear() };
  let cachedQueryKey = '';
  let refreshBusy = false;
  let mutationListenerBound = false;
  let dirtyRefreshPromise = null;
  const tablePages = {};
  const dirtyScopes = new Set();

  const COMMERCIAL_KEYS = Object.freeze(['prospeccion', 'redes', 'cotizaciones', 'clientes', 'ventas', 'perdido']);
  const OPERATIONAL_KEYS = Object.freeze(['logistica', 'instalaciones', 'tareas_asignadas', 'tareas_creadas']);

  // Fuente: Reporte Logistica (PL_PIPELINE_ORDER / PL_COLUMNAS_POR_ESTATUS).
  // Se mantienen las 12 secciones y los encabezados del reporte sin normalizarlos.
  const LOGISTICS_PIPELINE_ORDER = Object.freeze([
    'SIN PRODUCCIÓN / Documentación Pendiente',
    'SIN PRODUCCIÓN / Primera Visita a Obra',
    'SIN PRODUCCIÓN / Pendiente Liberación por Parte del Cliente',
    'SIN PRODUCCIÓN / Programados a Producción',
    'EN PRODUCCION',
    'PARADOS POR CLIENTE',
    'PENDIENTE PAGO LIBERACIÓN',
    'PROGRAMADO',
    'EN TRANSITO',
    'PROGRAMA ENTREGA',
    'ENTREGADO',
    'ALMACENADOS'
  ]);

  const LOGISTICS_COLUMNS_BY_STATUS = Object.freeze({
    'SIN PRODUCCIÓN / Documentación Pendiente': ['PH NS', 'Proyecto', 'Supervisor(a)', 'Asesor', 'Proveedor', 'Qty', 'Carpeta', 'Pago cliente', 'POL', 'PLoD', 'Comentarios'],
    'SIN PRODUCCIÓN / Primera Visita a Obra': ['PH NS', 'Proyecto', 'Supervisor(a)', 'Asesor', 'Proveedor', 'Qty', 'Carpeta', 'PVO', 'Pago cliente', 'Fecha producción', 'Estimado obra', 'POL', 'PLoD', 'No control', 'Comentarios'],
    'SIN PRODUCCIÓN / Pendiente Liberación por Parte del Cliente': ['PH NS', 'Proyecto', 'Supervisor(a)', 'Asesor', 'Proveedor', 'Qty', 'Carpeta', 'PVO', 'Pago cliente', 'Fecha producción', 'Estimado obra', 'POL', 'PLoD', 'No control', 'Comentarios'],
    'SIN PRODUCCIÓN / Programados a Producción': ['PH NS', 'Proyecto', 'Supervisor(a)', 'Asesor', 'Proveedor', 'Qty', 'Carpeta', 'PVO', 'Pago cliente', 'Fecha producción', 'Estimado obra', 'POL', 'PLoD', 'No control', 'Comentarios'],
    'EN PRODUCCION': ['PH NS', 'No control', 'Qty', 'Proyecto', 'Supervisor(a)', 'Asesor', 'Pago cliente', 'Pago de liberación', 'EXW date', 'Incoterm', 'POL', 'POD', 'Entrega programada', 'Comentarios'],
    'PARADOS POR CLIENTE': ['PH NS', 'Proyecto', 'Supervisor(a)', 'Asesor', 'Proveedor', 'Qty', 'Pago cliente', 'EXW date', 'POL', 'PLoD', 'Comentarios'],
    'PENDIENTE PAGO LIBERACIÓN': ['PH NS', 'No control', 'Qty', 'Proyecto', 'Supervisor(a)', 'Asesor', 'Incoterm', 'POL', 'POD', 'Comentarios'],
    'PROGRAMADO': ['PH NS', 'No control', 'Qty', 'Proyecto', 'Supervisor(a)', 'Asesor', 'Incoterm', 'EXW date', 'POL', 'ETD', 'POD', 'ETA', 'Comentarios'],
    'EN TRANSITO': ['PH NS', 'No control', 'Qty', 'Proyecto', 'Supervisor(a)', 'Asesor', 'ICT', 'Incoterm', 'EXW date', 'POL', 'ETD', 'Real departure', 'T/T', 'ETA', 'Real arrival', 'Estimado obra'],
    'PROGRAMA ENTREGA': ['PH NS', 'Qty', 'Proyecto', 'Supervisor(a)', 'Asesor', 'EXW date', 'ETD', 'Real departure', 'T/T', 'ETA', 'Real arrival', 'Pago pdmto', 'Loaded at truck or train', 'Tiempo aduana', 'PLoD', 'Entrega real en obra', 'Comentarios'],
    'ENTREGADO': ['PH NS', 'Qty', 'Proyecto', 'Supervisor(a)', 'Asesor', 'EXW date', 'POL', 'ETD', 'Real departure', 'T/T', 'POD', 'ETA', 'Real arrival', 'Pago pdmto', 'Loaded at truck or train', 'Tiempo aduana', 'PLoD', 'Entrega programada', 'Entrega real en obra', 'Dif.', 'Tiempo total'],
    'ALMACENADOS': ['PH NS', 'Qty', 'Proyecto', 'Supervisor(a)', 'Asesor', 'EXW date', 'POL', 'ETD', 'Real departure', 'T/T', 'POD', 'ETA', 'Real arrival', 'Pago pdmto', 'Loaded at truck or train', 'Tiempo aduana', 'PLoD', 'Entrega programada', 'Fecha Alm.', 'Fecha Fin Alm.', 'Aditiva termina']
  });

  const LOGISTICS_FIELD_KEYS = Object.freeze({
    'PH NS': 'ph_ns',
    'Proyecto': 'proyecto',
    'Supervisor(a)': 'supervisor',
    'Asesor': 'asesor',
    'Proveedor': 'proveedor',
    'Qty': 'cantidad',
    'Carpeta': 'carpeta',
    'Pago cliente': 'pago_cliente',
    'POL': 'puerto_origen',
    'PLoD': 'lugar_entrega',
    'Comentarios': 'comentarios',
    'PVO': 'pvo',
    'Fecha producción': 'fecha_produccion',
    'Estimado obra': 'fecha_estimada_obra',
    'No control': 'no_control',
    'Pago de liberación': 'pago_liberacion',
    'EXW date': 'fecha_exw',
    'Incoterm': 'incoterm',
    'POD': 'puerto_destino',
    'ICT': 'ict',
    'ETD': 'fecha_salida_estimada',
    'Real departure': 'fecha_salida_real',
    'T/T': 'tiempo_transito',
    'ETA': 'fecha_llegada_estimada',
    'Real arrival': 'fecha_llegada_real',
    'Pago pdmto': 'fecha_pago_pedimento',
    'Loaded at truck or train': 'fecha_carga_transporte_nacional',
    'Tiempo aduana': 'tiempo_aduana',
    'Entrega real en obra': 'fecha_entrega_real_obra',
    'Entrega programada': 'fecha_entrega_programada',
    'Dif.': 'diferencia_dias',
    'Tiempo total': 'tiempo_total',
    'Fecha Alm.': 'fecha_entrada_almacen',
    'Fecha Fin Alm.': 'fecha_salida_almacen',
    'Aditiva termina': 'fecha_termino_aditiva'
  });

  // Orden oficial del Dashboard Ventas — Fase 1.
  // Fase 5 aplica la estructura definitiva de Logística y Activos.
  const defs = {
    prospeccion: {
      filter: 'prospeccion',
      title: 'Prospección',
      headers: ['Empresa', 'Proyecto', 'Estatus', 'Asesor', 'Ciudad', 'Estado', 'Fecha visita'],
      ownerHeaderIndex: 3
    },
    redes: {
      filter: 'redes',
      title: 'Redes',
      headers: ['Contacto', 'Contacto vía', 'Empresa / Proyecto', 'Solicitud', 'Asignado a', 'Estatus', 'Cotización'],
      ownerHeaderIndex: 4
    },
    cotizaciones: {
      filter: 'cotizaciones',
      title: 'Cotizaciones',
      headers: ['Proyecto', 'Cliente', 'Asesor', 'Estatus', 'Equipos', 'Fecha', 'Ciudad', 'Estado'],
      ownerHeaderIndex: 2
    },
    clientes: {
      filter: 'clientes',
      title: 'Clientes',
      headers: ['Cliente', 'Asesor', 'Ciudad / Estado', 'Tipo', 'Cotizaciones', 'En proceso', 'Vendidas', 'Perdidas'],
      ownerHeaderIndex: 1
    },
    ventas: {
      filter: 'ventas',
      title: 'Ventas',
      headers: ['Proyecto', 'Cliente', 'Asesor', 'Fecha de venta', 'Equipos', 'Ciudad', 'Estado'],
      ownerHeaderIndex: 2
    },
    perdido: {
      filter: 'perdido',
      title: 'Perdidos',
      headers: ['Proyecto', 'Cliente', 'Asesor', 'Razón de perdido', 'Empresa vs. quien se perdió', 'Equipos', 'Fecha de pérdida', 'Ciudad', 'Estado'],
      ownerHeaderIndex: 2
    },
    logistica: {
      filter: 'logistica',
      title: 'Logística',
      headers: []
    },
    instalaciones: {
      filter: 'activos',
      title: 'Activos',
      headers: ['Proyecto', 'Cantidad de equipos', '%OC', '%M', '%A', '%General']
    },
    tareas_asignadas: {
      filter: 'tareas_asignadas',
      title: 'Pendientes asignados',
      headers: ['Pendiente', 'Prioridad', 'Estatus', 'Proyecto', 'Área', 'Fecha límite', 'Responsables']
    },
    tareas_creadas: {
      filter: 'tareas_creadas',
      title: 'Pendientes creados',
      headers: ['Pendiente', 'Prioridad', 'Estatus', 'Proyecto', 'Área', 'Fecha límite', 'Responsables']
    }
  };

  function selectedUserValue() {
    return String(document.getElementById('vd-user-select')?.value || ALL_USERS_VALUE).trim().toLowerCase();
  }

  function isAllUsersMode() {
    return selectedUserValue() === ALL_USERS_VALUE;
  }

  function selectedUserId() {
    const id = Number(document.getElementById('vd-user-select')?.value);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  function currentCommercialYear() {
    return new Date().getFullYear();
  }

  function normalizedYear(value, fallback = currentCommercialYear()) {
    const year = Number(value);
    return Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : fallback;
  }

  function selectedSectionYear(key) {
    const current = normalizedYear(sectionYears[key]);
    const select = document.querySelector(`[data-section-year="${key}"]`);
    if (!select) return current;
    const selected = normalizedYear(select.value, current);
    sectionYears[key] = selected;
    return selected;
  }

  function setSectionYear(key, value) {
    if (!['ventas', 'perdido'].includes(key)) return currentCommercialYear();
    const year = normalizedYear(value);
    sectionYears[key] = year;
    return year;
  }

  function mergeCachedYears(values = []) {
    const current = currentCommercialYear();
    const incoming = Array.isArray(values) ? values : [];
    cachedYears = [...new Set([
      current,
      sectionYears.ventas,
      sectionYears.perdido,
      ...cachedYears,
      ...incoming
    ].map(Number).filter((year) => Number.isInteger(year) && year >= 1900 && year <= 2200))]
      .sort((a, b) => b - a);
    return cachedYears;
  }

  function yearOptionsHtml(key) {
    const selectedYear = selectedSectionYear(key);
    const years = mergeCachedYears([]);
    return years.map((year) => `<option value="${year}"${year === selectedYear ? ' selected' : ''}>${year}</option>`).join('');
  }

  function sectionYearFilterHtml(key) {
    if (!['ventas', 'perdido'].includes(key)) return '';
    const label = key === 'ventas' ? 'Año de venta' : 'Año de pérdida';
    return `<div class="vd-table-head-actions"><div class="vd-table-year-filter"><label for="vd-year-${key}">${label}</label><select id="vd-year-${key}" data-section-year="${key}" aria-label="${label}">${yearOptionsHtml(key)}</select></div></div>`;
  }

  function resetTablePages() {
    Object.keys(tablePages).forEach((key) => { tablePages[key] = 1; });
  }

  function setPdfProgress(type, active) {
    const button = document.getElementById(`vd-pdf-${type}`);
    const progress = document.getElementById(`vd-pdf-${type}-progress`);
    if (button) {
      button.disabled = Boolean(active);
      button.textContent = active
        ? 'Generando PDF...'
        : (type === 'general' ? 'Generar PDF general' : 'Generar PDF del asesor');
    }
    if (progress) progress.hidden = !active;
  }

  function setRefreshProgress(active) {
    refreshBusy = Boolean(active);
    const button = document.getElementById('vd-refresh');
    if (!button) return;
    button.disabled = refreshBusy;
    button.textContent = refreshBusy ? '↻ Actualizando...' : '↻ Actualizar';
    button.setAttribute('aria-busy', refreshBusy ? 'true' : 'false');
  }

  function updatePdfActions() {
    const hasSelectedAdvisor = !isAllUsersMode() && selectedUserId() !== null;
    const generalWrap = document.getElementById('vd-pdf-general-wrap');
    const individualWrap = document.getElementById('vd-pdf-individual-wrap');
    if (generalWrap) generalWrap.hidden = hasSelectedAdvisor || pdfCapabilities.general !== true;
    if (individualWrap) individualWrap.hidden = !hasSelectedAdvisor || pdfCapabilities.individual !== true;
  }

  async function loadPdfCapabilities() {
    if (pdfCapabilitiesLoaded) {
      updatePdfActions();
      return;
    }
    try {
      const response = await req('/api/ventas/dashboard/pdf/capabilities');
      pdfCapabilities = {
        general: response?.pdf?.general === true,
        individual: response?.pdf?.individual === true
      };
    } catch (_error) {
      pdfCapabilities = { general: false, individual: false };
    }
    pdfCapabilitiesLoaded = true;
    updatePdfActions();
  }

  async function preparePdf(type) {
    if (pdfPreparing) return;
    const id = selectedUserId();
    if (type === 'individual' && id === null) {
      msg('Selecciona un responsable comercial antes de preparar el PDF individual.', 'error');
      return;
    }
    pdfPreparing = true;
    setPdfProgress(type, true);
    msg(type === 'general'
      ? 'Preparando datos de los responsables dentro de tu alcance autorizado...'
      : 'Preparando datos del responsable seleccionado...');
    try {
      const query = new URLSearchParams({ tipo: type });
      if (type === 'individual') query.set('usuario_id', String(id));
      const response = await req(`/api/ventas/dashboard/pdf/data?${query.toString()}`);
      if (type === 'individual') {
        if (!window.VentasDashboardPdf_cor || typeof window.VentasDashboardPdf_cor.generateIndividual !== 'function') {
          throw new Error('El generador PDF de Dashboard Ventas no está disponible.');
        }
        window.VentasDashboardPdf_cor.generateIndividual(response);
        msg('PDF individual generado correctamente.', 'ok');
      } else {
        if (!window.VentasDashboardPdf_cor || typeof window.VentasDashboardPdf_cor.generateGeneral !== 'function') {
          throw new Error('El generador PDF general de Dashboard Ventas no está disponible.');
        }
        window.VentasDashboardPdf_cor.generateGeneral(response);
        msg(`PDF general generado correctamente con ${Number(response?.total_asesores || 0)} responsables.`, 'ok');
      }
    } catch (error) {
      msg(error.message || 'No fue posible preparar los datos del PDF.', 'error');
    } finally {
      pdfPreparing = false;
      setPdfProgress(type, false);
      updatePdfActions();
    }
  }

  function auth() {
    if (!window.ManttoAuth || typeof window.ManttoAuth.apiGet !== 'function') {
      throw new Error('El servicio central de sesión todavía no está disponible.');
    }
    return window.ManttoAuth;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }

  function sectionInputs(includeAll = false) {
    const selector = includeAll
      ? '#vd-check-grid input'
      : '#vd-check-grid input:not([value="todos"])';
    return [...document.querySelectorAll(selector)];
  }

  function availableFilters() {
    return Object.entries(defs)
      .filter(([key]) => !(availableTableKeys instanceof Set) || availableTableKeys.has(key))
      .map(([key, def]) => def.filter || key);
  }

  function selected() {
    const available = availableFilters();
    const inputs = sectionInputs(false);
    if (!inputs.length) return available;
    const checked = new Set(inputs
      .filter((input) => input.checked && !input.disabled)
      .map((input) => String(input.value || '').trim().toLowerCase()));
    return available.filter((value) => checked.has(value));
  }

  function selectedSectionValue() {
    const available = availableFilters();
    const active = selected();
    if (active.length === available.length) return ALL_USERS_VALUE;
    if (active.length === 1) return active[0];
    return active.join(',');
  }

  function currentState() {
    return { seccion: selectedSectionValue(), secciones: selected() };
  }

  function visibleSectionInputs() {
    return sectionInputs(false).filter((input) => {
      const label = input.closest('.vd-check');
      return !input.disabled && (!label || label.hidden !== true);
    });
  }

  function syncAllSections() {
    const all = document.querySelector('#vd-check-grid input[value="todos"]');
    if (!all) return;
    const items = visibleSectionInputs();
    all.checked = items.length > 0 && items.every((item) => item.checked);
    all.indeterminate = false;
    all.disabled = items.length === 0;
  }

  function setAllSections(checked) {
    visibleSectionInputs().forEach((input) => { input.checked = Boolean(checked); });
    syncAllSections();
  }

  function applySectionSelection(values) {
    if (!Array.isArray(values)) {
      setAllSections(true);
      return;
    }
    const wanted = new Set(values.map((value) => String(value || '').trim().toLowerCase()));
    visibleSectionInputs().forEach((input) => { input.checked = wanted.has(input.value); });
    syncAllSections();
  }

  function save() {
    // Mantiene la regla vigente de no persistir filtros en sessionStorage.
    // La memoria de la instancia sí se conserva mientras la SPA permanezca abierta.
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (_error) {}
  }

  function renderLoadingState() {
    const stage = document.getElementById('vd-stage');
    if (!stage) return;
    stage.innerHTML = '<div class="vd-empty"><span>📊</span><h2>Cargando Dashboard</h2><p>Se consultará únicamente la información permitida por tu alcance.</p></div>';
  }

  function resetDashboardDefaults({ clearData = false } = {}) {
    const userSelect = document.getElementById('vd-user-select');
    if (userSelect && [...userSelect.options].some((option) => option.value === ALL_USERS_VALUE)) {
      userSelect.value = ALL_USERS_VALUE;
    }

    setAllSections(true);

    resetTablePages();
    save();

    if (clearData) {
      tableData = {};
      availableTableKeys = null;
      cachedKpis = null;
      cachedYears = [];
      sectionYears = { ventas: currentCommercialYear(), perdido: currentCommercialYear() };
      cachedQueryKey = '';
      dataLoaded = false;
      kpis(null);
      renderLoadingState();
      msg('');
    }
  }

  function msg(text, type) {
    const node = document.getElementById('vd-message');
    if (!node) return;
    node.textContent = text || '';
    node.className = 'vd-message' + (type ? ` is-${type}` : '');
  }

  async function req(path) { return auth().apiGet(path); }

  async function template() {
    const view = document.getElementById('view-ventas-dashboard');
    if (!view) throw new Error('No existe la vista Dashboard Ventas.');
    const current = view.querySelector('.vd-page');
    const currentVersion = current?.dataset?.vdTemplateVersion || '';
    if (!current || currentVersion !== TEMPLATE_VERSION) {
      const response = await fetch(TEMPLATE_URL, { cache: 'default' });
      if (!response.ok) throw new Error('No fue posible cargar la vista Dashboard Ventas.');
      view.innerHTML = await response.text();
      initialized = false;
    }
    return view;
  }

  function renderUsers(selectedValue = null) {
    const select = document.getElementById('vd-user-select');
    if (!select) return;
    const desired = selectedValue == null ? selectedUserValue() : String(selectedValue);
    select.innerHTML = `<option value="${ALL_USERS_VALUE}">Todos</option>` + users.map((user) =>
      `<option value="${esc(user.id_usuario)}" data-meta="${esc([user.tipo_perfil, user.puesto].filter(Boolean).join(' · '))}">${esc(user.nombre)}</option>`
    ).join('');
    select.value = [...select.options].some((option) => option.value === desired) ? desired : ALL_USERS_VALUE;
  }

  function applyTableAvailability() {
    const inputs = sectionInputs(false);
    if (!inputs.length) return;

    const checkedBefore = inputs.filter((input) => input.checked).map((input) => input.value);
    inputs.forEach((input) => {
      const entry = Object.entries(defs).find(([, def]) => (def.filter || '') === input.value);
      const allowed = !(availableTableKeys instanceof Set) || Boolean(entry && availableTableKeys.has(entry[0]));
      input.disabled = !allowed;
      const label = input.closest('.vd-check');
      if (label) label.hidden = !allowed;
    });

    const visible = visibleSectionInputs();
    if (visible.length && checkedBefore.length && !visible.some((input) => input.checked)) {
      visible.forEach((input) => { input.checked = true; });
    }
    syncAllSections();
  }

  function applyModules() {
    resetDashboardDefaults();
  }

  function activeQuoteKpis() {
    const rows = Array.isArray(tableData.cotizaciones) ? tableData.cotizaciones : [];
    return {
      cotizaciones: rows.length,
      equipos: rows.reduce((sum, row) => sum + Number(row?.numero_equipos || 0), 0)
    };
  }

  function syncActiveQuoteKpis() {
    cachedKpis = {
      ...(cachedKpis || {}),
      cotizados: activeQuoteKpis()
    };
  }

  function kpis(data) {
    const source = data || cachedKpis;
    const values = {
      'vd-kpi-cotizados-cotizaciones': source?.cotizados?.cotizaciones,
      'vd-kpi-cotizados-equipos': source?.cotizados?.equipos,
      'vd-kpi-vendidos-cotizaciones': source?.vendidos?.cotizaciones,
      'vd-kpi-vendidos-equipos': source?.vendidos?.equipos,
      'vd-kpi-perdidos-cotizaciones': source?.perdidos?.cotizaciones,
      'vd-kpi-perdidos-equipos': source?.perdidos?.equipos
    };
    Object.entries(values).forEach(([id, value]) => {
      const node = document.getElementById(id);
      if (node) node.textContent = value == null ? '—' : Number(value).toLocaleString('es-MX');
    });
    const titles = {
      'vd-kpi-title-cotizados': 'Cotizaciones activas',
      'vd-kpi-title-vendidos': `Ventas · ${selectedSectionYear('ventas')}`,
      'vd-kpi-title-perdidos': `Perdidos · ${selectedSectionYear('perdido')}`
    };
    Object.entries(titles).forEach(([id, text]) => {
      const node = document.getElementById(id);
      if (node) node.textContent = text;
    });
  }

  function val(value) {
    if (value == null || value === '') return '—';
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
      const date = new Date(text.length === 10 ? `${text}T12:00:00` : text);
      if (!Number.isNaN(date.getTime())) return date.toLocaleDateString('es-MX');
    }
    return text;
  }

  function indicators(row) {
    const source = row || {};
    const visual = Array.isArray(source.estados_visuales) ? source.estados_visuales : [];
    const codes = visual.map((item) => String(typeof item === 'string' ? item : item?.codigo || '').toUpperCase());
    const isNew = source.es_nuevo === true || Number(source.es_nuevo || source.nuevo || source.no_visto || 0) > 0 || codes.includes('NUEVO');
    const hasComment = source.comentario_nuevo === true || Number(source.comentarios_nuevos || source.comentario_nuevo || source.tiene_comentario_nuevo || 0) > 0 || codes.includes('COMENTARIO_NUEVO');
    if (window.EstadosVisuales_gnral?.renderMany) {
      return window.EstadosVisuales_gnral.renderMany([isNew ? 'NUEVO' : null, hasComment ? 'COMENTARIO_NUEVO' : null].filter(Boolean), { empty: '' });
    }
    return `${isNew ? '🆕 ' : ''}${hasComment ? '💬 ' : ''}`;
  }

  function cell(value, className = '') { return `<td${className ? ` class="${className}"` : ''}>${esc(val(value))}</td>`; }
  function ownerCell(value, className = '') { return isAllUsersMode() ? cell(value, className) : ''; }
  function projectCell(row, key = 'nombre_proyecto') { return `<td><strong>${indicators(row)}${esc(val(row[key]))}</strong></td>`; }
  function quoteClientCell(row) {
    const missingRelation = row?.id_cliente == null || Number(row.id_cliente) <= 0;
    if (!missingRelation) return cell(row.cliente);
    return `<td style="background:#fff7ed;color:#9a3412" title="Cotización sin cliente relacionado"><strong>⚠️ ${esc(val(row.cliente))}</strong><small class="vd-cell-sub" style="display:block;color:#9a3412">Sin cliente relacionado</small></td>`;
  }

  function rowRoute(key, row) {
    if (key === 'clientes' && row.id_cliente) return ['ventas-clientes-detalle', row.id_cliente];
    if (['cotizaciones', 'ventas', 'perdido'].includes(key) && row.id_cotizacion) return ['ventas-cotizaciones-detalle', row.id_cotizacion];
    if (key === 'redes' && row.id_redes) return ['ventas-asignacion-redes-detalle', row.id_redes];
    if (key === 'prospeccion' && row.id_pros) return ['ventas-prospeccion-detalle', row.id_pros];
    return null;
  }

  function rowCells(key, row) {
    switch (key) {
      case 'prospeccion':
        return cell(row.empresa) + cell(row.proyecto) + cell(row.estatus) + ownerCell(row.asesor) + cell(row.ciudad) + cell(row.estado) + cell(row.fecha_visita);
      case 'redes':
        return cell(row.nombre_contacto) + cell(row.contacto_via) + cell([row.nombre_empresa, row.nombre_proyecto].filter(Boolean).join(' / ')) + cell(row.solicitud) + ownerCell(row.asignado_a) + cell(row.estatus) + cell(row.cotizacion);
      case 'cotizaciones':
        return projectCell(row) + quoteClientCell(row) + ownerCell(row.asesor) + cell(row.estatus_proyecto) + cell(Number(row.numero_equipos || 0)) + cell(row.fecha_efectiva || row.fecha_solicitud || row.fecha_cotizacion) + cell(row.ciudad) + cell(row.estado);
      case 'clientes': {
        const withoutProject = Number(row.cotizaciones || 0) === 0;
        const relationNote = withoutProject
          ? '<small class="vd-cell-sub" style="display:block;color:#9a3412;font-weight:800">Sin proyecto/cotización relacionada</small>'
          : '';
        return `<td><strong>${indicators(row)}${esc(val(row.nombre_empresa))}</strong><small class="vd-cell-sub">${esc(row.razon_social || '')}</small>${relationNote}</td>` + ownerCell(row.iniciales) + cell([row.ciudad, row.estado].filter(Boolean).join(' · ')) + cell(row.tipo_cliente) + cell(Number(row.cotizaciones || 0), 'vd-number') + cell(Number(row.en_proceso || 0), 'vd-number') + cell(Number(row.vendidas || 0), 'vd-number') + cell(Number(row.perdidas || 0), 'vd-number');
      }
      case 'ventas':
        return projectCell(row) + cell(row.cliente) + ownerCell(row.asesor) + cell(row.fecha_cierre) + cell(Number(row.numero_equipos || 0)) + cell(row.ciudad) + cell(row.estado);
      case 'perdido':
        return projectCell(row) + cell(row.cliente) + ownerCell(row.asesor) + cell(row.razon_perdido) + cell(row.empresa_vs_perdido) + cell(Number(row.numero_equipos || 0)) + cell(row.fecha_cambio_estatus) + cell(row.ciudad) + cell(row.estado);
      case 'logistica':
        return '';
      case 'instalaciones':
        return projectCell(row, 'proyecto')
          + cell(Number(row.cantidad_equipos || 0), 'vd-number')
          + cell(`${Number(row.porcentaje_oc || 0)}%`, 'vd-number')
          + cell(`${Number(row.porcentaje_m || 0)}%`, 'vd-number')
          + cell(`${Number(row.porcentaje_a || 0)}%`, 'vd-number')
          + cell(`${Number(row.porcentaje_general || 0)}%`, 'vd-number');
      case 'tareas_asignadas':
      case 'tareas_creadas':
        return cell(row.pendiente) + cell(row.prioridad) + cell(row.estatus) + cell(row.proyecto) + cell(row.area) + cell(row.due_date) + cell(row.responsables);
      default:
        return '';
    }
  }

  function sortDateValue(value) {
    const text = String(value || '').trim();
    if (!text) return 0;
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (match) {
      return Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4] || 0),
        Number(match[5] || 0),
        Number(match[6] || 0)
      );
    }
    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function numericSequence(value) {
    const matches = String(value || '').match(/\d+/g);
    if (!matches || !matches.length) return 0;
    const number = Number(matches.join(''));
    return Number.isFinite(number) ? number : 0;
  }

  function newestStamp(key, row) {
    const fields = {
      prospeccion: ['fecha_visita', 'updated_at', 'created_at'],
      redes: ['created_at', 'updated_at', 'fecha_cambio_estatus'],
      cotizaciones: ['fecha_efectiva', 'fecha_solicitud', 'fecha_cotizacion', 'updated_at', 'created_at'],
      clientes: ['updated_at', 'created_at'],
      ventas: ['fecha_cierre', 'updated_at', 'created_at'],
      perdido: ['fecha_cambio_estatus', 'updated_at', 'created_at'],
      logistica: ['updated_at', 'fecha_sync', 'created_at', 'fecha_entrega_real_obra', 'fecha_llegada_real'],
      instalaciones: ['updated_at', 'created_at', 'fecha_visita'],
      tareas_asignadas: ['updated_at', 'date_created', 'created_at'],
      tareas_creadas: ['updated_at', 'date_created', 'created_at']
    }[key] || ['updated_at', 'created_at'];
    for (const field of fields) {
      const stamp = sortDateValue(row?.[field]);
      if (stamp) return stamp;
    }
    return 0;
  }

  function newestFallback(key, row) {
    const ids = {
      prospeccion: 'id_pros',
      redes: 'id_redes',
      cotizaciones: 'id_cotizacion',
      clientes: 'id_cliente',
      ventas: 'id_cotizacion',
      perdido: 'id_cotizacion',
      logistica: 'id_log_ops',
      instalaciones: 'id_proyecto',
      tareas_asignadas: 'id_pendiente',
      tareas_creadas: 'id_pendiente'
    };
    return numericSequence(row?.[ids[key]]);
  }

  function sortRowsForDisplay(key, rows) {
    return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
      const stampDiff = newestStamp(key, right) - newestStamp(key, left);
      if (stampDiff) return stampDiff;
      const idDiff = newestFallback(key, right) - newestFallback(key, left);
      if (idDiff) return idDiff;
      const leftName = String(left?.nombre_proyecto || left?.proyecto || left?.nombre_empresa || left?.pendiente || '');
      const rightName = String(right?.nombre_proyecto || right?.proyecto || right?.nombre_empresa || right?.pendiente || '');
      return rightName.localeCompare(leftName, 'es', { sensitivity: 'base' });
    });
  }

  function logisticsCanonicalStatus(value) {
    const raw = String(value || '').trim();
    if (LOGISTICS_PIPELINE_ORDER.includes(raw)) return raw;
    const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const aliases = {
      'SIN PRODUCCION / DOCUMENTACION PENDIENTE': 'SIN PRODUCCIÓN / Documentación Pendiente',
      'SIN PRODUCCION / PRIMERA VISITA A OBRA': 'SIN PRODUCCIÓN / Primera Visita a Obra',
      'SIN PRODUCCION / PENDIENTE LIBERACION POR PARTE DEL CLIENTE': 'SIN PRODUCCIÓN / Pendiente Liberación por Parte del Cliente',
      'SIN PRODUCCION / PROGRAMADOS A PRODUCCION': 'SIN PRODUCCIÓN / Programados a Producción',
      'EN PRODUCCION': 'EN PRODUCCION',
      'PARADOS POR CLIENTE': 'PARADOS POR CLIENTE',
      'PENDIENTE PAGO LIBERACION': 'PENDIENTE PAGO LIBERACIÓN',
      'PROGRAMADO': 'PROGRAMADO',
      'EN TRANSITO': 'EN TRANSITO',
      'PROGRAMA ENTREGA': 'PROGRAMA ENTREGA',
      'ENTREGADO': 'ENTREGADO',
      'ENTREGADA': 'ENTREGADO',
      'ALMACENADOS': 'ALMACENADOS'
    };
    return aliases[normalized] || raw;
  }

  function logisticsCell(row, label) {
    const key = LOGISTICS_FIELD_KEYS[label];
    return cell(key ? row?.[key] : null, label === 'Qty' ? 'vd-number' : '');
  }

  function renderLogisticsTables(rows) {
    return LOGISTICS_PIPELINE_ORDER.map((statusName) => {
      const statusRows = sortRowsForDisplay('logistica', rows.filter((row) => logisticsCanonicalStatus(row?.estatus) === statusName));
      const columns = LOGISTICS_COLUMNS_BY_STATUS[statusName] || [];
      const pageKey = `logistica::${statusName}`;
      const totalPages = Math.max(1, Math.ceil(statusRows.length / TABLE_PAGE_SIZE));
      const page = Math.min(Math.max(1, Number(tablePages[pageKey] || 1)), totalPages);
      tablePages[pageKey] = page;
      const start = (page - 1) * TABLE_PAGE_SIZE;
      const pageRows = statusRows.slice(start, start + TABLE_PAGE_SIZE);
      const label = statusName === 'ENTREGADO' ? `${statusName} (año en curso)` : statusName;
      const table = statusRows.length
        ? `<div class="vd-table-wrap"><table class="vd-table" style="--vd-col-count:${columns.length}"><thead><tr>${columns.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${pageRows.map((row) => `<tr>${columns.map((header) => logisticsCell(row, header)).join('')}</tr>`).join('')}</tbody></table></div><div class="vd-table-pagination" data-table-key="${esc(pageKey)}"><button type="button" data-page-action="prev" ${page <= 1 ? 'disabled' : ''}>← Anterior</button><span>Página ${page} de ${totalPages} · ${statusRows.length.toLocaleString('es-MX')} registros</span><button type="button" data-page-action="next" ${page >= totalPages ? 'disabled' : ''}>Siguiente →</button></div>`
        : '<div class="vd-table-empty">Sin registros en esta sección.</div>';
      return `<section class="vd-table-section vd-logistics-subsection"><div class="vd-table-head"><h2>${esc(label)}</h2><span class="vd-table-count">${statusRows.length.toLocaleString('es-MX')} registros · 30 por página</span></div>${table}</section>`;
    }).join('');
  }

  function visibleHeaders(def) {
    if (isAllUsersMode() || !Number.isInteger(def.ownerHeaderIndex)) return def.headers;
    return def.headers.filter((_header, index) => index !== def.ownerHeaderIndex);
  }

  function rowHtml(key, row) {
    const route = rowRoute(key, row);
    const noStatus = ['prospeccion', 'redes'].includes(key) && !String(row?.estatus || '').trim();
    const missingClient = key === 'cotizaciones' && (row?.id_cliente == null || Number(row.id_cliente) <= 0);
    const clientWithoutProject = key === 'clientes' && Number(row?.cotizaciones || 0) === 0;
    const classes = [
      route ? 'vd-clickable-row' : '',
      noStatus ? 'vd-row-no-status' : '',
      missingClient ? 'vd-row-missing-client' : '',
      clientWithoutProject ? 'vd-row-client-no-project' : ''
    ].filter(Boolean).join(' ');
    const classAttr = classes ? ` class="${classes}"` : '';
    const routeAttrs = route ? ` data-open-route="${esc(route[0])}" data-open-id="${esc(route[1])}" tabindex="0" role="link"` : '';
    const attentionAttrs = noStatus
      ? ' style="background:#fff7ed;color:#9a3412;font-weight:800" title="Registro sin estatus"'
      : missingClient
        ? ' style="background:#fffbeb" title="Cotización sin cliente relacionado"'
        : clientWithoutProject
          ? ' style="background:#fff7ed" title="Cliente sin proyecto/cotización relacionada"'
          : '';
    return `<tr${classAttr}${routeAttrs}${attentionAttrs}>${rowCells(key, row)}</tr>`;
  }

  function renderTables(data) {
    tableData = data || {};
    const stage = document.getElementById('vd-stage');
    const modules = selected();
    if (!stage) return;
    stage.innerHTML = Object.entries(defs).filter(([key, def]) => {
      if (availableTableKeys instanceof Set && !availableTableKeys.has(key)) return false;
      return modules.includes(def.filter || key);
    }).map(([key, def]) => {
      const rows = sortRowsForDisplay(key, tableData[key]);
      if (key === 'logistica') {
        return `<section class="vd-table-section vd-logistics-section" data-dashboard-section="${esc(def.filter || key)}"><div class="vd-table-head"><div class="vd-table-head-main"><h2>${esc(def.title)}</h2><span class="vd-table-count">${rows.length.toLocaleString('es-MX')} registros · ${LOGISTICS_PIPELINE_ORDER.length} secciones</span></div></div><div class="vd-logistics-body">${renderLogisticsTables(rows)}</div></section>`;
      }
      const headers = visibleHeaders(def);
      const totalPages = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE));
      const page = Math.min(Math.max(1, Number(tablePages[key] || 1)), totalPages);
      tablePages[key] = page;
      const start = (page - 1) * TABLE_PAGE_SIZE;
      const pageRows = rows.slice(start, start + TABLE_PAGE_SIZE);
      const table = rows.length
        ? `<div class="vd-table-wrap"><table class="vd-table" style="--vd-col-count:${headers.length}"><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${pageRows.map((row) => rowHtml(key, row)).join('')}</tbody></table></div><div class="vd-table-pagination" data-table-key="${esc(key)}"><button type="button" data-page-action="prev" ${page <= 1 ? 'disabled' : ''}>← Anterior</button><span>Página ${page} de ${totalPages} · ${rows.length.toLocaleString('es-MX')} registros</span><button type="button" data-page-action="next" ${page >= totalPages ? 'disabled' : ''}>Siguiente →</button></div>`
        : '<div class="vd-table-empty">Sin registros para la consulta actual.</div>';
      const yearFilter = sectionYearFilterHtml(key);
      return `<section class="vd-table-section" data-dashboard-section="${esc(def.filter || key)}"><div class="vd-table-head"><div class="vd-table-head-main"><h2>${esc(def.title)}</h2><span class="vd-table-count">${rows.length.toLocaleString('es-MX')} registros · 30 por página</span></div>${yearFilter}</div>${table}</section>`;
    }).join('') || '<div class="vd-empty"><h2>Sin secciones seleccionadas</h2></div>';
  }

  function visibility() {
    const modules = selected();
    document.querySelectorAll('#vd-kpis [data-dashboard-section]').forEach((node) => { node.hidden = !modules.includes(node.dataset.dashboardSection); });
  }

  function summary() {
    visibility();
    updatePdfActions();
    save();
  }

  function replaceDomainTables(keys, incoming) {
    keys.forEach((key) => { delete tableData[key]; });
    Object.entries(incoming || {}).forEach(([key, rows]) => {
      tableData[key] = sortRowsForDisplay(key, rows);
    });
  }

  function normalizedLoadOptions(options) {
    const source = options || {};
    return {
      kpis: source.kpis !== false,
      commercial: source.commercial !== false,
      operational: source.operational !== false
    };
  }

  function dashboardSuffix(userValue, year) {
    const query = new URLSearchParams();
    query.set('usuario_id', userValue);
    query.set('anio', String(normalizedYear(year)));
    return `?${query.toString()}`;
  }

  function scopeNameForJob(jobKey) {
    if (String(jobKey).startsWith('kpis')) return 'kpis';
    if (String(jobKey).startsWith('commercial')) return 'commercial';
    return 'operational';
  }

  async function loadData(silent, options) {
    const parts = normalizedLoadOptions(options);
    const allMode = isAllUsersMode();
    const id = selectedUserId();
    const rid = ++requestId;
    if (!allMode && id === null) {
      cachedKpis = null;
      kpis(null);
      tableData = {};
      availableTableKeys = new Set();
      renderTables(tableData);
      dataLoaded = true;
      return false;
    }

    const userValue = allMode ? ALL_USERS_VALUE : String(id);
    const ventasYear = selectedSectionYear('ventas');
    const perdidoYear = selectedSectionYear('perdido');
    const ventasSuffix = dashboardSuffix(userValue, ventasYear);
    const perdidoSuffix = dashboardSuffix(userValue, perdidoYear);
    const queryKey = `${userValue}|ventas:${ventasYear}|perdido:${perdidoYear}`;
    const contextChanged = Boolean(cachedQueryKey && cachedQueryKey !== queryKey);
    if (contextChanged) {
      // Cambio de responsable o de los años locales de Ventas/Perdidos.
      // No conservar filas de otro contexto si una solicitud del nuevo contexto falla.
      tableData = {};
      availableTableKeys = null;
      cachedKpis = null;
      cachedYears = [];
      dataLoaded = false;
      dirtyScopes.clear();
      kpis(null);
      renderLoadingState();
    }
    cachedQueryKey = queryKey;

    const jobs = [];
    if (parts.kpis) {
      jobs.push({ key: 'kpis_ventas', promise: req(`/api/ventas/dashboard/kpis${ventasSuffix}`) });
      if (perdidoYear !== ventasYear) jobs.push({ key: 'kpis_perdido', promise: req(`/api/ventas/dashboard/kpis${perdidoSuffix}`) });
    }
    if (parts.commercial) {
      jobs.push({ key: 'commercial_ventas', promise: req(`/api/ventas/dashboard/tablas${ventasSuffix}`) });
      if (perdidoYear !== ventasYear) jobs.push({ key: 'commercial_perdido', promise: req(`/api/ventas/dashboard/tablas${perdidoSuffix}`) });
    }
    if (parts.operational) jobs.push({ key: 'operational', promise: req(`/api/ventas/dashboard/operacion${ventasSuffix}`) });
    if (!jobs.length) return false;

    if (!silent) msg(allMode ? 'Consultando información de tu alcance comercial...' : 'Consultando información comercial...');
    const settled = await Promise.allSettled(jobs.map((job) => job.promise));
    if (rid !== requestId) return false;

    const results = jobs.map((job, index) => ({ key: job.key, result: settled[index] }));
    const fulfilled = results.filter((entry) => entry.result.status === 'fulfilled');
    if (!fulfilled.length) {
      const rejected = results.find((entry) => entry.result.status === 'rejected');
      throw (rejected?.result?.reason || new Error('No fue posible cargar Dashboard Ventas.'));
    }

    const failedScopes = new Set(results
      .filter((entry) => entry.result.status === 'rejected')
      .map((entry) => scopeNameForJob(entry.key)));
    failedScopes.forEach((scope) => dirtyScopes.add(scope));

    for (const entry of fulfilled) {
      const response = entry.result.value;
      if (entry.key === 'kpis_ventas') {
        const activeSnapshot = cachedKpis?.cotizados || activeQuoteKpis();
        cachedKpis = { ...(response?.kpis || {}), cotizados: activeSnapshot };
        mergeCachedYears(response?.anios_disponibles || []);
      } else if (entry.key === 'kpis_perdido') {
        cachedKpis = {
          ...(cachedKpis || {}),
          perdidos: response?.kpis?.perdidos || { cotizaciones: 0, equipos: 0 }
        };
        mergeCachedYears(response?.anios_disponibles || []);
      } else if (entry.key === 'commercial_ventas') {
        replaceDomainTables(COMMERCIAL_KEYS, response?.tablas || {});
      } else if (entry.key === 'commercial_perdido') {
        tableData.perdido = sortRowsForDisplay('perdido', response?.tablas?.perdido || []);
      } else if (entry.key === 'operational') {
        replaceDomainTables(OPERATIONAL_KEYS, response?.tablas || {});
      }
    }

    ['kpis', 'commercial', 'operational'].forEach((scope) => {
      if (!failedScopes.has(scope) && results.some((entry) => scopeNameForJob(entry.key) === scope)) dirtyScopes.delete(scope);
    });

    const commercialBaseLoaded = fulfilled.some((entry) => entry.key === 'commercial_ventas');
    const commercialLostFailed = perdidoYear !== ventasYear && results.some((entry) => entry.key === 'commercial_perdido' && entry.result.status === 'rejected');
    const kpiLostFailed = perdidoYear !== ventasYear && results.some((entry) => entry.key === 'kpis_perdido' && entry.result.status === 'rejected');
    if (commercialLostFailed) tableData.perdido = [];
    if (kpiLostFailed && cachedKpis) cachedKpis = { ...cachedKpis, perdidos: null };
    if (commercialBaseLoaded) syncActiveQuoteKpis();
    else if (parts.commercial && cachedKpis) cachedKpis = { ...cachedKpis, cotizados: null };
    availableTableKeys = new Set(Object.keys(tableData));
    applyTableAvailability();
    kpis(cachedKpis);
    renderTables(tableData);
    summary();
    dataLoaded = true;

    if (!silent) {
      const failed = results.length - fulfilled.length;
      msg(failed > 0 ? (contextChanged ? 'Se cargó la información disponible para el nuevo filtro; una sección quedó pendiente de actualización.' : 'Se actualizó la información disponible; una sección no pudo renovarse y conserva su última carga válida.') : '');
    }
    return true;
  }

  async function loadSectionYear(key, requestedYear) {
    if (!['ventas', 'perdido'].includes(key)) return false;
    const previousYear = normalizedYear(sectionYears[key]);
    const nextYear = setSectionYear(key, requestedYear);
    if (nextYear === previousYear && dataLoaded) {
      renderTables(tableData);
      kpis(cachedKpis);
      return true;
    }

    const allMode = isAllUsersMode();
    const id = selectedUserId();
    if (!allMode && id === null) return false;
    const userValue = allMode ? ALL_USERS_VALUE : String(id);
    const suffix = dashboardSuffix(userValue, nextYear);
    const rid = ++requestId;
    msg(key === 'ventas' ? `Consultando ventas ${nextYear}...` : `Consultando perdidos ${nextYear}...`);

    try {
      const [tablesResponse, kpiResponse] = await Promise.all([
        req(`/api/ventas/dashboard/tablas${suffix}`),
        req(`/api/ventas/dashboard/kpis${suffix}`)
      ]);
      if (rid !== requestId) return false;

      tableData[key] = sortRowsForDisplay(key, tablesResponse?.tablas?.[key] || []);
      mergeCachedYears(kpiResponse?.anios_disponibles || []);
      cachedKpis = {
        ...(cachedKpis || {}),
        [key === 'ventas' ? 'vendidos' : 'perdidos']:
          kpiResponse?.kpis?.[key === 'ventas' ? 'vendidos' : 'perdidos'] || { cotizaciones: 0, equipos: 0 }
      };
      syncActiveQuoteKpis();
      tablePages[key] = 1;
      cachedQueryKey = `${userValue}|ventas:${selectedSectionYear('ventas')}|perdido:${selectedSectionYear('perdido')}`;
      availableTableKeys = new Set(Object.keys(tableData));
      applyTableAvailability();
      kpis(cachedKpis);
      renderTables(tableData);
      summary();
      msg('');
      return true;
    } catch (error) {
      setSectionYear(key, previousYear);
      renderTables(tableData);
      kpis(cachedKpis);
      throw error;
    }
  }

  function noteMutation(path) {
    const url = String(path || '').toLowerCase();
    if (url.includes('/api/ventas/')) {
      dirtyScopes.add('kpis');
      dirtyScopes.add('commercial');
    }
    if (url.includes('/api/ins-fl') || url.includes('/api/logistica') || url.includes('/api/pendientes') || url.includes('/api/tareas')) {
      dirtyScopes.add('operational');
    }
  }

  function dirtyLoadOptions() {
    return {
      kpis: dirtyScopes.has('kpis'),
      commercial: dirtyScopes.has('commercial'),
      operational: dirtyScopes.has('operational')
    };
  }

  async function refreshDirty() {
    if (dirtyRefreshPromise) return dirtyRefreshPromise;
    const parts = dirtyLoadOptions();
    if (!parts.kpis && !parts.commercial && !parts.operational) return false;
    dirtyRefreshPromise = loadData(true, parts).finally(() => { dirtyRefreshPromise = null; });
    return dirtyRefreshPromise;
  }

  async function manualRefresh() {
    if (refreshBusy) return false;
    setRefreshProgress(true);
    try {
      await loadData(false, { kpis: true, commercial: true, operational: true });
      dirtyScopes.clear();
      msg('Dashboard actualizado.', 'ok');
      return true;
    } catch (error) {
      msg(error.message || 'No fue posible actualizar Dashboard Ventas.', 'error');
      return false;
    } finally {
      setRefreshProgress(false);
    }
  }

  function openRow(row) {
    const route = row?.dataset.openRoute;
    const id = Number(row?.dataset.openId);
    if (!route || !Number.isInteger(id) || id <= 0) return;
    window.ManttoRouter?.go?.(route, { id });
  }

  function bind() {
    if (!initialized) {
      initialized = true;
      document.getElementById('vd-stage')?.addEventListener('click', (event) => {
        const pageButton = event.target.closest('[data-page-action]');
        if (pageButton) {
          const box = pageButton.closest('[data-table-key]');
          const key = box?.dataset.tableKey;
          if (!key) return;
          tablePages[key] = Math.max(1, Number(tablePages[key] || 1) + (pageButton.dataset.pageAction === 'next' ? 1 : -1));
          renderTables(tableData);
          return;
        }
        openRow(event.target.closest('[data-open-route]'));
      });
      document.getElementById('vd-stage')?.addEventListener('change', (event) => {
        const yearSelect = event.target.closest('[data-section-year]');
        if (!yearSelect) return;
        const key = String(yearSelect.dataset.sectionYear || '');
        loadSectionYear(key, yearSelect.value).catch((error) => msg(error.message || 'No fue posible cambiar el año de la sección.', 'error'));
      });
      document.getElementById('vd-stage')?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const row = event.target.closest('[data-open-route]');
        if (!row) return;
        event.preventDefault();
        openRow(row);
      });
      document.getElementById('vd-user-select')?.addEventListener('change', () => {
        resetTablePages();
        summary();
        loadData(false, { kpis: true, commercial: true, operational: true }).catch((error) => msg(error.message, 'error'));
      });
      document.getElementById('vd-pdf-general')?.addEventListener('click', () => preparePdf('general'));
      document.getElementById('vd-pdf-individual')?.addEventListener('click', () => preparePdf('individual'));
      document.getElementById('vd-refresh')?.addEventListener('click', () => manualRefresh());
      document.getElementById('vd-check-grid')?.addEventListener('change', (event) => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement)) return;
        if (input.value === ALL_USERS_VALUE) {
          visibleSectionInputs().forEach((item) => { item.checked = input.checked; });
        } else {
          syncAllSections();
        }
        resetTablePages();
        summary();
        renderTables(tableData);
      });
    }

    if (!mutationListenerBound) {
      mutationListenerBound = true;
      document.addEventListener('mantto:data-mutated', (event) => {
        const url = String(event.detail?.path || event.detail?.url || '');
        noteMutation(url);
      });
    }
  }

  async function loadUsers() {
    const select = document.getElementById('vd-user-select');
    if (!select) return;
    select.disabled = true;
    try {
      if (usersLoaded) {
        renderUsers(selectedUserValue());
        await loadPdfCapabilities();
        if (!dataLoaded) {
          await loadData(true, { kpis: true, commercial: true, operational: true });
          dirtyScopes.clear();
        }
        return;
      }
      const response = await req('/api/ventas/dashboard/usuarios');
      users = Array.isArray(response.usuarios) ? response.usuarios : [];
      usersLoaded = true;
      renderUsers(ALL_USERS_VALUE);
      applyModules();
      await loadPdfCapabilities();
      summary();
      resetTablePages();
      await loadData(true, { kpis: true, commercial: true, operational: true });
      dirtyScopes.clear();
      if (!users.length) msg('Tu alcance actual no contiene responsables comerciales activos.', 'error');
    } finally {
      select.disabled = false;
    }
  }

  function restoreCachedView(snapshot) {
    const remembered = snapshot || {};
    if (usersLoaded) renderUsers(remembered.user || ALL_USERS_VALUE);
    if (remembered.years && typeof remembered.years === 'object') {
      setSectionYear('ventas', remembered.years.ventas);
      setSectionYear('perdido', remembered.years.perdido);
    }
    mergeCachedYears([]);

    applyTableAvailability();
    const wantedSections = Array.isArray(remembered.sections) ? remembered.sections : availableFilters();
    applySectionSelection(wantedSections);
    kpis(cachedKpis);
    renderTables(tableData);
    summary();
    setRefreshProgress(false);
  }

  async function backgroundSync(_context) {
    // DataSync llama backgroundSync al volver con navegación "back" incluso si no
    // hubo cambios. Aquí se rechaza esa recarga automática si el Dashboard no está
    // marcado localmente como sucio. Si sí hubo mutación, solo se renueva el bloque afectado.
    if (!dirtyScopes.size) return false;
    return refreshDirty();
  }

  async function init() {
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      const snapshot = {
        user: selectedUserValue(),
        years: { ventas: selectedSectionYear('ventas'), perdido: selectedSectionYear('perdido') },
        section: selectedSectionValue(),
        sections: selected()
      };
      try {
        await template();
        bind();

        if (dataLoaded && usersLoaded) {
          restoreCachedView(snapshot);
          if (dirtyScopes.size) refreshDirty().catch(() => {});
          return;
        }

        resetDashboardDefaults({ clearData: true });
        await loadUsers();
      }
      catch (error) { msg(error.message || 'No fue posible iniciar Dashboard Ventas.', 'error'); }
      finally { loadingPromise = null; }
    })();
    return loadingPromise;
  }

  window.ManttoVentasDashboard = {
    init,
    refresh: () => loadData(true, { kpis: true, commercial: true, operational: true }),
    backgroundSync,
    refreshKpis: () => loadData(true, { kpis: true, commercial: false, operational: false }),
    getFilters: () => ({ ...currentState(), usuario_id: isAllUsersMode() ? ALL_USERS_VALUE : selectedUserId(), anio_vendidos: selectedSectionYear('ventas'), anio_perdidos: selectedSectionYear('perdido') })
  };
})();
