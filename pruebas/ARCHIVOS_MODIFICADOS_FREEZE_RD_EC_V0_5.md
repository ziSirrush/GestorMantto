# Freeze RD + Criticos V0.5

## Objetivo
Corregir la tabla **Proyectos Criticos** dentro del modulo Equipos Criticos.

## Cambio aplicado
- `pruebas/modules/equipos-criticos/equipos-criticos.js`
  - Proyectos Criticos deja de depender del endpoint `/api/proyectos-criticos`.
  - El calculo se hace en frontend, siguiendo la logica de Desarrollo:
    - obtiene tickets reales desde `/api/tickets`;
    - obtiene portafolio real desde `/api/portafolio/equipos`;
    - filtra tickets BLT dentro del periodo configurado;
    - agrupa por proyecto;
    - calcula equipos activos, fallas BLT, equipos con falla, equipos criticos y ultimo BLT;
    - conserva paginacion y boton Ver hacia modulo Proyectos.

## Protecciones
- No se modifica Resumen del Dia.
- No se modifica Portafolio.
- No se modifica Proyectos.
- No se modifica Home.
- No se modifica backend.
