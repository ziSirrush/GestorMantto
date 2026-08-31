from pathlib import Path
import re
import shutil
import sys

FIX_LINK = '<link href="./styles/notificaciones-layout-fix.css?v=20260831-notif-altura-scroll-v001" rel="stylesheet"/>'
MARKER = 'FIX_NOTIFICACIONES_ALTURA_SCROLL_V001'


def fail(message: str, code: int = 1):
    print(f"ERROR: {message}")
    raise SystemExit(code)


def main():
    root = Path.cwd()
    index_path = root / 'index.html'
    target_css = root / 'styles' / 'notificaciones-layout-fix.css'
    bundled_css = Path(__file__).resolve().parent / 'styles' / 'notificaciones-layout-fix.css'

    if not index_path.is_file():
        fail('Ejecuta este aplicador desde la raiz del repo GestorMantto; no encuentro index.html.')
    if not (root / 'styles').is_dir():
        fail('No encuentro la carpeta styles del repo.')
    if not bundled_css.is_file():
        fail('El paquete esta incompleto: falta styles/notificaciones-layout-fix.css.')

    css_text = bundled_css.read_text(encoding='utf-8')
    if MARKER not in css_text or 'flex:0 0 auto !important;' not in css_text:
        fail('El CSS incluido no contiene el marcador/defensa esperados. No se aplico nada.')

    original_index = index_path.read_text(encoding='utf-8-sig')
    new_index = original_index

    # El link del FIX debe quedar despues de home.css para sobreescribir solo
    # las reglas del popover sin modificar el CSS historico.
    if 'notificaciones-layout-fix.css' not in new_index:
        pattern = re.compile(
            r'(<link\s+href="\./styles/home\.css\?v=[^"]+"\s+rel="stylesheet"\s*/>)'
        )
        matches = list(pattern.finditer(new_index))
        if len(matches) != 1:
            fail(
                'No pude identificar de forma unica el <link> de styles/home.css. '
                'Se detuvo en modo fail-closed; no se modifico index.html.'
            )
        new_index = pattern.sub(r'\1\n' + FIX_LINK, new_index, count=1)

    # Validaciones antes de escribir.
    if new_index.count('notificaciones-layout-fix.css') != 1:
        fail('La validacion detecto cero o multiples links del FIX. No se escribio nada.')

    target_css.parent.mkdir(parents=True, exist_ok=True)
    original_target_css = target_css.read_bytes() if target_css.exists() else None

    try:
        # Si el ZIP se extrajo directamente en el repo, source y target son el mismo archivo.
        if bundled_css.resolve() != target_css.resolve():
            shutil.copyfile(bundled_css, target_css)
        else:
            target_css.write_text(css_text, encoding='utf-8', newline='\n')

        if MARKER not in target_css.read_text(encoding='utf-8'):
            raise RuntimeError('El CSS destino no contiene el marcador del FIX.')

        if new_index != original_index:
            index_path.write_text(new_index, encoding='utf-8', newline='\n')

        final_index = index_path.read_text(encoding='utf-8')
        if final_index.count('notificaciones-layout-fix.css') != 1:
            raise RuntimeError('index.html no contiene exactamente un link al CSS del FIX.')

    except Exception as exc:
        try:
            index_path.write_text(original_index, encoding='utf-8', newline='\n')
            if original_target_css is None:
                if target_css.exists() and target_css.resolve() != bundled_css.resolve():
                    target_css.unlink()
            elif target_css.resolve() != bundled_css.resolve():
                target_css.write_bytes(original_target_css)
        except Exception:
            pass
        fail(f'Fallo la aplicacion y se intento restaurar el estado anterior: {exc}')

    print('OK: FIX_NOTIFICACIONES_ALTURA_SCROLL_V001 aplicado/validado.')
    print(' - styles/notificaciones-layout-fix.css')
    print(' - index.html (link CSS del FIX)')
    print('Siguiente paso: revisa git diff y publica frontend cuando corresponda.')


if __name__ == '__main__':
    main()
