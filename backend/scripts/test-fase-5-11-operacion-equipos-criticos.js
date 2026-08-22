'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const servicePath = path.join(root, 'src/modules/criticos/criticos-cuartos-operacion.service.js');
const controllerPath = path.join(root, 'src/modules/criticos/criticos.controller.js');

const service = fs.readFileSync(servicePath, 'utf8');
const controller = fs.readFileSync(controllerPath, 'utf8');

const checks = [
  ['scope por portafolio', service.includes('buildPortafolioScopeSqlInline_gnral')],
  ['zona canonica z_op', service.includes('INNER JOIN z_op') && service.includes('z.zona AS zona')],
  ['metadatos de cuartos', service.includes('zoneIds_gnral') && service.includes('zoneCodes_gnral')],
  ['no usa tickets.zona para mostrar', !service.includes('COALESCE(t.zona, p.zona_operativa) AS zona')],
  ['filtro zona usa z_op', service.includes('`${zoneAlias}.zona LIKE ?`')],
  ['equipos criticos delegado', controller.includes('criticosCuartosOperacionService.getEquiposCriticos')],
  ['proyectos criticos delegado', controller.includes('criticosCuartosOperacionService.getProyectosCriticos')],
  ['criticidad corporativa delegada', controller.includes('criticosCuartosOperacionService.getCriticidadCorporativa')],
  ['call center conserva alcance estructurado', controller.includes('callcenterCuartosOperacionService.getCallCenterU365Equipos')]
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) {
  console.log(`${ok ? 'OK' : 'FAIL'} - ${name}`);
}

if (failed.length) process.exit(1);
console.log('FASE_5_11_OPERACION_EQUIPOS_CRITICOS_CUARTOS_V001: OK');
