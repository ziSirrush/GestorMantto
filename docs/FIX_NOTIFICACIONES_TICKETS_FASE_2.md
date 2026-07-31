# FIX Notificaciones Tickets - Fase 2

## Alcance

Alineación de los estados de Validación / Vo.Bo. enviados desde Resumen del Día con los estados admitidos por el endpoint backend de Tickets.

La entrega es acumulativa e incluye el controlador corregido en la Fase 1 para conservar el flujo completo de notificaciones.

## Archivos incluidos

- `backend/src/controllers/data.controller.legacy.js`
  - Archivo acumulativo de la Fase 1.
  - Conserva destinatarios obligatorios, responsables relacionados, administrativos relacionados, exclusión del autor y deduplicación.

- `modules/resumen-dia/resumen-dia.js`
  - Se reemplazaron los estados no admitidos por el backend.
  - Estados disponibles: `Pendiente`, `Validado`, `Rechazado`.

## Causa corregida

Resumen del Día enviaba estos estados adicionales:

- `Rechazado con observaciones`
- `Requiere información adicional`
- `Escalado a superior`

El backend solo acepta:

- `Pendiente`
- `Validado`
- `Rechazado`

Cuando se seleccionaba uno de los estados adicionales, el endpoint respondía HTTP 400, no actualizaba el Vo.Bo. y no generaba la notificación correspondiente.

## Validaciones realizadas

- Sintaxis JavaScript del controlador backend: correcta con `node --check`.
- Sintaxis JavaScript de `resumen-dia.js`: correcta con `node --check`.
- Confirmación de que frontend y backend utilizan exactamente los mismos tres estados.
- Confirmación de que no se modificaron rutas, tablas, estilos ni módulos ajenos.
- Confirmación de que el paquete conserva la Fase 1 de manera acumulativa.

## Pruebas funcionales recomendadas

1. Comentar un ticket con un usuario relacionado distinto al autor.
2. Guardar Vo.Bo. como `Validado`.
3. Guardar Vo.Bo. como `Rechazado` con comentario.
4. Confirmar que el autor no reciba su propia notificación.
5. Confirmar que los destinatarios obligatorios y relacionados reciban una sola notificación.
6. Abrir campana e histórico para comprobar lectura y navegación.
