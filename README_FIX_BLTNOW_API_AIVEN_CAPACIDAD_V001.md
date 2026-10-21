# BLT NOW — FIX_API_AIVEN_CAPACIDAD_RECUPERACION_V001

**Fecha:** 20/10/2026 (America/Mexico_City)  
**Alcance:** mitigacion de agotamiento de conexiones Aiven MySQL y recuperacion de jobs omitidos.  
**Base de codigo verificada:** `ziSirrush/GestorMantto`, rama `main`, commit `8ab10fc583a6e8cd5539a88f838ad6a03584015b` (version 102026.12).

## Incidente y limites del diagnostico

Azure reporto errores MySQL `ER_CON_COUNT_ERROR` / `errno=1040` / `Too many connections`, incluso durante `SELECT NOW()`. El servidor Node.js llegaba a escuchar en puerto 8080, pero no podia completar consultas que requieren Aiven. En el inicio sin conexion, varios jobs quedaron sin arrancar.

**Confirmado:** la base rechazaba nuevas conexiones. **No confirmado:** que cliente o proceso genero o retuvo las conexiones. Este FIX **no puede liberar sesiones de otros clientes** ni aumentar por si solo `max_connections` de Aiven. Si Aiven permanece al limite, la API puede continuar devolviendo 503 hasta que se recupere capacidad.

La version 102026.12 **ya** habia reducido el pool a un maximo de **2 conexiones por instancia y 1 ociosa**. Este FIX **preserva** dicha contencion; no sustituye ni deshace el hotfix existente.

## Cambios completos entregados

| Ruta dentro del ZIP | Estado | Alcance |
|---|---|---|
| `backend/src/config/db.js` | Modificado | Mantiene cap 2/idle 1; cola de solicitudes finita (30 por defecto), cortacircuito tras error 1040/1203 y propagacion de 503. El guard permanece activo incluso con telemetria desactivada. |
| `backend/src/config/db-capacity-guard.js` | Nuevo | Cortacircuito en memoria por proceso: backoff 5-30 s, clasificacion 1040/1203 y cola llena, sin alterar consultas ni datos. |
| `backend/src/middleware/error.middleware.js` | Modificado | Cabecera `Retry-After` en respuestas 503 recuperables. Sin exponer secretos. |
| `backend/src/bootstrap.js` | Modificado | Si la DB falla al inicio, la API sigue en escucha y reintenta la habilitacion de jobs una sola vez al recuperar MySQL (30 s, 60 s, 120 s, hasta 300 s). Cancela el temporizador al cerrar. |
| `tests/db_connection_emergency_cap.test.js` | Modificado | Mantiene pruebas existentes y agrega validacion de saturacion, recuperacion, middleware y bootstrap sin conexiones reales. |

No cambian SQL, tablas, columnas, roles, permisos, alcance de datos, endpoints ni frontends. No se incluyen instaladores, scripts para aplicar el fix ni archivos `.patch`.

## Configuracion conservada / nueva

- `DB_CONNECTION_LIMIT_CAP`: **2** por defecto (desde version 102026.12; se respeta).
- `DB_MAX_IDLE_CONNECTIONS`: **1** por defecto (se respeta).
- `DB_IDLE_TIMEOUT_MS`: **30000** por defecto (se respeta).
- `DB_QUEUE_LIMIT`: valores 1-100; cuando no existe, es invalido o es **0**, ahora usa **30** en lugar de cola ilimitada para evitar consumo de memoria por espera masiva.
- `DB_CONNECTION_PRESSURE_BACKOFF_MS`: **5000** ms por defecto.
- `DB_CONNECTION_PRESSURE_MAX_BACKOFF_MS`: **30000** ms por defecto.

**Consideracion operacional:** con 2 conexiones y cola finita puede haber respuestas 503 por exceso temporal de solicitudes aun cuando MySQL funcione. Eso es deliberado para contener sobrecarga. Reintentar segun `Retry-After`; **no repetir automaticamente escrituras POST/PATCH con resultado incierto**, porque podria duplicarlas.

## Integracion y verificaciones

1. Trabajar primero en una copia local del repositorio correspondiente al commit base o verificar los cambios concurrentes del `main` antes de sustituir archivos. Conservar respaldo de los cinco destinos.
2. Copiar los archivos **completos** del ZIP sobre sus rutas homonimas del repositorio. No ejecutar instaladores ni aplicar parches.
3. Desde la raiz del proyecto, ejecutar `node --test tests/db_connection_emergency_cap.test.js`.
4. Ejecutar `cd backend`, luego `npm run check` y `npm test` con dependencias instaladas.
5. Validar en entorno de pruebas con un pool MySQL de laboratorio; revisar arranque, GET `/api/health`, autenticacion, datos operativos y reinicio/reanudacion de jobs. Verificar HTTP 503 + `Retry-After` bajo saturacion.
6. Solo tras validacion y autorizacion expresa, considerar una promocion controlada a Azure. **No se desplego nada desde esta entrega.**

## Diagnostico indispensable en Aiven (solo lectura)

Al poder conectarse con privilegios suficientes, revisar:

```sql
SHOW GLOBAL VARIABLES LIKE 'max_connections';
SHOW GLOBAL STATUS LIKE 'Threads_connected';
SHOW GLOBAL STATUS LIKE 'Max_used_connections';
SHOW FULL PROCESSLIST;
```

Revisar en Aiven tambien graficas de conexiones, conexiones por usuario/host, procesos `Sleep`, clientes externos y el numero de instancias simultaneas de Azure. No ejecutar `KILL`, modificar el plan o reiniciar Aiven sin determinar impacto y autorizacion.

## QA de esta entrega

- `node --check` de 5 JS: aprobado.
- `node --test tests/db_connection_emergency_cap.test.js`: **12/12 pruebas locales aisladas aprobadas** (MySQL y Azure simulados).
- Confirmacion de base GitHub por SHA de archivos antes de editar: `db.js`, `bootstrap.js`, `error.middleware.js`.
- **NO realizadas:** consultas reales Aiven, pruebas E2E, `npm run check` de repositorio completo, despliegues, comprobacion de recuperacion de conexiones externas ni operacion productiva.
- Los errores de `Object.freeze(ManttoHttp)` en adaptadores offline son otro problema **independiente**: fuera del alcance de este fix de API/DB.

## Sistemas modificados por esta entrega

**Solo se crearon archivos del FIX en el contenedor de trabajo.** GitHub, Aiven, Azure y Netlify **no se modificaron**.
