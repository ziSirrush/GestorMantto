# Ajuste de distribución KPI — Dashboard Call Center

## Cambio realizado
- Operación: distribución de 7 KPI en filas 4 + 3.
- Alertas: distribución de 7 KPI en filas 4 + 3.
- Indicadores: se conserva en 4.
- U365: se conserva en 2.

## Archivo modificado
- `modules/callcenter/callcenter.html`

## Implementación
Se sustituyó la clase de rejilla `kpi-6` por `kpi-4` únicamente en las secciones Operación y Alertas.

## Validaciones
- Se confirmaron exactamente dos reemplazos.
- Se verificó que Indicadores conserve `kpi-4`.
- Se verificó que U365 conserve `kpi-2`.
- No se modificó JavaScript, backend, rutas, datos ni otros módulos.
