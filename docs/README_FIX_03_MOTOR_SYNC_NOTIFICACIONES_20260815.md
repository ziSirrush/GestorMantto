# FIX 03 - Motor Sync / Notificaciones

Fecha: 2026-08-15
Proyecto: Mantto Gestor
Alcance: optimizacion incremental de sincronizacion global y notificaciones.

## Base verificada

- Baseline Produccion auditado: commit `cf6b876e08e88fa19c0ba2befffbe461d2ba3485`.
- `core/app.js` se reconstruyo contra el blob Produccion `ccc73603399032cba03ce6506bde08aef30259ea` antes de aplicar el FIX.
- `core/data-sync.js` permanece sin cambios; su interceptor `fetch` queda como unico interceptor automatico global de mutaciones.
- `modules/home/home.js` coincide con el blob base `3ca30b9611a24b01e17048be9b53156d3c7f0992` antes de aplicar el FIX.

## Cambios

### 1. Un solo interceptor automatico de mutaciones

Se retiro de `core/app.js` el segundo interceptor global de `window.fetch` (`installMutationRefreshSignal`).

`core/data-sync.js` conserva el interceptor automatico oficial. Los eventos manuales y especificos de modulos no se eliminan, ya que pueden transportar contexto/ruta explicita y no son un segundo interceptor global.

### 2. Polling ligero de notificaciones

Se agrega:

`GET /api/notificaciones/estado`

Respuesta:

```json
{
  "ok": true,
  "source": "aiven",
  "data": {
    "nuevas": 0,
    "ultimo_id": 0
  }
}
```

La consulta devuelve solo `COUNT(*)` y `MAX(id_notificacion)` respetando el mismo usuario y filtro de tareas utilizado por el listado existente.

### 3. Polling cada 30 segundos y solo con pestana visible

`core/app.js` cambia el intervalo de 10 s a 30 s.

- Al iniciar sesion no se dispara una consulta adicional inmediata, porque `Home bootstrap` ya carga el estado inicial de la campana.
- Si la pestana queda oculta, se detiene el timer.
- Al volver visible, se ejecuta una consulta ligera inmediata y se reinicia un unico timer de 30 s.

### 4. Listado completo solo bajo demanda

El polling automatico llama `refreshHeaderNotificationState()` y no descarga filas completas.

`refreshHeaderNotifications()` conserva la consulta completa existente y se usa al abrir la campana.

### 5. Home: consultas redundantes eliminadas

Se eliminaron las dos secuencias confirmadas donde, despues de `loadHomeData()`, se ejecutaba inmediatamente `refreshHeaderNotifications()`:

- eliminar tarea;
- crear comentario en tarea.

El bootstrap de Home ya actualiza el estado correspondiente.

### 6. Bootstrap Home

No se paralelizaron sus consultas en este FIX. La configuracion runtime real del pool de Aiven no esta confirmada, por lo que se mantiene el comportamiento secuencial para no introducir presion de conexiones sin evidencia.

### 7. Web Push

No se modifica. Este FIX optimiza solamente el polling interno de la aplicacion abierta.

## Archivos modificados

- `core/app.js`
- `modules/home/home.js`
- `backend/src/modules/notificaciones/notificaciones.routes.js`
- `backend/src/modules/notificaciones/notificaciones.controller.js`
- `backend/src/modules/notificaciones/notificaciones.service.js`
- `backend/src/modules/notificaciones/notificaciones.repository.js`

## No modificado

- `core/data-sync.js` (se conserva como motor automatico oficial).
- Home backend/bootstrap.
- Web Push.
- SSE.
- Base de datos / tablas / columnas.
- Permisos.
- Reglas de negocio.
- Modulos del FIX 04 al FIX 09.

## Validaciones realizadas

- `node --check core/app.js` OK.
- `node --check modules/home/home.js` OK.
- `node --check` en routes/controller/service/repository de Notificaciones OK.
- Se verifico que en `core` quede un solo interceptor automatico de `window.fetch`: `core/data-sync.js`.
- Se verifico consistencia de nombres `getEstadoNotificaciones` entre route -> controller -> service -> repository.
- Se verifico que el listado completo `/api/notificaciones?estado=nuevas&limit=30` permanezca bajo demanda al abrir la campana.
- Se verifico que ya no existan los dos `refreshHeaderNotifications()` redundantes posteriores a `loadHomeData()` identificados en Home.

## Validacion posterior al deploy

1. Reiniciar/deployar backend.
2. Confirmar `/api/health` en el entorno desplegado.
3. Con sesion valida, confirmar `GET /api/notificaciones/estado` HTTP 200.
4. En Network, con la pestana visible, confirmar una consulta ligera aproximadamente cada 30 s y no una lista completa cada 10 s.
5. Ocultar la pestana por mas de 30 s y confirmar ausencia de polling; volver y confirmar una consulta ligera inmediata.
6. Abrir la campana y confirmar que ahi si se solicita el listado completo.
7. Crear/comentar/eliminar una tarea y confirmar que no aparece una consulta completa redundante inmediatamente despues de `/api/home/bootstrap`.
8. Confirmar Web Push sin cambios.

`/api/health` y el comportamiento Network del entorno desplegado no pueden confirmarse desde este paquete local; deben validarse despues del deploy.
