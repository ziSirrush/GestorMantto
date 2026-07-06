# Fix Resumen del Día - detalle y navegación

Cambios aplicados:

- El módulo Resumen del Día ya no envía el clic de un ticket directamente al módulo Tickets.
- Al hacer clic en un ticket dentro de Resumen, se abre un detalle interno estable del ticket.
- El detalle incluye datos generales, reporte/atención, diagnóstico, tiempos y clasificación.
- Los botones relacionados del detalle conservan la navegación correcta:
  - Abrir módulo Tickets -> En construcción si Tickets aún no está integrado.
  - Abrir equipo -> Portafolio / En construcción si Portafolio aún no está integrado.
  - Abrir proyecto -> Proyectos / En construcción si Proyectos aún no está integrado.
- Se mantiene la regla: ningún destino pendiente debe redirigir a Resumen del Día.
- Se conserva Aiven como única fuente de datos.

Notas:

- Este fix no integra todavía el módulo completo de Tickets.
- Este fix solo corrige el ecosistema mínimo que Resumen necesita para no crashear al abrir detalles.
- Cada módulo seguirá encapsulado en su carpeta para evitar conflictos de funciones globales.
