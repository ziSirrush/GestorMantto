# Equipos Críticos - Pruebas V0.3

## Alcance

Este paquete integra el módulo **Equipos Críticos** en la estructura modular de pruebas basada en `pruebas_v1_1_5_nevera_resumen`.

No modifica el módulo `resumen-dia`.

## Criterios independientes

### Equipos Críticos
- Fallas BLT mínimas: configurable por el usuario.
- Días de análisis: configurable por el usuario.
- Default: 3 fallas BLT en 35 días.

### Proyectos Críticos
- Fallas BLT mínimas del proyecto: configurable por el usuario.
- Días de análisis: configurable por el usuario.
- Fallas mínimas por equipo dentro del proyecto: configurable por el usuario.
- Default: 5 fallas BLT en 35 días y 3 fallas BLT por equipo.

## Fuente de datos

Aiven MySQL mediante backend Node/Express.

Tablas utilizadas:
- `tickets`
- `portafolio`

## Archivos incluidos

Ver `ARCHIVOS_MODIFICADOS.md`.

## Nota sobre PDF

En V0.3 los botones generan PDF con `jsPDF` y `autoTable` cargados por CDN. Si el CDN no carga, el módulo descarga CSV como respaldo. Para PWA/offline se deberá evaluar empaquetar la dependencia o mover la generación a backend.
