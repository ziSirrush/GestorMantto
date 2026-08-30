'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const repoPath = path.join(__dirname, '..', 'backend', 'src', 'modules', 'ventas-dashboard', 'ventas-dashboard.repository.js');
const source = fs.readFileSync(repoPath, 'utf8');
const start = source.indexOf('function progressNumber');
const end = source.indexOf('function emptyCommercialTables', start);
assert(start >= 0 && end > start, 'No se encontro el bloque real de formula de Activos.');
const snippet = `${source.slice(start, end)}\nthis.buildActiveProjects = buildActiveProjects;`;
const context = {};
vm.runInNewContext(snippet, context);

const result = context.buildActiveProjects([
  { id_proyecto: 'P1', proyecto: 'Proyecto Uno', avance_oc: 0.5, avance_mo: 40, avance_aj: '100%' },
  { id_proyecto: 'P1', proyecto: 'Proyecto Uno', avance_oc: '100%', avance_mo: 0.6, avance_aj: 0 },
  { id_proyecto: 'P2', proyecto: 'Proyecto Dos', avance_oc: 0.1, avance_mo: 0.2, avance_aj: 0.3 }
]);

assert.strictEqual(result.length, 2);
const p1 = result.find((row) => row.id_proyecto === 'P1');
assert(p1, 'P1 no fue agrupado.');
assert.strictEqual(p1.cantidad_equipos, 2);
assert.strictEqual(p1.porcentaje_oc, 75);
assert.strictEqual(p1.porcentaje_m, 50);
assert.strictEqual(p1.porcentaje_a, 50);
assert.strictEqual(p1.porcentaje_general, 60);
assert.strictEqual(result[0].id_proyecto, 'P1', 'El orden debe iniciar por mayor %General.');

console.log('OK fase5_activos_formula');
