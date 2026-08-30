'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const responsive = fs.readFileSync(path.join(root, 'styles/responsive-contract.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'modules/ventas-dashboard/ventas-dashboard.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'modules/ventas-dashboard/ventas-dashboard.css'), 'utf8');
const apply = fs.readFileSync(path.join(root, 'APLICAR_FASE_1_RESPONSIVE_GLOBAL.ps1'), 'utf8');

assert(responsive.includes('overflow-x:hidden'), 'El contrato debe impedir scroll horizontal global de la view.');
assert(responsive.includes('touch-action:pan-x pan-y'), 'Debe conservar desplazamiento tactil sin pellizco.');
assert(!/\.view\s+table\s*\{/i.test(responsive), 'El contrato global no debe comprimir tablas.');
assert(!/transform\s*:\s*scale\s*\(/i.test(responsive), 'No se permite escalar la app para hacerla caber.');
assert(!/\bzoom\s*:/i.test(responsive), 'No se permite CSS zoom.');

const headStart = html.indexOf('<section class="vd-card vd-head">');
const controlsStart = html.indexOf('<section class="vd-card vd-controls"');
const pdfPos = html.indexOf('id="vd-pdf-general-wrap"');
assert(headStart >= 0 && controlsStart > headStart, 'No se encontro estructura Dashboard esperada.');
assert(pdfPos > headStart && pdfPos < controlsStart, 'El PDF debe estar en el encabezado, antes de filtros.');

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
assert.strictEqual(ids.length, new Set(ids).size, 'El HTML contiene IDs duplicados.');

assert(/\.vd-table-wrap\s*\{[\s\S]*?overflow-x\s*:\s*auto/i.test(css), 'Las tablas Dashboard deben mantener scroll horizontal local.');
assert(/\.vd-controls\s*\{[\s\S]*?grid-template-columns:[^;]+;/i.test(css), 'Los filtros deben conservar grid responsive.');
assert(css.includes('.vd-head-actions'), 'Falta el contenedor de acciones del encabezado.');
assert(css.includes('@media(max-width:520px)'), 'Falta cierre responsive movil.');

assert(apply.includes('styles/responsive-contract.css?v=20260831-fase1-responsive-global-v001'), 'El aplicador debe registrar el contrato global.');
assert(apply.includes("const TEMPLATE_VERSION = '20260831-fase1-responsive-global-v001';"), 'El aplicador debe actualizar TEMPLATE_VERSION.');
assert(apply.includes('ventas-dashboard.css?v=20260831-fase1-responsive-global-v001'), 'El aplicador debe actualizar cache-bust CSS.');

console.log('OK fase1_responsive_contract');
