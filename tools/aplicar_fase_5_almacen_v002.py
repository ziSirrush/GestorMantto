#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import argparse
import re
import shutil
import sys

PACKAGE_DIR = Path(__file__).resolve().parent
FINAL_TAG = '20260830-almacen-fase5-integracion-qa-v002'
PREV_TAG = '20260830-almacen-fase4-auditoria-v002'
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
        if (candidate / 'index.html').exists() and (candidate / 'core' / 'module-loader.js').exists():
            return candidate
    raise SystemExit('ERROR: no se encontro la raiz de GestorMantto. Usa --repo RUTA.')


def require_text(path: Path) -> str:
    if not path.exists():
        raise SystemExit(f'ERROR: falta archivo requerido: {path}')
    return path.read_text(encoding='utf-8')


def replace_cache_tag(loader: str) -> tuple[str, int]:
    final_count = loader.count(FINAL_TAG)
    if final_count == 12:
        return loader, 0
    if final_count:
        raise SystemExit(f'ERROR: cache-bust final aparece {final_count} veces; se esperaban 0 o 12.')
    prev_count = loader.count(PREV_TAG)
    if prev_count != 12:
        raise SystemExit(
            f'ERROR: se esperaban 12 referencias de Fase 4 ({PREV_TAG}) y se encontraron {prev_count}. '
            'Confirma que Fase 4 V002 este aplicada antes de Fase 5.'
        )
    return loader.replace(PREV_TAG, FINAL_TAG), 12


def main() -> int:
    parser = argparse.ArgumentParser(description='Aplica Fase 5 Almacen V002: fix de paginacion + cache-bust QA.')
    parser.add_argument('--repo', help='Ruta explicita a la raiz de GestorMantto.')
    args = parser.parse_args()
    root = find_repo_root(args.repo)

    target_js = root / 'modules' / 'almacen' / 'almacen.js'
    target_loader = root / 'core' / 'module-loader.js'
    source_js = PACKAGE_DIR / 'modules' / 'almacen' / 'almacen.js'

    current_js = require_text(target_js)
    loader = require_text(target_loader)
    package_js = require_text(source_js)

    preconditions = (
        '/api/almacen/auditoria/catalogos',
        '/api/almacen/auditoria/muestra',
        "view.dataset.almacenReady='4-v002';",
    )
    if FINAL_TAG not in loader:
        missing = [token for token in preconditions if token not in current_js]
        if missing:
            raise SystemExit('ERROR: Fase 4 V002 no parece aplicada. Faltan: ' + ', '.join(missing))

    if 'function pager(' in package_js:
        raise SystemExit('ERROR: el JS de Fase 5 aun contiene la funcion pager duplicada.')
    if package_js.count('function inventoryPager(') != 1 or package_js.count('function operationalPager(') != 1:
        raise SystemExit('ERROR: contrato de paginacion Fase 5 invalido.')
    if 'Pend. Información' in package_js:
        raise SystemExit('ERROR: Fase 5 no puede reintroducir Pend. Informacion.')

    new_loader, replaced = replace_cache_tag(loader)
    target_js.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source_js, target_js)
    if new_loader != loader:
        target_loader.write_text(new_loader, encoding='utf-8')

    print('FASE 5 ALMACEN V002 APLICADA')
    print('Repo:', root)
    print('OK: modules/almacen/almacen.js actualizado con separacion de paginadores.')
    if replaced:
        print(f'OK: {replaced} referencias de cache-bust actualizadas a {FINAL_TAG}.')
    else:
        print('OK: cache-bust Fase 5 ya estaba aplicado.')
    print('SIN CAMBIOS: backend, SQL, Aiven, Azure, Netlify, GitHub.')
    print('SIGUIENTE: python FASE_5_ALMACEN_INTEGRACION_QA_V002/validar_fase_5_almacen_v002.py --repo .')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
