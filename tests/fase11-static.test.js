'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const helper = require(path.join(root, 'backend/src/services/alcance/united-canonical-zone.service.js'));
const zoneIdSql = helper.ticketZoneIdSql_uni('t');
const zoneCodeSql = helper.ticketZoneCodeSql_uni('t');

assert(zoneIdSql.includes('portafolio'));
assert(zoneIdSql.includes('codigo_equipo'));
assert(zoneIdSql.includes('proyecto_padre'));
assert(zoneIdSql.includes('COUNT(DISTINCT p_cz_pr.zona_id) = 1'));
assert(zoneCodeSql.includes('z_op'));
assert.throws(() => helper.ticketZoneIdSql_uni('t; DROP TABLE tickets'));

const atencion = read('backend/src/modules/experimental-atencion-prioritaria/experimental-atencion-prioritaria.service.js');
assert(atencion.includes("zoneColumnFilterSql_uni(canonicalZoneAlias)"));
assert(atencion.includes("ticketZoneJoinSql_uni"));
assert(atencion.includes('t.zona AS zona_legacy'));
assert(atencion.includes('zoneCodes_gnral(req)'));
assert(!atencion.includes("TRIM(COALESCE(${tableAlias}.zona, '')) = ?"));

const resumen = read('backend/src/modules/experimental-resumen-dia/experimental-resumen-dia.service.js');
assert(resumen.includes("zoneColumnFilterSql_uni(zoneAlias"));
assert(resumen.includes("ticketZoneJoinSql_uni"));
assert(resumen.includes('t.zona AS zona_legacy'));
assert(resumen.includes('zona_id_oficial'));
assert(resumen.includes('alcance:'));

const dashboard = read('backend/src/modules/experimental-dashboard-call-center/experimental-dashboard-call-center.service.js');
assert(dashboard.includes("zoneColumnFilterSql_uni(zoneAlias"));
assert(dashboard.includes("ticketZoneJoinSql_uni"));
assert(dashboard.includes('t.zona AS zona_legacy'));
assert(dashboard.includes('filters:{ zonas }'));
assert(!dashboard.includes("TRIM(COALESCE(t.zona,'')) = ?"));

const entregas = read('backend/src/modules/experimental-entregas-recientes/experimental-entregas-recientes.service.js');
assert(entregas.includes('INNER JOIN z_op z ON z.id_zona = p.zona_id'));
assert(entregas.includes("UPPER(TRIM(COALESCE(z.zona, ''))) = UPPER(TRIM(?))"));
assert(entregas.includes('row.zona_legacy'));
assert(entregas.includes('row.zona=official&&official.zona'));
assert(!entregas.includes("TRIM(COALESCE(p.zona_operativa, '')) = ?"));

console.log('FASE_11_STATIC_SECURITY_ASSERTIONS_OK');
