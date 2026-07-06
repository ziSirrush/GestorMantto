# Pruebas V1.1.4 - Ajuste final detalle ticket

Cambios aplicados:

- Botón de cierre del detalle de ticket cambiado de "Regresar" a "×".
- Se recupera la lógica visual de Validación / Vo.Bo. dentro del detalle de ticket.
- Vo.Bo. editable para roles autorizados desde la sesión: Programador, Director, Superintendente o Supervisor.
- Vo.Bo. en solo lectura para otros perfiles.
- Guardado de Vo.Bo. contra Aiven mediante endpoint:
  - POST /api/tickets/:ticket/vobo
- El guardado actualiza en tabla `tickets`:
  - `vobo_estado`
  - `vobo_comentario`
  - `actualizado_en`
- Se conserva el panel izquierdo scrolleable, header fijo, panel derecho fijo y chat scrolleable.

Nota:
La tabla actual `tickets` no contiene columnas dedicadas para "guardado_por"; por eso el backend devuelve el usuario autenticado en la respuesta, pero la persistencia real queda en estado/comentario/actualizado_en.
