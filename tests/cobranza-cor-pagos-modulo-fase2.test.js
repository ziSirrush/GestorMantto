'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

// El ZIP contiene solo archivos modificados/nuevos. Se sustituye db durante
// el require aislado del repository; no se usa una BD real en esta prueba.
const originalLoad = Module._load;
Module._load = function phase2PagosLoad(request, parent, isMain) {
  if (
    request === '../../config/db' &&
    parent &&
    /cobranza-cor-pagos-modulo\.repository\.js$/.test(parent.filename)
  ) {
    return {
      getConnection() {
        throw new Error('DB real no disponible en prueba unitaria aislada.');
      }
    };
  }
  if (
    request === './cobranza-cor-pagos.repository' &&
    parent &&
    /cobranza-cor-pagos-modulo\.repository\.js$/.test(parent.filename)
  ) {
    return { TABLE_PAGOS_COR: 'cobranza_pagos_cor' };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const repository = require('../backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.repository');
const service = require('../backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.service');
Module._load = originalLoad;

const fullScope = {
  dominio: 'CORELLIAN',
  empresa: 'CORELLIAN',
  acceso_dominio_completo: true
};

function row(overrides = {}) {
  return {
    id_pago_cor: 101,
    no_factura: 'CFV-1001',
    cliente: 'CLIENTE DEMO',
    limite_credito: '250000.50',
    proyecto: 'P14302',
    fecha_servicio: '2026-09-30',
    estado: 'Pagado por completo',
    facturado: '100000.00',
    pagado: '90000.00',
    saldo: '10000.00',
    dias_retraso: 4,
    fecha_emision: '2026-09-01',
    fecha_vencimiento: '2026-09-30',
    terminos: '30 Dias',
    zona_adm: 'CENTRO',
    subsidiaria: 'Corellian S.A de C.V',
    clase: 'MANTENIMIENTO',
    creado_desde: 'OV12345',
    fecha_creacion_ov: '2026-08-30 11:22:33',
    complemento_pago: 'Pago #CP9001',
    fecha_complemento_pago: '2026-10-01',
    importe_complemento_pago: '-10000.00',
    ...overrides
  };
}

function replaceRepository(stubs) {
  const originals = {};
  for (const [name, value] of Object.entries(stubs)) {
    originals[name] = repository[name];
    repository[name] = value;
  }
  return function restore() {
    for (const [name, value] of Object.entries(originals)) repository[name] = value;
  };
}

test('Fase 2 registra GET /pagos y /pagos/:idPagoCor con permiso COBRANZA_PAGOS y alcance completo', () => {
  const routes = read('backend/src/modules/cobranza-cor/cobranza-cor.routes.js');
  assert.match(routes, /COBRANZA_PAGOS_ACCESO_VISUAL_MODULO\.ACCESO_VISUAL/);
  assert.match(routes, /requireCompleteInformationDomain_gnral\('CORELLIAN'\)/);
  assert.match(routes, /router\.get\('\/pagos', \.\.\.requirePagosCor, requirePagosCorCompleteDomain, pagosModuloController\.listarPagos_cor\)/);
  assert.match(routes, /router\.get\('\/pagos\/:idPagoCor', \.\.\.requirePagosCor, requirePagosCorCompleteDomain, pagosModuloController\.detallePago_cor\)/);
});

test('Fase 2 no agrega mutaciones humanas al modulo Pagos', () => {
  const routes = read('backend/src/modules/cobranza-cor/cobranza-cor.routes.js');
  assert.doesNotMatch(routes, /router\.(post|put|patch|delete)\('\/pagos(?:'|\/)/);
});

test('scope incompleto falla cerrado antes de consultar repository', async () => {
  let touched = false;
  const restore = replaceRepository({
    getConnection_cor: async () => {
      touched = true;
      throw new Error('No debe abrir conexion.');
    }
  });
  try {
    await assert.rejects(
      service.listarPagos_cor({}, { dominio: 'CORELLIAN', acceso_dominio_completo: false }),
      (error) => error.statusCode === 403 && error.code === 'COBRANZA_PAGOS_SCOPE_COMPLETO_REQUERIDO'
    );
    assert.equal(touched, false);
  } finally {
    restore();
  }
});

test('normaliza filtros y limita page_size a 100', () => {
  assert.deepEqual(
    service.normalizePagosFilters_cor({ q: ' CFV-1 ', estado: 'Pagado', zona_adm: 'CENTRO', page: '2', page_size: '100' }),
    { buscar: 'CFV-1', estado: 'Pagado', zonaAdm: 'CENTRO', page: 2, pageSize: 100 }
  );
  assert.throws(
    () => service.normalizePagosFilters_cor({ page_size: '101' }),
    (error) => error.statusCode === 400
  );
});

test('listado pagina en backend y conserva los 21 campos canonicos mas id_pago_cor', async () => {
  const calls = [];
  const connection = { release() { calls.push('release'); } };
  const restore = replaceRepository({
    getConnection_cor: async () => connection,
    countPagosModulo_cor: async (_connection, filters) => {
      calls.push(['count', filters]);
      return 120;
    },
    listPagosModulo_cor: async (_connection, filters, pagination) => {
      calls.push(['list', filters, pagination]);
      return [row({ id_pago_cor: 120 })];
    }
  });

  try {
    const response = await service.listarPagos_cor({ page: 2, page_size: 50 }, fullScope);
    assert.equal(response.ok, true);
    assert.equal(response.route, '/api/cobranza-cor/pagos');
    assert.equal(response.source_table, 'cobranza_pagos_cor');
    assert.equal(response.scope_aplicado, 'DOMINIO_COMPLETO');
    assert.equal(response.relacion_ppns_resuelta, false);
    assert.deepEqual(response.paginacion, { pagina: 2, tamano: 50, total_registros: 120, total_paginas: 3 });
    assert.equal(response.data.length, 1);
    assert.equal(Object.keys(response.data[0]).length, 22);
    assert.equal(response.data[0].id_pago_cor, 120);
    assert.equal(response.data[0].importe_complemento_pago, -10000);
    assert.deepEqual(calls.find((item) => Array.isArray(item) && item[0] === 'list')[2], { limit: 50, offset: 50 });
    assert.equal(calls[calls.length - 1], 'release');
  } finally {
    restore();
  }
});

test('detalle valida id, devuelve Pago y responde 404 controlado cuando no existe', async () => {
  const connection = { release() {} };
  let current = row({ id_pago_cor: 55 });
  const restore = replaceRepository({
    getConnection_cor: async () => connection,
    getPagoModulo_cor: async (_connection, id) => id === 55 ? current : null
  });
  try {
    const response = await service.detallePago_cor('55', fullScope);
    assert.equal(response.pago.id_pago_cor, 55);
    assert.equal(response.route, '/api/cobranza-cor/pagos/:idPagoCor');

    await assert.rejects(
      service.detallePago_cor('56', fullScope),
      (error) => error.statusCode === 404 && error.code === 'COBRANZA_PAGO_NO_ENCONTRADO'
    );
    await assert.rejects(
      service.detallePago_cor('abc', fullScope),
      (error) => error.statusCode === 400
    );
  } finally {
    restore();
  }
});

test('repository usa SELECT parametrizado, paginacion SQL y no escribe tablas', async () => {
  const queries = [];
  const connection = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (/COUNT\(\*\)/.test(sql)) return [[{ total: 7 }]];
      if (/WHERE p\.id_pago_cor = \?/.test(sql)) return [[row({ id_pago_cor: 9 })]];
      return [[row()]];
    }
  };

  const filters = { buscar: 'CFV', estado: 'Pagado', zonaAdm: 'CENTRO' };
  assert.equal(await repository.countPagosModulo_cor(connection, filters), 7);
  await repository.listPagosModulo_cor(connection, filters, { limit: 25, offset: 50 });
  const detail = await repository.getPagoModulo_cor(connection, 9);
  assert.equal(detail.id_pago_cor, 9);
  assert.match(queries[1].sql, /LIMIT \? OFFSET \?/);
  assert.deepEqual(queries[1].params.slice(-2), [25, 50]);
  assert.match(queries[2].sql, /WHERE p\.id_pago_cor = \?/);
  assert.doesNotMatch(read('backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.repository.js'), /\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP|TRUNCATE)\b/i);
});
