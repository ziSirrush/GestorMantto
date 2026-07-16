# Mantto Gestor — MTBC en Equipos Críticos

Fecha: 2026-07-15

## Alcance

Se actualizó únicamente el módulo `Equipos Críticos` para consumir y mostrar los dos indicadores corporativos MTBC de United:

- MTBC Año en curso: 1 de enero hasta hoy.
- MTBC U365: ventana móvil de los últimos 365 días.

Ambos indicadores se basan exclusivamente en tickets con responsabilidad `BLT`.

## Cambios

- La tabla de Equipos Críticos reemplaza el MTBC del filtro dinámico por:
  - `MTBC año`
  - `MTBC U365`
- La tabla de Proyectos Críticos incorpora:
  - `MTBC año`
  - `MTBC U365`
- El filtro dinámico conserva su función: decidir qué equipos/proyectos aparecen en las tablas operativas.
- Los MTBC de proyectos se consumen desde:
  - `GET /api/indicadores/mtbc/proyectos`
- Los MTBC de equipos se consumen desde los campos incluidos en:
  - `GET /api/equipos-criticos`
- Los PDF de Equipos y Proyectos incluyen ambos MTBC.
- Se mantuvo sincronizado el HTML modular y el fallback HTML incluido en el JS.

## Archivos modificados

- `modules/equipos-criticos/equipos-criticos.html`
- `modules/equipos-criticos/equipos-criticos.js`

## Validación

- `node --check modules/equipos-criticos/equipos-criticos.js`
- No se modificaron otros módulos.
