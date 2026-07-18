const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'server.js',
  'src/app.js',
  'src/bootstrap.js',
  'src/config/db.js',
  'src/routes/index.js',
  'src/modules/health/health.routes.js',
  'src/modules/health/health.controller.js',
  'src/middleware/error.middleware.js'
];

let failed = false;

for (const relativeFile of requiredFiles) {
  const absoluteFile = path.join(root, relativeFile);

  if (!fs.existsSync(absoluteFile)) {
    console.error(`[FALTA] ${relativeFile}`);
    failed = true;
    continue;
  }

  try {
    execFileSync(process.execPath, ['--check', absoluteFile], { stdio: 'pipe' });
    console.log(`[OK] ${relativeFile}`);
  } catch (error) {
    console.error(`[ERROR SINTAXIS] ${relativeFile}`);
    console.error(error.stderr ? error.stderr.toString() : error.message);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log('Estructura base validada correctamente.');
