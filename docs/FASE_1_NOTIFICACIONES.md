# Gestor Mantto — FIX Notificaciones — Fase 1

**Fecha:** 25/08/2026  
**Repositorio base:** `ziSirrush/GestorMantto`  
**Rama base:** `main`  
**Commit base verificado:** `0dbbdf425bd17b5f3e6ad9a018d4ec1bc51eaaee` — `3 Entornos 082526.3 - Auth`

## Objetivo

Corregir el **motor central de Notificaciones** antes de normalizar los emisores de cada módulo.

Esta fase se limita a:

- matriz Evento ↔ Rol activa y válida;
- todos los roles activos del usuario, no solo el Rol Principal;
- política `OBLIGATORIA` / `OPCIONAL` definida por rol, con `OBLIGATORIA` prevaleciendo cuando coinciden varios roles;
- alcance UNITED con la autoridad existente (`usuario_zop`) y la llave maestra existente `DOMINIO_COMPLETO`;
- exclusión explícita del actor;
- identidad persistente para deduplicación por acción real;
- `trace_id` y decisiones de diagnóstico;
- bloqueo transaccional en Panel de Control para impedir que un evento activo quede sin ningún rol activo válido.

**No normaliza todavía los emisores de Tickets, Tareas, Soporte, Equipos Críticos o Ventas.** Eso corresponde a las Fases 2 y 3.

---

## Defectos corregidos

### 1. Una fila histórica inactiva contaba como “matriz configurada”

Antes, la existencia de cualquier fila en `notificacion_evento_roles` podía hacer que el motor considerara configurado el evento, aunque la fila tuviera `activo = 0`.

Ahora una relación cuenta únicamente cuando:

- `notificacion_evento_roles.activo = 1`;
- el rol existe y está activo;
- la política es `OBLIGATORIA` u `OPCIONAL`.

### 2. El motor dependía del Rol Principal

Antes, varias decisiones de política se resolvían usando únicamente `usuario_roles.principal = 1`.

Ahora se consideran **todos los roles activos** del usuario asociados activamente al evento.

Si un usuario coincide por varios roles:

- se genera como máximo una notificación lógica;
- si cualquiera de sus roles aplicables es `OBLIGATORIA`, la política efectiva es `OBLIGATORIA`;
- solo es `OPCIONAL` cuando todos los roles aplicables son opcionales.

### 3. Alcance UNITED y llave maestra

El motor central usa las estructuras de alcance ya existentes:

- usuario normal: relación activa en `usuario_zop` para las zonas declaradas por el emisor;
- llave maestra UNITED: `usuarios_alcance_informacion` con `DOMINIO_COMPLETO` activo para `UNITED`.

Un usuario con `DOMINIO_COMPLETO` UNITED no queda excluido únicamente por no tener una fila de `usuario_zop`.

### 4. El Panel podía dejar un evento activo sin destinatarios potenciales

Después de aplicar los cambios de matriz y **antes del COMMIT**, el backend valida que cada evento activo afectado conserve al menos un rol activo válido.

Si no lo conserva:

- hace rollback;
- responde HTTP `409`;
- código: `NOTIFICATION_EVENT_REQUIRES_ACTIVE_ROLE`.

No se inventan roles ni se reactiva automáticamente ninguna relación.

### 5. No existía identidad persistente para deduplicar una acción real

Se amplía la tabla existente `sup_notificaciones`; **no se crea una tabla nueva**.

Columnas nuevas:

- `clave_deduplicacion CHAR(64) NULL`
- `trace_id CHAR(36) NULL`

Índices nuevos:

- `UNIQUE uq_sup_notif_evento_logico (id_usuario, tipo_notificacion, clave_deduplicacion)`
- `idx_sup_notif_trace (trace_id)`

La clave de deduplicación se genera mediante SHA-256 únicamente cuando el emisor entrega una **identidad explícita de la instancia de acción**.

Esto es intencional: no se deduplica solamente por Ticket/Cotización/registro, porque dos comentarios o dos cambios diferentes sobre el mismo registro son acciones legítimamente distintas.

Los emisores legacy continúan con `clave_deduplicacion = NULL` hasta ser normalizados en Fases 2 y 3. MySQL permite múltiples `NULL` en el índice `UNIQUE`, por lo que esta migración no colapsa accidentalmente notificaciones legacy existentes.

### 6. Trazabilidad central

Cada emisión gestionada por el motor central obtiene un `trace_id` y registra decisiones estructuradas con prefijo:

`[NOTIFICATION_TRACE]`

Entre los motivos explícitos implementados en esta fase están:

- `ACTOR_EXCLUIDO`
- `SIN_ROL_ASOCIADO`
- `SIN_ALCANCE`
- `PREFERENCIA_DESACTIVADA`
- `DUPLICADO_EVITADO`
- `ZONA_OPERATIVA_NO_DECLARADA`
- `USUARIO_INACTIVO_O_NO_EXISTE`

La trazabilidad es técnica; no genera notificaciones de error para los usuarios.

---

## Relación con las 15 normas cerradas

| Norma | Estado en Fase 1 | Alcance de esta fase |
|---|---|---|
| 1. Un evento = un código oficial | Base preparada | La normalización de códigos en emisores se realiza en Fases 2 y 3. |
| 2. Evento activo con ≥1 rol activo | **Implementada** | Matriz activa real + bloqueo del último rol en Panel. |
| 3. Rol + alcance real | **Parcial / base central** | UNITED usa `usuario_zop` y `DOMINIO_COMPLETO`. El alcance específico de cada registro/módulo se completará al normalizar cada emisor, porque los emisores actuales no entregan un contexto genérico suficiente para todos los dominios. |
| 4. Todos los roles activos | **Implementada** | Eliminada la dependencia funcional del Rol Principal en el motor/política central. |
| 5. Actor no se notifica a sí mismo | **Implementada en motor central** | Se excluye y se registra `ACTOR_EXCLUIDO`. |
| 6. Sin apagado técnico oculto | **Base preservada** | No se agrega ninguna bandera de desactivación; canales se resuelven por política/preferencia. |
| 7. Obligatoria/opcional por rol | **Implementada** | `OBLIGATORIA` prevalece en coincidencia multirrol. |
| 8. Aplicación de Campana/Push | **Implementada en decisión central** | Obligatoria fuerza canales; opcional respeta preferencia. Entrega final Push se termina en Fase 4. |
| 9. Una notificación lógica por acción | **Infraestructura implementada** | Persistencia e índice listos. Cada emisor normalizado deberá aportar la identidad de acción en Fases 2/3. |
| 10. Destino real | Pendiente por emisor | Fases 2 y 3. |
| 11. Acción independiente de notificación | Pendiente por emisor | Debe verificarse/moverse el hook en cada flujo en Fases 2/3. |
| 12. Notificación depende de acción exitosa | Pendiente por emisor | Fases 2/3. |
| 13. Todo evento activo tiene emisor real | Pendiente | Auditoría y conexión de emisores en Fases 2/3. |
| 14. Abrir Push limpia Campana | Pendiente | Fase 4. |
| 15. Trazabilidad completa | **Base central implementada** | `trace_id`, decisiones y motivos. Fases 2–4 completarán trazas de emisor y entrega. |

---

## Archivos para desplegar

### Nuevos

- `backend/src/services/notifications/notification-decision.js`
- `backend/sql/20260825_FIX_NOTIFICACIONES_FASE_1_MOTOR_CENTRAL.sql`

### Modificados

- `backend/src/services/notifications/notification.repository.js`
- `backend/src/services/notifications/notification-policy.js`
- `backend/src/services/notifications/notification.service.js`
- `backend/src/controllers/panel-control-notificaciones.controller.js`

### Solo validación — NO copiar al backend productivo

- `validation/notification-phase1.test.js`

---

## Orden de despliegue

1. Respaldar la estructura de `sup_notificaciones` y la configuración actual de `notificacion_evento_roles`.
2. Ejecutar `backend/sql/20260825_FIX_NOTIFICACIONES_FASE_1_MOTOR_CENTRAL.sql` en la BD del entorno correspondiente.
3. Revisar el **preflight funcional** incluido al final del SQL.
   - Resultado esperado para eventos activos sin rol válido: **0 filas**.
   - Si devuelve eventos, configurar sus roles desde Panel de Control antes de la validación integral.
4. Desplegar los cinco archivos JS del motor/controlador.
5. Reiniciar el backend.
6. Probar lectura y guardado de Panel de Control > Notificaciones.
7. Intentar desactivar el último rol de un evento activo: debe responder `409` y conservar la configuración previa.
8. Ejecutar pruebas de emisión controlada y revisar `[NOTIFICATION_TRACE]`.

---

## Validaciones realizadas sobre el paquete

### Sintaxis

`node --check` ejecutado correctamente sobre:

1. `notification-decision.js`
2. `notification.repository.js`
3. `notification-policy.js`
4. `notification.service.js`
5. `panel-control-notificaciones.controller.js`
6. `validation/notification-phase1.test.js`

**Resultado: 6/6 sin error de sintaxis.**

### Pruebas automatizadas de Fase 1

`node --test validation/notification-phase1.test.js`

**Resultado: 9/9 pruebas aprobadas, 0 fallos.**

Cobertura de las pruebas:

- obligatorio prevalece entre múltiples roles;
- opcional respeta preferencias;
- `DOMINIO_COMPLETO` UNITED funciona sin `usuario_zop`;
- usuario normal fuera de zona queda en `SIN_ALCANCE`;
- matriz exige relación y rol activos;
- política usa todos los roles activos, no solo principal;
- Panel valida el último rol antes del COMMIT;
- deduplicación/traza se persisten sin `INSERT IGNORE` genérico;
- exclusión del actor y traza explícita.

### Validaciones estáticas adicionales

- No existe `ur_policy.principal = 1` en la política central nueva.
- `notification.repository.js` no utiliza `INSERT IGNORE`; solo trata `ER_DUP_ENTRY` como deduplicación cuando existe una clave de acción.
- La detección de matriz exige `activo = 1`.

---

## Límites deliberados de Fase 1

1. **No cambia códigos legacy ni emisores.** Tickets, Tareas, Soporte, Equipos Críticos y Ventas se conectan a los códigos oficiales en Fases 2 y 3.
2. **No inventa una clave de deduplicación a partir del ID del registro.** Los emisores deberán entregar una identidad de acción al normalizarse; esto evita perder eventos distintos sobre el mismo registro.
3. **No puede completar el alcance específico de todos los dominios únicamente desde el motor central.** Hoy los emisores no proporcionan de forma homogénea agrupación/dominio/registro para ejecutar una única validación genérica. Se usa la autoridad UNITED ya existente y cada flujo completará el contexto real en su fase de normalización.
4. **No modifica el comportamiento “abrir Push = leída en Campana”.** Corresponde a Fase 4.
5. **No crea tablas nuevas.** Solo amplía `sup_notificaciones` con dos columnas e índices.
6. **No modifica automáticamente la matriz Evento ↔ Rol.** El SQL únicamente diagnostica inconsistencias.

---

## Verificación de entorno vivo

Este paquete fue construido contra el código de `main` indicado arriba y validado estáticamente/localmente.

**No puedo confirmar el estado actual de Aiven/Railway en vivo** desde estas validaciones locales. La migración incluye consultas de diagnóstico precisamente para comprobar la estructura y la Norma 2 en la base desplegada antes de continuar a Fase 2.
