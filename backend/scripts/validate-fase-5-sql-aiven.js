'use strict';

// [Aster | 2026-08-28 | ASTER-MG | FASE_5_SQL_AIVEN_OPTIMIZACION_V001]
// Validador estatico. No abre conexion a MySQL y no modifica archivos.

const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendRoot, '..');

function read(relativePath) {
  const fullPath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(fullPath)) throw new Error(`Falta archivo: ${relativePath}`);
  return fs.readFileSync(fullPath, 'utf8');
}

function assertContains(text, token, label) {
  if (!text.includes(token)) throw new Error(`${label}: falta ${token}`);
}

function assertNotContains(text, token, label) {
  if (text.includes(token)) throw new Error(`${label}: no debe contener ${token}`);
}

const db = read('backend/src/config/db.js');
assertContains(db, 'DB_QUERY_OBSERVABILITY_ENABLED', 'db.js');
assertContains(db, 'DB_SLOW_QUERY_MS', 'db.js');
assertContains(db, '[DB_SLOW_QUERY]', 'db.js');
assertContains(db, 'installQueryObservability(connection', 'db.js');

const prospeccion = read('backend/src/modules/ventas-prospeccion/ventas-prospeccion.repository.js');
assertContains(prospeccion, 'p.fecha_visita >= ? AND p.fecha_visita < ?', 'ventas-prospeccion.repository.js');
assertNotContains(prospeccion, "AND YEAR(p.fecha_visita) = ?", 'ventas-prospeccion.repository.js');

const precheck = read('backend/sql/20260828_FASE_5_SQL_AIVEN_PRECHECK_V001.sql');
for (const forbidden of ['ALTER TABLE', 'UPDATE ', 'DELETE FROM', 'INSERT INTO', 'DROP TABLE', 'CREATE TABLE', 'ANALYZE TABLE']) {
  assertNotContains(precheck.toUpperCase(), forbidden, 'PRECHECK');
}

const explain = read('backend/sql/20260828_FASE_5_EXPLAIN_ANALYZE_V001.sql');
assertContains(explain, 'EXPLAIN ANALYZE', 'EXPLAIN');
assertContains(explain, 'YEAR(p.fecha_visita) = @mg_year', 'EXPLAIN comparativo');
assertContains(explain, 'p.fecha_visita >= @mg_year_start', 'EXPLAIN sargable');

const apply = read('backend/sql/20260828_FASE_5_INDICES_APLICAR_V001.sql');
for (const indexName of [
  'idx_sup_notif_poll',
  'idx_usuario_zop_scope',
  'idx_vp_activo_fecha_id',
  'idx_tickets_equipo_fecha'
]) {
  assertContains(apply, indexName, 'DDL aplicar');
}
assertContains(apply, 'DROP INDEX idx_equipo', 'DDL limpieza tickets');
assertContains(apply, 'DROP INDEX idx_ticket', 'DDL limpieza tickets');

const rollback = read('backend/sql/20260828_FASE_5_INDICES_ROLLBACK_V001.sql');
assertContains(rollback, 'ADD INDEX idx_equipo (codigo_equipo)', 'Rollback tickets');
assertContains(rollback, 'ADD INDEX idx_ticket (ticket)', 'Rollback tickets');

console.log('[OK] Fase 5 SQL/Aiven: validacion estatica completa.');
