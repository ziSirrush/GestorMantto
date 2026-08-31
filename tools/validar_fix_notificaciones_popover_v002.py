from pathlib import Path
import sys

BEGIN = '/* BEGIN FIX_NOTIFICACIONES_POPOVER_V002'
END = '/* END FIX_NOTIFICACIONES_POPOVER_V002 */'
HOME_VERSION = '20260831-notif-popover-v002'

root = Path.cwd()
index_path = root / 'index.html'
home_path = root / 'styles' / 'home.css'
errors = []

if not index_path.is_file():
    errors.append('Falta index.html')
if not home_path.is_file():
    errors.append('Falta styles/home.css')

if not errors:
    index = index_path.read_text(encoding='utf-8-sig')
    home = home_path.read_text(encoding='utf-8-sig')
    checks = [
        (home.count(BEGIN) == 1 and home.count(END) == 1, 'El bloque V002 no existe exactamente una vez.'),
        ('#hdr-notif-popover .hdr-notif-list' in home, 'Falta aislamiento de la lista.'),
        ('display:block!important;' in home, 'La lista no esta protegida como bloque no-flex.'),
        ('min-height:76px!important;' in home, 'Falta altura minima protegida de las tarjetas.'),
        ('max-height:none!important;' in home, 'Falta eliminar max-height heredado en las tarjetas.'),
        (index.count('styles/home.css?v=' + HOME_VERSION) == 1, 'index.html no usa la version V002 de home.css.'),
        ('notificaciones-layout-fix.css' not in index, 'Sigue enlazado el FIX V001 legado.'),
    ]
    errors.extend(message for ok, message in checks if not ok)

if errors:
    print('VALIDACION: ERROR')
    for item in errors:
        print(' - ' + item)
    sys.exit(1)

print('VALIDACION: OK')
print('Popover protegido: lista con scroll + filas no comprimibles + cache-bust V002.')
