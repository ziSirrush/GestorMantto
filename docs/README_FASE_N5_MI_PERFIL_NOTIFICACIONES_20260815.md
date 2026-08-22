# FASE N5 - Mi Perfil > Notificaciones

Fecha: 2026-08-15  
Proyecto: Mantto Gestor  
Base funcional: N1 aplicada en Aiven + N3 Motor de Destinatarios + N4 Panel de Control > Notificaciones.  
Referencia de frontend revisada: `modules/usuarios/usuarios.js` del baseline auditado `cf6b876e08e88fa19c0ba2befffbe461d2ba3485`.

## Objetivo

Hacer que **Mi Perfil > Notificaciones** muestre exclusivamente las interacciones que estan activas para el **Rol Principal** del usuario en `notificacion_evento_roles`, respetando la politica `OBLIGATORIA` / `OPCIONAL` definida en Panel de Control.

N5 no crea una segunda pantalla de preferencias. El frontend actual ya contiene:

- boton `Personalizar notificaciones`;
- consulta `GET /api/notificaciones/preferencias`;
- controles Campana / Push / Silenciar;
- bloqueo visual de notificaciones obligatorias;
- guardado mediante `PUT /api/notificaciones/preferencias`.

Por eso el FIX minimo consiste en corregir la fuente y validacion backend de esa pantalla, sin duplicar UI ni modificar `modules/usuarios/usuarios.js`.

## Lectura en Mi Perfil

`GET /api/notificaciones/preferencias` ahora devuelve solamente eventos que cumplan simultaneamente:

1. usuario activo;
2. exactamente un `usuario_roles` activo con `principal = 1`;
3. Rol Principal activo en `roles`;
4. relacion activa `notificacion_evento_roles` para ese Rol Principal;
5. politica `OBLIGATORIA` u `OPCIONAL`;
6. evento activo en `notificacion_eventos`.

Un evento que no este habilitado para el Rol Principal **no aparece en Mi Perfil**.

Los roles secundarios no agregan eventos a la pantalla.

## Politica efectiva presentada al frontend

La matriz por rol pasa a ser la fuente de verdad de Mi Perfil:

- `OBLIGATORIA`
  - `obligatoria = 1`;
  - `configurable = 0`;
  - Campana = activa;
  - Push = activo;
  - Silenciar = desactivado.

- `OPCIONAL`
  - `obligatoria = 0`;
  - `configurable = 1`;
  - Campana y Push usan la preferencia personal si existe;
  - si no existe preferencia, usan `campana_default` y `push_default` del evento;
  - `silenciada` conserva la preferencia personal.

Los campos legacy globales `notificacion_eventos.obligatoria` y `notificacion_eventos.configurable` ya no deciden la editabilidad de una interaccion que aparece en Mi Perfil; esa decision corresponde a `notificacion_evento_roles.politica` para el Rol Principal.

## Guardado seguro

`PUT /api/notificaciones/preferencias` ahora valida nuevamente la matriz contra Aiven antes de escribir.

- Una interaccion `OPCIONAL` habilitada para el Rol Principal puede actualizar Campana / Push / Silenciar.
- Una interaccion `OBLIGATORIA` no puede modificarse desde Mi Perfil y una solicitud manual recibe 403.
- Una interaccion no habilitada para el Rol Principal tampoco puede modificarse y una solicitud manual recibe 403.
- Un payload vacio es read-only y devuelve la configuracion actual sin escribir.
- Se eliminó el patron de una consulta por evento al guardar: se carga la matriz autorizada una vez y las preferencias validas se escriben con un UPSERT masivo.

El canal `correo` no forma parte de los controles visibles acordados para N5. Durante un guardado se conserva su valor efectivo actual para no modificar accidentalmente un canal no expuesto en Mi Perfil.

## Zona Operativa

Mi Perfil no aplica un filtro por una zona concreta al listar el catalogo porque en esa pantalla no existe una entidad/notificacion de negocio con una Zona Operativa de origen.

El filtro real de Zona Operativa permanece en N3 al momento de emitir cada notificacion relacionada con un registro. N5 no relaja ni sustituye esa validacion.

Zona Administrativa continua pendiente hasta recibir la relacion correspondiente.

## Compatibilidad con N3

N5 modifica solamente la lectura/guardado de preferencias personales.

No cambia:

- `notificationService.emit(...)`;
- filtro de Rol Principal de N3;
- filtro de Zona Operativa de N3;
- Campana;
- Push;
- polling de FIX 03;
- inserciones o eventos de negocio;
- modo legacy de eventos aun no migrados al motor en tiempo de ejecucion.

Importante: un evento legacy sin fila activa para el Rol Principal puede seguir conservando temporalmente su comportamiento runtime de N3, pero **no aparece como opcion editable en Mi Perfil**. La migracion de interacciones reales se completa en N6.

## Archivos modificados

- `backend/src/services/notifications/notification.repository.js`
- `backend/src/services/notifications/notification.service.js`

No se incluye el proyecto completo.

## Cambios de BD

Ninguno.

N5 reutiliza exclusivamente:

- `usuarios`;
- `usuario_roles`;
- `roles`;
- `notificacion_evento_roles`;
- `notificacion_eventos`;
- `notificacion_preferencias`.

## Validaciones realizadas

- `node --check` correcto en ambos archivos modificados.
- Prueba aislada del servicio, sin Aiven, validando:
  - lectura de preferencias;
  - guardado de una interaccion OPCIONAL;
  - bloqueo 403 de una interaccion OBLIGATORIA;
  - bloqueo 403 de una interaccion no autorizada;
  - payload vacio sin escritura.
- Aserciones estaticas de SQL confirmando:
  - `usuario_roles.principal = 1`;
  - `notificacion_evento_roles.activo = 1`;
  - politica `OBLIGATORIA/OPCIONAL`;
  - derivacion de `obligatoria/configurable` desde la matriz.
- No se inicio el backend con credenciales reales y no se realizaron consultas contra Aiven durante la generacion.

## Prueba recomendada despues del deploy

1. Configurar desde N4 una misma interaccion como `OBLIGATORIA` para un rol y `OPCIONAL` para otro.
2. Entrar con un usuario cuyo Rol Principal tenga la politica `OBLIGATORIA`:
   - la interaccion debe aparecer;
   - los controles deben estar bloqueados;
   - Campana y Push deben aparecer activos.
3. Entrar con un usuario cuyo Rol Principal tenga la politica `OPCIONAL`:
   - la interaccion debe aparecer editable;
   - cambiar Campana/Push y guardar;
   - reabrir Mi Perfil y comprobar persistencia.
4. Entrar con un rol no habilitado para esa interaccion:
   - la interaccion no debe aparecer.
5. Confirmar que los roles secundarios no agregan interacciones a Mi Perfil.

## Siguiente fase

N6: conectar las interacciones reales al motor central, iniciando por **Comentario** y despues las tres interacciones solicitadas por Direccion, proporcionando el contexto real de relacion y Zona Operativa.
