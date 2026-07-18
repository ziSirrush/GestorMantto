const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const srcRoot = path.resolve(__dirname, '..', 'src');
const allowedLegacyConsumers = new Set([
  path.join(srcRoot, 'modules', 'notificaciones', 'notificaciones.routes.js'),
  path.join(srcRoot, 'modules', 'pendientes', 'pendientes.repository.js'),
  path.join(srcRoot, 'modules', 'portafolio', 'portafolio.repository.js'),
  path.join(srcRoot, 'modules', 'tickets', 'tickets.repository.js')
]);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

const jsFiles = walk(srcRoot).filter((file) => file.endsWith('.js'));
const unexpectedLegacyConsumers = [];

for (const file of jsFiles) {
  if (file.includes(`${path.sep}controllers${path.sep}legacy${path.sep}`)) continue;
  if (file === path.join(srcRoot, 'controllers', 'data.controller.js')) continue;

  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('controllers/data.controller') && !allowedLegacyConsumers.has(file)) {
    unexpectedLegacyConsumers.push(path.relative(srcRoot, file));
  }
}

if (unexpectedLegacyConsumers.length) {
  console.error('Referencias legacy no autorizadas:');
  unexpectedLegacyConsumers.forEach((file) => console.error(`- ${file}`));
  process.exitCode = 1;
} else {
  console.log('OK: no existen nuevas referencias no autorizadas a data.controller.js.');
}

const facade = require(path.join(srcRoot, 'controllers', 'data.controller.js'));
const invalidExports = Object.entries(facade).filter(([, value]) => typeof value !== 'function');
if (invalidExports.length) {
  console.error('La fachada contiene exports que no son funciones.');
  process.exitCode = 1;
} else {
  console.log(`OK: fachada legacy validada (${Object.keys(facade).length} handlers).`);
}

require(path.join(srcRoot, 'routes', 'data.routes.js'));
console.log('OK: agregador src/routes/data.routes.js carga correctamente.');
