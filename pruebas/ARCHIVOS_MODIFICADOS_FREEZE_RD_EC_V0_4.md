# Freeze RD + Criticos V0.4

## Archivos modificados

- backend/src/controllers/criticos.controller.js

## Corrección

- Se simplifica y corrige la consulta de Proyectos Críticos para agrupar desde `portafolio` como fuente de proyectos y cruzar tickets por `codigo_equipo = numero_equipo`.
- No se modifica Resumen del Día.
- No se modifica Home.
- No se modifica Portafolio.
- No se modifica el frontend de Equipos Críticos porque el problema estaba en la respuesta del backend para `/api/proyectos-criticos`.

## Criterio conservado

- Proyecto crítico: suma mínima de fallas BLT en el periodo configurado.
- Equipo crítico dentro del proyecto: mínimo configurable de fallas BLT por equipo.
