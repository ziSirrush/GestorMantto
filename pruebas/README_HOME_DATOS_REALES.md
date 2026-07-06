# Home sin datos precargados

Esta version elimina los datos mock/precargados del Home.

## Cambios

- Se quito la carga de `core/mock-data.js` desde `index.html`.
- Se elimino `core/mock-data.js` del paquete.
- `modules/home/home.js` ahora consulta datos reales al backend local.

## Endpoints usados por Home

- `GET http://localhost:3001/api/pendientes`
- `GET http://localhost:3001/api/notificaciones`
- `GET http://localhost:3001/api/actividad-reciente`

## Comportamiento si no hay datos reales

Si Aiven no tiene registros en esas tablas o si el backend no esta levantado, el Home muestra estados vacios:

- Sin tareas reales para mostrar.
- Sin notificaciones reales.
- Sin actividad reciente real.

No carga datos simulados.

## Nota

`actividad-reciente` queda preparado. Si no existe una tabla de actividad reciente en Aiven, el backend devuelve arreglo vacio sin romper el Home.
