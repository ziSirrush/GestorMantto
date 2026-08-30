(function () {
  'use strict';

  const TEMPLATE_URL = './modules/ventas-dashboard/ventas-dashboard.html?v=20260830-fase5-logistica-activos-v001';
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
  const tablePages = {};

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

  function renderYearOptions(values = []) {
    const select = document.getElementById('vd-year-select');
    if (!select) return;
    const currentYear = new Date().getFullYear();
    const selected = selectedYear();
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

  function updatePdfActions() {
    const hasSelectedAdvisor = !isAllUsersMode() && selectedUserId() !== null;
    const generalWrap = document.getElementById('vd-pdf-general-wrap');
    const individualWrap = document.getElementById('vd-pdf-individual-wrap');
    if (generalWrap) generalWrap.hidden = hasSelectedAdvisor || pdfCapabilities.general !== true;
    if (individualWrap) individualWrap.hidden = !hasSelectedAdvisor || pdfCapabilities.individual !== true;
  }

  async function loadPdfCapabilities() {
    try {
      const response = await req('/api/ventas/dashboard/pdf/capabilities');
      pdfCapabilities = {
        general: response?.pdf?.general === true,
        individual: response?.pdf?.individual === true
      };
    } catch (_error) {
      pdfCapabilities = { general: false, individual: false };
    }
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

  function currentState() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (_error) { return {}; }
  }

  function selected() {
    return [...document.querySelectorAll('#vd-check-grid input:not([value="todos"]):checked:not(:disabled)')].map((input) => input.value);
  }

  function save() {
    // El responsable no se persiste: cada apertura del módulo inicia en Todos.
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ modulos: selected() }));
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
    if (!view.querySelector('.vd-page')) {
      const response = await fetch(TEMPLATE_URL, { cache: 'default' });
      if (!response.ok) throw new Error('No fue posible cargar la vista Dashboard Ventas.');
      view.innerHTML = await response.text();
    }
    return view;
  }

  function renderUsers() {
    const select = document.getElementById('vd-user-select');
    if (!select) return;
    select.innerHTML = `<option value="${ALL_USERS_VALUE}">Todos</option>` + users.map((user) =>
      `<option value="${esc(user.id_usuario)}" data-meta="${esc([user.tipo_perfil, user.puesto].filter(Boolean).join(' · '))}">${esc(user.nombre)}</option>`
    ).join('');
    select.value = ALL_USERS_VALUE;
  }

  function syncAll() {
    const all = document.querySelector('#vd-check-grid input[value="todos"]');
    const items = [...document.querySelectorAll('#vd-check-grid input:not([value="todos"]):not(:disabled)')];
    if (all) {
      all.disabled = items.length === 0;
      all.checked = items.length > 0 && items.every((item) => item.checked);
    }
  }

  function applyTableAvailability() {
    if (!(availableTableKeys instanceof Set)) return;
    document.querySelectorAll('#vd-check-grid input:not([value="todos"])').forEach((input) => {
      const entry = Object.entries(defs).find(([, def]) => (def.filter || '') === input.value);
      const allowed = Boolean(entry && availableTableKeys.has(entry[0]));
      input.disabled = !allowed;
      const label = input.closest('label');
      if (label) label.hidden = !allowed;
      if (!allowed) input.checked = false;
    });
    syncAll();
  }

  function applyModules() {
    const modules = currentState().modulos;
    if (!Array.isArray(modules) || !modules.length) {
      document.querySelectorAll('#vd-check-grid input').forEach((input) => { input.checked = true; });
      return;
    }
    document.querySelectorAll('#vd-check-grid input:not([value="todos"])').forEach((input) => { input.checked = modules.includes(input.value); });
    syncAll();
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
      return `<section class="vd-table-section" style="margin:14px"><div class="vd-table-head"><h2>${esc(label)}</h2><span class="vd-table-count">${statusRows.length.toLocaleString('es-MX')} registros · 30 por página</span></div>${table}</section>`;
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
        return `<section class="vd-table-section" data-dashboard-section="${esc(def.filter || key)}"><div class="vd-table-head"><h2>${esc(def.title)}</h2><span class="vd-table-count">${rows.length.toLocaleString('es-MX')} registros · ${LOGISTICS_PIPELINE_ORDER.length} secciones</span></div>${renderLogisticsTables(rows)}</section>`;
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
    const select = document.getElementById('vd-user-select');
    const option = select?.selectedOptions?.[0];
    const modules = selected();
    const allMode = isAllUsersMode();
    const selectedUserNode = document.getElementById('vd-selected-user');
    const selectedMetaNode = document.getElementById('vd-selected-meta');
    const selectedModulesNode = document.getElementById('vd-selected-modules');

    if (selectedUserNode) selectedUserNode.textContent = allMode ? 'Todos' : (option?.textContent || 'Responsable comercial');
    if (selectedMetaNode) {
      selectedMetaNode.textContent = allMode
        ? 'Asesores, gerentes y Director de Ventas dentro de tu Alcance de Información.'
        : (option?.dataset.meta || 'Perfil comercial activo');
    }
    if (selectedModulesNode) {
      const availableCount = availableTableKeys instanceof Set ? availableTableKeys.size : Object.keys(defs).length;
      selectedModulesNode.textContent = modules.length === availableCount && availableCount > 0
        ? 'Todas las secciones seleccionadas'
        : modules.length ? modules.join(' · ') : 'Sin secciones seleccionadas';
    }
    visibility();
    updatePdfActions();
    save();
  }

  async function loadData(silent) {
    const allMode = isAllUsersMode();
    const id = selectedUserId();
    const rid = ++requestId;
    if (!allMode && id === null) { kpis(null); renderTables({}); return; }

    const query = new URLSearchParams();
    query.set('usuario_id', allMode ? ALL_USERS_VALUE : String(id));
    query.set('anio', String(selectedYear()));
    const suffix = `?${query.toString()}`;

    if (!silent) msg(allMode ? 'Consultando información de tu alcance comercial...' : 'Consultando información comercial...');
    const results = await Promise.allSettled([
      req(`/api/ventas/dashboard/kpis${suffix}`),
      req(`/api/ventas/dashboard/tablas${suffix}`),
      req(`/api/ventas/dashboard/operacion${suffix}`)
    ]);
    if (rid !== requestId) return;

    const [kpiResult, commercialResult, operationalResult] = results;
    const fulfilled = results.filter((result) => result.status === 'fulfilled').length;
    if (fulfilled === 0) throw (results.find((result) => result.status === 'rejected')?.reason || new Error('No fue posible cargar Dashboard Ventas.'));

    const kpiResponse = kpiResult.status === 'fulfilled' ? kpiResult.value : null;
    const commercialResponse = commercialResult.status === 'fulfilled' ? commercialResult.value : null;
    const operationalResponse = operationalResult.status === 'fulfilled' ? operationalResult.value : null;
    const commercialTables = commercialResponse?.tablas || {};
    const operationalTables = operationalResponse?.tablas || {};

    availableTableKeys = new Set([...Object.keys(commercialTables), ...Object.keys(operationalTables)]);
    applyTableAvailability();
    if (Array.isArray(kpiResponse?.anios_disponibles)) renderYearOptions(kpiResponse.anios_disponibles);
    kpis(kpiResponse?.kpis || null, Number(kpiResponse?.anio) || selectedYear());
    renderTables(Object.assign({}, commercialTables, operationalTables));
    summary();

    if (!silent) {
      const failed = results.length - fulfilled;
      msg(failed > 0 ? 'Se cargó la información permitida disponible para tu perfil.' : '');
    }
  }

  function openRow(row) {
    const route = row?.dataset.openRoute;
    const id = Number(row?.dataset.openId);
    if (!route || !Number.isInteger(id) || id <= 0) return;
    window.ManttoRouter?.go?.(route, { id });
  }

  function bind() {
    if (initialized) return;
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
      loadData(false).catch((error) => msg(error.message, 'error'));
    });
    document.getElementById('vd-year-select')?.addEventListener('change', () => {
      resetTablePages();
      kpis(null, selectedYear());
      loadData(false).catch((error) => msg(error.message, 'error'));
    });
    document.getElementById('vd-pdf-general')?.addEventListener('click', () => preparePdf('general'));
    document.getElementById('vd-pdf-individual')?.addEventListener('click', () => preparePdf('individual'));
    document.getElementById('vd-check-grid')?.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.value === 'todos') document.querySelectorAll('#vd-check-grid input:not([value="todos"]):not(:disabled)').forEach((item) => { item.checked = input.checked; });
      else syncAll();
      summary();
      renderTables(tableData);
    });
    document.addEventListener('mantto:data-mutated', (event) => {
      if (window.ManttoDataSync?.supportsBackgroundSync?.('ventas-dashboard')) return;
      const url = String(event.detail?.path || event.detail?.url || '');
      if (url.includes('/api/ventas/') || url.includes('/api/ins-fl') || url.includes('/api/logistica') || url.includes('/api/pendientes')) loadData(true).catch(() => {});
    });
  }

  async function loadUsers() {
    const select = document.getElementById('vd-user-select');
    if (!select) return;
    select.disabled = true;
    const response = await req('/api/ventas/dashboard/usuarios');
    users = Array.isArray(response.usuarios) ? response.usuarios : [];
    renderUsers();
    renderYearOptions([]);
    applyModules();
    await loadPdfCapabilities();
    summary();
    select.disabled = false;
    resetTablePages();
    await loadData(true);
    if (!users.length) msg('Tu alcance actual no contiene responsables comerciales activos.', 'error');
  }

  async function init() {
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      try { await template(); bind(); await loadUsers(); }
      catch (error) { msg(error.message || 'No fue posible iniciar Dashboard Ventas.', 'error'); }
      finally { loadingPromise = null; }
    })();
    return loadingPromise;
  }

  window.ManttoVentasDashboard = {
    init,
    refresh: () => loadData(true),
    backgroundSync: () => loadData(true),
    refreshKpis: () => loadData(true),
    getFilters: () => ({ ...currentState(), usuario_id: isAllUsersMode() ? ALL_USERS_VALUE : selectedUserId(), anio: selectedYear() })
  };
})();
