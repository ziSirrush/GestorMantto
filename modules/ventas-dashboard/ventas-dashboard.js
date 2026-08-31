(function () {
  'use strict';

  // [Aster | 2026-08-31 | ASTER-MG | FIX DASHBOARD VENTAS CACHE/REINGRESO/ACTUALIZAR V001]
  // Regla: primera carga completa; conservar datos al navegar; refrescar solo por cambio
  // real, cambio de filtro de datos o solicitud manual del usuario.
  const TEMPLATE_VERSION = '20260831-cache-reingreso-refresh-v001';
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
  let cachedKpiYear = new Date().getFullYear();
  let cachedYears = [];
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

  function selectedYear() {
    const currentYear = new Date().getFullYear();
    const year = Number(document.getElementById('vd-year-select')?.value);
    return Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : currentYear;
  }

  function renderYearOptions(values = [], forceCurrent = false) {
    const select = document.getElementById('vd-year-select');
    if (!select) return;
    const currentYear = new Date().getFullYear();
    const selected = forceCurrent ? currentYear : selectedYear();
    if (Array.isArray(values) && values.length) cachedYears = [...values];
    const years = [...new Set([currentYear, selected, ...(Array.isArray(values) ? values : [])]
      .map(Number)
      .filter((year) => Number.isInteger(year) && year >= 1900 && year <= 2200))]
      .sort((a, b) => b - a);
    select.innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join('');
    select.value = String(years.includes(selected) ? selected : currentYear);
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

  function selectedSectionValue() {
    return String(document.getElementById('vd-section-select')?.value || ALL_USERS_VALUE).trim().toLowerCase();
  }

  function availableFilters() {
    return Object.entries(defs)
      .filter(([key]) => !(availableTableKeys instanceof Set) || availableTableKeys.has(key))
      .map(([key, def]) => def.filter || key);
  }

  function currentState() {
    return { seccion: selectedSectionValue() };
  }

  function selected() {
    const available = availableFilters();
    const section = selectedSectionValue();
    if (section === ALL_USERS_VALUE) return available;
    return available.includes(section) ? [section] : available;
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

    const sectionSelect = document.getElementById('vd-section-select');
    if (sectionSelect) sectionSelect.value = ALL_USERS_VALUE;

    resetTablePages();
    save();

    if (clearData) {
      tableData = {};
      availableTableKeys = null;
      cachedKpis = null;
      cachedKpiYear = new Date().getFullYear();
      cachedYears = [];
      cachedQueryKey = '';
      dataLoaded = false;
      kpis(null, cachedKpiYear);
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
    if (!(availableTableKeys instanceof Set)) return;
    const select = document.getElementById('vd-section-select');
    if (!select) return;

    const current = selectedSectionValue();
    let availableCount = 0;

    [...select.options].forEach((option) => {
      if (option.value === ALL_USERS_VALUE) return;
      const entry = Object.entries(defs).find(([, def]) => (def.filter || '') === option.value);
      const allowed = Boolean(entry && availableTableKeys.has(entry[0]));
      option.disabled = !allowed;
      option.hidden = !allowed;
      if (allowed) availableCount += 1;
    });

    const allOption = [...select.options].find((option) => option.value === ALL_USERS_VALUE);
    if (allOption) allOption.disabled = availableCount === 0;

    const currentOption = [...select.options].find((option) => option.value === current);
    if (!currentOption || currentOption.disabled) select.value = ALL_USERS_VALUE;
  }

  function applyModules() {
    resetDashboardDefaults();
  }

  function kpis(data, year = selectedYear()) {
    const values = {
      'vd-kpi-cotizados-cotizaciones': data?.cotizados?.cotizaciones,
      'vd-kpi-cotizados-equipos': data?.cotizados?.equipos,
      'vd-kpi-vendidos-cotizaciones': data?.vendidos?.cotizaciones,
      'vd-kpi-vendidos-equipos': data?.vendidos?.equipos,
      'vd-kpi-perdidos-cotizaciones': data?.perdidos?.cotizaciones,
      'vd-kpi-perdidos-equipos': data?.perdidos?.equipos
    };
    Object.entries(values).forEach(([id, value]) => {
      const node = document.getElementById(id);
      if (node) node.textContent = value == null ? '—' : Number(value).toLocaleString('es-MX');
    });
    const titles = {
      'vd-kpi-title-cotizados': `Cotizaciones activas · ${year}`,
      'vd-kpi-title-vendidos': `Ventas · ${year}`,
      'vd-kpi-title-perdidos': `Perdidos · ${year}`
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
      const statusRows = rows.filter((row) => logisticsCanonicalStatus(row?.estatus) === statusName);
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
      const rows = Array.isArray(tableData[key]) ? tableData[key] : [];
      if (key === 'logistica') {
        return `<section class="vd-table-section vd-logistics-section" data-dashboard-section="${esc(def.filter || key)}"><div class="vd-table-head"><h2>${esc(def.title)}</h2><span class="vd-table-count">${rows.length.toLocaleString('es-MX')} registros · ${LOGISTICS_PIPELINE_ORDER.length} secciones</span></div><div class="vd-logistics-body">${renderLogisticsTables(rows)}</div></section>`;
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
      return `<section class="vd-table-section" data-dashboard-section="${esc(def.filter || key)}"><div class="vd-table-head"><h2>${esc(def.title)}</h2><span class="vd-table-count">${rows.length.toLocaleString('es-MX')} registros · 30 por página</span></div>${table}</section>`;
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
    Object.assign(tableData, incoming || {});
  }

  function normalizedLoadOptions(options) {
    const source = options || {};
    return {
      kpis: source.kpis !== false,
      commercial: source.commercial !== false,
      operational: source.operational !== false
    };
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

    const query = new URLSearchParams();
    query.set('usuario_id', allMode ? ALL_USERS_VALUE : String(id));
    query.set('anio', String(selectedYear()));
    const suffix = `?${query.toString()}`;
    const queryKey = `${allMode ? ALL_USERS_VALUE : String(id)}|${selectedYear()}`;
    const contextChanged = Boolean(cachedQueryKey && cachedQueryKey !== queryKey);
    if (contextChanged) {
      // Cambio de responsable/año = contexto de autorización/datos diferente.
      // No conservar filas del contexto anterior si alguna solicitud falla.
      tableData = {};
      availableTableKeys = null;
      cachedKpis = null;
      cachedKpiYear = selectedYear();
      dataLoaded = false;
      dirtyScopes.clear();
      kpis(null, cachedKpiYear);
      renderLoadingState();
    }
    cachedQueryKey = queryKey;

    const jobs = [];
    if (parts.kpis) jobs.push({ key: 'kpis', promise: req(`/api/ventas/dashboard/kpis${suffix}`) });
    if (parts.commercial) jobs.push({ key: 'commercial', promise: req(`/api/ventas/dashboard/tablas${suffix}`) });
    if (parts.operational) jobs.push({ key: 'operational', promise: req(`/api/ventas/dashboard/operacion${suffix}`) });
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

    results.filter((entry) => entry.result.status === 'rejected').forEach((entry) => dirtyScopes.add(entry.key));

    for (const entry of fulfilled) {
      const response = entry.result.value;
      if (entry.key === 'kpis') {
        cachedKpis = response?.kpis || null;
        cachedKpiYear = Number(response?.anio) || selectedYear();
        if (Array.isArray(response?.anios_disponibles)) {
          cachedYears = [...response.anios_disponibles];
          renderYearOptions(cachedYears);
        }
        dirtyScopes.delete('kpis');
      } else if (entry.key === 'commercial') {
        replaceDomainTables(COMMERCIAL_KEYS, response?.tablas || {});
        dirtyScopes.delete('commercial');
      } else if (entry.key === 'operational') {
        replaceDomainTables(OPERATIONAL_KEYS, response?.tablas || {});
        dirtyScopes.delete('operational');
      }
    }

    availableTableKeys = new Set(Object.keys(tableData));
    applyTableAvailability();
    kpis(cachedKpis, cachedKpiYear);
    renderTables(tableData);
    summary();
    dataLoaded = true;

    if (!silent) {
      const failed = results.length - fulfilled.length;
      msg(failed > 0 ? (contextChanged ? 'Se cargó la información disponible para el nuevo filtro; una sección quedó pendiente de actualización.' : 'Se actualizó la información disponible; una sección no pudo renovarse y conserva su última carga válida.') : '');
    }
    return true;
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
      document.getElementById('vd-year-select')?.addEventListener('change', () => {
        resetTablePages();
        kpis(null, selectedYear());
        loadData(false, { kpis: true, commercial: true, operational: true }).catch((error) => msg(error.message, 'error'));
      });
      document.getElementById('vd-pdf-general')?.addEventListener('click', () => preparePdf('general'));
      document.getElementById('vd-pdf-individual')?.addEventListener('click', () => preparePdf('individual'));
      document.getElementById('vd-refresh')?.addEventListener('click', () => manualRefresh());
      document.getElementById('vd-section-select')?.addEventListener('change', () => {
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
        renderYearOptions(cachedYears, !cachedYears.length);
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
      renderYearOptions([], true);
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
    renderYearOptions(cachedYears);

    const yearSelect = document.getElementById('vd-year-select');
    const wantedYear = String(remembered.year || cachedKpiYear || new Date().getFullYear());
    if (yearSelect && [...yearSelect.options].some((option) => option.value === wantedYear)) yearSelect.value = wantedYear;

    const sectionSelect = document.getElementById('vd-section-select');
    const wantedSection = String(remembered.section || ALL_USERS_VALUE);
    if (sectionSelect && [...sectionSelect.options].some((option) => option.value === wantedSection)) sectionSelect.value = wantedSection;

    applyTableAvailability();
    kpis(cachedKpis, cachedKpiYear);
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
        year: selectedYear(),
        section: selectedSectionValue()
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
    getFilters: () => ({ ...currentState(), usuario_id: isAllUsersMode() ? ALL_USERS_VALUE : selectedUserId(), anio: selectedYear() })
  };
})();
