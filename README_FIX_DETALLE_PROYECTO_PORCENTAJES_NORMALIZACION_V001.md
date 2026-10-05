# FIX DETALLE PROYECTO PORCENTAJES NORMALIZACION V001

## Base revisada
- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit base: `4d49d6b25c2395b9cec472af9d02fe1c221a591c`
- Mensaje: `Version 100526.1`
- Blob base de `core/details.js`: `ad1deec3bf710a0cda4401b6faf91366eb98dfee`

## Causa
En Detalle Proyecto / Instalaciones, los campos de avance pueden llegar como fraccion `0..1`, donde `1 = 100%`.
La vista trataba esos valores directamente como porcentaje `0..100`, por lo que `1` se mostraba como `1%`.

## Cambio aplicado
- Se agrega `normalizeProgressPct()` exclusivamente para valores crudos de avance.
- Se agrega `averageProgress()` para promediar avances crudos sin alterar `average()` ni `toPct()`.
- Los avances `avance_oc`, `avance_mo` y `avance_aj` del detalle de equipo se normalizan antes de calcular la ponderacion 40/40/20.
- Se evita la doble conversion de valores que ya estan normalizados; por ejemplo, un `1%` ya calculado sigue siendo `1%` y no se convierte nuevamente a `100%`.

## Archivo modificado
- `core/details.js`

No se modifica `index.html`, backend, base de datos ni otros modulos.

## Validaciones realizadas
- Comparacion de la base reconstruida contra el blob GitHub original: coincidencia exacta `ad1deec3bf710a0cda4401b6faf91366eb98dfee` antes de aplicar el FIX.
- `node --check core/details.js`: OK.
- Casos de normalizacion verificados:
  - `0 -> 0%`
  - `0.01 -> 1%`
  - `0.25 -> 25%`
  - `0.5 -> 50%`
  - `1 -> 100%`
  - `25 -> 25%`
  - `100 -> 100%`
  - `"25%" -> 25%`
  - `"1%" -> 1%`
- Ponderacion verificada: `OC=1`, `Montaje=1`, `Ajuste=1` produce `Avance General = 100%`.
- Proteccion contra doble normalizacion verificada: un valor ya normalizado de `1` permanece en `1%` al pasar por la funcion de porcentaje existente.

## Aplicacion
Copiar el contenido del ZIP sobre la raiz del repositorio conservando la estructura de carpetas. El unico archivo de aplicacion que debe reemplazarse es:

`core/details.js`

## Alcance de validacion
Validacion estatica y logica realizada. No se realizo despliegue, modificacion de GitHub, Aiven, Azure o Netlify, ni prueba E2E en navegador.
