'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const validator = require('../backend/scripts/validate-backup-utf8mb4');

function validDump() {
  return `-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
/*!50503 SET NAMES utf8mb4 */;
CREATE TABLE \`notificacion_eventos\` (
  \`codigo_evento\` varchar(120) NOT NULL,
  \`icono_default\` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO \`notificacion_eventos\` VALUES ('PERSONA_ATRAPADA','🚨'),('FALLA_EQUIPO_CRITICO','🆘'),('NUEVO_EQUIPO_CRITICO','💥'),('PERSONA_ATRAPADA_EQUIPO_CRITICO','🚨🆘'),('PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO','🚨💥');
/*!40000 ALTER TABLE \`notificacion_eventos\` ENABLE KEYS */;
-- Dump completed on 2026-08-27 23:59:59
`;
}

test('db.js entrega utf8mb4 realmente a mysql2.createPool y no usa DB_CHARSET', () => {
  const dbPath = path.join(__dirname, '../backend/src/config/db.js');
  const dbSource = fs.readFileSync(dbPath, 'utf8');
  assert.match(dbSource, /charset:\s*['"]utf8mb4['"]/);
  assert.doesNotMatch(dbSource, /DB_CHARSET/);

  const Module = require('node:module');
  const originalLoad = Module._load;
  let capturedConfig = null;
  const fakePool = { query() {}, end() {} };
  const previous = {
    DB_HOST: process.env.DB_HOST,
    DB_PORT: process.env.DB_PORT,
    DB_USER: process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_NAME: process.env.DB_NAME
  };
  Object.assign(process.env, {
    DB_HOST: 'host.test', DB_PORT: '3306', DB_USER: 'user', DB_PASSWORD: 'secret', DB_NAME: 'mydb'
  });

  try {
    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'mysql2/promise') {
        return {
          createPool(config) {
            capturedConfig = config;
            return fakePool;
          }
        };
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[require.resolve(dbPath)];
    const loadedPool = require(dbPath);
    assert.equal(loadedPool, fakePool);
    assert.equal(capturedConfig.charset, 'utf8mb4');
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve(dbPath)];
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('un dump utf8mb4 completo con los cinco iconos criticos pasa', () => {
  const result = validator.validateDumpText(validDump());
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.deepEqual(result.errors, []);
});

test('un dump con SET NAMES utf y emojis sustituidos por ? falla cerrado', () => {
  const broken = validDump()
    .replace('SET NAMES utf8mb4', 'SET NAMES utf')
    .replaceAll('🚨', '?')
    .replaceAll('🆘', '?')
    .replaceAll('💥', '?');
  const result = validator.validateDumpText(broken);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.includes('SET NAMES utf8mb4')));
  assert.ok(result.errors.some((item) => item.includes('PERSONA_ATRAPADA')));
});

test('un dump truncado sin marca final falla cerrado', () => {
  const broken = validDump().replace(/-- Dump completed on[^\n]*\n/, '');
  const result = validator.validateDumpText(broken);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.includes('Dump completed')));
});

test('el validador de archivo rechaza archivos inexistentes y vacios', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mantto-utf8mb4-'));
  const missing = validator.validateDumpFile(path.join(dir, 'no-existe.sql'));
  assert.equal(missing.ok, false);

  const emptyPath = path.join(dir, 'vacio.sql');
  fs.writeFileSync(emptyPath, '');
  const empty = validator.validateDumpFile(emptyPath);
  assert.equal(empty.ok, false);
});

test('script PowerShell obliga mysqldump utf8mb4 y validacion posterior', () => {
  const script = fs.readFileSync(path.join(__dirname, '../backend/scripts/backup-aiven-mysql.ps1'), 'utf8');
  assert.match(script, /--default-character-set=utf8mb4/);
  assert.match(script, /--ssl-mode=REQUIRED/);
  assert.match(script, /--single-transaction/);
  assert.match(script, /--set-gtid-purged=OFF/);
  assert.match(script, /validate-backup-utf8mb4\.js/);
  assert.doesNotMatch(script, /--password=/);
});
