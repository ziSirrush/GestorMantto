#!/usr/bin/env python3
"""Aplica Fase 1 de Almacén sobre un worktree actual de GestorMantto.

Uso desde la raíz del repo:
    python aplicar_fase_1_almacen.py

El script solo modifica:
- index.html
- core/module-loader.js
- core/router.js

Los archivos nuevos modules/almacen/almacen.js y almacen.css deben existir en el
worktree (este ZIP los incluye en su ruta final).
"""

from pathlib import Path

ROOT = Path.cwd()


def require_file(path: Path) -> str:
    if not path.exists():
        raise SystemExit(f'ERROR: no existe {path.as_posix()}')
    return path.read_text(encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str, already_marker: str) -> tuple[str, bool]:
    if new in text or already_marker in text:
        print(f'OK: {label} ya estaba aplicado.')
        return text, False
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'ERROR: {label}: se esperaba 1 coincidencia del bloque original y se encontraron {count}. No se modificó el repo.')
    return text.replace(old, new, 1), True


index_path = ROOT / 'index.html'
loader_path = ROOT / 'core' / 'module-loader.js'
router_path = ROOT / 'core' / 'router.js'
new_js = ROOT / 'modules' / 'almacen' / 'almacen.js'
new_css = ROOT / 'modules' / 'almacen' / 'almacen.css'

for needed in (new_js, new_css):
    if not needed.exists():
        raise SystemExit(f'ERROR: falta el archivo nuevo {needed.as_posix()}. Extrae el ZIP conservando carpetas antes de aplicar.')

index = require_file(index_path)
loader = require_file(loader_path)
router = require_file(router_path)

# -----------------------------------------------------------------------------
# index.html - sidebar Almacén: 3 accesos legacy -> 6 módulos consolidados.
# No se crean permisos de BD. Fase 1 reutiliza temporalmente los permisos
# existentes: dashboard, inventarios y movimientos.
# -----------------------------------------------------------------------------
old_sidebar = '''<section class="side-group" data-group="almacen">
<button aria-controls="side-group-almacen" aria-expanded="false" class="side-group-toggle" type="button">
<span class="side-group-icon">📦</span><b>Almacén</b><i>⌄</i>
</button>
<div class="side-group-items" id="side-group-almacen">
<button class="side-item" data-permission="almacen_dashboard" data-route="almacen-dashboard" type="button"><span>📊</span><b>Dashboard Almacén</b></button>
<button class="side-item" data-permission="almacen_inventarios" data-route="almacen-inventarios" type="button"><span>📋</span><b>Inventarios</b></button>
<button class="side-item" data-permission="almacen_movimientos" data-route="almacen-movimientos" type="button"><span>⇄</span><b>Movimientos Almacén</b></button>
</div>
</section>'''

new_sidebar = '''<section class="side-group" data-group="almacen">
<button aria-controls="side-group-almacen" aria-expanded="false" class="side-group-toggle" type="button">
<span class="side-group-icon">📦</span><b>Almacén</b><i>⌄</i>
</button>
<div class="side-group-items" id="side-group-almacen">
<button class="side-item" data-permission="almacen_dashboard" data-route="almacen-dashboard" type="button"><span>📊</span><b>Dashboard</b></button>
<button class="side-item" data-permission="almacen_inventarios" data-route="almacen-inventario" type="button"><span>📦</span><b>Inventario</b></button>
<button class="side-item" data-permission="almacen_movimientos" data-route="almacen-stock" type="button"><span>📈</span><b>Stock</b></button>
<button class="side-item" data-permission="almacen_movimientos" data-route="almacen-prestamos" type="button"><span>🔄</span><b>Préstamos</b></button>
<button class="side-item" data-permission="almacen_movimientos" data-route="almacen-resguardos" type="button"><span>🔒</span><b>Resguardos</b></button>
<button class="side-item" data-permission="almacen_movimientos" data-route="almacen-auditoria" type="button"><span>🔍</span><b>Auditoría</b></button>
</div>
</section>'''

index, changed_sidebar = replace_once(
    index, old_sidebar, new_sidebar,
    'index.html / navegación Almacén',
    'data-route="almacen-auditoria"'
)

# index.html - contenedores reales para lazy routes.
old_views_anchor = '''<section aria-label="Panel de Control" class="view pc-view" data-view="panel-control" id="view-panel-control"></section>
<section aria-label="Proyectos" class="view proy-view" data-view="proyectos" id="view-proyectos"></section>'''

new_views_anchor = '''<section aria-label="Panel de Control" class="view pc-view" data-view="panel-control" id="view-panel-control"></section>
<section aria-label="Dashboard Almacén" class="view alm-view" data-view="almacen-dashboard" id="view-almacen-dashboard"></section>
<section aria-label="Inventario" class="view alm-view" data-view="almacen-inventario" id="view-almacen-inventario"></section>
<section aria-label="Stock" class="view alm-view" data-view="almacen-stock" id="view-almacen-stock"></section>
<section aria-label="Préstamos" class="view alm-view" data-view="almacen-prestamos" id="view-almacen-prestamos"></section>
<section aria-label="Resguardos" class="view alm-view" data-view="almacen-resguardos" id="view-almacen-resguardos"></section>
<section aria-label="Auditoría" class="view alm-view" data-view="almacen-auditoria" id="view-almacen-auditoria"></section>
<section aria-label="Proyectos" class="view proy-view" data-view="proyectos" id="view-proyectos"></section>'''

index, changed_views = replace_once(
    index, old_views_anchor, new_views_anchor,
    'index.html / contenedores Almacén',
    'id="view-almacen-auditoria"'
)

# -----------------------------------------------------------------------------
# module-loader.js - lazy load para las 6 rutas, reutilizando un solo módulo.
# -----------------------------------------------------------------------------
old_loader_anchor = '''    'logistica-dashboard':{css:['./modules/dashboard-logistica/dashboard-logistica.css?v=20260710-v003'],js:['./modules/dashboard-logistica/dashboard-logistica.js?v=20260710-v003']},
    'logistica-reporte':{css:['./modules/reporte-logistica/reporte-logistica.css?v=20260711-v004'],js:['./modules/reporte-logistica/reporte-logistica.js?v=20260711-v004']},

    'instalaciones-dashboard':{css:['./modules/instalaciones-dashboard/instalaciones-dashboard_cor.css?v=20260821-paginador-centrado-v003'],js:['./modules/instalaciones-dashboard/instalaciones-dashboard_cor.js?v=20260819-dashboard-modo-junta-orden-v002']},'''

new_loader_anchor = '''    'logistica-dashboard':{css:['./modules/dashboard-logistica/dashboard-logistica.css?v=20260710-v003'],js:['./modules/dashboard-logistica/dashboard-logistica.js?v=20260710-v003']},
    'logistica-reporte':{css:['./modules/reporte-logistica/reporte-logistica.css?v=20260711-v004'],js:['./modules/reporte-logistica/reporte-logistica.js?v=20260711-v004']},

    'almacen-dashboard':{css:['./modules/almacen/almacen.css?v=20260828-almacen-fase1-v001'],js:['./modules/almacen/almacen.js?v=20260828-almacen-fase1-v001']},
    'almacen-inventario':{css:['./modules/almacen/almacen.css?v=20260828-almacen-fase1-v001'],js:['./modules/almacen/almacen.js?v=20260828-almacen-fase1-v001']},
    'almacen-stock':{css:['./modules/almacen/almacen.css?v=20260828-almacen-fase1-v001'],js:['./modules/almacen/almacen.js?v=20260828-almacen-fase1-v001']},
    'almacen-prestamos':{css:['./modules/almacen/almacen.css?v=20260828-almacen-fase1-v001'],js:['./modules/almacen/almacen.js?v=20260828-almacen-fase1-v001']},
    'almacen-resguardos':{css:['./modules/almacen/almacen.css?v=20260828-almacen-fase1-v001'],js:['./modules/almacen/almacen.js?v=20260828-almacen-fase1-v001']},
    'almacen-auditoria':{css:['./modules/almacen/almacen.css?v=20260828-almacen-fase1-v001'],js:['./modules/almacen/almacen.js?v=20260828-almacen-fase1-v001']},

    'instalaciones-dashboard':{css:['./modules/instalaciones-dashboard/instalaciones-dashboard_cor.css?v=20260821-paginador-centrado-v003'],js:['./modules/instalaciones-dashboard/instalaciones-dashboard_cor.js?v=20260819-dashboard-modo-junta-orden-v002']},'''

loader, changed_loader = replace_once(
    loader, old_loader_anchor, new_loader_anchor,
    'core/module-loader.js / lazy routes Almacén',
    "'almacen-auditoria':{css:['./modules/almacen/almacen.css"
)

# -----------------------------------------------------------------------------
# router.js - nombres, set de rutas y renderer específico.
# -----------------------------------------------------------------------------
old_route_names = "    'almacen-dashboard':'Dashboard Almacén', 'almacen-inventarios':'Inventarios', 'almacen-movimientos':'Movimientos Almacén',"
new_route_names = "    'almacen-dashboard':'Dashboard Almacén', 'almacen-inventario':'Inventario', 'almacen-stock':'Stock', 'almacen-prestamos':'Préstamos', 'almacen-resguardos':'Resguardos', 'almacen-auditoria':'Auditoría',"

router, changed_names = replace_once(
    router, old_route_names, new_route_names,
    'core/router.js / nombres de rutas Almacén',
    "'almacen-auditoria':'Auditoría'"
)

old_sets = '''  const COBRANZA_ROUTES_UNI = new Set([
    'cobranza-uni-dashboard',
    'cobranza-uni-estados-cuenta',
    'cobranza-uni-mp-pro',
    'cobranza-uni-aditivas'
  ]);

  let currentRoute = 'home';'''

new_sets = '''  const COBRANZA_ROUTES_UNI = new Set([
    'cobranza-uni-dashboard',
    'cobranza-uni-estados-cuenta',
    'cobranza-uni-mp-pro',
    'cobranza-uni-aditivas'
  ]);
  const ALMACEN_ROUTES = new Set([
    'almacen-dashboard',
    'almacen-inventario',
    'almacen-stock',
    'almacen-prestamos',
    'almacen-resguardos',
    'almacen-auditoria'
  ]);

  let currentRoute = 'home';'''

router, changed_sets = replace_once(
    router, old_sets, new_sets,
    'core/router.js / conjunto de rutas Almacén',
    'const ALMACEN_ROUTES = new Set(['
)

old_show_anchor = '''  function showCobranza_uni(route){
    const view = document.getElementById('view-' + route);
    if(!view) return false;
    activateViewById('view-' + route);
    setActiveSide(route);
    updateContext(route, 'Cobranza United · estructura base preparada para integración');
    if(window.ManttoCobranza_uni && window.ManttoCobranza_uni.init){
      window.ManttoCobranza_uni.init(route, currentPayload || null);
    }
    return true;
  }

  function showDetalle(payload){'''

new_show_anchor = '''  function showCobranza_uni(route){
    const view = document.getElementById('view-' + route);
    if(!view) return false;
    activateViewById('view-' + route);
    setActiveSide(route);
    updateContext(route, 'Cobranza United · estructura base preparada para integración');
    if(window.ManttoCobranza_uni && window.ManttoCobranza_uni.init){
      window.ManttoCobranza_uni.init(route, currentPayload || null);
    }
    return true;
  }

  function showAlmacen(route){
    const view = document.getElementById('view-' + route);
    if(!view) return false;
    activateViewById('view-' + route);
    setActiveSide(route);
    updateContext(route, 'Gestión de Almacén · estructura visual · Pend. Información');
    if(window.ManttoAlmacen && window.ManttoAlmacen.init){
      window.ManttoAlmacen.init(route, currentPayload || null);
    }
    return true;
  }

  function showDetalle(payload){'''

router, changed_show = replace_once(
    router, old_show_anchor, new_show_anchor,
    'core/router.js / renderer Almacén',
    'function showAlmacen(route)'
)

old_placeholder_head = '''  function showPlaceholder(route, payload){
    if(route==='detalle' && showDetalle(payload)) return;
    if(EXPERIMENTAL_ROUTES_EXP.has(route) && showExperimental_exp(route)) return;
    if(COBRANZA_ROUTES_UNI.has(route) && showCobranza_uni(route)) return;
    if(route==='resumen' && showResumen()) return;'''

new_placeholder_head = '''  function showPlaceholder(route, payload){
    if(route==='detalle' && showDetalle(payload)) return;
    if(EXPERIMENTAL_ROUTES_EXP.has(route) && showExperimental_exp(route)) return;
    if(COBRANZA_ROUTES_UNI.has(route) && showCobranza_uni(route)) return;
    if(ALMACEN_ROUTES.has(route) && showAlmacen(route)) return;
    if(route==='resumen' && showResumen()) return;'''

router, changed_placeholder = replace_once(
    router, old_placeholder_head, new_placeholder_head,
    'core/router.js / dispatch Almacén',
    'if(ALMACEN_ROUTES.has(route) && showAlmacen(route)) return;'
)

changes = {
    index_path: (index, changed_sidebar or changed_views),
    loader_path: (loader, changed_loader),
    router_path: (router, changed_names or changed_sets or changed_show or changed_placeholder),
}

for path, (content, changed) in changes.items():
    if changed:
        path.write_text(content, encoding='utf-8', newline='\n')
        print(f'MODIFICADO: {path.relative_to(ROOT).as_posix()}')
    else:
        print(f'SIN CAMBIOS: {path.relative_to(ROOT).as_posix()}')

print('FASE 1 ALMACÉN aplicada localmente. No se modificó BD/backend ni se realizó deploy.')
