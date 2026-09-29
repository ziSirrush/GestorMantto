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
const screenModule = read('modules/seguimiento-especial/seguimiento-especial.js');
const css = read('modules/seguimiento-especial/seguimiento-especial.css');
const loader = read('core/module-loader.js');
const packageJson = JSON.parse(read('backend/package.json'));

function functionSlice(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `No se encontro ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : -1;
  return source.slice(start, end === -1 ? source.length : end);
}

test('snapshot global agrega Tickets sin quitar Proyectos ni Equipos', () => {
  assert.match(globalModule, /lastData=\{proyectos:\[\],equipos:\[\],tickets:\[\]/);
  assert.match(globalModule, /tickets:lastData\.tickets\.map/);
  assert.match(globalModule, /ticketsSet:new Set\(trackedTickets\)/);
});

test('refresh combina endpoint historico de Portafolio con endpoint general de Tickets', () => {
  const slice = functionSlice(globalModule, 'refresh', 'getSnapshot');
  assert.match(slice, /Promise\.all/);
  assert.match(slice, /\/api\/portafolio\/seguimiento-especial/);
  assert.match(slice, /\/api\/seguimiento-especial\/tickets/);
  assert.match(slice, /tickets:Array\.isArray\(ticketsData\.tickets\)/);
});

test('trackedTickets se reconstruye desde ticket e id_ticket del listado', () => {
  const slice = functionSlice(globalModule, 'applySnapshot', 'clearSnapshot');
  assert.match(slice, /trackedTickets=new Set/);
  assert.match(slice, /normalize\(row\.ticket\)/);
  assert.match(slice, /normalize\(row\.id_ticket\)/);
});

test('decorador general ya reconoce referencias TICKET en Fase 4', () => {
  const slice = functionSlice(globalModule, 'isReferenceTracked', 'isManttoView');
  assert.match(slice, /trackedTickets\.has\(key\)/);
});

test('setTicket refresca snapshot completo despues del PUT', () => {
  const slice = functionSlice(globalModule, 'setTicket', 'isManttoTarget');
  assert.match(slice, /putJson\('\/api\/tickets\//);
  assert.match(slice, /await refresh\(true\)/);
});

test('pantalla incorpora KPI y workspace de Tickets', () => {
  assert.match(screenModule, /id="se-total-tickets"/);
  assert.match(screenModule, /<h2>Tickets<\/h2>/);
  assert.match(screenModule, /id="se-tickets-body"/);
  assert.match(screenModule, /seguir un Ticket no agrega su Proyecto, su Equipo ni otros Tickets/);
});

test('fila Ticket muestra identidad y campos vivos de tickets', () => {
  const slice = functionSlice(screenModule, 'ticketRow', 'render');
  assert.match(slice, /row\.ticket\|\|row\.id_ticket/);
  assert.match(slice, /row\.proyecto\|\|row\.proyecto_padre/);
  assert.match(slice, /row\.codigo_equipo\|\|row\.equipo/);
  assert.match(slice, /row\.estado_ticket\|\|row\.estado/);
  assert.match(slice, /row\.prioridad/);
  assert.match(slice, /row\.responsabilidad/);
});

test('Ticket listado abre Detalle Ticket y Quitar usa setTicket', () => {
  const bindSlice = functionSlice(screenModule, 'bind', 'load');
  const removeSlice = functionSlice(screenModule, 'removeTarget', 'bind');
  assert.match(bindSlice, /openDetail\('ticket',ticket\.dataset\.openTicket\)/);
  assert.match(bindSlice, /removeTarget\('TICKET',removeTicket\.dataset\.removeTicket/);
  assert.match(removeSlice, /service\.setTicket\(id,false\)/);
});

test('busqueda unica tambien filtra Tickets', () => {
  const slice = functionSlice(screenModule, 'render', 'openDetail');
  assert.match(slice, /snapshot\.tickets/);
  assert.match(slice, /filter\(matchesSearch\)/);
  assert.match(slice, /tickets\.map\(row=>ticketRow\(row,manage\)\)/);
});

test('estado de pantalla reporta los tres niveles visibles', () => {
  const slice = functionSlice(screenModule, 'render', 'openDetail');
  assert.match(slice, /snapshot\.proyectos\.length/);
  assert.match(slice, /snapshot\.equipos\.length/);
  assert.match(slice, /snapshot\.tickets\.length/);
});

test('sin acceso se cierran tambien las filas de Tickets', () => {
  const slice = functionSlice(screenModule, 'renderNoAccess', 'init');
  assert.match(slice, /se-tickets-body/);
  assert.match(slice, /No tienes permiso para consultar Seguimiento Especial/);
});

test('CSS soporta tercer KPI y estado cerrado sin reemplazar estilos existentes', () => {
  assert.match(css, /grid-template-columns:160px 160px 160px minmax\(280px,1fr\)/);
  assert.match(css, /\.se-pill\.closed/);
  assert.match(css, /\.se-ticket-table/);
});

test('module-loader invalida cache de global pantalla y CSS para Fase 4', () => {
  assert.match(loader, /seguimiento-especial-global\.js\?v=20260929-seguimiento-especial-ticket-listado-fase4-v001/);
  assert.match(loader, /seguimiento-especial\.css\?v=20260929-seguimiento-especial-ticket-listado-fase4-v001/);
  assert.match(loader, /seguimiento-especial\.js\?v=20260929-seguimiento-especial-ticket-listado-fase4-v001/);
});

test('suite oficial registra Fase 4 conservando Fases 1 2 y 3', () => {
  const command = packageJson.scripts.test;
  assert.match(command, /seguimiento-especial-ticket-fase1-api\.test\.js/);
  assert.match(command, /seguimiento-especial-ticket-fase2-notificaciones\.test\.js/);
  assert.match(command, /seguimiento-especial-ticket-fase3-frontend-detalle\.test\.js/);
  assert.match(command, /seguimiento-especial-ticket-fase4-listado-frontend\.test\.js/);
});

function createElementStub() {
  return {
    id: '',
    className: '',
    hidden: false,
    style: {},
    dataset: {},
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    setAttribute() {},
    appendChild() {},
    append() {},
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; }
  };
}

function createRuntime() {
  const requests = [];
  const events = [];
  const window = {
    MANTTO_API_BASE: 'https://api.example.test',
    ManttoAuth: {
      authHeaders() { return { Authorization: 'Bearer test' }; },
      isViewingAs() { return false; },
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
    body: createElementStub(),
    createElement() { return createElementStub(); },
    createTextNode(value) { return { nodeValue: value }; },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    dispatchEvent(event) { events.push(event); }
  };

  class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }

  async function fetch(url, options = {}) {
    requests.push({ url, options });
    let payload;
    if (url.endsWith('/api/portafolio/seguimiento-especial')) {
      payload = {
        ok: true,
        data: {
          proyectos: [{ proyecto: 'P-1' }],
          equipos: [{ numero_equipo: 'EQ-1', identificacion_sitio: 'S-1' }],
          resumen: { proyectos: 1, equipos: 1 }
        }
      };
    } else if (url.endsWith('/api/seguimiento-especial/tickets')) {
      payload = {
        ok: true,
        data: {
          tickets: [{ id_ticket: 100, ticket: '254013', activo: true }],
          resumen: { tickets: 1 }
        }
      };
    } else if (url.endsWith('/api/tickets/254013/seguimiento-especial')) {
      payload = { ok: true, data: { id_ticket: 100, ticket: '254013', activo: false } };
    } else {
      throw new Error(`URL inesperada ${url}`);
    }
    return { ok: true, status: 200, async text() { return JSON.stringify(payload); } };
  }

  window.window = window;
  const context = vm.createContext({ window, document, fetch, CustomEvent, console });
  vm.runInContext(globalModule, context, { filename: 'seguimiento-especial-global.js' });
  return { api: window.ManttoSeguimientoEspecial, requests, events };
}

test('runtime refresh fusiona Portafolio y Tickets en un unico snapshot', async () => {
  const runtime = createRuntime();
  const snapshot = await runtime.api.refresh(true);
  assert.equal(runtime.requests.length, 2);
  assert.equal(runtime.requests.some(row => row.url.endsWith('/api/portafolio/seguimiento-especial')), true);
  assert.equal(runtime.requests.some(row => row.url.endsWith('/api/seguimiento-especial/tickets')), true);
  assert.equal(snapshot.proyectos.length, 1);
  assert.equal(snapshot.equipos.length, 1);
  assert.equal(snapshot.tickets.length, 1);
  assert.equal(snapshot.resumen.tickets, 1);
  assert.equal(runtime.api.isTicketTracked('254013'), true);
  assert.equal(runtime.api.isTicketTracked('100'), true);
});

test('runtime setTicket desactiva el Ticket y vuelve a sincronizar el listado', async () => {
  const runtime = createRuntime();
  await runtime.api.refresh(true);
  runtime.requests.length = 0;
  const result = await runtime.api.setTicket('254013', false);
  assert.equal(result.activo, false);
  assert.equal(runtime.requests.length, 3);
  assert.equal(runtime.requests[0].url.endsWith('/api/tickets/254013/seguimiento-especial'), true);
  assert.equal(runtime.requests[0].options.method, 'PUT');
  assert.equal(runtime.requests.some(row => row.url.endsWith('/api/seguimiento-especial/tickets')), true);
  assert.equal(runtime.events.at(-1).type, 'mantto:seguimiento-especial-actualizado');
});
