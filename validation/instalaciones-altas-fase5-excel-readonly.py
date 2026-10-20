#!/usr/bin/env python3
"""BLT NOW, Fase 5. Verificacion SOLO LECTURA de FieldLine Instalaciones.xlsx.

Uso: python validation/instalaciones-altas-fase5-excel-readonly.py "C:/ruta/FieldLine Instalaciones.xlsx"
No modifica el Excel, GitHub, backend ni Aiven. Requiere openpyxl.
"""
import json
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

try:
    from openpyxl import load_workbook
except ImportError as exc:
    raise SystemExit('FALTA openpyxl; este QA es opcional y SOLO LECTURA.') from exc

EXPECTED = {
    'AG': ('SI.ERROR', 'AF2633', 'AE2633', 'AJ2633'),
    'AR': ('SI(', 'AQ2633', 'AP2633'),
    'AS': ('04-M', 'DIAS.LAB', 'AR2633'),
    'BB': ('SI(', 'BA2633', 'AZ2633'),
    'BJ': ('AÑO', 'BG2633'),
    'BU': ('DIAS360', 'F2633'),
    'CC': ('SI.ERROR', 'CB2633', 'AD2633'),
}
FIELD_FROM_COL = {
    'D':'proyecto','BQ':'id_proyecto','C':'referencia_sitio',
    'E':'estatus','F':'fecha_visita','AL':'fecha_ccnr',
    'AJ':'fecha_descarga','AP':'fecha_fin_montaje_planeado',
    'AQ':'fecha_fin_montaje_modificado','AZ':'fecha_fin_ajuste_planeado',
    'BA':'fecha_fin_ajuste_modificado','BG':'fecha_entrega_cliente',
    'AE':'meses_garantia_actas','AF':'meses_garantia_sitio',
    'AD':'meses_mantenimiento_gratuito','CB':'presupuesto_mantenimiento_cem'
}
SAMPLE = {'AG':'meses_garantia_restantes', 'AS':'dias_restantes',
          'BU':'dias_sin_visita', 'CC':'costo_mensual_mantenimiento_cem'}

def as_json_value(value):
    if isinstance(value,(date,datetime)):
        return value.strftime('%Y-%m-%d')
    return value

def main():
    if len(sys.argv)!=2:
        raise SystemExit('Uso: python validation/instalaciones-altas-fase5-excel-readonly.py "FieldLine Instalaciones.xlsx"')
    workbook = Path(sys.argv[1]).expanduser().resolve(strict=True)
    root = Path(__file__).resolve().parent.parent
    engine = root/'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-formulas.js'
    if not engine.is_file():
        raise SystemExit('Falta el motor JavaScript de Fase 3.')
    book=load_workbook(workbook,read_only=True,data_only=False)
    if 'Hoja1' not in book.sheetnames:
        raise SystemExit('FALLO: no existe Hoja1.')
    sheet=book['Hoja1']
    if sheet.max_column!=89:
        raise SystemExit(f'FALLO: Hoja1 contiene {sheet.max_column} columnas, se esperaban 89.')
    for col,parts in EXPECTED.items():
        formula=sheet[f'{col}3'].value
        if not isinstance(formula,str) or any(part not in formula for part in parts):
            raise SystemExit(f'FALLO: formula de {col}3 diferente; NO actualizar silenciosamente.')
    data={field:as_json_value(sheet[f'{col}2'].value)
          for col,field in FIELD_FROM_COL.items()}
    # 2026-10-16 es un corte de QA que reproduce los resultados de muestra
    # AS=-6 y BU=32; NO se afirma que fuera la fecha de calculo del Excel.
    node='const e=require(process.argv[1]); const d=JSON.parse(process.argv[2]);'+\
         'process.stdout.write(JSON.stringify(e.calculateCor(d,{today:"2026-10-16"})));'
    output=subprocess.run(['node','-e',node,str(engine),json.dumps(data,ensure_ascii=False)],
                          check=True,text=True,capture_output=True)
    actual=json.loads(output.stdout)
    for col,field in SAMPLE.items():
        expected=sheet[f'{col}2'].value
        val=actual[field]
        if not isinstance(expected,(int,float)) or val is None or abs(float(expected)-float(val))>1e-7:
            raise SystemExit(f'FALLO: muestra {col}2 / {field}: Excel {expected!r}, backend {val!r}.')
    print('OK: 89 encabezados, 7 formulas fila 3 y 4 valores de muestra validos (corte hipotetico 2026-10-16).')
    print('SOLO LECTURA. No se realizaron escrituras ni se valido Aiven actual.')
    book.close()

if __name__=='__main__':
    main()
