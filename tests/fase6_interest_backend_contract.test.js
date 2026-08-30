'use strict';
const fs=require('fs');
const path=require('path');
const assert=require('assert');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const repo=read('backend/src/modules/ventas-cotizaciones/ventas-cotizaciones-interes.repository.js');
const service=read('backend/src/modules/ventas-cotizaciones/ventas-cotizaciones-interes.service.js');
const controller=read('backend/src/modules/ventas-cotizaciones/ventas-cotizaciones-interes.controller.js');
const routes=read('backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.routes.js');

assert(repo.includes("const INTEREST_ON = 'PROYECTO_INTERES_ACTIVADO'"));
assert(repo.includes("const INTEREST_OFF = 'PROYECTO_INTERES_DESACTIVADO'"));
assert(repo.includes('MAX(ui_latest.id_interaccion) AS id_interaccion'));
assert(repo.includes('ui_latest.id_usuario = ?'));
assert(repo.includes('q.activo = 1'));
assert(repo.includes("ui.tipo_interaccion = ?"));
assert(repo.includes("scope.mode === 'ALL'"));
assert(repo.includes('id_asesor IN'));
assert(repo.includes('id_admin IN'));
assert(repo.includes('ORDER BY ui.created_at DESC, ui.id_interaccion DESC, q.id_cotizacion DESC'));
assert(service.includes('Math.min(30'));
assert(service.includes('resolveVisibilityScope(connection, actionContext)'));
assert(service.includes('idUsuario'));
assert(controller.includes('listProjectInterests'));

const staticRoute=routes.indexOf("router.get('/cotizaciones/proyectos-interes'");
const genericIdRoute=routes.indexOf("router.get('/cotizaciones/:id'");
assert(staticRoute>=0,'Falta ruta proyectos-interes');
assert(genericIdRoute>=0,'Falta ruta genérica de cotización');
assert(staticRoute<genericIdRoute,'La ruta estática debe declararse antes de /:id');
assert(routes.includes("VENTAS_COTIZACIONES_TABLA_COTIZACIONES_LISTADO_COTIZACIONES.VER"));
console.log('OK fase6_interest_backend_contract');
