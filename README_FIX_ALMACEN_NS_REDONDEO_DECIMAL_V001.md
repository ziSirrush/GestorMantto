# BLT NOW - Almacen NetSuite 230 - FIX de redondeo decimal V001

**Firma:** `[Aster | 2026-10-19 | ASTER-MG | FIX ALMACEN NS REDONDEO DECIMAL V001]`

## Problema comprobado

`POST /api/almacen/sync/inventario-230/lotes/{id}/paginas` rechazaba datos validos del informe 230 con HTTP 422: `porcentajeValorFactura excede DECIMAL(20,8)`. Google Sheets puede calcular mas de 8 posiciones decimales, mientras que la columna MySQL solo almacena 8. La rutina `numericString` rechazaba decimales largos, incluidos valores representados en notacion cientifica.

## Correccion puntual

Un solo archivo del backend modifica la normalizacion de valores numericos:

- Redondea los decimales que exceden la escala permitida **sin truncar**: `porcentajeValorFactura` a 8, `valorFactura` y `fisico` a 4; tambien respeta las escalas de los campos decimales de Movimientos (4) y Catalogo (4/6).
- Admite notacion cientifica de valores numericos de JavaScript/Sheets convirtiendola a decimales con la escala destino.
- Usa aritmetica decimal de texto/BigInt al redondear cadenas para evitar perdida innecesaria de precision en importes grandes.
- Conserva `null`, `0`, el valor del `idInventario`, claves de NetSuite, paginas, manifiestos e idempotencia.
- Los valores no numericos y los que exceden la **parte entera** de `DECIMAL(20,s)` siguen rechazandose. No se inventan ni limitan importes.

No se cambia la escala de columnas MySQL ni las formulas de Sheets.

## Archivos (rutas relativas al repositorio)

- `backend/src/modules/almacen/almacen.ns-sync-service.js`: reemplazar completo.
- `tests/almacen-ns-redondeo-decimal.test.js`: prueba de regresion nueva, opcional para ejecutar desde raiz.

## Instalacion

1. Extraer el ZIP en la raiz local de `GestorMantto` respetando su arbol.
2. Validar: `node --check backend/src/modules/almacen/almacen.ns-sync-service.js`.
3. Probar: `node --test tests/almacen-ns-redondeo-decimal.test.js`.
4. Revisar `git diff` y hacer commit local; desplegar Azure solo con autorizacion.
5. Una vez actualizado Azure, reejecutar **la misma** funcion de SEND. Las paginas ya confirmadas pueden continuar por checkpoint; un rechazo 422 no confirma la pagina fallida.

## Alcance y verificaciones

- Fuente versionada revisada: `ziSirrush/GestorMantto`, `main` commit `04c93eb2f9dfc603c8a653cb715a45129f3a9a65` (2026-10-19).
- Validacion local: sintaxis JavaScript y pruebas Node.js sin conexion real a Aiven.
- **No hay SQL**, nuevas variables, modificaciones del Config/Core/SEND, ni cambios de frontend.
- **No se modifico** GitHub, Azure, Aiven ni Google Sheets.
- **No confirmado:** prueba extremo a extremo contra Azure/Aiven despues del despliegue.
