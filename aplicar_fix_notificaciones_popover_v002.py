from pathlib import Path
import re

BEGIN = '/* BEGIN FIX_NOTIFICACIONES_POPOVER_V002'
END = '/* END FIX_NOTIFICACIONES_POPOVER_V002 */'
HOME_VERSION = '20260831-notif-popover-v002'
LEGACY_LINK_RE = re.compile(r'\s*<link\b[^>]*href=["\'][^"\']*notificaciones-layout-fix\.css[^"\']*["\'][^>]*?/?>\s*', re.I)
HOME_LINK_RE = re.compile(r'(<link\b[^>]*href=["\']\./styles/home\.css\?v=)([^"\']+)(["\'][^>]*?/?>)', re.I)


def fail(message: str):
    print('ERROR: ' + message)
    raise SystemExit(1)


def read_text_preserve(path: Path):
    raw = path.read_bytes()
    bom = raw.startswith(b'\xef\xbb\xbf')
    if bom:
        raw = raw[3:]
    text = raw.decode('utf-8')
    newline = '\r\n' if '\r\n' in text else '\n'
    return text, bom, newline


def write_text_preserve(path: Path, text: str, bom: bool, newline: str):
    normalized = text.replace('\r\n', '\n').replace('\r', '\n')
    if newline == '\r\n':
        normalized = normalized.replace('\n', '\r\n')
    data = normalized.encode('utf-8')
    if bom:
        data = b'\xef\xbb\xbf' + data
    path.write_bytes(data)


def replace_fix_block(home: str, block: str):
    begin_count = home.count(BEGIN)
    end_count = home.count(END)
    if begin_count != end_count or begin_count > 1:
        fail('styles/home.css contiene marcadores V002 inconsistentes o duplicados; no se modifico nada.')
    if begin_count == 1:
        start = home.index(BEGIN)
        finish = home.index(END, start) + len(END)
        return home[:start] + block.strip() + home[finish:]
    separator = '' if not home or home.endswith(('\n', '\r')) else '\n'
    return home + separator + '\n' + block.strip() + '\n'


def main():
    root = Path.cwd()
    index_path = root / 'index.html'
    home_path = root / 'styles' / 'home.css'
    bundle_path = Path(__file__).resolve().parent / 'patches' / 'NOTIFICACIONES_POPOVER_V002.css'

    if not index_path.is_file():
        fail('Ejecuta el aplicador desde la raiz del repo GestorMantto: falta index.html.')
    if not home_path.is_file():
        fail('Falta styles/home.css.')
    if not bundle_path.is_file():
        fail('El paquete esta incompleto: falta patches/NOTIFICACIONES_POPOVER_V002.css.')

    block = bundle_path.read_text(encoding='utf-8').strip()
    required = [
        BEGIN,
        END,
        '#hdr-notif-popover .hdr-notif-list',
        'display:block!important;',
        'min-height:76px!important;',
        'max-height:none!important;'
    ]
    for token in required:
        if token not in block:
            fail('El bloque V002 incluido no contiene la defensa requerida: ' + token)

    original_index, index_bom, index_nl = read_text_preserve(index_path)
    original_home, home_bom, home_nl = read_text_preserve(home_path)

    home_matches = list(HOME_LINK_RE.finditer(original_index))
    if len(home_matches) != 1:
        fail('No pude identificar exactamente un link ./styles/home.css?v=... en index.html. Modo fail-closed.')

    new_home = replace_fix_block(original_home, block)
    new_index = LEGACY_LINK_RE.sub('\n', original_index)
    new_index, replacements = HOME_LINK_RE.subn(r'\g<1>' + HOME_VERSION + r'\g<3>', new_index, count=1)
    if replacements != 1:
        fail('No pude actualizar de forma unica la version de styles/home.css. No se escribio nada.')

    if new_home.count(BEGIN) != 1 or new_home.count(END) != 1:
        fail('Validacion previa fallo: el bloque V002 no quedaria exactamente una vez.')
    if new_index.count('styles/home.css?v=' + HOME_VERSION) != 1:
        fail('Validacion previa fallo: index.html no quedaria con la version V002 de home.css.')
    if 'notificaciones-layout-fix.css' in new_index:
        fail('Validacion previa fallo: quedaria enlazado el FIX V001 legado.')

    wrote_index = False
    wrote_home = False
    try:
        if new_home != original_home:
            write_text_preserve(home_path, new_home, home_bom, home_nl)
            wrote_home = True
        if new_index != original_index:
            write_text_preserve(index_path, new_index, index_bom, index_nl)
            wrote_index = True

        final_home = home_path.read_text(encoding='utf-8-sig')
        final_index = index_path.read_text(encoding='utf-8-sig')
        checks = {
            'bloque_v002_unico': final_home.count(BEGIN) == 1 and final_home.count(END) == 1,
            'lista_no_flex': '#hdr-notif-popover .hdr-notif-list' in final_home and 'display:block!important;' in final_home,
            'fila_altura_protegida': 'min-height:76px!important;' in final_home and 'max-height:none!important;' in final_home,
            'cache_bust_v002': final_index.count('styles/home.css?v=' + HOME_VERSION) == 1,
            'sin_link_v001': 'notificaciones-layout-fix.css' not in final_index,
        }
        failed = [name for name, ok in checks.items() if not ok]
        if failed:
            raise RuntimeError('fallaron validaciones posteriores: ' + ', '.join(failed))
    except Exception as exc:
        if wrote_home:
            write_text_preserve(home_path, original_home, home_bom, home_nl)
        if wrote_index:
            write_text_preserve(index_path, original_index, index_bom, index_nl)
        fail('Se restauro el estado original porque la aplicacion fallo: ' + str(exc))

    print('OK: FIX_NOTIFICACIONES_POPOVER_V002 aplicado y validado.')
    print(' - styles/home.css: override global V002 agregado/actualizado al final.')
    print(' - index.html: home.css?v=' + HOME_VERSION)
    print(' - link legado notificaciones-layout-fix.css removido si existia.')


if __name__ == '__main__':
    main()
