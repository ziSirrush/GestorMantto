from pathlib import Path
import sys

root = Path.cwd()
index_path = root / 'index.html'
css_path = root / 'styles' / 'notificaciones-layout-fix.css'
errors = []

if not index_path.is_file():
    errors.append('Falta index.html')
if not css_path.is_file():
    errors.append('Falta styles/notificaciones-layout-fix.css')

if index_path.is_file():
    text = index_path.read_text(encoding='utf-8-sig')
    if text.count('notificaciones-layout-fix.css') != 1:
        errors.append('index.html debe contener exactamente un link a notificaciones-layout-fix.css')

if css_path.is_file():
    css = css_path.read_text(encoding='utf-8')
    required = [
        'FIX_NOTIFICACIONES_ALTURA_SCROLL_V001',
        'flex:0 0 auto !important;',
        'flex-shrink:0 !important;',
        'overflow-y:auto;',
        'min-height:64px;'
    ]
    for token in required:
        if token not in css:
            errors.append(f'CSS sin token requerido: {token}')
    if css.count('{') != css.count('}'):
        errors.append('Llaves CSS desbalanceadas')

if errors:
    print('VALIDACION: ERROR')
    for item in errors:
        print(' - ' + item)
    sys.exit(1)

print('VALIDACION: OK')
print('Las tarjetas no pueden encogerse verticalmente y la lista conserva scroll vertical.')
