# Gestor Mantto — FIX Notificaciones Fase 4

**Versión:** `FIX_NOTIFICACIONES_FASE_4_TICKETS_CRITICOS_V001`  
**Fecha:** 2026-08-25  
**Repo base revisado:** `ziSirrush/GestorMantto`  
**Commit base:** `0dbbdf425bd17b5f3e6ad9a018d4ec1bc51eaaee` — `3 Entornos 082526.3 - Auth`

## Objetivo

Cerrar los tres eventos críticos de Tickets usando el motor central de Notificaciones construido en Fase 1 y el emisor post-acción seguro de Fase 2:

- `FALLA_EQUIPO_CRITICO`
- `NUEVO_EQUIPO_CRITICO`
- `PERSONA_ATRAPADA`

La Fase 4 **no modifica la acción de sincronización de Tickets**. Las notificaciones se procesan únicamente después de que el sincronizador de negocio terminó correctamente.

## Prerrequisitos

Aplicar previamente:

1. `FIX_NOTIFICACIONES_FASE_1_MOTOR_CENTRAL_V001.zip`
2. `FIX_NOTIFICACIONES_FASE_2_EMISORES_TAREAS_TICKETS_SOPORTE_V001.zip`
3. Fase 3 puede coexistir y fue incluida en la regresión, aunque no es dependencia funcional de los eventos críticos.

Fase 4 requiere específicamente de Fase 2:

`backend/src/services/notifications/notification-business-emitter.service.js`

## Archivo de producción modificado

- `backend/src/services/notifications/ticket-critical-notifications_uni.service.js`

No se modifica `backend/src/controllers/data.controller.js`: su wrapper actual ya conserva la sincronización aunque falle el procesamiento posterior de notificaciones.

## Cambios

### 1. Eliminación del escritor paralelo de notificaciones

El servicio crítico deja de:

- consultar su propia matriz Evento-Rol para decidir destinatarios;
- limitarse a `ur.principal = 1`;
- aplicar preferencias por su cuenta;
- escribir directamente en `sup_notificaciones`.

Ahora delega esas decisiones al motor central mediante:

`emitBusinessEventSafe_gnral(...)`

### 2. Todos los roles activos participan

Fase 4 entrega al motor central los usuarios activos como candidatos.

El motor central decide posteriormente:

- Evento activo;
- Evento ↔ Rol activo;
- todos los roles activos del usuario;
- política `OBLIGATORIA` / `OPCIONAL`;
- exclusión del actor cuando aplique;
- alcance UNITED;
- preferencias personales autorizadas;
- Campana;
- Push;
- deduplicación.

De esta forma el servicio crítico ya no crea una segunda implementación de las reglas generales.

### 3. Alcance territorial alineado con Tickets UNITED

La zona de la notificación se obtiene desde `portafolio.zona_id`.

Reglas:

- si existe `codigo_equipo`, la zona solo se resuelve por `portafolio.numero_equipo`;
- si no existe `codigo_equipo`, `proyecto` / `proyecto_padre` deben resolver a una sola `zona_id` sin ambigüedad;
- `tickets.zona` no concede alcance por sí solo;
- si no puede resolverse una zona estructurada única, la notificación falla cerrado con `ZONA_OPERATIVA_NO_RESUELTA`.

### 4. Regla de criticidad conservada

Fase 4 **no cambia la regla de negocio existente**:

- ventana: **35 días**;
- mínimo: **3 fallas BLT**.

`FALLA_EQUIPO_CRITICO` continúa significando:

> entra un Ticket nuevo con responsabilidad BLT para un equipo que ya era crítico antes de esa sincronización.

`NUEVO_EQUIPO_CRITICO` continúa significando:

> el equipo pasa de menos de 3 a 3 fallas BLT dentro de la ventana de 35 días.

### 5. Ticket exacto que provoca `NUEVO_EQUIPO_CRITICO`

Se corrige un caso de lote.

Ejemplo:

- antes del sync: 1 falla BLT;
- el lote contiene Ticket A, Ticket B y Ticket C, todos BLT y dentro de la ventana;
- A deja el conteo en 2;
- **B deja el conteo en 3**;
- C deja el conteo en 4.

La notificación `NUEVO_EQUIPO_CRITICO` queda relacionada con **Ticket B**, no con el primer Ticket del lote.

Esto mantiene la norma de que la notificación abre la acción/registro que realmente produjo el evento.

### 6. `PERSONA_ATRAPADA`

Se conserva la detección actual por contenido del Ticket mediante las palabras existentes:

- atrapado / atrapada;
- encerrado / encerrada;
- persona/personas atrapadas;
- rescate.

El destino es el Ticket nuevo que contiene la condición detectada.

### 7. Deduplicación

Cada evento crítico usa una identidad estable:

`ticket-critical:<CODIGO_EVENTO>:ticket-id:<ID_TICKET>`

Ejemplo:

`ticket-critical:FALLA_EQUIPO_CRITICO:ticket-id:12345`

Fase 1 transforma esta identidad en `clave_deduplicacion` y evita crear nuevamente la misma notificación lógica para el mismo destinatario.

Además, el mecanismo existente de `captureBeforeSync_uni` / `loadInsertedRows_uni` continúa procesando solo Tickets realmente insertados en esa sincronización. Una resincronización del mismo Ticket no genera nuevamente los eventos críticos.

### 8. Acción y ruta

Los tres eventos usan:

- `accion = ABRIR_TICKET`
- `idReferencia = tickets.id`
- `ruta = detalle:ticket:<ticket>`

Campana y Push reciben el mismo destino lógico a través del motor central.

## Archivos auxiliares

### SQL de verificación — solo lectura

`backend/sql/20260825_VERIFICAR_NOTIFICACIONES_FASE_4_CRITICOS.sql`

Valida:

- existencia de los tres eventos;
- relaciones Evento-Rol activas;
- usuarios por roles principal y no principal;
- salud de `portafolio.zona_id`;
- equipos que actualmente cumplen 3+ BLT / 35 días;
- alcance UNITED (`DOMINIO_COMPLETO` y `usuario_zop`);
- columnas `clave_deduplicacion` y `trace_id`;
- notificaciones críticas existentes;
- posibles duplicados históricos.

El SQL no ejecuta `ALTER`, `CREATE`, `INSERT`, `UPDATE`, `DELETE`, `DROP` ni `TRUNCATE`.

## Validaciones realizadas

- `node --check` sobre el servicio crítico: OK.
- Pruebas Fase 4: **11/11**.
- Regresión Fase 1: **9/9**.
- Regresión Fase 2: **16/16**.
- Regresión Fase 3: **17/17**.
- Total conjunto: **53/53 pruebas aprobadas**.

Casos funcionales simulados en Fase 4:

- lote de tres BLT con cruce de umbral en el segundo Ticket;
- nueva falla BLT en equipo previamente crítico;
- Ticket de persona atrapada;
- resincronización de Ticket ya existente sin reemisión.

## No modificado

- No se crean tablas.
- No se alteran columnas.
- No se cambia el umbral 3 / 35 días.
- No se modifica el sincronizador legacy de Tickets.
- No se modifica Portafolio.
- No se modifica Equipos Críticos frontend.
- No se modifican Cotizaciones, Prospección o Redes.
- No se modifica la matriz Evento-Rol existente.
- No se redefine qué rol tiene una notificación obligatoria u opcional.

## Validación runtime pendiente

La revisión estática y las pruebas locales confirman la composición del código, pero **no pueden confirmar el estado real de Aiven/Railway**.

Después de aplicar Fases 1, 2 y 4, ejecutar el SQL de verificación y probar al menos:

1. Ticket BLT nuevo para un equipo con 3+ fallas BLT previas en 35 días.
2. Ticket BLT que sea exactamente la tercera falla dentro de 35 días.
3. Ticket con persona atrapada.
4. Reenvío del mismo Ticket por `/tickets/sync` para comprobar que no se duplique.
5. Usuario con rol aplicable no principal y alcance correcto.
6. Usuario con rol aplicable pero fuera de zona.
7. Usuario `DOMINIO_COMPLETO UNITED`.
8. Política obligatoria vs. opcional configurada actualmente en Panel de Control.
