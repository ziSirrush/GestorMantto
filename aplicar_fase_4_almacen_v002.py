#!/usr/bin/env python3
"""Aplica Fase 4 V002 de Almacén sobre un worktree con Fase 3 V002 instalada.

Solo modifica localmente:
- backend/src/modules/almacen/almacen.routes.js
- backend/src/modules/almacen/almacen.controller.js
- backend/src/modules/almacen/almacen.service.js
- modules/almacen/almacen.js
- modules/almacen/almacen.css
- core/module-loader.js (cache-bust)

No ejecuta SQL, no modifica Aiven, no hace commit y no despliega.
"""
from __future__ import annotations
from pathlib import Path
import re
import shutil
import sys

PACKAGE_DIR = Path(__file__).resolve().parent
OLD_TOKEN = '20260830-almacen-fase3-operativos-v002'
NEW_TOKEN = '20260830-almacen-fase4-auditoria-v002'


def find_repo_root() -> Path:
    candidates = [Path.cwd().resolve(), PACKAGE_DIR.parent.resolve(), PACKAGE_DIR.parent.parent.resolve()]
    for candidate in candidates:
        if (candidate / 'index.html').exists() and (candidate / 'core' / 'router.js').exists() and (candidate / 'core' / 'module-loader.js').exists():
            return candidate
    raise SystemExit('ERROR: no se encontró la raíz de GestorMantto. Extrae esta carpeta dentro del repo o ejecuta el script desde su raíz.')


ROOT = find_repo_root()
LOADER = ROOT / 'core' / 'module-loader.js'
ROUTER = ROOT / 'core' / 'router.js'
BACKEND_INDEX = ROOT / 'backend' / 'src' / 'routes' / 'index.js'
TARGETS = [
    'backend/src/modules/almacen/almacen.routes.js',
    'backend/src/modules/almacen/almacen.controller.js',
    'backend/src/modules/almacen/almacen.service.js',
    'modules/almacen/almacen.js',
    'modules/almacen/almacen.css',
]

for rel in TARGETS:
    source = PACKAGE_DIR / rel
    target = ROOT / rel
    if not source.exists():
        raise SystemExit(f'ERROR: falta archivo del paquete: {rel}')
    if not target.exists():
        raise SystemExit(f'ERROR: falta archivo base en el repo: {rel}. Aplica primero Fase 3 V002.')
for path in (LOADER, ROUTER, BACKEND_INDEX):
    if not path.exists():
        raise SystemExit(f'ERROR: falta {path.relative_to(ROOT).as_posix()}.')

current_front = (ROOT / 'modules/almacen/almacen.js').read_text(encoding='utf-8')
current_service = (ROOT / 'backend/src/modules/almacen/almacen.service.js').read_text(encoding='utf-8')
current_routes = (ROOT / 'backend/src/modules/almacen/almacen.routes.js').read_text(encoding='utf-8')
router = ROUTER.read_text(encoding='utf-8')
backend_index = BACKEND_INDEX.read_text(encoding='utf-8')
loader = LOADER.read_text(encoding='utf-8')

already_f4 = "view.dataset.almacenReady='4-v002';" in current_front and 'getAuditSample' in current_service
if not already_f4:
    required = [
        ("view.dataset.almacenReady='3-v002';", current_front, 'frontend Fase 3 V002'),
        ('async function getGuards(query)', current_service, 'service Fase 3 V002'),
        ("router.get('/resguardos'", current_routes, 'routes Fase 3 V002'),
        ('const ALMACEN_ROUTES = new Set([', router, 'router Almacén'),
        ('function showAlmacen(route)', router, 'router Almacén'),
        ("router.use('/almacen', almacenRoutes);", backend_index, 'montaje backend /api/almacen'),
    ]
    missing = [label for marker,text,label in required if marker not in text]
    if missing:
        print('ERROR: Fase 3 V002 no parece aplicada. Faltan marcadores:')
        for label in missing: print('  -', label)
        sys.exit(1)

pattern = re.compile(r"(\./modules/almacen/almacen\.(?:css|js)\?v=)([^'\"]+)")
matches = list(pattern.finditer(loader))
if len(matches) != 12:
    raise SystemExit(f'ERROR: se esperaban 12 referencias CSS/JS de Almacén en core/module-loader.js y se encontraron {len(matches)}.')
versions = {match.group(2) for match in matches}
if versions not in ({OLD_TOKEN}, {NEW_TOKEN}):
    raise SystemExit('ERROR: cache-bust de Almacén no corresponde a Fase 3 V002 ni a esta Fase 4 V002: ' + ', '.join(sorted(versions)))
for route in ('almacen-dashboard','almacen-inventario','almacen-stock','almacen-prestamos','almacen-resguardos','almacen-auditoria'):
    if f"'{route}':" not in loader:
        raise SystemExit(f'ERROR: falta ruta {route} en core/module-loader.js.')

loader_new = pattern.sub(lambda match: match.group(1) + NEW_TOKEN, loader)

# Todas las validaciones terminan antes de escribir el worktree.
for rel in TARGETS:
    target = ROOT / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(PACKAGE_DIR / rel, target)
    print('MODIFICADO:', rel)
if loader_new != loader:
    LOADER.write_text(loader_new, encoding='utf-8', newline='\n')
    print('MODIFICADO: core/module-loader.js (12 referencias -> Fase 4 V002)')
else:
    print('SIN CAMBIOS: core/module-loader.js ya usa Fase 4 V002.')

print('FASE 4 ALMACÉN V002 integrada localmente.')
print('Auditoría: consulta lote INVENTARIO activo, genera muestra y contrasta en memoria.')
print('NO hay SQL de Fase 4, NO se guarda histórico y NO se escribe en almacen_fuente_excel.')
print('Este script NO modificó Aiven, NO realizó commit y NO hizo deploy.')
