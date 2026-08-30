#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import argparse
import collections
import re
import shutil
import subprocess
import sys

PACKAGE_DIR = Path(__file__).resolve().parent
FINAL_TAG = '20260830-almacen-fase5-integracion-qa-v002'
ROUTES = (
    'almacen-dashboard',
    'almacen-inventario',
    'almacen-stock',
    'almacen-prestamos',
    'almacen-resguardos',
    'almacen-auditoria',
)


def find_repo_root(explicit: str | None) -> Path:
    if explicit:
        root = Path(explicit).expanduser().resolve()
        if not (root / 'index.html').exists():
            raise SystemExit('ERROR: --repo no parece ser la raiz de GestorMantto.')
        return root
    candidates = [Path.cwd().resolve(), PACKAGE_DIR.parent.resolve(), PACKAGE_DIR.parent.parent.resolve()]
    for candidate in candidates:
        if (candidate / 'index.html').exists() and (candidate / 'core' / 'router.js').exists():
            return candidate
    raise SystemExit('ERROR: no se encontro la raiz de GestorMantto. Usa --repo RUTA.')


def read(path: Path, errors: list[str]) -> str:
    if not path.exists():
        errors.append(f'Falta archivo: {path}')
        return ''
    return path.read_text(encoding='utf-8')


def require(text: str, token: str, label: str, errors: list[str]) -> None:
    if token not in text:
        errors.append(f'Falta {label}: {token}')


def run(cmd: list[str], cwd: Path, errors: list[str], label: str) -> None:
    result = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True)
    if result.returncode:
        output = (result.stdout + '\n' + result.stderr).strip()
        errors.append(f'{label} fallo:\n{output}')
    else:
        print(f'OK: {label}')
        if result.stdout.strip():
            for line in result.stdout.strip().splitlines():
                print('   ', line)


def static_checks(root: Path) -> list[str]:
    errors: list[str] = []
    index = read(root / 'index.html', errors)
    router = read(root / 'core' / 'router.js', errors)
    loader = read(root / 'core' / 'module-loader.js', errors)
    js = read(root / 'modules' / 'almacen' / 'almacen.js', errors)
    css = read(root / 'modules' / 'almacen' / 'almacen.css', errors)
    routes_index = read(root / 'backend' / 'src' / 'routes' / 'index.js', errors)
    backend_routes = read(root / 'backend' / 'src' / 'modules' / 'almacen' / 'almacen.routes.js', errors)
    controller = read(root / 'backend' / 'src' / 'modules' / 'almacen' / 'almacen.controller.js', errors)
    service = read(root / 'backend' / 'src' / 'modules' / 'almacen' / 'almacen.service.js', errors)
    xlsx = read(root / 'backend' / 'src' / 'modules' / 'almacen' / 'xlsx-lite.js', errors)

    for route in ROUTES:
        require(index, f'data-route="{route}"', f'acceso lateral {route}', errors)
        require(index, f'id="view-{route}"', f'vista {route}', errors)
        require(router, route, f'ruta {route}', errors)
        require(loader, f"'{route}':", f'lazy-load {route}', errors)

    if loader.count(FINAL_TAG) != 12:
        errors.append(f'Cache-bust Fase 5 debe aparecer 12 veces; aparece {loader.count(FINAL_TAG)}.')

    require(routes_index, "router.use('/almacen', almacenRoutes);", 'montaje backend /api/almacen', errors)

    endpoints = (
        "router.get('/dashboard'",
        "router.get('/inventario'",
        "router.get('/inventario/catalogos'",
        "router.get('/inventario/empresa'",
        "router.get('/inventario/almacenes'",
        "router.get('/inventario/top'",
        "router.get('/stock'",
        "router.get('/prestamos/catalogos'",
        "router.get('/prestamos/resumen'",
        "router.get('/prestamos'",
        "router.get('/resguardos/catalogos'",
        "router.get('/resguardos'",
        "router.get('/auditoria/catalogos'",
        "router.get('/auditoria/muestra'",
        "router.get('/importaciones/capabilities'",
        "router.post('/importaciones/validar'",
        "router.post('/importaciones'",
    )
    for endpoint in endpoints:
        require(backend_routes, endpoint, 'endpoint Almacen', errors)

    require(backend_routes, 'ALMACEN_DASHBOARD_ACCESO_VISUAL_MODULO.ACCESO_VISUAL', 'permiso Dashboard', errors)
    require(backend_routes, 'ALMACEN_INVENTARIOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL', 'permiso Inventario', errors)
    require(backend_routes, 'ALMACEN_MOVIMIENTOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL', 'permiso Operativos/Auditoria', errors)
    require(backend_routes, "domain:'CORELLIAN'", 'dominio CORELLIAN', errors)
    require(backend_routes, "groupingCodesAny:['ALMACEN']", 'agrupacion ALMACEN', errors)
    require(service, "roles_usuario.codigo IN ('PROGRAMADOR','PROGRAMADOR_CORELLIAN')", 'restriccion de importacion', errors)

    if "router.post('/auditoria" in backend_routes:
        errors.append('Auditoria F4/F5 debe seguir sin endpoint POST mientras no exista historico autorizado.')

    if 'Pend. Información' in js:
        errors.append('Frontend reintrodujo Pend. Informacion.')
    for forbidden in ('localStorage', 'sessionStorage'):
        if forbidden in js:
            errors.append(f'Frontend Almacen usa persistencia local no autorizada: {forbidden}')

    frontend_endpoints = (
        '/api/almacen/dashboard',
        '/api/almacen/inventario',
        '/api/almacen/stock',
        '/api/almacen/prestamos',
        '/api/almacen/resguardos',
        '/api/almacen/auditoria/catalogos',
        '/api/almacen/auditoria/muestra',
        '/api/almacen/importaciones/validar',
        '/api/almacen/importaciones',
    )
    for endpoint in frontend_endpoints:
        require(js, endpoint, 'consumo frontend', errors)

    names = re.findall(r'\bfunction\s+([A-Za-z_$][\w$]*)\s*\(', js)
    duplicates = sorted(name for name, count in collections.Counter(names).items() if count > 1)
    if duplicates:
        errors.append('Funciones JS duplicadas: ' + ', '.join(duplicates))
    require(js, 'function inventoryPager(', 'paginador de Inventario separado', errors)
    require(js, 'function operationalPager(', 'paginador Operativos separado', errors)
    if 'function pager(' in js:
        errors.append('Permanece function pager generica; puede volver a colisionar entre Inventario y Operativos.')
    require(js, "inventoryPager(data && data.pagination,'inventory')", 'paginacion Inventario', errors)
    require(js, "inventoryPager(data && data.pagination,'company')", 'paginacion Por Empresa', errors)
    require(js, "operationalPager('stock',p)", 'paginacion Stock', errors)
    require(js, "operationalPager('loans',detail.pagination)", 'paginacion Prestamos', errors)
    require(js, "operationalPager('guards',data.pagination)", 'paginacion Resguardos', errors)
    require(js, 'pageSize:30', 'frontend Inventario 30 por pagina', errors)

    if service.count('const pageSize=30') < 3:
        errors.append('Backend no conserva paginacion fija de 30 en Stock/Prestamos/Resguardos/Empresa.')
    require(service, 'query.pageSize||30', 'default 30 en Inventario', errors)
    require(service, 'LIMIT ? OFFSET ?', 'paginacion SQL', errors)

    require(css, '.alm-table-wrap', 'contenedor responsive de tablas', errors)
    require(css, 'overflow-x:auto', 'scroll horizontal local', errors)
    if re.search(r'transform\s*:\s*scale\s*\(', css, flags=re.I):
        errors.append('CSS contiene transform:scale().')
    if re.search(r'(^|[;{])\s*zoom\s*:', css, flags=re.I | re.M):
        errors.append('CSS contiene zoom.')
    if '@media' not in css:
        errors.append('CSS no contiene media queries responsive.')

    transaction_tokens = (
        'await conn.beginTransaction()',
        'INSERT INTO ${TABLE}',
        'SET activo=0 WHERE activo=1 AND lote_importacion<>?',
        'SET activo=1 WHERE lote_importacion=?',
        'await conn.commit()',
        'await conn.rollback()',
    )
    for token in transaction_tokens:
        require(service, token, 'contrato transaccional de importacion', errors)
    positions = [service.find(token) for token in transaction_tokens[:5]]
    if all(pos >= 0 for pos in positions) and positions != sorted(positions):
        errors.append('Orden transaccional esperado no se conserva: BEGIN -> INSERT -> desactivar anterior -> activar nuevo -> COMMIT.')

    require(service, 'WHERE activo=1', 'consulta de lote activo', errors)
    require(service, "tipo_registro='${RECORD_TYPES.INVENTORY}'", 'filtro INVENTARIO activo', errors)
    require(service, 'No puedo confirmar una hoja de Inventario', 'error claro de encabezados', errors)
    require(service, 'error.status = 422', 'estatus 422 en encabezados no reconocidos', errors)
    require(service, 'error.details = { headers:', 'detalle de encabezados/calidad', errors)
    require(xlsx, 'parseXlsxSheets', 'lector XLSX multihoja', errors)
    require(controller, 'res.status(201)', 'respuesta de importacion creada', errors)

    require(service, 'getAuditCatalogs', 'servicio catalogos Auditoria', errors)
    require(service, 'getAuditSample', 'servicio muestra Auditoria', errors)
    require(js, "view.dataset.almacenReady='5-v002';", 'marcador Fase 5 frontend', errors)

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description='QA integral de Fase 5 Almacen V002.')
    parser.add_argument('--repo', help='Ruta a la raiz de GestorMantto.')
    parser.add_argument('--with-aiven', action='store_true', help='Ejecuta precheck real de Aiven en modo solo lectura usando la config del backend.')
    parser.add_argument('--with-http', action='store_true', help='Ejecuta smoke HTTP solo lectura/validacion usando variables MANTTO_* del entorno.')
    args = parser.parse_args()
    root = find_repo_root(args.repo)

    print('=== FASE 5 ALMACEN V002 - INTEGRACION Y QA ===')
    print('Repo:', root)
    errors = static_checks(root)
    if errors:
        print('--- FALLAS ESTATICAS ---')
        for item in errors:
            print('ERROR:', item)
        return 1
    print('OK: validacion estatica integral')

    node = shutil.which('node')
    if not node:
        print('ERROR: Node.js no esta disponible; no se pueden ejecutar smoke tests del backend.')
        return 1

    syntax_files = [
        root / 'modules' / 'almacen' / 'almacen.js',
        root / 'backend' / 'src' / 'modules' / 'almacen' / 'almacen.routes.js',
        root / 'backend' / 'src' / 'modules' / 'almacen' / 'almacen.controller.js',
        root / 'backend' / 'src' / 'modules' / 'almacen' / 'almacen.service.js',
        root / 'backend' / 'src' / 'modules' / 'almacen' / 'xlsx-lite.js',
    ]
    runtime_errors: list[str] = []
    for path in syntax_files:
        run([node, '--check', str(path)], root, runtime_errors, f'node --check {path.name}')

    for test_name in (
        'fase5_headers_smoke.js',
        'fase5_import_rollback_smoke.js',
        'fase5_integration_service_smoke.js',
    ):
        run([node, str(PACKAGE_DIR / 'tests' / test_name), str(root)], root, runtime_errors, test_name)

    if args.with_aiven:
        run([node, str(PACKAGE_DIR / 'tests' / 'fase5_aiven_readonly.js'), str(root)], root, runtime_errors, 'Aiven precheck solo lectura')
    else:
        print('SKIP: Aiven real (usa --with-aiven cuando el backend tenga acceso al ambiente objetivo).')

    if args.with_http:
        run([sys.executable, str(PACKAGE_DIR / 'tests' / 'fase5_http_readonly.py')], root, runtime_errors, 'HTTP smoke solo lectura')
    else:
        print('SKIP: API HTTP real (usa --with-http con MANTTO_API_BASE y credenciales en variables de entorno).')

    if runtime_errors:
        print('--- FALLAS DE EJECUCION ---')
        for item in runtime_errors:
            print('ERROR:', item)
        return 1

    print('RESULTADO: APROBADO - QA LOCAL/ESTATICO')
    if not args.with_aiven or not args.with_http:
        print('NOTA: Aprobado local no equivale a E2E productivo. Ejecuta los modos opcionales en el ambiente controlado correspondiente.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
