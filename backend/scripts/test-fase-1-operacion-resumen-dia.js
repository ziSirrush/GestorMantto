'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const front = read('modules/resumen-dia/resumen-dia.js');
const routes = read('backend/src/routes/data/resumen-dia.routes.js');
const dataRoutes = read('backend/src/routes/data.routes.js');
const repo = read('backend/src/modules/resumen-dia/resumen-dia.repository.js');
const service = read('backend/src/modules/resumen-dia/resumen-dia.service.js');

assert(front.includes("/api/operacion/resumen-dia/inicial"), 'Frontend no usa la carga inicial dedicada.');
assert(!front.includes('/api/tickets?limit=5000'), 'Frontend aun carga tickets globales.');
assert(!front.includes('/api/portafolio?limit=5000'), 'Frontend aun carga portafolio global.');
assert(!/function\s+fetchTickets\s*\(/.test(front), 'Sigue existiendo fetchTickets como carga base.');
assert(!/function\s+fetchPortafolio\s*\(/.test(front), 'Sigue existiendo fetchPortafolio como carga base.');
assert(front.includes('zon: nrm(row.zona_oficial), asu:'), 'Ticket no usa exclusivamente zona_oficial.');
assert((front.match(/zon: nrm\(row\.zona_oficial\)/g) || []).length >= 2, 'Ticket/Portafolio no usan exclusivamente zona_oficial.');

const initialCall = front.indexOf('const initial = await fetchResumenInicial()');
const criticalCall = front.indexOf('fetchCriticidadUsuario()', initialCall);
assert(initialCall >= 0 && criticalCall > initialCall, 'La primera carga territorial debe ocurrir antes de criticidad.');

assert(routes.includes("groupingCodesAny: ['OPERACION']"), 'Guard no esta fijado a la puerta OPERACION.');
assert(routes.includes("domain: 'UNITED'"), 'Guard no esta fijado al dominio UNITED.');
assert(routes.includes("'/operacion/resumen-dia/inicial'"), 'Ruta inicial no registrada.');
assert(routes.includes('OPERACION_RESUMEN_DEL_DIA_TICKET_PERIODO_TICKETS_DEL_PERIODO.VER'), 'Falta permiso real de lectura del periodo.');
assert(dataRoutes.includes("require('./data/resumen-dia.routes')"), 'data.routes no monta Resumen del Dia.');

assert(repo.includes('buildPortafolioScopeSql_gnral'), 'Repositorio no aplica scope Portafolio.');
assert(repo.includes('buildTicketScopeSql_gnral'), 'Repositorio no aplica scope Tickets.');
assert(repo.includes('INNER JOIN z_op z_rd'), 'Portafolio no resuelve zona oficial en z_op.');
assert(repo.includes('z_rd.zona AS zona_oficial'), 'Portafolio no devuelve zona oficial.');
assert(repo.includes('z_equipo_rd.zona'), 'Tickets por equipo no resuelven zona oficial en z_op.');
assert(repo.includes('p_equipo_rd.zona_id'), 'Tickets por equipo no derivan zona_id desde Portafolio.');
assert(repo.includes('zona_operativa: row.zona_oficial || null'), 'Payload Portafolio no canoniza zona_operativa.');
assert(repo.includes('zona: row.zona_oficial || null'), 'Payload no canoniza la zona oficial.');
assert(!/t\.zona\s+IN|UPPER\s*\(\s*TRIM\s*\(\s*t\.zona/.test(repo), 'tickets.zona se esta usando como autoridad de seguridad.');

assert(service.includes('access?.zona_ids'), 'Servicio no conserva zona_ids resueltos por usuario_zop.');
assert(service.includes("access.dominio !== 'UNITED'"), 'Servicio no valida alcance UNITED.');
assert(service.includes('access.requiere_filtro_zona !== true'), 'Servicio no falla cerrado sin filtro de zona.');

console.log('FASE_1_11_OPERACION_RESUMEN_DIA_CUARTOS_V001: OK');
