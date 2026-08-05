(function () {
  'use strict';

  const TEMPLATE_URL = './modules/ventas-dashboard/ventas-dashboard.html?v=20260804-a4-v001';
  const STORAGE_KEY = 'mantto:ventas-dashboard:a1';
  const TABLE_PAGE_SIZE = 30;
  let initialized = false;
  let loadingPromise = null;
  let users = [];
  let requestId = 0;
  let tableData = {};
  const tablePages = {};

  const defs = {
    cotizaciones: { filter: 'cotizaciones', title: 'Cotizaciones abiertas', headers: ['Proyecto', 'Cliente', 'Asesor', 'Estatus', 'Equipos', 'Fecha', 'Ciudad', 'Estado'] },
    ventas: { filter: 'ventas', title: 'Cotizaciones vendidas', headers: ['Proyecto', 'Cliente', 'Asesor', 'Fecha de cierre', 'Equipos', 'Fecha', 'Ciudad', 'Estado'] },
    perdido: { filter: 'perdido', title: 'Cotizaciones perdidas', headers: ['Proyecto', 'Cliente', 'Asesor', 'Razón de perdido', 'Empresa vs. quien se perdió', 'Equipos', 'Fecha', 'Ciudad', 'Estado'] },
    clientes: { filter: 'clientes', title: 'Clientes', headers: ['Cliente', 'Asesor', 'Ciudad / Estado', 'Tipo', 'Cotizaciones', 'En proceso', 'Vendidas', 'Perdidas'] },
    redes: { filter: 'redes', title: 'Asignación a Redes', headers: ['Contacto', 'Contacto vía', 'Empresa / Proyecto', 'Solicitud', 'Asignado a', 'Estatus', 'Cotización'] },
    prospeccion: { filter: 'prospeccion', title: 'Prospección', headers: ['Empresa', 'Proyecto', 'Estatus', 'Asesor', 'Ciudad', 'Estado', 'Fecha visita'] },
    instalaciones: { filter: 'ventas', title: 'Proyectos activos en Instalaciones', headers: ['Proyecto', 'ID Proyecto', 'Ciudad', 'Estado', '# Equipos', 'Asesor', 'Supervisor', 'Cliente', 'Activo'] },
    logistica: { filter: 'logistica', title: 'Proyectos en Logística no entregados', headers: ['PP NS', 'Proyecto', 'Estatus', 'Marca', 'No. control', 'Cantidad'] },
    tareas_asignadas: { filter: 'tareas', title: 'Pendientes asignados al responsable', headers: ['Pendiente', 'Prioridad', 'Estatus', 'Proyecto', 'Área', 'Fecha límite', 'Responsables'] },
    tareas_creadas: { filter: 'tareas', title: 'Pendientes creados por el responsable', headers: ['Pendiente', 'Prioridad', 'Estatus', 'Proyecto', 'Área', 'Fecha límite', 'Responsables'] }
  };

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
    return [...document.querySelectorAll('#vd-check-grid input:not([value="todos"]):checked')].map((input) => input.value);
  }

  function save() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      usuario_id: document.getElementById('vd-user-select')?.value || '',
      modulos: selected()
    }));
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
      const response = await fetch(TEMPLATE_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('No fue posible cargar la vista Dashboard Ventas.');
      view.innerHTML = await response.text();
    }
    return view;
  }

  function renderUsers() {
    const select = document.getElementById('vd-user-select');
    const saved = currentState();
    select.innerHTML = '<option value="">Seleccionar responsable comercial</option>' + users.map((user) =>
      `<option value="${esc(user.id_usuario)}" data-meta="${esc([user.puesto, user.tipo_perfil].filter(Boolean).join(' · '))}">${esc(user.nombre)}</option>`
    ).join('');
    if (saved.usuario_id && users.some((user) => String(user.id_usuario) === String(saved.usuario_id))) select.value = String(saved.usuario_id);
  }

  function syncAll() {
    const all = document.querySelector('#vd-check-grid input[value="todos"]');
    const items = [...document.querySelectorAll('#vd-check-grid input:not([value="todos"])')];
    if (all) all.checked = items.length > 0 && items.every((item) => item.checked);
  }

  function applyModules() {
    const modules = currentState().modulos;
    if (!Array.isArray(modules) || !modules.length) return;
    document.querySelectorAll('#vd-check-grid input:not([value="todos"])').forEach((input) => { input.checked = modules.includes(input.value); });
    syncAll();
  }

  function kpis(data) {
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
  function projectCell(row, key = 'nombre_proyecto') { return `<td><strong>${indicators(row)}${esc(val(row[key]))}</strong></td>`; }

  function rowRoute(key, row) {
    if (key === 'clientes' && row.id_cliente) return ['ventas-clientes-detalle', row.id_cliente];
    if (['cotizaciones', 'ventas', 'perdido'].includes(key) && row.id_cotizacion) return ['ventas-cotizaciones-detalle', row.id_cotizacion];
    if (key === 'redes' && row.id_redes) return ['ventas-asignacion-redes-detalle', row.id_redes];
    if (key === 'prospeccion' && row.id_pros) return ['ventas-prospeccion-detalle', row.id_pros];
    return null;
  }

  function rowCells(key, row) {
    switch (key) {
      case 'cotizaciones':
        return projectCell(row) + cell(row.cliente) + cell(row.asesor) + cell(row.estatus_proyecto) + cell(Number(row.numero_equipos || 0)) + cell(row.fecha_cotizacion || row.fecha_solicitud) + cell(row.ciudad) + cell(row.estado);
      case 'ventas':
        return projectCell(row) + cell(row.cliente) + cell(row.asesor) + cell(row.fecha_cierre) + cell(Number(row.numero_equipos || 0)) + cell(row.fecha_cotizacion || row.fecha_solicitud) + cell(row.ciudad) + cell(row.estado);
      case 'perdido':
        return projectCell(row) + cell(row.cliente) + cell(row.asesor) + cell(row.razon_perdido) + cell(row.empresa_vs_perdido) + cell(Number(row.numero_equipos || 0)) + cell(row.fecha_cotizacion || row.fecha_solicitud) + cell(row.ciudad) + cell(row.estado);
      case 'clientes':
        return `<td><strong>${indicators(row)}${esc(val(row.nombre_empresa))}</strong><small class="vd-cell-sub">${esc(row.razon_social || '')}</small></td>` + cell(row.iniciales) + cell([row.ciudad, row.estado].filter(Boolean).join(' · ')) + cell(row.tipo_cliente) + cell(Number(row.cotizaciones || 0), 'vd-number') + cell(Number(row.en_proceso || 0), 'vd-number') + cell(Number(row.vendidas || 0), 'vd-number') + cell(Number(row.perdidas || 0), 'vd-number');
      case 'redes':
        return cell(row.nombre_contacto) + cell(row.contacto_via) + cell([row.nombre_empresa, row.nombre_proyecto].filter(Boolean).join(' / ')) + cell(row.solicitud) + cell(row.asignado_a) + cell(row.estatus) + cell(row.cotizacion);
      case 'prospeccion':
        return cell(row.empresa) + cell(row.proyecto) + cell(row.estatus) + cell(row.asesor) + cell(row.ciudad) + cell(row.estado) + cell(row.fecha_visita);
      case 'instalaciones':
        return cell(row.proyecto) + cell(row.id_proyecto) + cell(row.ciudad) + cell(row.estado) + cell(Number(row.total_equipos || 0), 'vd-number') + cell(row.asesor) + cell(row.supervisor) + cell(row.cliente) + cell(Number(row.activo) === 1 ? 'Activo' : 'Inactivo');
      case 'logistica':
        return cell(row.id_ppns) + cell(row.proyecto) + cell(row.estatus) + cell(row.marca) + cell(row.no_control) + cell(row.cantidad, 'vd-number');
      case 'tareas_asignadas':
      case 'tareas_creadas':
        return cell(row.pendiente) + cell(row.prioridad) + cell(row.estatus) + cell(row.proyecto) + cell(row.area) + cell(row.due_date) + cell(row.responsables);
      default:
        return '';
    }
  }

  function rowHtml(key, row) {
    const route = rowRoute(key, row);
    const attrs = route ? ` class="vd-clickable-row" data-open-route="${esc(route[0])}" data-open-id="${esc(route[1])}" tabindex="0" role="link"` : '';
    return `<tr${attrs}>${rowCells(key, row)}</tr>`;
  }

  function renderTables(data) {
    tableData = data || {};
    const stage = document.getElementById('vd-stage');
    const modules = selected();
    if (!stage) return;
    stage.innerHTML = Object.entries(defs).filter(([key, def]) => modules.includes(def.filter || key)).map(([key, def]) => {
      const rows = Array.isArray(tableData[key]) ? tableData[key] : [];
      const totalPages = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE));
      const page = Math.min(Math.max(1, Number(tablePages[key] || 1)), totalPages);
      tablePages[key] = page;
      const start = (page - 1) * TABLE_PAGE_SIZE;
      const pageRows = rows.slice(start, start + TABLE_PAGE_SIZE);
      const table = rows.length
        ? `<div class="vd-table-wrap"><table class="vd-table" style="--vd-col-count:${def.headers.length}"><thead><tr>${def.headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${pageRows.map((row) => rowHtml(key, row)).join('')}</tbody></table></div><div class="vd-table-pagination" data-table-key="${esc(key)}"><button type="button" data-page-action="prev" ${page <= 1 ? 'disabled' : ''}>← Anterior</button><span>Página ${page} de ${totalPages} · ${rows.length.toLocaleString('es-MX')} registros</span><button type="button" data-page-action="next" ${page >= totalPages ? 'disabled' : ''}>Siguiente →</button></div>`
        : '<div class="vd-table-empty">Sin registros para el responsable seleccionado.</div>';
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
    document.getElementById('vd-selected-user').textContent = select?.value ? option.textContent : 'Selecciona un responsable comercial';
    document.getElementById('vd-selected-meta').textContent = select?.value ? option.dataset.meta || 'Perfil comercial activo' : 'Los datos se actualizarán al seleccionar un responsable.';
    document.getElementById('vd-selected-modules').textContent = modules.length === 8 ? 'Todos los módulos seleccionados' : modules.length ? modules.join(' · ') : 'Sin módulos seleccionados';
    visibility();
    save();
  }

  async function loadData(silent) {
    const id = Number(document.getElementById('vd-user-select')?.value);
    const rid = ++requestId;
    if (!Number.isInteger(id) || id <= 0) { kpis(null); renderTables({}); return; }
    if (!silent) msg('Consultando información comercial...');
    const [kpiResponse, commercialResponse, operationalResponse] = await Promise.all([
      req(`/api/ventas/dashboard/kpis?usuario_id=${id}`),
      req(`/api/ventas/dashboard/tablas?usuario_id=${id}`),
      req(`/api/ventas/dashboard/operacion?usuario_id=${id}`)
    ]);
    if (rid !== requestId) return;
    kpis(kpiResponse.kpis || {});
    renderTables(Object.assign({}, commercialResponse.tablas || {}, operationalResponse.tablas || {}));
    if (!silent) msg('');
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
    document.getElementById('vd-user-select')?.addEventListener('change', () => { summary(); loadData(false).catch((error) => msg(error.message, 'error')); });
    document.getElementById('vd-check-grid')?.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.value === 'todos') document.querySelectorAll('#vd-check-grid input:not([value="todos"])').forEach((item) => { item.checked = input.checked; });
      else syncAll();
      summary();
      loadData(true).catch((error) => msg(error.message, 'error'));
    });
    document.addEventListener('mantto:data-mutated', (event) => {
      if (window.ManttoDataSync?.supportsBackgroundSync?.('ventas-dashboard')) return;
      const url = String(event.detail?.path || event.detail?.url || '');
      if (url.includes('/api/ventas/') || url.includes('/api/ins-fl') || url.includes('/api/logistica') || url.includes('/api/pendientes')) loadData(true).catch(() => {});
    });
  }

  async function loadUsers() {
    const select = document.getElementById('vd-user-select');
    select.disabled = true;
    const response = await req('/api/ventas/dashboard/usuarios');
    users = Array.isArray(response.usuarios) ? response.usuarios : [];
    renderUsers();
    applyModules();
    summary();
    select.disabled = !users.length;
    if (users.length) await loadData(true);
    else msg('No se encontraron responsables comerciales activos.', 'error');
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

  window.ManttoVentasDashboard = { init, refresh: () => loadData(true), backgroundSync: () => loadData(true), refreshKpis: () => loadData(true), getFilters: currentState };
})();
