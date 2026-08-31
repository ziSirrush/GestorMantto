#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
[Aster | 2026-08-30 | ASTER-MG]
FIX_ALMACEN_INTEGRACION_RUTAS_ENDPOINTS_V002

Aplica, de forma incremental y fail-closed, la integracion que quedo incompleta
entre el panel lateral, router, module-loader y backend de Gestion de Almacen.

NO modifica Aiven.
NO modifica modules/almacen/almacen.js ni almacen.service.js.
NO ejecuta git commit/push.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

FIX_VERSION = "20260830-almacen-integracion-v002"


class FixError(RuntimeError):
    pass


def read_preserving(path: Path):
    raw = path.read_bytes()
    bom = raw.startswith(b"\xef\xbb\xbf")
    if bom:
        raw = raw[3:]
    text = raw.decode("utf-8")
    newline = "\r\n" if "\r\n" in text else "\n"
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    return normalized, newline, bom


def write_preserving(path: Path, text: str, newline: str, bom: bool):
    payload = text.replace("\n", newline).encode("utf-8")
    if bom:
        payload = b"\xef\xbb\xbf" + payload
    path.write_bytes(payload)


def must_file(root: Path, relative: str) -> Path:
    path = root / relative
    if not path.is_file():
        raise FixError(f"Falta archivo requerido: {relative}")
    return path


def replace_exact_once(text: str, old: str, new: str, label: str):
    count_old = text.count(old)
    if count_old == 1:
        return text.replace(old, new, 1), True
    if count_old == 0 and new in text:
        return text, False
    if count_old == 0:
        raise FixError(f"No se encontro anchor para: {label}")
    raise FixError(f"Anchor ambiguo ({count_old} coincidencias) para: {label}")


def regex_replace_once(text: str, pattern: str, repl: str, label: str, flags=0):
    updated, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count == 1:
        return updated, True
    raise FixError(f"No se encontro anchor regex para: {label}")


def patch_index(text: str):
    changed = False

    old_sidebar = """<button class=\"side-item\" data-permission=\"almacen_dashboard\" data-route=\"almacen-dashboard\" type=\"button\"><span>📊</span><b>Dashboard Almacén</b></button>
<button class=\"side-item\" data-permission=\"almacen_inventarios\" data-route=\"almacen-inventarios\" type=\"button\"><span>📋</span><b>Inventarios</b></button>
<button class=\"side-item\" data-permission=\"almacen_movimientos\" data-route=\"almacen-movimientos\" type=\"button\"><span>⇄</span><b>Movimientos Almacén</b></button>"""

    new_sidebar = """<button class=\"side-item\" data-permission=\"almacen_dashboard\" data-route=\"almacen-dashboard\" type=\"button\"><span>📊</span><b>Dashboard Almacén</b></button>
<button class=\"side-item\" data-permission=\"almacen_inventarios\" data-route=\"almacen-inventario\" type=\"button\"><span>📦</span><b>Inventario</b></button>
<button class=\"side-item\" data-permission=\"almacen_stock\" data-route=\"almacen-stock\" type=\"button\"><span>📈</span><b>Stock</b></button>
<button class=\"side-item\" data-permission=\"almacen_prestamos\" data-route=\"almacen-prestamos\" type=\"button\"><span>🔄</span><b>Préstamos</b></button>
<button class=\"side-item\" data-permission=\"almacen_resguardos\" data-route=\"almacen-resguardos\" type=\"button\"><span>🔒</span><b>Resguardos</b></button>
<button class=\"side-item\" data-permission=\"almacen_auditoria\" data-route=\"almacen-auditoria\" type=\"button\"><span>🔍</span><b>Auditoría</b></button>"""

    if new_sidebar not in text:
        text, did = replace_exact_once(text, old_sidebar, new_sidebar, "sidebar Almacen 3 -> 6 modulos")
        changed |= did

    view_ids = [
        "view-almacen-dashboard",
        "view-almacen-inventario",
        "view-almacen-stock",
        "view-almacen-prestamos",
        "view-almacen-resguardos",
        "view-almacen-auditoria",
    ]
    present = [view_id in text for view_id in view_ids]
    if any(present) and not all(present):
        raise FixError("index.html tiene vistas Almacen parcialmente aplicadas. Se detiene para evitar duplicados.")

    if not all(present):
        anchor = '<section aria-label="Movimientos de Portafolio" class="view mov-view" data-view="movimientos" id="view-movimientos"></section>'
        views = """<section aria-label=\"Dashboard Almacén\" class=\"view alm-view\" data-view=\"almacen-dashboard\" id=\"view-almacen-dashboard\"></section>
<section aria-label=\"Inventario de Almacén\" class=\"view alm-view\" data-view=\"almacen-inventario\" id=\"view-almacen-inventario\"></section>
<section aria-label=\"Stock de Almacén\" class=\"view alm-view\" data-view=\"almacen-stock\" id=\"view-almacen-stock\"></section>
<section aria-label=\"Préstamos de Almacén\" class=\"view alm-view\" data-view=\"almacen-prestamos\" id=\"view-almacen-prestamos\"></section>
<section aria-label=\"Resguardos de Almacén\" class=\"view alm-view\" data-view=\"almacen-resguardos\" id=\"view-almacen-resguardos\"></section>
<section aria-label=\"Auditoría de Almacén\" class=\"view alm-view\" data-view=\"almacen-auditoria\" id=\"view-almacen-auditoria\"></section>
""" + anchor
        text, did = replace_exact_once(text, anchor, views, "contenedores view-* de Almacen")
        changed |= did

    # Cache bust de los dos archivos globales que se modifican.
    desired_loader = f'<script src="./core/module-loader.js?v={FIX_VERSION}"></script>'
    if desired_loader not in text:
        text, did = regex_replace_once(
            text,
            r'<script src="\./core/module-loader\.js\?v=[^"]+"></script>',
            desired_loader,
            "cache-bust module-loader.js",
        )
        changed |= did

    desired_router = f'<script src="./core/router.js?v={FIX_VERSION}"></script>'
    if desired_router not in text:
        text, did = regex_replace_once(
            text,
            r'<script src="\./core/router\.js\?v=[^"]+"></script>',
            desired_router,
            "cache-bust router.js",
        )
        changed |= did

    return text, changed


def patch_module_loader(text: str):
    changed = False

    if "const ALMACEN_MODULE_JS" not in text:
        pattern = r"(  const EXPERIMENTAL_SHELL_CSS = [^\n]+;\n)"
        insertion = (
            r"\1"
            + f"  const ALMACEN_MODULE_JS = './modules/almacen/almacen.js?v={FIX_VERSION}';\n"
            + f"  const ALMACEN_MODULE_CSS = './modules/almacen/almacen.css?v={FIX_VERSION}';\n"
        )
        text, did = regex_replace_once(text, pattern, insertion, "constantes lazy-loader Almacen")
        changed |= did

    route_keys = [
        "'almacen-dashboard':",
        "'almacen-inventario':",
        "'almacen-stock':",
        "'almacen-prestamos':",
        "'almacen-resguardos':",
        "'almacen-auditoria':",
    ]
    found = [key in text for key in route_keys]
    if any(found) and not all(found):
        raise FixError("core/module-loader.js tiene rutas Almacen parcialmente aplicadas.")

    if not all(found):
        anchor = "    usuarios:{css:['./modules/usuarios/usuarios.css?v=20260707-v001'],js:['./modules/usuarios/usuarios.js?v=20260707-v001']},"
        block = """    'almacen-dashboard':{css:[ALMACEN_MODULE_CSS],js:[ALMACEN_MODULE_JS]},
    'almacen-inventario':{css:[ALMACEN_MODULE_CSS],js:[ALMACEN_MODULE_JS]},
    'almacen-stock':{css:[ALMACEN_MODULE_CSS],js:[ALMACEN_MODULE_JS]},
    'almacen-prestamos':{css:[ALMACEN_MODULE_CSS],js:[ALMACEN_MODULE_JS]},
    'almacen-resguardos':{css:[ALMACEN_MODULE_CSS],js:[ALMACEN_MODULE_JS]},
    'almacen-auditoria':{css:[ALMACEN_MODULE_CSS],js:[ALMACEN_MODULE_JS]},

""" + anchor
        text, did = replace_exact_once(text, anchor, block, "seis rutas Almacen en module-loader")
        changed |= did

    return text, changed


def patch_router(text: str):
    changed = False

    old_names = "    'almacen-dashboard':'Dashboard Almacén', 'almacen-inventarios':'Inventarios', 'almacen-movimientos':'Movimientos Almacén',"
    new_names = (
        "    'almacen-dashboard':'Dashboard Almacén', 'almacen-inventario':'Inventario', 'almacen-stock':'Stock',\n"
        "    'almacen-prestamos':'Préstamos', 'almacen-resguardos':'Resguardos', 'almacen-auditoria':'Auditoría',"
    )
    if "'almacen-inventario':'Inventario'" not in text:
        text, did = replace_exact_once(text, old_names, new_names, "routeNames Almacen")
        changed |= did

    if "const ALMACEN_ROUTES = new Set" not in text:
        anchor = "  let currentRoute = 'home';"
        block = """  const ALMACEN_ROUTES = new Set([
    'almacen-dashboard',
    'almacen-inventario',
    'almacen-stock',
    'almacen-prestamos',
    'almacen-resguardos',
    'almacen-auditoria'
  ]);

""" + anchor
        text, did = replace_exact_once(text, anchor, block, "ALMACEN_ROUTES")
        changed |= did

    if "function showAlmacen(route)" not in text:
        anchor = "  function showLogisticaDashboard(){"
        fn = """  function showAlmacen(route){
    const view=document.getElementById('view-'+route);
    if(!view) return false;
    activateViewById('view-'+route);
    setActiveSide(route);
    updateContext(route,'Gestión de Almacén · datos reales desde Aiven');
    if(window.ManttoAlmacen && typeof window.ManttoAlmacen.init === 'function'){
      window.ManttoAlmacen.init(route);
    }
    return true;
  }


""" + anchor
        text, did = replace_exact_once(text, anchor, fn, "showAlmacen(route)")
        changed |= did

    dispatcher = "    if(ALMACEN_ROUTES.has(route) && showAlmacen(route)) return;"
    if dispatcher not in text:
        anchor = "    if(route==='logistica-dashboard' && showLogisticaDashboard()) return;"
        text, did = replace_exact_once(text, anchor, dispatcher + "\n" + anchor, "dispatcher Almacen")
        changed |= did

    return text, changed


def patch_backend_index(text: str):
    changed = False

    import_line = "const almacenRoutes = require('../modules/almacen/almacen.routes');"
    if import_line not in text:
        anchor = "const logisticaRoutes = require('./logistica.routes');"
        text, did = replace_exact_once(text, anchor, anchor + "\n" + import_line, "require almacenRoutes")
        changed |= did

    mount_line = "router.use('/almacen', almacenRoutes);"
    if mount_line not in text:
        anchor = "router.use('/logistica', logisticaRoutes);"
        text, did = replace_exact_once(text, anchor, anchor + "\n" + mount_line, "mount /api/almacen")
        changed |= did

    return text, changed


def patch_backend_almacen_routes(text: str):
    changed = False

    old_const = "const OPERATIONS_PERMISSION = 'ALMACEN_MOVIMIENTOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';"
    new_const = """// Stock conserva temporalmente el codigo de permiso legado porque el SQL de migracion
// reutiliza el registro historico de Movimientos. Los demas modulos usan su permiso propio.
const STOCK_PERMISSION = 'ALMACEN_MOVIMIENTOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const LOANS_PERMISSION = 'ALMACEN_PRESTAMOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const GUARDS_PERMISSION = 'ALMACEN_RESGUARDOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const AUDIT_PERMISSION = 'ALMACEN_AUDITORIA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';"""
    if "const LOANS_PERMISSION" not in text:
        text, did = replace_exact_once(text, old_const, new_const, "permisos backend Almacen por modulo")
        changed |= did

    replacements = [
        ("router.get('/stock', ...almacenGuard(OPERATIONS_PERMISSION), controller.stock);",
         "router.get('/stock', ...almacenGuard(STOCK_PERMISSION), controller.stock);",
         "guard Stock"),
        ("router.get('/prestamos/catalogos', ...almacenGuard(OPERATIONS_PERMISSION), controller.loanCatalogs);",
         "router.get('/prestamos/catalogos', ...almacenGuard(LOANS_PERMISSION), controller.loanCatalogs);",
         "guard Prestamos catalogos"),
        ("router.get('/prestamos/resumen', ...almacenGuard(OPERATIONS_PERMISSION), controller.loanSummary);",
         "router.get('/prestamos/resumen', ...almacenGuard(LOANS_PERMISSION), controller.loanSummary);",
         "guard Prestamos resumen"),
        ("router.get('/prestamos', ...almacenGuard(OPERATIONS_PERMISSION), controller.loans);",
         "router.get('/prestamos', ...almacenGuard(LOANS_PERMISSION), controller.loans);",
         "guard Prestamos"),
        ("router.get('/resguardos/catalogos', ...almacenGuard(OPERATIONS_PERMISSION), controller.guardCatalogs);",
         "router.get('/resguardos/catalogos', ...almacenGuard(GUARDS_PERMISSION), controller.guardCatalogs);",
         "guard Resguardos catalogos"),
        ("router.get('/resguardos', ...almacenGuard(OPERATIONS_PERMISSION), controller.guards);",
         "router.get('/resguardos', ...almacenGuard(GUARDS_PERMISSION), controller.guards);",
         "guard Resguardos"),
        ("router.get('/auditoria/catalogos', ...almacenGuard(OPERATIONS_PERMISSION), controller.auditCatalogs);",
         "router.get('/auditoria/catalogos', ...almacenGuard(AUDIT_PERMISSION), controller.auditCatalogs);",
         "guard Auditoria catalogos"),
        ("router.get('/auditoria/muestra', ...almacenGuard(OPERATIONS_PERMISSION), controller.auditSample);",
         "router.get('/auditoria/muestra', ...almacenGuard(AUDIT_PERMISSION), controller.auditSample);",
         "guard Auditoria muestra"),
    ]
    for old, new, label in replacements:
        if new in text:
            continue
        text, did = replace_exact_once(text, old, new, label)
        changed |= did

    if "OPERATIONS_PERMISSION" in text:
        raise FixError("Quedo una referencia OPERATIONS_PERMISSION en almacen.routes.js; se detiene.")

    return text, changed


def validate_final(files: dict[str, str]):
    index = files['index.html']
    loader = files['core/module-loader.js']
    router = files['core/router.js']
    backend_index = files['backend/src/routes/index.js']
    backend_routes = files['backend/src/modules/almacen/almacen.routes.js']

    expected_routes = [
        'almacen-dashboard',
        'almacen-inventario',
        'almacen-stock',
        'almacen-prestamos',
        'almacen-resguardos',
        'almacen-auditoria',
    ]
    for route in expected_routes:
        if f'data-route="{route}"' not in index:
            raise FixError(f"Validacion final: falta boton {route}")
        if f'id="view-{route}"' not in index:
            raise FixError(f"Validacion final: falta view-{route}")
        if f"'{route}':" not in loader:
            raise FixError(f"Validacion final: module-loader no registra {route}")

    if 'almacen-inventarios' in index or 'almacen-movimientos' in index:
        raise FixError("Validacion final: quedaron rutas antiguas de Almacen en index.html")
    if "'almacen-inventarios':'Inventarios'" in router or "'almacen-movimientos':'Movimientos Almacén'" in router:
        raise FixError("Validacion final: quedaron nombres/rutas antiguas en router.js")
    if "function showAlmacen(route)" not in router or "ALMACEN_ROUTES.has(route)" not in router:
        raise FixError("Validacion final: router no despacha Almacen")
    if "const almacenRoutes = require('../modules/almacen/almacen.routes');" not in backend_index:
        raise FixError("Validacion final: backend no importa almacenRoutes")
    if "router.use('/almacen', almacenRoutes);" not in backend_index:
        raise FixError("Validacion final: backend no monta /almacen")
    for permission in ["LOANS_PERMISSION", "GUARDS_PERMISSION", "AUDIT_PERMISSION", "STOCK_PERMISSION"]:
        if permission not in backend_routes:
            raise FixError(f"Validacion final: falta {permission} en backend Almacen")


def node_check(root: Path, relative_files):
    node = shutil.which('node')
    if not node:
        print('[WARN] Node no esta disponible. Se omite node --check.')
        return
    for rel in relative_files:
        path = root / rel
        proc = subprocess.run([node, '--check', str(path)], capture_output=True, text=True)
        if proc.returncode != 0:
            raise FixError(f"node --check fallo en {rel}:\n{proc.stderr.strip()}")
        print(f'[OK] node --check {rel}')


def main():
    root = Path.cwd()
    required = [
        'index.html',
        'core/module-loader.js',
        'core/router.js',
        'backend/src/routes/index.js',
        'backend/src/modules/almacen/almacen.routes.js',
        'modules/almacen/almacen.js',
        'modules/almacen/almacen.css',
    ]
    for rel in required:
        must_file(root, rel)

    patchers = {
        'index.html': patch_index,
        'core/module-loader.js': patch_module_loader,
        'core/router.js': patch_router,
        'backend/src/routes/index.js': patch_backend_index,
        'backend/src/modules/almacen/almacen.routes.js': patch_backend_almacen_routes,
    }

    originals = {}
    metadata = {}
    patched = {}
    changed_files = []

    try:
        for rel, patcher in patchers.items():
            path = must_file(root, rel)
            text, newline, bom = read_preserving(path)
            originals[rel] = text
            metadata[rel] = (newline, bom)
            new_text, changed = patcher(text)
            patched[rel] = new_text
            if changed:
                changed_files.append(rel)

        validate_final(patched)

        # Solo se escribe despues de validar todos los anchors en memoria.
        for rel in changed_files:
            newline, bom = metadata[rel]
            write_preserving(root / rel, patched[rel], newline, bom)

        node_check(root, [
            'core/module-loader.js',
            'core/router.js',
            'backend/src/routes/index.js',
            'backend/src/modules/almacen/almacen.routes.js',
        ])

    except Exception:
        # Si ya se escribio algo y una validacion posterior falla, restaurar.
        for rel in changed_files:
            if rel in originals and rel in metadata:
                newline, bom = metadata[rel]
                try:
                    write_preserving(root / rel, originals[rel], newline, bom)
                except Exception:
                    pass
        raise

    if not changed_files:
        print('FIX ya aplicado. No hubo cambios.')
        return 0

    print('\nFIX aplicado correctamente.')
    print('Archivos modificados:')
    for rel in changed_files:
        print(' - ' + rel)

    print('\nSiguiente validacion recomendada:')
    print('  git diff -- index.html core/module-loader.js core/router.js backend/src/routes/index.js backend/src/modules/almacen/almacen.routes.js')
    print('  npm --prefix backend test   # solo si tu proyecto tiene suite configurada y deseas ejecutarla')
    print('\nDespues reinicia el backend y recarga el frontend sin cache.')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except FixError as exc:
        print(f'ERROR FIX ALMACEN: {exc}', file=sys.stderr)
        raise SystemExit(2)
    except Exception as exc:
        print(f'ERROR NO CONTROLADO: {exc}', file=sys.stderr)
        raise SystemExit(3)
