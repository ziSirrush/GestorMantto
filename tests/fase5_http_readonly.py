#!/usr/bin/env python3
from __future__ import annotations

import json
import mimetypes
import os
from pathlib import Path
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get('MANTTO_API_BASE', 'http://localhost:3001').rstrip('/')
COOKIE = os.environ.get('MANTTO_COOKIE', '').strip()
BEARER = os.environ.get('MANTTO_BEARER_TOKEN', '').strip()
QA_EXCEL = os.environ.get('MANTTO_QA_EXCEL', '').strip()


def headers(extra=None):
    value = {'Accept': 'application/json'}
    if COOKIE:
        value['Cookie'] = COOKIE
    if BEARER:
        value['Authorization'] = 'Bearer ' + BEARER
    if extra:
        value.update(extra)
    return value


def request(method, path, body=None, extra_headers=None, expected=(200,)):
    req = urllib.request.Request(BASE + path, data=body, method=method, headers=headers(extra_headers))
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            status = response.status
            payload = response.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as error:
        status = error.code
        payload = error.read().decode('utf-8', 'replace')
    if status not in expected:
        raise RuntimeError(f'{method} {path}: HTTP {status}; esperado {expected}; cuerpo={payload[:300]}')
    try:
        data = json.loads(payload) if payload else None
    except json.JSONDecodeError:
        data = payload
    print(f'OK {method} {path} -> {status}')
    return status, data


def multipart(field_name, filename, content, content_type='application/octet-stream', fields=None):
    boundary = '----ManttoQA' + secrets.token_hex(8)
    chunks = []
    for key, value in (fields or {}).items():
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
    chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\nContent-Type: {content_type}\r\n\r\n'.encode())
    chunks.append(content)
    chunks.append(f'\r\n--{boundary}--\r\n'.encode())
    return b''.join(chunks), f'multipart/form-data; boundary={boundary}'


def main():
    read_paths = [
        '/api/almacen/importaciones/capabilities',
        '/api/almacen/dashboard',
        '/api/almacen/inventario?page=1&pageSize=30',
        '/api/almacen/inventario/catalogos',
        '/api/almacen/inventario/almacenes',
        '/api/almacen/inventario/top?limit=10',
        '/api/almacen/stock?page=1',
        '/api/almacen/prestamos/catalogos',
        '/api/almacen/prestamos/resumen',
        '/api/almacen/prestamos?page=1',
        '/api/almacen/resguardos/catalogos',
        '/api/almacen/resguardos?page=1',
        '/api/almacen/auditoria/catalogos',
    ]
    results = {}
    for path in read_paths:
        _, data = request('GET', path, expected=(200,))
        results[path] = data

    audit = results.get('/api/almacen/auditoria/catalogos') or {}
    warehouses = audit.get('warehouses') if isinstance(audit, dict) else None
    if warehouses:
        first = warehouses[0]
        q = urllib.parse.urlencode({'company': first.get('company',''), 'warehouse': first.get('warehouse','')})
        request('GET', '/api/almacen/auditoria/muestra?' + q, expected=(200,))
    else:
        print('SKIP audit sample: no hay almacenes disponibles en el lote activo.')

    invalid = b'Foo,Bar,Baz\n1,2,3\n'
    body, content_type = multipart('archivo', 'encabezados_invalidos.csv', invalid, 'text/csv')
    status, _ = request('POST', '/api/almacen/importaciones/validar', body, {'Content-Type': content_type}, expected=(403,422))
    if status == 403:
        print('INFO: usuario actual no tiene rol de importacion; guard de permisos rechazo correctamente la validacion.')
    else:
        print('OK: encabezados invalidos fueron rechazados con 422 sin importar.')

    if QA_EXCEL:
        file_path = Path(QA_EXCEL).expanduser().resolve()
        if not file_path.exists():
            raise RuntimeError('MANTTO_QA_EXCEL no existe: ' + str(file_path))
        content = file_path.read_bytes()
        mime = mimetypes.guess_type(file_path.name)[0] or 'application/octet-stream'
        body, content_type = multipart('archivo', file_path.name, content, mime)
        request('POST', '/api/almacen/importaciones/validar', body, {'Content-Type': content_type}, expected=(200,403,422))
    else:
        print('SKIP: validacion de Excel real. Define MANTTO_QA_EXCEL para probar /validar sin importar.')

    print('PASS fase5_http_readonly')
    print('NOTA: este script nunca llama POST /api/almacen/importaciones.')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        print('ERROR:', error)
        raise SystemExit(1)
