# FIX COBRANZA COR - Fondo de Garantía V001

Base validada: `main` commit `63de827cb0adac954cfdbb7fc39f460e5abfe395`.

## Alcance

- Agrega a `cobranza_fuente_cor`:
  - `fondo_garantia` (`TINYINT(1)`, default `0`).
  - `porcentaje_fondo_garantia` (`DECIMAL(10,6)`, default `0.000000`).
- El formulario Crear/Editar de Estados de Cuenta incorpora ambos campos por hito.
- Fondo de Garantía inicia desactivado.
- Mientras está desactivado, el porcentaje se conserva en `0` y el campo permanece deshabilitado.
- El formulario muestra el porcentaje como 0-100; la BD lo almacena como fracción decimal. Ejemplo: `10% = 0.100000`.
- Sin autorización, el máximo permitido es 10%.
- Si se captura más de 10%, frontend y backend bloquean el guardado y muestran que requiere autorización.
- No se crea ni simula un flujo de aprobación inexistente. Este FIX solo implementa el bloqueo y la señal de autorización requerida.

## Orden de aplicación

1. Ejecutar `sql/20260923_FIX_COBRANZA_COR_FONDO_GARANTIA_V001.sql` en Aiven.
2. Copiar los archivos de código conservando las rutas del ZIP.
3. Validar sintaxis y pruebas.
4. Desplegar backend y frontend mediante el flujo normal del Gestor.

## Validación realizada

- `node --check` en repository/service/form/module-loader/tests: OK.
- `node --test tests/cobranza-cor-estados-cuenta-crud-form.test.js`: 7/7 OK.
- `backend npm run check`: OK.
- `backend npm test`: 76/76 OK usando el workflow actual de `main` como contrato de CI.

## Nota de autorización

En el `main` revisado no existe un flujo reutilizable de autorización/aprobación para este caso. Por ello, un valor mayor a 10% se rechaza con el código `FONDO_GARANTIA_AUTORIZACION_REQUERIDA`. Para permitir excepciones >10% se deberá definir expresamente quién autoriza y cómo se registra esa autorización.
