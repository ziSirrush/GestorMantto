'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Equipos del Proyecto separa fallas totales y responsabilidad BLT del año actual', () => {
  const backend = read('backend/src/modules/portafolio/portafolio-consultas_uni.js');
  const frontend = read('core/details.js');

  assert.ok(backend.includes('date >= yearStart && date < nextYear'));
  assert.ok(backend.includes("normalizeUpper_uni(ticket.responsabilidad) === 'BLT'"));
  assert.ok(backend.includes('row.fallas_anio = yearTickets.length'));
  assert.ok(backend.includes('row.resp_blt_anio = responsibilityBltYear.length'));

  assert.ok(frontend.includes('<th>Fallas al año</th><th>Resp BLT</th>'));
  assert.ok(frontend.includes("esc(e.fallas_anio||0)"));
  assert.ok(frontend.includes("esc(e.resp_blt_anio||0)"));
});
