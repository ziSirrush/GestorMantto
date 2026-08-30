'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(rel){ return fs.readFileSync(path.join(root, rel), 'utf8'); }
function assert(condition, message){ if(!condition) throw new Error(message); }

const routes = read('backend/src/modules/almacen/almacen.routes.js');
const service = read('backend/src/modules/almacen/almacen.service.js');
const frontend = read('modules/almacen/almacen.js');
const css = read('modules/almacen/almacen.css');
const sql = read('sql/FASE_2_ALMACEN_FUENTE_EXCEL_V002.sql');
const apply = read('aplicar_fase_2_almacen_v002.py');

[
  "router.get('/dashboard'",
  "router.get('/inventario'",
  "router.get('/inventario/catalogos'",
  "router.get('/inventario/empresa'",
  "router.get('/inventario/almacenes'",
  "router.get('/inventario/top'",
  "router.post('/importaciones/validar'",
  "router.post('/importaciones'"
].forEach(token => assert(routes.includes(token), 'Falta endpoint: ' + token));
assert(routes.includes('ALMACEN_DASHBOARD_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'), 'Falta permiso Dashboard');
assert(routes.includes('ALMACEN_INVENTARIOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'), 'Falta permiso Inventario');
assert(routes.includes("domain: 'CORELLIAN'"), 'Falta dominio Corellian');
assert(routes.includes("groupingCodesAny: ['ALMACEN']"), 'Falta agrupación Almacén');
assert(service.includes("roles_usuario.codigo IN ('PROGRAMADOR','PROGRAMADOR_CORELLIAN')"), 'Carga Excel no restringida a roles autorizados');
assert(service.includes('await conn.beginTransaction()'), 'Importación no transaccional');
assert(service.includes('await conn.rollback()'), 'Falta rollback');
assert(service.includes('SET activo = 0 WHERE activo = 1'), 'No se conserva/desactiva lote anterior');
assert(service.includes('SET activo = 1 WHERE lote_importacion = ?'), 'No se activa nuevo lote');
assert(service.includes('const MAX_ROWS = 100000'), 'Falta límite de filas');

const creates = (sql.match(/CREATE TABLE IF NOT EXISTS/gi) || []).length;
assert(creates === 1, 'La fase debe crear exactamente una tabla; encontrados ' + creates);
assert(sql.includes('CREATE TABLE IF NOT EXISTS almacen_fuente_excel'), 'Tabla temporal incorrecta');
assert(!/\bDROP\s+TABLE\b/i.test(sql), 'SQL contiene DROP TABLE');
assert(sql.includes('lote_importacion'), 'Falta lote_importacion');
assert(sql.includes('raw_json JSON NOT NULL'), 'Falta raw_json');

assert(frontend.includes("pageSize:30"), 'Inventario no fija paginado 30');
assert(frontend.includes('/api/almacen/dashboard'), 'Frontend no consume Dashboard real');
assert(frontend.includes('/api/almacen/importaciones/validar'), 'Frontend no valida Excel');
assert(frontend.includes('/api/almacen/importaciones'), 'Frontend no importa Excel');
assert(!frontend.includes('localStorage'), 'Frontend usa localStorage');
assert(!frontend.includes('sessionStorage'), 'Frontend usa sessionStorage');
assert(!frontend.includes('window.XLSX') && !frontend.includes('XLSX.read'), 'Frontend intenta parsear Excel');
assert(frontend.includes('Más movidos') && frontend.includes('requiere movimientos históricos/BG'), 'No se documenta limitación de movimientos');

assert(css.includes('.alm-shell{width:100%;max-width:none;min-width:0'), 'Shell Almacén no es full-width responsive');
assert(css.includes('.alm-table-wrap{max-width:100%;min-width:0;overflow-x:auto!important'), 'Tablas no conservan scroll horizontal local');
assert(!/transform\s*:\s*scale\s*\(/i.test(css), 'CSS contiene transform:scale');
assert(!/(^|[;{])\s*zoom\s*:/im.test(css), 'CSS contiene zoom');
assert(apply.includes("router.use('/almacen', almacenRoutes);"), 'Aplicador no integra backend /almacen');
assert(apply.includes('20260830-almacen-fase2-excel-v002'), 'Aplicador no actualiza cache-bust');

console.log('PASS fase2_almacen_v002_static');
