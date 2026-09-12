# FIX COBRANZA COR - ESTADO DE CUENTA MATCH + BACK CONTEXTUAL V004

Base verificada: `ziSirrush/GestorMantto` / `main` / commit `58a62e27a7b9c0d4e7911bef219e2bc46c3c2e3c` (`Version 091126.17 - Edo Cta`).

## Objetivos

1. Dejar un solo control de regreso: el Back global de la barra contextual de Gestor Mantto.
2. Corregir la lectura de `cobranza_fuente_cor` cuando el nombre/PP no coincide de forma literal entre INDICE y FUENTE.
3. No crear tablas ni llaves foraneas nuevas.

## Navegacion

Se eliminan los botones internos `← Regresar` del modulo.

El detalle sigue abriendose mediante el Router central:

- Listado: `#/cobranza-estados-cuenta`
- Detalle: `#/cobranza-estados-cuenta/{id_indice_cor}`
- Regreso: exclusivamente el Back contextual de Gestor Mantto (`ManttoRouter.back()`).

## Relacion INDICE -> FUENTE

Ya existe la FK:

`cobranza_fuente_cor.id_indice_cor -> cobranza_indice_cor.id_indice_cor`

No se agrega otra FK.

La lectura funcional V004 considera una fila de FUENTE relacionada con el proyecto seleccionado por esta prioridad logica:

1. FK existente: `FUENTE.id_indice_cor = INDICE.id_indice_cor`.
2. Nombre de proyecto normalizado.
3. PP / ID Proyecto cuando el PP identifica un solo registro de INDICE.
4. Si el PP existe en mas de un proyecto, usa PP + `SOUNDEX` del nombre normalizado para desambiguar; no acepta el PP compartido por si solo.

El nombre normalizado tolera:

- espacios normales/no separables;
- tabs y saltos de linea;
- puntuacion, incluido `#`;
- mayusculas/minusculas;
- equivalencia `WALMART` / `WM`;
- `WM SC` / `WM` para la convencion actual de proyectos Walmart.

La consulta mantiene `COUNT(DISTINCT id_fuente_cor)` y `SELECT DISTINCT`, por lo que una misma fila fisica de FUENTE no se muestra dos veces.

## Diagnostico verificado contra Cobranza.sql proporcionado

FUENTE contiene 189 filas agrupadas en 39 proyectos.

Con el match literal anterior existian diferencias como:

- `THALASSA TOWER` -> INDICE `THALASA TOWER`, PP `P14056` compartido tambien por `DHARANA CANCUN`.
- `RIVIERA CENTER` -> INDICE `RIVERA CENTER`.
- `MACONDO TULUM 3` -> INDICE `MACONDO TULUM #3`.
- `WALMART HUAMANTLA` -> INDICE `WM HUAMANTLA`.
- `WALMART SC CHILPANCINGO` -> INDICE `WM SC CHILPANCINGO`.
- `WALMART SC PLAN DE AYALA` -> INDICE `WM PLAN DE AYALA`.

La regla V004 fue simulada contra los 372 renglones del ultimo bloque completo de INDICE y los 189 renglones de FUENTE del dump compartido:

- grupos FUENTE: 39
- grupos resueltos a exactamente un INDICE: 39
- ambiguos/sin resolver: 0

Esto es validacion sobre el dump proporcionado; Aiven en ejecucion debe validarse despues del deploy.

## Estado de Cuenta

- SUMINISTRO = toda moneda extranjera (`moneda <> MXN`).
- INSTALACION = moneda nacional (`MXN`).
- No se mezclan monedas extranjeras distintas en un mismo total.

## Archivos modificados completos

- `backend/src/modules/cobranza-cor/cobranza-cor.repository.js`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta.js`

No requiere SQL, `ALTER TABLE`, nueva tabla ni nueva FK.

## Validacion ejecutada

- `node --check backend/src/modules/cobranza-cor/cobranza-cor.repository.js` -> OK
- `node --check modules/cobranza-cor/cobranza-cor-estados-cuenta.js` -> OK
- Verificacion estatica: no queda `data-ccor-back`, `backFromDetail_cor` ni boton interno `ccor-ec-back` en el JS -> OK
- Simulacion del match sobre dump compartido: 39/39 grupos FUENTE resueltos sin ambiguedad -> OK

## Pendiente despues de aplicar

1. Deploy backend.
2. Publicar frontend.
3. Abrir un proyecto con nombre literal identico.
4. Probar `THALASA/THALASSA TOWER` y confirmar que no mezcla filas de `DHARANA CANCUN` aunque compartan `P14056`.
5. Probar los proyectos `WM/WALMART`.
6. Confirmar que solo existe el Back contextual superior.
