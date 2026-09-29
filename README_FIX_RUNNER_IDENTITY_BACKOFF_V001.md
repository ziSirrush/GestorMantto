# FIX RUNNER IDENTITY BACKOFF V001

Base objetivo: `ziSirrush/GestorMantto` commit `30ffa976c96857f04aba46a6ba6f8fb278c94a83` (`Version 092926.1`).

## Problema confirmado

El runner externo intenta autenticar la identidad funcional cada ~5 segundos cuando no obtiene un JWT valido. Durante el diagnostico real del 29/09/2026 esto produjo `HTTP 429 Too Many Requests` en `/api/auth/login`.

## Correccion

Se modifica exclusivamente el runner externo para que:

- el primer login se intente inmediatamente;
- ante fallos normales aplique backoff: 30 s -> 60 s -> 120 s -> 300 s;
- ante HTTP 429 respete `Retry-After` cuando exista;
- si 429 no incluye `Retry-After`, espere 300 s;
- el heartbeat siga vivo mientras la identidad no esta lista, reportando `test_identity_ready=false`;
- al recuperar JWT y validacion de solo lectura, el contador de fallos se reinicie;
- despues de una ejecucion k6, el estado de autenticacion vuelva a limpio;
- los logs indiquen solo estado HTTP y tiempo de reintento, sin exponer correo, password, JWT ni secreto del runner.

## Archivos

Modificado:
- `scripts/load-test/mantto-load-test-runner.service.js`

Nuevo:
- `tests/panel-control-prueba-carga-runner-auth-backoff.test.js`

## No modifica

- backend Azure;
- endpoints;
- esquema MySQL;
- secretos;
- SHA-256 del runner;
- frontend;
- permisos de la identidad funcional.

## Validacion sugerida

```text
node --check scripts/load-test/mantto-load-test-runner.service.js
node --test tests/panel-control-prueba-carga-runner-auth-backoff.test.js
```

## Importante

Este FIX evita el bucle agresivo de autenticacion. No corrige por si solo una identidad con password incorrecto, `LOAD_TEST_READ_ONLY_USER_ID` incorrecto o permisos de escritura. Esos casos quedan visibles como identidad no disponible, sin golpear `/api/auth/login` cada 5 segundos.
