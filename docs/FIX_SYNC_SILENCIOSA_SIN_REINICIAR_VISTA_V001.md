# FIX Sync silenciosa sin reiniciar vista V001

## Problema localizado

`core/data-sync.js` resolvia automaticamente cualquier funcion `refresh`, `reload`, `load` o `init` del modulo activo. En varios modulos esas funciones reconstruyen la vista completa, reemplazan la tabla por un estado de carga y reinician el trabajo visual del usuario.

Los disparadores afectados eran:

- Regresar mediante Back.
- Restaurar navegacion.
- Volver a la pestana despues de 30 segundos.
- Recuperar conexion.
- Polling de respaldo cada 60 segundos.
- Operaciones exitosas POST, PUT, PATCH o DELETE.
- Cambios recibidos desde otra pestana.

## Cambios aplicados

### `core/data-sync.js`

- El esquema automatico ya no invoca funciones generales `refresh`, `reload`, `load` o `init`.
- Solo ejecuta contratos explicitos de sincronizacion silenciosa:
  - `backgroundSync`
  - `syncInBackground`
  - `refreshSilent`
  - handlers registrados mediante `ManttoDataSync.register()`.
- Si un modulo aun no tiene adaptador silencioso, se emite `mantto:background-sync-request`, pero no se reconstruye su vista.
- Se conserva el polling de 60 segundos, la revalidacion al regresar, la recuperacion de conexion y la comunicacion entre pestanas, pero sin recarga visual completa.
- Despues de una mutacion se sincroniza solamente la ruta relacionada; ya no se fuerza una segunda recarga general de la ruta activa.

### `modules/ventas-dashboard/ventas-dashboard.js`

- Se agrego `backgroundSync()` usando la carga silenciosa que el modulo ya tenia.
- Se evita duplicar la consulta cuando el servicio general ya atiende el evento de mutacion.
- El fallback anterior queda disponible si `ManttoDataSync` no esta cargado.

### `modules/ventas-vendidos/ventas-vendidos.js`

- Se agrego una carga silenciosa que conserva:
  - filtros actuales;
  - texto de busqueda;
  - pagina actual;
  - navegacion;
  - scroll general de la vista.
- La sincronizacion silenciosa no muestra loader, no limpia la tabla y no cambia el estado tecnico visible.
- Si la respuesta no cambio, no se toca el DOM.
- Si la consulta silenciosa falla, se conserva la informacion ya visible y solo se registra una advertencia en consola.

### `index.html`

- Se actualizaron exclusivamente los identificadores de version de los tres JavaScript modificados para evitar que el navegador reutilice archivos anteriores desde cache.
- Se conservaron las referencias restauradas del Dashboard Ventas y las tres fases del Visor de Usuarios.

## Archivos modificados

- `core/data-sync.js`
- `modules/ventas-dashboard/ventas-dashboard.js`
- `modules/ventas-vendidos/ventas-vendidos.js`
- `index.html`

## Validaciones realizadas

- `node --check` en los tres archivos JavaScript.
- Confirmacion de que `core/data-sync.js` ya no usa como fallback automatico `refresh`, `reload`, `load` ni `init`.
- Confirmacion de una sola referencia en `index.html` para cada archivo modificado.
- Comparacion de `index.html`: solo tres cambios de cache-buster, sin lineas funcionales eliminadas.
- No se modifico backend, base de datos, permisos, timers ni modulos en Nevera.

## Alcance

El fix elimina la regresion que reiniciaba la pantalla. Dashboard Ventas y Vendidos ya cuentan con sincronizacion silenciosa real. Los demas modulos quedan protegidos contra recargas completas automaticas y podran registrar su adaptador silencioso de forma incremental sin tocar sus reglas de negocio.

## Despliegue

Solo requiere publicar el frontend. No requiere SQL ni despliegue de backend.
