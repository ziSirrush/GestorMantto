'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const HOME_PATH = path.join(ROOT, 'modules/home/home.js');
const SERVICE_PATH = path.join(ROOT, 'backend/src/modules/pendientes/pendientes.service.js');
const SCOPE_PATH = path.join(ROOT, 'backend/src/modules/pendientes/pendientes-project-scope.service.js');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('el formulario conserva el orden aprobado y solo tres bloques desplegables', () => {
  const source = read('modules/home/home.js');
  const formStart = source.indexOf('class="task-form task-form-reorganized"');
  const formEnd = source.indexOf('bindFileOpenActions(root, currentFiles)', formStart);
  const form = source.slice(formStart, formEnd);
  const orderedMarkers = [
    'task-primary-row',
    'taskRichTextEditor(row.descripcion',
    'data-optional-section="subtasks"',
    'task-evidence-block',
    'task-people-block',
    'data-optional-section="due-date"',
    'data-optional-section="linkage"',
    'task-form-actions'
  ];
  let previous = -1;
  orderedMarkers.forEach(marker => {
    const index = form.indexOf(marker);
    assert.ok(index > previous, `${marker} debe respetar el orden funcional`);
    previous = index;
  });
  assert.equal((form.match(/data-task-toggle="/g) || []).length, 3);
  assert.doesNotMatch(form.slice(form.indexOf('task-evidence-block'), form.indexOf('task-people-block')), /data-task-toggle/);
  assert.match(form, /Guardar tarea/);
});

test('crear inicia cerrado y editar infiere cada apertura desde datos persistidos', () => {
  const source = read('modules/home/home.js');
  assert.match(source, /const hasSubtasks = mode === 'edit' && Boolean\(Number\(row\.con_subtareas\) === 1 \|\| subtareas\.length\)/);
  assert.match(source, /const hasDueDate = mode === 'edit' && Boolean\(formatDateInput\(row\.due_date\)\)/);
  assert.match(source, /const hasLinkage = mode === 'edit' && Boolean\(row\.area \|\| row\.proyecto \|\| row\.equipo\)/);
  assert.match(source, /panel\.hidden = !expanded/);
  assert.doesNotMatch(source, /checkbox\.checked[\s\S]{0,120}(?:value\s*=\s*''|reset\()/);
});

test('el payload limpia los bloques desmarcados y conserva la empresa técnica', () => {
  const source = read('modules/home/home.js');
  assert.match(source, /payload\.append\('due_date', dueDateEnabled \? String\(raw\.get\('due_date'\) \|\| ''\) : ''\)/);
  assert.match(source, /payload\.append\('area', linkageEnabled \? String\(raw\.get\('area'\) \|\| ''\) : ''\)/);
  assert.match(source, /payload\.append\('proyecto', linkageEnabled \? String\(raw\.get\('proyecto'\) \|\| ''\) : ''\)/);
  assert.match(source, /payload\.append\('equipo', linkageEnabled \? String\(raw\.get\('equipo'\) \|\| ''\) : ''\)/);
  assert.match(source, /payload\.append\('empresa', linkageEnabled \? String\(raw\.get\('empresa'\) \|\| technicalEmpresa\) : technicalEmpresa\)/);
  assert.match(source, /payload\.append\('con_subtareas', subtareasEnabled \? '1' : '0'\)/);
  assert.match(source, /payload\.append\('rewrite_subtareas', '1'\)/);
  assert.match(source, /JSON\.stringify\(subtareasEnabled \? subtareas : \[\]\)/);
});

test('personas usa todas las cuentas activas y no se reinicia al cambiar empresa', () => {
  const frontend = read('modules/home/home.js');
  const scope = read('backend/src/modules/pendientes/pendientes-project-scope.service.js');
  const usersQuery = scope.slice(scope.indexOf('async function listActiveUsers_gnral'), scope.indexOf('function corellianScopeSql_gnral'));
  assert.match(usersQuery, /WHERE estado = 1/);
  assert.doesNotMatch(usersQuery, /empresa\)|TRIM\(empresa\)|companyLabel/);
  assert.doesNotMatch(frontend, /usuariosFiltrados/);
  assert.match(frontend, /const selectedUsers = selectedInitialsFromForm\(\)/);
  assert.match(frontend, /renderUserPicker\(selectedUsers\)/);
  assert.match(frontend, /user-chip\$\{historical \? ' historical'/);
});

function loadPendientesService(options = {}) {
  delete require.cache[require.resolve(SERVICE_PATH)];
  const calls = { replacedUsers: [], replacedSubtasks: [], committed: 0, rolledBack: 0 };
  const connection = {
    async beginTransaction() {},
    async commit() { calls.committed += 1; },
    async rollback() { calls.rolledBack += 1; },
    release() {}
  };
  const repository = {
    getExecutor_gnral: () => ({ query: async () => [[]] }),
    getConnection_gnral: async () => connection,
    getAllowedEmpresas_gnral: async () => ['Corellian SA de CV'],
    insertTask_gnral: async () => 91,
    updateTask_gnral: async () => {},
    listTaskResponsibles_gnral: async () => [],
    listTaskUsers_gnral: async () => options.existingUsers || [],
    listActiveUsersByInitials_gnral: async (_executor, initials) => (
      (options.activeInitials || []).filter(value => initials.includes(value)).map(iniciales => ({ iniciales }))
    ),
    replaceTaskUsers_gnral: async (_executor, _id, initials) => { calls.replacedUsers.push([...initials]); },
    replaceSubtasks_gnral: async (_executor, _id, subtasks) => { calls.replacedSubtasks.push([...subtasks]); }
  };
  const access = {
    getPendienteAccessContext_gnral: async () => ({ creator: true, row: { empresa: 'Corellian SA de CV' } }),
    assertCreator_gnral() {}
  };
  const files = {
    normalizeTaskBody_gnral: body => body,
    extractTaskEvidence_gnral: () => null
  };
  const original = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === './pendientes.repository') return repository;
    if (request === './pendientes-access.service') return access;
    if (request === './pendientes-files.service') return files;
    if (request === '../../shared/rich-text') return { sanitizeHtml: value => value || '' };
    if (request === '../../services/notifications/notification-business-emitter.service') {
      return { emitBusinessEventSafe_gnral: async () => ({ created: 0 }) };
    }
    return original.call(this, request, parent, isMain);
  };
  try {
    return { service: require(SERVICE_PATH), calls };
  } finally {
    Module._load = original;
  }
}

function taskRequest(body, id) {
  return {
    params: id ? { id: String(id) } : {},
    body: {
      pendiente: 'Validar seguridad',
      tipo_pendiente: 'PERSONAL',
      prioridad: 'MEDIA',
      usuarios: [],
      subtareas: [],
      rewrite_subtareas: true,
      empresa: 'Corellian SA de CV',
      ...body
    },
    user: { id_SB: 7, correo: 'creador@example.com', iniciales: 'CR', empresa: 'Corellian SA de CV' }
  };
}

test('backend rechaza iniciales arbitrarias o inactivas en una tarea nueva', async () => {
  const { service, calls } = loadPendientesService({ activeInitials: ['AA'] });
  await assert.rejects(
    service.createPendiente(taskRequest({ usuarios: ['INEXISTENTE'] })),
    error => error.code === 'PENDIENTE_USUARIO_INVALIDO' && error.status === 400
  );
  assert.deepEqual(calls.replacedUsers, []);
  assert.equal(calls.rolledBack, 1);
});

test('backend acepta usuarios activos de cualquier empresa y conserva históricos existentes', async () => {
  const active = loadPendientesService({ activeInitials: ['AA'] });
  const created = await active.service.createPendiente(taskRequest({ usuarios: ['AA'] }));
  assert.equal(created.status, 201);
  assert.deepEqual(active.calls.replacedUsers, [['AA']]);

  const historical = loadPendientesService({
    activeInitials: [],
    existingUsers: [{ iniciales_usuario: 'HX', usuario_estado: 0 }]
  });
  const updated = await historical.service.updatePendiente(taskRequest({ usuarios: ['HX'] }, 91));
  assert.equal(updated.status, 200);
  assert.deepEqual(historical.calls.replacedUsers, [['HX']]);
});

function loadScopeService(options = {}) {
  delete require.cache[require.resolve(SCOPE_PATH)];
  const connection = {
    async query() { return [[]]; },
    release() {}
  };
  const db = { getConnection: async () => connection };
  const normalizeCompany = value => {
    const text = String(value || '').toLowerCase();
    if (text.includes('corellian')) return 'CORELLIAN';
    if (text.includes('united')) return 'UNITED';
    return null;
  };
  const original = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../../config/db') return db;
    if (request === '../../services/alcance/alcance-resolver.service') {
      return {
        normalizeGroupingCompany_gnral: normalizeCompany,
        resolveMasterAccess_gnral: async (_executor, _req, company) => ({ enabled: (options.masterCompanies || []).includes(company) })
      };
    }
    if (request === '../../services/alcance/alcance-cor.service') {
      return {
        CORELLIAN_COMPANY: 'CORELLIAN',
        resolveAlcanceCor_cor: async () => ({ motor: 'CORELLIAN' }),
        buildResolvedUserColumnsScopeSql_cor: () => ({ sql: '1 = 1', params: [] })
      };
    }
    if (request === '../../services/alcance/alcance-uni.service') {
      return {
        UNITED_COMPANY: 'UNITED',
        resolveAlcanceUni_uni: async () => ({ motor: 'UNITED' }),
        buildResolvedPortafolioScopeSql_uni: () => ({ sql: '1 = 1', params: [] })
      };
    }
    return original.call(this, request, parent, isMain);
  };
  try {
    return require(SCOPE_PATH);
  } finally {
    Module._load = original;
  }
}

test('empresa cruzada exige ambas llaves maestras', async () => {
  const req = { user: { empresa: 'Corellian SA de CV' } };
  const denied = loadScopeService({ masterCompanies: [] });
  await assert.rejects(
    denied.resolveTaskCompanyContext_gnral({}, req, 'United Elevadores'),
    error => error.code === 'PENDIENTE_EMPRESA_FORBIDDEN' && error.status === 403
  );
  const allowed = loadScopeService({ masterCompanies: ['CORELLIAN', 'UNITED'] });
  const context = await allowed.resolveTaskCompanyContext_gnral({}, req, 'United Elevadores');
  assert.equal(context.puedeSeleccionarEmpresa, true);
  assert.equal(context.empresaSeleccionada, 'United Elevadores');
});

test('middleware rechaza proyecto fuera de alcance y equipo sin proyecto', async () => {
  const scope = loadScopeService({ masterCompanies: ['CORELLIAN'] });
  const run = async body => {
    let response;
    await scope.validateTaskProjectSelection_gnral(
      { body, user: { empresa: 'Corellian SA de CV' } },
      { status(status) { return { json(json) { response = { status, json }; } }; } },
      () => { response = { status: 200 }; }
    );
    return response;
  };
  assert.equal((await run({ empresa: 'Corellian SA de CV', proyecto: 'FUERA' })).json.code, 'PENDIENTE_PROYECTO_FUERA_ALCANCE');
  assert.equal((await run({ empresa: 'Corellian SA de CV', equipo: 'EQ-1' })).json.code, 'PENDIENTE_EQUIPO_REQUIERE_PROYECTO');
});

test('estilos y cache-bust publican la versión reorganizada', () => {
  const css = read('styles/home.css');
  const index = read('index.html');
  assert.match(css, /\.task-form-reorganized/);
  assert.match(css, /\.task-optional-content\[hidden\]\{display:none!important\}/);
  assert.match(css, /@media\(max-width:480px\)/);
  assert.match(index, /styles\/home\.css\?v=20261019-tareas-meta-visibles-v001/);
  assert.match(index, /modules\/home\/home\.js\?v=20261019-tareas-meta-visibles-v001/);
});

