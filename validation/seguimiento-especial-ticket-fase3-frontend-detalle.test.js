'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const globalModule = read('modules/seguimiento-especial/seguimiento-especial-global.js');
const loader = read('core/module-loader.js');
const packageJson = JSON.parse(read('backend/package.json'));

function functionSlice(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `No se encontro ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : -1;
  return source.slice(start, end === -1 ? source.length : end);
}

test('Detalle Mantto acepta TICKET sin quitar Proyecto ni Equipo', () => {
  assert.match(globalModule, /\['proyecto','equipo','ticket'\]\.includes\(type\)/);
});

test('Detalle TICKET usa el endpoint personal creado en Fase 1', () => {
  const slice = functionSlice(globalModule, 'detailEndpoint', 'detailTargetKey');
  assert.match(slice, /type==='ticket'/);
  assert.match(slice, /\/api\/tickets\/.*\/seguimiento-especial/);
});

test('setTicket persiste por PUT y publica el evento transversal de actualizacion', () => {
  const slice = functionSlice(globalModule, 'setTicket', 'isManttoTarget');
  assert.match(slice, /putJson\('\/api\/tickets\/'/);
  assert.match(slice, /tipo:'TICKET'/);
  assert.match(slice, /mantto:seguimiento-especial-actualizado/);
});

test('setTicket conserva el endpoint exacto de Ticket y sincroniza su estado local', () => {
  const slice = functionSlice(globalModule, 'setTicket', 'isManttoTarget');
  assert.match(slice, /putJson\('\/api\/tickets\//);
  assert.match(slice, /syncTicketTrackedState/);
});

test('Estado consultado del Ticket alimenta la estrella del detalle', () => {
  assert.match(globalModule, /let trackedTickets=new Set\(\)/);
  assert.match(globalModule, /function isTicketTracked/);
  assert.match(globalModule, /type==='ticket'\?isTicketTracked\(id\):false/);
  assert.match(globalModule, /syncTicketTrackedState\(data\.ticket\|\|payload\.id,Boolean\(data\.activo\)\)/);
});

test('Activar Ticket no implica Proyecto Equipo ni otros Tickets en la copia funcional', () => {
  const slice = functionSlice(globalModule, 'detailCopy', 'scheduleDetailMount');
  assert.match(slice, /seguir únicamente este Ticket/);
  assert.match(slice, /sin agregar su Proyecto, Equipo ni otros Tickets/);
});

test('Toggle de detalle conserva dispatch Proyecto Equipo y agrega Ticket', () => {
  const slice = functionSlice(globalModule, 'mountDetailControl', 'bindObserver');
  assert.match(slice, /detailType==='proyecto'/);
  assert.match(slice, /detailType==='equipo'/);
  assert.match(slice, /setTicket\(payload\.id,requested\)/);
});

test('MutationObserver vuelve a decorar el encabezado cuando hay Ticket seguido', () => {
  const slice = functionSlice(globalModule, 'bindObserver', 'handleNavigation');
  assert.match(slice, /trackedTickets\.size/);
});

test('API publica setTicket e isTicketTracked sin reemplazar exports existentes', () => {
  assert.match(globalModule, /setProject,[\s\S]*setEquipment,[\s\S]*setTicket,/);
  assert.match(globalModule, /isProjectTracked,[\s\S]*isEquipmentTracked,[\s\S]*isTicketTracked,/);
});

test('contrato de detalle Fase 3 sigue vigente aunque Fase 4 extienda la decoracion a Tickets', () => {
  const referenceSlice = functionSlice(globalModule, 'isReferenceTracked', 'isManttoView');
  assert.match(referenceSlice, /trackedProjects\.has\(key\)/);
  assert.match(referenceSlice, /trackedEquipment\.has\(key\)/);
  assert.match(referenceSlice, /trackedTickets\.has\(key\)/);
});

test('Fase 4 puede consumir el listado general sin reemplazar el endpoint de detalle creado en Fase 3', () => {
  assert.match(globalModule, /\/api\/seguimiento-especial\/tickets/);
  assert.match(globalModule, /\/api\/tickets\/.*\/seguimiento-especial/);
});

test('Visor y permiso de gestion siguen cerrando el control personal', () => {
  const manageSlice = functionSlice(globalModule, 'canManage', 'request');
  assert.match(manageSlice, /isViewingAs\(\)/);
  assert.match(manageSlice, /permissionEffective\(MANAGE_PERMISSION\)/);
});

test('module-loader conserva el global de detalle con cache-bust actualizado por Fase 4', () => {
  assert.match(loader, /seguimiento-especial-global\.js\?v=20260929-seguimiento-especial-ticket-listado-fase4-v001/);
  assert.doesNotMatch(loader, /seguimiento-especial-control-unico-v006/);
});

test('suite oficial registra la prueba dirigida de Fase 3', () => {
  assert.match(
    packageJson.scripts.test,
    /seguimiento-especial-ticket-fase3-frontend-detalle\.test\.js/
  );
});


function createRuntime(options = {}) {
  const requests = [];
  const events = [];
  const viewingAs = options.viewingAs === true;
  let active = options.initialActive === true;

  function elementStub() {
    return {
      id: '', className: '', hidden: false, style: {}, dataset: {},
      classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
      setAttribute() {}, appendChild() {}, append() {}, addEventListener() {},
      querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }
    };
  }

  const window = {
    MANTTO_API_BASE: 'https://api.example.test',
    ManttoAuth: {
      authHeaders() { return { Authorization: 'Bearer test' }; },
      isViewingAs() { return viewingAs; },
      getUser() { return { id_SB: 7 }; }
    },
    ManttoPermissions: {
      state() { return { exists: true, efectivo: true }; }
    },
    setTimeout() { return 1; },
    clearTimeout() {}
  };

  const document = {
    readyState: 'loading',
    head: { appendChild() {} },
    body: elementStub(),
    createElement() { return elementStub(); },
    createTextNode(value) { return { nodeValue: value }; },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    dispatchEvent(event) { events.push(event); }
  };

  class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }

  async function fetch(url, requestOptions = {}) {
    requests.push({ url, options: requestOptions });
    const body = requestOptions.body ? JSON.parse(requestOptions.body) : null;
    if (body && Object.prototype.hasOwnProperty.call(body, 'activo')) active = Boolean(body.activo);

    let data;
    if (url.endsWith('/api/portafolio/seguimiento-especial')) {
      data = { proyectos: [], equipos: [], resumen: { proyectos: 0, equipos: 0 } };
    } else if (url.endsWith('/api/seguimiento-especial/tickets')) {
      data = {
        tickets: active ? [{ id_ticket: 100, ticket: '254013', activo: true }] : [],
        resumen: { tickets: active ? 1 : 0 }
      };
    } else {
      data = {
        tipo: 'TICKET', origen: 'UNITED', id_ticket: 100, ticket: '254013', activo: active
      };
    }

    return {
      ok: true,
      status: 200,
      async text() { return JSON.stringify({ ok: true, data }); }
    };
  }

  window.window = window;
  const context = vm.createContext({ window, document, fetch, CustomEvent, console });
  vm.runInContext(globalModule, context, { filename: 'seguimiento-especial-global.js' });
  return { api: window.ManttoSeguimientoEspecial, requests, events };
}

test('runtime setTicket activa y desactiva la suscripcion exacta y conserva el detalle Fase 3', async () => {
  const runtime = createRuntime();

  const activated = await runtime.api.setTicket('254013', true);
  assert.equal(activated.ticket, '254013');
  assert.equal(activated.activo, true);
  assert.equal(runtime.api.isTicketTracked('254013'), true);
  assert.equal(runtime.requests.length, 3);
  assert.equal(runtime.requests[0].url, 'https://api.example.test/api/tickets/254013/seguimiento-especial');
  assert.equal(runtime.requests[0].options.method, 'PUT');
  assert.deepEqual(JSON.parse(runtime.requests[0].options.body), { activo: true });
  assert.equal(runtime.events.at(-1).type, 'mantto:seguimiento-especial-actualizado');
  assert.equal(runtime.events.at(-1).detail.tipo, 'TICKET');

  const deactivated = await runtime.api.setTicket('254013', false);
  assert.equal(deactivated.activo, false);
  assert.equal(runtime.api.isTicketTracked('254013'), false);
  assert.equal(runtime.requests.length, 6);
  assert.deepEqual(JSON.parse(runtime.requests[3].options.body), { activo: false });
});

test('runtime modo Visor bloquea setTicket antes de llamar al backend', async () => {
  const runtime = createRuntime({ viewingAs: true });
  await assert.rejects(
    () => runtime.api.setTicket('254013', true),
    /No tienes permiso para gestionar Seguimiento Especial/
  );
  assert.equal(runtime.requests.length, 0);
});
