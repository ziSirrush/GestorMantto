# FIX COBRANZA COR - FONDO DE GARANTIA GENERAL V002

Fecha: 24/09/2026
Base validada: `main` commit `c279fb827a81c5b063d906e06bf403848e3f67fa`

## Objetivo

Mover la configuracion de Fondo de Garantia fuera de cada hito y colocarla en el bloque **General** del formulario Crear/Editar Estado de Cuenta.

## Comportamiento final

- `Fondo de Garantia` se muestra en **General** como activado/desactivado.
- Por defecto queda desactivado.
- `% Fondo de Garantia` solo se habilita cuando Fondo de Garantia esta activo.
- El porcentaje general se aplica por igual a **todos los hitos activos** del Estado de Cuenta.
- En `cobranza_fuente_cor`, cada fila activa del PPNS recibe el mismo valor en:
  - `fondo_garantia`
  - `porcentaje_fondo_garantia`
- Si Fondo de Garantia esta desactivado, el backend fuerza `porcentaje_fondo_garantia = 0`.
- Hasta `10%` se permite guardar.
- Un valor mayor a `10%` se bloquea en frontend y backend con el codigo:
  `FONDO_GARANTIA_AUTORIZACION_REQUERIDA`.
- Si al editar existen hitos antiguos con configuraciones distintas, el formulario no asume una configuracion silenciosamente: muestra estado mixto y obliga a definir una sola configuracion antes de guardar.
- Por compatibilidad, el backend puede recibir temporalmente el formato V001 por hito cuando no llegan los campos generales, pero normaliza el guardado a una sola configuracion para todo el Estado de Cuenta.

## Importante

Este FIX **no recalcula ni descuenta dinero** de `subtotal`, `iva` o `total`. El porcentaje de Fondo de Garantia se almacena como configuracion comun de los hitos. Cualquier calculo monetario del fondo requiere una regla adicional explicita.

## Base de datos

Este V002 no agrega columnas nuevas. Requiere que ya existan en `cobranza_fuente_cor` las columnas incorporadas en el V001:

- `fondo_garantia`
- `porcentaje_fondo_garantia`

No se ejecuto ninguna escritura sobre Aiven. No puedo confirmar desde este paquete el esquema vivo de Aiven.

## Archivos modificados

- `modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta-form.css`
- `backend/src/modules/cobranza-cor/cobranza-cor.service.js`
- `core/module-loader.js`
- `index.html`
- `tests/cobranza-cor-estados-cuenta-crud-form.test.js`

## Validacion realizada

- `node --check modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js` -> OK
- `node --check backend/src/modules/cobranza-cor/cobranza-cor.service.js` -> OK
- `node --test tests/cobranza-cor-estados-cuenta-crud-form.test.js` -> 7/7 OK
- `backend/npm run check` -> OK
- `backend/npm test` -> 76/76 OK, usando el workflow actual de `main` como archivo de validacion local.

## Alcance

No modifica:

- tablas adicionales;
- permisos;
- rutas laterales;
- Aditivas;
- UNITED / Portafolio;
- calculos financieros de Subtotal, IVA o Total.
