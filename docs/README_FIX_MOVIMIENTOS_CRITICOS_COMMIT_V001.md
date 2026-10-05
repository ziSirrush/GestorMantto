# FIX MOVIMIENTOS CRITICOS - COMMIT / AZURE V001

Fecha: 05/10/2026
Proyecto: Mantto Gestor
Base oficial verificada: `ziSirrush/GestorMantto` · `main`
Commit base: `8aa46df85ccd8d87c10af74f8a58064c1c7cd9f7` (`Version 100526.1`)

## Objetivo

Corregir las dos causas detectadas despues del commit `Version 100526.1`:

1. El workflow de Azure fallo en `npm run test` porque una prueba historica exigia un cache-bust fijo y obsoleto para `core/router.js`.
2. El job semanal de Movimientos Criticos contenia una referencia de variable incorrecta (`movimientosJson`) que produciria `ReferenceError` al ejecutar `runWeeklyClose()`.

## Archivos modificados

- `backend/src/jobs/movimientosCriticosCierreSemanal.job.js`
- `validation/seguimiento-especial-notificaciones.test.js`

No se modifica ningun otro archivo funcional.

## Cambios

### 1. Job semanal de Movimientos Criticos

Se conserva la variable existente:

```js
const movementsJson = JSON.stringify(movements);
```

Y se corrigen sus dos referencias posteriores para usar el mismo identificador:

```js
const hash = crypto.createHash('sha256').update(snapshotJson + '|' + movementsJson).digest('hex');
```

```js
movementsJson,
```

No cambia la estructura del JSON, la tabla, la regla 3/U35, la programacion semanal ni la logica de movimientos.

### 2. Prueba historica de cache-bust

La prueba de `validation/seguimiento-especial-notificaciones.test.js` ya validaba `module-loader.js` mediante un patron de version no congelado. Se aplica el mismo criterio a `router.js`:

```js
assert.match(index, /core\/router\.js\?v=[A-Za-z0-9._-]+/);
```

Esto conserva el objetivo real de la prueba: confirmar que `router.js` se referencia con cache-bust, sin impedir futuras versiones validas del archivo.

## Causa confirmada del workflow rojo

GitHub Actions run `37338549139`, job `build` (`111859446982`) fallo en:

```text
not ok 104 - cache bust de cierre apunta a los archivos frontend corregidos
```

La expectativa obsoleta era:

```text
core/router.js?v=20260914-human-time-v001
```

Mientras que `main` usa correctamente:

```text
core/router.js?v=20261005-movimientos-criticos-fase4-v002
```

El commit SI llego a `main`. GitHub Pages termino correctamente; el deploy de Azure quedo omitido porque el job de build fallo.

## Forma de aplicar

Extraer este ZIP sobre la raiz actualizada del repositorio conservando la estructura de carpetas y reemplazar solamente los dos archivos indicados.

Despues ejecutar desde la raiz del repositorio:

```powershell
git diff --check
node --check .\backend\src\jobs\movimientosCriticosCierreSemanal.job.js
node --check .\validation\seguimiento-especial-notificaciones.test.js
Set-Location .\backend
npm run check
npm run test
```

Antes de copiar el fix, la carpeta local debe estar basada en el commit `8aa46df85ccd8d87c10af74f8a58064c1c7cd9f7` o debe revisarse el diff si `main` avanzo.

## Validacion realizada al generar este FIX

- Base `main` confirmada en `8aa46df85ccd8d87c10af74f8a58064c1c7cd9f7`.
- Los archivos reconstruidos antes del cambio coinciden exactamente con los blobs GitHub del commit base.
- `node --check` del job corregido: PASS.
- `node --check` de la prueba corregida: PASS.
- Smoke runtime de `runWeeklyClose()` con conexion simulada:
  - linea base: PASS;
  - transicion `2 -> 3`: `ENTRA_CRITICO`: PASS;
  - serializacion/persistencia de `movementsJson`: PASS.
- Diff funcional: 3 lineas modificadas.

## No realizado

- No se modifico Aiven.
- No se hizo commit ni push.
- No se reejecuto GitHub Actions.
- No se desplego Azure.
- No se ejecuto la suite completa `npm run test` en un checkout completo del repositorio dentro de este entorno. Debe ejecutarse antes del siguiente push.
