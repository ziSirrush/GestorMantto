# FASE N6 — Interacciones reales de Notificaciones

**Proyecto:** Mantto Gestor  
**Fecha:** 2026-08-15  
**Base funcional:** N1 + N2 + N3 + N4 + N5  
**Objetivo:** conectar interacciones reales al motor central sin ampliar el acceso del usuario.

## Alcance aplicado

N6 conecta al motor central cuatro códigos de interacción:

- `COMENTARIO`
- `FALLA_EQUIPO_CRITICO`
- `PERSONA_ATRAPADA`
- `NUEVO_EQUIPO_CRITICO`

### Comentario

Se unifica el código de interacción a `COMENTARIO` para los flujos que ya generaban notificación en el proyecto:

- comentario de Ticket;
- comentario de Tarea (un adjunto sin texto conserva temporalmente su flujo legacy);
- comentario de Solicitud de Soporte.

No se agregaron de forma automática notificaciones a módulos de comentarios que antes no notificaban, porque cada uno requiere confirmar su relación real con usuarios. Tampoco se convirtió un adjunto sin comentario en la interacción `COMENTARIO`. Esto evita inventar destinatarios o significados.

Para `COMENTARIO`, el módulo entrega únicamente usuarios ya relacionados con la entidad y N3 aplica después:

`Relacionado -> Rol Principal habilitado -> Zona Operativa cuando aplica -> Política -> Campana/Push`.

Para los tres eventos críticos, N6 entrega como candidatos a los usuarios activos y N3 reduce estrictamente por **Rol Principal configurado + Zona Operativa autorizada + Política**. Así la matriz puede definir qué Roles reciben una alerta de zona sin agregar relaciones manuales por ticket.

### Falla en Equipo Crítico

Se evalúa únicamente sobre un **ticket nuevo insertado** por `syncTickets`:

- responsabilidad contiene `BLT`;
- el equipo ya tenía al menos 3 fallas BLT en los últimos 35 días **antes del lote**;
- el equipo pertenece al Portafolio operativo.

El ticket que hace que el equipo alcance por primera vez el umbral no se considera "Falla en Equipo Crítico"; genera `NUEVO_EQUIPO_CRITICO`.

### Persona Atrapada

La estructura actual de `tickets` no tiene una columna dedicada `tipo_evento`/`persona_atrapada`. N6 **no crea una columna nueva**. Reutiliza la clasificación que ya usa Atención Prioritaria/estados visuales sobre:

- `descripcion`
- `causa`
- `accion_en_cierre`

con los términos vigentes:

`atrapado`, `atrapada`, `encerrado`, `encerrada`, `persona atrapada`, `personas atrapadas`, `rescate`.

El pool incluye a los usuarios activos —por lo que el usuario asignado queda contemplado— y N3 conserva únicamente quienes tengan el **Rol Principal habilitado** y acceso a la **Zona Operativa** del ticket. Un Rol no marcado en N4 no recibe el evento.

### Nuevo Equipo Crítico

Se calcula la transición dentro de la misma transacción del sync:

- estado antes del lote: `< 3` fallas BLT / 35 días;
- estado después de insertar tickets válidos: `>= 3` fallas BLT / 35 días;
- se genera **una sola interacción por equipo en esa transición**.

No se agregó una tabla de persistencia. La transición se obtiene comparando estado antes/después del lote. Reprocesar los mismos tickets como UPDATE no vuelve a generar el evento.

## Seguridad de la matriz

Los cuatro eventos N6 se invocan con `requireRoleMatrix=true`.

Eso significa:

- si el evento todavía no existe en `notificacion_eventos`, se omite sin romper la operación;
- si existe pero no tiene ninguna relación en `notificacion_evento_roles`, se omite;
- **N6 nunca cae al flujo legacy para estos cuatro eventos**;
- una vez configurado al menos un Rol desde Panel de Control, N3 aplica Rol Principal y política.

## Zona Operativa

- Ticket y eventos críticos: se resuelve `zona_id` usando `tickets.zona` y/o `portafolio.zona_operativa` contra `z_op`.
- Tarea con Proyecto/Equipo: intenta resolver Zona Operativa desde Portafolio.
- Tarea sin Proyecto/Equipo: se declara explícitamente `zonaOperativaNoAplica=true` porque la relación de la tarea es el alcance.
- Soporte: `zonaOperativaNoAplica=true` porque la Solicitud de Soporte no usa el dominio de Portafolio.
- Si una entidad operativa declara Proyecto/Equipo pero no puede resolverse su zona, N3 falla cerrado y no envía.
- Zona Administrativa continúa fuera de alcance hasta recibir la tabla indicada por Joseph.

## Estabilidad del sync de Tickets

Las notificaciones de los tres nuevos disparadores se ejecutan bajo un `SAVEPOINT` dentro de `syncTickets`.

Si la capa de notificaciones presenta un error inesperado:

- se revierten solamente las notificaciones N6 del lote;
- los tickets válidos del lote se conservan;
- la respuesta incluye `notificaciones_n6_error` para diagnóstico.

Esto evita que una falla del canal de notificaciones detenga la sincronización operativa de Tickets.

## Archivo SQL

`backend/sql/20260815_n6_notificacion_eventos.sql`

Registra los cuatro eventos del catálogo si todavía no existen. Si un código ya existe, el SQL lo conserva sin sobreescribir su configuración actual. **No cambia el esquema y no crea relaciones Evento-Rol.**

Debe ejecutarse antes de configurar los cuatro eventos en **Panel de Control > Notificaciones**.

Después, configurar en N4 qué Roles Principales tienen cada interacción y su política `OBLIGATORIA`/`OPCIONAL`.

## Archivos modificados

1. `backend/src/services/notifications/notification.service.js`
2. `backend/src/controllers/data.controller.legacy.js`
3. `backend/src/services/support-solicitudes.service.js`
4. `backend/sql/20260815_n6_notificacion_eventos.sql` (nuevo, configuración de catálogo)

## No modificado

- esquema de Aiven;
- `notificacion_evento_roles`;
- Panel de Control N4;
- Mi Perfil N5;
- frontend;
- Validaciones/Vo.Bo. legacy;
- adjuntos de Soporte;
- reglas de Zona Administrativa;
- módulos de comentarios que todavía no tienen una regla de destinatarios notificados confirmada.

## Validaciones locales requeridas y realizadas al generar el paquete

- `node --check` de los tres JS modificados;
- comprobación de que N6 usa `COMENTARIO` en Ticket/Tarea/Soporte;
- comprobación de que los tres eventos críticos se disparan solamente desde filas nuevas insertadas;
- comprobación de `requireRoleMatrix=true`;
- comprobación de `SAVEPOINT` para no romper sync de Tickets;
- comprobación de que no hay `ALTER TABLE`, `DROP TABLE` ni creación de tablas en el SQL N6.

## Prueba funcional después del deploy

1. Ejecutar el SQL de catálogo y confirmar las cuatro filas.
2. Entrar a Panel de Control > Notificaciones y habilitar al menos un Rol Principal de prueba para cada interacción.
3. Probar un comentario sobre una entidad donde dos usuarios estén relacionados y en la misma Zona Operativa; el actor no debe recibir su propia notificación.
4. Repetir con un usuario relacionado pero de otra Zona Operativa; no debe recibirla.
5. Insertar un nuevo ticket BLT sobre un equipo que ya sea crítico; debe generarse `FALLA_EQUIPO_CRITICO`.
6. Insertar un ticket que coincida con el clasificador vigente de Persona Atrapada; debe generarse `PERSONA_ATRAPADA`.
7. Llevar en prueba un equipo de 2 a 3 fallas BLT dentro de 35 días; debe generarse una sola vez `NUEVO_EQUIPO_CRITICO`.
8. Reprocesar ese mismo ticket como UPDATE; no debe volver a generar la transición.

**No puedo confirmar el comportamiento contra Aiven de producción hasta desplegar los archivos, ejecutar el SQL de catálogo y configurar la matriz de Roles en N4.**
