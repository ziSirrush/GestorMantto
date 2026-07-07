# Freeze RD + Equipos Críticos V0.2

## Objetivo
Corregir regresión introducida al relacionar Equipos Críticos con Proyectos.

## Cambios

### pruebas/modules/equipos-criticos/equipos-criticos.js
- Agrega fallback local `formatProyectoName()` para que Equipos Críticos no dependa de una función global de Proyectos.
- Mantiene nombres visuales de proyectos tipo `17 de Septiembre #197` sin alterar la clave real Aiven `0197-09-17`.

### backend/src/controllers/criticos.controller.js
- Reescribe la consulta de `getProyectosCriticos()` con CTEs más estables.
- Evita referencias agrupadas problemáticas al calcular equipos activos y críticos.
- Conserva rutas existentes.

## Archivos protegidos
No se modifican:
- Home
- Resumen del Día
- Portafolio
- Proyectos
- Panel lateral
- Nori
- Autenticación

## Estado
- Resumen del Día: puede congelarse como Nevera si las pruebas del usuario confirman navegación correcta hacia Proyectos.
- Equipos Críticos: queda en validación con este fix antes de congelar.
