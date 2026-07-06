# Pruebas V1.1.3 - Fix detalle ticket y tiempos

Cambios aplicados:

- Detalle flotante del ticket reorganizado con estructura fija:
  - Header superior fijo.
  - Panel derecho fijo para chat/acciones.
  - Panel izquierdo independiente con scroll vertical.
  - Chat con scroll independiente cuando existan muchos comentarios.
- Correccion del calculo de tiempos:
  - Tiempo llegada se recalcula desde fecha/hora reporte hasta fecha/hora llegada cuando esos campos existen.
  - Tiempo solucion se recalcula desde fecha/hora llegada hasta fecha/hora solucion cuando esos campos existen.
  - Si no hay fechas suficientes, usa las columnas de tiempo como respaldo.
- Formato de duracion mas legible:
  - minutos
  - horas/minutos
  - dias/horas/minutos
- Se agregaron en el detalle las fechas/horas base usadas para validar el calculo.

Se conserva:

- Top 20 sin paginacion.
- Orden de tablas: Tickets, Equipos, Proyectos.
- Datos reales desde Aiven.
- Sin datos precargados.
