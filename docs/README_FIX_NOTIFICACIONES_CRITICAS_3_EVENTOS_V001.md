# FIX NOTIFICACIONES CRITICAS · 3 EVENTOS · V001

## Base

- Repositorio base revisado: `ziSirrush/GestorMantto`, rama `main`.
- Se tomó como referencia funcional la FASE N6 acumulada del paquete `Fixes 0815.zip`.
- No se modifica la matriz Evento -> Rol -> Política desde este FIX.

## Interacciones programadas

1. `FALLA_EQUIPO_CRITICO`
   - Solo sobre tickets realmente nuevos.
   - Responsabilidad contiene BLT.
   - El equipo ya tenía al menos 3 fallas BLT en los últimos 35 días antes del lote.

2. `PERSONA_ATRAPADA`
   - Solo sobre tickets realmente nuevos.
   - Reutiliza el criterio vigente sobre `descripcion`, `causa` y `accion_en_cierre`.
   - Términos: atrapado/a, encerrado/a, persona(s) atrapada(s), rescate.

3. `NUEVO_EQUIPO_CRITICO`
   - Solo sobre tickets realmente nuevos.
   - Detecta transición de menos de 3 a 3 o más fallas BLT dentro de 35 días.
   - Se emite una sola interacción por equipo en esa transición del lote.

## Política y destinatarios

No hay nombres de Roles ni IDs de Roles hardcodeados.

La elegibilidad se obtiene de:

- `notificacion_evento_roles`: interacción + Rol Principal + política.
- `usuario_roles`: únicamente Rol Principal activo.
- `usuario_zop`: Zona Operativa autorizada.
- `notificacion_preferencias`: solo cuando la política es `OPCIONAL`.

Reglas:

- Sin configuración activa en `notificacion_evento_roles`: no se envía.
- `OBLIGATORIA`: Campana + Push, independientemente de preferencias personales.
- `OPCIONAL`: respeta Campana, Push y Silenciada.
- Sin Zona Operativa resoluble: no se envía.

## Estabilidad del sync

`data.controller.legacy.js` NO se modifica.

La fachada `data.controller.js` envuelve únicamente `syncTickets`:

1. toma una fotografía del estado crítico antes del sync;
2. ejecuta el `syncTickets` legacy sin modificarlo;
3. únicamente si el sync terminó con `ok: true`, identifica qué tickets fueron realmente insertados;
4. genera las tres interacciones;
5. si falla Notificaciones, el Ticket ya sincronizado se conserva y la respuesta expone `notificaciones_criticas_error`.

## Catálogo SQL

`backend/sql/20260817_fix_notificaciones_criticas_3_eventos.sql` actualiza SOLO los tres registros ya existentes de `notificacion_eventos`:

- icono;
- título/mensaje base;
- prioridad;
- `ABRIR_TICKET`;
- defaults Campana/Push.

No crea tablas, no altera columnas y no escribe `notificacion_evento_roles`.

## Archivos del FIX

### Nuevos

- `backend/src/services/notifications/ticket-critical-notifications_uni.service.js`
- `backend/src/services/notifications/notification-policy.js`
- `backend/sql/20260817_fix_notificaciones_criticas_3_eventos.sql`

### Modificados

- `backend/src/controllers/data.controller.js`
- `backend/src/modules/notificaciones/notificaciones.repository.js`
- `backend/src/modules/home/home.repository.js`
- `backend/src/modules/push-notifications/push-notifications.repository.js`

## Orden de aplicación

1. Copiar los archivos conservando las rutas.
2. Ejecutar `backend/sql/20260817_fix_notificaciones_criticas_3_eventos.sql` en Aiven.
3. Reiniciar/desplegar backend.
4. Configurar desde Panel de Control > Notificaciones los Roles Principales y su política para cada una de las tres interacciones.
5. Probar los tres casos reales.

## Validación local

Se valida sintaxis de todos los `.js` incluidos mediante `node --check`.

No se ejecutan consultas contra Aiven durante la generación del paquete, por lo que el comportamiento en producción debe confirmarse después del deploy y las pruebas funcionales.
