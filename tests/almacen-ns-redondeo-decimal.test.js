'use strict';
// [Aster | 2026-10-19 | ASTER-MG | FIX ALMACEN NS REDONDEO DECIMAL QA V001]
// Pruebas locales puras. Sin Aiven, sin Azure y sin escrituras externas.

const { test } = require('node:test');
const assert = require('node:assert/strict');

// Sustituir solo la conexion DB para importar las funciones de normalizacion.
const dbPath = require.resolve('../backend/src/config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
const { normalizeRow } = require('../backend/src/modules/almacen/almacen.ns-sync-service');

const inventory = () => ({
  idInventario:'1', idArticuloNs:'123', articulo:'TORNILLO', descripcion:null,
  valorFactura:10, porcentajeValorFactura:0.2, fisico:1,
  idSubsidiariaNs:'2', subsidiaria:'CORELLIAN',
  idUbicacionNs:'38', almacenUbicacion:'BODEGA'
});

test('Inventario 230: % con decimales extensos se redondea a DECIMAL(20,8)', () => {
  const normalized = normalizeRow('INVENTARIO_230', {
    ...inventory(), porcentajeValorFactura:0.12345678901234567
  }, 1);
  assert.equal(normalized.porcentajeValorFactura, '0.12345679');
});

test('Inventario 230: valores monetarios y fisicos se redondean a 4 decimales', () => {
  const normalized = normalizeRow('INVENTARIO_230', {
    ...inventory(), valorFactura:'123.456789', fisico:10.123456
  }, 1);
  assert.equal(normalized.valorFactura, '123.4568');
  assert.equal(normalized.fisico, '10.1235');
});

test('Inventario 230: cero, null, empate y transporte en notacion cientifica', () => {
  assert.equal(normalizeRow('INVENTARIO_230', {
    ...inventory(), porcentajeValorFactura:'0.999999995'
  }, 1).porcentajeValorFactura, '1.00000000');
  assert.equal(normalizeRow('INVENTARIO_230', {
    ...inventory(), porcentajeValorFactura:null
  }, 1).porcentajeValorFactura, null);
  assert.equal(normalizeRow('INVENTARIO_230', {
    ...inventory(), porcentajeValorFactura:1e-9
  }, 1).porcentajeValorFactura, '0.00000000');
  assert.equal(normalizeRow('INVENTARIO_230', {
    ...inventory(), porcentajeValorFactura:'-0.000000004'
  }, 1).porcentajeValorFactura, '0.00000000');
});

test('Catalogo: precio de compra redondeado a 6 decimales', () => {
  const normalized = normalizeRow('CATALOGO_ARTICULOS', {
    filaOrigen:1,idArticuloNs:'123',nombreArticulo:'TORNILLO',
    numeroParteFabricanteOriginal:null,categoriaArticulo:null,
    cantidadFisicaTotalReportada:12,ubicacionInventarioTexto:null,
    ultimoPrecioCompra:'23.1234567'
  }, 1);
  assert.equal(normalized.ultimoPrecioCompra, '23.123457');
});

test('No se alteran IDs ni se permite el desbordamiento del entero', () => {
  assert.equal(normalizeRow('INVENTARIO_230', inventory(), 1).idInventario, '1');
  assert.throws(() => normalizeRow('INVENTARIO_230', {
    ...inventory(), porcentajeValorFactura:'999999999999.999999999'
  }, 1), {status:422});
  assert.throws(() => normalizeRow('INVENTARIO_230', {
    ...inventory(), porcentajeValorFactura:'invalid'
  }, 1), {status:422});
});
