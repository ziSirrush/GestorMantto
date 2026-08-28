# FIX_PUSH_CURSOR_ID_V001

Fecha: 27/08/2026  
Proyecto: Gestor Mantto  
Base verificada: `c7b6bba7b3be8356b5277252c0bf5d9f88980cb6` — `Update Notificaciones 082726.2 - Notificaciones`

## Problema corregido

El dispatcher Push usaba `ultimo_uso_at` como cursor temporal y consultaba un maximo configurable de notificaciones por ciclo (20 por defecto). Al terminar el lote avanzaba el cursor hasta el corte completo del ciclo. Si habia mas filas elegibles que el limite, las restantes podian quedar atras del cursor y no volver a seleccionarse.

El cursor temporal tambien era ambiguo cuando varias notificaciones del mismo usuario compartian el mismo segundo.

## Solucion

Se agrega `notificaciones_push_suscripciones.ultimo_id_notificacion` con el mismo tipo de `sup_notificaciones.id_notificacion`: `INT UNSIGNED`.

El dispatcher usa desde este fix:

- cursor monotono por `id_notificacion`;
- watermark global capturado al inicio de cada ciclo;
- lote maximo conservado en 20 por defecto;
- avance solamente hasta el ultimo ID procesado cuando todavia puede existir backlog;
- avance al watermark cuando queda confirmado que no existen mas filas elegibles en ese rango;
- conservacion del ultimo ID enviado correctamente si un envio intermedio falla;
- desactivacion 404/410 conservando el progreso ya enviado;
- limite defensivo entre 1 y 100, con fallback 20 para configuraciones invalidas.

`ultimo_uso_at` se conserva por compatibilidad y trazabilidad. Solo avanza cuando la suscripcion queda alcanzada hasta el watermark. El repositorio calcula un `cursor_id_efectivo` como maximo entre el cursor ID almacenado y el equivalente del cursor temporal legacy; esto evita retrocesos durante la transicion de despliegue.

## Migracion de datos

El SQL migra cada suscripcion existente sin volver a disparar historicos:

`ultimo_id_notificacion = MAX(id_notificacion del mismo usuario con fecha_creacion <= ultimo_uso_at/created_at)`

La columna queda `NULL` permitida para tolerar una ventana de transicion; el backend resuelve el cursor efectivo usando el estado legacy si fuera necesario. Las suscripciones nuevas se inicializan directamente en el maximo ID ya existente del usuario para no enviar historicos al registrar un dispositivo nuevo.

## Archivos incluidos

- `backend/sql/20260827_FIX_PUSH_CURSOR_ID_V001.sql`
- `backend/src/jobs/pushNotifications.job.js`
- `backend/src/modules/push-notifications/push-notifications.repository.js`
- `validation/push-cursor-id.test.js`
- `README_FIX_PUSH_CURSOR_ID_V001.md`

No se modifica:

- matriz Evento/Rol;
- politicas OBLIGATORIA/OPCIONAL;
- preferencias;
- alcance UNITED;
- emisores de Tickets;
- catalogo de eventos;
- frontend;
- Service Worker;
- VAPID;
- Netlify.

## Orden de aplicacion

1. Local/LAB: respaldar la tabla `notificaciones_push_suscripciones` o disponer de la SABANA vigente.
2. Ejecutar `backend/sql/20260827_FIX_PUSH_CURSOR_ID_V001.sql`.
3. Confirmar que `cursores_nulos = 0` y que todas las filas de la segunda verificacion indiquen `OK`.
4. Reemplazar los dos archivos backend incluidos.
5. Ejecutar las pruebas del fix y las regresiones de Push existentes.
6. Validar en Local.
7. Promover a GitHub Pages/entorno online de validacion segun el flujo del proyecto.
8. Realizar prueba Push controlada antes de cualquier despliegue manual de frontend productivo. Este fix no requiere cambio de frontend productivo.

## Pruebas especificas del fix

`validation/push-cursor-id.test.js` cubre:

- 45 pendientes: 20 + 20 + 5 sin perdida;
- 100 pendientes: cinco lotes de 20 sin perdida;
- 25 filas con la misma fecha/hora;
- fallo temporal en el ID 17 y reintento desde 17 sin duplicar 1-16;
- respuesta 410 conservando el progreso anterior;
- notificacion creada despues del watermark;
- ausencia de filas elegibles;
- configuracion invalida `WEB_PUSH_NOTIFICATIONS_PER_CYCLE=0/-5/NaN`;
- SQL del repositorio basado en IDs;
- migracion sin creacion de tabla nueva.

## Reversion

Revertir primero los dos archivos backend a la version anterior. Despues, si se desea retirar tambien el cambio de esquema:

```sql
ALTER TABLE notificaciones_push_suscripciones
DROP COLUMN ultimo_id_notificacion;
```

No ejecutar el `DROP COLUMN` mientras el backend de este fix siga desplegado.

## Limites conocidos

El cambio proporciona entrega de tipo **at-least-once**. Si el proceso se detiene abruptamente despues de que el proveedor Push acepta un mensaje pero antes de persistir el cursor, ese mensaje puede repetirse al reiniciar. El fix prioriza no perder notificaciones. La entrega exactamente una vez no puede garantizarse solamente con un cursor de base de datos frente a un proveedor Push externo.

Este fix no recupera automaticamente notificaciones que ya hubieran sido omitidas por el cursor temporal antes de la migracion; preserva el estado alcanzado por cada suscripcion para evitar reenvios historicos.

## Sistemas modificados por esta entrega

Ninguno. El ZIP es una entrega local para revision/aplicacion. No se hizo commit, no se modifico Aiven, no se desplego Azure y Netlify permanece intacto.
