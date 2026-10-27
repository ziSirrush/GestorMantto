'use strict';

// [BLT NOW | 2026-10-26 | EXPERIMENTAL_NS_F2_SERVICE_V001]
const repository = require('./experimental-ns.repository');
const { assertScope } = require('./experimental-ns.scope');

function badRequest(message) {
  const error = new Error(message);
  error.code = 'EXPERIMENTAL_NS_FILTER_INVALID';
  error.statusCode = 422;
  return error;
}

function integer(value, fallback, max, label) {
  if (value == null || value === '') return fallback;
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw badRequest(label + ' debe ser un entero positivo.');
  }
  const number = Number(value);
  if (number < 1 || number > max) throw badRequest(label + ' fuera de rango permitido.');
  return number;
}

function string(value, label, max) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || value.length > max || /[\x00-\x1f\x7f]/.test(value)) {
    throw badRequest(label + ' invalido.');
  }
  return value.trim();
}

function filters(query = {}) {
  const pagina = integer(query.pagina, 1, 10000, 'pagina');
  const limite = integer(query.limite, 30, 100, 'limite');
  return {
    pagina,
    limite,
    desde: (pagina - 1) * limite,
    buscar: string(query.buscar, 'buscar', 100),
    equipo: string(query.equipo, 'equipo', 120),
    proyecto: string(query.proyecto, 'proyecto', 255)
  };
}

async function status(req) {
  assertScope(req);
  const schema = await repository.getSchemaStatus();
  return {
    ok: schema.listas,
    agrupacion: 'EXPERIMENTAL_NS',
    lectura: true,
    escritura: false,
    ...schema
  };
}

async function list(req, entity) {
  assertScope(req);
  const input = filters(req.query);
  const source = entity === 'portafolio' ? 'ns_portafolio_pruebas' : 'ns_tickets_pruebas';
  const result = entity === 'portafolio'
    ? await repository.listPortafolio(req, input)
    : await repository.listTickets(req, input);
  return {
    ok: true,
    origen: 'EXPERIMENTAL_NS',
    fuente: source,
    data: result.rows,
    paginacion: {
      pagina: input.pagina,
      limite: input.limite,
      total: result.total,
      paginas: Math.ceil(result.total / input.limite)
    }
  };
}

module.exports = { filters, status, list };
