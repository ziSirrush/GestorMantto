'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(__dirname, '..');

function loadMocked(filename, dependencies) {
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod.require = name => {
    if (!Object.hasOwn(dependencies, name)) throw new Error(`Dependencia inesperada: ${name}`);
    return dependencies[name];
  };
  mod._compile(fs.readFileSync(filename, 'utf8'), filename);
  return mod.exports;
}

const scope = loadMocked(
  path.join(root, 'backend/src/services/cobranza-uni-scope.service.js'),
  {
    './information-record-scope-gnral.service': {
      hasUnrestrictedUnitedScope_gnral: () => false,
      zoneIds_gnral: () => [1],
      zoneCodes_gnral: () => ['CENTRO']
    }
  }
);

const cobranzaController = loadMocked(
  path.join(root, 'backend/src/controllers/cobranza-uni-cuartos-v2.controller.js'),
  { '../config/db': {}, '../services/cobranza-uni-scope.service': scope }
);
const protectedController = loadMocked(
  path.join(root, 'backend/src/controllers/cobranza-uni-relaciones-protegidas.controller.js'),
  {
    '../config/db': {},
    '../services/cobranza-uni-scope.service': scope,
    '../services/cobranza-uni/identidad-proyecto.service': {},
    './detalle-mp-2026-cuartos-v2.controller': {}
  }
);

test('KPI VA: cuenta el adeudo una sola vez por proyecto y conserva importes por operacion', () => {
  const rows = [
    { id_pc: 1, proyecto: 'Proyecto A', precio_venta: 10, venta_total: 100, adeudo: 80, no_pagado_iva: 5, facturas_pendientes_pago: 1, estatus_administrativo: 'Pendiente' },
    { id_pc: 2, proyecto: ' proyecto a ', precio_venta: 20, venta_total: 200, adeudo: 80, no_pagado_iva: 7, facturas_pendientes_pago: 2, estatus_administrativo: 'Pagado por completo' },
    { id_pc: 3, proyecto: 'Proyecto B', precio_venta: 30, venta_total: 300, adeudo: 25, no_pagado_iva: 0, facturas_pendientes_pago: 0, estatus_administrativo: 'Pendiente' }
  ];

  const kpis = cobranzaController._test.calculateVentaAdicionalKpis_uni(rows);
  assert.equal(kpis.total_registros, 3);
  assert.equal(kpis.precio_venta_total, 60);
  assert.equal(kpis.venta_total, 600);
  assert.equal(kpis.facturado_pagado, 200);
  assert.equal(kpis.no_pagado, 12);
  assert.equal(kpis.facturas_pendientes, 3);
  assert.equal(kpis.adeudo_total, 105);
  assert.equal(kpis.pendiente_1pct, 6);
});

test('KPI VA: normaliza los resultados monetarios a centavos', () => {
  const kpis = cobranzaController._test.calculateVentaAdicionalKpis_uni([
    { id_pc: 1, proyecto: 'A', precio_venta: 0.1, venta_total: 0.1, adeudo: 0.1 },
    { id_pc: 2, proyecto: 'B', precio_venta: 0.2, venta_total: 0.2, adeudo: 0.2 }
  ]);
  assert.equal(kpis.precio_venta_total, 0.3);
  assert.equal(kpis.venta_total, 0.3);
  assert.equal(kpis.adeudo_total, 0.3);
});

test('KPI VA: selecciona precio_venta en la consulta principal', () => {
  assert.match(cobranzaController._test.pcMainSelectSql('pc'), /pc\.precio_venta/);
});

test('SQL MP: usa un saldo VA por proyecto y convierte Portafolio a utf8mb4', () => {
  const sql = protectedController._test.SQL_ADEUDOS_MP_PROTEGIDOS_UNI('1 = 1', '1 = 1');
  assert.match(sql, /MAX\(CASE WHEN pc\.id_proyecto_cobranza/);
  assert.match(sql, /CONVERT\(p\.proyecto USING utf8mb4\)/);
});

test('SQL de alcance convierte todos los nombres provenientes de Portafolio', () => {
  const sql = [
    scope.canonicalProjectSql_uni('pc'),
    scope.canonicalZoneCodeSql_uni('pc'),
    scope.canonicalZoneIdsSql_uni('pc')
  ].join('\n');
  assert.match(sql, /CONVERT\(p_scope_discordante\.proyecto USING utf8mb4\)/);
  assert.match(sql, /CONVERT\(p_cob_zone\.proyecto USING utf8mb4\)/);
  assert.match(sql, /CONVERT\(p_cob_zone_id\.proyecto USING utf8mb4\)/);
});

test('Frontend recalcula KPI VA filtrados y advierte subtotales MP', () => {
  const source = fs.readFileSync(path.join(root, 'modules/cobranza-uni/cobranza-uni.js'), 'utf8');
  const details = fs.readFileSync(path.join(root, 'core/details.js'), 'utf8');
  const loader = fs.readFileSync(path.join(root, 'core/module-loader.js'), 'utf8');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(source, /const k=vaKpisFromRows_uni\(rows\)/);
  assert.match(source, /adeudo>adeudoPorProyecto\.get\(key\)/);
  assert.match(source, /adeudo_va_verificado===false/);
  assert.match(source, /Adeudo VA y el Adeudo Total son subtotales/);
  assert.match(details, /deudaNoVerificada/);
  assert.match(details, /No verificado/);
  assert.match(details, /adeudo_advertencia/);
  assert.match(loader, /cobranza-uni\.js\?v=20261014-cobranza-kpis-v001/);
  assert.match(loader, /cobranza-uni\.css\?v=20261014-cobranza-kpis-v001/);
  assert.match(index, /core\/details\.js\?v=20261014-cobranza-kpis-v001/);
});
