'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('Tickets guarda comentarios y VoBo con UTC explicito', () => {
  const modular = read('backend/src/modules/tickets/tickets-notification-writes.service.js');
  const legacy = read('backend/src/controllers/data.controller.legacy.js');
  for (const source of [modular, legacy]) {
    assert.match(source, /ticket_comentarios[\s\S]{0,220}UTC_TIMESTAMP\(3\)/);
    assert.match(source, /vobo_en\s*=\s*UTC_TIMESTAMP\(3\)/);
    assert.match(source, /ticket_validaciones[\s\S]{0,240}UTC_TIMESTAMP\(3\)/);
  }
});

test('interacciones y comentarios DATETIME internos nuevos usan UTC', () => {
  assert.match(read('backend/src/services/interactions/interactions.repository.js'), /UTC_TIMESTAMP\(3\)/);
  assert.match(read('backend/src/modules/pendientes/pendientes.repository.js'), /pendientes_comentarios[\s\S]{0,180}UTC_TIMESTAMP\(3\)/);
  assert.match(read('backend/src/modules/ventas-prospeccion/ventas-prospeccion.repository.js'), /ventas_prospeccion_comentarios[\s\S]{0,180}UTC_TIMESTAMP\(3\)/);
  assert.match(read('backend/src/modules/ventas-prospeccion/ventas-prospeccion.repository.js'), /'CREACION'[\s\S]{0,120}UTC_TIMESTAMP\(3\)/);
  assert.match(read('backend/src/modules/ventas-redes/ventas-redes.service.js'), /fecha_hora:\s*instanteUtc[\s\S]{0,160}created_at:\s*instanteUtc/);
});

test('Ventas PDF usa epoch absoluto y no agrega Z artificial a DATE_FORMAT', () => {
  const source = read('backend/src/modules/ventas-dashboard/ventas-dashboard.repository.js');
  assert.match(source, /UNIX_TIMESTAMP\(vc\.created_at\)/);
  assert.doesNotMatch(source, /DATE_FORMAT\(vc\.created_at,\s*'%Y-%m-%dT%H:%i:%s\.000Z'\)/);
});

test('no se configura timezone global del pool para no alterar sync', () => {
  const source = read('backend/src/config/db.js');
  assert.doesNotMatch(source, /SET\s+time_zone/i);
  assert.doesNotMatch(source, /timezone\s*:\s*['"]Z['"]/i);
});
