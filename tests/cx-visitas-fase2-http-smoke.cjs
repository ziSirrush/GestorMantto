'use strict';

// [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 2 V001]
// Smoke HTTP de SOLO LECTURA. No escribe visitas, no imprime el token ni PII.
// Uso: BLT_API_BASE=https://api.ejemplo BLT_CX_VISITAS_TEST_TOKEN=... node tests/cx-visitas-fase2-http-smoke.cjs
// Ejecutar UNICAMENTE despues de validar/aplicar Fase 1 y habilitar CX_VISITAS_API_ENABLED=true.

const assert = require('node:assert/strict');

const base = String(process.env.BLT_API_BASE || '').trim().replace(/\/+$/, '');
const token = String(process.env.BLT_CX_VISITAS_TEST_TOKEN || '').trim();
if (!/^https:\/\/[^/]+/.test(base) && !/^http:\/\/localhost(?::\d+)?$/.test(base)) {
  console.error('BLT_API_BASE debe ser HTTPS (o localhost para pruebas).');
  process.exit(2);
}
if (!token) {
  console.error('Definir BLT_CX_VISITAS_TEST_TOKEN para un usuario autorizado de pruebas.');
  process.exit(2);
}

async function run() {
  const target = `${base}/api/customer-experience/visitas?page=1&page_size=1`;
  const anonymous = await fetch(target, { headers: { Accept: 'application/json' } });
  assert.ok([401, 403].includes(anonymous.status),
    `La lectura sin autenticar debe dar 401/403; recibio ${anonymous.status}. ¿Esta habilitada la API?`);

  const authenticated = await fetch(target, {
    headers: { Accept:'application/json', Authorization:`Bearer ${token}` }
  });
  if (authenticated.status !== 200) {
    console.error(`Lectura con token: HTTP ${authenticated.status}. Verifica usuario, permisos, alcance, Fase 1 y feature flag.`);
    process.exitCode = 1;
    return;
  }
  const body = await authenticated.json();
  assert.equal(body.ok, true);
  assert.equal(body.source, 'aiven');
  assert.equal(body.page, 1);
  assert.equal(body.page_size, 1);
  assert.ok(Array.isArray(body.visitas));
  assert.ok(Number.isInteger(body.total) && body.total >= 0);
  console.log('PASS CX Visitas GET protegido, paginado y sin fugas anonimas.');
  console.log('Registros visibles (solo total):', body.total);
}

run().catch(error => {
  console.error('FAIL CX Visitas HTTP smoke:', error.message);
  process.exitCode = 1;
});
