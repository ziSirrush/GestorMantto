'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  resolveMatrixRecipientDecision_gnral
} = require('../backend/src/services/notifications/notification-decision');
const {
  matrixExistsSql_gnral,
  matrixChannelSql_gnral
} = require('../backend/src/services/notifications/notification-policy');

function row(overrides = {}) {
  return {
    id_usuario: 10,
    id_rol: 1,
    rol: 'Rol A',
    politica: 'OPCIONAL',
    configuracion_activa: 1,
    campana: 1,
    push: 1,
    silenciada: 0,
    zona_autorizada: 1,
    united_dominio_completo: 0,
    ...overrides
  };
}

test('Norma 7: OBLIGATORIA gana si cualquiera de los roles activos aplicables es obligatorio', () => {
  const decision = resolveMatrixRecipientDecision_gnral({
    rows: [
      row({ id_rol: 1, politica: 'OPCIONAL', campana: 0, push: 0, silenciada: 1 }),
      row({ id_rol: 2, politica: 'OBLIGATORIA', campana: 0, push: 0, silenciada: 1 })
    ],
    event: { campana_default: 0, push_default: 0 },
    zoneScope: { noAplica: false, ids: [5] }
  });

  assert.equal(decision.eligible, true);
  assert.equal(decision.policy, 'OBLIGATORIA');
  assert.equal(decision.bell_enabled, true);
  assert.equal(decision.push_enabled, true);
  assert.deepEqual(decision.role_ids, [1, 2]);
});

test('Norma 8: evento OPCIONAL respeta preferencias personales', () => {
  const decision = resolveMatrixRecipientDecision_gnral({
    rows: [row({ politica: 'OPCIONAL', campana: 1, push: 0, silenciada: 0 })],
    event: { campana_default: 1, push_default: 1 },
    zoneScope: { noAplica: false, ids: [5] }
  });

  assert.equal(decision.eligible, true);
  assert.equal(decision.policy, 'OPCIONAL');
  assert.equal(decision.bell_enabled, true);
  assert.equal(decision.push_enabled, false);
});

test('Norma 3: DOMINIO_COMPLETO UNITED autoriza sin exigir usuario_zop', () => {
  const decision = resolveMatrixRecipientDecision_gnral({
    rows: [row({ zona_autorizada: 0, united_dominio_completo: 1 })],
    event: { campana_default: 1, push_default: 1 },
    zoneScope: { noAplica: false, ids: [99] }
  });

  assert.equal(decision.eligible, true);
  assert.equal(decision.scope_allowed, true);
  assert.equal(decision.scope_via, 'DOMINIO_COMPLETO');
});

test('Norma 3: usuario UNITED normal fuera de zona queda excluido con SIN_ALCANCE', () => {
  const decision = resolveMatrixRecipientDecision_gnral({
    rows: [row({ zona_autorizada: 0, united_dominio_completo: 0 })],
    event: { campana_default: 1, push_default: 1 },
    zoneScope: { noAplica: false, ids: [99] }
  });

  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, 'SIN_ALCANCE');
  assert.equal(decision.scope_allowed, false);
});

test('Norma 2: una matriz solo existe si la relacion y el rol estan activos', () => {
  const sql = matrixExistsSql_gnral('n');
  assert.match(sql, /ner_any\.activo\s*=\s*1/);
  assert.match(sql, /r_any\.estado\s*=\s*1/);
  assert.match(sql, /OBLIGATORIA/);
  assert.match(sql, /OPCIONAL/);
});

test('Norma 4: politica de canal usa todos los roles activos, no solo Rol Principal', () => {
  const sql = matrixChannelSql_gnral({ notificationAlias: 'n', eventAlias: 'e', preferenceAlias: 'p', channel: 'campana' });
  assert.match(sql, /ur_policy\.activo\s*=\s*1/);
  assert.doesNotMatch(sql, /ur_policy\.principal\s*=\s*1/);
  assert.match(sql, /ner_policy\.politica\s*=\s*'OBLIGATORIA'/);
});

test('Norma 2: Panel valida el ultimo rol dentro de la misma transaccion', () => {
  const controllerPath = path.join(
    __dirname,
    '../backend/src/controllers/panel-control-notificaciones.controller.js'
  );
  const source = fs.readFileSync(controllerPath, 'utf8');
  assert.match(source, /assertAffectedEventsHaveActiveRoles_gnral/);
  assert.match(source, /NOTIFICATION_EVENT_REQUIRES_ACTIVE_ROLE/);
  assert.match(
    source,
    /await persistChanges_gnral\(conn, changes\);[\s\S]*?await assertAffectedEventsHaveActiveRoles_gnral\([\s\S]*?await conn\.commit\(\);/
  );
});

test('Norma 9 y 15: motor persiste clave de deduplicacion y trace_id sin INSERT IGNORE', () => {
  const repositoryPath = path.join(
    __dirname,
    '../backend/src/services/notifications/notification.repository.js'
  );
  const source = fs.readFileSync(repositoryPath, 'utf8');
  assert.match(source, /clave_deduplicacion/);
  assert.match(source, /trace_id/);
  assert.match(source, /ER_DUP_ENTRY/);
  assert.doesNotMatch(source, /INSERT IGNORE/);
});

test('Norma 5 y 15: el motor registra ACTOR_EXCLUIDO de forma explicita', () => {
  const servicePath = path.join(
    __dirname,
    '../backend/src/services/notifications/notification.service.js'
  );
  const source = fs.readFileSync(servicePath, 'utf8');
  assert.match(source, /ACTOR_EXCLUIDO/);
  assert.match(source, /\[NOTIFICATION_TRACE\]/);
});
