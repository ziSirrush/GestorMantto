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
  'src/middleware/error.middleware.js',
  'src/middleware/storage-upload.middleware.js',
  'src/services/storage/storage-file-policy.service.js',
  'src/services/storage/storage-contract.service.js',
  'src/services/storage/storage-operations.service.js',
  'src/services/storage/storage-reference.service.js',
  'src/services/storage/storage-access.service.js',
  'src/services/storage/storage-access-handler.service.js',
  'src/services/storage/storage-diagnostics.service.js',
  'src/jobs/storageOperations.job.js',
  'scripts/validate-cffaa-01ef.js',
  'src/modules/pendientes/pendientes-access.service.js',
  'src/modules/pendientes/pendientes-files.service.js',
  'src/modules/pendientes/pendientes.routes.js',
  'src/modules/home/home.repository.js',
  'src/modules/home/home.service.js',
  'src/controllers/data.controller.legacy.js',
  'scripts/validate-cffaa-02.js',
  'src/modules/support/support-files.repository.js',
  'src/modules/support/support-files.service.js',
  'src/controllers/support.controller.js',
  'src/routes/support.routes.js',
  'scripts/validate-cffaa-03.js',
  '../modules/support/support.js',
  '../modules/soporte-solicitudes/soporte-solicitudes.js',
  '../modules/home/home.js',
  'src/modules/ventas-prospeccion/ventas-prospeccion.repository.js',
  'src/modules/ventas-prospeccion/ventas-prospeccion.service.js',
  'src/modules/ventas-prospeccion/ventas-prospeccion.controller.js',
  'src/modules/ventas-prospeccion/ventas-prospeccion.routes.js',
  'scripts/validate-cffaa-04.js',
  '../modules/ventas-prospeccion-detalle/ventas-prospeccion-detalle.js',
  'src/modules/ventas-cotizaciones/ventas-cotizaciones.repository.js',
  'src/modules/ventas-cotizaciones/ventas-cotizaciones.service.js',
  'src/modules/ventas-cotizaciones/ventas-cotizaciones.controller.js',
  'src/modules/ventas-cotizaciones/ventas-cotizaciones.routes.js',
  'scripts/validate-cffaa-05.js',
  '../modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.js',
  '../core/router.js'
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
