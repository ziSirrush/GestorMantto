# FIX BACKEND JOBS PORTAFOLIO + PUSH V001

Fecha: 2026-08-20
Repositorio revisado: `JIVMBLT/updated_code`
Rama base: `main`
Commit base verificado: `87e7c389d510644e3e659c66b75174b3f711202e` (`fix FASES DE ALCANCE 1 - 6`)

## Objetivo

Corregir los dos comportamientos observados al ejecutar `npm start` localmente:

1. El cierre semanal de Portafolio intenta recuperar el último corte pendiente y falla repetidamente con `Out of sort memory`.
2. El job global de Push inicia al mismo tiempo que los jobs de Portafolio y puede terminar en `connect ETIMEDOUT` durante el arranque.

Este FIX no cambia tablas, SQL de estructura, permisos, Alcance, frontend ni configuración de Aiven.

## Archivos modificados

- `backend/src/jobs/portafolioCierreSemanal.job.js`
  - blob base: `5ec9bb7917925bc61ce0dad9d278e3cc39c57399`
- `backend/src/jobs/pushNotifications.job.js`
  - blob base: `e2788635365ec85ded138754bdaf8f6bae043472`
- `backend/src/bootstrap.js`
  - blob base: `1b405f207bc4ea8fb19504b9dcdb189c75bb99d2`

## Cambios

### 1. Portafolio semanal

Se conserva la recuperación automática del último domingo pendiente.

La consulta grande de `portafolio` ya no ejecuta:

```sql
ORDER BY p.numero_equipo ASC
```

en MySQL. El snapshot se ordena después en Node por `equipo`, antes de serializarlo y calcular el hash. De esta forma se mantiene un snapshot determinista sin obligar a MySQL a realizar ese sort sobre toda la población activa.

Si el cierre semanal falla, ya no golpea la misma consulta cada 30 segundos. Se aplica un backoff de 5 minutos para la misma semana pendiente y después se permite un nuevo intento automático.

### 2. Push Notifications

El job Push ya no ejecuta `runCycle()` inmediatamente al mismo tiempo que la recuperación semanal de Portafolio.

- primer ciclo: 15 segundos después del arranque como mínimo;
- ciclos posteriores: conserva `WEB_PUSH_DISPATCH_INTERVAL_MS`, con mínimo de 5 segundos;
- el comportamiento funcional de envío, VAPID, cursores y desactivación 404/410 no cambia.

### 3. Bootstrap

Los jobs que dependen de MySQL solamente se inicializan si `verifyDatabase()` confirmó conexión durante el arranque.

Si MySQL no está disponible, no se inicializan:

- cierre mensual de Portafolio;
- cierre semanal de Portafolio;
- Push Notifications;
- Storage Operations.

La API puede seguir levantando, pero evita iniciar procesos programados que inmediatamente fallarían contra MySQL.

## No modificado

- `backend/src/config/db.js`.
- `DB_CONNECTION_LIMIT`.
- `DB_CONNECT_TIMEOUT_MS`.
- `sort_buffer_size` de Aiven/MySQL.
- tablas o índices.
- lógica de notificaciones.
- lógica del cierre mensual.
- Alcance 1-6.
- Frontend.

## Validaciones realizadas

- `node --check backend/src/jobs/portafolioCierreSemanal.job.js`: OK.
- `node --check backend/src/jobs/pushNotifications.job.js`: OK.
- `node --check backend/src/bootstrap.js`: OK.
- Verificación estática: la consulta grande de Portafolio ya no contiene `ORDER BY p.numero_equipo`: OK.
- Prueba aislada del cierre semanal con DB simulada:
  - primera falla `Out of sort memory`: detectada;
  - segundo intento inmediato: bloqueado por `retry_backoff` sin nueva consulta DB;
  - orden del snapshot trasladado a Node: `100-A`, `200-B`: OK.
- Prueba aislada del job Push con timers simulados:
  - no consulta DB inmediatamente al iniciar;
  - primer ciclo programado >= 15 s;
  - intervalo recurrente >= 5 s: OK.

## Validación runtime requerida

No puedo confirmar el comportamiento real contra Aiven desde este entorno. Después de reemplazar estos archivos:

1. ejecutar `npm start`;
2. confirmar `Base de datos conectada`;
3. verificar que ya no aparezca `Out of sort memory` durante la recuperación semanal;
4. confirmar que el log de Push indique primer ciclo diferido;
5. observar al menos 1 minuto para confirmar que no aparezcan `ETIMEDOUT` del job Push;
6. validar `/api/health` antes de desplegar.

Si el `Out of sort memory` persiste después de este FIX, deberá capturarse el stack/query exacto antes de modificar memoria o parámetros de Aiven, porque ya no podremos atribuirlo al ordenamiento del snapshot principal sin nueva evidencia.
