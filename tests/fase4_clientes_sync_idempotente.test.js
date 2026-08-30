'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const records = [];
let nextId = 1;

function keyOf(data) {
  return [
    String(data.nombre_empresa || '').trim().toUpperCase(),
    String(data.nombre_contacto || '').trim().toUpperCase(),
    String(data.email || '').trim().toLowerCase(),
    String(data.telefono || '').trim()
  ].join('|');
}

const connection = {
  async beginTransaction() {},
  async commit() {},
  async rollback() {},
  release() {},
  async query() { return [[], []]; }
};

const repositoryMock = {
  async getConnection() { return connection; },
  async findByIdentity(_connection, data) {
    const found = records.find((row) => keyOf(row) === keyOf(data));
    return found ? { id_cliente: found.id_cliente, activo: found.activo } : null;
  },
  async insert(_connection, data) {
    const row = { ...data, id_cliente: nextId++ };
    records.push(row);
    return row.id_cliente;
  },
  async update(_connection, id, changes) {
    const row = records.find((item) => item.id_cliente === Number(id));
    if (!row) throw new Error('Registro no encontrado');
    Object.assign(row, changes);
    return 1;
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === './ventas-clientes.repository') return repositoryMock;
  return originalLoad.call(this, request, parent, isMain);
};

const servicePath = path.resolve(__dirname, '../backend/src/modules/ventas-clientes/ventas-clientes-sync-f4.service.js');
const service = require(servicePath);

(async () => {
  const row = {
    nombre_empresa: 'Cliente Prueba',
    nombre_contacto: 'Contacto Uno',
    email: 'contacto@example.com',
    telefono: '5551234567',
    iniciales: 'ICH',
    activo: 1
  };

  const first = await service.sync({ registros: [row, { ...row }] });
  assert.strictEqual(first.insertados, 1, 'La primera carga debe insertar una sola identidad.');
  assert.strictEqual(first.actualizados, 1, 'El segundo registro idéntico del mismo lote debe actualizar el canónico.');
  assert.strictEqual(records.length, 1, 'No debe existir un segundo cliente físico.');

  const second = await service.sync({ registros: [{ ...row }, { ...row }] });
  assert.strictEqual(second.insertados, 0, 'La resincronización no debe insertar duplicados.');
  assert.strictEqual(second.actualizados, 2, 'La resincronización debe resolver ambos registros contra el canónico.');
  assert.strictEqual(records.length, 1, 'La cantidad física debe permanecer en uno.');

  console.log('OK FASE 4 - sync Clientes idempotente');
})().finally(() => {
  Module._load = originalLoad;
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
