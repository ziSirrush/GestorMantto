# ADR · EQUIPO_SALE_DE_CRITICO · Fase 1 V001

## Estado
Aprobado para implementación de Fase 1.

## Contexto
Mantto Gestor ya emite `NUEVO_EQUIPO_CRITICO` cuando un equipo cruza de menos de 3 a 3 o más fallas BLT dentro de los últimos 35 días. Dirección requiere la notificación inversa cuando un equipo deja de cumplir esa condición.

La salida de críticos puede suceder por dos causas distintas:

1. un cambio de datos en Tickets modifica el conteo actual;
2. una falla envejece y sale de la ventana U35 sin que ningún Ticket cambie.

Esta ADR cubre exclusivamente el primer mecanismo. El segundo queda reservado para Fase 2.

## Decisión
Se agrega el evento nativo general:

`EQUIPO_SALE_DE_CRITICO`

La transición se calcula **por equipo**, comparando el estado crítico previo al sync con el estado posterior al sync:

- antes `fallas BLT U35 >= 3`;
- después `fallas BLT U35 < 3`.

No se infiere la salida únicamente desde un Ticket individual.

## Cambios de Ticket que pueden provocar la transición
La Fase 1 reutiliza la frontera ya observada por el motor actual:

- `responsabilidad` deja de calificar como BLT;
- `codigo_equipo` cambia;
- `fecha_reporte` cambia y el Ticket deja de pertenecer a U35.

Un lote con movimientos compensados se evalúa por el resultado neto del equipo. Ejemplo: si una falla sale y otra entra en el mismo lote y el conteo permanece en 3, no se emite salida.

## Reglas negativas
No debe emitir el evento en:

- `4 -> 3`: el equipo sigue crítico;
- `3 -> 3`: sin transición;
- `2 -> 1`: el equipo ya no era crítico;
- cambios de Ticket que no alteren el conteo BLT U35.

## Notificación general
`EQUIPO_SALE_DE_CRITICO` usa el motor normal de Notificaciones Generales:

- `notificacion_eventos`;
- `notificacion_evento_roles`;
- política `OBLIGATORIA` / `OPCIONAL` configurada en Panel de Control;
- preferencias personales cuando la política sea opcional;
- Campana / Push según la política vigente;
- deduplicación y alcance UNITED/ZOP del motor central.

No se agregan Roles ni IDs de Roles hardcodeados.

## Contexto territorial
Si el Ticket disparador cambia de equipo, la autorización territorial y el contexto de Seguimiento Especial deben resolverse con el **equipo que dejó de ser crítico**, no con el equipo destino del Ticket.

Para navegación se conserva `ABRIR_TICKET`, porque el frontend vigente de Notificaciones tiene contrato explícito para esa acción y el Ticket modificado es el disparador auditable del cambio.

## Precedencia
Cuando `EQUIPO_SALE_DE_CRITICO` nace de un Ticket modificado, ese Ticket se reserva como ganador nativo para evitar una segunda notificación de menor precedencia por la misma mutación, siguiendo la convención existente del motor crítico.

## Fuera de alcance de Fase 1
- Scheduler / cron.
- Comparación diaria por simple paso del tiempo.
- Persistencia adicional de snapshots históricos de críticos.
- Cambios frontend.
- Modificaciones a la tabla de críticos.
- Asignación automática de Evento -> Rol.

## Fuente revisada
Repositorio `ziSirrush/GestorMantto`, rama `main`, commit base:

`f69aa5d40796c5976cf8d59eb6f6f99dbd930299` · `Version 092826.3`
