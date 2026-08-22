# FIX PUNTO 4 — Home Snapshot Operativo V001

**Fecha:** 17/08/2026  
**Proyecto:** Mantto Gestor  
**Base principal:** `ziSirrush/GestorMantto` · `main` · HEAD `1fe9c7ca3ab05b9d5653cf9ec30ac98204220535`  
**Base complementaria:** `Fixes 0815(1).zip` · `README_FIX_03_MOTOR_SYNC_NOTIFICACIONES_20260815.md`

## Objetivo

Separar el flujo operativo de Home de los datos administrativos/de baja volatilidad y del listado completo de Notificaciones.

Antes, `GET /api/home/bootstrap` reunía en una sola carga:

- pendientes;
- notificaciones nuevas;
- notificaciones abiertas;
- actividad reciente;
- áreas;
- empresas;
- usuarios;
- proyectos.

El Home operativo ya no necesita descargar todo ese universo para pintar la pantalla inicial.

## Arquitectura aplicada

### 1. Snapshot operativo de Home

Se agrega:

`GET /api/home/snapshot`

Devuelve únicamente:

- `pendientes` visibles para el usuario efectivo;
- `actividad_reciente`.

Estas dos consultas son independientes y se ejecutan con `Promise.all` controlado.

La configuración actual del pool verificada en el repo es:

- `waitForConnections: true`;
- `connectionLimit: DB_CONNECTION_LIMIT || 10`;
- `queueLimit: DB_QUEUE_LIMIT || 0`.

Por ello solo se paralizan estas **dos** consultas del snapshot; no se paraleliza indiscriminadamente el bootstrap completo.

### 2. Catálogos administrativos bajo demanda

Home deja de recibir catálogos desde el flujo inicial.

Al abrir Crear/Editar Tarea se conserva el endpoint existente:

`GET /api/pendientes/catalogos`

El frontend ya tenía esta carga diferida y se reutiliza; no se crea otro endpoint de catálogos.

### 3. Notificaciones separadas del snapshot

Se incorpora del FIX 03 de `Fixes 0815` el endpoint ligero:

`GET /api/notificaciones/estado`

Entrega únicamente:

- `nuevas`;
- `ultimo_id`.

Home obtiene para su rail únicamente:

`GET /api/notificaciones?estado=abiertas&limit=5`

La lista completa de nuevas continúa bajo demanda al abrir la campana:

`GET /api/notificaciones?estado=nuevas&limit=30`

### 4. Polling de Notificaciones

Se conserva el criterio de `Fixes 0815`:

- intervalo de 30 segundos;
- solo pestaña visible;
- al volver a visible, consulta ligera inmediata;
- sin descargar la lista completa periódicamente;
- un único interceptor automático global de mutaciones en `core/data-sync.js`.

`core/app.js` ya no instala un segundo interceptor de `window.fetch`.

### 5. Bootstrap anterior

`GET /api/home/bootstrap` **se conserva por compatibilidad**, pero `modules/home/home.js` ya no lo consume en el flujo operativo normal.

No se elimina todavía para evitar romper consumidores históricos/documentación no migrada. Su retiro futuro deberá hacerse solo después de confirmar que ningún consumidor externo lo utiliza.

## Archivos modificados

- `backend/src/modules/home/home.service.js`
- `backend/src/modules/home/home.controller.js`
- `backend/src/modules/home/home.routes.js`
- `backend/src/modules/notificaciones/notificaciones.routes.js`
- `backend/src/modules/notificaciones/notificaciones.controller.js`
- `backend/src/modules/notificaciones/notificaciones.service.js`
- `backend/src/modules/notificaciones/notificaciones.repository.js`
- `core/app.js`
- `modules/home/home.js`
- `index.html`

## Archivos expresamente no modificados

- `core/data-sync.js`
- estructura/SQL de Aiven
- permisos
- Panel de Control
- Web Push
- SSE
- módulos United/Corellian ajenos a Home/Notificaciones
- módulos en Nevera

## Compatibilidad con Fixes 0815

De `Fixes 0815(1).zip` se tomó únicamente el bloque técnico de `README_FIX_03_MOTOR_SYNC_NOTIFICACIONES_20260815.md` que corresponde a este trabajo:

- eliminación del segundo interceptor automático de mutaciones;
- polling de 30 s;
- endpoint ligero de estado;
- listado completo bajo demanda;
- eliminación de dos refresh redundantes de Home.

No se reescriben dentro de este FIX las fases funcionales N2–N6 ni cambios de Cobranza/Portafolio no relacionados.

## Validaciones realizadas

### Base

Se verificó que los archivos de Home/Notificaciones usados como fuente del repo coinciden por blob con `main` antes de modificarlos.

### Sintaxis

`node --check` PASS en todos los JS modificados.

### Backend

`npm run check` PASS sobre un árbol completo con el FIX superpuesto.

### Pruebas mock

PASS:

1. `/home/snapshot` consulta únicamente Pendientes + Actividad.
2. No consulta Empresas, Notificaciones ni catálogos administrativos.
3. La respuesta de snapshot no contiene `catalogos`, `notificaciones_nuevas` ni `notificaciones_abiertas`.
4. `/notificaciones/estado` conserva el filtro por usuario y el scope de tareas.

### Frontend estático

PASS:

- `modules/home/home.js` ya no contiene `/api/home/bootstrap`.
- usa `/api/home/snapshot`;
- mantiene `/api/pendientes/catalogos` bajo demanda;
- rail: abiertas `limit=5`;
- campana: nuevas `limit=30` bajo demanda;
- badge: `/api/notificaciones/estado`;
- `core/app.js` usa 30 s;
- `core/app.js` no contiene `installMutationRefreshSignal`;
- `index.html` solo cambia cache-bust de `home.js` y `app.js` respecto al `index.html` actual de `main`.

## Deploy

Requiere:

- deploy de backend;
- publicación de frontend.

No requiere SQL.

## Validación posterior al deploy

1. `/api/health` -> `HTTP 200`, `ok:true`, `database:"connected"`.
2. `/api/home/snapshot` -> `HTTP 200` con `pendientes` + `actividad_reciente`.
3. Confirmar en Network que al cargar Home **no se llama `/api/home/bootstrap`**.
4. Confirmar que no se descargan áreas/usuarios/proyectos al entrar a Home.
5. Abrir Nueva Tarea y confirmar que ahí sí se consulta `/api/pendientes/catalogos`.
6. Confirmar `/api/notificaciones/estado` aproximadamente cada 30 s con pestaña visible.
7. Ocultar pestaña >30 s y confirmar ausencia de polling; volver y confirmar consulta ligera inmediata.
8. Abrir campana y confirmar listado completo de nuevas solo en ese momento.
9. Crear/editar/comentar una tarea y comprobar actualización correcta sin timers/listeners duplicados.

## Resultado esperado

Home reduce su carga inicial a información operativa y deja datos administrativos y Notificaciones en flujos especializados ya existentes, manteniendo la experiencia funcional y evitando una refactorización masiva.
