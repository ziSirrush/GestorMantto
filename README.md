# FIX COBRANZA COR - MATCH SOLO EN DETALLE V006

Base verificada: `ziSirrush/GestorMantto` / `main` / commit `0ddc10ddd08314f65e07c0806e0cfbd1110c1ef8` (`Version 091126.19 - Edo Cta`).

## Correccion

El V004/V005 aplico por error la resolucion `PP/ID Proyecto OR nombre de proyecto` tanto al MAIN de Estados de Cuenta como al DETALLE.

La regla correcta queda separada:

### MAIN - Estados de Cuenta

`GET /api/cobranza-cor/estados-cuenta`

- La lista principal nace de `cobranza_indice_cor`.
- NO ejecuta la resolucion flexible por PP/nombre contra FUENTE.
- Los campos auxiliares `Mov.` y `Monedas`, y el filtro `Solo con movimientos`, solo usan la FK directa existente:
  `cobranza_fuente_cor.id_indice_cor = cobranza_indice_cor.id_indice_cor`.
- Por lo tanto, abrir/cargar el MAIN no dispara la normalizacion de nombres ni la busqueda por PP.

### DETALLE - Estado de Cuenta

`GET /api/cobranza-cor/estados-cuenta/:idIndiceCor`

Solo aqui se aplica la resolucion de los renglones financieros de `cobranza_fuente_cor`:

1. FK directa si existe.
2. Nombre de proyecto normalizado.
3. PP/ID Proyecto cuando identifica un unico proyecto.
4. Si el PP esta compartido, PP + nombre fonetico para desambiguar.

Una fila de FUENTE se devuelve una sola vez mediante `SELECT DISTINCT`.

## UTF-8 / NBSP

Se conserva la correccion V005:

- NBSP: `CONVERT(0xC2A0 USING utf8mb4)`
- TAB: `CONVERT(0x09 USING utf8mb4)`
- CR: `CONVERT(0x0D USING utf8mb4)`
- LF: `CONVERT(0x0A USING utf8mb4)`

La normalizacion solo se ejecuta durante la lectura del DETALLE.

## Archivo modificado completo

- `backend/src/modules/cobranza-cor/cobranza-cor.repository.js`

No modifica frontend, rutas, permisos, tablas ni llaves foraneas.
No requiere SQL.

## Validacion

- `node --check backend/src/modules/cobranza-cor/cobranza-cor.repository.js`
- Verificacion estatica: `fuenteMatchesIndiceSql_cor()` se usa solo dentro de `listFuenteEstadoCuenta_cor()`.
- Verificacion estatica: `listEstadosCuenta_cor()` usa unicamente la FK directa para Mov./Monedas/solo_con_fuente.

## Prueba recomendada despues del deploy

1. `GET /api/cobranza-cor/estados-cuenta` debe cargar el MAIN sin ejecutar match flexible.
2. Click en un proyecto.
3. `GET /api/cobranza-cor/estados-cuenta/:idIndiceCor` debe recuperar FUENTE por PP o nombre cuando la FK no exista.
4. Validar especialmente proyectos con diferencias de captura (`THALASA/THALASSA`, `WM/WALMART`, etc.).
