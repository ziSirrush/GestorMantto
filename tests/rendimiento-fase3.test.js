'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const permissionSource = read('backend/src/services/permissions/effective-permission.service.js');
const guardSource = read('backend/src/middleware/information-access-gnral.middleware.js');
const alcanceSource = read('backend/src/services/alcance/alcance-uni.service.js');
const policySource = read('backend/src/services/notifications/notification-policy.js');
const notificationServiceSource = read('backend/src/modules/notificaciones/notificaciones.service.js');
const notificationRepositorySource = read('backend/src/modules/notificaciones/notificaciones.repository.js');
const dashboardServiceSource = read('backend/src/modules/dashboard-operativo/dashboard-operativo.service.js');
const dashboardRepositorySource = read('backend/src/modules/dashboard-operativo/dashboard-operativo.repository.js');
const logisticaRoutesSource = read('backend/src/routes/logistica.routes.js');

test('Guard General resuelve todos los permisos configurados en una sola consulta batch', () => {
  assert.match(guardSource, /listEffectivePermissions\(/);
  assert.match(guardSource, /configuration\.permissionCodesAny/);
  assert.doesNotMatch(guardSource, /await hasEffectivePermission\(/);
  assert.match(permissionSource, /psa\.codigo_permiso IN \(\$\{codePlaceholders\}\)/);
});

test('el batch de permisos consulta roles vigentes en Aiven sin confiar en IDs del contexto', () => {
  assert.match(permissionSource, /INNER JOIN \$\{activeUserRolesSql\(\)\} roles_usuario/);
  assert.match(permissionSource, /ur\.activo = 1/);
  assert.match(permissionSource, /r\.estado = 1/);
  assert.match(permissionSource, /NOT EXISTS \(SELECT 1 FROM usuario_roles ur_any/);
  assert.doesNotMatch(permissionSource, /rp\.id_rol IN \(\$\{rolePlaceholders\}\)/);
});

test('alcance UNITED reutiliza zonas hidratadas antes de consultar usuario_zop', () => {
  assert.match(alcanceSource, /function preloadedUnitedZones_uni/);
  assert.match(alcanceSource, /preloadedUnitedZones_uni\(source\) \|\| await resolveUnitedZones_uni/);
});

test('Inbox reutiliza IDs de roles activos y evita usuario_roles cuando existe contexto hidratado', () => {
  assert.match(notificationServiceSource, /roleIds/);
  assert.match(notificationRepositorySource, /bellVisibilitySql_gnral\('n', 'e', 'p', \{ roleIds \}\)/);
  assert.match(policySource, /normalizedRoleIds\.length/);
  assert.match(policySource, /ner_policy\.id_rol IN/);
});

test('Dashboard inicial no vuelve a consultar supervisores para construir preventivos', () => {
  const initial = dashboardServiceSource.slice(dashboardServiceSource.indexOf('async function getInitialData'));
  assert.match(initial, /getSupervisoresActivosPorZona/);
  assert.match(initial, /getPreventivosPorZona/);
  assert.doesNotMatch(initial, /getPreventivosSupervisor\(mes/);
  assert.match(initial, /buildPreventivosSupervisor\(supervisoresRows, preventivosRows\)/);
});

test('Dashboard deja de transportar SELECT p.* y t.* en la carga inicial', () => {
  assert.doesNotMatch(dashboardRepositorySource, /SELECT\s+p\.\*/);
  assert.doesNotMatch(dashboardRepositorySource, /SELECT\s+t\.\*/);
  for (const field of ['p.numero_equipo','p.proyecto','p.supervisor_zona','t.ticket','t.codigo_equipo','t.vobo_estado']) {
    assert.ok(dashboardRepositorySource.includes(field), field);
  }
});

test('GET de Logistica exigen sesion, permisos CORELLIAN y alcance completo; sync exige M2M', () => {
  assert.match(guardSource, /function humanInformationGuard_gnral\(options = \{\}\) \{\s*return \[requireAuth, buildInformationAccessGuard_gnral\(options\)\];/);
  assert.match(logisticaRoutesSource, /const listGuard_cor = humanInformationGuard_gnral\(\{/);
  assert.match(logisticaRoutesSource, /const detailGuard_cor = humanInformationGuard_gnral\(\{/);
  assert.match(logisticaRoutesSource, /requireCompleteInformationDomain_gnral\('CORELLIAN'\)/);
  assert.match(logisticaRoutesSource, /router\.post\('\/sync', requireLogisticaIntegration, logisticaController\.syncLogOps\)/);
  assert.match(logisticaRoutesSource, /router\.get\('\/', \.\.\.listGuard_cor, requireFullLogisticaScope_cor, logisticaController\.getLogOps\)/);
  assert.match(logisticaRoutesSource, /router\.get\('\/:id', \.\.\.detailGuard_cor, requireFullLogisticaScope_cor, logisticaController\.getLogOpsById\)/);
});

test('listEffectivePermissions conserva prioridad de override personalizado', async () => {
  const module = { exports: {} };
  const queries = [];
  const conn = {
    async query(sql, params) {
      queries.push({ sql: String(sql), params });
      return [[
        { codigo_permiso: 'A.VER', personalizado: 0, heredado: 1 },
        { codigo_permiso: 'B.VER', personalizado: null, heredado: 1 }
      ]];
    }
  };
  vm.runInNewContext(permissionSource, {
    module,
    exports: module.exports,
    require(id) {
      if (id === '../../config/db') return conn;
      throw new Error('Dependencia inesperada: ' + id);
    },
    Map,
    Set,
    Number,
    String,
    Array,
    Object,
    console
  });
  const result = await module.exports.listEffectivePermissions(7, ['A.VER','B.VER'], conn, { roleIds: [2,3] });
  assert.equal(queries.length, 1);
  assert.deepEqual(Array.from(queries[0].params), [7,7,7,'A.VER','B.VER']);
  assert.equal(result.get('A.VER'), false);
  assert.equal(result.get('B.VER'), true);
});
