# FIX COBRANZA COR - ESTADO DE CUENTA DETALLE V002

Base revisada: `ziSirrush/GestorMantto` / `main` / commit `c84f9efaec1eaf2989e98ad557bf4a73ca40f7d1` (Version 091126.15 - Bitacora).

## Objetivo

Al hacer click en un renglon de **Cobranza > Estados de Cuenta**, abrir una vista de detalle adaptada al Gestor Mantto y consultar los movimientos de `cobranza_fuente_cor` del proyecto seleccionado.

## Regla de relacion INDICE -> FUENTE

El `id_indice_cor` del endpoint identifica el renglon seleccionado en `cobranza_indice_cor`.
Despues FUENTE se consulta por cualquiera de estas dos coincidencias:

1. `cobranza_fuente_cor.id_proyecto_origen = cobranza_indice_cor.pp`
2. `cobranza_fuente_cor.proyecto = cobranza_indice_cor.proyecto`

La consulta usa una sola condicion `OR` y `SELECT DISTINCT`, por lo que una misma fila fisica de FUENTE no se devuelve dos veces aunque coincida por PP y por nombre.

El listado principal tambien calcula `Mov.` y `Monedas` con esta misma regla, por lo que ya no depende exclusivamente del `id_indice_cor` guardado previamente en FUENTE.

## Clasificacion del Estado de Cuenta

- **SUMINISTRO:** toda moneda extranjera (`moneda <> MXN`).
- **INSTALACION:** moneda nacional (`MXN`).
- Filas sin moneda: no se fuerzan a ninguna seccion; se muestran como observacion separada.
- Si existen varias monedas extranjeras, los totales se mantienen separados por moneda. No se suman monedas diferentes.

## UX

- El listado ya no abre automaticamente el primer proyecto.
- Click, Enter o Espacio sobre un renglon abre el Estado de Cuenta seleccionado.
- El detalle conserva la navegacion del Gestor y agrega `Regresar` al listado.
- No se agregan logos externos.
- Fechas de FUENTE se muestran en formato DD/MM/AAAA.
- Responsive para escritorio/tablet/movil.

## Archivos modificados

- `backend/src/modules/cobranza-cor/cobranza-cor.repository.js`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta.js`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta.css`

No requiere ALTER, INSERT ni tablas nuevas.
No modifica rutas ni permisos.

## Validacion realizada

- `node --check backend/src/modules/cobranza-cor/cobranza-cor.repository.js` -> OK
- `node --check modules/cobranza-cor/cobranza-cor-estados-cuenta.js` -> OK

Pendiente despues de aplicar/desplegar:

1. Probar un proyecto que coincida por nombre.
2. Probar un proyecto que coincida por PP / ID PROYECTO.
3. Probar un registro que coincida por ambos y confirmar que aparece una sola vez.
4. Confirmar separacion: moneda extranjera -> SUMINISTRO; MXN -> INSTALACION.
5. Validar en local y GitHub Pages antes de promover a produccion, conforme a las normas del proyecto.
