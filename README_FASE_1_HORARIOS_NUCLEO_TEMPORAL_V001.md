# FASE 1 - Nucleo temporal y timestamps internos V001

Fecha: 14/09/2026
Proyecto: Mantto Gestor
Base revisada: `Revisar lectura de horarios.zip`

## Objetivo

Cerrar la Fase 1 del alcance de horarios sin modificar la sincronizacion de Tickets ni sus datos operativos externos.

Contrato implementado:

- Los valores `DATE` en formato `YYYY-MM-DD` son fechas civiles: conservan literalmente el dia y no se convierten entre zonas horarias.
- Los `DATETIME` generados por acciones humanas/internas del Gestor se escriben como UTC canonico cuando el campo involucrado es `DATETIME`.
- Los instantes UTC internos se presentan en la zona del usuario que consulta mediante `ManttoHumanTime`.
- Se incorpora un helper central para fecha, hora y anio operativo de `America/Mexico_City`, listo para el barrido de Fase 2/Fase 3.
- El PDF de Ventas deja de agregar una `Z` artificial a un `DATETIME`; usa epoch Unix para transportar un instante absoluto.

## Correcciones principales

### 1. Fecha sin hora

`core/human-time.js` ahora distingue expresamente:

- `YYYY-MM-DD` -> fecha literal, ejemplo `2026-09-14` -> `14/09/2026`.
- `YYYY-MM-DD HH:MM:SS[.fff]` -> instante UTC interno, convertido solo al mostrarlo.
- ISO con `Z` u offset -> conserva el instante proporcionado.

Esto corrige el defecto en el que `2026-09-14` podia mostrarse como `13/09/2026 - 18:00` en Ciudad de Mexico.

### 2. Timestamps de acciones internas

Se usa `UTC_TIMESTAMP(3)` o un valor UTC canonico para escrituras `DATETIME` de:

- comentarios y Vo.Bo. de Tickets;
- validaciones de Tickets;
- comentarios de tareas;
- interacciones/auditoria de usuario;
- comentarios e historial directos de Prospeccion;
- comentarios directos de Asignacion a Redes;
- solicitudes/acciones de Soporte;
- notificaciones y marcas de lectura;
- preferencias de notificaciones.

No se cambia la zona global del pool MySQL para evitar alterar implicitamente lecturas/escrituras ajenas al alcance.

### 3. America/Mexico_City central

Se agrega `backend/src/utils/temporal.js` y se amplian los helpers frontend con:

- `mexicoCityDate()`
- `mexicoCityTime()`
- `mexicoCityYear()`
- `formatMexicoCityDateTime()`

El reemplazo general de relojes, `hoy`, reportes y calculos de negocio queda deliberadamente para Fase 2 y Fase 3.

### 4. Ventas Dashboard PDF

Los comentarios agregados al PDF ya no construyen una fecha falsa terminada en `Z` mediante `DATE_FORMAT`.

Ahora se transporta el instante con `UNIX_TIMESTAMP(vc.created_at)` y el frontend lo presenta segun la zona del visor.

## Fuera de alcance y sin cambios

- `tickets.fecha_reporte`
- `tickets.h_reporte`
- `tickets.fecha_llegada`
- `tickets.h_llegada`
- `tickets.fecha_cierre`
- `tickets.h_solucion`
- sincronizacion de Tickets;
- filtros de sincronizacion;
- comparaciones de sincronizacion;
- escrituras de datos operativos del sync;
- archivos `*sync*.js` / `*sincron*.js`;
- esquema de Aiven: no hay `ALTER`, tabla nueva ni migracion SQL;
- barrido global de `new Date()`, `CURDATE()`, `NOW()` y reportes: corresponde a Fase 2/Fase 3.

## Archivos modificados

1. `backend/src/controllers/data.controller.legacy.js`
2. `backend/src/controllers/support.controller.js`
3. `backend/src/modules/notificaciones/notificaciones.repository.js`
4. `backend/src/modules/pendientes/pendientes.repository.js`
5. `backend/src/modules/support/support-files.repository.js`
6. `backend/src/modules/tickets/tickets-notification-writes.service.js`
7. `backend/src/modules/ventas-dashboard/ventas-dashboard.repository.js`
8. `backend/src/modules/ventas-prospeccion/ventas-prospeccion.repository.js`
9. `backend/src/modules/ventas-redes/ventas-redes.service.js`
10. `backend/src/services/interactions/interactions.repository.js`
11. `backend/src/services/notifications/notification.repository.js`
12. `backend/src/services/support-solicitudes.service.js`
13. `backend/src/utils/temporal.js` (nuevo)
14. `core/human-time.js`
15. `index.html`
16. `tests/fase1_human_time_contract.test.js` (nuevo)
17. `tests/fase1_human_time_core.test.js` (nuevo)

## Validaciones ejecutadas

### Sintaxis

`node --check` sobre todos los JS modificados/nuevos: **OK**.

### Pruebas especificas de Fase 1

Comando:

```bash
node --test tests/fase1_human_time_core.test.js tests/fase1_human_time_contract.test.js
```

Resultado: **9/9 OK, 0 fallos**.

Incluye pruebas para:

- fecha literal sin desplazamiento;
- conversion de DATETIME UTC a zona de visualizacion;
- fecha/hora/anio de Ciudad de Mexico alrededor de cambio de anio;
- epoch absoluto en comentarios de PDF;
- escrituras UTC de comentarios/Vo.Bo./interacciones;
- ausencia de una configuracion global de timezone que pudiera afectar el sync.

### Validacion estructural backend

Comando:

```bash
cd backend
npm run check
```

Resultado: **OK**.

### Suite existente

Comando:

```bash
cd backend
npm test
```

Resultado del arbol con Fase 1: **36/38 OK**.

Se ejecuto tambien la misma suite sobre el ZIP base antes de la Fase 1 y entrega exactamente **36/38 OK**, con los mismos dos fallos preexistentes:

1. `la campanita muestra la accion y consume la ruta masiva`
2. `cache bust de cierre apunta a los archivos frontend corregidos`

Por lo tanto, esos dos fallos no fueron introducidos por esta Fase 1.

## Verificacion de frontera de sync

Se compararon todos los archivos cuyo nombre contiene `sync` o `sincron` entre la base y el resultado:

`SYNC_FILES_DIFFER=0`

En `backend/src/controllers/data.controller.legacy.js`, los unicos hunks de esta Fase 1 estan en comentarios/Vo.Bo. de Ticket y comentario de tarea; el bloque de sincronizacion de Tickets no fue modificado.

## Instalacion

Copiar los archivos de este ZIP sobre la raiz del proyecto respetando exactamente sus rutas.

Despues:

```bash
cd backend
npm run check
node --test ../tests/fase1_human_time_core.test.js ../tests/fase1_human_time_contract.test.js
```

Reiniciar el backend al promover el cambio porque existen archivos Node.js modificados.

No hay SQL que ejecutar.

## Rollback

Restaurar las versiones anteriores de los 14 archivos productivos existentes y eliminar `backend/src/utils/temporal.js`. Los 2 archivos de prueba nuevos pueden eliminarse al revertir.

## Estado de despliegue

Este paquete fue preparado y validado estaticamente/localmente. No se ejecuto prueba E2E contra Aiven. **No se modifico ni desplego GitHub, Aiven, Azure, GitHub Pages ni Netlify.**
