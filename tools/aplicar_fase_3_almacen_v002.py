#!/usr/bin/env python3
"""Integra Fase 3 V002 de Almacén sobre un worktree con Fase 2 V002 aplicada.

No ejecuta SQL, no modifica Aiven, no hace commit ni deploy. Los archivos completos
incluidos en el ZIP deben extraerse conservando carpetas antes de ejecutar.
"""
from pathlib import Path
import re

ROOT = Path.cwd()
REQUIRED = [
    ROOT / 'core' / 'module-loader.js',
    ROOT / 'core' / 'router.js',
    ROOT / 'backend' / 'src' / 'routes' / 'index.js',
    ROOT / 'backend' / 'src' / 'modules' / 'almacen' / 'xlsx-lite.js',
    ROOT / 'backend' / 'src' / 'modules' / 'almacen' / 'almacen.routes.js',
    ROOT / 'backend' / 'src' / 'modules' / 'almacen' / 'almacen.controller.js',
    ROOT / 'backend' / 'src' / 'modules' / 'almacen' / 'almacen.service.js',
    ROOT / 'modules' / 'almacen' / 'almacen.js',
    ROOT / 'modules' / 'almacen' / 'almacen.css',
    ROOT / 'sql' / 'FASE_3_ALMACEN_OPERATIVOS_EXCEL_V002.sql',
]
for path in REQUIRED:
    if not path.exists():
        raise SystemExit(f'ERROR: falta {path.relative_to(ROOT).as_posix()}. Extrae el ZIP conservando carpetas y aplica primero Fase 2 V002.')

loader_path = ROOT / 'core' / 'module-loader.js'
loader = loader_path.read_text(encoding='utf-8')
router = (ROOT / 'core' / 'router.js').read_text(encoding='utf-8')
backend_routes = (ROOT / 'backend' / 'src' / 'routes' / 'index.js').read_text(encoding='utf-8')

if "router.use('/almacen', almacenRoutes);" not in backend_routes:
    raise SystemExit('ERROR: Fase 2 V002 no parece aplicada en backend/src/routes/index.js.')
if 'const ALMACEN_ROUTES = new Set([' not in router or 'function showAlmacen(route)' not in router:
    raise SystemExit('ERROR: Fase 1/Fase 2 de Almacén no parece aplicada en core/router.js.')

TOKEN = '20260830-almacen-fase3-operativos-v002'
pattern = re.compile(r"(\./modules/almacen/almacen\.(?:css|js)\?v=)[^'\"]+")
refs = pattern.findall(loader)
if len(refs) != 12:
    raise SystemExit(f'ERROR: se esperaban 12 referencias CSS/JS de Almacén en module-loader.js y se encontraron {len(refs)}.')
loader_new = pattern.sub(lambda m: m.group(1) + TOKEN, loader)

for route in ('almacen-dashboard','almacen-inventario','almacen-stock','almacen-prestamos','almacen-resguardos','almacen-auditoria'):
    if f"'{route}':" not in loader_new:
        raise SystemExit(f'ERROR: falta ruta {route} en module-loader.js.')

if loader_new == loader:
    print('SIN CAMBIOS: core/module-loader.js ya usa cache-bust de Fase 3 V002.')
else:
    loader_path.write_text(loader_new, encoding='utf-8', newline='\n')
    print('MODIFICADO: core/module-loader.js')

print('FASE 3 ALMACÉN V002 integrada localmente.')
print('IMPORTANTE: ejecuta manualmente sql/FASE_3_ALMACEN_OPERATIVOS_EXCEL_V002.sql en Aiven antes de reiniciar/probar el backend.')
print('Este script NO modificó Aiven, NO realizó commit y NO hizo deploy.')
