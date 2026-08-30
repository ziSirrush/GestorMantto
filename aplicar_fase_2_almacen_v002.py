#!/usr/bin/env python3
"""Aplica Fase 2 V002 de Almacén sobre un worktree donde Fase 1 ya fue aplicada.

No ejecuta SQL ni despliega servicios. Solo integra rutas/caché/contexto en archivos
existentes. Los archivos completos nuevos/reemplazados incluidos en el ZIP deben
extraerse conservando sus rutas antes de ejecutar este script.
"""
from pathlib import Path
import re

ROOT = Path.cwd()

REQUIRED = [
    ROOT / 'index.html',
    ROOT / 'core' / 'module-loader.js',
    ROOT / 'core' / 'router.js',
    ROOT / 'backend' / 'src' / 'routes' / 'index.js',
    ROOT / 'backend' / 'src' / 'modules' / 'almacen' / 'almacen.routes.js',
    ROOT / 'backend' / 'src' / 'modules' / 'almacen' / 'almacen.controller.js',
    ROOT / 'backend' / 'src' / 'modules' / 'almacen' / 'almacen.service.js',
    ROOT / 'backend' / 'src' / 'modules' / 'almacen' / 'xlsx-lite.js',
    ROOT / 'modules' / 'almacen' / 'almacen.js',
    ROOT / 'modules' / 'almacen' / 'almacen.css',
    ROOT / 'sql' / 'FASE_2_ALMACEN_FUENTE_EXCEL_V002.sql',
]

for path in REQUIRED:
    if not path.exists():
        raise SystemExit(f'ERROR: falta {path.relative_to(ROOT).as_posix()}. Extrae el ZIP conservando carpetas.')

index = (ROOT / 'index.html').read_text(encoding='utf-8')
loader_path = ROOT / 'core' / 'module-loader.js'
router_path = ROOT / 'core' / 'router.js'
backend_routes_path = ROOT / 'backend' / 'src' / 'routes' / 'index.js'
loader = loader_path.read_text(encoding='utf-8')
router = router_path.read_text(encoding='utf-8')
backend_routes = backend_routes_path.read_text(encoding='utf-8')

# Fase 1 es prerrequisito real: no recreamos navegación ni views aquí.
markers = [
    'id="view-almacen-dashboard"',
    'id="view-almacen-inventario"',
    'id="view-almacen-stock"',
    'id="view-almacen-prestamos"',
    'id="view-almacen-resguardos"',
    'id="view-almacen-auditoria"',
]
missing = [m for m in markers if m not in index]
if missing:
    raise SystemExit('ERROR: Fase 1 de Almacén no parece aplicada. Faltan views: ' + ', '.join(missing))
if 'const ALMACEN_ROUTES = new Set([' not in router or 'function showAlmacen(route)' not in router:
    raise SystemExit('ERROR: Fase 1 de Almacén no parece aplicada en core/router.js.')

# 1) Cache-bust de las seis rutas Almacén, sin tocar otros módulos.
TOKEN = '20260830-almacen-fase2-excel-v002'
pattern = re.compile(r"(\./modules/almacen/almacen\.(?:css|js)\?v=)[^'\"]+")
matches = pattern.findall(loader)
if len(matches) != 12:
    raise SystemExit(f'ERROR: se esperaban 12 referencias CSS/JS de Almacén en module-loader.js y se encontraron {len(matches)}.')
loader_new = pattern.sub(lambda m: m.group(1) + TOKEN, loader)

# 2) Contexto visual: ya no es una maqueta Pend. Información para Dashboard/Inventario.
old_context = "updateContext(route, 'Gestión de Almacén · estructura visual · Pend. Información');"
new_context = "updateContext(route, 'Gestión de Almacén · fuente temporal Excel · Aiven');"
if new_context not in router:
    if router.count(old_context) != 1:
        raise SystemExit('ERROR: no se encontró de forma única el contexto de Fase 1 en core/router.js.')
    router_new = router.replace(old_context, new_context, 1)
else:
    router_new = router

# 3) Backend central: registrar módulo /api/almacen.
require_line = "const almacenRoutes = require('../modules/almacen/almacen.routes');"
if require_line not in backend_routes:
    anchor = "const logisticaRoutes = require('./logistica.routes');"
    if backend_routes.count(anchor) != 1:
        raise SystemExit('ERROR: no se encontró de forma única el ancla logisticaRoutes en backend/src/routes/index.js.')
    backend_routes = backend_routes.replace(anchor, anchor + '\n' + require_line, 1)

mount_line = "router.use('/almacen', almacenRoutes);"
if mount_line not in backend_routes:
    anchor = "router.use('/logistica', logisticaRoutes);"
    if backend_routes.count(anchor) != 1:
        raise SystemExit('ERROR: no se encontró de forma única el montaje /logistica en backend/src/routes/index.js.')
    backend_routes = backend_routes.replace(anchor, anchor + '\n' + mount_line, 1)

# Validación antes de escribir.
for route in ('almacen-dashboard','almacen-inventario','almacen-stock','almacen-prestamos','almacen-resguardos','almacen-auditoria'):
    if f"'{route}':" not in loader_new:
        raise SystemExit(f'ERROR: module-loader.js no contiene la ruta requerida {route}.')
if backend_routes.count(require_line) != 1 or backend_routes.count(mount_line) != 1:
    raise SystemExit('ERROR: integración backend ambigua; no se escribió ningún archivo.')

changes = [
    (loader_path, loader, loader_new),
    (router_path, router, router_new),
    (backend_routes_path, backend_routes_path.read_text(encoding='utf-8'), backend_routes),
]
for path, old, new in changes:
    if old == new:
        print(f'SIN CAMBIOS: {path.relative_to(ROOT).as_posix()}')
    else:
        path.write_text(new, encoding='utf-8', newline='\n')
        print(f'MODIFICADO: {path.relative_to(ROOT).as_posix()}')

print('FASE 2 ALMACÉN V002 integrada localmente.')
print('IMPORTANTE: este script NO ejecutó sql/FASE_2_ALMACEN_FUENTE_EXCEL_V002.sql, NO modificó Aiven y NO realizó deploy.')
