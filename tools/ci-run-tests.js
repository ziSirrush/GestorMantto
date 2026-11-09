'use strict';
// BLT NOW CI selectivo. Sin dependencias externas ni acceso a servicios productivos.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');

function references(source) {
  // Detectar rutas de código, no menciones genéricas a "frontend" o "backend".
  const frontend = /['"`](?:\.\.?\/)*(?:core|modules|styles|assets)\//.test(source)
    || /['"`](?:index\.html|service-worker\.js|manifest(?:-github)?\.json|_redirects)['"`]/.test(source)
    || /path\.(?:join|resolve)\([^\n]{0,170}['"`](?:core|modules|styles|assets|index\.html|service-worker\.js)['"`]/.test(source);
  const backend = /['"`](?:\.\.?\/)*backend(?:\/|['"`])/.test(source)
    || /path\.(?:join|resolve)\([^\n]{0,170}['"`]backend['"`]/.test(source);
  return { frontend, backend };
}

function testTargets(scope) {
  if (scope !== 'frontend' && scope !== 'backend') {
    throw new Error('Uso: node tools/ci-run-tests.js frontend|backend [--list]');
  }
  const targets = [];
  function collect(relativeDir, defaultScope) {
    const absolute = path.join(ROOT, relativeDir);
    for (const filename of fs.readdirSync(absolute).sort()) {
      if (!/\.test\.(?:js|cjs)$/.test(filename)) continue;
      const relative = path.posix.join(relativeDir, filename);
      const source = fs.readFileSync(path.join(absolute, filename), 'utf8');
      const refs = references(source);
      const include = relativeDir === 'backend/tests'
        ? scope === 'backend'
        : scope === 'frontend'
          ? refs.frontend || (defaultScope === 'shared' && !refs.backend)
          : refs.backend || (defaultScope !== 'frontend' && !refs.frontend);
      if (include) targets.push(relative);
    }
  }
  collect('tests', 'shared');
  collect('validation', 'backend');
  if (scope === 'backend') collect('backend/tests', 'backend');
  if (!targets.length) throw new Error('No se detectaron pruebas para: ' + scope);
  return targets;
}

function run(scope, listOnly = false) {
  const selected = testTargets(scope);
  console.log('[CI ' + scope + '] ' + selected.length + ' archivos de pruebas seleccionados.');
  if (listOnly) {
    selected.forEach(file => console.log(file));
    return 0;
  }
  // Conservamos cwd=backend como en npm test original: evita romper pruebas legacy.
  const args = ['--test', '--test-concurrency=4',
    ...selected.map(file => path.join(ROOT, file))];
  const child = spawnSync(process.execPath, args, { cwd: BACKEND, stdio: 'inherit' });
  if (child.error) throw child.error;
  return typeof child.status === 'number' ? child.status : 1;
}

if (require.main === module) {
  try {
    process.exitCode = run(process.argv[2], process.argv.includes('--list'));
  } catch (error) {
    console.error('[CI tests] ' + error.message);
    process.exitCode = 1;
  }
}
module.exports = { references, testTargets, run };
