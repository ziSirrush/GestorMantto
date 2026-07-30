# FIX Frontend Ventas - Filtros por visibilidad V012

- Asesor y Administrativo solo aparecen cuando el backend devuelve `visibilidad.acceso_total = true`.
- Para usuarios restringidos, ambos valores se limpian y no se envían en las consultas.
- El backend continúa siendo la autoridad del alcance; ocultar filtros es únicamente una mejora UX.
