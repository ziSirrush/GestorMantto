'use strict';

// Audita exclusivamente archivos versionados. Nunca ejecuta SQL ni abre conexiones.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const OBSOLETE_PATHS = Object.freeze([
  'docs/BACKEND_ARQUITECTURA',
  'docs/Fixeos/PROJECT_CONSTITUTION_REFERENCIA.md',
  'backend/scripts/QA_SIMULAR_ACTUALIZACION_TICKET_254540_V001.js',
  'backend/scripts/QA_TICKET_254013_SEGUIMIENTO_ESPECIAL_V002.js',
  'backend/scripts/validate-architecture.js',
  'backend/scripts/test-fase-2-portafolio-cuartos-uni.js',
  'backend/scripts/test-fase-3-tickets-cuartos-uni.js',
  'backend/scripts/test-fase-4-cobertura-total-uni.js'
]);

function normalize(relative) {
  return String(relative || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function listTrackedFiles(root = ROOT) {
  const output = execFileSync('git', ['ls-files', '-z', '--cached'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return output.split('\0').filter(Boolean).map(normalize).filter(relative => {
    // Permite validar la baja física antes de preparar el commit.
    return fs.existsSync(path.join(root, relative));
  });
}

function auditTrackedFiles(files, root = ROOT) {
  const errors = [];
  for (const raw of files) {
    const relative = normalize(raw);
    const lower = relative.toLowerCase();
    const name = path.posix.basename(relative);
    const parts = lower.split('/');
    const absolute = path.join(root, ...relative.split('/'));

    if (OBSOLETE_PATHS.some(obsolete => relative === obsolete || relative.startsWith(obsolete + '/'))) {
      errors.push('Artefacto obsoleto no permitido: ' + relative);
      continue;
    }
    if (fs.existsSync(absolute) && fs.lstatSync(absolute).isSymbolicLink()) {
      errors.push('Enlace no auditado: ' + relative);
      continue;
    }
    if (parts.some(part => /^(?:dist|coverage|installers?)$/i.test(part))) {
      errors.push('Artefacto de build o instalador no permitido: ' + relative);
    }
    if (/\.(?:sql|patch)$/i.test(name)) errors.push('Archivo de entrega no permitido: ' + relative);
    if (/\.(?:zip|tar|tgz)$/i.test(name)) errors.push('Paquete generado no permitido: ' + relative);
    if (/^(?:aplicar[_-]|apply[_-]|instalar[_-]|installer)/i.test(name) && /\.(?:js|cjs|ps1|py)$/i.test(name)) {
      errors.push('Aplicador temporal no permitido: ' + relative);
    }
    if (/\.csv$/i.test(name) && /(?:credencial|credential|password|contrasena|secret|token)/i.test(name)) {
      errors.push('CSV sensible no permitido: ' + relative);
    }
  }
  return [...new Set(errors)];
}

function auditTree(root = ROOT) {
  return auditTrackedFiles(listTrackedFiles(root), root);
}

if (require.main === module) {
  try {
    const errors = auditTree();
    if (errors.length) {
      console.error(errors.join('\n'));
      process.exitCode = 1;
    } else {
      console.log('Árbol Git sin artefactos prohibidos u obsoletos.');
    }
  } catch (error) {
    console.error('No se pudo auditar el árbol Git: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { auditTree, auditTrackedFiles, listTrackedFiles };
