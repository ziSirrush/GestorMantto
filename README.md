# FIX COBRANZA COR - ESTADO DE CUENTA + HISTORIAL V003

Base de revision: `ziSirrush/GestorMantto` / `main` / Version 091126.15.
Este FIX es incremental sobre el frontend de Estado de Cuenta V002.

## Problemas corregidos

### 1. Regresar / historial

El V002 abria el detalle cambiando el HTML interno del mismo modulo. El Router central de Gestor Mantto no recibia una navegacion nueva, por lo que `Atras` no podia reconstruir correctamente LISTADO -> DETALLE -> LISTADO.

Ahora el click usa el Router central:

- Listado: `#/cobranza-estados-cuenta`
- Detalle: `#/cobranza-estados-cuenta/{id_indice_cor}`
- Regresar: `ManttoRouter.back()`

El `id_indice_cor` sigue identificando el renglon de INDICE seleccionado; no se usa como unica llave para leer FUENTE.

### 2. Proyectos con FUENTE que aparecian vacios

El backend actual de `main` consulta el detalle de FUENTE exclusivamente por `fuente.id_indice_cor`.
Este FIX cambia la lectura funcional para buscar los renglones del proyecto seleccionado por cualquiera de estas dos llaves:

1. `FUENTE.id_proyecto_origen = INDICE.pp`
2. `FUENTE.proyecto = INDICE.proyecto`

La coincidencia es `OR`, no `UNION`, y el detalle usa `SELECT DISTINCT`, por lo que un mismo `id_fuente_cor` no se repite si coincide por PP y por nombre.

Los valores de PP no utilizables (`NULL`, vacio, `-`, `N/A`, `NA`, `N.A.`, `S/P`, `S/PP`, `SIN PP`) NO participan en el match por PP para evitar enlazar proyectos entre si por placeholders.

El listado principal (`Mov.` y `Monedas`) usa exactamente la misma regla PP OR Proyecto que el detalle.

## FK / Base de datos

NO se agrega una FK nueva.

La estructura ya contiene `cobranza_fuente_cor.id_indice_cor` como FK nullable hacia `cobranza_indice_cor.id_indice_cor`. Esta FK puede seguir utilizandose como relacion persistida cuando la carga logra resolverla, pero el Estado de Cuenta no depende exclusivamente de ella porque FUENTE puede identificar un proyecto por PP/ID PROYECTO o por nombre.

No requiere `ALTER TABLE`, `INSERT`, `UPDATE` ni nueva tabla.

## Regla Estado de Cuenta

- SUMINISTRO = toda moneda extranjera (`moneda <> MXN`).
- INSTALACION = moneda nacional (`MXN`).
- Una fila de FUENTE se muestra una sola vez.
- Monedas extranjeras diferentes no se suman entre si.

## Archivos modificados completos

- `backend/src/modules/cobranza-cor/cobranza-cor.repository.js`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta.js`

No se modifica CSS en este FIX; conserva el V002.
No se modifica `core/router.js`; se consume el Router existente mediante su API publica `ManttoRouter.go()` / `ManttoRouter.back()`.

## Validacion ejecutada

- `node --check backend/src/modules/cobranza-cor/cobranza-cor.repository.js` -> OK
- `node --check modules/cobranza-cor/cobranza-cor-estados-cuenta.js` -> OK
- Validacion estatica SQL -> OK:
  - match PP presente
  - match Proyecto presente
  - `COUNT(DISTINCT id_fuente_cor)` en listado
  - `SELECT DISTINCT` en detalle
  - proteccion de PP placeholder presente

## Pruebas despues de aplicar

1. Entrar a Cobranza > Estados de Cuenta.
2. Abrir un proyecto que tenga renglones en FUENTE con mismo nombre.
3. Confirmar que carga sus movimientos.
4. Abrir un proyecto cuya relacion venga por PP / ID PROYECTO.
5. Confirmar que una fila que coincida por ambas llaves aparece una sola vez.
6. Pulsar `Regresar` y confirmar que vuelve al listado de Estados de Cuenta.
7. Usar el boton global Atras del Gestor y confirmar que respeta el historial anterior al modulo.
